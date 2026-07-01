/**
 * `move-chain-pulse-singleton` (PR-UX-2 PASS 2.3, 2026-05-05).
 *
 * The PASS 2.2 implementation pulsed the SVG arrows. The user
 * (correctly) called that out as the wrong thing — arrows should be
 * a steady directional indicator; the *tiles* are what should breathe
 * to draw the eye to the chain. This module replaces the per-instance
 * `useSharedValue` from `useMoveChainPulse` with a single
 * module-scoped Reanimated SharedValue that:
 *
 *   1. Is shared across every consumer that wants to read it (the
 *      arrow overlay, the calendar tiles via FORK Phase 25's
 *      `getEventOpacity` hook, future legend dots, etc.).
 *   2. Animates only while at least one consumer has subscribed
 *      (refcount), so an unselected calendar burns no worklet timer.
 *   3. Is bound at module load, not in a hook, so non-React code
 *      paths (vendored EventBlock's `useAnimatedStyle` worklet) can
 *      still read the live value just by importing the SV.
 *
 * Architectural note on `makeMutable` vs `useSharedValue`:
 * Reanimated's `makeMutable` is the lower-level primitive
 * `useSharedValue` is built on. It returns a normal SharedValue but
 * doesn't require a React render context — perfect for module-scope
 * singletons that need to outlive any one component instance. We
 * deliberately use it here so the same SV survives a chain selection
 * flip / chip swap without a remount fight.
 *
 * Phase model:
 *   - `pulseValue` ranges in [0, 1] (fraction of the half-cycle).
 *   - "source" tiles compute opacity = lerp(MIN, MAX, pulseValue).
 *   - "dest" tiles compute opacity = lerp(MAX, MIN, pulseValue),
 *     i.e. anti-phase. Same SV, opposite interpretation, so source
 *     fades down as dest fades up and vice versa — visually they
 *     "trade attention" at the chain's tempo.
 *
 * Why one SV with phase-aware interpolation rather than two SVs:
 * Two SVs animating in lockstep would be redundant work on the UI
 * thread (two `withRepeat` timers running at the same rate), and
 * keeps every tile's worklet dependency identical so re-renders
 * don't churn. The interpolation flip is a single multiplication
 * inside the worklet — cheaper than maintaining a second timer.
 */

import {
  Easing,
  cancelAnimation,
  makeMutable,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { VERBOSE_CALENDAR_LOGS } from "@technician/utils/calendar-debug-logs";

export const MOVE_CHAIN_PULSE_MIN_OPACITY = 0.3;
export const MOVE_CHAIN_PULSE_MAX_OPACITY = 1.0;
/**
 * Half-cycle duration (one fade-in OR one fade-out). Full
 * MAX→MIN→MAX yo-yo takes `2 * MOVE_CHAIN_PULSE_HALF_CYCLE_MS`.
 *
 * 2026-05-05 (PR-UX-2 PASS 2.12): bumped from 600ms → 1500ms per
 * direct user feedback — the original cadence read as "frantic
 * blinking" on a phone screen, especially with multiple chain
 * cards pulsing in lockstep. 1500ms produces a slow, calm
 * heartbeat (~20 BPM) that draws the eye without feeling urgent.
 * Numbers above ~2000ms started to look "broken / stuck" in
 * design review; numbers below ~1100ms re-introduced the
 * frantic feel.
 *
 * Exported so tests and any future status-indicator consumers
 * can reference the canonical value rather than re-deriving it.
 */
export const MOVE_CHAIN_PULSE_HALF_CYCLE_MS = 1500;

/**
 * The singleton pulse SharedValue. Always defined; reads `1.0`
 * (full bright) when the animation isn't running.
 *
 * Consumers should NEVER write to this directly — call `subscribePulse`
 * which manages refcount + lifecycle. The vendored EventBlock reads
 * this in a `useAnimatedStyle` worklet, so any write outside the
 * subscriber lifecycle would race the animation engine.
 */
export const moveChainPulseValue: SharedValue<number> = makeMutable<number>(
  MOVE_CHAIN_PULSE_MAX_OPACITY,
);

let subscriberCount = 0;

/**
 * JS-thread heartbeat sampler used to verify the UI-thread worklet
 * is actually animating (not silently stuck).
 *
 * Why a continuous heartbeat instead of a one-shot burst at start:
 * the previous implementation logged 6 samples in the first 1.2s
 * after start, then went quiet. Capturing a log dump mid-session
 * (the common case) misses the burst entirely and the sampler tells
 * you nothing. Heartbeat-style means any log dump grabbed while a
 * chain is selected will include several recent samples — you can
 * always see whether the SV is oscillating or stuck.
 *
 * Cadence rationale: 250ms is intentionally non-coprime with the
 * 600ms half-cycle so we don't alias to a fixed phase. Over a few
 * heartbeats a healthy pulse drifts through the [MIN, MAX] band; a
 * frozen worklet logs the same value every time. Cheap (one bridge
 * read + one console.log every 250ms = ~4 lines/sec, which is dwarfed
 * by per-render resolver logs already in flight).
 *
 * Production cost: zero — `__DEV__` is `false` in release builds and
 * the whole sampler is dead code under tree-shaking.
 */
const SAMPLER_HEARTBEAT_MS = 250;
let samplerTimer: ReturnType<typeof setInterval> | null = null;
let samplerSeq = 0;

function startSampler(): void {
  // 2026-05-07 follow-up — gated behind `VERBOSE_CALENDAR_LOGS`
  // (default off). The 250ms heartbeat fires 4× per second WHILE
  // ANY chain is selected — at the 9-intent freeze repro the user
  // had a chain isolated for several minutes, so this single
  // sampler pumped thousands of log lines into Metro. Even though
  // the sampler reads a SharedValue (cheap), the bridge cost +
  // Metro WS write + the LogBox queue update aren't free.
  if (!VERBOSE_CALENDAR_LOGS) return;
  if (samplerTimer !== null) {
    // Safety: re-entrancy. startAnimation() is only called when
    // subscriberCount goes 0 → 1, but if anything ever called
    // startSampler twice without an intervening stop we'd leak a
    // timer. Clearing first is idempotent and cheap.
    clearInterval(samplerTimer);
    samplerTimer = null;
  }
  samplerSeq = 0;
  samplerTimer = setInterval(() => {
    samplerSeq += 1;
    // SharedValue reads ARE valid from JS; this is the cheapest way
    // to introspect the worklet's current state without installing a
    // useDerivedValue on every consumer.
    console.log("[MoveChain:Pulse:Singleton] heartbeat", {
      seq: samplerSeq,
      value: moveChainPulseValue.value,
    });
  }, SAMPLER_HEARTBEAT_MS);
}

function stopSampler(): void {
  if (samplerTimer !== null) {
    clearInterval(samplerTimer);
    samplerTimer = null;
  }
}

function startAnimation(): void {
  if (VERBOSE_CALENDAR_LOGS) {
    console.log("[MoveChain:Pulse:Singleton] start", {
      min: MOVE_CHAIN_PULSE_MIN_OPACITY,
      max: MOVE_CHAIN_PULSE_MAX_OPACITY,
      halfCycleMs: MOVE_CHAIN_PULSE_HALF_CYCLE_MS,
    });
  }
  // Reset to full bright so the first half-cycle drives DOWN. Without
  // this, a re-subscribe after the previous unsubscribe could start
  // mid-cycle and the source/dest tiles would breathe out of phase
  // with what the user expects on entry.
  moveChainPulseValue.value = MOVE_CHAIN_PULSE_MAX_OPACITY;
  moveChainPulseValue.value = withRepeat(
    withTiming(MOVE_CHAIN_PULSE_MIN_OPACITY, {
      duration: MOVE_CHAIN_PULSE_HALF_CYCLE_MS,
      easing: Easing.inOut(Easing.ease),
    }),
    -1,
    true,
  );
  startSampler();
}

function stopAnimation(): void {
  if (VERBOSE_CALENDAR_LOGS) {
    console.log("[MoveChain:Pulse:Singleton] stop");
  }
  cancelAnimation(moveChainPulseValue);
  moveChainPulseValue.value = MOVE_CHAIN_PULSE_MAX_OPACITY;
  stopSampler();
}

/**
 * Subscribe to the singleton pulse. Returns an unsubscribe function.
 * The animation runs while `subscriberCount > 0` and stops when the
 * count drops back to 0. Calls past 0 unsubscribers are no-ops
 * (safety against double-cleanup from Strict Mode / hot reload).
 */
export function subscribePulse(): () => void {
  subscriberCount += 1;
  if (VERBOSE_CALENDAR_LOGS) {
    console.log("[MoveChain:Pulse:Singleton] subscribe", {
      subscriberCount,
    });
  }
  if (subscriberCount === 1) {
    startAnimation();
  }
  let unsubscribed = false;
  return () => {
    if (unsubscribed) return;
    unsubscribed = true;
    subscriberCount -= 1;
    if (VERBOSE_CALENDAR_LOGS) {
      console.log("[MoveChain:Pulse:Singleton] unsubscribe", {
        subscriberCount,
      });
    }
    if (subscriberCount <= 0) {
      subscriberCount = 0;
      stopAnimation();
    }
  };
}

/**
 * Discriminator for which interpolation a chain-relevant tile uses.
 * `"source"` tiles are existing appointments that are part of the
 * chain (the appointments being moved). `"dest"` tiles are the ghost
 * frames showing where the chain lands. They breathe in opposite
 * phase to visually pair "this card is moving" ↔ "to this slot".
 */
export type MoveChainPulsePhase = "source" | "dest";

/**
 * Worklet-safe opacity computation. Use inside `useAnimatedStyle`:
 *
 *   const style = useAnimatedStyle(() => ({
 *     opacity: moveChainPulseOpacity(moveChainPulseValue.value, phase),
 *   }));
 *
 * Pure function so unit tests can verify the math without touching
 * Reanimated. Accepts the raw pulse value (already in
 * [MIN, MAX] thanks to the singleton's `withRepeat(withTiming(MIN))`
 * shape — `withRepeat(..., true)` reverses the timing each cycle so
 * the SV traverses MAX→MIN→MAX→MIN, never oscillating outside the
 * range).
 */
export function moveChainPulseOpacity(
  pulse: number,
  phase: MoveChainPulsePhase,
): number {
  "worklet";
  if (phase === "source") return pulse;
  // "dest": flip around the midpoint of [MIN, MAX] so the two phases
  // cross at the midpoint and stay anti-symmetric end-to-end.
  return MOVE_CHAIN_PULSE_MAX_OPACITY + MOVE_CHAIN_PULSE_MIN_OPACITY - pulse;
}
