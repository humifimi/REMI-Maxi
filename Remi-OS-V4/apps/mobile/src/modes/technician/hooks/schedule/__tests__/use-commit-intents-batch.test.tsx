/**
 * Tests for `useCommitIntentsBatch` (FE-CR-1-2, 2026-05-11).
 *
 * Covers the cases enumerated in
 * `docs/implementation-plans/pr-ux-3-followups-per-intent-commit.md`
 * §2 (FE-CR-1-2 acceptance criteria) plus the regression watch
 * points from §3.1 / §3.3:
 *
 *   1. **200 + terminal session** — the BE reports
 *      `session.status === "committed"`, meaning every intent in the
 *      session is now committed. Hook calls
 *      `cacheReorganizationResult(queryClient, fid, null)` to match
 *      the BE's `STILL_ALIVE_STATUSES` filter, seeds the per-session
 *      detail cache with the canonical row, and clears the
 *      `usePendingRealityStore`. Calendar + dispatch-overview
 *      caches invalidated. PLAN-DEVIATION:
 *      2026-05-09-pr-ux-18-cache-null-on-commit.
 *
 *   2. **200 + partial commit** — the BE reports `session.status` as
 *      `draft` / `pending_review` with leftover dirty intents. The
 *      hook calls `setSession(session, intents)` with the trimmed
 *      list (sticky chain ids preserved); store is NOT cleared.
 *      Active-session cache gets the trimmed session. PLAN-DEVIATION:
 *      2026-05-09-pr-ux-18-clear-before-alert.
 *
 *   3. **409 INTENT_HAS_CONFLICTS** — server-side linter caught a
 *      conflict at commit time. The hook throws
 *      `CommitBatchRejectedError` with the BE's
 *      `data.issues: LinterIssue[]`. No cache writes. Store
 *      untouched.
 *
 *   4. **404 INTENT_NOT_FOUND** — an id isn't in the session. Hook
 *      throws `CommitBatchIntentNotFoundError` with
 *      `data.bad_intent_id`. Falls back to `null` when the field is
 *      missing (defensive — the wire spec post-`B-CR-1-2-rev2`
 *      always includes it, but a pre-rev2 BE could omit).
 *
 *   5. **Generic 5xx** — re-thrown as the raw AxiosError so TanStack
 *      Query trips `.isError`.
 *
 *   6. **Idempotency-Key per call** — `mutate()` auto-generates a
 *      fresh UUID via `Crypto.randomUUID()` per invocation. Two
 *      consecutive calls produce two different keys.
 *
 *   7. **Idempotency-Key reused on TanStack Query auto-retry** — when
 *      the runtime retries the same mutation (network blip), the BE
 *      receives the SAME key on the retry so its idempotency
 *      middleware can dedupe. The wrapper only generates the key
 *      ONCE per user-initiated `mutate()`; TanStack reuses the
 *      variables verbatim across retries.
 *
 * NOTE on the 409-vs-422 status: the FE-CR-1-2 handoff doc specced
 * a 422 `linter_errors_block_commit` envelope based on an earlier
 * BE plan revision. The shipped BE
 * (`/Users/jacegalloway/Documents/codebases/REMIBackend/src/services/reorganizationService.ts`)
 * actually emits 409 `intent_has_conflicts`. This test follows the
 * actual wire shape, same as the hook.
 */

import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AxiosError, AxiosResponse } from "axios";
import React from "react";

import {
  CommitBatchIntentNotFoundError,
  CommitBatchRejectedError,
  useCommitIntentsBatch,
} from "../use-reorganization";
import { calendarKeys } from "@technician/hooks/schedule/use-calendar";
import {
  __resetPendingRealityStoreForTests,
  usePendingRealityStore,
} from "@technician/stores/pending-reality";
import {
  makeIntent,
  makeSession,
} from "@technician/stores/__fixtures__/pending-reality";
import { useAuthStore } from "@/src/stores/auth";
import { UserRole } from "@technician/types/enums";
import type { LinterIssue } from "@technician/utils/logistics-linter";

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

// ── Fixtures ────────────────────────────────────────────────────────

const SESSION = makeSession();
const INTENT_A = makeIntent(140, { appointment_id: 5042, chain_id: "uuid-A" });
const INTENT_B = makeIntent(141, { appointment_id: 5043, chain_id: "uuid-A" });
const INTENT_DIRTY = makeIntent(142, {
  appointment_id: 5044,
  chain_id: "uuid-B",
});

const ISSUE: LinterIssue = {
  severity: "error",
  kind: "time_conflict",
  affectedAppointmentIds: [5042],
  humanMessage: "Intent #140 collides with the freshly-rescheduled #5050.",
};

/** Build the BE 200 envelope's `data` payload: `{ session, committed_intent_ids }`. */
function makeCommitResponse(args: {
  sessionOverrides?: Partial<typeof SESSION>;
  intents: (typeof INTENT_A)[];
  committedIntentIds: number[];
}) {
  return {
    session: {
      ...SESSION,
      ...args.sessionOverrides,
      intents: args.intents,
    },
    committed_intent_ids: args.committedIntentIds,
  };
}

function makeAxios409Error(issues: unknown): AxiosError {
  const err = new Error("Request failed with status code 409") as AxiosError;
  err.isAxiosError = true;
  err.response = {
    status: 409,
    data: {
      error: true,
      message: "intent_has_conflicts",
      code: "INTENT_HAS_CONFLICTS",
      data: { issues },
    },
  } as AxiosResponse;
  return err;
}

function makeAxios404Error(badIntentId: number | null): AxiosError {
  const err = new Error("Request failed with status code 404") as AxiosError;
  err.isAxiosError = true;
  err.response = {
    status: 404,
    data: {
      error: true,
      message: "intent_not_found",
      code: "INTENT_NOT_FOUND",
      data: badIntentId == null ? null : { bad_intent_id: badIntentId },
    },
  } as AxiosResponse;
  return err;
}

function makeAxios500Error(): AxiosError {
  const err = new Error("Request failed with status code 500") as AxiosError;
  err.isAxiosError = true;
  err.response = {
    status: 500,
    data: { error: true, message: "internal_server_error", data: null },
  } as AxiosResponse;
  return err;
}

function buildHarness(retry = 0) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry, retryDelay: 0 },
      queries: { retry: false },
    },
  });
  const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");
  const setQueryDataSpy = jest.spyOn(queryClient, "setQueryData");
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, invalidateSpy, setQueryDataSpy, Wrapper };
}

beforeEach(() => {
  __resetPendingRealityStoreForTests();
  mockApi.mockReset();
  mockRandomUUID.mockReset();
  // Seed auth so `useAuthStore.getState().user?.franchiseId` returns a
  // value the hook can fold into `cacheReorganizationResult`.
  useAuthStore.setState({
    accessToken: "test-access",
    refreshToken: "test-refresh",
    user: {
      userId: 42,
      email: "tech@example.com",
      role: UserRole.TECHNICIAN,
      fullName: "Tech 42",
      franchiseId: 1,
    },
    isAuthenticated: true,
    isHydrated: true,
  });
});

// ──────────────────────────────────────────────────────────────────
// 1. Success — terminal session
// ──────────────────────────────────────────────────────────────────

describe("useCommitIntentsBatch — success: terminal commit", () => {
  it("clears the store and writes null to the active-session cache when session.status === 'committed'", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-terminal");
    mockApi.mockResolvedValueOnce(
      makeCommitResponse({
        sessionOverrides: { status: "committed" },
        intents: [
          { ...INTENT_A, intent_status: "committed" },
          { ...INTENT_B, intent_status: "committed" },
        ],
        committedIntentIds: [INTENT_A.id, INTENT_B.id],
      }),
    );

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(INTENT_A);
      usePendingRealityStore.getState().addIntent(INTENT_B);
    });

    const { invalidateSpy, setQueryDataSpy, queryClient, Wrapper } =
      buildHarness();

    const { result } = renderHook(() => useCommitIntentsBatch(), {
      wrapper: Wrapper,
    });

    let mutationResult: Awaited<
      ReturnType<typeof result.current.mutateAsync>
    > | undefined;
    await act(async () => {
      mutationResult = await result.current.mutateAsync({
        sessionId: SESSION.id,
        intentIds: [INTENT_A.id, INTENT_B.id],
      });
    });

    // Store cleared.
    const state = usePendingRealityStore.getState();
    expect(state.sessionId).toBeNull();
    expect(state.session).toBeNull();
    expect(state.intents).toEqual([]);

    // Per-session detail cache seeded with the canonical row.
    expect(setQueryDataSpy).toHaveBeenCalledWith(
      ["reorganizations", "session", SESSION.id],
      expect.objectContaining({
        id: SESSION.id,
        status: "committed",
        intents: expect.any(Array),
      }),
    );

    // Active-session cache cleared (cacheReorganizationResult writes
    // null via setQueryData under
    // `["reorganizations", "mine", "active", franchiseId]`).
    const activeCalls = setQueryDataSpy.mock.calls.filter(
      (call) =>
        Array.isArray(call[0]) &&
        call[0][0] === "reorganizations" &&
        call[0][1] === "mine" &&
        call[0][2] === "active",
    );
    expect(activeCalls.length).toBeGreaterThan(0);
    expect(activeCalls[activeCalls.length - 1]![1]).toBeNull();

    // Calendar + dispatch invalidations fire on both branches.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: calendarKeys.all });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["dispatch-overview"],
    });

    // Result shape — committedIntentIds echoed back in request order.
    expect(mutationResult).toEqual(
      expect.objectContaining({
        committedIntentIds: [INTENT_A.id, INTENT_B.id],
        session: expect.objectContaining({ status: "committed" }),
        intents: expect.any(Array),
      }),
    );

    queryClient.clear();
  });
});

// ──────────────────────────────────────────────────────────────────
// 2. Success — partial commit (dirty intents remain)
// ──────────────────────────────────────────────────────────────────

describe("useCommitIntentsBatch — success: partial commit", () => {
  it("keeps the store populated with the BE's trimmed intent list when session.status stays 'draft'", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-partial");
    // The clean intent committed; the dirty intent remains in the
    // BE's response.
    mockApi.mockResolvedValueOnce(
      makeCommitResponse({
        sessionOverrides: { status: "draft" },
        intents: [
          { ...INTENT_A, intent_status: "committed" },
          INTENT_DIRTY, // still "proposed"
        ],
        committedIntentIds: [INTENT_A.id],
      }),
    );

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(INTENT_A);
      usePendingRealityStore.getState().addIntent(INTENT_DIRTY);
    });

    const { invalidateSpy, Wrapper } = buildHarness();

    const { result } = renderHook(() => useCommitIntentsBatch(), {
      wrapper: Wrapper,
    });

    let mutationResult: Awaited<
      ReturnType<typeof result.current.mutateAsync>
    > | undefined;
    await act(async () => {
      mutationResult = await result.current.mutateAsync({
        sessionId: SESSION.id,
        intentIds: [INTENT_A.id],
      });
    });

    // Store NOT cleared — dirty intent retained, session still alive.
    const state = usePendingRealityStore.getState();
    expect(state.sessionId).toBe(SESSION.id);
    expect(state.session?.status).toBe("draft");
    expect(state.intents.map((i) => i.id)).toEqual([
      INTENT_A.id,
      INTENT_DIRTY.id,
    ]);
    // Sticky-chain identity contract: the dirty intent's chain_id
    // survives the partial commit unchanged.
    const dirty = state.intents.find((i) => i.id === INTENT_DIRTY.id);
    expect(dirty?.chain_id).toBe("uuid-B");

    // Calendar + dispatch invalidations fire regardless.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: calendarKeys.all });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["dispatch-overview"],
    });

    expect(mutationResult?.committedIntentIds).toEqual([INTENT_A.id]);
  });
});

// ──────────────────────────────────────────────────────────────────
// 3. 409 INTENT_HAS_CONFLICTS
// ──────────────────────────────────────────────────────────────────

describe("useCommitIntentsBatch — 409 intent_has_conflicts", () => {
  it("throws CommitBatchRejectedError with the BE issues array and leaves the store untouched", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-rejected");
    mockApi.mockRejectedValueOnce(makeAxios409Error([ISSUE]));

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(INTENT_A);
    });

    const { invalidateSpy, setQueryDataSpy, Wrapper } = buildHarness();

    const { result } = renderHook(() => useCommitIntentsBatch(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          sessionId: SESSION.id,
          intentIds: [INTENT_A.id],
        }),
      ).rejects.toBeInstanceOf(CommitBatchRejectedError);
    });

    const err = result.current.error;
    expect(err).toBeInstanceOf(CommitBatchRejectedError);
    if (err instanceof CommitBatchRejectedError) {
      expect(err.kind).toBe("linter_rejected");
      expect(err.issues).toEqual([ISSUE]);
    }

    // Store untouched: session + intent still locally valid.
    const state = usePendingRealityStore.getState();
    expect(state.sessionId).toBe(SESSION.id);
    expect(state.intents.map((i) => i.id)).toEqual([INTENT_A.id]);

    // No cache writes on the error branch.
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(setQueryDataSpy).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────
// 4. 404 INTENT_NOT_FOUND
// ──────────────────────────────────────────────────────────────────

describe("useCommitIntentsBatch — 404 intent_not_found", () => {
  it("throws CommitBatchIntentNotFoundError carrying the bad_intent_id", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-missing");
    mockApi.mockRejectedValueOnce(makeAxios404Error(9999));

    const { Wrapper } = buildHarness();

    const { result } = renderHook(() => useCommitIntentsBatch(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          sessionId: SESSION.id,
          intentIds: [9999],
        }),
      ).rejects.toBeInstanceOf(CommitBatchIntentNotFoundError);
    });

    const err = result.current.error;
    expect(err).toBeInstanceOf(CommitBatchIntentNotFoundError);
    if (err instanceof CommitBatchIntentNotFoundError) {
      expect(err.kind).toBe("intent_not_found");
      expect(err.badIntentId).toBe(9999);
    }
  });

  it("falls back to badIntentId: null when the BE response omits bad_intent_id", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-missing-no-id");
    mockApi.mockRejectedValueOnce(makeAxios404Error(null));

    const { Wrapper } = buildHarness();

    const { result } = renderHook(() => useCommitIntentsBatch(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          sessionId: SESSION.id,
          intentIds: [9999],
        }),
      ).rejects.toBeInstanceOf(CommitBatchIntentNotFoundError);
    });

    const err = result.current.error;
    if (err instanceof CommitBatchIntentNotFoundError) {
      expect(err.badIntentId).toBeNull();
    }
  });
});

// ──────────────────────────────────────────────────────────────────
// 5. Generic 5xx
// ──────────────────────────────────────────────────────────────────

describe("useCommitIntentsBatch — generic axios errors", () => {
  it("rethrows non-tagged errors so TanStack Query trips .isError", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-5xx");
    const httpErr = makeAxios500Error();
    mockApi.mockRejectedValueOnce(httpErr);

    const { Wrapper } = buildHarness();

    const { result } = renderHook(() => useCommitIntentsBatch(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({
        sessionId: SESSION.id,
        intentIds: [INTENT_A.id],
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(httpErr);
    expect(result.current.error).not.toBeInstanceOf(CommitBatchRejectedError);
    expect(result.current.error).not.toBeInstanceOf(
      CommitBatchIntentNotFoundError,
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// 6. Idempotency-Key contract
// ──────────────────────────────────────────────────────────────────

describe("useCommitIntentsBatch — Idempotency-Key contract", () => {
  it("generates a fresh Idempotency-Key per mutate() call", async () => {
    mockRandomUUID
      .mockReturnValueOnce("uuid-call-A")
      .mockReturnValueOnce("uuid-call-B");
    mockApi
      .mockResolvedValueOnce(
        makeCommitResponse({
          sessionOverrides: { status: "draft" },
          intents: [INTENT_A],
          committedIntentIds: [INTENT_A.id],
        }),
      )
      .mockResolvedValueOnce(
        makeCommitResponse({
          sessionOverrides: { status: "draft" },
          intents: [INTENT_B],
          committedIntentIds: [INTENT_B.id],
        }),
      );

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });

    const { Wrapper } = buildHarness();

    const { result } = renderHook(() => useCommitIntentsBatch(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: SESSION.id,
        intentIds: [INTENT_A.id],
      });
    });
    await act(async () => {
      await result.current.mutateAsync({
        sessionId: SESSION.id,
        intentIds: [INTENT_B.id],
      });
    });

    expect(mockApi).toHaveBeenCalledTimes(2);
    const headersFor = (callIndex: number) =>
      mockApi.mock.calls[callIndex]![3].headers["Idempotency-Key"];
    expect(headersFor(0)).toBe("uuid-call-A");
    expect(headersFor(1)).toBe("uuid-call-B");
    expect(headersFor(0)).not.toBe(headersFor(1));
  });

  it("reuses the Idempotency-Key on a TanStack Query auto-retry", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-stable-on-retry");
    mockApi
      .mockRejectedValueOnce(makeAxios500Error())
      .mockResolvedValueOnce(
        makeCommitResponse({
          sessionOverrides: { status: "draft" },
          intents: [INTENT_A],
          committedIntentIds: [INTENT_A.id],
        }),
      );

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });

    const { Wrapper } = buildHarness(/* retry */ 1);

    const { result } = renderHook(() => useCommitIntentsBatch(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: SESSION.id,
        intentIds: [INTENT_A.id],
      });
    });

    expect(mockApi).toHaveBeenCalledTimes(2);
    expect(mockApi.mock.calls[0]![3].headers["Idempotency-Key"]).toBe(
      "uuid-stable-on-retry",
    );
    expect(mockApi.mock.calls[1]![3].headers["Idempotency-Key"]).toBe(
      "uuid-stable-on-retry",
    );
    // The wrapper only called randomUUID() once — the retry reused
    // the same variables (and therefore the same key).
    expect(mockRandomUUID).toHaveBeenCalledTimes(1);
  });
});
