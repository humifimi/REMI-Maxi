/**
 * Tests for `reconcileActiveSession`.
 *
 * Pure-function unit tests — the helper is intentionally framework-
 * free so we mock the store API surface as a plain object with
 * `jest.fn()` for `setSession` and `clear`, plus the field slots
 * the reconciler reads (`sessionId`, `lastSetAt`, intent / issue
 * counts).
 *
 * Coverage:
 *
 *   - Original chunk-prompt 5-case matrix (data null vs populated ×
 *     store empty vs populated vs matching-id vs different-id).
 *   - 2026-05-08 P3-FE-RECONCILE-RACE young-local guard:
 *       - young + BE-null → `skip-young-local`, no `clear()` call.
 *       - old + BE-null → `clear-local`, `clear()` fires.
 *       - null `lastSetAt` + BE-null → `clear-local` (legacy
 *         behavior preserved when no stamp exists).
 *       - young + BE-populated → guard does NOT override valid
 *         BE state; `setSession` fires as usual.
 */

import {
  YOUNG_LOCAL_THRESHOLD_MS,
  reconcileActiveSession,
} from "../reconcile-active-session";
import { makeIntent, makeSession } from "@technician/stores/__fixtures__/pending-reality";
import type { PendingRealityState } from "@technician/stores/pending-reality";
import type { ReorganizationApiSession } from "../use-reorganization";

// Build a minimal fake store API surface. The helper reads
// `sessionId`, `lastSetAt`, `intents.length`, `linterIssues.length`
// and writes via `setSession` / `clear`. Other slots stay as
// `jest.fn()` no-ops or null placeholders.
function makeFakeStore(initial: {
  sessionId: number | null;
  lastSetAt?: number | null;
  adoptSnoozeUntilMs?: number | null;
}): {
  setSession: jest.Mock;
  clear: jest.Mock;
  setAdoptSnoozeUntil: jest.Mock;
  clearAdoptSnooze: jest.Mock;
  sessionId: number | null;
  lastSetAt: number | null;
  adoptSnoozeUntilMs: number | null;
  __asState: () => PendingRealityState;
} {
  const setSession = jest.fn();
  const clear = jest.fn();
  const setAdoptSnoozeUntil = jest.fn();
  const clearAdoptSnooze = jest.fn();
  return {
    setSession,
    clear,
    setAdoptSnoozeUntil,
    clearAdoptSnooze,
    sessionId: initial.sessionId,
    lastSetAt: initial.lastSetAt ?? null,
    adoptSnoozeUntilMs: initial.adoptSnoozeUntilMs ?? null,
    __asState() {
      return {
        setSession,
        clear,
        setAdoptSnoozeUntil,
        clearAdoptSnooze,
        sessionId: this.sessionId,
        lastSetAt: this.lastSetAt,
        adoptSnoozeUntilMs: this.adoptSnoozeUntilMs,
        session: null,
        status: null,
        intents: [],
        linterIssues: [],
        selectedChainId: null,
        chainStepHighlights: [],
        addIntent: jest.fn(),
        removeIntent: jest.fn(),
        modifyIntent: jest.fn(),
        runLocalLinter: jest.fn(() => []),
        setSelectedChainId: jest.fn(),
        setChainStepHighlights: jest.fn(),
      } satisfies PendingRealityState;
    },
  };
}

const SESSION_7 = makeSession({ id: 7 });
const INTENT_140 = makeIntent(140, { session_id: 7 });
const INTENT_141 = makeIntent(141, { session_id: 7 });

const API_SESSION_7: ReorganizationApiSession = {
  ...SESSION_7,
  intents: [INTENT_140, INTENT_141],
};

// Non-draft variants for the PR #105 (2026-05-09)
// `skip-non-draft` / `clear-local-non-draft` regression suite.
const API_SESSION_7_PENDING_REVIEW: ReorganizationApiSession = {
  ...SESSION_7,
  status: "pending_review",
  intents: [INTENT_140, INTENT_141],
};
const API_SESSION_7_COMMITTING: ReorganizationApiSession = {
  ...SESSION_7,
  status: "committing",
  intents: [INTENT_140, INTENT_141],
};

describe("reconcileActiveSession", () => {
  it("data=null + store empty → no-op (no calls to clear or setSession)", () => {
    const fake = makeFakeStore({ sessionId: null });

    reconcileActiveSession(null, fake.__asState());

    expect(fake.clear).not.toHaveBeenCalled();
    expect(fake.setSession).not.toHaveBeenCalled();
  });

  it("data=null + store.sessionId=7 + lastSetAt=null → calls clear() once (legacy behavior, no young stamp to defer to)", () => {
    const fake = makeFakeStore({ sessionId: 7, lastSetAt: null });

    reconcileActiveSession(null, fake.__asState());

    expect(fake.clear).toHaveBeenCalledTimes(1);
    expect(fake.setSession).not.toHaveBeenCalled();
  });

  it("data populated + store empty → setSession(session, intents) once (cold-start hydrate)", () => {
    const fake = makeFakeStore({ sessionId: null });

    reconcileActiveSession(API_SESSION_7, fake.__asState());

    expect(fake.clear).not.toHaveBeenCalled();
    expect(fake.setSession).toHaveBeenCalledTimes(1);
    const [sessionArg, intentsArg] = fake.setSession.mock.calls[0]!;
    expect(sessionArg).toEqual(SESSION_7);
    expect(sessionArg).not.toHaveProperty("intents");
    expect(intentsArg).toEqual([INTENT_140, INTENT_141]);
  });

  it("data populated + matching id → setSession(session, intents) once (refresh path)", () => {
    const fake = makeFakeStore({ sessionId: 7 });

    reconcileActiveSession(API_SESSION_7, fake.__asState());

    expect(fake.clear).not.toHaveBeenCalled();
    expect(fake.setSession).toHaveBeenCalledTimes(1);
    const [sessionArg, intentsArg] = fake.setSession.mock.calls[0]!;
    expect(sessionArg).toEqual(SESSION_7);
    expect(intentsArg).toEqual([INTENT_140, INTENT_141]);
  });

  it("data populated + different id → setSession(session, intents) once (eviction path)", () => {
    const fake = makeFakeStore({ sessionId: 4 });

    reconcileActiveSession(API_SESSION_7, fake.__asState());

    expect(fake.clear).not.toHaveBeenCalled();
    expect(fake.setSession).toHaveBeenCalledTimes(1);
    const [sessionArg, intentsArg] = fake.setSession.mock.calls[0]!;
    expect(sessionArg).toEqual(SESSION_7);
    expect(intentsArg).toEqual([INTENT_140, INTENT_141]);
  });

  // ── Young-local guard (P3-FE-RECONCILE-RACE) ───────────────────

  describe("young-local guard (2026-05-08 P3-FE-RECONCILE-RACE)", () => {
    let nowSpy: jest.SpyInstance;
    const FIXED_NOW = 1_778_286_584_605;

    beforeEach(() => {
      // Pin `Date.now()` so `localAgeMs` is deterministic across
      // the threshold boundary tests below.
      nowSpy = jest.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    });

    afterEach(() => {
      nowSpy.mockRestore();
    });

    it("data=null + young local (100ms old) → skip-young-local, NO clear() call", () => {
      const fake = makeFakeStore({
        sessionId: 536,
        lastSetAt: FIXED_NOW - 100,
      });

      reconcileActiveSession(null, fake.__asState());

      expect(fake.clear).not.toHaveBeenCalled();
      expect(fake.setSession).not.toHaveBeenCalled();
      // Local store stays intact — caller can verify by reading
      // sessionId on the fake.
      expect(fake.sessionId).toBe(536);
    });

    it("data=null + young local (just under threshold, 9999ms old) → still skip-young-local", () => {
      const fake = makeFakeStore({
        sessionId: 536,
        lastSetAt: FIXED_NOW - (YOUNG_LOCAL_THRESHOLD_MS - 1),
      });

      reconcileActiveSession(null, fake.__asState());

      expect(fake.clear).not.toHaveBeenCalled();
      expect(fake.setSession).not.toHaveBeenCalled();
    });

    it("data=null + old local (exactly at threshold, 10000ms old) → clear-local fires", () => {
      const fake = makeFakeStore({
        sessionId: 536,
        lastSetAt: FIXED_NOW - YOUNG_LOCAL_THRESHOLD_MS,
      });

      reconcileActiveSession(null, fake.__asState());

      expect(fake.clear).toHaveBeenCalledTimes(1);
      expect(fake.setSession).not.toHaveBeenCalled();
    });

    it("data=null + old local (30s) → clear-local fires (legitimate cleanup path)", () => {
      const fake = makeFakeStore({
        sessionId: 536,
        lastSetAt: FIXED_NOW - 30_000,
      });

      reconcileActiveSession(null, fake.__asState());

      expect(fake.clear).toHaveBeenCalledTimes(1);
      expect(fake.setSession).not.toHaveBeenCalled();
    });

    it("data populated + young local with same id → setSession runs (guard does NOT override valid BE state)", () => {
      const fake = makeFakeStore({
        sessionId: 7,
        lastSetAt: FIXED_NOW - 100,
      });

      reconcileActiveSession(API_SESSION_7, fake.__asState());

      expect(fake.clear).not.toHaveBeenCalled();
      expect(fake.setSession).toHaveBeenCalledTimes(1);
    });

    it("data populated + young local with different id → setSession runs (eviction; guard scoped to BE-null only)", () => {
      const fake = makeFakeStore({
        sessionId: 999,
        lastSetAt: FIXED_NOW - 100,
      });

      reconcileActiveSession(API_SESSION_7, fake.__asState());

      expect(fake.clear).not.toHaveBeenCalled();
      expect(fake.setSession).toHaveBeenCalledTimes(1);
    });

    it("data=null + lastSetAt=null + sessionId set → clear-local (no stamp = legacy path, no guard)", () => {
      // Pre-2026-05-08 sessions might not have a `lastSetAt` stamp
      // (e.g. a setSession that landed before this branch shipped).
      // The guard skips when stamp is null so legitimate cleanup
      // still fires.
      const fake = makeFakeStore({ sessionId: 536, lastSetAt: null });

      reconcileActiveSession(null, fake.__asState());

      expect(fake.clear).toHaveBeenCalledTimes(1);
      expect(fake.setSession).not.toHaveBeenCalled();
    });
  });

  // ── Non-draft skip / clear (PR #105 / PR-UX-7, 2026-05-09) ─────
  //
  // The BE's `getActiveSessionForAuthor` returns sessions whose
  // status is in `{draft, pending_review, committing}` (per
  // `STILL_ALIVE_STATUSES` in `reorganizationService.ts`). The
  // local pending-reality store is the FE surface for `draft`
  // sessions only — re-hydrating a `pending_review` row makes
  // the user think their finalize did nothing (the user-visible
  // bug that prompted PR #105).

  describe("non-draft skip / clear (PR #105 — 2026-05-09 Finalize-A)", () => {
    it("data populated with status=pending_review + store empty → skip-non-draft (NO setSession, NO clear)", () => {
      const fake = makeFakeStore({ sessionId: null });

      reconcileActiveSession(API_SESSION_7_PENDING_REVIEW, fake.__asState());

      expect(fake.setSession).not.toHaveBeenCalled();
      expect(fake.clear).not.toHaveBeenCalled();
      expect(fake.sessionId).toBeNull();
    });

    it("data populated with status=committing + store empty → skip-non-draft (NO setSession, NO clear)", () => {
      const fake = makeFakeStore({ sessionId: null });

      reconcileActiveSession(API_SESSION_7_COMMITTING, fake.__asState());

      expect(fake.setSession).not.toHaveBeenCalled();
      expect(fake.clear).not.toHaveBeenCalled();
    });

    it("data populated with status=pending_review + matching id in local store → clear-local-non-draft (race after finalize where dismissAfter hadn't fired yet)", () => {
      // Race scenario: the user tapped Finalize, the BE flipped
      // the row to `pending_review`, the realtime invalidation
      // raced the `dismissAfter` callback, and the refetch
      // arrived BEFORE `clear()` ran. The reconciler must
      // defensively clear so the store doesn't hold a session
      // whose status it cannot legally produce.
      const fake = makeFakeStore({ sessionId: 7 });

      reconcileActiveSession(API_SESSION_7_PENDING_REVIEW, fake.__asState());

      expect(fake.setSession).not.toHaveBeenCalled();
      expect(fake.clear).toHaveBeenCalledTimes(1);
    });

    it("data populated with status=pending_review + DIFFERENT id in local store → skip-non-draft (the unrelated draft survives)", () => {
      // Edge case: the user has a fresh draft (id=42) staged, and
      // the BE returns a different session (id=7) that's already
      // pending_review (e.g. a stale active for the same user
      // multi-active edge in `getActiveSessionForAuthor`). We must
      // NOT clear the local draft AND must NOT adopt the
      // pending_review row.
      const fake = makeFakeStore({ sessionId: 42 });

      reconcileActiveSession(API_SESSION_7_PENDING_REVIEW, fake.__asState());

      expect(fake.setSession).not.toHaveBeenCalled();
      expect(fake.clear).not.toHaveBeenCalled();
      expect(fake.sessionId).toBe(42);
    });

    it("data populated with status=draft + store empty → adopt-fetched STILL fires (existing happy path preserved)", () => {
      // Regression guard for the most-load-bearing existing path.
      // A draft session is exactly the row this store is allowed
      // to hold; the non-draft branch must not regress this.
      const fake = makeFakeStore({ sessionId: null });

      reconcileActiveSession(API_SESSION_7, fake.__asState());

      expect(fake.setSession).toHaveBeenCalledTimes(1);
      expect(fake.clear).not.toHaveBeenCalled();
    });
  });

  // ── Adopt snooze (PR-UX-12, 2026-05-09) ──────────────────────────

  describe("adopt snooze (PR-UX-12, 2026-05-09)", () => {
    let nowSpy: jest.SpyInstance;
    const FIXED_NOW = 1_778_286_584_605;

    beforeEach(() => {
      nowSpy = jest.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    });

    afterEach(() => {
      nowSpy.mockRestore();
    });

    it("data populated + empty store + future snooze → skip-adopt-snoozed (no setSession)", () => {
      const fake = makeFakeStore({
        sessionId: null,
        adoptSnoozeUntilMs: FIXED_NOW + 30_000,
      });

      reconcileActiveSession(API_SESSION_7, fake.__asState());

      // The user's just-cancelled state is preserved — the next
      // pending_review session in the BE queue does NOT auto-adopt.
      expect(fake.setSession).not.toHaveBeenCalled();
      expect(fake.clear).not.toHaveBeenCalled();
    });

    it("data populated + empty store + expired snooze → adopt-fetched runs normally", () => {
      // A snooze that already expired must not block adoption — the
      // 60s timer is generous, but legitimate sessions arriving past
      // it should land normally.
      const fake = makeFakeStore({
        sessionId: null,
        adoptSnoozeUntilMs: FIXED_NOW - 1,
      });

      reconcileActiveSession(API_SESSION_7, fake.__asState());

      expect(fake.setSession).toHaveBeenCalledTimes(1);
    });

    it("data populated + empty store + null snooze → adopt-fetched (no snooze, baseline path)", () => {
      const fake = makeFakeStore({
        sessionId: null,
        adoptSnoozeUntilMs: null,
      });

      reconcileActiveSession(API_SESSION_7, fake.__asState());

      expect(fake.setSession).toHaveBeenCalledTimes(1);
    });

    it("data populated + matching id + future snooze → refresh-fetched still fires (snooze does NOT block same-id refresh)", () => {
      // A re-stage immediately after cancel could write the same
      // session id back via setSession; the BE refetch returning
      // that id MUST still refresh (otherwise the user's re-stage
      // would visually disappear). The snooze is scoped to the
      // empty-store + different-id case only.
      const fake = makeFakeStore({
        sessionId: 7,
        adoptSnoozeUntilMs: FIXED_NOW + 30_000,
      });

      reconcileActiveSession(API_SESSION_7, fake.__asState());

      expect(fake.setSession).toHaveBeenCalledTimes(1);
    });

    it("data populated + populated store with different id + future snooze → adopt-fetched (snooze scoped to empty-store only)", () => {
      // The eviction branch (different local id, fetched id) is the
      // ordinary "BE truth wins" path — the user has somehow ended
      // up with a non-cancel local session different from the BE.
      // The snooze guard is post-cancel only (sessionId == null);
      // populated-store evictions still go through.
      const fake = makeFakeStore({
        sessionId: 999,
        adoptSnoozeUntilMs: FIXED_NOW + 30_000,
      });

      reconcileActiveSession(API_SESSION_7, fake.__asState());

      expect(fake.setSession).toHaveBeenCalledTimes(1);
    });

    it("data=null + future snooze + empty store → noop (BE-null + empty = nothing to do, snooze is irrelevant)", () => {
      // Belt-and-suspenders: snooze interacts with adoption only;
      // BE-null branches ignore it.
      const fake = makeFakeStore({
        sessionId: null,
        adoptSnoozeUntilMs: FIXED_NOW + 30_000,
      });

      reconcileActiveSession(null, fake.__asState());

      expect(fake.clear).not.toHaveBeenCalled();
      expect(fake.setSession).not.toHaveBeenCalled();
    });
  });
});
