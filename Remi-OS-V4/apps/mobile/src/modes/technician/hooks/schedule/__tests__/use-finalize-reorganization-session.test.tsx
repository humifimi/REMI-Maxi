/**
 * Tests for `useFinalizeReorganizationSession` (P3-FE-12 reconciliation).
 *
 * Covers the 5 cases called out in the chunk-prompt for P3-FE-12 / C.16:
 *
 *   1. 200 + `auto_committed: true` → `kind: "committed"`,
 *      warnings preserved verbatim, calendar caches invalidated.
 *   2. 200 + `auto_committed: false` → `kind: "pending_review"`,
 *      warnings preserved verbatim, calendar caches invalidated.
 *   3. 200 + non-empty `linter_warnings` → warnings flow through to
 *      the result on either success branch (locked in alongside
 *      cases 1 / 2 above; this test pins the missing-warnings
 *      defaulting to `[]`).
 *   4. 422 + `data.issues` populated (post-`P6-BE-8` BE) → `kind:
 *      "linter_rejected"`, calendar caches NOT invalidated, no
 *      throw.
 *   5. 422 + missing `data.issues` (pre-`P6-BE-8` BE) → degrades to
 *      `issues: []` with a `console.warn`, no throw, no cache
 *      invalidation. Locks in the graceful fallback so a hypothetical
 *      BE regression doesn't crash the review screen.
 *
 * Plus: any other 4xx / 5xx is rethrown so TanStack Query trips
 * `.isError` (the screen already has a "Couldn't reach server" toast
 * for that path).
 *
 * NOTE: this repo's Jest runner config is shared with the producer
 * suite (`use-reorganization-producer.test.tsx`); see the note there
 * about end-to-end test runs.
 */

import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AxiosError, AxiosResponse } from "axios";
import React from "react";

import { useFinalizeReorganizationSession } from "../use-reorganization";
import { calendarKeys } from "@technician/hooks/schedule/use-calendar";
import { makeSession } from "@technician/stores/__fixtures__/pending-reality";
import type { LinterIssue } from "@technician/utils/logistics-linter";

// ── Module mocks ────────────────────────────────────────────────────

const mockApi = jest.fn();
jest.mock("@technician/api/client", () => ({
  __esModule: true,
  api: (...args: unknown[]) => mockApi(...args),
}));

// Stub `expo-crypto.randomUUID` so the idempotency-key tests can
// assert deterministic values. Each call returns the next queued
// value (FIFO) so multi-call tests can verify keys differ. See the
// sibling `use-reorganization-producer.test.tsx` for the same pattern.
const mockRandomUUID = jest.fn();
jest.mock("expo-crypto", () => ({
  randomUUID: () => mockRandomUUID(),
}));

// ── Helpers ─────────────────────────────────────────────────────────

const SESSION_ID = 7001;
const SESSION = makeSession();

function makeApiSession(overrides: Partial<typeof SESSION> = {}) {
  return {
    ...SESSION,
    ...overrides,
    intents: [],
  };
}

function makeAxios422Error(body: unknown): AxiosError {
  const err = new Error(
    "Request failed with status code 422",
  ) as AxiosError;
  err.isAxiosError = true;
  err.response = {
    status: 422,
    data: body,
  } as AxiosResponse;
  return err;
}

function makeAxios500Error(): AxiosError {
  const err = new Error(
    "Request failed with status code 500",
  ) as AxiosError;
  err.isAxiosError = true;
  err.response = {
    status: 500,
    data: { error: true, message: "internal_server_error", data: null },
  } as AxiosResponse;
  return err;
}

function buildHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: 0, retryDelay: 0 },
      queries: { retry: false },
    },
  });
  const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");
  // P3-FE-REHYDRATE-MOUNT §7.5 — spy on `setQueryData` so we can
  // assert the 422 branch does NOT seed the active-session +
  // per-session caches (the user's draft is still locally valid;
  // overwriting it with the failed-finalize body would corrupt the
  // canonical row).
  const setQueryDataSpy = jest.spyOn(queryClient, "setQueryData");
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, invalidateSpy, setQueryDataSpy, Wrapper };
}

const WARNING_A: LinterIssue = {
  severity: "warning",
  kind: "drive_time_impossible",
  affectedAppointmentIds: [5001],
  humanMessage: "Tight drive window between #5001 and the next stop.",
};

const WARNING_B: LinterIssue = {
  severity: "warning",
  kind: "time_conflict",
  affectedAppointmentIds: [5002],
  humanMessage: "Lunch overlaps the new window for tech #5.",
};

const ERROR_A: LinterIssue = {
  severity: "error",
  kind: "time_conflict",
  affectedAppointmentIds: [5001],
  humanMessage: "Reschedule of #5001 collides with #5002's start.",
};

beforeEach(() => {
  mockApi.mockReset();
  mockRandomUUID.mockReset();
  // Default — each call returns a fresh UUID-shaped string so the
  // hook's wire shape is exercised. Idempotency-Key-specific tests
  // override this to assert deterministic values.
  let n = 0;
  mockRandomUUID.mockImplementation(() => `test-uuid-${++n}`);
});

// ──────────────────────────────────────────────────────────────────
// 200 path
// ──────────────────────────────────────────────────────────────────

describe("useFinalizeReorganizationSession — 200 auto_committed", () => {
  it("derives kind: 'committed' from auto_committed: true and preserves warnings", async () => {
    const { invalidateSpy, Wrapper } = buildHarness();
    mockApi.mockResolvedValue({
      session: makeApiSession({ status: "committed" }),
      auto_committed: true,
      linter_warnings: [WARNING_A, WARNING_B],
    });

    const { result } = renderHook(() => useFinalizeReorganizationSession(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate(SESSION_ID);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      kind: "committed",
      session: expect.objectContaining({ status: "committed" }),
      warnings: [WARNING_A, WARNING_B],
    });
    // Cache invalidation fires on the success branches.
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: calendarKeys.all,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["dispatch-overview"],
    });
  });

  it("derives kind: 'pending_review' from auto_committed: false and preserves warnings", async () => {
    const { invalidateSpy, Wrapper } = buildHarness();
    mockApi.mockResolvedValue({
      session: makeApiSession({ status: "pending_review" }),
      auto_committed: false,
      linter_warnings: [WARNING_A],
    });

    const { result } = renderHook(() => useFinalizeReorganizationSession(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate(SESSION_ID);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      kind: "pending_review",
      session: expect.objectContaining({ status: "pending_review" }),
      warnings: [WARNING_A],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: calendarKeys.all,
    });
  });

  it("defaults warnings to [] when linter_warnings is missing on the response", async () => {
    // The BE always emits `linter_warnings` on 200 today, but the
    // hook treats it as optional so a future BE that drops the field
    // (or a pre-`P6-BE-8` BE that never had it) doesn't crash the
    // screen on `result.warnings.map`.
    const { Wrapper } = buildHarness();
    mockApi.mockResolvedValue({
      session: makeApiSession({ status: "committed" }),
      auto_committed: true,
      // linter_warnings intentionally omitted
    });

    const { result } = renderHook(() => useFinalizeReorganizationSession(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate(SESSION_ID);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.kind).toBe("committed");
    if (result.current.data?.kind === "committed") {
      expect(result.current.data.warnings).toEqual([]);
    }
  });
});

// ──────────────────────────────────────────────────────────────────
// 422 path
// ──────────────────────────────────────────────────────────────────

describe("useFinalizeReorganizationSession — 422 linter rejection", () => {
  it("returns kind: 'linter_rejected' with the BE's issues array (post-P6-BE-8)", async () => {
    const { invalidateSpy, setQueryDataSpy, Wrapper } = buildHarness();
    mockApi.mockRejectedValue(
      makeAxios422Error({
        error: true,
        message: "linter_errors_block_finalize",
        data: { issues: [ERROR_A] },
      }),
    );

    const { result } = renderHook(() => useFinalizeReorganizationSession(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate(SESSION_ID);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      kind: "linter_rejected",
      issues: [ERROR_A],
    });
    expect(result.current.isError).toBe(false);

    // Cache invalidation MUST NOT fire on 422 — the user's draft is
    // still locally valid and refetching would cancel an in-progress
    // draft preview render. Pinning this guards the §5.3.5 contract.
    expect(invalidateSpy).not.toHaveBeenCalled();
    // P3-FE-REHYDRATE-MOUNT §7.3 — `cacheReorganizationResult` is
    // ALSO not called on the 422 branch. The 200-success branch
    // seeds the active-session + per-session caches with the
    // freshly-finalized row; the 422 branch leaves the cache
    // untouched so the user's local draft stays canonical.
    expect(setQueryDataSpy).not.toHaveBeenCalled();
  });

  it("degrades to issues: [] with a console.warn when the BE pre-dates P6-BE-8 (data.issues missing)", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const { invalidateSpy, Wrapper } = buildHarness();
    mockApi.mockRejectedValue(
      makeAxios422Error({
        error: true,
        message: "linter_errors_block_finalize",
        data: null,
      }),
    );

    const { result } = renderHook(() => useFinalizeReorganizationSession(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate(SESSION_ID);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      kind: "linter_rejected",
      issues: [],
    });
    expect(result.current.isError).toBe(false);
    expect(invalidateSpy).not.toHaveBeenCalled();
    // The warning fires once, naming the missing field. Anything
    // tighter (full message) would couple the test to copy.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toContain("missing `data.issues`");

    warnSpy.mockRestore();
  });

  it("rethrows on non-422 axios errors so TanStack Query trips .isError", async () => {
    const { invalidateSpy, Wrapper } = buildHarness();
    const httpErr = makeAxios500Error();
    mockApi.mockRejectedValue(httpErr);

    const { result } = renderHook(() => useFinalizeReorganizationSession(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate(SESSION_ID);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(httpErr);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────
// Idempotency-Key header (2026-05-11)
// ──────────────────────────────────────────────────────────────────
//
// The BE started enforcing `Idempotency-Key` on `POST /reorganizations/:id/finalize`
// on 2026-05-11; sessions that omitted the header dead-ended with a
// 400 `idempotency_key_required`. The hook now auto-generates a key
// per `mutate()` call (matching every sibling reorganization
// mutation hook). These tests pin two contract guarantees:
//
//   1. The header is sent on every call.
//   2. Two separate `mutate()` calls generate two distinct keys
//      (so a fresh user-initiated retry doesn't silently inherit a
//      deduplicated server-side result from the prior tap).

describe("useFinalizeReorganizationSession — Idempotency-Key header", () => {
  it("POSTs to /reorganizations/:id/finalize with an Idempotency-Key header and no body", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-finalize-1");
    const { Wrapper } = buildHarness();
    mockApi.mockResolvedValue({
      session: makeApiSession({ status: "committed" }),
      auto_committed: true,
    });

    const { result } = renderHook(() => useFinalizeReorganizationSession(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate(SESSION_ID);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApi).toHaveBeenCalledTimes(1);
    expect(mockApi).toHaveBeenCalledWith(
      "post",
      `/reorganizations/${SESSION_ID}/finalize`,
      // No request body — finalize is fully session-id-scoped via
      // the URL; the only per-call input is the idempotency header.
      undefined,
      { headers: { "Idempotency-Key": "uuid-finalize-1" } },
    );
  });

  it("generates a fresh Idempotency-Key per mutate() call", async () => {
    mockRandomUUID
      .mockReturnValueOnce("uuid-finalize-A")
      .mockReturnValueOnce("uuid-finalize-B");
    const { Wrapper } = buildHarness();
    mockApi.mockResolvedValue({
      session: makeApiSession({ status: "committed" }),
      auto_committed: true,
    });

    const { result } = renderHook(() => useFinalizeReorganizationSession(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate(SESSION_ID);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    act(() => {
      result.current.mutate(SESSION_ID);
    });
    await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(2));

    expect(mockApi.mock.calls[0]![3]).toEqual({
      headers: { "Idempotency-Key": "uuid-finalize-A" },
    });
    expect(mockApi.mock.calls[1]![3]).toEqual({
      headers: { "Idempotency-Key": "uuid-finalize-B" },
    });
  });
});
