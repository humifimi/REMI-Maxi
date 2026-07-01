/**
 * Tests for `useRealtimeReorganization` (P6-FE-1, FE-G14).
 *
 * The hook has two halves and a regression that drops EITHER half
 * still passes a test that only asserts the other, so per the chunk
 * spec each event kind is exercised twice — once for the cache
 * invalidation, once for the active-session store coordination
 * (including a no-op assertion when the event's `session_id` does NOT
 * match the active session).
 *
 * The WS layer is not exercised directly. We drive the pure event
 * router (`handleReorganizationEvent`) — this is the same code path
 * `useRealtimeChannel` invokes via `onMessage`, so a passing dispatch
 * test covers the wiring through the hook (which is itself a thin
 * shell of `useMemo`/`useCallback` over the router + `useRealtimeChannel`).
 *
 * The wiring half (channel string derivation, no-op when logged out,
 * etc.) is covered separately via `renderHook` with a mocked
 * `useRealtimeChannel`.
 */

import React from "react";
import { renderHook } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  __resetPendingRealityStoreForTests,
  usePendingRealityStore,
} from "@technician/stores/pending-reality";
import { useAuthStore } from "@/src/stores/auth";
import { calendarKeys } from "@technician/hooks/schedule/use-calendar";
import { makeSession } from "@technician/stores/__fixtures__/pending-reality";
import { UserRole } from "@technician/types/enums";

import {
  KNOWN_REORG_EVENTS,
  type ReorganizationRealtimeEvent,
  handleReorganizationEvent,
  useRealtimeReorganization,
} from "../use-realtime-reorganization";

// `useRealtimeChannel` opens a real WS at module load time of any
// consumer that mounts it. Mock it so the wiring-half test can
// assert what `channel` / `onMessage` it received without spinning
// up a fake server.
const mockUseRealtimeChannel = jest.fn();
jest.mock("../use-realtime-channel", () => ({
  __esModule: true,
  useRealtimeChannel: (opts: unknown) => mockUseRealtimeChannel(opts),
}));

// ── Helpers ─────────────────────────────────────────────────────────

const ACTIVE_SESSION_ID = 7001;
const OTHER_SESSION_ID = 9999;

function buildEvent(
  event: string,
  sessionId: number,
): ReorganizationRealtimeEvent {
  return {
    event,
    session_id: sessionId,
    session_summary: {
      id: sessionId,
      source: "tech_app",
      status: "draft",
      intent_count: 0,
    },
  };
}

function spyOnInvalidations(client: QueryClient) {
  return jest.spyOn(client, "invalidateQueries");
}

function findInvalidationFor(
  spy: jest.SpyInstance,
  predicate: (key: readonly unknown[]) => boolean,
): boolean {
  return spy.mock.calls.some((call) => {
    const filter = call[0] as { queryKey?: readonly unknown[] } | undefined;
    return Array.isArray(filter?.queryKey) && predicate(filter!.queryKey!);
  });
}

function startsWith(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  if (key.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (key[i] !== prefix[i]) return false;
  }
  return true;
}

// ── Suite ───────────────────────────────────────────────────────────

describe("useRealtimeReorganization — handleReorganizationEvent (event router)", () => {
  let queryClient: QueryClient;
  let invalidateSpy: jest.SpyInstance;

  beforeEach(() => {
    __resetPendingRealityStoreForTests();
    queryClient = new QueryClient();
    invalidateSpy = spyOnInvalidations(queryClient);
  });

  afterEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
  });

  // ── Cache invalidation half ────────────────────────────────────

  describe("cache invalidations", () => {
    it("session_created → invalidates ['reorganizations'] only", () => {
      handleReorganizationEvent(
        buildEvent("session_created", 555),
        queryClient,
      );

      expect(
        findInvalidationFor(invalidateSpy, (k) =>
          startsWith(k, ["reorganizations"]),
        ),
      ).toBe(true);
      // No per-session detail fetch; no calendar refetch.
      expect(
        findInvalidationFor(invalidateSpy, (k) => startsWith(k, calendarKeys.all)),
      ).toBe(false);
    });

    it("session_finalized → invalidates ['reorganizations'] AND ['reorganizations','session',id]", () => {
      handleReorganizationEvent(
        buildEvent("session_finalized", 42),
        queryClient,
      );

      expect(
        findInvalidationFor(invalidateSpy, (k) =>
          startsWith(k, ["reorganizations"]),
        ),
      ).toBe(true);
      expect(
        findInvalidationFor(invalidateSpy, (k) =>
          startsWith(k, ["reorganizations", "session", 42]),
        ),
      ).toBe(true);
    });

    it("authorization_granted / authorization_denied → same invalidation as session_finalized", () => {
      handleReorganizationEvent(
        buildEvent("authorization_granted", 42),
        queryClient,
      );
      handleReorganizationEvent(
        buildEvent("authorization_denied", 42),
        queryClient,
      );

      // Two invocations × at least 2 keys each = at least 4 invalidations
      // matching ["reorganizations"]; the per-session one fires for both.
      const perSessionHits = invalidateSpy.mock.calls.filter((call) => {
        const key = (call[0] as { queryKey?: readonly unknown[] }).queryKey;
        return Array.isArray(key) && startsWith(key, ["reorganizations", "session", 42]);
      });
      expect(perSessionHits.length).toBeGreaterThanOrEqual(2);
    });

    it("session_committed → invalidates ['reorganizations'] AND ['reorganizations','session',id] AND calendarKeys.all", () => {
      handleReorganizationEvent(
        buildEvent("session_committed", 42),
        queryClient,
      );

      expect(
        findInvalidationFor(invalidateSpy, (k) =>
          startsWith(k, ["reorganizations"]),
        ),
      ).toBe(true);
      expect(
        findInvalidationFor(invalidateSpy, (k) =>
          startsWith(k, ["reorganizations", "session", 42]),
        ),
      ).toBe(true);
      expect(
        findInvalidationFor(invalidateSpy, (k) =>
          startsWith(k, calendarKeys.all),
        ),
      ).toBe(true);
    });

    it("session_cancelled / session_expired → invalidate session row, NOT the calendar (world unchanged)", () => {
      handleReorganizationEvent(
        buildEvent("session_cancelled", 42),
        queryClient,
      );
      expect(
        findInvalidationFor(invalidateSpy, (k) =>
          startsWith(k, ["reorganizations", "session", 42]),
        ),
      ).toBe(true);
      expect(
        findInvalidationFor(invalidateSpy, (k) => startsWith(k, calendarKeys.all)),
      ).toBe(false);

      invalidateSpy.mockClear();

      handleReorganizationEvent(
        buildEvent("session_expired", 42),
        queryClient,
      );
      expect(
        findInvalidationFor(invalidateSpy, (k) =>
          startsWith(k, ["reorganizations", "session", 42]),
        ),
      ).toBe(true);
      expect(
        findInvalidationFor(invalidateSpy, (k) => startsWith(k, calendarKeys.all)),
      ).toBe(false);
    });

    it("session_failed → invalidates session row but NOT calendar", () => {
      handleReorganizationEvent(
        buildEvent("session_failed", 42),
        queryClient,
      );
      expect(
        findInvalidationFor(invalidateSpy, (k) =>
          startsWith(k, ["reorganizations", "session", 42]),
        ),
      ).toBe(true);
      expect(
        findInvalidationFor(invalidateSpy, (k) => startsWith(k, calendarKeys.all)),
      ).toBe(false);
    });

    it("unknown event → conservative ['reorganizations'] invalidation, no store mutation", () => {
      const session = makeSession({ id: ACTIVE_SESSION_ID });
      usePendingRealityStore.getState().setSession(session);

      handleReorganizationEvent(
        buildEvent("session_updated_someday", ACTIVE_SESSION_ID),
        queryClient,
      );

      expect(
        findInvalidationFor(invalidateSpy, (k) =>
          startsWith(k, ["reorganizations"]),
        ),
      ).toBe(true);
      // Active session must remain untouched; the unknown branch does
      // NOT call clear() / setSession().
      expect(usePendingRealityStore.getState().sessionId).toBe(ACTIVE_SESSION_ID);
    });
  });

  // ── Active-session store coordination half ──────────────────────
  //
  // 2026-05-08 follow-up — the contract here flipped from "terminal
  // events on the active session call clear()" to "no event of any
  // kind, on any session, mutates the local store directly." The
  // realtime layer's job is invalidation; reconciliation flows
  // through `reconcileActiveSession` running in the queryFns of
  // `useActiveReorganization` and `useReorganizationSession(id)`
  // after they refetch. See the file-level JSDoc on
  // `handleReorganizationEvent` for the rationale and the
  // `clear`-JSDoc invariant 2 ("REALTIME MUST NOT MUTATE THE
  // STORE") for the invariant.

  describe("active-session store coordination — invariant: realtime never mutates the store", () => {
    beforeEach(() => {
      // Seed an active session so any direct store mutation by the
      // handler would be observable as a state change.
      const session = makeSession({ id: ACTIVE_SESSION_ID, status: "draft" });
      usePendingRealityStore.getState().setSession(session);
    });

    /**
     * Module-level invariant test: `usePendingRealityStore.getState().clear`
     * MUST NOT be invoked by `handleReorganizationEvent` for any event
     * kind, regardless of whether the event's `session_id` matches the
     * active local session.
     *
     * This is the user-reported regression's true root cause: a
     * sessionId-match guard let through legitimate `session_created`
     * (and any future `intent_added`) events that the BE emits for
     * the user's OWN just-staged session, and the gated `clear()`
     * fired anyway. The fix is to remove the `clear()` call entirely;
     * the test pins the invariant.
     */
    it("never calls clear() for any event kind on any sessionId — drives the full event matrix", () => {
      const clearSpy = jest.spyOn(
        usePendingRealityStore.getState(),
        "clear",
      );

      const eventKinds: readonly string[] = [
        ...KNOWN_REORG_EVENTS,
        // Future-proofing: a realtime envelope shape that doesn't
        // exist today but the chunk-prompt sketched (`intent_added`).
        // If the BE ever ships it, this assertion catches a regression
        // where someone wires it through to a `clear()` call.
        "intent_added",
        // Garbage / unknown event — the default branch.
        "session_updated_someday",
      ];

      const sessionIds: readonly number[] = [
        // Match the active local session (the previous "matchesActive
        // === true" branch).
        ACTIVE_SESSION_ID,
        // Mismatch (the "matchesActive === false" branch) — including
        // the user's just-staged-then-trailing-event scenario.
        OTHER_SESSION_ID,
      ];

      for (const eventKind of eventKinds) {
        for (const sessionId of sessionIds) {
          handleReorganizationEvent(
            buildEvent(eventKind, sessionId),
            queryClient,
          );
        }
      }

      expect(clearSpy).toHaveBeenCalledTimes(0);

      // Defensive — store state must also still hold the active
      // session. Reconciliation via the queryFn refetch path is what
      // changes local store; this router does not.
      const state = usePendingRealityStore.getState();
      expect(state.sessionId).toBe(ACTIVE_SESSION_ID);
      expect(state.session).not.toBeNull();

      clearSpy.mockRestore();
    });

    it.each(["session_committed", "session_cancelled", "session_expired"] as const)(
      "%s on active session → store untouched (reconcile via refetch is the only mutation path)",
      (eventKind) => {
        handleReorganizationEvent(
          buildEvent(eventKind, ACTIVE_SESSION_ID),
          queryClient,
        );

        const state = usePendingRealityStore.getState();
        // Pre-2026-05-08 follow-up: this test asserted `clear()` had
        // fired and `sessionId` was null. Post-fix: realtime no longer
        // mutates local; the BE-canonical answer flows in via the
        // refetch the invalidation triggers.
        expect(state.sessionId).toBe(ACTIVE_SESSION_ID);
        expect(state.session).not.toBeNull();
      },
    );

    it.each(["session_committed", "session_cancelled", "session_expired"] as const)(
      "%s on a DIFFERENT session → store untouched",
      (eventKind) => {
        handleReorganizationEvent(
          buildEvent(eventKind, OTHER_SESSION_ID),
          queryClient,
        );

        const state = usePendingRealityStore.getState();
        expect(state.sessionId).toBe(ACTIVE_SESSION_ID);
        expect(state.session).not.toBeNull();
      },
    );

    it.each([
      "session_created",
      "session_finalized",
      "session_failed",
      "authorization_granted",
      "authorization_denied",
    ] as const)(
      "%s on active session → store untouched (refetch path handles status)",
      (eventKind) => {
        handleReorganizationEvent(
          buildEvent(eventKind, ACTIVE_SESSION_ID),
          queryClient,
        );

        const state = usePendingRealityStore.getState();
        expect(state.sessionId).toBe(ACTIVE_SESSION_ID);
        expect(state.session).not.toBeNull();
      },
    );

    it("KNOWN_REORG_EVENTS list matches the dispatch coverage above", () => {
      // Catches the failure mode where someone adds a new event to the
      // BE without updating the dispatch — the test list above is
      // hand-maintained but `KNOWN_REORG_EVENTS` is the single source
      // of truth, so any new value MUST be added to one of the
      // it.each() arrays above (or this assertion will start failing
      // when the KNOWN_REORG_EVENTS const grows).
      expect(KNOWN_REORG_EVENTS).toEqual([
        "session_created",
        "session_finalized",
        "session_committed",
        "session_failed",
        "session_cancelled",
        "authorization_granted",
        "authorization_denied",
        "session_expired",
      ]);
    });
  });

  // ── Defensive parsing ───────────────────────────────────────────

  describe("payload defensiveness", () => {
    it("missing session_summary → still dispatches (only session_id is required)", () => {
      const event: ReorganizationRealtimeEvent = {
        event: "session_created",
        session_id: 12,
      };
      expect(() =>
        handleReorganizationEvent(event, queryClient),
      ).not.toThrow();
      expect(
        findInvalidationFor(invalidateSpy, (k) =>
          startsWith(k, ["reorganizations"]),
        ),
      ).toBe(true);
    });
  });
});

// ── Wiring half (channel derivation + onMessage forwarding) ────────

describe("useRealtimeReorganization — wiring", () => {
  beforeEach(() => {
    mockUseRealtimeChannel.mockReset();
    mockUseRealtimeChannel.mockReturnValue({ connected: false });
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      isHydrated: true,
      biometricRequired: false,
    });
    __resetPendingRealityStoreForTests();
  });

  function renderUseRealtimeReorganization() {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);
    return renderHook(() => useRealtimeReorganization(), { wrapper });
  }

  it("passes channel=null when the user is not authenticated", () => {
    renderUseRealtimeReorganization();
    expect(mockUseRealtimeChannel).toHaveBeenCalled();
    const lastCall = mockUseRealtimeChannel.mock.calls.at(-1);
    expect(lastCall?.[0]?.channel).toBeNull();
  });

  it("passes channel=null when authenticated but no franchiseId on JWT", () => {
    useAuthStore.setState({
      accessToken: "token",
      refreshToken: "refresh",
      user: {
        userId: 1,
        email: "a@b.com",
        role: UserRole.TECHNICIAN,
        fullName: "A",
        // no franchiseId
      },
      isAuthenticated: true,
      isHydrated: true,
      biometricRequired: false,
    });

    renderUseRealtimeReorganization();
    const lastCall = mockUseRealtimeChannel.mock.calls.at(-1);
    expect(lastCall?.[0]?.channel).toBeNull();
  });

  it("subscribes to franchise:{id}:reorganization once authenticated with a franchiseId", () => {
    useAuthStore.setState({
      accessToken: "token",
      refreshToken: "refresh",
      user: {
        userId: 1,
        email: "a@b.com",
        role: UserRole.FRANCHISE_OWNER,
        fullName: "A",
        franchiseId: 17,
      },
      isAuthenticated: true,
      isHydrated: true,
      biometricRequired: false,
    });

    renderUseRealtimeReorganization();
    const lastCall = mockUseRealtimeChannel.mock.calls.at(-1);
    expect(lastCall?.[0]?.channel).toBe("franchise:17:reorganization");
    expect(typeof lastCall?.[0]?.onMessage).toBe("function");
  });

  it("ignores non-reorganization payloads passed to onMessage (defensive guard)", () => {
    useAuthStore.setState({
      accessToken: "token",
      refreshToken: "refresh",
      user: {
        userId: 1,
        email: "a@b.com",
        role: UserRole.FRANCHISE_OWNER,
        fullName: "A",
        franchiseId: 17,
      },
      isAuthenticated: true,
      isHydrated: true,
      biometricRequired: false,
    });

    renderUseRealtimeReorganization();
    const lastCall = mockUseRealtimeChannel.mock.calls.at(-1);
    const onMessage = lastCall?.[0]?.onMessage as (p: unknown) => void;

    // Garbage payloads should not throw or mutate the store.
    expect(() => onMessage(null)).not.toThrow();
    expect(() => onMessage(undefined)).not.toThrow();
    expect(() => onMessage({ event: 123, session_id: "wrong" })).not.toThrow();
    expect(() => onMessage({ random: "shape" })).not.toThrow();
  });
});
