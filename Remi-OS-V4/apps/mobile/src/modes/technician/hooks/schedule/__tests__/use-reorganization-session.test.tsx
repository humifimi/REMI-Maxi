/**
 * Tests for `useReorganizationSession(id)` (P3-FE-REHYDRATE-DETAIL §6.4).
 *
 * Four cases per the chunk-prompt:
 *   1. Hook `enabled: false` when `id = null` (no fetch fires).
 *   2. Hook `enabled: true` when `id != null`; success path writes
 *      the store via the shared `reconcileActiveSession` helper.
 *   3. 404 path: surfaces `query.error` AND clears the store
 *      (because the BE returns 404 for a session that was
 *      finalized/cancelled between mount and the GET firing).
 *   4. Network error path: surfaces `query.error`, store untouched.
 *
 * TanStack Query v5 note: v5 removed `onSuccess`/`onError` from
 * `useQuery`. The hook handles the success-side reconcile and the
 * 404-side clear inside `queryFn` directly (catching the AxiosError
 * and rethrowing after reconciling). The behavior contract pinned
 * here is identical to the §6.4 plan; the implementation site
 * differs because of v5's API. See the comment block on
 * `useReorganizationSession` in `../use-reorganization.ts`.
 */

import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AxiosError, AxiosResponse } from "axios";
import React from "react";

import { useReorganizationSession } from "../use-reorganization";
import {
  __resetPendingRealityStoreForTests,
  usePendingRealityStore,
} from "@technician/stores/pending-reality";
import {
  makeIntent,
  makeSession,
} from "@technician/stores/__fixtures__/pending-reality";

// ── Module mocks ────────────────────────────────────────────────────

const mockApi = jest.fn();
jest.mock("@technician/api/client", () => ({
  __esModule: true,
  api: (...args: unknown[]) => mockApi(...args),
}));

// ── Helpers ─────────────────────────────────────────────────────────

const SESSION_ID = 7001;
const SESSION = makeSession({ id: SESSION_ID });
const INTENT_A = makeIntent(140, { session_id: SESSION_ID });
const INTENT_B = makeIntent(141, { session_id: SESSION_ID });

function makeApiSession() {
  return {
    ...SESSION,
    intents: [INTENT_A, INTENT_B],
  };
}

function makeAxios404Error(): AxiosError {
  const err = new Error(
    "Request failed with status code 404",
  ) as AxiosError;
  err.isAxiosError = true;
  err.response = {
    status: 404,
    data: {
      error: true,
      message: "session_not_found",
      data: null,
    },
  } as AxiosResponse;
  return err;
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

beforeEach(() => {
  __resetPendingRealityStoreForTests();
  mockApi.mockReset();
});

// ──────────────────────────────────────────────────────────────────
// 1. enabled: false when id is null
// ──────────────────────────────────────────────────────────────────

describe("useReorganizationSession — id gating", () => {
  it("does NOT fire the GET when id is null (enabled gate is false)", async () => {
    const { Wrapper } = buildWrapper();

    const { result } = renderHook(() => useReorganizationSession(null), {
      wrapper: Wrapper,
    });

    // Settle for one tick so any latent fetch would have a chance to
    // fire before we assert it didn't.
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockApi).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    // Store untouched.
    expect(usePendingRealityStore.getState().sessionId).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────
// 2. success path
// ──────────────────────────────────────────────────────────────────

describe("useReorganizationSession — success path", () => {
  it("fires GET /reorganizations/:id and writes the store via reconcileActiveSession", async () => {
    const { Wrapper } = buildWrapper();
    mockApi.mockResolvedValueOnce(makeApiSession());

    const { result } = renderHook(
      () => useReorganizationSession(SESSION_ID),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApi).toHaveBeenCalledTimes(1);
    const [method, url] = mockApi.mock.calls[0]!;
    expect(method).toBe("get");
    expect(url).toBe(`/reorganizations/${SESSION_ID}`);

    // Reconcile result: store hydrated with the BE's (session, intents).
    const state = usePendingRealityStore.getState();
    expect(state.sessionId).toBe(SESSION_ID);
    expect(state.session?.id).toBe(SESSION_ID);
    expect(state.intents).toEqual([INTENT_A, INTENT_B]);
    // Returned data still includes the wire-shape `intents` field —
    // consumers can read either the store or `query.data`.
    expect(result.current.data?.intents).toEqual([INTENT_A, INTENT_B]);
  });
});

// ──────────────────────────────────────────────────────────────────
// 3. 404 path — surfaces error AND clears the store
// ──────────────────────────────────────────────────────────────────

describe("useReorganizationSession — 404 path", () => {
  it("surfaces query.error and clears the store when the local stamp is past the young-local threshold", async () => {
    const { Wrapper } = buildWrapper();
    // Pre-seed the store so we can assert the 404 actually evicts it.
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });
    expect(usePendingRealityStore.getState().sessionId).toBe(SESSION_ID);
    // Age the local stamp past the 10s young-local guard so the
    // reconcile-with-null branch's clear() actually fires. Pre-
    // 2026-05-08 P3-FE-RECONCILE-RACE the test didn't need this
    // — reconcile cleared unconditionally on null.
    act(() => {
      usePendingRealityStore.setState({ lastSetAt: Date.now() - 30_000 });
    });

    mockApi.mockRejectedValueOnce(makeAxios404Error());

    const { result } = renderHook(
      () => useReorganizationSession(SESSION_ID),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeDefined();
    expect((result.current.error as AxiosError).response?.status).toBe(404);

    // Store was cleared by the reconcile-with-null branch.
    expect(usePendingRealityStore.getState().sessionId).toBeNull();
    expect(usePendingRealityStore.getState().session).toBeNull();
  });

  it("404 with YOUNG local session does NOT clear (P3-FE-RECONCILE-RACE young-local guard)", async () => {
    const { Wrapper } = buildWrapper();
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });
    // No aging — `setSession` just stamped lastSetAt to ~now, so
    // localAgeMs is < 10s and the guard fires.
    expect(usePendingRealityStore.getState().sessionId).toBe(SESSION_ID);

    mockApi.mockRejectedValueOnce(makeAxios404Error());

    const { result } = renderHook(
      () => useReorganizationSession(SESSION_ID),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    // Error still surfaces (the queryFn rethrows 404 after the
    // reconcile attempt) — the consumer can render an empty state.
    // But the store survives because the guard fired.
    expect((result.current.error as AxiosError).response?.status).toBe(404);
    expect(usePendingRealityStore.getState().sessionId).toBe(SESSION_ID);
  });
});

// ──────────────────────────────────────────────────────────────────
// 4. network error path — surfaces error, store untouched
// ──────────────────────────────────────────────────────────────────

describe("useReorganizationSession — network error path", () => {
  it("surfaces query.error and leaves the store untouched on a non-404 failure", async () => {
    const { Wrapper } = buildWrapper();
    // Pre-seed the store; a network blip should NOT evict it because
    // the local draft is still valid — the reconcile-with-null
    // branch is reserved for 404 specifically.
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });
    expect(usePendingRealityStore.getState().sessionId).toBe(SESSION_ID);

    mockApi.mockRejectedValueOnce(makeNetworkError());

    const { result } = renderHook(
      () => useReorganizationSession(SESSION_ID),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeDefined();
    // Store untouched — the seeded session survives.
    const state = usePendingRealityStore.getState();
    expect(state.sessionId).toBe(SESSION_ID);
    expect(state.session?.id).toBe(SESSION_ID);
  });
});
