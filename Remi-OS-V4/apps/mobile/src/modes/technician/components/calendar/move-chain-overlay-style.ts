/**
 * `applyMoveChainBorderOverride` (PR-UX-1 / move-chain selector PASS 1).
 *
 * Sibling helper to `applyPendingChangeBorderOverride`. Composes
 * after the cyan pending-change tint so the cyan still says "this is
 * staged" and the move-chain treatment adds the three chip-row
 * selection states:
 *
 *   - `selectedChainId === null` (Show all baseline) → no treatment.
 *     Every tile renders plain. The leading "Show all" pill in the
 *     chip row owns this state.
 *
 *   - `selectedChainId === ALL_CHAINS_SENTINEL` ("All chains" mode) →
 *     every chain appointment renders at full opacity with a
 *     borderLeft in its OWN chain color; non-chain appointments dim
 *     to 0.4. Reachable only via the LAST chip's 2-state toggle.
 *
 *   - `selectedChainId === chainId` (isolate one chain) → that
 *     chain's appointments render in its color; everything else
 *     (other chains AND non-chain appointments) dims to 0.4.
 *
 * Style-merge contract with the vendored library:
 *   - As of FORK Phase 23 (`vendor/.../EventBlock`), `resolved.container`
 *     is the LAST element of the EventBlock's style array, so any field
 *     we set here wins over the library's `dynamicStyle` defaults
 *     (which include `opacity`, `borderWidth`, `borderColor`). The
 *     `DraggableEvent` variant has always behaved this way.
 *   - `borderLeftWidth` / `borderLeftColor` are not in `dynamicStyle`
 *     either, so the chain-color left bar shows up regardless.
 *   - Layout fields (`top`, `height`, `left`, `width`, `zIndex`) come
 *     from `dynamicStyle` and are not touched here.
 *
 * Composition order (callers MUST follow):
 *   1. Build per-tech / per-status base style.
 *   2. Apply `applyPendingChangeBorderOverride` (cyan tint).
 *   3. Apply `applyMoveChainBorderOverride` (chain border + dim).
 *
 * That order matters because step 3 reads from whatever container
 * fields step 2 produced — the chain border augments the cyan tile
 * rather than replacing it.
 */

import type { Event as RCEvent, StyleOverrides } from "react-native-resource-calendar";

import { getAppointmentFromEvent } from "@technician/utils/resource-calendar-mapping";
import type { ReorganizationIntent } from "@technician/types/reorganization";
import type {
  MoveChainDestSlot,
  MoveChainGraph,
} from "@technician/utils/detect-move-chains";
import { ALL_CHAINS_SENTINEL } from "@technician/components/calendar/MoveChainChipRow";
import { getMoveChainGhostMeta } from "@technician/components/calendar/move-chain-ghost-tiles";

export interface MoveChainOverlayStyleArgs {
  graph: MoveChainGraph;
  selectedChainId: string | null;
  /**
   * Local intent slice from `usePendingRealityStore.intents`. Used to
   * resolve which chain (if any) an appointment belongs to via the
   * intent's `appointment_id`.
   */
  localIntents: ReorganizationIntent[];
  /**
   * Currently-rendered chain destination slots (from
   * `getVisibleMoveChainDestSlots`). Real cards whose source slot
   * geometrically overlaps any active ghost stay at full opacity even
   * when their own chain isn't selected — matches canvas Decision 1
   * (Purple's tall destination covers Orange/Red-left/Pink; the
   * displaced cards stay visible underneath so the user sees what
   * the drop is about to displace). Optional with `[]` default to
   * keep callers that don't compute it backwards-compatible.
   */
  visibleDestSlots?: readonly MoveChainDestSlot[];
  /**
   * PR-UX-2 PASS 2.11 (task `c8`): per-step spotlight set for the
   * actively isolated chain. When the user has tapped the chip-row
   * dots into a partial-highlight state (`[i, i+1]` pair, `[0..i]`
   * prefix), source cards whose step ordinal is NOT in the set
   * render WITHOUT the chain outline — their tech-color base
   * survives so the user can still see the card belongs to the
   * chain visually but only spotlit steps "pop." Empty array AND a
   * chain isolated → ZERO source outlines (the all-dim initial
   * state matches what the chip-row's dot-strip shows).
   *
   * `null`/`undefined` AND a chain isolated → behave as before
   * (every card in the isolated chain renders the chain outline).
   * "All chains" mode and the Show-all baseline ignore this arg —
   * neither has a single chain to scope the spotlight to.
   */
  chainStepHighlights?: readonly number[] | null;
  /**
   * PLAN-DEVIATION: 2026-05-09-pr-ux-16-followups — additional
   * chain ids that should highlight ALONGSIDE the
   * `selectedChainId`. Used by the chain-to-chain conflict toast
   * to render both conflicting chains' borders simultaneously
   * even though only one chain can be the formally-isolated one.
   * Cards belonging to any chain in this set render at full
   * highlight (no dim). Ignored in the "Show all" baseline (no
   * chain selected) and in `ALL_CHAINS_SENTINEL` mode (every
   * chain is already highlighted).
   */
  auxHighlightedChainIds?: readonly string[] | null;
}

const DIMMED_OPACITY = 0.4;
const CHAIN_BORDER_WIDTH = 4;

/**
 * Per-(event, decision) log dedupe. `applyMoveChainBorderOverride` is
 * called once per event per render, which is a LOT of log lines if we
 * print every call. Instead, key the last decision by event id and
 * only print when the decision changes (e.g., chip toggled, ghost
 * flipped on/off, dim/highlight state shifted). Cleared on selection
 * change so swap-chains transitions log fresh.
 *
 * PR-UX-2 PASS 2.13 (2026-05-05): the dedupe key now bakes in
 * `chainStepHighlights` (a hash of the spotlight array) so a chip-row
 * dot tap that mutates the spotlight always triggers a fresh log line
 * even when the abstract "decision" string didn't change. Without
 * this, the dedupe swallowed the "user tapped a dot" signal that
 * would otherwise reveal which steps the override saw as lit when
 * the user reported "the last card has no border."
 */
const lastBorderDecisionByKey = new Map<string, string>();
let lastSelectedChainSnapshot: string | null = null;
let lastSpotlightSnapshot: string = "";

function logBorderDecision(
  selectedChainId: string | null,
  chainStepHighlights: readonly number[] | null | undefined,
  eventId: number | string | undefined,
  decision: string,
  detail?: Record<string, unknown>,
): void {
  if (!__DEV__) return;
  const spotlightKey =
    chainStepHighlights == null ? "null" : chainStepHighlights.join(",");
  if (
    selectedChainId !== lastSelectedChainSnapshot ||
    spotlightKey !== lastSpotlightSnapshot
  ) {
    lastBorderDecisionByKey.clear();
    lastSelectedChainSnapshot = selectedChainId;
    lastSpotlightSnapshot = spotlightKey;
  }
  const key = String(eventId ?? "?");
  if (lastBorderDecisionByKey.get(key) === decision) return;
  lastBorderDecisionByKey.set(key, decision);
  console.log("[MoveChain:Border]", {
    selectedChainId,
    chainStepHighlights:
      chainStepHighlights == null
        ? null
        : Array.from(chainStepHighlights),
    eventId,
    decision,
    ...(detail ?? {}),
  });
}

export function applyMoveChainBorderOverride(
  event: RCEvent,
  base: StyleOverrides | undefined,
  args: MoveChainOverlayStyleArgs,
): StyleOverrides | undefined {
  const {
    graph,
    selectedChainId,
    localIntents,
    visibleDestSlots,
    chainStepHighlights,
    auxHighlightedChainIds,
  } = args;
  // PLAN-DEVIATION: 2026-05-09-pr-ux-16-followups — derive the
  // effective set of "chains to highlight" once per call. The
  // primary `selectedChainId` is augmented with any aux chains
  // (the chain-to-chain conflict toast surfaces them so both
  // conflicting chains paint in their own colors simultaneously).
  // Empty when in baseline / all-chains mode (those branches
  // ignore the set entirely).
  const auxSet =
    auxHighlightedChainIds && auxHighlightedChainIds.length > 0
      ? new Set(auxHighlightedChainIds)
      : null;

  // No graph → no work to do. Common path on calendars where no
  // session is active.
  if (graph.chains.length === 0) return base;

  const baseContainer = base?.container ?? {};

  // Move-chain GHOST tiles (PR-UX-2 PASS 2). These are synthetic
  // events injected via `useResourcesWithMoveChainGhosts` to show
  // each intent's destination on the calendar canvas.
  //
  // Visual contract: NO fill + solid 3px chain-color border on all
  // sides + a thicker chain-color left border. Real tiles always
  // carry a solid tech-color fill, so a hollow chain-color frame
  // reads as "not real yet / this is where the move lands" without
  // relying on `borderStyle: "dashed"` (which renders inconsistently
  // on the vendored library — verified on iOS 2026-05-04, dashes
  // come out as solid). See README-FORK.md note re styleOverrides
  // merge order (FORK Phase 23) for why these container fields win.
  //
  // PR-UX-2 PASS 2.5 fix (2026-05-05): on busy tech-days the calendar's
  // overlap-layout pipeline assigns the ghost a sub-column whose
  // background is the same dim/empty as the underlying day cell, and
  // a solid real appointment overlapping the same time band can
  // visually swallow the hollow frame. Three reinforcements:
  //   1. `zIndex: 10000` overrides the calendar's `frame.zIndex`
  //      (set in `dynamicStyle`, applied BEFORE `resolved.container`
  //      per FORK Phase 23 ordering) so the ghost paints on top of
  //      any real tile in the same stacking parent.
  //   2. `overflow: "visible"` lifts the inherited `overflow: hidden`
  //      from `styles.event` so the shadow + thick border don't get
  //      clipped at the rounded corners.
  //   3. iOS shadow + Android elevation in the chain color give the
  //      hollow frame a halo that reads against any background fill
  //      sitting underneath it (real tiles, day-grid lines, drag
  //      ghost — all opaque).
  //
  // Ghosts always render at full opacity (the dim treatment below
  // applies only to real tiles).
  const ghostMeta = getMoveChainGhostMeta(event);
  if (ghostMeta) {
    logBorderDecision(selectedChainId, chainStepHighlights, event.id, "ghost-frame", {
      chainId: ghostMeta.chainId,
      stepColor: ghostMeta.stepColor,
      intentId: ghostMeta.intentId,
    });
    return {
      ...(base ?? {}),
      container: {
        ...baseContainer,
        backgroundColor: "transparent",
        borderWidth: 3,
        borderColor: ghostMeta.stepColor,
        borderLeftWidth: CHAIN_BORDER_WIDTH,
        borderLeftColor: ghostMeta.stepColor,
        opacity: 1,
        zIndex: 10000,
        overflow: "visible",
        shadowColor: ghostMeta.stepColor,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 4,
        elevation: 8,
      },
      title: { color: ghostMeta.stepColor, fontWeight: "700" },
      desc: { color: ghostMeta.stepColor, opacity: 0.85 },
      time: { color: ghostMeta.stepColor },
    };
  }

  // Show-all baseline → no treatment for real tiles. Every tile
  // renders plain; chip-row state alone signals "we're in chain mode".
  if (selectedChainId == null) {
    logBorderDecision(selectedChainId, chainStepHighlights, event.id, "untouched");
    return base;
  }

  // Canvas Decision 1 (PR-UX-2 PASS 2.6, 2026-05-05): cards sitting
  // INSIDE an active ghost destination stay at full opacity, even
  // when their own chain isn't selected. This is the Purple-split
  // case — Purple's tall destination covers Orange/Red-left/Pink on
  // Tech 1, and we want the user to see those 3 cards underneath
  // (full opacity, identity colors retained) so it's obvious what
  // the proposed drop is about to displace. Without this exemption
  // the displaced cards dim to 0.4 and the Purple ghost reads as
  // "going into an empty slot" — visually misleading.
  //
  // Implementation: compare the appointment's source slot (date,
  // tech, time interval) against `visibleDestSlots`. Any geometric
  // overlap (same tech, same date, time intervals overlap) wins the
  // exemption. The exemption returns `base` unchanged — no chain
  // outline, no dim — so the underlying card retains its tech color
  // / cyan staged tint. The chain's own color treatment renders on
  // the ghost frame floating ABOVE the card, not on the card itself.
  /**
   * Find the FIRST highlighted ghost destination whose rect overlaps
   * `appt`'s slot, or `null` if none. The geometry check is the same
   * `cardOverlapsActiveGhost` used to use; we now expose the
   * matched slot so callers that want the ghost's `step_color` can
   * pull it out (PR-UX-2 PASS 2.22 — see the spotlight-out-glow
   * branch below). Returning the first match (rather than every
   * match) is intentional: real chain geometry only ever places one
   * highlighted ghost per source rect because each intent has one
   * destination, and a single source card can only be the
   * displacement target of at most one chain step ahead of it.
   */
  const findOverlappingActiveGhost = (
    appt: { technician_id: number | null; scheduled_date: string | null; scheduled_time: string | null; scheduled_end_time: string | null } | null,
  ): MoveChainDestSlot | null => {
    if (!appt || !visibleDestSlots || visibleDestSlots.length === 0) {
      return null;
    }
    if (
      appt.technician_id == null ||
      appt.scheduled_date == null ||
      appt.scheduled_time == null ||
      appt.scheduled_end_time == null
    ) {
      return null;
    }
    const startMin = parseHmToMinutes(appt.scheduled_time);
    const endMin = parseHmToMinutes(appt.scheduled_end_time);
    for (const slot of visibleDestSlots) {
      if (slot.technician_id !== appt.technician_id) continue;
      if (slot.date !== appt.scheduled_date) continue;
      if (slot.startMin >= endMin) continue;
      if (startMin >= slot.endMin) continue;
      return slot;
    }
    return null;
  };

  const cardOverlapsActiveGhost = (
    appt: { technician_id: number | null; scheduled_date: string | null; scheduled_time: string | null; scheduled_end_time: string | null } | null,
  ): boolean => findOverlappingActiveGhost(appt) !== null;

  const dim = (reason: string): StyleOverrides => {
    logBorderDecision(selectedChainId, chainStepHighlights, event.id, "dim", { reason });
    return {
      ...(base ?? {}),
      container: {
        ...baseContainer,
        opacity: DIMMED_OPACITY,
      },
    };
  };
  // PLAN-DEVIATION: 2026-05-05-per-step-coloring — see
  // docs/PLAN-DEVIATIONS.md#2026-05-05-per-step-coloring.
  //
  // Source card outline color is the intent's PER-STEP color
  // (stepColors[ordinal]), not the chain's seed color. So in a
  // 3-step cascade [A → B → C → empty]:
  //   - Card A (step 0) outlines in palette[0]
  //   - Card B (step 1) outlines in palette[1]
  //   - Card C (step 2) outlines in palette[2]
  // AND each card carries an incoming ghost from the previous
  // intent in a DIFFERENT color (B has intent-A's ghost in
  // palette[0] over its own palette[1] outline → two stacked
  // frames in two distinct colors → conflict reads correctly).
  //
  // Full 3px outline (not just borderLeft) so the chain identity
  // wraps the card and reads against any background. The per-tech
  // accent stripe is shadowed by an explicit borderLeftWidth /
  // borderLeftColor override.
  const CHAIN_OUTLINE_WIDTH = 3;
  const highlight = (color: string, chainId: string, stepOrdinal: number): StyleOverrides => {
    logBorderDecision(selectedChainId, chainStepHighlights, event.id, "highlight", {
      color,
      chainId,
      stepOrdinal,
    });
    return {
      ...(base ?? {}),
      container: {
        ...baseContainer,
        borderWidth: CHAIN_OUTLINE_WIDTH,
        borderColor: color,
        borderLeftWidth: CHAIN_OUTLINE_WIDTH,
        borderLeftColor: color,
        opacity: 1,
      },
    };
  };

  const appointment = getAppointmentFromEvent(event);
  // Personal events / draft tiles with no underlying appointment
  // cannot belong to a chain (intents target appointment_ids), and
  // we have no slot data to compare against the active ghosts, so
  // they always dim once we're in any chain mode.
  if (!appointment) return dim("no-appointment");

  // Build the dim-or-exempt fallback once so each "this card is not
  // in the selected chain" branch can short-circuit to base when it
  // sits under an active ghost. Canvas Decision 1.
  const dimOrExempt = (reason: string): StyleOverrides | undefined => {
    if (cardOverlapsActiveGhost(appointment)) {
      logBorderDecision(selectedChainId, chainStepHighlights, event.id, "ghost-overlap-exempt", {
        reason,
      });
      return base;
    }
    return dim(reason);
  };

  const intentForAppt = localIntents.find(
    (i) => i.appointment_id === appointment.id,
  );
  if (!intentForAppt) return dimOrExempt("no-intent-for-appointment");

  const chainId = graph.intentToChainId.get(intentForAppt.id);
  if (!chainId) return dimOrExempt("intent-not-in-any-chain");
  const chain = graph.chains.find((c) => c.id === chainId);
  if (!chain) return dimOrExempt("chain-not-in-graph");

  // Resolve the appointment's step within its chain so we paint
  // the per-step color, not the chain's seed color.
  const stepOrdinal = chain.intentIds.indexOf(intentForAppt.id);
  // PR-UX-2 PASS 2.13 (2026-05-05): defensive log when the intent is
  // mapped to a chain by `graph.intentToChainId` but its id is NOT
  // in `chain.intentIds`. The two should be in lockstep — the chain
  // walker writes both atomically — but if a future detector change
  // ever desynced them, the spotlight branch below would compare
  // `chainStepHighlights.includes(-1)` (always false) and the card
  // would silently render WITHOUT a chain border. Logging the gap
  // (rather than failing closed) preserves the existing fallback to
  // `chain.color` while making the regression visible on next repro.
  if (stepOrdinal < 0) {
    logBorderDecision(selectedChainId, chainStepHighlights, event.id, "ordinal-missing", {
      chainId,
      intentId: intentForAppt.id,
      chainIntentIds: chain.intentIds,
    });
  }
  const stepColor =
    stepOrdinal >= 0
      ? chain.stepColors[stepOrdinal] ?? chain.color
      : chain.color;

  // "All chains" mode → every chain appointment highlights in its
  // own per-step color; non-chain appointments stay dimmed (above).
  // The per-step spotlight set is intentionally ignored here — "all
  // chains" is a static overview where every chain's full identity
  // shows simultaneously, not a per-step drill-down.
  if (selectedChainId === ALL_CHAINS_SENTINEL) return highlight(stepColor, chain.id, stepOrdinal);

  // Specific chain isolated. PR-UX-2 PASS 2.11 (task `c8`): when
  // the user has tapped the chip's per-step dots into a partial
  // spotlight (`[i, i+1]` pair, `[0..i]` prefix) we only outline
  // source cards whose step ordinal is in the lit set. Cards in
  // the same chain but not lit return `base` — they keep their
  // tech color, full opacity, no chain border. That's the visual
  // contract the user re-stated this pass: "the others are not
  // blinking and do not have arrows between them" — non-spotlit
  // cards still belong to the chain, they just aren't drawing
  // attention.
  //
  // `chainStepHighlights == null` skips the filter entirely (pre-
  // c8 behavior). An EMPTY array and a chain isolated → zero
  // outlines, matching the chip-row's "all dots dim" initial
  // state.
  if (selectedChainId === chainId) {
    if (chainStepHighlights == null) {
      return highlight(stepColor, chain.id, stepOrdinal);
    }
    if (chainStepHighlights.includes(stepOrdinal)) {
      return highlight(stepColor, chain.id, stepOrdinal);
    }
    // PR-UX-2 PASS 2.22 (2026-05-05) — "card under a highlighted
    // ghost glows in its OWN ordinal's color" rule.
    //
    // Repro: with a 6-step cascade and `chainStepHighlights = [0..3]`,
    // source card 42821 (ordinal 4 — NOT in the highlighted set) sits
    // at the same rect as ghost(intent 3). Pre-2.22 this branch
    // returned `base` so 42821 kept its tech-color border, and the
    // ghost frame painted on top via `zIndex: 10000`. The user's
    // mental model is "every source card in the chain has a
    // permanent color identity. When it's visible because a ghost
    // lands on it, it should glow with ITS color, not borrow the
    // ghost's color." They pointed at 42821 and said *"the last
    // card... STILL doesn't have its colored border."*
    //
    // Fix: when a spotlight-OUT card's rect overlaps ANY highlighted
    // ghost in the same chain (i.e. a slot in `visibleDestSlots`,
    // already filtered through `chainStepHighlights` upstream by
    // `getVisibleMoveChainDestSlots`), paint that card's border with
    // its OWN step color (`chain.stepColors[stepOrdinal]`). NOT the
    // ghost's `step_color` — that would produce two cards + one
    // ghost in the same color and collapse the per-step identity
    // the `2026-05-05-per-step-coloring` deviation was built around.
    // The ghost continues to paint on top in its own (different)
    // color at zIndex 10000, preserving the cross-card conflict
    // signal: "this is card N (its own color) about to receive
    // intent N-1's drop (different color frame on top)."
    //
    // Same-chain restriction: this rule fires only when the
    // overlapping ghost belongs to the same chain as the underlying
    // card's own intent. Cross-chain overlaps (the Purple-split
    // case below) keep the existing `dimOrExempt` exemption — those
    // cards retain their identity colors via `base` because they're
    // displaced witnesses, not chain participants.
    //
    // Multi-overlap: if multiple highlighted ghosts land on the
    // same source rect, the answer is still "card's own ordinal
    // color" — the rule is about the SOURCE's identity, not the
    // ghost's, so it doesn't matter how many ghosts overlap.
    const overlappingGhost = findOverlappingActiveGhost(appointment);
    if (overlappingGhost && overlappingGhost.chain_id === chain.id) {
      return highlight(stepColor, chain.id, stepOrdinal);
    }
    logBorderDecision(selectedChainId, chainStepHighlights, event.id, "spotlight-dim", {
      chainId,
      stepOrdinal,
    });
    return base;
  }

  // PLAN-DEVIATION: 2026-05-09-pr-ux-16-followups — chain-to-chain
  // conflict aux highlight. If this card's chain is in the aux
  // set, paint it like a same-priority isolated chain. Bypasses
  // the spotlight rule entirely (aux chains are surfaced by the
  // conflict toast, not by user dot-tap intent).
  if (auxSet && auxSet.has(chainId)) {
    return highlight(stepColor, chain.id, stepOrdinal);
  }

  // Belongs to a different chain → dim into the background, unless
  // it sits under an active ghost (Purple-split case).
  return dimOrExempt("different-chain");
}

// Local copy of the parser used by `detect-move-chains`. We don't
// import it because that module's `parseHmToMinutes` is private. The
// shape is trivial; if you change either, change both.
function parseHmToMinutes(value: string): number {
  const parts = value.split(":");
  if (parts.length < 2) return 0;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}
