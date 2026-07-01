/**
 * Tests for `computePendingChangeOverlay` (P3-FE-8 / C.12) — the
 * pure merge helper behind `usePendingChangeOverlay`. The hook
 * itself is exercised indirectly via this helper since the merge
 * contract is the only behavior under test (the hook just wraps it
 * with a Zustand subscription + a stable `useMemo`).
 *
 * NOTE: this repo does not currently ship a Jest runner end-to-end
 * (see `src/stores/__tests__/pending-reality.test.ts` for the same
 * disclaimer). The file follows the canonical jest-expo shape — every
 * assertion below should pass once the runner lands.
 *
 * Coverage:
 *   - null appointment → empty result.
 *   - BE annotation only (no local intents) → BE source / kinds /
 *     count / session_id pass through.
 *   - Local store only (no BE annotation) → source forced to
 *     `tech_app`, kinds derived from store entries, session id from
 *     local store.
 *   - Both with conflict → local wins (BE annotation ignored).
 *   - Neither → empty result.
 */

import {
  __resetOrphanSessionLogDedupeForTests,
  computePendingChangeOverlay,
} from "../use-pending-change-overlay";
import type { CalendarAppointmentItem } from "@technician/types/calendar";
import type {
  PendingIntentSummary,
  ReorganizationIntent,
} from "@technician/types/reorganization";

// 2026-05-07 follow-up — the orphan-session log dedupe is module
// scope (single Set survives across tests in the same Jest worker
// unless reset). Clear it before every test so each spec sees a
// fresh "first observation" baseline; otherwise the second test's
// orphan id would silently no-op the log assertion.
beforeEach(() => {
  __resetOrphanSessionLogDedupeForTests();
});

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

function makeAppointment(
  overrides: Partial<CalendarAppointmentItem> = {},
): CalendarAppointmentItem {
  return {
    id: 5001,
    customer_id: 3001,
    customer_name: "Mr. Smith",
    customer_phone: null,
    has_card_on_file: false,
    technician_id: 42,
    technician_name: "Tech A",
    franchise_id: 1,
    status: "scheduled",
    scheduled_date: "2026-04-24",
    scheduled_time: "09:00",
    scheduled_end_time: "10:00",
    started_at: null,
    completed_at: null,
    slot_type: "standard",
    booking_method: "manual",
    location_type: "onsite",
    location_address: null,
    notification_preference: "email",
    explanation: null,
    scoring_factors: null,
    appointment_note: null,
    cancellation_reason: null,
    cancelled_at: null,
    no_show_at: null,
    recurrence_rule: null,
    recurrence_series_id: null,
    fleet_account_id: null,
    booked_by: null,
    booked_by_name: null,
    services: [],
    tax_lines: [],
    alerts: [],
    pending_intent_summary: null,
    created_at: "2026-04-23T15:00:00.000Z",
    updated_at: "2026-04-23T15:00:00.000Z",
    ...overrides,
  } as CalendarAppointmentItem;
}

function makeSummary(
  overrides: Partial<PendingIntentSummary> = {},
): PendingIntentSummary {
  return {
    intent_count: 1,
    kinds: ["reschedule"],
    source: "franchise_app",
    most_recent_session_id: 9001,
    ...overrides,
  };
}

function makeRescheduleIntent(
  overrides: Partial<ReorganizationIntent> = {},
): ReorganizationIntent {
  return {
    id: 9002,
    session_id: 7001,
    intent_type: "reschedule",
    intent_status: "proposed",
    appointment_id: 5001,
    personal_event_id: null,
    payload: {
      kind: "reschedule",
      new_scheduled_date: "2026-04-25",
      new_start_time: "09:00",
      new_end_time: "10:00",
    },
    inverse_payload: null,
    prior_state_snapshot: null,
    linter_dependency_edges: [],
    commit_order: null,
    proposed_at: "2026-04-23T15:01:00.000Z",
    committed_at: null,
    chain_id: "",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

describe("computePendingChangeOverlay", () => {
  it("returns empty result when appointment is null", () => {
    expect(computePendingChangeOverlay(null, [], null)).toEqual({
      isPending: false,
      source: null,
      kinds: [],
      intentCount: 0,
      mostRecentSessionId: null,
    });
  });

  it("returns BE annotation when only the summary has data", () => {
    const appt = makeAppointment({
      pending_intent_summary: makeSummary({
        source: "customer_app",
        kinds: ["reschedule", "reassign"],
        intent_count: 2,
        most_recent_session_id: 8200,
      }),
    });

    const result = computePendingChangeOverlay(appt, [], null);

    expect(result.isPending).toBe(true);
    expect(result.source).toBe("customer_app");
    expect(result.kinds).toEqual(["reschedule", "reassign"]);
    expect(result.intentCount).toBe(2);
    expect(result.mostRecentSessionId).toBe(8200);
  });

  it("forces source=tech_app when only the local store has data", () => {
    const appt = makeAppointment();
    const local = [makeRescheduleIntent({ id: 1 })];

    const result = computePendingChangeOverlay(appt, local, 7001);

    expect(result.isPending).toBe(true);
    expect(result.source).toBe("tech_app");
    expect(result.kinds).toEqual(["reschedule"]);
    expect(result.intentCount).toBe(1);
    expect(result.mostRecentSessionId).toBe(7001);
  });

  it("dedupes kinds when multiple local intents share the same type", () => {
    const appt = makeAppointment();
    const local = [
      makeRescheduleIntent({ id: 1 }),
      makeRescheduleIntent({ id: 2 }),
    ];

    const result = computePendingChangeOverlay(appt, local, 7001);

    expect(result.kinds).toEqual(["reschedule"]);
    // intentCount reflects the raw count, not the deduped kinds.
    expect(result.intentCount).toBe(2);
  });

  it("local intents win on conflict — BE annotation is ignored", () => {
    const appt = makeAppointment({
      pending_intent_summary: makeSummary({
        source: "ai_engine",
        kinds: ["cancel"],
        intent_count: 5,
        most_recent_session_id: 9999,
      }),
    });
    const local = [makeRescheduleIntent({ id: 1 })];

    const result = computePendingChangeOverlay(appt, local, 7001);

    expect(result.source).toBe("tech_app");
    expect(result.kinds).toEqual(["reschedule"]);
    expect(result.intentCount).toBe(1);
    expect(result.mostRecentSessionId).toBe(7001);
  });

  it("returns empty result when neither source has a hit", () => {
    const appt = makeAppointment();
    expect(computePendingChangeOverlay(appt, [], null)).toEqual({
      isPending: false,
      source: null,
      kinds: [],
      intentCount: 0,
      mostRecentSessionId: null,
    });
  });

  // PR-UX-2 PASS 2.18 (2026-05-05) — orphan-session suppression.
  describe("knownSessionIds suppression branch", () => {
    it("suppresses overlay when BE annotation references a session NOT in knownSessionIds (no local intents)", () => {
      const appt = makeAppointment({
        pending_intent_summary: makeSummary({
          source: "ai_engine",
          kinds: ["reschedule"],
          intent_count: 1,
          most_recent_session_id: 9999, // NOT in known set
        }),
      });
      const known = new Set<number>([1, 2, 3]);

      // 2026-05-07 follow-up — demoted from `console.warn` to
      // `console.log` (the warn variant grew the in-app LogBox
      // queue, contributing to the chip-row freeze at high intent
      // counts). The observability log payload is unchanged; only
      // the channel and a `(first observation)` suffix are new.
      const logSpy = jest
        .spyOn(console, "log")
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        .mockImplementation(() => {});
      try {
        const result = computePendingChangeOverlay(appt, [], null, known);

        expect(result.isPending).toBe(false);
        expect(result.source).toBeNull();
        expect(result.kinds).toEqual([]);
        expect(result.intentCount).toBe(0);
        expect(result.mostRecentSessionId).toBeNull();

        // Dev log fires once per orphan session id (module-scope
        // dedupe), so the first observation is observable.
        expect(logSpy).toHaveBeenCalledTimes(1);
        const [tag, payload] = logSpy.mock.calls[0]!;
        expect(tag).toBe(
          "[Cleanup:OrphanedSession] suppressing pending overlay (first observation)",
        );
        expect(payload).toMatchObject({
          appointmentId: 5001,
          sessionId: 9999,
          source: "ai_engine",
          knownSessionCount: 3,
        });
      } finally {
        logSpy.mockRestore();
      }
    });

    it("logs the orphan session id ONCE per process lifetime, regardless of how many appointments / call sites observe it (2026-05-07 dedupe)", () => {
      const known = new Set<number>([1, 2, 3]);
      const orphanId = 5500;
      const apptA = makeAppointment({
        id: 5001,
        pending_intent_summary: makeSummary({
          source: "ai_engine",
          intent_count: 1,
          most_recent_session_id: orphanId,
        }),
      });
      const apptB = makeAppointment({
        id: 5002,
        pending_intent_summary: makeSummary({
          source: "ai_engine",
          intent_count: 1,
          most_recent_session_id: orphanId,
        }),
      });

      const logSpy = jest
        .spyOn(console, "log")
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        .mockImplementation(() => {});
      try {
        // Simulate the per-render storm: two callsites
        // (`applyPendingChangeBorderOverride` + `PendingChangeBadge`)
        // observing the same orphan across two appointments, repeated
        // 5 times to mimic 5 React render passes.
        for (let render = 0; render < 5; render += 1) {
          computePendingChangeOverlay(apptA, [], null, known);
          computePendingChangeOverlay(apptA, [], null, known);
          computePendingChangeOverlay(apptB, [], null, known);
          computePendingChangeOverlay(apptB, [], null, known);
        }

        // 20 total observations (5 renders × 2 appts × 2 callsites)
        // collapse to 1 log line — the freeze fix.
        expect(logSpy).toHaveBeenCalledTimes(1);
      } finally {
        logSpy.mockRestore();
      }
    });

    // PR-UX-17 (2026-05-09) — `tech_app`-source orphans are silenced.
    // After PR-UX-8 stopped including `pending_review` rows in the
    // known-set narrow, an FO who finalizes a self-staged session via
    // the technician app immediately sees their just-finalized session
    // surface as an "orphan" annotation on its appointments. The
    // suppression branch (correctly) drops the cyan tile, but the
    // observability log misled the user into thinking something was
    // wrong. The genuine diagnostic case (`ai_engine` /
    // `franchise_app` / `customer_app` orphans) still logs.
    it("does NOT log for tech_app-source orphans (PR-UX-17 — suppresses post-finalize chatter)", () => {
      const appt = makeAppointment({
        pending_intent_summary: makeSummary({
          source: "tech_app",
          kinds: ["reschedule"],
          intent_count: 2,
          most_recent_session_id: 7777,
        }),
      });
      const known = new Set<number>([1, 2, 3]);

      const logSpy = jest
        .spyOn(console, "log")
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        .mockImplementation(() => {});
      try {
        const result = computePendingChangeOverlay(appt, [], null, known);

        // Suppression itself is unchanged — the overlay is still dropped.
        expect(result.isPending).toBe(false);
        expect(result.source).toBeNull();
        // Log is silenced for the tech_app source path.
        expect(logSpy).not.toHaveBeenCalled();
      } finally {
        logSpy.mockRestore();
      }
    });

    it("re-arms the dedupe for a NEW orphan session id (different orphan = new first-observation log)", () => {
      const known = new Set<number>([1, 2, 3]);
      const apptA = makeAppointment({
        id: 5001,
        pending_intent_summary: makeSummary({
          source: "ai_engine",
          most_recent_session_id: 5500,
        }),
      });
      const apptB = makeAppointment({
        id: 5002,
        pending_intent_summary: makeSummary({
          source: "ai_engine",
          most_recent_session_id: 5501,
        }),
      });

      const logSpy = jest
        .spyOn(console, "log")
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        .mockImplementation(() => {});
      try {
        computePendingChangeOverlay(apptA, [], null, known);
        computePendingChangeOverlay(apptA, [], null, known); // dedup
        computePendingChangeOverlay(apptB, [], null, known); // new id
        computePendingChangeOverlay(apptB, [], null, known); // dedup
        expect(logSpy).toHaveBeenCalledTimes(2);
      } finally {
        logSpy.mockRestore();
      }
    });

    it("paints overlay when BE annotation references a session that IS in knownSessionIds", () => {
      const appt = makeAppointment({
        pending_intent_summary: makeSummary({
          source: "franchise_app",
          kinds: ["reschedule"],
          intent_count: 1,
          most_recent_session_id: 42,
        }),
      });
      const known = new Set<number>([42, 99]);

      const result = computePendingChangeOverlay(appt, [], null, known);

      expect(result.isPending).toBe(true);
      expect(result.source).toBe("franchise_app");
      expect(result.mostRecentSessionId).toBe(42);
    });

    it("paints overlay regardless of knownSessionIds when the local store has intents (local always wins)", () => {
      const appt = makeAppointment({
        pending_intent_summary: makeSummary({
          source: "ai_engine",
          most_recent_session_id: 9999,
        }),
      });
      const local = [makeRescheduleIntent({ id: 1 })];
      const known = new Set<number>(); // empty — would normally suppress

      const result = computePendingChangeOverlay(appt, local, 7001, known);

      expect(result.isPending).toBe(true);
      expect(result.source).toBe("tech_app");
      expect(result.mostRecentSessionId).toBe(7001);
    });

    it("does NOT suppress when knownSessionIds is null (legacy / pre-2.18 behavior)", () => {
      const appt = makeAppointment({
        pending_intent_summary: makeSummary({
          source: "ai_engine",
          most_recent_session_id: 9999,
        }),
      });

      const result = computePendingChangeOverlay(appt, [], null, null);

      expect(result.isPending).toBe(true);
      expect(result.mostRecentSessionId).toBe(9999);
    });

    it("does NOT suppress when knownSessionIds is undefined (default arg)", () => {
      const appt = makeAppointment({
        pending_intent_summary: makeSummary({
          source: "ai_engine",
          most_recent_session_id: 9999,
        }),
      });

      const result = computePendingChangeOverlay(appt, [], null);

      expect(result.isPending).toBe(true);
      expect(result.mostRecentSessionId).toBe(9999);
    });

    it("does NOT suppress when summary.most_recent_session_id is null (BE-side null is a separate signal, not an orphan)", () => {
      const appt = makeAppointment({
        pending_intent_summary: makeSummary({
          source: "mixed",
          intent_count: 2,
          most_recent_session_id: null,
        }),
      });
      const known = new Set<number>([1]);

      // 2026-05-07 follow-up — log channel demoted to `console.log`;
      // a null `most_recent_session_id` still doesn't trip
      // observability (the BE-side null is a separate signal, not
      // an orphan).
      const logSpy = jest
        .spyOn(console, "log")
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        .mockImplementation(() => {});
      try {
        const result = computePendingChangeOverlay(appt, [], null, known);

        expect(result.isPending).toBe(true);
        expect(result.source).toBe("mixed");
        expect(result.mostRecentSessionId).toBeNull();
        expect(logSpy).not.toHaveBeenCalled();
      } finally {
        logSpy.mockRestore();
      }
    });
  });

  it("treats summary.intent_count === 0 as no-pending (defensive)", () => {
    const appt = makeAppointment({
      pending_intent_summary: {
        intent_count: 0,
        kinds: [],
        source: "tech_app",
        most_recent_session_id: null,
      },
    });
    expect(computePendingChangeOverlay(appt, [], null).isPending).toBe(false);
  });
});
