/**
 * Tests for `useAvatarStripBboxDerivation` (PR-UX-6, 2026-05-08;
 * see PLAN-DEVIATION 2026-05-08-avatar-strip-bbox-derivation).
 *
 * Coverage axes:
 *
 *   1. Strip-level remeasure broadcasts every registered tile's
 *      window bbox = stripWindow + tileRelativeOffset.
 *   2. Tile-relative offsets are captured via the tile's onLayout
 *      event (parent-relative `nativeEvent.layout`) and combined
 *      with the strip's window bbox.
 *   3. `remeasureKey` change triggers a strip-level remeasure on
 *      the next RAF.
 *   4. `collapseProgressSV` settled-edge crossing triggers a
 *      remeasure (UI-thread reaction → JS-thread `runOnJS`).
 *   5. Unmount clears every registered tile.
 *
 * NOTE (executable spec): excluded from `tsc --noEmit` via
 * `**\/__tests__\/**` in `tsconfig.json`. Same caveat as the rest
 * of the calendar test suite.
 */

import { renderHook, act } from "@testing-library/react-native";
import { useRef } from "react";
import type { LayoutChangeEvent, View } from "react-native";

// ── Reanimated mock ──────────────────────────────────────────────
//
// The hook registers ONE `useAnimatedReaction` (the
// collapseProgressSV watcher). We capture it so tests can drive
// settled-edge crossings synchronously.
const reactionRegistrations: Array<{
  prepare: () => unknown;
  react: (curr: unknown, prev: unknown | undefined) => void;
}> = [];

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  useSharedValue: <T,>(initial: T) => ({ value: initial }),
  useAnimatedReaction: (
    prepare: () => unknown,
    react: (curr: unknown, prev: unknown | undefined) => void,
  ) => {
    reactionRegistrations.push({ prepare, react });
  },
  runOnJS: (fn: (...args: unknown[]) => void) => fn,
  default: {},
}));

// Drag SVs aren't read by THIS hook, but the consumer-side type
// `AvatarBbox` is imported from `use-drag-to-avatar` which DOES
// pull `useDragSharedValues`. Stub so the import tree is trivial.
jest.mock("react-native-resource-calendar", () => ({
  __esModule: true,
  useDragSharedValues: () => ({
    panXAbs: { value: 0 },
    panYAbs: { value: 0 },
    isDragging: { value: false },
    fingerXAbs: { value: Number.NaN },
    fingerYAbs: { value: Number.NaN },
  }),
}));

// eslint-disable-next-line import/first -- after the mocks above.
import { useAvatarStripBboxDerivation } from "../use-avatar-strip-bbox-derivation";

beforeEach(() => {
  reactionRegistrations.length = 0;
});

/**
 * Mock View ref that has a `measureInWindow` we can drive. The
 * hook reads `stripRef.current?.measureInWindow(cb)`; the cb
 * receives `(x, y, w, h)`. Tests set `mockBbox` and then trigger
 * a remeasure to push the resolved bboxes through.
 */
function makeStripRefStub(): {
  ref: React.RefObject<View | null>;
  setBbox: (b: { x: number; y: number; w: number; h: number }) => void;
} {
  let bbox = { x: 0, y: 0, w: 0, h: 0 };
  const stub = {
    measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => {
      cb(bbox.x, bbox.y, bbox.w, bbox.h);
    },
  };
  // Cast through unknown — the hook only ever calls
  // `node.measureInWindow(cb)` so the stub shape matches the
  // surface area used.
  const ref = { current: stub as unknown as View };
  return {
    ref: ref as React.RefObject<View | null>,
    setBbox: (b) => {
      bbox = b;
    },
  };
}

/**
 * Build a fake LayoutChangeEvent with the given parent-relative
 * layout. Used to drive the hook's `onTileLayout`.
 */
function makeLayoutEvent(layout: {
  x: number;
  y: number;
  width: number;
  height: number;
}): LayoutChangeEvent {
  return {
    nativeEvent: { layout },
  } as LayoutChangeEvent;
}

/**
 * Drain all pending RAF callbacks. The hook RAF-defers the strip's
 * `measureInWindow` so we always read the post-commit native frame
 * — tests need to flush before asserting bboxes.
 */
function flushRaf(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 50);
  });
}

describe("useAvatarStripBboxDerivation — strip-level bbox derivation", () => {
  it("broadcasts each tile's window bbox = stripWindow + tileRelativeOffset on remeasure", async () => {
    const { ref, setBbox } = makeStripRefStub();
    const registerAvatarBbox = jest.fn<
      void,
      [number, { x: number; y: number; w: number; h: number } | null]
    >();

    setBbox({ x: 700, y: 100, w: 44, h: 1000 });

    const { result } = renderHook(() =>
      useAvatarStripBboxDerivation({
        stripRef: ref,
        registerAvatarBbox,
      }),
    );

    // Tile A at relative offset (0, 0); tile B at (0, 44); tile C
    // at (0, 88) — typical landscape vertical strip layout.
    act(() => {
      result.current.onTileLayout(
        11,
        makeLayoutEvent({ x: 0, y: 0, width: 34, height: 44 }),
      );
      result.current.onTileLayout(
        22,
        makeLayoutEvent({ x: 0, y: 44, width: 34, height: 44 }),
      );
      result.current.onTileLayout(
        33,
        makeLayoutEvent({ x: 0, y: 88, width: 34, height: 44 }),
      );
    });
    // Trigger the strip's remeasure. Until the strip's bbox is
    // known, tile registrations don't broadcast — they accumulate.
    act(() => {
      result.current.onStripLayout(
        makeLayoutEvent({ x: 0, y: 0, width: 44, height: 1000 }),
      );
    });
    await flushRaf();

    // Each tile should have its window bbox in the registry.
    expect(registerAvatarBbox).toHaveBeenCalledWith(11, {
      x: 700,
      y: 100,
      w: 34,
      h: 44,
    });
    expect(registerAvatarBbox).toHaveBeenCalledWith(22, {
      x: 700,
      y: 144,
      w: 34,
      h: 44,
    });
    expect(registerAvatarBbox).toHaveBeenCalledWith(33, {
      x: 700,
      y: 188,
      w: 34,
      h: 44,
    });
  });

  it("broadcasts immediately when a tile registers AFTER the strip's bbox is known", async () => {
    const { ref, setBbox } = makeStripRefStub();
    const registerAvatarBbox = jest.fn();
    setBbox({ x: 200, y: 50, w: 200, h: 40 });

    const { result } = renderHook(() =>
      useAvatarStripBboxDerivation({ stripRef: ref, registerAvatarBbox }),
    );

    // Strip measures first — no tiles known yet.
    act(() => {
      result.current.onStripLayout(
        makeLayoutEvent({ x: 0, y: 0, width: 200, height: 40 }),
      );
    });
    await flushRaf();
    expect(registerAvatarBbox).not.toHaveBeenCalled();

    // Tile registers — should broadcast immediately because the
    // strip's bbox is already in cache.
    act(() => {
      result.current.onTileLayout(
        7,
        makeLayoutEvent({ x: 8, y: 4, width: 32, height: 32 }),
      );
    });
    expect(registerAvatarBbox).toHaveBeenCalledWith(7, {
      x: 208,
      y: 54,
      w: 32,
      h: 32,
    });
  });

  it("re-broadcasts on remeasureKey change (RAF-deferred)", async () => {
    const { ref, setBbox } = makeStripRefStub();
    const registerAvatarBbox = jest.fn();

    const { result, rerender } = renderHook(
      ({ key }: { key: string }) =>
        useAvatarStripBboxDerivation({
          stripRef: ref,
          registerAvatarBbox,
          remeasureKey: key,
        }),
      { initialProps: { key: "v1" } },
    );

    // Initial setup: strip at (700, 100), one tile at offset (0, 0).
    setBbox({ x: 700, y: 100, w: 44, h: 999 });
    act(() => {
      result.current.onTileLayout(
        7,
        makeLayoutEvent({ x: 0, y: 0, width: 34, height: 44 }),
      );
      result.current.onStripLayout(
        makeLayoutEvent({ x: 0, y: 0, width: 44, height: 999 }),
      );
    });
    await flushRaf();
    expect(registerAvatarBbox).toHaveBeenCalledWith(7, {
      x: 700,
      y: 100,
      w: 34,
      h: 44,
    });

    // Strip moves (= ancestor reflow). Bump remeasureKey — hook
    // should pick up the new strip bbox via RAF.
    setBbox({ x: 700, y: 50, w: 44, h: 999 });
    registerAvatarBbox.mockClear();
    rerender({ key: "v2" });
    await flushRaf();
    expect(registerAvatarBbox).toHaveBeenCalledWith(7, {
      x: 700,
      y: 50,
      w: 34,
      h: 44,
    });
  });

  it("re-broadcasts when collapseProgressSV settles to 0 or 1", async () => {
    const { ref, setBbox } = makeStripRefStub();
    const registerAvatarBbox = jest.fn();
    const collapseSV = { value: 0.5 };
    setBbox({ x: 700, y: 100, w: 44, h: 999 });

    const { result } = renderHook(() => {
      const stripRef = useRef<View | null>(null);
      stripRef.current = ref.current;
      return useAvatarStripBboxDerivation({
        stripRef,
        registerAvatarBbox,
        collapseProgressSV: collapseSV as unknown as never,
      });
    });

    // Pre-register a tile + strip baseline.
    act(() => {
      result.current.onTileLayout(
        7,
        makeLayoutEvent({ x: 0, y: 0, width: 34, height: 44 }),
      );
      result.current.onStripLayout(
        makeLayoutEvent({ x: 0, y: 0, width: 44, height: 999 }),
      );
    });
    await flushRaf();
    registerAvatarBbox.mockClear();

    // Simulate the settled-edge crossing 0.5 → 0.
    setBbox({ x: 700, y: 250, w: 44, h: 999 });
    const reaction = reactionRegistrations[0];
    expect(reaction).toBeDefined();
    act(() => {
      reaction!.react(0, 0.5);
    });
    await flushRaf();
    expect(registerAvatarBbox).toHaveBeenCalledWith(7, {
      x: 700,
      y: 250,
      w: 34,
      h: 44,
    });
  });

  it("does NOT remeasure on non-settled progress changes (avoids 60Hz remeasures during the spring)", async () => {
    const { ref, setBbox } = makeStripRefStub();
    const registerAvatarBbox = jest.fn();
    const collapseSV = { value: 0 };
    setBbox({ x: 700, y: 100, w: 44, h: 999 });

    const { result } = renderHook(() =>
      useAvatarStripBboxDerivation({
        stripRef: ref,
        registerAvatarBbox,
        collapseProgressSV: collapseSV as unknown as never,
      }),
    );

    act(() => {
      result.current.onTileLayout(
        7,
        makeLayoutEvent({ x: 0, y: 0, width: 34, height: 44 }),
      );
      result.current.onStripLayout(
        makeLayoutEvent({ x: 0, y: 0, width: 44, height: 999 }),
      );
    });
    await flushRaf();
    registerAvatarBbox.mockClear();

    // Mid-animation samples (0 → 0.3 → 0.7 → 1) should not trigger
    // remeasures except on the final settled edge.
    setBbox({ x: 700, y: 250, w: 44, h: 999 });
    const reaction = reactionRegistrations[0];
    act(() => {
      reaction!.react(0.3, 0);
    });
    act(() => {
      reaction!.react(0.7, 0.3);
    });
    await flushRaf();
    expect(registerAvatarBbox).not.toHaveBeenCalled();

    // Settle to 1 — should now fire.
    act(() => {
      reaction!.react(1, 0.7);
    });
    await flushRaf();
    expect(registerAvatarBbox).toHaveBeenCalledWith(7, {
      x: 700,
      y: 250,
      w: 34,
      h: 44,
    });
  });

  it("clears every registered tile's bbox on unmount", () => {
    const { ref, setBbox } = makeStripRefStub();
    const registerAvatarBbox = jest.fn();
    setBbox({ x: 700, y: 100, w: 44, h: 999 });

    const { result, unmount } = renderHook(() =>
      useAvatarStripBboxDerivation({ stripRef: ref, registerAvatarBbox }),
    );

    act(() => {
      result.current.onTileLayout(
        11,
        makeLayoutEvent({ x: 0, y: 0, width: 34, height: 44 }),
      );
      result.current.onTileLayout(
        22,
        makeLayoutEvent({ x: 0, y: 44, width: 34, height: 44 }),
      );
    });

    registerAvatarBbox.mockClear();
    unmount();

    // Every registered tile id sees a single null broadcast.
    expect(registerAvatarBbox).toHaveBeenCalledWith(11, null);
    expect(registerAvatarBbox).toHaveBeenCalledWith(22, null);
    expect(registerAvatarBbox).toHaveBeenCalledTimes(2);
  });
});
