/**
 * `useResourcesWithMoveChainGhosts` (PR-UX-2 / move-chain selector PASS 2).
 *
 * Mirror of `useResourcesWithDraft` (`FloatingDraftCard.tsx`) for
 * the move-chain ghost destination tiles. For each chain intent in
 * scope (per the chip-row selection), splice a synthetic event into
 * the resources array at the intent's destination tech + date +
 * time. The synthetic event carries:
 *
 *   - A negative numeric id derived from the intent id (so it can
 *     never collide with a real appointment id and so the
 *     `eventStyleOverrides` callback can distinguish ghosts via the
 *     `isMoveChainGhostEventId` predicate).
 *   - `meta.isMoveChainGhost === true` plus `meta.stepColor` (the
 *     intent's per-step color) so each calendar wrapper's existing
 *     style override pipeline can paint the ghost without re-
 *     resolving the chain graph per tile.
 *
 * Visibility scoping is handled upstream by
 * `getVisibleMoveChainDestSlots`, which returns:
 *   - `[]` when `selectedChainId === null` (Show all baseline)
 *   - all chain destinations when `selectedChainId === "all"`
 *   - just the selected chain's destinations otherwise
 *
 * So this hook only needs to inject what the upstream resolver
 * yields — no per-chain conditionals here.
 *
 * Why injection instead of a dedicated overlay: the vendored
 * `<Calendar>` already knows how to render an event in any
 * resource × date × time slot with the dashed-border treatment via
 * `eventStyleOverrides`. Reusing that pipeline keeps drag-collision,
 * day-spanning, and FlashList virtualization Just Working for ghosts
 * without a parallel overlay layer that would have to re-implement
 * coordinate math against the calendar's scroll position. The same
 * trade-off was made for `pendingDraft` in
 * `FloatingDraftCard.useResourcesWithDraft` (see its docstring).
 */

import { useMemo } from "react";

import type { Event as RCEvent, Resource } from "react-native-resource-calendar";

import type {
  MoveChainDestSlot,
  MoveChainGraph,
} from "@technician/utils/detect-move-chains";
import { getVisibleMoveChainDestSlots } from "@technician/utils/detect-move-chains";
import type { ReorganizationIntent } from "@technician/types/reorganization";
import type { LinterAppointment } from "@technician/utils/logistics-linter";

/**
 * Negative-id base for ghost events. Each ghost's id is
 * `-(GHOST_ID_OFFSET + intent_id)` so collisions with the
 * pre-existing `SYNTHETIC_DRAFT_EVENT_ID = -1` and any future
 * single-slot synthetics are impossible.
 */
const GHOST_ID_OFFSET = 1_000_000;

export function moveChainGhostEventIdFor(intentId: number): number {
  return -(GHOST_ID_OFFSET + intentId);
}

export function isMoveChainGhostEventId(
  id: number | string | undefined | null,
): boolean {
  if (typeof id !== "number") return false;
  return id <= -GHOST_ID_OFFSET;
}

/**
 * Reverse the `moveChainGhostEventIdFor` encoding. Returns the
 * underlying `intent_id` for a ghost event id, or `null` when the
 * input is not a ghost id. Used by the calendar drag-end handler
 * to route a ghost-drag back to the `modify_intent` mutation that
 * mutates the underlying intent's destination payload (see
 * `useModifyReorganizationIntent` and PR-UX-2 PASS 2.8 task `c7`).
 */
export function intentIdFromGhostEventId(
  id: number | string | undefined | null,
): number | null {
  if (!isMoveChainGhostEventId(id)) return null;
  return -(id as number) - GHOST_ID_OFFSET;
}

/**
 * Pull the ghost-meta out of an event. Returns null when the event
 * is not a ghost. Used by `eventStyleOverrides` to short-circuit to
 * the chain-color frame treatment (see `applyMoveChainGhostStyle`).
 *
 * `stepColor` is the intent's per-step color, equal to its source
 * card's outline color and its arrow's stroke color — see
 * `MoveChainDestSlot.step_color` and PLAN-DEVIATION
 * 2026-05-05-per-step-coloring.
 */
export interface MoveChainGhostMeta {
  isMoveChainGhost: true;
  chainId: string;
  /** The intent's per-step color (= source card outline = arrow). */
  stepColor: string;
  intentId: number;
}

export function getMoveChainGhostMeta(
  event: RCEvent,
): MoveChainGhostMeta | null {
  const meta = (event as { meta?: Partial<MoveChainGhostMeta> }).meta;
  if (!meta?.isMoveChainGhost) return null;
  if (
    typeof meta.chainId !== "string" ||
    typeof meta.stepColor !== "string" ||
    typeof meta.intentId !== "number"
  ) {
    return null;
  }
  return {
    isMoveChainGhost: true,
    chainId: meta.chainId,
    stepColor: meta.stepColor,
    intentId: meta.intentId,
  };
}

/**
 * Build a synthetic ghost event for one destination slot. Exported
 * separately from the hook so the day-view (which doesn't go
 * through `useResourcesWithMoveChainGhosts` because of how it maps
 * resources up-front) can call it directly when it needs to.
 */
export function buildGhostEvent(slot: MoveChainDestSlot): RCEvent {
  return {
    id: moveChainGhostEventIdFor(slot.intent_id),
    resourceId: slot.technician_id,
    date: slot.date,
    from: slot.startMin,
    to: slot.endMin,
    title: "→ moved here",
    meta: {
      isMoveChainGhost: true,
      chainId: slot.chain_id,
      stepColor: slot.step_color,
      intentId: slot.intent_id,
    },
  } as RCEvent;
}

interface ResourceWithEvents extends Resource {
  events: RCEvent[];
}

export function useResourcesWithMoveChainGhosts<T extends ResourceWithEvents>(
  resources: T[],
  graph: MoveChainGraph,
  intents: readonly ReorganizationIntent[],
  appointments: readonly LinterAppointment[],
  selectedChainId: string | null,
  /**
   * PR-UX-2 PASS 2.11 (task `c8`): per-step spotlight set. See
   * `getVisibleMoveChainDestSlots`'s arg of the same name for the
   * filtering contract — we forward it untouched.
   */
  chainStepHighlights?: readonly number[] | null,
  /**
   * PR-UX-3 (2026-05-07): active tech filter. When provided (a
   * non-null number), drop every chain destination slot whose
   * `technician_id !== activeTechId` BEFORE the per-resource
   * injection step. Single-resource workweek already worked the
   * "right" way by virtue of `slotsByTech.get(r.id)` matching only
   * the visible tech, but this codifies the contract for cross-
   * tech chains in workweek view (where the chain has destinations
   * on multiple techs and we want only the active tech's ghosts to
   * paint). Day view passes multiple resources and leaves this
   * undefined to keep all-tech ghost rendering. See
   * `pr-ux-3-multi-tech-handoff.md` §1.A6 + §10.A6 of
   * `multi-tech-move-chain-plan.md` for the full design spec.
   */
  activeTechId?: number | null,
  /**
   * PLAN-DEVIATION: 2026-05-09-pr-ux-16-followups — additional
   * chain ids to render ghosts for alongside the primary
   * `selectedChainId`. Used by the chain-to-chain conflict toast
   * so both conflicting chains' ghost destinations are visible at
   * once. Forwarded untouched into `getVisibleMoveChainDestSlots`.
   */
  auxHighlightedChainIds?: readonly string[] | null,
): T[] {
  return useMemo(() => {
    const allSlots = getVisibleMoveChainDestSlots(
      graph,
      intents,
      appointments,
      selectedChainId,
      chainStepHighlights,
      auxHighlightedChainIds,
    );
    const slots =
      activeTechId == null
        ? allSlots
        : allSlots.filter((s) => s.technician_id === activeTechId);
    if (slots.length === 0 || resources.length === 0) {
      if (__DEV__) {
        console.log("[MoveChain:Ghost] no ghosts to inject", {
          slotCount: slots.length,
          resourceCount: resources.length,
          selectedChainId,
          chainStepHighlights,
          activeTechId,
          allSlotCountPreFilter: allSlots.length,
        });
      }
      return resources;
    }

    const slotsByTech = new Map<number, MoveChainDestSlot[]>();
    for (const s of slots) {
      const list = slotsByTech.get(s.technician_id) ?? [];
      list.push(s);
      slotsByTech.set(s.technician_id, list);
    }

    if (__DEV__) {
      console.log("[MoveChain:Ghost] injecting", {
        slotCount: slots.length,
        techsTouched: Array.from(slotsByTech.keys()),
        intentIds: slots.map((s) => s.intent_id),
        ghostEventIds: slots.map((s) => moveChainGhostEventIdFor(s.intent_id)),
        selectedChainId,
        chainStepHighlights,
        activeTechId,
        allSlotCountPreFilter: allSlots.length,
      });
    }

    return resources.map((r) => {
      const techSlots = slotsByTech.get(r.id);
      if (!techSlots || techSlots.length === 0) return r;
      return {
        ...r,
        events: [...r.events, ...techSlots.map(buildGhostEvent)],
      };
    });
  }, [
    resources,
    graph,
    intents,
    appointments,
    selectedChainId,
    chainStepHighlights,
    activeTechId,
    auxHighlightedChainIds,
  ]);
}
