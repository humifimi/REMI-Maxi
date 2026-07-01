/**
 * Unit tests for `useSideArrowTechMount` (PR-UX-3 Phase 2 — 2026-05-07).
 *
 * Coverage matrix:
 *   1. `advance(direction)` writes the next highlight set into the
 *      pending-reality store (delegates to `advanceLink`, exhaustively
 *      tested in `move-chain-link-advance.test.ts`).
 *   2. `advance` no-ops when no chain is isolated.
 *   3. Cross-tech step change triggers `enterWorkweek` AND bumps
 *      `flashKey`. Tech name pulled from `techNamesById`.
 *   4. Same-tech step change is a no-op (no `enterWorkweek`, no
 *      `flashKey` bump). PR-UX-2 single-tech regression.
 *   5. Initial mount on a chain whose active step's source-tech
 *      already matches the workweek's mounted tech does NOT bump
 *      flashKey or call `enterWorkweek`.
 *   6. `canAdvance` returns false when no chain is isolated, true
 *      for a multi-step chain.
 *
 * The hook reads + writes two stores. We reset both before each test
 * via the stores' own resets so the matrix doesn't accumulate state.
 */

import { act, renderHook } from "@testing-library/react-native";

import { useSideArrowTechMount } from "@technician/components/calendar/use-side-arrow-tech-mount";
import { detectMoveChains } from "@technician/utils/detect-move-chains";
import type { LinterAppointment } from "@technician/utils/logistics-linter";
import type { ReorganizationIntent } from "@technician/types/reorganization";
import { useCalendarStore } from "@technician/stores/calendar";
import { usePendingRealityStore } from "@technician/stores/pending-reality";
import { makeIntent } from "@technician/stores/__fixtures__/pending-reality";

const TECH_A = 7001;
const TECH_B = 7002;
const TECH_C = 7003;
const DEMO_DATE = "2026-05-07";

function makeAppt(
  id: number,
  techId: number,
  start: string,
  end: string,
  date: string = DEMO_DATE,
): LinterAppointment {
  return {
    id,
    customer_id: 9000 + id,
    technician_id: techId,
    franchise_id: 1,
    fleet_company_id: null,
    status: "scheduled",
    scheduled_date: date,
    scheduled_start_time: start,
    scheduled_end_time: end,
    recurrence_series_id: null,
  };
}

function reschedule(
  intentId: number,
  apptId: number,
  date: string,
  start: string,
  end: string,
  techId: number,
): ReorganizationIntent {
  return makeIntent(intentId, {
    appointment_id: apptId,
    payload: {
      kind: "reschedule",
      new_scheduled_date: date,
      new_start_time: start,
      new_end_time: end,
      new_technician_id: techId,
    },
  });
}

const TECH_NAMES = new Map<number, string>([
  [TECH_A, "Josh"],
  [TECH_B, "Todd"],
  [TECH_C, "Trey"],
]);

/**
 * Build a 3-tech, 4-step interleaved chain that mirrors the locked
 * PR-UX-3 multi-tech demo seed shape (Josh → Todd → Josh → Todd).
 * Each step's source-tech follows the sequence above; the side-arrow
 * walk should remount onto a different tech on every press.
 */
function buildInterleavedChain() {
  const apptOnA1 = makeAppt(101, TECH_A, "08:00", "09:00");
  const apptOnB1 = makeAppt(102, TECH_B, "09:30", "10:30");
  const apptOnA2 = makeAppt(103, TECH_A, "11:00", "12:00");
  const apptOnB2 = makeAppt(104, TECH_B, "13:00", "14:00");

  // Each subsequent intent's destination matches the next intent's
  // source slot, producing a single linear chain of 4 steps.
  const i1 = reschedule(1, 101, DEMO_DATE, "09:30", "10:30", TECH_B);
  const i2 = reschedule(2, 102, DEMO_DATE, "11:00", "12:00", TECH_A);
  const i3 = reschedule(3, 103, DEMO_DATE, "13:00", "14:00", TECH_B);
  const i4 = reschedule(4, 104, DEMO_DATE, "15:00", "16:00", TECH_C);

  const intents = [i1, i2, i3, i4];
  const appts = [apptOnA1, apptOnB1, apptOnA2, apptOnB2];
  const graph = detectMoveChains(intents, appts);
  expect(graph.chains).toHaveLength(1);
  return { intents, appts, graph, chainId: graph.chains[0]!.id };
}

/**
 * Build an 8-step chain whose source-tech sequence is
 * J J T J T T J J. Drives the tech-run grouping test (revised
 * 2026-05-08): side-arrow press lights the entire next run, not
 * just one dot. Five runs total: [0,1] J, [2] T, [3] J, [4,5] T,
 * [6,7] J.
 */
function buildMixedRunsChain() {
  const a0 = makeAppt(301, TECH_A, "08:00", "09:00");
  const a1 = makeAppt(302, TECH_A, "09:30", "10:30");
  const a2 = makeAppt(303, TECH_B, "11:00", "12:00");
  const a3 = makeAppt(304, TECH_A, "13:00", "14:00");
  const a4 = makeAppt(305, TECH_B, "14:30", "15:30");
  const a5 = makeAppt(306, TECH_B, "16:00", "17:00");
  const a6 = makeAppt(307, TECH_A, "17:30", "18:30");
  const a7 = makeAppt(308, TECH_A, "19:00", "20:00");

  // Each step's destination matches the next step's source slot
  // (cascade rule). Final step terminates on Josh.
  const i0 = reschedule(21, 301, DEMO_DATE, "09:30", "10:30", TECH_A);
  const i1 = reschedule(22, 302, DEMO_DATE, "11:00", "12:00", TECH_B);
  const i2 = reschedule(23, 303, DEMO_DATE, "13:00", "14:00", TECH_A);
  const i3 = reschedule(24, 304, DEMO_DATE, "14:30", "15:30", TECH_B);
  const i4 = reschedule(25, 305, DEMO_DATE, "16:00", "17:00", TECH_B);
  const i5 = reschedule(26, 306, DEMO_DATE, "17:30", "18:30", TECH_A);
  const i6 = reschedule(27, 307, DEMO_DATE, "19:00", "20:00", TECH_A);
  const i7 = reschedule(28, 308, DEMO_DATE, "20:30", "21:30", TECH_A);

  const intents = [i0, i1, i2, i3, i4, i5, i6, i7];
  const appts = [a0, a1, a2, a3, a4, a5, a6, a7];
  const graph = detectMoveChains(intents, appts);
  expect(graph.chains).toHaveLength(1);
  return { intents, appts, graph, chainId: graph.chains[0]!.id };
}

/**
 * Build a single-tech 3-step chain — verifies PR-UX-2 regression
 * (every source equals every other source, no remount, no flash).
 */
function buildSingleTechChain() {
  const a1 = makeAppt(201, TECH_A, "08:00", "09:00");
  const a2 = makeAppt(202, TECH_A, "10:00", "11:00");
  const a3 = makeAppt(203, TECH_A, "12:00", "13:00");
  const i1 = reschedule(11, 201, DEMO_DATE, "10:00", "11:00", TECH_A);
  const i2 = reschedule(12, 202, DEMO_DATE, "12:00", "13:00", TECH_A);
  const i3 = reschedule(13, 203, DEMO_DATE, "14:00", "15:00", TECH_A);
  const intents = [i1, i2, i3];
  const appts = [a1, a2, a3];
  const graph = detectMoveChains(intents, appts);
  expect(graph.chains).toHaveLength(1);
  return { intents, appts, graph, chainId: graph.chains[0]!.id };
}

beforeEach(() => {
  // Reset both stores between tests. The pending-reality store
  // exposes a reset action; the calendar store has no public reset
  // so we set the workweek tech directly.
  act(() => {
    usePendingRealityStore.getState().clear();
    useCalendarStore.setState({
      workweekTechId: TECH_A,
      workweekTechName: "Josh",
      viewMode: "week",
    });
  });
});

describe("useSideArrowTechMount — advance() store writes", () => {
  it("advance('right') writes [activeStep+1] into the spotlight store", () => {
    const { intents, appts, graph, chainId } = buildInterleavedChain();
    act(() => {
      // Isolate the chain with full prefix (matches the chip-tap path
      // which seeds [0..N-1]). The hook treats "highest index" as
      // the active link and walks from there.
      usePendingRealityStore.getState().setSelectedChainId(chainId, 4);
    });

    const { result } = renderHook(() =>
      useSideArrowTechMount({
        graph,
        intents,
        appointments: appts,
        techNamesById: TECH_NAMES,
      }),
    );

    // Pre: store contains the seeded full prefix [0,1,2,3]. Highest
    // index = 3, so right-press wraps to [0].
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([
      0, 1, 2, 3,
    ]);

    act(() => {
      result.current.advance("right");
    });

    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([0]);
  });

  it("advance('left') from [0] wraps to the last link [N-1]", () => {
    const { intents, appts, graph, chainId } = buildInterleavedChain();
    act(() => {
      usePendingRealityStore.getState().setSelectedChainId(chainId, 4);
      usePendingRealityStore.getState().setChainStepHighlights([0]);
    });

    const { result } = renderHook(() =>
      useSideArrowTechMount({
        graph,
        intents,
        appointments: appts,
        techNamesById: TECH_NAMES,
      }),
    );

    act(() => {
      result.current.advance("left");
    });

    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([3]);
  });

  it("advance() no-ops when no chain is isolated", () => {
    const { intents, appts, graph } = buildInterleavedChain();
    act(() => {
      usePendingRealityStore.getState().setSelectedChainId(null);
    });

    const { result } = renderHook(() =>
      useSideArrowTechMount({
        graph,
        intents,
        appointments: appts,
        techNamesById: TECH_NAMES,
      }),
    );

    const before = usePendingRealityStore.getState().chainStepHighlights;
    act(() => {
      result.current.advance("right");
      result.current.advance("left");
    });
    expect(usePendingRealityStore.getState().chainStepHighlights).toBe(before);
  });
});

describe("useSideArrowTechMount — cross-tech remount + flash", () => {
  it("bumps flashKey and calls enterWorkweek when the active step's source-tech changes", () => {
    const { intents, appts, graph, chainId } = buildInterleavedChain();

    // Spy on enterWorkweek so we don't have to wait for store
    // propagation in JSDOM.
    const enterSpy = jest.spyOn(useCalendarStore.getState(), "enterWorkweek");

    act(() => {
      // Mount on TECH_A (matches step 0's source = apptOnA1).
      useCalendarStore.setState({ workweekTechId: TECH_A });
      usePendingRealityStore.getState().setSelectedChainId(chainId, 4);
      // Isolate to step 0 only — initial highlight = step 0 source on TECH_A.
      usePendingRealityStore.getState().setChainStepHighlights([0]);
    });

    const { result, rerender } = renderHook(() =>
      useSideArrowTechMount({
        graph,
        intents,
        appointments: appts,
        techNamesById: TECH_NAMES,
      }),
    );

    // Initial render: source-tech = workweek tech = TECH_A → no flash.
    expect(result.current.flashKey).toBe(0);
    expect(enterSpy).not.toHaveBeenCalled();

    // Advance right → highlights become [1]. Step 1's source =
    // apptOnB1 on TECH_B. Hook should call enterWorkweek(TECH_B,
    // "Todd") and bump flashKey.
    act(() => {
      result.current.advance("right");
    });
    rerender({});

    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([1]);
    expect(enterSpy).toHaveBeenCalledWith(TECH_B, "Todd");
    expect(result.current.flashKey).toBe(1);
    expect(result.current.flashTechName).toBe("Todd");

    enterSpy.mockRestore();
  });

  it("does NOT bump flashKey when the next step's source-tech equals the current tech", () => {
    const { intents, appts, graph, chainId } = buildInterleavedChain();
    const enterSpy = jest.spyOn(useCalendarStore.getState(), "enterWorkweek");

    act(() => {
      useCalendarStore.setState({ workweekTechId: TECH_A });
      usePendingRealityStore.getState().setSelectedChainId(chainId, 4);
      // Step 0: source on TECH_A. Step 2: source on apptOnA2 = TECH_A.
      // Walking 0 → 2 is a non-monotonic case but `setChainStepHighlights`
      // accepts any sorted array, so we set step 2 directly.
      usePendingRealityStore.getState().setChainStepHighlights([0]);
    });

    const { result, rerender } = renderHook(() =>
      useSideArrowTechMount({
        graph,
        intents,
        appointments: appts,
        techNamesById: TECH_NAMES,
      }),
    );

    // Right-press: 0 → 1 (TECH_B). Flash fires.
    act(() => {
      result.current.advance("right");
    });
    rerender({});
    expect(result.current.flashKey).toBe(1);
    enterSpy.mockClear();

    // Now we're on TECH_B; jump to step 2 directly (TECH_A source).
    // Hook should bump flashKey + remount onto TECH_A.
    act(() => {
      useCalendarStore.setState({ workweekTechId: TECH_B });
      usePendingRealityStore.getState().setChainStepHighlights([2]);
    });
    rerender({});
    expect(enterSpy).toHaveBeenCalledWith(TECH_A, "Josh");
    expect(result.current.flashKey).toBe(2);

    // Stay on step 2 (no change) — flashKey must not bump.
    const flashKeyBefore = result.current.flashKey;
    act(() => {
      // Re-set to the same value; the store setter short-circuits and
      // the hook's effect doesn't re-fire.
      usePendingRealityStore.getState().setChainStepHighlights([2]);
    });
    rerender({});
    expect(result.current.flashKey).toBe(flashKeyBefore);

    enterSpy.mockRestore();
  });

  it("PR-UX-2 single-tech regression: walking a same-tech chain never flashes", () => {
    const { intents, appts, graph, chainId } = buildSingleTechChain();
    const enterSpy = jest.spyOn(useCalendarStore.getState(), "enterWorkweek");

    act(() => {
      useCalendarStore.setState({ workweekTechId: TECH_A });
      usePendingRealityStore.getState().setSelectedChainId(chainId, 3);
      usePendingRealityStore.getState().setChainStepHighlights([0]);
    });

    const { result, rerender } = renderHook(() =>
      useSideArrowTechMount({
        graph,
        intents,
        appointments: appts,
        techNamesById: TECH_NAMES,
      }),
    );

    // Walk all the way through: 0 → 1 → 2 → wrap → 0.
    act(() => result.current.advance("right"));
    rerender({});
    act(() => result.current.advance("right"));
    rerender({});
    act(() => result.current.advance("right"));
    rerender({});

    expect(enterSpy).not.toHaveBeenCalled();
    expect(result.current.flashKey).toBe(0);
    expect(result.current.flashTechName).toBeNull();

    enterSpy.mockRestore();
  });
});

describe("useSideArrowTechMount — tech-run grouping (2026-05-08)", () => {
  it("right-arrow lights the entire next run, not just the next dot", () => {
    const { intents, appts, graph, chainId } = buildMixedRunsChain();
    act(() => {
      useCalendarStore.setState({ workweekTechId: TECH_A });
      usePendingRealityStore.getState().setSelectedChainId(chainId, 8);
      // Start on run 0 (Josh, dots 0-1).
      usePendingRealityStore.getState().setChainStepHighlights([0, 1]);
    });

    const { result, rerender } = renderHook(() =>
      useSideArrowTechMount({
        graph,
        intents,
        appointments: appts,
        techNamesById: TECH_NAMES,
      }),
    );

    // Press right → run 1 (Todd, dot 2).
    act(() => result.current.advance("right"));
    rerender({});
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([2]);

    // Press right → run 2 (Josh, dot 3).
    act(() => result.current.advance("right"));
    rerender({});
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([3]);

    // Press right → run 3 (Todd, dots 4-5) — both dots light at once.
    act(() => result.current.advance("right"));
    rerender({});
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([
      4, 5,
    ]);

    // Press right → run 4 (Josh, dots 6-7) — both dots light at once.
    act(() => result.current.advance("right"));
    rerender({});
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([
      6, 7,
    ]);

    // Press right → wraps to run 0 (Josh, dots 0-1).
    act(() => result.current.advance("right"));
    rerender({});
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([
      0, 1,
    ]);
  });

  it("ignores how many dots the user has selected — max(current) resolves the active run", () => {
    const { intents, appts, graph, chainId } = buildMixedRunsChain();
    act(() => {
      useCalendarStore.setState({ workweekTechId: TECH_B });
      usePendingRealityStore.getState().setSelectedChainId(chainId, 8);
      // Non-canonical highlight: prefix `[0..4]` straddling 3 runs.
      // The active link is max=4 (in run 3 [4,5]).
      usePendingRealityStore.getState().setChainStepHighlights([0, 1, 2, 3, 4]);
    });

    const { result, rerender } = renderHook(() =>
      useSideArrowTechMount({
        graph,
        intents,
        appointments: appts,
        techNamesById: TECH_NAMES,
      }),
    );

    // Press right → run 4 (Josh, [6,7]).
    act(() => result.current.advance("right"));
    rerender({});
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([
      6, 7,
    ]);
  });
});

describe("useSideArrowTechMount — canAdvance()", () => {
  it("returns false when no chain is isolated", () => {
    const { intents, appts, graph } = buildInterleavedChain();
    act(() => {
      usePendingRealityStore.getState().setSelectedChainId(null);
    });
    const { result } = renderHook(() =>
      useSideArrowTechMount({
        graph,
        intents,
        appointments: appts,
        techNamesById: TECH_NAMES,
      }),
    );
    expect(result.current.canAdvance("left")).toBe(false);
    expect(result.current.canAdvance("right")).toBe(false);
  });

  it("returns true for a multi-step chain regardless of current state", () => {
    const { intents, appts, graph, chainId } = buildInterleavedChain();
    act(() => {
      usePendingRealityStore.getState().setSelectedChainId(chainId, 4);
    });
    const { result } = renderHook(() =>
      useSideArrowTechMount({
        graph,
        intents,
        appointments: appts,
        techNamesById: TECH_NAMES,
      }),
    );
    expect(result.current.canAdvance("left")).toBe(true);
    expect(result.current.canAdvance("right")).toBe(true);
  });
});
