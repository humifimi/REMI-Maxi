/**
 * Tests for `useApplyAutoFix` (P3-FE-9).
 *
 * The hook is a thin wrapper around TanStack Query's `useMutation`
 * that PATCHes the active reorganization session, refreshes
 * `usePendingRealityStore` with the BE-returned `(session, intents)`
 * tuple, and re-runs the local linter. The tests below pin five
 * contracts:
 *
 *   1. **Success path** — clean 200 response → store gets a fresh
 *      `(session, intents)` snapshot and `runLocalLinter` is called
 *      with the supplied world snapshot. No error is thrown.
 *   2. **422 linter rejection** — server's PATCH responds with
 *      `{ error: true, data: { issues: LinterIssue[] } }` → the
 *      mutation rejects with a tagged `ApplyAutoFixRejectedError`
 *      carrying the issues. Store is NOT mutated.
 *   3. **Generic error** — non-422 (e.g. 500) → rejects with the
 *      raw AxiosError; store is unchanged.
 *   4. **Idempotency-Key per call** — each user-initiated `mutate`
 *      generates a fresh UUID and sends it as the `Idempotency-Key`
 *      header. Two consecutive calls produce two different keys.
 *   5. **Idempotency-Key reused on retry** — if TanStack Query
 *      auto-retries the same call (network blip), the second
 *      invocation of `mutationFn` reuses the variables from the
 *      first → same key, same body. (TanStack Query passes
 *      variables verbatim across retries; the key lives in
 *      variables, so reuse is structural.)
 *
 * NOTE: this repo does not currently ship a Jest runner end-to-end
 * (see `src/hooks/ui/__tests__/use-wide-canvas.test.ts` for the
 * same precedent / executable-spec rationale). The file follows
 * the canonical jest-expo + `@testing-library/react-native`
 * shape — every assertion below should pass once the runner lands.
 */

import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AxiosError, AxiosResponse } from "axios";
import React from "react";

import {
  ApplyAutoFixRejectedError,
  useApplyAutoFix,
} from "../use-reorganization";
import {
  __resetPendingRealityStoreForTests,
  usePendingRealityStore,
} from "@technician/stores/pending-reality";
import {
  makeIntent,
  makeSession,
} from "@technician/stores/__fixtures__/pending-reality";
import type { LinterWorldSnapshot } from "@technician/utils/logistics-linter";

// ── Module mocks ────────────────────────────────────────────────────

// Stub the api wrapper at the module boundary. Tests drive responses
// per-case via `mockApi.mockImplementation(...)`.
const mockApi = jest.fn();
jest.mock("@technician/api/client", () => ({
  __esModule: true,
  api: (...args: unknown[]) => mockApi(...args),
}));

// `expo-crypto.randomUUID` is what the hook calls per-`mutate` to
// generate a fresh key. Stub it so the test can sequence keys
// deterministically.
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
const WORLD: LinterWorldSnapshot = {
  appointments: [],
  routes: [],
  customerSlas: [],
  fleet: { accounts: [] },
};

/** Build an axios-shaped 422 error matching the BE envelope. */
function makeAxios422Error(issues: unknown): AxiosError {
  const err = new Error("Request failed with status code 422") as AxiosError;
  err.isAxiosError = true;
  err.response = {
    status: 422,
    data: {
      error: true,
      message: "linter_rejected",
      data: { issues },
    },
  } as AxiosResponse;
  return err;
}

/** Build an axios-shaped 500 error (no structured payload). */
function makeAxios500Error(): AxiosError {
  const err = new Error("Request failed with status code 500") as AxiosError;
  err.isAxiosError = true;
  err.response = {
    status: 500,
    data: { error: true, message: "internal_server_error", data: null },
  } as AxiosResponse;
  return err;
}

/** Build the BE PATCH 200 response (session fields + intents inline). */
function makeApiSession(overrides?: { intentPayloadKind?: string }): {
  intents: (typeof INTENT)[];
  [key: string]: unknown;
} {
  return {
    ...SESSION,
    intents: [
      {
        ...INTENT,
        payload:
          overrides?.intentPayloadKind === "reschedule"
            ? {
                kind: "reschedule",
                new_scheduled_date: "2026-04-24",
                new_start_time: "11:00",
                new_end_time: "12:00",
              }
            : INTENT.payload,
      },
    ],
  };
}

function buildWrapper() {
  // Default: no automatic retry. Override per-test for the
  // "reused on retry" case below.
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: 0 },
      queries: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

// ── Setup ───────────────────────────────────────────────────────────

beforeEach(() => {
  __resetPendingRealityStoreForTests();
  mockApi.mockReset();
  mockRandomUUID.mockReset();
});

// ──────────────────────────────────────────────────────────────────
// 1. Success path
// ──────────────────────────────────────────────────────────────────

describe("useApplyAutoFix — success path", () => {
  it("PATCHes the right endpoint with the modify_intent body and Idempotency-Key header", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-call-1");
    mockApi.mockResolvedValueOnce(makeApiSession());

    // Seed the store so we can assert the post-success snapshot.
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(INTENT);
    });

    const { result } = renderHook(() => useApplyAutoFix(), {
      wrapper: buildWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: SESSION.id,
        intentId: INTENT.id,
        intent: {
          kind: "reschedule",
          new_scheduled_date: "2026-04-24",
          new_start_time: "11:00",
          new_end_time: "12:00",
        },
        worldSnapshot: WORLD,
      });
    });

    expect(mockApi).toHaveBeenCalledTimes(1);
    const [method, url, body, options] = mockApi.mock.calls[0]!;
    expect(method).toBe("patch");
    expect(url).toBe(`/reorganizations/${SESSION.id}`);
    expect(body).toEqual({
      op: "modify_intent",
      intent_id: INTENT.id,
      intent: {
        kind: "reschedule",
        new_scheduled_date: "2026-04-24",
        new_start_time: "11:00",
        new_end_time: "12:00",
      },
    });
    expect(options).toEqual({
      headers: { "Idempotency-Key": "uuid-call-1" },
    });
  });

  it("refreshes the store with the BE-returned (session, intents) tuple and re-runs the linter", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-success");
    mockApi.mockResolvedValueOnce(makeApiSession({ intentPayloadKind: "reschedule" }));

    // Pre-seed with an UNRELATED intent that the BE response does
    // NOT include — this proves the store replaces (not merges) the
    // intents array.
    const stalePreviousIntent = makeIntent(999);
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(stalePreviousIntent);
      // Seed a stale linter issue so we can assert it gets cleared.
      usePendingRealityStore.setState({
        linterIssues: [
          {
            severity: "error",
            kind: "time_conflict",
            affectedAppointmentIds: [9999],
            humanMessage: "stale issue",
          },
        ],
      });
    });

    const { result } = renderHook(() => useApplyAutoFix(), {
      wrapper: buildWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: SESSION.id,
        intentId: INTENT.id,
        intent: {
          kind: "reschedule",
          new_scheduled_date: "2026-04-24",
          new_start_time: "11:00",
          new_end_time: "12:00",
        },
        worldSnapshot: WORLD,
      });
    });

    const state = usePendingRealityStore.getState();
    // Intents replaced: the stale 999 intent is gone, the BE's
    // single intent took its place.
    expect(state.intents.map((i) => i.id)).toEqual([INTENT.id]);
    // Session refreshed (same id; status mirrored).
    expect(state.sessionId).toBe(SESSION.id);
    expect(state.session?.status).toBe(SESSION.status);
    // Stale linter issue cleared by the post-success
    // `setSession(_, intents)` overload + the subsequent
    // `runLocalLinter(WORLD)` writing an empty result.
    expect(state.linterIssues).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────
// 2. 422 linter rejection
// ──────────────────────────────────────────────────────────────────

describe("useApplyAutoFix — 422 linter rejection", () => {
  it("throws ApplyAutoFixRejectedError with the issues array", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-422");
    const rejectedIssues = [
      {
        severity: "error" as const,
        kind: "drive_time_impossible" as const,
        affectedAppointmentIds: [5002],
        humanMessage:
          "Auto-fix would require teleporting between #5001 and #5002.",
      },
    ];
    mockApi.mockRejectedValueOnce(makeAxios422Error(rejectedIssues));

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(INTENT);
    });

    const { result } = renderHook(() => useApplyAutoFix(), {
      wrapper: buildWrapper(),
    });

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({
          sessionId: SESSION.id,
          intentId: INTENT.id,
          intent: {
            kind: "reschedule",
            new_scheduled_date: "2026-04-24",
            new_start_time: "11:00",
            new_end_time: "12:00",
          },
          worldSnapshot: WORLD,
        });
      } catch (err) {
        caught = err;
      }
    });

    expect(caught).toBeInstanceOf(ApplyAutoFixRejectedError);
    expect((caught as ApplyAutoFixRejectedError).issues).toEqual(rejectedIssues);
    expect((caught as ApplyAutoFixRejectedError).kind).toBe("linter_rejected");

    // Store is NOT mutated on a rejection — the user's draft is
    // still locally valid and they need to act on the new issues.
    const state = usePendingRealityStore.getState();
    expect(state.sessionId).toBe(SESSION.id);
    expect(state.intents).toEqual([INTENT]);
  });

  it("rethrows non-422 errors verbatim and leaves the store untouched", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-500");
    const rawErr = makeAxios500Error();
    mockApi.mockRejectedValueOnce(rawErr);

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(INTENT);
    });

    const { result } = renderHook(() => useApplyAutoFix(), {
      wrapper: buildWrapper(),
    });

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({
          sessionId: SESSION.id,
          intentId: INTENT.id,
          intent: {
            kind: "reschedule",
            new_scheduled_date: "2026-04-24",
            new_start_time: "11:00",
            new_end_time: "12:00",
          },
          worldSnapshot: WORLD,
        });
      } catch (err) {
        caught = err;
      }
    });

    expect(caught).toBe(rawErr);
    expect(caught).not.toBeInstanceOf(ApplyAutoFixRejectedError);

    const state = usePendingRealityStore.getState();
    expect(state.intents).toEqual([INTENT]);
  });
});

// ──────────────────────────────────────────────────────────────────
// 3. Idempotency-Key contract (per master plan §5.3.3)
// ──────────────────────────────────────────────────────────────────

describe("useApplyAutoFix — Idempotency-Key contract", () => {
  it("generates a fresh Idempotency-Key per mutate() call", async () => {
    mockRandomUUID
      .mockReturnValueOnce("uuid-call-A")
      .mockReturnValueOnce("uuid-call-B");
    mockApi
      .mockResolvedValueOnce(makeApiSession())
      .mockResolvedValueOnce(makeApiSession());

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(INTENT);
    });

    const { result } = renderHook(() => useApplyAutoFix(), {
      wrapper: buildWrapper(),
    });

    const variables = {
      sessionId: SESSION.id,
      intentId: INTENT.id,
      intent: {
        kind: "reschedule" as const,
        new_scheduled_date: "2026-04-24",
        new_start_time: "11:00",
        new_end_time: "12:00",
      },
      worldSnapshot: WORLD,
    };

    await act(async () => {
      await result.current.mutateAsync(variables);
    });
    await act(async () => {
      await result.current.mutateAsync(variables);
    });

    expect(mockApi).toHaveBeenCalledTimes(2);
    expect(mockApi.mock.calls[0]![3]).toEqual({
      headers: { "Idempotency-Key": "uuid-call-A" },
    });
    expect(mockApi.mock.calls[1]![3]).toEqual({
      headers: { "Idempotency-Key": "uuid-call-B" },
    });
    // Sanity check: the keys are different.
    expect(mockApi.mock.calls[0]![3].headers["Idempotency-Key"]).not.toBe(
      mockApi.mock.calls[1]![3].headers["Idempotency-Key"],
    );
  });

  it("reuses the Idempotency-Key on a TanStack Query auto-retry", async () => {
    // Configure the QueryClient to retry mutations once with no
    // delay — this simulates the BE's idempotency middleware
    // correctly receiving the SAME key on the retried request and
    // deduplicating it (the contract `P6-BE-1` will eventually
    // enforce server-side; the FE's job here is to make sure the
    // header is stable across retries).
    mockRandomUUID.mockReturnValueOnce("uuid-stable-on-retry");
    mockApi
      .mockRejectedValueOnce(makeAxios500Error())
      .mockResolvedValueOnce(makeApiSession());

    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: 1, retryDelay: 0 },
        queries: { retry: false },
      },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(INTENT);
    });

    const { result } = renderHook(() => useApplyAutoFix(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: SESSION.id,
        intentId: INTENT.id,
        intent: {
          kind: "reschedule",
          new_scheduled_date: "2026-04-24",
          new_start_time: "11:00",
          new_end_time: "12:00",
        },
        worldSnapshot: WORLD,
      });
    });

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledTimes(2);
    });

    // Critical assertion: both requests carry the SAME key, even
    // though api() was called twice. TanStack Query passes variables
    // verbatim across retries, so the key (which lives on the
    // variables object) is structurally stable.
    expect(mockApi.mock.calls[0]![3]).toEqual({
      headers: { "Idempotency-Key": "uuid-stable-on-retry" },
    });
    expect(mockApi.mock.calls[1]![3]).toEqual({
      headers: { "Idempotency-Key": "uuid-stable-on-retry" },
    });
    // And `randomUUID()` was only invoked ONCE — proving the wrapper
    // didn't generate a fresh key for the retry.
    expect(mockRandomUUID).toHaveBeenCalledTimes(1);
  });
});
