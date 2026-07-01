/**
 * Tests for `cacheReorganizationResult` — the mutation-hook
 * cache-write helper that pushes successful mutation results into
 * the active-session and per-session query caches so a re-mount of
 * `useActiveReorganization` / `useReorganizationSession(id)` is a
 * cache hit instead of a redundant network refetch.
 *
 * P3-FE-REHYDRATE-MOUNT §7.3 (required, not deferred). Without
 * this layer every successful mutation triggers an unnecessary GET
 * on the next render — the realtime path's `["reorganizations"]`
 * invalidation would otherwise force a refetch of the very row our
 * mutation just resolved.
 *
 * Five cases, one per mutation:
 *
 *   1. `useCreateReorganizationSession` → active-session cache
 *      contains the freshly-created session; per-session cache
 *      contains the same row.
 *   2. `useFinalizeReorganizationSession` (200-success) → active-
 *      session + per-session caches contain the finalized row.
 *   3. `useApplyAutoFix` → active-session + per-session caches
 *      contain the row with the modified intent.
 *   4. `useAddReorganizationIntent` (sibling per the plan §7.3
 *      pattern; see DEVIATION note in the chunk PR description)
 *      → active-session + per-session caches contain the row.
 *   5. `useCancelReorganizationSession` → active-session cache is
 *      LEFT UNTOUCHED by the hook itself. PLAN-DEVIATION
 *      2026-05-08-cancel-hook-no-auto-coord: the user-initiated
 *      cancel handler owns the conditional null-write so a stale
 *      in-flight cancel can't wipe a freshly-staged session. The
 *      regression guard in this suite asserts the hook does NOT
 *      write `null` on its own.
 *
 * Regression guard (per §7.5): after each mutation resolves, a
 * re-mount of `useActiveReorganization` does NOT fire a GET to
 * `/reorganizations/mine/active`. This is the key signal that the
 * cache write actually obviated the refetch.
 */

import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import {
  useActiveReorganization,
  useApplyAutoFix,
  useCancelReorganizationSession,
  useCreateReorganizationSession,
  useFinalizeReorganizationSession,
  useAddReorganizationIntent,
} from "../use-reorganization";
import {
  __resetPendingRealityStoreForTests,
  usePendingRealityStore,
} from "@technician/stores/pending-reality";
import {
  makeIntent,
  makeSession,
} from "@technician/stores/__fixtures__/pending-reality";
import { useAuthStore } from "@/src/stores/auth";
import type { ReorganizationIntentPayload } from "@technician/types/reorganization";
import type {
  LinterIssue,
  LinterWorldSnapshot,
} from "@technician/utils/logistics-linter";

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

const FRANCHISE_ID = 1;
const SESSION_ID = 7001;
const SESSION = makeSession({ id: SESSION_ID });
const INTENT = makeIntent(140, { session_id: SESSION_ID });
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

const ACTIVE_KEY = ["reorganizations", "mine", "active", FRANCHISE_ID] as const;
const SESSION_KEY = ["reorganizations", "session", SESSION_ID] as const;

function makeApiSession(overrides?: Partial<typeof SESSION>) {
  return {
    ...SESSION,
    ...(overrides ?? {}),
    intents: [INTENT],
  };
}

function buildHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      // Keep retries off so failures surface immediately.
      mutations: { retry: 0, retryDelay: 0 },
      queries: { retry: false },
    },
  });
  // The file is `.test.ts` (per the chunk-prompt's filename); use
  // `React.createElement` instead of JSX so the suite type-checks
  // without flipping the file extension.
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, Wrapper };
}

function setAuth() {
  useAuthStore.setState({
    isAuthenticated: true,
    user: {
      userId: 42,
      email: "tech@example.com",
      role: "technician" as never,
      fullName: "Test Tech",
      franchiseId: FRANCHISE_ID,
    },
  });
}

/**
 * Regression guard per §7.5: count the GETs to the active-session +
 * per-session URLs in `mockApi`. After a mutation resolves, mount
 * `useActiveReorganization()` and confirm the count did NOT grow —
 * the cache hit means `queryFn` never fires, so no GET is observed.
 */
function countActiveSessionGets(): number {
  return mockApi.mock.calls.filter((call) => {
    const [method, url] = call;
    if (method !== "get") return false;
    return (
      url === "/reorganizations/mine/active" ||
      (typeof url === "string" && url.startsWith("/reorganizations/") &&
        !url.includes("/mine/"))
    );
  }).length;
}

beforeEach(() => {
  __resetPendingRealityStoreForTests();
  mockApi.mockReset();
  mockRandomUUID.mockReset();
  setAuth();
});

afterAll(() => {
  useAuthStore.setState({ isAuthenticated: false, user: null });
});

// ──────────────────────────────────────────────────────────────────
// 1. useCreateReorganizationSession
// ──────────────────────────────────────────────────────────────────

describe("cacheReorganizationResult — useCreateReorganizationSession", () => {
  it("seeds the active + per-session caches; re-mount of useActiveReorganization is a cache hit", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-create-1");
    mockApi.mockResolvedValueOnce(makeApiSession());

    const { queryClient, Wrapper } = buildHarness();

    const { result } = renderHook(() => useCreateReorganizationSession(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        initialIntents: [PROPOSED_PAYLOAD],
      });
    });

    // Active-session cache: full ReorganizationApiSession (session +
    // intents) so a re-mount of `useActiveReorganization` reads the
    // canonical wire shape.
    const cachedActive = queryClient.getQueryData(ACTIVE_KEY);
    expect(cachedActive).toMatchObject({
      id: SESSION_ID,
      intents: [INTENT],
    });

    // Per-session cache: same shape, keyed by session id.
    const cachedSession = queryClient.getQueryData(SESSION_KEY);
    expect(cachedSession).toMatchObject({
      id: SESSION_ID,
      intents: [INTENT],
    });

    // Regression guard: re-mount the active-session hook and confirm
    // NO follow-up GET fires within 50ms. The cache hit is the
    // signal that the cache write obviated the refetch.
    const beforeGets = countActiveSessionGets();
    renderHook(() => useActiveReorganization(), { wrapper: Wrapper });
    await new Promise((r) => setTimeout(r, 50));
    expect(countActiveSessionGets()).toBe(beforeGets);
  });
});

// ──────────────────────────────────────────────────────────────────
// 2. useFinalizeReorganizationSession (200-success branch)
// ──────────────────────────────────────────────────────────────────

describe("cacheReorganizationResult — useFinalizeReorganizationSession (200)", () => {
  // PLAN-DEVIATION: 2026-05-09-pr-ux-18-cache-null-on-commit — see
  // docs/PLAN-DEVIATIONS.md#2026-05-09-pr-ux-18-cache-null-on-commit.
  //
  // Pre-PR-UX-18 the auto_committed branch wrote the committed
  // session row to the active-session cache. Post-PR-UX-18 it
  // writes `null` (because the BE's `mineActive` filter excludes
  // committed sessions, and a stale non-null cache slot makes the
  // calendar feel "stuck" until the next refetch). The per-session
  // detail cache still holds the canonical row for AI-tab /
  // audit-trail consumers.
  it("on auto_committed success: writes NULL to active-session cache; per-session cache still seeded", async () => {
    mockApi.mockResolvedValueOnce({
      session: makeApiSession(),
      auto_committed: true,
      linter_warnings: [],
    });

    const { queryClient, Wrapper } = buildHarness();

    const { result } = renderHook(() => useFinalizeReorganizationSession(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate(SESSION_ID);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Active-session cache reflects the BE's `mineActive` view:
    // a committed session is NOT active, so the cache holds null.
    expect(queryClient.getQueryData(ACTIVE_KEY)).toBeNull();

    // Per-session detail cache still holds the canonical row so
    // AI-tab / audit-trail consumers don't have to round-trip.
    expect(queryClient.getQueryData(SESSION_KEY)).toMatchObject({
      id: SESSION_ID,
      intents: [INTENT],
    });
  });

  it("on pending_review success (auto_committed=false): seeds active + per-session caches as before", async () => {
    mockApi.mockResolvedValueOnce({
      session: makeApiSession({ status: "pending_review" }),
      auto_committed: false,
      linter_warnings: [],
    });

    const { queryClient, Wrapper } = buildHarness();

    const { result } = renderHook(() => useFinalizeReorganizationSession(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate(SESSION_ID);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // pending_review is still alive (the BE's `STILL_ALIVE_STATUSES`
    // includes it), so the active-session cache holds the row.
    expect(queryClient.getQueryData(ACTIVE_KEY)).toMatchObject({
      id: SESSION_ID,
      intents: [INTENT],
    });
    expect(queryClient.getQueryData(SESSION_KEY)).toMatchObject({
      id: SESSION_ID,
      intents: [INTENT],
    });

    const beforeGets = countActiveSessionGets();
    renderHook(() => useActiveReorganization(), { wrapper: Wrapper });
    await new Promise((r) => setTimeout(r, 50));
    expect(countActiveSessionGets()).toBe(beforeGets);
  });

  it("does NOT seed caches on a 422 linter rejection — the user's draft stays canonical", async () => {
    const linterError: LinterIssue = {
      severity: "error",
      kind: "time_conflict",
      affectedAppointmentIds: [5001],
      humanMessage: "Reschedule of #5001 collides with #5002's start.",
    };
    mockApi.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 422,
        data: {
          error: true,
          message: "linter_errors_block_finalize",
          data: { issues: [linterError] },
        },
      },
    });

    const { queryClient, Wrapper } = buildHarness();

    const { result } = renderHook(() => useFinalizeReorganizationSession(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate(SESSION_ID);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // 422 resolves as data, not error — but the cache is left alone.
    expect(result.current.data?.kind).toBe("linter_rejected");
    expect(queryClient.getQueryData(ACTIVE_KEY)).toBeUndefined();
    expect(queryClient.getQueryData(SESSION_KEY)).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────
// 3. useApplyAutoFix
// ──────────────────────────────────────────────────────────────────

describe("cacheReorganizationResult — useApplyAutoFix", () => {
  it("seeds the active + per-session caches on success; re-mount is a cache hit", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-fix-1");
    mockApi.mockResolvedValueOnce(makeApiSession());

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });

    const { queryClient, Wrapper } = buildHarness();

    const { result } = renderHook(() => useApplyAutoFix(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: SESSION_ID,
        intentId: INTENT.id,
        intent: PROPOSED_PAYLOAD,
        worldSnapshot: WORLD,
      });
    });

    expect(queryClient.getQueryData(ACTIVE_KEY)).toMatchObject({
      id: SESSION_ID,
      intents: [INTENT],
    });
    expect(queryClient.getQueryData(SESSION_KEY)).toMatchObject({
      id: SESSION_ID,
      intents: [INTENT],
    });

    const beforeGets = countActiveSessionGets();
    renderHook(() => useActiveReorganization(), { wrapper: Wrapper });
    await new Promise((r) => setTimeout(r, 50));
    expect(countActiveSessionGets()).toBe(beforeGets);
  });
});

// ──────────────────────────────────────────────────────────────────
// 4. useAddReorganizationIntent (sibling)
// ──────────────────────────────────────────────────────────────────

describe("cacheReorganizationResult — useAddReorganizationIntent", () => {
  it("seeds the active + per-session caches on success; re-mount is a cache hit", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-add-1");
    mockApi.mockResolvedValueOnce(makeApiSession());

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });

    const { queryClient, Wrapper } = buildHarness();

    const { result } = renderHook(() => useAddReorganizationIntent(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: SESSION_ID,
        intent: PROPOSED_PAYLOAD,
        worldSnapshot: WORLD,
      });
    });

    expect(queryClient.getQueryData(ACTIVE_KEY)).toMatchObject({
      id: SESSION_ID,
      intents: [INTENT],
    });
    expect(queryClient.getQueryData(SESSION_KEY)).toMatchObject({
      id: SESSION_ID,
      intents: [INTENT],
    });

    const beforeGets = countActiveSessionGets();
    renderHook(() => useActiveReorganization(), { wrapper: Wrapper });
    await new Promise((r) => setTimeout(r, 50));
    expect(countActiveSessionGets()).toBe(beforeGets);
  });
});

// ──────────────────────────────────────────────────────────────────
// 5. useCancelReorganizationSession
// ──────────────────────────────────────────────────────────────────

describe("cacheReorganizationResult — useCancelReorganizationSession", () => {
  // 2026-05-08 fix/clear-must-stay-local: the cancel hook is now a
  // pure network primitive. The active-session cache write is the
  // responsibility of the user-initiated handler (gated on the
  // cancelled session matching the live one). This test confirms
  // the hook does not write the cache on its own.
  it("does NOT touch the active-session cache; the user-initiated handler owns it", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-cancel-1");
    mockApi.mockResolvedValueOnce({ cancelled: true });

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });

    const { queryClient, Wrapper } = buildHarness();

    // Pre-seed both caches with the session row so the assertions
    // below can detect any unexpected hook-side mutation.
    queryClient.setQueryData(ACTIVE_KEY, makeApiSession());
    queryClient.setQueryData(SESSION_KEY, makeApiSession());

    const { result } = renderHook(() => useCancelReorganizationSession(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: SESSION_ID,
        reason: "draft_no_longer_needed",
      });
    });

    // Active-session cache is UNCHANGED — the hook no longer writes
    // null. The handler in app/pending-reality/review.tsx will fire
    // `cacheReorganizationResult(queryClient, fid, null)` itself,
    // gated on `usePendingRealityStore.getState().sessionId ===
    // cancelledSessionId`. See PLAN-DEVIATION
    // 2026-05-08-cancel-hook-no-auto-coord.
    expect(queryClient.getQueryData(ACTIVE_KEY)).toMatchObject({
      id: SESSION_ID,
      intents: [INTENT],
    });

    // Per-session cache is unchanged. The session row still exists
    // server-side with status: cancelled; future detail-query reads
    // will refetch and pick up the terminal status.
    expect(queryClient.getQueryData(SESSION_KEY)).toMatchObject({
      id: SESSION_ID,
      intents: [INTENT],
    });
  });
});
