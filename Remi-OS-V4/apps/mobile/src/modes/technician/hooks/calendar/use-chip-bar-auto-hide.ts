/**
 * `useChipBarAutoHide` (2026-05-10).
 *
 * Idle-collapse drawer state for the landscape Move-Chain chip bar.
 *
 * Live state machine:
 *
 *   - `expanded` (default) — the chip bar paints its full popover with
 *     dot row, carousel header, and Show all/none + Now/Future
 *     toggles.
 *   - `collapsed` — the chip bar paints only a small "notch" handle
 *     flush with whichever screen edge the user last docked it
 *     against (top or bottom via `useDraggableHud`). Touching the
 *     notch (or any descendant of the chip-bar host) restores it to
 *     `expanded`.
 *
 * The hook is the single owner of the collapsed flag plus the idle
 * timer. It does NOT know about the host's anchor edge or render
 * surface — `DraggableChipBarHost` reads `collapsed` and picks the
 * notch vs. children render path itself.
 *
 * # User-facing behavior (2026-05-10 user spec)
 *
 *   1. On first mount the chip bar appears expanded at its persisted
 *      anchor (default `tc` per `useDraggableHud`). The idle timer
 *      starts counting from the moment of mount.
 *   2. Any touch inside the chip-bar host — drag start, chip tap,
 *      Show all/none press, Now/Future toggle, carousel chevron —
 *      calls `recordActivity()` and restarts the idle timer.
 *   3. After `delayMs` (default 15 000 ms) of zero activity, the bar
 *      collapses to the notch. The user reported: *"I like the idea
 *      of a timer, if it's not used for about 15 seconds, just hide
 *      it whichever side it's on."*
 *   4. Tapping the notch fires `expand()` which sets `collapsed:
 *      false` and restarts the idle timer (no "pinned open" state —
 *      a tap that's followed by another 15 s of idle re-collapses).
 *   5. The host's `activityKey` prop counts as activity; bumping it
 *      from the parent (e.g. on `moveChainGraph.chains.length`
 *      change) auto-expands the bar so a newly-staged chain
 *      announces itself even if the user was idle when it landed.
 *
 * # Why a custom hook (vs. inlining in DraggableChipBarHost)
 *
 *   - The timer + state machine is fully testable in isolation
 *     against jest fake timers; no React Native renderer needed.
 *   - Future callers (portrait week chip bar, dashboard variants)
 *     can reuse the same idle-collapse contract by mounting the
 *     hook with whatever `delayMs` makes sense.
 *   - Keeps the host wrapper focused on layout / gesture wiring
 *     rather than imperative timer bookkeeping.
 *
 * # Anti-instructions
 *
 *   - Don't auto-collapse on the FIRST mount before any timer has
 *     elapsed. The user expects the bar to appear visible — the
 *     idle clock only counts ELAPSED time since last activity.
 *   - Don't pin the bar open just because a tap happened. Tapping
 *     the notch resets the timer to a fresh 15 s; the next idle
 *     window collapses it again. This is the contract the user
 *     described — no "stay open" mode.
 *   - Don't fire `recordActivity` from inside the collapse effect.
 *     That would create a self-reset loop. The only resets are
 *     external — touch events, the activityKey watcher, or an
 *     explicit `expand()` call.
 *   - Don't expose the underlying timer ref. Callers should treat
 *     this hook as opaque; the timer is implementation detail.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Default idle window before the chip bar collapses to its notch. */
export const DEFAULT_CHIP_BAR_IDLE_MS = 15_000;

export interface UseChipBarAutoHideOptions {
  /**
   * Idle window before the bar collapses. Defaults to
   * `DEFAULT_CHIP_BAR_IDLE_MS` (15 s) per the user's 2026-05-10 spec.
   * Tests pass a small value (e.g. 1 ms) to drive the state machine
   * deterministically without jest fake timers if they prefer.
   */
  delayMs?: number;
  /**
   * When this value changes between renders, the bar treats the
   * change as fresh activity — restarts the idle timer AND expands
   * the bar if it was collapsed. The parent decides what counts as
   * activity (typical use: `moveChainGraph.chains.length` so a
   * brand-new chain auto-announces itself; or `intents.length` if
   * the parent wants per-intent granularity).
   *
   * Reference-equality compared. Pass a primitive (number / string /
   * boolean) for the dependency tracker to behave predictably.
   * Omit to disable the auto-expand-on-change behavior entirely.
   */
  activityKey?: unknown;
  /**
   * Override the initial collapsed state. Defaults to `false`
   * (expanded). Only used to support test fixtures that need to
   * exercise the "starts collapsed" path; production callers should
   * leave this as the default per the 2026-05-10 spec ("It would
   * start out just like it does, out on the screen at the top").
   */
  initialCollapsed?: boolean;
}

export interface UseChipBarAutoHideHandle {
  /** True when the bar should render its notch handle instead of children. */
  collapsed: boolean;
  /**
   * Expand the bar (sets `collapsed: false`) and restart the idle
   * timer. Idempotent — calling while already expanded just resets
   * the timer.
   */
  expand: () => void;
  /**
   * Restart the idle timer without changing collapsed state. Bound
   * to every touch on the chip-bar host via
   * `onStartShouldSetResponderCapture` (see `DraggableChipBarHost`).
   * Distinct from `expand()` so callers that catch a touch can
   * choose whether to expand or just keep-alive.
   *
   * NOTE: in practice the host always calls `expand()` because the
   * touch will be coming from the notch (if collapsed) or from the
   * popover (if expanded), and both should refresh the timer. The
   * separation exists for future callers that may want a quieter
   * "ping" path (e.g., a keyboard nav focus event that should
   * extend the timer but not auto-expand).
   */
  recordActivity: () => void;
  /**
   * Force-collapse without waiting for the timer. Used internally by
   * the idle effect; exported for tests and any future
   * "long-press-to-hide-immediately" affordance.
   */
  collapseNow: () => void;
}

export function useChipBarAutoHide(
  opts: UseChipBarAutoHideOptions = {},
): UseChipBarAutoHideHandle {
  const {
    delayMs = DEFAULT_CHIP_BAR_IDLE_MS,
    activityKey,
    initialCollapsed = false,
  } = opts;

  const [collapsed, setCollapsed] = useState<boolean>(initialCollapsed);

  // Single mutable timer handle. We re-create on every reset rather
  // than rely on React's effect-cleanup cadence because the timer
  // gets restarted far more often than the hook re-renders (every
  // touch on the chip bar host calls `recordActivity`).
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearActiveTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const collapseNow = useCallback(() => {
    clearActiveTimer();
    setCollapsed(true);
  }, [clearActiveTimer]);

  // Internal helper: schedule the collapse without touching the
  // expanded/collapsed state. Both `expand` and `recordActivity`
  // route through this so the timer policy is single-sourced.
  const scheduleCollapse = useCallback(() => {
    clearActiveTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setCollapsed(true);
    }, delayMs);
  }, [clearActiveTimer, delayMs]);

  const expand = useCallback(() => {
    setCollapsed(false);
    scheduleCollapse();
  }, [scheduleCollapse]);

  const recordActivity = useCallback(() => {
    setCollapsed((prev) => {
      // If the bar was collapsed, surface the popover again — a
      // touch inside the host is the user reaching for the bar.
      // When already expanded, leave state untouched and just
      // restart the timer below.
      if (prev) return false;
      return prev;
    });
    scheduleCollapse();
  }, [scheduleCollapse]);

  // Initial mount: start the idle timer so the bar collapses if the
  // user never engages it. Restart on `delayMs` change so a hot-
  // reload that changes the constant takes effect immediately.
  useEffect(() => {
    scheduleCollapse();
    return clearActiveTimer;
  }, [clearActiveTimer, scheduleCollapse]);

  // Auto-expand-on-activityKey-change. The first render captures
  // the initial value in the ref; subsequent renders compare and
  // fire `expand()` when the value differs. We don't use
  // `useEffect(..., [activityKey])` directly because we want to
  // skip the first call (the mount effect above already started
  // the timer; firing `expand` here too would just double-reset).
  const lastActivityKeyRef = useRef<unknown>(activityKey);
  const firstActivityKeyPassRef = useRef<boolean>(true);
  useEffect(() => {
    if (firstActivityKeyPassRef.current) {
      firstActivityKeyPassRef.current = false;
      lastActivityKeyRef.current = activityKey;
      return;
    }
    if (Object.is(lastActivityKeyRef.current, activityKey)) return;
    lastActivityKeyRef.current = activityKey;
    setCollapsed(false);
    scheduleCollapse();
  }, [activityKey, scheduleCollapse]);

  return {
    collapsed,
    expand,
    recordActivity,
    collapseNow,
  };
}
