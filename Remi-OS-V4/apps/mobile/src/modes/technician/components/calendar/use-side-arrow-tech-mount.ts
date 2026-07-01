/**
 * `useSideArrowTechMount` (PR-UX-3 Phase 2 — 2026-05-07).
 *
 * Orchestrator that wires the side-arrow widget on `MoveChainChipRow`
 * to:
 *
 *   1. The pure `advanceLink` helper (next highlight set on press).
 *   2. `usePendingRealityStore.setChainStepHighlights` (writes the
 *      next set into the spotlight store).
 *   3. `useCalendarStore.enterWorkweek` (remounts the workweek
 *      calendar onto the active step's SOURCE tech when that tech
 *      differs from the currently-mounted tech).
 *   4. A `flashKey` that bumps on every cross-tech remount so the
 *      sibling `TechNameFlashOverlay` re-runs its 200/200/200
 *      envelope.
 *
 * Spec: `pr-ux-3-multi-tech-handoff.md` §1.A1 (chip + side-arrow
 * navigation), §1.N1 (side-arrow widget), §1.N2 (wrap), §1.N3
 * (flash overlay), §2 Phase 2 (this hook is the integration seam).
 *
 * Tech-run navigation (revised 2026-05-08): the hook now derives
 * a `techIdByStep` array from the active chain's intent →
 * appointment lookups and passes it to `advanceLink`. The pure
 * helper groups consecutive same-tech steps into "tech-runs" and
 * cycles whole runs per press, so a chain with two adjacent
 * Josh steps lights both dots together. Single-tech chains
 * collapse to one run and the side-arrow widget disables — the
 * dot-tap prefix cycle is the only walk for those.
 *
 * Design notes:
 *   - The remount + flash logic is keyed on a CHANGE in active
 *     source-tech, not just on a side-arrow press. That way the
 *     same effect also fires when the user dot-taps a different
 *     chain whose seed is owned by another tech, or when wrap-
 *     around lands on a step owned by the original tech (no flash
 *     because no change). This matches handoff §1.A1: "tap = jump,
 *     side-arrow = walk, both can change tech, both fire the same
 *     remount path."
 *   - `flashTechName` stays populated even when no flash is in
 *     flight — the banner reads it on its first paint after a
 *     `flashKey` bump and Reanimated drives the envelope from
 *     there. Keeping the name set means the overlay can render
 *     idempotently between flashes (its internal `FlashBanner`
 *     remounts on key change; the wrapper stays mounted).
 *   - Single-tech chains short-circuit the remount: every step's
 *     source-tech equals the seed's, which equals the currently-
 *     mounted tech, so the equality guard skips both
 *     `enterWorkweek` and `flashKey++`. PR-UX-2 single-tech
 *     regression intact.
 *
 * The hook does NOT own the actual chip-row UI (that lives in
 * `MoveChainChipRow.tsx`). The host view (workweek view) instantiates
 * the hook once, passes `advance`/`canAdvance` down to the chip-row,
 * and mounts a `TechNameFlashOverlay` next to the calendar wrapper
 * with `flashKey` + `flashTechName` from the hook.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ALL_CHAINS_SENTINEL,
} from "@technician/components/calendar/MoveChainChipRow";
import {
  advanceLink,
  canAdvanceLink,
  type SideArrowDirection,
} from "@technician/components/calendar/move-chain-link-advance";
import { useCalendarStore } from "@technician/stores/calendar";
import { usePendingRealityStore } from "@technician/stores/pending-reality";
import type { LinterAppointment } from "@technician/utils/logistics-linter";
import type {
  MoveChain,
  MoveChainGraph,
} from "@technician/utils/detect-move-chains";
import type { ReorganizationIntent } from "@technician/types/reorganization";

export interface UseSideArrowTechMountArgs {
  graph: MoveChainGraph;
  intents: readonly ReorganizationIntent[];
  appointments: readonly LinterAppointment[];
  /** Map from `technician_id` → display name. Plumbed from `availableTechs`. */
  techNamesById: ReadonlyMap<number, string>;
}

export interface UseSideArrowTechMountResult {
  /** Bumps on every cross-tech remount; drives `TechNameFlashOverlay` re-mount. */
  flashKey: number;
  /** Tech name to render in the flash banner. Null when no chain is selected. */
  flashTechName: string | null;
  /** Side-arrow press handler. */
  advance: (direction: SideArrowDirection) => void;
  /** Returns `true` when the side arrow is interactive in the given direction. */
  canAdvance: (direction: SideArrowDirection) => boolean;
}

/**
 * Resolve the SOURCE tech id of the active step in the active chain.
 * Returns `null` when there's no active chain, no active step, or
 * when the source appointment is missing / unassigned.
 */
function resolveActiveSourceTechId({
  chain,
  activeStep,
  intents,
  appointments,
}: {
  chain: MoveChain | null;
  activeStep: number | null;
  intents: readonly ReorganizationIntent[];
  appointments: readonly LinterAppointment[];
}): number | null {
  if (!chain || activeStep == null) return null;
  if (activeStep < 0 || activeStep >= chain.intentIds.length) return null;

  const intentId = chain.intentIds[activeStep];
  if (intentId == null) return null;

  const intent = intents.find((i) => i.id === intentId);
  if (!intent) return null;
  if (intent.appointment_id == null) return null;

  const appt = appointments.find((a) => a.id === intent.appointment_id);
  if (!appt) return null;
  if (appt.technician_id == null) return null;

  return appt.technician_id;
}

/**
 * Resolve the highest-index step in `chainStepHighlights`. Mirrors
 * `advanceLink`'s "active link = max(current)" rule so the remount
 * effect agrees with the side-arrow press.
 */
function resolveActiveStep(highlights: readonly number[]): number | null {
  if (highlights.length === 0) return null;
  let maxIdx = highlights[0]!;
  for (const step of highlights) {
    if (step > maxIdx) maxIdx = step;
  }
  return maxIdx;
}

export function useSideArrowTechMount({
  graph,
  intents,
  appointments,
  techNamesById,
}: UseSideArrowTechMountArgs): UseSideArrowTechMountResult {
  const selectedChainId = usePendingRealityStore((s) => s.selectedChainId);
  const chainStepHighlights = usePendingRealityStore(
    (s) => s.chainStepHighlights,
  );
  const setChainStepHighlights = usePendingRealityStore(
    (s) => s.setChainStepHighlights,
  );

  const workweekTechId = useCalendarStore((s) => s.workweekTechId);
  const enterWorkweek = useCalendarStore((s) => s.enterWorkweek);

  // Resolve the active chain. `ALL_CHAINS_SENTINEL` short-circuits
  // because there's no single chain to anchor the side-arrow
  // navigation to — the chip row's leading "Show all" pill exits
  // first.
  const activeChain = useMemo<MoveChain | null>(() => {
    if (selectedChainId == null) return null;
    if (selectedChainId === ALL_CHAINS_SENTINEL) return null;
    return graph.chains.find((c) => c.id === selectedChainId) ?? null;
  }, [graph.chains, selectedChainId]);

  const totalSteps = activeChain?.intentIds.length ?? 0;

  // Active step ordinal — the index the side-arrows advance FROM and
  // the source-tech remount keys on.
  const activeStep = useMemo(
    () => resolveActiveStep(chainStepHighlights),
    [chainStepHighlights],
  );

  // Per-step source-technician id for the active chain. Drives the
  // tech-run grouping in `advanceLink` (revised 2026-05-08): adjacent
  // steps with equal tech ids belong to one run, so a chain like
  // `J J T J T T J J` cycles `[0,1] → [2] → [3] → [4,5] → [6,7]`
  // per side-arrow press regardless of how many dots the user had
  // selected before pressing. `null` slots (unresolved tech) coalesce
  // into their own run; the helper preserves them as navigable.
  //
  // Computed once per chain / intents / appointments change. The
  // `find()` calls are O(N²) in the worst case but our chain
  // lengths are ~10 dots and our intents arrays are small bounded
  // staged-session payloads — well within "noise" for a memoized
  // selector.
  const techIdByStep = useMemo<readonly (number | null)[]>(() => {
    if (!activeChain) return [];
    return activeChain.intentIds.map((intentId) => {
      const intent = intents.find((i) => i.id === intentId);
      if (!intent || intent.appointment_id == null) return null;
      const appt = appointments.find((a) => a.id === intent.appointment_id);
      if (!appt || appt.technician_id == null) return null;
      return appt.technician_id;
    });
  }, [activeChain, intents, appointments]);

  // Active step's source-tech. Null when no chain / no step / source
  // appt missing or unassigned. The remount effect uses this as its
  // change-detector input.
  const activeSourceTechId = useMemo(
    () =>
      resolveActiveSourceTechId({
        chain: activeChain,
        activeStep,
        intents,
        appointments,
      }),
    [activeChain, activeStep, intents, appointments],
  );

  const [flashKey, setFlashKey] = useState(0);
  const [flashTechName, setFlashTechName] = useState<string | null>(null);

  // Track the last tech we remounted onto so the effect only fires
  // on a CHANGE. Using a ref (not state) prevents the effect from
  // re-running when the ref updates.
  const lastMountedTechRef = useRef<number | null>(workweekTechId ?? null);

  useEffect(() => {
    // No active step / no source-tech → nothing to remount onto. We
    // intentionally do NOT clear the flash banner here; if the user
    // dimmed all dots after a flash fired, the banner is already
    // animated out (its 600ms envelope completed by the time the
    // empty-state effect runs).
    if (activeSourceTechId == null) return;

    // Equality guard: if the active step's source-tech equals the
    // currently-mounted tech, no remount and no flash. Single-tech
    // chains hit this branch on every press.
    if (workweekTechId === activeSourceTechId) {
      lastMountedTechRef.current = workweekTechId;
      return;
    }

    // Avoid double-firing when the effect runs twice with the same
    // target (e.g. from a strict-mode double render in dev). The
    // inequality above already guarded against same-tech; this guard
    // catches the same-target-second-time case.
    if (lastMountedTechRef.current === activeSourceTechId) return;

    const techName = techNamesById.get(activeSourceTechId) ?? `Tech ${activeSourceTechId}`;

    if (__DEV__) {
      console.log("[MoveChain:SideArrow:Remount]", {
        from: workweekTechId,
        to: activeSourceTechId,
        techName,
        activeStep,
        chainId: activeChain?.id ?? null,
      });
    }

    enterWorkweek(activeSourceTechId, techName);
    lastMountedTechRef.current = activeSourceTechId;
    setFlashTechName(techName);
    setFlashKey((k) => k + 1);
  }, [
    activeChain,
    activeSourceTechId,
    activeStep,
    enterWorkweek,
    techNamesById,
    workweekTechId,
  ]);

  const advance = useCallback(
    (direction: SideArrowDirection) => {
      // No-op when no chain is isolated — the side-arrow widget is
      // hidden in that state, but defensively ignore presses that
      // slip through.
      if (activeChain == null) return;
      if (totalSteps <= 0) return;

      const next = advanceLink({
        direction,
        current: chainStepHighlights,
        totalSteps,
        techIdByStep,
      });
      // Pure helper returns the same reference on no-op; the store
      // setter additionally short-circuits on equal-content arrays.
      if (next === chainStepHighlights) return;
      setChainStepHighlights(next);
    },
    [
      activeChain,
      chainStepHighlights,
      setChainStepHighlights,
      techIdByStep,
      totalSteps,
    ],
  );

  const canAdvance = useCallback(
    (direction: SideArrowDirection) => {
      if (activeChain == null) return false;
      return canAdvanceLink({
        direction,
        current: chainStepHighlights,
        totalSteps,
        techIdByStep,
      });
    },
    [activeChain, chainStepHighlights, techIdByStep, totalSteps],
  );

  return {
    flashKey,
    flashTechName,
    advance,
    canAdvance,
  };
}
