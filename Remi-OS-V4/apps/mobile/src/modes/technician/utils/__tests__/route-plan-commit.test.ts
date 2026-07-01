/**
 * Tests for `commitPlanSequentially` (chunk B2-5 of the chip-bar
 * plan-mode batch reorganization feature; see
 * `docs/implementation-plans/chip-bar-plan-mode-batch.md`).
 *
 * Coverage:
 *   - Empty moves → no events, no work.
 *   - All succeed → idle-seed burst, then per-move inFlight →
 *     committed, succeededRowKeys = all, failedRowKey = null.
 *   - First fails → idle-seed, first inFlight → failed, nothing
 *     else fires, result tracks the failure.
 *   - Middle fails → first commits, second fails, third stays
 *     idle (no third inFlight event).
 *   - Last fails → all but last commit, last fails, succeededRowKeys
 *     includes the first two.
 *   - commitMove throws non-Error → message is stringified.
 *   - Sequencing is sequential, not parallel (next move's commitMove
 *     does NOT fire until prior resolves) — verified by capturing
 *     event order vs deferred promise resolution.
 *
 * All tests are pure — no React, no mutations, no timers. The
 * helper is a tiny async reducer; the tests just observe its
 * status reporter.
 */

import {
  commitPlanSequentially,
  type CommitRowStatus,
} from "../route-plan-commit";
import type { PlannedMove } from "../route-plan-moves";

// ─── Fixtures ──────────────────────────────────────────────────────

function swapMove(aStopId: number, bStopId: number): PlannedMove {
  return {
    kind: "swap",
    aStopId,
    bStopId,
    aNewStartHHMM: "09:00",
    bNewStartHHMM: "10:00",
    aWindow: { startHHMM: "08:00", endHHMM: "11:00" },
    bWindow: { startHHMM: "08:00", endHHMM: "11:00" },
    aDurationMinutes: 60,
    bDurationMinutes: 60,
  };
}

function insertMove(stopId: number, order: number): PlannedMove {
  return {
    kind: "insert",
    stopId,
    newStopOrder: order,
    newStartHHMM: "11:00",
    window: { startHHMM: "10:00", endHHMM: "14:00" },
    durationMinutes: 45,
  };
}

function rowKeyOf(m: PlannedMove): string {
  return m.kind === "swap"
    ? `swap:${m.aStopId}:${m.bStopId}`
    : `insert:${m.stopId}`;
}

interface StatusEvent {
  rowKey: string;
  status: CommitRowStatus;
}

function captureEvents() {
  const events: StatusEvent[] = [];
  return {
    events,
    onStatusChange: (rowKey: string, status: CommitRowStatus) => {
      events.push({ rowKey, status });
    },
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe("commitPlanSequentially", () => {
  it("empty moves → returns empty result without firing events", async () => {
    const { events, onStatusChange } = captureEvents();
    const commitMove = jest.fn().mockResolvedValue(undefined);

    const result = await commitPlanSequentially({
      moves: [],
      rowKeyOf,
      commitMove,
      onStatusChange,
    });

    expect(result).toEqual({
      succeededRowKeys: [],
      failedRowKey: null,
      stoppedAt: 0,
    });
    expect(events).toEqual([]);
    expect(commitMove).not.toHaveBeenCalled();
  });

  it("all succeed → seeds idle burst, then inFlight + committed per row", async () => {
    const moves = [swapMove(10, 20), insertMove(30, 3)];
    const { events, onStatusChange } = captureEvents();
    const commitMove = jest.fn().mockResolvedValue(undefined);

    const result = await commitPlanSequentially({
      moves,
      rowKeyOf,
      commitMove,
      onStatusChange,
    });

    expect(result).toEqual({
      succeededRowKeys: ["swap:10:20", "insert:30"],
      failedRowKey: null,
      stoppedAt: 2,
    });
    expect(commitMove).toHaveBeenCalledTimes(2);
    // Idle-seed burst comes first (both rows), then per-row
    // inFlight → committed in order.
    expect(events).toEqual([
      { rowKey: "swap:10:20", status: { kind: "idle" } },
      { rowKey: "insert:30", status: { kind: "idle" } },
      { rowKey: "swap:10:20", status: { kind: "inFlight" } },
      { rowKey: "swap:10:20", status: { kind: "committed" } },
      { rowKey: "insert:30", status: { kind: "inFlight" } },
      { rowKey: "insert:30", status: { kind: "committed" } },
    ]);
  });

  it("first move fails → only first inFlight + failed, second never fires", async () => {
    const moves = [swapMove(10, 20), insertMove(30, 3)];
    const { events, onStatusChange } = captureEvents();
    const commitMove = jest
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(undefined);

    const result = await commitPlanSequentially({
      moves,
      rowKeyOf,
      commitMove,
      onStatusChange,
    });

    expect(result).toEqual({
      succeededRowKeys: [],
      failedRowKey: "swap:10:20",
      stoppedAt: 0,
    });
    expect(commitMove).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      { rowKey: "swap:10:20", status: { kind: "idle" } },
      { rowKey: "insert:30", status: { kind: "idle" } },
      { rowKey: "swap:10:20", status: { kind: "inFlight" } },
      { rowKey: "swap:10:20", status: { kind: "failed", message: "boom" } },
    ]);
  });

  it("middle move fails → first commits, second fails, third stays idle", async () => {
    const moves = [swapMove(10, 20), insertMove(30, 3), insertMove(40, 4)];
    const { events, onStatusChange } = captureEvents();
    const commitMove = jest
      .fn<Promise<void>, [PlannedMove]>()
      .mockImplementation((m) => {
        if (m.kind === "insert" && m.stopId === 30) {
          return Promise.reject(new Error("conflict"));
        }
        return Promise.resolve();
      });

    const result = await commitPlanSequentially({
      moves,
      rowKeyOf,
      commitMove,
      onStatusChange,
    });

    expect(result).toEqual({
      succeededRowKeys: ["swap:10:20"],
      failedRowKey: "insert:30",
      stoppedAt: 1,
    });
    expect(commitMove).toHaveBeenCalledTimes(2);
    // Third row should NOT have received an inFlight event — its
    // only event is the initial idle seed.
    const thirdEvents = events.filter((e) => e.rowKey === "insert:40");
    expect(thirdEvents).toEqual([
      { rowKey: "insert:40", status: { kind: "idle" } },
    ]);
    // Second row should have inFlight then failed.
    const secondEvents = events.filter((e) => e.rowKey === "insert:30");
    expect(secondEvents).toEqual([
      { rowKey: "insert:30", status: { kind: "idle" } },
      { rowKey: "insert:30", status: { kind: "inFlight" } },
      {
        rowKey: "insert:30",
        status: { kind: "failed", message: "conflict" },
      },
    ]);
  });

  it("last move fails → succeededRowKeys includes the first two", async () => {
    const moves = [swapMove(10, 20), insertMove(30, 3), insertMove(40, 4)];
    const { onStatusChange } = captureEvents();
    const commitMove = jest
      .fn<Promise<void>, [PlannedMove]>()
      .mockImplementation((m) => {
        if (m.kind === "insert" && m.stopId === 40) {
          return Promise.reject(new Error("nope"));
        }
        return Promise.resolve();
      });

    const result = await commitPlanSequentially({
      moves,
      rowKeyOf,
      commitMove,
      onStatusChange,
    });

    expect(result).toEqual({
      succeededRowKeys: ["swap:10:20", "insert:30"],
      failedRowKey: "insert:40",
      stoppedAt: 2,
    });
  });

  it("commitMove throws non-Error → message is stringified", async () => {
    const moves = [swapMove(10, 20)];
    const { events, onStatusChange } = captureEvents();
    // eslint-disable-next-line prefer-promise-reject-errors
    const commitMove = jest.fn().mockRejectedValue("bare string");

    const result = await commitPlanSequentially({
      moves,
      rowKeyOf,
      commitMove,
      onStatusChange,
    });

    expect(result.failedRowKey).toBe("swap:10:20");
    const failedEvent = events.find(
      (e) => e.rowKey === "swap:10:20" && e.status.kind === "failed",
    );
    expect(failedEvent?.status).toEqual({
      kind: "failed",
      message: "bare string",
    });
  });

  it("walks sequentially — next move's commitMove does not fire until prior resolves", async () => {
    const moves = [swapMove(10, 20), insertMove(30, 3)];
    const { events, onStatusChange } = captureEvents();

    // Manual gate for the first move so we can observe what
    // happens BEFORE it resolves. If sequencing is parallel, the
    // second move's inFlight would fire while we're still holding
    // the first's promise.
    let resolveFirst: (() => void) | null = null;
    const firstPromise = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const commitMove = jest
      .fn<Promise<void>, [PlannedMove]>()
      .mockImplementationOnce(() => firstPromise)
      .mockResolvedValueOnce(undefined);

    const walkPromise = commitPlanSequentially({
      moves,
      rowKeyOf,
      commitMove,
      onStatusChange,
    });

    // Yield so the helper has a chance to fire whatever's pending.
    await Promise.resolve();
    await Promise.resolve();

    // At this point ONLY the first move's inFlight should have
    // fired. The second move's inFlight has not.
    const inFlightSoFar = events.filter((e) => e.status.kind === "inFlight");
    expect(inFlightSoFar).toEqual([
      { rowKey: "swap:10:20", status: { kind: "inFlight" } },
    ]);
    expect(commitMove).toHaveBeenCalledTimes(1);

    // Release the first move; walk completes.
    resolveFirst?.();
    const result = await walkPromise;
    expect(result.succeededRowKeys).toEqual(["swap:10:20", "insert:30"]);
    expect(commitMove).toHaveBeenCalledTimes(2);
  });
});
