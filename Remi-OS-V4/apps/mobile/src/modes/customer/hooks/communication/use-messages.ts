/**
 * MSG-FE-CUST — TanStack Query hooks for the unified
 * customer↔technician messaging API (MSG-BE-1).
 *
 * Replaces the appointment-scoped legacy hooks. Conversations are
 * pair-scoped (one row per customer+technician) and identified by
 * numeric `conversation.id`. Conversations must be created
 * explicitly via `useStartConversation` — there is no implicit
 * "first message creates a thread" path. See
 * `/Users/jacegalloway/Documents/codebases/REMITechnician/docs/implementation-plans/messaging-redo-plan.md`
 * for the full BE contract and rationale.
 *
 * Realtime: this file also exposes
 *   - `useMessagingInboxRealtime()` — subscribes to
 *     `user:{userId}:inbox` and patches the conversation list
 *     cache on every `inbox_update` event. Mount once, high in
 *     the authenticated tree (the tabs layout is the right spot)
 *     so the badge stays warm across screens.
 *   - `useConversationRealtime(conversationId)` — subscribes to
 *     `conversation:{id}` and appends incoming messages to the
 *     thread cache. Mount on the open thread screen.
 */

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import { useRealtimeChannel } from '@customer/hooks/realtime/use-realtime-channel';
import { useAuthStore } from '@/src/stores/auth';
import type {
  ApiResponse,
  Conversation,
  InboxUpdatePayload,
  Message,
  NewMessagePayload,
} from '@customer/types/api';

export const messageKeys = {
  all: ['messages'] as const,
  conversations: () => ['messages', 'conversations'] as const,
  conversation: (id: number) =>
    ['messages', 'conversations', id, 'messages'] as const,
};

export function useConversations() {
  return useQuery({
    queryKey: messageKeys.conversations(),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<Conversation[]>>(
        ENDPOINTS.MESSAGES.LIST,
      );
      return data.data;
    },
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
}

export function useConversationMessages(conversationId: number | undefined) {
  return useQuery({
    queryKey: conversationId
      ? messageKeys.conversation(conversationId)
      : ['messages', 'conversations', 'pending'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<Message[]>>(
        ENDPOINTS.MESSAGES.CONVERSATION(conversationId!),
      );
      return data.data;
    },
    enabled: !!conversationId,
    staleTime: 15_000,
  });
}

/**
 * Customer-side explicit "start conversation" with a technician.
 * Returns the (possibly pre-existing) conversation row. Idempotent
 * per the MSG-BE-1 contract — the backend upserts on the
 * `(customer_id, technician_id)` unique constraint.
 */
export function useStartConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ technician_id }: { technician_id: number }) => {
      const { data } = await apiClient.post<ApiResponse<Conversation>>(
        ENDPOINTS.MESSAGES.START,
        { technician_id },
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.conversations() });
    },
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      body,
    }: {
      conversationId: number;
      body: string;
    }) => {
      const { data } = await apiClient.post<ApiResponse<Message>>(
        ENDPOINTS.MESSAGES.SEND(conversationId),
        { body },
      );
      return data.data;
    },
    onSuccess: (_msg, vars) => {
      queryClient.invalidateQueries({
        queryKey: messageKeys.conversation(vars.conversationId),
      });
      queryClient.invalidateQueries({ queryKey: messageKeys.conversations() });
    },
  });
}

/**
 * Subscribes to the per-user inbox channel and patches the
 * conversation list cache so badges + last-message previews stay
 * fresh without a refetch. Mount once near the top of the
 * authenticated tree.
 */
export function useMessagingInboxRealtime(): void {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.userId);

  const handleMessage = useCallback(
    (payload: unknown) => {
      if (
        typeof payload !== 'object' ||
        payload === null ||
        (payload as { type?: unknown }).type !== 'inbox_update'
      ) {
        return;
      }
      const update = payload as InboxUpdatePayload;
      queryClient.setQueryData<Conversation[] | undefined>(
        messageKeys.conversations(),
        (current) => {
          if (!current) return current;
          let matched = false;
          const next = current.map((c) => {
            if (c.id !== update.conversation_id) return c;
            matched = true;
            return {
              ...c,
              customer_unread_count: update.customer_unread_count,
              technician_unread_count: update.technician_unread_count,
            };
          });
          // Conversation not in cache yet (e.g. a tech just sent the
          // first message in a new thread). Force a refetch so the
          // new row + its preview/timestamp arrive together.
          if (!matched) {
            queryClient.invalidateQueries({
              queryKey: messageKeys.conversations(),
            });
          }
          return next;
        },
      );
    },
    [queryClient],
  );

  useRealtimeChannel({
    channel: userId ? `user:${userId}:inbox` : null,
    onMessage: handleMessage,
  });
}

/**
 * Subscribes to a single conversation's channel and appends new
 * messages to the thread cache. Mount on the chat screen for
 * the active thread only.
 */
export function useConversationRealtime(conversationId: number | null): void {
  const queryClient = useQueryClient();

  const handleMessage = useCallback(
    (payload: unknown) => {
      if (
        typeof payload !== 'object' ||
        payload === null ||
        (payload as { type?: unknown }).type !== 'message' ||
        conversationId === null
      ) {
        return;
      }
      const event = payload as NewMessagePayload;
      if (event.message.conversation_id !== conversationId) return;

      queryClient.setQueryData<Message[] | undefined>(
        messageKeys.conversation(conversationId),
        (current) => {
          if (!current) return current;
          if (current.some((m) => m.id === event.message.id)) {
            return current;
          }
          return [...current, event.message];
        },
      );
    },
    [conversationId, queryClient],
  );

  useRealtimeChannel({
    channel:
      conversationId !== null ? `conversation:${conversationId}` : null,
    onMessage: handleMessage,
  });
}
