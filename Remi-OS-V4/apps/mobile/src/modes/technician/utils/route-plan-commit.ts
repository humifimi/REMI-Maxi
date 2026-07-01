/**
 * PLAN-DEVIATION: 2026-05-22-chip-bar-plan-mode-batch — sequential
 * client-side commit pipeline (await + invalidate + read between each
 * mutation) replaces the snap-zone plan's per-drop one-shot path. See
 * docs/PLAN-DEVIATIONS.md#2026-05-22-chip-bar-plan-mode-batch.
 *
 * Route plan-mode commit pipeline (chunk B2-5 of the chip-bar
 * plan-mode batch reorganization feature; see
 * `docs/implementation-plans/chip-bar-plan-mode-batch.md`).
 *
 * Pure async helper that walks a list of planned moves in order,
 * awaiting an async `commitMove` callback for each one, and reports
 * per-row status transitions via `onStatusChange`. Stops on the
 * first failure, leaving subsequent moves un-attempted so the
 * dispatcher can edit or retry without a half-applied plan.
 *
 * Kept React-free and mutation-free so the sequencing logic gets
 * direct Jest coverage independent of the parent franchise-route-map
 * component (whose existing test file is blocked on an unrelated
 * QueryClient setup gap) and independent of the TanStack mutation
 * shapes themselves — the parent's commit handler is the only thing
 * that needs to know how to translate a `PlannedMove` into a
 * `swapMutation` / `repositionMutation` call.
 *
 * Staleness is NOT handled here — the parent pre-filters stale
 * moves before calling this helper. Stale rows in the review sheet
 * stay visible with their "no longer in route" hint but are skipped
 * silently from the commit walk; their `status` stays `idle` for
 * the duration. Centralizing stale-detection in the parent keeps
 * this helper's interface small and avoids leaking the chip-pending-
 * stops dependency in here.
 */

import type { PlannedMove } from "@technician/utils/route-plan-moves";

/**
 * Lifecycle for a single review-sheet row during the commit pipeline.
 *
 * Discriminated so the sheet's status badge can render exactly one
 * thing per row without branching on multiple booleans. Default is
 * `idle` — the parent should treat "no entry in the status map" as
 * `idle` rather than relying on every consumer to pre-fill the map.
 */
export type CommitRowStatus =
  | { kind: "idle" }
  | { kind: "inFlight" }
  | { kind: "committed" }
  | { kind: "failed"; message: string };

export interface CommitPlanArgs {
  /**
   * Moves to walk, in order. Parent is responsible for filtering
   * stale moves before calling — see file-header note. Order is
   * preserved as-given; this helper does NOT re-sort or dedupe
   * (dedupe is `dedupePlannedMoves`'s job at stage-time).
   */
  moves: readonly PlannedMove[];
  /**
   * Translate a move into its sheet rowKey. MUST match what the
   * parent's `reviewPlanRows` memo uses or the sheet's status
   * badges will land on the wrong rows. See
   * `franchise-route-map.tsx`'s memo for the canonical scheme:
   * `swap:{aStopId}:{bStopId}` / `insert:{stopId}`.
   */
  rowKeyOf: (move: PlannedMove) => string;
  /**
   * Async commit for a single move. Parent picks the right
   * mutation (`swapMutation` for `kind: "swap"`, `repositionMutation`
   * for `kind: "insert"`) and threads the shared `notifyCustomer`
   * flag from the sheet's footer toggle. Resolves on success;
   * rejects on failure with whatever error the underlying mutation
   * throws.
   */
  commitMove: (move: PlannedMove) => Promise<void>;
  /**
   * Fires every time a row's status changes. Walk order is:
   *   1. ALL rows seeded to `idle` (one synchronous burst before
   *      any mutation fires).
   *   2. For each move in order: `inFlight` → `committed` OR
   *      `failed`.
   *   3. On failure, the loop exits — subsequent moves stay `idle`.
   *
   * Parent typically wires this to `setCommitStatusByRow((prev) => ({...prev, [rowKey]: status}))`.
   */
  onStatusChange: (rowKey: string, status: CommitRowStatus) => void;
}

export interface CommitPlanResult {
  /**
   * rowKeys for moves that committed successfully, in walk order.
   * Parent uses this to remove committed moves from `plannedMoves`
   * so a retry doesn't double-fire them.
   */
  succeededRowKeys: string[];
  /**
   * rowKey of the move that failed, or null if the whole walk
   * completed. Parent uses this to decide whether to exit plan
   * mode (null → exit) or keep the sheet open for retry (non-null).
   */
  failedRowKey: string | null;
  /**
   * Index into `moves` where the walk stopped. Equals `moves.length`
   * when there was no failure. Useful for tracing.
   */
  stoppedAt: number;
}

/**
 * Walk `moves` in order, awaiting `commitMove` for each one. Reports
 * status via `onStatusChange`. Stops on first failure.
 *
 * Behavior:
 *   - Empty `moves` → returns `{ succeededRowKeys: [], failedRowKey: null, stoppedAt: 0 }`
 *     with no status events emitted.
 *   - All succeed → every row gets `inFlight` then `committed`;
 *     returns succeededRowKeys = all, failedRowKey = null.
 *   - Failure mid-walk → the failing row gets `failed`; subsequent
 *     rows stay `idle` (no `inFlight` event fires for them).
 *
 * The seeding burst at the top guarantees the sheet shows EVERY
 * row as `idle` before the first `inFlight` fires — without it,
 * any pre-existing status (e.g. `failed` from a prior commit
 * attempt) would briefly bleed through during a retry.
 */
export async function commitPlanSequentially(
  args: CommitPlanArgs,
): Promise<CommitPlanResult> {
  const { moves, rowKeyOf, commitMove, onStatusChange } = args;

  if (moves.length === 0) {
    return { succeededRowKeys: [], failedRowKey: null, stoppedAt: 0 };
  }

  // Seed every row to idle so a retry clears the prior pass's
  // failed/committed markers before the next inFlight lands. One
  // synchronous burst; no awaits between events so React batches
  // the resulting state updates.
  for (const move of moves) {
    onStatusChange(rowKeyOf(move), { kind: "idle" });
  }

  const succeededRowKeys: string[] = [];
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const rowKey = rowKeyOf(move);

    onStatusChange(rowKey, { kind: "inFlight" });
    try {
      await commitMove(move);
      onStatusChange(rowKey, { kind: "committed" });
      succeededRowKeys.push(rowKey);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onStatusChange(rowKey, { kind: "failed", message });
      return { succeededRowKeys, failedRowKey: rowKey, stoppedAt: i };
    }
  }

  return {
    succeededRowKeys,
    failedRowKey: null,
    stoppedAt: moves.length,
  };
}
