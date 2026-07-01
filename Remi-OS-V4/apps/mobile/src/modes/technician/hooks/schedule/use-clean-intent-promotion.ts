/**
 * `useCleanIntentPromotion` (PR-UX-20) — selects the next intent the
 * `CleanIntentPromotionToast` should auto-promote.
 *
 * "Clean" means an intent that satisfies ALL of:
 *   1. It's part of a 1-link move chain (`chain.intentIds.length === 1`)
 *      — i.e. nothing else cascades from it. (Pure topology — the
 *      chain detector still runs locally because chain SHAPE isn't a
 *      lint question; the BE doesn't ship a "chain length" field.)
 *   2. The BE-attached `intent.clean === true`. This single check
 *      replaces what used to be TWO local computations: scanning
 *      `usePendingRealityStore.linterIssues` for issues affecting
 *      the intent's appointment_id, AND running
 *      `detectChainToChainDestinationConflicts(intents, appointments)`
 *      to find cross-chain destination overlap. The BE's
 *      `serializeIntent` (REMIBackend
 *      `routes/v1/_helpers/reorganization.ts`) joins both signals
 *      into one boolean per intent (B-CR-1-1, 2026-05-10), so the
 *      FE drops the local re-derivation. PLAN-DEVIATION:
 *      2026-05-11-intent-clean-fe-only — see
 *      docs/PLAN-DEVIATIONS.md.
 *
 *      Defensive note: `intent.clean === undefined` (signals a
 *      pre-B-CR-1-1 BE that slipped through realtime) is treated as
 *      NOT clean — better to under-promote than mis-promote a
 *      conflicting intent. A `__DEV__` warning fires once per render
 *      with undefined intents to surface the drift.
 *
 *      Asymmetry note: mutation responses (POST /create, PATCH
 *      /update, POST /commit-many, etc.) use `serializeSession`
 *      which passes an empty issues array, so every intent comes
 *      back `clean: true` regardless of the real lint state. The
 *      realtime hook's prefix invalidation refetches the GET
 *      within a few ms and corrects the value — the brief window
 *      may show a transient "clean" badge on what's actually a
 *      conflicting intent. Documented in
 *      docs/PLAN-DEVIATIONS.md#2026-05-11-intent-clean-fe-only.
 *
 *   3. The intent's chain is `chain-eligible` (the chain detector
 *      excludes `cancel` / `personal_event_*`, so non-1-link-eligible
 *      intents are filtered out by step 1 above).
 *   4. It's not currently snoozed
 *      (`useCleanIntentSnoozeStore.isIntentSnoozed`).
 *   5. It's not currently auto-suppressed
 *      (`useCleanIntentPromotionStore.isIntentSuppressed`).
 *   6. The system-wide rate-limit cooldown
 *      (`useCleanIntentPromotionStore.isSystemWideSuppressed`) is not
 *      currently active.
 *   7. The user's `useCleanIntentSettingsStore.showCleanMoveSuggestions`
 *      preference is `true`.
 *
 * Promotion ordering:
 *   When multiple clean intents qualify, we pick the OLDEST first
 *   (smallest `proposed_at`, then smallest `id` as a stable tiebreak).
 *   This matches the §6.4.1 commit-order intuition the review screen
 *   already exposes: oldest staged work feels closest to "ready to
 *   commit" from the user's perspective.
 *
 * Side effect:
 *   On every render whose intent set has changed, we proactively
 *   call `clearIntent(intentId)` on BOTH suppression stores for any
 *   intent id that's no longer present. This wipes stale per-intent
 *   counters and snooze entries for intents that have been applied,
 *   removed, or superseded. Without this, an intent that came back
 *   with the same id (rare — the BE uses incrementing serial ids,
 *   but a session-scoped re-create COULD reuse one in theory) would
 *   inherit the previous instance's suppression state.
 *
 * Anti-instructions:
 *   - Don't return ALL clean intents — the toast surface is
 *     one-at-a-time. The Sweep button on the review screen
 *     consumes the full list separately via `cleanIntents`.
 *   - Don't mark `currentlyPromotingIntent` as "shown" inside this
 *     hook. The toast component owns its own "we showed it"
 *     bookkeeping (auto-dismiss after 8s); this hook only answers
 *     "should we be showing one right now?"
 *   - Don't mutate any store from a render-phase code path. The
 *     `clearIntent` cleanup is gated behind a `useEffect`.
 */

import { useEffect, useMemo } from "react";

import {
  useCleanIntentPromotionStore,
  type CleanIntentPromotionState,
} from "@technician/stores/clean-intent-promotion";
import { useCleanIntentSettingsStore } from "@technician/stores/clean-intent-settings";
import {
  useCleanIntentSnoozeStore,
  type CleanIntentSnoozeState,
} from "@technician/stores/clean-intent-snooze";
import { usePendingRealityStore } from "@technician/stores/pending-reality";
import { detectMoveChains } from "@technician/utils/detect-move-chains";
import type { LinterAppointment } from "@technician/utils/logistics-linter";
import type { ReorganizationIntent } from "@technician/types/reorganization";

export interface UseCleanIntentPromotionResult {
  /**
   * Mechanically clean intents — pass steps 1–4 (1-link chain, no
   * linter issue, no cross-chain conflict, chain-eligible) but NOT
   * filtered by suppression / snooze / user setting. The Sweep
   * button on the review screen consumes this directly: the user
   * explicitly tapped "Sweep clean ones," which overrides the
   * passive auto-suppression / snooze rules that exist purely to
   * keep the toast from being annoying.
   *
   * Stable by reference when the underlying inputs haven't changed.
   * Empty array when no intents qualify.
   */
  cleanIntents: ReorganizationIntent[];

  /**
   * Subset of `cleanIntents` that ALSO survives steps 5–8
   * (per-intent suppression, per-intent snooze, system-wide
   * cooldown, `showCleanMoveSuggestions` setting). This is the
   * pool the toast picks from.
   *
   * Exposed separately from `currentlyPromotingIntent` so future
   * consumers (e.g. an "N more suggestions queued" badge) can read
   * the full toast-eligible list without re-deriving it.
   */
  promotableCleanIntents: ReorganizationIntent[];

  /**
   * The single intent the toast should currently be promoting, or
   * `null` when:
   *   - `promotableCleanIntents` is empty, OR
   *   - the user has disabled `showCleanMoveSuggestions`, OR
   *   - the system-wide rate-limit cooldown is active.
   *
   * Picked by oldest-first (smallest `proposed_at`, then smallest
   * `id`) when more than one candidate qualifies.
   */
  currentlyPromotingIntent: ReorganizationIntent | null;
}

/**
 * Pure helper — picks the next clean intent. Extracted so unit tests
 * can pin the ordering rule without standing up the full hook.
 */
export function pickPromotionCandidate(
  intents: readonly ReorganizationIntent[],
): ReorganizationIntent | null {
  if (intents.length === 0) return null;
  // Smallest `proposed_at` wins; tie-break on smallest id. Both
  // monotonic-by-construction on the BE so this gives a stable
  // oldest-first order across rerenders.
  let best: ReorganizationIntent | null = null;
  for (const intent of intents) {
    if (best == null) {
      best = intent;
      continue;
    }
    if (intent.proposed_at < best.proposed_at) {
      best = intent;
      continue;
    }
    if (intent.proposed_at === best.proposed_at && intent.id < best.id) {
      best = intent;
    }
  }
  return best;
}

export interface UseCleanIntentPromotionArgs {
  /**
   * The same `LinterAppointment[]` projection the calendar tab
   * already feeds to `ChainToChainConflictToast` and the chain
   * detector. Empty / undefined disables chain detection — without
   * appointments we can't determine "1-link chain," so the hook
   * conservatively returns no candidates.
   */
  appointments: readonly LinterAppointment[] | undefined;
}

export function useCleanIntentPromotion({
  appointments,
}: UseCleanIntentPromotionArgs): UseCleanIntentPromotionResult {
  const intents = usePendingRealityStore((s) => s.intents);

  const showSuggestions = useCleanIntentSettingsStore(
    (s) => s.showCleanMoveSuggestions,
  );

  // Subscribe to the maps directly so a counter increment / snooze
  // write triggers a recompute. We re-read the imperative selectors
  // off `getState()` inside the memo so each candidate is evaluated
  // against the freshest store snapshot.
  const dismissalsByIntentId = useCleanIntentPromotionStore(
    (s) => s.dismissalsByIntentId,
  );
  const systemWideSuppressedUntil = useCleanIntentPromotionStore(
    (s) => s.systemWideSuppressedUntil,
  );
  const snoozedIntentIds = useCleanIntentSnoozeStore(
    (s) => s.snoozedIntentIds,
  );
  const sessionSuppressed = useCleanIntentSnoozeStore(
    (s) => s.sessionSuppressed,
  );

  // ── Cleanup pass — drop stale per-intent counters / snoozes for
  // intents that have left the session. Side-effect, so wrapped in
  // `useEffect`. Reads the latest action refs off `getState()` so
  // the effect doesn't have to re-subscribe to method identities.
  const intentIdsKey = useMemo(() => intents.map((i) => i.id).join(","), [
    intents,
  ]);
  useEffect(() => {
    const knownIds = new Set(intents.map((i) => i.id));
    const promotionState =
      useCleanIntentPromotionStore.getState() as CleanIntentPromotionState;
    for (const stringId of Object.keys(promotionState.dismissalsByIntentId)) {
      const numId = Number(stringId);
      if (!Number.isFinite(numId)) continue;
      if (!knownIds.has(numId)) {
        promotionState.clearIntent(numId);
      }
    }
    const snoozeState =
      useCleanIntentSnoozeStore.getState() as CleanIntentSnoozeState;
    for (const stringId of Object.keys(snoozeState.snoozedIntentIds)) {
      const numId = Number(stringId);
      if (!Number.isFinite(numId)) continue;
      if (!knownIds.has(numId)) {
        snoozeState.clearIntent(numId);
      }
    }
    // `intentIdsKey` is the change signal — when the intent set
    // identity (by id) changes, run the cleanup pass once. No
    // subscription to the action refs themselves (those are stable
    // across the store's lifetime).
  }, [intentIdsKey, intents]);

  // ── Compute clean intents ──────────────────────────────────────
  const cleanIntents = useMemo<ReorganizationIntent[]>(() => {
    if (intents.length === 0) return [];

    // We still derive the move-chain graph locally for the 1-link
    // shape check (step 1) — chain length isn't a lint question and
    // the BE doesn't ship a per-intent "chain length" field. The
    // conflict half of this hook (formerly steps 2 + 3) now reads
    // `intent.clean` directly from the BE-attached wire field
    // (`serializeIntent` in REMIBackend); FE-CR-1-1 retired the
    // local `apptIdsWithIssues` map + the
    // `detectChainToChainDestinationConflicts` re-derivation.
    const apptList = appointments ?? [];
    const graph = detectMoveChains(intents, apptList);

    // FE-CR-1-1 drift watch: surface ONCE per recompute when any
    // staged intent is missing `clean` (signals a pre-B-CR-1-1 BE
    // response slipped through realtime). The hook conservatively
    // treats those intents as not clean rather than promoting them.
    if (__DEV__) {
      const driftedIntentIds = intents
        .filter((i) => i.clean === undefined)
        .map((i) => i.id);
      if (driftedIntentIds.length > 0) {
        console.warn(
          "[useCleanIntentPromotion] intent.clean undefined on " +
            `${driftedIntentIds.length} of ${intents.length} intents ` +
            `(ids: ${driftedIntentIds.join(", ")}). Likely BE drift — ` +
            "GET responses should always set it. Treating as not clean.",
        );
      }
    }

    const result: ReorganizationIntent[] = [];
    for (const intent of intents) {
      // Step 1: must belong to a 1-link chain. The detector excludes
      // chain-ineligible intent kinds (cancel, personal_event_*) so
      // `intentToChainId.get(intent.id) == null` is the implicit
      // "this intent isn't chain-shaped" filter.
      const chainId = graph.intentToChainId.get(intent.id);
      if (chainId == null) continue;
      const chain = graph.chains.find((c) => c.id === chainId);
      if (chain == null || chain.intentIds.length !== 1) continue;

      // Step 2: BE-authoritative cleanness. Strict equality with
      // `true` — `undefined` (BE drift) and `false` both bar
      // promotion.
      if (intent.clean !== true) continue;

      result.push(intent);
    }
    return result;
  }, [intents, appointments]);

  // ── Apply suppression / snooze / settings filters ──────────────
  const promotableCleanIntents = useMemo<ReorganizationIntent[]>(() => {
    if (cleanIntents.length === 0) return cleanIntents;
    const promotionState =
      useCleanIntentPromotionStore.getState() as CleanIntentPromotionState;
    const snoozeState =
      useCleanIntentSnoozeStore.getState() as CleanIntentSnoozeState;
    return cleanIntents.filter(
      (intent) =>
        !promotionState.isIntentSuppressed(intent.id) &&
        !snoozeState.isIntentSnoozed(intent.id),
    );
    // Subscribed to the maps + flags above so the recompute fires
    // when suppression/snooze state mutates; the `getState()`
    // imperative read inside the filter pulls the freshest selectors.
  }, [
    cleanIntents,
    dismissalsByIntentId,
    snoozedIntentIds,
    sessionSuppressed,
  ]);

  // ── Pick the toast candidate ───────────────────────────────────
  const currentlyPromotingIntent = useMemo<ReorganizationIntent | null>(() => {
    if (!showSuggestions) return null;
    if (promotableCleanIntents.length === 0) return null;
    // Re-evaluate the system-wide cooldown freshly on every pick so
    // a cooldown that lapses mid-session unblocks the next render.
    const promotionState =
      useCleanIntentPromotionStore.getState() as CleanIntentPromotionState;
    if (promotionState.isSystemWideSuppressed()) return null;
    return pickPromotionCandidate(promotableCleanIntents);
  }, [
    showSuggestions,
    promotableCleanIntents,
    systemWideSuppressedUntil,
  ]);

  return {
    cleanIntents,
    promotableCleanIntents,
    currentlyPromotingIntent,
  };
}
