/**
 * `move-chain-link-advance` (PR-UX-3 Phase 2 — 2026-05-07; revised 2026-05-08).
 *
 * Pure helper that translates a side-arrow press on the active chain
 * chip into the next "highlight set" of step ordinals. Sibling to
 * `move-chain-step-cycle.ts` (the per-dot tap rule), separated so:
 *
 *   - Side arrows are TECH-RUN navigation: walk forward / back one
 *     CONTIGUOUS-SAME-TECH BLOCK at a time, with wrap-around at
 *     the chain boundaries. Two adjacent steps belong to the same
 *     run iff they share the same source technician id.
 *   - Dot taps are JUMP / PREFIX navigation (PR-UX-2): set highlights
 *     to a specific link or the prefix `[0..i]`. Untouched by this
 *     helper.
 *
 * Both primitives coexist on the chip per `pr-ux-3-multi-tech-handoff.md`
 * §1.A1 — dot-tap and side-arrow can be used interchangeably to walk
 * a chain. Concretely:
 *
 *   - A chain like `[A,B,A,B,C,A,C]` (the locked PR-UX-3 7-step
 *     interleaved demo) lights ONE dot per side-arrow press because
 *     every consecutive step is on a different tech — every step is
 *     its own 1-step run.
 *   - A chain like `[A,A,B,A,B,B,A,A]` (the 8-step "mixed runs"
 *     demo) groups consecutive same-tech steps: pressing right
 *     cycles `[0,1] → [2] → [3] → [4,5] → [6,7]` and wraps. The
 *     run-count and run-shape come from the chain itself, not from
 *     any predetermined override.
 *   - A single-tech chain `[A,A,A]` collapses to ONE run; the
 *     side arrows DISABLE (canAdvanceLink → false) and the user
 *     walks that chain via the dot-tap prefix cycle.
 *
 * Wrap-around (handoff doc §1.N2):
 *   - Right at the LAST run → wraps to the FIRST run.
 *   - Left at the FIRST run → wraps to the LAST run.
 *   - Wrap-around remounts to the target run's tech (the
 *     accompanying `useSideArrowTechMount` hook handles the actual
 *     remount + flash banner — this helper only computes the next
 *     highlight set).
 *
 * Resolving the "active run":
 *   - The active link is the highest step ordinal in `current`
 *     (matches the dot-tap cycle's "max(current) is the head of
 *     the lit prefix" convention from PR-UX-2). The active run is
 *     the run containing that step.
 *   - The number of currently-lit dots is irrelevant to the
 *     side-arrow rule — `[0,1,2]`, `[2]`, and `[1,2]` all resolve
 *     to "active link = 2" and advance from the run containing
 *     step 2. Pressing right always lands on the entire NEXT run
 *     (not just one dot of it), regardless of how many dots the
 *     user had selected before the press.
 *
 * Optionality of `techIdByStep`:
 *   - When omitted (or empty), every step is treated as its own
 *     1-step run. Preserves backwards-compatibility with the
 *     PR-UX-3 Phase 2 contract for callers that don't have tech
 *     metadata to hand. The locked 7-step interleaved seed yields
 *     identical results either way (every step is its own tech).
 *   - When provided, callers SHOULD pass `null` for steps whose
 *     tech can't be resolved (e.g. the source appointment isn't
 *     loaded yet); null-tech steps still navigate but as their
 *     own run, with adjacent nulls coalescing into a single run.
 *
 * The helper does not own state — callers pass in the current set
 * and receive the next set back. Sets are sorted unique
 * `number[]` to match `usePendingRealityStore.chainStepHighlights`.
 */

export type SideArrowDirection = "left" | "right";

export interface AdvanceLinkArgs {
  direction: SideArrowDirection;
  /** Currently-lit step ordinals (sorted unique). */
  current: readonly number[];
  /** Total number of steps in the chain. */
  totalSteps: number;
  /**
   * Per-step source-technician id, length === `totalSteps`. Used to
   * group steps into tech-runs by adjacency. Adjacent steps with
   * equal values (including both `null`) belong to the same run.
   *
   * Optional — when omitted (or empty), every step is treated as
   * its own 1-step run.
   */
  techIdByStep?: readonly (number | null)[];
}

/**
 * Compute the navigable tech-runs for a chain. Each run is a
 * contiguous block of step ordinals sharing the same tech id (where
 * `null` is a valid value — adjacent nulls coalesce). Pure; safe to
 * call on every render.
 *
 * Exported so `canAdvanceLink` and the side-arrow tests can verify
 * run-shape directly, and so the host hook can reuse it without
 * re-implementing the grouping rule.
 */
export function computeTechRuns(
  totalSteps: number,
  techIdByStep?: readonly (number | null)[],
): readonly (readonly number[])[] {
  if (totalSteps <= 0) return [];

  // No tech metadata → every step is its own run. Matches the
  // PR-UX-3 Phase 2 default and keeps existing call sites
  // (and tests) working without changes.
  if (!techIdByStep || techIdByStep.length === 0) {
    const out: number[][] = [];
    for (let i = 0; i < totalSteps; i++) out.push([i]);
    return out;
  }

  const runs: number[][] = [];
  let currentRun: number[] | null = null;
  // Sentinel for "no run started yet". Any real tech id (number)
  // or the null value will compare unequal to `UNSET` and start a
  // fresh run on the first step.
  const UNSET = Symbol("unset-tech-run");
  let currentTech: number | null | typeof UNSET = UNSET;
  for (let i = 0; i < totalSteps; i++) {
    const t: number | null = techIdByStep[i] ?? null;
    if (currentRun && currentTech === t) {
      currentRun.push(i);
    } else {
      currentRun = [i];
      currentTech = t;
      runs.push(currentRun);
    }
  }
  return runs;
}

/**
 * Compute the next highlight set after a side-arrow press. Returns
 * the SAME reference as `current` when the press is a no-op (e.g.
 * `totalSteps` is zero, or the chain has fewer than two navigable
 * runs).
 */
export function advanceLink({
  direction,
  current,
  totalSteps,
  techIdByStep,
}: AdvanceLinkArgs): readonly number[] {
  if (totalSteps <= 0) return current;

  const runs = computeTechRuns(totalSteps, techIdByStep);
  if (runs.length === 0) return current;

  // 1-run chain (single-tech, or every step on the same tech):
  // side-arrow can't change the run, so it's a no-op. The user
  // walks single-tech chains via the dot-tap prefix cycle (see
  // `move-chain-step-cycle.ts`). Returning the same reference
  // lets the store setter short-circuit.
  if (runs.length === 1) return current;

  // Empty current → first run. The rest of the helper assumes a
  // non-empty `current` so we can resolve an "active link".
  if (current.length === 0) return runs[0]!.slice();

  // Resolve the "active link" — the highest step ordinal in
  // `current`. Defensive against degenerate inputs (negative or
  // out-of-range indices) so callers can pass any sorted array.
  let activeIndex = current[0]!;
  for (const step of current) {
    if (step > activeIndex) activeIndex = step;
  }
  if (activeIndex < 0) activeIndex = 0;
  if (activeIndex >= totalSteps) activeIndex = totalSteps - 1;

  // Find the run containing activeIndex. Runs are non-overlapping
  // and contiguous, so a linear scan is fine (worst case ≈ chain
  // length, which is ~10 dots in the demos).
  let runIndex = -1;
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i]!;
    if (activeIndex >= run[0]! && activeIndex <= run[run.length - 1]!) {
      runIndex = i;
      break;
    }
  }

  // Defensive: activeIndex should always live inside some run
  // because every step ordinal in [0, totalSteps) belongs to
  // exactly one run. If grouping produced something pathological
  // we fall back to the first/last run by direction so the press
  // still lands on something.
  if (runIndex === -1) {
    return direction === "right"
      ? runs[0]!.slice()
      : runs[runs.length - 1]!.slice();
  }

  const nextRunIndex =
    direction === "right"
      ? (runIndex + 1) % runs.length
      : (runIndex - 1 + runs.length) % runs.length;
  return runs[nextRunIndex]!.slice();
}

/**
 * Resolve whether the side arrow in `direction` is a no-op given
 * the current state. Used by the chip-row's disabled-state styling
 * (handoff doc §1.N1).
 *
 * Returns `true` when the press would change the highlight set,
 * `false` when it would be a no-op. Pure; safe to call on every
 * render.
 *
 * Tech-run rule: arrows are disabled when the chain has 0 or 1
 * navigable runs. With a 1-run chain (single-tech, or a chain
 * where every step is on the same tech) the side-arrow widget
 * renders dimmed; the user advances via dot-tap.
 */
export function canAdvanceLink({
  direction,
  current,
  totalSteps,
  techIdByStep,
}: AdvanceLinkArgs): boolean {
  void direction;
  void current;
  const runs = computeTechRuns(totalSteps, techIdByStep);
  return runs.length > 1;
}
