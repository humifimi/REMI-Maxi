/**
 * Tests for `useSessionAwareSubmit` (P3-FE-7) — the producer half of
 * the Pending Reality stack.
 *
 * The hook wraps a live calendar mutation with the smart-default
 * linter intercept:
 *   - clean linter result → live mutation fires, no sheet, no session
 *   - issues → sheet opens via `useLinterInterceptHost.present(...)`
 *       - "apply" → live mutation fires
 *       - "stage" with no session → create session w/ initial_intents
 *       - "stage" with session → add_intent
 *       - undefined (dismiss) → live mutation does NOT fire
 *
 * The contracts pinned below match the master plan §5.3.7 / §5.3.3
 * narrative.
 *
 * NOTE: this repo does not currently ship a Jest runner end-to-end
 * (see `src/hooks/ui/__tests__/use-wide-canvas.test.ts`). The file
 * follows the canonical jest-expo + `@testing-library/react-native`
 * shape — every assertion below should pass once the runner lands.
 */

import { act, renderHook } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import { useSessionAwareSubmit, type SubmitOutcome } from "../use-session-aware-submit";
import {
  __resetLinterInterceptHostForTests,
  useLinterInterceptHost,
} from "@technician/stores/linter-intercept-host";
import {
  __resetPendingRealityStoreForTests,
  usePendingRealityStore,
} from "@technician/stores/pending-reality";
import {
  __resetDemoSettingsStoreForTests,
  useDemoSettingsStore,
} from "@technician/stores/demo-settings";
import {
  makeIntent,
  makeSession,
} from "@technician/stores/__fixtures__/pending-reality";
import { useCrossCardCollisionToastStore } from "@technician/stores/cross-card-collision-toast";
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

// `lintSession` is the only seam this hook wraps. Mock it so we can
// drive the clean / issues branches deterministically without standing
// up real fixtures of every linter rule.
const mockLintSession = jest.fn();
jest.mock("@technician/utils/logistics-linter", () => {
  const actual = jest.requireActual("@technician/utils/logistics-linter");
  return {
    ...actual,
    __esModule: true,
    lintSession: (...args: unknown[]) => mockLintSession(...args),
  };
});

// ── Helpers ─────────────────────────────────────────────────────────

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

// D2P-FE-14 — bumped from "warning" to "error" so these legacy
// tests still hit the linter-intercept path under the strictness
// filter's "strict" default. The strictness toggle's own coverage
// (warnings dropped vs surfaced) lives in the dedicated describe
// block at the bottom of this file using its own fixtures.
const ISSUE: LinterIssue = {
  severity: "error",
  kind: "drive_time_tight",
  affectedAppointmentIds: [5002],
  humanMessage: "Tight drive time.",
};

function buildWrapper() {
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

interface SubmitPayload {
  appointmentId: number;
}

function buildHookOptions(liveMutate: jest.Mock) {
  return {
    buildProposedIntent: (_payload: SubmitPayload) => PROPOSED_PAYLOAD,
    liveMutate: (payload: SubmitPayload) => liveMutate(payload),
    worldSnapshot: WORLD,
    targetAppointmentId: 5002,
  };
}

beforeEach(() => {
  __resetPendingRealityStoreForTests();
  __resetLinterInterceptHostForTests();
  __resetDemoSettingsStoreForTests();
  mockApi.mockReset();
  mockRandomUUID.mockReset();
  mockLintSession.mockReset();
});

// ──────────────────────────────────────────────────────────────────
// 1. Clean linter result → straight to liveMutate
// ──────────────────────────────────────────────────────────────────

describe("useSessionAwareSubmit — clean linter result", () => {
  it("fires liveMutate with the original payload, opens no sheet, creates no session", async () => {
    mockLintSession.mockReturnValueOnce([]);
    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useSessionAwareSubmit(buildHookOptions(liveMutate)),
      { wrapper: buildWrapper() },
    );

    await act(async () => {
      await result.current({ appointmentId: 5002 });
    });

    expect(liveMutate).toHaveBeenCalledTimes(1);
    expect(liveMutate).toHaveBeenCalledWith({ appointmentId: 5002 });
    expect(useLinterInterceptHost.getState().request).toBeNull();
    expect(usePendingRealityStore.getState().sessionId).toBeNull();
    expect(mockApi).not.toHaveBeenCalled();
  });

  it("falls back to live commit if the linter throws (defensive)", async () => {
    mockLintSession.mockImplementationOnce(() => {
      throw new Error("malformed snapshot");
    });
    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useSessionAwareSubmit(buildHookOptions(liveMutate)),
      { wrapper: buildWrapper() },
    );

    await act(async () => {
      await result.current({ appointmentId: 5002 });
    });

    expect(liveMutate).toHaveBeenCalledTimes(1);
    expect(useLinterInterceptHost.getState().request).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────
// 2. Linter issues → sheet opens; "apply" runs liveMutate
// ──────────────────────────────────────────────────────────────────

describe("useSessionAwareSubmit — linter issues, user picks Apply anyway", () => {
  it("opens the sheet, then fires liveMutate when the user resolves to 'apply'", async () => {
    mockLintSession.mockReturnValueOnce([ISSUE]);
    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useSessionAwareSubmit(buildHookOptions(liveMutate)),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 5002 });
    });

    // Wait for the next microtask so the host store gets populated.
    await act(async () => {
      await Promise.resolve();
    });

    const opened = useLinterInterceptHost.getState().request;
    expect(opened).not.toBeNull();
    expect(opened!.issues).toEqual([ISSUE]);
    expect(liveMutate).not.toHaveBeenCalled();

    await act(async () => {
      useLinterInterceptHost.getState().resolveActive("apply");
      await submitPromise;
    });

    expect(liveMutate).toHaveBeenCalledTimes(1);
    expect(usePendingRealityStore.getState().sessionId).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────
// 3. Linter issues → "stage" with no session → POST /reorganizations
// ──────────────────────────────────────────────────────────────────

describe("useSessionAwareSubmit — linter issues, user picks Stage with no active session", () => {
  it("POSTs /reorganizations with the proposed intent as initial_intents and updates the store", async () => {
    mockLintSession.mockReturnValue([ISSUE]);
    mockRandomUUID.mockReturnValueOnce("uuid-stage-create");
    const SESSION = makeSession();
    mockApi.mockResolvedValueOnce({ ...SESSION, intents: [] });

    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useSessionAwareSubmit(buildHookOptions(liveMutate)),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 5002 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      useLinterInterceptHost.getState().resolveActive("stage");
      await submitPromise;
    });

    // liveMutate is NOT called — the change was staged, not committed.
    expect(liveMutate).not.toHaveBeenCalled();

    // Single round-trip: POST /reorganizations with initial_intents.
    expect(mockApi).toHaveBeenCalledTimes(1);
    const [method, url, body] = mockApi.mock.calls[0]!;
    expect(method).toBe("post");
    expect(url).toBe("/reorganizations");
    // D2P-FE-13 — `targetAppointmentId` is stitched into the payload
    // before it leaves the seam (BE schema requires `appointment_id`
    // on `kind: "reschedule"`). The sheet's `buildProposedIntent`
    // doesn't include it; the hook does.
    expect(body).toEqual({
      initial_intents: [{ ...PROPOSED_PAYLOAD, appointment_id: 5002 }],
    });

    // Store is now populated.
    expect(usePendingRealityStore.getState().sessionId).toBe(SESSION.id);
  });
});

// ──────────────────────────────────────────────────────────────────
// 4. Linter issues → "stage" WITH an active session → PATCH add_intent
// ──────────────────────────────────────────────────────────────────

describe("useSessionAwareSubmit — linter issues, user picks Stage with an active session", () => {
  it("PATCHes /reorganizations/:id with op=add_intent and skips the create round-trip", async () => {
    const SESSION = makeSession();
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });

    mockLintSession.mockReturnValue([ISSUE]);
    mockRandomUUID.mockReturnValueOnce("uuid-stage-add");
    mockApi.mockResolvedValueOnce({ ...SESSION, intents: [] });

    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useSessionAwareSubmit(buildHookOptions(liveMutate)),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 5002 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      useLinterInterceptHost.getState().resolveActive("stage");
      await submitPromise;
    });

    expect(liveMutate).not.toHaveBeenCalled();
    expect(mockApi).toHaveBeenCalledTimes(1);
    const [method, url, body] = mockApi.mock.calls[0]!;
    expect(method).toBe("patch");
    expect(url).toBe(`/reorganizations/${SESSION.id}`);
    // D2P-FE-13 — `appointment_id` stitched in (BE schema requires it
    // on `kind: "reschedule"`).
    expect(body).toEqual({
      op: "add_intent",
      intent: { ...PROPOSED_PAYLOAD, appointment_id: 5002 },
    });
  });
});

// ──────────────────────────────────────────────────────────────────
// 5. Backdrop / ESC → no liveMutate, no API call (canvas snaps back)
// ──────────────────────────────────────────────────────────────────

describe("useSessionAwareSubmit — backdrop / ESC dismiss", () => {
  it("drops the live mutation entirely; no liveMutate, no API call", async () => {
    mockLintSession.mockReturnValueOnce([ISSUE]);
    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useSessionAwareSubmit(buildHookOptions(liveMutate)),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 5002 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      useLinterInterceptHost.getState().resolveActive(undefined);
      await submitPromise;
    });

    expect(liveMutate).not.toHaveBeenCalled();
    expect(mockApi).not.toHaveBeenCalled();
    expect(usePendingRealityStore.getState().sessionId).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────
// 6. Drag-callsite ordering — sheet opens AFTER liveMutate would have
//     run, never before. (The drag callsite's snap-back is its own
//     responsibility; this hook just guarantees the sheet opens
//     synchronously inside the same task as the await on `present`.)
// ──────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────
// 6b. D2P-FE-13 — target-id stitching contract
//
// The sheets' `buildProposedIntent` callbacks do NOT include the
// target id (they think of it as the `targetAppointmentId` /
// `targetPersonalEventId` prop). The BE zod schemas REQUIRE the
// target id on every payload kind that targets an existing row
// (`reschedule` / `reassign` / `cancel` need `appointment_id`;
// `personal_event_update` / `personal_event_delete` need
// `personal_event_id`). The hook stitches them in at the seam so
// every staged payload satisfies the wire contract on both
// `POST /reorganizations` and `PATCH /reorganizations/:id`.
// ──────────────────────────────────────────────────────────────────

describe("useSessionAwareSubmit — target-id stitching (D2P-FE-13)", () => {
  // 2026-05-11 (fix/clean-drops-stale-intercept): these tests pin the
  // wire-format stitching behavior on the stage path, so they need
  // the linter to actually intercept. Define a local issue whose
  // `affectedAppointmentIds` matches the test's `targetAppointmentId`
  // so the producer's post-fix scope filter keeps it (instead of
  // scope-filtering to empty and live-committing).
  const ISSUE_ON_27277: LinterIssue = {
    severity: "error",
    kind: "drive_time_tight",
    affectedAppointmentIds: [27277],
    humanMessage: "Tight drive time on 27277.",
  };

  it("stitches `appointment_id` into a `kind: reschedule` payload on session-create staging", async () => {
    mockLintSession.mockReturnValue([ISSUE_ON_27277]);
    mockRandomUUID.mockReturnValueOnce("uuid-stitch-create");
    const SESSION = makeSession();
    mockApi.mockResolvedValueOnce({ ...SESSION, intents: [] });

    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () =>
        useSessionAwareSubmit({
          buildProposedIntent: (_p: SubmitPayload) => ({
            kind: "reschedule",
            new_scheduled_date: "2026-04-24",
            new_start_time: "11:00",
            new_end_time: "12:00",
          }) as ReorganizationIntentPayload,
          liveMutate: (p: SubmitPayload) => liveMutate(p),
          worldSnapshot: WORLD,
          targetAppointmentId: 27277,
        }),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 27277 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      useLinterInterceptHost.getState().resolveActive("stage");
      await submitPromise;
    });

    const [, , body] = mockApi.mock.calls[0]!;
    expect((body as { initial_intents: ReorganizationIntentPayload[] }).initial_intents[0]).toMatchObject({
      kind: "reschedule",
      appointment_id: 27277,
    });
  });

  it("stitches `personal_event_id` into a `kind: personal_event_update` payload on session-create staging", async () => {
    mockLintSession.mockReturnValue([ISSUE]);
    mockRandomUUID.mockReturnValueOnce("uuid-stitch-pe-update");
    const SESSION = makeSession();
    mockApi.mockResolvedValueOnce({ ...SESSION, intents: [] });

    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () =>
        useSessionAwareSubmit({
          buildProposedIntent: (_p: SubmitPayload) => ({
            kind: "personal_event_update",
            version: 1,
            patch: { title: "Renamed event" },
          }) as ReorganizationIntentPayload,
          liveMutate: (p: SubmitPayload) => liveMutate(p),
          worldSnapshot: WORLD,
          targetPersonalEventId: "11111111-2222-3333-4444-555555555555",
        }),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 9999 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      useLinterInterceptHost.getState().resolveActive("stage");
      await submitPromise;
    });

    const [, , body] = mockApi.mock.calls[0]!;
    expect((body as { initial_intents: ReorganizationIntentPayload[] }).initial_intents[0]).toMatchObject({
      kind: "personal_event_update",
      personal_event_id: "11111111-2222-3333-4444-555555555555",
    });
  });

  it("does NOT stitch a target id onto `kind: create` payloads (no target row exists yet)", async () => {
    mockLintSession.mockReturnValue([ISSUE]);
    mockRandomUUID.mockReturnValueOnce("uuid-stitch-create-kind");
    const SESSION = makeSession();
    mockApi.mockResolvedValueOnce({ ...SESSION, intents: [] });

    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () =>
        useSessionAwareSubmit({
          buildProposedIntent: (_p: SubmitPayload) => ({
            kind: "create",
            customer_id: 1,
            technician_id: 2,
            scheduled_date: "2026-04-24",
            scheduled_start_time: "11:00",
            scheduled_end_time: "12:00",
            service_ids: [3],
          }) as ReorganizationIntentPayload,
          liveMutate: (p: SubmitPayload) => liveMutate(p),
          worldSnapshot: WORLD,
          // No `targetAppointmentId` — the row doesn't exist yet.
        }),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 0 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      useLinterInterceptHost.getState().resolveActive("stage");
      await submitPromise;
    });

    const [, , body] = mockApi.mock.calls[0]!;
    const intent = (body as { initial_intents: ReorganizationIntentPayload[] })
      .initial_intents[0]!;
    expect(intent).not.toHaveProperty("appointment_id");
    expect(intent).not.toHaveProperty("personal_event_id");
  });
});

// ──────────────────────────────────────────────────────────────────
// 6c. SubmitOutcome contract (D2P-FE-13 follow-up)
//
// Form-sheet callsites use the resolved `SubmitOutcome.kind` to
// decide whether to close themselves: anything but `dismissed` means
// the work landed (or is in flight on the BE) and the sheet should
// go away. The `live-committed` and `applied-anyway` paths typically
// close themselves from inside `liveMutate` already; the practical
// use is "close on `staged`" so a second tap can't double-stage the
// same intent. The dismissed path is the only one that intentionally
// leaves the sheet open (so the user can re-edit the unapplied
// draft).
// ──────────────────────────────────────────────────────────────────

describe("useSessionAwareSubmit — SubmitOutcome contract", () => {
  it("resolves with `{ kind: 'live-committed' }` on a clean linter result", async () => {
    mockLintSession.mockReturnValueOnce([]);
    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useSessionAwareSubmit(buildHookOptions(liveMutate)),
      { wrapper: buildWrapper() },
    );

    let outcome: SubmitOutcome | undefined;
    await act(async () => {
      outcome = await result.current({ appointmentId: 5002 });
    });

    expect(outcome).toEqual({ kind: "live-committed" });
  });

  it("resolves with `{ kind: 'applied-anyway' }` when user picks Apply anyway", async () => {
    mockLintSession.mockReturnValueOnce([ISSUE]);
    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useSessionAwareSubmit(buildHookOptions(liveMutate)),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 5002 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    let outcome: SubmitOutcome | undefined;
    await act(async () => {
      useLinterInterceptHost.getState().resolveActive("apply");
      outcome = await submitPromise;
    });

    expect(outcome).toEqual({ kind: "applied-anyway" });
  });

  it("resolves with `{ kind: 'staged' }` when user picks Stage for review", async () => {
    mockLintSession.mockReturnValue([ISSUE]);
    mockRandomUUID.mockReturnValueOnce("uuid-outcome-stage");
    const SESSION = makeSession();
    mockApi.mockResolvedValueOnce({ ...SESSION, intents: [] });
    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useSessionAwareSubmit(buildHookOptions(liveMutate)),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 5002 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    let outcome: SubmitOutcome | undefined;
    await act(async () => {
      useLinterInterceptHost.getState().resolveActive("stage");
      outcome = await submitPromise;
    });

    expect(outcome).toEqual({ kind: "staged" });
  });

  it("resolves with `{ kind: 'dismissed' }` when user dismisses the intercept", async () => {
    mockLintSession.mockReturnValueOnce([ISSUE]);
    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useSessionAwareSubmit(buildHookOptions(liveMutate)),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 5002 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    let outcome: SubmitOutcome | undefined;
    await act(async () => {
      useLinterInterceptHost.getState().resolveActive(undefined);
      outcome = await submitPromise;
    });

    expect(outcome).toEqual({ kind: "dismissed" });
  });
});

// ──────────────────────────────────────────────────────────────────
// 7. D2P-FE-14 — linter strictness toggle
//
// `useDemoSettingsStore.linterStrictness` filters the linter result
// before the intercept decision. `"strict"` (default) keeps only
// `severity === "error"` issues, so warnings cannot fire the
// intercept. `"loose"` keeps everything the linter returned, so
// every warning fires the sheet. Production-side default is
// `"strict"`; the FO can flip to `"loose"` from Settings → Demo
// Mode to demo the warning UX.
// ──────────────────────────────────────────────────────────────────

const WARNING_ISSUE: LinterIssue = {
  severity: "warning",
  kind: "drive_time_tight",
  affectedAppointmentIds: [5002],
  humanMessage: "Tight drive time.",
};

const ERROR_ISSUE: LinterIssue = {
  severity: "error",
  kind: "double_booking",
  affectedAppointmentIds: [5002, 5003],
  humanMessage: "Double-booked technician.",
};

describe("useSessionAwareSubmit — linter strictness toggle (D2P-FE-14)", () => {
  it("strict mode (default) drops warning-only linter results and lets the live commit through", async () => {
    expect(useDemoSettingsStore.getState().linterStrictness).toBe("strict");
    mockLintSession.mockReturnValueOnce([WARNING_ISSUE]);
    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useSessionAwareSubmit(buildHookOptions(liveMutate)),
      { wrapper: buildWrapper() },
    );

    let outcome: SubmitOutcome | undefined;
    await act(async () => {
      outcome = await result.current({ appointmentId: 5002 });
    });

    expect(outcome).toEqual({ kind: "live-committed" });
    expect(liveMutate).toHaveBeenCalledTimes(1);
    expect(useLinterInterceptHost.getState().request).toBeNull();
  });

  it("strict mode still surfaces error-severity issues via the intercept sheet", async () => {
    mockLintSession.mockReturnValueOnce([WARNING_ISSUE, ERROR_ISSUE]);
    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useSessionAwareSubmit(buildHookOptions(liveMutate)),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 5002 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    const opened = useLinterInterceptHost.getState().request;
    expect(opened).not.toBeNull();
    // Warnings dropped; only the error makes it to the sheet.
    expect(opened!.issues).toEqual([ERROR_ISSUE]);
    expect(liveMutate).not.toHaveBeenCalled();

    await act(async () => {
      useLinterInterceptHost.getState().resolveActive(undefined);
      await submitPromise;
    });
  });

  it("loose mode keeps warning-severity issues and fires the intercept sheet", async () => {
    act(() => {
      useDemoSettingsStore.getState().setLinterStrictness("loose");
    });
    mockLintSession.mockReturnValueOnce([WARNING_ISSUE]);
    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useSessionAwareSubmit(buildHookOptions(liveMutate)),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 5002 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    const opened = useLinterInterceptHost.getState().request;
    expect(opened).not.toBeNull();
    expect(opened!.issues).toEqual([WARNING_ISSUE]);
    expect(liveMutate).not.toHaveBeenCalled();

    await act(async () => {
      useLinterInterceptHost.getState().resolveActive(undefined);
      await submitPromise;
    });
  });

  it("loose mode passes every issue (warnings + errors) into the sheet unfiltered", async () => {
    act(() => {
      useDemoSettingsStore.getState().setLinterStrictness("loose");
    });
    mockLintSession.mockReturnValueOnce([WARNING_ISSUE, ERROR_ISSUE]);
    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useSessionAwareSubmit(buildHookOptions(liveMutate)),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 5002 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    const opened = useLinterInterceptHost.getState().request;
    expect(opened).not.toBeNull();
    expect(opened!.issues).toEqual([WARNING_ISSUE, ERROR_ISSUE]);

    await act(async () => {
      useLinterInterceptHost.getState().resolveActive(undefined);
      await submitPromise;
    });
  });
});

describe("useSessionAwareSubmit — drag-callsite ordering", () => {
  it("opens the sheet BEFORE liveMutate is ever called (so the drag can snap back first)", async () => {
    mockLintSession.mockReturnValueOnce([ISSUE]);
    const events: string[] = [];
    const liveMutate = jest.fn().mockImplementation(async () => {
      events.push("liveMutate");
    });

    const { result } = renderHook(
      () => useSessionAwareSubmit(buildHookOptions(liveMutate)),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 5002 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Sheet opened first; liveMutate not yet called.
    events.push("sheet-opened");
    expect(useLinterInterceptHost.getState().request).not.toBeNull();
    expect(liveMutate).not.toHaveBeenCalled();

    await act(async () => {
      useLinterInterceptHost.getState().resolveActive("apply");
      await submitPromise;
    });

    expect(events).toEqual(["sheet-opened", "liveMutate"]);
  });
});

// ──────────────────────────────────────────────────────────────────
// 8. 2026-05-08 (cascade-real, this branch) — `targetAppointmentId`
//     accepts a function so per-gesture drag callsites can resolve
//     a different id per submit. Static-value form (form sheets)
//     keeps working unchanged — see Section 3 above for that path.
// ──────────────────────────────────────────────────────────────────

describe("useSessionAwareSubmit — function-form targetAppointmentId", () => {
  it("invokes the resolver with the submit payload and stitches the resolved id into the wire intent", async () => {
    // 2026-05-11 (fix/clean-drops-stale-intercept): need a linter
    // issue whose `affectedAppointmentIds` matches the resolver's
    // return value (7777) so the post-fix scope filter keeps it
    // and the stage path actually runs.
    const ISSUE_ON_7777: LinterIssue = {
      severity: "error",
      kind: "drive_time_tight",
      affectedAppointmentIds: [7777],
      humanMessage: "Tight drive time on 7777.",
    };
    mockLintSession.mockReturnValue([ISSUE_ON_7777]);
    mockRandomUUID.mockReturnValueOnce("uuid-fn-stage");
    const SESSION = makeSession();
    mockApi.mockResolvedValueOnce({ ...SESSION, intents: [] });

    const liveMutate = jest.fn().mockResolvedValue(undefined);
    const targetResolver = jest.fn(
      (payload: SubmitPayload) => payload.appointmentId,
    );

    const { result } = renderHook(
      () =>
        useSessionAwareSubmit({
          ...buildHookOptions(liveMutate),
          targetAppointmentId: targetResolver,
        }),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 7777 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      useLinterInterceptHost.getState().resolveActive("stage");
      await submitPromise;
    });

    expect(targetResolver).toHaveBeenCalledTimes(1);
    expect(targetResolver).toHaveBeenCalledWith({ appointmentId: 7777 });
    const [, , body] = mockApi.mock.calls[0]!;
    expect(body).toEqual({
      initial_intents: [{ ...PROPOSED_PAYLOAD, appointment_id: 7777 }],
    });
  });

  it("re-resolves on every submit so back-to-back drags of different cards each see their own id", async () => {
    mockLintSession.mockReturnValue([]);
    const liveMutate = jest.fn().mockResolvedValue(undefined);
    const targetResolver = jest.fn(
      (payload: SubmitPayload) => payload.appointmentId,
    );

    const { result } = renderHook(
      () =>
        useSessionAwareSubmit({
          ...buildHookOptions(liveMutate),
          targetAppointmentId: targetResolver,
        }),
      { wrapper: buildWrapper() },
    );

    await act(async () => {
      await result.current({ appointmentId: 1001 });
    });
    await act(async () => {
      await result.current({ appointmentId: 2002 });
    });

    expect(targetResolver).toHaveBeenCalledTimes(2);
    expect(targetResolver).toHaveBeenNthCalledWith(1, { appointmentId: 1001 });
    expect(targetResolver).toHaveBeenNthCalledWith(2, { appointmentId: 2002 });
  });
});

// ──────────────────────────────────────────────────────────────────
// 9. 2026-05-12 (scope-clean-always-live-commit, supersedes the
//    earlier "session-stickiness on linter-clean submits" rule).
//
//    Earlier shapes of this branch staged every linter-clean drop
//    when a session was active, so the cascade chain detector
//    always had a clean terminator. That gate produced a
//    user-visible bug: a re-move of a previously live-committed
//    card into a CLEAN slot was forced into "Set intention"
//    instead of "Apply anyways", because the chain detector still
//    saw the card at its stale prior position. Per the user's
//    rule — *"Cards that are dropped without conflict ... are just
//    moved, no questions asked"* — a scope-clean drop now ALWAYS
//    live-commits, regardless of session state, chainAppointments
//    presence, or chain-extension status. See PLAN-DEVIATION
//    2026-05-12-scope-clean-always-live-commit.
// ──────────────────────────────────────────────────────────────────

describe("useSessionAwareSubmit — scope-clean drops live-commit even with active session", () => {
  it("live-commits when a session is already active and the linter is clean (no chainAppointments passed, form-sheet shape)", async () => {
    const SESSION = makeSession();
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });

    mockLintSession.mockReturnValue([]);

    const liveMutate = jest.fn().mockResolvedValue(undefined);

    // No `chainAppointments` option — form-sheet shape. Pre-fix
    // this fell back to "unconditional session-sticky stage"; post-
    // fix it lives-commits like every other scope-clean drop.
    const { result } = renderHook(
      () => useSessionAwareSubmit(buildHookOptions(liveMutate)),
      { wrapper: buildWrapper() },
    );

    let outcome: SubmitOutcome | undefined;
    await act(async () => {
      outcome = await result.current({ appointmentId: 5002 });
    });

    expect(outcome).toEqual({ kind: "live-committed" });
    expect(liveMutate).toHaveBeenCalledTimes(1);
    expect(liveMutate).toHaveBeenCalledWith({ appointmentId: 5002 });
    expect(useLinterInterceptHost.getState().request).toBeNull();
    // No PATCH add_intent fired — the session is intentionally
    // untouched. Previously this assertion would have failed (the
    // form-sheet fallback always staged).
    expect(mockApi).not.toHaveBeenCalled();
  });

  it("still live-commits on the first submit when no session exists (legacy smart-default behavior)", async () => {
    mockLintSession.mockReturnValueOnce([]);
    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useSessionAwareSubmit(buildHookOptions(liveMutate)),
      { wrapper: buildWrapper() },
    );

    let outcome: SubmitOutcome | undefined;
    await act(async () => {
      outcome = await result.current({ appointmentId: 5002 });
    });

    expect(outcome).toEqual({ kind: "live-committed" });
    expect(liveMutate).toHaveBeenCalledTimes(1);
    expect(usePendingRealityStore.getState().sessionId).toBeNull();
    expect(mockApi).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────
// 10. 2026-05-12 (scope-clean-always-live-commit, supersedes the
//      2026-05-08 chain-extension gate). The wrapper no longer
//      consults `wouldExtendExistingChain` on the scope-clean
//      branch. Scope-clean drops live-commit unconditionally —
//      chain-extension status, session-sticky precedent, and
//      `chainAppointments` presence are all irrelevant once the
//      dragged card's scoped issue list is empty.
//
//      Repro for the bug this kill closes: user drags card A into
//      a conflict, taps Apply anyway → live-commit. World now has
//      a real conflict. User then drags card A again to a CLEAN
//      slot. Pre-fix the chain detector still saw card A at its
//      stale prior position and reported a chain link with an
//      unrelated staged intent, so the sheet forced "Set intention"
//      instead of "Apply anyways". Post-fix the scope-clean check
//      short-circuits the whole stage-vs-commit predicate.
// ──────────────────────────────────────────────────────────────────

describe("useSessionAwareSubmit — scope-clean wins over chain-extension (2026-05-12)", () => {
  // Drag callsites in `app/(tabs)/index.tsx` build this from
  // `dayDataToLinterAppointments(weekQuery.data)`. In tests we pass
  // a hand-built fixture so the predicate's chain-detection runs
  // against deterministic source-slot data.
  const SOURCE_APPT: LinterAppointment = {
    id: 5002,
    customer_id: 9001,
    technician_id: 7,
    franchise_id: 1,
    fleet_company_id: null,
    status: "scheduled",
    scheduled_date: "2026-04-24",
    scheduled_start_time: "08:00",
    scheduled_end_time: "09:00",
    recurrence_series_id: null,
  };
  const EXISTING_INTENT_APPT: LinterAppointment = {
    id: 5001,
    customer_id: 9000,
    technician_id: 7,
    franchise_id: 1,
    fleet_company_id: null,
    status: "scheduled",
    scheduled_date: "2026-04-24",
    scheduled_start_time: "11:00",
    scheduled_end_time: "12:00",
    recurrence_series_id: null,
  };

  // Helper: prime the store with `SESSION + 1 existing intent`.
  // The existing intent is a reschedule that vacates appt 5001's
  // 11:00-12:00 slot on tech 7. The new submit (PROPOSED_PAYLOAD)
  // targets a 11:00-12:00 destination on the SAME tech and date —
  // i.e. lands on the vacated slot, which `wouldExtendExistingChain`
  // detects as a chain-terminator edge.
  function primeStoreWithChainOpportunity() {
    const session = makeSession();
    act(() => {
      usePendingRealityStore.getState().setSession(session, [
        {
          id: 1,
          session_id: session.id,
          intent_type: "reschedule",
          intent_status: "proposed",
          appointment_id: 5001,
          personal_event_id: null,
          payload: {
            kind: "reschedule",
            new_scheduled_date: "2026-04-24",
            new_start_time: "14:00",
            new_end_time: "15:00",
            new_technician_id: 7,
          },
          inverse_payload: null,
          prior_state_snapshot: null,
          linter_dependency_edges: [],
          commit_order: null,
          proposed_at: new Date(0).toISOString(),
          committed_at: null,
          chain_id: "",
        },
      ]);
    });
    return session;
  }

  // Helper: prime with a chain on a DIFFERENT slot from the
  // proposed-payload destination. The new submit will be a solo
  // 1-step seed (no edges to existing intents).
  function primeStoreWithDisjointChain() {
    const session = makeSession();
    act(() => {
      usePendingRealityStore.getState().setSession(session, [
        {
          id: 1,
          session_id: session.id,
          intent_type: "reschedule",
          intent_status: "proposed",
          appointment_id: 4001,
          personal_event_id: null,
          payload: {
            kind: "reschedule",
            new_scheduled_date: "2026-04-24",
            new_start_time: "07:00",
            new_end_time: "08:00",
            new_technician_id: 9,
          },
          inverse_payload: null,
          prior_state_snapshot: null,
          linter_dependency_edges: [],
          commit_order: null,
          proposed_at: new Date(0).toISOString(),
          committed_at: null,
          chain_id: "",
        },
      ]);
    });
    return session;
  }

  it("live-commits when the new intent would NOT extend any existing chain (the user's intent-980 case)", async () => {
    primeStoreWithDisjointChain();
    mockLintSession.mockReturnValue([]);

    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () =>
        useSessionAwareSubmit({
          ...buildHookOptions(liveMutate),
          // The proposed payload targets tech 7 at 11:00; the
          // disjoint existing intent is on tech 9 at 07:00 — no
          // overlap, no chain edge.
          chainAppointments: [SOURCE_APPT],
        }),
      { wrapper: buildWrapper() },
    );

    let outcome: SubmitOutcome | undefined;
    await act(async () => {
      outcome = await result.current({ appointmentId: 5002 });
    });

    expect(outcome).toEqual({ kind: "live-committed" });
    expect(liveMutate).toHaveBeenCalledTimes(1);
    expect(liveMutate).toHaveBeenCalledWith({ appointmentId: 5002 });
    // Critical assertion: the session is NOT touched. No PATCH
    // add_intent fired. This was the user-reported bug — the old
    // code stage'd anyway and `setSession(refresh+intents)` ran,
    // which clobbered selection state and triggered auto-isolate
    // on a 1-step solo chain.
    expect(mockApi).not.toHaveBeenCalled();
  });

  it("live-commits even when the new intent WOULD extend an existing chain (regression: chain-extension no longer stages scope-clean drops)", async () => {
    // PLAN-DEVIATION: 2026-05-12-scope-clean-always-live-commit.
    // Pre-fix this test asserted `{ kind: "staged" }` and that a
    // PATCH add_intent fired. Post-fix, the scope-clean signal
    // wins: chain-extension is ignored, the drop lives-commits,
    // and the session is intentionally untouched.
    primeStoreWithChainOpportunity();
    mockLintSession.mockReturnValue([]);

    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () =>
        useSessionAwareSubmit({
          ...buildHookOptions(liveMutate),
          // Both source rows present so the detector COULD project
          // both source slots — the existing intent's source on
          // tech 7 at 11:00 would have made the new drop a chain
          // terminator under the old gate. Post-fix we don't care.
          chainAppointments: [SOURCE_APPT, EXISTING_INTENT_APPT],
        }),
      { wrapper: buildWrapper() },
    );

    let outcome: SubmitOutcome | undefined;
    await act(async () => {
      outcome = await result.current({ appointmentId: 5002 });
    });

    expect(outcome).toEqual({ kind: "live-committed" });
    expect(liveMutate).toHaveBeenCalledTimes(1);
    expect(liveMutate).toHaveBeenCalledWith({ appointmentId: 5002 });
    // Critical: no PATCH add_intent. The session-sticky chain-
    // extension stage path is dead for scope-clean drops.
    expect(mockApi).not.toHaveBeenCalled();
  });

  it("still opens the intercept sheet when linter issues fire (scope-clean rule only short-circuits when the scoped issue list is empty)", async () => {
    primeStoreWithChainOpportunity();
    // 2026-05-12: the scoped issue list must touch the dragged
    // card so the upstream scope filter keeps it and the sheet
    // actually opens (post-2026-05-11 scope filter is producer-
    // side, before the live-commit-vs-intercept decision).
    const ISSUE_ON_5002: LinterIssue = {
      severity: "error",
      kind: "drive_time_tight",
      affectedAppointmentIds: [5002],
      humanMessage: "Tight drive time on dragged card 5002.",
    };
    mockLintSession.mockReturnValue([ISSUE_ON_5002]);
    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () =>
        useSessionAwareSubmit({
          ...buildHookOptions(liveMutate),
          chainAppointments: [SOURCE_APPT, EXISTING_INTENT_APPT],
        }),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 5002 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    const opened = useLinterInterceptHost.getState().request;
    expect(opened).not.toBeNull();
    expect(opened!.issues).toEqual([ISSUE_ON_5002]);

    await act(async () => {
      useLinterInterceptHost.getState().resolveActive(undefined);
      await submitPromise;
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// PR-UX-11 (2026-05-09): re-stage / de-escalate behavior
// ─────────────────────────────────────────────────────────────────
//
// User reports (PR-UX-9 smoke 2026-05-09):
//   #7. "When I move a card that is currently staged/in conflict,
//        out of conflict, it stays staged, when it should de-escalate
//        and unstage IF the user doesn't undo the move."
//   #8. "more conflicts come up on the popup toast thing when it's
//        moved."
//
// Both bugs collapse into the same fix: when the dragged card already
// has a staged intent in the active session, the new submit replaces
// the old intent BEFORE running the linter, AND the post-decision
// commit path (live-commit OR stage) drops the old intent from the
// local store. The linter-clean + no-chain-extension path
// "de-escalates" the card; the linter-conflict path now shows only
// NEW conflicts on the dragged appointment (combined with Task D's
// narrowed `computeInterceptScope`).

describe("useSessionAwareSubmit — re-stage / de-escalate (PR-UX-11)", () => {
  const SOURCE_APPT_RESTAGE: LinterAppointment = {
    id: 7001,
    customer_id: 9100,
    technician_id: 7,
    franchise_id: 1,
    fleet_company_id: null,
    status: "scheduled",
    scheduled_date: "2026-04-24",
    scheduled_start_time: "08:00",
    scheduled_end_time: "09:00",
    recurrence_series_id: null,
  };

  // Helper: prime the store with `SESSION + 1 existing intent for
  // the SAME appointment that the new submit will target`. Mirrors
  // the user's repro: card 7001 is already staged with a reschedule
  // to 11:00 (presumably in conflict), and the user drags it to a
  // different slot.
  function primeStoreWithExistingIntentForCard(): { session: ReturnType<typeof makeSession>; existingIntentId: number } {
    const session = makeSession();
    const existingIntentId = 999;
    act(() => {
      usePendingRealityStore.getState().setSession(session, [
        {
          id: existingIntentId,
          session_id: session.id,
          intent_type: "reschedule",
          intent_status: "proposed",
          appointment_id: 7001,
          personal_event_id: null,
          payload: {
            kind: "reschedule",
            new_scheduled_date: "2026-04-24",
            new_start_time: "11:00",
            new_end_time: "12:00",
            new_technician_id: 7,
          },
          inverse_payload: null,
          prior_state_snapshot: null,
          linter_dependency_edges: [],
          commit_order: null,
          proposed_at: new Date(0).toISOString(),
          committed_at: null,
          chain_id: "",
        },
      ]);
    });
    return { session, existingIntentId };
  }

  it("removes the old staged intent when the dragged card is moved to a clean slot (de-escalate, linter-clean + no chain extension)", async () => {
    const { existingIntentId } = primeStoreWithExistingIntentForCard();
    // Linter is clean — the new position (5002) doesn't conflict
    // with anything else in `effectiveCurrentIntents` (= [] after
    // the existing intent for 7001 is filtered out for the linter
    // call).
    mockLintSession.mockReturnValue([]);

    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () =>
        useSessionAwareSubmit({
          ...buildHookOptions(liveMutate),
          // Critically: the dragged appointment id matches the
          // existing intent's appointment_id (7001).
          targetAppointmentId: () => 7001,
          chainAppointments: [SOURCE_APPT_RESTAGE],
        }),
      { wrapper: buildWrapper() },
    );

    let outcome: SubmitOutcome | undefined;
    await act(async () => {
      outcome = await result.current({ appointmentId: 7001 });
    });

    expect(outcome).toEqual({ kind: "live-committed" });
    // liveMutate fired — the new position is committed.
    expect(liveMutate).toHaveBeenCalledTimes(1);
    // Critical assertion: the OLD intent is gone from the local
    // store. This is what makes the FAB/HUD count drop and the
    // session row stop showing the card as "still staged".
    const intentsAfter = usePendingRealityStore.getState().intents;
    expect(intentsAfter.find((i) => i.id === existingIntentId)).toBeUndefined();
    expect(intentsAfter.length).toBe(0);
  });

  it("filters the OLD intent out of the linter call so its conflicts don't carry over to the new drop", async () => {
    primeStoreWithExistingIntentForCard();
    // The linter is "clean" but we ASSERT what was passed in: the
    // intent list given to the linter must NOT contain the old
    // intent for the dragged card. Otherwise its conflicts on the
    // OLD position would prevent de-escalation and surface in the
    // intercept sheet (= Task #8 user report).
    mockLintSession.mockReturnValue([]);

    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () =>
        useSessionAwareSubmit({
          ...buildHookOptions(liveMutate),
          targetAppointmentId: () => 7001,
          chainAppointments: [SOURCE_APPT_RESTAGE],
        }),
      { wrapper: buildWrapper() },
    );

    await act(async () => {
      await result.current({ appointmentId: 7001 });
    });

    // The lintSession call should have been invoked with an array
    // containing ONLY the hypothetical intent (the old one was
    // filtered out by `effectiveCurrentIntents`).
    expect(mockLintSession).toHaveBeenCalled();
    const lintCallArgs = mockLintSession.mock.calls[0]!;
    const intentsForLinter = lintCallArgs[1] as { appointment_id: number | null; id: number }[];
    // Should be exactly 1 intent (the hypothetical, id=-1) — the
    // old intent for 7001 should be filtered out.
    expect(intentsForLinter.length).toBe(1);
    expect(intentsForLinter[0]!.id).toBe(-1);
    expect(intentsForLinter[0]!.appointment_id).toBe(7001);
  });

  it("removes the old intent and adds the new one when the user picks Stage from the intercept sheet (re-stage with conflicts)", async () => {
    const { session, existingIntentId } = primeStoreWithExistingIntentForCard();
    // 2026-05-11 (fix/clean-drops-stale-intercept): linter issue
    // must touch the dragged card (7001) so the post-fix scope
    // filter keeps it and the sheet actually opens. Pre-fix this
    // test passed by coincidence — the live-commit branch's
    // `removeIntent.mutate(...)` happened to fire a single PATCH
    // call which satisfied the same assertions.
    const ISSUE_ON_7001_RESTAGE: LinterIssue = {
      severity: "error",
      kind: "drive_time_tight",
      affectedAppointmentIds: [7001],
      humanMessage: "Tight drive time on dragged card 7001.",
    };
    mockLintSession.mockReturnValue([ISSUE_ON_7001_RESTAGE]);
    mockRandomUUID.mockReturnValueOnce("uuid-restage");
    mockApi.mockResolvedValueOnce({ ...session, intents: [] });

    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () =>
        useSessionAwareSubmit({
          ...buildHookOptions(liveMutate),
          targetAppointmentId: () => 7001,
          chainAppointments: [SOURCE_APPT_RESTAGE],
        }),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 7001 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Sheet opened — user picks Stage.
    await act(async () => {
      useLinterInterceptHost.getState().resolveActive("stage");
      await submitPromise;
    });

    // The PATCH add_intent was called for the NEW intent.
    expect(mockApi).toHaveBeenCalledTimes(1);
    expect(mockApi.mock.calls[0]![0]).toBe("patch");
    // And the OLD intent was removed from the local store before
    // the new one was added (otherwise we'd have 2 intents for the
    // same appointment, which violates the BE's invariant).
    const intentsAfter = usePendingRealityStore.getState().intents;
    expect(intentsAfter.find((i) => i.id === existingIntentId)).toBeUndefined();
  });

  it("apply-anyway de-escalates the old staged intent for the dragged card (2026-05-12 symmetric)", async () => {
    // PLAN-DEVIATION 2026-05-12-live-commit-deescalates-symmetric.
    //
    // Repro: card 7001 is already staged with a reschedule. User
    // re-drags it into a CONFLICT slot, the intercept sheet opens,
    // and the user picks "Apply anyway". The new position is now
    // live in the world, so the old staged intent is by definition
    // obsolete and must be removed from the local store AND from
    // the BE — same as the scope-clean live-commit branch. Pre-fix
    // the apply-anyway branch only called `liveMutate(payload)`
    // and left the orphan intent in place, which the user
    // reported as "the chip row keeps showing a step for a card
    // I already moved".
    const { session, existingIntentId } = primeStoreWithExistingIntentForCard();
    // Linter conflicts on the dragged card → intercept fires.
    const ISSUE_ON_7001: LinterIssue = {
      severity: "error",
      kind: "drive_time_tight",
      affectedAppointmentIds: [7001],
      humanMessage: "Tight drive time on dragged card 7001.",
    };
    mockLintSession.mockReturnValue([ISSUE_ON_7001]);
    // BE `remove_intent` PATCH echo.
    mockApi.mockResolvedValueOnce({ ...session, intents: [] });

    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () =>
        useSessionAwareSubmit({
          ...buildHookOptions(liveMutate),
          targetAppointmentId: () => 7001,
          chainAppointments: [SOURCE_APPT_RESTAGE],
        }),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 7001 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    let outcome: SubmitOutcome | undefined;
    await act(async () => {
      useLinterInterceptHost.getState().resolveActive("apply");
      outcome = await submitPromise;
    });

    // Outcome is applied-anyway (same as before — the fix doesn't
    // change the kind).
    expect(outcome).toEqual({ kind: "applied-anyway" });
    expect(liveMutate).toHaveBeenCalledTimes(1);

    // CRITICAL: the old intent is gone from the local store. Pre-
    // fix this assertion would fail (the orphan stuck around).
    const intentsAfter = usePendingRealityStore.getState().intents;
    expect(intentsAfter.find((i) => i.id === existingIntentId)).toBeUndefined();
    expect(intentsAfter.length).toBe(0);

    // BE remove_intent PATCH fired exactly once (FE-side
    // bookkeeping that closes the loop with the server).
    expect(mockApi).toHaveBeenCalledTimes(1);
    const [method, url, body] = mockApi.mock.calls[0]!;
    expect(method).toBe("patch");
    expect(url).toBe(`/reorganizations/${session.id}`);
    expect(body).toMatchObject({
      op: "remove_intent",
      intent_id: existingIntentId,
    });
  });

  it("scopes the LinterInterceptSheet to the dragged card only (Task #8: drop chain-sibling expansion)", async () => {
    primeStoreWithExistingIntentForCard();
    // 2026-05-11 (fix/clean-drops-stale-intercept): need a linter
    // issue that touches the dragged card (7001) so the post-fix
    // scope filter keeps it and the sheet actually opens. The
    // global `ISSUE` fixture affects 5002, which is now scope-
    // filtered out before the present call.
    const ISSUE_ON_7001: LinterIssue = {
      severity: "error",
      kind: "drive_time_tight",
      affectedAppointmentIds: [7001],
      humanMessage: "Tight drive time on dragged card 7001.",
    };
    mockLintSession.mockReturnValue([ISSUE_ON_7001]);
    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () =>
        useSessionAwareSubmit({
          ...buildHookOptions(liveMutate),
          targetAppointmentId: () => 7001,
          chainAppointments: [SOURCE_APPT_RESTAGE],
        }),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 7001 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    const opened = useLinterInterceptHost.getState().request;
    expect(opened).not.toBeNull();
    // Critical: scope is exactly { 7001 } — no chain expansion to
    // other appointments. Pre-PR-UX-11 the scope would have walked
    // the chain and added every chain sibling.
    const scope = opened!.scopeAppointmentIds;
    expect(scope).not.toBeNull();
    expect(Array.from(scope as ReadonlySet<number>)).toEqual([7001]);

    // Dismiss to clean up.
    await act(async () => {
      useLinterInterceptHost.getState().resolveActive(undefined);
      await submitPromise;
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// 2026-05-11 (fix/clean-drops-stale-intercept): clean drops live-
// commit even when the session has stale conflicts on OTHER cards
// ─────────────────────────────────────────────────────────────────
//
// User report (2026-05-11):
//   "I moved a card to a conflict spot and selected apply now, and
//    then moved it to a no-conflict spot and it gave me 2 things it
//    would be in conflict with."
//
// Pre-fix: the live-commit-vs-intercept decision branched on the
// session-wide `filteredIssues.length`, so any stale conflicts on
// OTHER intents (from a prior Apply anyway / Stage) would flip every
// subsequent submit into the sheet path. The sheet's scope filter
// then emptied to zero rows on the dragged card and "defensively"
// fell back to the unfiltered list, exposing the unrelated conflicts
// to the user.
//
// Post-fix: the producer scope-filters `filteredIssues` BEFORE the
// decision. A scope-empty result is treated as clean regardless of
// session state; live-commit fires, no sheet opens.

describe("useSessionAwareSubmit — clean drop with stale session conflicts (2026-05-11)", () => {
  const STALE_ISSUE_ON_OTHER_CARD: LinterIssue = {
    severity: "error",
    kind: "time_conflict",
    affectedAppointmentIds: [9999], // not the dragged card
    humanMessage: "Stale conflict on a different appointment.",
  };

  it("live-commits when scope-filter strips every issue (dragged card has no conflicts)", async () => {
    // Simulate session-wide conflicts on cards OTHER than the dragged
    // card. The linter returns the stale issue; the producer's scope
    // filter (dragged card = 5002) reduces it to []; decision should
    // be live-commit, not intercept.
    mockLintSession.mockReturnValueOnce([STALE_ISSUE_ON_OTHER_CARD]);
    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useSessionAwareSubmit(buildHookOptions(liveMutate)),
      { wrapper: buildWrapper() },
    );

    let outcome: SubmitOutcome | undefined;
    await act(async () => {
      outcome = await result.current({ appointmentId: 5002 });
    });

    expect(outcome).toEqual({ kind: "live-committed" });
    expect(liveMutate).toHaveBeenCalledTimes(1);
    expect(useLinterInterceptHost.getState().request).toBeNull();
  });

  it("still opens the sheet when at least one issue actually touches the dragged card (mixed in-scope + out-of-scope)", async () => {
    // Regression guard: the scope filter must NOT silently drop
    // genuine in-scope issues just because there are also out-of-
    // scope ones in the bag.
    const IN_SCOPE_ISSUE: LinterIssue = {
      severity: "error",
      kind: "drive_time_tight",
      affectedAppointmentIds: [5002],
      humanMessage: "Tight drive time on dragged card.",
    };
    mockLintSession.mockReturnValueOnce([
      STALE_ISSUE_ON_OTHER_CARD,
      IN_SCOPE_ISSUE,
    ]);
    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useSessionAwareSubmit(buildHookOptions(liveMutate)),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 5002 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    const opened = useLinterInterceptHost.getState().request;
    expect(opened).not.toBeNull();
    // CRITICAL: the sheet receives only the IN-SCOPE issue. The
    // stale out-of-scope issue is filtered out by the producer
    // BEFORE the present call, so the sheet has nothing to "defend
    // against".
    expect(opened!.issues).toEqual([IN_SCOPE_ISSUE]);
    expect(liveMutate).not.toHaveBeenCalled();

    await act(async () => {
      useLinterInterceptHost.getState().resolveActive(undefined);
      await submitPromise;
    });
  });

  it("renders every issue when scope is null (legacy callsite with no target id) — unchanged", async () => {
    // Pure create-intent path: no target appointment id, no
    // chain context → `computeInterceptScope` returns null → no
    // scope filter applied. The sheet opens with every issue,
    // same as before this fix. Legacy callsites stay working.
    mockLintSession.mockReturnValueOnce([STALE_ISSUE_ON_OTHER_CARD]);
    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () =>
        useSessionAwareSubmit({
          buildProposedIntent: (_p: SubmitPayload) => ({
            kind: "create",
            customer_id: 1,
            new_scheduled_date: "2026-04-24",
            new_start_time: "11:00",
            new_end_time: "12:00",
            new_technician_id: 7,
            new_job_id: 1,
          }),
          liveMutate: (payload: SubmitPayload) => liveMutate(payload),
          worldSnapshot: WORLD,
          // NO targetAppointmentId → scope returns null
        }),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 0 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    const opened = useLinterInterceptHost.getState().request;
    expect(opened).not.toBeNull();
    expect(opened!.scopeAppointmentIds).toBeNull();
    expect(opened!.issues).toEqual([STALE_ISSUE_ON_OTHER_CARD]);

    await act(async () => {
      useLinterInterceptHost.getState().resolveActive(undefined);
      await submitPromise;
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// 2026-05-12 (pending-move-overlap-soft-framing): Apply-anyway
// fires the cross-card collision toast when the live-committed slot
// leaves ANOTHER card's still-pending intent in conflict with the
// new committed world.
// ─────────────────────────────────────────────────────────────────
//
// User report (2026-05-12, paraphrased from the chat transcript):
//   "why does this last move do what it does? I mean, why would I
//    want to stage 2 intentions in 1 place? Shouldn't it be more
//    like a warning about that conflict or something?"
//
// The full solution is two-part:
//   1. The intercept sheet's copy already branches on
//      `collisionWith === "staged_intent"` (covered by the sheet's
//      own tests).
//   2. AFTER the user chooses "Apply anyway" anyway (legitimate use
//      case per the user's follow-up: drag imprecision they plan to
//      fix via resize), this hook surfaces a non-blocking toast
//      naming the still-pending intent so the user has a one-tap
//      path to drop / adjust it.

describe("useSessionAwareSubmit — Apply-anyway fires cross-card collision toast (2026-05-12)", () => {
  beforeEach(() => {
    useCrossCardCollisionToastStore.setState({ info: null });
  });

  const PENDING_INTENT_OTHER_CARD = makeIntent(1480, {
    appointment_id: 7777, // the OTHER card with a still-pending intent
    intent_type: "reschedule",
    payload: {
      kind: "reschedule",
      new_scheduled_date: "2026-05-11",
      new_start_time: "10:10",
      new_end_time: "11:10",
      new_technician_id: 2055,
    },
  });

  /**
   * Linter R1 finding — intra-session pending-move overlap between
   * the dragged card (5002) and the other card's intent (7777).
   * Both appointment_ids land in `affectedAppointmentIds`; the
   * producer should disambiguate by excluding the dragged card and
   * resolve the survivor against `effectiveCurrentIntents`.
   */
  const STAGED_INTENT_COLLISION_ISSUE: LinterIssue = {
    severity: "error",
    kind: "time_conflict",
    affectedAppointmentIds: [5002, 7777],
    humanMessage:
      "Two changes in this session put technician 2055 into overlapping work on 2026-05-11 (10:10:00-11:10:00 vs 09:45:00-10:45:00).",
    collisionWith: "staged_intent",
  };

  it("presents the toast with the other intent's id and a built label after the live-commit lands", async () => {
    const SESSION = makeSession();
    act(() => {
      usePendingRealityStore
        .getState()
        .setSession(SESSION, [PENDING_INTENT_OTHER_CARD]);
    });

    mockLintSession.mockReturnValueOnce([STAGED_INTENT_COLLISION_ISSUE]);
    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useSessionAwareSubmit(buildHookOptions(liveMutate)),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 5002 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Before resolving, toast must still be silent — the foot-gun
    // guard fires AFTER the user picks Apply anyway, not at intercept
    // time.
    expect(useCrossCardCollisionToastStore.getState().info).toBeNull();

    await act(async () => {
      useLinterInterceptHost.getState().resolveActive("apply");
      await submitPromise;
    });

    expect(liveMutate).toHaveBeenCalledTimes(1);

    const info = useCrossCardCollisionToastStore.getState().info;
    expect(info).not.toBeNull();
    expect(info!.entries).toHaveLength(1);
    expect(info!.entries[0]!.intentId).toBe(1480);
    expect(info!.entries[0]!.appointmentId).toBe(7777);
    // Label should mention the time band so the user can recognize it.
    expect(info!.entries[0]!.label).toMatch(/10:10/);
    expect(info!.entries[0]!.label).toMatch(/2026-05-11/);
    // Committed label should describe the dragged card's destination.
    expect(info!.committedLabel).toMatch(/11:00/);
  });

  it("does NOT present the toast when the only scoped issue is collisionWith=committed (R2)", async () => {
    const SESSION = makeSession();
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION, []);
    });

    const COMMITTED_COLLISION_ISSUE: LinterIssue = {
      severity: "error",
      kind: "time_conflict",
      affectedAppointmentIds: [5002, 200],
      humanMessage:
        "Proposed time 11:00-12:00 for technician 2 on 2026-04-24 overlaps committed appointment #200 (11:00:00-12:00:00).",
      collisionWith: "committed",
    };

    mockLintSession.mockReturnValueOnce([COMMITTED_COLLISION_ISSUE]);
    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useSessionAwareSubmit(buildHookOptions(liveMutate)),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 5002 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      useLinterInterceptHost.getState().resolveActive("apply");
      await submitPromise;
    });

    expect(liveMutate).toHaveBeenCalledTimes(1);
    // No pending-move overlap → no foot-gun toast. The intercept
    // sheet already showed the user the R2 conflict and they
    // explicitly chose to override it.
    expect(useCrossCardCollisionToastStore.getState().info).toBeNull();
  });

  it("does NOT present the toast when there's no surviving other-card intent (de-escalated dragged-card intent only)", async () => {
    // Edge case: the only "other side" of the R1 issue IS the
    // dragged card's own (now-removed) intent. The de-escalate path
    // already cleared it; the toast must not point at a phantom.
    const SESSION = makeSession();
    const ORPHAN_DRAGGED_INTENT = makeIntent(999, {
      appointment_id: 5002, // SAME as dragged card → effectiveCurrentIntents filters it out
      intent_type: "reschedule",
      payload: PROPOSED_PAYLOAD,
    });
    act(() => {
      usePendingRealityStore
        .getState()
        .setSession(SESSION, [ORPHAN_DRAGGED_INTENT]);
    });

    // After `effectiveCurrentIntents` filters out the dragged-card
    // intent, the issue's affectedAppointmentIds [5002, 5002] both
    // reduce to "no surviving other-card intent".
    const SELF_COLLISION_ISSUE: LinterIssue = {
      severity: "error",
      kind: "time_conflict",
      affectedAppointmentIds: [5002, 5002],
      humanMessage: "Self-collision sentinel.",
      collisionWith: "staged_intent",
    };

    mockLintSession.mockReturnValueOnce([SELF_COLLISION_ISSUE]);
    const liveMutate = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useSessionAwareSubmit(buildHookOptions(liveMutate)),
      { wrapper: buildWrapper() },
    );

    let submitPromise: Promise<SubmitOutcome>;
    act(() => {
      submitPromise = result.current({ appointmentId: 5002 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      useLinterInterceptHost.getState().resolveActive("apply");
      await submitPromise;
    });

    expect(liveMutate).toHaveBeenCalledTimes(1);
    expect(useCrossCardCollisionToastStore.getState().info).toBeNull();
  });
});
