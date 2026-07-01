/**
 * `useAutoIsolateOnStage` — auto-isolate the just-staged chain.
 *
 * 2026-05-08 follow-up #4 (PR-UX-3, chip-row + scope investigation).
 *
 * # Bug being fixed
 *
 * User report: *"when I moved Ethan's card, it shows pretty much all
 * of the pending changes, not just for that chain."*
 *
 * After a drag stages a new intent, the canvas was reverting to the
 * "Show all" baseline (`selectedChainId === null`). In that mode the
 * calendar paints every staged change with the dashed pending border
 * — no dimming, no chain-isolation. The user expected the canvas to
 * focus on the chain that contains the just-staged intent so they
 * could verify what their drag did before continuing.
 *
 * # Root cause
 *
 * `usePendingRealityStore.setSession(refresh+intents)` (introduced
 * in PR-UX-2 / `72c6fc4`) clobbers `selectedChainId: null` whenever
 * a fresh intents array is written to the store. Every successful
 * stage routes through `useAddReorganizationIntent`'s `onSuccess` →
 * `setSession(session, intents)`, so the user's selection (if any)
 * AND the implicit "isolate the new chain" UX are both lost on
 * every drop.
 *
 * The PR-UX-2 reset comment ("the chain graph is derived from the
 * new intent list and the previously selected chain id may no
 * longer exist") is correct in the abstract — the prior selection
 * COULD dangle — but the practical UX cost is wrong: a freshly-
 * staged intent ALWAYS belongs to a real chain in the new graph
 * (the detector emits a 1-step seed for it at minimum), and that's
 * the chain the user wants the canvas to focus on. Resetting to
 * "Show all" wins zero correctness and loses the user's
 * orientation.
 *
 * # The fix
 *
 * Sit a tiny effect downstream of the same hook
 * (`useMoveChainGraph`) every chain-aware view already calls. The
 * effect:
 *
 *   1. Watches the staged-intents list by id (not array reference,
 *      so a structurally-identical refresh doesn't re-fire).
 *   2. On the FIRST run, snapshots the current id set and bails —
 *      otherwise an existing session loaded from the BE on mount
 *      would auto-isolate to its newest intent every time the day
 *      view mounts, which is intrusive (the user might be
 *      mid-review of a different chain).
 *   3. On subsequent runs, computes the set of newly-added intent
 *      ids (current minus previous). Empty → no-op (intents
 *      removed or unchanged).
 *   4. Picks the highest new id (BE assigns ids monotonically;
 *      `addIntent` appends, so the newest is the just-staged
 *      one).
 *   5. Looks up its chain via `graph.intentToChainId.get(newestId)`.
 *      If the intent isn't in the graph yet (rare — happens during
 *      the brief loading window before `weekData` resolves), bail
 *      silently AND DO NOT snapshot. The next render with a
 *      resolved graph still sees the new intent as "new" so the
 *      isolate eventually fires. If `weekData` never resolves the
 *      intent (e.g. the source row is genuinely missing forever)
 *      the hook stays inert, which is the safe failure mode: no
 *      incorrect isolation, just no auto-isolate UX for that drag.
 *      Snapshot ONLY happens on (a) first run, (b) no-new-ids
 *      runs (removal-only / pure re-renders), and (c) successful
 *      isolate. See test "new intent not yet in graph
 *      (loading-window race)" for the regression pin.
 *   6. If `selectedChainId` already equals that chain, no-op (the
 *      store's `setSelectedChainId` is also no-op-on-equal, but
 *      bailing here saves a render-cycle scan over the chains
 *      array).
 *   7. Resolves the chain's step count from
 *      `graph.chains.find(c => c.id === chainId)?.intentIds.length`
 *      — `setSelectedChainId(chainId, totalSteps)` uses it to
 *      seed `chainStepHighlights` to the FULL prefix so the chip
 *      row's per-step dots paint lit immediately (matches the
 *      chip-tap path's seeding behavior — see PR-UX-2 PASS 2.12).
 *
 * # Why this lives in a shared hook
 *
 * The same auto-isolate is needed in three views: portrait day,
 * portrait workweek, and landscape workweek. Putting the logic in
 * the store would couple the store to chain detection (currently
 * a view-layer concern that depends on `weekData`); putting it in
 * each view as inline `useEffect` would triplicate the snapshot
 * ref + the same-id de-dup logic. A hook is the cheapest
 * abstraction.
 *
 * # Why we don't move the reset OUT of `setSession`
 *
 * The reset is correct behavior for `setSession(new)` (a different
 * session id evicts the previous selection — the chain ids are
 * scoped to a session). The `setSession(refresh+intents)` branch
 * is the only one where the reset is too aggressive, and it would
 * have its own subtle issue: keeping `selectedChainId` across
 * intent additions means a deletion or a finalize-and-rehydrate
 * could leave it pointing at a chain that no longer exists. The
 * chip row tolerates dangling chain ids (no chip is highlighted,
 * no overlay paints) but the user-visible UX is "I had Chain 3
 * isolated, the deletion landed, and now Chain 3 is gone but the
 * row still says nothing is highlighted" — confusing. This hook
 * sidesteps that whole class of question by setting the selection
 * to a guaranteed-real chain (the just-staged one) on every
 * stage.
 *
 * # Anti-instructions
 *
 * - Don't fold this into `useMoveChainGraph`. The hook's only job
 *   is to derive the graph; mounting an effect that mutates the
 *   pending-reality store from inside the derivation hook would
 *   tangle two unrelated lifecycles (a graph recompute is also a
 *   selection mutation under the wrong inputs → infinite loops
 *   are easy to write).
 *
 * - Don't call this from the review screen. The review screen has
 *   no chip row; isolating a chain there has no UI effect. The
 *   review screen's per-card chain badge already reads
 *   `selectedChainId` for the active-chain underline, but that's
 *   a passive consumer — the auto-isolate-on-stage UX is for the
 *   calendar canvas where `selectedChainId` drives the dim /
 *   chain-color / ghost / arrow overlays.
 *
 * - Don't add a "skip on cold mount" gate beyond the
 *   `prevIntentIdsRef.current === null` first-run check. The
 *   subsequent runs WILL include the case where the user
 *   navigates away (effect cleanup runs) and back (effect re-
 *   mounts). On re-mount the prev-ids ref is null again so the
 *   first run on re-mount also bails. That's the desired
 *   behavior — we only auto-isolate on staging events that
 *   happen WITHIN a mount lifetime.
 */

import { useEffect, useRef } from "react";

import type { MoveChainGraph } from "@technician/utils/detect-move-chains";
import type { ReorganizationIntent } from "@technician/types/reorganization";

export interface UseAutoIsolateOnStageOptions {
  /**
   * Live staged intents (typically
   * `usePendingRealityStore((s) => s.intents)`). The hook watches
   * the array's intent ids; reference changes that don't change
   * the id set are ignored.
   */
  intents: readonly ReorganizationIntent[];
  /**
   * Chain graph derived from `useMoveChainGraph`. The hook reads
   * `intentToChainId` to find the just-staged intent's chain, and
   * `chains` to read its step count for the spotlight seed.
   */
  graph: MoveChainGraph;
  /**
   * Live `selectedChainId` (typically
   * `usePendingRealityStore((s) => s.selectedChainId)`). Used to
   * short-circuit the no-op re-isolate case.
   */
  selectedChainId: string | null;
  /**
   * Live `chainStepHighlights` (typically
   * `usePendingRealityStore((s) => s.chainStepHighlights)`). Used
   * by the chain-growth path: when a new intent extends the
   * currently-selected chain AND the existing highlights look like
   * a "full prefix" of the prior step count, the hook expands them
   * to the new full prefix so the user's "show entire chain" view
   * grows alongside the chain itself. When the user has narrowed
   * the spotlight to a specific pair / prefix the hook leaves it
   * alone — narrowing was an explicit user action, not a default.
   *
   * See PLAN-DEVIATION 2026-05-12-autoisolate-grow-spotlight.
   */
  chainStepHighlights: readonly number[];
  /**
   * Bound `setSelectedChainId` setter (typically
   * `usePendingRealityStore((s) => s.setSelectedChainId)`). The
   * hook calls it with `(chainId, totalSteps)` so the spotlight
   * seeds to the full prefix.
   */
  setSelectedChainId: (id: string | null, totalSteps?: number) => void;
  /**
   * Bound `setChainStepHighlights` setter (typically
   * `usePendingRealityStore((s) => s.setChainStepHighlights)`).
   * Used to expand the spotlight when the currently-selected chain
   * grows. See `chainStepHighlights` above.
   */
  setChainStepHighlights: (next: readonly number[]) => void;
}

export function useAutoIsolateOnStage({
  intents,
  graph,
  selectedChainId,
  chainStepHighlights,
  setSelectedChainId,
  setChainStepHighlights,
}: UseAutoIsolateOnStageOptions): void {
  const prevIntentIdsRef = useRef<readonly number[] | null>(null);

  useEffect(() => {
    const currIds = intents.map((i) => i.id);
    const prevIds = prevIntentIdsRef.current;

    // First run after mount → just snapshot. We don't auto-isolate
    // on initial-mount existing intents because the user may have
    // navigated to the canvas mid-review of a different chain and
    // a fresh stage hasn't happened yet. See doc-block step 2.
    if (prevIds === null) {
      prevIntentIdsRef.current = currIds;
      return;
    }

    // Compute the new ids since the last run.
    const prevSet = new Set(prevIds);
    const newIds: number[] = [];
    for (const id of currIds) {
      if (!prevSet.has(id)) newIds.push(id);
    }
    if (newIds.length === 0) {
      // No new intents — pure re-render, removal-only update, or
      // structural identity change. Snapshot so we don't drift on
      // identity-changes-without-content (e.g. a `setSession`
      // refresh that rewrites the intents array with the same
      // ids).
      prevIntentIdsRef.current = currIds;
      return;
    }

    // BE assigns ids monotonically; `addIntent` appends to the
    // tail. `Math.max` is more defensive than `currIds[length-1]`
    // because hot-reloads / test mocks can reorder.
    const newestId = Math.max(...newIds);
    const chainId = graph.intentToChainId.get(newestId);
    if (chainId == null) {
      // Loading-window race: the new intent landed in the store
      // but the graph (`useMoveChainGraph` deriving from
      // `weekData`) hasn't picked it up yet. DELIBERATELY do NOT
      // snapshot prev here — we want the NEXT render with a
      // resolved graph to still see this intent as "new" so the
      // isolate fires. If `weekData` never resolves the new
      // intent (e.g. the source row is genuinely missing forever)
      // the hook stays inert, which is the safe failure mode:
      // no incorrect isolation, just no auto-isolate UX for
      // that drag. See doc-block step 5.
      return;
    }

    // Snapshot now that we've successfully resolved the chain —
    // the next render won't re-fire isolate for the same set of
    // new ids.
    prevIntentIdsRef.current = currIds;

    const chain = graph.chains.find((c) => c.id === chainId);
    const totalSteps = chain?.intentIds.length ?? 0;

    if (selectedChainId === chainId) {
      // PLAN-DEVIATION: 2026-05-12-autoisolate-grow-spotlight —
      // pre-2026-05-12 this branch short-circuited with a bare
      // `return` once the hook had isolated a chain. That made
      // `chainStepHighlights` a one-shot snapshot of the chain's
      // length AT FIRST ISOLATE; any subsequent intent staged
      // onto the SAME chain (e.g. extending a cascade) grew the
      // chain's `totalSteps` to N+1 but left the spotlight
      // capped at the original N, so the newly-added step's
      // ghost / arrow / pulse never lit up. User report
      // 2026-05-12: *"newly added steps are dimmed/skipped"*.
      //
      // The fix is to grow the spotlight alongside the chain
      // — but only when the user hasn't explicitly NARROWED it.
      // The "full prefix" detection (highlights ===
      // [0..prevTotal-1] with prevTotal == totalSteps -
      // newStepsInThisChain) tells us the user is in "show the
      // entire chain" mode; if they tapped a dot to focus a
      // step pair (highlights == [2, 3]) we respect that and
      // leave it alone.
      //
      // The "full prefix" semantics match the seed default
      // (`setSelectedChainId(chainId, totalSteps)` writes
      // `[0..totalSteps-1]`) so the auto-grow is reversible —
      // the user can tap a dot to narrow again at any time.
      //
      // See docs/PLAN-DEVIATIONS.md#2026-05-12-autoisolate-grow-spotlight.
      const newStepsInChain = newIds.filter(
        (id) => graph.intentToChainId.get(id) === chainId,
      ).length;
      if (newStepsInChain === 0) return; // staging extended a sibling chain
      const previousTotalSteps = totalSteps - newStepsInChain;
      // Full-prefix detector: highlights are `[0..previousTotalSteps-1]`
      // (covers the seed default AND the user's last "tap the
      // last dot → all-lit" toggle). Empty highlights = "all
      // dim" baseline, also treated as full-prefix-capable so
      // the user who returned to all-dim doesn't have a new
      // step pop in unannounced — but is left untouched
      // because expanding `[]` to `[0..N-1]` would reverse
      // their explicit dim. We treat empty as "narrowed to
      // nothing" and leave it alone.
      if (chainStepHighlights.length === 0) return;
      const isFullPrefix =
        chainStepHighlights.length === previousTotalSteps &&
        chainStepHighlights.every((n, idx) => n === idx);
      if (!isFullPrefix) return;
      const expanded = Array.from({ length: totalSteps }, (_, i) => i);
      if (__DEV__) {
        console.log("[DEBUG:AutoIsolate] expanding spotlight to grown chain", {
          chainId,
          prevTotalSteps: previousTotalSteps,
          newTotalSteps: totalSteps,
          newStepsInChain,
        });
      }
      setChainStepHighlights(expanded);
      return;
    }

    if (__DEV__) {
      console.log("[DEBUG:AutoIsolate] firing", {
        newestId,
        chainId,
        totalSteps,
        priorSelected: selectedChainId,
        newIdCount: newIds.length,
      });
    }
    setSelectedChainId(chainId, totalSteps);
  }, [
    intents,
    graph,
    selectedChainId,
    chainStepHighlights,
    setSelectedChainId,
    setChainStepHighlights,
  ]);
}
