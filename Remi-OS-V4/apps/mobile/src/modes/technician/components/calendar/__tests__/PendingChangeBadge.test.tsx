/**
 * Tests for `PendingChangeBadge` (P3-FE-8 / C.12).
 *
 * Coverage:
 *   - Renders nothing when the underlying overlay is `isPending: false`.
 *   - Renders the correct icon for each `PendingIntentSummarySource`.
 *   - Renders a `+N` count pill when `intentCount > 1` (where N is the
 *     count minus one — the badge itself accounts for the first).
 *   - Renders nothing for personal-event RCEvents (overlay never fires).
 *
 * NOTE: this repo does not currently ship a Jest runner end-to-end —
 * see the matching disclaimer in
 * `src/stores/__tests__/pending-reality.test.ts`.
 */

/* eslint-disable import/no-unresolved -- @testing-library/react-native lands with the jest-expo runner. */

import React from "react";
import { render } from "@testing-library/react-native";
import type { Event as RCEvent } from "react-native-resource-calendar";

// PR-UX-2 PASS 2.22 (2026-05-05): the badge now subscribes to
// `useKnownReorganizationSessionIds` so the orphan-session
// suppression branch fires for the badge alongside the cyan
// tile. The hook reaches into the franchise reorganizations
// TanStack Query, which would require a QueryClient provider in
// every render here. Default to `null` (== "no suppression
// possible — paint legacy") to preserve every existing assertion;
// the new "suppression" suite below toggles the mock per-test to
// drive the suppression branch directly.
const mockKnownSessionIds = jest.fn<
  ReadonlySet<number> | null,
  []
>(() => null);
jest.mock("@technician/hooks/calendar/use-known-reorganization-session-ids", () => ({
  useKnownReorganizationSessionIds: () => mockKnownSessionIds(),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- re-export
  // present so any test that wants to exercise the pure helper
  // can still reach it without the provider machinery.
  narrowKnownSessionIds: jest.requireActual(
    "@technician/hooks/calendar/use-known-reorganization-session-ids",
  ).narrowKnownSessionIds,
}));

import { PendingChangeBadge } from "../PendingChangeBadge";
import {
  __resetPendingRealityStoreForTests,
  usePendingRealityStore,
} from "@technician/stores/pending-reality";
import type {
  PendingIntentSummary,
  PendingIntentSummarySource,
} from "@technician/types/reorganization";

beforeEach(() => {
  __resetPendingRealityStoreForTests();
  mockKnownSessionIds.mockReset();
  mockKnownSessionIds.mockReturnValue(null);
});

function makeApptEvent(
  pendingIntentSummary: PendingIntentSummary | null,
  apptId: number = 5001,
): RCEvent {
  const appointment = {
    id: apptId,
    customer_name: "Mr. Smith",
    pending_intent_summary: pendingIntentSummary,
    // Minimal fields to satisfy `getAppointmentFromEvent`.
    services: [],
    alerts: [],
    slot_type: "standard",
    status: "scheduled",
    booking_method: "manual",
  };
  return {
    id: apptId,
    resourceId: 42,
    date: "2026-04-24",
    from: 540,
    to: 600,
    title: "Mr. Smith",
    meta: {
      appointment,
      isPersonal: false,
      pendingIntentSummary,
    },
  } as RCEvent;
}

function makePersonalEvent(): RCEvent {
  return {
    id: -1,
    resourceId: 42,
    date: "2026-04-24",
    from: 720,
    to: 780,
    title: "Lunch",
    meta: { isPersonal: true, personalEvent: { id: "pe-1", title: "Lunch" } },
  } as RCEvent;
}

describe("PendingChangeBadge", () => {
  it("renders nothing when no pending intent is present", () => {
    const event = makeApptEvent(null);
    const { toJSON } = render(<PendingChangeBadge event={event} />);
    expect(toJSON()).toBeNull();
  });

  it("renders nothing for personal events", () => {
    const { toJSON } = render(<PendingChangeBadge event={makePersonalEvent()} />);
    expect(toJSON()).toBeNull();
  });

  const sources: PendingIntentSummarySource[] = [
    "tech_app",
    "franchise_app",
    "customer_app",
    "ai_engine",
    "mixed",
  ];

  it.each(sources)("renders for source=%s", (source) => {
    const event = makeApptEvent({
      intent_count: 1,
      kinds: ["reschedule"],
      source,
      most_recent_session_id: 9001,
    });
    const { getByLabelText } = render(<PendingChangeBadge event={event} />);
    expect(getByLabelText(/Pending change from/)).toBeTruthy();
  });

  it("includes a +N pill when intentCount > 1", () => {
    const event = makeApptEvent({
      intent_count: 3,
      kinds: ["reschedule", "reassign"],
      source: "franchise_app",
      most_recent_session_id: 9001,
    });
    const { getByText, getByLabelText } = render(
      <PendingChangeBadge event={event} />,
    );
    // First intent is represented by the badge itself; the pill shows
    // the remaining (intentCount - 1).
    expect(getByText("+2")).toBeTruthy();
    expect(getByLabelText("Pending changes from your owner, 3 intents")).toBeTruthy();
  });

  // PR-UX-2 PASS 2.22 (2026-05-05) — regression suite for the user
  // bug "Pending Reality says 'Nothing pending yet' but the calendar
  // still paints sparkle / pencil badges on multiple cards." The
  // root cause was that `PendingChangeBadge` used to call
  // `usePendingChangeOverlay(appointment)` without threading
  // `knownSessionIds`, so the orphan-session suppression branch
  // never fired here even though the cyan-tile path
  // (`applyPendingChangeBorderOverride`) honored it. Result: cyan
  // tile correctly disappeared on cold launch, badge stuck around.
  describe("orphan-session suppression — PR-UX-2 PASS 2.22", () => {
    it("renders null when knownSessionIds is non-null and the BE annotation references a session NOT in the set", () => {
      // Cold-launch FO scenario: the FO's pending-review query +
      // local store union returned an empty Set. The BE annotation
      // still references `most_recent_session_id: 9999` from a
      // stale `ai_suggestion`-source draft. The merge MUST drop
      // the overlay → the badge MUST render null.
      mockKnownSessionIds.mockReturnValue(new Set<number>());
      const event = makeApptEvent({
        intent_count: 1,
        kinds: ["reschedule"],
        source: "ai_engine",
        most_recent_session_id: 9999,
      });
      const { toJSON } = render(<PendingChangeBadge event={event} />);
      expect(toJSON()).toBeNull();
    });

    it("renders null even when the BE annotation reports intentCount > 1 (no `+N` pill paint either)", () => {
      // Same suppression but with a multi-intent annotation. Locks
      // in that the `+N` count pill is gated through the same
      // `overlay.isPending` branch as the icon — both pieces of
      // chrome must disappear together when the session is orphan.
      mockKnownSessionIds.mockReturnValue(new Set<number>());
      const event = makeApptEvent({
        intent_count: 4,
        kinds: ["reschedule", "reassign"],
        source: "ai_engine",
        most_recent_session_id: 9999,
      });
      const { queryByText, toJSON } = render(
        <PendingChangeBadge event={event} />,
      );
      expect(toJSON()).toBeNull();
      expect(queryByText("+3")).toBeNull();
    });

    it("renders normally when knownSessionIds is non-null AND the BE session IS in the set", () => {
      // FO with a populated pending-review queue: session 9001 IS
      // actionable. The badge MUST paint as before.
      mockKnownSessionIds.mockReturnValue(new Set<number>([9001]));
      const event = makeApptEvent({
        intent_count: 1,
        kinds: ["reschedule"],
        source: "ai_engine",
        most_recent_session_id: 9001,
      });
      const { getByLabelText } = render(<PendingChangeBadge event={event} />);
      expect(getByLabelText(/Pending change from/)).toBeTruthy();
    });

    it("renders normally when knownSessionIds is null (technician role / legacy fallback)", () => {
      // Tech accounts get `null` from the hook → no suppression
      // path. Existing badge behavior must continue.
      mockKnownSessionIds.mockReturnValue(null);
      const event = makeApptEvent({
        intent_count: 1,
        kinds: ["reschedule"],
        source: "ai_engine",
        most_recent_session_id: 9999,
      });
      const { getByLabelText } = render(<PendingChangeBadge event={event} />);
      expect(getByLabelText(/Pending change from/)).toBeTruthy();
    });

    it("local-store intents are NEVER suppressed even with an empty knownSessionIds set", () => {
      // The user just staged a change on this device. Even if the
      // FO's known-session set is empty (BE list still fetching,
      // or this is the first session ever), the local intent must
      // paint immediately. This guards against an over-eager
      // suppression that would also drop the local-device
      // affordance.
      mockKnownSessionIds.mockReturnValue(new Set<number>());
      usePendingRealityStore.setState({
        sessionId: 7001,
        intents: [
          {
            id: 9100,
            session_id: 7001,
            intent_type: "reschedule",
            intent_status: "proposed",
            appointment_id: 5001,
            personal_event_id: null,
            payload: {
              kind: "reschedule",
              new_scheduled_date: "2026-04-25",
              new_start_time: "09:00",
              new_end_time: "10:00",
            },
            inverse_payload: null,
            prior_state_snapshot: null,
            linter_dependency_edges: [],
            commit_order: null,
            proposed_at: "2026-04-23T15:01:00.000Z",
            committed_at: null,
            chain_id: "",
          },
        ],
      });
      const event = makeApptEvent({
        intent_count: 1,
        kinds: ["cancel"],
        source: "ai_engine",
        most_recent_session_id: 9999,
      });
      const { getByLabelText } = render(<PendingChangeBadge event={event} />);
      expect(getByLabelText("Pending change from you")).toBeTruthy();
    });
  });

  it("local store intent overrides BE source to tech_app", () => {
    usePendingRealityStore.setState({
      sessionId: 7001,
      intents: [
        {
          id: 9100,
          session_id: 7001,
          intent_type: "reschedule",
          intent_status: "proposed",
          appointment_id: 5001,
          personal_event_id: null,
          payload: {
            kind: "reschedule",
            new_scheduled_date: "2026-04-25",
            new_start_time: "09:00",
            new_end_time: "10:00",
          },
          inverse_payload: null,
          prior_state_snapshot: null,
          linter_dependency_edges: [],
          commit_order: null,
          proposed_at: "2026-04-23T15:01:00.000Z",
          committed_at: null,
          chain_id: "",
        },
      ],
    });
    const event = makeApptEvent({
      intent_count: 1,
      kinds: ["cancel"],
      source: "ai_engine",
      most_recent_session_id: 9999,
    });
    const { getByLabelText } = render(<PendingChangeBadge event={event} />);
    // Local source wins → "from you" wording.
    expect(getByLabelText("Pending change from you")).toBeTruthy();
  });
});
