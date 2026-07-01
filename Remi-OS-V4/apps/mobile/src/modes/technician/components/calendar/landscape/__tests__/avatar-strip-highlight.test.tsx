/**
 * Tests for the AvatarStrip P2-FE-6 additions, refactored 2026-05-08
 * (PR-UX-6 / `2026-05-08-avatar-strip-bbox-derivation`):
 *
 *   - `dragHighlightedTechIdSV`: per-tile animated style reads this
 *     SharedValue and paints a 2pt blue ring + scale on the matching
 *     tile.
 *   - `onTileLayout`: receives WINDOW-coord bboxes derived from
 *     `stripWindowBbox + tileRelativeOffset`. The strip's outer
 *     view is the single window-position source-of-truth; each tile
 *     reports its parent-relative offset via its own `onLayout` and
 *     the strip-level hook combines them.
 *
 * Strategy
 * ────────
 * Reanimated's `useAnimatedStyle` runs as a worklet — in the Jest
 * runtime (no UI thread) the returned style object is the worklet's
 * output for the SV's CURRENT value at render time. By passing a
 * pre-mutated SV-like object with `value: techId` we drive the
 * worklet to its "highlighted" branch and assert the painted style.
 *
 * For `onTileLayout`: the strip's `measureInWindow` is stubbed once
 * (it's the only window-coord call now, replacing the per-slot
 * `measureInWindow` of the legacy P2-FE-6 implementation), and each
 * slot's onLayout is fired with a relative offset. The hook RAFs
 * the strip measure, so we run RAF callbacks manually before
 * asserting.
 *
 * NOTE (executable spec): excluded from `tsc --noEmit` via
 * `**\/__tests__\/**` in `tsconfig.json`. Same caveat as the other
 * landscape tests.
 */

// ── Reanimated mock ────────────────────────────────────────────────
//
// Real Reanimated's `useAnimatedStyle` returns an opaque managed
// style object whose worklet output is invisible to JS. For these
// tests we replace the hook with one that immediately invokes the
// worklet and returns its plain literal — the rendered tree then
// has the resolved style object directly on the Animated.View, so
// we can assert on `borderWidth`, `borderColor`, etc.
//
// `useSharedValue` keeps its real semantics (returns a mutable
// `{ value }` cell). `Animated.View` from the default export is
// passed through to the underlying RN `<View>` which carries the
// merged style.
jest.mock("react-native-reanimated", () => {
  const React = require("react");
  const { View } = require("react-native");
  const useSharedValue = <T,>(initial: T) => {
    const ref = React.useRef({ value: initial });
    return ref.current;
  };
  const useAnimatedStyle = (worklet: () => Record<string, unknown>) =>
    worklet();
  const useAnimatedReaction = () => undefined;
  const runOnJS =
    <Args extends unknown[], R>(fn: (...args: Args) => R) =>
    (...args: Args) =>
      fn(...args);
  const AnimatedView = React.forwardRef(function AnimatedView(
    props: Record<string, unknown>,
    ref: unknown,
  ) {
    return React.createElement(View, { ...props, ref });
  });
  // Gesture-handler's Wrap.tsx calls `createAnimatedComponent` at
  // import-time; provide a passthrough so transitive imports of the
  // vendored calendar don't blow up before our specs even run.
  const createAnimatedComponent = (Comp: unknown) => Comp;
  return {
    __esModule: true,
    default: { View: AnimatedView, createAnimatedComponent },
    useSharedValue,
    useAnimatedStyle,
    useAnimatedReaction,
    runOnJS,
    createAnimatedComponent,
  };
});

// The vendored `react-native-resource-calendar` is a heavyweight
// dependency that imports Skia, gesture-handler, etc. at module load
// time. The avatar-strip itself only needs the `NO_HIGHLIGHTED_TECH`
// sentinel and `AvatarBbox` type from `use-drag-to-avatar`, which in
// turn only imports `useDragSharedValues` from the vendor lib. Stub
// the vendor lib so the strip's transitive load tree stays trivial.
jest.mock("react-native-resource-calendar", () => ({
  __esModule: true,
  useDragSharedValues: () => ({
    panXAbs: { value: 0 },
    panYAbs: { value: 0 },
    isDragging: { value: false },
  }),
}));

// eslint-disable-next-line import/no-unresolved -- @testing-library/react-native lands with the jest-expo runner.
import { fireEvent, render } from "@testing-library/react-native";

// Force every `View.measureInWindow(cb)` call in the test render
// tree to return a deterministic window bbox so the per-tile layout
// callback fires with predictable numbers.
beforeAll(() => {
  // RN's View prototype isn't directly addressable from JS in the
  // test runtime (it's a host component), but the host-component
  // shim exposes a method jest can stub via the underlying
  // `UIManager.measureInWindow`. Mocking the prop-level callback is
  // brittle, so we monkey-patch on each render via a ref helper.
  // We use jest.spyOn on the React Native module instead.
  // Simpler: stub the host node's `measureInWindow` after render
  // by walking the test tree's nodes and patching each. Done in
  // each test below.
});

import {
  AvatarStrip,
  type AvatarStripTech,
} from "../avatar-strip";
import { NO_HIGHLIGHTED_TECH } from "../use-drag-to-avatar";

const TECHS: AvatarStripTech[] = [
  { id: 11, name: "Alex" },
  { id: 22, name: "Bea" },
  { id: 33, name: "Cam" },
];

/**
 * A SharedValue-shaped stand-in. Reanimated's `useAnimatedStyle`
 * worklet only reads `.value`, so this works even without driving
 * the real Reanimated runtime.
 */
function makeSV<T>(initial: T): { value: T } {
  return { value: initial };
}

/**
 * Stub the STRIP's window measure + fire its onLayout. Under PR-UX-6
 * strip-level bbox derivation, the outer strip's `measureInWindow`
 * is the single window-coord source — per-slot measureInWindow is
 * gone. Tile bboxes resolve to `stripWindowBbox + tileRelativeOffset`.
 *
 * The strip carries `testID="avatar-strip"` (single-scroll) or
 * `testID="avatar-strip-split"` (split layout). We patch whichever
 * one the rendered tree contains.
 */
function setupStripMeasure(
  utils: ReturnType<typeof render>,
  bbox: { x: number; y: number; w: number; h: number },
) {
  const stub = (cb: (x: number, y: number, w: number, h: number) => void) => {
    cb(bbox.x, bbox.y, bbox.w, bbox.h);
  };
  const stripNode =
    utils.queryByTestId("avatar-strip") ??
    utils.queryByTestId("avatar-strip-split");
  if (!stripNode) {
    throw new Error("No avatar-strip outer View found in rendered tree");
  }
  // `react-native/jest/mockNativeComponent` wraps every host View in
  // a class component whose `measureInWindow` is a `jest.fn()`
  // instance property. `stripRef.current` points at that class
  // instance. Patch every candidate node from the test tree that has
  // a `measureInWindow` property — the actual ref'd one is amongst
  // them.
  const allNodes = utils.UNSAFE_root.findAll(() => true);
  let patchedAny = false;
  for (const node of allNodes) {
    const candidates: Array<unknown> = [
      node,
      (node as { instance?: unknown }).instance,
    ];
    for (const c of candidates) {
      if (
        c != null &&
        typeof (c as { measureInWindow?: unknown }).measureInWindow ===
          "function"
      ) {
        (c as { measureInWindow: typeof stub }).measureInWindow = stub;
        patchedAny = true;
      }
    }
  }
  if (!patchedAny) {
    throw new Error("No measurable host instance found");
  }
  // Fire the strip's onLayout so the hook RAFs `measureInWindow`.
  fireEvent(stripNode, "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: bbox.w, height: bbox.h } },
  });
  return stripNode;
}

/**
 * Flush all pending requestAnimationFrame callbacks. The strip-level
 * bbox-derivation hook RAF-defers `measureInWindow` so we always
 * read the post-commit native frame. jest-expo polyfills RAF as
 * setTimeout(fn, 16); a 50ms macrotask delay covers it.
 */
function flushRaf() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 50);
  });
}

/**
 * Locate the per-tile ring `Animated.View` inside a slot. The ring
 * is the unique node whose `style.borderRadius` is set (the worklet
 * output always includes a `borderRadius`, while the outer slot
 * `View`'s style does not). This survives any reordering of inner
 * `<View>` descendants from `TechAvatarChip`.
 */
function findRingStyle(
  slot: ReturnType<ReturnType<typeof render>["getByTestId"]>,
): Record<string, unknown> {
  const candidate = slot.findAll((n) => {
    const style = (n.props as { style?: unknown } | undefined)?.style;
    return (
      typeof style === "object" &&
      style !== null &&
      !Array.isArray(style) &&
      "borderRadius" in (style as object)
    );
  })[0];
  if (!candidate) {
    throw new Error("No ring node found inside slot");
  }
  return (candidate.props as { style: Record<string, unknown> }).style;
}

describe("AvatarStrip — drag highlight ring (P2-FE-6)", () => {
  it("paints the highlight ring on the tile whose techId matches dragHighlightedTechIdSV", () => {
    const highlight = makeSV<number>(22);
    const utils = render(
      <AvatarStrip
        techs={TECHS}
        selectedTechIds={[]}
        onToggleTech={() => undefined}
        dragHighlightedTechIdSV={highlight}
      />,
    );

    const style = findRingStyle(utils.getByTestId("avatar-strip-slot-22"));
    expect(style.borderWidth).toBe(2);
    expect(style.borderColor).toBe("#3B82F6");
    // Tile is scaled up while highlighted.
    expect(style.transform).toEqual([{ scale: 1.12 }]);
  });

  it("does NOT paint the highlight ring on non-matching tiles", () => {
    const highlight = makeSV<number>(22);
    const utils = render(
      <AvatarStrip
        techs={TECHS}
        selectedTechIds={[]}
        onToggleTech={() => undefined}
        dragHighlightedTechIdSV={highlight}
      />,
    );

    const style = findRingStyle(utils.getByTestId("avatar-strip-slot-11"));
    expect(style.borderWidth).toBe(0);
    // Border color is still set ("transparent") so the layout
    // doesn't reflow when a frame later sets it to blue.
    expect(style.borderColor).toBe("transparent");
    expect(style.transform).toEqual([{ scale: 1 }]);
  });

  it("falls back to the no-highlight branch when dragHighlightedTechIdSV is omitted (backwards compat)", () => {
    const utils = render(
      <AvatarStrip
        techs={TECHS}
        selectedTechIds={[]}
        onToggleTech={() => undefined}
      />,
    );

    for (const tech of TECHS) {
      const style = findRingStyle(
        utils.getByTestId(`avatar-strip-slot-${tech.id}`),
      );
      expect(style.borderWidth).toBe(0);
    }
  });
});

describe("AvatarStrip — onTileLayout (PR-UX-6 strip-level derivation)", () => {
  it("derives each tile's window bbox from the strip's window position + the tile's relative offset", async () => {
    const onTileLayout = jest.fn();
    const utils = render(
      <AvatarStrip
        techs={TECHS}
        selectedTechIds={[]}
        onToggleTech={() => undefined}
        onTileLayout={onTileLayout}
      />,
    );

    // Strip's window position — under PR-UX-6 this is the SINGLE
    // window-coord source. Everything else is derived from it.
    setupStripMeasure(utils, { x: 700, y: 100, w: 44, h: 999 });

    // Fire each slot's onLayout with a relative offset that's
    // distinct per-tile so we can tell which window bbox came from
    // which slot. RN reports tile layout RELATIVE to its parent
    // (the strip's content container), so y-offset accumulates by
    // ~44pt per slot in the vertical landscape strip.
    fireEvent(utils.getByTestId("avatar-strip-slot-11"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 34, height: 44 } },
    });
    fireEvent(utils.getByTestId("avatar-strip-slot-22"), "layout", {
      nativeEvent: { layout: { x: 0, y: 44, width: 34, height: 44 } },
    });
    fireEvent(utils.getByTestId("avatar-strip-slot-33"), "layout", {
      nativeEvent: { layout: { x: 0, y: 88, width: 34, height: 44 } },
    });

    // Drain the RAF that `setupStripMeasure` queued, so the strip's
    // measureInWindow callback actually fires and broadcasts the
    // resolved window bboxes to the consumer.
    await flushRaf();

    // The hook re-broadcasts on every tile registration once the
    // strip's bbox is known, AND on every strip remeasure. Total
    // calls is therefore ≥3; we assert each tile's window bbox is
    // present at least once.
    expect(onTileLayout).toHaveBeenCalledWith(11, {
      x: 700,
      y: 100,
      w: 34,
      h: 44,
    });
    expect(onTileLayout).toHaveBeenCalledWith(22, {
      x: 700,
      y: 144,
      w: 34,
      h: 44,
    });
    expect(onTileLayout).toHaveBeenCalledWith(33, {
      x: 700,
      y: 188,
      w: 34,
      h: 44,
    });
  });

  it("fires onTileLayout(techId, null) on strip unmount so the consumer can drop every stale bbox", async () => {
    const onTileLayout = jest.fn();
    const utils = render(
      <AvatarStrip
        techs={TECHS}
        selectedTechIds={[]}
        onToggleTech={() => undefined}
        onTileLayout={onTileLayout}
      />,
    );

    // Register relative offsets for every tile + the strip bbox so
    // the hook actually has them tracked. Without this, unmount
    // would have nothing to clear (the empty-map case).
    setupStripMeasure(utils, { x: 700, y: 100, w: 44, h: 999 });
    fireEvent(utils.getByTestId("avatar-strip-slot-11"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 34, height: 44 } },
    });
    fireEvent(utils.getByTestId("avatar-strip-slot-22"), "layout", {
      nativeEvent: { layout: { x: 0, y: 44, width: 34, height: 44 } },
    });
    fireEvent(utils.getByTestId("avatar-strip-slot-33"), "layout", {
      nativeEvent: { layout: { x: 0, y: 88, width: 34, height: 44 } },
    });
    await flushRaf();

    onTileLayout.mockClear();
    utils.unmount();

    // The hook clears every tracked tile centrally on unmount —
    // each tile id seen above gets a single `null` bcast.
    expect(onTileLayout).toHaveBeenCalledWith(11, null);
    expect(onTileLayout).toHaveBeenCalledWith(22, null);
    expect(onTileLayout).toHaveBeenCalledWith(33, null);
  });
});
