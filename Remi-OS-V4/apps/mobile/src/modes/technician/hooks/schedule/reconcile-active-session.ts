/**
 * `reconcileActiveSession` — pure reducer that brings
 * `usePendingRealityStore` into agreement with a `GET
 * /reorganizations/...` response.
 *
 * Owning section: `docs/implementation-plans/pending-reality-rehydration-plan.md`
 * §6.3 (chunk `P3-FE-REHYDRATE-DETAIL`).
 *
 * Two consumers share this helper:
 *   1. `useReorganizationSession(id)` (this chunk, §6.1) — the
 *      review-screen detail query, which the realtime hook
 *      (`useRealtimeReorganization`) already invalidates on
 *      `["reorganizations", "session", id]`. This consumer fires
 *      the helper from inside its `queryFn` because TanStack Query
 *      v5 removed `onSuccess`/`onError` from `useQuery`.
 *   2. `useActiveReorganization()` (next chunk, `P3-FE-REHYDRATE-MOUNT`,
 *      §7) — the mount-time cold-start GET that fixes the
 *      "reload-mid-staging-loses-the-draft" bug.
 *
 * Centralizing the reconciliation here means both the realtime path
 * and the cold-start path share one tested code path (per the plan's
 * "single tested reconcile path" principle in §6.3).
 *
 * Pure on purpose:
 *   - No React, no hooks, no `useStore` calls. Callers pass the
 *     store's API surface (`PendingRealityState`) so this helper is
 *     trivially unit-testable with a `vi.fn()` / `jest.fn()` mock.
 *   - Callsites in real code MUST pass `usePendingRealityStore.getState()`
 *     (NOT subscribe via the hook) so the function does not run inside
 *     React's render path and trigger a re-render loop.
 */

import type { PendingRealityState } from "@technician/stores/pending-reality";
import type { ReorganizationApiSession } from "@technician/hooks/schedule/use-reorganization";

/**
 * Caller-identification tag for diagnostic logging. Each consumer
 * passes a stable string so the on-device log stream tells us
 * exactly which queryFn / cache writer fired this reconcile.
 *
 * Always-on (NOT `__DEV__`-gated) at the API surface so callers
 * are forced to think about identification.
 */
export type ReconcileCaller =
  | "useReorganizationSession.queryFn(success)"
  | "useReorganizationSession.queryFn(404)"
  | "useActiveReorganization.queryFn(success)"
  | "useActiveReorganization.queryFn(404)"
  /** Test fixtures + future call sites that haven't tagged themselves yet. */
  | "unknown";

/**
 * Young-local guard threshold. When the BE returns `null` and the
 * local store has a session that was last set within this window,
 * `reconcileActiveSession` skips the `clear()` and logs
 * `decision: "skip-young-local"` instead.
 *
 * # Why this exists (P3-FE-RECONCILE-RACE, 2026-05-08)
 *
 * The BE's `/reorganizations/mine/active` filters to `status:
 * "pending_review"` only — freshly-created `draft` sessions never
 * appear there. The realtime invalidation fires `useActiveReorganization`
 * to refetch immediately after a stage POST resolves, the BE
 * returns `null` (the new draft isn't `pending_review` yet), and
 * the previous reconciler logic treated that as authoritative and
 * fired `clear()` ~400ms after `setSession(new)` ran locally.
 * This guard inverts that: any local session set within the last
 * 10s is "young" — the BE is allowed to disagree, but we trust
 * the local stamp until the window expires.
 *
 * # Why 10 seconds
 *
 * Two competing pressures:
 *
 *   - **Floor:** A typical staging POST + invalidation + refetch
 *     round-trip is ~400ms in the user's logs. Any threshold
 *     above ~1s defends against the immediate race.
 *   - **Ceiling:** A genuine "BE says session gone" cleanup (e.g.
 *     cancel-from-another-device, TTL expiry, AI-suggestion
 *     auto-expire) MUST eventually land. If the threshold is too
 *     generous, a multi-tab user loses sync visibility.
 *
 * 10 seconds picks a comfortable middle: every staging round-trip
 * the user's logs have shown is well under that, and the maximum
 * pending-reality TTL the BE enforces (`reorganization_sessions
 * .expires_at`) is ~24h — orders of magnitude larger. A user who
 * stages on Device A and cancels on Device B sees Device A
 * eventually clear once the local stamp expires past 10s; the
 * realtime invalidation fires another refetch on every event, so
 * the next refetch after the window lands the cleanup.
 *
 * Do NOT widen this past 30s without strong justification. Too
 * generous papers over real BE-says-gone scenarios.
 */
export const YOUNG_LOCAL_THRESHOLD_MS = 10_000;

/**
 * Decision values the reconciler emits in the
 * `[DEBUG:Reconcile] decision` log line. Exported so tests can
 * pin behavior by decision name without fragile string matching.
 *
 * PR-UX-12 (2026-05-09) added `skip-adopt-snoozed`: when the user
 * has just cancelled a session, the local store is empty AND
 * `adoptSnoozeUntilMs` is in the future, the reconciler skips
 * adopting the next BE session even when a refetch returns one.
 * See `usePendingRealityStore.adoptSnoozeUntilMs`'s JSDoc for the
 * full rationale.
 */
export type ReconcileDecision =
  | "noop"
  | "clear-local"
  | "skip-young-local"
  | "skip-adopt-snoozed"
  | "skip-non-draft"
  | "clear-local-non-draft"
  | "adopt-fetched"
  | "refresh-fetched";

/**
 * Bring the store into agreement with a fresh BE response.
 *
 * Seven decision branches:
 *
 *   1. `noop` — BE has no active session AND the local store is
 *      already empty. Nothing to do.
 *   2. `skip-young-local` — BE says no active session BUT the local
 *      store has a session that was set in the last
 *      `YOUNG_LOCAL_THRESHOLD_MS` ms. The local stamp is trusted
 *      over the BE response (the user just-staged; the BE filter on
 *      `/mine/active` likely hasn't picked the new draft up yet, or
 *      a stale GET that fired before the stage POST is resolving
 *      after). Skip the clear and let the next refetch reconcile.
 *   3. `clear-local` — BE says no active session AND the local
 *      store has an OLD session (older than the young-local
 *      threshold). The local draft is genuinely dead (cancelled/
 *      committed/expired from another device). Evict.
 *   4. `skip-non-draft` — BE returns a session whose `status` is
 *      NOT `draft` (i.e. `pending_review` or `committing`) AND
 *      the local store is empty. The local pending-reality store
 *      is the FE surface for "the FO is currently composing
 *      changes." A non-draft session belongs to the AI tab /
 *      approval surface — re-hydrating it here would silently
 *      undo a finalize the user just performed (PR #105: the
 *      Finalize-A bug). No-op; let the AI tab read the row from
 *      the same TanStack Query cache.
 *   5. `clear-local-non-draft` — BE returns a non-draft session
 *      with the SAME id the local store already has. The session
 *      has just transitioned away from the local-composing
 *      lifecycle (typically because the user tapped Finalize and
 *      `dismissAfter` already called `clear()`, but a refetch
 *      raced and would otherwise re-hydrate it). Defensive
 *      `clear()` to ensure the store does not hold a session
 *      whose status the store cannot legally produce.
 *   6. `adopt-fetched` — BE returns a `draft` session AND the
 *      local store is empty (cold-start) OR has a stale, different
 *      session. `setSession(session, intents)` hydrates / evicts.
 *   7. `refresh-fetched` — BE returns a `draft` session with the
 *      SAME id the local store already has. `setSession(session,
 *      intents)` treats it as a row + intents refresh.
 *
 * The young-local guard is the load-bearing addition from the
 * 2026-05-08 P3-FE-RECONCILE-RACE pass. See `YOUNG_LOCAL_THRESHOLD_MS`'s
 * JSDoc above for the threshold rationale.
 *
 * The non-draft skip / clear branches were added in PR #105 to
 * close the user-visible "Finalize did nothing" bug — the BE's
 * `mineActive` endpoint returns `{draft, pending_review,
 * committing}` survivors (per `STILL_ALIVE_STATUSES` in
 * `reorganizationService.getActiveSessionForAuthor`); only `draft`
 * belongs in the local pending-reality store. See
 * `docs/PLAN-DEVIATIONS.md#2026-05-09-reconcile-skip-non-draft`
 * for the full rationale.
 *
 * # Logging
 *
 * - `[DEBUG:Reconcile] entry` — `__DEV__`-gated. Snapshot of
 *   caller, local stamps, fetched response. The full call stack
 *   was dropped after the 2026-05-08 race investigation closed —
 *   the `decision` log below carries enough info for the next
 *   regression.
 * - `[DEBUG:Reconcile] decision` — UNCONDITIONAL (always emitted,
 *   even in production). Cheap, useful for the next regression,
 *   and the on-device user dump is the primary debugging surface.
 *   Carries `decision`, `caller`, `reason`, and per-branch context
 *   fields.
 */
export function reconcileActiveSession(
  data: ReorganizationApiSession | null,
  store: PendingRealityState,
  caller: ReconcileCaller = "unknown",
): void {
  const fetchedAt = Date.now();
  const localAgeMs =
    store.lastSetAt != null ? fetchedAt - store.lastSetAt : null;

  if (__DEV__) {
    console.log("[DEBUG:Reconcile] entry", {
      caller,
      fetchedAt,
      localSessionId: store.sessionId,
      localIntentCount: store.intents.length,
      localIssueCount: store.linterIssues.length,
      localLastSetAt: store.lastSetAt,
      localAgeMs,
      fetchedNull: data == null,
      fetchedId: data?.id ?? null,
      fetchedStatus: data?.status ?? null,
      fetchedIntentCount: data?.intents?.length ?? null,
    });
  }

  if (data == null) {
    if (store.sessionId == null) {
      console.log("[DEBUG:Reconcile] decision", {
        caller,
        decision: "noop" satisfies ReconcileDecision,
        reason: "BE returned null and local store is already empty",
      });
      return;
    }

    // Young-local guard — the load-bearing 2026-05-08 fix. See
    // `YOUNG_LOCAL_THRESHOLD_MS`'s JSDoc for why 10s and the BE
    // shape that necessitates it (the `/mine/active` endpoint
    // filters to `status: "pending_review"`, so a freshly-created
    // `draft` session is invisible to the GET that fires
    // immediately after the stage POST).
    if (localAgeMs != null && localAgeMs < YOUNG_LOCAL_THRESHOLD_MS) {
      console.log("[DEBUG:Reconcile] decision", {
        caller,
        decision: "skip-young-local" satisfies ReconcileDecision,
        reason:
          "BE returned null but local session is younger than threshold; trusting local",
        localSessionId: store.sessionId,
        localAgeMs,
        thresholdMs: YOUNG_LOCAL_THRESHOLD_MS,
      });
      return;
    }

    // Auto-clear path — sanctioned site (b) per
    // `usePendingRealityStore.clear`'s JSDoc invariant 3. The BE
    // is the source of truth for "is there an active session for
    // this user?" once the local stamp is past the young-local
    // window. The realtime layer's terminal-state events
    // (`session_committed` / `cancelled` / `expired`) flow through
    // here after their query-cache invalidation triggers
    // `useActiveReorganization` to refetch.
    console.log("[DEBUG:Reconcile] decision", {
      caller,
      decision: "clear-local" satisfies ReconcileDecision,
      reason: "BE returned null; local session is older than threshold",
      localSessionIdBeforeClear: store.sessionId,
      localAgeMs,
      thresholdMs: YOUNG_LOCAL_THRESHOLD_MS,
    });
    store.clear();
    return;
  }

  // PLAN-DEVIATION: 2026-05-09-reconcile-skip-non-draft —
  //   reconciler now refuses to adopt non-draft sessions into the
  //   pending-reality store. The original chunk prompt assumed
  //   the BE's `mineActive` filter scoped to draft only; the
  //   shipped BE returns `{draft, pending_review, committing}`.
  // See docs/PLAN-DEVIATIONS.md#2026-05-09-reconcile-skip-non-draft
  // for the user-visible bug, anti-instructions, and BE contract.
  //
  // Non-draft skip / clear — added PR #105 (2026-05-09) to close
  // the Finalize-A "Finalize did nothing" bug.
  //
  // The BE's `getActiveSessionForAuthor` (REMIBackend
  // `src/services/reorganizationService.ts`) returns sessions whose
  // status is in `STILL_ALIVE_STATUSES = {draft, pending_review,
  // committing}`. The local pending-reality store is the FE surface
  // for `draft` only — see `usePendingRealityStore`'s JSDoc and the
  // store's `status` slot, which never legitimately holds anything
  // but `draft` (it's stamped from `setSession` writes that originate
  // in mutation-hook `onSuccess` branches that are themselves only
  // fired with the BE-canonical row IF that row is being composed).
  //
  // Re-hydrating a `pending_review` row would manifest to the user
  // as "I tapped Finalize, the screen flashed, and now the same
  // session is back" — exactly the bug logged in the PR #105 user
  // report. The AI tab / approval surface is the right consumer
  // for `pending_review` rows; both consumers read the same
  // TanStack Query cache so the row is not lost — only this
  // particular subscriber declines to mutate its own store.
  //
  // The young-local guard above does NOT apply here: it only
  // protects the `data == null` branch from racing a fresh local
  // setSession. The non-draft-data case is the BE's authoritative
  // answer for "yes there is a session, but it has moved past the
  // composing phase" — local age is irrelevant.
  if (data.status !== "draft") {
    if (store.sessionId !== data.id) {
      console.log("[DEBUG:Reconcile] decision", {
        caller,
        decision: "skip-non-draft" satisfies ReconcileDecision,
        reason:
          "BE returned non-draft session; local pending-reality store only owns draft sessions",
        fetchedId: data.id,
        fetchedStatus: data.status,
        localSessionId: store.sessionId,
      });
      return;
    }
    // Same id, but the BE has flipped status away from draft. The
    // local copy is now stale. The user's finalize handler typically
    // already fired `clear()` via `dismissAfter`; this branch
    // catches the race where a refetch lands between the finalize
    // 200 and the dismiss callback.
    console.log("[DEBUG:Reconcile] decision", {
      caller,
      decision: "clear-local-non-draft" satisfies ReconcileDecision,
      reason:
        "BE returned same session id as local but status moved past draft; clearing local",
      fetchedId: data.id,
      fetchedStatus: data.status,
    });
    store.clear();
    return;
  }

  // Same id → row+intents refresh; different id (or empty store) →
  // eviction-or-hydrate. The store's `setSession` already discriminates
  // between these two cases internally. The young-local guard does
  // NOT apply on this branch — when the BE returns valid session
  // data, that's authoritative regardless of the local stamp age
  // (the BE has affirmatively answered "yes there's a session,"
  // not the absent-data "session is gone" we guard against above).
  const { intents, ...session } = data;
  const sameId = store.sessionId === data.id;

  // PR-UX-12 (2026-05-09): post-cancel adopt snooze. When the user
  // just cancelled their session, `adoptSnoozeUntilMs` is set to a
  // ~60s-future timestamp by the cancel handler. If a refetch in
  // that window returns a different session id (typical for FOs
  // with ≥2 pending_review proposals waiting), we suppress
  // `adopt-fetched` — the user's intent was "I'm done with these,
  // don't put another one under my cursor." The snooze does NOT
  // suppress `refresh-fetched` (same id → the user must have
  // re-staged); does NOT apply when the local store still owns a
  // session (only the post-cancel empty-store case); auto-clears
  // on `clear()` and on review-screen mount, so the user can
  // explicitly opt back in by tapping the FAB / shortcut. See
  // `PendingRealityState.adoptSnoozeUntilMs` for the full
  // rationale + anti-instructions.
  if (
    !sameId &&
    store.sessionId == null &&
    store.adoptSnoozeUntilMs != null &&
    store.adoptSnoozeUntilMs > Date.now()
  ) {
    console.log("[DEBUG:Reconcile] decision", {
      caller,
      decision: "skip-adopt-snoozed" satisfies ReconcileDecision,
      reason:
        "Post-cancel adopt snooze active; refusing to auto-adopt the next BE session",
      fetchedId: data.id,
      fetchedIntentCount: intents.length,
      adoptSnoozeUntilMs: store.adoptSnoozeUntilMs,
      remainingSnoozeMs: store.adoptSnoozeUntilMs - Date.now(),
    });
    return;
  }

  console.log("[DEBUG:Reconcile] decision", {
    caller,
    decision: (sameId
      ? "refresh-fetched"
      : "adopt-fetched") satisfies ReconcileDecision,
    reason: sameId
      ? "BE returned same session id as local — row+intents refresh"
      : store.sessionId == null
        ? "Local store empty — hydrate from BE"
        : "BE id differs from local id — evict-and-replace",
    localSessionIdBeforeSet: store.sessionId,
    fetchedId: data.id,
    fetchedIntentCount: intents.length,
  });

  store.setSession(session, intents);
}
