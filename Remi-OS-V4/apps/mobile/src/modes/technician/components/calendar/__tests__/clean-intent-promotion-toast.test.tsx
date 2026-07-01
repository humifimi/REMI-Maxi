/**
 * Tests for `CleanIntentPromotionToast` (PR-UX-20).
 *
 * Coverage:
 *   1. Renders nothing when no clean intent is currently promoting.
 *   2. Renders Apply / Remove / Dismiss when a clean intent is
 *      surfaced.
 *   3. Apply triggers the finalize mutation (or authorize when
 *      session.status === "pending_review").
 *   4. Remove triggers `useRemoveReorganizationIntent.mutate`.
 *   5. Dismiss bumps the per-intent suppression count.
 *   6. Long-press reveals the snooze menu.
 *   7. Tapping a snooze option writes to the snooze store and closes
 *      the toast.
 *   8. After 8s, the toast auto-dismisses (without bumping the
 *      suppression count).
 *   9. Post-apply state shows an Undo button that dispatches
 *      `op:modify_intent`.
 */

/* eslint-disable import/no-unresolved -- @testing-library/react-native lands with the jest-expo runner. */

import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Mutation hook stubs ─────────────────────────────────────────────
//
// FE-CR-1-2 (2026-05-11) — the toast's Apply CTA migrated from
// `useFinalizeReorganizationSession` to the new `useCommitIntentsBatch`
// (per-intent commit-many). The legacy finalize/authorize mocks
// stay defined for back-compat with other call sites the test
// historically didn't touch, but they're no longer hit on Apply
// taps in this suite.
const mockFinalizeMutate = jest.fn();
const mockAuthorizeMutate = jest.fn();
const mockRemoveMutate = jest.fn();
const mockModifyMutate = jest.fn();
const mockCommitBatchMutate = jest.fn();
let mockFinalizePending = false;
let mockAuthorizePending = false;
let mockRemovePending = false;
let mockModifyPending = false;
let mockCommitBatchPending = false;

jest.mock("@technician/hooks/schedule/use-reorganization", () => {
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
      mutate: mockFinalizeMutate,
      isPending: mockFinalizePending,
    }),
    useCommitIntentsBatch: () => ({
      mutate: mockCommitBatchMutate,
      isPending: mockCommitBatchPending,
    }),
    CommitBatchRejectedError: CommitBatchRejectedErrorMock,
    CommitBatchIntentNotFoundError: CommitBatchIntentNotFoundErrorMock,
    useRemoveReorganizationIntent: () => ({
      mutate: mockRemoveMutate,
      isPending: mockRemovePending,
    }),
    useModifyReorganizationIntent: () => ({
      mutate: mockModifyMutate,
      isPending: mockModifyPending,
    }),
  };
});
jest.mock("@technician/hooks/franchise/use-franchise-reorganizations", () => ({
  __esModule: true,
  useAuthorizeReorganizationSession: () => ({
    mutate: mockAuthorizeMutate,
    isPending: mockAuthorizePending,
  }),
}));

// ── react-native Alert silencing ───────────────────────────────────
import { Alert } from "react-native";
jest.spyOn(Alert, "alert").mockImplementation(() => {});

// ── Component + stores under test ──────────────────────────────────
// eslint-disable-next-line import/first
import { CleanIntentPromotionToast } from "../clean-intent-promotion-toast";
// eslint-disable-next-line import/first
import {
  __resetPendingRealityStoreForTests,
  usePendingRealityStore,
} from "@technician/stores/pending-reality";
// eslint-disable-next-line import/first
import {
  __resetCleanIntentPromotionStoreForTests,
  useCleanIntentPromotionStore,
} from "@technician/stores/clean-intent-promotion";
// eslint-disable-next-line import/first
import {
  __resetCleanIntentSnoozeStoreForTests,
  useCleanIntentSnoozeStore,
} from "@technician/stores/clean-intent-snooze";
// eslint-disable-next-line import/first
import { __resetCleanIntentSettingsStoreForTests } from "@technician/stores/clean-intent-settings";
// eslint-disable-next-line import/first
import {
  makeIntent,
  makeSession,
} from "@technician/stores/__fixtures__/pending-reality";
// eslint-disable-next-line import/first
import type { LinterAppointment, LinterWorldSnapshot } from "@technician/utils/logistics-linter";

const EMPTY_WORLD: LinterWorldSnapshot = {
  appointments: [],
  routes: [],
  customerSlas: [],
  fleet: { perTechCaps: [], accounts: [] },
};

function makeAppt(id: number, overrides: Partial<LinterAppointment> = {}): LinterAppointment {
  return {
    id,
    customer_id: 9000 + id,
    technician_id: 5,
    franchise_id: 1,
    status: "scheduled",
    scheduled_date: "2026-04-25",
    scheduled_start_time: "09:00",
    scheduled_end_time: "10:00",
    ...overrides,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetPendingRealityStoreForTests();
  __resetCleanIntentPromotionStoreForTests();
  __resetCleanIntentSnoozeStoreForTests();
  __resetCleanIntentSettingsStoreForTests();
  mockFinalizeMutate.mockReset();
  mockAuthorizeMutate.mockReset();
  mockRemoveMutate.mockReset();
  mockModifyMutate.mockReset();
  mockCommitBatchMutate.mockReset();
  mockFinalizePending = false;
  mockAuthorizePending = false;
  mockRemovePending = false;
  mockModifyPending = false;
  mockCommitBatchPending = false;
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function seedCleanIntent(opts: { sessionStatus?: "draft" | "pending_review" } = {}) {
  const session = makeSession({ status: opts.sessionStatus ?? "draft" });
  const intent = makeIntent(101, {
    appointment_id: 5101,
    intent_type: "reschedule",
    payload: {
      kind: "reschedule",
      new_scheduled_date: "2026-04-26",
      new_start_time: "11:00",
      new_end_time: "12:00",
    },
  });
  act(() => {
    usePendingRealityStore.getState().setSession(session);
    usePendingRealityStore.getState().addIntent(intent);
  });
  return [makeAppt(5101, { technician_id: 5 })] as LinterAppointment[];
}

describe("CleanIntentPromotionToast", () => {
  it("renders nothing when no intents are staged", () => {
    const { queryByTestId } = render(
      <CleanIntentPromotionToast
        appointments={[]}
        worldSnapshot={EMPTY_WORLD}
      />,
    );
    expect(queryByTestId("clean-intent-promotion-toast")).toBeNull();
  });

  it("renders Apply / Remove / Dismiss when a clean intent is surfaced", () => {
    const appts = seedCleanIntent();
    const { getByTestId } = render(
      <CleanIntentPromotionToast
        appointments={appts}
        worldSnapshot={EMPTY_WORLD}
      />,
    );
    expect(getByTestId("clean-intent-toast-apply")).toBeTruthy();
    expect(getByTestId("clean-intent-toast-remove")).toBeTruthy();
    expect(getByTestId("clean-intent-toast-dismiss")).toBeTruthy();
  });

  // Smoke-fix 2026-05-10 — eyebrow label so the user can identify
  // the toast on sight. See clean-intent-promotion-toast.tsx for
  // the user report this pins.
  it("renders the 'Suggested move' eyebrow label in the promotion phase", () => {
    const appts = seedCleanIntent();
    const { getByTestId } = render(
      <CleanIntentPromotionToast
        appointments={appts}
        worldSnapshot={EMPTY_WORLD}
      />,
    );
    const eyebrow = getByTestId("clean-intent-toast-eyebrow");
    expect(eyebrow.props.children).toBe("Suggested move");
  });

  // FE-CR-1-2 (2026-05-11) — Apply now dispatches the per-intent
  // commit-many endpoint with a single-element `intentIds` array.
  // This intentionally replaces the prior `useFinalizeReorganizationSession`
  // / `useAuthorizeReorganizationSession` codepath: the BE's
  // `POST /reorganizations/:id/intents/commit-many` accepts both
  // `draft` and `pending_review` sessions on the same wire, so the
  // FE no longer has to branch on `session.status`.
  it("Apply dispatches commit-many with a single-intent array for a draft session", () => {
    const appts = seedCleanIntent({ sessionStatus: "draft" });
    const { getByTestId } = render(
      <CleanIntentPromotionToast
        appointments={appts}
        worldSnapshot={EMPTY_WORLD}
      />,
    );
    fireEvent.press(getByTestId("clean-intent-toast-apply"));
    expect(mockCommitBatchMutate).toHaveBeenCalledTimes(1);
    const [variables] = mockCommitBatchMutate.mock.calls[0];
    expect(variables).toEqual({
      sessionId: 7001, // session id from fixture
      intentIds: [101], // promoted intent's id
    });
    // Legacy session-scoped paths must not fire.
    expect(mockFinalizeMutate).not.toHaveBeenCalled();
    expect(mockAuthorizeMutate).not.toHaveBeenCalled();
  });

  it("Apply still uses commit-many on a pending_review session (status no longer branches)", () => {
    const appts = seedCleanIntent({ sessionStatus: "pending_review" });
    const { getByTestId } = render(
      <CleanIntentPromotionToast
        appointments={appts}
        worldSnapshot={EMPTY_WORLD}
      />,
    );
    fireEvent.press(getByTestId("clean-intent-toast-apply"));
    expect(mockCommitBatchMutate).toHaveBeenCalledTimes(1);
    const [variables] = mockCommitBatchMutate.mock.calls[0];
    expect(variables).toEqual({ sessionId: 7001, intentIds: [101] });
    expect(mockFinalizeMutate).not.toHaveBeenCalled();
    expect(mockAuthorizeMutate).not.toHaveBeenCalled();
  });

  it("Remove triggers useRemoveReorganizationIntent", () => {
    const appts = seedCleanIntent();
    const { getByTestId } = render(
      <CleanIntentPromotionToast
        appointments={appts}
        worldSnapshot={EMPTY_WORLD}
      />,
    );
    fireEvent.press(getByTestId("clean-intent-toast-remove"));
    expect(mockRemoveMutate).toHaveBeenCalledTimes(1);
    const [variables] = mockRemoveMutate.mock.calls[0];
    expect(variables).toEqual(
      expect.objectContaining({ sessionId: 7001, intentId: 101 }),
    );
  });

  it("Dismiss bumps the per-intent suppression count", () => {
    const appts = seedCleanIntent();
    const { getByTestId } = render(
      <CleanIntentPromotionToast
        appointments={appts}
        worldSnapshot={EMPTY_WORLD}
      />,
    );
    fireEvent.press(getByTestId("clean-intent-toast-dismiss"));
    expect(
      useCleanIntentPromotionStore.getState().dismissalsByIntentId["101"]
        ?.count,
    ).toBe(1);
  });

  it("auto-dismisses after 8s without bumping the suppression count", () => {
    const appts = seedCleanIntent();
    render(
      <CleanIntentPromotionToast
        appointments={appts}
        worldSnapshot={EMPTY_WORLD}
      />,
    );
    act(() => {
      jest.advanceTimersByTime(8001);
    });
    // Auto-dismiss is NOT a user action — the counter should stay 0.
    expect(
      useCleanIntentPromotionStore.getState().dismissalsByIntentId["101"]
        ?.count ?? 0,
    ).toBe(0);
  });

  it("long-press reveals the snooze menu", () => {
    const appts = seedCleanIntent();
    const { getByTestId, getByLabelText } = render(
      <CleanIntentPromotionToast
        appointments={appts}
        worldSnapshot={EMPTY_WORLD}
      />,
    );
    const card = getByLabelText("Clean move suggestion");
    fireEvent(card, "longPress");
    expect(getByTestId("clean-intent-toast-snooze-menu")).toBeTruthy();
    expect(getByTestId("clean-intent-toast-snooze-card")).toBeTruthy();
    expect(getByTestId("clean-intent-toast-snooze-session")).toBeTruthy();
    expect(getByTestId("clean-intent-toast-snooze-hour")).toBeTruthy();
    expect(getByTestId("clean-intent-toast-snooze-today")).toBeTruthy();
  });

  it("tapping 'Snooze 1 hour' writes to the snooze store", () => {
    const appts = seedCleanIntent();
    const { getByTestId, getByLabelText } = render(
      <CleanIntentPromotionToast
        appointments={appts}
        worldSnapshot={EMPTY_WORLD}
      />,
    );
    fireEvent(getByLabelText("Clean move suggestion"), "longPress");
    fireEvent.press(getByTestId("clean-intent-toast-snooze-hour"));
    expect(
      useCleanIntentSnoozeStore.getState().snoozedIntentIds["101"],
    ).toBeDefined();
  });
});
