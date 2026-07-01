/**
 * `useAvatarStripBboxDerivation` (PR-UX-6, 2026-05-08).
 *
 * Robust replacement for the per-tile `measureInWindow` pattern that
 * shipped in 2026-04-22 (`hover-dwell-avatar-navigator`) and was
 * cloned into the portrait strip in 2026-05-08
 * (`portrait-week-hover-dwell-parity`). The original pattern called
 * `View.measureInWindow` from each tile's own `<View onLayout={...}>`
 * — but RN's `onLayout` ONLY fires when the view's own `width` /
 * `height` changes, NOT when the view's window-coord position
 * changes due to an ancestor's reflow. Three concrete failure modes
 * landed in production:
 *
 *   1. `<CollapsibleTop>` collapses the FO portrait chrome via a
 *      Reanimated `useAnimatedStyle` height interpolation; the
 *      avatar strip slides up/down ~150–200pt in window coords
 *      without any descendant resizing.
 *   2. `<MoveChainChipRow>` mounts BELOW the avatar strip in JSX
 *      order; per RN flexbox, mounting a sibling that comes AFTER
 *      the strip cannot shift the strip's window y, so this state
 *      alone is benign — but it co-occurs with state 3 because
 *      both gate on `hasStagedIntents` (chip row indirectly via
 *      chain derivation; toggle directly), which made the
 *      diagnosis blame the wrong chunk.
 *   3. `<NowFutureToggle>` (PR-UX-5, 2026-05-08) mounts ABOVE the
 *      workweek view as a sibling inside a `flex: 1` container.
 *      When `hasStagedIntents` flips false→true the toggle adds
 *      ~46pt of chrome and the strip's window position drops by
 *      that amount with no JS layout pass on the strip itself.
 *
 * Long-term invariant we're establishing here: a horizontally /
 * vertically stacked strip of equally-sized (or onLayout-reportable)
 * tiles never re-measures itself per-tile in window coordinates.
 * Instead the OUTER strip container is the single source-of-truth
 * for window position, and each tile's relative offset is captured
 * (once, at mount) via its own `onLayout` event. Window bbox =
 * `stripWindowBbox + relativeOffset`. The strip's window position
 * is refreshed on every cause of ancestor reflow we know about:
 *
 *   - the strip's own `onLayout` (fires on size changes AND on
 *     initial mount; not always reliable for pure ancestor moves
 *     but cheap to register and catches the most common case)
 *   - a `remeasureKey` prop bumped on a caller-provided dep set
 *     (typically `[hasStagedIntents, moveChainGraph.chains.length,
 *     futureMode]` for portrait or `[measuredCalendarWidth]` for
 *     landscape) — RAF-deferred so the resulting `measureInWindow`
 *     reads the post-commit native frame
 *   - a Reanimated `useAnimatedReaction` over an optional
 *     `collapseProgress` SharedValue, firing when the value crosses
 *     to a settled endpoint (0 or 1) — covers Reanimated-driven
 *     height animations that bypass the JS layout pass entirely.
 *
 * Whichever trigger fires first wins; subsequent triggers within a
 * settle window are idempotent because `measureInWindow` reads the
 * current native frame and we always overwrite the bbox map.
 *
 * Consumer contract is unchanged: each tile id maps to a window-
 * coord `AvatarBbox` in the registry the consumer (`useDragToAvatar`,
 * `useAvatarBboxRegistry`) reads from.
 *
 * See docs/PLAN-DEVIATIONS.md#2026-05-08-avatar-strip-bbox-derivation
 * for the full diagnosis + anti-instructions.
 */

// PLAN-DEVIATION: 2026-05-08-avatar-strip-bbox-derivation —
// supersedes the per-tile measureInWindow pattern documented inline
// in `2026-04-22-hover-dwell-avatar-navigator` and cloned into
// portrait by `2026-05-08-portrait-week-hover-dwell-parity`. See
// docs/PLAN-DEVIATIONS.md#2026-05-08-avatar-strip-bbox-derivation.

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { LayoutChangeEvent, View } from "react-native";
import {
  runOnJS,
  useAnimatedReaction,
  type SharedValue,
} from "react-native-reanimated";

import type { AvatarBbox } from "./landscape/use-drag-to-avatar";

export interface AvatarStripBboxDerivationOptions {
  /**
   * Ref attached to the strip's outermost layout-honouring `View`.
   * The hook calls `measureInWindow` on this ref every time a
   * remeasure trigger fires.
   *
   * For portrait: the `<ScrollView>` that hosts the chips. RN
   * forwards `measureInWindow` to its underlying View, so this is
   * fine.
   * For landscape: the outer 44pt `<View>` that contains the
   * scrollable chip column.
   */
  stripRef: React.RefObject<View | null>;
  /**
   * Consumer callback that receives the window-coord bbox for each
   * tile id. Identical to `useDragToAvatar`'s
   * `registerAvatarBbox(techId, bbox|null)` so the hook drops in
   * directly. The hook calls this with `null` for every tile id on
   * unmount.
   */
  registerAvatarBbox: (
    techId: number,
    bbox: AvatarBbox | null,
  ) => void;
  /**
   * Optional. Bump this to force a remeasure on the next RAF.
   * Typical caller passes a value derived from the layout deps the
   * strip cares about (e.g. portrait: `${hasStagedIntents}-${chainCount}-${futureMode}`).
   * `undefined` disables this trigger entirely.
   */
  remeasureKey?: number | string;
  /**
   * Optional. Reanimated SV from `<CollapsibleTopProvider>` (or any
   * other UI-thread height animator the strip moves with). When
   * provided, the hook registers a `useAnimatedReaction` that fires
   * when the SV crosses to a settled endpoint (0 or 1) — at that
   * moment the chrome's height has finished animating and the
   * strip's window position is at its post-animation rest.
   *
   * Intermediate values during the animation are intentionally NOT
   * remeasured: re-running `measureInWindow` 60 times per second
   * across N tiles is wasted work, and the drag-to-avatar hit-test
   * is read at the END of a drag (when the chrome animation has
   * always settled by then in practice).
   */
  collapseProgressSV?: SharedValue<number> | null;
}

export interface AvatarStripBboxDerivationHandle {
  /**
   * Pass to the strip ref'd view's `onLayout` prop. Triggers a
   * window-bbox remeasure on the next RAF.
   *
   * NOTE: also captures the strip's reported width/height so the
   * derivation knows the strip's own size. This prop accepts an
   * unused `LayoutChangeEvent` arg only to match RN's `onLayout`
   * signature; the actual bbox comes from the deferred
   * `measureInWindow`.
   */
  onStripLayout: (e: LayoutChangeEvent) => void;
  /**
   * Pass to each tile's `onLayout` prop. Captures the tile's offset
   * relative to the strip's coordinate space and rebroadcasts the
   * window bbox if the strip's window position is already known.
   *
   * # `viewNode` argument (PR-UX-15, 2026-05-09)
   *
   * Originally the hook used `event.nativeEvent.layout` for the
   * tile's relative offset. RN reports `layout.x/y` RELATIVE TO THE
   * IMMEDIATE PARENT, which broke for nested layouts where the
   * tile's parent isn't the strip itself. The landscape avatar
   * strip's `splitMiddle` layout wraps tiles in two `splitGroup`
   * Views, so `layout.x/y` was relative to `splitGroup`, not the
   * strip — `stripWindow + relativeOffset` produced bboxes off by
   * the splitGroup's offset within the strip.
   *
   * The fix: callers pass the tile's own host-component node as a
   * second arg. When provided, the hook calls
   * `viewNode.measureLayout(stripRef.current, ...)` to get the
   * tile's STRIP-RELATIVE offset, regardless of how deeply nested
   * the tile is. When omitted (legacy single-level callers like
   * the portrait strip's flat ScrollView), the hook falls back to
   * `event.nativeEvent.layout`.
   *
   * Tiles re-fire `onLayout` whenever their own size changes — for
   * the avatar chips that's effectively once per mount (chip is
   * a fixed-size circle), so the relative-offset capture is a
   * single-shot. We DON'T need the tile to know about ancestor
   * reflow: only the strip's outer container needs that, and it's
   * handled centrally above.
   */
  onTileLayout: (
    techId: number,
    e: LayoutChangeEvent,
    viewNode?: View | null,
  ) => void;
  /**
   * Imperative remeasure trigger. Useful for callers that want to
   * force a refresh on a one-off event the hook doesn't know about
   * (e.g. orientation change). Caller-controlled — ordinary
   * remeasure is automatic.
   */
  remeasureNow: () => void;
}

export function useAvatarStripBboxDerivation(
  opts: AvatarStripBboxDerivationOptions,
): AvatarStripBboxDerivationHandle {
  const { stripRef, registerAvatarBbox, remeasureKey, collapseProgressSV } =
    opts;

  // Strip's window-coord bbox — null until the first measure resolves.
  const stripBboxRef = useRef<AvatarBbox | null>(null);
  // Per-tile relative offsets (within the strip's local coord space).
  const tileOffsetsRef = useRef<Map<number, AvatarBbox>>(new Map());
  // PR-UX-16 (PLAN-DEVIATION 2026-05-09-pr-ux-16-followups) —
  // per-tile View refs so the hook can call `measureInWindow` on
  // each tile DIRECTLY whenever an ancestor reflow trigger fires.
  // The strip-relative derivation alone (PR-UX-6 +
  // PR-UX-15 measureLayout) was insufficient on landscape because
  // the splitMiddle layout's nested `splitGroup` Views combined
  // with `measureLayout`'s inconsistent behavior across React
  // Native + Reanimated 4 produced bboxes off by the splitGroup
  // offset. Direct `measureInWindow` on each known tile bypasses
  // every coordinate-translation layer. See
  // docs/PLAN-DEVIATIONS.md#2026-05-09-pr-ux-16-followups.
  const tileNodesRef = useRef<Map<number, View>>(new Map());
  // Latest `registerAvatarBbox` callback. Captured via ref so the
  // RAF / Reanimated callbacks always see the up-to-date consumer
  // without forcing a re-register on every parent render.
  const registerRef = useRef(registerAvatarBbox);
  registerRef.current = registerAvatarBbox;

  /**
   * Push `stripWindow + tileOffset` for every known tile. Called
   * after the strip's window bbox is (re-)measured, and after a
   * tile registers a new relative offset. Used as a synchronous
   * fallback before the per-tile `measureInWindow` resolves.
   */
  const broadcast = useCallback(() => {
    const strip = stripBboxRef.current;
    if (!strip) return;
    for (const [techId, off] of tileOffsetsRef.current) {
      registerRef.current(techId, {
        x: strip.x + off.x,
        y: strip.y + off.y,
        w: off.w,
        h: off.h,
      });
    }
  }, []);

  /**
   * PR-UX-16 — call `measureInWindow` on every registered tile
   * node and broadcast the resulting window bboxes directly to the
   * consumer. This is the primary measurement path on landscape
   * (where nested splitGroup layouts broke the strip-relative
   * derivation). On portrait the result is identical to
   * `stripWindow + tileOffset` so this path is the safe default
   * for both orientations.
   *
   * `measureInWindow` is a native bridge call; calling it for ~6
   * tiles on a remeasure is cheap (microseconds).
   */
  const measureAllTilesInWindow = useCallback(() => {
    for (const [techId, node] of tileNodesRef.current) {
      // The `as unknown as` shape mirrors the existing measureLayout
      // cast — RN's `View` type doesn't surface measureInWindow on
      // every host-component variant, but every native View
      // exposes it via NativeMethodsMixin.
      const measurer = node as unknown as {
        measureInWindow?: (
          callback: (x: number, y: number, w: number, h: number) => void,
        ) => void;
      };
      if (typeof measurer.measureInWindow !== "function") continue;
      const captureTechId = techId;
      measurer.measureInWindow((x, y, w, h) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (w <= 0 || h <= 0) return;
        registerRef.current(captureTechId, { x, y, w, h });
      });
    }
  }, []);

  /**
   * Run `measureInWindow` on the strip ref and broadcast. Defers
   * via `requestAnimationFrame` so the most recently committed
   * native frame is what we read — this matters for the
   * `remeasureKey` and collapse-settled triggers, both of which
   * fire BEFORE the layout pass that produced the new strip
   * position has flushed onto native.
   *
   * The RAF is cancellable so back-to-back triggers within a single
   * frame coalesce into a single measure.
   *
   * PR-UX-16: also calls `measureAllTilesInWindow` so each
   * registered tile re-publishes its OWN current window bbox
   * (defends against any nesting / strip-relative skew).
   */
  const pendingRafRef = useRef<number | null>(null);
  const remeasureNow = useCallback(() => {
    if (pendingRafRef.current !== null) return;
    pendingRafRef.current = requestAnimationFrame(() => {
      pendingRafRef.current = null;
      const node = stripRef.current;
      if (node) {
        node.measureInWindow((x, y, w, h) => {
          if (!Number.isFinite(x) || !Number.isFinite(y)) return;
          if (w <= 0 || h <= 0) return;
          stripBboxRef.current = { x, y, w, h };
          // Synchronous fallback broadcast off the strip-relative
          // cache so consumers always have SOME bbox immediately.
          broadcast();
        });
      }
      // PR-UX-16: direct per-tile measure. Runs alongside the
      // strip+offset path so consumers always converge on the
      // measureInWindow-derived window coords.
      measureAllTilesInWindow();
    });
  }, [broadcast, measureAllTilesInWindow, stripRef]);

  // ── Strip's own onLayout ─────────────────────────────────────
  const onStripLayout = useCallback(
    (_e: LayoutChangeEvent) => {
      remeasureNow();
    },
    [remeasureNow],
  );

  // ── Per-tile onLayout (relative-offset capture) ──────────────
  //
  // Records each tile's offset within the strip's coordinate space
  // and broadcasts the resolved window bbox if the strip's window
  // position is already known. See the doc on
  // `AvatarStripBboxDerivationHandle.onTileLayout` for the
  // viewNode arg's role (PR-UX-15: needed for split-group nesting
  // where `event.nativeEvent.layout.x/y` is parent-relative, not
  // strip-relative).
  const recordTileOffset = useCallback(
    (techId: number, x: number, y: number, w: number, h: number) => {
      tileOffsetsRef.current.set(techId, { x, y, w, h });
      const strip = stripBboxRef.current;
      if (strip) {
        registerRef.current(techId, {
          x: strip.x + x,
          y: strip.y + y,
          w,
          h,
        });
      }
    },
    [],
  );

  const onTileLayout = useCallback(
    (techId: number, e: LayoutChangeEvent, viewNode?: View | null) => {
      const strip = stripRef.current;
      // Always record the parent-relative layout first as a synchronous
      // fallback. For single-level layouts (portrait) this IS the
      // strip-relative offset and is correct as-is. For nested
      // layouts (landscape splitMiddle) the measureLayout call
      // below will overwrite this with the more accurate
      // strip-relative offset.
      const { x: pX, y: pY, width: pW, height: pH } = e.nativeEvent.layout;
      recordTileOffset(techId, pX, pY, pW, pH);

      // PR-UX-16: register the tile's view node so subsequent
      // remeasure triggers can call measureInWindow on it directly
      // (bypassing the strip-relative derivation entirely). When
      // viewNode is omitted (legacy callers without a slot ref),
      // we silently skip — the strip-relative path is the fallback.
      if (viewNode) {
        tileNodesRef.current.set(techId, viewNode);
        // Also fire an immediate measureInWindow on this node so
        // the consumer gets accurate window coords on the very first
        // layout pass (instead of waiting for the next remeasure
        // trigger).
        const measurer = viewNode as unknown as {
          measureInWindow?: (
            callback: (x: number, y: number, w: number, h: number) => void,
          ) => void;
        };
        if (typeof measurer.measureInWindow === "function") {
          measurer.measureInWindow((x, y, w, h) => {
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            if (w <= 0 || h <= 0) return;
            registerRef.current(techId, { x, y, w, h });
          });
        }
      }

      // Preferred path (PR-UX-15): if the caller passed the tile's
      // host node AND the strip ref is mounted AND measureLayout is
      // available on the node, ask RN for the tile's offset
      // relative to the strip directly. This works for arbitrarily-
      // nested tile layouts (e.g. landscape's splitMiddle: the tile
      // is a grandchild of the strip's outer View, with a
      // splitGroup View in between).
      //
      // Feature-detect because jest's react-native/mockNativeComponent
      // doesn't always expose `measureLayout` on the wrapped host
      // instance — production iOS / Android always does. The
      // synchronous parent-relative fallback above keeps tests
      // working without extra stubbing. The PR-UX-16 direct
      // measureInWindow above is the load-bearing path on landscape;
      // measureLayout is kept as a secondary corroboration so the
      // strip-relative offset cache (used by the synchronous
      // `broadcast()` on remeasure) is also correct.
      if (
        viewNode &&
        strip &&
        typeof (viewNode as { measureLayout?: unknown }).measureLayout ===
          "function"
      ) {
        (
          viewNode as unknown as {
            measureLayout: (
              relativeToView: unknown,
              success: (x: number, y: number, w: number, h: number) => void,
              fail?: () => void,
            ) => void;
          }
        ).measureLayout(
          strip,
          (x: number, y: number, w: number, h: number) => {
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            if (w <= 0 || h <= 0) return;
            recordTileOffset(techId, x, y, w, h);
          },
          () => {
            // Fail callback: keep the synchronous parent-relative
            // offset already recorded above. The strip's own
            // remeasure will overwrite when it next fires.
          },
        );
      }
    },
    [recordTileOffset, stripRef],
  );

  // ── remeasureKey safety net ──────────────────────────────────
  useEffect(() => {
    if (remeasureKey === undefined) return;
    remeasureNow();
  }, [remeasureKey, remeasureNow]);

  // ── Reanimated reaction on optional collapse-progress SV ─────
  //
  // Hooks must be called unconditionally; we use an internal
  // dummy fallback so the worklet always has a defined SV to
  // dereference. When `collapseProgressSV` is null/undefined the
  // worklet sees a constant 0 and never fires the `runOnJS`
  // remeasure (the `prev === undefined` early-return covers the
  // initial registration, and there's never a true edge after).
  //
  // Reanimated's `useSharedValue` is a hook so we must always call
  // the same number of hooks per render — so we pass the SV (or
  // `undefined`) as a dependency and let the reaction self-gate
  // inside the worklet.
  useAnimatedReaction(
    () => {
      "worklet";
      const sv = collapseProgressSV;
      if (!sv) return -1;
      return sv.value;
    },
    (curr, prev) => {
      "worklet";
      if (curr === -1) return; // SV not provided
      if (prev === undefined || prev === null) return;
      if (curr === prev) return;
      // Only react when the animation settles to an endpoint. The
      // gesture-handler/spring writers in `<CollapsibleTop>`
      // converge on 0 or 1 via `withSpring(target, ...)` so a final
      // sample exactly equal to one of those endpoints is reliable.
      // Intermediate samples are skipped to avoid 60Hz remeasures
      // during the spring.
      const settled =
        (curr === 0 && prev !== 0) || (curr === 1 && prev !== 1);
      if (!settled) return;
      runOnJS(remeasureNow)();
    },
    [collapseProgressSV, remeasureNow],
  );

  // ── Cleanup on unmount ───────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pendingRafRef.current !== null) {
        cancelAnimationFrame(pendingRafRef.current);
        pendingRafRef.current = null;
      }
      // Drop every tile bbox the consumer was holding so a stale
      // entry doesn't haunt the hit-test after the strip vanishes
      // (rotation back to portrait, navigation away, etc.).
      for (const techId of tileOffsetsRef.current.keys()) {
        registerRef.current(techId, null);
      }
      tileOffsetsRef.current.clear();
      // PR-UX-16: also drop the per-tile node refs so a stale
      // unmounted view doesn't haunt the next remeasure.
      tileNodesRef.current.clear();
      stripBboxRef.current = null;
    };
  }, []);

  return useMemo(
    () => ({
      onStripLayout,
      onTileLayout,
      remeasureNow,
    }),
    [onStripLayout, onTileLayout, remeasureNow],
  );
}
