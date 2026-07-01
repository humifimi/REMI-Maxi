import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import { useAuthStore } from "@/src/stores/auth";
import { useRealtimeChannel } from "@technician/hooks/realtime/use-realtime-channel";
import type {
  Conversation,
  InboxUpdatePayload,
  Message,
  MessageTemplate,
  NewMessagePayload,
} from "@technician/types/api";

/**
 * MSG-FE-TECH — Messaging hooks for the technician app.
 *
 * Wires this app to the MSG-BE-1 endpoints under
 * `/api/v1/technician/messages/...` and the dual-channel WebSocket
 * gateway:
 *   - `user:{userId}:inbox` — invalidates the conversation list
 *     when any conversation touching this user changes.
 *   - `conversation:{id}` — appends new messages to the open
 *     thread without a refetch.
 *
 * Spec: `docs/implementation-plans/messaging-redo-plan.md`
 *       `docs/PLAN-DEVIATIONS.md#2026-04-26-msg-redo`
 *
 * Per-side unread counter contract: every Conversation row carries
 * BOTH `customer_unread_count` and `technician_unread_count`. The
 * technician app reads `technician_unread_count` everywhere it
 * shows a badge; never alias the two columns.
 */

export const messageKeys = {
  all: ["messages"] as const,
  conversations: () => ["messages", "conversations"] as const,
  conversation: (id: number) =>
    ["messages", "conversations", id, "messages"] as const,
  templates: () => ["messages", "templates"] as const,
};

export function useConversations() {
  return useQuery({
    queryKey: messageKeys.conversations(),
    queryFn: () =>
      api<Conversation[]>("get", Endpoints.messages.conversations),
    staleTime: 15_000,
  });
}

export function useConversationMessages(conversationId: number | null) {
  return useQuery({
    queryKey:
      conversationId !== null
        ? messageKeys.conversation(conversationId)
        : ["messages", "conversations", "disabled"],
    queryFn: () =>
      api<Message[]>(
        "get",
        Endpoints.messages.conversationDetail(conversationId!),
      ),
    enabled: conversationId !== null,
    staleTime: 10_000,
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: messageKeys.templates(),
    queryFn: () =>
      api<MessageTemplate[]>("get", Endpoints.messages.templates),
    staleTime: 5 * 60_000,
  });
}

/**
 * MSG-FE-TECH-3 — Tech-initiated "Message customer".
 *
 * POST `/messages/conversations` body `{ customer_id }` resolves
 * (or creates) the conversation between this tech and the named
 * customer. The BE returns a full `Conversation` row so the FE can
 * navigate straight to `/message/{id}` with the cache primed.
 *
 * The conversation list cache is invalidated on success so the new
 * conversation appears in the inbox immediately, even before the
 * `user:{userId}:inbox` realtime event lands.
 */
export function useStartConversationWithCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ customerId }: { customerId: number }) =>
      api<Conversation>("post", Endpoints.messages.startConversation, {
        customer_id: customerId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: messageKeys.conversations(),
      });
    },
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      conversationId,
      templateId,
      additionalText,
    }: {
      conversationId: number;
      templateId: number;
      additionalText?: string;
    }) =>
      api<Message>("post", Endpoints.messages.send(conversationId), {
        template_id: templateId,
        ...(additionalText ? { additional_text: additionalText } : {}),
      }),
    onSuccess: (_message, { conversationId }) => {
      queryClient.invalidateQueries({
        queryKey: messageKeys.conversation(conversationId),
      });
      queryClient.invalidateQueries({
        queryKey: messageKeys.conversations(),
      });
    },
  });
}

/**
 * Mount once at the top of the authenticated tabs region. Listens
 * to `user:{userId}:inbox` and patches the conversation list cache
 * with the new `last_message_at` / `technician_unread_count`
 * without an HTTP refetch. Falls back to a list invalidation when
 * the conversation isn't already in the cache (e.g. brand-new
 * conversation triggered by a customer-side explicit-create).
 */
export function useMessagingInboxRealtime() {
  const userId = useAuthStore((s) => s.user?.userId ?? null);
  const queryClient = useQueryClient();

  const onMessage = useCallback(
    (raw: unknown) => {
      if (!isInboxUpdate(raw)) return;
      patchInboxCache(queryClient, raw);
    },
    [queryClient],
  );

  useRealtimeChannel({
    channel: userId !== null ? `user:${userId}:inbox` : null,
    onMessage,
  });
}

/**
 * Mount on the conversation thread screen while the user is
 * looking at it. Appends new messages from `conversation:{id}` to
 * the thread cache directly so the bubble appears without a
 * round-trip. Both technician-sent and customer-sent messages
 * arrive on this channel — the BE publishes for any send,
 * including the one made by this client. The thread cache
 * dedupes by `id` so the optimistic-then-confirmed flow does not
 * double up.
 */
export function useConversationRealtime(conversationId: number | null) {
  const queryClient = useQueryClient();

  const onMessage = useCallback(
    (raw: unknown) => {
      if (!isNewMessage(raw)) return;
      if (conversationId === null) return;
      appendToThreadCache(queryClient, conversationId, raw.message);
    },
    [queryClient, conversationId],
  );

  useRealtimeChannel({
    channel:
      conversationId !== null ? `conversation:${conversationId}` : null,
    onMessage,
  });
}

function isInboxUpdate(value: unknown): value is InboxUpdatePayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.type === "inbox_update" &&
    typeof v.conversation_id === "number" &&
    typeof v.customer_unread_count === "number" &&
    typeof v.technician_unread_count === "number"
  );
}

function isNewMessage(value: unknown): value is NewMessagePayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.type !== "message") return false;
  const m = v.message as Record<string, unknown> | undefined;
  return (
    typeof m === "object" &&
    m !== null &&
    typeof m.id === "number" &&
    typeof m.conversation_id === "number" &&
    typeof m.body === "string"
  );
}

function patchInboxCache(
  queryClient: QueryClient,
  payload: InboxUpdatePayload,
): void {
  const key = messageKeys.conversations();
  const existing = queryClient.getQueryData<Conversation[]>(key);
  if (!existing) {
    queryClient.invalidateQueries({ queryKey: key });
    return;
  }

  const idx = existing.findIndex(
    (c) => c.id === payload.conversation_id,
  );
  if (idx === -1) {
    queryClient.invalidateQueries({ queryKey: key });
    return;
  }

  const updated: Conversation = {
    ...existing[idx],
    customer_unread_count: payload.customer_unread_count,
    technician_unread_count: payload.technician_unread_count,
    last_message_at: new Date().toISOString(),
  };
  const next = [updated, ...existing.filter((_, i) => i !== idx)];
  queryClient.setQueryData(key, next);
}

function appendToThreadCache(
  queryClient: QueryClient,
  conversationId: number,
  message: Message,
): void {
  const key = messageKeys.conversation(conversationId);
  const existing = queryClient.getQueryData<Message[]>(key);
  if (!existing) {
    queryClient.invalidateQueries({ queryKey: key });
    return;
  }
  if (existing.some((m) => m.id === message.id)) return;
  queryClient.setQueryData<Message[]>(key, [...existing, message]);
}
