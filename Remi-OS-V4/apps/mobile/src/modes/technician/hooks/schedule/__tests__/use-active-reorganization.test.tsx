/**
 * Tests for `useActiveReorganization()` (P3-FE-REHYDRATE-MOUNT §7.5).
 *
 * Eight cases mapping to the §7.4 edge-case table — the cold-start
 * mount-time GET that fixes the "Expo Go reload empties staged
 * appointments" bug.
 *
 *   1. `enabled: false` when not authenticated (no fetch fires).
 *   2. `enabled: false` when authed but `franchiseId == null`.
 *   3. `enabled: true` + 200 with `data: null` + EMPTY store →
 *      reconcile no-op (no `clear`, no `setSession`).
 *   4. `enabled: true` + 200 with `data: null` + POPULATED store
 *      (mid-staging) → `clear()` called (the chain-cancel-from-
 *      another-device path).
 *   5. `enabled: true` + 200 with populated session + EMPTY store →
 *      `setSession(session, intents)` called (the cold-start
 *      reload-mid-staging path — THE BUG FIX).
 *   6. `enabled: true` + 200 with populated session + MATCHING
 *      session id → `setSession(session, intents)` called (refresh
 *      path; same-id branch in the store handles the row+intents
 *      refresh).
 *   7. `enabled: true` + 200 with populated session + DIFFERENT
 *      session id → `setSession(session, intents)` called (eviction
 *      path; `setSession` evicts the stale session and hydrates
 *      with the new one).
 *   8. Network error → `query.error` populated, store untouched.
 *
 * TanStack Query v5 note: v5 removed `onSuccess`/`onError` from
 * `useQuery`. The hook handles the success-side reconcile and the
 * 404-side clear inside `queryFn` directly (catching the AxiosError
 * and rethrowing after reconciling). Mirrors the pattern in
 * `use-reorganization-session.test.tsx`.
 */

import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import React from "react";

import { useActiveReorganization } from "../use-reorganization";
import {
  __resetPendingRealityStoreForTests,
  usePendingRealityStore,
} from "@technician/stores/pending-reality";
import {
  makeIntent,
  makeSession,
} from "@technician/stores/__fixtures__/pending-reality";
import { useAuthStore } from "@/src/stores/auth";

// ── Module mocks ────────────────────────────────────────────────────

const mockApi = jest.fn();
jest.mock("@technician/api/client", () => ({
  __esModule: true,
  api: (...args: unknown[]) => mockApi(...args),
}));

// ── Helpers ─────────────────────────────────────────────────────────

const FRANCHISE_ID = 1;
const SESSION_ID = 7001;
const OTHER_SESSION_ID = 7002;
const SESSION = makeSession({ id: SESSION_ID });
const OTHER_SESSION = makeSession({ id: OTHER_SESSION_ID });
const INTENT_A = makeIntent(140, { session_id: SESSION_ID });
const INTENT_B = makeIntent(141, { session_id: SESSION_ID });

function makeApiSession() {
  return {
    ...SESSION,
    intents: [INTENT_A, INTENT_B],
  };
}

function makeApiSessionWithId(id: number) {
  return {
    ...makeSession({ id }),
    intents: [makeIntent(200, { session_id: id })],
  };
}

function makeNetworkError(): AxiosError {
  const err = new Error("Network Error") as AxiosError;
  err.isAxiosError = true;
  // `response` is intentionally absent — that's how axios surfaces a
  // network/CORS/dropped-connection failure.
  return err;
}

function buildWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: 0, retryDelay: 0 },
    },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return { queryClient, Wrapper };
}

/**
 * Drive the auth store directly. The hook reads via two
 * `useAuthStore` selectors (matching `useRealtimeReorganization`'s
 * gate byte-for-byte); writing the underlying state with `setState`
 * triggers both subscribers.
 */
function setAuth({
  isAuthenticated,
  franchiseId,
}: {
  isAuthenticated: boolean;
  franchiseId: number | null;
}) {
  useAuthStore.setState({
    isAuthenticated,
    user: franchiseId == null
      ? null
      : {
          userId: 42,
          email: "tech@example.com",
          role: "technician" as never,
          fullName: "Test Tech",
          franchiseId,
        },
  });
}

beforeEach(() => {
  __resetPendingRealityStoreForTests();
  mockApi.mockReset();
  // Default: logged out + no franchise. Each test that needs the
  // hook to fire flips this via `setAuth(...)` before render.
  setAuth({ isAuthenticated: false, franchiseId: null });
});

afterAll(() => {
  // Clean up the auth store so other suites don't inherit our state.
  useAuthStore.setState({ isAuthenticated: false, user: null });
});

// ──────────────────────────────────────────────────────────────────
// 1. enabled: false when not authenticated
// ──────────────────────────────────────────────────────────────────

describe("useActiveReorganization — auth gating", () => {
  it("does NOT fire the GET when not authenticated (enabled gate is false)", async () => {
    setAuth({ isAuthenticated: false, franchiseId: FRANCHISE_ID });
    const { Wrapper } = buildWrapper();

    const { result } = renderHook(() => useActiveReorganization(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockApi).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(usePendingRealityStore.getState().sessionId).toBeNull();
  });

  // ────────────────────────────────────────────────────────────────
  // 2. enabled: false when authed but franchiseId is null
  // ────────────────────────────────────────────────────────────────

  it("does NOT fire the GET when authed but franchiseId is null", async () => {
    setAuth({ isAuthenticated: true, franchiseId: null });
    const { Wrapper } = buildWrapper();

    const { result } = renderHook(() => useActiveReorganization(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockApi).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
  });
});

// ──────────────────────────────────────────────────────────────────
// 3. 200 + null data + empty store → no-op
// ──────────────────────────────────────────────────────────────────

describe("useActiveReorganization — null-response paths", () => {
  it("no-ops when the BE returns null AND the store is already empty", async () => {
    setAuth({ isAuthenticated: true, franchiseId: FRANCHISE_ID });
    const { Wrapper } = buildWrapper();
    mockApi.mockResolvedValueOnce(null);

    // Spy on `clear` so we can assert it was NOT called.
    const clearSpy = jest.spyOn(usePendingRealityStore.getState(), "clear");

    const { result } = renderHook(() => useActiveReorganization(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApi).toHaveBeenCalledTimes(1);
    const [method, url] = mockApi.mock.calls[0]!;
    expect(method).toBe("get");
    expect(url).toBe("/reorganizations/mine/active");

    // Store stays empty. Critically, `clear()` is NOT called — the
    // helper guards against firing eviction logs spuriously when the
    // BE confirms the empty state we already have.
    expect(usePendingRealityStore.getState().sessionId).toBeNull();
    expect(clearSpy).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();

    clearSpy.mockRestore();
  });

  // ────────────────────────────────────────────────────────────────
  // 4. 200 + null data + populated store → clear()
  // ────────────────────────────────────────────────────────────────

  it("calls clear() when the BE returns null AND the store has an OLD session (legitimate cleanup, lastSetAt past young-local threshold)", async () => {
    setAuth({ isAuthenticated: true, franchiseId: FRANCHISE_ID });
    const { Wrapper } = buildWrapper();
    mockApi.mockResolvedValueOnce(null);

    // Pre-seed the store as if the user reloaded mid-staging on a
    // session that was cancelled/committed from another device.
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });
    expect(usePendingRealityStore.getState().sessionId).toBe(SESSION_ID);

    // Age the local stamp past the young-local threshold (10s) so
    // the genuine cleanup path fires. Pre-2026-05-08 the test
    // didn't need this — reconcile cleared unconditionally on BE-
    // null. The young-local guard added in P3-FE-RECONCILE-RACE
    // intentionally protects fresh stamps against in-flight stale
    // GET responses, so this test now has to specifically
    // simulate a stamp that's older than the window.
    act(() => {
      usePendingRealityStore.setState({ lastSetAt: Date.now() - 30_000 });
    });

    const { result } = renderHook(() => useActiveReorganization(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Stale session evicted.
    expect(usePendingRealityStore.getState().sessionId).toBeNull();
    expect(usePendingRealityStore.getState().session).toBeNull();
    expect(result.current.data).toBeNull();
  });

  it("preserves a YOUNG local session when the BE returns null (P3-FE-RECONCILE-RACE young-local guard)", async () => {
    // Regression guard: BE returns null on `/mine/active` for a
    // freshly-staged draft session (the endpoint filters to
    // status: pending_review). The guard MUST defer to the local
    // stamp until the young window closes.
    setAuth({ isAuthenticated: true, franchiseId: FRANCHISE_ID });
    const { Wrapper } = buildWrapper();
    mockApi.mockResolvedValueOnce(null);

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });
    // `setSession` stamps `lastSetAt` to `Date.now()` automatically.
    expect(usePendingRealityStore.getState().sessionId).toBe(SESSION_ID);

    const { result } = renderHook(() => useActiveReorganization(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Young local session SURVIVES — the guard kept the just-staged
    // session intact even though the BE said null.
    expect(usePendingRealityStore.getState().sessionId).toBe(SESSION_ID);
    expect(usePendingRealityStore.getState().session).not.toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────
// 5. 200 + populated session + empty store → setSession (THE FIX)
// ──────────────────────────────────────────────────────────────────

describe("useActiveReorganization — populated-response paths", () => {
  it("hydrates an empty store from the BE's active session (cold-start fix)", async () => {
    setAuth({ isAuthenticated: true, franchiseId: FRANCHISE_ID });
    const { Wrapper } = buildWrapper();
    mockApi.mockResolvedValueOnce(makeApiSession());

    const { result } = renderHook(() => useActiveReorganization(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Store hydrated from the BE response.
    const state = usePendingRealityStore.getState();
    expect(state.sessionId).toBe(SESSION_ID);
    expect(state.session?.id).toBe(SESSION_ID);
    expect(state.intents).toEqual([INTENT_A, INTENT_B]);
    // Wire-shape `intents` survives on `query.data` for callers
    // that want to read either the store or the query.
    expect(result.current.data?.intents).toEqual([INTENT_A, INTENT_B]);
  });

  // ────────────────────────────────────────────────────────────────
  // 6. 200 + populated session + matching id → refresh path
  // ────────────────────────────────────────────────────────────────

  it("refreshes the row when the BE returns a session with the matching id", async () => {
    setAuth({ isAuthenticated: true, franchiseId: FRANCHISE_ID });
    const { Wrapper } = buildWrapper();
    // Pre-seed with the same id so this exercises the same-id
    // branch in `setSession` (atomic row+intents refresh).
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });
    expect(usePendingRealityStore.getState().sessionId).toBe(SESSION_ID);

    mockApi.mockResolvedValueOnce(makeApiSession());

    const { result } = renderHook(() => useActiveReorganization(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const state = usePendingRealityStore.getState();
    // Same id stays, intents replaced atomically by the BE response.
    expect(state.sessionId).toBe(SESSION_ID);
    expect(state.intents).toEqual([INTENT_A, INTENT_B]);
  });

  // ────────────────────────────────────────────────────────────────
  // 7. 200 + populated session + different id → eviction path
  // ────────────────────────────────────────────────────────────────

  it("evicts a stale session when the BE returns a different active session id", async () => {
    setAuth({ isAuthenticated: true, franchiseId: FRANCHISE_ID });
    const { Wrapper } = buildWrapper();
    // Pre-seed with the OLDER session.
    act(() => {
      usePendingRealityStore.getState().setSession(OTHER_SESSION);
    });
    expect(usePendingRealityStore.getState().sessionId).toBe(OTHER_SESSION_ID);

    // BE returns the NEWER one (multi-active race per §7.4 row 8).
    const newer = makeApiSessionWithId(SESSION_ID);
    mockApi.mockResolvedValueOnce(newer);

    const { result } = renderHook(() => useActiveReorganization(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const state = usePendingRealityStore.getState();
    expect(state.sessionId).toBe(SESSION_ID);
    expect(state.session?.id).toBe(SESSION_ID);
    // Old intents are gone; the BE's intent set is the new canonical one.
    expect(state.intents).toEqual(newer.intents);
  });
});

// ──────────────────────────────────────────────────────────────────
// 8. network error → query.error, store untouched
// ──────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────
// PR #105 (2026-05-09) — non-draft skip / clear at the hook layer
// ──────────────────────────────────────────────────────────────────
//
// End-to-end pin for the Finalize-A bug: BE returns the just-
// finalized session as `pending_review`; the local pending-reality
// store must NOT re-hydrate it.

describe("useActiveReorganization — non-draft skip (PR #105 Finalize-A)", () => {
  it("does NOT hydrate the local store when the BE returns a pending_review session into an empty store", async () => {
    setAuth({ isAuthenticated: true, franchiseId: FRANCHISE_ID });
    const { Wrapper } = buildWrapper();
    // BE returns the just-finalized session as `pending_review`.
    // Per `STILL_ALIVE_STATUSES` in
    // REMIBackend/src/services/reorganizationService.ts the
    // `mineActive` endpoint treats pending_review as alive.
    mockApi.mockResolvedValueOnce({
      ...makeSession({ id: SESSION_ID, status: "pending_review" }),
      intents: [INTENT_A, INTENT_B],
    });

    const { result } = renderHook(() => useActiveReorganization(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // The query's `data` carries the row (other consumers like the
    // AI tab read from the same cache and DO need the row), but the
    // local pending-reality store stays empty — the row is not a
    // composing draft.
    expect(result.current.data?.status).toBe("pending_review");
    const state = usePendingRealityStore.getState();
    expect(state.sessionId).toBeNull();
    expect(state.session).toBeNull();
    expect(state.intents).toEqual([]);
  });

  it("clears a stale local copy when the BE returns the same id but status has flipped past draft (race after finalize)", async () => {
    setAuth({ isAuthenticated: true, franchiseId: FRANCHISE_ID });
    const { Wrapper } = buildWrapper();
    // Pre-seed as if the user just staged a draft — the store
    // holds the draft row and the realtime invalidation hasn't
    // had a chance to write through yet.
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });
    expect(usePendingRealityStore.getState().sessionId).toBe(SESSION_ID);
    // Pretend the local stamp is older than the young-local
    // window so the young-local guard cannot interfere with the
    // assertion. (The guard is null-branch only, so this is
    // belt-and-suspenders.)
    act(() => {
      usePendingRealityStore.setState({ lastSetAt: Date.now() - 30_000 });
    });

    // BE returns the SAME session id but with status flipped to
    // `pending_review` (the user just tapped Finalize and the BE
    // moved the row).
    mockApi.mockResolvedValueOnce({
      ...makeSession({ id: SESSION_ID, status: "pending_review" }),
      intents: [INTENT_A, INTENT_B],
    });

    const { result } = renderHook(() => useActiveReorganization(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // The defensive `clear-local-non-draft` branch fired — the
    // local store is empty even though the BE returned a row.
    const state = usePendingRealityStore.getState();
    expect(state.sessionId).toBeNull();
    expect(state.session).toBeNull();
  });
});

describe("useActiveReorganization — network error path", () => {
  it("surfaces query.error and leaves the store untouched on a network failure", async () => {
    setAuth({ isAuthenticated: true, franchiseId: FRANCHISE_ID });
    const { Wrapper } = buildWrapper();
    // Pre-seed; a network blip should NOT evict the local draft —
    // the user can keep working and the realtime path / next
    // foreground fetch will recover (per §7.4 row 7).
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });
    expect(usePendingRealityStore.getState().sessionId).toBe(SESSION_ID);

    mockApi.mockRejectedValueOnce(makeNetworkError());

    const { result } = renderHook(() => useActiveReorganization(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeDefined();
    // Store untouched — the seeded session survives.
    const state = usePendingRealityStore.getState();
    expect(state.sessionId).toBe(SESSION_ID);
    expect(state.session?.id).toBe(SESSION_ID);
  });
});
