/**
 * Tests for `useDragToAvatar` (P2-FE-6, master plan §5.1.7,
 * hover-dwell model — see PLAN-DEVIATION
 * 2026-04-22-hover-dwell-avatar-navigator).
 *
 * Coverage axes:
 *
 *   1. Per-frame hit-test (UI thread): while `isDragging` is true,
 *      the raw finger position (`fingerXAbs`/`fingerYAbs` in window
 *      coords) is matched against registered avatar bboxes; the
 *      matching tech id is written to `highlightedTechIdSV`.
 *   2. Sentinel handling + NaN safety + bbox unregister.
 *   3. Hover-dwell pattern (JS thread):
 *      a. Enter avatar → 200ms debounce → buzz 1 (light).
 *      b. 500ms → buzz 2 (light) + preview narrow via
 *         `setSelectedTechIds([techId])`.
 *      c. 900ms → buzz 3 (success) + commit (selection becomes
 *         the new anchor).
 *      d. Exit before buzz 3 → revert preview if applied.
 *      e. Move to different avatar mid-pattern → cancel + restart.
 *      f. Lift (drag-end) before buzz 3 → revert.
 *      g. Skip rule: hover an avatar where `selectedTechIds === [X]`
 *         already — no buzz, no narrow.
 *
 * Strategy
 * ────────
 * Reanimated `useAnimatedReaction` doesn't fire automatically in
 * Jest (no UI thread). We mock both `useAnimatedReaction` (capturing
 * each registration into an array indexed by registration order) and
 * `useDragSharedValues` (so the test owns the SV-like value bag the
 * hook reads from).
 *
 * Mock for `runOnJS`: returns the function as-is. The dwell hook's
 * `useAnimatedReaction` callbacks (registrations 2 + 3) wrap their
 * JS handlers in `runOnJS(...)`; with the mock that's just direct
 * invocation, so driving the reaction synchronously also calls the
 * dwell handler synchronously — perfect for assertion ordering.
 *
 * Haptics: stubbed so we can assert call ordering on the buzzes
 * without bringing expo-haptics into the test runtime.
 *
 * Timers: `jest.useFakeTimers()` so we can advance the dwell delays
 * deterministically without paying a 900ms wall-clock cost per test.
 *
 * NOTE (executable spec): excluded from `tsc --noEmit` via
 * `**\/__tests__\/**` in `tsconfig.json`. Treated as executable
 * specification until the `jest-expo` scaffold lands. Same caveat
 * as the rest of the landscape test suite.
 */

// eslint-disable-next-line import/no-unresolved -- @testing-library/react-native lands with the jest-expo runner.
import { renderHook, act } from "@testing-library/react-native";

// ── Reanimated mock ──────────────────────────────────────────────
//
// Three `useAnimatedReaction` calls now live in the hook:
//   [0] per-frame hit-test (worklet on UI thread normally)
//   [1] highlight-change → handleHighlightChange (dwell driver)
//   [2] isDragging edges → handleDragStart / handleDragEnd
const reactionRegistrations: Array<{
  prepare: () => unknown;
  react: (curr: unknown, prev: unknown | undefined) => void;
}> = [];

jest.mock("react-native-reanimated", () => {
  const useSharedValue = <T,>(initial: T) => ({ value: initial });
  return {
    __esModule: true,
    useSharedValue,
    useAnimatedReaction: (
      prepare: () => unknown,
      react: (curr: unknown, prev: unknown | undefined) => void,
    ) => {
      reactionRegistrations.push({ prepare, react });
    },
    runOnJS: (fn: (...args: unknown[]) => void) => fn,
    default: {},
  };
});

// ── Drag SVs mock ────────────────────────────────────────────────
const mockDragSVs = {
  panXAbs: { value: 0 },
  panYAbs: { value: 0 },
  isDragging: { value: false },
  fingerXAbs: { value: Number.NaN },
  fingerYAbs: { value: Number.NaN },
};

jest.mock("react-native-resource-calendar", () => ({
  __esModule: true,
  useDragSharedValues: () => mockDragSVs,
}));

// ── Haptics stub ─────────────────────────────────────────────────
//
// We don't import the real `haptic` module in tests; instead we
// substitute spy functions that record their call order. The hook
// imports `haptic` from `@technician/hooks/utility/use-haptics`, which
// resolves to the path mock below (jest.mock with the same module
// path the hook uses).
const hapticCalls: string[] = [];
jest.mock("@technician/hooks/utility/use-haptics", () => ({
  haptic: {
    light: () => hapticCalls.push("light"),
    medium: () => hapticCalls.push("medium"),
    heavy: () => hapticCalls.push("heavy"),
    success: () => hapticCalls.push("success"),
    warning: () => hapticCalls.push("warning"),
    error: () => hapticCalls.push("error"),
    selection: () => hapticCalls.push("selection"),
  },
}));

// Import AFTER the mocks so the hook's imports bind to the stubs.
import {
  useDragToAvatar,
  NO_HIGHLIGHTED_TECH,
} from "../use-drag-to-avatar";

beforeEach(() => {
  jest.useFakeTimers();
  reactionRegistrations.length = 0;
  hapticCalls.length = 0;
  mockDragSVs.panXAbs.value = 0;
  mockDragSVs.panYAbs.value = 0;
  mockDragSVs.isDragging.value = false;
  mockDragSVs.fingerXAbs.value = Number.NaN;
  mockDragSVs.fingerYAbs.value = Number.NaN;
});

afterEach(() => {
  jest.useRealTimers();
});

/**
 * Drive the per-frame hit-test reaction (registration [0]) by
 * calling its `prepare` fn for the current SV state and feeding the
 * result into `react`.
 */
function tickHitTest() {
  const reg = reactionRegistrations[0];
  expect(reg).toBeDefined();
  const curr = reg!.prepare();
  reg!.react(curr, undefined);
}

/**
 * Drive the highlight-change reaction (registration [1]) with an
 * explicit prev/curr edge. Mirrors what Reanimated would observe
 * when `highlightedTechIdSV.value` changes.
 */
function tickHighlightEdge(prev: number, curr: number) {
  const reg = reactionRegistrations[1];
  expect(reg).toBeDefined();
  reg!.react(curr, prev);
}

/**
 * Drive the isDragging-edges reaction (registration [2]) with an
 * explicit prev/curr edge.
 */
function tickDragEdge(prev: boolean, curr: boolean) {
  const reg = reactionRegistrations[2];
  expect(reg).toBeDefined();
  reg!.react(curr, prev);
}

// ─────────────────────────────────────────────────────────────────
//   1. Per-frame hit-test (legacy mode, no dwell options)
// ─────────────────────────────────────────────────────────────────

describe("useDragToAvatar — per-frame highlight (legacy, no dwell options)", () => {
  it("writes the matching tech id to highlightedTechIdSV when the finger lands inside a bbox", () => {
    const { result } = renderHook(() => useDragToAvatar());

    act(() => {
      result.current.registerAvatarBbox(11, { x: 756, y: 100, w: 44, h: 44 });
      result.current.registerAvatarBbox(22, { x: 756, y: 144, w: 44, h: 44 });
    });

    mockDragSVs.isDragging.value = true;
    mockDragSVs.fingerXAbs.value = 778;
    mockDragSVs.fingerYAbs.value = 166;
    act(() => {
      tickHitTest();
    });

    expect(result.current.highlightedTechIdSV.value).toBe(22);
  });

  it("writes NO_HIGHLIGHTED_TECH when the finger is outside every bbox", () => {
    const { result } = renderHook(() => useDragToAvatar());

    act(() => {
      result.current.registerAvatarBbox(11, { x: 756, y: 100, w: 44, h: 44 });
    });

    mockDragSVs.isDragging.value = true;
    mockDragSVs.fingerXAbs.value = 200;
    mockDragSVs.fingerYAbs.value = 200;
    act(() => {
      tickHitTest();
    });

    expect(result.current.highlightedTechIdSV.value).toBe(NO_HIGHLIGHTED_TECH);
  });

  it("treats NaN finger coords as no-hit (NaN-propagation safety)", () => {
    const { result } = renderHook(() => useDragToAvatar());
    act(() => {
      result.current.registerAvatarBbox(11, { x: 0, y: 0, w: 44, h: 44 });
    });

    mockDragSVs.isDragging.value = true;
    mockDragSVs.fingerXAbs.value = Number.NaN;
    mockDragSVs.fingerYAbs.value = Number.NaN;
    act(() => {
      tickHitTest();
    });

    expect(result.current.highlightedTechIdSV.value).toBe(NO_HIGHLIGHTED_TECH);
  });

  it("hits a bbox at the window origin when the finger is at (0,0) (sanity-check that NaN guard is purely NaN, not 0)", () => {
    const { result } = renderHook(() => useDragToAvatar());
    act(() => {
      result.current.registerAvatarBbox(7, { x: 0, y: 0, w: 44, h: 44 });
    });

    mockDragSVs.isDragging.value = true;
    mockDragSVs.fingerXAbs.value = 0;
    mockDragSVs.fingerYAbs.value = 0;
    act(() => {
      tickHitTest();
    });

    expect(result.current.highlightedTechIdSV.value).toBe(7);
  });

  it("clears highlight when isDragging goes false (idle frame)", () => {
    const { result } = renderHook(() => useDragToAvatar());
    act(() => {
      result.current.registerAvatarBbox(11, { x: 756, y: 100, w: 44, h: 44 });
    });

    mockDragSVs.isDragging.value = true;
    mockDragSVs.fingerXAbs.value = 778;
    mockDragSVs.fingerYAbs.value = 122;
    act(() => {
      tickHitTest();
    });
    expect(result.current.highlightedTechIdSV.value).toBe(11);

    mockDragSVs.isDragging.value = false;
    act(() => {
      tickHitTest();
    });
    expect(result.current.highlightedTechIdSV.value).toBe(NO_HIGHLIGHTED_TECH);
  });

  it("uses the latest registered bbox after an ancestor-reflow remeasurement (PR-UX-6)", () => {
    // Regression for the PR-UX-6 fix path: when an ancestor (the
    // CollapsibleTop / NowFutureToggle / chip-row chrome) reflows
    // mid-session, `useAvatarStripBboxDerivation` re-measures the
    // strip and re-broadcasts every tile's window bbox. The drag
    // hit-test must always read the LATEST bbox, not a snapshot
    // captured at mount.
    //
    // We simulate this end-to-end by registering a bbox, hit-testing
    // against it, then re-registering the SAME tech id with a
    // different bbox and verifying the hit-test follows the new
    // position.
    const { result } = renderHook(() => useDragToAvatar());

    act(() => {
      result.current.registerAvatarBbox(11, { x: 100, y: 200, w: 44, h: 44 });
    });

    mockDragSVs.isDragging.value = true;
    mockDragSVs.fingerXAbs.value = 122;
    mockDragSVs.fingerYAbs.value = 222;
    act(() => {
      tickHitTest();
    });
    expect(result.current.highlightedTechIdSV.value).toBe(11);

    // Strip slides up ~150pt because <CollapsibleTop> collapsed.
    // Hook re-broadcasts the new window bbox.
    act(() => {
      result.current.registerAvatarBbox(11, { x: 100, y: 50, w: 44, h: 44 });
    });

    // Same finger position is now OUTSIDE the avatar (it was 222,
    // the avatar moved up to 50–94).
    act(() => {
      tickHitTest();
    });
    expect(result.current.highlightedTechIdSV.value).toBe(NO_HIGHLIGHTED_TECH);

    // Move finger to the new avatar position.
    mockDragSVs.fingerYAbs.value = 72;
    act(() => {
      tickHitTest();
    });
    expect(result.current.highlightedTechIdSV.value).toBe(11);
  });

  it("ignores unregistered tiles (passing null removes the bbox from hit-testing)", () => {
    const { result } = renderHook(() => useDragToAvatar());
    act(() => {
      result.current.registerAvatarBbox(11, { x: 0, y: 0, w: 44, h: 44 });
      result.current.registerAvatarBbox(22, { x: 0, y: 44, w: 44, h: 44 });
    });

    mockDragSVs.isDragging.value = true;
    mockDragSVs.fingerXAbs.value = 22;
    mockDragSVs.fingerYAbs.value = 66;
    act(() => {
      tickHitTest();
    });
    expect(result.current.highlightedTechIdSV.value).toBe(22);

    act(() => {
      result.current.registerAvatarBbox(22, null);
    });
    act(() => {
      tickHitTest();
    });
    expect(result.current.highlightedTechIdSV.value).toBe(NO_HIGHLIGHTED_TECH);
  });
});

// ─────────────────────────────────────────────────────────────────
//   2. Hover-dwell pattern (full options provided)
// ─────────────────────────────────────────────────────────────────

/**
 * Helper that mounts the hook with mutable selection state. Returns
 * a tuple of (hook result, current-selection getter, history of
 * `setSelectedTechIds` calls). The setter is a real spy whose
 * implementation also updates the `current` array so the hook reads
 * a fresh value on subsequent reactions.
 *
 * Uses `rerender` to push a new option object on each setter call so
 * the hook's `useEffect` updates `selectedTechIdsRef.current`. (In a
 * real app `useCalendarStore` re-renders the consumer; here we
 * simulate that by re-invoking the hook with new args.)
 */
function mountDwellHook(initialSelection: number[]) {
  let current = [...initialSelection];
  const setterCalls: number[][] = [];
  const setSelectedTechIds = jest.fn((ids: number[]) => {
    setterCalls.push([...ids]);
    current = [...ids];
  });
  const { result, rerender } = renderHook(
    ({ sel }: { sel: number[] }) =>
      useDragToAvatar({ selectedTechIds: sel, setSelectedTechIds }),
    { initialProps: { sel: current } },
  );
  // Push the latest `current` back into the hook so its
  // `selectedTechIdsRef` stays in sync after any setter call.
  const syncSelection = () => rerender({ sel: current });
  return {
    result,
    setSelectedTechIds,
    setterCalls,
    getSelection: () => current,
    syncSelection,
  };
}

describe("useDragToAvatar — hover-dwell pattern", () => {
  it("fires the full 3-buzz pattern on hover and commits at buzz 3", () => {
    const { result, setterCalls, syncSelection } = mountDwellHook([1, 2, 3]);
    act(() => {
      result.current.registerAvatarBbox(7, { x: 0, y: 0, w: 44, h: 44 });
    });

    // Drag starts → snapshot anchor.
    act(() => {
      tickDragEdge(false, true);
    });

    // Highlight enters tech 7.
    act(() => {
      tickHighlightEdge(NO_HIGHLIGHTED_TECH, 7);
    });

    // Buzz 1 fires at +200ms.
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(hapticCalls).toEqual(["light"]);
    expect(setterCalls).toEqual([]); // no narrow yet

    // Buzz 2 fires at +500ms (300 more) → preview narrow applied.
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(hapticCalls).toEqual(["light", "light"]);
    expect(setterCalls).toEqual([[7]]);
    syncSelection();

    // Buzz 3 fires at +900ms (400 more) → commit (success haptic;
    // selection unchanged because buzz 2 already swapped it).
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(hapticCalls).toEqual(["light", "light", "success"]);
    expect(setterCalls).toEqual([[7]]); // no extra setter call

    // Drag end after commit → selection stays committed; no revert.
    act(() => {
      tickDragEdge(true, false);
    });
    expect(setterCalls).toEqual([[7]]);
  });

  it("reverts the preview narrow on exit (back to grid) before buzz 3", () => {
    const { result, setterCalls, syncSelection } = mountDwellHook([1, 2, 3]);
    act(() => {
      result.current.registerAvatarBbox(7, { x: 0, y: 0, w: 44, h: 44 });
    });

    act(() => {
      tickDragEdge(false, true);
    });
    act(() => {
      tickHighlightEdge(NO_HIGHLIGHTED_TECH, 7);
    });

    // Advance just past buzz 2 (preview applied) but before buzz 3.
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(setterCalls).toEqual([[7]]);
    syncSelection();

    // Move back to grid (no avatar) → revert preview.
    act(() => {
      tickHighlightEdge(7, NO_HIGHLIGHTED_TECH);
    });
    expect(setterCalls).toEqual([[7], [1, 2, 3]]);

    // Buzz 3 timer was cancelled, so further time advancement
    // fires nothing.
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(hapticCalls).toEqual(["light", "light"]); // no third buzz
    expect(setterCalls).toEqual([[7], [1, 2, 3]]); // no extra setter
  });

  it("does NOT revert if exit happens BEFORE buzz 2 (no preview was applied)", () => {
    const { result, setterCalls } = mountDwellHook([1, 2, 3]);
    act(() => {
      result.current.registerAvatarBbox(7, { x: 0, y: 0, w: 44, h: 44 });
    });

    act(() => {
      tickDragEdge(false, true);
    });
    act(() => {
      tickHighlightEdge(NO_HIGHLIGHTED_TECH, 7);
    });

    // Only get to buzz 1 (200ms) — no preview applied yet.
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(hapticCalls).toEqual(["light"]);
    expect(setterCalls).toEqual([]);

    // Exit before buzz 2 → no revert needed (nothing to revert).
    act(() => {
      tickHighlightEdge(7, NO_HIGHLIGHTED_TECH);
    });
    expect(setterCalls).toEqual([]);

    // Subsequent timers are cancelled.
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(hapticCalls).toEqual(["light"]);
    expect(setterCalls).toEqual([]);
  });

  it("cancels the current pattern and starts fresh on a different avatar", () => {
    const { result, setterCalls, syncSelection } = mountDwellHook([1, 2, 3]);
    act(() => {
      result.current.registerAvatarBbox(7, { x: 0, y: 0, w: 44, h: 44 });
      result.current.registerAvatarBbox(8, {
        x: 0,
        y: 100,
        w: 44,
        h: 44,
      });
    });

    act(() => {
      tickDragEdge(false, true);
    });

    // Enter avatar 7, advance to preview (buzz 2 fires).
    act(() => {
      tickHighlightEdge(NO_HIGHLIGHTED_TECH, 7);
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(setterCalls).toEqual([[7]]);
    syncSelection();

    // Move directly to avatar 8 (no grid-step in between). Pattern
    // for 7 cancels and reverts the preview, fresh pattern starts
    // for 8.
    act(() => {
      tickHighlightEdge(7, 8);
    });
    expect(setterCalls).toEqual([[7], [1, 2, 3]]);
    syncSelection();

    // Run avatar 8's full pattern.
    act(() => {
      jest.advanceTimersByTime(900);
    });
    expect(setterCalls).toEqual([[7], [1, 2, 3], [8]]);
    expect(hapticCalls).toEqual([
      "light", // 7 buzz 1
      "light", // 7 buzz 2
      "light", // 8 buzz 1
      "light", // 8 buzz 2
      "success", // 8 buzz 3 (commit)
    ]);
  });

  it("skips the pattern entirely when hovering an avatar that's already the only selected tech", () => {
    const { result, setterCalls } = mountDwellHook([7]);
    act(() => {
      result.current.registerAvatarBbox(7, { x: 0, y: 0, w: 44, h: 44 });
    });

    act(() => {
      tickDragEdge(false, true);
    });
    act(() => {
      tickHighlightEdge(NO_HIGHLIGHTED_TECH, 7);
    });

    // Advance past where buzz 3 would have fired — no haptics, no
    // setter calls.
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(hapticCalls).toEqual([]);
    expect(setterCalls).toEqual([]);
  });

  it("reverts the preview when drag ends (lift) before buzz 3", () => {
    const { result, setterCalls, syncSelection } = mountDwellHook([1, 2, 3]);
    act(() => {
      result.current.registerAvatarBbox(7, { x: 0, y: 0, w: 44, h: 44 });
    });

    act(() => {
      tickDragEdge(false, true);
    });
    act(() => {
      tickHighlightEdge(NO_HIGHLIGHTED_TECH, 7);
    });

    // Get to buzz 2 (preview applied), then lift before buzz 3.
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(setterCalls).toEqual([[7]]);
    syncSelection();

    act(() => {
      tickDragEdge(true, false);
    });
    expect(setterCalls).toEqual([[7], [1, 2, 3]]);
    expect(hapticCalls).toEqual(["light", "light"]); // never buzz 3
  });

  it("uses the last-committed anchor as the revert target after a successful commit (REVERT_ANCHOR='last-committed')", () => {
    // Establish initial selection [1, 2, 3]. Commit avatar 7 via
    // full pattern. Then enter avatar 8, advance past buzz 2 only,
    // exit. Expect revert to [7] (the last committed), NOT to
    // [1, 2, 3] (the original).
    const { result, setterCalls, syncSelection } = mountDwellHook([1, 2, 3]);
    act(() => {
      result.current.registerAvatarBbox(7, { x: 0, y: 0, w: 44, h: 44 });
      result.current.registerAvatarBbox(8, {
        x: 0,
        y: 100,
        w: 44,
        h: 44,
      });
    });

    act(() => {
      tickDragEdge(false, true);
    });

    // Full pattern on 7 → commit.
    act(() => {
      tickHighlightEdge(NO_HIGHLIGHTED_TECH, 7);
    });
    act(() => {
      jest.advanceTimersByTime(900);
    });
    expect(setterCalls).toEqual([[7]]);
    syncSelection();

    // Enter 8, advance to preview, exit before buzz 3.
    act(() => {
      tickHighlightEdge(7, 8);
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(setterCalls).toEqual([[7], [8]]);
    syncSelection();

    act(() => {
      tickHighlightEdge(8, NO_HIGHLIGHTED_TECH);
    });
    // Revert to last-committed [7], not original [1, 2, 3].
    expect(setterCalls).toEqual([[7], [8], [7]]);
  });
});

// ─────────────────────────────────────────────────────────────────
//   3. wasRecentlyDragging — Bug #2 guard (P2-FE-6 follow-on)
// ─────────────────────────────────────────────────────────────────
//
// `LandscapeWorkweekView.handleToggleTech` reads this to short-
// circuit the spurious avatar `Pressable.onPress` that fires at
// drag-end. See PLAN-DEVIATION 2026-04-22-drop-commit-with-undo
// (Phase A) for the full bug write-up.

describe("useDragToAvatar — wasRecentlyDragging (Bug #2 guard)", () => {
  it("returns true while a drag is in progress", () => {
    const { result } = renderHook(() => useDragToAvatar());
    mockDragSVs.isDragging.value = true;
    expect(result.current.wasRecentlyDragging()).toBe(true);
  });

  it("returns true within 500ms after a drag ends, and false past the window", () => {
    // The drag-end edge handler that stamps `dragEndedAtRef` is
    // guarded by `setSelectedTechIdsRef.current` (the dwell-options
    // gate). We mount with dwell options so the guard passes — this
    // mirrors how `LandscapeWorkweekView` actually mounts the hook.
    jest.setSystemTime(1_000_000);
    const { setterCalls: _ignored, result } = mountDwellHook([1, 2, 3]);

    // Drag begins, then ends.
    mockDragSVs.isDragging.value = true;
    act(() => {
      tickDragEdge(false, true);
    });
    mockDragSVs.isDragging.value = false;
    act(() => {
      tickDragEdge(true, false);
    });

    // Immediately after — within window.
    expect(result.current.wasRecentlyDragging()).toBe(true);

    // 499ms later — still within window.
    jest.setSystemTime(1_000_499);
    expect(result.current.wasRecentlyDragging()).toBe(true);

    // 501ms later — outside window.
    jest.setSystemTime(1_000_501);
    expect(result.current.wasRecentlyDragging()).toBe(false);
  });

  it("respects a custom withinMs window", () => {
    jest.setSystemTime(2_000_000);
    const { result } = mountDwellHook([1, 2, 3]);

    mockDragSVs.isDragging.value = true;
    act(() => {
      tickDragEdge(false, true);
    });
    mockDragSVs.isDragging.value = false;
    act(() => {
      tickDragEdge(true, false);
    });

    // Custom 100ms window.
    jest.setSystemTime(2_000_099);
    expect(result.current.wasRecentlyDragging(100)).toBe(true);
    jest.setSystemTime(2_000_101);
    expect(result.current.wasRecentlyDragging(100)).toBe(false);
  });

  it("returns false before any drag has happened", () => {
    const { result } = renderHook(() => useDragToAvatar());
    expect(result.current.wasRecentlyDragging()).toBe(false);
  });
});
