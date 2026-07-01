/**
 * `useMoveChainPulse` — refcounted React hook that drives the
 * module-scope `moveChainPulseValue` singleton in
 * `move-chain-pulse-singleton.ts`.
 *
 * PR-UX-2 PASS 2.3 (2026-05-05): pivoted from a per-instance
 * `useSharedValue` to a singleton because:
 *
 *   - Pulse opacity now drives the *calendar tiles* (via
 *     `getEventOpacity` → vendored EventBlock's `useAnimatedStyle`)
 *     rather than just the SVG arrows. The vendored library has no
 *     React access to the consumer's per-instance shared values, so
 *     the pulse has to live somewhere both sides can reach without
 *     React-context plumbing through the FlashList.
 *   - One global yo-yo timer is cheaper than N per-tile timers and
 *     keeps every pulsing tile perfectly in phase.
 *
 * The hook becomes a thin lifecycle wrapper: while `isActive`, hold a
 * subscription to the singleton; when it flips false, release it. The
 * singleton manages start/stop based on refcount.
 *
 * The returned `MoveChainPulse` shape is preserved for back-compat
 * with `MoveChainArrowOverlay` (PASS 2.2) which used to read
 * `pulse.opacity` on its arrows. Arrows no longer pulse (PASS 2.3),
 * but the field stays exposed in case future callers want to read
 * the live value (e.g., a status indicator that flashes while a
 * chain is selected).
 */

import { useEffect } from "react";
import type { SharedValue } from "react-native-reanimated";

import {
  moveChainPulseValue,
  subscribePulse,
} from "@technician/components/calendar/move-chain-pulse-singleton";
import { VERBOSE_CALENDAR_LOGS } from "@technician/utils/calendar-debug-logs";

export interface MoveChainPulse {
  /**
   * The shared singleton pulse SharedValue. Range:
   * [MIN_OPACITY, MAX_OPACITY] from the singleton module. Steady at
   * MAX_OPACITY when no consumer is subscribed.
   */
  opacity: SharedValue<number>;
}

/**
 * @param isActive  When true, hold a subscription to the pulse singleton.
 * @param callerLabel  Optional short tag identifying the call site
 *   (e.g. "view:workweek", "view:landscape"). Surfaces in the
 *   `[MoveChain:Pulse]` log lines so a noisy session can be traced
 *   back to which mounted component held the subscription. Helpful
 *   when investigating "the pulse stopped" regressions — you can
 *   eyeball the unsubscribe-without-resubscribe pattern in Metro.
 *   Optional so existing call sites compile unchanged.
 */
export function useMoveChainPulse(
  isActive: boolean,
  callerLabel?: string,
): MoveChainPulse {
  useEffect(() => {
    if (!isActive) return;
    if (VERBOSE_CALENDAR_LOGS) {
      console.log("[MoveChain:Pulse] hook subscribing to singleton", {
        caller: callerLabel ?? "unlabeled",
      });
    }
    const unsubscribe = subscribePulse();
    return () => {
      if (VERBOSE_CALENDAR_LOGS) {
        console.log("[MoveChain:Pulse] hook unsubscribing from singleton", {
          caller: callerLabel ?? "unlabeled",
        });
      }
      unsubscribe();
    };
  }, [isActive, callerLabel]);

  return { opacity: moveChainPulseValue };
}
