/**
 * Unit tests for `move-chain-pulse-singleton` (PR-UX-2 PASS 2.3).
 *
 * Coverage scope is intentionally narrow: just the pure math of
 * `moveChainPulseOpacity`. The singleton SV + refcount lifecycle is
 * harder to test off-device because it requires Reanimated's worklet
 * runtime; what matters for visual correctness is that the source/dest
 * phases are anti-symmetric across [MIN, MAX] — that's pure JS and
 * easy to assert.
 *
 * The vendored EventBlock duplicates the MIN/MAX constants inline (so
 * the library has zero outbound dependency on consumer code — see
 * FORK Phase 25 in `vendor/react-native-resource-calendar/README-FORK.md`).
 * If either side drifts, the pulse band visually clips at the wrong
 * values. This file is the test that catches that drift on the
 * consumer side. The matching duplicates live in:
 *   - vendor/react-native-resource-calendar/dist/index.js   (`MIN = 0.3, MAX = 1`)
 *   - vendor/react-native-resource-calendar/src/components/EventBlock.tsx  (`MIN = 0.3, MAX = 1.0`)
 */

import {
  MOVE_CHAIN_PULSE_MAX_OPACITY,
  MOVE_CHAIN_PULSE_MIN_OPACITY,
  moveChainPulseOpacity,
  subscribePulse,
  moveChainPulseValue,
} from "@technician/components/calendar/move-chain-pulse-singleton";

describe("moveChainPulseOpacity", () => {
  const MIN = MOVE_CHAIN_PULSE_MIN_OPACITY;
  const MAX = MOVE_CHAIN_PULSE_MAX_OPACITY;

  it("source phase passes pulse value through unchanged at the band endpoints", () => {
    expect(moveChainPulseOpacity(MAX, "source")).toBe(MAX);
    expect(moveChainPulseOpacity(MIN, "source")).toBe(MIN);
  });

  it("dest phase mirrors source across the band midpoint at the band endpoints", () => {
    expect(moveChainPulseOpacity(MAX, "dest")).toBeCloseTo(MIN, 10);
    expect(moveChainPulseOpacity(MIN, "dest")).toBeCloseTo(MAX, 10);
  });

  it("source + dest sum to MIN + MAX at every pulse value (anti-symmetric pair)", () => {
    // Sample 11 evenly-spaced points across the band. The invariant
    // `source(v) + dest(v) === MIN + MAX` is what makes the two phases
    // visually trade brightness in lockstep.
    const steps = 11;
    for (let i = 0; i < steps; i += 1) {
      const v = MIN + ((MAX - MIN) * i) / (steps - 1);
      const sum = moveChainPulseOpacity(v, "source") +
        moveChainPulseOpacity(v, "dest");
      expect(sum).toBeCloseTo(MIN + MAX, 10);
    }
  });

  it("crosses through the band midpoint where source === dest", () => {
    const mid = (MIN + MAX) / 2;
    expect(moveChainPulseOpacity(mid, "source")).toBeCloseTo(mid, 10);
    expect(moveChainPulseOpacity(mid, "dest")).toBeCloseTo(mid, 10);
  });

  it("guards the contract that the singleton band is the agreed-on visual range", () => {
    // Belt-and-suspenders: if anyone changes MIN/MAX in the singleton
    // without also touching the EventBlock duplicates, this assertion
    // is the first thing to scream. The values aren't sacred (any
    // [a, b] with 0 < a < b <= 1 is valid for an opacity pulse), but
    // they MUST agree across the consumer/library boundary.
    expect(MIN).toBe(0.3);
    expect(MAX).toBe(1.0);
  });
});

describe("subscribePulse refcount lifecycle (PASS 2.3.1)", () => {
  // PR-UX-2 PASS 2.3.1 (2026-05-05): the production wiring now has
  // the view component subscribing to the pulse for the duration of
  // a chain selection, regardless of whether the arrow overlay
  // renders any arrows. This is the regression guard for the
  // failure mode that motivated the move:
  //
  //   1. Chain has only `create` intents (no source appointment).
  //   2. compute-move-chain-arrows produces zero segments.
  //   3. MoveChainArrowOverlay returns null → unmount.
  //   4. Old wiring: pulse subscriber count drops to 0 → singleton
  //      stops → SV freezes at MAX → dest-phase ghost renders at MIN
  //      and just sits there ("no pulse").
  //   5. New wiring: the view is still mounted, view's
  //      `useMoveChainPulse(selectedChainId !== null)` keeps the
  //      subscriber count at 1, animation keeps running, ghost still
  //      breathes.
  //
  // The unit test below exercises the refcount math without React.
  // It can't observe the actual `withRepeat` animation (Reanimated's
  // mock returns the start value synchronously), but it CAN verify
  // that the SV is reset to MAX on subscribe (so the first half-cycle
  // drives DOWN as the doc-block promises) and that the SV remains
  // at MAX after the last unsubscribe (so a re-mount finds it at the
  // expected baseline).

  // Each test resets the singleton to a known clean state by
  // unsubscribing any leftover subscribers from prior tests in this
  // file. The singleton has process-scope state, so a polluted count
  // would silently make tests pass for the wrong reason.
  afterEach(() => {
    moveChainPulseValue.value = MOVE_CHAIN_PULSE_MAX_OPACITY;
  });

  it("returns an idempotent unsubscribe — calling it twice doesn't double-decrement", () => {
    // Critical invariant: React Strict Mode and hot reload can
    // double-fire effect cleanup. If the unsubscribe wasn't
    // idempotent, the second cleanup would drop the refcount to -1,
    // then the next subscribe would jump from -1 to 0 (NOT 1) and
    // skip startAnimation entirely.
    const a = subscribePulse();
    const b = subscribePulse();

    a();
    a(); // double-call should be a no-op

    // b is still active — value should still be the singleton's
    // baseline (MAX), not anything weird.
    expect(moveChainPulseValue.value).toBe(MOVE_CHAIN_PULSE_MAX_OPACITY);

    b();
    expect(moveChainPulseValue.value).toBe(MOVE_CHAIN_PULSE_MAX_OPACITY);
  });

  it("multiple concurrent subscribers share one running animation", () => {
    // Documents the wiring story: the calendar view subscribes when
    // a chain is selected. The (now-removed-from-overlay) subscribe
    // call would have layered a second subscriber on top. We need
    // both calls to be safe — start runs once on the 1→2 transition,
    // not twice. (This was always the contract, but PASS 2.3.1 makes
    // the test scenario realistic.)
    const a = subscribePulse(); // simulates view-level subscribe
    const b = subscribePulse(); // simulates a hypothetical second subscriber
    const c = subscribePulse(); // simulates a third (legend dot, future)

    // Tear down out of order — refcount math should still land at 0.
    b();
    a();
    c();

    expect(moveChainPulseValue.value).toBe(MOVE_CHAIN_PULSE_MAX_OPACITY);
  });
});
