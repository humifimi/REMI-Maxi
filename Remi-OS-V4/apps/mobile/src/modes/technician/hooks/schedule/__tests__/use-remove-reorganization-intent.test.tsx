/**
 * Tests for `useRemoveReorganizationIntent` (PR-UX-18 / PR-UX-19).
 *
 * The hook is the producer for the `op: "remove_intent"` PATCH branch
 * on `/api/v1/technician/reorganizations/:id`. PR-UX-18 wired it into
 * `useSessionAwareSubmit`'s de-escalation drag; PR-UX-19 wires it into
 * the review screen's "Remove" button. Either callsite needs the same
 * three contracts to hold:
 *
 *   1. **Endpoint shape** — PATCHes
 *      `/reorganizations/:sessionId` with `{ op: "remove_intent",
 *      intent_id }` and an `Idempotency-Key` header sourced from
 *      `Crypto.randomUUID()` per call.
 *   2. **Local store refresh on success** — the BE's trimmed
 *      `(session, intents)` tuple is written to
 *      `usePendingRealityStore` via `setSession(session, intents)`,
 *      and the local linter is re-run with the supplied snapshot.
 *      This is the load-bearing assertion that closes the bug — the
 *      next active-session refetch can NOT resurrect the removed
 *      intent because the store now agrees with the BE.
 *   3. **Calendar cache invalidation** — `calendarKeys.all` is
 *      invalidated so the `pending_intent_summary` overlay
 *      (PendingChangeBadge / cyan-tile tint) on the underlying
 *      appointment drops the removed intent immediately.
 *
 * Mirrors the structure of `use-apply-auto-fix.test.tsx` — both hooks
 * PATCH the same endpoint with sibling ops, so the test shape is
 * intentionally near-identical for ease of cross-reference.
 *
 * NOTE: this repo's Jest runner does not currently execute these
 * suites end-to-end (see `use-apply-auto-fix.test.tsx` header for the
 * same precedent). The file follows the canonical jest-expo +
 * `@testing-library/react-native` shape — every assertion below
 * should pass once the runner lands.
 */

import { act, renderHook } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AxiosError, AxiosResponse } from "axios";
import React from "react";

import { useRemoveReorganizationIntent } from "../use-reorganization";
import { calendarKeys } from "@technician/hooks/schedule/use-calendar";
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

// `useAuthStore` is consumed by the hook for `cacheReorganizationResult`
// (writes the post-success session into the active-session cache
// keyed by the user's franchiseId). Stub a stable franchiseId so the
// cache write doesn't crash with `null`.
jest.mock("@/src/stores/auth", () => {
  const STATE = { user: { id: 42, role: "technician", franchiseId: 1 } };
  return {
    __esModule: true,
    useAuthStore: Object.assign(
      <T,>(selector: (s: typeof STATE) => T): T => selector(STATE),
      { getState: () => STATE },
    ),
  };
});

// ── Helpers ─────────────────────────────────────────────────────────

const SESSION = makeSession();
const REMOVED_INTENT = makeIntent(140, {
  intent_type: "reschedule",
  appointment_id: 5002,
});
const SURVIVING_INTENT = makeIntent(141, {
  intent_type: "reschedule",
  appointment_id: 5003,
});
const WORLD: LinterWorldSnapshot = {
  appointments: [],
  routes: [],
  customerSlas: [],
  fleet: { accounts: [] },
};

/** BE response for a successful remove_intent PATCH. The session
 * payload mirrors the `ReorganizationApiSession` wire shape — flat
 * session fields + a nested `intents[]` carrying everything BUT the
 * removed intent. */
function makeApiSessionWithoutRemoved(): {
  intents: typeof SURVIVING_INTENT[];
  [key: string]: unknown;
} {
  return {
    ...SESSION,
    intents: [SURVIVING_INTENT],
  };
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

function buildHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: 0 },
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

// ── Setup ───────────────────────────────────────────────────────────

beforeEach(() => {
  __resetPendingRealityStoreForTests();
  mockApi.mockReset();
  mockRandomUUID.mockReset();
});

// ──────────────────────────────────────────────────────────────────
// 1. Endpoint shape + Idempotency-Key
// ──────────────────────────────────────────────────────────────────

describe("useRemoveReorganizationIntent — endpoint shape", () => {
  it("PATCHes the right URL with op:remove_intent and an Idempotency-Key header", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-remove-1");
    mockApi.mockResolvedValueOnce(makeApiSessionWithoutRemoved());

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(REMOVED_INTENT);
      usePendingRealityStore.getState().addIntent(SURVIVING_INTENT);
    });

    const { Wrapper } = buildHarness();
    const { result } = renderHook(() => useRemoveReorganizationIntent(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: SESSION.id,
        intentId: REMOVED_INTENT.id,
        worldSnapshot: WORLD,
      });
    });

    expect(mockApi).toHaveBeenCalledTimes(1);
    const [method, url, body, options] = mockApi.mock.calls[0]!;
    expect(method).toBe("patch");
    expect(url).toBe(`/reorganizations/${SESSION.id}`);
    expect(body).toEqual({
      op: "remove_intent",
      intent_id: REMOVED_INTENT.id,
    });
    expect(options).toEqual({
      headers: { "Idempotency-Key": "uuid-remove-1" },
    });
  });

  it("generates a fresh Idempotency-Key per mutate() call", async () => {
    mockRandomUUID
      .mockReturnValueOnce("uuid-call-A")
      .mockReturnValueOnce("uuid-call-B");
    mockApi
      .mockResolvedValueOnce(makeApiSessionWithoutRemoved())
      .mockResolvedValueOnce(makeApiSessionWithoutRemoved());

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(REMOVED_INTENT);
    });

    const { Wrapper } = buildHarness();
    const { result } = renderHook(() => useRemoveReorganizationIntent(), {
      wrapper: Wrapper,
    });

    const variables = {
      sessionId: SESSION.id,
      intentId: REMOVED_INTENT.id,
      worldSnapshot: WORLD,
    };

    await act(async () => {
      await result.current.mutateAsync(variables);
    });
    await act(async () => {
      await result.current.mutateAsync(variables);
    });

    expect(mockApi.mock.calls[0]![3]).toEqual({
      headers: { "Idempotency-Key": "uuid-call-A" },
    });
    expect(mockApi.mock.calls[1]![3]).toEqual({
      headers: { "Idempotency-Key": "uuid-call-B" },
    });
  });
});

// ──────────────────────────────────────────────────────────────────
// 2. Local store refresh on success — load-bearing for the bug fix
// ──────────────────────────────────────────────────────────────────

describe("useRemoveReorganizationIntent — store refresh", () => {
  it("replaces the local intents with the BE-returned trimmed list", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-store-refresh");
    mockApi.mockResolvedValueOnce(makeApiSessionWithoutRemoved());

    // Pre-seed BOTH intents (matching the screen's state when the
    // user taps Remove on the first card). Post-success the store
    // must contain ONLY the surviving intent.
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(REMOVED_INTENT);
      usePendingRealityStore.getState().addIntent(SURVIVING_INTENT);
    });

    const { Wrapper } = buildHarness();
    const { result } = renderHook(() => useRemoveReorganizationIntent(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: SESSION.id,
        intentId: REMOVED_INTENT.id,
        worldSnapshot: WORLD,
      });
    });

    // Critical assertion: the store now agrees with the BE. This is
    // what closes the original bug — pre-fix the store still had
    // both intents (because removeIntent was never sent to the BE)
    // and the next refetch resurrected them.
    const state = usePendingRealityStore.getState();
    expect(state.intents.map((i) => i.id)).toEqual([SURVIVING_INTENT.id]);
    expect(state.sessionId).toBe(SESSION.id);
  });

  it("does NOT mutate the store on a network error", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-error");
    mockApi.mockRejectedValueOnce(makeAxios500Error());

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(REMOVED_INTENT);
      usePendingRealityStore.getState().addIntent(SURVIVING_INTENT);
    });

    const { Wrapper } = buildHarness();
    const { result } = renderHook(() => useRemoveReorganizationIntent(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current
        .mutateAsync({
          sessionId: SESSION.id,
          intentId: REMOVED_INTENT.id,
          worldSnapshot: WORLD,
        })
        .catch(() => {
          /* expected */
        });
    });

    // Both intents survive — the user can retry without re-staging.
    const state = usePendingRealityStore.getState();
    expect(state.intents.map((i) => i.id).sort()).toEqual([
      REMOVED_INTENT.id,
      SURVIVING_INTENT.id,
    ]);
  });
});

// ──────────────────────────────────────────────────────────────────
// 3. Calendar cache invalidation
// ──────────────────────────────────────────────────────────────────

describe("useRemoveReorganizationIntent — calendar cache invalidation", () => {
  it("invalidates calendarKeys.all on success so pending_intent_summary refreshes", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-invalidate");
    mockApi.mockResolvedValueOnce(makeApiSessionWithoutRemoved());

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(REMOVED_INTENT);
    });

    const { invalidateSpy, Wrapper } = buildHarness();
    const { result } = renderHook(() => useRemoveReorganizationIntent(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: SESSION.id,
        intentId: REMOVED_INTENT.id,
        worldSnapshot: WORLD,
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: calendarKeys.all,
    });
  });

  it("does NOT invalidate the calendar on a network error", async () => {
    mockRandomUUID.mockReturnValueOnce("uuid-error-no-invalidate");
    mockApi.mockRejectedValueOnce(makeAxios500Error());

    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(REMOVED_INTENT);
    });

    const { invalidateSpy, Wrapper } = buildHarness();
    const { result } = renderHook(() => useRemoveReorganizationIntent(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current
        .mutateAsync({
          sessionId: SESSION.id,
          intentId: REMOVED_INTENT.id,
          worldSnapshot: WORLD,
        })
        .catch(() => {
          /* expected */
        });
    });

    // The mutation rejected; nothing to invalidate. Specifically, no
    // call carried `calendarKeys.all` as the queryKey.
    const calendarInvalidations = invalidateSpy.mock.calls.filter(
      ([arg]) =>
        Array.isArray((arg as { queryKey?: unknown[] })?.queryKey) &&
        (arg as { queryKey: unknown[] }).queryKey[0] === calendarKeys.all[0],
    );
    expect(calendarInvalidations).toHaveLength(0);
  });
});
