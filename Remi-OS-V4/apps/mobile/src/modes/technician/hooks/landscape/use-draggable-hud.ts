/**
 * `useDraggableHud` (PR-UX-11, 2026-05-09).
 *
 * Long-press-armed drag handler for landscape-anchored corner controls
 * (the chip bar above the calendar canvas, the Pending Reality HUD
 * pencil pill on the opposite-strip edge). Long-pressing the hosted
 * element for ~250ms arms drag mode (haptic feedback fires); the user
 * can then drag the element to any of SIX snap targets — top-left,
 * top-center, top-right, bottom-left, bottom-center, bottom-right —
 * and release to snap.
 *
 * The chosen anchor PERSISTS across app launches via AsyncStorage,
 * scoped per-storageKey so the chip bar and HUD remember their own
 * positions independently. This was an explicit user request in the
 * PR-UX-11 redirect: *"release snaps to nearest of 4 corners ... OR
 * top-center / bottom-center, whichever is more natural. Persist the
 * chosen corner via AsyncStorage so it survives reload."*
 *
 * # Why we use react-native-gesture-handler (not PanResponder)
 *
 * The previous attempt (PR-UX-10) used React Native's PanResponder
 * with `pointerEvents="box-none"` on the wrapper, which silently broke
 * the long-press detection: `box-none` makes the View transparent to
 * touches, which means `onStartShouldSetPanResponder` is never called,
 * which means the long-press timer never starts. The user's PR-UX-10
 * smoke confirmed the hook was mounted (`isDraggable: true` from the
 * `[DIAG-CHIP-DRAG]` / `[DIAG-PENCIL]` logs) but long-pressing did
 * NOTHING.
 *
 * RNGH composes long-press + pan via `Gesture.Simultaneous` and uses
 * its own native-thread touch tracker that DOES NOT depend on
 * `pointerEvents`. The wrapper can stay full-touch-capturing AND its
 * inner Pressable's `onPress` still fires for short taps because
 * RNGH's gestures only "claim" the touch after they activate (LongPress
 * needs ~250ms hold; Pan with `manualActivation(true)` waits for an
 * explicit activate signal from the long-press). A quick tap activates
 * neither, so the touch flows through to the Pressable as expected.
 *
 * # User-facing behavior
 *
 * 1. Tap the controlled element (< 250ms hold, < 4pt drift) → the
 *    inner Pressable's `onPress` fires (chip selection / HUD route).
 * 2. Hold the controlled element for 250ms without moving → drag arms
 *    + medium haptic + opacity drop to 0.85 + iOS shadow lift.
 * 3. While armed, finger movement drags the element via Animated
 *    transform.
 * 4. Release → element snaps to the nearest of six anchors based on
 *    the release point. Light haptic on snap.
 * 5. The new corner persists to AsyncStorage and is restored on the
 *    next mount.
 *
 * # API
 *
 * The hook returns:
 *   - `gesture`: spread into a `<GestureDetector gesture={gesture}>`
 *     wrapper around the controlled element. Composed long-press +
 *     pan; both are simultaneous so a long-press can immediately
 *     transition into a drag without finger lift.
 *   - `style`: an array of style objects to spread on the element.
 *     Sets the absolute-position corner anchor + Reanimated transform
 *     + opacity / shadow feedback while dragging.
 *   - `corner`: the active corner (string union including the two
 *     center positions). Useful for screen-reader announcements / DEV
 *     overlays.
 *   - `isDragging`: true while the user has the element in flight.
 *     Inner Pressable should suppress `onPress` while dragging
 *     (otherwise the release's PressOut can fire onPress synchronously
 *     on some RN versions).
 *   - `onLayout`: forward to the controlled View's `onLayout` so the
 *     hook can capture the element's dimensions for any future snap
 *     refinement.
 *
 * # Anti-instructions
 *
 * - Don't extend this to free-place anywhere on screen. Master plan
 *   §5.1 (chrome accounting) is explicit about chrome budget on the
 *   landscape canvas; allowing mid-grid placement would obstruct
 *   event interaction with no escape. Six snap targets is the
 *   contract.
 * - Don't lower the long-press arm threshold below 220ms. Lower
 *   numbers cause the inner Pressable's onPress to misfire as
 *   long-press for fast-but-firm taps; the user reported this on the
 *   PR-UX-10 smoke as "long pressing does nothing" — it WAS doing
 *   something, but the threshold timing was wrong (PanResponder issue
 *   notwithstanding).
 * - Don't drop AsyncStorage persistence. The user explicitly asked
 *   for "Persist the chosen corner via AsyncStorage so it survives
 *   reload." If product later changes its mind, gate persistence
 *   behind an opt-in option rather than removing.
 * - Don't switch back to `pointerEvents="box-none"` on the wrapper.
 *   That was the silent bug from PR-UX-10. RNGH's gesture detection
 *   doesn't depend on it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Platform,
  type LayoutChangeEvent,
  type ViewStyle,
} from "react-native";
import { Gesture, type ComposedGesture } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type AnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { haptic } from "@technician/hooks/utility/use-haptics";

export type HudCorner =
  | "tl"
  | "tc"
  | "tr"
  | "bl"
  | "bc"
  | "br";

export interface UseDraggableHudOptions {
  /**
   * Default corner the HUD anchors to before any drag override and
   * before AsyncStorage rehydration completes. Pick whatever the
   * legacy non-draggable layout used (chip bar = "tc", HUD pill =
   * "tl" or "tr" per preferred-hand).
   */
  defaultCorner: HudCorner;
  /**
   * Visual padding (pt) from the chosen corner edge. Defaults to 8pt.
   * Top-center and bottom-center anchors apply this only on the
   * vertical axis (horizontally they're zero-inset across the full
   * width).
   */
  edgeInset?: number;
  /**
   * Long-press duration (ms) before drag arms. Default 250ms, the
   * sweet spot for "deliberate hold" without misfiring on firm taps.
   * The PR-UX-10 attempt used 200ms; users reported the chip bar
   * felt "sticky" on quick taps — bumped to 250ms here. Don't go
   * below 220ms.
   */
  armDurationMs?: number;
  /**
   * AsyncStorage key for persisting the user-chosen corner. Required
   * — the user asked for cross-launch persistence. Pass a stable
   * unique key per controlled element (e.g.
   * `"@remi/landscape-hud-corner/chip-bar"`).
   */
  storageKey: string;
  /**
   * 2026-05-10 — invoked on the JS thread immediately after a snap
   * commits. Receives the release finger position in window
   * coordinates plus the captured screen dimensions so callers can
   * layer additional behavior on top of the snap (e.g., the chip
   * bar's "drag to top/bottom edge to collapse" affordance). Fires
   * AFTER `corner` state + AsyncStorage persist + light haptic, so
   * the snap is already visually committed when this runs.
   *
   * The callback MUST be stable across renders if the caller cares
   * about gesture re-creation cost (the inner `useMemo` includes
   * `commitSnap` in its deps; a new `onSnap` identity on every
   * render rebuilds the gesture). Wrap in `useCallback`.
   */
  onSnap?: (info: {
    corner: HudCorner;
    releaseFingerX: number;
    releaseFingerY: number;
    windowWidth: number;
    windowHeight: number;
  }) => void;
}

export interface UseDraggableHudHandle {
  /** Spread into `<GestureDetector gesture={...}>` around the wrapper. */
  gesture: ComposedGesture;
  /**
   * Spread alongside the element's existing styles. Sets the
   * absolute-position corner anchor + the in-flight transform.
   */
  style: AnimatedStyle<ViewStyle>[];
  /** Active corner — useful for a11y announcements / debug. */
  corner: HudCorner;
  /** True while the user has the element in flight. */
  isDragging: boolean;
  /**
   * Forward to the controlled View's `onLayout`. The hook captures
   * width/height for any future snap-refinement that needs them.
   */
  onLayout: (e: LayoutChangeEvent) => void;
}

const DEFAULT_EDGE_INSET = 8;
const DEFAULT_ARM_DURATION_MS = 250;
const DEFAULT_HUD_W = 44;
const DEFAULT_HUD_H = 44;

/**
 * Build the absolute-position corner anchor style for a given corner +
 * edge inset.
 *
 * All six corners use `left: 0, right: 0` so the wrapper itself
 * always spans the full safe-area band horizontally, with the inner
 * controlled element pinned via `alignItems`. Horizontal placement:
 *
 *   - `tl`/`bl` → `alignItems: "flex-start"` + `paddingLeft:
 *     edgeInset`. Inner element hugs the left edge.
 *   - `tc`/`bc` → `alignItems: "center"`. Inner element is centered.
 *   - `tr`/`br` → `alignItems: "flex-end"` + `paddingRight:
 *     edgeInset`. Inner element hugs the right edge.
 *
 * Why full-width band instead of single-axis anchor:
 *
 * PR-UX-13 (2026-05-09) Issue A. The PR-UX-11 implementation used
 * single-axis anchors for non-center corners (`top: edgeInset, left:
 * edgeInset` for `tl`, etc.), leaving the wrapper's width
 * unconstrained. The chip bar's child layout (a horizontal flex with
 * `flex: 1` on the carousel header) collapses to the natural width
 * of the leading "Show all" pill (~95pt) when the parent is
 * width-unbounded — visible flex:1 children resolve to 0 in
 * indeterminate-width parents. The user reported "the chips
 * container for the dots is still too small to read what it
 * contains" with the chip bar at the default `tc` corner; the same
 * geometry collision (anchor's `left: 0, right: 0` vs. an inline
 * `maxWidth: "70%"`) that caused the regression at `tc` would have
 * collapsed even further at single-axis corners. Switching every
 * corner to a full-width band gives the inner element a determinate
 * parent width on every position.
 *
 * Touch impact: the wrapper's full-width band can intercept more
 * pointer events than the previous content-width box, but RNGH's
 * gestures don't claim a touch until they activate (LongPress fires
 * at 250ms; Pan waits for explicit `state.activate()` from the
 * long-press onStart). Quick taps inside the band but outside the
 * inner element fall through to the layer below as before. The
 * `pointerEvents="box-none"` on the chip bar's outer safe-area
 * wrapper (in `LandscapeWorkweekView.tsx`) does not need to change
 * — that's a different ancestor.
 */
function cornerAnchorStyle(
  corner: HudCorner,
  edgeInset: number,
): ViewStyle {
  const horizontal: Pick<
    ViewStyle,
    "left" | "right" | "alignItems" | "paddingLeft" | "paddingRight"
  > = {
    left: 0,
    right: 0,
  };
  switch (corner) {
    case "tl":
    case "bl":
      horizontal.alignItems = "flex-start";
      horizontal.paddingLeft = edgeInset;
      break;
    case "tc":
    case "bc":
      horizontal.alignItems = "center";
      break;
    case "tr":
    case "br":
      horizontal.alignItems = "flex-end";
      horizontal.paddingRight = edgeInset;
      break;
  }
  switch (corner) {
    case "tl":
    case "tc":
    case "tr":
      return { position: "absolute", top: edgeInset, ...horizontal };
    case "bl":
    case "bc":
    case "br":
      return { position: "absolute", bottom: edgeInset, ...horizontal };
  }
}

/**
 * Pick the closest of the 6 snap targets to the finger's release
 * position. Top/bottom by Y midline; left/center/right by X thirds.
 *
 * Pure helper — `windowWidth`/`windowHeight` are the screen
 * dimensions captured at drag start (so a rotation mid-gesture
 * doesn't confuse the snap math).
 */
export function pickHudCorner(
  fingerWindowX: number,
  fingerWindowY: number,
  windowWidth: number,
  windowHeight: number,
): HudCorner {
  const isTop = fingerWindowY < windowHeight / 2;
  const oneThird = windowWidth / 3;
  let horizontal: "l" | "c" | "r";
  if (fingerWindowX < oneThird) horizontal = "l";
  else if (fingerWindowX < oneThird * 2) horizontal = "c";
  else horizontal = "r";
  return `${isTop ? "t" : "b"}${horizontal}` as HudCorner;
}

export function useDraggableHud(
  opts: UseDraggableHudOptions,
): UseDraggableHudHandle {
  const {
    defaultCorner,
    edgeInset = DEFAULT_EDGE_INSET,
    armDurationMs = DEFAULT_ARM_DURATION_MS,
    storageKey,
    onSnap,
  } = opts;

  const [corner, setCorner] = useState<HudCorner>(defaultCorner);
  const [isDragging, setIsDragging] = useState(false);

  // Track the element's measured size for any future snap refinement.
  // Currently unused by the snap math (we snap by finger-position
  // zone, not by element-centroid distance), but captured so a future
  // change can refine without an API break.
  const sizeRef = useRef<{ w: number; h: number }>({
    w: DEFAULT_HUD_W,
    h: DEFAULT_HUD_H,
  });

  // Reanimated SVs for the in-flight drag offset. Reset to zero on
  // release after the corner re-anchors so the element doesn't paint
  // a frame at the new corner + accumulated transform.
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  // Drag-state SV mirrored from React state so the gesture worklet
  // can read it without a useState cycle (worklets can't call
  // useState).
  const isDraggingSV = useSharedValue(false);
  // Window dimensions captured at drag start — see pickHudCorner.
  const windowWWRef = useSharedValue(0);
  const windowHHRef = useSharedValue(0);
  const dragStartFingerXRef = useSharedValue(0);
  const dragStartFingerYRef = useSharedValue(0);

  // ── AsyncStorage rehydration (one-shot per mount) ────────────
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(storageKey)
      .then((stored) => {
        if (cancelled) return;
        if (
          stored === "tl" ||
          stored === "tc" ||
          stored === "tr" ||
          stored === "bl" ||
          stored === "bc" ||
          stored === "br"
        ) {
          setCorner(stored);
        }
      })
      .catch((err) => {
        if (__DEV__) {
          console.warn(
            "[useDraggableHud] AsyncStorage rehydration failed",
            { storageKey, err: String(err) },
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  // Persist a chosen corner. Fire-and-forget; errors logged in __DEV__.
  const persistCorner = useCallback(
    (c: HudCorner) => {
      AsyncStorage.setItem(storageKey, c).catch((err) => {
        if (__DEV__) {
          console.warn(
            "[useDraggableHud] AsyncStorage persist failed",
            { storageKey, corner: c, err: String(err) },
          );
        }
      });
    },
    [storageKey],
  );

  // JS-thread snap commit + state sync. Called via runOnJS from the
  // pan gesture's onEnd worklet.
  const commitSnap = useCallback(
    (
      releaseFingerX: number,
      releaseFingerY: number,
      ww: number,
      wh: number,
    ) => {
      const next = pickHudCorner(releaseFingerX, releaseFingerY, ww, wh);
      setCorner(next);
      setIsDragging(false);
      persistCorner(next);
      haptic.light();
      // 2026-05-10 — fire the caller's post-snap hook so consumers
      // can layer behavior (chip bar's drag-to-edge collapse).
      // Runs after the snap is visually committed; failures inside
      // the callback don't reverse the snap.
      if (onSnap) {
        try {
          onSnap({
            corner: next,
            releaseFingerX,
            releaseFingerY,
            windowWidth: ww,
            windowHeight: wh,
          });
        } catch (err) {
          if (__DEV__) {
            console.warn(
              "[useDraggableHud] onSnap callback threw",
              { storageKey, err: String(err) },
            );
          }
        }
      }
    },
    [onSnap, persistCorner, storageKey],
  );

  const cancelDragJS = useCallback(() => {
    setIsDragging(false);
  }, []);

  const armDragJS = useCallback(() => {
    setIsDragging(true);
    haptic.medium();
  }, []);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      sizeRef.current = { w: width, h: height };
    }
  }, []);

  // ── Gesture composition ─────────────────────────────────────
  //
  // LongPress(250ms) → arms drag (sets isDraggingSV true on UI thread).
  // Pan(manualActivation) → activates only after isDraggingSV = true,
  //   then tracks finger via translateX/Y SVs. On end: snap to nearest
  //   corner (computed from release finger window-coords).
  //
  // Both gestures run simultaneously so the long-press hold can
  // transition into a drag without the user lifting their finger.
  //
  // The wrapper VIEW does NOT need `pointerEvents="box-none"` for
  // RNGH to work; in fact setting that breaks RNGH's hit-testing
  // because RNGH walks RN's native view tree and respects
  // pointerEvents. Leave the wrapper at the default
  // pointerEvents="auto" so RNGH can grab touches when its gestures
  // activate.
  const gesture = useMemo<ComposedGesture>(() => {
    const longPress = Gesture.LongPress()
      .minDuration(armDurationMs)
      .maxDistance(20)
      .onStart(() => {
        "worklet";
        isDraggingSV.value = true;
        runOnJS(armDragJS)();
      });

    const pan = Gesture.Pan()
      .manualActivation(true)
      .onTouchesDown((e) => {
        "worklet";
        // Capture the initial finger window position + screen dims
        // so onEnd can compute the release zone without re-measuring.
        const t = e.allTouches[0];
        if (t) {
          dragStartFingerXRef.value = t.absoluteX;
          dragStartFingerYRef.value = t.absoluteY;
        }
      })
      .onTouchesMove((_e, state) => {
        "worklet";
        if (isDraggingSV.value) {
          state.activate();
        }
      })
      .onUpdate((e) => {
        "worklet";
        if (!isDraggingSV.value) return;
        translateX.value = e.translationX;
        translateY.value = e.translationY;
      })
      .onEnd((e) => {
        "worklet";
        if (!isDraggingSV.value) return;
        const fingerEndX = dragStartFingerXRef.value + e.translationX;
        const fingerEndY = dragStartFingerYRef.value + e.translationY;
        const ww = windowWWRef.value;
        const wh = windowHHRef.value;
        // Reset translation BEFORE the JS thread re-anchors the
        // corner so the element doesn't paint a frame at the new
        // corner + accumulated transform. `withTiming` smooths the
        // brief snap so the user doesn't see a teleport flash if the
        // chosen corner happens to be near the release position.
        translateX.value = withTiming(0, { duration: 120 });
        translateY.value = withTiming(0, { duration: 120 });
        isDraggingSV.value = false;
        runOnJS(commitSnap)(fingerEndX, fingerEndY, ww, wh);
      })
      .onFinalize(() => {
        "worklet";
        if (isDraggingSV.value) {
          // Termination without onEnd (e.g. gesture cancelled by
          // higher-priority gesture). Reset state defensively.
          translateX.value = withTiming(0, { duration: 120 });
          translateY.value = withTiming(0, { duration: 120 });
          isDraggingSV.value = false;
          runOnJS(cancelDragJS)();
        }
      });

    return Gesture.Simultaneous(longPress, pan);
  }, [
    armDragJS,
    armDurationMs,
    cancelDragJS,
    commitSnap,
    dragStartFingerXRef,
    dragStartFingerYRef,
    isDraggingSV,
    translateX,
    translateY,
    windowHHRef,
    windowWWRef,
  ]);

  // Capture window dims when isDragging flips to true on JS side.
  // Window dims rarely change, but we re-read on every drag start so
  // a rotation mid-session doesn't confuse the snap math.
  useEffect(() => {
    if (isDragging) {
      const win = Dimensions.get("window");
      windowWWRef.value = win.width;
      windowHHRef.value = win.height;
    }
  }, [isDragging, windowHHRef, windowWWRef]);

  // ── Style assembly ─────────────────────────────────────────
  const animatedTransformStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const style = useMemo<AnimatedStyle<ViewStyle>[]>(() => {
    const anchor = cornerAnchorStyle(corner, edgeInset);
    const dragFeedback: ViewStyle = isDragging
      ? {
          opacity: 0.85,
          ...(Platform.OS === "ios"
            ? {
                shadowColor: "#000",
                shadowOpacity: 0.35,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 6 },
              }
            : { elevation: 12 }),
        }
      : {};
    return [anchor, dragFeedback, animatedTransformStyle];
  }, [animatedTransformStyle, corner, edgeInset, isDragging]);

  return {
    gesture,
    style,
    corner,
    isDragging,
    onLayout,
  };
}

/**
 * Re-export Animated so call sites importing `Animated.View` from
 * react-native-reanimated don't have to add a parallel import.
 */
export { Animated };

// Type alias retained for compatibility with tests written against the
// PR-UX-10 hook surface. The new hook uses `ComposedGesture` for the
// gesture handle; `SharedValue` is exported for tests that want to
// peek at internal SVs (none currently do).
export type { ComposedGesture, SharedValue };
