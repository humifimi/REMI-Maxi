/**
 * `detectMoveChains` unit tests (PR-UX-1 / move-chain selector PASS 1).
 *
 * Scenarios match the locked design from the move-chain canvas
 * mockup. The Purple split scenario in particular is the centerpiece
 * — one user-initiated drag whose destination overlaps three
 * existing cards, each of which has its own staged move out of the
 * way.
 */

import type { ReorganizationIntent } from "@technician/types/reorganization";
import type { LinterAppointment } from "@technician/utils/logistics-linter";
import { makeIntent } from "@technician/stores/__fixtures__/pending-reality";
import { TECH_PALETTE } from "@technician/constants/colors";
import {
  detectMoveChains,
  getVisibleMoveChainDestSlots,
  wouldExtendExistingChain,
  detectChainToChainDestinationConflicts,
} from "@technician/utils/detect-move-chains";

const DATE = "2026-04-24";

function makeAppt(
  id: number,
  techId: number,
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
    scheduled_date: DATE,
    scheduled_start_time: start,
    scheduled_end_time: end,
    recurrence_series_id: null,
  };
}

function reschedule(
  intentId: number,
  appointmentId: number,
  start: string,
  end: string,
  techId?: number,
): ReorganizationIntent {
  return makeIntent(intentId, {
    appointment_id: appointmentId,
    payload: {
      kind: "reschedule",
      new_scheduled_date: DATE,
      new_start_time: start,
      new_end_time: end,
      new_technician_id: techId,
    },
  });
}

describe("detectMoveChains", () => {
  it("returns the empty graph when there are no intents", () => {
    const graph = detectMoveChains([], []);
    expect(graph.chains).toEqual([]);
    expect(graph.ecosystems).toEqual([]);
    expect(graph.intentToChainId.size).toBe(0);
  });

  it("treats a single isolated intent (no destination overlap) as a 1-step chain", () => {
    // Aqua moves into a slot that no other staged appointment occupies.
    const apptA = makeAppt(101, 7, "10:00", "11:00");
    const intentA = reschedule(1, 101, "13:00", "14:00", 7);

    const graph = detectMoveChains([intentA], [apptA]);

    expect(graph.chains).toHaveLength(1);
    expect(graph.chains[0]).toMatchObject({
      id: "chain-1",
      seedIntentId: 1,
      intentIds: [1],
    });
    expect(graph.ecosystems).toHaveLength(1);
    expect(graph.ecosystems[0].chainIds).toEqual(["chain-1"]);
    expect(graph.intentToChainId.get(1)).toBe("chain-1");
  });

  it("collapses a 2-step linear cascade into a single chain", () => {
    // Aqua moves to Green's slot; Green moves to an empty earlier slot.
    // Both intents on tech 7. Aqua → Green (overlap), Green → empty (no overlap).
    const apptGreen = makeAppt(101, 7, "09:00", "10:00");
    const apptAqua = makeAppt(102, 7, "13:30", "14:30");

    const intentAqua = reschedule(1, 102, "09:00", "10:00", 7); // dest overlaps Green's source
    const intentGreen = reschedule(2, 101, "07:30", "08:30", 7); // dest does not overlap any source

    const graph = detectMoveChains([intentAqua, intentGreen], [apptGreen, apptAqua]);

    expect(graph.chains).toHaveLength(1);
    expect(graph.chains[0]).toMatchObject({
      id: "chain-1",
      seedIntentId: 1,
      intentIds: [1, 2],
    });
    expect(graph.ecosystems).toHaveLength(1);
    expect(graph.ecosystems[0].chainIds).toEqual(["chain-1"]);
  });

  // PR-UX-2 PASS 2.5 (2026-05-05): mirrors what `makeDevCascadeChain`
  // produces — pin C1's destination to C2's source slot, C2's
  // destination to C3's source slot, C3 terminates in an empty slot.
  // The chip row's multi-step rendering (pulse + arrows + ghost
  // tiles) only becomes visually verifiable when this shape lands in
  // a single chain with `intentIds.length === 3`, so we lock that
  // contract here even though the 2-step case above already covers
  // the same code path.
  it("collapses a 3-step linear cascade into a single chain (cascade-seed contract)", () => {
    const apptA = makeAppt(101, 7, "09:00", "10:00");
    const apptB = makeAppt(102, 7, "11:00", "12:00");
    const apptC = makeAppt(103, 7, "13:00", "14:00");

    const c1 = reschedule(1, 101, "11:00", "12:00", 7); // → B's slot
    const c2 = reschedule(2, 102, "13:00", "14:00", 7); // → C's slot
    const c3 = reschedule(3, 103, "07:00", "08:00", 7); // → empty terminator

    const graph = detectMoveChains([c1, c2, c3], [apptA, apptB, apptC]);

    expect(graph.chains).toHaveLength(1);
    expect(graph.chains[0]).toMatchObject({
      id: "chain-1",
      seedIntentId: 1,
      intentIds: [1, 2, 3],
    });
    expect(graph.ecosystems).toHaveLength(1);
    expect(graph.ecosystems[0].chainIds).toEqual(["chain-1"]);
  });

  // PR-UX-2 PASS 2.14 (2026-05-05): regression guard for the
  // "chain-506 / chain-510 split" symptom the user hit on-device
  // when seeding a 6-step cascade across two day-columns. The seed
  // builder (`makeDevCascadeChain` in `app/pending-reality/review.tsx`)
  // pins `intent[i].dest = sources[i+1].{date,start,end,techId}` so
  // that — IF the live appointment data still matches the harvest —
  // the destination of step `i` exactly overlaps the source slot of
  // step `i+1`. This test bakes the same shape locally (one tech,
  // 6 sources spread across 2 dates) and asserts the detector
  // collapses them into ONE chain of 6 intents, not two disconnected
  // chains. The cross-day step (intent 4: end of day 1 → start of
  // day 2) is the one the on-device split hit; this test pins it
  // separately so a future regression in either the projection or
  // the seed contract fails loudly.
  it("collapses a 6-step cascade spread across two dates into a single chain", () => {
    const TECH = 2054;
    const D1 = "2026-05-05";
    const D2 = "2026-05-06";
    const apptDay1 = (id: number, start: string, end: string) => ({
      id,
      customer_id: 9000 + id,
      technician_id: TECH,
      franchise_id: 1,
      fleet_company_id: null,
      status: "scheduled" as const,
      scheduled_date: D1,
      scheduled_start_time: start,
      scheduled_end_time: end,
      recurrence_series_id: null,
    });
    const apptDay2 = (id: number, start: string, end: string) => ({
      id,
      customer_id: 9000 + id,
      technician_id: TECH,
      franchise_id: 1,
      fleet_company_id: null,
      status: "scheduled" as const,
      scheduled_date: D2,
      scheduled_start_time: start,
      scheduled_end_time: end,
      recurrence_series_id: null,
    });
    // Sources sorted chronologically as the seed harvest emits them.
    // Day 1 (3 appts) then Day 2 (3 appts). Intent[i].dest is set to
    // sources[i+1]'s exact slot; intent[5] is the terminator.
    const sources = [
      apptDay1(42490, "07:25", "07:50"),
      apptDay1(42492, "10:30", "11:30"),
      apptDay1(42520, "14:00", "15:00"),
      apptDay2(42522, "06:00", "06:30"),
      apptDay2(42524, "09:00", "10:00"),
      apptDay2(42397, "13:00", "14:00"),
    ];

    // Build the cascade: intent[i] reschedules sources[i] INTO
    // sources[i+1]'s exact slot. The terminator (intent[5]) moves
    // sources[5] off to an empty far-future slot — what
    // `makeDevCascadeChain` calls the +14-day @ 23:00 terminator.
    // The detector only cares about the destination overlap with
    // OTHER source slots; an off-screen terminator has none.
    const intents: ReorganizationIntent[] = [];
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      const isTerminator = i === sources.length - 1;
      const dst = isTerminator
        ? { date: D2, start: "23:00", end: "23:30" }
        : {
            date: sources[i + 1].scheduled_date,
            start: sources[i + 1].scheduled_start_time,
            end: sources[i + 1].scheduled_end_time,
          };
      intents.push(
        makeIntent(99200 + i, {
          appointment_id: src.id,
          payload: {
            kind: "reschedule",
            new_scheduled_date: dst.date,
            new_start_time: dst.start,
            new_end_time: dst.end,
            new_technician_id: TECH,
          },
        }),
      );
    }

    const graph = detectMoveChains(intents, sources);

    // ALL six intents collapse into one chain, regardless of which
    // day-column they live on. The on-device bug split this into
    // chain-506 (4 intents) + chain-510 (2 intents) because the
    // harvest had captured a stale source[4] slot.
    expect(graph.chains).toHaveLength(1);
    expect(graph.chains[0].intentIds).toEqual([
      99200, 99201, 99202, 99203, 99204, 99205,
    ]);
    expect(graph.ecosystems).toHaveLength(1);
    expect(graph.ecosystems[0].chainIds).toEqual(["chain-99200"]);
  });

  // PR-UX-18 (2026-05-09, fix-chain-splitting): regression guard for
  // the user-reported "drag the middle link of a 3-link chain to a
  // barely-different position and the chain shatters into 3 separate
  // 1-link chains" symptom. The root cause was in the producer
  // (`useSessionAwareSubmit`): the pre-PR-UX-18 re-stage path did a
  // local-only `usePendingRealityStore.removeIntent(...)` followed
  // by a BE `add_intent` POST. The BE response carried the old
  // intent (the local removal hadn't propagated to the BE), so
  // `setSession(session, intents)` overwrote the local removal and
  // the chain detector saw TWO intents targeting the same
  // appointment with conflicting destinations. The detector then
  // produced split-displaced seeds and shattered the cascade.
  //
  // The fix: the producer now uses BE `modify_intent` to update
  // payload in place (same intent id) so the BE intent list never
  // accumulates duplicate intents per appointment. This test
  // demonstrates both halves of the contract:
  //   (a) the post-fix happy path — re-staging via modify_intent
  //       keeps the 3-link chain intact;
  //   (b) the pre-fix bug shape — feeding the detector duplicate
  //       intents for the same appointment shatters the chain.
  // (b) is documentary — it pins the producer-level contract: do
  // NOT call this detector with duplicate-per-appointment intents.
  describe("re-stage scenario (PR-UX-18 fix-chain-splitting regression guard)", () => {
    // Setup: 3 appts on tech 7 forming a 3-step cascade.
    //   A @ 09:00 → 10:00, intent #100 moves A to 11:00 (overlaps B's source)
    //   B @ 11:00 → 12:00, intent #101 moves B to 13:00 (overlaps C's source)
    //   C @ 13:00 → 14:00, intent #102 moves C to 07:00 (terminator)
    const apptA = makeAppt(101, 7, "09:00", "10:00");
    const apptB = makeAppt(102, 7, "11:00", "12:00");
    const apptC = makeAppt(103, 7, "13:00", "14:00");
    const intentA = reschedule(100, 101, "11:00", "12:00", 7);
    const intentB = reschedule(101, 102, "13:00", "14:00", 7);
    const intentC = reschedule(102, 103, "07:00", "08:00", 7);

    it("baseline — 3-step linear cascade is detected as one chain", () => {
      const graph = detectMoveChains(
        [intentA, intentB, intentC],
        [apptA, apptB, apptC],
      );
      expect(graph.chains).toHaveLength(1);
      expect(graph.chains[0].intentIds).toEqual([100, 101, 102]);
    });

    it("post-fix happy path: modifying the middle intent's payload in place preserves the 3-step chain", () => {
      // Simulate `useModifyReorganizationIntent` updating intent #101's
      // payload — same intent id, new destination 13:30 (still
      // overlapping C's 13:00-14:00 source). The chain identity is
      // anchored to intent ids; same id → same chain.
      const intentBModified = reschedule(101, 102, "13:30", "14:30", 7);
      const graph = detectMoveChains(
        [intentA, intentBModified, intentC],
        [apptA, apptB, apptC],
      );
      expect(graph.chains).toHaveLength(1);
      expect(graph.chains[0].intentIds).toEqual([100, 101, 102]);
    });

    it("post-fix de-escalation: removing the middle intent leaves a 1-step chain (intent A) — not a shattered 3-chain set", () => {
      // The user moved B to a slot that resolves all conflicts AND
      // the producer fired BE `remove_intent` (or this is the
      // converged steady-state after live-commit). Result: A's
      // destination still overlaps B's source slot (B is still at
      // 11:00 in the world data), so A → B is still an edge — but
      // there's no intent for B anymore, so the chain ends at A.
      // C's intent stands alone (no conflict); separate ecosystem.
      const graph = detectMoveChains(
        [intentA, intentC],
        [apptA, apptB, apptC],
      );
      // Two chains: one for A (which still has a chain edge to B's
      // pre-removal source slot), one for C. Critically NOT three
      // 1-link chains — that's the bug shape (b) below.
      expect(graph.chains.map((c) => c.id).sort()).toEqual([
        "chain-100",
        "chain-102",
      ]);
    });

    it("documentary (bug shape): duplicate intents for the same appointment SHATTER a 3-step chain", () => {
      // This is the pre-PR-UX-18 broken state: the BE has BOTH the
      // old intent #101 (B → 13:00, the original cascade midpoint)
      // AND a new intent #103 (B → 13:30, a re-stage). Both source
      // slots are at B's original 11:00; both project source slots
      // with different intent_ids.
      //
      // The detector sees:
      //   - intentA (#100) dest 11:00 overlaps source slots for
      //     intent #101 (B@11:00) AND intent #103 (B@11:00). #100
      //     becomes a branch point with 2 outgoing edges.
      //   - intent #101 dest 13:00 overlaps source for intent
      //     #102 (C@13:00). Edge #101 → #102.
      //   - intent #103 dest 13:30 overlaps source for intent
      //     #102 (C@13:00). Edge #103 → #102.
      //
      // Result: #100 is a 1-step chain (terminates at branch),
      // #101 and #103 are split-displaced seeds (each a chain),
      // #102 is incoming-from-multiple but its parent #101 has 1
      // outgoing → it gets walked into chain-101's path.
      //
      // The exact shattered shape isn't load-bearing — what's
      // load-bearing is that the chain count is GREATER THAN ONE
      // (the original 3-step chain is gone). This test pins that
      // contract so a future producer regression that re-introduces
      // duplicate intents fails this test loudly.
      const intentBModifiedNewId = reschedule(103, 102, "13:30", "14:30", 7);
      const graph = detectMoveChains(
        [intentA, intentB, intentBModifiedNewId, intentC],
        [apptA, apptB, apptC],
      );
      // The original 3-step chain has shattered. Multiple chains
      // exist, none contains all three of the original intent ids.
      expect(graph.chains.length).toBeGreaterThan(1);
      const flatIntentIds = graph.chains
        .map((c) => c.intentIds.join(","))
        .sort();
      // Every chain holds STRICTLY FEWER than the original 3 cascade
      // intent ids (100, 101, 102). I.e. no chain still contains
      // [100, 101, 102] — the bug shape.
      for (const ids of flatIntentIds) {
        expect(ids).not.toEqual("100,101,102");
      }
    });
  });

  it("breaks a 3-way split into 4 chains in one ecosystem (Purple scenario)", () => {
    // Purple drops onto a tall slot covering Orange + Red + Pink on tech 0.
    // Each displaced child has its own move out (Orange → Brown's spot,
    // Red → empty, Pink → Yellow's spot).
    //
    // Cards on tech 0 (tall slot 09:00–13:00):
    //   Orange : 09:00–10:00
    //   Red    : 10:30–11:30
    //   Pink   : 12:00–13:00
    // Cards on tech 1 (Brown's spot, target for Orange):
    //   Brown  : 09:00–10:00
    // Cards on tech 2 (Yellow's spot, target for Pink):
    //   Yellow : 11:00–12:00
    const apptOrange = makeAppt(101, 0, "09:00", "10:00");
    const apptRed = makeAppt(102, 0, "10:30", "11:30");
    const apptPink = makeAppt(103, 0, "12:00", "13:00");
    const apptBrown = makeAppt(104, 1, "09:00", "10:00");
    const apptYellow = makeAppt(105, 2, "11:00", "12:00");
    // Purple's source can sit anywhere off-tech-0 (we just need the
    // appointment row to exist for the seed-color lookup).
    const apptPurple = makeAppt(106, 1, "12:00", "13:00");

    const purple = reschedule(1, 106, "09:00", "13:00", 0); // dest covers Orange + Red + Pink
    const orange = reschedule(2, 101, "09:00", "10:00", 1); // dest = Brown's source (tech 1, 09:00–10:00)
    const red = reschedule(3, 102, "14:00", "15:00", 0); // dest = empty slot (no overlap)
    const pink = reschedule(4, 103, "11:00", "12:00", 2); // dest = Yellow's source (tech 2, 11:00–12:00)
    const brown = reschedule(5, 104, "13:00", "14:00", 1); // dest = empty slot (no overlap)
    const yellow = reschedule(6, 105, "13:30", "14:30", 2); // dest = empty slot (no overlap)

    const intents = [purple, orange, red, pink, brown, yellow];
    const apps = [apptOrange, apptRed, apptPink, apptBrown, apptYellow, apptPurple];

    const graph = detectMoveChains(intents, apps);

    // 4 chains: Purple (seed, 1 step), Orange→Brown (2 step), Red (1 step), Pink→Yellow (2 step)
    expect(graph.chains.map((c) => c.id).sort()).toEqual([
      "chain-1", // Purple seed
      "chain-2", // Orange chain
      "chain-3", // Red chain
      "chain-4", // Pink chain
    ]);

    const byId = new Map(graph.chains.map((c) => [c.id, c]));
    expect(byId.get("chain-1")?.intentIds).toEqual([1]); // Purple terminates at split point
    expect(byId.get("chain-2")?.intentIds).toEqual([2, 5]); // Orange → Brown
    expect(byId.get("chain-3")?.intentIds).toEqual([3]); // Red is 1 step
    expect(byId.get("chain-4")?.intentIds).toEqual([4, 6]); // Pink → Yellow

    // All 4 chains share one ecosystem (everything traces back to Purple).
    expect(graph.ecosystems).toHaveLength(1);
    expect(graph.ecosystems[0].chainIds.sort()).toEqual([
      "chain-1",
      "chain-2",
      "chain-3",
      "chain-4",
    ]);
  });

  it("separates causally unrelated intents into different ecosystems", () => {
    // Ecosystem A: Aqua → Green (linear).
    const apptGreen = makeAppt(201, 5, "09:00", "10:00");
    const apptAqua = makeAppt(202, 5, "13:00", "14:00");
    const aqua = reschedule(10, 202, "09:00", "10:00", 5); // displaces Green
    const green = reschedule(11, 201, "07:00", "08:00", 5); // moves elsewhere

    // Ecosystem B: a single isolated reschedule on a different tech with no overlap.
    const apptSolo = makeAppt(301, 9, "10:00", "11:00");
    const solo = reschedule(20, 301, "15:00", "16:00", 9);

    const graph = detectMoveChains(
      [aqua, green, solo],
      [apptGreen, apptAqua, apptSolo],
    );

    expect(graph.chains).toHaveLength(2);
    expect(graph.ecosystems).toHaveLength(2);
    // Ecosystem ids derive from each ecosystem's lowest seed id.
    const ecoIds = graph.ecosystems.map((e) => e.id).sort();
    expect(ecoIds).toEqual(["eco-10", "eco-20"]);
  });

  it("assigns per-step colors from the palette by step ordinal within each chain", () => {
    // PLAN-DEVIATION: 2026-05-05-per-step-coloring — within a chain,
    // step k gets palette[k % palette.length]. Across chains,
    // step ordinals share palette slots (chain A step 0 and
    // chain B step 0 are both palette[0]). This test pins both
    // axes:
    //   - 3-step chain → stepColors = [palette[0..2]] (intra-chain
    //     distinct).
    //   - Two single-step chains → both have stepColors = [palette[0]]
    //     (cross-chain palette sharing).
    const apptA = makeAppt(101, 7, "09:00", "10:00");
    const apptB = makeAppt(102, 7, "11:00", "12:00");
    const apptC = makeAppt(103, 7, "13:00", "14:00");
    const apptD = makeAppt(104, 8, "09:00", "10:00");

    // 3-step cascade on tech 7.
    const c1 = reschedule(1, 101, "11:00", "12:00", 7);
    const c2 = reschedule(2, 102, "13:00", "14:00", 7);
    const c3 = reschedule(3, 103, "07:00", "08:00", 7);
    // Independent 1-step chain on tech 8.
    const c4 = reschedule(4, 104, "15:00", "16:00", 8);

    const graph = detectMoveChains(
      [c1, c2, c3, c4],
      [apptA, apptB, apptC, apptD],
    );

    expect(graph.chains).toHaveLength(2);
    const cascade = graph.chains.find((c) => c.id === "chain-1");
    const solo = graph.chains.find((c) => c.id === "chain-4");
    expect(cascade?.intentIds).toEqual([1, 2, 3]);
    expect(solo?.intentIds).toEqual([4]);

    // Intra-chain: step ordinals 0..N-1 hit palette[0..N-1].
    expect(cascade?.stepColors).toEqual([
      TECH_PALETTE[0],
      TECH_PALETTE[1],
      TECH_PALETTE[2],
    ]);
    expect(cascade?.color).toBe(TECH_PALETTE[0]);

    // Cross-chain: a 1-step chain ALSO starts at palette[0].
    expect(solo?.stepColors).toEqual([TECH_PALETTE[0]]);
    expect(solo?.color).toBe(TECH_PALETTE[0]);
  });

  // PR-UX-2 PASS 2.8 task `c6` — staging a new intent through the
  // existing `useSessionAwareSubmit` → linter intercept → "Stage for
  // review" path produces a fresh `ReorganizationIntent` in
  // `usePendingRealityStore.intents`. The chain-detection re-runs
  // automatically on the next render. The three tests below pin the
  // emergent topologies the user explicitly called out in their
  // clarification:
  //
  //   "Not only does a new conflict extend the chain in any relative
  //    link in the chain, it can change the colors of any link down
  //    the chain by 1 and assume the color of the link it is going
  //    behind. AND it is possible to combine/break multiple chains
  //    using this logic."
  //
  // No code change is needed for c6 — these tests document that the
  // existing detection algorithm already handles head extension,
  // mid-chain stacking, and merge-fork correctly. Anti-instruction:
  // do NOT collapse these into the single-cascade test above; the
  // value here is in the topology comparison.
  describe("c6 — chain mutation via new staged intent", () => {
    it("HEAD-EXTENDS a chain: a NEW intent dropping onto the seed's source becomes the new seed and shifts step ordinals", () => {
      // Pre: chain `chain-1` is [seed=1] (1 → empty terminator).
      const apptZ = makeAppt(101, 7, "09:00", "10:00");
      const intentZ = reschedule(1, 101, "13:00", "14:00", 7);
      const before = detectMoveChains([intentZ], [apptZ]);
      expect(before.chains).toHaveLength(1);
      expect(before.chains[0]).toMatchObject({
        id: "chain-1",
        intentIds: [1],
      });
      expect(before.chains[0].stepColors).toEqual([TECH_PALETTE[0]]);

      // User drags a fresh card X onto Z's source slot (09:00–10:00
      // on tech 7). The intercept stages the resulting reschedule
      // intent; it gets the next intent id (50, simulating a BE
      // assignment). X has no overlap with anything → its own
      // seed; X's dest overlaps Z's source → edge X→Z; Z used to
      // be a seed but now has 1 incoming → no longer a seed.
      const apptX = makeAppt(102, 7, "06:00", "07:00");
      const intentX = reschedule(50, 102, "09:00", "10:00", 7);

      const after = detectMoveChains([intentZ, intentX], [apptZ, apptX]);

      expect(after.chains).toHaveLength(1);
      expect(after.chains[0]).toMatchObject({
        id: "chain-50",
        seedIntentId: 50,
        intentIds: [50, 1],
      });
      // Color shift: Z used to be step 0 (palette[0]); now Z is step 1
      // (palette[1]) and X is step 0.
      expect(after.chains[0].stepColors).toEqual([
        TECH_PALETTE[0],
        TECH_PALETTE[1],
      ]);
    });

    it("does NOT extend mid-chain: a NEW intent landing on an INTERIOR node's source produces its own 1-step chain (sibling, not insertion)", () => {
      // Pre: 3-step linear cascade [1, 2, 3] on tech 7.
      const apptA = makeAppt(101, 7, "09:00", "10:00");
      const apptB = makeAppt(102, 7, "11:00", "12:00");
      const apptC = makeAppt(103, 7, "13:00", "14:00");
      const c1 = reschedule(1, 101, "11:00", "12:00", 7); // → B
      const c2 = reschedule(2, 102, "13:00", "14:00", 7); // → C
      const c3 = reschedule(3, 103, "07:00", "08:00", 7); // → empty

      // User drags fresh card X onto B's source (the INTERIOR node
      // of the cascade). New intent gets id 50 (highest, latest).
      const apptX = makeAppt(104, 7, "15:00", "16:00");
      const intentX = reschedule(50, 104, "11:00", "12:00", 7);

      const after = detectMoveChains(
        [c1, c2, c3, intentX],
        [apptA, apptB, apptC, apptX],
      );

      // The original cascade is preserved (its seed `1` has the
      // lowest id and is walked first, claiming [1, 2, 3]). The
      // new intent X seeds a new chain, walks toward node 2, but
      // hits the already-claimed guard and stops at [50].
      const cascade = after.chains.find((c) => c.id === "chain-1");
      const sibling = after.chains.find((c) => c.id === "chain-50");
      expect(cascade?.intentIds).toEqual([1, 2, 3]);
      expect(sibling?.intentIds).toEqual([50]);
      // The two chains share an ecosystem (the trigger graph
      // connects them via the X→2 edge).
      expect(cascade?.ecosystemId).toBe(sibling?.ecosystemId);
      expect(after.ecosystems).toHaveLength(1);
    });

    it("MERGE-FORKS at a common-downstream node: two seeds both targeting the same source node produce two chains that share an ecosystem", () => {
      // Pre: chain [1] (seed=1) where 1's dest is at slot N.
      // Stage a NEW intent X (id=50) that ALSO lands at N.
      // Per the algorithm: N is no longer a seed (it had been a
      // dangling overlap target with no incoming intent — actually
      // N here is a real appointment WITH an intent that targets
      // it from both directions).
      //
      // Setup:
      //   - Node N appointment id=200, slot 12:00-13:00 on tech 7.
      //   - Intent N (id=10): N → empty terminator at 06:00-07:00.
      //   - Intent A (id=1): A's source 09:00-10:00, dest 12:00-13:00 (overlaps N).
      //   - Pre-state chain: seeds=[1, 10] (both have 0 incoming);
      //     1→10 via A→N; 10's outgoing is empty. Walk from 1:
      //     [1, 10]. Walk from 10: guard → [].
      //     So pre-state has one chain [1, 10] (id="chain-1").
      const apptN = makeAppt(200, 7, "12:00", "13:00");
      const apptA = makeAppt(101, 7, "09:00", "10:00");
      const intentN = reschedule(10, 200, "06:00", "07:00", 7); // N → empty
      const intentA = reschedule(1, 101, "12:00", "13:00", 7); // A → N
      const before = detectMoveChains([intentA, intentN], [apptN, apptA]);
      expect(before.chains).toHaveLength(1);
      expect(before.chains[0].intentIds).toEqual([1, 10]);

      // Now stage X (id=50): X lands at N's source slot too. Outgoing
      // X→N (because dest overlaps N's source). N now has incoming
      // [A, X] (length 2). Both A and X have 1 outgoing each → N is
      // NOT split-displaced (split-displaced needs PARENT to have
      // 2+ outgoing; here N has 2+ INCOMING but each parent has 1
      // outgoing). So N is not a seed. Seeds: [1, 10, 50] minus
      // those with incoming → [1, 50].
      //
      // Walk from 1 (smallest seed first): 1 → N=10. Walk continues
      // from 10 (outgoing = []). Chain `chain-1` = [1, 10].
      // Walk from 50: 50 → N=10. Guard breaks (10 already claimed).
      // Chain `chain-50` = [50].
      const apptX = makeAppt(102, 7, "15:00", "16:00");
      const intentX = reschedule(50, 102, "12:00", "13:00", 7);

      const after = detectMoveChains(
        [intentA, intentN, intentX],
        [apptN, apptA, apptX],
      );

      expect(after.chains).toHaveLength(2);
      const longChain = after.chains.find((c) => c.id === "chain-1");
      const shortChain = after.chains.find((c) => c.id === "chain-50");
      expect(longChain?.intentIds).toEqual([1, 10]);
      expect(shortChain?.intentIds).toEqual([50]);

      // Both chains share the same ecosystem (X→N edge connects
      // them in the undirected trigger graph).
      expect(longChain?.ecosystemId).toBe(shortChain?.ecosystemId);
      expect(after.ecosystems).toHaveLength(1);
    });
  });

  // PR-UX-2 PASS 2.13 (2026-05-05): documents the root-cause shape
  // for the "last card has no chain border" regression the user
  // reported while testing the dev cascade-chain seed. The original
  // `makeDevCascadeChain` (PR-UX-2 PASS 2.5) pinned the terminator
  // intent's destination to 07:00–08:00 on the same date as the
  // last harvested source. When the harvest happened to include a
  // first-of-day appointment whose start time fell BEFORE 08:00 (a
  // 06:55 Olivia card was the on-device repro), the terminator's
  // destination geometrically overlapped that appointment's source
  // slot — adding an outgoing edge from the terminator back to the
  // chain's seed.
  //
  // The downstream effect of the cycle:
  //   - Pure cycle (every intent has exactly one parent, no parent
  //     has 2+ outgoing edges) → no seed candidates → `chains = []`
  //     → the chip row vanishes entirely. Symptom: "I tapped Seed
  //     cascade chain and nothing showed up."
  //   - Partial cycle (some intent gains 2+ outgoing edges via the
  //     terminator's overlap) → split-displaced seeding kicks in,
  //     the chain walker emits SHORTER chains than the seed expected,
  //     and the source card whose intent didn't make it into any
  //     chain falls through `applyMoveChainBorderOverride`'s
  //     `dimOrExempt("intent-not-in-any-chain")` branch. That
  //     branch returns `base` (no chain border, full opacity)
  //     whenever the orphan card sits under another in-flight
  //     intent's ghost destination — which is the very
  //     intermediate ghost that just displaced it. Symptom: the
  //     LAST card of the visible chain is still cyan-tinted (an
  //     intent targets it) but lacks any chain-color border.
  //
  // This test pins the pure-cycle behavior so any future detector
  // change that "fixes" cycles by silently emitting a partial chain
  // (which would re-introduce the broken-border regression) breaks
  // here loudly. Anti-instruction: do NOT change the assertion to
  // `toHaveLength(1)` and walk the cycle as a chain — `MoveChainChipRow`
  // assumes `intentIds` is a strict linear forward walk and renders
  // a misleading dot count for cyclic input. The seed-side fix
  // (terminator dest moved 14 days off the harvest window) lives
  // in `app/pending-reality/review.tsx#makeDevCascadeChain` and
  // makes this scenario unreachable in the dev seed; this test
  // documents the contract for any other future caller.
  it("emits ZERO chains when the terminator destination overlaps the seed's source slot (cycle root cause for PR-UX-2 PASS 2.13)", () => {
    // Mirrors the on-device repro: 3-intent cascade where the
    // terminator's 07:00-08:00 destination overlaps the seed
    // (06:55-07:25) source slot.
    const apptOlivia655 = makeAppt(101, 7, "06:55", "07:25");
    const apptOlivia825 = makeAppt(102, 7, "08:25", "08:55");
    const apptSophia1030 = makeAppt(103, 7, "10:30", "11:00");

    const c1 = reschedule(1, 101, "08:25", "08:55", 7); // → Olivia 8:25
    const c2 = reschedule(2, 102, "10:30", "11:00", 7); // → Sophia 10:30
    const c3 = reschedule(3, 103, "07:00", "08:00", 7); // terminator overlaps Olivia 6:55

    const graph = detectMoveChains(
      [c1, c2, c3],
      [apptOlivia655, apptOlivia825, apptSophia1030],
    );

    expect(graph.chains).toEqual([]);
    expect(graph.ecosystems).toEqual([]);
    expect(graph.intentToChainId.size).toBe(0);
  });

  // PR-UX-2 PASS 2.13 (2026-05-05): same source set as the cycle
  // test above, but with the terminator destination moved off the
  // chain's date window (matching the post-PASS 2.13 shape of
  // `makeDevCascadeChain`). The cycle disappears, the linear walk
  // succeeds, and every source appointment lands in `chain.intentIds`
  // so `applyMoveChainBorderOverride` can resolve a step ordinal
  // for each of them.
  it("emits a single 3-step chain when the terminator destination is shifted off the harvest window (PR-UX-2 PASS 2.13 fix)", () => {
    const apptOlivia655 = makeAppt(101, 7, "06:55", "07:25");
    const apptOlivia825 = makeAppt(102, 7, "08:25", "08:55");
    const apptSophia1030 = makeAppt(103, 7, "10:30", "11:00");

    const c1 = reschedule(1, 101, "08:25", "08:55", 7);
    const c2 = reschedule(2, 102, "10:30", "11:00", 7);
    // Terminator destination moved to 23:00–23:30 — well outside
    // any plausible same-day source window.
    const c3 = reschedule(3, 103, "23:00", "23:30", 7);

    const graph = detectMoveChains(
      [c1, c2, c3],
      [apptOlivia655, apptOlivia825, apptSophia1030],
    );

    expect(graph.chains).toHaveLength(1);
    expect(graph.chains[0].intentIds).toEqual([1, 2, 3]);
    expect(graph.intentToChainId.get(3)).toBe("chain-1");
    expect(graph.chains[0].stepColors).toEqual([
      TECH_PALETTE[0],
      TECH_PALETTE[1],
      TECH_PALETTE[2],
    ]);
  });

  it("excludes cancel and personal_event_* intents from chain seeding", () => {
    // PR-UX-2 PASS 2.1: cancels remove a card (no destination slot to
    // visualize), personal_event_* intents likewise don't physically
    // displace other appointments. Including them as chains clutters
    // the chip row with non-actionable selections (no ghost tile to
    // jump to). Only reschedule/reassign/create can seed a chain.
    const apptA = makeAppt(101, 7, "10:00", "11:00");
    const intentReschedule = reschedule(1, 101, "13:00", "14:00", 7);
    const intentCancel = makeIntent(2, {
      appointment_id: 999,
      payload: { kind: "cancel", cancellation_reason_id: 1 },
    });
    const intentPeDelete = makeIntent(3, {
      appointment_id: null,
      personal_event_id: "pe-zzz",
      payload: { kind: "personal_event_delete" },
    });
    const intentPeUpdate = makeIntent(4, {
      appointment_id: null,
      personal_event_id: "pe-yyy",
      payload: {
        kind: "personal_event_update",
        version: 1,
        patch: { title: "x" },
      },
    });
    const intentPeCreate = makeIntent(5, {
      appointment_id: null,
      payload: {
        kind: "personal_event_create",
        technician_id: 7,
        scheduled_date: DATE,
        start_time: `${DATE}T12:00:00-04:00`,
        end_time: `${DATE}T13:00:00-04:00`,
        title: "Lunch",
        category: "lunch",
      },
    });

    const graph = detectMoveChains(
      [intentReschedule, intentCancel, intentPeDelete, intentPeUpdate, intentPeCreate],
      [apptA],
    );

    expect(graph.chains).toHaveLength(1);
    expect(graph.chains[0].seedIntentId).toBe(1);
    expect(graph.intentToChainId.get(2)).toBeUndefined();
    expect(graph.intentToChainId.get(3)).toBeUndefined();
    expect(graph.intentToChainId.get(4)).toBeUndefined();
    expect(graph.intentToChainId.get(5)).toBeUndefined();
  });

  // PR-UX-3 (2026-05-07): regression guard for the locked multi-tech
  // sequence Josh→Todd→Josh→Todd→Trey→Josh→Trey. The detector is
  // tech-agnostic by construction (the trigger-edge rule only checks
  // same-tech overlap of dest and source slots), so an interleaved
  // 3-tech cascade should still collapse into a single chain. This
  // test pins the contract so a future regression in the projection
  // (e.g. accidentally restricting edges to same-source-tech only)
  // would fail loudly. See `pr-ux-3-multi-tech-handoff.md` §1.A5 +
  // §10.A5 for the full design spec.
  it("collapses a 7-step interleaved 3-tech cascade into a single chain (PR-UX-3 multi-tech seed)", () => {
    const TECH_A = 7001;
    const TECH_B = 7002;
    const TECH_C = 7003;
    const sequence = [TECH_A, TECH_B, TECH_A, TECH_B, TECH_C, TECH_A, TECH_C];

    // Seven sources: each on its assigned tech, all on the same day,
    // chronologically spaced 1 hour apart so the cascade rule
    // `intent[i].dest = sources[i+1].slot` produces a clean linear
    // chain. Step 6 (the terminator) doesn't need a destination
    // overlap — it terminates in an empty earlier slot.
    const sources = sequence.map((techId, idx) => ({
      id: 100 + idx,
      customer_id: 9000 + idx,
      technician_id: techId,
      franchise_id: 1,
      fleet_company_id: null,
      status: "scheduled" as const,
      scheduled_date: DATE,
      scheduled_start_time: `${String(8 + idx).padStart(2, "0")}:00`,
      scheduled_end_time: `${String(8 + idx).padStart(2, "0")}:30`,
      recurrence_series_id: null,
    }));

    const intents: ReorganizationIntent[] = [];
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      const isTerminator = i === sources.length - 1;
      const dst = isTerminator
        ? { date: DATE, techId: src.technician_id, start: "06:00", end: "06:30" }
        : {
            date: DATE,
            techId: sources[i + 1].technician_id,
            start: sources[i + 1].scheduled_start_time,
            end: sources[i + 1].scheduled_end_time,
          };
      intents.push(
        makeIntent(i + 1, {
          appointment_id: src.id,
          payload: {
            kind: "reschedule",
            new_scheduled_date: dst.date,
            new_start_time: dst.start,
            new_end_time: dst.end,
            new_technician_id: dst.techId,
          },
        }),
      );
    }

    const graph = detectMoveChains(intents, sources);

    expect(graph.chains).toHaveLength(1);
    expect(graph.chains[0]).toMatchObject({
      id: "chain-1",
      seedIntentId: 1,
      intentIds: [1, 2, 3, 4, 5, 6, 7],
    });
    // The 3-tech sequence should be a single ecosystem (every step's
    // dest slot triggers the next step's source on a different tech;
    // ecosystems collapse via the undirected trigger graph).
    expect(graph.ecosystems).toHaveLength(1);
    expect(graph.ecosystems[0].chainIds).toEqual(["chain-1"]);
    // Per-step colors come from the palette by step ordinal — chain
    // identity is independent of the cross-tech sequence.
    expect(graph.chains[0].stepColors).toHaveLength(7);
  });
});

describe("getVisibleMoveChainDestSlots", () => {
  // 2-step linear cascade: aqua → green's slot, green → empty.
  //
  // PLAN-DEVIATION: 2026-05-05-per-step-coloring — every chain
  // destination is emitted, including intermediate steps whose
  // destination overlaps another in-chain card. Per the user's
  // explicit clarification, the conflict IS the visualization:
  // an intermediate ghost STACKED OVER a displaced card is exactly
  // how the user reads "this card wants to land where that other
  // card currently is." The PR-UX-2 PASS 2.6 ghost-suppression
  // filter that previously dropped intermediate destinations was
  // reverted on 2026-05-05.
  const apptGreen = makeAppt(101, 7, "09:00", "10:00");
  const apptAqua = makeAppt(102, 7, "13:30", "14:30");
  const intentAqua = reschedule(1, 102, "09:00", "10:00", 7); // dest = Green's source → KEEP (stacks over Green)
  const intentGreen = reschedule(2, 101, "07:30", "08:30", 7); // dest = empty → KEEP
  const apps = [apptGreen, apptAqua];
  const intents = [intentAqua, intentGreen];
  const graph = detectMoveChains(intents, apps);

  it("returns [] when selectedChainId is null (Show all baseline)", () => {
    expect(getVisibleMoveChainDestSlots(graph, intents, apps, null)).toEqual(
      [],
    );
  });

  it("returns [] when there are no chains, even in 'all' mode", () => {
    const empty = detectMoveChains([], []);
    expect(getVisibleMoveChainDestSlots(empty, [], [], "all")).toEqual([]);
  });

  it("emits EVERY destination of a linear cascade in 'all' mode (no suppression)", () => {
    const slots = getVisibleMoveChainDestSlots(graph, intents, apps, "all");
    // Both intents emit a destination: aqua → Green's slot (stacks
    // OVER Green to communicate the conflict), green → empty.
    expect(slots).toHaveLength(2);
    const intentIds = slots.map((s) => s.intent_id).sort((a, b) => a - b);
    expect(intentIds).toEqual([1, 2]);
  });

  it("emits every destination of the selected chain when a specific chain is isolated", () => {
    // 2-tech cascade: aqua (7→7 at 09:00) + isolated solo on tech 9.
    const apptSolo = makeAppt(301, 9, "10:00", "11:00");
    const solo = reschedule(20, 301, "15:00", "16:00", 9);
    const graph2 = detectMoveChains(
      [intentAqua, intentGreen, solo],
      [...apps, apptSolo],
    );
    expect(graph2.chains).toHaveLength(2);

    const aquaChainId = graph2.intentToChainId.get(1)!;
    const slots = getVisibleMoveChainDestSlots(
      graph2,
      [intentAqua, intentGreen, solo],
      [...apps, apptSolo],
      aquaChainId,
    );
    // Both aqua-chain destinations emitted; solo's dest is filtered
    // out because it's a different chain.
    expect(slots).toHaveLength(2);
    for (const slot of slots) {
      expect(slot.chain_id).toBe(aquaChainId);
    }
  });

  it("attaches the intent's per-step color (chain.stepColors[ordinal]) to every emitted slot", () => {
    const slots = getVisibleMoveChainDestSlots(graph, intents, apps, "all");
    for (const slot of slots) {
      const chain = graph.chains.find((c) => c.id === slot.chain_id)!;
      const ordinal = chain.intentIds.indexOf(slot.intent_id);
      expect(ordinal).toBeGreaterThanOrEqual(0);
      expect(slot.step_color).toBe(chain.stepColors[ordinal]);
    }
    // And the two emitted slots use TWO DIFFERENT step colors —
    // the whole point of per-step coloring (intermediate ghost in
    // intent 1's color, terminator ghost in intent 2's color).
    expect(slots).toHaveLength(2);
    expect(new Set(slots.map((s) => s.step_color)).size).toBe(2);
  });

  it("emits every dest of every chain in the Purple-split scenario (no suppression cross-chain or intra-chain)", () => {
    // Purple drops onto a tall slot covering Orange + Red + Pink on tech 0.
    // Every chain destination emits, including intermediate steps
    // (Orange's and Pink's intent-1 destinations stack over Brown
    // and Yellow respectively).
    const apptOrange = makeAppt(101, 0, "09:00", "10:00");
    const apptRed = makeAppt(102, 0, "10:30", "11:30");
    const apptPink = makeAppt(103, 0, "12:00", "13:00");
    const apptBrown = makeAppt(104, 1, "09:00", "10:00");
    const apptYellow = makeAppt(105, 2, "11:00", "12:00");
    const apptPurple = makeAppt(106, 1, "12:00", "13:00");

    const purple = reschedule(1, 106, "09:00", "13:00", 0);
    const orange = reschedule(2, 101, "09:00", "10:00", 1);
    const red = reschedule(3, 102, "14:00", "15:00", 0);
    const pink = reschedule(4, 103, "11:00", "12:00", 2);
    const brown = reschedule(5, 104, "13:00", "14:00", 1);
    const yellow = reschedule(6, 105, "13:30", "14:30", 2);

    const intentsPS = [purple, orange, red, pink, brown, yellow];
    const appsPS = [
      apptOrange,
      apptRed,
      apptPink,
      apptBrown,
      apptYellow,
      apptPurple,
    ];
    const graphPS = detectMoveChains(intentsPS, appsPS);

    const slotsPS = getVisibleMoveChainDestSlots(
      graphPS,
      intentsPS,
      appsPS,
      "all",
    );
    // All 6 intent destinations emit:
    //   Purple (intent 1)     → tall slot covering 3 cards
    //   Orange (intent 2)     → Brown's slot (stacks over Brown)
    //   Red    (intent 3)     → empty
    //   Pink   (intent 4)     → Yellow's slot (stacks over Yellow)
    //   Brown  (intent 5)     → empty
    //   Yellow (intent 6)     → empty
    expect(slotsPS).toHaveLength(6);
    const intentIds = slotsPS.map((s) => s.intent_id).sort((a, b) => a - b);
    expect(intentIds).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("emits all 3 destinations of a 3-step linear cascade (intermediate ghosts stack over displaced cards)", () => {
    // PLAN-DEVIATION: 2026-05-05-per-step-coloring — all 3 ghosts
    // emit. Intent 1's ghost lands on B's slot (intent 2's source)
    // in palette[0]; intent 2's ghost lands on C's slot in
    // palette[1]; intent 3's ghost lands on the empty terminator
    // in palette[2]. Two stacked frames in different colors at
    // each intermediate slot is the conflict signal.
    const apptA = makeAppt(101, 7, "09:00", "10:00");
    const apptB = makeAppt(102, 7, "11:00", "12:00");
    const apptC = makeAppt(103, 7, "13:00", "14:00");
    const c1 = reschedule(1, 101, "11:00", "12:00", 7); // → B's slot
    const c2 = reschedule(2, 102, "13:00", "14:00", 7); // → C's slot
    const c3 = reschedule(3, 103, "07:00", "08:00", 7); // → terminator
    const intentsCa = [c1, c2, c3];
    const appsCa = [apptA, apptB, apptC];
    const graphCa = detectMoveChains(intentsCa, appsCa);

    const slotsCa = getVisibleMoveChainDestSlots(
      graphCa,
      intentsCa,
      appsCa,
      "all",
    );
    expect(slotsCa).toHaveLength(3);
    const byIntent = new Map(slotsCa.map((s) => [s.intent_id, s]));
    expect(byIntent.get(1)?.step_color).toBe(TECH_PALETTE[0]);
    expect(byIntent.get(2)?.step_color).toBe(TECH_PALETTE[1]);
    expect(byIntent.get(3)?.step_color).toBe(TECH_PALETTE[2]);
  });

  // -------------------------------------------------------------------------
  // chainStepHighlights spotlight filter (PR-UX-2 PASS 2.11 / task `c8`).
  // -------------------------------------------------------------------------

  describe("chainStepHighlights spotlight", () => {
    // Re-derive the 3-step linear cascade from above so the spotlight
    // tests are independent.
    const apptA = makeAppt(101, 7, "09:00", "10:00");
    const apptB = makeAppt(102, 7, "11:00", "12:00");
    const apptC = makeAppt(103, 7, "13:00", "14:00");
    const c1 = reschedule(1, 101, "11:00", "12:00", 7);
    const c2 = reschedule(2, 102, "13:00", "14:00", 7);
    const c3 = reschedule(3, 103, "07:00", "08:00", 7);
    const intentsCa = [c1, c2, c3];
    const appsCa = [apptA, apptB, apptC];
    const graphCa = detectMoveChains(intentsCa, appsCa);
    const chainId = graphCa.intentToChainId.get(1)!;

    it("undefined → pre-c8 behavior (every dest in the chain emits)", () => {
      const slots = getVisibleMoveChainDestSlots(
        graphCa,
        intentsCa,
        appsCa,
        chainId,
      );
      expect(slots.map((s) => s.intent_id).sort((a, b) => a - b)).toEqual([
        1, 2, 3,
      ]);
    });

    it("null → pre-c8 behavior (every dest in the chain emits)", () => {
      const slots = getVisibleMoveChainDestSlots(
        graphCa,
        intentsCa,
        appsCa,
        chainId,
        null,
      );
      expect(slots.map((s) => s.intent_id).sort((a, b) => a - b)).toEqual([
        1, 2, 3,
      ]);
    });

    it("[] → ZERO destinations emit (the 'all dots dim' baseline)", () => {
      const slots = getVisibleMoveChainDestSlots(
        graphCa,
        intentsCa,
        appsCa,
        chainId,
        [],
      );
      expect(slots).toEqual([]);
    });

    it("[0, 1] → only steps 0 and 1 emit (intents c1 and c2)", () => {
      const slots = getVisibleMoveChainDestSlots(
        graphCa,
        intentsCa,
        appsCa,
        chainId,
        [0, 1],
      );
      expect(slots.map((s) => s.intent_id).sort((a, b) => a - b)).toEqual([
        1, 2,
      ]);
    });

    it("[2] → only step 2 emits (intent c3, the terminator)", () => {
      const slots = getVisibleMoveChainDestSlots(
        graphCa,
        intentsCa,
        appsCa,
        chainId,
        [2],
      );
      expect(slots.map((s) => s.intent_id)).toEqual([3]);
    });

    it("spotlight is ignored in 'all' mode (filter only applies when a chain is isolated)", () => {
      // Show-all mode shows every chain's destinations regardless of
      // chainStepHighlights — the per-step legend is meaningless when
      // the user hasn't picked a chain to focus on.
      const slotsAll = getVisibleMoveChainDestSlots(
        graphCa,
        intentsCa,
        appsCa,
        "all",
        [0],
      );
      expect(slotsAll).toHaveLength(3);
    });
  });
});

// ──────────────────────────────────────────────────────────────────
// `wouldExtendExistingChain` (2026-05-08, post-on-device smoke).
//
// Predicate consumed by `useSessionAwareSubmit` to decide between
// session-sticky stage and live-commit on the linter-clean +
// session-active branch. The user's rule: solo no-conflict drops
// live-commit; chain-extending drops stage.
//
// These tests pin the predicate's contract end-to-end so the
// session-aware-submit tests can mock it confidently. The
// implementation reuses `detectMoveChains` so any drift between
// "what the predicate calls a chain" and "what the chip row /
// review screen render" is impossible by construction.
// ──────────────────────────────────────────────────────────────────

describe("wouldExtendExistingChain", () => {
  it("returns false when there are no existing intents (first stage of a session is by definition solo)", () => {
    const newIntent = reschedule(101, 5001, "10:00", "11:00", 7);
    expect(wouldExtendExistingChain(newIntent, [], [])).toBe(false);
  });

  it("returns false for a solo no-conflict drop that lands on free space (the bug repro)", () => {
    // Existing chain: intent 1 (reschedule appt 5001 → 14:00 on tech 7,
    // displaces nothing). New intent: drop appt 5002 → 09:00 on tech 8
    // (different tech, no overlap with anything). The user's stated
    // rule: this is the live-commit case.
    const apptA = makeAppt(5001, 7, "11:00", "12:00");
    const apptB = makeAppt(5002, 8, "08:00", "09:00");
    const existing = [reschedule(1, 5001, "14:00", "15:00", 7)];
    const newIntent = reschedule(2, 5002, "09:00", "10:00", 8);
    expect(
      wouldExtendExistingChain(newIntent, existing, [apptA, apptB]),
    ).toBe(false);
  });

  it("returns true when the new intent's destination overlaps an existing intent's source slot (cascade terminator)", () => {
    // Cascade: existing intent 1 vacates appt 5001's 11:00-12:00 slot
    // on tech 7. New intent: drop appt 5002 onto tech 7's 11:00-12:00
    // slot — i.e. exactly where the cascade left a hole. This is the
    // "chain terminator" case the PR-UX-3 session-stickiness branch
    // was designed to capture: linter-clean (no overlap with
    // committed cards) but joins the chain.
    const apptA = makeAppt(5001, 7, "11:00", "12:00");
    const apptB = makeAppt(5002, 7, "08:00", "09:00");
    const existing = [reschedule(1, 5001, "14:00", "15:00", 7)];
    const newIntent = reschedule(2, 5002, "11:00", "12:00", 7);
    expect(
      wouldExtendExistingChain(newIntent, existing, [apptA, apptB]),
    ).toBe(true);
  });

  it("returns true when an existing intent's destination overlaps the new intent's source slot (chain predecessor)", () => {
    // Mirror of the previous case: existing intent A's destination
    // lands on the slot the new intent's appointment is moving OUT
    // of. The trigger graph still forms an edge (A → newIntent), so
    // newIntent joins A's chain.
    const apptA = makeAppt(5001, 7, "08:00", "09:00");
    const apptB = makeAppt(5002, 7, "11:00", "12:00");
    const existing = [reschedule(1, 5001, "11:00", "12:00", 7)];
    const newIntent = reschedule(2, 5002, "13:00", "14:00", 7);
    expect(
      wouldExtendExistingChain(newIntent, existing, [apptA, apptB]),
    ).toBe(true);
  });

  it("returns false when the new intent forms its own solo chain inside its own ecosystem (the user's intent-980 case)", () => {
    // Repro of the user's on-device log: 6 existing chains, 25
    // intents, all on different (tech, time) slots from the new drop.
    // The new intent (intent 980 in the user's log) lands on a free
    // slot and shares no edges with any of the others. Expected:
    // false — solo seed in its own ecosystem.
    const apptA = makeAppt(5001, 7, "08:00", "09:00");
    const apptB = makeAppt(5002, 7, "10:00", "11:00");
    const apptC = makeAppt(5003, 8, "13:00", "14:00");
    const existing = [
      // A 2-step cascade on tech 7 (intents 1 → 2):
      reschedule(1, 5001, "10:00", "11:00", 7), // displaces 5002's source
      reschedule(2, 5002, "07:00", "08:00", 7), // terminator
    ];
    // New intent: drop appt 5003 onto tech 8's 09:00 slot — a
    // different tech from the cascade, no overlapping geometry.
    const newIntent = reschedule(3, 5003, "09:00", "10:00", 8);
    expect(
      wouldExtendExistingChain(newIntent, existing, [
        apptA,
        apptB,
        apptC,
      ]),
    ).toBe(false);
  });

  it("returns true for a non-chain-eligible kind (cancel) when its source slot completes a chain edge from an existing intent", () => {
    // Cancel intents project no DESTINATION slot, so they cannot
    // extend a chain via the "new dest overlaps existing source"
    // half. But they DO project a source slot (per
    // `projectIntentsToSourceSlots` in `detect-move-chains.ts`), so
    // an existing chain-eligible intent's destination overlapping
    // the cancel's source slot still forms a trigger edge — and the
    // detector's seed-walk follows that edge through the cancel, so
    // the cancel ends up as a member of the existing chain (the
    // walk adds nodes regardless of kind).
    //
    // Scenario: existing intent 1 reschedules appt 5001 INTO appt
    // 5002's 13:00-14:00 slot. New cancel: cancel appt 5002. Edge
    // formed (intent 1's dest = 13:00-14:00 overlaps cancel's
    // source = 13:00-14:00). Cancel becomes the terminator of
    // chain-1.
    //
    // For the submit-time gate this is the correct call — the user's
    // cancel IS related to the existing pending work and should be
    // staged into the session, not live-committed. The drag
    // callsites that consume `chainAppointments` only ever submit
    // reschedule/reassign though; cancel-sheet submits don't pass
    // the option, so this branch is mostly academic for v1.
    const apptA = makeAppt(5001, 7, "11:00", "12:00");
    const apptB = makeAppt(5002, 7, "13:00", "14:00");
    const existing = [reschedule(1, 5001, "13:00", "14:00", 7)];
    const newIntent = makeIntent(2, {
      appointment_id: 5002,
      payload: { kind: "cancel" },
    });
    expect(
      wouldExtendExistingChain(newIntent, existing, [apptA, apptB]),
    ).toBe(true);
  });

  it("returns false when the new intent and the existing one are on different days (date is part of the slot key)", () => {
    const apptA: LinterAppointment = {
      ...makeAppt(5001, 7, "11:00", "12:00"),
      scheduled_date: "2026-04-24",
    };
    const apptB: LinterAppointment = {
      ...makeAppt(5002, 7, "11:00", "12:00"),
      scheduled_date: "2026-04-25",
    };
    const existing = [
      {
        ...reschedule(1, 5001, "13:00", "14:00", 7),
        payload: {
          kind: "reschedule" as const,
          new_scheduled_date: "2026-04-24",
          new_start_time: "13:00",
          new_end_time: "14:00",
          new_technician_id: 7,
        },
      } as ReorganizationIntent,
    ];
    const newIntent = {
      ...reschedule(2, 5002, "13:00", "14:00", 7),
      payload: {
        kind: "reschedule" as const,
        new_scheduled_date: "2026-04-25",
        new_start_time: "13:00",
        new_end_time: "14:00",
        new_technician_id: 7,
      },
    } as ReorganizationIntent;
    expect(
      wouldExtendExistingChain(newIntent, existing, [apptA, apptB]),
    ).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// `detectChainToChainDestinationConflicts` (PR-UX-16, 2026-05-09).
//
// Detects pairs of pending intents whose DESTINATIONS land in the
// same calendar slot but belong to two DIFFERENT chains. Surfaced
// to the user via the `ChainToChainConflictToast` (mounted in the
// calendar tab root) which also sets `auxHighlightedChainIds` so
// both conflicting chains paint highlights / ghosts at once.
// ──────────────────────────────────────────────────────────────────

describe("detectChainToChainDestinationConflicts", () => {
  it("returns [] for an empty intent set", () => {
    expect(detectChainToChainDestinationConflicts([], [])).toEqual([]);
  });

  it("returns [] when only one intent is staged", () => {
    const apptA = makeAppt(5001, 7, "08:00", "09:00");
    expect(
      detectChainToChainDestinationConflicts(
        [reschedule(1, 5001, "10:00", "11:00", 7)],
        [apptA],
      ),
    ).toEqual([]);
  });

  it("returns [] when both intents are in the same chain (within-chain dest overlap is part of the chain itself)", () => {
    // intent 1's destination chains into intent 2's source — both
    // belong to chain-1. The within-chain overlap is by design (it's
    // what the chain detector USES to walk the chain). Per the
    // detector contract we omit same-chain pairs.
    const apptA = makeAppt(5001, 7, "08:00", "09:00");
    const apptB = makeAppt(5002, 7, "10:00", "11:00");
    const intents = [
      reschedule(1, 5001, "10:00", "11:00", 7), // A → B's source slot
      reschedule(2, 5002, "13:00", "14:00", 7), // B → free
    ];
    const conflicts = detectChainToChainDestinationConflicts(intents, [
      apptA,
      apptB,
    ]);
    expect(conflicts).toEqual([]);
  });

  it("detects two independent chains whose destinations land in the same (tech, date, time) slot", () => {
    // Chain A: intent 1 reschedules appt 5001 → 14:00 on tech 7.
    // Chain B: intent 2 reschedules appt 5002 → 14:00 on tech 7.
    // Both target the same slot; they belong to two different chains.
    const apptA = makeAppt(5001, 7, "08:00", "09:00");
    const apptB = makeAppt(5002, 7, "10:00", "11:00");
    const intents = [
      reschedule(1, 5001, "14:00", "15:00", 7),
      reschedule(2, 5002, "14:00", "15:00", 7),
    ];
    const conflicts = detectChainToChainDestinationConflicts(intents, [
      apptA,
      apptB,
    ]);
    expect(conflicts).toHaveLength(1);
    const [c] = conflicts;
    expect(c.intentAId).toBe(1);
    expect(c.intentBId).toBe(2);
    expect(c.chainAId).not.toBe(c.chainBId);
    expect(c.technician_id).toBe(7);
  });

  it("detects partial-overlap destinations (the slot doesn't have to match exactly — interval overlap is enough)", () => {
    const apptA = makeAppt(5001, 7, "08:00", "09:00");
    const apptB = makeAppt(5002, 7, "10:00", "11:00");
    const intents = [
      reschedule(1, 5001, "14:00", "15:00", 7), // 14:00-15:00
      reschedule(2, 5002, "14:30", "15:30", 7), // 14:30-15:30
    ];
    const conflicts = detectChainToChainDestinationConflicts(intents, [
      apptA,
      apptB,
    ]);
    expect(conflicts).toHaveLength(1);
  });

  it("ignores overlaps on DIFFERENT techs (chains can use the same time on different lanes)", () => {
    const apptA = makeAppt(5001, 7, "08:00", "09:00");
    const apptB = makeAppt(5002, 8, "10:00", "11:00");
    const intents = [
      reschedule(1, 5001, "14:00", "15:00", 7),
      reschedule(2, 5002, "14:00", "15:00", 8),
    ];
    expect(
      detectChainToChainDestinationConflicts(intents, [apptA, apptB]),
    ).toEqual([]);
  });

  it("returns conflict pairs in a deterministic order (chain ids sorted within each pair)", () => {
    const apptA = makeAppt(5001, 7, "08:00", "09:00");
    const apptB = makeAppt(5002, 7, "10:00", "11:00");
    const apptC = makeAppt(5003, 7, "12:00", "13:00");
    // Three independent chains all targeting the same slot — produces
    // 3 distinct pairs (1↔2, 1↔3, 2↔3). All sorted with chainLow
    // first within each pair.
    const intents = [
      reschedule(1, 5001, "14:00", "15:00", 7),
      reschedule(2, 5002, "14:00", "15:00", 7),
      reschedule(3, 5003, "14:00", "15:00", 7),
    ];
    const conflicts = detectChainToChainDestinationConflicts(intents, [
      apptA,
      apptB,
      apptC,
    ]);
    expect(conflicts).toHaveLength(3);
    for (const c of conflicts) {
      expect(c.chainAId < c.chainBId).toBe(true);
    }
  });
});
