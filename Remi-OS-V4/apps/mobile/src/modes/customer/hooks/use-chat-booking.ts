import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import { DEFAULT_FRANCHISE_ID } from '@customer/constants/config';
import type { ApiResponse } from '@customer/types/api';
import type {
  ChatBubbleMessage,
  NlpResponse,
  NlpSession,
  SuggestedAction,
  TimeSlot,
} from '@customer/types/booking-chat';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const bookingChatKeys = {
  session: (sessionId: string | null) => ['booking-chat', 'session', sessionId] as const,
};

// ---------------------------------------------------------------------------
// Atomic mutation/query hooks (one per backend endpoint)
// ---------------------------------------------------------------------------

interface StartBookingSessionVars {
  franchiseId?: number;
}

export function useStartBookingSession(
  options?: UseMutationOptions<NlpSession, unknown, StartBookingSessionVars | void>,
) {
  return useMutation<NlpSession, unknown, StartBookingSessionVars | void>({
    mutationFn: async (vars) => {
      const franchiseId = vars?.franchiseId ?? DEFAULT_FRANCHISE_ID;
      const res = await apiClient.post<ApiResponse<NlpSession>>(
        ENDPOINTS.BOOKING_CHAT.START,
        { franchiseId },
      );
      return res.data.data;
    },
    ...options,
  });
}

interface SendBookingMessageVars {
  message: string;
}

export function useSendBookingMessage(
  sessionId: string | null,
  options?: UseMutationOptions<NlpResponse, unknown, SendBookingMessageVars>,
) {
  return useMutation<NlpResponse, unknown, SendBookingMessageVars>({
    mutationFn: async ({ message }) => {
      if (!sessionId) throw new Error('No active booking session');
      const res = await apiClient.post<ApiResponse<NlpResponse>>(
        ENDPOINTS.BOOKING_CHAT.MESSAGE(sessionId),
        { message },
      );
      return res.data.data;
    },
    ...options,
  });
}

interface SelectSlotVars {
  slotIndex: number;
}

export function useSelectSlot(
  sessionId: string | null,
  options?: UseMutationOptions<NlpResponse, unknown, SelectSlotVars>,
) {
  const queryClient = useQueryClient();
  return useMutation<NlpResponse, unknown, SelectSlotVars>({
    mutationFn: async ({ slotIndex }) => {
      if (!sessionId) throw new Error('No active booking session');
      const res = await apiClient.post<ApiResponse<NlpResponse>>(
        ENDPOINTS.BOOKING_CHAT.SELECT(sessionId),
        { slotIndex },
      );
      return res.data.data;
    },
    ...options,
    onSuccess: (...args) => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      // Forward to caller's onSuccess if they passed one. Spread keeps the
      // signature in lockstep with future TanStack Query versions.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (options?.onSuccess as any)?.(...args);
    },
  });
}

export function useBookingSession(sessionId: string | null) {
  return useQuery<NlpSession>({
    queryKey: bookingChatKeys.session(sessionId),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<NlpSession>>(
        ENDPOINTS.BOOKING_CHAT.LOAD(sessionId!),
      );
      return res.data.data;
    },
    enabled: !!sessionId,
    staleTime: 0,
  });
}

export function useCancelBookingSession(
  options?: UseMutationOptions<void, unknown, string>,
) {
  return useMutation<void, unknown, string>({
    mutationFn: async (sessionId: string) => {
      await apiClient.delete(ENDPOINTS.BOOKING_CHAT.DELETE(sessionId));
    },
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Orchestration hook — manages local message thread + session lifecycle.
// Used by app/booking/chat.tsx as the single hook the screen consumes.
// ---------------------------------------------------------------------------

const MAX_FAIL_COUNT_BEFORE_FALLBACK = 2;

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export interface PrefilledBookingContext {
  serviceIds: number[];
  preferredDate?: string;
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening';
  vehicleHint?: string;
  notes?: string;
}

export function useChatBooking() {
  const [messages, setMessages] = useState<ChatBubbleMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentSlots, setCurrentSlots] = useState<TimeSlot[] | null>(null);
  const [bookedAppointmentId, setBookedAppointmentId] = useState<number | null>(null);
  const [confirmedSlot, setConfirmedSlot] = useState<TimeSlot | null>(null);
  const [failCount, setFailCount] = useState(0);
  const [error, setError] = useState<'unreachable' | null>(null);
  const [prefilledContext, setPrefilledContext] = useState<PrefilledBookingContext | null>(
    null,
  );
  const sessionIdRef = useRef<string | null>(null);

  const startSession = useStartBookingSession();
  const sendMessageMutation = useSendBookingMessage(sessionIdRef.current);
  const selectSlotMutation = useSelectSlot(sessionIdRef.current);
  const cancelSession = useCancelBookingSession();

  // Keep the mutation hooks bound to the current sessionId via ref
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const addAssistantMessage = useCallback(
    (
      text: string,
      extras?: {
        slots?: TimeSlot[];
        suggestedActions?: SuggestedAction[];
        bookedAppointmentId?: number;
      },
    ) => {
      const msg: ChatBubbleMessage = {
        id: makeId(),
        role: 'assistant',
        text,
        timestamp: new Date().toISOString(),
        slots: extras?.slots,
        suggestedActions: extras?.suggestedActions,
        bookedAppointmentId: extras?.bookedAppointmentId,
      };
      setMessages((prev) => [...prev, msg]);
    },
    [],
  );

  const addUserMessage = useCallback((text: string) => {
    const msg: ChatBubbleMessage = {
      id: makeId(),
      role: 'user',
      text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updatePrefilledContextFromResponse = useCallback((res: NlpResponse) => {
    if (!res.intent) return;
    setPrefilledContext({
      serviceIds: res.intent.service_ids ?? [],
      preferredDate: res.intent.date_constraints?.preferred_date,
      preferredTimeOfDay: res.intent.date_constraints?.time_of_day,
      vehicleHint: res.intent.vehicle_hint,
      notes: res.intent.notes,
    });
  }, []);

  const initSession = useCallback(async () => {
    setMessages([]);
    setCurrentSlots(null);
    setBookedAppointmentId(null);
    setConfirmedSlot(null);
    setFailCount(0);
    setError(null);
    setPrefilledContext(null);

    try {
      const session = await startSession.mutateAsync();
      setSessionId(session.session_id);
      sessionIdRef.current = session.session_id;
      addAssistantMessage(
        "Hi! I'm REMI, your booking assistant. Tell me what service you need and when works for you — like \"oil change next Tuesday afternoon\" — and I'll find the best time.",
      );
      return session;
    } catch {
      setError('unreachable');
      return null;
    }
  }, [startSession, addAssistantMessage]);

  const handleResponse = useCallback(
    (response: NlpResponse) => {
      const slots = response.slots ?? undefined;
      if (slots && slots.length > 0) {
        setCurrentSlots(slots);
      }

      if (response.booked_appointment_id) {
        setBookedAppointmentId(response.booked_appointment_id);
        // If the user accepted via free-form ("the 2pm one"), the backend
        // returns a single slot in the response — capture it for the
        // calendar action on the confirmation card.
        if (slots && slots.length === 1) {
          setConfirmedSlot(slots[0]);
        }
      }

      updatePrefilledContextFromResponse(response);

      const isClarification = response.intent?.needs_clarification === true;
      const isGatheringWithNoSlots =
        response.status === 'gathering' && (!slots || slots.length === 0);

      // Bubble text — backend sends a natural-language reply or a clarification question
      const bubbleText = isClarification
        ? response.intent?.clarification_question ?? response.message
        : response.message;

      addAssistantMessage(bubbleText, {
        slots: slots && slots.length > 0 ? slots : undefined,
        suggestedActions:
          response.suggested_actions && response.suggested_actions.length > 0
            ? response.suggested_actions
            : undefined,
        bookedAppointmentId: response.booked_appointment_id,
      });

      if (isClarification || (isGatheringWithNoSlots && !response.suggested_actions?.length)) {
        setFailCount((c) => c + 1);
      } else {
        setFailCount(0);
      }
    },
    [addAssistantMessage, updatePrefilledContextFromResponse],
  );

  const send = useCallback(
    async (text: string) => {
      const sid = sessionIdRef.current;
      if (!sid || isProcessing) return;

      addUserMessage(text);
      setIsProcessing(true);

      try {
        const response = await sendMessageMutation.mutateAsync({ message: text });
        handleResponse(response);
      } catch {
        addAssistantMessage("Something went wrong. Could you try rephrasing that?");
        setFailCount((c) => c + 1);
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, sendMessageMutation, addUserMessage, handleResponse, addAssistantMessage],
  );

  const pickSlot = useCallback(
    async (slotIndex: number) => {
      const sid = sessionIdRef.current;
      if (!sid || isProcessing) return;

      setIsProcessing(true);

      const slotForCalendar = currentSlots?.[slotIndex] ?? null;

      try {
        const response = await selectSlotMutation.mutateAsync({ slotIndex });

        if (response.booked_appointment_id) {
          setBookedAppointmentId(response.booked_appointment_id);
          if (slotForCalendar) setConfirmedSlot(slotForCalendar);
        }

        setCurrentSlots(null);
        addAssistantMessage(response.message, {
          bookedAppointmentId: response.booked_appointment_id,
          suggestedActions:
            response.suggested_actions && response.suggested_actions.length > 0
              ? response.suggested_actions
              : undefined,
        });
      } catch {
        addAssistantMessage(
          "I couldn't confirm that slot. Please try again or pick a different one.",
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, selectSlotMutation, currentSlots, addAssistantMessage],
  );

  const handleSuggestedAction = useCallback(
    (action: SuggestedAction) => {
      switch (action.type) {
        case 'send_message': {
          const message = (action.payload?.message as string | undefined) ?? action.label;
          send(message);
          break;
        }
        case 'select_slot': {
          const idx = action.payload?.slotIndex;
          if (typeof idx === 'number') pickSlot(idx);
          break;
        }
        case 'change_date':
        case 'change_service':
        case 'open_help': {
          // These translate to free-form follow-up messages.
          send(action.label);
          break;
        }
      }
    },
    [send, pickSlot],
  );

  const cancel = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (sid) {
      cancelSession.mutate(sid);
    }
    setSessionId(null);
    sessionIdRef.current = null;
  }, [cancelSession]);

  const showFallbackPrompt = failCount >= MAX_FAIL_COUNT_BEFORE_FALLBACK;

  return {
    messages,
    isProcessing,
    sessionId,
    currentSlots,
    bookedAppointmentId,
    confirmedSlot,
    failCount,
    error,
    showFallbackPrompt,
    prefilledContext,
    initSession,
    send,
    pickSlot,
    handleSuggestedAction,
    cancel,
  };
}
