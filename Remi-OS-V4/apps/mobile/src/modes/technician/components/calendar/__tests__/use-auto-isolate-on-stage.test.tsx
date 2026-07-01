/**
 * Unit tests for `useAutoIsolateOnStage` (PR-UX-3 follow-up #4,
 * 2026-05-08 — bug #2 of the parent task report).
 *
 * Pins the contract:
 *
 *   1. First-run-after-mount with non-empty intents → snapshots,
 *      DOES NOT call `setSelectedChainId`. (Don't auto-isolate to
 *      pre-existing intents on cold mount.)
 *
 *   2. Stage event = a NEW intent id appears in the next render →
 *      `setSelectedChainId(chainOfNewIntent, totalSteps)` fires
 *      exactly ONCE.
 *
 *   3. Idempotent — when `selectedChainId` is already that chain,
 *      no re-call.
 *
 *   4. Multiple new ids in one tick (e.g. dev seed batch path) →
 *      isolate the highest id (BE assigns monotonically; the
 *      newest is the just-staged one).
 *
 *   5. New intent isn't in the graph yet (`intentToChainId.get`
 *      returns undefined — happens during the brief loading
 *      window before `weekData` resolves) → bail silently. The
 *      next render after the graph picks up the intent will
 *      retry.
 *
 *   6. Removal-only updates (intent disappeared) → no re-fire of
 *      `setSelectedChainId`. The store's existing "clear on
 *      removal" branch handles that case.
 */

import React from "react";
import TestRenderer, { act } from "react-test-renderer";

import { useAutoIsolateOnStage } from "@technician/components/calendar/use-auto-isolate-on-stage";
import type { MoveChain, MoveChainGraph } from "@technician/utils/detect-move-chains";
import type { ReorganizationIntent } from "@technician/types/reorganization";

function makeIntent(id: number): ReorganizationIntent {
  return {
    id,
    intent_type: "reschedule",
    appointment_id: 9000 + id,
    personal_event_id: null,
    payload: {
      kind: "reschedule",
      new_scheduled_date: "2026-05-08",
      new_start_time: "09:00:00",
      new_end_time: "10:00:00",
      new_technician_id: 1,
    },
    proposed_at: "2026-05-08T09:00:00Z",
    proposed_by: 1,
    session_id: 1,
  } as unknown as ReorganizationIntent;
}

function makeChain(id: string, intentIds: number[]): MoveChain {
  return {
    id,
    seedIntentId: intentIds[0]!,
    intentIds,
    color: "#DC2626",
    stepColors: intentIds.map(() => "#DC2626"),
    ecosystemId: id.replace("chain-", "eco-"),
  };
}

function makeGraph(chains: MoveChain[]): MoveChainGraph {
  const intentToChainId = new Map<number, string>();
  for (const chain of chains) {
    for (const id of chain.intentIds) intentToChainId.set(id, chain.id);
  }
  return {
    chains,
    ecosystems: chains.map((c) => ({
      id: c.ecosystemId,
      chainIds: [c.id],
    })),
    intentToChainId,
  };
}

interface ProbeProps {
  intents: readonly ReorganizationIntent[];
  graph: MoveChainGraph;
  selectedChainId: string | null;
  chainStepHighlights?: readonly number[];
  setSelectedChainId: (id: string | null, totalSteps?: number) => void;
  setChainStepHighlights?: (next: readonly number[]) => void;
}

function Probe(props: ProbeProps) {
  useAutoIsolateOnStage({
    intents: props.intents,
    graph: props.graph,
    selectedChainId: props.selectedChainId,
    chainStepHighlights: props.chainStepHighlights ?? [],
    setSelectedChainId: props.setSelectedChainId,
    setChainStepHighlights: props.setChainStepHighlights ?? (() => {}),
  });
  return null;
}

describe("useAutoIsolateOnStage", () => {
  it("first run with non-empty intents: snapshots, does NOT call setSelectedChainId", () => {
    const setSelectedChainId = jest.fn();
    const intents = [makeIntent(1), makeIntent(2)];
    const graph = makeGraph([makeChain("chain-1", [1, 2])]);
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(Probe, {
          intents,
          graph,
          selectedChainId: null,
          setSelectedChainId,
        }),
      );
    });
    expect(setSelectedChainId).not.toHaveBeenCalled();
    act(() => {
      renderer?.unmount();
    });
  });

  it("stage event (new intent appears): calls setSelectedChainId(chainOfNewIntent, totalSteps) ONCE", () => {
    const setSelectedChainId = jest.fn();
    const intents1 = [makeIntent(1), makeIntent(2)];
    const graph1 = makeGraph([makeChain("chain-1", [1, 2])]);
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(Probe, {
          intents: intents1,
          graph: graph1,
          selectedChainId: null,
          setSelectedChainId,
        }),
      );
    });
    // First run snapshots only — no call yet.
    expect(setSelectedChainId).not.toHaveBeenCalled();

    // Stage a new intent: id 3, joins chain-1 as a 3-step cascade.
    const intents2 = [...intents1, makeIntent(3)];
    const graph2 = makeGraph([makeChain("chain-1", [1, 2, 3])]);
    act(() => {
      renderer?.update(
        React.createElement(Probe, {
          intents: intents2,
          graph: graph2,
          selectedChainId: null,
          setSelectedChainId,
        }),
      );
    });
    expect(setSelectedChainId).toHaveBeenCalledTimes(1);
    expect(setSelectedChainId).toHaveBeenCalledWith("chain-1", 3);

    act(() => {
      renderer?.unmount();
    });
  });

  it("staging extends a different chain → switches isolation to the new chain", () => {
    const setSelectedChainId = jest.fn();
    const intents1 = [makeIntent(1), makeIntent(2)];
    const graph1 = makeGraph([
      makeChain("chain-1", [1]),
      makeChain("chain-2", [2]),
    ]);
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(Probe, {
          intents: intents1,
          graph: graph1,
          // User had Chain 1 isolated.
          selectedChainId: "chain-1",
          setSelectedChainId,
        }),
      );
    });

    // Stage intent 5 — joins chain-2 (existing isolation should
    // switch to it).
    const intents2 = [...intents1, makeIntent(5)];
    const graph2 = makeGraph([
      makeChain("chain-1", [1]),
      makeChain("chain-2", [2, 5]),
    ]);
    act(() => {
      renderer?.update(
        React.createElement(Probe, {
          intents: intents2,
          graph: graph2,
          selectedChainId: "chain-1",
          setSelectedChainId,
        }),
      );
    });
    expect(setSelectedChainId).toHaveBeenCalledTimes(1);
    expect(setSelectedChainId).toHaveBeenCalledWith("chain-2", 2);

    act(() => {
      renderer?.unmount();
    });
  });

  it("idempotent: already isolated to the new intent's chain → no call", () => {
    const setSelectedChainId = jest.fn();
    const intents1 = [makeIntent(1)];
    const graph1 = makeGraph([makeChain("chain-1", [1])]);
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(Probe, {
          intents: intents1,
          graph: graph1,
          selectedChainId: "chain-1",
          setSelectedChainId,
        }),
      );
    });

    // Stage intent 2 — extends chain-1. Already isolated to chain-1
    // → no setSelectedChainId call (idempotency check).
    const intents2 = [...intents1, makeIntent(2)];
    const graph2 = makeGraph([makeChain("chain-1", [1, 2])]);
    act(() => {
      renderer?.update(
        React.createElement(Probe, {
          intents: intents2,
          graph: graph2,
          selectedChainId: "chain-1",
          setSelectedChainId,
        }),
      );
    });
    expect(setSelectedChainId).not.toHaveBeenCalled();

    act(() => {
      renderer?.unmount();
    });
  });

  it("multiple new ids at once: isolates the highest id's chain (newest stage)", () => {
    const setSelectedChainId = jest.fn();
    const intents1 = [makeIntent(1)];
    const graph1 = makeGraph([makeChain("chain-1", [1])]);
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(Probe, {
          intents: intents1,
          graph: graph1,
          selectedChainId: null,
          setSelectedChainId,
        }),
      );
    });

    // Three new intents in one tick (e.g., dev seed batch). The
    // hook should isolate the HIGHEST id's chain (most recent
    // stage in chronological order).
    const intents2 = [
      makeIntent(1),
      makeIntent(5),
      makeIntent(7),
      makeIntent(9),
    ];
    const graph2 = makeGraph([
      makeChain("chain-1", [1]),
      makeChain("chain-5", [5]),
      makeChain("chain-7", [7]),
      makeChain("chain-9", [9]),
    ]);
    act(() => {
      renderer?.update(
        React.createElement(Probe, {
          intents: intents2,
          graph: graph2,
          selectedChainId: null,
          setSelectedChainId,
        }),
      );
    });
    expect(setSelectedChainId).toHaveBeenCalledTimes(1);
    expect(setSelectedChainId).toHaveBeenCalledWith("chain-9", 1);

    act(() => {
      renderer?.unmount();
    });
  });

  it("new intent not yet in graph (loading-window race): bails silently", () => {
    const setSelectedChainId = jest.fn();
    const intents1 = [makeIntent(1)];
    const graph1 = makeGraph([makeChain("chain-1", [1])]);
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(Probe, {
          intents: intents1,
          graph: graph1,
          selectedChainId: null,
          setSelectedChainId,
        }),
      );
    });

    // Stage intent 2, but the graph hasn't been re-derived yet so
    // it doesn't appear in `intentToChainId`. (Concretely: graph
    // is the OLD graph keyed only on intent 1; intents array
    // already has both. The day-view's `useMoveChainGraph` picks
    // up the change on the next render once `weekData` lands.)
    const intents2 = [...intents1, makeIntent(2)];
    act(() => {
      renderer?.update(
        React.createElement(Probe, {
          intents: intents2,
          graph: graph1, // <-- stale graph, intent 2 not in intentToChainId
          selectedChainId: null,
          setSelectedChainId,
        }),
      );
    });
    expect(setSelectedChainId).not.toHaveBeenCalled();

    // Next render: graph catches up. Now isolate fires.
    const graph2 = makeGraph([makeChain("chain-1", [1]), makeChain("chain-2", [2])]);
    act(() => {
      renderer?.update(
        React.createElement(Probe, {
          intents: intents2,
          graph: graph2,
          selectedChainId: null,
          setSelectedChainId,
        }),
      );
    });
    expect(setSelectedChainId).toHaveBeenCalledTimes(1);
    expect(setSelectedChainId).toHaveBeenCalledWith("chain-2", 1);

    act(() => {
      renderer?.unmount();
    });
  });

  it("removal-only update (intent disappeared): no setSelectedChainId call", () => {
    const setSelectedChainId = jest.fn();
    const intents1 = [makeIntent(1), makeIntent(2)];
    const graph1 = makeGraph([
      makeChain("chain-1", [1]),
      makeChain("chain-2", [2]),
    ]);
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(Probe, {
          intents: intents1,
          graph: graph1,
          selectedChainId: "chain-1",
          setSelectedChainId,
        }),
      );
    });

    // Remove intent 2 (e.g. user deletes it from the review
    // screen). Store's `removeIntent` clears selectedChainId on
    // its own; this hook MUST NOT re-set it.
    const intents2 = [makeIntent(1)];
    const graph2 = makeGraph([makeChain("chain-1", [1])]);
    act(() => {
      renderer?.update(
        React.createElement(Probe, {
          intents: intents2,
          graph: graph2,
          selectedChainId: null,
          setSelectedChainId,
        }),
      );
    });
    expect(setSelectedChainId).not.toHaveBeenCalled();

    act(() => {
      renderer?.unmount();
    });
  });

  // ──────────────────────────────────────────────────────────────
  // PLAN-DEVIATION 2026-05-12-autoisolate-grow-spotlight:
  // when a new intent extends the currently-isolated chain AND
  // highlights look like a "full prefix" of the prior step count,
  // the hook expands the highlights to the new full prefix. Pre-fix
  // the same-chain branch short-circuited and the spotlight stayed
  // capped at the chain-was-first-isolated length, so subsequent
  // cascade steps painted dim.
  // ──────────────────────────────────────────────────────────────
  it("grows chainStepHighlights when the selected chain gets a new step AND highlights are full-prefix", () => {
    const setSelectedChainId = jest.fn();
    const setChainStepHighlights = jest.fn();

    const intents1 = [makeIntent(1), makeIntent(2)];
    const graph1 = makeGraph([makeChain("chain-1", [1, 2])]);
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(Probe, {
          intents: intents1,
          graph: graph1,
          selectedChainId: "chain-1",
          chainStepHighlights: [0, 1], // full prefix at total=2
          setSelectedChainId,
          setChainStepHighlights,
        }),
      );
    });
    // First-run-after-mount snapshot.
    expect(setSelectedChainId).not.toHaveBeenCalled();
    expect(setChainStepHighlights).not.toHaveBeenCalled();

    // Stage intent 3 → chain-1 now has 3 steps. Highlights were
    // [0, 1] which is the full prefix at total=2; the hook should
    // expand them to [0, 1, 2].
    const intents2 = [...intents1, makeIntent(3)];
    const graph2 = makeGraph([makeChain("chain-1", [1, 2, 3])]);
    act(() => {
      renderer?.update(
        React.createElement(Probe, {
          intents: intents2,
          graph: graph2,
          selectedChainId: "chain-1",
          chainStepHighlights: [0, 1],
          setSelectedChainId,
          setChainStepHighlights,
        }),
      );
    });
    // `setSelectedChainId` is NOT called — already isolated.
    expect(setSelectedChainId).not.toHaveBeenCalled();
    // `setChainStepHighlights` IS called with the expanded prefix.
    expect(setChainStepHighlights).toHaveBeenCalledTimes(1);
    expect(setChainStepHighlights).toHaveBeenCalledWith([0, 1, 2]);

    act(() => {
      renderer?.unmount();
    });
  });

  it("does NOT grow chainStepHighlights when the user has narrowed the spotlight to a specific step pair", () => {
    // User tapped a dot to focus a step pair (e.g., [1, 2]). The
    // spotlight is narrower than full prefix; growing it would
    // reverse their explicit choice. The hook must leave it alone.
    const setSelectedChainId = jest.fn();
    const setChainStepHighlights = jest.fn();

    const intents1 = [makeIntent(1), makeIntent(2), makeIntent(3)];
    const graph1 = makeGraph([makeChain("chain-1", [1, 2, 3])]);
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(Probe, {
          intents: intents1,
          graph: graph1,
          selectedChainId: "chain-1",
          chainStepHighlights: [1, 2], // narrower than full prefix
          setSelectedChainId,
          setChainStepHighlights,
        }),
      );
    });

    const intents2 = [...intents1, makeIntent(4)];
    const graph2 = makeGraph([makeChain("chain-1", [1, 2, 3, 4])]);
    act(() => {
      renderer?.update(
        React.createElement(Probe, {
          intents: intents2,
          graph: graph2,
          selectedChainId: "chain-1",
          chainStepHighlights: [1, 2],
          setSelectedChainId,
          setChainStepHighlights,
        }),
      );
    });
    expect(setSelectedChainId).not.toHaveBeenCalled();
    expect(setChainStepHighlights).not.toHaveBeenCalled();

    act(() => {
      renderer?.unmount();
    });
  });

  it("does NOT grow chainStepHighlights when highlights are empty (user explicitly dimmed everything)", () => {
    // Empty spotlight = user toggled the last dot back to all-dim.
    // Reviving the chain visualization on auto-isolate growth would
    // reverse their explicit dim action.
    const setSelectedChainId = jest.fn();
    const setChainStepHighlights = jest.fn();

    const intents1 = [makeIntent(1)];
    const graph1 = makeGraph([makeChain("chain-1", [1])]);
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(Probe, {
          intents: intents1,
          graph: graph1,
          selectedChainId: "chain-1",
          chainStepHighlights: [], // explicitly all-dim
          setSelectedChainId,
          setChainStepHighlights,
        }),
      );
    });

    const intents2 = [...intents1, makeIntent(2)];
    const graph2 = makeGraph([makeChain("chain-1", [1, 2])]);
    act(() => {
      renderer?.update(
        React.createElement(Probe, {
          intents: intents2,
          graph: graph2,
          selectedChainId: "chain-1",
          chainStepHighlights: [],
          setSelectedChainId,
          setChainStepHighlights,
        }),
      );
    });
    expect(setSelectedChainId).not.toHaveBeenCalled();
    expect(setChainStepHighlights).not.toHaveBeenCalled();

    act(() => {
      renderer?.unmount();
    });
  });

  it("unmount + remount: snapshot resets, doesn't auto-isolate to pre-existing intents", () => {
    // The user navigates to /pending-reality/review (day view
    // unmounts) and back (day view remounts). The remount sees
    // the existing intents as a "first run" — DON'T auto-isolate
    // to the highest pre-existing id.
    const setSelectedChainId = jest.fn();
    const intents = [makeIntent(1), makeIntent(2), makeIntent(3)];
    const graph = makeGraph([makeChain("chain-1", [1, 2, 3])]);

    // Mount once.
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(Probe, {
          intents,
          graph,
          selectedChainId: null,
          setSelectedChainId,
        }),
      );
    });
    expect(setSelectedChainId).not.toHaveBeenCalled();

    // Unmount.
    act(() => {
      renderer?.unmount();
    });

    // Mount again with the same intents (simulates nav back).
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(Probe, {
          intents,
          graph,
          selectedChainId: null,
          setSelectedChainId,
        }),
      );
    });
    // First-run-after-mount snapshot. Even though the prev-ref
    // value from the previous mount lifecycle is gone, the
    // mount-fresh ref is null again so we skip.
    expect(setSelectedChainId).not.toHaveBeenCalled();

    act(() => {
      renderer?.unmount();
    });
  });
});
