/**
 * useDragToAvatar (P2-FE-6, master plan §5.1.7) — landscape-only
 * gesture coordinator for the avatar strip during a card drag.
 *
 * Two responsibilities live in this hook:
 *
 *   1. **Per-frame hit-test** (UI thread, worklet). Reads the raw
 *      finger position from the vendored calendar's
 *      `useDragSharedValues()` and writes the matching avatar tech id
 *      into `highlightedTechIdSV`. The AvatarStrip paints a ring on
 *      the matching tile via a `useAnimatedStyle` per tile.
 *
 *   2. **JS-thread "dwell pattern"** (`useAvatarDwellPattern` block
 *      below). Watches the highlight SV for transitions and runs a
 *      timed 3-stage haptic + selection state machine that lets the
 *      user navigate between tech calendars by hovering avatars
 *      DURING a drag, without ever lifting the finger.
 *
 * Hover-dwell model (replaces the old "drop-on-avatar" model)
 * ────────────────────────────────────────────────────────────
 *
 * The avatar is **not** a drop target. It is a calendar-switcher
 * reachable during a drag. The actual drop always lands on the grid,
 * in whatever tech's calendar is currently visible. Reassignment of a
 * dragged event happens implicitly because we have already swapped
 * `selectedTechIds` to the destination tech BEFORE the user releases.
 *
 * Lifecycle of one hover (per avatar X, while dragging):
 *
 *   t=0       finger enters X
 *   t=200ms   debounce passes → BUZZ 1 (light) — "arrival" haptic
 *   t=500ms   BUZZ 2 (light) + apply preview narrow:
 *             setSelectedTechIds([X]). Reversible: lift or move-off
 *             before t=900ms reverts to the anchor selection.
 *   t=900ms   BUZZ 3 (success notification, ~250ms — distinctly
 *             longer than 1 & 2 per user spec) + commit:
 *             [X] becomes the new anchor. From here, lifting keeps
 *             [X] as the selection; moving to a different avatar
 *             starts a fresh pattern from t=0 over there.
 *
 * Skip rule: if the user hovers an avatar where
 * `selectedTechIds === [X]` (already anchored to that one tech alone),
 * the pattern does NOT fire — no buzz, no selection change. Hovering
 * an already-anchored tech is a no-op.
 *
 * Cancel / move-to-different-avatar / lift behavior:
 *   - On exit before t=900: cancel timers, revert preview if buzz 2
 *     already applied.
 *   - On move from avatar X → avatar Y mid-pattern: cancel X's
 *     timers, revert if needed, start fresh on Y.
 *   - On `isDragging` true→false (finger lift) before t=900: cancel
 *     timers, revert preview if applied.
 *   - On unmount mid-drag: cancel timers, revert preview.
 *
 * Revert anchor toggle (dev-time A/B):
 * Each successful buzz-3 commit becomes the "last committed" anchor.
 * `REVERT_ANCHOR` chooses between two strategies for what an aborted
 * pattern reverts to:
 *   - 'last-committed' (default): revert to the most recent buzz-3
 *     commit, or the original pre-drag selection if no commit has
 *     happened yet. Each commit is its own checkpoint, so chained
 *     hovers feel like discrete confirmed actions.
 *   - 'pre-drag': always revert all the way to the original pre-drag
 *     selection. Commits during the drag are treated as preview-only
 *     until the user lifts.
 * Flip the constant + reload to A/B-test, then delete the loser and
 * the toggle when the call is made.
 *
 * The vendor fork (Phase 18 + Phase 19 — see README-FORK.md) exposes
 * the SVs this hook depends on. The plan said "no fork required"; in
 * practice the SVs were declared internally inside CalendarInner but
 * never on a public surface, AND `panXAbs` turned out to be hard-
 * clamped to the grid (so even after Phase 18 exposed it, an external
 * avatar hit-test couldn't work — Phase 19 added raw `fingerXAbs/YAbs`).
 *
 * NaN safety: `fingerXAbs/YAbs` initialise to `Number.NaN` and reset
 * to NaN on every drag-end (FORK Phase 19). The hit-test
 * `winX >= b.x && winX <= b.x + b.w` evaluates to `false` for NaN
 * inputs (NaN propagation in numeric comparisons), so a stale read
 * between drags naturally produces "no hit" without a special case.
 *
 * This hook is landscape-only. Portrait calendars don't mount it —
 * they have no avatar strip to navigate.
 */

// PLAN-DEVIATION: 2026-04-22-drag-sv-vendor-fork — this hook only
// exists because the vendored calendar was forked (Phase 18 +
// Phase 19) to expose drag SVs via context. See
// docs/PLAN-DEVIATIONS.md#2026-04-22-drag-sv-vendor-fork.

// PLAN-DEVIATION: 2026-04-22-hover-dwell-avatar-navigator — the
// avatar is no longer a drop target; it's a hover-dwell calendar
// switcher. Supersedes 2026-04-22-drop-on-avatar-always-switches.
// See docs/PLAN-DEVIATIONS.md#2026-04-22-hover-dwell-avatar-navigator.

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { useDragSharedValues } from "react-native-resource-calendar";
import { haptic } from "@technician/hooks/utility/use-haptics";

/**
 * Sentinel for "no avatar currently under the centroid." Chosen
 * over `null` because Reanimated SharedValue<number> is the most
 * UI-thread-friendly storage and `null` would force a `?` type
 * branch in every consumer's `useAnimatedStyle`. -1 is safe because
 * tech ids are positive server-issued integers.
 */
export const NO_HIGHLIGHTED_TECH = -1 as const;

/**
 * Dev-time A/B toggle — controls what an aborted dwell pattern
 * reverts to. See module-header "Revert anchor toggle". Flip the
 * literal, hot reload, smoke-test the alternate behavior, then
 * delete the unused branch and this constant once the choice is
 * made.
 */
const REVERT_ANCHOR: "last-committed" | "pre-drag" = "last-committed";

/**
 * Dwell pattern timing (ms from finger-arrival on an avatar). Total
 * arrival → end-of-buzz-3 ≈ 1150ms (success haptic itself is ~250ms).
 * User spec (2026-04-22): "from the end of the long buzz [...] it
 * needs to take AT LEAST 1 second."
 */
const DWELL_BUZZ_1_DELAY_MS = 200;
const DWELL_BUZZ_2_DELAY_MS = 500;
const DWELL_BUZZ_3_DELAY_MS = 900;

/** Window-coordinates bounding box of an avatar tile. */
export interface AvatarBbox {
  /** Window X of the tile's left edge (pt). */
  x: number;
  /** Window Y of the tile's top edge (pt). */
  y: number;
  /** Tile width (pt) — avatars are square but this is kept generic. */
  w: number;
  /** Tile height (pt). */
  h: number;
}

export interface DragToAvatarOptions {
  /**
   * Current `useCalendarStore.selectedTechIds`. Required for the
   * dwell pattern's skip rule and revert logic. The hook tracks the
   * latest value via a ref so timer callbacks always see the up-
   * to-date selection (avoiding stale closures).
   */
  selectedTechIds?: number[];
  /**
   * Wholesale-replace setter (NOT the toggle). Required for the
   * dwell pattern to apply preview-narrow at buzz 2 and revert at
   * abort. If omitted, the dwell pattern is disabled and the hook
   * only does per-frame highlight (legacy mode).
   */
  setSelectedTechIds?: (ids: number[]) => void;
}

export interface DragToAvatarHandle {
  /**
   * Register or update an avatar tile's bounding box in window
   * coordinates. Pass `null` to unregister (e.g. on tile unmount).
   * Stable identity — safe to pass into `onLayout` callbacks
   * without re-renders.
   */
  registerAvatarBbox: (techId: number, bbox: AvatarBbox | null) => void;
  /**
   * SharedValue painted by AvatarStrip's per-tile animated style.
   * Holds the currently-hovered tech id, or `NO_HIGHLIGHTED_TECH`
   * (-1) when no avatar is under the centroid (or not dragging).
   */
  highlightedTechIdSV: SharedValue<number>;
  /**
   * Bug #2 guard (P2-FE-6 follow-on, 2026-04-22): returns `true` if a
   * drag is currently in progress OR ended within the last
   * `withinMs` milliseconds.
   *
   * Use case: an avatar `Pressable.onPress` can fire when the user's
   * finger lifts on top of an avatar at the end of a drag (RN's
   * responder system can deliver `onResponderRelease` to the avatar
   * even though the drag's pan handler was the active responder). If
   * the press toggles the calendar's `selectedTechIds`, the just-
   * committed tech selection is silently undone.
   *
   * Wrap any `onPress` that mutates calendar selection with this
   * check and short-circuit when it returns true. Default window
   * (500ms) covers the gesture-end → press-fire propagation gap with
   * room for the post-release haptic burst (success buzz, ~250ms)
   * without unnecessarily blocking deliberate taps.
   */
  wasRecentlyDragging: (withinMs?: number) => boolean;
}

export function useDragToAvatar(
  options?: DragToAvatarOptions,
): DragToAvatarHandle {
  const { fingerXAbs, fingerYAbs, isDragging } = useDragSharedValues();
  const { selectedTechIds, setSelectedTechIds } = options ?? {};

  // Avatar bbox map — see header for storage rationale.
  const bboxesSV = useSharedValue<Record<string, AvatarBbox>>({});
  // JS-side mirror — synchronous accumulation source-of-truth.
  // Reanimated 3 treats `sharedValue.value = obj` from the JS thread
  // as a SCHEDULED write; back-to-back register calls within one tick
  // would each spread an empty `{}` and only persist their own key.
  // The JS-side ref accumulates correctly; we mirror to the SV after.
  const bboxesJSRef = useRef<Record<string, AvatarBbox>>({});

  const highlightedTechIdSV = useSharedValue<number>(NO_HIGHLIGHTED_TECH);

  // ── Per-frame reaction: hit-test finger against bboxes ───────
  useAnimatedReaction(
    () => ({
      dragging: isDragging.value,
      x: fingerXAbs.value,
      y: fingerYAbs.value,
    }),
    ({ dragging, x, y }) => {
      "worklet";
      if (!dragging) {
        if (highlightedTechIdSV.value !== NO_HIGHLIGHTED_TECH) {
          highlightedTechIdSV.value = NO_HIGHLIGHTED_TECH;
        }
        return;
      }
      const map = bboxesSV.value;
      let hit: number = NO_HIGHLIGHTED_TECH;
      for (const techIdStr in map) {
        const b = map[techIdStr];
        if (
          x >= b.x &&
          x <= b.x + b.w &&
          y >= b.y &&
          y <= b.y + b.h
        ) {
          hit = parseInt(techIdStr, 10);
          break;
        }
      }
      if (highlightedTechIdSV.value !== hit) {
        highlightedTechIdSV.value = hit;
      }
    },
    [],
  );

  // ── Hover-dwell pattern (JS-thread state machine) ────────────
  //
  // Only mounted when both `selectedTechIds` and `setSelectedTechIds`
  // are provided (legacy callers that just want the highlight ring
  // can pass nothing). The pattern lives in this hook (rather than
  // a sibling hook) so it shares the same `useDragSharedValues()`
  // subscription and the same `highlightedTechIdSV` source-of-truth
  // — no risk of two sets of edge reactions disagreeing on what
  // "currently hovered" means.

  // Source-of-truth refs for state the timer callbacks read. Refs
  // (not state) because setTimeout callbacks otherwise close over
  // the value at registration time, not the value at fire time.
  const selectedTechIdsRef = useRef<number[]>(selectedTechIds ?? []);
  useEffect(() => {
    selectedTechIdsRef.current = selectedTechIds ?? [];
  }, [selectedTechIds]);
  const setSelectedTechIdsRef = useRef<((ids: number[]) => void) | undefined>(
    setSelectedTechIds,
  );
  useEffect(() => {
    setSelectedTechIdsRef.current = setSelectedTechIds;
  }, [setSelectedTechIds]);

  // Anchor refs:
  //   originalSelectionRef — selectedTechIds at drag-start, snapshotted
  //     once per drag.
  //   committedAnchorRef — updated to [techId] each time a buzz-3
  //     commit fires within this drag. Used by 'last-committed'
  //     revert strategy; ignored by 'pre-drag'.
  const originalSelectionRef = useRef<number[] | null>(null);
  const committedAnchorRef = useRef<number[] | null>(null);

  // Dwell state machine. `activeAvatarId` doubles as "is a pattern
  // currently armed" — null means no pattern. `previewApplied` flips
  // true at buzz 2 (selection changed). `committed` flips true at
  // buzz 3 (no more revert).
  const dwellStateRef = useRef<{
    activeAvatarId: number | null;
    previewApplied: boolean;
    committed: boolean;
  }>({ activeAvatarId: null, previewApplied: false, committed: false });

  // Three timer slots — kept as separate handles so the cancel path
  // can null them individually. (One combined handle would force a
  // re-create on every cancel, which is needlessly fiddly.)
  const dwellTimersRef = useRef<{
    buzz1: ReturnType<typeof setTimeout> | null;
    buzz2: ReturnType<typeof setTimeout> | null;
    buzz3: ReturnType<typeof setTimeout> | null;
  }>({ buzz1: null, buzz2: null, buzz3: null });

  const cancelDwellTimers = useCallback(() => {
    const t = dwellTimersRef.current;
    if (t.buzz1) {
      clearTimeout(t.buzz1);
      t.buzz1 = null;
    }
    if (t.buzz2) {
      clearTimeout(t.buzz2);
      t.buzz2 = null;
    }
    if (t.buzz3) {
      clearTimeout(t.buzz3);
      t.buzz3 = null;
    }
  }, []);

  /**
   * Compute the selection to revert to when an in-progress pattern
   * is aborted (lift, exit-to-grid, move-to-different-avatar before
   * buzz 3). Toggles between the two REVERT_ANCHOR strategies.
   */
  const computeRevertSelection = useCallback((): number[] => {
    if (REVERT_ANCHOR === "last-committed") {
      return (
        committedAnchorRef.current ??
        originalSelectionRef.current ??
        []
      );
    }
    return originalSelectionRef.current ?? [];
  }, []);

  /**
   * If buzz 2 already applied a preview-narrow but buzz 3 hasn't
   * committed yet, restore the selection. No-op otherwise.
   */
  const revertPreviewIfNeeded = useCallback(() => {
    const st = dwellStateRef.current;
    if (st.previewApplied && !st.committed) {
      const target = computeRevertSelection();
      setSelectedTechIdsRef.current?.(target);
    }
  }, [computeRevertSelection]);

  /**
   * Start the 3-stage timed pattern for a freshly-entered avatar.
   * Caller MUST have already cancelled any previous pattern (we do
   * not double-cancel here — calling this twice without cancel in
   * between would leak timers).
   */
  const startDwellPattern = useCallback(
    (techId: number) => {
      dwellStateRef.current.activeAvatarId = techId;
      dwellStateRef.current.previewApplied = false;
      dwellStateRef.current.committed = false;

      dwellTimersRef.current.buzz1 = setTimeout(() => {
        haptic.light();
      }, DWELL_BUZZ_1_DELAY_MS);

      dwellTimersRef.current.buzz2 = setTimeout(() => {
        haptic.light();
        // Apply preview narrow. Reversible until buzz 3 fires.
        setSelectedTechIdsRef.current?.([techId]);
        dwellStateRef.current.previewApplied = true;
      }, DWELL_BUZZ_2_DELAY_MS);

      dwellTimersRef.current.buzz3 = setTimeout(() => {
        // success notification = ~250ms double-pulse "ba-dum",
        // ~5x the duration of buzz 1/2 — meets the user spec
        // "at least twice as long as the other 2 buzzes".
        haptic.success();
        committedAnchorRef.current = [techId];
        dwellStateRef.current.committed = true;
        // Selection was already swapped at buzz 2; commit flag
        // alone is what stops the next revert path from undoing it.
      }, DWELL_BUZZ_3_DELAY_MS);
    },
    [],
  );

  /**
   * Tear down the active pattern. If the preview narrow was applied
   * but buzz 3 hadn't fired yet, revert the selection. Always clears
   * timers and the state machine.
   */
  const endActivePattern = useCallback(() => {
    cancelDwellTimers();
    revertPreviewIfNeeded();
    dwellStateRef.current.activeAvatarId = null;
    dwellStateRef.current.previewApplied = false;
    dwellStateRef.current.committed = false;
  }, [cancelDwellTimers, revertPreviewIfNeeded]);

  /**
   * JS-thread reaction to highlight changes. Drives the dwell state
   * machine. Called via `runOnJS` from the worklet below.
   */
  const handleHighlightChange = useCallback(
    (curr: number, prev: number) => {
      if (curr === prev) return;
      // Skip rule: hovering an avatar where this tech is ALREADY the
      // sole selected tech — no buzz, no narrow. Already anchored.
      if (curr !== NO_HIGHLIGHTED_TECH) {
        const sel = selectedTechIdsRef.current;
        if (sel.length === 1 && sel[0] === curr) {
          // Tear down anything that was running on the previous
          // avatar (e.g. user moved from avatar Y to already-anchored
          // avatar X — Y's preview must revert).
          if (dwellStateRef.current.activeAvatarId !== null) {
            endActivePattern();
          }
          return;
        }
      }
      // Exit the previous avatar's pattern if any (this also reverts
      // its preview if buzz 2 fired but 3 didn't).
      if (dwellStateRef.current.activeAvatarId !== null) {
        endActivePattern();
      }
      // Enter the new avatar (if curr is an avatar — NO_HIGHLIGHTED
      // means we just exited to grid).
      if (curr !== NO_HIGHLIGHTED_TECH) {
        startDwellPattern(curr);
      }
    },
    [endActivePattern, startDwellPattern],
  );

  /**
   * Drag-start (false→true) — snapshot the original selection so we
   * have something to revert to. Reset committed-anchor since this
   * is a fresh drag.
   */
  const handleDragStart = useCallback(() => {
    originalSelectionRef.current = [...selectedTechIdsRef.current];
    committedAnchorRef.current = null;
  }, []);

  // Bug #2 guard timestamp — see `wasRecentlyDragging` below. Stamped
  // on every drag end (true→false isDragging edge) so the avatar's
  // Pressable can short-circuit a stray onPress that fired because
  // the user's finger lifted on top of an avatar at drop time.
  const dragEndedAtRef = useRef<number>(0);

  /**
   * Drag-end (true→false) — final cleanup. If a pattern was still in
   * preview phase, revert it. Then null out all the per-drag refs.
   */
  const handleDragEnd = useCallback(() => {
    cancelDwellTimers();
    revertPreviewIfNeeded();
    dwellStateRef.current.activeAvatarId = null;
    dwellStateRef.current.previewApplied = false;
    dwellStateRef.current.committed = false;
    originalSelectionRef.current = null;
    committedAnchorRef.current = null;
    dragEndedAtRef.current = Date.now();
  }, [cancelDwellTimers, revertPreviewIfNeeded]);

  /**
   * Bug #2 guard — see `DragToAvatarHandle.wasRecentlyDragging` for
   * the full rationale. Reads `isDragging.value` synchronously from
   * the JS thread (Reanimated SVs are JS-readable without a worklet)
   * plus the JS-side `dragEndedAtRef` stamped by `handleDragEnd`.
   *
   * Stable identity — depends only on the SV reference (which is
   * stable across renders) and a ref. Safe to include in callback
   * deps without churning consumers.
   */
  const wasRecentlyDragging = useCallback(
    (withinMs: number = 500): boolean => {
      if (isDragging.value) return true;
      return Date.now() - dragEndedAtRef.current < withinMs;
    },
    [isDragging],
  );

  // Reaction: highlight changes → handleHighlightChange.
  useAnimatedReaction(
    () => highlightedTechIdSV.value,
    (curr, prev) => {
      "worklet";
      if (!setSelectedTechIdsRef.current) return; // dwell disabled
      if (prev === undefined || prev === null) return;
      if (curr === prev) return;
      runOnJS(handleHighlightChange)(curr as number, prev as number);
    },
    [],
  );

  // Reaction: isDragging edges → handleDragStart / handleDragEnd.
  useAnimatedReaction(
    () => isDragging.value,
    (curr, prev) => {
      "worklet";
      if (!setSelectedTechIdsRef.current) return; // dwell disabled
      if (prev === false && curr === true) {
        runOnJS(handleDragStart)();
      } else if (prev === true && curr === false) {
        runOnJS(handleDragEnd)();
      }
    },
    [],
  );

  // Cleanup on unmount: cancel any in-flight timers and revert any
  // mid-flight preview so an unmount-while-dragging (rotation back
  // to portrait, navigation away, etc.) doesn't strand the user
  // with a transient narrowed selection.
  useEffect(() => {
    return () => {
      cancelDwellTimers();
      revertPreviewIfNeeded();
    };
  }, [cancelDwellTimers, revertPreviewIfNeeded]);

  // ── Bbox registration (stable callback) ──────────────────────
  const registerAvatarBbox = useCallback<
    DragToAvatarHandle["registerAvatarBbox"]
  >(
    (techId, bbox) => {
      const key = String(techId);
      const next = { ...bboxesJSRef.current };
      if (bbox === null) {
        delete next[key];
      } else {
        next[key] = bbox;
      }
      bboxesJSRef.current = next;
      bboxesSV.value = next;
    },
    [bboxesSV],
  );

  return useMemo(
    () => ({
      registerAvatarBbox,
      highlightedTechIdSV,
      wasRecentlyDragging,
    }),
    [registerAvatarBbox, highlightedTechIdSV, wasRecentlyDragging],
  );
}
