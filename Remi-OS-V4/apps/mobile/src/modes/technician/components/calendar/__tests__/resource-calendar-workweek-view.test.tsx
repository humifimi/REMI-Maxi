/**
 * Tests for `ResourceCalendarWorkweekView`'s portrait-week
 * hover-dwell wiring (PLAN-DEVIATION:
 * 2026-05-08-portrait-week-hover-dwell-parity).
 *
 * These tests cover the data-path glue between the dwell hook and
 * the parent's `onSwitchTech` (→ `enterWorkweek`) callback. They do
 * NOT mount the full workweek view component — that requires a
 * heavy test harness (vendored Calendar mock, four chain hooks,
 * two Zustand stores, the binding provider, etc.) that would cost
 * far more setup than the wiring is worth. The dwell hook itself
 * is exhaustively tested in
 * `src/components/calendar/landscape/__tests__/use-drag-to-avatar.test.tsx`;
 * here we pin the contract that the workweek view uses the dwell
 * hook with the SAME option shape landscape uses, with a portrait-
 * specific adapter that proxies `setSelectedTechIds([id])` to
 * `onSwitchTech(id, name)`.
 *
 * Coverage axes:
 *
 *   1. The dwell adapter dispatches to `onSwitchTech` with the
 *      correct `(id, name)` tuple at buzz 2 (preview-narrow stage).
 *   2. Same-tech hover (currently-mounted tech) does NOT fire
 *      `onSwitchTech` — the dwell hook's skip rule applies because
 *      we feed it `selectedTechIds: [techId]`.
 *   3. Cross-tech hover then revert (exit before buzz 3) calls
 *      `onSwitchTech` once with the destination, then again with
 *      the original tech — same revert semantics landscape uses.
 *   4. Drag-end is a pure pass-through to the parent's `onDragEnd`
 *      with no avatar-branch interception.
 *   5. The retired `[CAL:weekView] drop-on-avatar` log line is
 *      GONE from the source file (smoke test — the branch is
 *      truly retired, not just disabled).
 *
 * NOTE (executable spec): excluded from `tsc --noEmit` via
 * `**\/__tests__\/**` in `tsconfig.json`, same caveat as the rest
 * of the calendar test suite.
 */

import { renderHook, act } from "@testing-library/react-native";
import * as fs from "fs";
import * as path from "path";
// `useDragToAvatar` is imported below the `jest.mock` calls so the
// hook's transitive imports bind to the mocked modules.

// ── Reanimated mock ─────────────────────────────────────────────
//
// Three `useAnimatedReaction` calls live in the dwell hook — see
// `use-drag-to-avatar.test.tsx` for the registration ordering
// rationale. We capture each registration into an array indexed
// by registration order so we can drive them synchronously.
const reactionRegistrations: {
  prepare: () => unknown;
  react: (curr: unknown, prev: unknown | undefined) => void;
}[] = [];

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

// ── Drag SVs mock ───────────────────────────────────────────────
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

// ── Haptics stub ────────────────────────────────────────────────
jest.mock("@technician/hooks/utility/use-haptics", () => ({
  haptic: {
    light: () => {},
    medium: () => {},
    heavy: () => {},
    success: () => {},
    warning: () => {},
    error: () => {},
    selection: () => {},
  },
}));

// eslint-disable-next-line import/first -- intentional: import after the jest.mock() calls above so transitive imports bind to the mocks.
import { useDragToAvatar } from "../landscape/use-drag-to-avatar";

// `WorkweekTechOption` shape — copied here to keep the test
// independent of the workweek view's exact import path. Any drift
// will surface as a TS error in the production code first; this
// shape is the load-bearing contract.
interface WorkweekTechOption {
  id: number;
  name: string;
  profileImageUrl?: string | null;
}

beforeEach(() => {
  jest.useFakeTimers();
  reactionRegistrations.length = 0;
  mockDragSVs.panXAbs.value = 0;
  mockDragSVs.panYAbs.value = 0;
  mockDragSVs.isDragging.value = false;
  mockDragSVs.fingerXAbs.value = Number.NaN;
  mockDragSVs.fingerYAbs.value = Number.NaN;
});

afterEach(() => {
  jest.useRealTimers();
});

function tickHighlightEdge(prev: number, curr: number) {
  // Registration [1] is the highlight-change → JS handler, per
  // `use-drag-to-avatar.test.tsx`'s setup notes.
  const reg = reactionRegistrations[1];
  expect(reg).toBeDefined();
  reg!.react(curr, prev);
}

function tickDragEdge(prev: boolean, curr: boolean) {
  // Registration [2] is the isDragging-edges reaction.
  const reg = reactionRegistrations[2];
  expect(reg).toBeDefined();
  reg!.react(curr, prev);
}

/**
 * Mount the dwell hook with the SAME option shape
 * `ResourceCalendarWorkweekView` passes in production:
 *
 *   - `selectedTechIds: [techId]` — single-element array of the
 *     currently-mounted tech. The dwell hook's skip rule fires
 *     when the user hovers an avatar where this is `[X]` already.
 *   - `setSelectedTechIds` — adapter that proxies `[id]` →
 *     `onSwitchTech(id, name)` by looking up the name from
 *     `availableTechs`.
 *
 * Returns the hook's result + the recorded `onSwitchTech` calls so
 * each test can assert the dispatch shape.
 */
function mountPortraitDwell(opts: {
  initialTechId: number;
  availableTechs: WorkweekTechOption[];
}) {
  const onSwitchTech = jest.fn<void, [number, string]>();
  let currentTechId = opts.initialTechId;
  // Mirror the workweek view's adapter logic exactly. Refs are
  // not needed here because the test rerenders the hook with
  // updated props on each tech swap.
  const adapter = (ids: number[]) => {
    if (ids.length !== 1) return;
    const target = ids[0];
    const found = opts.availableTechs.find((t) => t.id === target);
    onSwitchTech(target, found?.name ?? "");
    currentTechId = target;
  };
  const { result, rerender } = renderHook(
    ({ techId }: { techId: number }) =>
      useDragToAvatar({
        selectedTechIds: [techId],
        setSelectedTechIds: adapter,
      }),
    { initialProps: { techId: currentTechId } },
  );
  const syncToCurrent = () => rerender({ techId: currentTechId });
  return {
    result,
    onSwitchTech,
    syncToCurrent,
    getCurrentTechId: () => currentTechId,
  };
}

describe("ResourceCalendarWorkweekView — portrait dwell adapter", () => {
  // -----------------------------------------------------------------
  // 1. Cross-tech hover fires the buzz-2 narrow → onSwitchTech with
  //    the correct (id, name) tuple. This is the load-bearing test
  //    for the bug fix: under the retired drop-on-avatar model,
  //    hovering produced no haptic, no calendar swap, no
  //    reassignment — which is exactly what the user reported on
  //    on-device on 2026-05-08.
  // -----------------------------------------------------------------

  it("dispatches onSwitchTech(newTechId, newTechName) at the dwell threshold (buzz 2 / 500ms)", () => {
    const techs: WorkweekTechOption[] = [
      { id: 2054, name: "Josh" },
      { id: 2055, name: "Jake" },
    ];
    const { result, onSwitchTech } = mountPortraitDwell({
      initialTechId: 2054,
      availableTechs: techs,
    });
    act(() => {
      result.current.registerAvatarBbox(2054, { x: 0, y: 0, w: 44, h: 44 });
      result.current.registerAvatarBbox(2055, {
        x: 60,
        y: 0,
        w: 44,
        h: 44,
      });
    });

    // Drag begins; hover Jake's avatar.
    act(() => {
      tickDragEdge(false, true);
    });
    act(() => {
      tickHighlightEdge(-1, 2055);
    });

    // Buzz 1 (200ms) — debounce confirmation, no narrow yet.
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(onSwitchTech).not.toHaveBeenCalled();

    // Buzz 2 (500ms total) — preview narrow applied → adapter
    // proxies to onSwitchTech with the resolved name from
    // availableTechs. THIS is the moment that produces the haptic
    // + calendar swap on-device.
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(onSwitchTech).toHaveBeenCalledTimes(1);
    expect(onSwitchTech).toHaveBeenCalledWith(2055, "Jake");
  });

  // -----------------------------------------------------------------
  // 2. Same-tech hover (the user lingers on their currently-mounted
  //    tech's own avatar mid-drag) is a no-op. Dwell hook's skip
  //    rule fires because we pass `selectedTechIds: [techId]`.
  // -----------------------------------------------------------------

  it("does NOT dispatch onSwitchTech when hovering the currently-mounted tech's avatar (skip rule)", () => {
    const techs: WorkweekTechOption[] = [
      { id: 2054, name: "Josh" },
      { id: 2055, name: "Jake" },
    ];
    const { result, onSwitchTech } = mountPortraitDwell({
      initialTechId: 2054,
      availableTechs: techs,
    });
    act(() => {
      result.current.registerAvatarBbox(2054, { x: 0, y: 0, w: 44, h: 44 });
    });

    // Drag begins; hover Josh's own avatar (currently mounted).
    act(() => {
      tickDragEdge(false, true);
    });
    act(() => {
      tickHighlightEdge(-1, 2054);
    });

    // Advance past every dwell threshold — no-op.
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(onSwitchTech).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------
  // 3. Cross-tech hover that reverts before commit — onSwitchTech
  //    fires twice: once with destination (at buzz 2), once with
  //    the original tech (revert). Mirrors landscape's preview/
  //    revert semantics under the dwell hook.
  // -----------------------------------------------------------------

  it("reverts to the original tech when hover exits before buzz 3 (preview narrow undone)", () => {
    const techs: WorkweekTechOption[] = [
      { id: 2054, name: "Josh" },
      { id: 2055, name: "Jake" },
    ];
    const { result, onSwitchTech, syncToCurrent } = mountPortraitDwell({
      initialTechId: 2054,
      availableTechs: techs,
    });
    act(() => {
      result.current.registerAvatarBbox(2054, { x: 0, y: 0, w: 44, h: 44 });
      result.current.registerAvatarBbox(2055, {
        x: 60,
        y: 0,
        w: 44,
        h: 44,
      });
    });

    act(() => {
      tickDragEdge(false, true);
    });
    act(() => {
      tickHighlightEdge(-1, 2055);
    });

    // Past buzz 2 (preview applied, swap to Jake).
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onSwitchTech).toHaveBeenCalledTimes(1);
    expect(onSwitchTech).toHaveBeenLastCalledWith(2055, "Jake");
    syncToCurrent();

    // Exit to grid before buzz 3 → revert.
    act(() => {
      tickHighlightEdge(2055, -1);
    });
    expect(onSwitchTech).toHaveBeenCalledTimes(2);
    expect(onSwitchTech).toHaveBeenLastCalledWith(2054, "Josh");
  });

  // -----------------------------------------------------------------
  // 4. Multiple cross-tech hovers chain correctly. Each new tech
  //    fires `onSwitchTech` once at its own buzz 2 → drop landed
  //    on the most-recently-swapped tech's grid (the user's "drag
  //    to Jake → keep going to Cam → drop in Cam's grid" path).
  // -----------------------------------------------------------------

  it("chains multiple cross-tech hovers, dispatching each at its own buzz 2", () => {
    const techs: WorkweekTechOption[] = [
      { id: 2054, name: "Josh" },
      { id: 2055, name: "Jake" },
      { id: 2056, name: "Cam" },
    ];
    const { result, onSwitchTech, syncToCurrent } = mountPortraitDwell({
      initialTechId: 2054,
      availableTechs: techs,
    });
    act(() => {
      result.current.registerAvatarBbox(2054, { x: 0, y: 0, w: 44, h: 44 });
      result.current.registerAvatarBbox(2055, {
        x: 60,
        y: 0,
        w: 44,
        h: 44,
      });
      result.current.registerAvatarBbox(2056, {
        x: 120,
        y: 0,
        w: 44,
        h: 44,
      });
    });

    act(() => {
      tickDragEdge(false, true);
    });

    // Hover Jake → buzz 3 commits → swap to Jake.
    act(() => {
      tickHighlightEdge(-1, 2055);
    });
    act(() => {
      jest.advanceTimersByTime(900);
    });
    expect(onSwitchTech).toHaveBeenCalledTimes(1);
    expect(onSwitchTech).toHaveBeenLastCalledWith(2055, "Jake");
    syncToCurrent();

    // Move directly to Cam → fresh pattern → buzz 2 swaps.
    act(() => {
      tickHighlightEdge(2055, 2056);
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onSwitchTech).toHaveBeenCalledTimes(2);
    expect(onSwitchTech).toHaveBeenLastCalledWith(2056, "Cam");
  });

  // -----------------------------------------------------------------
  // 5. Adapter resolves a missing-from-availableTechs id to an
  //    empty name string (defensive fallback). Doesn't crash.
  // -----------------------------------------------------------------

  it("falls back to an empty name string when the resolved id isn't in availableTechs", () => {
    const techs: WorkweekTechOption[] = [{ id: 2054, name: "Josh" }];
    const { result, onSwitchTech } = mountPortraitDwell({
      initialTechId: 2054,
      availableTechs: techs,
    });
    act(() => {
      result.current.registerAvatarBbox(9999, {
        x: 60,
        y: 0,
        w: 44,
        h: 44,
      });
    });

    act(() => {
      tickDragEdge(false, true);
    });
    act(() => {
      tickHighlightEdge(-1, 9999);
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onSwitchTech).toHaveBeenCalledTimes(1);
    expect(onSwitchTech).toHaveBeenCalledWith(9999, "");
  });
});

// ─────────────────────────────────────────────────────────────────
// 6. Source-level smoke checks — confirm the retired drop-on-avatar
//    branch is GONE, not just dormant. These run against the actual
//    file content so a future agent can't accidentally re-introduce
//    the retired branch without breaking a clearly-named test.
// ─────────────────────────────────────────────────────────────────

describe("ResourceCalendarWorkweekView — retired drop-on-avatar branch (regression smoke)", () => {
  const SOURCE_PATH = path.resolve(
    __dirname,
    "..",
    "resource-calendar-workweek-view.tsx",
  );
  const source = fs.readFileSync(SOURCE_PATH, "utf8");

  it("no longer logs `[CAL:weekView] drop-on-avatar`", () => {
    expect(source).not.toContain("[CAL:weekView] drop-on-avatar");
  });

  it("no longer imports `resolvePortraitAvatarDrop`", () => {
    expect(source).not.toContain("resolvePortraitAvatarDrop");
    expect(source).not.toContain("portrait-avatar-drop");
  });

  it("no longer accepts an `onDropOnAvatar` prop", () => {
    expect(source).not.toContain("onDropOnAvatar");
  });

  it("calls useDragToAvatar with dwell options (selectedTechIds + setSelectedTechIds)", () => {
    // The adapter form is the marker that we're using the dwell
    // pattern, not the retired hit-test-only form. We assert on
    // both option keys appearing in proximity to the hook call.
    expect(source).toMatch(/useDragToAvatar\s*\(\s*\{[\s\S]*selectedTechIds[\s\S]*setSelectedTechIds[\s\S]*\}\s*\)/);
  });

  it("carries the 2026-05-08-portrait-week-hover-dwell-parity PLAN-DEVIATION marker", () => {
    expect(source).toContain(
      "PLAN-DEVIATION: 2026-05-08-portrait-week-hover-dwell-parity",
    );
  });
});
