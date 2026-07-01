/**
 * Move-chain detection (PR-UX-1 / move-chain selector PASS 1).
 *
 * Pure helper that walks a set of `ReorganizationIntent`s plus an
 * unfiltered appointment lookup and emits a graph of:
 *
 *   - **Edges** — intent A points to intent B iff A's *destination*
 *     slot geometrically overlaps B's *source* slot (the appointment
 *     B's intent moves out of). I.e. A "displaces" B.
 *   - **Chains** — strictly linear paths through the trigger graph,
 *     OPTIONALLY merged across the trigger graph by the BE-assigned
 *     `intent.chain_id` (PLAN-DEVIATION
 *     `2026-05-10-sticky-chain-identity-fe`). Two FE-topology
 *     sub-chains whose intents share a BE `chain_id` collapse into
 *     one chain — this is what lets a 4-link cascade survive a
 *     `op:modify_intent` that breaks the conflict topology. When a
 *     sub-chain has no BE `chain_id` (deploy window or local
 *     optimistic), the legacy seed-id-derived synthesizer
 *     `chain-{seedIntentId}` is the fallback for that sub-chain
 *     only — BE-merged and synthesized chain ids coexist within
 *     the same render because both are opaque strings.
 *     // TODO(2026-Q3): once every environment runs a BE that
 *     // ships `chain_id`, retire the synthesized fallback (and
 *     // the empty-string sentinel in the test fixture).
 *   - **Ecosystems** — connected components in the undirected
 *     trigger graph PLUS BE-chain-id unions. Two ecosystems whose
 *     constituent sub-chains share a BE `chain_id` collapse into
 *     one so the merged chain doesn't straddle ecosystem boundaries.
 *
 * The model matches the locked design from the move-chain canvas
 * mockup. See `move-chain selector — PASS 1` plan for context.
 *
 * The detector is pure: no React, no I/O, no `Date.now()`. The caller
 * (`useMoveChainGraph`) is responsible for wiring the inputs.
 *
 * KEEP IN SYNC: the `projectIntentsToTechSlots` helper below is a
 * structural copy of the same-named private helper in
 * `src/utils/logistics-linter.ts` (line 497). The linter file is
 * byte-identical with the REMIBackend mirror per `master plan §1.5/X1`,
 * so we don't widen its export surface — instead we duplicate the
 * projection here and keep both copies in sync by hand. If you change
 * either, change both. The detector's `intervalsOverlap` /
 * `parseHmToMinutes` helpers are likewise mirrored and noted inline.
 */

import type {
  ReorganizationIntent,
  ReorganizationIntentPayload,
} from "@technician/types/reorganization";
import type { CalendarDayResponse } from "@technician/types/calendar";
import type { LinterAppointment } from "@technician/utils/logistics-linter";
import { TECH_PALETTE } from "@technician/constants/colors";

/** A single trigger edge in the chain graph. */
export interface ChainEdge {
  fromIntentId: number;
  toIntentId: number;
}

/**
 * A linear sequence of intents. Each consecutive pair (i, i+1) is a
 * trigger edge. The first intent is the "seed" — either a root drag
 * (no incoming edge) or a split-displaced child (its parent has 2+
 * outgoing edges).
 */
export interface MoveChain {
  /**
   * Opaque chain identity. Either:
   *
   *   - The BE-assigned `intent.chain_id` (UUID v4) when every intent
   *     in the chain has a non-empty value (PLAN-DEVIATION
   *     `2026-05-10-sticky-chain-identity-fe`). Two FE-topology
   *     sub-chains that share a BE `chain_id` MERGE into one
   *     `MoveChain` so the user's 4-link cascade survives a
   *     `op:modify_intent` that disconnects the conflict graph.
   *   - The synthesized fallback `chain-{seedIntentId}` when any
   *     intent in the FE-topology sub-chain lacks a BE `chain_id`
   *     (BE deploy-window edge, local optimistic intent not yet
   *     ack'd, or a hypothetical the FE built for the linter
   *     pre-stage).
   *
   * Consumers MUST treat both shapes as opaque strings — anything
   * that parses `chain-{n}` to extract the intent id is incorrect
   * once BE chain ids land. See `seedIntentId` below for the
   * structured access point.
   */
  id: string;
  /**
   * **Per-step** colors, one entry per intent in `intentIds`. Step
   * ordinal `k` (0-based) → `TECH_PALETTE[k % TECH_PALETTE.length]`.
   *
   * PLAN-DEVIATION: 2026-05-05-per-step-coloring — see
   * docs/PLAN-DEVIATIONS.md#2026-05-05-per-step-coloring.
   *
   * Why per-step instead of per-chain (the prior PASS 2.4 model):
   * users said the conflict visualization needs each card in a
   * cascade to read as a distinct entity — a 3-step chain rendered
   * in one color collapsed visually to "a vague red region", which
   * defeats the "this card moved here from there" mental model the
   * arrows + ghosts are supposed to communicate. With per-step
   * coloring, intent K's source card + ghost destination + arrow
   * all share `stepColors[K]` so the user can trace one card's
   * movement by color, AND consecutive cards in the same chain
   * carry distinct colors so the cascade reads as a sequence rather
   * than a blob.
   *
   * Cross-chain ambiguity is acceptable: chain A's step 1 and
   * chain B's step 1 share `palette[0]`. Chains are visually
   * separated by which cards they connect (arrows + chip-flow
   * structure), not by chain-level identity color.
   */
  stepColors: string[];
  /**
   * Convenience alias for `stepColors[0]` (the seed's color). Kept
   * because some legacy consumers (chip border, dot fill) want a
   * single representative hue for the chain. New consumers should
   * pull from `stepColors[k]` for the specific step they're
   * rendering.
   */
  color: string;
  seedIntentId: number;
  /** Linear sequence of intent ids, head → tail. */
  intentIds: number[];
  ecosystemId: string;
}

/** A connected component in the (undirected) trigger graph. */
export interface Ecosystem {
  /** Stable id derived from the lowest seed intent id in the ecosystem. */
  id: string;
  chainIds: string[];
}

/** Detector output. */
export interface MoveChainGraph {
  chains: MoveChain[];
  ecosystems: Ecosystem[];
  /** Reverse lookup — every intent that lives in any chain maps to its chain id. */
  intentToChainId: Map<number, string>;
}

/** Stable empty graph reference for the no-intents path. */
export const EMPTY_MOVE_CHAIN_GRAPH: MoveChainGraph = {
  chains: [],
  ecosystems: [],
  intentToChainId: new Map(),
};

/**
 * Public destination-slot shape (PR-UX-2 PASS 2). Each entry
 * describes WHERE a chain intent will land on the calendar after
 * commit, plus the chain identity it belongs to. Consumers use this
 * to inject phantom "ghost destination" tiles into the calendar
 * resources array (one per intent in scope).
 */
export interface MoveChainDestSlot {
  intent_id: number;
  chain_id: string;
  /**
   * The intent's **step** color — pulls from
   * `MoveChain.stepColors[stepOrdinal]` where `stepOrdinal` is the
   * intent's 0-based position in the chain's `intentIds` array.
   * Equals the source card's outline color and the arrow's stroke
   * color for this intent, so the user can trace the moving card
   * by color across all three visual elements.
   *
   * PLAN-DEVIATION: 2026-05-05-per-step-coloring — see
   * docs/PLAN-DEVIATIONS.md#2026-05-05-per-step-coloring.
   * (Previously named `chain_color` and held the chain-level color;
   * renamed when per-step coloring landed.)
   */
  step_color: string;
  /**
   * The displaced appointment's id, OR `-intent.id` for `create`
   * intents (no underlying appointment). The negative-id sentinel
   * keeps the slot keyed even for synthetic origins.
   */
  appointment_id: number;
  /** Destination tech (resource id on the calendar). */
  technician_id: number;
  /** YYYY-MM-DD destination date. */
  date: string;
  /** Minutes-of-day start. */
  startMin: number;
  /** Minutes-of-day end. */
  endMin: number;
}

/**
 * Resolve which chain destinations are visible given the current
 * chip-row selection. Returns:
 *
 *   - `[]` when `selectedChainId === null` (Show all baseline = no
 *     ghosts; only the chip-row signals chain mode).
 *   - All destinations across every chain when `selectedChainId`
 *     equals the all-chains sentinel `"all"`.
 *   - Just the destinations of the selected chain otherwise.
 *
 * Implementation: piggybacks on `projectIntentsToTechSlots` (which
 * the detector itself uses for edge derivation) so the projection
 * stays single-sourced. We then attach `chain_id` + `step_color`
 * (from the chain's `stepColors[ordinal]`) by joining against
 * `graph.intentToChainId` / `graph.chains`.
 *
 * PLAN-DEVIATION: 2026-05-05-per-step-coloring — see
 * docs/PLAN-DEVIATIONS.md#2026-05-05-per-step-coloring.
 *
 * **Every** chain destination is emitted (including intermediate
 * cascade steps whose destination overlaps another in-chain card).
 * The PR-UX-2 PASS 2.6 ghost-suppression filter that previously
 * dropped intermediate destinations was reverted on 2026-05-05 —
 * the user's clarification was that the conflict IS the
 * visualization: an intermediate ghost STACKED OVER the displaced
 * card is exactly how the user reads "this card wants to land
 * where that other card currently is." Suppressing the ghost
 * collapsed the conflict to a single colored frame and broke the
 * mental model.
 *
 * The two stacked frames carry DIFFERENT colors (the underlying
 * card's own step color vs the incoming intent's step color), so
 * the conflict reads as two visually distinct entities even when
 * spatially superimposed.
 */
const ALL_CHAINS_SENTINEL_INTERNAL = "all";
export function getVisibleMoveChainDestSlots(
  graph: MoveChainGraph,
  intents: readonly ReorganizationIntent[],
  appointments: readonly LinterAppointment[],
  selectedChainId: string | null,
  /**
   * PR-UX-2 PASS 2.11 (task `c8`): per-step spotlight set for the
   * actively-isolated chain. Only meaningful when `selectedChainId`
   * is a real chain id (not null, not the all-chains sentinel) —
   * the chip-row's per-dot tap rule narrows the visible
   * destinations to a contiguous pair (`[i, i+1]`), prefix
   * (`[0..i]`), or full set (`[0..N-1]`).
   *
   * Empty array AND a chain isolated → emit ZERO destinations.
   * That's the "all dots dimmed" initial state per the spec, where
   * the user has selected a chain but hasn't yet tapped any dot to
   * spotlight a link. Calendar source cards still render with
   * their tech color (the chain-outline highlight is gated by the
   * border-override's separate read of the same set).
   *
   * `null` / `undefined` AND a chain isolated → behave as before
   * (every chain destination emitted). Provided so the helper's
   * pre-c8 callers (tests, off-thread previews) keep working
   * without an explicit "all" set.
   *
   * "All chains" mode and the Show-all baseline ignore this
   * argument — neither has a single chain to scope the spotlight
   * to, so the cycle doesn't apply.
   */
  chainStepHighlights?: readonly number[] | null,
  /**
   * PLAN-DEVIATION: 2026-05-09-pr-ux-16-followups — additional
   * chain ids whose ghost destinations should also render
   * alongside the actively selected chain. Used by the chain-to-
   * chain conflict toast so both conflicting chains' ghosts paint
   * simultaneously even though the chip row's `selectedChainId`
   * model only supports a single isolated chain. Ignored in the
   * "Show all" baseline (returns early above) and in
   * `ALL_CHAINS_SENTINEL` mode (every chain is already emitted).
   */
  auxHighlightedChainIds?: readonly string[] | null,
): MoveChainDestSlot[] {
  if (selectedChainId == null) return [];
  if (graph.chains.length === 0) return [];

  const showAll = selectedChainId === ALL_CHAINS_SENTINEL_INTERNAL;
  const appointmentsById = new Map<number, LinterAppointment>();
  for (const a of appointments) appointmentsById.set(a.id, a);

  const allDestSlots = projectIntentsToTechSlots(intents, appointmentsById);
  const chainById = new Map<string, MoveChain>();
  for (const c of graph.chains) chainById.set(c.id, c);

  // Spotlight set is ONLY honored in single-chain isolate mode.
  // Show-all baseline returns above; "all chains" mode skips the
  // filter. `undefined`/`null` also falls through to "no filter"
  // for backwards compat with the pre-c8 signature.
  const applySpotlight =
    !showAll &&
    Array.isArray(chainStepHighlights);
  const spotlightSet = applySpotlight
    ? new Set<number>(chainStepHighlights as readonly number[])
    : null;

  // PLAN-DEVIATION: 2026-05-09-pr-ux-16-followups — aux highlight
  // set. Included alongside `selectedChainId` in the per-slot
  // chain-id filter below. Only applies in single-isolate mode
  // (all-chains mode emits every chain anyway).
  const auxSet =
    !showAll && auxHighlightedChainIds && auxHighlightedChainIds.length > 0
      ? new Set(auxHighlightedChainIds)
      : null;

  const out: MoveChainDestSlot[] = [];
  for (const slot of allDestSlots) {
    const chainId = graph.intentToChainId.get(slot.intent_id);
    if (!chainId) continue;
    if (!showAll) {
      const isInScope =
        chainId === selectedChainId || (auxSet != null && auxSet.has(chainId));
      if (!isInScope) continue;
    }
    const chain = chainById.get(chainId);
    if (!chain) continue;
    const stepOrdinal = chain.intentIds.indexOf(slot.intent_id);
    if (stepOrdinal < 0) continue;
    // Spotlight filter only applies to the primary `selectedChainId`.
    // Aux chains (PR-UX-16) bypass the spotlight — they're surfaced
    // by the chain-to-chain conflict toast and the user is meant to
    // see all of their ghosts at once.
    if (
      spotlightSet !== null &&
      chainId === selectedChainId &&
      !spotlightSet.has(stepOrdinal)
    ) {
      continue;
    }
    const stepColor =
      chain.stepColors[stepOrdinal] ?? chain.color ?? TECH_PALETTE[0];

    out.push({
      intent_id: slot.intent_id,
      chain_id: chainId,
      step_color: stepColor,
      appointment_id: slot.appointment_id,
      technician_id: slot.technician_id,
      date: slot.date,
      startMin: slot.startMin,
      endMin: slot.endMin,
    });
  }
  return out;
}

/**
 * Project one or more `CalendarDayResponse` objects into the
 * unfiltered `LinterAppointment[]` shape the detector consumes. The
 * three calendar wrappers (day, workweek, landscape) all receive
 * one of these shapes as a prop, so this is the cheapest single
 * seam for building the detector's appointment input.
 *
 * Unlike `useCalendarWorldSnapshot`, this projection does NOT filter
 * out staged appointments — chain detection needs each intent's
 * pre-move source slot, which lives on the very rows the world
 * snapshot strips.
 */
export function dayDataToLinterAppointments(
  dayData: CalendarDayResponse | CalendarDayResponse[] | undefined,
): LinterAppointment[] {
  if (!dayData) return [];
  const days: CalendarDayResponse[] = Array.isArray(dayData)
    ? dayData
    : [dayData];
  const appointments: LinterAppointment[] = [];
  for (const day of days) {
    if (!day) continue;
    for (const tech of day.technicians) {
      for (const appt of tech.appointments) {
        if (
          appt.scheduled_date == null ||
          appt.scheduled_time == null ||
          appt.scheduled_end_time == null
        ) {
          continue;
        }
        appointments.push({
          id: appt.id,
          customer_id: appt.customer_id,
          technician_id: appt.technician_id,
          franchise_id: appt.franchise_id,
          fleet_company_id: appt.fleet_account_id ?? null,
          status: appt.status,
          scheduled_date: appt.scheduled_date,
          scheduled_start_time: appt.scheduled_time,
          scheduled_end_time: appt.scheduled_end_time,
          recurrence_series_id: appt.recurrence_series_id ?? null,
        });
      }
    }
  }
  return appointments;
}

/**
 * Pure predicate: would `newIntent` extend an existing chain if it
 * were appended to `existingIntents`?
 *
 * Used by `useSessionAwareSubmit` to decide between live-commit and
 * session-sticky stage on a linter-clean drop while a reorganization
 * session is already active. The user's rule
 * (`fix/portrait-week-drop-on-avatar`, 2026-05-08):
 *
 *   "Cards that are dropped without conflict and are not in a chain
 *    sequence where they have conflict from another card on them are
 *    just moved, no questions asked."
 *
 * The PR-UX-3 session-sticky branch (commit `8d35619`) lumped EVERY
 * linter-clean drop into the active session — even drops that had
 * nothing to do with the existing pending work. This predicate is the
 * narrowing gate: stage only when the new intent would actually join
 * a chain (cascade terminator, branch-displaced child, etc.); fall
 * through to live-commit otherwise.
 *
 * Implementation reuses `detectMoveChains` so the predicate's
 * definition of "chain" is byte-identical with what the chip row,
 * calendar overlays, and review screen render. A divergence between
 * "what the gate considers a chain" and "what the user sees on
 * screen" would re-introduce the same class of bug from a different
 * direction.
 *
 * Rules:
 *   - `existingIntents.length === 0` → false. There's nothing to
 *     extend; first stage of any session is by definition solo.
 *   - `newIntent` is a non-chain-eligible kind (cancel /
 *     personal_event_*) → false. Such intents never produce a
 *     destination slot, so they can't form a trigger edge with
 *     anything; they're staged via the explicit-CTA path, not the
 *     drag path.
 *   - Otherwise: run the detector on `[...existingIntents, newIntent]`
 *     and return true iff `newIntent`'s resulting chain has more
 *     than one step OR shares an ecosystem with another chain
 *     (split-displaced ancestor / descendant). The "ecosystem >1
 *     chain" check catches branch points where the new intent is a
 *     1-step seed but split-creates other chains around it.
 *
 * The `appointments` argument MUST be the UNFILTERED appointment
 * list (same contract as `detectMoveChains`). Passing the
 * world-snapshot filtered list would erase the source slots of
 * existing staged intents and produce false negatives ("solo chain"
 * when the new intent actually lands on an existing intent's
 * vacated slot).
 */
export function wouldExtendExistingChain(
  newIntent: ReorganizationIntent,
  existingIntents: readonly ReorganizationIntent[],
  appointments: readonly LinterAppointment[],
): boolean {
  if (existingIntents.length === 0) return false;

  const graph = detectMoveChains(
    [...existingIntents, newIntent],
    appointments,
  );
  const newChainId = graph.intentToChainId.get(newIntent.id);
  if (newChainId == null) return false;
  const newChain = graph.chains.find((c) => c.id === newChainId);
  if (newChain == null) return false;
  if (newChain.intentIds.length > 1) return true;
  const ecosystem = graph.ecosystems.find(
    (e) => e.id === newChain.ecosystemId,
  );
  if (ecosystem != null && ecosystem.chainIds.length > 1) return true;
  return false;
}

/**
 * `detectChainToChainDestinationConflicts` (PR-UX-16,
 * PLAN-DEVIATION 2026-05-09-pr-ux-16-followups).
 *
 * Detects pairs of pending intents whose DESTINATIONS overlap in
 * (technician, date, time interval) AND that belong to two
 * DIFFERENT chains. The user reported a landscape repro where two
 * staged chain destinations end up in the same calendar slot but
 * the existing linter passed silently — the local linter compares
 * pending intents against COMMITTED appointments only, not against
 * other pending destinations.
 *
 * Returned shape: deterministic. Each conflict pair has its
 * smaller chain id first to make set-membership comparisons stable
 * across renders. Same-chain destination overlaps are omitted by
 * design — they're already represented inside the chain graph as
 * within-chain trigger edges.
 *
 * `appointments` MUST be the UNFILTERED appointment list (same
 * contract as `detectMoveChains` and `wouldExtendExistingChain`).
 *
 * See docs/PLAN-DEVIATIONS.md#2026-05-09-pr-ux-16-followups.
 */
export interface ChainToChainConflict {
  chainAId: string;
  chainBId: string;
  intentAId: number;
  intentBId: number;
  technician_id: number;
  date: string;
  startMin: number;
  endMin: number;
}

export function detectChainToChainDestinationConflicts(
  intents: readonly ReorganizationIntent[],
  appointments: readonly LinterAppointment[],
): ChainToChainConflict[] {
  if (intents.length < 2) return [];
  const graph = detectMoveChains(intents, appointments);
  if (graph.chains.length < 2) return [];

  const appointmentsById = new Map<number, LinterAppointment>();
  for (const a of appointments) appointmentsById.set(a.id, a);
  const destSlots = projectIntentsToTechSlots(intents, appointmentsById);

  const conflicts: ChainToChainConflict[] = [];
  const seenPairs = new Set<string>();
  for (let i = 0; i < destSlots.length; i += 1) {
    const a = destSlots[i];
    const chainA = graph.intentToChainId.get(a.intent_id);
    if (chainA == null) continue;
    for (let j = i + 1; j < destSlots.length; j += 1) {
      const b = destSlots[j];
      const chainB = graph.intentToChainId.get(b.intent_id);
      if (chainB == null) continue;
      if (chainA === chainB) continue;
      if (a.technician_id !== b.technician_id) continue;
      if (a.date !== b.date) continue;
      if (!intervalsOverlap(a.startMin, a.endMin, b.startMin, b.endMin)) {
        continue;
      }
      // Sort chain ids so the pair's identity is stable regardless
      // of intent-iteration order. Same for intent ids inside the
      // pair so a future "have I shown a toast for this pair?"
      // dedupe keys cleanly.
      const [chainLow, chainHigh] =
        chainA < chainB ? [chainA, chainB] : [chainB, chainA];
      const [intentLow, intentHigh] =
        chainLow === chainA
          ? [a.intent_id, b.intent_id]
          : [b.intent_id, a.intent_id];
      const key = `${chainLow}::${chainHigh}::${intentLow}::${intentHigh}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      conflicts.push({
        chainAId: chainLow,
        chainBId: chainHigh,
        intentAId: intentLow,
        intentBId: intentHigh,
        technician_id: a.technician_id,
        date: a.date,
        startMin: Math.max(a.startMin, b.startMin),
        endMin: Math.min(a.endMin, b.endMin),
      });
    }
  }
  return conflicts;
}

/**
 * Build the move-chain graph for the current set of intents.
 *
 * `appointments` is the UNFILTERED appointment list — i.e. the day's
 * appointments BEFORE the world-snapshot helper strips out staged
 * ones. Chain detection needs the original (pre-move) slot of every
 * intent's appointment to compute the trigger graph; the world
 * snapshot's filter would erase exactly the rows we need.
 */
export function detectMoveChains(
  intents: readonly ReorganizationIntent[],
  appointments: readonly LinterAppointment[],
): MoveChainGraph {
  if (intents.length === 0) return EMPTY_MOVE_CHAIN_GRAPH;

  const appointmentsById = new Map<number, LinterAppointment>();
  for (const a of appointments) appointmentsById.set(a.id, a);

  const destSlots = projectIntentsToTechSlots(intents, appointmentsById);
  const sourceSlots = projectIntentsToSourceSlots(intents, appointmentsById);

  // Build the directed trigger graph. Edge A → B iff A's destination
  // slot overlaps B's source slot (and A != B).
  const outgoing = new Map<number, number[]>();
  const incoming = new Map<number, number[]>();
  for (const dest of destSlots) {
    for (const src of sourceSlots) {
      if (dest.intent_id === src.intent_id) continue;
      if (dest.technician_id !== src.technician_id) continue;
      if (dest.date !== src.date) continue;
      if (!intervalsOverlap(dest.startMin, dest.endMin, src.startMin, src.endMin)) continue;
      pushTo(outgoing, dest.intent_id, src.intent_id);
      pushTo(incoming, src.intent_id, dest.intent_id);
    }
  }

  // Determine chain seeds. Per the locked design:
  //   - Seed = intent with 0 incoming edges (root drag), OR
  //   - Seed = intent whose parent has 2+ outgoing edges (split-displaced child).
  //
  // Chain-eligibility filter (PR-UX-2 PASS 2.1, 2026-05-04): only intents
  // that physically *move a card to a new slot* count as chains. Cancels
  // remove a card (no destination), `personal_event_delete` removes a
  // personal block (no destination), `personal_event_update` edits in
  // place (also no movement). All three would otherwise show up in the
  // chip row as misleading 1-step "chains" with no destination tile to
  // visualize, cluttering the row with non-actionable selections. The
  // chain-eligible kinds match exactly the projection rules in
  // `projectIntentsToTechSlots`: reschedule, reassign, create. (We keep
  // them in `intents` so the rest of pending-reality still tracks and
  // commits them — the filter scopes only chain-graph membership, not
  // intent storage.)
  const isChainEligibleKind = (kind: ReorganizationIntentPayload["kind"]) =>
    kind === "reschedule" || kind === "reassign" || kind === "create";

  const intentIdSet = new Set<number>();
  for (const i of intents) {
    if (!isChainEligibleKind(i.payload.kind)) continue;
    intentIdSet.add(i.id);
  }

  const seeds: number[] = [];
  for (const id of intentIdSet) {
    const inc = incoming.get(id);
    if (!inc || inc.length === 0) {
      seeds.push(id);
      continue;
    }
    // Has at least one parent. If any parent has 2+ outgoing edges,
    // this intent is a split-displaced seed.
    const splitDisplaced = inc.some((parentId) => (outgoing.get(parentId)?.length ?? 0) >= 2);
    if (splitDisplaced) seeds.push(id);
  }

  // Walk each seed forward via single-outgoing edges. Stop at
  // terminators (0 outgoing) or branch points (2+ outgoing — current
  // node is the last in this chain; children become their own chain
  // seeds and were already added above).
  const intentToChainId = new Map<number, string>();
  const chains: MoveChain[] = [];

  // Sort seeds by id so chain ids and ecosystem ids are deterministic.
  seeds.sort((a, b) => a - b);

  for (const seedId of seeds) {
    if (intentToChainId.has(seedId)) continue; // shouldn't happen given seed rules, but defensive
    const sequence: number[] = [];
    let cursor: number | null = seedId;
    const visited = new Set<number>();
    while (cursor !== null) {
      if (visited.has(cursor)) break; // cycle guard (linter would already error on this)
      visited.add(cursor);
      sequence.push(cursor);
      const next: number[] = outgoing.get(cursor) ?? [];
      // Branch point or terminator → stop.
      if (next.length !== 1) break;
      const nextId: number = next[0];
      // If the only child is itself a seed (e.g. parent has 2+ out
      // somewhere — shouldn't fire here since we just checked
      // outgoing.length === 1, but defensive), stop.
      if (intentToChainId.has(nextId)) break;
      cursor = nextId;
    }
    // Provisional sub-chain id from the legacy seed-derived
    // synthesizer. The BE-merge pass below may rewrite this to the
    // BE-assigned chain id (or merge multiple sub-chains into one).
    // Kept as a pre-merge handle so the trigger-graph→ecosystem
    // mapping below has stable keys to traverse.
    const subChainId = `chain-${seedId}`;
    // Per-step palette indexing: see `MoveChain.stepColors` doc-block.
    // Step ordinal `k` (0-based, head→tail) → palette[k % len]. Two
    // chains share palette slots by step ordinal — chain A's step 1
    // and chain B's step 1 are both palette[0]. Cross-chain
    // distinguishability comes from chain-flow shape (chip dots +
    // calendar arrows), not chain-level identity color.
    const stepColors: string[] = sequence.map(
      (_, idx) => TECH_PALETTE[idx % TECH_PALETTE.length],
    );
    chains.push({
      id: subChainId,
      stepColors,
      color: stepColors[0] ?? TECH_PALETTE[0],
      seedIntentId: seedId,
      intentIds: sequence,
      ecosystemId: "", // filled in below
    });
    for (const id of sequence) intentToChainId.set(id, subChainId);
  }

  // Group sub-chains into ecosystems via connected components in
  // the undirected trigger graph. Two sub-chains are in the same
  // ecosystem iff any intent in one has a trigger edge (in either
  // direction) to any intent in the other.
  const chainOfIntent = intentToChainId; // alias for clarity
  const chainGraph = new Map<string, Set<string>>();
  for (const chain of chains) chainGraph.set(chain.id, new Set());
  const addChainEdge = (a: string, b: string) => {
    if (a === b) return;
    chainGraph.get(a)!.add(b);
    chainGraph.get(b)!.add(a);
  };
  for (const [fromId, tos] of outgoing) {
    const fromChain = chainOfIntent.get(fromId);
    if (!fromChain) continue;
    for (const toId of tos) {
      const toChain = chainOfIntent.get(toId);
      if (!toChain) continue;
      addChainEdge(fromChain, toChain);
    }
  }

  const subChainIdToEcosystemId = new Map<string, string>();
  // Walk sub-chains in seed-id order so ecosystem ids are
  // deterministic.
  for (const chain of chains) {
    if (subChainIdToEcosystemId.has(chain.id)) continue;
    const componentChainIds: string[] = [];
    const stack: string[] = [chain.id];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (subChainIdToEcosystemId.has(current)) continue;
      subChainIdToEcosystemId.set(current, ""); // placeholder
      componentChainIds.push(current);
      const neighbors = chainGraph.get(current);
      if (!neighbors) continue;
      for (const n of neighbors) {
        if (!subChainIdToEcosystemId.has(n)) stack.push(n);
      }
    }
    // Deterministic ecosystem id from the lowest seed id in the
    // component. Pulls `seedIntentId` straight off the chain rows
    // rather than parsing the (now potentially-merged) chain id
    // string.
    componentChainIds.sort(
      (a, b) => seedIntentIdOfChain(a, chains) - seedIntentIdOfChain(b, chains),
    );
    const ecoId = `eco-${seedIntentIdOfChain(componentChainIds[0], chains)}`;
    for (const cid of componentChainIds)
      subChainIdToEcosystemId.set(cid, ecoId);
  }

  // Wire ecosystem ids onto each sub-chain (pre-merge).
  for (const chain of chains) {
    chain.ecosystemId = subChainIdToEcosystemId.get(chain.id) ?? "";
  }

  // ── BE chain_id sticky-merge pass ───────────────────────────────
  //
  // PLAN-DEVIATION: 2026-05-10-sticky-chain-identity-fe — see
  // /Users/jacegalloway/Documents/codebases/REMITechnician/docs/PLAN-DEVIATIONS.md#2026-05-10-sticky-chain-identity-fe.
  //
  // The trigger-graph walk above produced FE-topology sub-chains.
  // Now collapse any sub-chains whose intents share a BE-assigned
  // `chain_id` so the user's 4-link cascade stays as one chain
  // even after a `op:modify_intent` that disconnects the conflict
  // graph. Sub-chains where any intent lacks a BE `chain_id`
  // (deploy window, local optimistic) keep their synthesized
  // `chain-{seedIntentId}` id and skip the merge.
  const intentById = new Map<number, ReorganizationIntent>();
  for (const i of intents) intentById.set(i.id, i);

  // Resolve each sub-chain's "merge key" — the BE chain_id when
  // every intent in the sub-chain agrees on a non-empty value, or
  // the sub-chain's own synthesized id when any intent is missing
  // a chain_id (defensive fallback for that sub-chain only).
  const subChainMergeKey = new Map<string, string>();
  for (const chain of chains) {
    const beIds = new Set<string>();
    let anyMissing = false;
    for (const intentId of chain.intentIds) {
      const intent = intentById.get(intentId);
      // Treat missing intent (shouldn't happen) AND empty-string
      // chain_id sentinel AND undefined as "no BE id".
      const beId = intent?.chain_id;
      if (!beId) {
        anyMissing = true;
        break;
      }
      beIds.add(beId);
    }
    if (anyMissing || beIds.size !== 1) {
      // Fallback for this sub-chain only — keep synthesized id.
      subChainMergeKey.set(chain.id, chain.id);
    } else {
      // Single agreed BE chain_id → merge under that key.
      subChainMergeKey.set(chain.id, beIds.values().next().value as string);
    }
  }

  // Group sub-chains by their merge key. Multi-member groups will
  // collapse into one merged chain below.
  const subChainsByMergeKey = new Map<string, MoveChain[]>();
  for (const chain of chains) {
    const key = subChainMergeKey.get(chain.id)!;
    const list = subChainsByMergeKey.get(key);
    if (list) list.push(chain);
    else subChainsByMergeKey.set(key, [chain]);
  }

  // Union-find over ecosystem ids: two ecosystems collapse if any
  // chain in one and any chain in the other share a BE chain_id
  // (i.e. they're going to merge into one chain). Using the
  // path-compressed walk so chains of unions stay shallow.
  const ecoParent = new Map<string, string>();
  const findEco = (x: string): string => {
    const p = ecoParent.get(x);
    if (!p || p === x) {
      ecoParent.set(x, x);
      return x;
    }
    const root = findEco(p);
    ecoParent.set(x, root);
    return root;
  };
  const unionEco = (a: string, b: string) => {
    const ra = findEco(a);
    const rb = findEco(b);
    if (ra !== rb) ecoParent.set(ra, rb);
  };
  for (const chain of chains) ecoParent.set(chain.ecosystemId, chain.ecosystemId);
  for (const subs of subChainsByMergeKey.values()) {
    if (subs.length < 2) continue;
    for (let i = 1; i < subs.length; i += 1) {
      unionEco(subs[0].ecosystemId, subs[i].ecosystemId);
    }
  }

  // Build merged chains. Single-sub groups pass through (id may
  // still flip from synthesized to BE-assigned). Multi-sub groups
  // concatenate intent ids in seed-id order, recompute step
  // colors against the new ordinals, and adopt the lowest seed id
  // as `seedIntentId`.
  const mergedChains: MoveChain[] = [];
  const mergedIntentToChainId = new Map<number, string>();
  for (const [mergeKey, subs] of subChainsByMergeKey) {
    if (subs.length === 1) {
      const single = subs[0];
      const finalEcoId = findEco(single.ecosystemId);
      const merged: MoveChain = {
        id: mergeKey,
        stepColors: single.stepColors,
        color: single.color,
        seedIntentId: single.seedIntentId,
        intentIds: single.intentIds,
        ecosystemId: finalEcoId,
      };
      mergedChains.push(merged);
      for (const intentId of single.intentIds)
        mergedIntentToChainId.set(intentId, mergeKey);
      continue;
    }
    // Sort constituent sub-chains by their seed id ascending so
    // the merged sequence is deterministic. Within each sub-chain
    // the existing FE-topology order (head → tail) is preserved.
    subs.sort((a, b) => a.seedIntentId - b.seedIntentId);
    const mergedIntentIds: number[] = [];
    for (const sub of subs) mergedIntentIds.push(...sub.intentIds);
    const stepColors = mergedIntentIds.map(
      (_, idx) => TECH_PALETTE[idx % TECH_PALETTE.length],
    );
    const finalEcoId = findEco(subs[0].ecosystemId);
    const merged: MoveChain = {
      id: mergeKey,
      stepColors,
      color: stepColors[0] ?? TECH_PALETTE[0],
      seedIntentId: subs[0].seedIntentId,
      intentIds: mergedIntentIds,
      ecosystemId: finalEcoId,
    };
    mergedChains.push(merged);
    for (const intentId of mergedIntentIds)
      mergedIntentToChainId.set(intentId, mergeKey);
  }

  // Sort merged chains by their seed id ascending (matches the
  // pre-merge contract — chip-row ordinal stability depends on it).
  mergedChains.sort((a, b) => a.seedIntentId - b.seedIntentId);

  // Build the final ecosystem list by grouping merged chains by
  // their already-resolved `ecosystemId`.
  const ecosystemMembers = new Map<string, string[]>();
  for (const chain of mergedChains) {
    const list = ecosystemMembers.get(chain.ecosystemId);
    if (list) list.push(chain.id);
    else ecosystemMembers.set(chain.ecosystemId, [chain.id]);
  }
  const mergedChainsById = new Map<string, MoveChain>();
  for (const c of mergedChains) mergedChainsById.set(c.id, c);
  const ecosystems: Ecosystem[] = [];
  for (const [ecoId, chainIds] of ecosystemMembers) {
    chainIds.sort(
      (a, b) =>
        (mergedChainsById.get(a)?.seedIntentId ?? 0) -
        (mergedChainsById.get(b)?.seedIntentId ?? 0),
    );
    ecosystems.push({ id: ecoId, chainIds });
  }
  // Sort ecosystems by their first chain's seed id for
  // deterministic output (matches the pre-merge contract).
  ecosystems.sort(
    (a, b) =>
      (mergedChainsById.get(a.chainIds[0])?.seedIntentId ?? 0) -
      (mergedChainsById.get(b.chainIds[0])?.seedIntentId ?? 0),
  );

  return {
    chains: mergedChains,
    ecosystems,
    intentToChainId: mergedIntentToChainId,
  };
}

// ─── helpers ────────────────────────────────────────────────────

function pushTo(map: Map<number, number[]>, key: number, value: number) {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
  } else {
    map.set(key, [value]);
  }
}

/**
 * Lookup helper used by ecosystem-id derivation BEFORE the BE-merge
 * pass rewrites chain ids. Pre-merge `chain.id` is always the
 * synthesized `chain-{seedIntentId}`, so we can read the seed id
 * straight off the chain row in `chains`. Post-merge consumers
 * should read `chain.seedIntentId` directly — never parse the chain
 * id string, which may be a BE-assigned UUID after the merge pass.
 */
function seedIntentIdOfChain(
  chainId: string,
  chains: readonly MoveChain[],
): number {
  for (const c of chains) if (c.id === chainId) return c.seedIntentId;
  return 0;
}

// ─── Slot projection (KEEP IN SYNC with logistics-linter.ts) ────
//
// Same projection rules as the linter's private
// `projectIntentsToTechSlots`. We don't import from the linter
// because that file is byte-identical with the REMIBackend mirror —
// widening its export surface would break the mirror invariant.
// Duplication is intentional; if you change the projection rules in
// either place, change them in both.

interface DestSlot {
  intent_id: number;
  appointment_id: number;
  technician_id: number;
  date: string;
  startMin: number;
  endMin: number;
}

interface SourceSlot {
  intent_id: number;
  appointment_id: number;
  technician_id: number;
  date: string;
  startMin: number;
  endMin: number;
}

function projectIntentsToTechSlots(
  intents: readonly ReorganizationIntent[],
  appointmentsById: ReadonlyMap<number, LinterAppointment>,
): DestSlot[] {
  const slots: DestSlot[] = [];
  for (const intent of intents) {
    if (intent.payload.kind === "reschedule") {
      if (intent.appointment_id === null) continue;
      const appt = appointmentsById.get(intent.appointment_id);
      const techId =
        intent.payload.new_technician_id ?? appt?.technician_id ?? null;
      if (techId === null) continue;
      slots.push({
        intent_id: intent.id,
        appointment_id: intent.appointment_id,
        technician_id: techId,
        date: intent.payload.new_scheduled_date,
        startMin: parseHmToMinutes(intent.payload.new_start_time),
        endMin: parseHmToMinutes(intent.payload.new_end_time),
      });
    } else if (intent.payload.kind === "reassign") {
      if (intent.appointment_id === null) continue;
      const appt = appointmentsById.get(intent.appointment_id);
      if (!appt) continue;
      slots.push({
        intent_id: intent.id,
        appointment_id: intent.appointment_id,
        technician_id: intent.payload.new_technician_id,
        date: appt.scheduled_date,
        startMin: parseHmToMinutes(appt.scheduled_start_time),
        endMin: parseHmToMinutes(appt.scheduled_end_time),
      });
    } else if (intent.payload.kind === "create") {
      if (intent.payload.technician_id === null) continue;
      slots.push({
        intent_id: intent.id,
        appointment_id: -intent.id,
        technician_id: intent.payload.technician_id,
        date: intent.payload.scheduled_date,
        startMin: parseHmToMinutes(intent.payload.scheduled_start_time),
        endMin: parseHmToMinutes(intent.payload.scheduled_end_time),
      });
    }
    // cancel + personal_event_* intents do not contribute a destination slot.
  }
  return slots;
}

/**
 * Source slots — each intent's pre-move tech-time slot. For
 * reschedule/reassign this is the appointment's CURRENT slot before
 * the proposed change. For `create` and `personal_event_*` there is
 * no source slot (nothing was there before), so we skip them.
 *
 * Cancels also project a source slot: cancelling an appointment
 * frees up its slot; a separate intent's destination overlapping
 * that vacated slot is still a chain edge in the user's mental
 * model. We surface it the same way.
 */
function projectIntentsToSourceSlots(
  intents: readonly ReorganizationIntent[],
  appointmentsById: ReadonlyMap<number, LinterAppointment>,
): SourceSlot[] {
  const slots: SourceSlot[] = [];
  for (const intent of intents) {
    if (intent.appointment_id === null) continue;
    if (
      intent.payload.kind !== "reschedule" &&
      intent.payload.kind !== "reassign" &&
      intent.payload.kind !== "cancel"
    ) {
      continue;
    }
    const appt = appointmentsById.get(intent.appointment_id);
    if (!appt) continue;
    if (appt.technician_id == null) continue;
    slots.push({
      intent_id: intent.id,
      appointment_id: intent.appointment_id,
      technician_id: appt.technician_id,
      date: appt.scheduled_date,
      startMin: parseHmToMinutes(appt.scheduled_start_time),
      endMin: parseHmToMinutes(appt.scheduled_end_time),
    });
  }
  return slots;
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function parseHmToMinutes(value: string): number {
  const parts = value.split(":");
  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`detect-move-chains: cannot parse time "${value}"`);
  }
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    throw new Error(`detect-move-chains: non-numeric time "${value}"`);
  }
  return h * 60 + m;
}
