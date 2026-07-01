/**
 * Tests for the producer-half mutation hooks (P3-FE-7):
 *   - `useCreateReorganizationSession`
 *   - `useAddReorganizationIntent`
 *   - `useCancelReorganizationSession`
 *
 * Each hook follows the same shape as `useApplyAutoFix` (P3-FE-9):
 *   - thin wrapper around TanStack Query's `useMutation`
 *   - auto-generates one `Idempotency-Key` per `mutate()` call via
 *     `Crypto.randomUUID()`
 *   - reuses the same key on a TanStack-Query-internal retry (variables
 *     are passed verbatim across retries)
 *   - synchronizes `usePendingRealityStore` on success per its own
 *     post-success protocol
 *
 * The contracts pinned below mirror `use-apply-auto-fix.test.tsx`.
 *
 * NOTE: this repo does not currently ship a Jest runner end-to-end
 * (see `src/hooks/ui/__tests__/use-wide-canvas.test.ts` for the
 * precedent). The file follows the canonical jest-expo +
 * `@testing-library/react-native` shape — every assertion below
 * should pass once the runner lands.
 */

import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AxiosError, AxiosResponse } from "axios";
import React from "react";

import {
  useAddReorganizationIntent,
  useCancelReorganizationSession,
  useCreateReorganizationSession,
  useModifyReorganizationIntent,
} from "../use-reorganization";
import {
  __resetPendingRealityStoreForTests,
  usePendingRealityStore,
} from "@technician/stores/pending-reality";
import {
  makeIntent,
  makeSession,
} from "@technician/stores/__fixtures__/pending-reality";
import type { ReorganizationIntentPayload } from "@technician/types/reorganization";
import type { LinterWorldSnapshot } from "@technician/utils/logistics-linter";

// ── Module mocks ────────────────────────────────────────────────────

const mockApi = jest.fn();
jest.mock("@technician/api/client", () => ({
  __esModule: true,
  api: (...args: unknown[]) => mockApi(...args),
}));

const mockRandomUUID = jest.fn();
jest.mock("expo-crypto", () => ({
  __esModule: true,
  randomUUID: () => mockRandomUUID(),
}));

// ── Helpers ─────────────────────────────────────────────────────────

const SESSION = makeSession();
const INTENT = makeIntent(140, {
  intent_type: "reschedule",
  appointment_id: 5002,
});
const PROPOSED_PAYLOAD: ReorganizationIntentPayload = {
  kind: "reschedule",
  new_scheduled_date: "2026-04-24",
  new_start_time: "11:00",
  new_end_time: "12:00",
};
const WORLD: LinterWorldSnapshot = {
  appointments: [],
  routes: [],
  customerSlas: [],
  fleet: { accounts: [] },
};

function makeAxios500Error(): AxiosError {
  const err = new Error("Request failed with status code 500") as AxiosError;
  err.isAxiosError = true;
  err.response = {
    status: 500,
    data: { error: true, message: "internal_server_error", data: null },
  } as AxiosResponse;
  return err;
}

function makeApiSession() {
  return {
    ...SESSION,
    intents: [INTENT],
  };
}

function buildWrapper(retry = 0) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry, retryDelay: 0 },
      queries: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

/**
 * Same shape as `buildWrapper` but exposes the `queryClient` so a
 * test can spy on `setQueryData`. Used by the cancel-hook
 * regression guard for fix/clear-must-stay-local — the hook MUST
 * NOT touch the cache on its own anymore.
 */
function buildWrapperWithClient(retry = 0) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry, retryDelay: 0 },
      queries: { retry: false },
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
  mockRandomUUID.mockReset();
});

// ──────────────────────────────────────────────────────────────────
// useCreateReorganizationSession
// ──────────────────────────────────────────────────────────────────

describe("useCreateReorganizationSession", () => {
  it("POSTs to /reorganizations with the createSessionBodySchema body and Idempotency-Key", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-create-1");
    mockApi.mockResolvedValueOnce(makeApiSession());

    const { result } = renderHook(() => useCreateReorganizationSession(), {
      wrapper: buildWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        initialIntents: [PROPOSED_PAYLOAD],
      });
    });

    expect(mockApi).toHaveBeenCalledTimes(1);
    const [method, url, body, options] = mockApi.mock.calls[0]!;
    expect(method).toBe("post");
    expect(url).toBe("/reorganizations");
    expect(body).toEqual({ initial_intents: [PROPOSED_PAYLOAD] });
    expect(options).toEqual({
      headers: { "Idempotency-Key": "uuid-create-1" },
    });
  });

  it("does NOT include a `source` field in the body — the BE derives it from the route prefix", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-no-source");
    mockApi.mockResolvedValueOnce(makeApiSession());

    const { result } = renderHook(() => useCreateReorganizationSession(), {
      wrapper: buildWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        initialIntents: [PROPOSED_PAYLOAD],
      });
    });

    const [, , body] = mockApi.mock.calls[0]!;
    expect(body).not.toHaveProperty("source");
    expect(body).not.toHaveProperty("policy_snapshot_request");
  });

  it("calls setSession with the BE-returned (session, intents) tuple on success", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-setsession");
    mockApi.mockResolvedValueOnce(makeApiSession());

    const { result } = renderHook(() => useCreateReorganizationSession(), {
      wrapper: buildWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        initialIntents: [PROPOSED_PAYLOAD],
      });
    });

    const state = usePendingRealityStore.getState();
    expect(state.sessionId).toBe(SESSION.id);
    expect(state.session?.status).toBe(SESSION.status);
    expect(state.intents).toEqual([INTENT]);
  });

  it("generates a fresh Idempotency-Key per mutate() call", async () => {
    mockRandomUUID
      .mockReturnValueOnce("uuid-call-A")
      .mockReturnValueOnce("uuid-call-B");
    mockApi
      .mockResolvedValueOnce(makeApiSession())
      .mockResolvedValueOnce(makeApiSession());

    const { result } = renderHook(() => useCreateReorganizationSession(), {
      wrapper: buildWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ initialIntents: [PROPOSED_PAYLOAD] });
    });
    await act(async () => {
      await result.current.mutateAsync({ initialIntents: [PROPOSED_PAYLOAD] });
    });

    expect(mockApi.mock.calls[0]![3]).toEqual({
      headers: { "Idempotency-Key": "uuid-call-A" },
    });
    expect(mockApi.mock.calls[1]![3]).toEqual({
      headers: { "Idempotency-Key": "uuid-call-B" },
    });
  });

  it("reuses the Idempotency-Key on a TanStack Query auto-retry", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-stable");
    mockApi
      .mockRejectedValueOnce(makeAxios500Error())
      .mockResolvedValueOnce(makeApiSession());

    const { result } = renderHook(() => useCreateReorganizationSession(), {
      wrapper: buildWrapper(1),
    });

    await act(async () => {
      await result.current.mutateAsync({ initialIntents: [PROPOSED_PAYLOAD] });
    });

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledTimes(2);
    });
    expect(mockApi.mock.calls[0]![3].headers["Idempotency-Key"]).toBe(
      "uuid-stable",
    );
    expect(mockApi.mock.calls[1]![3].headers["Idempotency-Key"]).toBe(
      "uuid-stable",
    );
    expect(mockRandomUUID).toHaveBeenCalledTimes(1);
  });
});

// ──────────────────────────────────────────────────────────────────
// useAddReorganizationIntent
// ──────────────────────────────────────────────────────────────────

describe("useAddReorganizationIntent", () => {
  it("PATCHes to /reorganizations/:id with op=add_intent and Idempotency-Key", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-add-1");
    mockApi.mockResolvedValueOnce(makeApiSession());

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });

    const { result } = renderHook(() => useAddReorganizationIntent(), {
      wrapper: buildWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: SESSION.id,
        intent: PROPOSED_PAYLOAD,
        worldSnapshot: WORLD,
      });
    });

    const [method, url, body, options] = mockApi.mock.calls[0]!;
    expect(method).toBe("patch");
    expect(url).toBe(`/reorganizations/${SESSION.id}`);
    expect(body).toEqual({ op: "add_intent", intent: PROPOSED_PAYLOAD });
    expect(options).toEqual({
      headers: { "Idempotency-Key": "uuid-add-1" },
    });
  });

  it("refreshes the store with the BE-returned intents and re-runs the local linter", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-add-refresh");
    mockApi.mockResolvedValueOnce(makeApiSession());

    // Pre-seed with a stale intent and a stale linter issue.
    const stale = makeIntent(999);
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(stale);
      usePendingRealityStore.setState({
        linterIssues: [
          {
            severity: "error",
            kind: "time_conflict",
            affectedAppointmentIds: [9999],
            humanMessage: "stale",
          },
        ],
      });
    });

    const { result } = renderHook(() => useAddReorganizationIntent(), {
      wrapper: buildWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: SESSION.id,
        intent: PROPOSED_PAYLOAD,
        worldSnapshot: WORLD,
      });
    });

    const state = usePendingRealityStore.getState();
    // BE response replaces (not merges) the intent set.
    expect(state.intents.map((i) => i.id)).toEqual([INTENT.id]);
    // `runLocalLinter(WORLD)` ran with the empty world → empty result.
    expect(state.linterIssues).toEqual([]);
  });

  it("generates a fresh Idempotency-Key per mutate() call", async () => {
    mockRandomUUID
      .mockReturnValueOnce("uuid-add-A")
      .mockReturnValueOnce("uuid-add-B");
    mockApi
      .mockResolvedValueOnce(makeApiSession())
      .mockResolvedValueOnce(makeApiSession());

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });

    const { result } = renderHook(() => useAddReorganizationIntent(), {
      wrapper: buildWrapper(),
    });

    const variables = {
      sessionId: SESSION.id,
      intent: PROPOSED_PAYLOAD,
      worldSnapshot: WORLD,
    };

    await act(async () => {
      await result.current.mutateAsync(variables);
    });
    await act(async () => {
      await result.current.mutateAsync(variables);
    });

    expect(mockApi.mock.calls[0]![3].headers["Idempotency-Key"]).toBe(
      "uuid-add-A",
    );
    expect(mockApi.mock.calls[1]![3].headers["Idempotency-Key"]).toBe(
      "uuid-add-B",
    );
  });

  it("reuses the Idempotency-Key on a TanStack Query auto-retry", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-add-stable");
    mockApi
      .mockRejectedValueOnce(makeAxios500Error())
      .mockResolvedValueOnce(makeApiSession());

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });

    const { result } = renderHook(() => useAddReorganizationIntent(), {
      wrapper: buildWrapper(1),
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: SESSION.id,
        intent: PROPOSED_PAYLOAD,
        worldSnapshot: WORLD,
      });
    });

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledTimes(2);
    });
    expect(mockApi.mock.calls[0]![3].headers["Idempotency-Key"]).toBe(
      "uuid-add-stable",
    );
    expect(mockApi.mock.calls[1]![3].headers["Idempotency-Key"]).toBe(
      "uuid-add-stable",
    );
    expect(mockRandomUUID).toHaveBeenCalledTimes(1);
  });
});

// ──────────────────────────────────────────────────────────────────
// useModifyReorganizationIntent (PR-UX-2 PASS 2.8 task `c7`)
// ──────────────────────────────────────────────────────────────────

describe("useModifyReorganizationIntent", () => {
  it("PATCHes to /reorganizations/:id with op=modify_intent and Idempotency-Key", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-modify-1");
    mockApi.mockResolvedValueOnce(makeApiSession());

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });

    const { result } = renderHook(() => useModifyReorganizationIntent(), {
      wrapper: buildWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: SESSION.id,
        intentId: INTENT.id,
        intent: PROPOSED_PAYLOAD,
        worldSnapshot: WORLD,
      });
    });

    const [method, url, body, options] = mockApi.mock.calls[0]!;
    expect(method).toBe("patch");
    expect(url).toBe(`/reorganizations/${SESSION.id}`);
    expect(body).toEqual({
      op: "modify_intent",
      intent_id: INTENT.id,
      intent: PROPOSED_PAYLOAD,
    });
    expect(options).toEqual({
      headers: { "Idempotency-Key": "uuid-modify-1" },
    });
  });

  it("refreshes the store with the BE-returned intents and re-runs the local linter", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-modify-refresh");
    mockApi.mockResolvedValueOnce(makeApiSession());

    const stale = makeIntent(999);
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(stale);
      usePendingRealityStore.setState({
        linterIssues: [
          {
            severity: "error",
            kind: "time_conflict",
            affectedAppointmentIds: [9999],
            humanMessage: "stale",
          },
        ],
      });
    });

    const { result } = renderHook(() => useModifyReorganizationIntent(), {
      wrapper: buildWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: SESSION.id,
        intentId: INTENT.id,
        intent: PROPOSED_PAYLOAD,
        worldSnapshot: WORLD,
      });
    });

    const state = usePendingRealityStore.getState();
    expect(state.intents.map((i) => i.id)).toEqual([INTENT.id]);
    expect(state.linterIssues).toEqual([]);
  });

  it("generates a fresh Idempotency-Key per mutate() call", async () => {
    mockRandomUUID
      .mockReturnValueOnce("uuid-modify-A")
      .mockReturnValueOnce("uuid-modify-B");
    mockApi
      .mockResolvedValueOnce(makeApiSession())
      .mockResolvedValueOnce(makeApiSession());

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });

    const { result } = renderHook(() => useModifyReorganizationIntent(), {
      wrapper: buildWrapper(),
    });

    const variables = {
      sessionId: SESSION.id,
      intentId: INTENT.id,
      intent: PROPOSED_PAYLOAD,
      worldSnapshot: WORLD,
    };

    await act(async () => {
      await result.current.mutateAsync(variables);
    });
    await act(async () => {
      await result.current.mutateAsync(variables);
    });

    expect(mockApi.mock.calls[0]![3].headers["Idempotency-Key"]).toBe(
      "uuid-modify-A",
    );
    expect(mockApi.mock.calls[1]![3].headers["Idempotency-Key"]).toBe(
      "uuid-modify-B",
    );
  });

  it("reuses the Idempotency-Key on a TanStack Query auto-retry", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-modify-stable");
    mockApi
      .mockRejectedValueOnce(makeAxios500Error())
      .mockResolvedValueOnce(makeApiSession());

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });

    const { result } = renderHook(() => useModifyReorganizationIntent(), {
      wrapper: buildWrapper(1),
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: SESSION.id,
        intentId: INTENT.id,
        intent: PROPOSED_PAYLOAD,
        worldSnapshot: WORLD,
      });
    });

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledTimes(2);
    });
    expect(mockApi.mock.calls[0]![3].headers["Idempotency-Key"]).toBe(
      "uuid-modify-stable",
    );
    expect(mockApi.mock.calls[1]![3].headers["Idempotency-Key"]).toBe(
      "uuid-modify-stable",
    );
    expect(mockRandomUUID).toHaveBeenCalledTimes(1);
  });
});

// ──────────────────────────────────────────────────────────────────
// useCancelReorganizationSession
// ──────────────────────────────────────────────────────────────────

describe("useCancelReorganizationSession", () => {
  it("POSTs to /reorganizations/:id/cancel with the optional reason and Idempotency-Key", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-cancel-1");
    mockApi.mockResolvedValueOnce({ cancelled: true });

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });

    const { result } = renderHook(() => useCancelReorganizationSession(), {
      wrapper: buildWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: SESSION.id,
        reason: "user_changed_mind",
      });
    });

    const [method, url, body, options] = mockApi.mock.calls[0]!;
    expect(method).toBe("post");
    expect(url).toBe(`/reorganizations/${SESSION.id}/cancel`);
    expect(body).toEqual({ reason: "user_changed_mind" });
    expect(options).toEqual({
      headers: { "Idempotency-Key": "uuid-cancel-1" },
    });
  });

  // 2026-05-08 fix/clear-must-stay-local: the cancel hook is now a
  // pure network primitive — it does NOT auto-call `clear()` or
  // `cacheReorganizationResult(..., null)` on success. The user-
  // initiated handler (currently `app/pending-reality/review.tsx#
  // handleCancelSession`) owns the local-state cleanup and gates it
  // on "the cancelled session is still the active one." See the
  // PLAN-DEVIATION marker on the hook + PLAN-DEVIATIONS.md
  // #2026-05-08-cancel-hook-no-auto-coord.
  it("does NOT clear local state or write the active-session cache on success", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-cancel-no-side-effect");
    mockApi.mockResolvedValueOnce({ cancelled: true });

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(INTENT);
    });

    const stateBefore = usePendingRealityStore.getState();
    expect(stateBefore.sessionId).toBe(SESSION.id);
    expect(stateBefore.intents.length).toBe(1);

    const { queryClient, Wrapper } = buildWrapperWithClient();
    const setQueryDataSpy = jest.spyOn(queryClient, "setQueryData");

    const { result } = renderHook(() => useCancelReorganizationSession(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ sessionId: SESSION.id });
    });

    // Store stays seeded — the hook is pure I/O.
    const stateAfter = usePendingRealityStore.getState();
    expect(stateAfter.sessionId).toBe(SESSION.id);
    expect(stateAfter.intents.length).toBe(1);
    // Cache is untouched — the user-initiated handler is responsible
    // for the conditional null-write on the active key.
    expect(setQueryDataSpy).not.toHaveBeenCalled();
  });

  it("omits `reason` from the body when not provided", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-cancel-no-reason");
    mockApi.mockResolvedValueOnce({ cancelled: true });

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });

    const { result } = renderHook(() => useCancelReorganizationSession(), {
      wrapper: buildWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ sessionId: SESSION.id });
    });

    const [, , body] = mockApi.mock.calls[0]!;
    expect(body).toEqual({});
  });
});
