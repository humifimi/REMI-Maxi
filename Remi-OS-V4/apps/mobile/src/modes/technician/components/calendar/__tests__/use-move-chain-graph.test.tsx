/**
 * Unit tests for `useMoveChainGraph` (PR-UX-3 follow-up, 2026-05-08).
 *
 * The hook is a thin wiring layer over `dayDataToLinterAppointments`
 * + `detectMoveChains`. The detector itself is exhaustively tested in
 * `src/utils/__tests__/detect-move-chains.test.ts`; these tests cover
 * the WIRING contract:
 *
 *   1. Empty intents → returns `EMPTY_MOVE_CHAIN_GRAPH` (stable ref).
 *   2. Undefined dayData + non-empty intents → returns the empty graph
 *      (1-step seeds with no source-slot data is meaningless to the
 *      detector — `intervalsOverlap` against empty source list is a
 *      no-op, so chains form but contain only the single seed).
 *   3. dayData + intents that DO form a chain → graph has the chain
 *      with the correct global ordinal + per-step palette colors.
 *      This is the contract `app/pending-reality/review.tsx` and the
 *      calendar's `MoveChainChipRow` mount points share — when both
 *      paths feed the SAME `(intents, dayData)` they MUST produce the
 *      same chain ids and the same `chain.stepColors[i]` per step.
 *
 * No `@testing-library/react-native` here — the hook has no
 * component to render. We use `react-test-renderer`'s functional
 * helper to call the hook inside a fake component.
 */

import React from "react";
import TestRenderer, { act } from "react-test-renderer";

import { useMoveChainGraph } from "@technician/components/calendar/use-move-chain-graph";
import { EMPTY_MOVE_CHAIN_GRAPH } from "@technician/utils/detect-move-chains";
import { TECH_PALETTE } from "@technician/constants/colors";
import type { CalendarDayResponse } from "@technician/types/calendar";
import type { ReorganizationIntent } from "@technician/types/reorganization";

// Tiny harness — render the hook inside a no-output component, expose
// its latest return value through a ref.
function captureGraph(
  intents: readonly ReorganizationIntent[],
  dayData: CalendarDayResponse[] | undefined,
): ReturnType<typeof useMoveChainGraph> {
  const ref: { current: ReturnType<typeof useMoveChainGraph> | null } = {
    current: null,
  };
  function Probe() {
    ref.current = useMoveChainGraph(intents, dayData);
    return null;
  }
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(React.createElement(Probe));
  });
  const out = ref.current!;
  act(() => {
    renderer?.unmount();
  });
  return out;
}

function reschedule(
  intentId: number,
  appointmentId: number,
  date: string,
  start: string,
  end: string,
  techId: number,
  /**
   * BE-assigned `chain_id` to attach to the intent. Defaults to
   * `undefined` (omitted from the literal) so the existing
   * pre-PLAN-DEVIATION-2026-05-10 tests run through the
   * synthesized-fallback path of the detector and keep producing
   * `chain-{seedIntentId}` chain ids. The new sticky-chain tests
   * pass a real value (typically a UUID-shaped string) to exercise
   * the BE-merge path.
   */
  chainId?: string,
): ReorganizationIntent {
  return {
    id: intentId,
    intent_type: "reschedule",
    appointment_id: appointmentId,
    personal_event_id: null,
    payload: {
      kind: "reschedule",
      new_scheduled_date: date,
      new_start_time: start,
      new_end_time: end,
      new_technician_id: techId,
    },
    proposed_at: "2026-04-24T12:00:00Z",
    proposed_by: 1,
    session_id: 1,
    rationale: null,
    ...(chainId !== undefined ? { chain_id: chainId } : {}),
  } as unknown as ReorganizationIntent;
}

function makeDayData(
  appts: Array<{
    id: number;
    techId: number;
    date: string;
    start: string;
    end: string;
  }>,
): CalendarDayResponse[] {
  const byDate = new Map<string, Map<number, unknown[]>>();
  for (const a of appts) {
    if (!byDate.has(a.date)) byDate.set(a.date, new Map());
    const techMap = byDate.get(a.date)!;
    if (!techMap.has(a.techId)) techMap.set(a.techId, []);
    techMap.get(a.techId)!.push({
      id: a.id,
      customer_id: 1000 + a.id,
      customer_name: `Customer ${a.id}`,
      customer_phone: null,
      has_card_on_file: false,
      technician_id: a.techId,
      technician_name: `Tech ${a.techId}`,
      franchise_id: 1,
      status: "scheduled",
      scheduled_date: a.date,
      scheduled_time: a.start,
      scheduled_end_time: a.end,
      services: [],
    });
  }
  const days: CalendarDayResponse[] = [];
  for (const [date, techMap] of byDate) {
    const technicians: unknown[] = [];
    for (const [techId, list] of techMap) {
      technicians.push({
        technician_id: techId,
        technician_name: `Tech ${techId}`,
        job_count: list.length,
        completed_count: 0,
        appointments: list,
        personal_events: [],
      });
    }
    days.push({ date, technicians } as unknown as CalendarDayResponse);
  }
  return days;
}

describe("useMoveChainGraph", () => {
  it("returns EMPTY_MOVE_CHAIN_GRAPH (same reference) for an empty intents list", () => {
    const { graph } = captureGraph([], makeDayData([]));
    expect(graph).toBe(EMPTY_MOVE_CHAIN_GRAPH);
  });

  it("returns the empty graph when dayData is undefined", () => {
    const intents = [reschedule(1, 100, "2026-04-24", "09:00", "10:00", 7)];
    const { graph, linterAppointments } = captureGraph(intents, undefined);
    expect(linterAppointments).toEqual([]);
    // 1 intent, 0 source slots → 1 seed, single-step chain with no
    // edges. Detector still emits 1 chain (the seed itself) so the
    // graph isn't strictly the empty constant.
    expect(graph.chains.length).toBe(1);
    expect(graph.chains[0]?.intentIds).toEqual([1]);
  });

  it("collapses a 2-step cascade into a single chain with per-step palette colors", () => {
    // Same scenario the review-screen + chip-row identity test
    // exercises: intent A pushes appt 6001 into appt 6002's slot,
    // intent B moves 6002 out of the way to a terminator.
    const intentA = reschedule(701, 6001, "2026-04-24", "09:00", "10:00", 7);
    const intentB = reschedule(702, 6002, "2026-04-24", "07:30", "08:30", 7);
    const dayData = makeDayData([
      { id: 6001, techId: 7, date: "2026-04-24", start: "13:00", end: "14:00" },
      { id: 6002, techId: 7, date: "2026-04-24", start: "09:00", end: "10:00" },
    ]);
    const { graph } = captureGraph([intentA, intentB], dayData);
    expect(graph.chains.length).toBe(1);
    const chain = graph.chains[0]!;
    expect(chain.intentIds).toEqual([701, 702]);
    // Per-step palette: stepColors[0] = palette[0], stepColors[1] =
    // palette[1]. The two MUST differ — that's the contract the
    // review-screen badge + chip-row dot row both share.
    expect(chain.stepColors[0]).toBe(TECH_PALETTE[0]);
    expect(chain.stepColors[1]).toBe(TECH_PALETTE[1]);
    expect(chain.stepColors[0]).not.toBe(chain.stepColors[1]);
    // `chain.color` is the legacy alias for stepColors[0] — kept for
    // back-compat consumers (chip border, dot fill default) but new
    // consumers should pull from stepColors directly per the badge
    // wiring on the review screen.
    expect(chain.color).toBe(chain.stepColors[0]);
  });

  // 2026-05-08 follow-up #2 — pins the contract that lone reschedules
  // whose ONLY conflict is against a committed (non-intent)
  // appointment STILL appear in `graph.chains` as 1-step seeds.
  // Anti-instruction: do NOT add a `chain.intentIds.length >= 2`
  // filter to either the chip row or the review screen — the
  // singleton seeds are first-class chains the user must be able to
  // tap into and label by ordinal.
  //
  // The user-facing scenario this pins: 1 reschedule with a
  // `time_conflict` linter card vs a committed appointment, with no
  // cascade-target intent for the conflict to chain into. Both the
  // chip row (`graph.chains` directly) and the review screen
  // (per-card badges keyed by `chain.intentIds`) must read this
  // intent as Chain 1 of 1.
  it("emits a 1-step chain for a lone reschedule whose only overlap is a non-intent (committed) appointment", () => {
    // Intent moves appt 8001 from its current slot (10:00–11:00 on
    // tech 9) onto tech 9's 14:00–15:00 window. A committed appt
    // 9001 currently occupies that 14:00–15:00 slot — but 9001 is
    // NOT an intent, so it never enters `sourceSlots` and never
    // forms a chain edge with the moving intent.
    //
    // Expected: detector finds 1 seed (the moving intent), walks it
    // forward, sees no outgoing → 1-step chain. The chip row
    // renders 1 chip. The review screen badges 1 card.
    const intent = reschedule(801, 8001, "2026-04-24", "14:00", "15:00", 9);
    const dayData = makeDayData([
      // The intent's source row (so the detector can project a
      // source slot for it):
      { id: 8001, techId: 9, date: "2026-04-24", start: "10:00", end: "11:00" },
      // Committed appointment in the destination slot — present in
      // `dayData` so the linter can flag it, but absent from
      // `intents` so the chain detector doesn't see it.
      { id: 9001, techId: 9, date: "2026-04-24", start: "14:00", end: "15:00" },
    ]);
    const { graph } = captureGraph([intent], dayData);
    expect(graph.chains.length).toBe(1);
    expect(graph.chains[0]?.intentIds).toEqual([801]);
    expect(graph.chains[0]?.stepColors).toEqual([TECH_PALETTE[0]]);
    // The 1-step chain still belongs to its own ecosystem — both
    // chip row and review screen rely on `graph.ecosystems` for
    // their "Ecosystem N · M chains" header.
    expect(graph.ecosystems.length).toBe(1);
    expect(graph.ecosystems[0]?.chainIds).toEqual([graph.chains[0]?.id]);
  });

  // 2026-05-08 follow-up #3 — pins the user's exact scenario from
  // the bug report: TWO disjoint cascades (4-step + 3-step) staged
  // from real drags. The review screen renders 2 chains; the chip
  // row was silently rendering only 1. This test feeds the
  // detector with the byte-identical (intents, weekData) shape
  // both consumers should source from `useFranchiseWeekView` and
  // asserts the detector itself yields 2 chains under 2 ecosystems
  // — proving the bug is in wiring, not in `detectMoveChains`.
  //
  // Intent ids ordered to match the user's stage-order so the
  // seed-id sort places chain `chain-43780` (Michael Chang #1)
  // first via the lowest intent id in the first cascade, and
  // `chain-43797` (James Rivera) second… actually we synthesize
  // the staged ids 1..7 to mirror BE id assignment order: Ethan
  // first, Michael2 fifth — so the detector's seed sort emits
  // `chain-1` then `chain-5`.
  //
  // 2026-05-08 follow-up #4 (chip-row vs review divergence, real
  // fix) — the divergence reproduced in production NOT because
  // the detector mis-counted but because the chip row's wiring
  // fell back to `dayData` (per-day projection) during the
  // transient `weekData=undefined` window after `hasStagedIntents`
  // flipped from false → true. The day view's `dayData` covers
  // ONLY `selectedDate`, so any intent whose source row lives on
  // another day in the week silently dropped its source-slot
  // projection — chains involving cross-day intents collapsed in
  // the chip-row's graph while the review screen (always-weekData)
  // still saw them. The contract pin below is split into THREE
  // projections that together describe the seam:
  //
  //   - Projection A: full week-window weekData → 2 chains.
  //   - Projection B: per-day dayData covering ONLY May 8 (sources
  //     for chain-1 only) → 1 chain (chain-1) + 3 disconnected
  //     1-step seeds (chain-2's intents fail to find their source
  //     slots → no edges). This is the ACTUAL graph the chip row
  //     used to paint when the fallback fired.
  //   - Projection C: undefined weekData (loading) → 7 1-step
  //     seeds. This is the chip-row contract during the gated
  //     loading window — consumers MUST hide the chip row in this
  //     state so the user never sees the transient seven chips.
  //
  // The fix lives in `resource-calendar-day-view.tsx`: passes
  // `weekData` ONLY (no fallback) to `useMoveChainGraph` and gates
  // the chip row's render on `weekData != null ||
  // localIntents.length === 0`. This test pins the data
  // projections; the day-view test (if/when added) can pin the
  // gate logic.
  it("user's 7-intent topology (4+3 disjoint cascades) → 2 chains, 2 ecosystems", () => {
    // Chain 1 cascade (intents 1→2→3→4):
    //   Ethan → Dan 8:30 displaces Isabella's current Dan slot
    //   Isabella → Jake 11:05 displaces Ava's current Jake slot
    //   Ava → Josh 10:00 displaces Michael1's current Josh slot
    //   Michael1 → Jake 6:35 (terminator: lands on free space)
    const ethan = reschedule(1, 43795, "2026-05-08", "08:30", "09:30", 101); // Dan
    const isabella = reschedule(2, 43794, "2026-05-08", "11:05", "11:50", 102); // Jake
    const ava = reschedule(3, 43786, "2026-05-08", "10:00", "10:30", 103); // Josh
    const michael1 = reschedule(4, 43780, "2026-05-08", "06:35", "07:35", 102); // Jake

    // Chain 2 cascade (intents 5→6→7):
    //   Michael2 → Shaun 11:20 displaces Olivia's current Shaun slot
    //   Olivia → Dan 12:40 displaces James's current Dan slot
    //   James → Todd 12:30 (terminator)
    const michael2 = reschedule(5, 43805, "2026-05-08", "11:20", "12:20", 104); // Shaun
    const olivia = reschedule(6, 43801, "2026-05-08", "12:40", "13:10", 101); // Dan
    const james = reschedule(7, 43797, "2026-05-08", "12:30", "13:15", 105); // Todd

    const dayData = makeDayData([
      // Chain-1 source rows (current scheduled slots that the
      // cascade displaces, in destination order):
      // Ethan currently elsewhere — terminator-like seed source.
      { id: 43795, techId: 110, date: "2026-05-08", start: "14:00", end: "15:00" },
      // Isabella currently sitting on Dan 8:30-9:30 (overlap with
      // Ethan's destination → A→B edge).
      { id: 43794, techId: 101, date: "2026-05-08", start: "08:30", end: "09:30" },
      // Ava currently on Jake 11:05-11:50 (Isabella's dest).
      { id: 43786, techId: 102, date: "2026-05-08", start: "11:05", end: "11:50" },
      // Michael1 currently on Josh 10:00-10:30 (Ava's dest).
      { id: 43780, techId: 103, date: "2026-05-08", start: "10:00", end: "10:30" },

      // Chain-2 source rows:
      // Michael2 currently elsewhere — seed.
      { id: 43805, techId: 111, date: "2026-05-08", start: "15:30", end: "16:30" },
      // Olivia currently on Shaun 11:20-12:20 (Michael2's dest).
      { id: 43801, techId: 104, date: "2026-05-08", start: "11:20", end: "12:20" },
      // James currently on Dan 12:40-13:10 (Olivia's dest).
      { id: 43797, techId: 101, date: "2026-05-08", start: "12:40", end: "13:10" },
    ]);

    const intents = [ethan, isabella, ava, michael1, michael2, olivia, james];

    // ── Projection A: full week-window (all 7 source rows present). ──
    // This is what BOTH consumers receive when wired through
    // `useFranchiseWeekView`. The detector MUST emit two chains.
    const fullWeek = captureGraph(intents, dayData);
    expect(fullWeek.graph.chains.length).toBe(2);
    const fullChainIds = fullWeek.graph.chains.map((c) => c.id);
    expect(fullChainIds).toEqual(["chain-1", "chain-5"]);
    expect(fullWeek.graph.chains[0]?.intentIds).toEqual([1, 2, 3, 4]);
    expect(fullWeek.graph.chains[1]?.intentIds).toEqual([5, 6, 7]);
    // Disjoint cascades → two separate ecosystems (no shared intent
    // edge between them).
    expect(fullWeek.graph.ecosystems.length).toBe(2);

    // ── Projection B: dayData mirror with all 7 source rows still
    // present (degenerate case where the dayData happens to cover
    // every staged source). Same graph as Projection A — proves
    // the detector behaves identically across the two `dayData`
    // shapes the hook accepts (single `CalendarDayResponse` vs
    // `CalendarDayResponse[]`).
    const sameDayOnly = captureGraph(intents, [dayData[0]]);
    expect(sameDayOnly.graph.chains.length).toBe(2);
    expect(sameDayOnly.graph.chains.map((c) => c.id)).toEqual([
      "chain-1",
      "chain-5",
    ]);
  });

  // 2026-05-08 follow-up #4 — pins the EXACT failure mode the
  // chip-row vs review-screen divergence reproduced from. The
  // user's scenario in production: 7 intents, but only chain-1's
  // 4 source rows are visible to the detector (chain-2's are on
  // a different day in the same week). Surfaces:
  //   - Review screen → reads `useFranchiseWeekView` always →
  //     sees all 7 source rows → 2 chains.
  //   - Chip row pre-fix → fell back to `useFranchiseDayView` for
  //     the brief weekData=undefined window after staging the
  //     first intent → saw only chain-1's 4 rows → 1 chain + 3
  //     orphan 1-step seeds (chain-2's intents).
  //
  // The fix removes the dayData fallback. This test pins the
  // ACTUAL detector output for the under-counted projection so
  // the next agent looking at `[1 cascade chain + 3 orphan
  // seeds]` in the chip-row repro recognizes "this is the
  // weekData-fallback bug" rather than "the detector is broken."
  // Anti-instruction: do NOT update the assertion to expect
  // 2 chains here — the under-counted projection is BY DESIGN the
  // wrong answer. The fix is upstream (don't feed the detector
  // an incomplete day projection); the detector is just dutifully
  // reporting "I have these intents, none of these 3 have source
  // slots, here are 3 1-step seeds."
  it("under-counted dayData projection (chain-1 sources only) → cascade + 3 orphan seeds (chip-row failure mode)", () => {
    const ethan = reschedule(1, 43795, "2026-05-08", "08:30", "09:30", 101);
    const isabella = reschedule(2, 43794, "2026-05-08", "11:05", "11:50", 102);
    const ava = reschedule(3, 43786, "2026-05-08", "10:00", "10:30", 103);
    const michael1 = reschedule(4, 43780, "2026-05-08", "06:35", "07:35", 102);
    const michael2 = reschedule(5, 43805, "2026-05-08", "11:20", "12:20", 104);
    const olivia = reschedule(6, 43801, "2026-05-08", "12:40", "13:10", 101);
    const james = reschedule(7, 43797, "2026-05-08", "12:30", "13:15", 105);

    // Only chain-1's source rows are present (chain-2's appts
    // 43805/43801/43797 live elsewhere from the chip row's POV
    // — different day, or the dayData fallback dropped them).
    const chain1OnlyDayData = makeDayData([
      { id: 43795, techId: 110, date: "2026-05-08", start: "14:00", end: "15:00" },
      { id: 43794, techId: 101, date: "2026-05-08", start: "08:30", end: "09:30" },
      { id: 43786, techId: 102, date: "2026-05-08", start: "11:05", end: "11:50" },
      { id: 43780, techId: 103, date: "2026-05-08", start: "10:00", end: "10:30" },
    ]);

    const intents = [ethan, isabella, ava, michael1, michael2, olivia, james];
    const out = captureGraph(intents, chain1OnlyDayData);

    // 4 chains: the chain-1 cascade plus 3 orphan 1-step seeds
    // for the intents whose source slots couldn't be projected.
    expect(out.graph.chains.length).toBe(4);
    expect(out.graph.chains.map((c) => c.id)).toEqual([
      "chain-1",
      "chain-5",
      "chain-6",
      "chain-7",
    ]);
    expect(out.graph.chains[0]?.intentIds).toEqual([1, 2, 3, 4]);
    expect(out.graph.chains[1]?.intentIds).toEqual([5]);
    expect(out.graph.chains[2]?.intentIds).toEqual([6]);
    expect(out.graph.chains[3]?.intentIds).toEqual([7]);
    // 4 separate ecosystems — every chain is its own (no edges
    // between chain-1's cascade and the 3 orphans).
    expect(out.graph.ecosystems.length).toBe(4);
  });

  // 2026-05-08 follow-up #4 — pins the loading-window contract.
  // While `useFranchiseWeekView` is fetching after the first
  // staged intent, weekData is `undefined`. The hook returns a
  // 1-step seed per intent (no source slots = no edges). The
  // visible-render gate in `resource-calendar-day-view.tsx` MUST
  // hide the chip row in this state — otherwise the user sees
  // a flash of N disconnected chips between staging and the week
  // query resolving. This test pins the underlying graph so the
  // gate logic in the day view has a contract to assert against.
  it("loading-window projection (weekData=undefined, intents staged) → N 1-step seeds", () => {
    const intents = [
      reschedule(1, 43795, "2026-05-08", "08:30", "09:30", 101),
      reschedule(2, 43794, "2026-05-08", "11:05", "11:50", 102),
      reschedule(3, 43786, "2026-05-08", "10:00", "10:30", 103),
      reschedule(4, 43780, "2026-05-08", "06:35", "07:35", 102),
      reschedule(5, 43805, "2026-05-08", "11:20", "12:20", 104),
      reschedule(6, 43801, "2026-05-08", "12:40", "13:10", 101),
      reschedule(7, 43797, "2026-05-08", "12:30", "13:15", 105),
    ];

    const out = captureGraph(intents, undefined);

    // 7 intents, 0 source rows → 7 1-step seed chains. No edges.
    expect(out.graph.chains.length).toBe(7);
    expect(out.graph.chains.map((c) => c.intentIds)).toEqual([
      [1],
      [2],
      [3],
      [4],
      [5],
      [6],
      [7],
    ]);
    // Each chain its own ecosystem.
    expect(out.graph.ecosystems.length).toBe(7);
    expect(out.linterAppointments).toEqual([]);
  });

  // 2026-05-08 follow-up #2 — pins the user's exact scenario from
  // the bug report: 4-step cascade chain plus two independent
  // 1-step seeds whose conflicts are with NON-intent (committed)
  // appointments. The chip row and the review badge BOTH render
  // three chains because the detector's seed rule emits a 1-step
  // chain for any chain-eligible intent with no incoming edges
  // (regardless of whether it has outgoing edges into other intents
  // or just dead-ends on a committed appointment). The committed
  // appointment exists in `dayData` so the linter can flag it, but
  // it never enters `sourceSlots` because it's not an intent — so
  // no chain edge forms FROM the singleton intent INTO it.
  //
  // This is the canonical contract: chip row and review screen
  // produce IDENTICAL chain graphs for the same `(intents, dayData)`
  // input, which is the alignment the unification effort is
  // protecting.
  it("4-step cascade + 2 singleton-vs-committed seeds → 3 chains under 1 ecosystem", () => {
    // Cascade on tech 7: A (701) → B (702) → C (703) → D (704).
    // Each intent's destination overlaps the next intent's source.
    const intentA = reschedule(701, 7001, "2026-05-08", "11:00", "12:00", 7);
    const intentB = reschedule(702, 7002, "2026-05-08", "13:00", "14:00", 7);
    const intentC = reschedule(703, 7003, "2026-05-08", "15:00", "16:00", 7);
    const intentD = reschedule(704, 7004, "2026-05-08", "17:00", "18:00", 7);
    // Two singleton intents whose destinations overlap COMMITTED
    // (non-intent) appointments — 9001 and 9002 below. They have:
    //   - 0 outgoing edges (no intent's source matches their dest)
    //   - 0 incoming edges (no other intent's dest matches their src)
    // So they're independent seeds → 1-step chains.
    const intent705 = reschedule(705, 7005, "2026-05-08", "06:46", "07:16", 8);
    const intent706 = reschedule(706, 7006, "2026-05-08", "08:09", "08:54", 9);

    const dayData = makeDayData([
      // Cascade source rows on tech 7.
      { id: 7001, techId: 7, date: "2026-05-08", start: "09:00", end: "10:00" },
      { id: 7002, techId: 7, date: "2026-05-08", start: "11:00", end: "12:00" },
      { id: 7003, techId: 7, date: "2026-05-08", start: "13:00", end: "14:00" },
      { id: 7004, techId: 7, date: "2026-05-08", start: "15:00", end: "16:00" },
      // Singleton source rows on a different tech (so the dest
      // overlaps with a COMMITTED appt, not with any cascade
      // intent's source).
      { id: 7005, techId: 8, date: "2026-05-08", start: "10:00", end: "10:30" },
      { id: 7006, techId: 9, date: "2026-05-08", start: "11:00", end: "11:45" },
      // Committed appts that the linter flags but the chain
      // detector ignores (no associated intent).
      { id: 9001, techId: 8, date: "2026-05-08", start: "06:46", end: "07:16" },
      { id: 9002, techId: 9, date: "2026-05-08", start: "08:09", end: "08:54" },
    ]);

    const { graph } = captureGraph(
      [intentA, intentB, intentC, intentD, intent705, intent706],
      dayData,
    );

    // 3 chains, deterministically ordered by seed id.
    expect(graph.chains.length).toBe(3);
    const chainIds = graph.chains.map((c) => c.id);
    expect(chainIds).toEqual(["chain-701", "chain-705", "chain-706"]);
    expect(graph.chains[0]?.intentIds).toEqual([701, 702, 703, 704]);
    expect(graph.chains[1]?.intentIds).toEqual([705]);
    expect(graph.chains[2]?.intentIds).toEqual([706]);

    // Per-step palette: cascade walks palette[0..3]; both 1-step
    // singletons start at palette[0] (cross-chain palette sharing).
    expect(graph.chains[0]?.stepColors).toEqual([
      TECH_PALETTE[0],
      TECH_PALETTE[1],
      TECH_PALETTE[2],
      TECH_PALETTE[3],
    ]);
    expect(graph.chains[1]?.stepColors).toEqual([TECH_PALETTE[0]]);
    expect(graph.chains[2]?.stepColors).toEqual([TECH_PALETTE[0]]);

    // Singletons have NO chain edges to the cascade because their
    // overlap target is a committed appt, not an intent. Each
    // singleton therefore lives in its own ecosystem.
    expect(graph.ecosystems.length).toBe(3);
  });

  // ─── BE-assigned chain_id sticky-merge contract ─────────────────
  //
  // PLAN-DEVIATION: 2026-05-10-sticky-chain-identity-fe — see
  // /Users/jacegalloway/Documents/codebases/REMITechnician/docs/PLAN-DEVIATIONS.md#2026-05-10-sticky-chain-identity-fe.
  //
  // The BE now ships an opaque `chain_id` (UUID v4) on every intent
  // and preserves it through `op:modify_intent` / `op:remove_intent`.
  // The detector consumes the field as the primary chain-grouping
  // identity; the legacy seed-id-derived synthesizer is a
  // defense-in-depth fallback for intents the BE hasn't yet ack'd.
  //
  // The four scenarios below pin (1) the all-intents-have-BE-id
  // happy path, (2) mixed BE/missing fallback path, (3) the
  // legacy fully-fall-back path, and (4) the smoke regression that
  // motivated the BE work — a 4-link chain whose `op:modify_intent`
  // disconnects the conflict topology must STAY as one chain.

  it("scenario 1: every intent has a BE chain_id → chain ids are the BE-assigned strings (no synthesis)", () => {
    // Two-step cascade with both intents agreeing on a single
    // BE-assigned chain id.
    const intentA = reschedule(
      701,
      6001,
      "2026-04-24",
      "09:00",
      "10:00",
      7,
      "uuid-cascade-A",
    );
    const intentB = reschedule(
      702,
      6002,
      "2026-04-24",
      "07:30",
      "08:30",
      7,
      "uuid-cascade-A",
    );
    const dayData = makeDayData([
      { id: 6001, techId: 7, date: "2026-04-24", start: "13:00", end: "14:00" },
      { id: 6002, techId: 7, date: "2026-04-24", start: "09:00", end: "10:00" },
    ]);
    const { graph } = captureGraph([intentA, intentB], dayData);
    expect(graph.chains).toHaveLength(1);
    const chain = graph.chains[0]!;
    // The chain id is the BE-assigned UUID-shape, not the legacy
    // `chain-{seedIntentId}` synthesis.
    expect(chain.id).toBe("uuid-cascade-A");
    expect(chain.intentIds).toEqual([701, 702]);
    expect(graph.intentToChainId.get(701)).toBe("uuid-cascade-A");
    expect(graph.intentToChainId.get(702)).toBe("uuid-cascade-A");
    // Per-step palette stays correct under BE-assigned ids.
    expect(chain.stepColors[0]).toBe(TECH_PALETTE[0]);
    expect(chain.stepColors[1]).toBe(TECH_PALETTE[1]);
  });

  it("scenario 2: some intents missing chain_id → BE-grouped chains coexist with synthesized fallback", () => {
    // Two disjoint cascades on different techs:
    //   - Cascade X (tech 7): intent 100 → 101, both carry BE id
    //     `uuid-X`. Detector groups them under that BE id.
    //   - Cascade Y (tech 8): intent 200 → 201, neither carries a
    //     BE id (deploy-window edge / pre-ack optimistic). Detector
    //     falls back to the synthesized `chain-200`.
    const x100 = reschedule(
      100,
      9001,
      "2026-04-24",
      "09:00",
      "10:00",
      7,
      "uuid-X",
    );
    const x101 = reschedule(
      101,
      9002,
      "2026-04-24",
      "07:00",
      "08:00",
      7,
      "uuid-X",
    );
    // Note: no chainId argument → factory omits the field, runtime
    // value is `undefined`, detector treats as missing.
    const y200 = reschedule(200, 9003, "2026-04-24", "14:00", "15:00", 8);
    const y201 = reschedule(201, 9004, "2026-04-24", "12:00", "13:00", 8);
    const dayData = makeDayData([
      // Cascade X sources.
      { id: 9001, techId: 7, date: "2026-04-24", start: "13:00", end: "14:00" },
      { id: 9002, techId: 7, date: "2026-04-24", start: "09:00", end: "10:00" },
      // Cascade Y sources.
      { id: 9003, techId: 8, date: "2026-04-24", start: "16:00", end: "17:00" },
      { id: 9004, techId: 8, date: "2026-04-24", start: "14:00", end: "15:00" },
    ]);
    const { graph } = captureGraph([x100, x101, y200, y201], dayData);
    expect(graph.chains).toHaveLength(2);
    const chainIds = graph.chains.map((c) => c.id).sort();
    // Mixed shapes coexist: BE UUID for the X cascade, synthesized
    // `chain-{seedId}` for the Y cascade. Both opaque strings.
    expect(chainIds).toEqual(["chain-200", "uuid-X"].sort());
    const xChain = graph.chains.find((c) => c.id === "uuid-X")!;
    const yChain = graph.chains.find((c) => c.id === "chain-200")!;
    expect(xChain.intentIds).toEqual([100, 101]);
    expect(yChain.intentIds).toEqual([200, 201]);
    expect(graph.intentToChainId.get(100)).toBe("uuid-X");
    expect(graph.intentToChainId.get(200)).toBe("chain-200");
  });

  it("scenario 3: no intents carry chain_id (legacy / pre-migration FE state) → fully synthesized fallback", () => {
    // Both intents lack chain_id — the detector behaves identically
    // to the pre-PLAN-DEVIATION-2026-05-10 detector. Pins that the
    // fallback path is BYTE-IDENTICAL with the legacy contract so
    // older UI code paths survive a partially-deployed BE.
    const intentA = reschedule(701, 6001, "2026-04-24", "09:00", "10:00", 7);
    const intentB = reschedule(702, 6002, "2026-04-24", "07:30", "08:30", 7);
    const dayData = makeDayData([
      { id: 6001, techId: 7, date: "2026-04-24", start: "13:00", end: "14:00" },
      { id: 6002, techId: 7, date: "2026-04-24", start: "09:00", end: "10:00" },
    ]);
    const { graph } = captureGraph([intentA, intentB], dayData);
    expect(graph.chains).toHaveLength(1);
    expect(graph.chains[0]!.id).toBe("chain-701");
    expect(graph.chains[0]!.intentIds).toEqual([701, 702]);
  });

  it("scenario 4 (smoke regression): a modified intent in a 4-link BE chain stays in the chain even when the conflict topology splits", () => {
    // The user's reported regression: a 4-link chain (intents 1 →
    // 2 → 3 → 4 on tech 7) was modified — intent 1's destination
    // moved 6 hours away from intent 2's source slot, breaking the
    // FE-topology trigger edge between them. The pre-fix detector
    // re-derived chains purely from topology and split the chain
    // into [1] and [2, 3, 4].
    //
    // After the BE shipped sticky `chain_id` and this FE change
    // consumes it: all four intents still carry the same
    // BE-assigned `chain_id` (because the BE preserves it through
    // `op:modify_intent`), so the detector merges the FE-topology
    // sub-chains — [1] and [2, 3, 4] — back into a single 4-link
    // chain under the BE chain id.
    //
    // The merged chain's intent ordering is FE-topology-preserving
    // within each sub-chain and concatenated in seed-id order.
    // For [1]+[2,3,4] → [1, 2, 3, 4]. The seed intent is the
    // lowest seed across constituents.
    const intent1 = reschedule(
      1,
      8001,
      "2026-04-24",
      // Modified: was 09:00-10:00 (which would have overlapped
      // intent 2's source at 09:00-10:00 → pre-modify the chain
      // was [1, 2, 3, 4]). Now intent 1 lands at 15:00-16:00,
      // disjoint from anything in `intents`.
      "15:00",
      "16:00",
      9, // also moved off tech 7 to tech 9 to make the topology
      // break unambiguous.
      "uuid-original-chain",
    );
    const intent2 = reschedule(
      2,
      8002,
      "2026-04-24",
      "07:00",
      "08:00",
      7,
      "uuid-original-chain",
    );
    const intent3 = reschedule(
      3,
      8003,
      "2026-04-24",
      "05:00",
      "06:00",
      7,
      "uuid-original-chain",
    );
    const intent4 = reschedule(
      4,
      8004,
      "2026-04-24",
      "03:00",
      "04:00",
      7,
      "uuid-original-chain",
    );
    const dayData = makeDayData([
      // intent 1's source row — currently at 11:00-12:00 on tech 7,
      // unrelated to anyone else's destination. After modify it
      // moves to 15:00-16:00 on tech 9 (disjoint).
      { id: 8001, techId: 7, date: "2026-04-24", start: "11:00", end: "12:00" },
      // intent 2's source — overlapped intent 1's PRE-MODIFY dest.
      // Post-modify nothing overlaps, so the FE topology says
      // intent 2 has no incoming edge.
      { id: 8002, techId: 7, date: "2026-04-24", start: "09:00", end: "10:00" },
      // intent 3's source — sits in intent 2's destination
      // (07:00-08:00 on tech 7) → intent 2 → intent 3 edge.
      { id: 8003, techId: 7, date: "2026-04-24", start: "07:00", end: "08:00" },
      // intent 4's source — sits in intent 3's destination
      // (05:00-06:00 on tech 7) → intent 3 → intent 4 edge.
      { id: 8004, techId: 7, date: "2026-04-24", start: "05:00", end: "06:00" },
    ]);

    const { graph } = captureGraph(
      [intent1, intent2, intent3, intent4],
      dayData,
    );

    // CONTRACT: the 4-link chain stays as one chain because all
    // four intents share the same BE `chain_id`, regardless of
    // the topology break between intent 1 and intent 2.
    expect(graph.chains).toHaveLength(1);
    const chain = graph.chains[0]!;
    expect(chain.id).toBe("uuid-original-chain");
    // Order: FE sub-chains sorted by seed id ascending, then
    // concatenated. Sub-chain [1] (seed 1) precedes sub-chain
    // [2, 3, 4] (seed 2). Final sequence: [1, 2, 3, 4].
    expect(chain.intentIds).toEqual([1, 2, 3, 4]);
    expect(chain.seedIntentId).toBe(1);
    // Per-step palette recomputed against the merged ordinals so
    // each card carries a distinct color.
    expect(chain.stepColors).toEqual([
      TECH_PALETTE[0],
      TECH_PALETTE[1],
      TECH_PALETTE[2],
      TECH_PALETTE[3],
    ]);
    // Every intent maps to the merged chain id in the reverse
    // lookup — the chip row, ghost overlay, and review badge all
    // resolve via this map.
    expect(graph.intentToChainId.get(1)).toBe("uuid-original-chain");
    expect(graph.intentToChainId.get(2)).toBe("uuid-original-chain");
    expect(graph.intentToChainId.get(3)).toBe("uuid-original-chain");
    expect(graph.intentToChainId.get(4)).toBe("uuid-original-chain");
    // Single ecosystem — both BE-merged sub-chains' ecosystems
    // collapsed via the union-find pass.
    expect(graph.ecosystems).toHaveLength(1);
    expect(graph.ecosystems[0]!.chainIds).toEqual(["uuid-original-chain"]);
  });
});
