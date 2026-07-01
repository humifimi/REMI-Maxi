/**
 * `move-chain-pulse-resolver` (PR-UX-2 PASS 2.3, 2026-05-05).
 *
 * Per-event classifier that decides whether a calendar tile should
 * pulse and which phase it pulses in. Returned as a tuple of the
 * singleton SharedValue + a phase tag so the vendored EventBlock's
 * `useAnimatedStyle` worklet can compute opacity without ever
 * crossing back into JS.
 *
 * Returns `null` for any event that should NOT pulse — this includes
 * the "Show all" baseline (`selectedChainId === null`), tiles that
 * aren't part of any chain when one is selected (those just dim via
 * the border-override path), and personal events that have no
 * underlying appointment id to map back to an intent.
 *
 * IMPORTANT: this resolver MUST stay in sync with
 * `applyMoveChainBorderOverride` — both walk the same chain graph
 * and must agree on which tiles count as chain members. They don't
 * share code today because the border override needs to compute
 * `dim` styles for the non-pulsing path which the resolver doesn't
 * care about, but the chain-membership conditional below is the
 * mirror of that helper's. If you change one, change the other in
 * the same PR.
 */

import type { Event as RCEvent } from "react-native-resource-calendar";
import type { SharedValue } from "react-native-reanimated";

import { ALL_CHAINS_SENTINEL } from "@technician/components/calendar/MoveChainChipRow";
import { getMoveChainGhostMeta } from "@technician/components/calendar/move-chain-ghost-tiles";
import {
  moveChainPulseValue,
  type MoveChainPulsePhase,
} from "@technician/components/calendar/move-chain-pulse-singleton";
import type { MoveChain, MoveChainGraph } from "@technician/utils/detect-move-chains";
import type { ReorganizationIntent } from "@technician/types/reorganization";
import { getAppointmentFromEvent } from "@technician/utils/resource-calendar-mapping";

export interface MoveChainPulseDescriptor {
  /**
   * Module-singleton SharedValue. Always the same reference for
   * every descriptor returned in a given JS bundle — Reanimated's
   * dependency-array equality on the consumer's `useAnimatedStyle`
   * stays stable across re-renders, so the worklet doesn't rebuild.
   */
  sv: SharedValue<number>;
  phase: MoveChainPulsePhase;
}

export interface ResolveMoveChainPulseArgs {
  graph: MoveChainGraph;
  selectedChainId: string | null;
  /** Same `localIntents` slice fed to `applyMoveChainBorderOverride`. */
  localIntents: ReorganizationIntent[];
  /**
   * PR-UX-2 PASS 2.11 (task `c8`): per-step spotlight set for the
   * actively isolated chain. Pulse fires only on cards whose step
   * ordinal is in the lit set. Empty + chain isolated → no pulse
   * anywhere (matches "all dots dim" initial state). Null/undefined
   * + chain isolated → pulse all cards in the chain (pre-c8).
   */
  chainStepHighlights?: readonly number[] | null;
}

export function resolveMoveChainPulse(
  event: RCEvent,
  args: ResolveMoveChainPulseArgs,
): MoveChainPulseDescriptor | null {
  const { graph, selectedChainId, localIntents, chainStepHighlights } = args;

  // No chain selected → no pulse on anything. The chip row's "Show
  // all" pill is the only thing that should signal "we're in
  // pending-reality mode" in this state.
  // NOTE on logging: we intentionally DO NOT log the no-chain
  // baseline path. With ~30+ events per visible day window and the
  // pulse resolver running on every render, that would drown Metro
  // in noise during normal calendar use. We log only when a chain
  // IS selected — i.e. when the resolver is actually doing work
  // that could go wrong. This mirrors `[MoveChain:Border]`'s
  // policy of logging dim/highlight decisions per event but staying
  // silent in the Show-all baseline.
  if (selectedChainId == null) return null;
  if (graph.chains.length === 0) return null;

  // PR-UX-2 PASS 2.4 (2026-05-05): "Show all" mode is a static
  // overview — every chain renders highlighted in its own color
  // simultaneously, but nothing animates. Per user direction:
  // pulsing in this mode produces a visually busy, syncopated wall
  // of motion when 3+ chains are on screen (every source AND every
  // ghost in every chain breathes in lockstep, which reads as
  // "everything is broken" rather than "every chain is selected").
  // Single-chain isolate mode keeps the pulse — that's where the
  // animation pays its rent by drawing the eye to the FROM/TO pair
  // for one specific staged move.
  if (selectedChainId === ALL_CHAINS_SENTINEL) {
    if (__DEV__) {
      console.log("[MoveChain:Pulse:Resolver]", {
        decision: "skip",
        reason: "show-all-mode-static",
        eventId: event.id,
        selectedChainId,
      });
    }
    return null;
  }

  // Ghost tiles are always destination-phase. They can only exist
  // on screen while a chain is selected (their visibility is gated
  // upstream by `getVisibleMoveChainDestSlots`, which already
  // applies the per-step spotlight filter). Belt-and-suspenders:
  // re-check spotlight membership here so a stale ghost event that
  // outlived its spotlight tap doesn't keep pulsing.
  const ghost = getMoveChainGhostMeta(event);
  if (ghost) {
    const ghostChain = graph.chains.find((c) => c.id === ghost.chainId);
    const ghostStepOrdinal = stepOrdinalFor(ghostChain, ghost.intentId);
    if (
      chainStepHighlights != null &&
      ghostStepOrdinal != null &&
      !chainStepHighlights.includes(ghostStepOrdinal)
    ) {
      if (__DEV__) {
        console.log("[MoveChain:Pulse:Resolver]", {
          decision: "skip",
          reason: "ghost-not-in-spotlight",
          eventId: event.id,
          intentId: ghost.intentId,
          chainId: ghost.chainId,
          stepOrdinal: ghostStepOrdinal,
          selectedChainId,
        });
      }
      return null;
    }
    if (__DEV__) {
      console.log("[MoveChain:Pulse:Resolver]", {
        decision: "dest-phase-ghost",
        eventId: event.id,
        intentId: ghost.intentId,
        chainId: ghost.chainId,
        selectedChainId,
      });
    }
    return { sv: moveChainPulseValue, phase: "dest" };
  }

  // Real appointment → only pulses when it belongs to the
  // currently-selected chain (or any chain in "All chains" mode).
  const appointment = getAppointmentFromEvent(event);
  if (!appointment) {
    if (__DEV__) {
      console.log("[MoveChain:Pulse:Resolver]", {
        decision: "skip",
        reason: "no-appointment-mapping",
        eventId: event.id,
        selectedChainId,
      });
    }
    return null;
  }

  const intentForAppt = localIntents.find(
    (i) => i.appointment_id === appointment.id,
  );
  if (!intentForAppt) {
    // Real appointment with no staged intent — the common case for
    // every untouched event on screen. We log it because a pulse
    // bug can manifest as "wrong cards pulsing" and seeing this
    // line for an event that should be in a chain is a fast
    // smoking gun (the linter probably failed to detect the
    // intent's appointment).
    if (__DEV__) {
      console.log("[MoveChain:Pulse:Resolver]", {
        decision: "skip",
        reason: "no-intent-for-appointment",
        eventId: event.id,
        appointmentId: appointment.id,
        selectedChainId,
      });
    }
    return null;
  }

  const chainId = graph.intentToChainId.get(intentForAppt.id);
  if (!chainId) {
    if (__DEV__) {
      console.log("[MoveChain:Pulse:Resolver]", {
        decision: "skip",
        reason: "intent-not-in-any-chain",
        eventId: event.id,
        intentId: intentForAppt.id,
        selectedChainId,
      });
    }
    return null;
  }

  // After the PASS 2.4 early-return above, `selectedChainId` is
  // guaranteed to be a real chain id at this point (not null, not
  // the all-chains sentinel) — so a simple equality is the correct
  // membership check.
  if (selectedChainId === chainId) {
    // PR-UX-2 PASS 2.11 (task `c8`): in chain-isolate mode the
    // per-step spotlight set narrows which cards pulse. Empty set
    // → no pulse anywhere ("all dots dim"); partial set → only
    // those step ordinals; null/undefined → fall through to the
    // pre-c8 "every chain card pulses" behavior.
    const chain = graph.chains.find((c) => c.id === chainId);
    const sourceStepOrdinal = stepOrdinalFor(chain, intentForAppt.id);
    if (
      chainStepHighlights != null &&
      sourceStepOrdinal != null &&
      !chainStepHighlights.includes(sourceStepOrdinal)
    ) {
      if (__DEV__) {
        console.log("[MoveChain:Pulse:Resolver]", {
          decision: "skip",
          reason: "source-not-in-spotlight",
          eventId: event.id,
          intentId: intentForAppt.id,
          chainId,
          stepOrdinal: sourceStepOrdinal,
          selectedChainId,
        });
      }
      return null;
    }
    if (__DEV__) {
      console.log("[MoveChain:Pulse:Resolver]", {
        decision: "source-phase",
        eventId: event.id,
        intentId: intentForAppt.id,
        chainId,
        selectedChainId,
      });
    }
    return { sv: moveChainPulseValue, phase: "source" };
  }

  if (__DEV__) {
    console.log("[MoveChain:Pulse:Resolver]", {
      decision: "skip",
      reason: "different-chain",
      eventId: event.id,
      intentId: intentForAppt.id,
      chainId,
      selectedChainId,
    });
  }
  return null;
}

/**
 * Resolve an intent id's 0-based ordinal within a chain. Returns
 * `null` when the chain or intent isn't found — callers treat that
 * as "no spotlight check applicable" so a missing-chain ghost
 * doesn't accidentally start pulsing.
 */
function stepOrdinalFor(
  chain: MoveChain | undefined,
  intentId: number,
): number | null {
  if (!chain) return null;
  const idx = chain.intentIds.indexOf(intentId);
  return idx < 0 ? null : idx;
}
