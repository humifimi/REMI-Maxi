/**
 * Diagnostic hook (PR-UX-2 / move-chain logs pass, 2026-05-05).
 *
 * Subscribes to a Reanimated `SharedValue<number>` that mirrors the
 * vendored Calendar's internal vertical scroll offset (exposed via
 * the FORK Phase 24 `<Calendar onScrollYRef>` accessor) and logs
 * deltas above a small threshold to Metro.
 *
 * Lives at view-level, NOT inside `MoveChainArrowOverlay`, so the
 * log fires regardless of whether a chain chip is selected. (When
 * gated behind the overlay's mount, you have to actually summon
 * arrows before the diagnostic kicks in — defeats the purpose.)
 *
 * Pure observability — no side effects beyond the console log.
 * No-op when:
 *   - `__DEV__` is false (production strips the log call)
 *   - `scrollYRef` is null (the FORK Phase 24 callback hasn't fired
 *     yet, e.g. the calendar hasn't mounted)
 */

import {
  useAnimatedReaction,
  useSharedValue,
  runOnJS,
  type SharedValue,
} from "react-native-reanimated";

import { VERBOSE_CALENDAR_LOGS } from "@technician/utils/calendar-debug-logs";

/** Suppress sub-pixel jitter; only log when the user actually moves. */
const SCROLL_LOG_THRESHOLD_PX = 4;

interface ScrollLogDetail {
  view: "Day" | "WW" | "LS";
  scrollY: number;
  prevScrollY: number;
  delta: number;
  /**
   * Sequence number — useful for spotting when many tiny deltas all
   * fire in a single scroll burst vs. a slow drift over multiple
   * ticks.
   */
  seq: number;
}

function logScrollDelta(detail: ScrollLogDetail): void {
  if (!VERBOSE_CALENDAR_LOGS) return;
  console.log(`[MoveChain:Scroll:${detail.view}]`, {
    scrollY: detail.scrollY,
    prevScrollY: detail.prevScrollY,
    delta: detail.delta,
    seq: detail.seq,
  });
}

/**
 * Subscribes to `scrollYRef` and logs every scroll delta over
 * `SCROLL_LOG_THRESHOLD_PX`. Pass `null` for `scrollYRef` until the
 * FORK Phase 24 callback fires; the hook is a no-op until non-null.
 *
 * The `view` discriminator namespaces the log so day / workweek /
 * landscape don't collide when the user navigates between views in
 * a single Metro session.
 */
export function useMoveChainScrollLogger(
  scrollYRef: SharedValue<number> | null | undefined,
  view: "Day" | "WW" | "LS",
): void {
  // SharedValue (not useRef) so the worklet can write to it safely
  // without tripping `Tried to modify key 'current'` warnings.
  const seq = useSharedValue<number>(0);
  useAnimatedReaction(
    () => (scrollYRef ? scrollYRef.value : 0),
    (current, previous) => {
      "worklet";
      if (!scrollYRef) return;
      if (previous === null) return;
      const delta = current - previous;
      if (Math.abs(delta) < SCROLL_LOG_THRESHOLD_PX) return;
      seq.value = seq.value + 1;
      runOnJS(logScrollDelta)({
        view,
        scrollY: current,
        prevScrollY: previous,
        delta,
        seq: seq.value,
      });
    },
    [scrollYRef, view],
  );
}
