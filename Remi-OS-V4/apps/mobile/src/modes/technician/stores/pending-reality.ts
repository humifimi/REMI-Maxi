/**
 * `usePendingRealityStore` (P3-FE-1) — Zustand store for the
 * tech-side reorganization-session composition surface.
 *
 * This store is the single source of truth for the **active**
 * reorganization session, the proposed intents staged against it,
 * and the most recent local logistics-linter output. It does NOT
 * own:
 *   - draft cards in the calendar UI       — `useCalendarStore.pendingDraft`
 *   - committed appointments / world data  — TanStack Query cache
 *   - finalize/commit/discard API plumbing — mutation hooks (P3-FE-2/3)
 *   - review UI display preferences        — P3-FE-5 review screen
 *
 * Master plan §5.3.1 ("usePendingRealityStore"). The shipped surface
 * is intentionally smaller than the §5.3.1 TypeScript snippet — the
 * §5.3.1 actions `beginSession`, `saveDraft`, `discard`, `finalize`,
 * and `applyAutoFix` are mutation-hook responsibilities (they involve
 * API I/O) and land in subsequent Phase-C chunks; this store only
 * owns the post-API local state. See PLAN-DEVIATION below.
 *
 * One active session per device. Calling `setSession` while a
 * different session is already active wipes intents + linter output
 * and logs the eviction — real audit trail lands in the mutation
 * hooks (P3-FE-2/3) which call `setSession` in their `onSuccess`
 * branches.
 *
 * NOT persisted via Zustand `persist` middleware. Pending intents
 * live on the backend after `saveDraft` (mutation-hook responsibility);
 * everything in this store is ephemeral by design (§5.3.1
 * "Persistence" paragraph). On cold start, `useActiveReorganization`
 * (mounted in `app/(tabs)/_layout.tsx` per `P3-FE-REHYDRATE-MOUNT`,
 * `docs/implementation-plans/pending-reality-rehydration-plan.md` §7)
 * hydrates this store from the BE via the shared
 * `reconcileActiveSession` helper; realtime invalidations from
 * `useRealtimeReorganization` keep it in sync, and the mutation
 * hooks (`useCreate` / `useFinalize` / `useCancel` / `useApplyAutoFix`
 * / `useAddIntent` / `useModifyIntent`) write the BE-canonical row
 * into the active-session query cache via `cacheReorganizationResult`
 * so a re-mount reads from cache instead of round-tripping.
 */

// PLAN-DEVIATION: 2026-04-23-pending-reality-trim — the §5.3.1 +
// chunk-prompt store contract included a `heldDraft` /
// `heldDraftSnapshotAt` / `setHeldDraft` / `clearHeldDraft` slice
// (with a 30s TTL timer), and a `linterEdges: LinterDependencyEdge[]`
// field. Both are intentionally OMITTED here:
//   - The held-draft surface was retired by
//     2026-04-21-rotation-sideways-draft in favor of
//     `useCalendarStore.pendingDraft` (drafts now persist
//     indefinitely in store state and rotation has no draft-specific
//     behavior). Re-introducing it would split draft state across
//     two stores and revive the timer race conditions that the
//     persistent-state model fixed.
//   - The remaining "preserve cognitive work across navigation" gap
//     (form-sheet content lost when the sheet closes) is filed as
//     deferred chunk P3-FE-6 — see
//     docs/DEVELOPMENT-LOG.md#deferred-chunk-p3-fe-6 — and will land
//     in its own store (`useSheetDraftStore`), NOT here.
//   - `linterEdges` was renamed to `linterIssues` and retyped
//     `LinterIssue[]` to match the shipped P1-BE-4 linter return
//     type. `LinterDependencyEdge[]` continues to live on
//     `ReorganizationIntent.linter_dependency_edges` for the
//     backend finalize/commit pipeline (see types/reorganization.ts),
//     but the local linter run produces `LinterIssue[]`.
// See docs/PLAN-DEVIATIONS.md#2026-04-23-pending-reality-trim for
// the full rationale and anti-instructions.

import { create } from "zustand";

import type {
  ReorganizationIntent,
  ReorganizationIntentPayload,
  ReorganizationSession,
  ReorganizationSessionStatus,
} from "@technician/types/reorganization";
import {
  type LinterIssue,
  type LinterWorldSnapshot,
  lintSession,
} from "@technician/utils/logistics-linter";
import { traceCalendar } from "@technician/utils/sentry-diagnostics";

/**
 * Patch shape for `modifyIntent`. Restricted to the fields the
 * tech-side review UI is allowed to mutate locally. `id`,
 * `session_id`, and `proposed_at` are server-assigned; mutating
 * them would put the local cache out of sync with the backend.
 */
export interface ReorganizationIntentPatch {
  payload?: ReorganizationIntentPayload;
  intent_status?: ReorganizationIntent["intent_status"];
  inverse_payload?: ReorganizationIntent["inverse_payload"];
}

export interface PendingRealityState {
  /**
   * Full active-session row. Kept in state so the local linter call
   * (which takes a `ReorganizationSession`) doesn't have to
   * reconstruct one from `sessionId` + `status`. Null when no
   * session is active.
   */
  session: ReorganizationSession | null;

  /**
   * Denormalized session id. Selectors that only care "is there a
   * session?" / "which session?" subscribe to this so a full-session
   * row update (e.g. policy snapshot refresh) doesn't re-render
   * them.
   */
  sessionId: number | null;

  /**
   * Denormalized session status. Same selector-stability rationale
   * as `sessionId`. Mirrors `session?.status`.
   */
  status: ReorganizationSessionStatus | null;

  /**
   * `Date.now()` timestamp of the most recent `setSession` call
   * (whether new-id or same-id refresh). `null` until the first
   * `setSession` lands; reset to `null` by `clear()`.
   *
   * Diagnostic field — added 2026-05-08 to investigate the
   * "reconcile wipes a freshly-staged session" race. Always-on so
   * the timestamp survives bundle minification and is readable
   * from device logs without a dev build. Production cost is one
   * extra integer field on a store that's already in memory; no
   * subscriber should read this directly (it changes on every
   * `setSession`, so subscribing would re-render every consumer
   * on every store touch).
   *
   * Read pattern: `usePendingRealityStore.getState().lastSetAt` —
   * imperative, never via selector. The reconcile-entry log line
   * is the canonical reader.
   */
  lastSetAt: number | null;

  /**
   * Cancel-side adopt snooze (PR-UX-12, 2026-05-09). When the user
   * taps "Cancel session" the local store clears AND the active-
   * session cache is written to `null` — but the BE has 8 other
   * `pending_review` sessions queued (mostly AI-suggestion or
   * tech-authored proposals the FO never explicitly opted into).
   * Without this snooze, the realtime `session_cancelled` event
   * triggers an immediate `useActiveReorganization` refetch, the
   * BE returns the NEXT pending_review session, and
   * `reconcileActiveSession` adopts it via `adopt-fetched`. The
   * user reported "had to do it twice" + "still see staged cards
   * on the calendar" — every cancel is immediately undone by an
   * auto-adoption.
   *
   * `adoptSnoozeUntilMs` is a `Date.now()` timestamp until which
   * `reconcileActiveSession`'s `adopt-fetched` branch is
   * suppressed (decision becomes `skip-adopt-snoozed`). Set by
   * the cancel handler to `Date.now() + ADOPT_SNOOZE_DURATION_MS`
   * (60s) after a successful cancel; cleared (a) when the timer
   * expires, (b) when the user explicitly navigates back to the
   * Pending Reality review screen via the FAB / shortcut (the
   * screen calls `clearAdoptSnooze()` on mount), or (c) on
   * `clear()` with no snooze override.
   *
   * `null` means no active snooze. `0` is a valid past timestamp
   * (treated as expired) but the store always normalizes to
   * `null` on expiry to avoid the next reconcile re-checking a
   * dead value.
   */
  adoptSnoozeUntilMs: number | null;

  /**
   * Pending intents staged against the active session, in the order
   * they were added. Sequence matters for the §3.10 commit-order
   * derivation that runs server-side at finalize.
   */
  intents: ReorganizationIntent[];

  /**
   * Result of the most recent local `runLocalLinter` call. Empty
   * array when no run has happened yet, or when `runLocalLinter`
   * was called with no active session. The shipped P1-BE-4 linter
   * returns `LinterIssue[]`, not `LinterDependencyEdge[]` — see
   * the PLAN-DEVIATION note at the top of this file.
   */
  linterIssues: LinterIssue[];

  /**
   * Active move-chain selection from the chip-row selector
   * (PR-UX-1 / move-chain selector PASS 1). Three states:
   *
   *   - `null` → "Show all" baseline. Every appointment renders plain
   *     (no dim, no chain-color border). The Show all pill is filled.
   *   - `"all"` → "All chains" overview. Every chain appointment
   *     renders in its own chain color; non-chain appointments dim.
   *     This state is reachable via the last chip's 2-state toggle
   *     (see `MoveChainChipRow`).
   *   - `chainId` → "Isolate" that one chain. That chain's tiles
   *     render in its color; everything else dims.
   *
   * Owned here rather than in a sibling store because it's
   * conceptually a slice of the active session's review state — the
   * chip row appears only when intents exist, and the selection
   * resets whenever the intents the chains are derived from change
   * (new session, session cleared, intent removed).
   */
  selectedChainId: string | null;

  /**
   * PLAN-DEVIATION: 2026-05-09-pr-ux-16-followups —
   * `auxHighlightedChainIds` is an EPHEMERAL set of chain ids that
   * should render their highlights / ghosts / arrows IN ADDITION
   * to whichever chain `selectedChainId` already isolates. Used by
   * the chain-to-chain conflict toast (PR-UX-16 issues #4 + #5):
   * when two pending chain destinations land in the same calendar
   * slot, we want BOTH chains visible simultaneously so the user
   * sees the conflict, even though the chip row's `selectedChainId`
   * model only supports a single isolated chain at a time.
   *
   * Semantically: every id in this set is treated like a same-tier
   * "selected" chain by the overlay-style helper and the
   * visible-destination-slot resolver. Order does not matter (and
   * is not preserved). When non-empty alongside `selectedChainId`,
   * the union of `{selectedChainId} ∪ auxHighlightedChainIds` is
   * what renders. Cleared the moment the toast dismisses.
   *
   * Stays empty in normal use; ALL_CHAINS_SENTINEL behavior is
   * unaffected because it short-circuits these branches.
   *
   * See docs/PLAN-DEVIATIONS.md#2026-05-09-pr-ux-16-followups.
   */
  auxHighlightedChainIds: string[];

  /**
   * Step-ordinal "spotlight" set inside the currently-isolated chain
   * (PR-UX-2 PASS 2.11, 2026-05-05 — task `c8`).
   *
   * The chip row's per-step dots are independently tappable with a
   * cycling rule the user re-stated this pass:
   *
   *   - All dots start dimmed (`[]`) on chain selection.
   *   - Tap dot `i` (where `i < lastIndex`) → set to `[i, i+1]`.
   *     Calendar shows ONLY that pair: source card outlines, ghost
   *     destinations, arrows, and pulses for steps `i` and `i+1`.
   *   - Tap the LAST dot → toggle between `[0..N-1]` (all lit, the
   *     prior "isolate chain" behavior) and `[]` (all dim).
   *   - Double-tap any non-first / non-last dot `i` → `[0..i]`
   *     (prefix highlight).
   *
   * Only meaningful when `selectedChainId` is a real chain id (not
   * null and not `"all"` — neither baseline nor "all chains" mode
   * has a single chain to spotlight). Resets to `[]` whenever the
   * selection switches chains or the active session changes, so the
   * cycle always starts fresh.
   *
   * Stored as a sorted unique array (rather than `Set<number>`) so
   * Zustand selector equality is plain reference comparison and
   * memoized consumers don't re-render when the array is rebuilt
   * with the same contents.
   */
  chainStepHighlights: number[];

  /**
   * Replace the active session.
   *
   * If a different session is already active, its intents and
   * linter output are wiped and an eviction is logged. The
   * eviction log is intentionally `console.log` for now — real
   * audit-trail emission lands in the mutation hooks (P3-FE-2/3)
   * which call `setSession` from their `onSuccess` branches.
   *
   * Calling `setSession` with the same `id` as the currently
   * active session is treated as a row refresh: intents and
   * linter output are PRESERVED by default, and the (possibly
   * mutated) session row replaces the old one in place.
   *
   * Pass an optional second `intents` argument to ALSO replace
   * the intents array atomically — useful when the BE returns
   * the full `(session, intents)` tuple after a server-side
   * mutation (e.g. `useApplyAutoFix` in P3-FE-9, where the BE's
   * `PATCH /reorganizations/:id` response carries the mutated
   * intent row inline). When `intents` is provided, the linter
   * output is cleared so the next `runLocalLinter` call writes a
   * fresh result against the new intent set.
   */
  setSession: (
    session: ReorganizationSession,
    intents?: ReorganizationIntent[],
  ) => void;

  /**
   * Append an intent to the pending list. No-op (with a
   * `console.log`) if no session is active — the mutation hook
   * that creates the intent server-side is responsible for
   * calling `setSession` first.
   */
  addIntent: (intent: ReorganizationIntent) => void;

  /**
   * Remove the intent with the given id. No-op if the id isn't
   * present.
   */
  removeIntent: (intentId: number) => void;

  /**
   * Patch an intent in place. No-op if the id isn't present.
   * `id`, `session_id`, and `proposed_at` are not patchable —
   * see `ReorganizationIntentPatch`.
   */
  modifyIntent: (intentId: number, patch: ReorganizationIntentPatch) => void;

  /**
   * Run the shared P1-BE-4 logistics linter against the current
   * `(session, intents)` pair and the caller-supplied world
   * snapshot. The store does not own world data (committed
   * appointments / route plans / fleet state / customer SLAs)
   * because that lives in the TanStack Query cache; making the
   * caller assemble the snapshot keeps this store free of
   * cache-coupling.
   *
   * Writes the returned `LinterIssue[]` into `linterIssues` and
   * also returns it for caller convenience (e.g. an assertion in
   * a mutation hook that fired the run). Returns `[]` and clears
   * `linterIssues` when no session is active.
   */
  runLocalLinter: (worldSnapshot: LinterWorldSnapshot) => LinterIssue[];

  /**
   * Wipe everything — session, intents, linter output. Intended for
   * use by user-initiated handlers (cancel/commit/discard buttons)
   * once the backend has confirmed the session is no longer the
   * device's active one, and for the cold-start rehydration path
   * that brings the local store into agreement with a BE GET that
   * returns no active session.
   *
   * Three load-bearing invariants — established across the
   * 2026-05-08 regression chain (PR #98 → #99 → #100 → this pass).
   * Each was forced by the user reporting the SAME auto-cancel-
   * after-stage symptom from a different code path; each prior
   * pass added a check that the next pass had to relax once a new
   * BE event shape (or call site) made the check structurally
   * insufficient.
   *
   *   1. **PURE LOCAL.** This action MUST never trigger a backend
   *      call. Any server-side cancel / discard / commit must be an
   *      explicit, separate call from a user-initiated handler.
   *      (Established by PR #99.)
   *
   *   2. **REALTIME MUST NOT MUTATE THE STORE.** No path inside
   *      `src/hooks/realtime/*` (and no future websocket / SSE /
   *      push-notification handler) may call `clear()`,
   *      `setSession`, `addIntent`, or any other store action. The
   *      realtime layer's contract is "invalidate the right
   *      TanStack query key and stop." `reconcileActiveSession`
   *      runs inside the refetch and decides whether the local
   *      store should be mutated based on the BE-canonical answer.
   *      (Established by this pass — see the "Why the guard-based
   *      approach was insufficient" note in the PLAN-DEVIATIONS
   *      entry. The BE legitimately broadcasts `session_created`
   *      for the user's own just-staged session, and a sessionId-
   *      match guard cannot distinguish the user's own events from
   *      a real terminal echo.)
   *
   *   3. **SANCTIONED AUTO-CLEAR SITES (the only ones).** Every
   *      caller that automates `clear()` MUST be one of:
   *
   *        a. **A user-initiated handler.** The user explicitly
   *           tapped Cancel / Commit / Discard / Dismiss in a way
   *           that implies "I am done with this local session." The
   *           handler captures `sessionId` at firing time so a
   *           rapid-fire double-tap can't wipe a session the user
   *           subsequently re-staged. Sites today:
   *           - `app/pending-reality/review.tsx#handleCancelSession`
   *             — per-call `cancelMutation.mutate(..., { onSuccess })`
   *             with the `liveStore.sessionId === cancelledSessionId`
   *             gate.
   *           - `app/pending-reality/review.tsx`'s no-session
   *             defensive cancel branch (cancel before any BE
   *             session exists) and the finalize success
   *             `dismissAfter` callback (committed/pending_review
   *             both terminate the local session).
   *
   *        b. **`reconcileActiveSession`** (the cold-start /
   *           refetch reconciler). When the BE-canonical answer is
   *           `null` and the local store has any session,
   *           `reconcileActiveSession` clears. This is the
   *           authoritative "the BE says no active session for
   *           this user" path. It cannot gate by captured event
   *           id (the absence-of-session signal isn't an event for
   *           a specific id), so the safety property comes from
   *           the BE answer being authoritative.
   *
   *        c. **The auth `logout()` action** (sign-out cleanup).
   *           Wipes every store wholesale on user-initiated
   *           sign-out. Different invariant, different scope —
   *           the user is leaving the app entirely.
   *
   *      Any new auto-clear site MUST add itself to this list AND
   *      carry a comment near the `clear()` call referencing this
   *      JSDoc. New realtime / push-notification call sites MUST
   *      use TanStack Query invalidation + reconcile, not direct
   *      store mutation.
   *
   * See docs/PLAN-DEVIATIONS.md#2026-05-08-cancel-hook-no-auto-coord
   * for the full regression chain (cancel-hook arm in PR #99,
   * realtime-guard arm in PR #100, this realtime-no-store-mutation
   * pass that retired the guard).
   */
  clear: () => void;

  /**
   * Set the adopt-snooze deadline (PR-UX-12). After a successful
   * cancel, callers pass `Date.now() + ADOPT_SNOOZE_DURATION_MS`
   * to block `reconcileActiveSession`'s `adopt-fetched` branch
   * for the snooze window. Pass `null` (or a past timestamp) to
   * clear the snooze immediately — the snooze auto-clears on
   * `clear()` already; this method exists for the explicit
   * "user opened the review screen, allow next refetch to
   * adopt" path.
   *
   * Setting a value already in the past is treated as `null` —
   * the reconciler never has to consider stale snoozes.
   */
  setAdoptSnoozeUntil: (untilMs: number | null) => void;

  /**
   * Convenience: clear the snooze unconditionally. Equivalent to
   * `setAdoptSnoozeUntil(null)`. Called by the review screen on
   * mount so the user explicitly navigating back un-suppresses
   * auto-adopt for the next refetch.
   */
  clearAdoptSnooze: () => void;

  /**
   * Set the active move-chain id, or pass `null` to return to the
   * "Show all" reference view. Idempotent — setting the same id is
   * a no-op so chip-row consumers can call this on every render
   * without thrashing subscribers.
   *
   * Side effect on `chainStepHighlights`:
   *   - To `null` / `ALL_CHAINS_SENTINEL` → cleared to `[]`
   *     ("show all" baseline and the all-chains overview don't
   *     have a single chain to scope a spotlight against).
   *   - To a real chain id → `chainStepHighlights` is seeded to
   *     the FULL prefix `[0..totalSteps-1]` when the caller
   *     supplies `totalSteps`, otherwise cleared to `[]`.
   *
   * The "seed to full prefix" default landed in PR-UX-2 PASS 2.12
   * (2026-05-05) to fix the user-visible "I tap Chain 1 and
   * nothing happens" bug. The prior default of `[]` was correct
   * per the cycle spec ("all dots start dimmed") but produced a
   * dead-end first-impression: the user had to discover the dot-
   * tap interaction before the chain visualization showed
   * anything at all. Defaulting to the full prefix means the
   * isolate-on-tap action surfaces the entire chain immediately
   * and the dot cycle becomes a NARROWING tool (full → single →
   * prefix → cleared) rather than a REVEAL-FROM-NOTHING one.
   * Callers that want the old all-dim entry point can pass
   * `totalSteps: 0` (treated like an unknown count → cleared).
   */
  setSelectedChainId: (id: string | null, totalSteps?: number) => void;

  /**
   * Replace the per-step spotlight set for the currently-isolated
   * chain. The chip-row tap handler is the only legitimate caller —
   * it computes the next set from the cycling rule documented on
   * `chainStepHighlights` above. Pass `[]` to dim everything.
   *
   * Idempotent (same-content set wins zero-renders by reference
   * equality). Always normalizes the input by sorting + deduping so
   * downstream `Set`-construction from the array is order-stable.
   */
  setChainStepHighlights: (next: readonly number[]) => void;

  /**
   * PLAN-DEVIATION: 2026-05-09-pr-ux-16-followups — replace the
   * `auxHighlightedChainIds` set. Pass `[]` to clear. The chain-
   * to-chain conflict toast (`useChainToChainConflictToast` /
   * `ChainToChainConflictToast`) is the only sanctioned caller;
   * it sets the pair of conflicting chain ids on toast show and
   * `[]` on toast dismiss. Idempotent on equal content (sorted +
   * deduped).
   */
  setAuxHighlightedChainIds: (next: readonly string[]) => void;
}

const INITIAL_STATE: Pick<
  PendingRealityState,
  | "session"
  | "sessionId"
  | "status"
  | "intents"
  | "linterIssues"
  | "selectedChainId"
  | "chainStepHighlights"
  | "auxHighlightedChainIds"
  | "lastSetAt"
  | "adoptSnoozeUntilMs"
> = {
  session: null,
  sessionId: null,
  status: null,
  intents: [],
  linterIssues: [],
  selectedChainId: null,
  chainStepHighlights: [],
  auxHighlightedChainIds: [],
  lastSetAt: null,
  adoptSnoozeUntilMs: null,
};

/**
 * Default adopt-snooze duration (PR-UX-12, 2026-05-09). Cancel
 * handlers pass `Date.now() + ADOPT_SNOOZE_DURATION_MS` to
 * `setAdoptSnoozeUntil` after a successful BE cancel. 60 seconds
 * gives the user time to do other work without seeing a fresh
 * `pending_review` session auto-adopt under their cursor; long
 * enough that rapid-fire cancels (each refreshes the snooze)
 * still result in a quiet calendar after the last cancel; short
 * enough that genuinely-new sessions arriving via realtime in a
 * different session aren't held back forever. Exported for the
 * cancel handler + tests to use the same value.
 */
export const ADOPT_SNOOZE_DURATION_MS = 60_000;

function normalizeStepHighlights(input: readonly number[]): number[] {
  if (input.length === 0) return [];
  const seen = new Set<number>();
  for (const n of input) {
    if (Number.isInteger(n) && n >= 0) seen.add(n);
  }
  return Array.from(seen).sort((a, b) => a - b);
}

function arraysEqualSorted(a: readonly number[], b: readonly number[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export const usePendingRealityStore = create<PendingRealityState>((set, get) => ({
  ...INITIAL_STATE,

  setSession: (next, intents) => {
    const previous = get().session;
    traceCalendar("store.setSession", {
      nextSessionId: next.id,
      nextStatus: next.status,
      previousSessionId: previous?.id ?? null,
      isRefresh: previous?.id === next.id,
      intentCountBefore: get().intents.length,
      intentCountIncoming: intents?.length ?? null,
      selectedChainIdBefore: get().selectedChainId,
    });

    // Same session id → treat as a row refresh. Intents and linter
    // output are PRESERVED unless the caller explicitly passes a
    // replacement `intents` array (e.g. mutation hooks like
    // `useApplyAutoFix` that receive the full `(session, intents)`
    // tuple back from PATCH /reorganizations/:id).
    if (previous && previous.id === next.id) {
      if (intents !== undefined) {
        // PLAN-DEVIATION: 2026-05-10-preserve-selection-on-refresh —
        // Pre-sticky-chain (before 00eca0a / sticky-chain-identity-fe)
        // every BE refresh got a freshly synthesized
        // `chain-{seedIntentId}` id, so the previously-selected id
        // was almost guaranteed to dangle after a refresh. We
        // wiped `selectedChainId` here defensively, which was
        // correct given that fragility.
        //
        // After 00eca0a the BE assigns a stable `chain_id` and the
        // chain graph reads it directly (see useMoveChainGraph).
        // The chain id NOW survives intent-list refreshes; wiping
        // it caused the user-visible "arrow flashes and
        // disappears" regression — AutoIsolate set the selection
        // to the BE UUID, the BE refresh echoed back with the
        // same intent (same chain_id), and we clobbered it.
        //
        // New behavior: preserve `selectedChainId` (and the
        // current `chainStepHighlights` set) IFF the selection is
        // still derivable from the new intent list. Two
        // preservation paths:
        //   1. ALL_CHAINS_SENTINEL ("all") — overview mode,
        //      independent of specific intent ids. Always
        //      preserved.
        //   2. BE chain_id — preserved when any intent in the new
        //      list carries the same `chain_id`. The sticky id
        //      guarantees the chain still exists.
        //
        // Legacy synthesized fallback (`chain-{seedIntentId}`) is
        // NOT preserved — recomputing seed-intent ids from a flat
        // array would couple this store to the chain detector,
        // and modern flows ship a real BE `chain_id`.
        //
        // See docs/PLAN-DEVIATIONS.md#2026-05-10-preserve-selection-on-refresh.
        const prevSelection = get().selectedChainId;
        const prevHighlights = get().chainStepHighlights;
        const newChainIds = new Set<string>();
        for (const i of intents) {
          if (i.chain_id) newChainIds.add(i.chain_id);
        }
        const keepSelection =
          prevSelection === "all" ||
          (prevSelection != null && newChainIds.has(prevSelection));

        if (__DEV__) {
          console.log("[DEBUG:Store/PendingReality] setSession(refresh+intents)", {
            sessionId: next.id,
            status: next.status,
            intentCount: intents.length,
            prevSelection,
            selectionDecision: keepSelection ? "preserved" : "cleared",
          });
        }
        set({
          session: next,
          sessionId: next.id,
          status: next.status,
          intents,
          // Stale relative to the new intent set; the caller (or the
          // FAB recompute on next render) is expected to fire
          // `runLocalLinter` to refresh.
          linterIssues: [],
          selectedChainId: keepSelection ? prevSelection : null,
          chainStepHighlights: keepSelection ? prevHighlights : [],
          lastSetAt: Date.now(),
        });
        return;
      }
      if (__DEV__) {
        console.log("[DEBUG:Store/PendingReality] setSession(refresh)", {
          sessionId: next.id,
          status: next.status,
        });
      }
      set({
        session: next,
        sessionId: next.id,
        status: next.status,
        lastSetAt: Date.now(),
      });
      return;
    }

    if (previous) {
      console.log("[pending-reality] evicting active session", {
        previousSessionId: previous.id,
        previousStatus: previous.status,
        previousIntentCount: get().intents.length,
        nextSessionId: next.id,
      });
    }

    if (__DEV__) {
      console.log("[DEBUG:Store/PendingReality] setSession(new)", {
        sessionId: next.id,
        status: next.status,
        seedIntentCount: intents?.length ?? 0,
      });
    }

    set({
      session: next,
      sessionId: next.id,
      status: next.status,
      intents: intents ?? [],
      linterIssues: [],
      // New session → previously selected chain id no longer
      // references a real chain in the new graph.
      selectedChainId: null,
      chainStepHighlights: [],
      lastSetAt: Date.now(),
    });
  },

  addIntent: (intent) => {
    if (!get().session) {
      console.log("[pending-reality] addIntent ignored — no active session", {
        intentId: intent.id,
      });
      traceCalendar(
        "store.addIntent IGNORED — no active session",
        { intentId: intent.id, intentType: intent.intent_type },
        "warning",
      );
      return;
    }
    traceCalendar("store.addIntent", {
      intentId: intent.id,
      intentType: intent.intent_type,
      appointmentId: intent.appointment_id,
      personalEventId: intent.personal_event_id,
      chainId: intent.chain_id ?? null,
      sessionId: get().session?.id ?? null,
      intentCountBefore: get().intents.length,
      intentCountAfter: get().intents.length + 1,
    });
    if (__DEV__) {
      console.log("[DEBUG:Store/PendingReality] addIntent", {
        intentId: intent.id,
        intentType: intent.intent_type,
        appointmentId: intent.appointment_id,
        personalEventId: intent.personal_event_id,
        nextIntentCount: get().intents.length + 1,
      });
    }
    set((state) => ({ intents: [...state.intents, intent] }));
  },

  removeIntent: (intentId) => {
    set((state) => {
      const next = state.intents.filter((i) => i.id !== intentId);
      if (next.length === state.intents.length) {
        traceCalendar(
          "store.removeIntent NO-OP",
          { intentId, intentCount: state.intents.length },
          "warning",
        );
        if (__DEV__) {
          console.log("[DEBUG:Store/PendingReality] removeIntent (no-op)", {
            intentId,
            intentCount: state.intents.length,
          });
        }
        return state;
      }
      // PLAN-DEVIATION: 2026-05-12-preserve-selection-on-removeintent —
      // pre-sticky-chain-id (before 00eca0a) chain ids were
      // `chain-{seedIntentId}`, so any intent removal could dangle
      // the active selection. We cleared `selectedChainId` and
      // `chainStepHighlights` defensively. That blanket clear is
      // wrong after sticky chain ids landed:
      //
      //   1. The BE assigns a stable `chain_id` per intent now, so
      //      the selection survives as long as ANY remaining
      //      intent still carries the same chain_id.
      //   2. De-escalation on apply-anyway / scope-clean
      //      live-commit (see PLAN-DEVIATIONS
      //      2026-05-12-live-commit-deescalates-symmetric and
      //      2026-05-12-scope-clean-always-live-commit) calls
      //      `removeIntent` while the user is still actively
      //      working inside an isolated chain. The blanket clear
      //      dropped them back to "Show all" mid-cascade-review,
      //      losing the chain context they were curating.
      //
      // Same preservation logic as `setSession(refresh+intents)`
      // — see PLAN-DEVIATION 2026-05-10-preserve-selection-on-refresh.
      // Two preservation paths:
      //   1. ALL_CHAINS_SENTINEL ("all") — overview, independent
      //      of specific chain ids. Always preserved.
      //   2. BE chain_id — preserved when any remaining intent
      //      carries the same `chain_id`.
      // Anything else (legacy synthesized `chain-{seedIntentId}`
      // fallback, or a chain that genuinely emptied out) falls
      // back to the original "clear selection + highlights"
      // behavior.
      //
      // See docs/PLAN-DEVIATIONS.md#2026-05-12-preserve-selection-on-removeintent.
      const prevSelection = state.selectedChainId;
      const surviving = new Set<string>();
      for (const i of next) {
        if (i.chain_id) surviving.add(i.chain_id);
      }
      const keepSelection =
        prevSelection === "all" ||
        (prevSelection != null && surviving.has(prevSelection));
      traceCalendar("store.removeIntent", {
        intentId,
        intentCountBefore: state.intents.length,
        intentCountAfter: next.length,
        prevSelection,
        selectionDecision: keepSelection ? "preserved" : "cleared",
      });
      if (__DEV__) {
        console.log("[DEBUG:Store/PendingReality] removeIntent", {
          intentId,
          remainingIntentCount: next.length,
          prevSelection,
          selectionDecision: keepSelection ? "preserved" : "cleared",
        });
      }
      return {
        ...state,
        intents: next,
        selectedChainId: keepSelection ? prevSelection : null,
        chainStepHighlights: keepSelection ? state.chainStepHighlights : [],
      };
    });
  },

  modifyIntent: (intentId, patch) => {
    set((state) => {
      let touched = false;
      const next = state.intents.map((i) => {
        if (i.id !== intentId) return i;
        touched = true;
        return { ...i, ...patch };
      });
      if (!touched) {
        if (__DEV__) {
          console.log("[DEBUG:Store/PendingReality] modifyIntent (no-op)", {
            intentId,
            patchKeys: Object.keys(patch),
          });
        }
        return state;
      }
      if (__DEV__) {
        console.log("[DEBUG:Store/PendingReality] modifyIntent", {
          intentId,
          patchKeys: Object.keys(patch),
        });
      }
      return { ...state, intents: next };
    });
  },

  runLocalLinter: (worldSnapshot) => {
    const session = get().session;
    if (!session) {
      if (__DEV__) {
        console.log(
          "[DEBUG:Store/PendingReality] runLocalLinter (no session — clearing)",
        );
      }
      if (get().linterIssues.length > 0) set({ linterIssues: [] });
      return [];
    }
    const issues = lintSession(session, get().intents, worldSnapshot);
    if (__DEV__) {
      const errors = issues.filter((i) => i.severity === "error").length;
      const warnings = issues.length - errors;
      console.log("[DEBUG:Store/PendingReality] runLocalLinter", {
        sessionId: session.id,
        intentCount: get().intents.length,
        worldAppointmentCount: worldSnapshot.appointments.length,
        worldRouteCount: worldSnapshot.routes.length,
        worldFleetAccountCount: worldSnapshot.fleet.accounts.length,
        issueCount: issues.length,
        errors,
        warnings,
      });
    }
    set({ linterIssues: issues });
    return issues;
  },

  clear: () => {
    if (__DEV__) {
      const prev = get();
      // Stack trace makes the next "who called clear()?" regression
      // (cf. PR #98 / 2026-05-08) immediately diagnosable on-device.
      // Cheap in dev (single sync call.stack read), gated on __DEV__
      // so production bundles never pay it.
      console.log("[DEBUG:Store/PendingReality] clear", {
        hadSession: prev.session != null,
        priorSessionId: prev.sessionId,
        priorIntentCount: prev.intents.length,
        priorIssueCount: prev.linterIssues.length,
        priorAdoptSnoozeUntilMs: prev.adoptSnoozeUntilMs,
        stack: new Error("clear() call site").stack,
      });
    }
    // PR-UX-12 (2026-05-09): `clear()` resets the adopt-snooze too.
    // The cancel handler is the only legitimate snooze setter, and
    // it calls `clear()` then `setAdoptSnoozeUntil` AFTER (so the
    // setter wins). Any other clear path (logout, reconcile
    // clear-local) implicitly drops a stale snooze too — the
    // simplest, least-surprising semantics.
    set({ ...INITIAL_STATE });
  },

  setAdoptSnoozeUntil: (untilMs) => {
    // Past or null timestamps normalize to null so the reconciler
    // never has to consider stale snoozes.
    const normalized =
      untilMs == null || untilMs <= Date.now() ? null : untilMs;
    if (__DEV__) {
      console.log("[DEBUG:Store/PendingReality] setAdoptSnoozeUntil", {
        requested: untilMs,
        stored: normalized,
        deltaMs: normalized != null ? normalized - Date.now() : null,
      });
    }
    set({ adoptSnoozeUntilMs: normalized });
  },

  clearAdoptSnooze: () => {
    if (get().adoptSnoozeUntilMs == null) return;
    if (__DEV__) {
      console.log("[DEBUG:Store/PendingReality] clearAdoptSnooze");
    }
    set({ adoptSnoozeUntilMs: null });
  },

  setSelectedChainId: (id, totalSteps) => {
    const prev = get().selectedChainId;
    if (prev === id) return;
    traceCalendar("store.setSelectedChainId", {
      from: prev,
      to: id,
      totalSteps: totalSteps ?? null,
      intentCount: get().intents.length,
      sessionId: get().session?.id ?? null,
    });
    // PR-UX-2 PASS 2.11 (task `c8`): every chain swap restarts the
    // per-step spotlight cycle. The PASS 2.11 default was `[]`
    // ("all dots start dimmed" per the cycle spec). PR-UX-2 PASS
    // 2.12 (2026-05-05) switched the default to the FULL prefix
    // `[0..totalSteps-1]` when the caller knows the chain length,
    // because the original "select chain → see nothing" UX was
    // unintuitive: users tap the chip expecting the chain to
    // appear, and the all-dim baseline made the visualization
    // dead-on-arrival until they discovered the dot-tap cycle.
    // The old behavior is preserved when `totalSteps` is omitted
    // or `<= 0` (e.g. ALL_CHAINS_SENTINEL, or null clears).
    const seedHighlights =
      typeof totalSteps === "number" && totalSteps > 0 && id != null && id !== "all"
        ? Array.from({ length: totalSteps }, (_, i) => i)
        : [];
    if (__DEV__) {
      console.log("[DEBUG:Store/PendingReality] setSelectedChainId", {
        id,
        totalSteps,
        seedHighlights,
      });
    }
    set({ selectedChainId: id, chainStepHighlights: seedHighlights });
  },

  setChainStepHighlights: (next) => {
    const normalized = normalizeStepHighlights(next);
    if (arraysEqualSorted(normalized, get().chainStepHighlights)) return;
    if (__DEV__) {
      console.log("[DEBUG:Store/PendingReality] setChainStepHighlights", {
        next: normalized,
        selectedChainId: get().selectedChainId,
      });
    }
    set({ chainStepHighlights: normalized });
  },

  // PLAN-DEVIATION: 2026-05-09-pr-ux-16-followups —
  // see `auxHighlightedChainIds` doc-block above for context.
  setAuxHighlightedChainIds: (next) => {
    const normalized = normalizeChainIds(next);
    if (arraysEqualStrSorted(normalized, get().auxHighlightedChainIds)) return;
    if (__DEV__) {
      console.log("[DEBUG:Store/PendingReality] setAuxHighlightedChainIds", {
        next: normalized,
        selectedChainId: get().selectedChainId,
      });
    }
    set({ auxHighlightedChainIds: normalized });
  },
}));

function normalizeChainIds(input: readonly string[]): string[] {
  if (input.length === 0) return [];
  const seen = new Set<string>();
  for (const s of input) {
    if (typeof s === "string" && s.length > 0) seen.add(s);
  }
  return Array.from(seen).sort();
}

function arraysEqualStrSorted(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Test helper — restores the store to its initial state. Lives in
 * the same module (rather than a separate test-utils file) so test
 * files can import it without pulling in Jest setup that production
 * code shouldn't see.
 *
 * NOT exported from any package barrel — the only legitimate caller
 * is a `beforeEach` in `__tests__/`.
 */
export function __resetPendingRealityStoreForTests(): void {
  // Merge-set (no `true` flag) so the action methods on the store
  // survive — only the data slice is reset.
  usePendingRealityStore.setState({ ...INITIAL_STATE });
}
