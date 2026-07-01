/**
 * Tests for `app/pending-reality/review.tsx` (P3-FE-4).
 *
 * Coverage (per chunk-prompt step 6):
 *   1. Sequence tab sorts intents by §6.4.1 commit order
 *      (cancel → reschedule → reschedule-with-tech → reassign →
 *      create → personal_event_delete → personal_event_update →
 *      personal_event_create), with `proposed_at` ASC then `id`
 *      ASC tiebreak.
 *   2. Tapping "Finalize" calls `useFinalizeReorganizationSession`'s
 *      mutate with the active `sessionId`.
 *   3. A 422 `linter_rejected` mutation result surfaces the
 *      server-side `LinterIssue[]` inline as `LinterEdgeCard`s.
 *   4. Empty state renders when `intents.length === 0`.
 *
 * The screen pulls in `expo-router` and a TanStack Query mutation
 * hook, both of which are stubbed at the module boundary. The
 * `usePendingRealityStore` is the real one — that's the contract
 * the screen depends on, and `__resetPendingRealityStoreForTests`
 * keeps tests isolated.
 */

import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

// ── Config (DEMO_MODE) stub ─────────────────────────────────────────
//
// PR-UX-17 (2026-05-09) — `aiTabAvailable` is now demo-gated:
// `isFranchiseOwner && Config.DEMO_MODE`. This test file's pre-PR-UX-17
// AI-tab visibility tests assume the AI tab is visible to FOs, so we
// flip the stub to `true` by default to preserve those existing
// assertions. The demo-gate behavior itself is asserted in a dedicated
// describe block ("AI tab demo-gate") that flips `mockDemoMode = false`
// per case. The constant Config fields the screen reads from elsewhere
// (none today besides DEMO_MODE) are mirrored verbatim from the real
// config so unrelated callers stay deterministic.
let mockDemoMode = true;
jest.mock("@technician/constants/config", () => ({
  __esModule: true,
  Config: {
    get DEMO_MODE() {
      return mockDemoMode;
    },
    API_BASE_URL: "http://localhost:3000",
    API_PREFIX: "/api/v1/technician",
    FRANCHISE_API_PREFIX: "/api/v1/franchise",
    TOOLS_API_PREFIX: "/api/v1/tools",
    SIGNAL_API_PREFIX: "/api/v1",
    WEB_ORIGIN: "https://app.remi.com",
    SECURE_STORE_ACCESS_TOKEN_KEY: "remi_access_token",
    SECURE_STORE_REFRESH_TOKEN_KEY: "remi_refresh_token",
    SECURE_STORE_USER_KEY: "remi_user",
    SECURE_STORE_BIOMETRIC_KEY: "remi_biometric_enabled",
  },
}));

// ── expo-router stub ────────────────────────────────────────────────
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
// Mutable so individual tests can drive `focusAppointmentId` (P3-FE-8).
let mockSearchParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: () => null,
  },
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

// ── Mutation-hook stub ──────────────────────────────────────────────
//
// We do NOT exercise the real network path here — this test owns the
// review screen's logic. The mutation hooks are thin wrappers around
// `api()` and TanStack Query; their own contracts (200 vs 422 vs
// throw) are covered separately. Stub the hook factories and let each
// test drive the mocks' `mutate` behavior.
const mockMutate = jest.fn();
const mockApplyAutoFixMutate = jest.fn();
const mockCancelMutate = jest.fn();
// PR-UX-19 (2026-05-09): Remove button now routes through
// `useRemoveReorganizationIntent` (BE `op:remove_intent`) instead of
// the local-only `usePendingRealityStore.removeIntent`. The mock
// records what the handler dispatches so tests can assert the BE
// call shape; `mockRemoveIntentVariables` lets the busy-state spec
// flip the matched intent without re-rendering. See
// `src/hooks/schedule/__tests__/use-remove-reorganization-intent.test.tsx`
// for the hook-level contract.
const mockRemoveIntentMutate = jest.fn();
let mockRemoveIntentIsPending = false;
let mockRemoveIntentVariables: { intentId: number } | undefined;
let mockIsPending = false;
let mockApplyIsPending = false;
let mockCancelIsPending = false;
// FE-CR-1-2 (2026-05-11): Sweep now fires `useCommitIntentsBatch`
// (per-intent commit-many) instead of the session-scoped finalize. The
// mock records the variables the handler dispatches so tests can
// assert that only the clean-intent ids land in `intent_ids` (dirty
// intents are NOT swept in a mixed session). `isPending` is a
// separate slot so the busy-label test can flip it without
// confusing the finalize button's pending state.
const mockCommitBatchMutate = jest.fn();
let mockCommitBatchIsPending = false;
// `ApplyAutoFixRejectedError` is exported from the factory itself
// (rather than a top-level `class` declaration referenced from the
// factory) because `jest.mock` is hoisted ABOVE the rest of the
// file's bindings — a top-level `class MockApplyAutoFixRejectedError`
// would be in TDZ when the factory first runs during module load,
// silently making the export `undefined` and breaking the screen's
// `err instanceof ApplyAutoFixRejectedError` branch in `onError`.
// Tests reach into the mocked module to read the class back out
// (`getMockedApplyAutoFixRejectedError()` below) instead of holding
// a top-level reference.
// ── Franchise reorganization hooks (P7-FE-1) ────────────────────────
//
// Default state: no AI sessions, no busy mutations. Tests that
// exercise the AI tab override `mockAiSessions` per-case via the
// `seedAiSessions` helper.
let mockAiSessions: import(
  "@technician/hooks/schedule/use-reorganization"
).ReorganizationApiSession[] = [];
let mockAiSessionsPending = false;
const mockAuthorizeMutate = jest.fn();
const mockDenyMutate = jest.fn();
let mockAuthorizePending = false;
let mockAuthorizeVariables: { sessionId: number } | undefined;
let mockDenyPending = false;
let mockDenyVariables: { sessionId: number } | undefined;
// 2026-05-08 fix/clear-must-stay-local: the cancel handler now reads
// `useQueryClient()` so it can write `null` to the active-session
// cache itself (gated on sessionId match). Tests don't mount a
// `QueryClientProvider`, so stub the hook to a minimal shape.
jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  useQueryClient: () => ({
    setQueryData: jest.fn(),
    invalidateQueries: jest.fn(),
  }),
}));

// PR 3 (item #5) — the review screen now resolves intent
// appointment_ids → customer name + service summary via
// `useIntentDisplayLookup`. The hook fans out one TanStack
// `useQueries` call per id; tests don't have a `QueryClientProvider`
// in scope so we stub it to return an empty Map. Tests that want to
// assert on the resolved-name path can override `mockIntentDisplayLookup`
// (e.g. `mockIntentDisplayLookup = new Map([[5001, fakeAppt]])`).
let mockIntentDisplayLookup: Map<number, unknown> = new Map();
jest.mock("@technician/hooks/franchise/use-intent-display-lookup", () => ({
  __esModule: true,
  useIntentDisplayLookup: () => mockIntentDisplayLookup,
}));

// 2026-04-25 fix: `DevSeedRow` (rendered behind `__DEV__`) calls
// `useFranchiseDayView` to pull real appointment IDs into the seed.
// The test environment doesn't have a `QueryClientProvider`, so stub
// the hook with an empty response — the seed falls back to synthetic
// IDs and tests stay deterministic.
//
// 2026-05-08 PR-UX-3 follow-up: the screen-level `useMoveChainGraph`
// (chain-badge identity, mirrors `MoveChainChipRow`) now also pulls
// from `useFranchiseWeekView`. Tests that exercise the chain badge
// override `mockWeekViewData` to seed appointment fixtures; tests
// that don't care about chain detection leave it `undefined` and
// the hook returns `EMPTY_MOVE_CHAIN_GRAPH`.
let mockWeekViewData: unknown = undefined;
jest.mock("@technician/hooks/schedule/use-calendar", () => ({
  __esModule: true,
  useFranchiseDayView: () => ({ data: undefined, isLoading: false }),
  // 2026-05-05 (PR-UX-2 PASS 2.10): `DevSeedRow` now also calls
  // `useFranchiseWeekView` so the cascade-chain seed can spread
  // sources across day-columns. Stubbed identically to the day view,
  // plus a no-op `refetch` because PASS 2.14's `seedCascadeChain`
  // awaits it before re-deriving sources at click-time.
  //
  // 2026-05-08 PR-UX-3 follow-up: a SECOND consumer of this hook
  // lives at the top of `PendingRealityReviewScreen` for chain-
  // badge derivation. Both consumers read the same `mockWeekViewData`
  // — fine because the screen wrapper (`useMoveChainGraph`) only
  // reads `.data`, and the dev-seed builders only use the data
  // when they're operating, which they aren't unless the user
  // taps a seed button.
  useFranchiseWeekView: () => ({
    data: mockWeekViewData,
    isLoading: false,
    refetch: () => Promise.resolve({ data: mockWeekViewData }),
  }),
  // D2P-FE-13: `useCalendarWorldSnapshot` (called inside the review
  // screen for the post-auto-fix `runLocalLinter` snapshot) consumes
  // `useTechnicianDayView` when the auth role is technician (the
  // default in this test file). Stub it the same way as the
  // franchise day view so the hook returns `EMPTY_WORLD_SNAPSHOT`.
  useTechnicianDayView: () => ({ data: undefined, isLoading: false }),
  // 2026-05-08 P3-FE-WEEK-SNAPSHOT: `useCalendarWorldSnapshot` now
  // also imports `useTechnicianWeekView` (and reads it when
  // `viewMode === "week"`). The review screen never enters week
  // mode in tests, so a stable empty stub is enough.
  useTechnicianWeekView: () => ({
    data: undefined,
    isLoading: false,
    refetch: () => Promise.resolve({ data: undefined }),
  }),
  calendarKeys: {
    all: ["calendar"] as const,
    day: (date: string) => ["calendar", "day", date] as const,
    week: (startDate: string) => ["calendar", "week", startDate] as const,
    month: (year: number, month: number) =>
      ["calendar", "month", year, month] as const,
    appointmentDetail: (id: number) =>
      ["calendar", "appointment", id] as const,
  },
}));

jest.mock("@technician/hooks/franchise/use-franchise-reorganizations", () => ({
  __esModule: true,
  useAiSuggestionSessions: () => ({
    data: mockAiSessions,
    isPending: mockAiSessionsPending,
    isError: false,
  }),
  useAuthorizeReorganizationSession: () => ({
    mutate: mockAuthorizeMutate,
    isPending: mockAuthorizePending,
    variables: mockAuthorizeVariables,
  }),
  useDenyReorganizationSession: () => ({
    mutate: mockDenyMutate,
    isPending: mockDenyPending,
    variables: mockDenyVariables,
  }),
  // PR 4 (item E): the inline counter-propose sheet calls this hook
  // on mount even when invisible. Stub it here so the sheet can render
  // through the test tree without a QueryClientProvider.
  useCounterProposeReorganizationSession: () => ({
    mutate: jest.fn(),
    mutateAsync: jest.fn().mockResolvedValue({}),
    isPending: false,
  }),
}));

// ── Auth store stub (P7-FE-1) ───────────────────────────────────────
//
// Default: technician role (no AI tab). Tests that exercise the AI
// tab flip `mockAuthRole` to "franchise_owner" inside their setup.
// 2026-05-08 fix/clear-must-stay-local: the cancel handler also
// reads `franchiseId` (via a slice selector) for the conditional
// `cacheReorganizationResult(..., null)` call, so the auth fixture
// surfaces a stable franchise id alongside the role.
let mockAuthRole: string | null = "technician";
const MOCK_FRANCHISE_ID = 999;
jest.mock("@/src/stores/auth", () => ({
  __esModule: true,
  useAuthStore: <T,>(
    selector: (state: {
      user: { role: string; franchiseId: number } | null;
    }) => T,
  ): T =>
    selector({
      user:
        mockAuthRole != null
          ? { role: mockAuthRole, franchiseId: MOCK_FRANCHISE_ID }
          : null,
    }),
}));

/**
 * Spy on `cacheReorganizationResult`. The cancel handler writes
 * `null` to the active-session cache locally (formerly the hook's
 * job, see PLAN-DEVIATION 2026-05-08-cancel-hook-no-auto-coord), and
 * tests assert that write was conditional on the cancelled session
 * being the live one.
 */
const mockCacheReorganizationResult = jest.fn();

jest.mock("@technician/hooks/schedule/use-reorganization", () => {
  class ApplyAutoFixRejectedErrorMock extends Error {
    readonly kind = "linter_rejected" as const;
    readonly issues: import("@technician/utils/logistics-linter").LinterIssue[];
    constructor(
      issues: import("@technician/utils/logistics-linter").LinterIssue[],
    ) {
      super("Apply auto-fix rejected by the server-side linter.");
      this.name = "ApplyAutoFixRejectedError";
      this.issues = issues;
    }
  }
  // FE-CR-1-2 (2026-05-11) — Sweep now branches on these tagged
  // error subclasses in its `onError`. The mocks need to expose
  // the exact constructor identities the screen `instanceof`-checks
  // against (same pattern as `ApplyAutoFixRejectedErrorMock`).
  class CommitBatchRejectedErrorMock extends Error {
    readonly kind = "linter_rejected" as const;
    readonly issues: import("@technician/utils/logistics-linter").LinterIssue[];
    constructor(
      issues: import("@technician/utils/logistics-linter").LinterIssue[],
    ) {
      super("Per-intent commit-many rejected by the server-side linter.");
      this.name = "CommitBatchRejectedError";
      this.issues = issues;
    }
  }
  class CommitBatchIntentNotFoundErrorMock extends Error {
    readonly kind = "intent_not_found" as const;
    readonly badIntentId: number | null;
    constructor(badIntentId: number | null) {
      super(
        "Per-intent commit-many referenced an intent id missing from the session.",
      );
      this.name = "CommitBatchIntentNotFoundError";
      this.badIntentId = badIntentId;
    }
  }
  return {
    __esModule: true,
    useFinalizeReorganizationSession: () => ({
      mutate: mockMutate,
      isPending: mockIsPending,
    }),
    useCommitIntentsBatch: () => ({
      mutate: mockCommitBatchMutate,
      isPending: mockCommitBatchIsPending,
    }),
    CommitBatchRejectedError: CommitBatchRejectedErrorMock,
    CommitBatchIntentNotFoundError: CommitBatchIntentNotFoundErrorMock,
    useApplyAutoFix: () => ({
      mutate: mockApplyAutoFixMutate,
      isPending: mockApplyIsPending,
    }),
    // PR-UX-2 PASS 2.12 (2026-05-05): the empty-state `DevSeedRow`
    // (rendered under `__DEV__`) now calls `useCreateReorganizationSession`
    // because the three seed buttons hit the real BE create endpoint
    // instead of writing into local Zustand. The hook is unused in the
    // assertions below, but unmocked it would crash on render.
    useCreateReorganizationSession: () => ({
      mutate: jest.fn(),
      mutateAsync: jest.fn(async () => undefined),
      isPending: false,
    }),
    useCancelReorganizationSession: () => ({
      mutate: mockCancelMutate,
      isPending: mockCancelIsPending,
    }),
    // PR-UX-19 (2026-05-09): the Remove button now fires this hook
    // instead of the local store mutator. The `variables` field is
    // surfaced to the screen so the active card can render a
    // "Removing…" label while the BE round-trips.
    useRemoveReorganizationIntent: () => ({
      mutate: mockRemoveIntentMutate,
      isPending: mockRemoveIntentIsPending,
      variables: mockRemoveIntentVariables,
    }),
    // 2026-05-08 fix/clear-must-stay-local: the cancel handler now
    // writes the active-session cache to `null` itself (gated on
    // sessionId match) instead of relying on the hook's onSuccess
    // to do it unconditionally.
    cacheReorganizationResult: (...args: unknown[]) =>
      mockCacheReorganizationResult(...args),
    ApplyAutoFixRejectedError: ApplyAutoFixRejectedErrorMock,
  };
});

/**
 * Read the mocked `ApplyAutoFixRejectedError` constructor back out of
 * the mocked module. Used by tests that need to construct an instance
 * of the *same* class the screen will `instanceof`-check against.
 */
function getMockedApplyAutoFixRejectedError(): new (
  issues: import("@technician/utils/logistics-linter").LinterIssue[],
) => Error & {
  kind: "linter_rejected";
  issues: import("@technician/utils/logistics-linter").LinterIssue[];
} {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("@technician/hooks/schedule/use-reorganization");
  return mod.ApplyAutoFixRejectedError;
}

// `Alert.alert` interception — the Cancel/Remove handlers fire
// confirmation alerts. For the tests below we only need to assert
// that finalize / sort / inline-cards work; alerts are silenced so
// they don't pollute output.
//
// `react-native` is loaded above the screen import on purpose so the
// `Alert.alert` spy is in place before any handler can fire it. The
// `import/first` lint rule is suppressed for these blocks because
// every line below the `jest.mock()` calls above is intentional —
// jest hoists the mocks above all imports, so any module loaded
// between the mocks and the system-under-test would still see the
// stubs.
// eslint-disable-next-line import/first
import { Alert } from "react-native";

jest.spyOn(Alert, "alert").mockImplementation(() => {});

// eslint-disable-next-line import/first
import PendingRealityReviewScreen from "../review";
// eslint-disable-next-line import/first
import {
  __resetPendingRealityStoreForTests,
  usePendingRealityStore,
} from "@technician/stores/pending-reality";
// eslint-disable-next-line import/first
import type { ReorganizationIntent } from "@technician/types/reorganization";
// eslint-disable-next-line import/first
import {
  makeIntent,
  makeSession,
} from "@technician/stores/__fixtures__/pending-reality";
// eslint-disable-next-line import/first
import type { LinterIssue } from "@technician/utils/logistics-linter";
// eslint-disable-next-line import/first
import type { FinalizeReorganizationResult } from "@technician/hooks/schedule/use-reorganization";

// ── Fixtures ────────────────────────────────────────────────────────
//
// `makeSession` / `makeIntent` factories live in
// `src/stores/__fixtures__/pending-reality.ts` (shared with the FAB
// and HUD suites). Each intent below uses `makeIntent(id, overrides)`
// to override the intent-type-specific fields while inheriting the
// boilerplate defaults (session_id, intent_status, committed_at,
// linter_dependency_edges, etc).

const SESSION = makeSession();

/**
 * Build one intent of each `ReorganizationIntentType` (and a second
 * `reschedule` carrying `new_technician_id` so the reschedule-vs-
 * combo-reschedule split in §6.4.1 is exercised).
 *
 * Intent IDs are intentionally interleaved so the §6.4.1 sort cannot
 * pass by accident — only a sort that actually consults
 * `intent_type` + `payload` will land them in the canonical order
 * below.
 */
const INTENTS: ReorganizationIntent[] = [
  // create — §6.4.1 group 5
  makeIntent(110, {
    intent_type: "create",
    appointment_id: null,
    payload: {
      kind: "create",
      customer_id: 9001,
      technician_id: 5,
      scheduled_date: "2026-04-25",
      scheduled_start_time: "11:00",
      scheduled_end_time: "12:00",
      service_ids: [1],
    },
    proposed_at: "2026-04-23T15:05:00.000Z",
  }),
  // personal_event_create — §6.4.1 group 8
  makeIntent(120, {
    intent_type: "personal_event_create",
    appointment_id: null,
    personal_event_id: "pe-aaa",
    payload: {
      kind: "personal_event_create",
      technician_id: 5,
      scheduled_date: "2026-04-25",
      start_time: "13:00",
      end_time: "14:00",
      title: "Lunch",
      category: "personal",
    },
    proposed_at: "2026-04-23T15:06:00.000Z",
  }),
  // cancel — §6.4.1 group 1
  makeIntent(130, {
    intent_type: "cancel",
    appointment_id: 5001,
    payload: {
      kind: "cancel",
      cancellation_reason: "customer_request",
    },
    proposed_at: "2026-04-23T15:01:00.000Z",
  }),
  // reschedule (no tech change) — §6.4.1 group 2
  makeIntent(140, {
    intent_type: "reschedule",
    appointment_id: 5002,
    payload: {
      kind: "reschedule",
      new_scheduled_date: "2026-04-24",
      new_start_time: "09:00",
      new_end_time: "10:00",
    },
    proposed_at: "2026-04-23T15:02:00.000Z",
  }),
  // personal_event_delete — §6.4.1 group 6
  makeIntent(150, {
    intent_type: "personal_event_delete",
    appointment_id: null,
    personal_event_id: "pe-bbb",
    payload: {
      kind: "personal_event_delete",
      version: 3,
    },
    proposed_at: "2026-04-23T15:07:00.000Z",
  }),
  // reassign — §6.4.1 group 4
  makeIntent(160, {
    intent_type: "reassign",
    appointment_id: 5003,
    payload: {
      kind: "reassign",
      new_technician_id: 7,
    },
    proposed_at: "2026-04-23T15:04:00.000Z",
  }),
  // reschedule WITH tech change — §6.4.1 group 3 (combo move)
  makeIntent(170, {
    intent_type: "reschedule",
    appointment_id: 5004,
    payload: {
      kind: "reschedule",
      new_scheduled_date: "2026-04-24",
      new_start_time: "13:00",
      new_end_time: "14:00",
      new_technician_id: 8,
    },
    proposed_at: "2026-04-23T15:03:00.000Z",
  }),
  // personal_event_update — §6.4.1 group 7
  makeIntent(180, {
    intent_type: "personal_event_update",
    appointment_id: null,
    personal_event_id: "pe-ccc",
    payload: {
      kind: "personal_event_update",
      version: 2,
      patch: { title: "Updated" },
    },
    proposed_at: "2026-04-23T15:08:00.000Z",
  }),
];

/** Expected §6.4.1 commit order for the IDs above. */
const EXPECTED_SEQUENCE_IDS = [130, 140, 170, 160, 110, 150, 180, 120];

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  __resetPendingRealityStoreForTests();
  mockMutate.mockReset();
  mockApplyAutoFixMutate.mockReset();
  mockCancelMutate.mockReset();
  mockCacheReorganizationResult.mockReset();
  mockPush.mockClear();
  mockBack.mockClear();
  mockReplace.mockClear();
  mockCanGoBack.mockClear().mockReturnValue(true);
  // Alert.alert is spied at module load above; clear its history
  // between tests so per-test assertions on `mock.calls[0]` are
  // reliable. (The implementation stays a no-op.)
  (Alert.alert as jest.Mock).mockClear();
  mockIsPending = false;
  mockApplyIsPending = false;
  mockCommitBatchMutate.mockReset();
  mockCommitBatchIsPending = false;
  mockCancelIsPending = false;
  mockRemoveIntentMutate.mockReset();
  mockRemoveIntentIsPending = false;
  mockRemoveIntentVariables = undefined;
  mockSearchParams = {};
  mockAiSessions = [];
  mockAiSessionsPending = false;
  mockAuthorizeMutate.mockReset();
  mockDenyMutate.mockReset();
  mockAuthorizePending = false;
  mockDenyPending = false;
  mockAuthorizeVariables = undefined;
  mockDenyVariables = undefined;
  mockAuthRole = "technician";
  mockDemoMode = true;
  mockIntentDisplayLookup = new Map();
  // 2026-05-08 PR-UX-3 follow-up: chain badge tests override this
  // per-case to seed appointment data through the calendar's
  // `useFranchiseWeekView` cache (the same source the calendar's
  // `MoveChainChipRow` consumes).
  mockWeekViewData = undefined;
});

function seedStore(intents: ReorganizationIntent[] = INTENTS): void {
  act(() => {
    usePendingRealityStore.getState().setSession(SESSION);
    for (const intent of intents) {
      usePendingRealityStore.getState().addIntent(intent);
    }
  });
}

// ──────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────

describe("Pending Reality review screen — empty state (FO)", () => {
  // The FO empty state ("Drag a card to start composing") is the
  // FO-specific path: only renders when the viewer is a franchise
  // owner / franchisor with no own draft AND no AI suggestions
  // pending. The default `mockAuthRole = "technician"` from
  // `beforeEach` would land on `TechnicianReadOnlyState` instead
  // (see the next describe block), so each test in here flips to
  // an FO role first.
  beforeEach(() => {
    mockAuthRole = "franchise_owner";
    mockAiSessions = [];
  });

  it("renders the empty card when no intents are staged", () => {
    const { getByTestId, queryByTestId } = render(<PendingRealityReviewScreen />);
    expect(getByTestId("review-empty-state")).toBeTruthy();
    expect(getByTestId("review-empty-cta")).toBeTruthy();
    expect(queryByTestId("review-tab-bar")).toBeNull();
    expect(queryByTestId("review-action-bar")).toBeNull();
  });

  it("dismissing the empty state routes back when possible", () => {
    const { getByTestId } = render(<PendingRealityReviewScreen />);
    fireEvent.press(getByTestId("review-empty-cta"));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("dismissing the empty state replaces to /(tabs) when no back history", () => {
    mockCanGoBack.mockReturnValue(false);
    const { getByTestId } = render(<PendingRealityReviewScreen />);
    fireEvent.press(getByTestId("review-empty-cta"));
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
  });
});

describe("Pending Reality review screen — technician read-only state", () => {
  // 2026-04-27 fix: technicians who reach this screen (via the
  // PendingRealityFAB on the calendar tab, a notification deep
  // link, or the `?focusAppointmentId=…` deep-link contract) used
  // to land on the FO `EmptyState` ("Drag a card to start
  // composing") because techs have no AI tab and no own draft on
  // arrival. That copy was misleading on two counts: the change
  // they came to inspect was authored elsewhere, and dragging on
  // their calendar would author a *new* tech-app session, not
  // surface the FO/AI/customer-authored session that triggered
  // the navigation. The read-only state explains the read-only
  // nature and points them back to the calendar canvas.
  //
  // Note: the original C.12 entry point — tap on a cyan-overlaid
  // appointment routing here automatically — was removed on
  // 2026-04-27 (see PLAN-DEVIATIONS.md#2026-04-27-pending-tap-to-detail-sheet).
  // The read-only state still earns its weight for the remaining
  // entry points listed above.

  it("renders the read-only state by default for a tech with no draft and no AI", () => {
    const { getByTestId, queryByTestId } = render(<PendingRealityReviewScreen />);
    expect(getByTestId("review-tech-readonly-state")).toBeTruthy();
    expect(getByTestId("review-tech-readonly-cta")).toBeTruthy();
    // The misleading FO empty state must NOT render for techs.
    expect(queryByTestId("review-empty-state")).toBeNull();
    // Tech viewer never gets the AI tab (§2.5 trust gradient).
    expect(queryByTestId("review-tab-btn-ai")).toBeNull();
    expect(queryByTestId("review-tab-bar")).toBeNull();
    expect(queryByTestId("review-action-bar")).toBeNull();
  });

  it("renders the read-only state even when AI sessions exist (techs can't act on them)", () => {
    // Even if the BE happens to return AI sessions for whatever
    // reason (RBAC bug, mock leak), techs must still land on the
    // read-only state — the AI tab gate is `isFranchiseOwner`,
    // not "AI sessions exist", so this guards against the gate
    // ever being relaxed by accident.
    mockAiSessions = [makeAiSession()];
    const { getByTestId, queryByTestId } = render(<PendingRealityReviewScreen />);
    expect(getByTestId("review-tech-readonly-state")).toBeTruthy();
    expect(queryByTestId("review-tab-btn-ai")).toBeNull();
  });

  it("Back-to-calendar CTA routes back when history exists", () => {
    const { getByTestId } = render(<PendingRealityReviewScreen />);
    fireEvent.press(getByTestId("review-tech-readonly-cta"));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("Back-to-calendar CTA replaces to /(tabs) when no back history", () => {
    mockCanGoBack.mockReturnValue(false);
    const { getByTestId } = render(<PendingRealityReviewScreen />);
    fireEvent.press(getByTestId("review-tech-readonly-cta"));
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
  });

  it("falls back to composing UI when the tech has authored their own draft", () => {
    // A tech CAN compose their own session (e.g. drag-to-stage on
    // the calendar). When they do, the read-only state must NOT
    // hijack the screen — they need to see the Sequence tab so
    // they can review and finalize their own work. Per PR-UX-5
    // (2026-05-08) the tab bar collapses to a hidden single-tab
    // state for non-FO users; the Sequence content is rendered
    // directly without a button. Assert on the content testID
    // instead of the tab button.
    seedStore([INTENTS[2]!]);
    const { getByTestId, queryByTestId } = render(<PendingRealityReviewScreen />);
    expect(queryByTestId("review-tech-readonly-state")).toBeNull();
    expect(queryByTestId("review-tab-btn-final")).toBeNull();
    expect(getByTestId("review-tab-sequence")).toBeTruthy();
  });

  it("renders the read-only state when the user role is null (auth not fully hydrated)", () => {
    // 2026-04-27 widening: on Expo Go reloads + demo-login round-
    // trips, the auth `user` blob occasionally hydrates with
    // `role` undefined for a beat (observed via
    // `[DEBUG:Review] aiTabGate userRole: null` on a logged-in
    // technician sim). The empty-state branch is the only safe
    // default for a non-FO viewer; making `userRole === null`
    // fall through to the FO `EmptyState` ("drag a card to
    // compose") would put the tech back on the misleading copy
    // the rest of this describe block exists to guard against.
    mockAuthRole = null;
    const { getByTestId, queryByTestId } = render(<PendingRealityReviewScreen />);
    expect(getByTestId("review-tech-readonly-state")).toBeTruthy();
    expect(queryByTestId("review-empty-state")).toBeNull();
  });
});

describe("Pending Reality review screen — Sequence tab", () => {
  it("sorts one of each intent type by §6.4.1 commit order", () => {
    seedStore();
    const node = render(<PendingRealityReviewScreen />);
    // PR-UX-5 (2026-05-08): Sequence is the default tab and is
    // mounted directly; no segmented-control button to press.

    // Read the rendered step badges in DOM order. Each intent card
    // exposes `intent-step-${id}` for its step badge — collecting the
    // ids in render order gives us the sorted sequence.
    const tab = node.getByTestId("review-tab-sequence");
    const renderedIds: number[] = [];
    const collect = (node: { children?: unknown[]; props?: { testID?: string } }) => {
      const id = node.props?.testID;
      if (id && typeof id === "string" && id.startsWith("intent-card-")) {
        renderedIds.push(Number(id.slice("intent-card-".length)));
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          if (child && typeof child === "object") {
            collect(child as Parameters<typeof collect>[0]);
          }
        }
      }
    };
    collect(tab as unknown as Parameters<typeof collect>[0]);

    // Some host nodes get traversed twice by `react-test-renderer`'s
    // tree (host vs composite). Deduplicate while preserving order
    // so the assertion is purely about the sort, not the renderer's
    // traversal model.
    const dedupedIds = Array.from(new Set(renderedIds));
    expect(dedupedIds).toEqual(EXPECTED_SEQUENCE_IDS);
  });

  it("renders Modify and Remove actions on each Sequence row", () => {
    seedStore([INTENTS[2]!, INTENTS[3]!]); // cancel + reschedule
    const node = render(<PendingRealityReviewScreen />);
    // PR-UX-5 (2026-05-08): Sequence is the default tab and is
    // mounted directly; no segmented-control button to press.
    expect(node.getByTestId("intent-modify-130")).toBeTruthy();
    expect(node.getByTestId("intent-remove-130")).toBeTruthy();
    expect(node.getByTestId("intent-modify-140")).toBeTruthy();
    expect(node.getByTestId("intent-remove-140")).toBeTruthy();
  });
});

// ──────────────────────────────────────────────────────────────────
// PR-UX-19 (2026-05-09) — Remove button routes through the BE
// ──────────────────────────────────────────────────────────────────
//
// Pre-PR-UX-19 the Remove button called
// `usePendingRealityStore.removeIntent(intentId)` LOCALLY only — the
// BE's `op:remove_intent` PATCH never fired. Any subsequent active-
// session refetch (foreground bridge, staleTime, etc.) hydrated the
// still-present BE intent back into the store via
// `setSession(refresh+intents)`, and finalize then committed every
// "removed" intent. The fix routes the button through
// `useRemoveReorganizationIntent`; the local store is no longer
// touched directly here. The tests below pin two contracts:
//
//   1. Tapping Remove → confirming → fires
//      `removeIntentMutation.mutate({ sessionId, intentId, ... })`
//      and does NOT call the local `removeIntent` selector.
//   2. While the mutation is pending, the matching card's button
//      reads "Removing…" and is disabled (ARIA + label).
//
// The hook-level contract (endpoint shape, store refresh on success,
// calendar cache invalidation) lives in
// `src/hooks/schedule/__tests__/use-remove-reorganization-intent.test.tsx`.
describe("Pending Reality review screen — PR-UX-19 BE-driven Remove", () => {
  it("dispatches the BE remove mutation when Remove is confirmed", () => {
    seedStore([INTENTS[2]!, INTENTS[3]!]);
    const node = render(<PendingRealityReviewScreen />);

    // Trip the per-intent confirm alert; resolve via the destructive
    // "Remove" button.
    fireEvent.press(node.getByTestId("intent-remove-130"));
    const lastCall = (Alert.alert as jest.Mock).mock.calls.at(-1)!;
    expect(lastCall[0]).toBe("Remove this change?");
    const buttons = lastCall[2] as { text: string; onPress?: () => void }[];
    const removeBtn = buttons.find((b) => b.text === "Remove");
    expect(removeBtn?.onPress).toBeDefined();
    act(() => {
      removeBtn!.onPress!();
    });

    expect(mockRemoveIntentMutate).toHaveBeenCalledTimes(1);
    const [variables] = mockRemoveIntentMutate.mock.calls[0]!;
    expect(variables).toEqual(
      expect.objectContaining({
        sessionId: SESSION.id,
        intentId: 130,
      }),
    );
    // Local store is NOT mutated directly by the handler — it must
    // wait for the BE response so the truth comes from the wire.
    expect(usePendingRealityStore.getState().intents.map((i) => i.id))
      .toEqual([130, 140]);
  });

  it("renders 'Removing…' on the active card while the mutation is pending", () => {
    seedStore([INTENTS[2]!, INTENTS[3]!]);
    mockRemoveIntentIsPending = true;
    mockRemoveIntentVariables = { intentId: 130 };

    const node = render(<PendingRealityReviewScreen />);

    // The active card's button label flips while in flight.
    const activeBtn = node.getByTestId("intent-remove-130");
    expect(activeBtn.props.accessibilityState?.disabled).toBe(true);
    // Walk children to find the visible label text.
    const collectText = (n: unknown, out: string[]) => {
      if (n && typeof n === "object") {
        const node = n as { props?: { children?: unknown }; children?: unknown };
        const children = node.props?.children ?? node.children;
        if (typeof children === "string") out.push(children);
        if (Array.isArray(children)) {
          for (const c of children) collectText(c, out);
        } else if (children && typeof children === "object") {
          collectText(children, out);
        }
      }
    };
    const activeLabels: string[] = [];
    collectText(activeBtn, activeLabels);
    expect(activeLabels.join(" ")).toMatch(/Removing/);

    // The other card's button is still interactive.
    const otherBtn = node.getByTestId("intent-remove-140");
    expect(otherBtn.props.accessibilityState?.disabled).not.toBe(true);
  });

});

describe("Pending Reality review screen — PR3 customer names + tap-to-detail", () => {
  it("falls back to bare 'Appointment' subject when both lookups are empty", () => {
    // D2P-FE-13 follow-up #2 (2026-04-26): the fallback used to
    // expose the raw `#5001` id; we hide it now and render the
    // generic word so end users never see the wire id. Both the
    // Final-state group header and the card subject render the
    // fallback label, so we expect ≥1 match.
    seedStore([INTENTS[2]!]); // cancel intent targeting appointment id 5001
    const node = render(<PendingRealityReviewScreen />);
    const matches = node.getAllByText(/^Appointment$/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // And the bare id MUST NOT be visible anywhere on the screen.
    expect(node.queryByText(/#5001/)).toBeNull();
  });

  it("renders customer name + service summary when the lookup hydrates", () => {
    mockIntentDisplayLookup = new Map([
      [
        5001,
        {
          customer_name: "Jane Doe",
          services: [{ service_name: "Brake service" }],
        },
      ],
    ]);
    seedStore([INTENTS[2]!]); // cancel intent targeting 5001
    const node = render(<PendingRealityReviewScreen />);
    const matches = node.getAllByText("Jane Doe — Brake service");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("opens the appointment detail route when a card is tapped", () => {
    mockIntentDisplayLookup = new Map([
      [
        5001,
        {
          customer_name: "Jane Doe",
          services: [{ service_name: "Brake service" }],
        },
      ],
    ]);
    seedStore([INTENTS[2]!]); // cancel intent → appointment_id 5001
    const node = render(<PendingRealityReviewScreen />);
    fireEvent.press(node.getByTestId("intent-press-130"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/order/[id]",
      params: { id: "5001" },
    });
  });

  // Note: the help button is rendered via Stack.Screen `headerRight`,
  // which the expo-router mock above swallows (`Stack.Screen: () =>
  // null`). Verifying the actual press routes to /pending-reality/help
  // requires a real-app smoke test rather than a unit test here.
});

describe("Pending Reality review screen — Finalize CTA", () => {
  it("calls the finalize mutation with the active sessionId", () => {
    seedStore([INTENTS[2]!]); // single cancel intent
    const node = render(<PendingRealityReviewScreen />);
    fireEvent.press(node.getByTestId("review-finalize-btn"));
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0]![0]).toBe(7001);
  });

  it("clears the store and routes back when finalize returns 'committed'", () => {
    seedStore([INTENTS[2]!]);
    const node = render(<PendingRealityReviewScreen />);

    fireEvent.press(node.getByTestId("review-finalize-btn"));

    // Drive the mutation's onSuccess branch ourselves.
    const onSuccess = mockMutate.mock.calls[0]![1].onSuccess as (
      result: FinalizeReorganizationResult,
    ) => void;
    act(() => {
      onSuccess({
        kind: "committed",
        session: { ...SESSION, status: "committed", intents: [INTENTS[2]!] },
        warnings: [],
      });
    });

    // PR-UX-15 (2026-05-09): the no-warnings success path now ALSO
    // shows a confirmation alert before dismissing — silent dismiss
    // was visually identical to Cancel and confused the user about
    // whether finalize had actually succeeded. Tap OK to dismiss.
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [title, body, buttons] = (Alert.alert as jest.Mock).mock.calls[0]!;
    expect(title).toContain("Committed");
    expect(body).toContain("Changes are live on the calendar.");
    const okBtn = (buttons as { text: string; onPress?: () => void }[]).find(
      (b) => b.text === "OK",
    );
    act(() => {
      okBtn?.onPress?.();
    });
    expect(usePendingRealityStore.getState().intents).toEqual([]);
    expect(usePendingRealityStore.getState().sessionId).toBeNull();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("clears the store and routes back when finalize returns 'pending_review'", () => {
    // Mirror of the 'committed' branch — covers the auto_committed:
    // false → kind: "pending_review" mapping introduced by P3-FE-12.
    seedStore([INTENTS[2]!]);
    const node = render(<PendingRealityReviewScreen />);

    fireEvent.press(node.getByTestId("review-finalize-btn"));

    const onSuccess = mockMutate.mock.calls[0]![1].onSuccess as (
      result: FinalizeReorganizationResult,
    ) => void;
    act(() => {
      onSuccess({
        kind: "pending_review",
        session: {
          ...SESSION,
          status: "pending_review",
          intents: [INTENTS[2]!],
        },
        warnings: [],
      });
    });

    // PR-UX-15: pending_review path also confirms via alert before
    // dismissing.
    // PR-UX-17 (2026-05-09): copy is now actor-aware. The default
    // SESSION fixture has `required_authorizer_role: "self"` so this
    // is a self-approve case — title is plain "Submitted N change(s)"
    // (no "for review" suffix), body says "They'll commit when you
    // approve them." (no "AI tab" reference), and the buttons are
    // "Dismiss" + "Approve now".
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [title, body, buttons] = (Alert.alert as jest.Mock).mock.calls[0]!;
    expect(title).toContain("Submitted");
    expect(title).not.toContain("AI tab");
    expect(body).toContain("They'll commit when you approve them.");
    expect(body).not.toContain("AI tab");
    const buttonRows = buttons as { text: string; onPress?: () => void }[];
    const dismissBtn = buttonRows.find((b) => b.text === "Dismiss");
    expect(dismissBtn).toBeTruthy();
    expect(buttonRows.find((b) => b.text === "Approve now")).toBeTruthy();
    act(() => {
      dismissBtn?.onPress?.();
    });
    expect(usePendingRealityStore.getState().intents).toEqual([]);
    expect(usePendingRealityStore.getState().sessionId).toBeNull();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("alerts and dismisses when committed with non-empty warnings (P3-FE-12)", () => {
    seedStore([INTENTS[2]!]);
    const node = render(<PendingRealityReviewScreen />);

    fireEvent.press(node.getByTestId("review-finalize-btn"));

    const onSuccess = mockMutate.mock.calls[0]![1].onSuccess as (
      result: FinalizeReorganizationResult,
    ) => void;

    const warning: LinterIssue = {
      severity: "warning",
      kind: "drive_time_impossible",
      affectedAppointmentIds: [5001],
      humanMessage:
        "SLA window for #5001 closes 30 min after the new start.",
    };

    act(() => {
      onSuccess({
        kind: "committed",
        session: { ...SESSION, status: "committed", intents: [INTENTS[2]!] },
        warnings: [warning],
      });
    });

    // Alert is shown with a count + the human message; user OK
    // dismisses the screen via the `onPress` callback we pass.
    // PR-UX-15: title format updated to "Committed N change(s) (M warning(s))"
    // — was "Committed (with M warning)". Body now also includes
    // the success footer ("Changes are live on the calendar.") in
    // addition to the warning bullets.
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [title, body, buttons] = (Alert.alert as jest.Mock).mock.calls[0]!;
    expect(title).toContain("Committed");
    expect(title).toContain("1 warning");
    expect(body).toContain(warning.humanMessage);
    expect(body).toContain("Changes are live on the calendar.");

    // The screen is still mounted until the user taps OK on the
    // alert — fire the OK button's onPress to drive dismissal.
    expect(mockBack).not.toHaveBeenCalled();
    const okButton = (buttons as { text: string; onPress?: () => void }[]).find(
      (b) => b.text === "OK",
    );
    act(() => {
      okButton?.onPress?.();
    });
    expect(usePendingRealityStore.getState().intents).toEqual([]);
    expect(usePendingRealityStore.getState().sessionId).toBeNull();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("alerts with the pending_review variant title when warnings ride along (P3-FE-12)", () => {
    seedStore([INTENTS[2]!]);
    const node = render(<PendingRealityReviewScreen />);

    fireEvent.press(node.getByTestId("review-finalize-btn"));

    const onSuccess = mockMutate.mock.calls[0]![1].onSuccess as (
      result: FinalizeReorganizationResult,
    ) => void;

    const warnings: LinterIssue[] = [
      {
        severity: "warning",
        kind: "drive_time_impossible",
        affectedAppointmentIds: [5001],
        humanMessage: "Tight drive window between #5001 and the next stop.",
      },
      {
        severity: "warning",
        kind: "time_conflict",
        affectedAppointmentIds: [5001],
        humanMessage: "Lunch overlaps the new window for tech #5.",
      },
    ];

    act(() => {
      onSuccess({
        kind: "pending_review",
        session: {
          ...SESSION,
          status: "pending_review",
          intents: [INTENTS[2]!],
        },
        warnings,
      });
    });

    // PR-UX-15: title format "Submitted N change(s) (M warnings)".
    // PR-UX-17 (2026-05-09): self-approve case (default fixture has
    // `required_authorizer_role: "self"`), so the title omits the
    // "for review" suffix and the footer reads "They'll commit when
    // you approve them." (the "Awaiting approval — check the AI
    // tab" copy from PR-UX-15 is gone).
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [title, body] = (Alert.alert as jest.Mock).mock.calls[0]!;
    expect(title).toContain("Submitted");
    expect(title).toContain("2 warnings");
    expect(title).not.toContain("AI tab");
    expect(body).toContain("Tight drive window between #5001");
    expect(body).toContain("Lunch overlaps the new window");
    expect(body).toContain("They'll commit when you approve them.");
    expect(body).not.toContain("AI tab");
  });

  // PR-UX-17 (2026-05-09): self-approve "Approve now" CTA.
  it("fires authorize when the FO taps 'Approve now' on the success alert", () => {
    mockAuthRole = "franchise_owner";
    seedStore([INTENTS[2]!]);
    const node = render(<PendingRealityReviewScreen />);

    fireEvent.press(node.getByTestId("review-finalize-btn"));
    const onSuccess = mockMutate.mock.calls[0]![1].onSuccess as (
      result: FinalizeReorganizationResult,
    ) => void;
    act(() => {
      onSuccess({
        kind: "pending_review",
        session: {
          ...SESSION,
          status: "pending_review",
          intents: [INTENTS[2]!],
        },
        warnings: [],
      });
    });

    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0]!;
    const approveBtn = (
      buttons as { text: string; onPress?: () => void }[]
    ).find((b) => b.text === "Approve now");
    expect(approveBtn).toBeTruthy();
    act(() => {
      approveBtn?.onPress?.();
    });

    // Authorize is fired with the just-finalized session id, then the
    // screen dismisses immediately (no waiting on the BE for a snappy
    // hand-off back to the calendar).
    expect(mockAuthorizeMutate).toHaveBeenCalledTimes(1);
    expect(mockAuthorizeMutate.mock.calls[0]![0]).toEqual({
      sessionId: SESSION.id,
    });
    expect(usePendingRealityStore.getState().sessionId).toBeNull();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  // PR-UX-17 (2026-05-09): not-self-approve copy. When the session's
  // `required_authorizer_role !== "self"` AND the actor is not in
  // `eligible_committer_ids`, the alert reads as a hand-off to a
  // separate franchise-owner approver and shows only "OK".
  it("uses the franchise-owner-review copy when the actor cannot self-approve", () => {
    mockAuthRole = "technician";
    const techStagedSession = {
      ...SESSION,
      required_authorizer_role: "franchise_owner" as const,
      eligible_committer_ids: [999],
    };
    act(() => {
      usePendingRealityStore.getState().setSession(techStagedSession);
      usePendingRealityStore.getState().addIntent(INTENTS[2]!);
    });

    const node = render(<PendingRealityReviewScreen />);
    fireEvent.press(node.getByTestId("review-finalize-btn"));
    const onSuccess = mockMutate.mock.calls[0]![1].onSuccess as (
      result: FinalizeReorganizationResult,
    ) => void;
    act(() => {
      onSuccess({
        kind: "pending_review",
        session: {
          ...techStagedSession,
          status: "pending_review",
          intents: [INTENTS[2]!],
        },
        warnings: [],
      });
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [title, body, buttons] = (Alert.alert as jest.Mock).mock.calls[0]!;
    expect(title).toContain("for franchise-owner review");
    expect(body).toContain("They'll commit once approved.");
    expect(body).not.toContain("AI tab");
    const buttonRows = buttons as { text: string }[];
    expect(buttonRows.map((b) => b.text)).toEqual(["OK"]);
    expect(buttonRows.find((b) => b.text === "Approve now")).toBeUndefined();
  });
});

describe("Pending Reality review screen — 422 inline linter cards", () => {
  it("surfaces server-side LinterIssues on the affected Sequence rows when finalize returns linter_rejected", () => {
    // Stage a single cancel intent on appointment #5001 so we can
    // assert the inline card lands on it.
    seedStore([INTENTS[2]!]);
    const node = render(<PendingRealityReviewScreen />);
    fireEvent.press(node.getByTestId("review-finalize-btn"));

    const onSuccess = mockMutate.mock.calls[0]![1].onSuccess as (
      result: FinalizeReorganizationResult,
    ) => void;

    const serverIssue: LinterIssue = {
      severity: "error",
      kind: "time_conflict",
      affectedAppointmentIds: [5001],
      humanMessage: "Server-side: cancel collides with a route stop",
    };

    act(() => {
      onSuccess({ kind: "linter_rejected", issues: [serverIssue] });
    });

    // Active tab should auto-flip to Sequence so the user sees the
    // inline cards in the order the BE will process the session.
    expect(node.getByTestId("review-tab-sequence")).toBeTruthy();
    expect(
      node.getByText("Server-side: cancel collides with a route stop"),
    ).toBeTruthy();

    // Store is intentionally NOT cleared on a 422 — the user's draft
    // is still locally valid and they need to act on the issues.
    expect(usePendingRealityStore.getState().intents.length).toBe(1);
    expect(mockBack).not.toHaveBeenCalled();
  });

  // 2026-05-12 fix/finalize-linter-rejected-feedback regression — the
  // pre-fix linter_rejected branch silently updated state. The user
  // tapped Finalize, the BE rejected on N conflicts, the screen wrote
  // the SAME conflict cards back into the same (already-visible)
  // Sequence tab, and from the user's perspective "nothing happened."
  // The fix fires a non-blocking Alert that names the blocker.
  it("fires a visible 'Can't finalize' alert when the BE rejects with linter_rejected", () => {
    seedStore([INTENTS[2]!]);
    const node = render(<PendingRealityReviewScreen />);
    fireEvent.press(node.getByTestId("review-finalize-btn"));
    const onSuccess = mockMutate.mock.calls[0]![1].onSuccess as (
      result: FinalizeReorganizationResult,
    ) => void;

    const errorIssue: LinterIssue = {
      severity: "error",
      kind: "time_conflict",
      affectedAppointmentIds: [5001],
      humanMessage: "Server-side: cancel collides with a route stop",
    };
    const warningIssue: LinterIssue = {
      severity: "warning",
      kind: "drive_time_impossible",
      affectedAppointmentIds: [5001],
      humanMessage: "Server-side: tight drive window between stops.",
    };

    // Clear the spy's history so the assertion below only sees the
    // alert fired by THIS finalize result, not anything earlier in
    // setup.
    (Alert.alert as jest.Mock).mockClear();

    act(() => {
      onSuccess({
        kind: "linter_rejected",
        issues: [errorIssue, warningIssue],
      });
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [title, body, buttons] = (Alert.alert as jest.Mock).mock.calls[0]!;
    // Headline mentions error count (1) and warning count (1) so the
    // user knows the difference between "blocking" and "informational".
    expect(title).toContain("Can't finalize");
    expect(title).toContain("1 conflict");
    expect(title).toContain("warning");
    // Body points the user at the Sequence tab where the cards live.
    expect(body).toContain("Sequence tab");
    // Dismissible — a single OK button so the alert doesn't trap the user.
    const buttonRows = buttons as { text: string }[];
    expect(buttonRows.map((b) => b.text)).toEqual(["OK"]);
  });

  it("uses error-only copy when the linter_rejected response has no warnings", () => {
    seedStore([INTENTS[2]!]);
    const node = render(<PendingRealityReviewScreen />);
    fireEvent.press(node.getByTestId("review-finalize-btn"));
    const onSuccess = mockMutate.mock.calls[0]![1].onSuccess as (
      result: FinalizeReorganizationResult,
    ) => void;

    const issues: LinterIssue[] = [
      {
        severity: "error",
        kind: "time_conflict",
        affectedAppointmentIds: [5001],
        humanMessage: "first conflict",
      },
      {
        severity: "error",
        kind: "time_conflict",
        affectedAppointmentIds: [5002],
        humanMessage: "second conflict",
      },
      {
        severity: "error",
        kind: "drive_time_impossible",
        affectedAppointmentIds: [5003],
        humanMessage: "third conflict",
      },
    ];

    (Alert.alert as jest.Mock).mockClear();
    act(() => {
      onSuccess({ kind: "linter_rejected", issues });
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [title] = (Alert.alert as jest.Mock).mock.calls[0]!;
    expect(title).toBe("Can't finalize — 3 conflicts to resolve");
  });
});

// ──────────────────────────────────────────────────────────────────
// Cancel session CTA (PR #98 + 2026-05-08 fix/clear-must-stay-local)
// ──────────────────────────────────────────────────────────────────
//
// Originally the destructive button cleared `usePendingRealityStore`
// locally and dismissed (P3-FE-4). Once the rehydration polling
// shipped (PR #94, `useActiveReorganization()`), the BE was still
// seeing the session as `draft`, so the next /reorganizations/mine/
// active refetch re-seeded every cancelled intent into the store
// seconds later. PR #98 wired the BE cancel mutation before the
// local clear, with `useCancelReorganizationSession.onSuccess`
// calling `clear()` and writing `null` to the active-session cache.
//
// That auto-coordination created a NEW race: an in-flight cancel
// mutation completing AFTER the user had staged a fresh session
// would wipe the new session. fix/clear-must-stay-local moved the
// local-state cleanup back into the user-initiated handler, gated
// on "the cancelled session is still the active one." The hook is
// now a pure network primitive. See PLAN-DEVIATIONS.md
// #2026-05-08-cancel-hook-no-auto-coord.

describe("Pending Reality review screen — Cancel session CTA", () => {
  /**
   * Drive the destructive Alert button. The screen hands an array
   * of `{ text, onPress, style }` to `Alert.alert`; the
   * `style: "destructive"` button is the one we want to fire.
   */
  function pressDestructiveAlertButton() {
    const lastCall = (Alert.alert as jest.Mock).mock.calls.at(-1)!;
    const buttons = lastCall[2] as {
      text: string;
      style?: string;
      onPress?: () => void;
    }[];
    const destructive = buttons.find((b) => b.style === "destructive");
    expect(destructive).toBeTruthy();
    act(() => {
      destructive!.onPress?.();
    });
  }

  it("uses the server-side copy ('will be cancelled', not 'discarded locally')", () => {
    seedStore([INTENTS[2]!]);
    const node = render(<PendingRealityReviewScreen />);
    fireEvent.press(node.getByTestId("review-cancel-btn"));

    const [title, body] = (Alert.alert as jest.Mock).mock.calls.at(-1)!;
    expect(title).toBe("Cancel this session?");
    // The copy must reflect the BE round-trip.
    expect(body).toMatch(/will be cancelled/i);
    // Anti-regression: the misleading old phrasing must be gone.
    expect(body).not.toMatch(/discarded locally/i);
  });

  it("fires the cancel mutation with the active session id when the user confirms", () => {
    seedStore([INTENTS[2]!]);
    const node = render(<PendingRealityReviewScreen />);
    fireEvent.press(node.getByTestId("review-cancel-btn"));
    pressDestructiveAlertButton();

    expect(mockCancelMutate).toHaveBeenCalledTimes(1);
    const [variables] = mockCancelMutate.mock.calls[0]!;
    expect(variables).toEqual({ sessionId: SESSION.id });
    // Local store must NOT be cleared synchronously — the per-call
    // `onSuccess` (driven below) does the conditional clear, AFTER
    // the BE confirms.
    expect(usePendingRealityStore.getState().sessionId).toBe(SESSION.id);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("clears local state + writes null cache + dismisses on cancel mutation success", () => {
    seedStore([INTENTS[2]!]);
    const node = render(<PendingRealityReviewScreen />);
    fireEvent.press(node.getByTestId("review-cancel-btn"));
    pressDestructiveAlertButton();

    // The handler-attached `onSuccess` is the only path that clears
    // local state and writes the cache to null — the hook itself no
    // longer auto-coordinates (PLAN-DEVIATION 2026-05-08-cancel-hook-
    // no-auto-coord).
    const [, options] = mockCancelMutate.mock.calls[0]!;
    act(() => {
      (options.onSuccess as () => void)();
    });

    expect(usePendingRealityStore.getState().intents).toEqual([]);
    expect(usePendingRealityStore.getState().sessionId).toBeNull();
    expect(mockCacheReorganizationResult).toHaveBeenCalledTimes(1);
    const cacheArgs = mockCacheReorganizationResult.mock.calls[0]!;
    // (queryClient, franchiseId, null)
    expect(cacheArgs[1]).toBe(MOCK_FRANCHISE_ID);
    expect(cacheArgs[2]).toBeNull();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  // 2026-05-08 fix/clear-must-stay-local: regression guard for the
  // race the user reported — every newly-staged appointment auto-
  // cancelled itself ~1s after the ghost landed because a stale in-
  // flight cancel mutation's onSuccess was wiping the new session.
  // The handler now gates the clear on the cancelled session id
  // still matching the live store; if the user has already staged a
  // fresh session by the time a stale cancel resolves, the clear is
  // a no-op.
  it("does NOT clear local state when a stale cancel mutation resolves after a fresh stage", () => {
    seedStore([INTENTS[2]!]);
    const node = render(<PendingRealityReviewScreen />);
    fireEvent.press(node.getByTestId("review-cancel-btn"));
    pressDestructiveAlertButton();

    // Simulate the user staging a fresh session in between firing
    // the cancel mutation and the BE responding. The new session id
    // differs from the cancelled one captured in the handler.
    const FRESH_SESSION_ID = SESSION.id + 100;
    act(() => {
      usePendingRealityStore.getState().setSession(
        { ...SESSION, id: FRESH_SESSION_ID },
        [INTENTS[0]!],
      );
    });

    // Now the stale cancel completes.
    const [, options] = mockCancelMutate.mock.calls[0]!;
    act(() => {
      (options.onSuccess as () => void)();
    });

    // The fresh session must survive: the handler saw that the live
    // sessionId no longer matches the captured `cancelledSessionId`
    // and skipped the clear + cache-null write.
    expect(usePendingRealityStore.getState().sessionId).toBe(FRESH_SESSION_ID);
    expect(usePendingRealityStore.getState().intents.length).toBe(1);
    expect(mockCacheReorganizationResult).not.toHaveBeenCalled();
    // The screen still dismisses (the user navigated to the cancel
    // alert; landing back on the calendar is the right outcome).
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("keeps local state intact and surfaces a retry alert on cancel mutation failure", () => {
    seedStore([INTENTS[2]!]);
    const node = render(<PendingRealityReviewScreen />);
    fireEvent.press(node.getByTestId("review-cancel-btn"));
    pressDestructiveAlertButton();

    const [, options] = mockCancelMutate.mock.calls[0]!;
    act(() => {
      (options.onError as (err: Error) => void)(new Error("boom"));
    });

    // Store stays seeded — the user can retry without losing intents.
    expect(usePendingRealityStore.getState().sessionId).toBe(SESSION.id);
    expect(usePendingRealityStore.getState().intents.length).toBe(1);
    expect(mockCacheReorganizationResult).not.toHaveBeenCalled();
    // No navigation away so the user can act on the retry alert.
    expect(mockBack).not.toHaveBeenCalled();

    // A retry alert is raised (the second Alert.alert call after the
    // confirmation alert that opened the flow).
    const allCalls = (Alert.alert as jest.Mock).mock.calls;
    const errorAlert = allCalls.at(-1)!;
    expect(errorAlert[0]).toBe("Couldn't cancel session");
    expect(errorAlert[1]).toMatch(/try again/i);
  });

  it("renders the disabled 'Cancelling…' label while the mutation is pending", () => {
    mockCancelIsPending = true;
    seedStore([INTENTS[2]!]);
    const node = render(<PendingRealityReviewScreen />);
    const btn = node.getByTestId("review-cancel-btn");
    expect(btn.props.accessibilityState?.disabled).toBe(true);
    expect(node.getByText("Cancelling…")).toBeTruthy();
  });
});

// ──────────────────────────────────────────────────────────────────
// LinterEdgeCard "Apply auto-fix" wiring (P3-FE-9)
// ──────────────────────────────────────────────────────────────────

describe("Pending Reality review screen — Apply auto-fix CTA", () => {
  /**
   * Build a `time_conflict` issue with an auto-fix payload that
   * targets one of the seeded reschedule intents. The screen's
   * `issuesForIntent` filter matches by overlapping
   * `affectedAppointmentIds` ↔ `appointment_id`, so pinning the
   * issue to appointment #5002 lands it under intent 140
   * (the no-tech-change reschedule) on the Sequence tab.
   */
  function makeAutoFixIssue(): LinterIssue {
    return {
      severity: "error",
      kind: "time_conflict",
      affectedAppointmentIds: [5002],
      humanMessage:
        "Reschedule of #5002 to 09:00 conflicts with #5004's 09:30 start.",
      suggestedAutoFix: {
        kind: "reschedule",
        new_scheduled_date: "2026-04-24",
        new_start_time: "11:00",
        new_end_time: "12:00",
      },
    };
  }

  it("forwards the click on LinterEdgeCard's CTA to useApplyAutoFix.mutate with the right payload", () => {
    seedStore([INTENTS[3]!]); // single reschedule intent on appt 5002 (id 140)
    // Seed a local linter issue against the same appointment so the
    // card renders inline beneath the intent.
    act(() => {
      usePendingRealityStore.setState({ linterIssues: [makeAutoFixIssue()] });
    });

    const node = render(<PendingRealityReviewScreen />);
    // Sequence tab so the auto-fix CTA renders (Final tab also
    // forwards it now, but Sequence is the canonical surface).
    // PR-UX-5 (2026-05-08): Sequence is the default tab and is
    // mounted directly; no segmented-control button to press.

    const ctaButton = node.getByTestId(
      "linter-edge-card-autofix-time_conflict",
    );
    fireEvent.press(ctaButton);

    expect(mockApplyAutoFixMutate).toHaveBeenCalledTimes(1);
    const [variables, options] = mockApplyAutoFixMutate.mock.calls[0]!;
    expect(variables).toMatchObject({
      sessionId: 7001,
      intentId: 140,
      intent: {
        kind: "reschedule",
        new_scheduled_date: "2026-04-24",
        new_start_time: "11:00",
        new_end_time: "12:00",
      },
    });
    // World snapshot is the placeholder until P3-FE-7 wires real
    // data through. Asserting its shape pins the contract so a
    // future refactor that drops the field fails loud.
    expect(variables.worldSnapshot).toEqual({
      appointments: [],
      routes: [],
      customerSlas: [],
      fleet: { accounts: [] },
    });
    // Caller passes an `onError` handler so the rejected-error path
    // gets a custom toast/inline-cards branch instead of the
    // mutation's default rethrow.
    expect(typeof options?.onError).toBe("function");
  });

  // 2026-05-12 fix/auto-fix-payload-target-id regression — the BE
  // `intentPayloadSchema` requires `appointment_id` inside the intent
  // payload for `reschedule` / `reassign` / `cancel` kinds and
  // `personal_event_id` for `personal_event_update` / `personal_event_delete`.
  // The linter's `suggestedAutoFix` produces a TS-shape payload that
  // doesn't carry that field (it's a wire-only stitching). Before this
  // fix, the wire payload omitted both fields and the BE rejected with
  // `HTTP 422 — intent.appointment_id: Required`. The screen now reads
  // the target id off the originating intent and stitches it in.
  it("stitches appointment_id from the source intent onto the wire payload (BE schema contract)", () => {
    seedStore([INTENTS[3]!]); // reschedule intent #140, appointment_id 5002
    act(() => {
      usePendingRealityStore.setState({ linterIssues: [makeAutoFixIssue()] });
    });

    const node = render(<PendingRealityReviewScreen />);
    fireEvent.press(
      node.getByTestId("linter-edge-card-autofix-time_conflict"),
    );

    expect(mockApplyAutoFixMutate).toHaveBeenCalledTimes(1);
    const [variables] = mockApplyAutoFixMutate.mock.calls[0]!;
    // Exact-equal the intent payload so a future refactor that drops
    // the stitching fails loud here, not only at the wire/BE boundary.
    expect(variables.intent).toEqual({
      kind: "reschedule",
      appointment_id: 5002,
      new_scheduled_date: "2026-04-24",
      new_start_time: "11:00",
      new_end_time: "12:00",
    });
  });

  // NOTE: there is intentionally no test here for `personal_event_id`
  // stitching even though the production code has a branch for it.
  // `issuesForIntent` short-circuits when `intent.appointment_id == null`
  // (review.tsx ~line 299), and §4.7 PE linter rules haven't shipped
  // yet (logistics-linter.ts does not produce PE-target issues today).
  // The `personal_event_id` branch in `handleApplyAutoFix` exists as
  // defensive scaffolding for when those rules land; until they do,
  // there's no reachable path through the screen to exercise it. Add a
  // test here in the same PR as the §4.7 PE-rule work.
  

  it("removes the resolved local issue when the hook updates the store on success", () => {
    seedStore([INTENTS[3]!]);
    act(() => {
      usePendingRealityStore.setState({ linterIssues: [makeAutoFixIssue()] });
    });

    const node = render(<PendingRealityReviewScreen />);
    // PR-UX-5 (2026-05-08): Sequence is the default tab and is
    // mounted directly; no segmented-control button to press.
    fireEvent.press(
      node.getByTestId("linter-edge-card-autofix-time_conflict"),
    );

    // Card is on-screen before the mutation resolves.
    expect(
      node.queryByText(
        "Reschedule of #5002 to 09:00 conflicts with #5004's 09:30 start.",
      ),
    ).toBeTruthy();

    // Drive what the real hook does on success: refresh the store
    // (clearing linterIssues per `setSession`'s two-arg overload)
    // and then re-run the linter to write a fresh (empty) result.
    act(() => {
      usePendingRealityStore.setState({ linterIssues: [] });
    });

    expect(
      node.queryByText(
        "Reschedule of #5002 to 09:00 conflicts with #5004's 09:30 start.",
      ),
    ).toBeNull();
  });

  it("renders the rejected issues inline when the mutation onError fires with ApplyAutoFixRejectedError", () => {
    seedStore([INTENTS[3]!]);
    act(() => {
      usePendingRealityStore.setState({ linterIssues: [makeAutoFixIssue()] });
    });

    const node = render(<PendingRealityReviewScreen />);
    // PR-UX-5 (2026-05-08): Sequence is the default tab and is
    // mounted directly; no segmented-control button to press.
    fireEvent.press(
      node.getByTestId("linter-edge-card-autofix-time_conflict"),
    );

    const onError = mockApplyAutoFixMutate.mock.calls[0]![1]
      .onError as (err: Error) => void;

    const rejectedIssue: LinterIssue = {
      severity: "error",
      kind: "drive_time_impossible",
      affectedAppointmentIds: [5002],
      humanMessage:
        "Server: auto-fix would put back-to-back stops 90 min apart with 100 min drive.",
    };

    const RejectedError = getMockedApplyAutoFixRejectedError();
    act(() => {
      onError(new RejectedError([rejectedIssue]));
    });

    expect(
      node.getByText(
        "Server: auto-fix would put back-to-back stops 90 min apart with 100 min drive.",
      ),
    ).toBeTruthy();
    // Active tab is forced to Sequence so the dispatcher sees the
    // freshly-rejected issue inline against the affected intent.
    expect(node.getByTestId("review-tab-sequence")).toBeTruthy();
  });
});

// ──────────────────────────────────────────────────────────────────
// P3-FE-8 (C.12) — focusAppointmentId deeplink handling
// ──────────────────────────────────────────────────────────────────

describe("Pending Reality review screen — focusAppointmentId", () => {
  it("renders the matching IntentCard when a focusAppointmentId is provided", () => {
    seedStore();
    mockSearchParams = { focusAppointmentId: "5002" };

    const node = render(<PendingRealityReviewScreen />);
    // Final tab is the default; the IntentCard for #5002 (id=140) is
    // present whether or not the focus highlight has rendered yet.
    expect(node.getByTestId("intent-card-140")).toBeTruthy();
  });

  it("no-ops silently when focusAppointmentId does not match any intent", () => {
    seedStore();
    mockSearchParams = { focusAppointmentId: "99999" };

    expect(() => render(<PendingRealityReviewScreen />)).not.toThrow();
  });

  it("no-ops silently when no focusAppointmentId param is provided", () => {
    seedStore();
    mockSearchParams = {};

    expect(() => render(<PendingRealityReviewScreen />)).not.toThrow();
  });

  it("ignores malformed (non-numeric) focusAppointmentId", () => {
    seedStore();
    mockSearchParams = { focusAppointmentId: "not-a-number" };

    expect(() => render(<PendingRealityReviewScreen />)).not.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────
// P7-FE-1 — AI tab + FO actions
// ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line import/first
import type { ReorganizationApiSession } from "@technician/hooks/schedule/use-reorganization";

function makeAiSession(
  overrides: Partial<ReorganizationApiSession> = {},
): ReorganizationApiSession {
  return {
    id: 9001,
    franchise_id: SESSION.franchise_id,
    author_user_id: null,
    status: "pending_review",
    source: "ai_suggestion",
    cancellation_reason: null,
    auto_committed: false,
    policy_snapshot: SESSION.policy_snapshot,
    idempotency_key: null,
    notes: "Tech 5 has back-to-back drive across town; suggest swap with Tech 7.",
    template_id: null,
    related_session_id: null,
    source_metadata: {},
    created_at: "2026-04-23T15:00:00.000Z",
    finalized_at: "2026-04-23T15:00:00.000Z",
    committed_at: null,
    cancelled_at: null,
    expires_at: "2026-04-24T15:00:00.000Z",
    intents: [INTENTS[2]!, INTENTS[3]!],
    ...overrides,
  } as ReorganizationApiSession;
}

describe("Pending Reality review screen — AI tab visibility", () => {
  it("does not render the AI tab for technician users", () => {
    mockAuthRole = "technician";
    mockAiSessions = [makeAiSession()];
    seedStore([INTENTS[2]!]);

    const node = render(<PendingRealityReviewScreen />);
    expect(node.queryByTestId("review-tab-btn-ai")).toBeNull();
  });

  it("renders the AI tab for franchise owners when they have an active draft", () => {
    mockAuthRole = "franchise_owner";
    mockAiSessions = [makeAiSession()];
    seedStore([INTENTS[2]!]);

    const node = render(<PendingRealityReviewScreen />);
    expect(node.getByTestId("review-tab-btn-ai")).toBeTruthy();
    // PR-UX-5 (2026-05-08): Final state tab cut. With AI tab
    // available, FO sees Sequence + AI buttons.
    expect(node.queryByTestId("review-tab-btn-final")).toBeNull();
    expect(node.getByTestId("review-tab-btn-sequence")).toBeTruthy();
    // Badge count reflects pending AI suggestions.
    expect(node.getByTestId("review-tab-ai-badge")).toBeTruthy();
  });

  it("falls back to the AI tab when an FO has suggestions but no own draft", () => {
    mockAuthRole = "franchise_owner";
    mockAiSessions = [makeAiSession()];
    // Empty store on purpose — no own intents; only AI work to act on.

    const node = render(<PendingRealityReviewScreen />);
    expect(node.queryByTestId("review-empty-state")).toBeNull();
    expect(node.getByTestId("review-tab-btn-ai")).toBeTruthy();
    expect(node.queryByTestId("review-tab-btn-final")).toBeNull();
    // PR-UX-5 (2026-05-08): with no own draft the Sequence button
    // is also absent (no intents to sequence) — only the AI tab
    // shows.
    expect(node.queryByTestId("review-tab-btn-sequence")).toBeNull();
    // Action bar (Finalize/Cancel) is hidden when there's no own draft.
    expect(node.queryByTestId("review-action-bar")).toBeNull();
  });

  it("renders the empty state when neither own draft nor AI suggestions exist (FO)", () => {
    mockAuthRole = "franchise_owner";
    mockAiSessions = [];

    const node = render(<PendingRealityReviewScreen />);
    expect(node.getByTestId("review-empty-state")).toBeTruthy();
  });

  // PR-UX-17 (2026-05-09): the AI tab is now demo-gated. With
  // `Config.DEMO_MODE === false` (production default), the tab MUST
  // NOT render even for franchise_owner users — the AI-suggestion
  // surface is a demo-only artifact and the tab is its sole consumer.
  it("does NOT render the AI tab for an FO when DEMO_MODE is false (PR-UX-17)", () => {
    mockAuthRole = "franchise_owner";
    mockDemoMode = false;
    // Even if the BE were to seed AI sessions (which it shouldn't in
    // prod), the tab gate cuts them off at the FE before any visible
    // surface is mounted.
    mockAiSessions = [makeAiSession()];
    seedStore([INTENTS[2]!]);

    const node = render(<PendingRealityReviewScreen />);
    expect(node.queryByTestId("review-tab-btn-ai")).toBeNull();
    expect(node.queryByTestId("review-tab-ai-badge")).toBeNull();
    // With AI tab hidden and the FO's own draft present, only the
    // Sequence body renders. The single-tab strip collapses (tab bar
    // is rendered but the Sequence button is also hidden when AI is
    // unavailable — see below).
    expect(node.queryByTestId("review-tab-btn-sequence")).toBeNull();
  });

  // PR-UX-17 (2026-05-09): an FO with no own draft and no demo mode
  // lands on the empty state — there's no "AI-only" mode in production
  // because the AI tab itself is hidden.
  it("renders the empty state for an FO with no draft when DEMO_MODE is false (PR-UX-17)", () => {
    mockAuthRole = "franchise_owner";
    mockDemoMode = false;
    mockAiSessions = [makeAiSession()];

    const node = render(<PendingRealityReviewScreen />);
    expect(node.getByTestId("review-empty-state")).toBeTruthy();
    expect(node.queryByTestId("review-tab-btn-ai")).toBeNull();
  });
});

describe("Pending Reality review screen — AI tab actions", () => {
  it("approve fires the authorize mutation with the session id (after Alert OK)", () => {
    mockAuthRole = "franchise_owner";
    mockAiSessions = [makeAiSession({ id: 9100 })];

    const node = render(<PendingRealityReviewScreen />);
    fireEvent.press(node.getByTestId("ai-suggestion-approve-9100"));

    // Approve goes through a confirm Alert; tap "Approve" on it.
    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls.at(-1)!;
    const approveBtn = (
      buttons as { text: string; onPress?: () => void }[]
    ).find((b) => b.text === "Approve");
    act(() => {
      approveBtn?.onPress?.();
    });

    expect(mockAuthorizeMutate).toHaveBeenCalledTimes(1);
    expect(mockAuthorizeMutate.mock.calls[0]![0]).toEqual({ sessionId: 9100 });
  });

  it("decline opens the picker, then fires deny with the structured reason", async () => {
    mockAuthRole = "franchise_owner";
    mockAiSessions = [makeAiSession({ id: 9200 })];

    const node = render(<PendingRealityReviewScreen />);
    fireEvent.press(node.getByTestId("ai-suggestion-decline-9200"));

    // Pick a non-default option to force the form to recompute validity
    // (RHF's `mode: "onChange"` only computes `isValid` after a change),
    // then settle to a known valid kind before submitting.
    await act(async () => {
      fireEvent.press(node.getByTestId("decline-reason-option-wrong_technician"));
    });
    await act(async () => {
      fireEvent.press(node.getByTestId("decline-reason-submit"));
    });

    expect(mockDenyMutate).toHaveBeenCalledTimes(1);
    expect(mockDenyMutate.mock.calls[0]![0]).toMatchObject({
      sessionId: 9200,
      declineReasonKind: "wrong_technician",
    });
  });

  // PR 4 (item E, 2026-04-24): the placeholder Alert was replaced
  // with an inline `<CounterProposeSheet>`. Tapping the AI card's
  // "Counter-propose" button now mounts the sheet (visible via its
  // root testID) instead of dispatching `Alert.alert`.
  it("counter-propose opens the inline sheet", () => {
    mockAuthRole = "franchise_owner";
    mockAiSessions = [makeAiSession({ id: 9300 })];

    const node = render(<PendingRealityReviewScreen />);
    fireEvent.press(node.getByTestId("ai-suggestion-counter-9300"));

    expect(node.getByTestId("counter-propose-sheet")).toBeTruthy();
  });
});

// PR-UX-2 PASS 2.15 (2026-05-05): regression guard for the
// "ghosts target Dan, calendar shows Josh, every projected rect
// returns null" symptom. The cascade-seed harvest used to pick
// the globally-busiest tech regardless of which workweek tech the
// user was viewing — when that tech wasn't in the workweek's
// single-resource view, every source/dest rect projected to null
// and the overlay rendered zero arrows. Now the harvest takes a
// `preferredTechId` and uses it as long as that tech has at least
// 2 future appts (the minimum needed for a cascade chain).
//
// We test the pure helper directly rather than rendering the
// review screen + mocking `useCalendarStore` — the contract that
// matters is "given week data + a preferred tech, the busiest-of-
// preferred-tech wins over the busiest-overall when the preference
// has ≥2 future appts". The wiring up to `useCalendarStore` and
// the click-time `getState()` re-read are mechanical above this
// helper.
describe("deriveWeekApptMetaForChain — workweek tech preference (PASS 2.15)", () => {
  // Imported here (not at top of file) so the test stays scoped to
  // the new behavior — the rest of the file mounts the screen and
  // would pull a much wider surface.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- keep this scoped to this describe block, see comment above
  const { deriveWeekApptMetaForChain } = require("@/app/pending-reality/review") as typeof import("@/app/pending-reality/review");
  type CalendarDayResponse =
    import("@technician/types/calendar").CalendarDayResponse;

  const TODAY = "2026-05-05";

  // Build a minimal-but-valid `CalendarDayResponse[]` with two
  // techs:
  //   - 2054 ("Josh")  — 3 future appts (preferred)
  //   - 2071 ("Dan")   — 6 future appts (busiest globally)
  function buildTwoTechWeek(): CalendarDayResponse[] {
    const apptOn = (
      id: number,
      techId: number,
      date: string,
      start: string,
      end: string,
    ) => ({
      id,
      customer_id: 9000 + id,
      technician_id: techId,
      franchise_id: 1,
      fleet_account_id: null as number | null,
      status: "scheduled" as const,
      scheduled_date: date,
      scheduled_time: `${start}:00`,
      scheduled_end_time: `${end}:00`,
    });
    const techDay = (
      techId: number,
      date: string,
      appts: ReturnType<typeof apptOn>[],
    ) => ({
      technician_id: techId,
      technician_name: techId === 2054 ? "Josh" : "Dan",
      appointments: appts,
      personal_events: [],
    });
    return [
      {
        date: "2026-05-05",
        technicians: [
          techDay(2054, "2026-05-05", [
            apptOn(101, 2054, "2026-05-05", "09:00", "10:00"),
            apptOn(102, 2054, "2026-05-05", "11:00", "12:00"),
          ]),
          techDay(2071, "2026-05-05", [
            apptOn(201, 2071, "2026-05-05", "08:00", "09:00"),
            apptOn(202, 2071, "2026-05-05", "10:00", "11:00"),
            apptOn(203, 2071, "2026-05-05", "13:00", "14:00"),
          ]),
        ],
      },
      {
        date: "2026-05-06",
        technicians: [
          techDay(2054, "2026-05-06", [
            apptOn(103, 2054, "2026-05-06", "09:00", "10:00"),
          ]),
          techDay(2071, "2026-05-06", [
            apptOn(204, 2071, "2026-05-06", "08:00", "09:00"),
            apptOn(205, 2071, "2026-05-06", "10:00", "11:00"),
            apptOn(206, 2071, "2026-05-06", "13:00", "14:00"),
          ]),
        ],
      },
    ] as unknown as CalendarDayResponse[];
  }

  it("uses the preferred (workweek-visible) tech when it has ≥2 future appts", () => {
    const sources = deriveWeekApptMetaForChain(buildTwoTechWeek(), TODAY, 2054);
    // Josh (2054) has 3 future appts — well over the ≥2 threshold —
    // so the busiest-overall (Dan / 2071) should NOT win.
    expect(sources.length).toBe(3);
    expect(new Set(sources.map((m) => m.techId))).toEqual(new Set([2054]));
    expect(sources.map((m) => m.id).sort((a, b) => a - b)).toEqual([
      101, 102, 103,
    ]);
  });

  it("falls back to the busiest tech when no preferred tech is supplied", () => {
    const sources = deriveWeekApptMetaForChain(buildTwoTechWeek(), TODAY, null);
    // No preference → busiest tech (Dan / 2071, 6 appts) wins.
    expect(new Set(sources.map((m) => m.techId))).toEqual(new Set([2071]));
    expect(sources.length).toBe(6);
  });

  it("falls back to the busiest tech when the preferred tech has < 2 future appts", () => {
    // Trim Josh down to 1 future appt — the harvest should fall back
    // to Dan rather than seeding an unbuildable 1-step "cascade".
    const week = buildTwoTechWeek();
    week[0].technicians[0].appointments = [
      week[0].technicians[0].appointments[0]!,
    ];
    week[1].technicians[0].appointments = [];
    const sources = deriveWeekApptMetaForChain(week, TODAY, 2054);
    expect(new Set(sources.map((m) => m.techId))).toEqual(new Set([2071]));
  });
});

// PR-UX-2 PASS 2.16 (2026-05-05): regression guard for the
// "terminator destination off-screen → last arrow is a horizontal
// stub to the canvas edge" symptom. The PASS 2.13 fix had relocated
// the terminator to `latest-source-date + 14d at 23:00–23:30`, which
// was a correct fix for the cycle-protection contract but wrong for
// the "user expects to see the chain on the screen they're looking
// at" contract. PASS 2.16 picks an in-window late-evening slot
// instead. This block tests the new picker + the integrated
// `makeDevCascadeChain` output end-to-end (including a final
// detector-pipeline assertion that the seed STILL collapses to a
// single connected chain).
describe("makeDevCascadeChain — in-window terminator (PASS 2.16)", () => {
  // Same `require()` pattern as the PASS 2.15 block above so we can
  // pull the now-`export`ed helpers out of the screen module without
  // re-importing the whole component.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- scoped to this describe block, keeps the rest of the file's mounted-component infra out of the new tests
  const reviewModule = require("@/app/pending-reality/review") as typeof import("@/app/pending-reality/review");
  const { makeDevCascadeChain, pickInWindowTerminatorSlot } = reviewModule;

  // Realistic 4-day workweek window (May 4–7) with 6 sources for
  // tech 2054 spread across the first two days, mirroring the
  // on-device repro from the user's PASS 2.15 follow-up logs.
  const WINDOW = ["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07"];
  const TECH = 2054;
  const sources = [
    { id: 101, date: "2026-05-04", techId: TECH, start: "07:25", end: "07:50" },
    { id: 102, date: "2026-05-04", techId: TECH, start: "10:30", end: "11:30" },
    { id: 103, date: "2026-05-04", techId: TECH, start: "14:00", end: "15:00" },
    { id: 104, date: "2026-05-05", techId: TECH, start: "06:00", end: "06:30" },
    { id: 105, date: "2026-05-05", techId: TECH, start: "09:00", end: "10:00" },
    { id: 106, date: "2026-05-05", techId: TECH, start: "13:35", end: "14:05" },
  ];

  describe("pickInWindowTerminatorSlot (pure)", () => {
    it("places the terminator on the day with the most chain-cluster destinations on the terminator's tech, in working hours", () => {
      // PASS 2.19 supersedes the PASS 2.16 "always last in-window
      // day at 22:00" placement. With the original sources (3 on
      // May 4, 3 on May 5, all tech 2054), the chain destinations
      // on tech 2054 cluster on 2026-05-05 (3 of the 5 dests). The
      // picker should anchor to that day, not the latest available.
      const slot = pickInWindowTerminatorSlot(WINDOW, sources);
      expect(slot).not.toBeNull();
      expect(slot!.date).toBe("2026-05-05");
      // Cluster on May 5 ends at 14:05 → afterCluster slot snaps to
      // 14:30. Working-hours band is [07:00, 20:00] → fits → no
      // fallback.
      expect(slot!.start).toBe("14:30");
      expect(slot!.end).toBe("15:00");
      expect(slot!.fallback).toBe(false);
    });

    it("never picks a date before the latest source (past-protection)", () => {
      // Sources end on 2026-05-05; window only contains 2026-05-04
      // (i.e. PAST relative to the latest source). The picker must
      // refuse rather than violate the past-move guard. PASS 2.19
      // preserves this contract — past-protection is the first
      // filter, before cluster ordering or working-hours search.
      const slot = pickInWindowTerminatorSlot(["2026-05-04"], sources);
      expect(slot).toBeNull();
    });

    it("falls back to the 22:00–23:30 band with `fallback: true` when working hours are completely packed on the cluster day", () => {
      // PASS 2.19 fallback path: pack the cluster day with a wall
      // of 30-min destinations from 07:00 through 20:00 so every
      // working-hours slot collides. The picker must walk down to
      // the legacy 22:00 fallback band, on the SAME cluster day,
      // and flag `fallback: true` so the caller can warn the user.
      const PACKED_DAY = "2026-05-05";
      const packed: typeof sources = [];
      // Need >= 2 sources for a chain. Source 0 (the chain's first
      // source) doesn't show up as a chain destination — but every
      // OTHER source does, AND every source is also a collision
      // blocker, so packing the day with sources [1..N-1] is enough.
      // 26 thirty-min slots cover 07:00 through 20:00.
      for (let i = 0; i < 27; i++) {
        const startMin = 7 * 60 + i * 30;
        const hh = String(Math.floor(startMin / 60)).padStart(2, "0");
        const mm = String(startMin % 60).padStart(2, "0");
        const startStr = `${hh}:${mm}`;
        const endTotal = startMin + 30;
        const eh = String(Math.floor(endTotal / 60)).padStart(2, "0");
        const em = String(endTotal % 60).padStart(2, "0");
        packed.push({
          id: 300 + i,
          date: PACKED_DAY,
          techId: TECH,
          start: startStr,
          end: `${eh}:${em}`,
        });
      }
      const slot = pickInWindowTerminatorSlot([PACKED_DAY], packed);
      expect(slot).not.toBeNull();
      expect(slot!.date).toBe(PACKED_DAY);
      expect(slot!.start).toBe("22:00");
      expect(slot!.end).toBe("22:30");
      expect(slot!.fallback).toBe(true);
    });

    it("returns null when the only candidate day is so packed that even the 22:00–23:30 fallback band collides", () => {
      // Pack working hours AND the fallback band on the only
      // candidate day. Past-protection forbids walking back. Every
      // strategy is exhausted → null. The integrated
      // `makeDevCascadeChain` then uses its own last-ditch fallback
      // (covered below).
      const PACKED_DAY = "2026-05-05";
      const packed: typeof sources = [];
      // 07:00 through 23:30 = 33 thirty-min slots.
      for (let i = 0; i < 33; i++) {
        const startMin = 7 * 60 + i * 30;
        const hh = String(Math.floor(startMin / 60)).padStart(2, "0");
        const mm = String(startMin % 60).padStart(2, "0");
        const startStr = `${hh}:${mm}`;
        const endTotal = startMin + 30;
        const eh = String(Math.floor(endTotal / 60)).padStart(2, "0");
        const em = String(endTotal % 60).padStart(2, "0");
        packed.push({
          id: 400 + i,
          date: PACKED_DAY,
          techId: TECH,
          start: startStr,
          end: `${eh}:${em}`,
        });
      }
      const slot = pickInWindowTerminatorSlot([PACKED_DAY], packed);
      expect(slot).toBeNull();
    });
  });

  describe("makeDevCascadeChain (integrated)", () => {
    it("plants the terminator INSIDE the visible workweek window for the viewed tech", () => {
      const intents = makeDevCascadeChain(0, sources, WINDOW);
      expect(intents).toHaveLength(6);
      const last = intents[intents.length - 1]!;
      expect(last.payload.kind).toBe("reschedule");
      const lastPayload = last.payload as {
        kind: "reschedule";
        new_scheduled_date: string;
        new_start_time: string;
        new_end_time: string;
        new_technician_id: number | null;
      };
      // Terminator date MUST be one of the in-window day keys.
      expect(WINDOW).toContain(lastPayload.new_scheduled_date);
      // And on the chain's tech (matches sources[5].techId).
      expect(lastPayload.new_technician_id).toBe(TECH);
    });

    it("plants a terminator that doesn't collide with any other intent's source OR destination on the same day/tech", () => {
      const intents = makeDevCascadeChain(0, sources, WINDOW);
      const last = intents[intents.length - 1]!;
      const lastPayload = last.payload as {
        kind: "reschedule";
        new_scheduled_date: string;
        new_start_time: string;
        new_end_time: string;
      };
      const tStart = parseInt(lastPayload.new_start_time.replace(":", ""), 10);
      const tEnd = parseInt(lastPayload.new_end_time.replace(":", ""), 10);
      // Other intents' destinations are sources[1..N-1]; their
      // sources are sources[0..N-2]. Walk the harvested sources on
      // the same date/tech and assert no overlap.
      for (const s of sources) {
        if (s.date !== lastPayload.new_scheduled_date) continue;
        if (s.techId !== TECH) continue;
        const sStart = parseInt(s.start.replace(":", ""), 10);
        const sEnd = parseInt(s.end.replace(":", ""), 10);
        // No overlap rule: tStart >= sEnd OR tEnd <= sStart.
        const overlaps = tStart < sEnd && sStart < tEnd;
        expect(overlaps).toBe(false);
      }
    });

    it("still produces a single connected chain through detectMoveChains", () => {
      // Mirrors the PASS 2.14 detector test: feed the seeded
      // intents + reverse-engineered LinterAppointments into the
      // detector and assert ONE chain with all six ids.
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- scoped local import
      const { detectMoveChains } = require("@technician/utils/detect-move-chains") as typeof import("@technician/utils/detect-move-chains");
      const intents = makeDevCascadeChain(0, sources, WINDOW);
      const linterAppts = sources.map((s) => ({
        id: s.id,
        customer_id: 9000 + s.id,
        technician_id: s.techId,
        franchise_id: 1,
        fleet_company_id: null,
        status: "scheduled",
        scheduled_date: s.date,
        scheduled_start_time: s.start,
        scheduled_end_time: s.end,
        recurrence_series_id: null,
      }));
      const graph = detectMoveChains(intents, linterAppts);
      expect(graph.chains).toHaveLength(1);
      expect(graph.chains[0].intentIds).toEqual([
        99200, 99201, 99202, 99203, 99204, 99205,
      ]);
    });

    it("falls back to latest-source-date 22:30–23:00 when no in-window day fits", () => {
      // Empty `weekDayKeys` → picker returns null → fallback fires.
      const intents = makeDevCascadeChain(0, sources, []);
      const last = intents[intents.length - 1]!;
      const lastPayload = last.payload as {
        kind: "reschedule";
        new_scheduled_date: string;
        new_start_time: string;
        new_end_time: string;
      };
      expect(lastPayload.new_scheduled_date).toBe("2026-05-05"); // latest source date
      expect(lastPayload.new_start_time).toBe("22:30");
      expect(lastPayload.new_end_time).toBe("23:00");
    });
  });
});

// PR-UX-2 PASS 2.17 (2026-05-05): regression guard for the
// "terminator off-screen → horizontal stub to canvas edge" symptom
// that PASS 2.16 only half-fixed. PASS 2.16 swapped the +14d slot
// for an in-window slot, but `seedCascadeChain` was deriving the
// "in-window" day-keys from the 7-day `useFranchiseWeekView` fetch
// instead of the *visible* 4-column workweek window the calendar
// actually paints. The portrait workweek view shows Mon–Thu (4
// days) but the API fetch returns Mon–Sun (7 days), so the picker
// would happily plant the terminator on Fri/Sat/Sun — outside the
// visible window → off-screen-right stub. PASS 2.17 narrows the
// terminator window to the visible 4 columns via
// `visibleWorkweekWindow(selectedDate)`. The two key contracts
// being tested here are: (1) `visibleWorkweekWindow` returns
// exactly the same 4 day-keys as `app/(tabs)/index.tsx`'s
// `workweekStartDate` `useMemo` produces (Monday-anchored), and
// (2) `makeDevCascadeChain` honors the visible window even when
// callers pass a strictly-narrower set than they previously did.
describe("visibleWorkweekWindow + in-window terminator (PASS 2.17)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- scoped to this describe block, keeps the rest of the file's mounted-component infra out of the new tests
  const reviewModule = require("@/app/pending-reality/review") as typeof import("@/app/pending-reality/review");
  const {
    makeDevCascadeChain,
    pickInWindowTerminatorSlot,
    visibleWorkweekWindow,
  } = reviewModule;

  describe("visibleWorkweekWindow (pure)", () => {
    it("returns 4 Monday-anchored day keys for a mid-week selectedDate", () => {
      // selectedDate = Tue 2026-05-05 → Monday is 2026-05-04 →
      // window = [Mon, Tue, Wed, Thu].
      expect(visibleWorkweekWindow("2026-05-05")).toEqual([
        "2026-05-04",
        "2026-05-05",
        "2026-05-06",
        "2026-05-07",
      ]);
    });

    it("anchors to the prior Monday when selectedDate is Sunday", () => {
      // selectedDate = Sun 2026-05-10 → JS getDay() === 0 → step
      // back 6 days to Mon 2026-05-04. This matches the
      // `app/(tabs)/index.tsx` `workweekStartDate` formula
      // (`dow === 0 ? d.subtract(6, "day") : d.subtract(dow - 1, "day")`).
      expect(visibleWorkweekWindow("2026-05-10")).toEqual([
        "2026-05-04",
        "2026-05-05",
        "2026-05-06",
        "2026-05-07",
      ]);
    });

    it("returns the same window when selectedDate is the Monday itself", () => {
      // dow === 1 → offset 0 → no shift.
      expect(visibleWorkweekWindow("2026-05-04")).toEqual([
        "2026-05-04",
        "2026-05-05",
        "2026-05-06",
        "2026-05-07",
      ]);
    });
  });

  it("places terminator inside visible 4-column workweek window even when 7-day harvest extends further", () => {
    // The seed-time scenario the on-device repro exercised:
    //   * `useFranchiseWeekView` fetched the full 7-day API range
    //     (Mon May 4 – Sun May 10), and PASS 2.16 fed all 7 keys
    //     into `pickInWindowTerminatorSlot` → terminator landed on
    //     2026-05-10 (Sun, outside the 4-column visible window).
    //   * PASS 2.17 narrows the placement window to the 4 days the
    //     calendar actually renders (Mon May 4 – Thu May 7) via
    //     `visibleWorkweekWindow(selectedDate)` — so even if a
    //     caller still has the 7-day list lying around, what they
    //     pass into `makeDevCascadeChain` MUST be the narrower one.
    // We model both windows here so the test fails loudly if a
    // future regression accidentally passes the 7-day list again.
    const SEVEN_DAY_HARVEST = [
      "2026-05-04",
      "2026-05-05",
      "2026-05-06",
      "2026-05-07",
      "2026-05-08", // ← outside visible window
      "2026-05-09", // ← outside visible window
      "2026-05-10", // ← outside visible window (the on-device repro)
    ];
    const VISIBLE_WINDOW = visibleWorkweekWindow("2026-05-05");
    expect(VISIBLE_WINDOW).toEqual([
      "2026-05-04",
      "2026-05-05",
      "2026-05-06",
      "2026-05-07",
    ]);
    expect(VISIBLE_WINDOW.length).toBeLessThan(SEVEN_DAY_HARVEST.length);

    const TECH = 2054;
    const sources = [
      { id: 201, date: "2026-05-04", techId: TECH, start: "07:25", end: "07:50" },
      { id: 202, date: "2026-05-04", techId: TECH, start: "10:30", end: "11:30" },
      { id: 203, date: "2026-05-04", techId: TECH, start: "14:00", end: "15:00" },
      { id: 204, date: "2026-05-05", techId: TECH, start: "06:00", end: "06:30" },
      { id: 205, date: "2026-05-05", techId: TECH, start: "09:00", end: "10:00" },
      { id: 206, date: "2026-05-05", techId: TECH, start: "13:35", end: "14:05" },
    ];

    // The PASS 2.17 contract: with the visible 4-day window, the
    // picker MUST stay inside it. (PASS 2.19's cluster-adjacent
    // picker now also happens to prefer May 5 even with the 7-day
    // window — the cluster on tech 2054 lives there — so the
    // "negative space" the original PASS 2.17 test asserted on
    // (the old picker landing on May 10) is no longer reachable.
    // The 7-day-vs-4-day mismatch protection is still meaningful
    // though: if a future regression caused the picker to wander
    // OUT of the visible window for any reason, this test catches
    // it.)
    const newPicker = pickInWindowTerminatorSlot(VISIBLE_WINDOW, sources);
    expect(newPicker).not.toBeNull();
    expect(VISIBLE_WINDOW).toContain(newPicker!.date);
    // Sanity: passing the 7-day list separately and asserting the
    // result still lands on a visible-window day is just defensive
    // coverage — both windows contain the cluster day, so both
    // should pick it.
    const sevenDayPicker = pickInWindowTerminatorSlot(
      SEVEN_DAY_HARVEST,
      sources,
    );
    expect(sevenDayPicker).not.toBeNull();
    expect(VISIBLE_WINDOW).toContain(sevenDayPicker!.date);

    // Integrated `makeDevCascadeChain` honors the visible window —
    // this is the call site `seedCascadeChain` actually uses.
    const intents = makeDevCascadeChain(0, sources, VISIBLE_WINDOW);
    expect(intents).toHaveLength(6);
    const last = intents[intents.length - 1]!;
    const lastPayload = last.payload as {
      kind: "reschedule";
      new_scheduled_date: string;
      new_start_time: string;
      new_end_time: string;
    };
    expect(VISIBLE_WINDOW).toContain(lastPayload.new_scheduled_date);
    // And specifically: NOT one of the now-excluded harvest days.
    expect(["2026-05-08", "2026-05-09", "2026-05-10"]).not.toContain(
      lastPayload.new_scheduled_date,
    );
  });
});

// PR-UX-2 PASS 2.19 (2026-05-05): regression guard for the
// "terminator off-screen → straight-down off the bottom" symptom
// PASS 2.16 introduced. PASS 2.16 placed the terminator in a 22:00–
// 23:30 late-evening band to guarantee no working-hours collisions,
// but for any user scrolled to the cluster (typically mid-day), the
// last arrow shot straight down off the visible scroll area —
// "still off-screen" from the user's POV. PASS 2.19 replaces the
// late-evening band with a cluster-adjacent slot finder: search the
// slot directly after the latest cluster end, then directly before
// the earliest cluster start, then ±SLOT outward from the centroid.
// Working-hours band is [07:00, 20:00]. Only when a day is genuinely
// too packed for any working-hours slot does the picker fall back
// to the legacy 22:00 band, and in that case the result carries
// `fallback: true` so the seed-button hint surfaces it as
// "(fallback — tight day, terminator at 10 PM)".
describe("cluster-adjacent terminator placement (PASS 2.19)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- scoped to this describe block, keeps the rest of the file's mounted-component infra out of the new tests
  const reviewModule = require("@/app/pending-reality/review") as typeof import("@/app/pending-reality/review");
  const { makeDevCascadeChain, pickInWindowTerminatorSlot } = reviewModule;

  it("places terminator adjacent to chain cluster, not at end-of-day", () => {
    // Construct a synthetic chain whose existing chain destinations
    // (sources[1..N-1]) cluster around 13:00–15:00 on Tuesday May 5.
    // The terminator should anchor adjacent to that cluster — within
    // ±2 hours of 14:00 — NOT at 22:00 like PASS 2.16 would have
    // placed it.
    const TECH = 2054;
    const WINDOW = ["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07"];
    // Layout intentionally back-loads the cluster onto Tuesday so
    // sources[1..5] (the chain destinations) all land on Tue
    // between 13:00 and 15:00.
    const sources = [
      { id: 101, date: "2026-05-04", techId: TECH, start: "09:00", end: "09:30" },
      { id: 102, date: "2026-05-04", techId: TECH, start: "10:00", end: "10:30" },
      { id: 103, date: "2026-05-05", techId: TECH, start: "13:00", end: "13:30" },
      { id: 104, date: "2026-05-05", techId: TECH, start: "13:30", end: "14:00" },
      { id: 105, date: "2026-05-05", techId: TECH, start: "14:00", end: "14:30" },
      { id: 106, date: "2026-05-05", techId: TECH, start: "14:30", end: "15:00" },
    ];

    const slot = pickInWindowTerminatorSlot(WINDOW, sources);
    expect(slot).not.toBeNull();
    expect(slot!.date).toBe("2026-05-05");
    expect(slot!.fallback).toBe(false);

    // Cluster centroid is 14:00 (avg of 13:15, 13:45, 14:15, 14:45)
    // — assert the slot lands within ±2 hours of that, i.e. inside
    // [12:00, 16:00]. PASS 2.16 would have placed it at 22:00.
    const startMinutes = (() => {
      const [h, m] = slot!.start.split(":").map((s) => Number.parseInt(s, 10));
      return h * 60 + m;
    })();
    expect(startMinutes).toBeGreaterThanOrEqual(12 * 60);
    expect(startMinutes).toBeLessThanOrEqual(16 * 60);

    // Specifically: the after-cluster slot is 15:00–15:30 (the
    // first non-colliding slot snapping immediately after the
    // cluster's latest end). The picker should pick it on the
    // first try.
    expect(slot!.start).toBe("15:00");
    expect(slot!.end).toBe("15:30");

    // Integrated `makeDevCascadeChain` produces the same placement.
    const intents = makeDevCascadeChain(0, sources, WINDOW);
    const lastPayload = intents[intents.length - 1]!.payload as {
      kind: "reschedule";
      new_scheduled_date: string;
      new_start_time: string;
      new_end_time: string;
    };
    expect(lastPayload.new_scheduled_date).toBe("2026-05-05");
    expect(lastPayload.new_start_time).toBe("15:00");
    expect(lastPayload.new_end_time).toBe("15:30");
  });

  it("falls back to the 22:00 band with `fallback: true` when the cluster day's working hours are full and surfaces it via the picker result", () => {
    // PASS 2.19 fallback regression: pack the cluster day's
    // working hours so the cluster-adjacent search exhausts. The
    // picker MUST flag `fallback: true` so `seedCascadeChain` can
    // warn AND `seedHint` can append "(fallback — tight day,
    // terminator at 10 PM)". Without the flag the user would just
    // see an off-bottom arrow and not know why.
    const TECH = 5555;
    const DAY = "2026-05-05";
    const WINDOW = [DAY];
    const packed: Array<{
      id: number;
      date: string;
      techId: number;
      start: string;
      end: string;
    }> = [];
    // 26 thirty-min slots cover 07:00–20:00 with no gaps.
    for (let i = 0; i < 27; i++) {
      const startMin = 7 * 60 + i * 30;
      const hh = String(Math.floor(startMin / 60)).padStart(2, "0");
      const mm = String(startMin % 60).padStart(2, "0");
      const startStr = `${hh}:${mm}`;
      const endTotal = startMin + 30;
      const eh = String(Math.floor(endTotal / 60)).padStart(2, "0");
      const em = String(endTotal % 60).padStart(2, "0");
      packed.push({
        id: 800 + i,
        date: DAY,
        techId: TECH,
        start: startStr,
        end: `${eh}:${em}`,
      });
    }
    const slot = pickInWindowTerminatorSlot(WINDOW, packed);
    expect(slot).not.toBeNull();
    expect(slot!.date).toBe(DAY);
    expect(slot!.fallback).toBe(true);
    // Slot is in the 22:00–23:30 band (visually below the user's
    // scroll position — that's why the fallback flag exists).
    expect(slot!.start).toBe("22:00");
    expect(slot!.end).toBe("22:30");

    // NB: the integrated `makeDevCascadeChain` caps `sources` at 6,
    // so passing 27 packed entries is NOT a way to force the
    // fallback path through the integrated function — the chain
    // only sees the first 6, which leave plenty of working-hours
    // room. The picker-level assertion above is the right level
    // to test this contract; the seed-button hint preview that
    // surfaces "(fallback — tight day, terminator at 10 PM)"
    // calls the picker directly with `weekApptMetaForChain` (also
    // capped at 6), so the user-visible warning relies on the
    // SAME picker behavior that this test locks in.
  });

  it("seed flow surfaces `fallback: true` from the picker so `seedHint` can render '(fallback — tight day, terminator at 10 PM)'", () => {
    // Pure-data smoke test that mirrors the `seedHint` preview
    // logic in `DevSeedRow`: call the picker, branch on
    // `previewSlot?.fallback`. We don't mount the screen here
    // (that path is covered by the rest of `review.test.tsx`); we
    // just verify the picker output is the right shape for the
    // hint to consume.
    const TECH = 6666;
    const DAY = "2026-05-05";
    const packed: Array<{
      id: number;
      date: string;
      techId: number;
      start: string;
      end: string;
    }> = [];
    for (let i = 0; i < 27; i++) {
      const startMin = 7 * 60 + i * 30;
      const hh = String(Math.floor(startMin / 60)).padStart(2, "0");
      const mm = String(startMin % 60).padStart(2, "0");
      const endTotal = startMin + 30;
      const eh = String(Math.floor(endTotal / 60)).padStart(2, "0");
      const em = String(endTotal % 60).padStart(2, "0");
      packed.push({
        id: 900 + i,
        date: DAY,
        techId: TECH,
        start: `${hh}:${mm}`,
        end: `${eh}:${em}`,
      });
    }
    const previewSlot = pickInWindowTerminatorSlot([DAY], packed);
    // The shape `seedHint` reads: `previewSlot?.fallback` decides
    // whether the hint appends the warning message.
    const hintFragment =
      previewSlot == null
        ? " (fallback — no room in visible window)"
        : previewSlot.fallback
          ? " (fallback — tight day, terminator at 10 PM)"
          : "";
    expect(hintFragment).toBe(" (fallback — tight day, terminator at 10 PM)");
  });
});

// ──────────────────────────────────────────────────────────────────
// PR-UX-3 (2026-05-07 / 2026-05-08 follow-up) — chain identity badge
// ──────────────────────────────────────────────────────────────────
//
// Smoke-test request from the user looking at a multi-card review
// screen who wanted "which chain does this card belong to?" visible
// inline (without tapping into the calendar). The badge mirrors
// `MoveChainChipRow.tsx`'s "Chain N" label so the user can connect
// a review card back to a chip-row chain at a glance.
//
// 2026-05-08 follow-up: chain-graph derivation moved off
// `useIntentDisplayLookup` (per-id detail cache, populated on a
// different schedule than the calendar's day/week query) onto
// `useFranchiseWeekView` (the same source the chip row uses) via
// the shared `useMoveChainGraph` hook. Tests now seed
// `mockWeekViewData` with `CalendarDayResponse[]` shapes — the
// detector's slot-projection rules consume `day.technicians[].
// appointments[]`. The dot color asserts have widened to also
// cover the per-step palette (a 2-step chain renders palette[0]
// on the seed card and palette[1] on the displaced card).
describe("Pending Reality review screen — chain identity badge (PR-UX-3)", () => {
  // Build a minimal `CalendarAppointmentItem` shape that the chain
  // detector's slot projection consumes. Pads unused fields with
  // realistic-but-not-asserted placeholders.
  function makeApptItem(
    id: number,
    techId: number,
    date: string,
    start: string,
    end: string,
    overrides: Record<string, unknown> = {},
  ): unknown {
    return {
      id,
      customer_id: 9000 + id,
      customer_name: `Customer ${id}`,
      customer_phone: null,
      has_card_on_file: false,
      technician_id: techId,
      technician_name: `Tech ${techId}`,
      franchise_id: 1,
      status: "scheduled",
      scheduled_date: date,
      scheduled_time: start,
      scheduled_end_time: end,
      started_at: null,
      completed_at: null,
      slot_type: "service",
      booking_method: "manual",
      location_type: "shop",
      location_address: null,
      notification_preference: { send_at: null, methods: [] },
      explanation: null,
      scoring_factors: null,
      appointment_note: null,
      cancellation_reason: null,
      cancelled_at: null,
      no_show_at: null,
      services: [],
      ...overrides,
    };
  }

  // Bundle a list of appointments into the `CalendarDayResponse[]`
  // shape `useFranchiseWeekView` is expected to return. Groups by
  // (date, technician_id) so the detector's projection sees the
  // same `day.technicians[].appointments[]` shape it does in
  // production.
  function makeWeekData(
    appts: Array<ReturnType<typeof makeApptItem>>,
  ): unknown {
    const byDate = new Map<string, Map<number, unknown[]>>();
    for (const raw of appts) {
      const a = raw as {
        scheduled_date: string;
        technician_id: number;
      };
      const dateKey = a.scheduled_date;
      const techId = a.technician_id;
      if (!byDate.has(dateKey)) byDate.set(dateKey, new Map());
      const byTech = byDate.get(dateKey)!;
      if (!byTech.has(techId)) byTech.set(techId, []);
      byTech.get(techId)!.push(raw);
    }
    const days: unknown[] = [];
    for (const [date, byTech] of byDate) {
      const technicians: unknown[] = [];
      for (const [techId, list] of byTech) {
        technicians.push({
          technician_id: techId,
          technician_name: `Tech ${techId}`,
          job_count: list.length,
          completed_count: 0,
          appointments: list,
          personal_events: [],
        });
      }
      days.push({ date, technicians });
    }
    return days;
  }

  function reschedule(
    intentId: number,
    appointmentId: number,
    date: string,
    start: string,
    end: string,
    techId: number,
  ): ReorganizationIntent {
    return makeIntent(intentId, {
      intent_type: "reschedule",
      appointment_id: appointmentId,
      payload: {
        kind: "reschedule",
        new_scheduled_date: date,
        new_start_time: start,
        new_end_time: end,
        new_technician_id: techId,
      },
    });
  }

  // Pull the inline `style` map off a Pressable / View node, even
  // when RN passes a [base, modifier] array. Used by the dot-color
  // asserts to read `backgroundColor`.
  function flattenStyle(node: { props: { style?: unknown } }): {
    backgroundColor?: string;
  } {
    const raw = node.props.style;
    const flat = Array.isArray(raw)
      ? Object.assign({}, ...raw.filter((s) => s != null))
      : raw ?? {};
    return flat as { backgroundColor?: string };
  }

  it("renders 'Chain 1' badge on every card in a single detected chain", () => {
    // 2-step linear cascade on tech 7, all on 2026-04-24:
    //   intentA reschedules appt 6001 (currently 13:00–14:00) into
    //     09:00–10:00 → overlaps appt 6002's CURRENT slot.
    //   intentB reschedules appt 6002 (currently 09:00–10:00) into
    //     07:30–08:30 → empty terminator.
    // Detector should collapse both into one chain, both intents
    // get "Chain 1" badges. Same chain identity the calendar's
    // `MoveChainChipRow` would render — `useFranchiseWeekView`
    // here returns the same shape the chip row consumes.
    const intentA = reschedule(701, 6001, "2026-04-24", "09:00", "10:00", 7);
    const intentB = reschedule(702, 6002, "2026-04-24", "07:30", "08:30", 7);

    mockWeekViewData = makeWeekData([
      makeApptItem(6001, 7, "2026-04-24", "13:00", "14:00"),
      makeApptItem(6002, 7, "2026-04-24", "09:00", "10:00"),
    ]);
    seedStore([intentA, intentB]);

    const node = render(<PendingRealityReviewScreen />);
    // Final tab is the default — assert the badge is present on
    // BOTH cards (single chain, both labeled "Chain 1").
    const badgeA = node.getByTestId("intent-chain-badge-701");
    const badgeB = node.getByTestId("intent-chain-badge-702");
    expect(badgeA).toBeTruthy();
    expect(badgeB).toBeTruthy();
    // Both badges read "Chain 1" since they're members of the same
    // detected chain — same chip-row chain identity.
    expect(node.getAllByText("Chain 1").length).toBeGreaterThanOrEqual(2);
  });

  it("dot color on each card matches the intent's per-step position in the chain", () => {
    // Same 2-step cascade as above; this test pins the per-step
    // color contract: card 0 (seed) renders palette[0], card 1
    // (displaced) renders palette[1]. The two dots MUST be
    // different colors — collapsing both to `chain.color` (the
    // pre-2026-05-08 shape) would make them identical and break
    // the "this dot in that chip-row chip" mental model.
    const intentA = reschedule(701, 6001, "2026-04-24", "09:00", "10:00", 7);
    const intentB = reschedule(702, 6002, "2026-04-24", "07:30", "08:30", 7);
    mockWeekViewData = makeWeekData([
      makeApptItem(6001, 7, "2026-04-24", "13:00", "14:00"),
      makeApptItem(6002, 7, "2026-04-24", "09:00", "10:00"),
    ]);
    seedStore([intentA, intentB]);

    const node = render(<PendingRealityReviewScreen />);
    // Detector seeds-sort produces sequence [701, 702] (seed=701
    // → step 0; tail=702 → step 1).
    const dotA = flattenStyle(node.getByTestId("intent-chain-badge-dot-701"));
    const dotB = flattenStyle(node.getByTestId("intent-chain-badge-dot-702"));
    expect(dotA.backgroundColor).toEqual(expect.any(String));
    expect(dotB.backgroundColor).toEqual(expect.any(String));
    // Per-step palette: stepColors[0] !== stepColors[1] for any
    // palette of size > 1 (which is the production palette). If
    // these match, the badge regressed to using `chain.color` for
    // every card.
    expect(dotA.backgroundColor).not.toBe(dotB.backgroundColor);
  });

  it("renders no chain badge for a cancel intent (filtered out of chain eligibility)", () => {
    // INTENTS[2] is the cancel intent on appt 5001. Cancel intents
    // are filtered out of chain eligibility by `detectMoveChains`
    // (see the `isChainEligibleKind` filter), so the card MUST NOT
    // render a chain badge — and there's no "no chain" placeholder
    // to render in its absence. Week-view data is irrelevant here
    // because the chain-eligibility filter rejects the intent
    // before slot projection.
    seedStore([INTENTS[2]!]); // cancel
    const node = render(<PendingRealityReviewScreen />);
    expect(node.queryByTestId("intent-chain-badge-130")).toBeNull();
  });

  it("assigns sequential chain numbers across multiple independent chains", () => {
    // Two independent 1-step "chains" on different techs / slots
    // so neither's destination overlaps the other's source — each
    // intent is its own seed → 2 distinct chains. Plus a third
    // intent that joins one of the first two via a 2-step
    // cascade (so chain 2 has 2 intents, chain 1 has 1 intent).
    //
    // Layout (all on 2026-04-24):
    //   tech 7: intent 801 reschedules appt 7001 (10:00–11:00) → 14:00–15:00 (empty slot)
    //   tech 8: intent 802 reschedules appt 8001 (09:00–10:00) → 13:00–14:00, displacing appt 8002
    //           intent 803 reschedules appt 8002 (13:00–14:00) → 16:00–17:00
    //
    // Expected chains (seeds sorted by id ASC per detector):
    //   chain-801 (seed 801, single step) → "Chain 1"
    //   chain-802 (seed 802, two steps  ) → "Chain 2"
    const i1 = reschedule(801, 7001, "2026-04-24", "14:00", "15:00", 7);
    const i2 = reschedule(802, 8001, "2026-04-24", "13:00", "14:00", 8);
    const i3 = reschedule(803, 8002, "2026-04-24", "16:00", "17:00", 8);

    mockWeekViewData = makeWeekData([
      makeApptItem(7001, 7, "2026-04-24", "10:00", "11:00"),
      makeApptItem(8001, 8, "2026-04-24", "09:00", "10:00"),
      makeApptItem(8002, 8, "2026-04-24", "13:00", "14:00"),
    ]);
    seedStore([i1, i2, i3]);

    const node = render(<PendingRealityReviewScreen />);
    // The detector's `seeds.sort((a, b) => a - b)` makes chain-801
    // global index 1 and chain-802 global index 2. Walk each card's
    // badge text to assert ordering — accessibility label is the
    // most reliable handle (`Chain N`).
    const badge801 = node.getByTestId("intent-chain-badge-801");
    const badge802 = node.getByTestId("intent-chain-badge-802");
    const badge803 = node.getByTestId("intent-chain-badge-803");
    expect(
      (badge801.props as { accessibilityLabel: string }).accessibilityLabel,
    ).toBe("Chain 1");
    expect(
      (badge802.props as { accessibilityLabel: string }).accessibilityLabel,
    ).toBe("Chain 2");
    // 802 and 803 both belong to chain-802 → both read "Chain 2".
    expect(
      (badge803.props as { accessibilityLabel: string }).accessibilityLabel,
    ).toBe("Chain 2");
  });

  it("also renders the badge on the Sequence tab (same week-view data drives both tabs)", () => {
    const intentA = reschedule(901, 9001, "2026-04-24", "09:00", "10:00", 7);
    const intentB = reschedule(902, 9002, "2026-04-24", "07:30", "08:30", 7);
    mockWeekViewData = makeWeekData([
      makeApptItem(9001, 7, "2026-04-24", "13:00", "14:00"),
      makeApptItem(9002, 7, "2026-04-24", "09:00", "10:00"),
    ]);
    seedStore([intentA, intentB]);

    const node = render(<PendingRealityReviewScreen />);
    // PR-UX-5 (2026-05-08): Sequence is the default tab and is
    // mounted directly; no segmented-control button to press.
    expect(node.getByTestId("intent-chain-badge-901")).toBeTruthy();
    expect(node.getByTestId("intent-chain-badge-902")).toBeTruthy();
  });
});

// ──────────────────────────────────────────────────────────────────
// PR-UX-20 — Sweep clean ones button (FE-CR-1-2 rewire, 2026-05-11)
// ──────────────────────────────────────────────────────────────────
//
// Coverage:
//   - Visibility threshold: button hidden when fewer than 2 clean
//     intents are staged; visible when ≥2 even in a mixed clean+
//     dirty session (the all-or-nothing gate retired in FE-CR-1-2).
//   - Tap dispatches `useCommitIntentsBatch` with the clean-intent
//     id list; dirty intents are NOT included in the request body.
//   - Terminal-branch behavior — when the BE reports
//     `session.status === "committed"` the screen routes to
//     dismiss.
//   - Partial-branch behavior — when the BE keeps the session
//     alive with dirty intents remaining, the screen STAYS mounted
//     so the user can resolve them.
describe("Pending Reality review screen — Sweep clean ones (FE-CR-1-2)", () => {
  function makeWeekApptForSweep(
    id: number,
    techId: number,
    date: string,
    start: string,
    end: string,
  ): unknown {
    return {
      id,
      customer_id: 9000 + id,
      customer_name: `Customer ${id}`,
      customer_phone: null,
      has_card_on_file: false,
      technician_id: techId,
      technician_name: `Tech ${techId}`,
      franchise_id: 1,
      status: "scheduled",
      scheduled_date: date,
      scheduled_time: start,
      scheduled_end_time: end,
      started_at: null,
      completed_at: null,
      slot_type: "service",
      booking_method: "manual",
      location_type: "shop",
      location_address: null,
      notification_preference: { send_at: null, methods: [] },
      explanation: null,
      scoring_factors: null,
      appointment_note: null,
      cancellation_reason: null,
      cancelled_at: null,
      no_show_at: null,
      services: [],
    };
  }
  function makeWeekDataSweep(appts: unknown[]): unknown {
    const technicians: unknown[] = [];
    technicians.push({
      technician_id: 5,
      technician_name: "Tech 5",
      job_count: appts.length,
      completed_count: 0,
      appointments: appts,
      personal_events: [],
    });
    return [{ date: "2026-04-25", technicians }];
  }
  function rescheduleClean(
    intentId: number,
    apptId: number,
    targetDate: string,
    targetStart: string,
  ): ReorganizationIntent {
    return makeIntent(intentId, {
      intent_type: "reschedule",
      appointment_id: apptId,
      payload: {
        kind: "reschedule",
        new_scheduled_date: targetDate,
        new_start_time: targetStart,
        new_end_time: "23:59",
      },
      proposed_at: `2026-04-23T15:0${intentId % 10}:00.000Z`,
    });
  }

  it("hides the button when the session has fewer than 2 clean intents", () => {
    mockWeekViewData = makeWeekDataSweep([
      makeWeekApptForSweep(5101, 5, "2026-04-25", "09:00", "10:00"),
    ]);
    seedStore([rescheduleClean(101, 5101, "2026-04-26", "11:00")]);
    const node = render(<PendingRealityReviewScreen />);
    expect(node.queryByTestId("review-sweep-clean-ones")).toBeNull();
  });

  it("renders the button when ≥2 clean intents are staged and dispatches commit-many with their ids on tap", () => {
    mockWeekViewData = makeWeekDataSweep([
      makeWeekApptForSweep(5101, 5, "2026-04-25", "09:00", "10:00"),
      makeWeekApptForSweep(5102, 5, "2026-04-25", "13:00", "14:00"),
    ]);
    seedStore([
      rescheduleClean(101, 5101, "2026-04-26", "11:00"),
      rescheduleClean(102, 5102, "2026-04-27", "15:00"),
    ]);
    const node = render(<PendingRealityReviewScreen />);
    const sweep = node.getByTestId("review-sweep-clean-ones");
    expect(sweep).toBeTruthy();
    fireEvent.press(sweep);
    // FE-CR-1-2: the Sweep button now fires `useCommitIntentsBatch`
    // — NOT `useFinalizeReorganizationSession`. Assert the new
    // mutation dispatched and the legacy one didn't.
    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockCommitBatchMutate).toHaveBeenCalledTimes(1);
    const [variables] = mockCommitBatchMutate.mock.calls[0];
    expect(variables).toEqual({
      sessionId: SESSION.id,
      intentIds: [101, 102],
    });
  });

  it("surfaces the Sweep CTA on a mixed clean+dirty session (FE-CR-1-2 gate retirement)", () => {
    // Two clean intents + one dirty intent. Intent #103 carries
    // `clean: false` + a populated `conflicts` array, which is the
    // shape the BE attaches on read responses (B-CR-1-1).
    // `useCleanIntentPromotion` (post-FE-CR-1-1) reads `intent.clean`
    // directly instead of scanning the store's `linterIssues` slot.
    // Before FE-CR-1-2 the Sweep CTA hid here because the
    // `cleanIntents.length !== intents.length` gate refused to
    // surface on mixed sessions. After the rewire the CTA shows,
    // and tapping it only commits the clean subset.
    mockWeekViewData = makeWeekDataSweep([
      makeWeekApptForSweep(5101, 5, "2026-04-25", "09:00", "10:00"),
      makeWeekApptForSweep(5102, 5, "2026-04-25", "13:00", "14:00"),
      makeWeekApptForSweep(5103, 5, "2026-04-25", "15:00", "16:00"),
    ]);
    const dirtyIntent = makeIntent(103, {
      intent_type: "reschedule",
      appointment_id: 5103,
      payload: {
        kind: "reschedule",
        new_scheduled_date: "2026-04-28",
        new_start_time: "10:00",
        new_end_time: "11:00",
      },
      proposed_at: "2026-04-23T15:03:00.000Z",
      clean: false,
      conflicts: [
        {
          severity: "error",
          kind: "time_conflict",
          affectedAppointmentIds: [5103],
          humanMessage:
            "Intent #103 collides with another reschedule at the same slot.",
        },
      ],
    });
    seedStore([
      rescheduleClean(101, 5101, "2026-04-26", "11:00"),
      rescheduleClean(102, 5102, "2026-04-27", "15:00"),
      dirtyIntent,
    ]);
    const node = render(<PendingRealityReviewScreen />);
    const sweep = node.queryByTestId("review-sweep-clean-ones");
    // The button surfaces despite the dirty intent.
    expect(sweep).toBeTruthy();
    fireEvent.press(sweep!);
    expect(mockCommitBatchMutate).toHaveBeenCalledTimes(1);
    const [variables] = mockCommitBatchMutate.mock.calls[0];
    // Only the clean ids land in the request — the dirty intent's
    // id is excluded.
    expect(variables.sessionId).toBe(SESSION.id);
    expect(variables.intentIds).toEqual([101, 102]);
    expect(variables.intentIds).not.toContain(103);
  });

  it("on partial commit (session stays alive), keeps the screen mounted with the leftover dirty intent visible", () => {
    mockWeekViewData = makeWeekDataSweep([
      makeWeekApptForSweep(5101, 5, "2026-04-25", "09:00", "10:00"),
      makeWeekApptForSweep(5102, 5, "2026-04-25", "13:00", "14:00"),
      makeWeekApptForSweep(5104, 5, "2026-04-28", "10:00", "11:00"),
    ]);
    const dirtyIntent = makeIntent(103, {
      intent_type: "reschedule",
      appointment_id: 5103,
      payload: {
        kind: "reschedule",
        new_scheduled_date: "2026-04-28",
        new_start_time: "10:00",
        new_end_time: "11:00",
      },
      proposed_at: "2026-04-23T15:03:00.000Z",
    });
    seedStore([
      rescheduleClean(101, 5101, "2026-04-26", "11:00"),
      rescheduleClean(102, 5102, "2026-04-27", "15:00"),
      dirtyIntent,
    ]);
    const node = render(<PendingRealityReviewScreen />);
    fireEvent.press(node.getByTestId("review-sweep-clean-ones"));
    expect(mockCommitBatchMutate).toHaveBeenCalledTimes(1);

    // Drive the mutation's onSuccess with the BE's partial-commit
    // response: session still draft, dirty intent left behind.
    // The hook itself would have called
    // `setSession(session, intents)` with the BE-trimmed list, so
    // we mirror that side effect here (the hook is mocked).
    const onSuccess = mockCommitBatchMutate.mock.calls[0]![1]
      .onSuccess as (result: {
      session: { status: string };
      intents: ReorganizationIntent[];
      committedIntentIds: number[];
    }) => void;
    act(() => {
      usePendingRealityStore
        .getState()
        .setSession({ ...SESSION, status: "draft" }, [dirtyIntent]);
      onSuccess({
        session: { ...SESSION, status: "draft" },
        intents: [dirtyIntent],
        committedIntentIds: [101, 102],
      });
    });

    // Screen stays mounted — the active session is still
    // populated, and the leftover dirty intent is the only one in
    // the store.
    const state = usePendingRealityStore.getState();
    expect(state.sessionId).toBe(SESSION.id);
    expect(state.session?.status).toBe("draft");
    expect(state.intents.map((i) => i.id)).toEqual([103]);
  });

  it("on terminal commit (session.status === 'committed'), routes to dismiss via Alert", () => {
    mockWeekViewData = makeWeekDataSweep([
      makeWeekApptForSweep(5101, 5, "2026-04-25", "09:00", "10:00"),
      makeWeekApptForSweep(5102, 5, "2026-04-25", "13:00", "14:00"),
    ]);
    seedStore([
      rescheduleClean(101, 5101, "2026-04-26", "11:00"),
      rescheduleClean(102, 5102, "2026-04-27", "15:00"),
    ]);
    const node = render(<PendingRealityReviewScreen />);
    fireEvent.press(node.getByTestId("review-sweep-clean-ones"));
    const onSuccess = mockCommitBatchMutate.mock.calls[0]![1]
      .onSuccess as (result: {
      session: { status: string };
      intents: ReorganizationIntent[];
      committedIntentIds: number[];
    }) => void;
    act(() => {
      onSuccess({
        session: { ...SESSION, status: "committed" },
        intents: [],
        committedIntentIds: [101, 102],
      });
    });
    // The screen surfaces a celebratory Alert with a dismiss CTA.
    expect(Alert.alert).toHaveBeenCalled();
    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[
      (Alert.alert as jest.Mock).mock.calls.length - 1
    ]!;
    expect(Array.isArray(buttons)).toBe(true);
    expect(buttons[0]?.text).toBe("OK");
    expect(typeof buttons[0]?.onPress).toBe("function");
  });
});
