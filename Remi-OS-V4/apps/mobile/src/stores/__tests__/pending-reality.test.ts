/**
 * Tests for `usePendingRealityStore` (P3-FE-1).
 *
 * NOTE: this repo does not currently ship a Jest runner (see the
 * matching note at the top of `accessibility.test.ts`). Until
 * `jest-expo` lands, this file is excluded from `tsc --noEmit` via
 * the `**\/__tests__\/**` glob in `tsconfig.json` and is treated
 * as executable specification.
 *
 * Coverage:
 *   - defaults
 *   - setSession (fresh, refresh same id, evict different id)
 *   - addIntent (with / without active session)
 *   - removeIntent (present id, absent id)
 *   - modifyIntent (present id, absent id)
 *   - runLocalLinter (no session → [], with session → calls
 *     `lintSession` and writes results)
 *   - clear
 */

import {
  __resetPendingRealityStoreForTests,
  usePendingRealityStore,
} from "../pending-reality";
import type {
  ReorganizationIntent,
  ReorganizationSession,
} from "@technician/types/reorganization";
import type {
  LinterAppointment,
  LinterWorldSnapshot,
} from "@technician/utils/logistics-linter";

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

const makeSession = (overrides: Partial<ReorganizationSession> = {}): ReorganizationSession => ({
  id: 7001,
  franchise_id: 1,
  author_user_id: 42,
  source: "tech_app",
  status: "draft",
  required_authorizer_role: "self",
  eligible_committer_ids: [42],
  policy_snapshot: {
    tech_authored_self_only: "auto",
    tech_authored_cross_tech: "fo_review",
    tech_authored_with_cancel: "fo_review",
    customer_authored_single: "auto",
    customer_authored_multi: "fo_review",
    customer_authored_with_conflict: "fo_review",
    ai_authored: "always_fo_review",
  },
  idempotency_key: "test-key-7001",
  notes: null,
  template_id: null,
  related_session_id: null,
  source_metadata: {},
  created_at: "2026-04-23T15:00:00.000Z",
  finalized_at: null,
  committed_at: null,
  cancelled_at: null,
  expires_at: null,
  ...overrides,
});

const makeRescheduleIntent = (
  overrides: Partial<ReorganizationIntent> = {},
): ReorganizationIntent => ({
  id: 9001,
  session_id: 7001,
  intent_type: "reschedule",
  intent_status: "proposed",
  appointment_id: 5001,
  personal_event_id: null,
  payload: {
    kind: "reschedule",
    new_scheduled_date: "2026-04-24",
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
});

const makeWorldSnapshot = (
  appointments: LinterAppointment[] = [],
): LinterWorldSnapshot => ({
  appointments,
  routes: [],
  customerSlas: [],
  fleet: { accounts: [] },
});

const makeAppointment = (overrides: Partial<LinterAppointment> = {}): LinterAppointment => ({
  id: 5001,
  customer_id: 3001,
  technician_id: 42,
  franchise_id: 1,
  status: "scheduled",
  scheduled_date: "2026-04-24",
  scheduled_start_time: "08:00",
  scheduled_end_time: "10:00",
  ...overrides,
});

// ---------------------------------------------------------------------------
// Setup.
// ---------------------------------------------------------------------------

beforeEach(() => {
  __resetPendingRealityStoreForTests();
});

// ---------------------------------------------------------------------------
// Defaults.
// ---------------------------------------------------------------------------

describe("usePendingRealityStore — defaults", () => {
  it("starts with a null session, no intents, and no linter issues", () => {
    const state = usePendingRealityStore.getState();
    expect(state.session).toBeNull();
    expect(state.sessionId).toBeNull();
    expect(state.status).toBeNull();
    expect(state.intents).toEqual([]);
    expect(state.linterIssues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// setSession.
// ---------------------------------------------------------------------------

describe("usePendingRealityStore — setSession", () => {
  it("populates session, sessionId, and status from the row", () => {
    const session = makeSession();
    usePendingRealityStore.getState().setSession(session);
    const state = usePendingRealityStore.getState();
    expect(state.session).toEqual(session);
    expect(state.sessionId).toBe(7001);
    expect(state.status).toBe("draft");
  });

  it("treats setSession with the same id as a row refresh — preserves intents and linter issues", () => {
    const original = makeSession({ status: "draft" });
    usePendingRealityStore.getState().setSession(original);
    usePendingRealityStore.getState().addIntent(makeRescheduleIntent());

    const refreshed = makeSession({ status: "pending_review" });
    usePendingRealityStore.getState().setSession(refreshed);

    const state = usePendingRealityStore.getState();
    expect(state.status).toBe("pending_review");
    expect(state.session).toEqual(refreshed);
    expect(state.intents).toHaveLength(1);
  });

  it("evicts a previous session with a different id — wipes intents and linter issues, logs the eviction", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const first = makeSession({ id: 7001 });
    usePendingRealityStore.getState().setSession(first);
    usePendingRealityStore.getState().addIntent(makeRescheduleIntent({ id: 9001 }));

    const second = makeSession({ id: 7002, idempotency_key: "test-key-7002" });
    usePendingRealityStore.getState().setSession(second);

    const state = usePendingRealityStore.getState();
    expect(state.sessionId).toBe(7002);
    expect(state.intents).toEqual([]);
    expect(state.linterIssues).toEqual([]);
    expect(logSpy).toHaveBeenCalledWith(
      "[pending-reality] evicting active session",
      expect.objectContaining({ previousSessionId: 7001, nextSessionId: 7002 }),
    );

    logSpy.mockRestore();
  });

  it("does not log eviction when there was no previous session", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    usePendingRealityStore.getState().setSession(makeSession());
    expect(logSpy).not.toHaveBeenCalledWith(
      "[pending-reality] evicting active session",
      expect.anything(),
    );
    logSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// addIntent.
// ---------------------------------------------------------------------------

describe("usePendingRealityStore — addIntent", () => {
  it("appends to the intents list when a session is active", () => {
    usePendingRealityStore.getState().setSession(makeSession());
    usePendingRealityStore.getState().addIntent(makeRescheduleIntent({ id: 9001 }));
    usePendingRealityStore.getState().addIntent(makeRescheduleIntent({ id: 9002 }));

    const intents = usePendingRealityStore.getState().intents;
    expect(intents.map((i) => i.id)).toEqual([9001, 9002]);
  });

  it("is a no-op (and logs) when no session is active", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    usePendingRealityStore.getState().addIntent(makeRescheduleIntent({ id: 9001 }));

    expect(usePendingRealityStore.getState().intents).toEqual([]);
    expect(logSpy).toHaveBeenCalledWith(
      "[pending-reality] addIntent ignored — no active session",
      expect.objectContaining({ intentId: 9001 }),
    );
    logSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// removeIntent.
// ---------------------------------------------------------------------------

describe("usePendingRealityStore — removeIntent", () => {
  it("filters the intent with the matching id out of the list", () => {
    usePendingRealityStore.getState().setSession(makeSession());
    usePendingRealityStore.getState().addIntent(makeRescheduleIntent({ id: 9001 }));
    usePendingRealityStore.getState().addIntent(makeRescheduleIntent({ id: 9002 }));
    usePendingRealityStore.getState().addIntent(makeRescheduleIntent({ id: 9003 }));

    usePendingRealityStore.getState().removeIntent(9002);

    const intents = usePendingRealityStore.getState().intents;
    expect(intents.map((i) => i.id)).toEqual([9001, 9003]);
  });

  it("is a no-op when the id is absent — same array reference, same length", () => {
    usePendingRealityStore.getState().setSession(makeSession());
    usePendingRealityStore.getState().addIntent(makeRescheduleIntent({ id: 9001 }));

    const before = usePendingRealityStore.getState().intents;
    usePendingRealityStore.getState().removeIntent(9999);
    const after = usePendingRealityStore.getState().intents;

    expect(after).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// modifyIntent.
// ---------------------------------------------------------------------------

describe("usePendingRealityStore — modifyIntent", () => {
  it("patches intent_status in place without touching siblings", () => {
    usePendingRealityStore.getState().setSession(makeSession());
    usePendingRealityStore.getState().addIntent(makeRescheduleIntent({ id: 9001 }));
    usePendingRealityStore.getState().addIntent(makeRescheduleIntent({ id: 9002 }));

    usePendingRealityStore.getState().modifyIntent(9001, { intent_status: "failed" });

    const intents = usePendingRealityStore.getState().intents;
    expect(intents.find((i) => i.id === 9001)?.intent_status).toBe("failed");
    expect(intents.find((i) => i.id === 9002)?.intent_status).toBe("proposed");
  });

  it("patches the payload in place", () => {
    usePendingRealityStore.getState().setSession(makeSession());
    usePendingRealityStore.getState().addIntent(makeRescheduleIntent({ id: 9001 }));

    usePendingRealityStore.getState().modifyIntent(9001, {
      payload: {
        kind: "reschedule",
        new_scheduled_date: "2026-04-25",
        new_start_time: "11:00",
        new_end_time: "12:00",
      },
    });

    const updated = usePendingRealityStore.getState().intents[0];
    expect(updated.payload).toEqual({
      kind: "reschedule",
      new_scheduled_date: "2026-04-25",
      new_start_time: "11:00",
      new_end_time: "12:00",
    });
  });

  it("is a no-op when the id is absent — same array reference, same length", () => {
    usePendingRealityStore.getState().setSession(makeSession());
    usePendingRealityStore.getState().addIntent(makeRescheduleIntent({ id: 9001 }));

    const before = usePendingRealityStore.getState().intents;
    usePendingRealityStore.getState().modifyIntent(9999, { intent_status: "failed" });
    const after = usePendingRealityStore.getState().intents;

    expect(after).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// runLocalLinter.
// ---------------------------------------------------------------------------

describe("usePendingRealityStore — runLocalLinter", () => {
  it("returns [] and clears linterIssues when no session is active", () => {
    // Pre-seed the linter issue list so we can prove it gets cleared.
    usePendingRealityStore.setState({
      linterIssues: [
        {
          severity: "error",
          kind: "time_conflict",
          affectedAppointmentIds: [],
          humanMessage: "stale",
        },
      ],
    });

    const result = usePendingRealityStore.getState().runLocalLinter(makeWorldSnapshot());

    expect(result).toEqual([]);
    expect(usePendingRealityStore.getState().linterIssues).toEqual([]);
  });

  it("calls the shared P1-BE-4 linter and writes its output into linterIssues", () => {
    usePendingRealityStore.getState().setSession(makeSession());
    // Two reschedule intents that put the same tech into overlapping time
    // on the same date — exactly the R1 (in-session) time_conflict case.
    usePendingRealityStore.getState().addIntent(
      makeRescheduleIntent({
        id: 9001,
        appointment_id: 5001,
        payload: {
          kind: "reschedule",
          new_scheduled_date: "2026-04-24",
          new_start_time: "09:00",
          new_end_time: "10:00",
          new_technician_id: 42,
        },
      }),
    );
    usePendingRealityStore.getState().addIntent(
      makeRescheduleIntent({
        id: 9002,
        appointment_id: 5002,
        payload: {
          kind: "reschedule",
          new_scheduled_date: "2026-04-24",
          new_start_time: "09:30",
          new_end_time: "10:30",
          new_technician_id: 42,
        },
      }),
    );

    const world = makeWorldSnapshot([
      makeAppointment({ id: 5001, technician_id: 42 }),
      makeAppointment({
        id: 5002,
        technician_id: 42,
        scheduled_start_time: "11:00",
        scheduled_end_time: "12:00",
      }),
    ]);

    const result = usePendingRealityStore.getState().runLocalLinter(world);

    expect(result.length).toBeGreaterThan(0);
    expect(result.some((i) => i.kind === "time_conflict")).toBe(true);
    expect(usePendingRealityStore.getState().linterIssues).toEqual(result);
  });

  it("returns [] when the session is active but there are no intents", () => {
    usePendingRealityStore.getState().setSession(makeSession());
    const result = usePendingRealityStore.getState().runLocalLinter(makeWorldSnapshot());
    expect(result).toEqual([]);
    expect(usePendingRealityStore.getState().linterIssues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// clear.
// ---------------------------------------------------------------------------

describe("usePendingRealityStore — clear", () => {
  it("wipes session, intents, and linter issues", () => {
    usePendingRealityStore.getState().setSession(makeSession());
    usePendingRealityStore.getState().addIntent(makeRescheduleIntent({ id: 9001 }));
    usePendingRealityStore.setState({
      linterIssues: [
        {
          severity: "warning",
          kind: "fleet_capacity",
          affectedAppointmentIds: [9001],
          humanMessage: "seed",
        },
      ],
    });

    usePendingRealityStore.getState().clear();

    const state = usePendingRealityStore.getState();
    expect(state.session).toBeNull();
    expect(state.sessionId).toBeNull();
    expect(state.status).toBeNull();
    expect(state.intents).toEqual([]);
    expect(state.linterIssues).toEqual([]);
  });

  it("preserves action methods (so the store is still usable after clear)", () => {
    usePendingRealityStore.getState().setSession(makeSession());
    usePendingRealityStore.getState().clear();

    // Calling setSession again should not throw — actions survive the reset.
    expect(() => usePendingRealityStore.getState().setSession(makeSession())).not.toThrow();
    expect(usePendingRealityStore.getState().sessionId).toBe(7001);
  });

  // 2026-05-08 fix/clear-must-stay-local — invariant guard: `clear()`
  // is a pure local-state reset. It MUST never trigger a backend
  // call. The wider "any backend cancel must be an explicit, separate
  // call from a user-initiated handler" rule lives on the store's
  // `clear` JSDoc; this test pins the network half of it. See
  // PLAN-DEVIATIONS.md#2026-05-08-cancel-hook-no-auto-coord for the
  // regression that prompted the rule.
  it("does NOT trigger any axios call (pure local-state reset)", () => {
    let axiosCallCount = 0;
    jest.isolateModules(() => {
      jest.doMock("@technician/api/client", () => {
        const fn = (...args: unknown[]) => {
          axiosCallCount += 1;
          return Promise.resolve(args);
        };
        return { __esModule: true, api: fn };
      });
    });

    usePendingRealityStore.getState().setSession(makeSession());
    usePendingRealityStore
      .getState()
      .addIntent(makeRescheduleIntent({ id: 9001 }));
    usePendingRealityStore.getState().clear();

    expect(axiosCallCount).toBe(0);
  });

  it("clear() resets adoptSnoozeUntilMs along with the rest of the slice", () => {
    usePendingRealityStore.setState({ adoptSnoozeUntilMs: Date.now() + 60_000 });
    usePendingRealityStore.getState().clear();
    expect(usePendingRealityStore.getState().adoptSnoozeUntilMs).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// adopt snooze (PR-UX-12, 2026-05-09).
// ---------------------------------------------------------------------------

describe("usePendingRealityStore — adopt snooze (PR-UX-12)", () => {
  let nowSpy: jest.SpyInstance;
  const FIXED_NOW = 1_778_286_584_605;

  beforeEach(() => {
    nowSpy = jest.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it("starts at null", () => {
    expect(
      usePendingRealityStore.getState().adoptSnoozeUntilMs,
    ).toBeNull();
  });

  it("setAdoptSnoozeUntil(future) stores the timestamp", () => {
    const target = FIXED_NOW + 60_000;
    usePendingRealityStore.getState().setAdoptSnoozeUntil(target);
    expect(
      usePendingRealityStore.getState().adoptSnoozeUntilMs,
    ).toBe(target);
  });

  it("setAdoptSnoozeUntil(past) normalizes to null (stale snoozes are ignored)", () => {
    usePendingRealityStore.getState().setAdoptSnoozeUntil(FIXED_NOW - 1);
    expect(
      usePendingRealityStore.getState().adoptSnoozeUntilMs,
    ).toBeNull();
  });

  it("setAdoptSnoozeUntil(now) normalizes to null (boundary — exact now is treated as expired)", () => {
    usePendingRealityStore.getState().setAdoptSnoozeUntil(FIXED_NOW);
    expect(
      usePendingRealityStore.getState().adoptSnoozeUntilMs,
    ).toBeNull();
  });

  it("setAdoptSnoozeUntil(null) clears any active snooze", () => {
    usePendingRealityStore.setState({ adoptSnoozeUntilMs: FIXED_NOW + 60_000 });
    usePendingRealityStore.getState().setAdoptSnoozeUntil(null);
    expect(
      usePendingRealityStore.getState().adoptSnoozeUntilMs,
    ).toBeNull();
  });

  it("clearAdoptSnooze() clears an active snooze", () => {
    usePendingRealityStore.setState({ adoptSnoozeUntilMs: FIXED_NOW + 60_000 });
    usePendingRealityStore.getState().clearAdoptSnooze();
    expect(
      usePendingRealityStore.getState().adoptSnoozeUntilMs,
    ).toBeNull();
  });

  it("clearAdoptSnooze() is a no-op when no snooze is active (avoids redundant set call)", () => {
    expect(
      usePendingRealityStore.getState().adoptSnoozeUntilMs,
    ).toBeNull();
    const before = usePendingRealityStore.getState();
    usePendingRealityStore.getState().clearAdoptSnooze();
    const after = usePendingRealityStore.getState();
    // Same state reference — no setState fired.
    expect(after).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// selectedChainId — move-chain selector PASS 1.
// ---------------------------------------------------------------------------

describe("usePendingRealityStore — selectedChainId", () => {
  it("starts at null", () => {
    expect(usePendingRealityStore.getState().selectedChainId).toBeNull();
  });

  it("setSelectedChainId stores the new value", () => {
    usePendingRealityStore.getState().setSelectedChainId("chain-9001");
    expect(usePendingRealityStore.getState().selectedChainId).toBe("chain-9001");
  });

  it("setSelectedChainId is a no-op when called with the current value", () => {
    usePendingRealityStore.getState().setSelectedChainId("chain-9001");
    const before = usePendingRealityStore.getState();
    usePendingRealityStore.getState().setSelectedChainId("chain-9001");
    const after = usePendingRealityStore.getState();
    // Same state object reference → no React re-render triggered.
    expect(after).toBe(before);
  });

  it("setSelectedChainId(null) returns to the Show all reference view", () => {
    usePendingRealityStore.getState().setSelectedChainId("chain-9001");
    usePendingRealityStore.getState().setSelectedChainId(null);
    expect(usePendingRealityStore.getState().selectedChainId).toBeNull();
  });

  it("clears on a new-session setSession (chain ids derive from intents that no longer exist)", () => {
    usePendingRealityStore.getState().setSession(makeSession({ id: 7001 }));
    usePendingRealityStore.getState().setSelectedChainId("chain-9001");
    usePendingRealityStore
      .getState()
      .setSession(makeSession({ id: 7002, idempotency_key: "test-7002" }));
    expect(usePendingRealityStore.getState().selectedChainId).toBeNull();
  });

  it("clears on a same-session setSession when the selection no longer maps to any intent's chain_id", () => {
    // Pre-sticky-chain (legacy synthesized `chain-{seedIntentId}`)
    // selection — none of the new intents carry that id in
    // `chain_id`, so the preservation check fails and the store
    // clears. Covers the original "BE refresh after auto-fix"
    // path. See PLAN-DEVIATIONS.md#2026-05-10-preserve-selection-on-refresh.
    const session = makeSession();
    usePendingRealityStore.getState().setSession(session);
    usePendingRealityStore
      .getState()
      .addIntent(makeRescheduleIntent({ id: 9001 }));
    usePendingRealityStore.getState().setSelectedChainId("chain-9001");

    // Same id, but the BE returned a fresh intents array (e.g. after auto-fix).
    usePendingRealityStore
      .getState()
      .setSession(session, [makeRescheduleIntent({ id: 9002 })]);

    expect(usePendingRealityStore.getState().selectedChainId).toBeNull();
  });

  it("preserves selectedChainId on refresh when an intent with the same chain_id is still present (sticky chain id)", () => {
    // PLAN-DEVIATION 2026-05-10-preserve-selection-on-refresh.
    // After 00eca0a / sticky-chain-identity-fe, the BE assigns a
    // stable `chain_id` per intent and the chain graph reads it
    // directly. The store must NOT wipe the selection on every
    // refresh — or the on-device flow becomes "arrow flashes
    // and disappears" (AutoIsolate sets the selection, BE refresh
    // wipes it). The selection (and step-spotlight set) survives
    // when any intent in the new list still carries the same
    // chain_id.
    const session = makeSession();
    usePendingRealityStore.getState().setSession(session);
    usePendingRealityStore
      .getState()
      .addIntent(
        makeRescheduleIntent({
          id: 9001,
          chain_id: "be-uuid-abc-123",
        }),
      );
    // Auto-isolate would also seed step highlights — emulate it.
    usePendingRealityStore
      .getState()
      .setSelectedChainId("be-uuid-abc-123", 2);
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([
      0, 1,
    ]);

    // Same session id, fresh intents array including the same intent
    // (same chain_id) — mimics a BE refresh after a stage / restage.
    usePendingRealityStore
      .getState()
      .setSession(session, [
        makeRescheduleIntent({
          id: 9001,
          chain_id: "be-uuid-abc-123",
        }),
        makeRescheduleIntent({
          id: 9002,
          chain_id: "be-uuid-abc-123",
        }),
      ]);

    expect(usePendingRealityStore.getState().selectedChainId).toBe(
      "be-uuid-abc-123",
    );
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([
      0, 1,
    ]);
  });

  it("preserves ALL_CHAINS_SENTINEL ('all') on refresh regardless of intent list contents", () => {
    // The overview mode is independent of specific intent ids.
    // Wiping it on every BE refresh would yank the user back to
    // the "Show all baseline" mid-staging. See PLAN-DEVIATIONS.md#2026-05-10-preserve-selection-on-refresh.
    const session = makeSession();
    usePendingRealityStore.getState().setSession(session);
    usePendingRealityStore.getState().setSelectedChainId("all");

    usePendingRealityStore
      .getState()
      .setSession(session, [
        makeRescheduleIntent({ id: 9002, chain_id: "anything" }),
      ]);

    expect(usePendingRealityStore.getState().selectedChainId).toBe("all");
  });

  it("clears on removeIntent when the selected chain has no surviving intents (legacy synthesized chain-{id} fallback)", () => {
    // Legacy synthesized chain id (no sticky `chain_id` on the intent):
    // the selection has no surviving intent carrying that id after
    // the removal, so the store falls back to clearing — same as
    // pre-2026-05-12-preserve-selection-on-removeintent.
    usePendingRealityStore.getState().setSession(makeSession());
    usePendingRealityStore
      .getState()
      .addIntent(makeRescheduleIntent({ id: 9001 }));
    usePendingRealityStore.getState().setSelectedChainId("chain-9001");

    usePendingRealityStore.getState().removeIntent(9001);

    expect(usePendingRealityStore.getState().selectedChainId).toBeNull();
  });

  it("preserves selectedChainId on removeIntent when a remaining intent still carries the same chain_id (sticky chain id)", () => {
    // PLAN-DEVIATION 2026-05-12-preserve-selection-on-removeintent —
    // mirrors the `setSession(refresh+intents)` preservation rule.
    // The user is curating an isolated chain of intents and one of
    // them gets de-escalated (e.g. apply-anyway on a card already
    // staged inside the chain) — the rest of the chain is still
    // here, so the user's chain-focus must survive.
    const session = makeSession();
    usePendingRealityStore.getState().setSession(session);
    usePendingRealityStore
      .getState()
      .addIntent(
        makeRescheduleIntent({ id: 9001, chain_id: "be-uuid-abc-123" }),
      );
    usePendingRealityStore
      .getState()
      .addIntent(
        makeRescheduleIntent({ id: 9002, chain_id: "be-uuid-abc-123" }),
      );
    usePendingRealityStore
      .getState()
      .setSelectedChainId("be-uuid-abc-123", 2);
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([
      0, 1,
    ]);

    usePendingRealityStore.getState().removeIntent(9001);

    // Selection survives because 9002 still carries the chain_id.
    expect(usePendingRealityStore.getState().selectedChainId).toBe(
      "be-uuid-abc-123",
    );
    // Highlights also preserved — the chain still exists in the
    // store's view, so the user's spotlight setting (whatever it
    // was) stays intact. AutoIsolate is responsible for any
    // length-grow expansions; the store does not infer them on
    // removal.
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([
      0, 1,
    ]);
  });

  it("clears selectedChainId on removeIntent when no remaining intent carries the chain_id (chain emptied)", () => {
    // Edge case: the user had isolated a chain with one intent and
    // removes its only intent. No surviving intent → clear.
    const session = makeSession();
    usePendingRealityStore.getState().setSession(session);
    usePendingRealityStore
      .getState()
      .addIntent(
        makeRescheduleIntent({ id: 9001, chain_id: "be-uuid-solo" }),
      );
    usePendingRealityStore.getState().setSelectedChainId("be-uuid-solo", 1);

    usePendingRealityStore.getState().removeIntent(9001);

    expect(usePendingRealityStore.getState().selectedChainId).toBeNull();
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([]);
  });

  it("preserves ALL_CHAINS_SENTINEL ('all') on removeIntent regardless of remaining intents", () => {
    // The overview mode is independent of specific chain ids;
    // partial intent removal shouldn't yank the user out of
    // overview view back to "Show all" baseline.
    const session = makeSession();
    usePendingRealityStore.getState().setSession(session);
    usePendingRealityStore
      .getState()
      .addIntent(
        makeRescheduleIntent({ id: 9001, chain_id: "be-uuid-some-chain" }),
      );
    usePendingRealityStore
      .getState()
      .addIntent(
        makeRescheduleIntent({ id: 9002, chain_id: "be-uuid-other-chain" }),
      );
    usePendingRealityStore.getState().setSelectedChainId("all");

    usePendingRealityStore.getState().removeIntent(9001);

    expect(usePendingRealityStore.getState().selectedChainId).toBe("all");
  });

  it("clear() resets selectedChainId along with the rest of the slice", () => {
    usePendingRealityStore.getState().setSession(makeSession());
    usePendingRealityStore.getState().setSelectedChainId("chain-9001");
    usePendingRealityStore.getState().clear();
    expect(usePendingRealityStore.getState().selectedChainId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// chainStepHighlights — per-step spotlight (PR-UX-2 PASS 2.11 / task `c8`).
// ---------------------------------------------------------------------------

describe("usePendingRealityStore — chainStepHighlights", () => {
  it("starts as an empty array (the 'all dots dim' baseline)", () => {
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([]);
  });

  it("setChainStepHighlights stores the new value (sorted, deduped)", () => {
    usePendingRealityStore.getState().setChainStepHighlights([2, 0, 1, 0]);
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([
      0, 1, 2,
    ]);
  });

  it("setChainStepHighlights is a no-op when the next set equals the current set", () => {
    usePendingRealityStore.getState().setChainStepHighlights([0, 1]);
    const before = usePendingRealityStore.getState();
    usePendingRealityStore.getState().setChainStepHighlights([1, 0]);
    const after = usePendingRealityStore.getState();
    // Same state object reference → no React re-render triggered.
    expect(after).toBe(before);
  });

  it("setChainStepHighlights([]) returns to the dim baseline", () => {
    usePendingRealityStore.getState().setChainStepHighlights([0, 1, 2]);
    usePendingRealityStore.getState().setChainStepHighlights([]);
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([]);
  });

  it("clears when setSelectedChainId switches chains", () => {
    usePendingRealityStore.getState().setSelectedChainId("chain-9001");
    usePendingRealityStore.getState().setChainStepHighlights([0, 1]);
    usePendingRealityStore.getState().setSelectedChainId("chain-9002");
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([]);
  });

  it("clears on a new-session setSession", () => {
    usePendingRealityStore.getState().setSession(makeSession({ id: 7001 }));
    usePendingRealityStore.getState().setChainStepHighlights([0, 1]);
    usePendingRealityStore
      .getState()
      .setSession(makeSession({ id: 7002, idempotency_key: "test-7002" }));
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([]);
  });

  it("clears on removeIntent when the selection also clears (legacy synthesized chain id with no surviving intent)", () => {
    // Per PLAN-DEVIATION 2026-05-12-preserve-selection-on-removeintent
    // the store now preserves selection + highlights IFF a
    // remaining intent carries the same `chain_id`. With the
    // legacy synthesized (no `chain_id`) shape, removal still
    // results in a clear — both fields tracked together.
    usePendingRealityStore.getState().setSession(makeSession());
    usePendingRealityStore
      .getState()
      .addIntent(makeRescheduleIntent({ id: 9001 }));
    usePendingRealityStore.getState().setSelectedChainId("chain-9001");
    usePendingRealityStore.getState().setChainStepHighlights([0]);
    usePendingRealityStore.getState().removeIntent(9001);
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([]);
  });

  it("preserves chainStepHighlights on removeIntent when the selected chain survives (sticky chain id)", () => {
    // Companion to the selectedChainId preservation test in the
    // earlier describe — the spotlight stays anchored to the
    // surviving chain. Auto-grow on chain growth is handled by
    // `useAutoIsolateOnStage`, not the store.
    const session = makeSession();
    usePendingRealityStore.getState().setSession(session);
    usePendingRealityStore
      .getState()
      .addIntent(
        makeRescheduleIntent({ id: 9001, chain_id: "be-uuid-keepme" }),
      );
    usePendingRealityStore
      .getState()
      .addIntent(
        makeRescheduleIntent({ id: 9002, chain_id: "be-uuid-keepme" }),
      );
    usePendingRealityStore
      .getState()
      .setSelectedChainId("be-uuid-keepme", 2);
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([
      0, 1,
    ]);

    usePendingRealityStore.getState().removeIntent(9001);

    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([
      0, 1,
    ]);
  });

  it("clear() resets chainStepHighlights along with the rest of the slice", () => {
    usePendingRealityStore.getState().setChainStepHighlights([0, 1]);
    usePendingRealityStore.getState().clear();
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([]);
  });

  // PR-UX-2 PASS 2.12 (2026-05-05): on isolate, the spotlight set
  // is seeded to the FULL prefix `[0..totalSteps-1]` so the chain
  // visualization appears immediately rather than waiting for a
  // dot tap. Locks the new default that fixed the user-reported
  // "select Chain 1 → see nothing → think the last card is broken"
  // bug.
  it("setSelectedChainId(chainId, totalSteps) seeds chainStepHighlights to the full prefix", () => {
    usePendingRealityStore.getState().setSelectedChainId("chain-9001", 6);
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  it("setSelectedChainId(chainId) without totalSteps still clears (back-compat)", () => {
    // Existing call sites that don't pass totalSteps keep the
    // pre-PASS-2.12 "all dots dim" entry. Only the chip-row tap
    // handler currently passes totalSteps.
    usePendingRealityStore.getState().setSelectedChainId("chain-9001");
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([]);
  });

  it("setSelectedChainId('all', N) ignores totalSteps (no single chain to scope)", () => {
    // The all-chains sentinel doesn't have a per-chain step set —
    // every chain's destinations always show. The store ignores
    // the totalSteps hint to keep that contract obvious from the
    // state shape (chainStepHighlights stays empty).
    usePendingRealityStore.getState().setSelectedChainId("all", 6);
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([]);
  });

  it("setSelectedChainId(null, N) ignores totalSteps and clears the spotlight", () => {
    // Isolate a chain first so the null transition isn't a no-op
    // (the store short-circuits when the new id matches the
    // current id; baseline → baseline would never reach the
    // chainStepHighlights branch).
    usePendingRealityStore.getState().setSelectedChainId("chain-9001", 3);
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([
      0, 1, 2,
    ]);
    usePendingRealityStore.getState().setSelectedChainId(null, 6);
    expect(usePendingRealityStore.getState().chainStepHighlights).toEqual([]);
  });
});
