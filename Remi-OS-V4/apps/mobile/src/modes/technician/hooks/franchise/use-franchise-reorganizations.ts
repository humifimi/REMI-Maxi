/**
 * Franchise-scoped reorganization session hooks (P7-FE-1).
 *
 * The technician app surfaces AI-generated reorganization sessions
 * inside the existing Pending Reality review screen via the new
 * "AI" tab (§5.2.5). Per §2.5 the AI policy is always
 * `always_fo_review`, so AI sessions are *acted upon by FOs*. A
 * franchise owner using the technician app is the v1 actor here —
 * the dedicated franchise dashboard (REMIDashboard) will take over
 * once it ships, but the technician app already supports an FO
 * role today via `UserRole.FRANCHISE_OWNER` (see
 * `src/types/enums.ts`).
 *
 * Endpoint contracts (REMIBackend
 * `src/routes/v1/franchise/reorganizations.ts`):
 *
 *   GET    /api/v1/franchise/reorganizations
 *     Optional query params: { status?, author_user_id?,
 *       affecting_appointment_id?, affecting_customer_id? }
 *     200 → { error: false, data: { sessions: ReorganizationApiSession[] } }
 *
 *   GET    /api/v1/franchise/reorganizations/:id
 *     200 → { error: false, data: { session: ReorganizationApiSession } }
 *
 *   POST   /api/v1/franchise/reorganizations/:id/authorize
 *     Body: {} (Idempotency-Key header per §6.3)
 *     200 → { error: false, data: { session: ReorganizationApiSession } }
 *
 *   POST   /api/v1/franchise/reorganizations/:id/deny
 *     Body: { decline_reason_kind: DeclineReasonKind,
 *             decline_reason_text?: string }
 *     200 → { error: false, data: { session: ReorganizationApiSession } }
 *
 *   POST   /api/v1/franchise/reorganizations/:id/counter-propose
 *     Body: { intent_id?: number, intent: ReorganizationIntentPayload }
 *     200 → { error: false, data: { session: ReorganizationApiSession } }
 *
 * Source filtering: the BE's `listSessions` does NOT accept a `source`
 * query param today, so we fetch all `pending_review` sessions and
 * filter client-side via `useAiSuggestionSessions`. If the list grows
 * beyond ~50 active pending-review sessions per franchise we'll add
 * a server-side filter in a follow-up; the spec's 24h auto-expire
 * (§5.2.5) keeps the working set bounded for v1.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import * as Crypto from "expo-crypto";

import { franchiseApi } from "@technician/api/client";
import { FranchiseEndpoints } from "@technician/api/endpoints";
import { Config } from "@technician/constants/config";
import type { ReorganizationApiSession } from "@technician/hooks/schedule/use-reorganization";
import { calendarKeys } from "@technician/hooks/schedule/use-calendar";
import { useAuthStore } from "@/src/stores/auth";
import { cacheReorganizationResult } from "@technician/hooks/schedule/use-reorganization";
import type {
  ReorganizationIntentPayload,
  ReorganizationSessionStatus,
} from "@technician/types/reorganization";

export const franchiseReorganizationKeys = {
  all: ["franchise", "reorganizations"] as const,
  list: (filters?: { status?: ReorganizationSessionStatus }) =>
    [...franchiseReorganizationKeys.all, "list", filters ?? {}] as const,
  detail: (id: number) =>
    [...franchiseReorganizationKeys.all, "detail", id] as const,
};

interface ListSessionsEnvelope {
  sessions: ReorganizationApiSession[];
}

interface DetailSessionEnvelope {
  session: ReorganizationApiSession;
}

/**
 * Structured decline reasons. Mirrors §5.4.5's customer-side
 * decline picker so the same five `decline_reason_kind` values
 * feed back into the AI training signal in v2 (per §3.5).
 */
export type DeclineReasonKind =
  | "inconvenient_time"
  | "wrong_technician"
  | "vehicle_unavailable"
  | "conflicting_commitment"
  | "other";

interface ListSessionsParams {
  status?: ReorganizationSessionStatus;
  enabled?: boolean;
}

export function useFranchiseReorganizationSessions(
  params: ListSessionsParams = {},
) {
  const { status, enabled = true } = params;
  const query = useQuery({
    queryKey: franchiseReorganizationKeys.list({ status }),
    queryFn: async () => {
      if (__DEV__) {
        console.log("[DEBUG:Franchise/Reorg] fetching sessions", { status });
      }
      const data = await franchiseApi<ListSessionsEnvelope>(
        "get",
        FranchiseEndpoints.reorganizations.list,
        status ? { status } : undefined,
      );
      if (__DEV__) {
        console.log("[DEBUG:Franchise/Reorg] fetched sessions", {
          status,
          count: data.sessions.length,
          bySource: data.sessions.reduce<Record<string, number>>((acc, s) => {
            acc[s.source] = (acc[s.source] ?? 0) + 1;
            return acc;
          }, {}),
        });
      }
      return data.sessions;
    },
    enabled,
    staleTime: 30_000,
  });
  return query;
}

/**
 * Convenience selector returning only `source: "ai_suggestion"`
 * sessions awaiting FO review. The §5.2.5 AI tab consumes this.
 *
 * Filter happens client-side because the BE's `listSessions` does
 * not accept a `source` param today (see file header). Filtering
 * here (rather than inside the screen) keeps the AI-tab
 * presentational layer agnostic of the BE listing surface.
 *
 * **Demo gate (2026-05-08):** the BE's `005_pending_reality_demo`
 * seeder runs whenever `DEMO_MODE=true` is set on the Render
 * service powering `remi-api-ij2v.onrender.com`. Until that env
 * var is flipped off (or the seeder is retired), the BE will keep
 * five `pending_review` AI sessions alive. This hook short-circuits
 * to an empty list with `enabled: false` when `Config.DEMO_MODE` is
 * `false` so the AI tab badge reads zero and the realtime cascade
 * for those BE-seeded sessions is invisible to the FO user. Flip
 * `Config.DEMO_MODE` back to `true` for a customer demo / pitch.
 *
 * Other consumers of `useFranchiseReorganizationSessions`
 * (`useKnownReorganizationSessionIds`, the FO list views) are
 * NOT affected by `DEMO_MODE` — they consume `draft` and
 * `pending_review` sessions for legitimate cyan-overlay
 * suppression and queue rendering regardless of source. Only this
 * AI-suggestion surface is gated.
 */
export function useAiSuggestionSessions(params: { enabled?: boolean } = {}) {
  const { enabled = true } = params;
  const effectiveEnabled = enabled && Config.DEMO_MODE;
  const query = useFranchiseReorganizationSessions({
    status: "pending_review",
    enabled: effectiveEnabled,
  });
  const aiSessions = effectiveEnabled
    ? query.data?.filter((s) => s.source === "ai_suggestion")
    : undefined;
  if (__DEV__) {
    if (!effectiveEnabled && enabled) {
      // One-shot diagnostic so it's obvious from device logs that
      // the demo gate is the reason the AI tab badge is zero (vs.
      // a BE outage or empty queue).
      console.log("[DEBUG:Franchise/Reorg] useAiSuggestionSessions demo-gated", {
        callerEnabled: enabled,
        configDemoMode: Config.DEMO_MODE,
      });
    }
    if (effectiveEnabled && query.data) {
      console.log("[DEBUG:Franchise/Reorg] useAiSuggestionSessions filter", {
        enabled: effectiveEnabled,
        pendingReviewCount: query.data.length,
        aiSessionCount: aiSessions?.length ?? 0,
        droppedNonAiCount: query.data.length - (aiSessions?.length ?? 0),
      });
    }
  }
  return {
    ...query,
    data: aiSessions,
  };
}

export function useFranchiseReorganizationSession(
  sessionId: number | null | undefined,
) {
  return useQuery({
    queryKey:
      sessionId != null
        ? franchiseReorganizationKeys.detail(sessionId)
        : ["franchise", "reorganizations", "detail", "noop"],
    queryFn: async () => {
      const data = await franchiseApi<DetailSessionEnvelope>(
        "get",
        FranchiseEndpoints.reorganizations.detail(sessionId as number),
      );
      return data.session;
    },
    enabled: sessionId != null,
    staleTime: 15_000,
  });
}

// ──────────────────────────────────────────────────────────────────
// Mutation hooks (FO actions on AI / pending-review sessions)
// ──────────────────────────────────────────────────────────────────

interface AuthorizeVariables {
  sessionId: number;
  /** Auto-generated per call; tests may override for deterministic replay. */
  idempotencyKey: string;
}

export function useAuthorizeReorganizationSession() {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    ReorganizationApiSession,
    AxiosError,
    AuthorizeVariables
  >({
    mutationFn: async ({ sessionId, idempotencyKey }) => {
      if (__DEV__) {
        console.log("[DEBUG:Franchise/Reorg] authorize → POST", {
          sessionId,
          idempotencyKey,
        });
      }
      const data = await franchiseApi<DetailSessionEnvelope>(
        "post",
        FranchiseEndpoints.reorganizations.authorize(sessionId),
        {},
        { headers: { "Idempotency-Key": idempotencyKey } },
      );
      return data.session;
    },
    onSuccess: (session) => {
      if (__DEV__) {
        console.log("[DEBUG:Franchise/Reorg] authorize success", {
          sessionId: session.id,
          newStatus: session.status,
        });
      }
      queryClient.invalidateQueries({
        queryKey: franchiseReorganizationKeys.all,
      });
      queryClient.setQueryData(
        franchiseReorganizationKeys.detail(session.id),
        session,
      );

      // PLAN-DEVIATION: 2026-05-09-pr-ux-18-cache-null-on-commit —
      // see docs/PLAN-DEVIATIONS.md#2026-05-09-pr-ux-18-cache-null-on-commit.
      //
      // Authorize commits the session in the BE the moment the
      // single-grant role is satisfied (per BE PR #61 the
      // self-authorize path commits inline). The calendar must
      // refetch so cards land in their new positions, and the
      // active-session cache must clear so a stale `data: ...`
      // doesn't keep observers thinking the session is alive.
      // Pre-PR-UX-18 these two steps lived only in the FE-side
      // finalize hook (`useFinalizeReorganizationSession`); the
      // authorize path skipped both, which manifested as
      // "tapped Approve, alert showed, cards didn't move" when
      // the user routed through `pending_review` → `authorize`
      // (see Regression 2 / fix-pending-after-commit in
      // docs/DEVELOPMENT-LOG.md).
      if (session.status === "committed") {
        queryClient.invalidateQueries({ queryKey: calendarKeys.all });
        queryClient.invalidateQueries({ queryKey: ["dispatch-overview"] });
        cacheReorganizationResult(
          queryClient,
          useAuthStore.getState().user?.franchiseId ?? null,
          null,
        );
      }
    },
    onError: (err) => {
      if (__DEV__) {
        console.log("[DEBUG:Franchise/Reorg] authorize error", {
          status: err.response?.status,
          message: err.message,
        });
      }
    },
  });

  type WrappedVariables = Omit<AuthorizeVariables, "idempotencyKey"> & {
    idempotencyKey?: string;
  };

  const mutate = (
    variables: WrappedVariables,
    options?: Parameters<typeof mutation.mutate>[1],
  ) => {
    const idempotencyKey = variables.idempotencyKey ?? Crypto.randomUUID();
    mutation.mutate({ ...variables, idempotencyKey }, options);
  };

  const mutateAsync = (
    variables: WrappedVariables,
    options?: Parameters<typeof mutation.mutateAsync>[1],
  ) => {
    const idempotencyKey = variables.idempotencyKey ?? Crypto.randomUUID();
    return mutation.mutateAsync({ ...variables, idempotencyKey }, options);
  };

  return { ...mutation, mutate, mutateAsync, mutationUnsafe: mutation };
}

interface DenyVariables {
  sessionId: number;
  declineReasonKind: DeclineReasonKind;
  /** Required when `declineReasonKind === "other"`; max 500 chars. */
  declineReasonText?: string;
  idempotencyKey: string;
}

export function useDenyReorganizationSession() {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    ReorganizationApiSession,
    AxiosError,
    DenyVariables
  >({
    mutationFn: async ({
      sessionId,
      declineReasonKind,
      declineReasonText,
      idempotencyKey,
    }) => {
      if (__DEV__) {
        console.log("[DEBUG:Franchise/Reorg] deny → POST", {
          sessionId,
          declineReasonKind,
          hasText: declineReasonText !== undefined,
          textLength: declineReasonText?.length ?? 0,
          idempotencyKey,
        });
      }
      const data = await franchiseApi<DetailSessionEnvelope>(
        "post",
        FranchiseEndpoints.reorganizations.deny(sessionId),
        {
          decline_reason_kind: declineReasonKind,
          ...(declineReasonText !== undefined
            ? { decline_reason_text: declineReasonText }
            : {}),
        },
        { headers: { "Idempotency-Key": idempotencyKey } },
      );
      return data.session;
    },
    onSuccess: (session) => {
      if (__DEV__) {
        console.log("[DEBUG:Franchise/Reorg] deny success", {
          sessionId: session.id,
          newStatus: session.status,
        });
      }
      queryClient.invalidateQueries({
        queryKey: franchiseReorganizationKeys.all,
      });
      queryClient.setQueryData(
        franchiseReorganizationKeys.detail(session.id),
        session,
      );
    },
    onError: (err) => {
      if (__DEV__) {
        console.log("[DEBUG:Franchise/Reorg] deny error", {
          status: err.response?.status,
          message: err.message,
        });
      }
    },
  });

  type WrappedVariables = Omit<DenyVariables, "idempotencyKey"> & {
    idempotencyKey?: string;
  };

  const mutate = (
    variables: WrappedVariables,
    options?: Parameters<typeof mutation.mutate>[1],
  ) => {
    const idempotencyKey = variables.idempotencyKey ?? Crypto.randomUUID();
    mutation.mutate({ ...variables, idempotencyKey }, options);
  };

  const mutateAsync = (
    variables: WrappedVariables,
    options?: Parameters<typeof mutation.mutateAsync>[1],
  ) => {
    const idempotencyKey = variables.idempotencyKey ?? Crypto.randomUUID();
    return mutation.mutateAsync({ ...variables, idempotencyKey }, options);
  };

  return { ...mutation, mutate, mutateAsync, mutationUnsafe: mutation };
}

interface CounterProposeVariables {
  sessionId: number;
  /**
   * The intent the FO is replacing. Optional only when the
   * counter-proposal is a brand-new intent attached to the same
   * session (rare; the v1 path always replaces an existing one).
   */
  intentId?: number;
  intent: ReorganizationIntentPayload;
  idempotencyKey: string;
}

export function useCounterProposeReorganizationSession() {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    ReorganizationApiSession,
    AxiosError,
    CounterProposeVariables
  >({
    mutationFn: async ({
      sessionId,
      intentId,
      intent,
      idempotencyKey,
    }) => {
      if (__DEV__) {
        console.log("[DEBUG:Franchise/Reorg] counter-propose → POST", {
          sessionId,
          intentId,
          intentKind: intent.kind,
          idempotencyKey,
        });
      }
      const data = await franchiseApi<DetailSessionEnvelope>(
        "post",
        FranchiseEndpoints.reorganizations.counterPropose(sessionId),
        {
          ...(intentId !== undefined ? { intent_id: intentId } : {}),
          intent,
        },
        { headers: { "Idempotency-Key": idempotencyKey } },
      );
      return data.session;
    },
    onSuccess: (session) => {
      if (__DEV__) {
        console.log("[DEBUG:Franchise/Reorg] counter-propose success", {
          sessionId: session.id,
          newStatus: session.status,
        });
      }
      queryClient.invalidateQueries({
        queryKey: franchiseReorganizationKeys.all,
      });
      queryClient.setQueryData(
        franchiseReorganizationKeys.detail(session.id),
        session,
      );
    },
    onError: (err) => {
      if (__DEV__) {
        console.log("[DEBUG:Franchise/Reorg] counter-propose error", {
          status: err.response?.status,
          message: err.message,
        });
      }
    },
  });

  type WrappedVariables = Omit<CounterProposeVariables, "idempotencyKey"> & {
    idempotencyKey?: string;
  };

  const mutate = (
    variables: WrappedVariables,
    options?: Parameters<typeof mutation.mutate>[1],
  ) => {
    const idempotencyKey = variables.idempotencyKey ?? Crypto.randomUUID();
    mutation.mutate({ ...variables, idempotencyKey }, options);
  };

  const mutateAsync = (
    variables: WrappedVariables,
    options?: Parameters<typeof mutation.mutateAsync>[1],
  ) => {
    const idempotencyKey = variables.idempotencyKey ?? Crypto.randomUUID();
    return mutation.mutateAsync({ ...variables, idempotencyKey }, options);
  };

  return { ...mutation, mutate, mutateAsync, mutationUnsafe: mutation };
}
