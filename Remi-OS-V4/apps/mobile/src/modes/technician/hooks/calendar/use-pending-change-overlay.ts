/**
 * `usePendingChangeOverlay` (P3-FE-8 / C.12) — selector hook that
 * tells the calendar canvas whether a given appointment has any
 * pending `reorganization_intents` staged against it, and (if so)
 * who staged them, what kind of change they are, and which active
 * session is the deeplink target for the review screen.
 *
 * The hook unifies two sources of truth for "is there a pending
 * change on this card?":
 *
 *   1. `appointment.pending_intent_summary` — the BE-side annotation
 *      (P6-BE-9) joined onto every appointments-list row. Reflects
 *      every active session in the franchise that touches this
 *      appointment, from any actor (tech_app / franchise_app /
 *      customer_app / ai_engine / mixed). Authoritative for the
 *      cross-actor view but stale until the next refetch /
 *      realtime ping.
 *   2. `usePendingRealityStore.intents` — the local intent store
 *      (P3-FE-1) populated by the smart-default linter intercept
 *      (P3-FE-7). Reflects intents the *current device* just staged
 *      but the BE may not have annotated yet.
 *
 * **Local intents win on conflict.** If the user just staged an
 * intent on this device, the overlay must appear immediately
 * without waiting for a BE round-trip. When the local store has at
 * least one intent for this appointment, the BE annotation is
 * ignored entirely (its `kinds` / `intent_count` would be a
 * superset that double-counts the local intent until the next
 * refetch). The local store is always tagged `tech_app` because the
 * P3-FE-7 producer only fires on this device. When only the BE
 * annotation has data, its `source` is surfaced verbatim.
 *
 * Returns `{ isPending: false, ...nulls }` when neither source has
 * a hit — this is the common case (the vast majority of cards have
 * no pending changes), so the hot path stays cheap.
 *
 * Caller contract:
 *   - Pass the `CalendarAppointmentItem` (or null/undefined for
 *     drafts and personal events). The hook short-circuits to the
 *     no-pending result when the appointment is missing.
 *   - The hook is safe to call inside the calendar's per-event
 *     render path. The local-store subscription uses a stable
 *     selector so renders only fire when the slice of intents
 *     filtered to this `appointment_id` changes shape.
 *
 * Companion to `getPendingIntentSummaryFromEvent`
 * (`src/utils/resource-calendar-mapping.ts`) which exposes the
 * BE annotation to non-hook callers (e.g. `eventStyleOverrides`
 * memoized callbacks where Rules of Hooks forbid a hook call).
 * Those callers must subscribe to the local intent store at the
 * parent component level and pass the intents-for-appointment
 * subset in as a dependency.
 */

import { useMemo } from "react";

import type { CalendarAppointmentItem } from "@technician/types/calendar";
import type {
  PendingIntentSummarySource,
  ReorganizationIntent,
  ReorganizationIntentType,
} from "@technician/types/reorganization";
import { usePendingRealityStore } from "@technician/stores/pending-reality";

export interface PendingChangeOverlayResult {
  /**
   * True when at least one source (local store or BE annotation)
   * reports an active intent against this appointment.
   */
  isPending: boolean;

  /**
   * Producer of the pending change. Local-store-only hits are
   * always `tech_app` (the P3-FE-7 producer is local-device only).
   * BE-only hits surface the annotation's `source` verbatim.
   * `null` when `isPending` is false.
   */
  source: PendingIntentSummarySource | null;

  /**
   * Distinct intent types touching this appointment. Order is not
   * guaranteed and callers should not depend on it (matches the
   * BE-side `PendingIntentSummary.kinds` contract).
   */
  kinds: ReorganizationIntentType[];

  /**
   * Total count of pending intents touching this appointment. Used
   * to render the `+N` companion next to the source-badge icon
   * when greater than 1. Always >= 1 when `isPending` is true.
   */
  intentCount: number;

  /**
   * Session id the tap-to-route handler should deeplink to. Pulled
   * from the local store's session when the overlay is local-driven
   * and from `pending_intent_summary.most_recent_session_id`
   * otherwise. May be `null` when the BE annotation reports no
   * accessible session id (e.g. cross-franchise visibility edge
   * cases) — in which case `handleRCEventPress` falls through to
   * the default appointment-detail behavior instead of routing to
   * the review screen.
   */
  mostRecentSessionId: number | null;
}

const EMPTY_RESULT: PendingChangeOverlayResult = {
  isPending: false,
  source: null,
  kinds: [],
  intentCount: 0,
  mostRecentSessionId: null,
};

/**
 * Pure variant of `usePendingChangeOverlay` — same merge logic,
 * but takes the local intent slice as an argument instead of
 * subscribing. Used by the `eventStyleOverrides` callbacks in the
 * three calendar wrappers, which can't call hooks themselves but
 * already receive the parent component's local intent subscription
 * as a `useCallback` dependency. Also the unit test entry point so
 * the merge contract can be exercised without a Zustand store.
 *
 * PR-UX-2 PASS 2.18 (2026-05-05) — defensive orphan suppression.
 * When `knownSessionIds` is non-null and the BE annotation
 * references a `most_recent_session_id` the device has no local
 * knowledge of (built by `useKnownReorganizationSessionIds` from
 * the active store sessionId + the FO's pending-review list), the
 * overlay is suppressed. `null` (or undefined) preserves the
 * pre-2.18 behavior. Local-store hits are NEVER suppressed — if
 * the user just staged it on this device, the overlay paints
 * regardless of any cross-actor signal. See
 * `src/hooks/calendar/use-known-reorganization-session-ids.ts` for
 * the construction contract.
 *
 * 2026-05-07 follow-up — chip-row freeze at high intent count:
 * the `[Cleanup:OrphanedSession]` observability log used to fire
 * via `console.warn` from EVERY call site of this helper, on
 * EVERY render, for EVERY appointment whose BE annotation
 * referenced an orphan session. With two call sites (the cyan-
 * tile border override AND the `PendingChangeBadge` slot), 17
 * appointments touched by 5 unrelated `tech_app` drafts, and 3-5
 * renders per drag, the cumulative cost on a 9-intent staged
 * session was 34 × 5 = 170 yellow-box warnings per drag — enough
 * to JS-thread-starve the chip row's React render → native
 * commit pipeline (visible as "the ecosystems area doesn't
 * update anymore" on the user's screen).
 *
 * Two changes shipped together:
 *
 *   1. Demoted from `console.warn` (which grows the LogBox
 *      overlay and becomes more expensive per call as the queue
 *      lengthens) to `console.log` (cheap, doesn't render an
 *      overlay).
 *   2. Module-scope `Set<number>` dedupe keyed on the orphan
 *      `sessionId`. Each session id gets exactly ONE log line
 *      per process lifetime, regardless of how many call sites,
 *      appointments, or renders observe it. The Set grows
 *      slowly (the user's repro hit 5 ids); reset only on hot
 *      reload (module re-evaluation) or process restart.
 *
 * The suppression branch itself is unchanged — every orphan
 * annotation still drops the overlay, every render. Only the
 * observability log is rate-limited.
 */

/**
 * Module-scope dedupe set for the orphan-session observability log.
 * Each orphan session id contributes exactly ONE `console.log`
 * line per process lifetime; subsequent observations of the same
 * id are silently suppressed (the suppression branch itself is
 * unaffected — every orphan annotation still drops the overlay
 * on every render). See the docstring above for the freeze
 * symptom this dedupe addresses.
 */
const observedOrphanSessionIds = new Set<number>();

/**
 * Test-only reset hook. Lives in the same module (rather than a
 * separate test-utils file) so unit tests can import it without
 * pulling in Jest setup that production code shouldn't see. NOT
 * exported from any package barrel — the only legitimate caller is
 * a `beforeEach` in `__tests__/`.
 */
export function __resetOrphanSessionLogDedupeForTests(): void {
  observedOrphanSessionIds.clear();
}

export function computePendingChangeOverlay(
  appointment: CalendarAppointmentItem | null | undefined,
  localIntentsForAppointment: ReorganizationIntent[],
  localSessionId: number | null,
  knownSessionIds?: ReadonlySet<number> | null,
): PendingChangeOverlayResult {
  if (!appointment) return EMPTY_RESULT;

  if (localIntentsForAppointment.length > 0) {
    const kinds = uniqueKinds(localIntentsForAppointment.map((i) => i.intent_type));
    return {
      isPending: true,
      source: "tech_app",
      kinds,
      intentCount: localIntentsForAppointment.length,
      mostRecentSessionId: localSessionId,
    };
  }

  const summary = appointment.pending_intent_summary;
  if (summary && summary.intent_count > 0) {
    if (
      knownSessionIds != null &&
      summary.most_recent_session_id != null &&
      !knownSessionIds.has(summary.most_recent_session_id)
    ) {
      if (__DEV__) {
        const orphanId = summary.most_recent_session_id;
        // PLAN-DEVIATION: 2026-05-09-pr-ux-17-strip-ai-demo —
        // `tech_app`-source orphans are silenced. The BE stamps
        // the source field with the role of the app that authored
        // the session, not the actor's role (see PR-UX-8 dev-log
        // for the BE-side mismatch); an FO finalizing their own
        // self-staged session via the technician app produces a
        // `pending_review` row whose annotation source is
        // `tech_app`. After PR-UX-8's known-set narrowing dropped
        // `pending_review` from the union, that just-finalized
        // session reads as "orphan" and the log fired with
        // `source: "tech_app"` — misleading the user into thinking
        // something was actually wrong. The genuinely diagnostic
        // case (`ai_suggestion` orphans surviving the demo gate
        // somehow, or future cross-actor `franchise_dashboard`
        // orphans) still logs. See
        // docs/PLAN-DEVIATIONS.md#2026-05-09-pr-ux-17-strip-ai-demo.
        if (
          summary.source !== "tech_app" &&
          !observedOrphanSessionIds.has(orphanId)
        ) {
          observedOrphanSessionIds.add(orphanId);
          // `console.log` (not `console.warn`): the warn variant
          // grows the in-app LogBox queue, which gets quadratically
          // more expensive as the queue lengthens. We still want
          // observability; we don't want a render storm. See the
          // helper's docstring for the freeze symptom this fix
          // addresses (2026-05-07 follow-up).
          console.log(
            "[Cleanup:OrphanedSession] suppressing pending overlay (first observation)",
            {
              appointmentId: appointment.id,
              sessionId: orphanId,
              source: summary.source,
              kinds: summary.kinds,
              intentCount: summary.intent_count,
              knownSessionCount: knownSessionIds.size,
            },
          );
        }
      }
      return EMPTY_RESULT;
    }
    return {
      isPending: true,
      source: summary.source,
      kinds: summary.kinds,
      intentCount: summary.intent_count,
      mostRecentSessionId: summary.most_recent_session_id,
    };
  }

  return EMPTY_RESULT;
}

function uniqueKinds(
  kinds: ReorganizationIntentType[],
): ReorganizationIntentType[] {
  const seen = new Set<ReorganizationIntentType>();
  const out: ReorganizationIntentType[] = [];
  for (const k of kinds) {
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

export function usePendingChangeOverlay(
  appointment: CalendarAppointmentItem | null | undefined,
  knownSessionIds?: ReadonlySet<number> | null,
): PendingChangeOverlayResult {
  const localIntents = usePendingRealityStore((s) => s.intents);
  const localSessionId = usePendingRealityStore((s) => s.sessionId);

  const apptId = appointment?.id ?? null;

  const localIntentsForAppointment = useMemo(() => {
    if (apptId == null) return EMPTY_INTENTS;
    const filtered = localIntents.filter((i) => i.appointment_id === apptId);
    if (filtered.length === 0) return EMPTY_INTENTS;
    return filtered;
  }, [localIntents, apptId]);

  return useMemo(
    () =>
      computePendingChangeOverlay(
        appointment,
        localIntentsForAppointment,
        localSessionId,
        knownSessionIds ?? null,
      ),
    [appointment, localIntentsForAppointment, localSessionId, knownSessionIds],
  );
}

// Stable empty-array reference so `useMemo` consumers don't churn
// on identity changes when the appointment has no local intents.
const EMPTY_INTENTS: ReorganizationIntent[] = [];
