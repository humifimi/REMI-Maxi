/**
 * `computeMoveChainArrows` unit tests — PR-UX-2 PASS 2.2.
 *
 * Geometry-only assertions: each test sets up a `MoveChainGraph` via
 * `detectMoveChains`, picks a calendar layout (workweek or day),
 * calls the geometry helper, and asserts the resulting arrow segments
 * have the right endpoints + colors. No React, no Reanimated, no SVG
 * — the helper is pure.
 *
 * Coordinate sanity checks use the exact layout numbers from the
 * `[CAL:lib] layout params` debug log captured during smoke testing
 * (TIME_LABEL_WIDTH=50, APPOINTMENT_BLOCK_WIDTH=86, hourHeight=80,
 * minuteOffset=300 = 5:00 AM grid origin) so the assertions match
 * what would render on-device.
 */

import type { ReorganizationIntent } from "@technician/types/reorganization";
import type { LinterAppointment } from "@technician/utils/logistics-linter";
import { makeIntent } from "@technician/stores/__fixtures__/pending-reality";
import { detectMoveChains } from "@technician/utils/detect-move-chains";
import { ALL_CHAINS_SENTINEL } from "@technician/components/calendar/MoveChainChipRow";
import {
  computeMoveChainArrows,
  TERMINAL_GREY_CONTINUATION_COLOR,
  type MoveChainCalendarLayout,
} from "@technician/components/calendar/compute-move-chain-arrows";
import { __test__ as MoveChainArrowOverlayTest } from "@technician/components/calendar/MoveChainArrowOverlay";

const DATE_MON = "2026-05-04";
const DATE_TUE = "2026-05-05";
const TECH_JOSH = 2054;
const TECH_JAKE = 2055;

function makeAppt(
  id: number,
  techId: number,
  date: string,
  start: string,
  end: string,
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
  appointmentId: number,
  date: string,
  start: string,
  end: string,
  techId?: number,
): ReorganizationIntent {
  return makeIntent(intentId, {
    appointment_id: appointmentId,
    payload: {
      kind: "reschedule",
      new_scheduled_date: date,
      new_start_time: start,
      new_end_time: end,
      new_technician_id: techId,
    },
  });
}

const WORKWEEK_LAYOUT: MoveChainCalendarLayout = {
  viewType: "workweek",
  hourHeight: 80,
  minuteOffset: 300, // 5:00 AM grid origin
  appointmentBlockWidth: 86,
  timeLabelWidth: 50,
  daysWindow: [DATE_MON, DATE_TUE, "2026-05-06", "2026-05-07"],
  resourceId: TECH_JOSH,
};

const DAY_LAYOUT: MoveChainCalendarLayout = {
  viewType: "day",
  hourHeight: 80,
  minuteOffset: 300,
  appointmentBlockWidth: 86,
  timeLabelWidth: 50,
  selectedDate: DATE_MON,
  resources: [
    { id: TECH_JOSH },
    { id: TECH_JAKE },
    { id: 2056 },
  ],
};

describe("computeMoveChainArrows", () => {
  // ---------------------------------------------------------------
  // Selection-state guards (mirror the ghost-tile injector contract)
  // ---------------------------------------------------------------

  it("returns [] when selectedChainId is null (Show all baseline)", () => {
    const apptA = makeAppt(101, TECH_JOSH, DATE_MON, "10:00", "11:00");
    const intentA = reschedule(1, 101, DATE_MON, "13:00", "14:00", TECH_JOSH);
    const graph = detectMoveChains([intentA], [apptA]);

    const out = computeMoveChainArrows(
      graph,
      [intentA],
      [apptA],
      null,
      WORKWEEK_LAYOUT,
    );
    expect(out).toEqual([]);
  });

  it("returns [] when graph has no chains, even in 'all' mode", () => {
    const out = computeMoveChainArrows(
      { chains: [], ecosystems: [], intentToChainId: new Map() },
      [],
      [],
      ALL_CHAINS_SENTINEL,
      WORKWEEK_LAYOUT,
    );
    expect(out).toEqual([]);
  });

  // ---------------------------------------------------------------
  // 1-step chain on workweek view
  // ---------------------------------------------------------------

  it("emits one segment for a 1-step chain with both endpoints visible (workweek)", () => {
    // Olivia 9:25-10:25 on Mon Josh, rescheduled to Mon 9:00-10:00 on Josh.
    const apptOlivia = makeAppt(101, TECH_JOSH, DATE_MON, "09:25", "10:25");
    const intentResched = reschedule(
      1,
      101,
      DATE_MON,
      "09:00",
      "10:00",
      TECH_JOSH,
    );
    const graph = detectMoveChains([intentResched], [apptOlivia]);

    const out = computeMoveChainArrows(
      graph,
      [intentResched],
      [apptOlivia],
      "chain-1",
      WORKWEEK_LAYOUT,
    );

    expect(out).toHaveLength(1);
    const seg = out[0]!;
    expect(seg.intentId).toBe(1);
    expect(seg.chainId).toBe("chain-1");
    expect(seg.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(seg.fromOffscreen).toBeNull();
    expect(seg.toOffscreen).toBeNull();

    // Mon column index 0 → x = 50 + 0 * 86 = 50; column center = 50 + 86/2 = 93.
    const expectedColCenterX = 50 + 86 / 2;
    expect(seg.from!.x).toBe(expectedColCenterX);
    expect(seg.to!.x).toBe(expectedColCenterX);

    // Source y: midpoint of 09:25 (565 min) -> 10:25 (625 min). Body
    // origin at minuteOffset=300, hourHeight=80 → y(t) = (t-300)*80/60.
    // y(565) = (565-300)*80/60 = 353.33...; y(625) = 433.33...
    // Center = 393.33...
    expect(seg.from!.y).toBeCloseTo(((565 + 625) / 2 - 300) * (80 / 60), 5);

    // Dest y: 09:00 (540) -> 10:00 (600); center = 570.
    expect(seg.to!.y).toBeCloseTo((570 - 300) * (80 / 60), 5);
  });

  // ---------------------------------------------------------------
  // 2-step chain (cascade) — both segments emitted, distinct intents
  // ---------------------------------------------------------------

  it("emits two segments for a 2-step linear chain", () => {
    // Aqua moves to Green's slot, Green moves to an empty earlier slot.
    const apptGreen = makeAppt(101, TECH_JOSH, DATE_MON, "09:00", "10:00");
    const apptAqua = makeAppt(102, TECH_JOSH, DATE_MON, "13:30", "14:30");
    const intentAqua = reschedule(
      1,
      102,
      DATE_MON,
      "09:00",
      "10:00",
      TECH_JOSH,
    );
    const intentGreen = reschedule(
      2,
      101,
      DATE_MON,
      "07:30",
      "08:30",
      TECH_JOSH,
    );
    const graph = detectMoveChains(
      [intentAqua, intentGreen],
      [apptGreen, apptAqua],
    );
    expect(graph.chains).toHaveLength(1);
    const chainId = graph.chains[0]!.id;

    const out = computeMoveChainArrows(
      graph,
      [intentAqua, intentGreen],
      [apptGreen, apptAqua],
      chainId,
      WORKWEEK_LAYOUT,
    );

    expect(out).toHaveLength(2);
    const intentIds = new Set(out.map((s) => s.intentId));
    expect(intentIds).toEqual(new Set([1, 2]));
    // All segments share the same chain identity.
    expect(new Set(out.map((s) => s.chainId))).toEqual(new Set([chainId]));
    // PLAN-DEVIATION: 2026-05-05-per-step-coloring — segments use the
    // intent's per-step color (`stepColors[k]`), so a 2-step chain
    // produces TWO distinct hues (palette[0] + palette[1]). Prior to
    // PR-UX-2 PASS 2.5 the chain carried one identity color and this
    // assertion read `size === 1`; the assertion is corrected to
    // match the new contract during PR-UX-3 Phase 1 (the original
    // PASS 2.5 commit shipped without updating it).
    expect(new Set(out.map((s) => s.color)).size).toBe(2);
    // Both endpoints visible on Mon Josh.
    for (const s of out) {
      expect(s.from).not.toBeNull();
      expect(s.to).not.toBeNull();
      expect(s.fromOffscreen).toBeNull();
      expect(s.toOffscreen).toBeNull();
    }
  });

  // ---------------------------------------------------------------
  // Off-screen handling (cross-tech in workweek view)
  // ---------------------------------------------------------------

  it("marks the destination off-screen when its tech doesn't match the workweek's pinned resource", () => {
    // Source on Josh, destination tech reassigned to Jake. Workweek
    // is pinned to Josh, so the destination column doesn't exist in
    // the visible window.
    const apptSrc = makeAppt(101, TECH_JOSH, DATE_MON, "10:00", "11:00");
    const intentReassign = reschedule(
      1,
      101,
      DATE_MON,
      "10:00",
      "11:00",
      TECH_JAKE, // <- moves off Josh's column
    );
    const graph = detectMoveChains([intentReassign], [apptSrc]);

    const out = computeMoveChainArrows(
      graph,
      [intentReassign],
      [apptSrc],
      graph.chains[0]!.id,
      WORKWEEK_LAYOUT,
    );

    expect(out).toHaveLength(1);
    const seg = out[0]!;
    expect(seg.from).not.toBeNull();
    expect(seg.to).toBeNull();
    expect(seg.fromOffscreen).toBeNull();
    expect(seg.toOffscreen).toBeNull(); // Tech mismatch returns null offscreen — overlay treats as silent skip.
  });

  it("marks the source off-screen when its date isn't in the workweek window", () => {
    // Source on a date outside the 4-day visible window.
    const apptSrc = makeAppt(101, TECH_JOSH, "2026-04-20", "10:00", "11:00");
    const intent = reschedule(
      1,
      101,
      "2026-04-20",
      "13:00",
      "14:00",
      TECH_JOSH,
    );
    const graph = detectMoveChains([intent], [apptSrc]);

    const out = computeMoveChainArrows(
      graph,
      [intent],
      [apptSrc],
      graph.chains[0]!.id,
      WORKWEEK_LAYOUT,
    );

    expect(out).toHaveLength(1);
    const seg = out[0]!;
    expect(seg.from).toBeNull();
    expect(seg.fromOffscreen).toBe("right");
    expect(seg.to).toBeNull();
    expect(seg.toOffscreen).toBe("right");
  });

  // ---------------------------------------------------------------
  // Day view (multi-tech, single-day) — column index = tech position
  // ---------------------------------------------------------------

  it("uses tech column index in day view (cross-tech reassign visible)", () => {
    // Source on Josh column 0, reassigned to Jake column 1.
    const apptSrc = makeAppt(101, TECH_JOSH, DATE_MON, "10:00", "11:00");
    const intentReassign = reschedule(
      1,
      101,
      DATE_MON,
      "10:00",
      "11:00",
      TECH_JAKE,
    );
    const graph = detectMoveChains([intentReassign], [apptSrc]);

    const out = computeMoveChainArrows(
      graph,
      [intentReassign],
      [apptSrc],
      graph.chains[0]!.id,
      DAY_LAYOUT,
    );

    expect(out).toHaveLength(1);
    const seg = out[0]!;
    expect(seg.from).not.toBeNull();
    expect(seg.to).not.toBeNull();
    // Josh column center: 50 + 0*86 + 86/2 = 93.
    expect(seg.from!.x).toBe(50 + 86 / 2);
    // Jake column center: 50 + 1*86 + 86/2 = 179.
    expect(seg.to!.x).toBe(50 + 86 + 86 / 2);
  });

  // ---------------------------------------------------------------
  // 'all' mode — every chain's segments come back together
  // ---------------------------------------------------------------

  it("returns segments for every chain when selectedChainId is 'all'", () => {
    const apptA = makeAppt(101, TECH_JOSH, DATE_MON, "08:00", "09:00");
    const apptB = makeAppt(102, TECH_JOSH, DATE_MON, "14:00", "15:00");
    const intentA = reschedule(1, 101, DATE_MON, "11:00", "12:00", TECH_JOSH);
    const intentB = reschedule(2, 102, DATE_MON, "16:00", "17:00", TECH_JOSH);
    const graph = detectMoveChains([intentA, intentB], [apptA, apptB]);
    expect(graph.chains).toHaveLength(2);

    const out = computeMoveChainArrows(
      graph,
      [intentA, intentB],
      [apptA, apptB],
      ALL_CHAINS_SENTINEL,
      WORKWEEK_LAYOUT,
    );

    expect(out).toHaveLength(2);
    // Each segment carries its own chain identity (no cross-contamination).
    expect(new Set(out.map((s) => s.intentId))).toEqual(new Set([1, 2]));
    expect(new Set(out.map((s) => s.chainId)).size).toBe(2);
  });

  // ---------------------------------------------------------------
  // create intent has no source — emit nothing rather than guess
  // ---------------------------------------------------------------

  it("skips create intents (no source tile to anchor the arrow)", () => {
    const create = makeIntent(99, {
      appointment_id: null,
      payload: {
        kind: "create",
        customer_id: 9001,
        technician_id: TECH_JOSH,
        scheduled_date: DATE_MON,
        scheduled_start_time: "11:00",
        scheduled_end_time: "12:00",
        service_ids: [1],
      },
    });
    const graph = detectMoveChains([create], []);
    expect(graph.chains).toHaveLength(1);

    const out = computeMoveChainArrows(
      graph,
      [create],
      [],
      graph.chains[0]!.id,
      WORKWEEK_LAYOUT,
    );
    expect(out).toEqual([]);
  });

  // ---------------------------------------------------------------
  // Unassigned source guard
  // ---------------------------------------------------------------

  // ---------------------------------------------------------------
  // PR-UX-2 PASS 2.14 (2026-05-05): inter-day cascade arrows must
  // not produce wild arcs.
  //
  // Background: when a cascade chain straddles two day-columns in
  // workweek view, the LAST step's source typically sits near the
  // bottom of day-N's column and its destination sits near the top
  // of day-N+1's column. The chord between them can run 400+ px
  // vertically with only ~85 px of horizontal offset. Without a
  // cap on the perpendicular control-point offset, `CURVE_BOW *
  // chordLen ≈ 75` px, which the user reported as the arrow
  // "going crazy" — the Bezier sweeps wide of any tile rect.
  //
  // The fix lives in `MoveChainArrowOverlay`'s `resolveArrow` (the
  // overlay does the SVG path math, not the `compute*` helper),
  // capped by `MAX_CURVE_BOW = 40` px. We assert the cap by
  // feeding `resolveArrow` an extreme synthetic segment and
  // pulling the control-point coordinate off the resulting
  // `M ... Q cx cy ...` path string.
  // ---------------------------------------------------------------

  describe("inter-day cascade arrow curvature cap (PASS 2.14)", () => {
    function controlPointFromPathD(pathD: string): { cx: number; cy: number } {
      // Path shape from `resolveArrow`:
      //   "M <fx> <fy> Q <cx> <cy> <bx> <by>"
      const match = pathD.match(
        /^M\s+\S+\s+\S+\s+Q\s+(\S+)\s+(\S+)\s+\S+\s+\S+$/,
      );
      if (!match) throw new Error(`unexpected path shape: ${pathD}`);
      return { cx: Number(match[1]), cy: Number(match[2]) };
    }

    it("clamps the Bezier control-point offset for a very long chord", () => {
      // Synthetic on-device shape from the user's logs: source at
      // (178.625, 480) bottom of day-N column; dest at (264.375,
      // 73.23) top of day-N+1 column. Chord length ≈ 415 px →
      // unclamped bow would be ~75 px (CURVE_BOW=0.18 * 415).
      const seg = {
        intentId: 509,
        chainId: "chain-506",
        color: "#16A34A",
        from: { x: 178.625, y: 480 },
        to: { x: 264.375, y: 73.23 },
        fromOffscreen: null,
        toOffscreen: null,
      } as const;
      const r = MoveChainArrowOverlayTest.resolveArrow(seg);
      expect(r).not.toBeNull();
      const { cx, cy } = controlPointFromPathD(r!.pathD);

      const midX = (seg.from.x + seg.to.x) / 2;
      const midY = (seg.from.y + seg.to.y) / 2;
      const offset = Math.hypot(cx - midX, cy - midY);
      // MAX_CURVE_BOW = 40 (kept private to the overlay).
      // Allow a tiny epsilon for the JS float arithmetic.
      expect(offset).toBeLessThanOrEqual(40 + 1e-6);
    });

    it("leaves short-chord curvature untouched (offset ≈ CURVE_BOW * len)", () => {
      // Tiny chord (~50 px) → unclamped bow ~9 px, well under the
      // 40 px cap; the fraction-of-length formula should still fire.
      const seg = {
        intentId: 1,
        chainId: "chain-1",
        color: "#FF0000",
        from: { x: 100, y: 100 },
        to: { x: 150, y: 100 },
        fromOffscreen: null,
        toOffscreen: null,
      } as const;
      const r = MoveChainArrowOverlayTest.resolveArrow(seg);
      expect(r).not.toBeNull();
      const { cx, cy } = controlPointFromPathD(r!.pathD);
      const midX = (seg.from.x + seg.to.x) / 2;
      const midY = (seg.from.y + seg.to.y) / 2;
      const offset = Math.hypot(cx - midX, cy - midY);
      // 50 px chord * 0.18 = 9 px unclamped offset.
      expect(offset).toBeCloseTo(9, 5);
    });
  });

  it("skips appointments with null technician_id (can't place an arrow on a phantom column)", () => {
    const orphan = makeAppt(101, TECH_JOSH, DATE_MON, "10:00", "11:00");
    // Mutate after to bypass our makeAppt typing — represents the real
    // "appointment not yet assigned to a tech" state.
    (orphan as { technician_id: number | null }).technician_id = null;
    const intent = reschedule(1, 101, DATE_MON, "13:00", "14:00", TECH_JOSH);
    const graph = detectMoveChains([intent], [orphan]);

    const out = computeMoveChainArrows(
      graph,
      [intent],
      [orphan],
      graph.chains[0]!.id,
      WORKWEEK_LAYOUT,
    );
    expect(out).toEqual([]);
  });

  // ---------------------------------------------------------------
  // PR-UX-3 (2026-05-07): grey terminal continuation arrow.
  //
  // When the active step is the last highlighted link AND there are
  // more unhighlighted dots remaining further down the chain, the
  // compute layer emits an extra synthetic segment off the right
  // edge in `#9CA3AF`. The overlay treats it as a non-interactive
  // muted stub. See `pr-ux-3-multi-tech-handoff.md` §1.A4 and §10.A4
  // of `multi-tech-move-chain-plan.md`.
  //
  // PLAN-DEVIATION: 2026-05-10-grey-arrow-only-when-offscreen —
  // tightened the §1.A4 contract. The stub now emits ONLY when the
  // immediately-next step's destination resolves OFF-SCREEN under
  // the current layout (off-tech, off-date, or off-`resourceIds`).
  // Pre-fix the stub fired for every non-final selected dot and
  // painted spurious grey arrows in landscape multi-tech mode where
  // the continuation card was already visible. See
  // `docs/PLAN-DEVIATIONS.md#2026-05-10-grey-arrow-only-when-offscreen`.
  // ---------------------------------------------------------------

  describe("terminal grey continuation arrow (PR-UX-3 §1.A4 + off-screen gate)", () => {
    /**
     * Three same-tech reschedules forming one linear chain, ALL
     * destinations on-screen (Josh, DATE_MON, inside `daysWindow`).
     * Used to verify the "no grey stub when continuation is on-
     * screen" half of the contract.
     */
    function build3StepChainAllOnScreen(): {
      intents: ReorganizationIntent[];
      appts: LinterAppointment[];
      chainId: string;
    } {
      const apptA = makeAppt(101, TECH_JOSH, DATE_MON, "08:00", "09:00");
      const apptB = makeAppt(102, TECH_JOSH, DATE_MON, "09:00", "10:00");
      const apptC = makeAppt(103, TECH_JOSH, DATE_MON, "13:00", "14:00");
      // Linear cascade: C → B's slot, B → A's slot, A → empty
      // earlier slot. detectMoveChains produces one chain head→tail.
      const intentC = reschedule(3, 103, DATE_MON, "09:00", "10:00", TECH_JOSH);
      const intentB = reschedule(2, 102, DATE_MON, "08:00", "09:00", TECH_JOSH);
      const intentA = reschedule(1, 101, DATE_MON, "07:00", "08:00", TECH_JOSH);
      const intents = [intentC, intentB, intentA];
      const appts = [apptA, apptB, apptC];
      const graph = detectMoveChains(intents, appts);
      expect(graph.chains).toHaveLength(1);
      return { intents, appts, chainId: graph.chains[0]!.id };
    }

    /**
     * Three same-tech reschedules where step-2's destination lands
     * on a date OUTSIDE `WORKWEEK_LAYOUT.daysWindow` ("2026-05-08"
     * vs the window of `[DATE_MON, DATE_TUE, 2026-05-06, 2026-05-07]`).
     * Steps 0 and 1 stay on-screen. Used to verify the "DO emit
     * grey stub when continuation is off-screen" half of the
     * contract for the `[0,1]` prefix case.
     */
    function build3StepChainWithStep2Offscreen(): {
      intents: ReorganizationIntent[];
      appts: LinterAppointment[];
      chainId: string;
    } {
      const OFF_WINDOW_DATE = "2026-05-08";
      // Same cascade shape as `build3StepChainAllOnScreen` (so step
      // 0 and step 1 both stay on-screen), but intentA (the chain's
      // last step) reschedules its appointment to a date OUTSIDE
      // `daysWindow`. Step 1's destination MUST remain on-screen so
      // the grey-stub anchor segment has a non-null `to` point —
      // pre-existing PR-UX-3 §1.A4 condition 4.
      const apptA = makeAppt(101, TECH_JOSH, DATE_MON, "08:00", "09:00");
      const apptB = makeAppt(102, TECH_JOSH, DATE_MON, "09:00", "10:00");
      const apptC = makeAppt(103, TECH_JOSH, DATE_MON, "13:00", "14:00");
      const intentC = reschedule(3, 103, DATE_MON, "09:00", "10:00", TECH_JOSH);
      const intentB = reschedule(2, 102, DATE_MON, "08:00", "09:00", TECH_JOSH);
      const intentA = reschedule(
        1,
        101,
        OFF_WINDOW_DATE,
        "07:00",
        "08:00",
        TECH_JOSH,
      );
      const intents = [intentC, intentB, intentA];
      const appts = [apptA, apptB, apptC];
      const graph = detectMoveChains(intents, appts);
      expect(graph.chains).toHaveLength(1);
      return { intents, appts, chainId: graph.chains[0]!.id };
    }

    /**
     * Two-step chain where step 1's destination is off-screen
     * (different date). Used to verify the prefix `[0]` emit path.
     */
    function build2StepChainWithStep1Offscreen(): {
      intents: ReorganizationIntent[];
      appts: LinterAppointment[];
      chainId: string;
    } {
      const OFF_WINDOW_DATE = "2026-05-08";
      // Chain order will be intentB (on-screen) → intentA (off-screen).
      // intentB.dest = DATE_MON 09:00-10:00 Josh; intentA.source =
      // appt 101 originally at DATE_MON 09:00-10:00 Josh → overlap →
      // chain edge B → A. intentA.dest = OFF_WINDOW_DATE 07:00-08:00
      // Josh (off-screen).
      const apptA = makeAppt(101, TECH_JOSH, DATE_MON, "09:00", "10:00");
      const apptB = makeAppt(102, TECH_JOSH, DATE_MON, "13:00", "14:00");
      const intentB = reschedule(2, 102, DATE_MON, "09:00", "10:00", TECH_JOSH);
      const intentA = reschedule(
        1,
        101,
        OFF_WINDOW_DATE,
        "07:00",
        "08:00",
        TECH_JOSH,
      );
      const intents = [intentB, intentA];
      const appts = [apptA, apptB];
      const graph = detectMoveChains(intents, appts);
      expect(graph.chains).toHaveLength(1);
      expect(graph.chains[0]!.intentIds).toHaveLength(2);
      return { intents, appts, chainId: graph.chains[0]!.id };
    }

    it("does NOT emit a grey continuation segment when [0] is lit and the next step is on-screen", () => {
      const { intents, appts, chainId } = build3StepChainAllOnScreen();
      const graph = detectMoveChains(intents, appts);
      const out = computeMoveChainArrows(
        graph,
        intents,
        appts,
        chainId,
        WORKWEEK_LAYOUT,
        [0],
      );
      // 1 real arrow (step 0) only. The next step's destination is
      // on Josh DATE_MON (in `daysWindow`) so the grey stub
      // suppresses.
      expect(out).toHaveLength(1);
      expect(out.filter((s) => s.terminalGreyContinuation)).toHaveLength(0);
    });

    it("does NOT emit a grey continuation segment for prefix [0,1] when step 2 is on-screen", () => {
      const { intents, appts, chainId } = build3StepChainAllOnScreen();
      const graph = detectMoveChains(intents, appts);
      const out = computeMoveChainArrows(
        graph,
        intents,
        appts,
        chainId,
        WORKWEEK_LAYOUT,
        [0, 1],
      );
      // 2 real arrows; step 2's destination is on Josh DATE_MON so
      // no grey stub.
      expect(out).toHaveLength(2);
      expect(out.filter((s) => s.terminalGreyContinuation)).toHaveLength(0);
    });

    it("DOES emit a grey continuation segment when [0] is lit and the next step is off-screen", () => {
      const { intents, appts, chainId } = build2StepChainWithStep1Offscreen();
      const graph = detectMoveChains(intents, appts);
      const out = computeMoveChainArrows(
        graph,
        intents,
        appts,
        chainId,
        WORKWEEK_LAYOUT,
        [0],
      );
      // 1 real arrow (step 0) + 1 grey continuation stub because
      // step 1's destination lands on a date outside `daysWindow`.
      expect(out).toHaveLength(2);
      const continuation = out.find((s) => s.terminalGreyContinuation);
      expect(continuation).toBeDefined();
      expect(continuation!.color).toBe(TERMINAL_GREY_CONTINUATION_COLOR);
      expect(continuation!.to).toBeNull();
      expect(continuation!.toOffscreen).toBe("right");
      expect(continuation!.from).not.toBeNull();
      expect(continuation!.chainId).toBe(chainId);
    });

    it("DOES emit a grey continuation segment for prefix [0,1] when step 2 is off-screen", () => {
      const { intents, appts, chainId } = build3StepChainWithStep2Offscreen();
      const graph = detectMoveChains(intents, appts);
      const out = computeMoveChainArrows(
        graph,
        intents,
        appts,
        chainId,
        WORKWEEK_LAYOUT,
        [0, 1],
      );
      // 2 real arrows + 1 grey continuation stub anchored at
      // step 1's on-screen destination, pointing off-screen toward
      // step 2's off-window destination.
      expect(out).toHaveLength(3);
      expect(out.filter((s) => s.terminalGreyContinuation)).toHaveLength(1);
    });

    it("does NOT emit a continuation segment when the highest lit step IS the last", () => {
      const { intents, appts, chainId } = build3StepChainAllOnScreen();
      const graph = detectMoveChains(intents, appts);
      // Full prefix [0,1,2] — the 2nd step is the last in this chain,
      // so the trigger condition fails regardless of on/off-screen.
      const out = computeMoveChainArrows(
        graph,
        intents,
        appts,
        chainId,
        WORKWEEK_LAYOUT,
        [0, 1, 2],
      );
      expect(out).toHaveLength(3);
      expect(out.filter((s) => s.terminalGreyContinuation)).toHaveLength(0);
    });

    it("does NOT emit a continuation segment when chainStepHighlights is empty", () => {
      const { intents, appts, chainId } = build3StepChainAllOnScreen();
      const graph = detectMoveChains(intents, appts);
      const out = computeMoveChainArrows(
        graph,
        intents,
        appts,
        chainId,
        WORKWEEK_LAYOUT,
        [],
      );
      // Empty highlights → no real arrows AND no continuation stub.
      expect(out).toEqual([]);
    });

    it("does NOT emit a continuation segment in 'all chains' mode", () => {
      const { intents, appts } = build2StepChainWithStep1Offscreen();
      const graph = detectMoveChains(intents, appts);
      const out = computeMoveChainArrows(
        graph,
        intents,
        appts,
        ALL_CHAINS_SENTINEL,
        WORKWEEK_LAYOUT,
        [0],
      );
      // Even though the next step is off-screen, the all-chains
      // sentinel never emits the stub — it doesn't have a single
      // chain to scope the marker to.
      expect(out.filter((s) => s.terminalGreyContinuation)).toHaveLength(0);
    });

    it("anchors the continuation stub at the last lit step's destination point", () => {
      const { intents, appts, chainId } = build2StepChainWithStep1Offscreen();
      const graph = detectMoveChains(intents, appts);
      const out = computeMoveChainArrows(
        graph,
        intents,
        appts,
        chainId,
        WORKWEEK_LAYOUT,
        [0],
      );
      // The continuation's `from` must match the highest lit step's
      // segment's `to` — that's the contract that keeps the stub
      // visually originating from the active card.
      const real = out.find((s) => !s.terminalGreyContinuation);
      const cont = out.find((s) => s.terminalGreyContinuation);
      expect(real).toBeDefined();
      expect(cont).toBeDefined();
      expect(cont!.from).toEqual(real!.to);
    });

    it("does NOT emit when the next step is on-screen via landscape `resourceIds` (multi-tech mode)", () => {
      // Landscape multi-tech regression: a chain whose step 0 lives
      // on Josh and step 1 lands on Jake. With portrait single-tech
      // (`resourceId: TECH_JOSH`) the next step is off-tech and would
      // emit a grey stub. With landscape multi-tech
      // (`resourceIds: [TECH_JOSH, TECH_JAKE]`) the next step's
      // destination resolves on-screen and the stub MUST suppress.
      const apptA = makeAppt(201, TECH_JOSH, DATE_MON, "08:00", "09:00");
      const apptB = makeAppt(202, TECH_JAKE, DATE_MON, "10:00", "11:00");
      // Step 0: reschedule appt 201 (Josh) → 10:00-11:00 Jake on
      // DATE_MON (the slot appt 202 currently occupies). Step 1:
      // reschedule appt 202 (Jake) → 12:00-13:00 Jake DATE_MON
      // (somewhere else on Jake). Chain: A → B because A.dest
      // overlaps B.source.
      const intentA = reschedule(
        21,
        201,
        DATE_MON,
        "10:00",
        "11:00",
        TECH_JAKE,
      );
      const intentB = reschedule(
        22,
        202,
        DATE_MON,
        "12:00",
        "13:00",
        TECH_JAKE,
      );
      const intents = [intentA, intentB];
      const appts = [apptA, apptB];
      const graph = detectMoveChains(intents, appts);
      expect(graph.chains).toHaveLength(1);
      const chainId = graph.chains[0]!.id;

      const landscapeLayout: MoveChainCalendarLayout = {
        viewType: "workweek",
        hourHeight: 80,
        minuteOffset: 300,
        appointmentBlockWidth: 86,
        timeLabelWidth: 50,
        daysWindow: WORKWEEK_LAYOUT.daysWindow,
        resourceIds: [TECH_JOSH, TECH_JAKE],
      };

      const out = computeMoveChainArrows(
        graph,
        intents,
        appts,
        chainId,
        landscapeLayout,
        [0],
      );
      // Step 0 is the lit segment; step 1's destination is on Jake
      // (which IS in `resourceIds`) so the grey stub suppresses.
      expect(out.filter((s) => s.terminalGreyContinuation)).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------
  // PR-UX-3 (2026-05-07): cross-tech chain in workweek view.
  //
  // Multi-tech sequence Josh→Jake (synth equivalent of A→B from the
  // locked Josh→Todd→Josh→Todd→Trey→Josh→Trey master sequence):
  // when the workweek is mounted on Josh and `chainStepHighlights =
  // [0]`, the source rect renders on Josh's column and the dest is
  // off-screen-right because Jake doesn't appear in workweek's
  // single-resource layout. See `pr-ux-3-multi-tech-handoff.md`
  // §1.A6 + §10.A6.
  // ---------------------------------------------------------------

  describe("cross-tech chain segments in workweek view (PR-UX-3 §1.A6)", () => {
    it("emits source on the active tech and toOffscreen='right' for an off-tech dest", () => {
      const apptSrc = makeAppt(101, TECH_JOSH, DATE_MON, "10:00", "11:00");
      const intent = reschedule(
        1,
        101,
        DATE_MON,
        "13:00",
        "14:00",
        TECH_JAKE, // dest tech is OFF the workweek's pinned resource
      );
      const graph = detectMoveChains([intent], [apptSrc]);
      const out = computeMoveChainArrows(
        graph,
        [intent],
        [apptSrc],
        graph.chains[0]!.id,
        WORKWEEK_LAYOUT,
        [0],
      );
      // 1 real arrow (source visible, dest off-tech) + NO continuation
      // because step 0 IS the last step in this 1-step chain.
      expect(out).toHaveLength(1);
      const seg = out[0]!;
      expect(seg.from).not.toBeNull();
      expect(seg.from!.x).toBe(50 + 86 / 2); // Mon column center
      expect(seg.to).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // 2026-05-10 — portrait-week cross-tech grey stubs
  // (`emitCrossTechStubs: true`).
  //
  // User-reported smoke-pass bug: when a chain is highlighted in
  // portrait WEEK view (single tech, multi-day), chain links whose
  // source or destination tile lives on a tech other than the
  // currently-shown one were silently dropped — leaving a visual
  // gap with no indication that the chain continues elsewhere. The
  // fix gates a synthetic edge stub behind a layout flag so portrait
  // week opts in but landscape (per-tech compute loop) does not.
  // ---------------------------------------------------------------
  describe("emitCrossTechStubs flag (portrait week off-tech grey stubs)", () => {
    it("default (flag off): legacy silent skip — toOffscreen=null on cross-tech dest", () => {
      const apptSrc = makeAppt(101, TECH_JOSH, DATE_MON, "10:00", "11:00");
      const intent = reschedule(1, 101, DATE_MON, "10:00", "11:00", TECH_JAKE);
      const graph = detectMoveChains([intent], [apptSrc]);

      const out = computeMoveChainArrows(
        graph,
        [intent],
        [apptSrc],
        graph.chains[0]!.id,
        WORKWEEK_LAYOUT, // no `emitCrossTechStubs`
      );

      expect(out).toHaveLength(1);
      const seg = out[0]!;
      expect(seg.toOffscreen).toBeNull(); // silent
      expect(seg.crossTechOffview).toBeUndefined();
    });

    it("flag on: emits a grey stub with toOffscreen='right' for an off-tech dest", () => {
      const apptSrc = makeAppt(101, TECH_JOSH, DATE_MON, "10:00", "11:00");
      const intent = reschedule(1, 101, DATE_MON, "10:00", "11:00", TECH_JAKE);
      const graph = detectMoveChains([intent], [apptSrc]);

      const out = computeMoveChainArrows(
        graph,
        [intent],
        [apptSrc],
        graph.chains[0]!.id,
        { ...WORKWEEK_LAYOUT, emitCrossTechStubs: true },
      );

      expect(out).toHaveLength(1);
      const seg = out[0]!;
      // Source rect resolved on Josh's Monday column (visible).
      expect(seg.from).not.toBeNull();
      expect(seg.from!.x).toBe(50 + 86 / 2);
      // Destination is off-tech; rect null but offscreen direction
      // wired so the overlay's stub resolver kicks in.
      expect(seg.to).toBeNull();
      expect(seg.toOffscreen).toBe("right");
      // Cross-tech flag set, color overridden to muted grey at the
      // compute layer so even legacy callers paint the right hue.
      expect(seg.crossTechOffview).toBe(true);
      expect(seg.color).toBe("#9CA3AF"); // TERMINAL_GREY_CONTINUATION_COLOR
    });

    it("multi-step chain: only off-tech links get the grey treatment, on-tech links keep chain color", () => {
      // 2-step chain: step 0 stays on Josh (visible), step 1 lands on Jake (off-tech).
      const apptA = makeAppt(101, TECH_JOSH, DATE_MON, "10:00", "11:00");
      const apptB = makeAppt(102, TECH_JOSH, DATE_MON, "13:00", "14:00");
      const intentA = reschedule(1, 101, DATE_MON, "13:00", "14:00", TECH_JOSH);
      const intentB = reschedule(2, 102, DATE_MON, "13:00", "14:00", TECH_JAKE);
      const graph = detectMoveChains([intentA, intentB], [apptA, apptB]);

      const out = computeMoveChainArrows(
        graph,
        [intentA, intentB],
        [apptA, apptB],
        graph.chains[0]!.id,
        { ...WORKWEEK_LAYOUT, emitCrossTechStubs: true },
      );

      // One segment per intent, regardless of cross-tech.
      expect(out).toHaveLength(2);
      const onTech = out.find((s) => s.intentId === 1)!;
      const offTech = out.find((s) => s.intentId === 2)!;
      expect(onTech.crossTechOffview).toBeUndefined();
      expect(onTech.color).not.toBe("#9CA3AF"); // chain palette color
      expect(offTech.crossTechOffview).toBe(true);
      expect(offTech.color).toBe("#9CA3AF");
    });
  });

  // ---------------------------------------------------------------
  // 2026-05-10 — workweek multi-tech mode (`resourceIds`).
  //
  // Bug 2 of the same-day smoke pass: in landscape, a cross-tech
  // reassign chain link silently dropped because the per-tech
  // compute LOOP saw only one of the two endpoints per pass and
  // the workweek `tileRect` returned `{ rect: null, offscreen:
  // null }` for tiles whose tech didn't match `resourceId`. The
  // fix introduces a `resourceIds: readonly number[]` shape on
  // the workweek layout so a single compute pass resolves both
  // source AND destination to real rects when both endpoints'
  // techs are in the array. Landscape now uses this shape with
  // `resourceIds: selectedTechIds`.
  // ---------------------------------------------------------------
  describe("workweek multi-tech mode (`resourceIds`, landscape Bug 2 fix)", () => {
    it("cross-tech reassign with both techs in resourceIds resolves both endpoints to real rects", () => {
      // Source on Josh @10:00, reassigned to Jake @11:00 same day.
      // BOTH techs included in resourceIds — both endpoints should
      // resolve. The day-column is shared, so X is identical on
      // each side and the arrow has zero horizontal displacement;
      // the visible motion comes from Y (10:00 → 11:00).
      const apptSrc = makeAppt(101, TECH_JOSH, DATE_MON, "10:00", "11:00");
      const intent = reschedule(1, 101, DATE_MON, "11:00", "12:00", TECH_JAKE);
      const graph = detectMoveChains([intent], [apptSrc]);

      const out = computeMoveChainArrows(
        graph,
        [intent],
        [apptSrc],
        graph.chains[0]!.id,
        {
          viewType: "workweek",
          hourHeight: 80,
          minuteOffset: 300,
          appointmentBlockWidth: 86,
          timeLabelWidth: 50,
          daysWindow: WORKWEEK_LAYOUT.daysWindow,
          resourceIds: [TECH_JOSH, TECH_JAKE],
        },
      );

      expect(out).toHaveLength(1);
      const seg = out[0]!;
      expect(seg.from).not.toBeNull();
      expect(seg.to).not.toBeNull();
      // Both endpoints resolve to Mon's day-column center.
      expect(seg.from!.x).toBe(50 + 86 / 2);
      expect(seg.to!.x).toBe(50 + 86 / 2);
      // Source y at 10:00 (600m): (600-300) * 80/60 = 400; dest y at
      // 11:00 (660m) → (660-300) * 80/60 = 480. Y center: source =
      // mid(10:00, 11:00) = 10:30 (630m) → (630-300)*80/60 = 440;
      // dest = mid(11:00, 12:00) = 11:30 (690m) → 520.
      expect(seg.from!.y).toBeCloseTo(440, 5);
      expect(seg.to!.y).toBeCloseTo(520, 5);
      // Real arrow → no cross-tech-grey override.
      expect(seg.crossTechOffview).toBeUndefined();
    });

    it("link with one endpoint on a tech NOT in resourceIds drops to silent skip (no stub by default)", () => {
      // Source on Josh (selected), dest on Jake (NOT selected).
      const apptSrc = makeAppt(101, TECH_JOSH, DATE_MON, "10:00", "11:00");
      const intent = reschedule(1, 101, DATE_MON, "11:00", "12:00", TECH_JAKE);
      const graph = detectMoveChains([intent], [apptSrc]);

      const out = computeMoveChainArrows(
        graph,
        [intent],
        [apptSrc],
        graph.chains[0]!.id,
        {
          viewType: "workweek",
          hourHeight: 80,
          minuteOffset: 300,
          appointmentBlockWidth: 86,
          timeLabelWidth: 50,
          daysWindow: WORKWEEK_LAYOUT.daysWindow,
          resourceIds: [TECH_JOSH],
        },
      );

      // Source resolves on Josh's column; dest tech is unselected,
      // tileRect returns null/null/false (default = silent skip,
      // matches single-tech `resourceId` behavior). resolveArrow
      // needs both endpoints, resolveStubArrow needs an `offscreen`
      // direction — neither is met, so no segment is drawn.
      expect(out).toHaveLength(1);
      const seg = out[0]!;
      expect(seg.from).not.toBeNull();
      expect(seg.to).toBeNull();
      expect(seg.fromOffscreen).toBeNull();
      expect(seg.toOffscreen).toBeNull();
    });

    it("multi-tech mode + emitCrossTechStubs flags off-set techs as cross-tech grey stubs", () => {
      // Source on Josh (in resourceIds), dest on a third tech 2056
      // (NOT in resourceIds). With emitCrossTechStubs the
      // dest-side off-tech case fires the grey-stub branch.
      const apptSrc = makeAppt(101, TECH_JOSH, DATE_MON, "10:00", "11:00");
      const intent = reschedule(1, 101, DATE_MON, "11:00", "12:00", 2056);
      const graph = detectMoveChains([intent], [apptSrc]);

      const out = computeMoveChainArrows(
        graph,
        [intent],
        [apptSrc],
        graph.chains[0]!.id,
        {
          viewType: "workweek",
          hourHeight: 80,
          minuteOffset: 300,
          appointmentBlockWidth: 86,
          timeLabelWidth: 50,
          daysWindow: WORKWEEK_LAYOUT.daysWindow,
          resourceIds: [TECH_JOSH, TECH_JAKE],
          emitCrossTechStubs: true,
        },
      );

      expect(out).toHaveLength(1);
      const seg = out[0]!;
      expect(seg.from).not.toBeNull();
      expect(seg.to).toBeNull();
      expect(seg.toOffscreen).toBe("right");
      expect(seg.crossTechOffview).toBe(true);
      expect(seg.color).toBe("#9CA3AF");
    });

    it("same-tech reschedule still works in multi-tech mode (no regression for single-tech chains)", () => {
      // Source on Josh, rescheduled within Josh. resourceIds
      // includes Josh. Should match the same-tech reschedule
      // contract from the WORKWEEK_LAYOUT 1-step test above.
      const apptSrc = makeAppt(101, TECH_JOSH, DATE_MON, "09:25", "10:25");
      const intent = reschedule(1, 101, DATE_MON, "09:00", "10:00", TECH_JOSH);
      const graph = detectMoveChains([intent], [apptSrc]);

      const out = computeMoveChainArrows(
        graph,
        [intent],
        [apptSrc],
        graph.chains[0]!.id,
        {
          viewType: "workweek",
          hourHeight: 80,
          minuteOffset: 300,
          appointmentBlockWidth: 86,
          timeLabelWidth: 50,
          daysWindow: WORKWEEK_LAYOUT.daysWindow,
          resourceIds: [TECH_JOSH, TECH_JAKE],
        },
      );

      expect(out).toHaveLength(1);
      const seg = out[0]!;
      expect(seg.from).not.toBeNull();
      expect(seg.to).not.toBeNull();
      const expectedColCenterX = 50 + 86 / 2;
      expect(seg.from!.x).toBe(expectedColCenterX);
      expect(seg.to!.x).toBe(expectedColCenterX);
    });
  });

  // ---------------------------------------------------------------
  // 2026-05-10 follow-up — landscape mini-cols sub-lane geometry
  // (Bug 1 of the same-day follow-up smoke pass)
  // ---------------------------------------------------------------
  //
  // Bug 1 of the 2026-05-10 follow-up smoke pass: with `resourceIds`
  // wired (the Bug 2 fix above), every cross-tech arrow endpoint
  // collapsed to the same X (= day-column center) regardless of which
  // mini-lane painted the destination tile. User report: *"the
  // landscape arrows all showed up in one vertical line down the
  // middle of the appointments."*
  //
  // The fix introduces an optional `lanesByTechId` map on the
  // workweek layout. When provided, the geometry helper uses each
  // tile's destination tech's sub-lane center (instead of the day-
  // column center) for X. Mirrors the vendored library's mini-cols
  // rendering: `techsToRender.map((trid, i) => left: i * laneWidth)`.
  describe("workweek mini-cols sub-lane geometry (`lanesByTechId`, landscape Bug 1 fix)", () => {
    it("places source + dest endpoints at distinct lane centers when techs differ", () => {
      // Two-tech selection, mini-cols mode. Source on Josh (lane 0),
      // dest on Jake (lane 1) same day. Lane width = colWidth /
      // selectedTechIds.length = 86 / 2 = 43. Expected centers:
      // - Josh's lane: colStart + 0*43 + 43/2 = 50 + 21.5 = 71.5
      // - Jake's lane: colStart + 1*43 + 43/2 = 50 + 43 + 21.5 = 114.5
      const apptSrc = makeAppt(101, TECH_JOSH, DATE_MON, "10:00", "11:00");
      const intent = reschedule(1, 101, DATE_MON, "11:00", "12:00", TECH_JAKE);
      const graph = detectMoveChains([intent], [apptSrc]);

      const lanesByTechId = new Map<
        number,
        { laneIndex: number; laneWidth: number }
      >([
        [TECH_JOSH, { laneIndex: 0, laneWidth: 43 }],
        [TECH_JAKE, { laneIndex: 1, laneWidth: 43 }],
      ]);

      const out = computeMoveChainArrows(
        graph,
        [intent],
        [apptSrc],
        graph.chains[0]!.id,
        {
          viewType: "workweek",
          hourHeight: 80,
          minuteOffset: 300,
          appointmentBlockWidth: 86,
          timeLabelWidth: 50,
          daysWindow: WORKWEEK_LAYOUT.daysWindow,
          resourceIds: [TECH_JOSH, TECH_JAKE],
          lanesByTechId,
        },
      );

      expect(out).toHaveLength(1);
      const seg = out[0]!;
      expect(seg.from).not.toBeNull();
      expect(seg.to).not.toBeNull();
      // Distinct lane centers — the smoke signature for Bug 1 fix.
      expect(seg.from!.x).toBeCloseTo(71.5, 5);
      expect(seg.to!.x).toBeCloseTo(114.5, 5);
      expect(seg.from!.x).not.toBe(seg.to!.x);
    });

    it("falls back to day-column geometry when lanesByTechId is omitted (stacked-mode parity)", () => {
      // Same input as above but no `lanesByTechId` — expected to
      // collapse both endpoints to the day-column center, matching
      // the Bug 2 fix's published behavior. This is the legacy
      // contract for stacked / 1-tech / not-yet-measured cases.
      const apptSrc = makeAppt(101, TECH_JOSH, DATE_MON, "10:00", "11:00");
      const intent = reschedule(1, 101, DATE_MON, "11:00", "12:00", TECH_JAKE);
      const graph = detectMoveChains([intent], [apptSrc]);

      const out = computeMoveChainArrows(
        graph,
        [intent],
        [apptSrc],
        graph.chains[0]!.id,
        {
          viewType: "workweek",
          hourHeight: 80,
          minuteOffset: 300,
          appointmentBlockWidth: 86,
          timeLabelWidth: 50,
          daysWindow: WORKWEEK_LAYOUT.daysWindow,
          resourceIds: [TECH_JOSH, TECH_JAKE],
        },
      );

      expect(out).toHaveLength(1);
      const seg = out[0]!;
      const expectedColCenterX = 50 + 86 / 2;
      expect(seg.from!.x).toBe(expectedColCenterX);
      expect(seg.to!.x).toBe(expectedColCenterX);
    });

      // ---------------------------------------------------------------
    // 2026-05-10 user-reported smoke fix — edge-anchored arrows.
    //
    // User feedback verbatim: *"is there any way we can make them a
    // little tighter? They don't really start and end on the cards
    // themselves like in portrait mode."* The fix anchors the arrow
    // `from`/`to` at each rect's edge facing the other rect (instead
    // of the rect center) when both rects have a clean non-overlapping
    // chord. Lane-adjacent / overlapping cases fall back to centers
    // (so the arrow stays visible — see `clipChordToRectEdges`).
    // ---------------------------------------------------------------
    it("anchors `from` and `to` to rect edges (not centers) for a non-degenerate cross-day chord", () => {
      // Source 10:00-11:00 on Mon (col 0), reassigned to Tue 13:00-14:00.
      // Source rect [50,136] × [400,480]; dest rect [136,222] × [640,720].
      // Neither rect overlaps the other; the chord between centers
      // (93,440) → (179,680) exits source via its BOTTOM edge at
      // (107.33, 480) and enters dest via its TOP edge at (164.67, 640).
      const apptSrc = makeAppt(101, TECH_JOSH, DATE_MON, "10:00", "11:00");
      const intent = reschedule(1, 101, DATE_TUE, "13:00", "14:00", TECH_JOSH);
      const graph = detectMoveChains([intent], [apptSrc]);

      const out = computeMoveChainArrows(
        graph,
        [intent],
        [apptSrc],
        graph.chains[0]!.id,
        WORKWEEK_LAYOUT,
      );

      expect(out).toHaveLength(1);
      const seg = out[0]!;
      expect(seg.from).not.toBeNull();
      expect(seg.to).not.toBeNull();

      // Source rect [50,136] × [400,480]. New `from` on its boundary,
      // NOT at center (93, 440). With chord direction down-right, the
      // exit edge is the BOTTOM (y=480).
      expect(seg.from!.y).toBeCloseTo(480, 5);
      expect(seg.from!.x).toBeCloseTo(107.333, 2);
      expect(seg.from!.y).not.toBe(440); // not center
      expect(seg.from!.x).not.toBe(93);

      // Dest rect [136,222] × [640,720]. New `to` on its boundary,
      // NOT at center (179, 680). Chord enters via TOP edge (y=640).
      expect(seg.to!.y).toBeCloseTo(640, 5);
      expect(seg.to!.x).toBeCloseTo(164.667, 2);
      expect(seg.to!.y).not.toBe(680); // not center
      expect(seg.to!.x).not.toBe(179);

      // Both endpoints lie ON the respective rect boundaries (within
      // floating-point epsilon). This is the smoke-pass property the
      // fix introduces.
      const onBoundary = (
        p: { x: number; y: number },
        r: { x: number; y: number; w: number; h: number },
      ) => {
        const eps = 1e-3;
        const xRange = p.x + eps >= r.x && p.x - eps <= r.x + r.w;
        const yRange = p.y + eps >= r.y && p.y - eps <= r.y + r.h;
        const xEdge =
          Math.abs(p.x - r.x) < eps || Math.abs(p.x - (r.x + r.w)) < eps;
        const yEdge =
          Math.abs(p.y - r.y) < eps || Math.abs(p.y - (r.y + r.h)) < eps;
        return xRange && yRange && (xEdge || yEdge);
      };
      expect(
        onBoundary(seg.from!, { x: 50, y: 400, w: 86, h: 80 }),
      ).toBe(true);
      expect(
        onBoundary(seg.to!, { x: 136, y: 640, w: 86, h: 80 }),
      ).toBe(true);
    });

    it("falls back to centers when source and dest rects overlap (rect-overlap edge case)", () => {
      // Same-tech reschedule whose old/new time windows overlap in y
      // (Olivia 9:25-10:25 → 9:00-10:00 — the dest center sits inside
      // the source rect's y range). Edge-clipping has no clean answer
      // → falls back to center-anchoring.
      const apptOlivia = makeAppt(101, TECH_JOSH, DATE_MON, "09:25", "10:25");
      const intent = reschedule(
        1,
        101,
        DATE_MON,
        "09:00",
        "10:00",
        TECH_JOSH,
      );
      const graph = detectMoveChains([intent], [apptOlivia]);

      const out = computeMoveChainArrows(
        graph,
        [intent],
        [apptOlivia],
        graph.chains[0]!.id,
        WORKWEEK_LAYOUT,
      );

      expect(out).toHaveLength(1);
      const seg = out[0]!;
      // Centers: Mon column center x = 93; source center y = midpoint
      // of 9:25-10:25 in body coords; dest center y = midpoint of
      // 9:00-10:00. Same numbers asserted by the original 1-step
      // workweek test above — this asserts the fallback path takes
      // them too.
      expect(seg.from!.x).toBe(50 + 86 / 2);
      expect(seg.to!.x).toBe(50 + 86 / 2);
      expect(seg.from!.y).toBeCloseTo(((565 + 625) / 2 - 300) * (80 / 60), 5);
      expect(seg.to!.y).toBeCloseTo((570 - 300) * (80 / 60), 5);
    });

    it("falls back to centers when edge-clipped chord would be sub-pixel (lane-adjacent rects)", () => {
      // Lane-adjacent mini-col rects (source right edge = dest left
      // edge) — the natural edge-clip would give a zero-length arrow,
      // which the overlay drops via the `len < 1e-3` guard. Falling
      // back to centers keeps the arrow visible. Reproduces the
      // landscape mini-cols geometry from the user's smoke logs.
      const apptSrc = makeAppt(101, TECH_JOSH, DATE_MON, "10:00", "11:00");
      const intent = reschedule(1, 101, DATE_MON, "11:00", "12:00", TECH_JAKE);
      const graph = detectMoveChains([intent], [apptSrc]);

      const lanesByTechId = new Map<
        number,
        { laneIndex: number; laneWidth: number }
      >([
        [TECH_JOSH, { laneIndex: 0, laneWidth: 43 }],
        [TECH_JAKE, { laneIndex: 1, laneWidth: 43 }],
      ]);

      const out = computeMoveChainArrows(
        graph,
        [intent],
        [apptSrc],
        graph.chains[0]!.id,
        {
          viewType: "workweek",
          hourHeight: 80,
          minuteOffset: 300,
          appointmentBlockWidth: 86,
          timeLabelWidth: 50,
          daysWindow: WORKWEEK_LAYOUT.daysWindow,
          resourceIds: [TECH_JOSH, TECH_JAKE],
          lanesByTechId,
        },
      );

      expect(out).toHaveLength(1);
      const seg = out[0]!;
      // Centers retained (matches the pre-fix behavior asserted by
      // the existing "places source + dest endpoints at distinct
      // lane centers" test above — that test still passes because
      // the math falls into this same fallback branch).
      expect(seg.from!.x).toBeCloseTo(71.5, 5);
      expect(seg.to!.x).toBeCloseTo(114.5, 5);
    });

  it("falls back to day-column when a tile's tech is not in the lane map (defensive)", () => {
      // resourceIds = [Josh, Jake, 2056] but lanesByTechId only has
      // Josh + Jake. A reassign to 2056 with both endpoints in the
      // resourceIds set should still resolve, but the dest's X
      // falls back to colStart (legacy day-column geometry) since
      // there's no lane entry — never silently drops the segment.
      const apptSrc = makeAppt(101, TECH_JOSH, DATE_MON, "10:00", "11:00");
      const intent = reschedule(1, 101, DATE_MON, "11:00", "12:00", 2056);
      const graph = detectMoveChains([intent], [apptSrc]);

      const lanesByTechId = new Map<
        number,
        { laneIndex: number; laneWidth: number }
      >([
        [TECH_JOSH, { laneIndex: 0, laneWidth: 28.67 }],
        [TECH_JAKE, { laneIndex: 1, laneWidth: 28.67 }],
        // 2056 intentionally absent.
      ]);

      const out = computeMoveChainArrows(
        graph,
        [intent],
        [apptSrc],
        graph.chains[0]!.id,
        {
          viewType: "workweek",
          hourHeight: 80,
          minuteOffset: 300,
          appointmentBlockWidth: 86,
          timeLabelWidth: 50,
          daysWindow: WORKWEEK_LAYOUT.daysWindow,
          resourceIds: [TECH_JOSH, TECH_JAKE, 2056],
          lanesByTechId,
        },
      );

      expect(out).toHaveLength(1);
      const seg = out[0]!;
      // Source on Josh (in lane map): lane center = 50 + 0 + 28.67/2.
      expect(seg.from!.x).toBeCloseTo(50 + 28.67 / 2, 2);
      // Dest on 2056 (NOT in lane map): falls back to day-column
      // center = colStart + colWidth/2 = 50 + 43 = 93. Defensive
      // fallback — the mismatch is loud enough (lane center vs day-
      // col center) that a missed lane registration in the consumer
      // is visible on smoke without silently dropping the segment.
      expect(seg.to!.x).toBe(93);
    });
  });

  // ---------------------------------------------------------------
  // FORK Phase 26 — registry-driven post-style arrow anchoring
  // (2026-05-10).
  //
  // 2026-05-12 update: `fix/move-chain-arrow-registry-precision`
  // promoted the registry from "optional accuracy upgrade" to
  // "required source of truth." Segments are now GATED on both
  // endpoints having a registry-sourced rect. The "fall back to
  // legacy geometry" cases below previously emitted a segment with
  // grid-cell coordinates; they now SKIP the segment until the
  // registry settles. See file-header doc-block on
  // `computeMoveChainArrows` and
  // docs/PLAN-DEVIATIONS.md#2026-05-12-arrow-registry-only-precision
  // for the design context. Tests in this describe block have
  // been updated to assert the new contract.
  //
  // The vendored library now reports each EventBlock's rendered
  // rect via `onEventLayout`; the consumer parks them in a per-
  // mount Map and hands the lookup to the geometry helper. When
  // the lookup hits, the arrow endpoint should land on the actual
  // card center (column-offset + bounds.x + width/2) rather than
  // the column center (column-offset + colWidth/2). When the
  // lookup misses (no bounds reported yet, or registry is
  // undefined entirely), we fall back to legacy geometry.
  // ---------------------------------------------------------------

  describe("FORK Phase 26: eventBoundsLookup hit-path + fallback", () => {
    // Source bounds: pretend the EventBlock for appt 101 paints
    // intra-column at x=4, y=120, width=72, height=60. Center =
    // (50 + 4 + 36, 120 + 30) = (90, 150). Legacy column-center
    // would be (93, 393.33). Distinct enough that the test fails
    // loudly if the registry path is broken.
    //
    // Source and destination intentionally share the same
    // intra-column X + width so the chord from source-center to
    // dest-center is perfectly vertical. `resolveAnchors` clips
    // each endpoint to the rect's edge — for a vertical chord
    // the clip lands at top / bottom so the X coordinate equals
    // the rect's center X. That keeps the assertion math simple
    // and isolates "is registry geometry used?" from
    // "is edge-clip working?".
    const SOURCE_BOUNDS = { x: 4, y: 120, width: 72, height: 60 };
    // Dest bounds for ghost id (negative) for intent 1.
    const DEST_BOUNDS = { x: 4, y: 560, width: 72, height: 58 };

    // Resolve to the ghost id `moveChainGhostEventIdFor` produces
    // for `intent_id = 1` without importing it (avoids module
    // boundary churn in tests; the encoding is stable per the
    // module's exported constant `GHOST_ID_OFFSET = 1_000_000`).
    const ghostIdForIntent1 = -(1_000_000 + 1);

    function lookup(eventId: number) {
      if (eventId === 101) return SOURCE_BOUNDS;
      if (eventId === ghostIdForIntent1) return DEST_BOUNDS;
      return null;
    }

    it("anchors source endpoint to registry-reported card center (workweek, single-tech)", () => {
      const apptOlivia = makeAppt(101, TECH_JOSH, DATE_MON, "09:25", "10:25");
      const intent = reschedule(1, 101, DATE_MON, "09:00", "10:00", TECH_JOSH);
      const graph = detectMoveChains([intent], [apptOlivia]);

      const out = computeMoveChainArrows(
        graph,
        [intent],
        [apptOlivia],
        "chain-1",
        {
          ...WORKWEEK_LAYOUT,
          eventBoundsLookup: lookup,
        },
      );

      expect(out).toHaveLength(1);
      const seg = out[0]!;

      // Source AND dest center = colStart(50) + bounds.x(4) +
      // width/2(36) = 90 (same X, vertical chord). Legacy
      // fallback would have produced 93 for both. The
      // edge-clipping inside `resolveAnchors` keeps the X
      // exact for vertical chords.
      expect(seg.from!.x).toBeCloseTo(90, 5);
      expect(seg.to!.x).toBeCloseTo(90, 5);

      // Y endpoints land on the inside-facing rect edges (top of
      // dest, bottom of source). Source rect bottom = bounds.y +
      // height = 180; dest rect top = bounds.y = 560.
      expect(seg.from!.y).toBeCloseTo(180, 5);
      expect(seg.to!.y).toBeCloseTo(560, 5);
    });

    it("STILL falls back to legacy column-cell geometry when registry returns null and gate is NOT set (legacy callers)", () => {
      // The gate is opt-in via `requireRegistryRect: true`. Legacy
      // callers (tests without a registry; future renderers that
      // don't mount `<Calendar>`) keep the FORK Phase 26 fallback
      // behavior unchanged.
      const apptOlivia = makeAppt(101, TECH_JOSH, DATE_MON, "09:25", "10:25");
      const intent = reschedule(1, 101, DATE_MON, "09:00", "10:00", TECH_JOSH);
      const graph = detectMoveChains([intent], [apptOlivia]);

      const out = computeMoveChainArrows(
        graph,
        [intent],
        [apptOlivia],
        "chain-1",
        {
          ...WORKWEEK_LAYOUT,
          eventBoundsLookup: () => null,
        },
      );

      const seg = out[0]!;
      const expectedColCenterX = 50 + 86 / 2;
      expect(seg.from!.x).toBe(expectedColCenterX);
      expect(seg.to!.x).toBe(expectedColCenterX);
    });

    it("SKIPS segments when registry returns null for both ids", () => {
      // Previous behavior emitted a column-cell fallback segment
      // for the "registry empty, both endpoints unmeasured" case.
      // With the gate on, the segment is skipped entirely so the
      // user never sees the misaligned grid-cell arrow. The host
      // re-derives once `useEventBoundsRegistry` settles (tick
      // bumps) and the registry hit-path takes over.
      const apptOlivia = makeAppt(101, TECH_JOSH, DATE_MON, "09:25", "10:25");
      const intent = reschedule(1, 101, DATE_MON, "09:00", "10:00", TECH_JOSH);
      const graph = detectMoveChains([intent], [apptOlivia]);

      const out = computeMoveChainArrows(
        graph,
        [intent],
        [apptOlivia],
        "chain-1",
        {
          ...WORKWEEK_LAYOUT,
          eventBoundsLookup: () => null,
          requireRegistryRect: true,
        },
      );

      expect(out).toEqual([]);
    });

    it("SKIPS segments when eventBoundsLookup is undefined and gate is on", () => {
      const apptOlivia = makeAppt(101, TECH_JOSH, DATE_MON, "09:25", "10:25");
      const intent = reschedule(1, 101, DATE_MON, "09:00", "10:00", TECH_JOSH);
      const graph = detectMoveChains([intent], [apptOlivia]);

      const out = computeMoveChainArrows(
        graph,
        [intent],
        [apptOlivia],
        "chain-1",
        {
          ...WORKWEEK_LAYOUT,
          requireRegistryRect: true,
        },
      );

      expect(out).toEqual([]);
    });

    it("SKIPS mixed-source segments (only source in registry, dest unmeasured)", () => {
      // The core jitter bug the gate exists to eliminate.
      // Previously: source anchored to registry rect (x=90), dest
      // anchored to legacy column-center (x=93). The resulting
      // arrow had a 3px angle/length drift that visibly snapped
      // to (90, 90) once the dest's `onLayout` fired. New
      // contract: skip the segment entirely until both endpoints
      // have settled.
      const apptOlivia = makeAppt(101, TECH_JOSH, DATE_MON, "09:25", "10:25");
      const intent = reschedule(1, 101, DATE_MON, "09:00", "10:00", TECH_JOSH);
      const graph = detectMoveChains([intent], [apptOlivia]);

      const out = computeMoveChainArrows(
        graph,
        [intent],
        [apptOlivia],
        "chain-1",
        {
          ...WORKWEEK_LAYOUT,
          eventBoundsLookup: (eventId) =>
            eventId === 101 ? SOURCE_BOUNDS : null,
          requireRegistryRect: true,
        },
      );

      expect(out).toEqual([]);
    });

    it("SKIPS mixed-source segments (only dest in registry, source unmeasured)", () => {
      const apptOlivia = makeAppt(101, TECH_JOSH, DATE_MON, "09:25", "10:25");
      const intent = reschedule(1, 101, DATE_MON, "09:00", "10:00", TECH_JOSH);
      const graph = detectMoveChains([intent], [apptOlivia]);

      const out = computeMoveChainArrows(
        graph,
        [intent],
        [apptOlivia],
        "chain-1",
        {
          ...WORKWEEK_LAYOUT,
          eventBoundsLookup: (eventId) =>
            eventId === ghostIdForIntent1 ? DEST_BOUNDS : null,
          requireRegistryRect: true,
        },
      );

      expect(out).toEqual([]);
    });

    it("EMITS segment when both endpoints come from registry (the happy path)", () => {
      // The whole point of the gate: when both endpoints have
      // settled in the registry, the resulting segment uses
      // pixel-accurate post-style rects. Asserts the source/dest
      // X land on the registry-rect centers (50 + 4 + 36 = 90 for
      // both ends — same vertical chord trick as the FORK Phase
      // 26 happy-path test above).
      const apptOlivia = makeAppt(101, TECH_JOSH, DATE_MON, "09:25", "10:25");
      const intent = reschedule(1, 101, DATE_MON, "09:00", "10:00", TECH_JOSH);
      const graph = detectMoveChains([intent], [apptOlivia]);

      const out = computeMoveChainArrows(
        graph,
        [intent],
        [apptOlivia],
        "chain-1",
        {
          ...WORKWEEK_LAYOUT,
          eventBoundsLookup: lookup,
          requireRegistryRect: true,
        },
      );

      expect(out).toHaveLength(1);
      const seg = out[0]!;
      expect(seg.from!.x).toBeCloseTo(90, 5);
      expect(seg.to!.x).toBeCloseTo(90, 5);
      expect(seg.from!.y).toBeCloseTo(180, 5);
      expect(seg.to!.y).toBeCloseTo(560, 5);
    });

    it("EMITS off-screen stub when source is in registry but dest is off-screen", () => {
      // Off-screen endpoints (`source === "none"`) are explicitly
      // allowed through the gate — the stub-arrow path doesn't
      // need a precise rect, just a direction. This case happens
      // when a chain extends to a date outside the visible
      // workweek window: the visible source is registry-anchored
      // and the off-screen dest gets a right-edge stub.
      const apptOlivia = makeAppt(101, TECH_JOSH, DATE_MON, "09:25", "10:25");
      // Reschedule to a date OUTSIDE the visible window.
      const offscreenDate = "2026-05-11";
      const intent = reschedule(
        1,
        101,
        offscreenDate,
        "09:00",
        "10:00",
        TECH_JOSH,
      );
      const graph = detectMoveChains([intent], [apptOlivia]);

      const out = computeMoveChainArrows(
        graph,
        [intent],
        [apptOlivia],
        "chain-1",
        {
          ...WORKWEEK_LAYOUT,
          eventBoundsLookup: (eventId) =>
            eventId === 101 ? SOURCE_BOUNDS : null,
          requireRegistryRect: true,
        },
      );

      expect(out).toHaveLength(1);
      const seg = out[0]!;
      // Source endpoint resolved from registry (rect-edge clip).
      expect(seg.from).not.toBeNull();
      // Dest endpoint is off-screen; overlay paints a stub.
      expect(seg.to).toBeNull();
      expect(seg.toOffscreen).toBe("right");
    });

    it("adds lane offset to bounds.x when mini-cols layout is active", () => {
      // Mini-cols mode: 3 techs share day-column; each gets
      // laneWidth = 86/3 ≈ 28.67. EventBlock's parent in this
      // mode is the per-lane wrapper, so bounds.x is intra-LANE
      // (a small offset like 1 or 2 from `frame.leftPx + 1`).
      //
      // Setup: cross-tech reassign Josh (lane 0) → Jake (lane 1),
      // with intentional asymmetric bounds.x to make the
      // registry contribution distinguishable from legacy
      // lane-center geometry. Source bounds far-left of its
      // lane; dest bounds far-right of its lane. We assert (a)
      // source-X falls in the LEFT half of lane 0, (b) dest-X
      // falls in the RIGHT half of lane 1, and (c) source.X <
      // dest.X — together those prove the registry lookup was
      // applied AND the lane offset arithmetic was correct.
      const TECH_2056 = 2056;
      const laneWidth = 86 / 3;
      const lanesByTechId = new Map([
        [TECH_JOSH, { laneIndex: 0, laneWidth }],
        [TECH_JAKE, { laneIndex: 1, laneWidth }],
        [TECH_2056, { laneIndex: 2, laneWidth }],
      ]);

      const apptOlivia = makeAppt(101, TECH_JOSH, DATE_MON, "09:25", "10:25");
      const intent = reschedule(1, 101, DATE_MON, "09:00", "10:00", TECH_JAKE);
      const graph = detectMoveChains([intent], [apptOlivia]);

      // Source: far-left of lane 0 (x=0, width=6). Center = 50 + 0 + 0 + 3 = 53.
      // Dest:   far-right of lane 1 (x=22, width=6). Center = 50 + 28.67 + 22 + 3 ≈ 103.67.
      // Legacy lane-center fallback would give:
      //   source = 50 + 0 + 14.33 = 64.33
      //   dest   = 50 + 28.67 + 14.33 = 93.00
      // Spread is similar, but exact X centers differ
      // measurably from legacy lane-centers — enough to
      // distinguish the paths.
      const sourceMiniBounds = { x: 0, y: 100, width: 6, height: 60 };
      const destMiniBounds = { x: 22, y: 560, width: 6, height: 58 };

      const out = computeMoveChainArrows(
        graph,
        [intent],
        [apptOlivia],
        graph.chains[0]!.id,
        {
          viewType: "workweek",
          hourHeight: 80,
          minuteOffset: 300,
          appointmentBlockWidth: 86,
          timeLabelWidth: 50,
          daysWindow: WORKWEEK_LAYOUT.daysWindow,
          resourceIds: [TECH_JOSH, TECH_JAKE, TECH_2056],
          lanesByTechId,
          eventBoundsLookup: (eventId) => {
            if (eventId === 101) return sourceMiniBounds;
            if (eventId === ghostIdForIntent1) return destMiniBounds;
            return null;
          },
        },
      );

      expect(out).toHaveLength(1);
      const seg = out[0]!;
      const lane0Left = 50;
      const lane0Right = 50 + laneWidth;
      const lane1Left = 50 + laneWidth;
      const lane1Right = 50 + 2 * laneWidth;
      // Source endpoint lands in lane 0's LEFT half (registry
      // bounds put the rect at lane 0's far left). Edge-clip
      // may drift the precise X a hair toward dest, but it
      // should still be inside lane 0.
      expect(seg.from!.x).toBeGreaterThanOrEqual(lane0Left);
      expect(seg.from!.x).toBeLessThan(lane0Left + laneWidth / 2);
      // Dest endpoint lands in lane 1's RIGHT half (registry
      // bounds put the rect at lane 1's far right).
      expect(seg.to!.x).toBeGreaterThan(lane1Left + laneWidth / 2);
      expect(seg.to!.x).toBeLessThanOrEqual(lane1Right);
      void lane0Right; // assertion bracketing context only
      // Source.X < Dest.X (lane order preserved).
      expect(seg.from!.x).toBeLessThan(seg.to!.x);
      // Y endpoints reflect registry rect edges. With this
      // bounds setup (source at lane 0 far-left, dest at lane 1
      // far-right) the chord exits source's RIGHT edge before
      // its bottom (rect is narrow → side wins), so the
      // edge-clipped Y lands above 160. Similarly the chord
      // enters dest's LEFT edge before its top, so the Y lands
      // below 560. Bracket those ranges instead of pinning
      // exact values — what matters is that Y is on a registry-
      // derived rect edge, NOT the legacy hourHeight-derived
      // band (which would have put Y near 353 / 570).
      expect(seg.from!.y).toBeGreaterThan(100);
      expect(seg.from!.y).toBeLessThanOrEqual(160);
      expect(seg.to!.y).toBeGreaterThanOrEqual(560);
      expect(seg.to!.y).toBeLessThan(618);
    });

    it("anchors to registry rect in day-view too (multi-tech columns)", () => {
      // Day view: TECH_JOSH at col 0, TECH_JAKE at col 1. Source
      // on JOSH → dest on JAKE. Bounds reported intra-column.
      //
      // X drifts via edge clipping because the chord is
      // diagonal (different columns). Y is what we can pin
      // exactly when bounds.y / height come from registry:
      // source rect bottom = 120 + 60 = 180; dest rect top = 560.
      // Legacy fallback would have placed source center at
      // y_legacy_src ≈ 353 (from hourHeight math), nowhere near
      // 180.
      const apptOlivia = makeAppt(101, TECH_JOSH, DATE_MON, "09:25", "10:25");
      const intent = reschedule(1, 101, DATE_MON, "09:00", "10:00", TECH_JAKE);
      const graph = detectMoveChains([intent], [apptOlivia]);

      const out = computeMoveChainArrows(
        graph,
        [intent],
        [apptOlivia],
        graph.chains[0]!.id,
        {
          ...DAY_LAYOUT,
          eventBoundsLookup: lookup,
        },
      );

      expect(out).toHaveLength(1);
      const seg = out[0]!;
      // Source col 0 (JOSH), legacy would have given column
      // center 93. Registry-driven center = 50 + 4 + 36 = 90.
      // Edge-clip on diagonal chord pulls X a few px right but
      // it should stay well below the col-0 right edge (50+86=136).
      expect(seg.from!.x).toBeGreaterThan(89);
      expect(seg.from!.x).toBeLessThan(136);
      // Dest col 1 (JAKE), starts at 136. Center (registry) =
      // 50 + 86 + 4 + 36 = 176. Edge-clip stays within col 1
      // (136 .. 222).
      expect(seg.to!.x).toBeGreaterThan(136);
      expect(seg.to!.x).toBeLessThan(222);
      // Source bottom edge (registry) = 180; dest top edge = 560.
      // For a chord that's mostly vertical (Δy=380 >> Δx ~86),
      // the rect-edge intersection lands at the bottom/top edges.
      expect(seg.from!.y).toBeCloseTo(180, 0);
      expect(seg.to!.y).toBeCloseTo(560, 0);
    });
  });
});
