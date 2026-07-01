/**
 * Tests for `useCleanIntentPromotion` (PR-UX-20 + FE-CR-1-1).
 *
 * Coverage:
 *   1. `pickPromotionCandidate` pure helper — oldest-first ordering.
 *   2. Returns null when no intents are staged.
 *   3. Picks the single 1-link clean intent in a basic scenario.
 *   4. Skips an intent the BE marked `clean: false` (FE-CR-1-1).
 *   5. Skips an intent with `clean: undefined` (BE drift; FE-CR-1-1).
 *   6. Ignores legacy `usePendingRealityStore.linterIssues` — the
 *      hook no longer reads that slot (FE-CR-1-1).
 *   7. Skips an intent that's per-intent suppressed.
 *   8. Skips an intent that's snoozed.
 *   9. Returns null when the system-wide cooldown is active.
 *  10. Returns null when the user setting is OFF.
 *  11. `cleanIntents` (sweep list) is NOT filtered by snooze /
 *      suppression — those filters apply only to the toast pick.
 *  12. Cleanup effect — per-intent counters / snoozes for intents
 *      that left the session are cleared.
 */

import { act, renderHook } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  pickPromotionCandidate,
  useCleanIntentPromotion,
} from "../use-clean-intent-promotion";
import {
  __resetCleanIntentPromotionStoreForTests,
  useCleanIntentPromotionStore,
} from "@technician/stores/clean-intent-promotion";
import {
  __resetCleanIntentSettingsStoreForTests,
  useCleanIntentSettingsStore,
} from "@technician/stores/clean-intent-settings";
import {
  __resetCleanIntentSnoozeStoreForTests,
  useCleanIntentSnoozeStore,
} from "@technician/stores/clean-intent-snooze";
import {
  __resetPendingRealityStoreForTests,
  usePendingRealityStore,
} from "@technician/stores/pending-reality";
import { makeIntent, makeSession } from "@technician/stores/__fixtures__/pending-reality";
import type { ReorganizationIntent } from "@technician/types/reorganization";
import type { LinterAppointment } from "@technician/utils/logistics-linter";

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetPendingRealityStoreForTests();
  __resetCleanIntentPromotionStoreForTests();
  __resetCleanIntentSnoozeStoreForTests();
  __resetCleanIntentSettingsStoreForTests();
});

/**
 * Build a linter appointment fixture. The chain detector projects
 * intents against this list to build the move-chain graph.
 */
function makeAppt(id: number, overrides: Partial<LinterAppointment> = {}): LinterAppointment {
  return {
    id,
    customer_id: 9000 + id,
    technician_id: 5,
    franchise_id: 1,
    status: "scheduled",
    scheduled_date: "2026-04-25",
    scheduled_start_time: "09:00",
    scheduled_end_time: "10:00",
    ...overrides,
  };
}

/** A 1-link reschedule intent: appointment moves to a NEW slot. */
function makeCleanReschedule(
  id: number,
  apptId: number,
  proposedAt: string,
): ReorganizationIntent {
  return makeIntent(id, {
    appointment_id: apptId,
    intent_type: "reschedule",
    payload: {
      kind: "reschedule",
      new_scheduled_date: "2026-04-26",
      new_start_time: "11:00",
      new_end_time: "12:00",
    },
    proposed_at: proposedAt,
  });
}

describe("pickPromotionCandidate (pure)", () => {
  it("picks the oldest by proposed_at", () => {
    const a = makeCleanReschedule(101, 5101, "2026-04-23T10:00:00.000Z");
    const b = makeCleanReschedule(102, 5102, "2026-04-23T09:00:00.000Z");
    const c = makeCleanReschedule(103, 5103, "2026-04-23T11:00:00.000Z");
    expect(pickPromotionCandidate([a, b, c])?.id).toBe(102);
  });
  it("breaks ties on smaller id when proposed_at matches", () => {
    const a = makeCleanReschedule(101, 5101, "2026-04-23T10:00:00.000Z");
    const b = makeCleanReschedule(99, 5102, "2026-04-23T10:00:00.000Z");
    expect(pickPromotionCandidate([a, b])?.id).toBe(99);
  });
  it("returns null on empty input", () => {
    expect(pickPromotionCandidate([])).toBeNull();
  });
});

describe("useCleanIntentPromotion — basic detection", () => {
  it("returns null when no intents are staged", () => {
    const { result } = renderHook(() =>
      useCleanIntentPromotion({ appointments: [] }),
    );
    expect(result.current.currentlyPromotingIntent).toBeNull();
    expect(result.current.cleanIntents).toEqual([]);
  });

  it("picks the single clean reschedule intent", () => {
    act(() => {
      usePendingRealityStore.getState().setSession(makeSession());
      usePendingRealityStore
        .getState()
        .addIntent(
          makeCleanReschedule(101, 5101, "2026-04-23T10:00:00.000Z"),
        );
    });
    const appts = [makeAppt(5101, { technician_id: 5 })];
    const { result } = renderHook(() =>
      useCleanIntentPromotion({ appointments: appts }),
    );
    expect(result.current.currentlyPromotingIntent?.id).toBe(101);
    expect(result.current.cleanIntents).toHaveLength(1);
  });

  it("skips intents the BE marked clean: false (FE-CR-1-1)", () => {
    act(() => {
      usePendingRealityStore.getState().setSession(makeSession());
      // BE-attached conflict — the hook reads `intent.clean` directly
      // from the wire-shape field instead of running a local linter.
      const conflicting = makeIntent(101, {
        appointment_id: 5101,
        intent_type: "reschedule",
        payload: {
          kind: "reschedule",
          new_scheduled_date: "2026-04-26",
          new_start_time: "11:00",
          new_end_time: "12:00",
        },
        proposed_at: "2026-04-23T10:00:00.000Z",
        clean: false,
        conflicts: [
          {
            severity: "error",
            kind: "time_conflict",
            affectedAppointmentIds: [5101],
            humanMessage: "Conflict with existing appointment.",
          },
        ],
      });
      usePendingRealityStore.getState().addIntent(conflicting);
    });
    const appts = [makeAppt(5101)];
    const { result } = renderHook(() =>
      useCleanIntentPromotion({ appointments: appts }),
    );
    expect(result.current.currentlyPromotingIntent).toBeNull();
    expect(result.current.cleanIntents).toEqual([]);
  });

  it("skips intents with clean: undefined (BE drift; FE-CR-1-1)", () => {
    // Silence the __DEV__ warning for this single test; we WANT the
    // hook to fire it but a `expect()` on console output is brittle.
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      act(() => {
        usePendingRealityStore.getState().setSession(makeSession());
        const drifted = makeIntent(101, {
          appointment_id: 5101,
          intent_type: "reschedule",
          payload: {
            kind: "reschedule",
            new_scheduled_date: "2026-04-26",
            new_start_time: "11:00",
            new_end_time: "12:00",
          },
          proposed_at: "2026-04-23T10:00:00.000Z",
          clean: undefined,
        });
        usePendingRealityStore.getState().addIntent(drifted);
      });
      const appts = [makeAppt(5101)];
      const { result } = renderHook(() =>
        useCleanIntentPromotion({ appointments: appts }),
      );
      // Conservatively excluded — better to under-promote than
      // mis-promote.
      expect(result.current.currentlyPromotingIntent).toBeNull();
      expect(result.current.cleanIntents).toEqual([]);
      // And the drift warning fired at least once.
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("ignores legacy linterIssues store slot (FE-CR-1-1)", () => {
    // Regression guard: before FE-CR-1-1 the hook read this slot for
    // its conflict check. The slot is still written by the local
    // linter (used by `useSessionAwareSubmit` for the intercept
    // popup) but `useCleanIntentPromotion` no longer reads it.
    // An intent with `clean: true` on the wire must still be
    // promotable even when a stale issue sits in the store slot.
    act(() => {
      usePendingRealityStore.getState().setSession(makeSession());
      usePendingRealityStore
        .getState()
        .addIntent(
          makeCleanReschedule(101, 5101, "2026-04-23T10:00:00.000Z"),
        );
      usePendingRealityStore.setState({
        linterIssues: [
          {
            severity: "error",
            kind: "time_conflict",
            affectedAppointmentIds: [5101],
            humanMessage: "Legacy linter slot — should be ignored.",
          },
        ],
      });
    });
    const appts = [makeAppt(5101)];
    const { result } = renderHook(() =>
      useCleanIntentPromotion({ appointments: appts }),
    );
    expect(result.current.currentlyPromotingIntent?.id).toBe(101);
    expect(result.current.cleanIntents).toHaveLength(1);
  });
});

describe("useCleanIntentPromotion — suppression / snooze / settings", () => {
  it("respects per-intent suppression", () => {
    act(() => {
      usePendingRealityStore.getState().setSession(makeSession());
      usePendingRealityStore
        .getState()
        .addIntent(
          makeCleanReschedule(101, 5101, "2026-04-23T10:00:00.000Z"),
        );
      // Hit the suppression threshold (2).
      useCleanIntentPromotionStore.getState().recordDismissal(101);
      useCleanIntentPromotionStore.getState().recordDismissal(101);
    });
    const appts = [makeAppt(5101)];
    const { result } = renderHook(() =>
      useCleanIntentPromotion({ appointments: appts }),
    );
    expect(result.current.currentlyPromotingIntent).toBeNull();
    // BUT cleanIntents (sweep pool) still exposes it — the user can
    // override via the explicit Sweep button.
    expect(result.current.cleanIntents).toHaveLength(1);
  });

  it("respects per-intent snooze", () => {
    act(() => {
      usePendingRealityStore.getState().setSession(makeSession());
      usePendingRealityStore
        .getState()
        .addIntent(
          makeCleanReschedule(101, 5101, "2026-04-23T10:00:00.000Z"),
        );
      useCleanIntentSnoozeStore.getState().snoozeIntentForCard(101);
    });
    const appts = [makeAppt(5101)];
    const { result } = renderHook(() =>
      useCleanIntentPromotion({ appointments: appts }),
    );
    expect(result.current.currentlyPromotingIntent).toBeNull();
    expect(result.current.cleanIntents).toHaveLength(1);
  });

  it("returns null while the system-wide cooldown is active", () => {
    act(() => {
      usePendingRealityStore.getState().setSession(makeSession());
      usePendingRealityStore
        .getState()
        .addIntent(
          makeCleanReschedule(101, 5101, "2026-04-23T10:00:00.000Z"),
        );
      // Trip the system-wide cooldown by recording 5 fast dismissals
      // for OTHER intents.
      const store = useCleanIntentPromotionStore.getState();
      for (let i = 0; i < 5; i += 1) {
        store.recordDismissal(900 + i);
      }
    });
    const appts = [makeAppt(5101)];
    const { result } = renderHook(() =>
      useCleanIntentPromotion({ appointments: appts }),
    );
    expect(result.current.currentlyPromotingIntent).toBeNull();
  });

  it("returns null when showCleanMoveSuggestions is OFF", () => {
    act(() => {
      usePendingRealityStore.getState().setSession(makeSession());
      usePendingRealityStore
        .getState()
        .addIntent(
          makeCleanReschedule(101, 5101, "2026-04-23T10:00:00.000Z"),
        );
      useCleanIntentSettingsStore.getState().setShowCleanMoveSuggestions(false);
    });
    const appts = [makeAppt(5101)];
    const { result } = renderHook(() =>
      useCleanIntentPromotion({ appointments: appts }),
    );
    expect(result.current.currentlyPromotingIntent).toBeNull();
    // sweep pool unchanged — the setting only gates the toast.
    expect(result.current.cleanIntents).toHaveLength(1);
  });
});

describe("useCleanIntentPromotion — cleanup effect", () => {
  it("clears per-intent suppression for intents that left the session", () => {
    act(() => {
      usePendingRealityStore.getState().setSession(makeSession());
      usePendingRealityStore
        .getState()
        .addIntent(
          makeCleanReschedule(101, 5101, "2026-04-23T10:00:00.000Z"),
        );
      useCleanIntentPromotionStore.getState().recordDismissal(101);
      useCleanIntentPromotionStore.getState().recordDismissal(101);
    });
    const appts = [makeAppt(5101)];
    const { rerender } = renderHook(
      ({ a }: { a: LinterAppointment[] }) =>
        useCleanIntentPromotion({ appointments: a }),
      { initialProps: { a: appts } },
    );
    // Intent leaves the session.
    act(() => {
      usePendingRealityStore.getState().removeIntent(101);
    });
    rerender({ a: appts });
    expect(
      useCleanIntentPromotionStore.getState().dismissalsByIntentId["101"],
    ).toBeUndefined();
  });
});
