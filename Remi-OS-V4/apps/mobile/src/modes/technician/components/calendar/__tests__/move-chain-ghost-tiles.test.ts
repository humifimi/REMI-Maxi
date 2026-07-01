/**
 * Unit tests for the move-chain ghost-tile primitives (PR-UX-2 PASS 2).
 *
 * The hook itself (`useResourcesWithMoveChainGhosts`) is exercised
 * in-app by the calendar wrappers; here we cover the pure helpers
 * (`buildGhostEvent`, `isMoveChainGhostEventId`, `getMoveChainGhostMeta`,
 * `moveChainGhostEventIdFor`) plus the injector's selection-scoping
 * contract by composing it through the resolver.
 */

import { renderHook } from "@testing-library/react-native";
import type { Resource, Event as RCEvent } from "react-native-resource-calendar";

import {
  buildGhostEvent,
  getMoveChainGhostMeta,
  intentIdFromGhostEventId,
  isMoveChainGhostEventId,
  moveChainGhostEventIdFor,
  useResourcesWithMoveChainGhosts,
} from "@technician/components/calendar/move-chain-ghost-tiles";
import { detectMoveChains } from "@technician/utils/detect-move-chains";
import type { MoveChainDestSlot } from "@technician/utils/detect-move-chains";
import type { LinterAppointment } from "@technician/utils/logistics-linter";
import type { ReorganizationIntent } from "@technician/types/reorganization";
import { makeIntent } from "@technician/stores/__fixtures__/pending-reality";

const SLOT: MoveChainDestSlot = {
  intent_id: 42,
  chain_id: "chain-1",
  step_color: "#3B82F6",
  appointment_id: 100,
  technician_id: 7,
  date: "2026-04-24",
  startMin: 9 * 60,
  endMin: 10 * 60,
};

describe("moveChainGhostEventIdFor", () => {
  it("returns a unique large-magnitude negative id derived from the intent id", () => {
    expect(moveChainGhostEventIdFor(1)).toBe(-1_000_001);
    expect(moveChainGhostEventIdFor(42)).toBe(-1_000_042);
  });

  it("never collides with the existing draft synthetic id (-1)", () => {
    expect(moveChainGhostEventIdFor(0)).not.toBe(-1);
    expect(moveChainGhostEventIdFor(0)).toBeLessThan(-1);
  });
});

describe("isMoveChainGhostEventId", () => {
  it("identifies ghost ids", () => {
    expect(isMoveChainGhostEventId(moveChainGhostEventIdFor(1))).toBe(true);
    expect(isMoveChainGhostEventId(-1_000_000)).toBe(true);
  });

  it("rejects normal positive appointment ids", () => {
    expect(isMoveChainGhostEventId(1)).toBe(false);
    expect(isMoveChainGhostEventId(999_999)).toBe(false);
  });

  it("rejects the draft synthetic id (-1)", () => {
    expect(isMoveChainGhostEventId(-1)).toBe(false);
  });

  it("rejects nullish or non-numeric ids", () => {
    expect(isMoveChainGhostEventId(undefined)).toBe(false);
    expect(isMoveChainGhostEventId(null)).toBe(false);
    expect(isMoveChainGhostEventId("ghost-1" as unknown as number)).toBe(false);
  });
});

describe("intentIdFromGhostEventId", () => {
  it("round-trips a ghost id back to its underlying intent id", () => {
    expect(intentIdFromGhostEventId(moveChainGhostEventIdFor(1))).toBe(1);
    expect(intentIdFromGhostEventId(moveChainGhostEventIdFor(42))).toBe(42);
    expect(intentIdFromGhostEventId(moveChainGhostEventIdFor(9999))).toBe(9999);
  });

  it("returns null for non-ghost ids", () => {
    expect(intentIdFromGhostEventId(1)).toBeNull();
    expect(intentIdFromGhostEventId(-1)).toBeNull();
    expect(intentIdFromGhostEventId(0)).toBeNull();
    expect(intentIdFromGhostEventId(undefined)).toBeNull();
    expect(intentIdFromGhostEventId(null)).toBeNull();
  });
});

describe("buildGhostEvent", () => {
  it("emits an event keyed to the slot's destination tech + date + time window", () => {
    const event = buildGhostEvent(SLOT);
    expect(event).toMatchObject({
      id: -1_000_042,
      resourceId: 7,
      date: "2026-04-24",
      from: 540,
      to: 600,
    });
  });

  it("attaches the move-chain ghost meta so the style override picks it up", () => {
    const event = buildGhostEvent(SLOT);
    const meta = getMoveChainGhostMeta(event);
    expect(meta).toEqual({
      isMoveChainGhost: true,
      chainId: "chain-1",
      stepColor: "#3B82F6",
      intentId: 42,
    });
  });
});

describe("getMoveChainGhostMeta", () => {
  it("returns null for events with no meta", () => {
    expect(
      getMoveChainGhostMeta({
        id: 1,
        resourceId: 1,
        date: "2026-04-24",
        from: 0,
        to: 60,
      } as Parameters<typeof getMoveChainGhostMeta>[0]),
    ).toBeNull();
  });

  it("returns null for non-ghost events even when meta exists", () => {
    expect(
      getMoveChainGhostMeta({
        id: 1,
        resourceId: 1,
        date: "2026-04-24",
        from: 0,
        to: 60,
        meta: { isDraft: true },
      } as Parameters<typeof getMoveChainGhostMeta>[0]),
    ).toBeNull();
  });

  it("returns null when meta exists but required fields are malformed", () => {
    expect(
      getMoveChainGhostMeta({
        id: 1,
        resourceId: 1,
        date: "2026-04-24",
        from: 0,
        to: 60,
        meta: { isMoveChainGhost: true },
      } as Parameters<typeof getMoveChainGhostMeta>[0]),
    ).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// PR-UX-3 (2026-05-07): `activeTechId` filter behavior on the hook.
//
// The PR-UX-2 single-tech chain rendered correctly in workweek view
// even without the explicit filter (because `slotsByTech.get(r.id)`
// only matched the visible tech). The PR-UX-3 multi-tech chain has
// destinations on multiple techs simultaneously; passing
// `activeTechId === workweek's pinned tech` keeps only the active
// tech's ghosts and prevents off-tech ghosts from leaking via any
// future code path that maps against multiple resources. See
// `pr-ux-3-multi-tech-handoff.md` §1.A6 for the design contract.
// ─────────────────────────────────────────────────────────────────────

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

interface ResourceWithEvents extends Resource {
  events: RCEvent[];
}

function makeResource(techId: number): ResourceWithEvents {
  return { id: techId, name: `T${techId}`, events: [] };
}

function ghostCount(resource: ResourceWithEvents): number {
  return resource.events.filter((e) => isMoveChainGhostEventId(e.id)).length;
}

describe("useResourcesWithMoveChainGhosts — activeTechId filter (PR-UX-3 §1.A6)", () => {
  // Build a 2-step cross-tech chain on TECH_A → TECH_B (mirrors a
  // single hop in the locked PR-UX-3 sequence). Step 0 source on A,
  // dest on B; step 1 source on B, dest on A. So the chain has one
  // ghost destination on each of the two techs.
  function build2HopChain() {
    const apptOnA = makeAppt(101, TECH_A, "08:00", "09:00");
    const apptOnB = makeAppt(102, TECH_B, "10:00", "11:00");
    // Intent 1: move apptOnA into apptOnB's slot (dest = TECH_B).
    const intent1 = reschedule(1, 101, DEMO_DATE, "10:00", "11:00", TECH_B);
    // Intent 2: move apptOnB to TECH_A at a third slot (dest = TECH_A).
    const intent2 = reschedule(2, 102, DEMO_DATE, "13:00", "14:00", TECH_A);
    const intents = [intent1, intent2];
    const appts = [apptOnA, apptOnB];
    const graph = detectMoveChains(intents, appts);
    expect(graph.chains).toHaveLength(1);
    return { intents, appts, graph, chainId: graph.chains[0]!.id };
  }

  it("paints both techs' ghosts when activeTechId is undefined (legacy day-view contract)", () => {
    const { intents, appts, graph, chainId } = build2HopChain();
    const resources: ResourceWithEvents[] = [
      makeResource(TECH_A),
      makeResource(TECH_B),
      makeResource(TECH_C),
    ];
    const { result } = renderHook(() =>
      useResourcesWithMoveChainGhosts(
        resources,
        graph,
        intents,
        appts,
        chainId,
        // chainStepHighlights = full prefix (matches the chip-tap
        // path which seeds [0..N-1]).
        [0, 1],
      ),
    );
    const techA = result.current.find((r) => r.id === TECH_A)!;
    const techB = result.current.find((r) => r.id === TECH_B)!;
    const techC = result.current.find((r) => r.id === TECH_C)!;
    // Step 0's dest is on TECH_B; step 1's dest is on TECH_A.
    expect(ghostCount(techA)).toBe(1);
    expect(ghostCount(techB)).toBe(1);
    expect(ghostCount(techC)).toBe(0);
  });

  it("paints ONLY activeTechId's ghosts when filter is engaged (workweek contract)", () => {
    const { intents, appts, graph, chainId } = build2HopChain();
    const resources: ResourceWithEvents[] = [
      makeResource(TECH_A),
      // Workweek view passes a single resource here; we simulate the
      // landscape/multi-tech case where additional resources exist
      // but the hook should still suppress non-active-tech ghosts.
      makeResource(TECH_B),
    ];
    const { result } = renderHook(() =>
      useResourcesWithMoveChainGhosts(
        resources,
        graph,
        intents,
        appts,
        chainId,
        [0, 1],
        TECH_A, // <-- active tech filter
      ),
    );
    const techA = result.current.find((r) => r.id === TECH_A)!;
    const techB = result.current.find((r) => r.id === TECH_B)!;
    expect(ghostCount(techA)).toBe(1);
    expect(ghostCount(techB)).toBe(0);
  });

  it("returns the same resources reference when no chain destinations exist for the active tech", () => {
    const { intents, appts, graph, chainId } = build2HopChain();
    const resources: ResourceWithEvents[] = [makeResource(TECH_A)];
    const { result } = renderHook(() =>
      useResourcesWithMoveChainGhosts(
        resources,
        graph,
        intents,
        appts,
        chainId,
        [0, 1],
        TECH_C, // a tech with NO chain destinations
      ),
    );
    // Pure short-circuit — same array reference passed through.
    expect(result.current).toBe(resources);
  });

  it("preserves PR-UX-2 single-tech behavior when activeTechId === every slot's tech", () => {
    // 1-step single-tech chain — verifies the filter doesn't suppress
    // the ghost when it shouldn't.
    const apptSrc = makeAppt(201, TECH_A, "10:00", "11:00");
    const intent = reschedule(10, 201, DEMO_DATE, "13:00", "14:00", TECH_A);
    const graph = detectMoveChains([intent], [apptSrc]);
    const resources: ResourceWithEvents[] = [makeResource(TECH_A)];
    const { result } = renderHook(() =>
      useResourcesWithMoveChainGhosts(
        resources,
        graph,
        [intent],
        [apptSrc],
        graph.chains[0]!.id,
        [0],
        TECH_A,
      ),
    );
    expect(ghostCount(result.current[0]!)).toBe(1);
  });
});
