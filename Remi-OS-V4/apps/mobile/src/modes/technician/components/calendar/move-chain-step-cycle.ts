/**
 * `move-chain-step-cycle` (PR-UX-2 PASS 2.11, 2026-05-05 — task `c8`).
 *
 * Pure helper that translates a single user tap on the per-step legend
 * dot into the next "highlight set" of step ordinals. The cycle was
 * re-stated by the user 2026-05-05 (after an interim version that
 * tried `[i, i+1]` pair-mode and a separate double-tap rule):
 *
 *   - All dots start dimmed (`current = []`).
 *   - **Tap dot `i`** when `current !== [i]`  →  `[i]`.
 *     The "see only this one link" mode. Each step ordinal IS one
 *     intent — one source card outline + one ghost destination +
 *     the single arrow connecting them. Tapping a dot shows that
 *     one connection and nothing else.
 *   - **Tap dot `i`** when `current === [i]`  →  `[0..i]`.
 *     The "see everything up to here" prefix mode. Reachable from
 *     ANY dot via a second tap — no special last-dot rule, no
 *     timing-based double-tap. For the last dot this naturally
 *     produces the full-chain view (the prior "tap last dot to
 *     see all" behavior).
 *   - **Tap dot `i`** when `current === [0..i]`  →  `[]`.
 *     The "clear" terminator. A third consecutive tap on the same
 *     dot dims the whole chain. For the last dot this preserves
 *     the prior "tap last dot again to dim all" toggle.
 *
 * Tapping a DIFFERENT dot at any point in the cycle re-enters the
 * cycle at step 1 (`[i]`), so the cycle is per-dot, not global.
 *
 * Why a separate file: the chip-row component owns visuals
 * (Pressable + dim/lit styles). Keeping the cycle rule itself
 * decoupled lets us exhaustively unit-test every transition without
 * rendering React.
 *
 * The helper does not own state — callers pass in the current set and
 * receive the next set back. Sets are represented as sorted unique
 * `number[]` to match `usePendingRealityStore.chainStepHighlights`.
 */

export interface NextHighlightSetArgs {
  /** Currently-lit step ordinals (sorted unique). */
  current: readonly number[];
  /** Total number of steps in the chain (== chip's dot count). */
  totalSteps: number;
  /** Index of the dot that was tapped (0-based). */
  dotIndex: number;
}

/**
 * Compute the next highlight set after a tap. Returns the SAME
 * reference as `current` when the tap is a no-op so Zustand's
 * `setChainStepHighlights` short-circuits without dispatching a
 * subscriber notification.
 */
export function nextHighlightSet({
  current,
  totalSteps,
  dotIndex,
}: NextHighlightSetArgs): readonly number[] {
  // Defensive: invalid call → no change. Test cases cover negative
  // indices and out-of-range indices to make sure the chip-row
  // can't crash the store on a stale render.
  if (totalSteps <= 0) return current;
  if (dotIndex < 0 || dotIndex >= totalSteps) return current;

  // Three-state cycle, scoped to the tapped dot:
  //   1. current === [i]      → [0..i]   (expand to prefix)
  //   2. current === [0..i]   → []       (clear)
  //   3. anything else        → [i]      (re-enter cycle)
  if (isSingleStep(current, dotIndex)) {
    return prefixSet(dotIndex);
  }
  if (isPrefixSet(current, dotIndex)) {
    return [];
  }
  return [dotIndex];
}

/**
 * `[i, i+1, ...other]` membership lookup helper exposed for the
 * chip-row's per-dot styling and the calendar's per-step filter.
 * `chainStepHighlights` is small (typically 2–6 entries) so a
 * linear scan is faster than building a Set for repeated lookups.
 */
export function isStepHighlighted(
  highlights: readonly number[],
  step: number,
): boolean {
  for (const n of highlights) {
    if (n === step) return true;
  }
  return false;
}

function isSingleStep(set: readonly number[], dotIndex: number): boolean {
  return set.length === 1 && set[0] === dotIndex;
}

function isPrefixSet(set: readonly number[], throughIndex: number): boolean {
  if (set.length !== throughIndex + 1) return false;
  for (let i = 0; i <= throughIndex; i += 1) {
    if (set[i] !== i) return false;
  }
  return true;
}

function prefixSet(throughIndex: number): number[] {
  return Array.from({ length: throughIndex + 1 }, (_, i) => i);
}
