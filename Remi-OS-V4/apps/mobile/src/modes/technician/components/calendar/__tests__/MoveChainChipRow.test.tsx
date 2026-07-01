/**
 * Tests for `MoveChainChipRow` (PR-UX-1 / move-chain selector PASS 1).
 *
 * Coverage:
 *   1. Renders nothing when the graph has zero chains.
 *   2. Renders the "Show all" pill plus one chip per chain (single-eco).
 *   3. Renders the ecosystem label even when the ecosystem has 1 chain.
 *   4. Renders the ecosystem label when the ecosystem has 2+ chains.
 *   5. Tap a chip → calls onSelect(chainId, totalSteps).
 *   6. Tap the active chip again → calls onSelect(null).
 *   7. Tap "Show all" while a chain is active → calls onSelect(null).
 *   8. Carousel (2026-05-08-chip-row-ecosystem-carousel):
 *      - Shows ONE ecosystem at a time with chevrons + counter.
 *      - Solo ecosystem suppresses chevrons + uses no-of-N counter.
 *      - Auto-steps to the ecosystem of a newly-isolated chain.
 *      - Clamps the active index when the ecosystem list shrinks.
 *      - Thinner-chip styles render without breaking text layout.
 *   9. Side-arrow widget (PR-UX-3 §1.N1) — see nested describe.
 */

import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

jest.mock("@technician/hooks/utility/use-haptics", () => ({
  __esModule: true,
  haptic: { light: jest.fn(), medium: jest.fn(), success: jest.fn() },
}));

import { MoveChainChipRow } from "@technician/components/calendar/MoveChainChipRow";
import type { MoveChainGraph } from "@technician/utils/detect-move-chains";

const SOLO_GRAPH: MoveChainGraph = {
  chains: [
    {
      id: "chain-9001",
      stepColors: ["#F97316"],
      color: "#F97316",
      seedIntentId: 9001,
      intentIds: [9001],
      ecosystemId: "eco-9001",
    },
  ],
  ecosystems: [{ id: "eco-9001", chainIds: ["chain-9001"] }],
  intentToChainId: new Map([[9001, "chain-9001"]]),
};

// Two-ecosystem fixture: each ecosystem has exactly one chain. Used
// by the carousel tests added for `2026-05-08-chip-row-ecosystem-carousel`
// — the chip row now shows ONE ecosystem at a time with chevrons to
// step between them, so the assertions check that the right ecosystem
// is mounted (and the other's chip is NOT in the tree) rather than
// both being simultaneously visible. The earlier
// `2026-05-08-chip-row-ecosystem-vertical-stack` deviation (which
// stacked every ecosystem vertically) is superseded by the carousel.
const TWO_ECOSYSTEMS_GRAPH: MoveChainGraph = {
  chains: [
    {
      id: "chain-911",
      stepColors: ["#F97316", "#F59E0B", "#EAB308", "#22C55E", "#3B82F6", "#8B5CF6"],
      color: "#F97316",
      seedIntentId: 911,
      intentIds: [911, 912, 913, 914, 915, 916],
      ecosystemId: "eco-A",
    },
    {
      id: "chain-917",
      stepColors: ["#EF4444"],
      color: "#EF4444",
      seedIntentId: 917,
      intentIds: [917],
      ecosystemId: "eco-B",
    },
  ],
  ecosystems: [
    { id: "eco-A", chainIds: ["chain-911"] },
    { id: "eco-B", chainIds: ["chain-917"] },
  ],
  intentToChainId: new Map([
    [911, "chain-911"],
    [912, "chain-911"],
    [913, "chain-911"],
    [914, "chain-911"],
    [915, "chain-911"],
    [916, "chain-911"],
    [917, "chain-917"],
  ]),
};

const SPLIT_GRAPH: MoveChainGraph = {
  chains: [
    {
      id: "chain-1",
      stepColors: ["#8B5CF6"],
      color: "#8B5CF6",
      seedIntentId: 1,
      intentIds: [1],
      ecosystemId: "eco-1",
    },
    {
      id: "chain-2",
      stepColors: ["#F97316", "#FACC15"],
      color: "#F97316",
      seedIntentId: 2,
      intentIds: [2, 5],
      ecosystemId: "eco-1",
    },
    {
      id: "chain-3",
      stepColors: ["#EF4444"],
      color: "#EF4444",
      seedIntentId: 3,
      intentIds: [3],
      ecosystemId: "eco-1",
    },
    {
      id: "chain-4",
      stepColors: ["#EC4899", "#16A34A"],
      color: "#EC4899",
      seedIntentId: 4,
      intentIds: [4, 6],
      ecosystemId: "eco-1",
    },
  ],
  ecosystems: [
    {
      id: "eco-1",
      chainIds: ["chain-1", "chain-2", "chain-3", "chain-4"],
    },
  ],
  intentToChainId: new Map([
    [1, "chain-1"],
    [2, "chain-2"],
    [5, "chain-2"],
    [3, "chain-3"],
    [4, "chain-4"],
    [6, "chain-4"],
  ]),
};

describe("MoveChainChipRow", () => {
  it("renders nothing when the graph has no chains", () => {
    const onSelect = jest.fn();
    const { toJSON } = render(
      <MoveChainChipRow
        graph={{ chains: [], ecosystems: [], intentToChainId: new Map() }}
        selectedChainId={null}
        onSelect={onSelect}
      />,
    );
    expect(toJSON()).toBeNull();
  });

  it("renders the Show none + Show all pills plus one chip per chain (PR-UX-16)", () => {
    // PR-UX-16 (PLAN-DEVIATION 2026-05-09-pr-ux-16-followups): the
    // baseline "Show all" pill was renamed to "Show none" (it
    // deselects every chain) and a NEW "Show all" pill activates
    // the all-chains overview. The pre-existing testID
    // `move-chain-show-all` is preserved on the "Show none" button
    // for backwards compatibility; the new pill uses
    // `move-chain-show-all-chains`.
    const onSelect = jest.fn();
    const { getByTestId, getByText } = render(
      <MoveChainChipRow
        graph={SPLIT_GRAPH}
        selectedChainId={null}
        onSelect={onSelect}
      />,
    );
    expect(getByTestId("move-chain-show-all")).toBeTruthy();
    expect(getByTestId("move-chain-show-all-chains")).toBeTruthy();
    expect(getByText("Show none")).toBeTruthy();
    expect(getByText("Show all")).toBeTruthy();
    expect(getByTestId("move-chain-chip-chain-1")).toBeTruthy();
    expect(getByTestId("move-chain-chip-chain-2")).toBeTruthy();
    expect(getByTestId("move-chain-chip-chain-3")).toBeTruthy();
    expect(getByTestId("move-chain-chip-chain-4")).toBeTruthy();
  });

  it("renders one per-step dot per intent in the chain (chip flow shape)", () => {
    // PLAN-DEVIATION: 2026-05-05-per-step-coloring — each chip
    // surfaces its chain's stepColors as a row of dots so the chip
    // legend at the top mirrors the chain visualization on the
    // calendar. chain-2 has 2 steps → 2 dots; chain-3 has 1 step
    // → 1 dot. Pin both shapes.
    const onSelect = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <MoveChainChipRow
        graph={SPLIT_GRAPH}
        selectedChainId={null}
        onSelect={onSelect}
      />,
    );
    expect(getByTestId("move-chain-chip-chain-2-step-0")).toBeTruthy();
    expect(getByTestId("move-chain-chip-chain-2-step-1")).toBeTruthy();
    expect(queryByTestId("move-chain-chip-chain-2-step-2")).toBeNull();

    expect(getByTestId("move-chain-chip-chain-3-step-0")).toBeTruthy();
    expect(queryByTestId("move-chain-chip-chain-3-step-1")).toBeNull();
  });

  it("renders the ecosystem label even when the ecosystem has only 1 chain (canvas Decision 5)", () => {
    // PR-UX-2 PASS 2.6 (2026-05-05): the move-chain canvas locks
    // "ecosystem labels always render so users understand the
    // structural intent" — even single-chain ecosystems get a
    // label. The earlier `>= 2` gate hid the structural intent for
    // the common "a few independent staged moves" case.
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <MoveChainChipRow
        graph={SOLO_GRAPH}
        selectedChainId={null}
        onSelect={onSelect}
      />,
    );
    expect(getByTestId("move-chain-eco-label-eco-9001")).toBeTruthy();
  });

  it("renders the ecosystem label when the ecosystem has 2+ chains", () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <MoveChainChipRow
        graph={SPLIT_GRAPH}
        selectedChainId={null}
        onSelect={onSelect}
      />,
    );
    expect(getByTestId("move-chain-eco-label-eco-1")).toBeTruthy();
  });

  // ─────────────────────────────────────────────────────────────────
  // 2026-05-08 follow-up #6 carousel — `2026-05-08-chip-row-ecosystem-carousel`
  // supersedes the prior `2026-05-08-chip-row-ecosystem-vertical-stack`
  // deviation. The chip row shows ONE ecosystem at a time and chevrons
  // step between them; auto-step snaps to a newly-staged chain's
  // ecosystem; the chevrons + counter are suppressed when there's
  // only 1 ecosystem.
  // ─────────────────────────────────────────────────────────────────

  it("carousel: shows only the active ecosystem's chip with chevrons + counter for 2 ecosystems", () => {
    // Initial render lands on ecosystem A (index 0). Eco-B's chip
    // (`chain-917`) MUST NOT be in the tree until the user steps
    // forward via the right chevron. This is the inverse of the
    // pre-carousel vertical-stack deviation, which rendered both
    // ecosystems simultaneously.
    const onSelect = jest.fn();
    const { getByTestId, queryByTestId, getByText } = render(
      <MoveChainChipRow
        graph={TWO_ECOSYSTEMS_GRAPH}
        selectedChainId={null}
        onSelect={onSelect}
      />,
    );
    expect(getByTestId("move-chain-chip-chain-911")).toBeTruthy();
    expect(queryByTestId("move-chain-chip-chain-917")).toBeNull();

    expect(getByTestId("move-chain-eco-carousel-counter")).toBeTruthy();
    expect(getByText("Ecosystem 1 of 2 · 1 chain")).toBeTruthy();

    const prev = getByTestId("move-chain-eco-carousel-prev");
    const next = getByTestId("move-chain-eco-carousel-next");
    expect(prev.props.accessibilityState).toMatchObject({ disabled: true });
    expect(next.props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("carousel: tapping the right chevron steps to the next ecosystem (and toggles chevron disabled state)", () => {
    const onSelect = jest.fn();
    const { getByTestId, queryByTestId, getByText } = render(
      <MoveChainChipRow
        graph={TWO_ECOSYSTEMS_GRAPH}
        selectedChainId={null}
        onSelect={onSelect}
      />,
    );

    fireEvent.press(getByTestId("move-chain-eco-carousel-next"));

    expect(getByTestId("move-chain-chip-chain-917")).toBeTruthy();
    expect(queryByTestId("move-chain-chip-chain-911")).toBeNull();
    expect(getByText("Ecosystem 2 of 2 · 1 chain")).toBeTruthy();

    const prev = getByTestId("move-chain-eco-carousel-prev");
    const next = getByTestId("move-chain-eco-carousel-next");
    expect(prev.props.accessibilityState).toMatchObject({ disabled: false });
    expect(next.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("carousel: solo ecosystem suppresses chevrons + uses the no-of-N counter", () => {
    // SOLO_GRAPH has 1 ecosystem; the chevrons + 'of N' suffix must
    // collapse to today's compact look ("Ecosystem 1 · 1 chain").
    const onSelect = jest.fn();
    const { queryByTestId, getByTestId, getByText } = render(
      <MoveChainChipRow
        graph={SOLO_GRAPH}
        selectedChainId={null}
        onSelect={onSelect}
      />,
    );
    expect(queryByTestId("move-chain-eco-carousel-prev")).toBeNull();
    expect(queryByTestId("move-chain-eco-carousel-next")).toBeNull();
    expect(queryByTestId("move-chain-eco-carousel-counter")).toBeNull();
    expect(getByTestId("move-chain-eco-carousel-counter-solo")).toBeTruthy();
    expect(getByText("Ecosystem 1 · 1 chain")).toBeTruthy();
  });

  it("carousel: auto-steps to the ecosystem of a newly-isolated chain (selectedChainId change)", () => {
    // Composes with `useAutoIsolateOnStage` — when a fresh drag
    // stages a chain, the consumer sets `selectedChainId` to the
    // new chain's id. The carousel must snap to that chain's
    // ecosystem so the chip is immediately visible.
    const onSelect = jest.fn();
    const { rerender, getByTestId, queryByTestId } = render(
      <MoveChainChipRow
        graph={TWO_ECOSYSTEMS_GRAPH}
        selectedChainId={null}
        onSelect={onSelect}
      />,
    );
    expect(getByTestId("move-chain-chip-chain-911")).toBeTruthy();
    expect(queryByTestId("move-chain-chip-chain-917")).toBeNull();

    rerender(
      <MoveChainChipRow
        graph={TWO_ECOSYSTEMS_GRAPH}
        selectedChainId="chain-917"
        onSelect={onSelect}
      />,
    );
    expect(getByTestId("move-chain-chip-chain-917")).toBeTruthy();
    expect(queryByTestId("move-chain-chip-chain-911")).toBeNull();
  });

  // 2026-05-08 follow-up #7 — chevrons must override an isolated
  // chain's auto-snap so the user can actually navigate AWAY from the
  // ecosystem of the currently-selected chain. The pre-fix behavior
  // ran the auto-snap on every render, so pressing prev/next while
  // `selectedChainId` belonged to a different ecosystem instantly
  // reverted the chevron press. The fix: a `lastSnappedChainIdRef`
  // makes the auto-snap effect fire ONCE per `selectedChainId`
  // transition. Once the user has manually moved the carousel,
  // subsequent re-renders with the SAME `selectedChainId` short-
  // circuit on the ref-guard early-return.
  it("carousel: chevron press survives auto-snap once a chain is isolated (regression)", () => {
    // Render with `chain-917` already isolated → carousel auto-snaps
    // to ecosystem B (index 1). This is the starting state the user
    // hit on-device when the bug surfaced.
    const onSelect = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <MoveChainChipRow
        graph={TWO_ECOSYSTEMS_GRAPH}
        selectedChainId="chain-917"
        onSelect={onSelect}
      />,
    );
    expect(getByTestId("move-chain-chip-chain-917")).toBeTruthy();
    expect(queryByTestId("move-chain-chip-chain-911")).toBeNull();

    // Press the LEFT chevron. The pre-fix bug: the auto-snap effect
    // would re-fire on the next render and stomp the chevron press
    // back to ecosystem 1. Post-fix: the ref-guard already saw
    // `chain-917` once (during auto-snap), so the next render's
    // effect short-circuits and the manual move stands.
    fireEvent.press(getByTestId("move-chain-eco-carousel-prev"));

    // chain-911 (ecosystem A) is now visible; chain-917 is gone.
    // Synchronous assertion — no fake timers, no microtask flush.
    // If the auto-snap effect still re-ran, this would flip back
    // before the assertion lands.
    expect(getByTestId("move-chain-chip-chain-911")).toBeTruthy();
    expect(queryByTestId("move-chain-chip-chain-917")).toBeNull();
  });

  it("carousel: auto-snap fires only on selectedChainId transition, not on every render", () => {
    // Render baseline (no chain isolated) → carousel at index 0.
    const onSelect = jest.fn();
    const { rerender, getByTestId, queryByTestId } = render(
      <MoveChainChipRow
        graph={TWO_ECOSYSTEMS_GRAPH}
        selectedChainId={null}
        onSelect={onSelect}
      />,
    );
    expect(getByTestId("move-chain-chip-chain-911")).toBeTruthy();

    // Re-render with `selectedChainId="chain-917"` → first transition.
    // The ref-guard sees a new value and the auto-snap fires, jumping
    // to ecosystem B.
    rerender(
      <MoveChainChipRow
        graph={TWO_ECOSYSTEMS_GRAPH}
        selectedChainId="chain-917"
        onSelect={onSelect}
      />,
    );
    expect(getByTestId("move-chain-chip-chain-917")).toBeTruthy();
    expect(queryByTestId("move-chain-chip-chain-911")).toBeNull();

    // User presses LEFT chevron → manual move back to ecosystem A.
    fireEvent.press(getByTestId("move-chain-eco-carousel-prev"));
    expect(getByTestId("move-chain-chip-chain-911")).toBeTruthy();
    expect(queryByTestId("move-chain-chip-chain-917")).toBeNull();

    // Re-render with the SAME `selectedChainId` (no change). The
    // ref-guard's early-return must fire and the carousel must STAY
    // at index 0 — without the guard, this re-render would run the
    // auto-snap body again and re-snap to ecosystem B.
    rerender(
      <MoveChainChipRow
        graph={TWO_ECOSYSTEMS_GRAPH}
        selectedChainId="chain-917"
        onSelect={onSelect}
      />,
    );
    expect(getByTestId("move-chain-chip-chain-911")).toBeTruthy();
    expect(queryByTestId("move-chain-chip-chain-917")).toBeNull();
  });

  it("carousel: clamps the active index when the ecosystem list shrinks", () => {
    // Step to ecosystem 2 of 2, then re-render with a SOLO_GRAPH (1
    // ecosystem). The clamp effect must fall back to the remaining
    // ecosystem's chip without crashing.
    const onSelect = jest.fn();
    const { rerender, getByTestId } = render(
      <MoveChainChipRow
        graph={TWO_ECOSYSTEMS_GRAPH}
        selectedChainId={null}
        onSelect={onSelect}
      />,
    );
    fireEvent.press(getByTestId("move-chain-eco-carousel-next"));
    expect(getByTestId("move-chain-chip-chain-917")).toBeTruthy();

    rerender(
      <MoveChainChipRow
        graph={SOLO_GRAPH}
        selectedChainId={null}
        onSelect={onSelect}
      />,
    );
    expect(getByTestId("move-chain-chip-chain-9001")).toBeTruthy();
  });

  it("carousel: thinner-chip pass renders chain labels without crashing (smoke)", () => {
    // 2026-05-08 follow-up #6 chip-thinning pass dropped the chain
    // chip's label fontSize from 13 → 12 and tightened paddings/gaps.
    // Just confirm the new style cascade renders without breaking
    // text layout — a real pixel check would require snapshot or
    // layout measurement.
    const { getByText } = render(
      <MoveChainChipRow
        graph={SOLO_GRAPH}
        selectedChainId={null}
        onSelect={jest.fn()}
      />,
    );
    expect(getByText("Chain 1")).toBeTruthy();
  });

  it("tapping a chip while none is active calls onSelect with the chain id and step count", () => {
    // PR-UX-2 PASS 2.12 (2026-05-05): chip-press now passes the
    // chain length as a second arg so the store can seed the per-
    // step spotlight to the FULL prefix on isolate. chain-2 has
    // 2 steps (intentIds = [2, 5]).
    //
    // Tap target is the inner label Pressable (the outer chip View
    // is no longer pressable since PR-UX-2 PASS 2.11 split the
    // dot row out into independent Pressables).
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <MoveChainChipRow
        graph={SPLIT_GRAPH}
        selectedChainId={null}
        onSelect={onSelect}
      />,
    );
    fireEvent.press(getByTestId("move-chain-chip-chain-2-label"));
    expect(onSelect).toHaveBeenCalledWith("chain-2", 2);
  });

  it("tapping a non-last active chip again calls onSelect(null) (deselect to baseline)", () => {
    // chain-2 is NOT the last chip in SPLIT_GRAPH (chain-4 is). The
    // last chip has special toggle semantics (see dedicated test
    // below); non-last chips deselect to null on second tap.
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <MoveChainChipRow
        graph={SPLIT_GRAPH}
        selectedChainId="chain-2"
        onSelect={onSelect}
      />,
    );
    fireEvent.press(getByTestId("move-chain-chip-chain-2-label"));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("last chip first tap from baseline isolates that chain (with step count)", () => {
    // chain-4 has 2 steps (intentIds = [4, 6]).
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <MoveChainChipRow
        graph={SPLIT_GRAPH}
        selectedChainId={null}
        onSelect={onSelect}
      />,
    );
    fireEvent.press(getByTestId("move-chain-chip-chain-4-label"));
    expect(onSelect).toHaveBeenCalledWith("chain-4", 2);
  });

  it("last chip second tap (when isolating itself) flips to all-chains", () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <MoveChainChipRow
        graph={SPLIT_GRAPH}
        selectedChainId="chain-4"
        onSelect={onSelect}
      />,
    );
    fireEvent.press(getByTestId("move-chain-chip-chain-4-label"));
    expect(onSelect).toHaveBeenCalledWith("all");
  });

  it("last chip tap from all-chains mode goes back to isolating itself (with step count)", () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <MoveChainChipRow
        graph={SPLIT_GRAPH}
        selectedChainId="all"
        onSelect={onSelect}
      />,
    );
    fireEvent.press(getByTestId("move-chain-chip-chain-4-label"));
    expect(onSelect).toHaveBeenCalledWith("chain-4", 2);
  });

  it("last chip tap when a different chain is isolated isolates the last chain (with step count)", () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <MoveChainChipRow
        graph={SPLIT_GRAPH}
        selectedChainId="chain-2"
        onSelect={onSelect}
      />,
    );
    fireEvent.press(getByTestId("move-chain-chip-chain-4-label"));
    expect(onSelect).toHaveBeenCalledWith("chain-4", 2);
  });

  it("Show none from all-chains mode returns to baseline (null) [PR-UX-16: renamed pill]", () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <MoveChainChipRow
        graph={SPLIT_GRAPH}
        selectedChainId="all"
        onSelect={onSelect}
      />,
    );
    fireEvent.press(getByTestId("move-chain-show-all"));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("tapping Show none while a chain is active calls onSelect(null)", () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <MoveChainChipRow
        graph={SPLIT_GRAPH}
        selectedChainId="chain-2"
        onSelect={onSelect}
      />,
    );
    fireEvent.press(getByTestId("move-chain-show-all"));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("tapping Show none when nothing is active is a no-op", () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <MoveChainChipRow
        graph={SPLIT_GRAPH}
        selectedChainId={null}
        onSelect={onSelect}
      />,
    );
    fireEvent.press(getByTestId("move-chain-show-all"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  // PR-UX-16 (PLAN-DEVIATION 2026-05-09-pr-ux-16-followups) — new
  // "Show all" pill that activates ALL_CHAINS_SENTINEL across every
  // ecosystem. The pre-PR-UX-16 path through the last-chip toggle
  // (still working) is covered by the existing "last chip second
  // tap … flips to all-chains" test above.
  describe("PR-UX-16 Show all pill", () => {
    it("tapping Show all from baseline (null) selects ALL_CHAINS_SENTINEL", () => {
      const onSelect = jest.fn();
      const { getByTestId } = render(
        <MoveChainChipRow
          graph={SPLIT_GRAPH}
          selectedChainId={null}
          onSelect={onSelect}
        />,
      );
      fireEvent.press(getByTestId("move-chain-show-all-chains"));
      expect(onSelect).toHaveBeenCalledWith("all");
    });

    it("tapping Show all while a single chain is active still selects ALL_CHAINS_SENTINEL", () => {
      const onSelect = jest.fn();
      const { getByTestId } = render(
        <MoveChainChipRow
          graph={SPLIT_GRAPH}
          selectedChainId="chain-2"
          onSelect={onSelect}
        />,
      );
      fireEvent.press(getByTestId("move-chain-show-all-chains"));
      expect(onSelect).toHaveBeenCalledWith("all");
    });

    it("tapping Show all when already in all-chains mode is a no-op", () => {
      const onSelect = jest.fn();
      const { getByTestId } = render(
        <MoveChainChipRow
          graph={SPLIT_GRAPH}
          selectedChainId="all"
          onSelect={onSelect}
        />,
      );
      fireEvent.press(getByTestId("move-chain-show-all-chains"));
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("Show all pill shows selected state only in ALL_CHAINS_SENTINEL mode", () => {
      const onSelect = jest.fn();
      const { getByTestId, rerender } = render(
        <MoveChainChipRow
          graph={SPLIT_GRAPH}
          selectedChainId={null}
          onSelect={onSelect}
        />,
      );
      let pill = getByTestId("move-chain-show-all-chains");
      expect(pill.props.accessibilityState).toMatchObject({
        selected: false,
      });
      rerender(
        <MoveChainChipRow
          graph={SPLIT_GRAPH}
          selectedChainId="all"
          onSelect={onSelect}
        />,
      );
      pill = getByTestId("move-chain-show-all-chains");
      expect(pill.props.accessibilityState).toMatchObject({
        selected: true,
      });
    });
  });

  it("default labels use global chain numbering across all ecosystems (carousel-aware)", () => {
    // Two solo-chain ecosystems plus a 2-chain ecosystem → 4 chains
    // total. Per-ecosystem indexing would render 'Chain 1' three
    // times; global indexing renders 'Chain 1', 'Chain 2', 'Chain 3',
    // 'Chain 4' regardless of grouping. Under the
    // `2026-05-08-chip-row-ecosystem-carousel` deviation only ONE
    // ecosystem renders at a time, so we step the carousel and
    // assert each ecosystem's chip(s) carry the right global
    // ordinal.
    const MIXED_GRAPH: MoveChainGraph = {
      chains: [
        {
          id: "c-a",
          stepColors: ["#F97316"],
          color: "#F97316",
          seedIntentId: 10,
          intentIds: [10],
          ecosystemId: "eco-A",
        },
        {
          id: "c-b",
          stepColors: ["#8B5CF6", "#FACC15"],
          color: "#8B5CF6",
          seedIntentId: 20,
          intentIds: [20, 21],
          ecosystemId: "eco-B",
        },
        {
          id: "c-c",
          stepColors: ["#EF4444"],
          color: "#EF4444",
          seedIntentId: 22,
          intentIds: [22],
          ecosystemId: "eco-B",
        },
        {
          id: "c-d",
          stepColors: ["#EC4899"],
          color: "#EC4899",
          seedIntentId: 30,
          intentIds: [30],
          ecosystemId: "eco-C",
        },
      ],
      ecosystems: [
        { id: "eco-A", chainIds: ["c-a"] },
        { id: "eco-B", chainIds: ["c-b", "c-c"] },
        { id: "eco-C", chainIds: ["c-d"] },
      ],
      intentToChainId: new Map([
        [10, "c-a"],
        [20, "c-b"],
        [21, "c-b"],
        [22, "c-c"],
        [30, "c-d"],
      ]),
    };

    const { getByText, queryByText, getByTestId } = render(
      <MoveChainChipRow
        graph={MIXED_GRAPH}
        selectedChainId={null}
        onSelect={jest.fn()}
      />,
    );
    expect(getByText("Chain 1")).toBeTruthy();
    expect(queryByText("Chain 2")).toBeNull();

    fireEvent.press(getByTestId("move-chain-eco-carousel-next"));
    expect(getByText("Chain 2")).toBeTruthy();
    expect(getByText("Chain 3")).toBeTruthy();
    expect(queryByText("Chain 1")).toBeNull();
    expect(queryByText("Chain 4")).toBeNull();

    fireEvent.press(getByTestId("move-chain-eco-carousel-next"));
    expect(getByText("Chain 4")).toBeTruthy();
    expect(queryByText("Chain 2")).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────
  // PR-UX-3 (2026-05-07): side-arrow widget on the active chain
  // chip. Spec: handoff doc §1.N1 + §1.N2.
  // ─────────────────────────────────────────────────────────────────

  describe("side-arrow widget (PR-UX-3 §1.N1)", () => {
    it("does not render arrows on chips that aren't actively isolated", () => {
      const { queryByTestId } = render(
        <MoveChainChipRow
          graph={SPLIT_GRAPH}
          selectedChainId="chain-2"
          onSelect={jest.fn()}
          onSideArrowPress={jest.fn()}
          canSideArrowPress={() => true}
        />,
      );
      // chain-2 is active → arrows render on chain-2's chip only.
      expect(queryByTestId("move-chain-chip-chain-2-arrow-left")).toBeTruthy();
      expect(queryByTestId("move-chain-chip-chain-2-arrow-right")).toBeTruthy();
      expect(queryByTestId("move-chain-chip-chain-1-arrow-left")).toBeNull();
      expect(queryByTestId("move-chain-chip-chain-1-arrow-right")).toBeNull();
      expect(queryByTestId("move-chain-chip-chain-4-arrow-left")).toBeNull();
      expect(queryByTestId("move-chain-chip-chain-4-arrow-right")).toBeNull();
    });

    it("does not render arrows when no chain is isolated (Show all baseline)", () => {
      const { queryByTestId } = render(
        <MoveChainChipRow
          graph={SPLIT_GRAPH}
          selectedChainId={null}
          onSelect={jest.fn()}
          onSideArrowPress={jest.fn()}
          canSideArrowPress={() => true}
        />,
      );
      expect(queryByTestId("move-chain-chip-chain-2-arrow-left")).toBeNull();
      expect(queryByTestId("move-chain-chip-chain-2-arrow-right")).toBeNull();
    });

    it("does not render arrows when the wiring callbacks are omitted (PR-UX-2 fallback)", () => {
      const { queryByTestId } = render(
        <MoveChainChipRow
          graph={SPLIT_GRAPH}
          selectedChainId="chain-2"
          onSelect={jest.fn()}
          // Both callbacks omitted → chip-row reverts to its
          // PR-UX-2 behavior with no side-arrow widget.
        />,
      );
      expect(queryByTestId("move-chain-chip-chain-2-arrow-left")).toBeNull();
      expect(queryByTestId("move-chain-chip-chain-2-arrow-right")).toBeNull();
    });

    it("forwards left + right presses to onSideArrowPress with the correct direction", () => {
      const onSideArrowPress = jest.fn();
      const { getByTestId } = render(
        <MoveChainChipRow
          graph={SPLIT_GRAPH}
          selectedChainId="chain-2"
          onSelect={jest.fn()}
          onSideArrowPress={onSideArrowPress}
          canSideArrowPress={() => true}
        />,
      );
      fireEvent.press(getByTestId("move-chain-chip-chain-2-arrow-left"));
      expect(onSideArrowPress).toHaveBeenLastCalledWith("left");
      fireEvent.press(getByTestId("move-chain-chip-chain-2-arrow-right"));
      expect(onSideArrowPress).toHaveBeenLastCalledWith("right");
    });

    it("respects canSideArrowPress(false) — disabled arrows do not fire onSideArrowPress", () => {
      const onSideArrowPress = jest.fn();
      const { getByTestId } = render(
        <MoveChainChipRow
          graph={SPLIT_GRAPH}
          selectedChainId="chain-2"
          onSelect={jest.fn()}
          onSideArrowPress={onSideArrowPress}
          // Both directions disabled (e.g. 1-step chain in
          // canAdvanceLink terms).
          canSideArrowPress={() => false}
        />,
      );
      fireEvent.press(getByTestId("move-chain-chip-chain-2-arrow-left"));
      fireEvent.press(getByTestId("move-chain-chip-chain-2-arrow-right"));
      expect(onSideArrowPress).not.toHaveBeenCalled();
    });
  });
});
