import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { franchiseApi } from "@technician/api/client";
import { FranchiseEndpoints } from "@technician/api/endpoints";
import { useAuthStore } from "@/src/stores/auth";
import { useRealtimeChannel } from "@technician/hooks/realtime/use-realtime-channel";
import type {
  FranchiseConversationListItem,
  FranchiseConversationThread,
  InboxUpdatePayload,
  Message,
  NewMessagePayload,
} from "@technician/types/api";

/**
 * MSG-FE-FO-1 — Franchise Owner messaging-oversight hooks.
 *
 * Wires the FO oversight UI to the MSG-BE-2 endpoints under
 * `/api/v1/franchise/messages/...` and the
 * `franchise:{franchiseId}:messages` realtime channel.
 *
 * Read posture: the FO is an OBSERVER. None of these hooks bump
 * the technician's or customer's unread counters server-side
 * (the BE list/detail endpoints are explicitly read-only on
 * counters per `messages.routes.test.ts`). Per-FO last-viewed
 * state is intentionally tracked CLIENT-side only — see plan
 * "Out of scope" §"Server-side FO unread counter".
 *
 * Send posture: two voices. `sendAsMe` writes a message with
 * `sender_type='franchise_owner'`; `sendAsTechnician` is the
 * silent-takeover path (`sender_type='technician'`,
 * `sent_by_user_id=foUserId`). The wire-shape difference is the
 * `on_behalf_of_technician` flag on the request body — both share
 * the same mutation hook so the inbox/thread cache invalidation
 * is identical.
 *
 * Spec: docs/implementation-plans/messaging-redo-plan.md (Part 4).
 */

export const franchiseMessageKeys = {
  all: ["franchise", "messages"] as const,
  conversations: (filters: FranchiseConversationFilters) =>
    ["franchise", "messages", "conversations", filters] as const,
  conversation: (id: number) =>
    ["franchise", "messages", "conversations", id] as const,
};

export interface FranchiseConversationFilters {
  techId?: number;
  customerId?: number;
  q?: string;
  sort?: "recent" | "unread";
}

export function useFranchiseConversations(
  filters: FranchiseConversationFilters,
) {
  return useQuery({
    queryKey: franchiseMessageKeys.conversations(filters),
    queryFn: () => {
      const params: Record<string, string> = {};
      if (filters.techId !== undefined) params.tech_id = String(filters.techId);
      if (filters.customerId !== undefined)
        params.customer_id = String(filters.customerId);
      if (filters.q && filters.q.trim().length > 0) params.q = filters.q;
      if (filters.sort) params.sort = filters.sort;
      return franchiseApi<FranchiseConversationListItem[]>(
        "get",
        FranchiseEndpoints.messages.conversations,
        params,
      );
    },
    staleTime: 15_000,
  });
}

export function useFranchiseConversation(conversationId: number | null) {
  return useQuery({
    queryKey:
      conversationId !== null
        ? franchiseMessageKeys.conversation(conversationId)
        : ["franchise", "messages", "conversations", "disabled"],
    queryFn: () =>
      franchiseApi<FranchiseConversationThread>(
        "get",
        FranchiseEndpoints.messages.conversationDetail(conversationId!),
      ),
    enabled: conversationId !== null,
    staleTime: 10_000,
  });
}

export interface SendFranchiseMessageInput {
  conversationId: number;
  body: string;
  onBehalfOfTechnician: boolean;
}

export function useSendFranchiseMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      conversationId,
      body,
      onBehalfOfTechnician,
    }: SendFranchiseMessageInput) =>
      franchiseApi<Message>(
        "post",
        FranchiseEndpoints.messages.send(conversationId),
        {
          body,
          on_behalf_of_technician: onBehalfOfTechnician,
        },
      ),
    onSuccess: (_msg, { conversationId }) => {
      queryClient.invalidateQueries({
        queryKey: franchiseMessageKeys.conversation(conversationId),
      });
      queryClient.invalidateQueries({ queryKey: franchiseMessageKeys.all });
    },
  });
}

/**
 * Mount once at the top of the authenticated tabs region (gated
 * by `user?.role === 'franchise_owner'`). Subscribes to
 * `franchise:{franchiseId}:messages` and patches both the inbox
 * list cache and any open thread cache off the two-frame
 * protocol the BE publishes for every send (inbox_update +
 * message). The patcher is conservative — if the relevant cache
 * isn't present (e.g. the FO has never opened the inbox this
 * session) it falls back to a list invalidation rather than
 * fabricating a row.
 */
export function useFranchiseMessagingRealtime() {
  const franchiseId = useAuthStore((s) => s.user?.franchiseId ?? null);
  const queryClient = useQueryClient();

  const onMessage = useCallback(
    (raw: unknown) => {
      if (isInboxUpdate(raw)) {
        patchInboxCaches(queryClient, raw);
        return;
      }
      if (isNewMessage(raw)) {
        appendThreadCache(queryClient, raw.message);
      }
    },
    [queryClient],
  );

  useRealtimeChannel({
    channel:
      franchiseId !== null && franchiseId !== undefined
        ? `franchise:${franchiseId}:messages`
        : null,
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

/**
 * The inbox is keyed off the active filter object. The FO can be
 * looking at any combination of {techId, customerId, q, sort}, so
 * we patch every cached variant rather than only the "no filters"
 * one. For each: if the conversation is already in the cache, we
 * hoist it to the top with the new counters + bumped
 * `last_message_at`; if not, we invalidate so the next render
 * refetches.
 */
function patchInboxCaches(
  queryClient: QueryClient,
  payload: InboxUpdatePayload,
): void {
  const queries = queryClient.getQueriesData<FranchiseConversationListItem[]>({
    queryKey: ["franchise", "messages", "conversations"],
  });
  for (const [key, list] of queries) {
    if (key.length < 4) continue;
    if (!Array.isArray(list)) continue;
    const idx = list.findIndex((c) => c.id === payload.conversation_id);
    if (idx === -1) {
      queryClient.invalidateQueries({ queryKey: key });
      continue;
    }
    const updated: FranchiseConversationListItem = {
      ...list[idx],
      customer_unread_count: payload.customer_unread_count,
      technician_unread_count: payload.technician_unread_count,
      last_message_at: new Date().toISOString(),
    };
    const next = [updated, ...list.filter((_, i) => i !== idx)];
    queryClient.setQueryData(key, next);
  }
}

function appendThreadCache(
  queryClient: QueryClient,
  message: Message,
): void {
  const key = franchiseMessageKeys.conversation(message.conversation_id);
  const existing =
    queryClient.getQueryData<FranchiseConversationThread>(key);
  if (!existing) {
    queryClient.invalidateQueries({ queryKey: key });
    return;
  }
  if (existing.messages.some((m) => m.id === message.id)) return;
  queryClient.setQueryData<FranchiseConversationThread>(key, {
    ...existing,
    messages: [...existing.messages, message],
  });
}
