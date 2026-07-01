/**
 * `/pending-reality/review` — dual-mode review screen (P3-FE-4).
 *
 * Master plan §5.2.3 / §5.3.5. Replaces the placeholder shipped in
 * P3-FE-2 in place: the route name and entry point are unchanged so
 * the FAB / HUD navigations from P3-FE-2 / P3-FE-3 keep working
 * without migration.
 *
 * The screen has one primary surface — **Sequence of operations** —
 * plus a franchise-owner-only **AI** tab when AI-authored sessions
 * are awaiting FO review. Per PR-UX-5 (2026-05-08), the original
 * "Final state" preview tab was removed; the post-commit calendar
 * preview now lives on the calendar tab itself as the Now⇄Future
 * toggle (`<NowFutureToggle>` / `applyIntentsToWorld`). See
 * `docs/PLAN-DEVIATIONS.md#2026-05-08-calendar-now-future-toggle`
 * for the full rationale and anti-instructions.
 *
 *   - **Sequence of operations** (default + only tab for non-FO) —
 *     intents sorted by the §6.4.1 commit order (cancellations →
 *     reschedules → reschedules with tech change → reassigns →
 *     creates → personal events delete/update/create). Each row
 *     shows the intent type badge, the affected target, "Modify" /
 *     "Remove" CTAs (which dispatch to `usePendingRealityStore`),
 *     and per-intent linter cards via `LinterEdgeCard` (P3-FE-5).
 *
 *   - **AI** (franchise-owner only) — list of AI-emitted sessions
 *     with inline Approve / Decline / Counter-propose actions.
 *     Hidden for technicians per the §2.5 trust gradient.
 *
 * Bottom action bar:
 *
 *   - **Cancel session** — fires `useCancelReorganizationSession`
 *     (POST `/reorganizations/:id/cancel`). On 200 the hook clears
 *     `usePendingRealityStore` and writes `null` into the active-
 *     session cache, then we dismiss the screen. On error we keep
 *     the local draft intact and surface a retry alert. (Originally
 *     a local-clear-only CTA per the P3-FE-4 chunk prompt; rewired
 *     to call the BE on 2026-05-08 once the rehydration polling
 *     from PR #94 — `useActiveReorganization()` — started
 *     resurrecting the same draft seconds after a local-only
 *     cancel.)
 *   - **Finalize** — fires `useFinalizeReorganizationSession`. On
 *     `committed` / `pending_review` it clears the store and routes
 *     back to the calendar tab. On `linter_rejected` (HTTP 422) it
 *     overlays the server-side `LinterIssue[]` on top of the local
 *     ones so the issues render inline.
 *
 * Empty state: when `intents.length === 0` we show a friendly empty
 * card pointing to the calendar tab + a "Start drafting" CTA that
 * dismisses the screen. The screen is reachable only when intents
 * exist (the FAB / HUD hide themselves otherwise), but a user could
 * still land here after dispatching `clear()` or after a successful
 * `Cancel session` round-trip — the empty state gives them a way out.
 *
 * --------------------------------------------------------------------
 *
 * Tab navigator implementation note: rather than pull in
 * `@react-navigation/material-top-tabs` (would add a native
 * dependency + react-native-pager-view) we ship a hand-rolled
 * "segmented control" toggle. After PR-UX-5 the segmented control
 * collapses to a single Sequence button for non-FO users (and is
 * hidden entirely in that case so a degenerate one-button toggle
 * never paints); FO users see Sequence + AI. All tabs read the same
 * store snapshot (`usePendingRealityStore`), so toggling between
 * them is a pure render switch — no fetch, no mount cost.
 */

// PLAN-DEVIATION: 2026-05-08-calendar-now-future-toggle — supersedes
// 2026-04-23-pending-reality-final-state-cards, which downgraded the
// §5.2.3 "Final state" calendar canvas to a card list. Both the
// original spec and the card-list compromise have been replaced by
// the on-calendar Now⇄Future toggle (see
// `app/(tabs)/index.tsx` + `src/components/calendar/NowFutureToggle.tsx`),
// because a real calendar preview in one tap from the canvas the
// user already knows beats either alternative. The
// `FinalStateTab` / `groupByTarget` / `TargetGroup` symbols were
// deleted alongside this change. Anti-instruction: do NOT
// reintroduce a "Final state" tab on this screen. If the post-
// commit preview needs a richer treatment, extend
// `applyIntentsToWorld` (`src/utils/apply-intents-to-world.ts`)
// or layer features onto `<NowFutureToggle>` instead.
// See docs/PLAN-DEVIATIONS.md#2026-05-08-calendar-now-future-toggle.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import type { ApiResponse } from "@technician/types/api";

import { LinterEdgeCard } from "@technician/components/linter/linter-edge-card";
import { AiSuggestionCard } from "@technician/components/reorganization/ai-suggestion-card";
import { CounterProposeSheet } from "@technician/components/reorganization/counter-propose-sheet";
import { DeclineReasonPicker } from "@technician/components/reorganization/decline-reason-picker";
import { SourceBadgeColors, StatusColors } from "@technician/constants/colors";
import { Config } from "@technician/constants/config";
import {
  useAiSuggestionSessions,
  useAuthorizeReorganizationSession,
  useDenyReorganizationSession,
  type DeclineReasonKind,
} from "@technician/hooks/franchise/use-franchise-reorganizations";
import { useIntentDisplayLookup } from "@technician/hooks/franchise/use-intent-display-lookup";
import {
  useFranchiseDayView,
  useFranchiseWeekView,
} from "@technician/hooks/schedule/use-calendar";
import { useCalendarDisplayLookups } from "@technician/hooks/schedule/use-calendar-display-lookups";
import {
  ApplyAutoFixRejectedError,
  cacheReorganizationResult,
  useApplyAutoFix,
  useCancelReorganizationSession,
  CommitBatchIntentNotFoundError,
  CommitBatchRejectedError,
  useCommitIntentsBatch,
  useCreateReorganizationSession,
  useFinalizeReorganizationSession,
  useRemoveReorganizationIntent,
} from "@technician/hooks/schedule/use-reorganization";
import { useAuthStore } from "@/src/stores/auth";
import { useCalendarStore } from "@technician/stores/calendar";
import {
  ADOPT_SNOOZE_DURATION_MS,
  usePendingRealityStore,
} from "@technician/stores/pending-reality";
import type {
  CalendarAppointmentItem,
  CalendarDayResponse,
} from "@technician/types/calendar";
import type {
  ReorganizationIntent,
  ReorganizationIntentPayload,
  ReorganizationIntentType,
  ReorganizationSession,
} from "@technician/types/reorganization";
import { UserRole } from "@technician/types/enums";
import {
  formatDateFriendly,
  formatTimeRange12h,
  type HumanizeLookups,
} from "@technician/utils/format-display";
import type { LinterIssue } from "@technician/utils/logistics-linter";
import { mapFinalizeError } from "@technician/utils/finalize-error-copy";
import { useCalendarWorldSnapshot } from "@technician/hooks/schedule/use-calendar-world-snapshot";
import { useMoveChainGraph } from "@technician/components/calendar/use-move-chain-graph";
// 2026-05-11 (post-FE-CR-1-2 smoke): Modify-from-review opens the
// same customer-info popup the user already sees when tapping an
// appointment on the calendar — `AppointmentDetailSheet`. The action
// buttons inside the popup (Reschedule / Cancel / Edit / Quick text)
// route back to the calendar where the existing flow takes over;
// the value-add here is the read-only customer info readily visible
// without a calendar context-switch. See the `handleModify` doc
// block for the full rationale + the PLAN-DEVIATION callout.
import { AppointmentDetailSheet } from "@technician/components/calendar/appointment-detail-sheet";
import { type AppSheetRef } from "@technician/components/sheets";
// PR-UX-20: detection hook + utilities for the Sweep button. The
// hook is the same one the calendar-tab toast uses; the
// `dayDataToLinterAppointments` helper projects the week-view query
// payload into the linter shape the chain detector consumes.
import { useCleanIntentPromotion } from "@technician/hooks/schedule/use-clean-intent-promotion";
import { dayDataToLinterAppointments } from "@technician/utils/detect-move-chains";

type IntentDisplayLookup = Map<number, CalendarAppointmentItem>;

/**
 * Per-card chain identity badge emitted by the screen-level chain
 * graph and consumed by `IntentCard`. Mirrors the chip-row's
 * "Chain N" label so the user can connect a review-screen card
 * back to the calendar's `MoveChainChipRow` chip without tapping
 * in. Cancel / personal_event_* intents are NOT chain-eligible
 * (see `detectMoveChains` chain-eligibility filter), so their
 * cards never receive a badge — they're absent from
 * `chainBadgeByIntentId` and the card renders no pill at all.
 */
interface ChainBadgeInfo {
  /** Stable detector chain id (`chain-{seedIntentId}`). */
  chainId: string;
  /** 1-based GLOBAL ordinal across `graph.chains` — same indexing as `MoveChainChipRow`. */
  chainNumber: number;
  /**
   * THIS intent's per-step color in the chain — i.e.
   * `chain.stepColors[stepOrdinal]` where `stepOrdinal` is the
   * intent's 0-based position inside `chain.intentIds`. Mirrors the
   * dot the same intent would paint in `MoveChainChipRow`'s per-step
   * flow, so a 4-step cascade renders four distinct dot colors
   * across its four review cards (one for each dot in the chip-row
   * chip). Falls back to `chain.color` (= `stepColors[0]`) when
   * the chain's `stepColors` array is shorter than `intentIds`,
   * which the detector currently never emits but the fallback is
   * cheap defense.
   */
  color: string;
}

// PLAN-DEVIATION: 2026-04-24-ai-tab-list-only-render — the §5.2.5
//   spec says tapping an AI suggestion "opens that session inside
//   the same review screen (as if the user had authored it
//   themselves)." The technician-app store
//   (`usePendingRealityStore`) is single-active-session by design
//   (§5.3.1) and is owned by the tech-authored draft pipeline; using
//   it as the loader for arbitrary FO-acted sessions would conflict
//   with a user composing their own draft. P7-FE-1 ships the AI
//   tab as a list with inline FO actions instead — Approve and
//   Decline route through the franchise endpoints from the list
//   itself; full single-session deep-dive lands when the franchise
//   dashboard (REMIDashboard) gets its own review surface.
//   See docs/PLAN-DEVIATIONS.md#2026-04-24-ai-tab-list-only-render
//   for the full rationale and anti-instructions.
// PLAN-DEVIATION: 2026-05-08-calendar-now-future-toggle — `"final"`
// removed from the union when the tab was cut. See file-header
// deviation block + docs/PLAN-DEVIATIONS.md.
type ReviewTab = "sequence" | "ai";

/**
 * §6.4.1 commit order. Re-stating the rule verbatim in code so the
 * "Sequence of operations" tab and the BE commit pipeline use the
 * exact same ordering. If §6.4.1 ever changes, both this constant
 * and `REMIBackend/src/services/scheduling/loadIntentsOrdered.ts`
 * (or its sibling) must change in lockstep.
 *
 * The rule also breaks reschedule into two sub-groups:
 *   2. reschedule WITHOUT new_technician_id
 *   3. reschedule WITH new_technician_id (combo move)
 *
 * That sub-bucketing is encoded in `commitGroupOf()` rather than
 * here so the table stays type-safe against `ReorganizationIntentType`.
 */
const COMMIT_ORDER: Record<ReorganizationIntentType, number> = {
  cancel: 1,
  reschedule: 2, // bumped to 3 by `commitGroupOf` when payload has new_technician_id
  reassign: 4,
  create: 5,
  personal_event_delete: 6,
  personal_event_update: 7,
  personal_event_create: 8,
};

function commitGroupOf(intent: ReorganizationIntent): number {
  if (intent.intent_type === "reschedule") {
    const payload = intent.payload;
    if (payload.kind === "reschedule" && payload.new_technician_id != null) {
      return 3;
    }
  }
  return COMMIT_ORDER[intent.intent_type];
}

/**
 * Sort intents by §6.4.1 commit order. Within each group, ties are
 * broken by `proposed_at` ASC (oldest first), then by `id` ASC —
 * matching the BE's `loadIntentsOrdered` tiebreak rule.
 */
function sortByCommitOrder(intents: ReorganizationIntent[]): ReorganizationIntent[] {
  return [...intents].sort((a, b) => {
    const groupDelta = commitGroupOf(a) - commitGroupOf(b);
    if (groupDelta !== 0) return groupDelta;
    if (a.proposed_at !== b.proposed_at) {
      return a.proposed_at < b.proposed_at ? -1 : 1;
    }
    return a.id - b.id;
  });
}

const INTENT_TYPE_LABEL: Record<ReorganizationIntentType, string> = {
  cancel: "Cancel",
  reschedule: "Reschedule",
  reassign: "Reassign",
  create: "Create",
  personal_event_create: "Personal event +",
  personal_event_update: "Personal event ✎",
  personal_event_delete: "Personal event −",
};

const INTENT_TYPE_TINT: Record<ReorganizationIntentType, string> = {
  cancel: StatusColors.cancelled,
  reschedule: StatusColors.scheduled,
  reassign: StatusColors.scheduled,
  create: StatusColors.finalized,
  personal_event_create: StatusColors.inProgress,
  personal_event_update: StatusColors.inProgress,
  personal_event_delete: StatusColors.cancelled,
};

/**
 * Filter linter issues to only those affecting this intent. An issue
 * "affects" an intent when its `affectedAppointmentIds` overlaps with
 * the intent's target appointment id. Personal-event intents (which
 * target a UUID, not an integer appointment id) currently pass
 * through with an empty match — the linter's v1 rule set in
 * `src/utils/logistics-linter.ts` does not produce PE-target issues,
 * so this is intentionally a no-op until §4.7 ships PE rules.
 */
function issuesForIntent(
  intent: ReorganizationIntent,
  allIssues: LinterIssue[],
): LinterIssue[] {
  if (intent.appointment_id == null) return [];
  return allIssues.filter((issue) =>
    issue.affectedAppointmentIds.includes(intent.appointment_id as number),
  );
}

/**
 * Build the human-readable "after" line for an intent. Used in both
 * the Final state cards and the Sequence rows so the wording is
 * identical between tabs.
 *
 * D2P-FE-13 follow-up (2026-04-26): renders dates, times, and tech
 * names in user-friendly form (`Sun, Apr 26 · 1:30 PM – 3:50 PM
 * with Tech B`) using `formatDateFriendly` / `formatTimeRange12h`
 * and the `displayLookups.technicianNames` map. When the lookup
 * misses (e.g. the tech isn't on today's day-view), the bare
 * `tech #NNN` form remains as a fallback so the dispatcher still
 * gets a stable identifier.
 */
function describeIntentTarget(
  intent: ReorganizationIntent,
  displayLookups?: HumanizeLookups,
): string {
  const payload = intent.payload;
  const techName = (id: number | null | undefined): string => {
    if (id == null) return "";
    return displayLookups?.technicianNames?.get(id) ?? `tech #${id}`;
  };
  switch (payload.kind) {
    case "reschedule": {
      const when = `${formatDateFriendly(payload.new_scheduled_date)} · ${formatTimeRange12h(payload.new_start_time, payload.new_end_time)}`;
      const techSuffix = payload.new_technician_id
        ? ` with ${techName(payload.new_technician_id)}`
        : "";
      return `→ ${when}${techSuffix}`;
    }
    case "reassign":
      return `→ ${techName(payload.new_technician_id)}${payload.dispatcher_reason ? ` (${payload.dispatcher_reason})` : ""}`;
    case "cancel":
      return `→ cancelled (${payload.cancellation_reason})`;
    case "create": {
      const when = `${formatDateFriendly(payload.scheduled_date)} · ${formatTimeRange12h(payload.scheduled_start_time, payload.scheduled_end_time)}`;
      // D2P-FE-13 follow-up #2 (2026-04-26): no FE customer-name
      // cache exists at this layer (the review screen only looks
      // up *appointment* ids, and a `create` intent doesn't have
      // one yet). Drop the bare `#NNN` rather than expose it —
      // the date/time line is enough for the dispatcher to find
      // the staged change in context.
      return `→ new appointment ${when}`;
    }
    case "personal_event_create": {
      const when = `${formatDateFriendly(payload.scheduled_date)} · ${formatTimeRange12h(payload.start_time, payload.end_time)}`;
      return `→ "${payload.title}" ${when}`;
    }
    case "personal_event_update":
      return `→ patch v${payload.version} (${Object.keys(payload.patch).length} fields)`;
    case "personal_event_delete":
      return `→ delete v${payload.version}`;
  }
}

/**
 * Short label for "what this intent targets" (top-of-card subheading
 * and group-header label).
 *
 * PR 3 (2026-04-24, item #5): when a `displayLookup` map is supplied,
 * resolve `appointment_id` → customer name + service summary so the
 * card reads "Jane Doe — Brake service" instead of "Appointment #5001".
 * The `displayLookup` source is `useIntentDisplayLookup` which fans
 * out one cache-warm `useAppointmentDetail` per id; entries that
 * haven't loaded yet (or that resolve to a personal-event-only intent)
 * fall back to the bare-id label.
 *
 * D2P-FE-13 follow-up #2 (2026-04-26): never expose raw ids /
 * UUIDs to end users. The fallback chain is now:
 *   - appointment intents:
 *       displayLookup (customer + service) →
 *       calendarLookups.appointmentLabels (customer name only) →
 *       "Appointment" (no `#NNN`)
 *   - personal-event intents:
 *       calendarLookups.personalEventTitles →
 *       payload.title (only on `personal_event_create`) →
 *       "Personal event" (no UUID)
 *   - bare `create` intents (no row exists yet):
 *       "New appointment" (no `#NNN`)
 * The calendar lookup misses are common in two cases — the
 * appointment is on a different day than the day-view cache
 * happens to hold, or the personal event was just created in the
 * same staging session — so the bare-but-readable fallbacks
 * matter for both.
 */
function describeIntentSubject(
  intent: ReorganizationIntent,
  displayLookup?: IntentDisplayLookup,
  calendarLookups?: HumanizeLookups,
): string {
  if (intent.appointment_id != null) {
    const appt = displayLookup?.get(intent.appointment_id);
    if (appt) {
      const services = describeAppointmentServices(appt);
      return services
        ? `${appt.customer_name} — ${services}`
        : appt.customer_name;
    }
    const cachedName = calendarLookups?.appointmentLabels?.get(
      intent.appointment_id,
    );
    if (cachedName) return cachedName;
    return "Appointment";
  }
  if (intent.personal_event_id != null) {
    const cachedTitle = calendarLookups?.personalEventTitles?.get(
      intent.personal_event_id,
    );
    if (cachedTitle) return cachedTitle;
    if (intent.payload.kind === "personal_event_create") {
      const t = intent.payload.title;
      if (typeof t === "string" && t.length > 0) return t;
    }
    return "Personal event";
  }
  return intent.payload.kind === "create" ? "New appointment" : "Unknown target";
}

function describeAppointmentServices(appt: CalendarAppointmentItem): string {
  if (!appt.services || appt.services.length === 0) return "";
  const names = appt.services.map((s) => s.service_name).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}

// ──────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────

interface IntentCardProps {
  intent: ReorganizationIntent;
  issues: LinterIssue[];
  /**
   * Per-row CTAs — only rendered in the Sequence tab. The Final tab
   * focuses on the projection so it suppresses the action chrome
   * (consistent with §5.2.3's "Final state shows the result").
   */
  showActions: boolean;
  onModify?: () => void;
  onRemove?: () => void;
  /**
   * PR-UX-19 (2026-05-09): when true, this card's Remove button is
   * mid-mutation against the BE — disable to prevent double-submit
   * and surface a quiet "Removing…" label so the user sees that
   * the network call is in flight. Modify is unaffected (different
   * code path; not implemented yet anyway).
   */
  isRemoving?: boolean;
  /**
   * Apply-auto-fix dispatcher. Forwarded to each `LinterEdgeCard`
   * the intent renders. The dispatcher is lifted to the screen
   * (rather than constructed per-card) so it can call the
   * `useApplyAutoFix` hook once and pass the same handler down to
   * every card on the screen — hooks can't be invoked
   * conditionally inside the render-per-issue loop.
   */
  onApplyAutoFix?: (intentId: number, issue: LinterIssue) => void;
  /**
   * Step number in the sequence (1-indexed). Only rendered when set,
   * matching §5.2.3 ("Each row is 'Step N: <verb> <target> →
   * <details>.'"). The Final tab passes `undefined` so the badge
   * stays hidden.
   */
  step?: number;
  /**
   * P3-FE-8 (C.12): when true, this card is the navigation target
   * from a tap-on-overlaid-card on the calendar canvas. The card
   * pulses its border in `StatusColors.scheduled` (yellow) for
   * ~1.6s so the user can find it after the scrollTo lands. The
   * effect is purely visual and self-clears.
   */
  isFocused?: boolean;
  /**
   * P3-FE-8 (C.12): emitted on first layout so the parent tab's
   * `ScrollView` can scroll the focused card into view. Only the
   * focused card needs to wire this up; others pass `undefined`.
   */
  onMeasuredY?: (y: number) => void;
  /**
   * PR 3 (item #5): customer-name + service-summary lookup for the
   * intent's underlying appointment. When present, the subject line
   * renders the human label instead of the bare numeric id.
   */
  displayLookup?: IntentDisplayLookup;
  /**
   * D2P-FE-13 follow-up (2026-04-26): customer + tech name lookups
   * derived from the day-view query cache. Used to humanize:
   *   - `describeIntentTarget` (renders `with Tech B` instead of
   *     `with tech #1487`).
   *   - The nested `LinterEdgeCard`s (renders `Jane Doe` and
   *     `Tech B` inside the `humanMessage` and "Affects:" row).
   * When `undefined`, both fall back to the wire form — same as
   * pre-follow-up behaviour.
   */
  calendarLookups?: HumanizeLookups;
  /**
   * PR 3 (item #5): when set, the whole card becomes tappable and
   * routes the user to the appointment / customer detail. The screen
   * supplies a single navigator (`/order/[id]`) for appointment-target
   * intents; personal-event-target and `create` intents don't have a
   * detail destination yet, so they fall through with `undefined` and
   * the card stays non-tappable.
   */
  onPress?: () => void;
  /**
   * PR-UX-3 (2026-05-07 / 2026-05-08 follow-up): chain identity
   * badge for the metadata row. Present when this intent is a
   * member of any move-chain detected across the staged session —
   * absent for cancel / personal_event_* intents (filtered out by
   * `detectMoveChains`). The badge is a passive metadata signal
   * that mirrors `MoveChainChipRow`'s "Chain N" label and the
   * matching dot's PER-STEP color so the user can connect a review
   * card back to a specific dot in the chip-row chain without
   * tapping in.
   */
  chainBadge?: ChainBadgeInfo;
}

function IntentCard({
  intent,
  issues,
  showActions,
  onModify,
  onRemove,
  isRemoving,
  onApplyAutoFix,
  step,
  isFocused,
  onMeasuredY,
  displayLookup,
  calendarLookups,
  onPress,
  chainBadge,
}: IntentCardProps) {
  const tint = INTENT_TYPE_TINT[intent.intent_type];
  // PLAN-DEVIATION-NOTE: the chunk spec asks for "a brief flash of
  // the parent card's border in the scheduled-yellow color from
  // StatusColors". We pulse a static yellow border on for 1600ms via
  // a fade-out animation rather than a multi-cycle blink — calmer at
  // the focus zoom level (no epilepsy risk) and matches the FAB's
  // existing one-shot attention rhythm. This is consistent with the
  // dev-log spec ("brief flash"), not a divergence — no PLAN-DEVIATION
  // index entry needed.
  const flash = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isFocused) return;
    flash.setValue(1);
    const anim = Animated.timing(flash, {
      toValue: 0,
      duration: 1600,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [isFocused, flash]);
  const borderColor = isFocused
    ? flash.interpolate({
        inputRange: [0, 1],
        outputRange: ["transparent", StatusColors.scheduled],
      })
    : "transparent";
  const subjectLine = describeIntentSubject(
    intent,
    displayLookup,
    calendarLookups,
  );
  const headerBody = (
    <View style={styles.intentHeader}>
      {step !== undefined && (
        <View style={styles.stepBadge} testID={`intent-step-${intent.id}`}>
          <Text style={styles.stepBadgeText}>{step}</Text>
        </View>
      )}
      <View style={[styles.typeBadge, { backgroundColor: tint }]}>
        <Text
          style={styles.typeBadgeText}
          testID={`intent-type-${intent.id}`}
          numberOfLines={1}
        >
          {INTENT_TYPE_LABEL[intent.intent_type]}
        </Text>
      </View>
      {/* PR-UX-3 (2026-05-07): chain identity badge. Sits AFTER the
          intent-type pill (kind is the primary signal; chain
          membership is supporting metadata). Outlined / dim style
          keeps the type pill visually dominant. Cancel /
          personal_event_* intents never receive a `chainBadge`
          (they're filtered out of `detectMoveChains`'s chain-
          eligibility set) so this branch is naturally absent for
          those cards — no "no chain" placeholder needed. */}
      {chainBadge ? (
        <View
          style={styles.chainBadge}
          testID={`intent-chain-badge-${intent.id}`}
          accessibilityLabel={`Chain ${chainBadge.chainNumber}`}
        >
          <View
            style={[styles.chainBadgeDot, { backgroundColor: chainBadge.color }]}
            testID={`intent-chain-badge-dot-${intent.id}`}
          />
          <Text style={styles.chainBadgeText} numberOfLines={1}>
            {`Chain ${chainBadge.chainNumber}`}
          </Text>
        </View>
      ) : null}
      <Text style={styles.intentSubject} numberOfLines={1}>
        {subjectLine}
      </Text>
      {onPress ? (
        <MaterialIcons
          name="chevron-right"
          size={18}
          color="#9CA3AF"
          style={styles.intentSubjectChevron}
        />
      ) : null}
    </View>
  );
  return (
    <Animated.View
      style={[styles.intentCard, { borderColor, borderWidth: isFocused ? 2 : 0 }]}
      testID={`intent-card-${intent.id}`}
      onLayout={(e) => onMeasuredY?.(e.nativeEvent.layout.y)}
    >
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Open details for ${subjectLine}`}
          testID={`intent-press-${intent.id}`}
          style={({ pressed }) => [pressed && styles.intentCardPressed]}
          hitSlop={4}
        >
          {headerBody}
          <Text style={styles.intentDetail}>
            {describeIntentTarget(intent, calendarLookups)}
          </Text>
        </Pressable>
      ) : (
        <>
          {headerBody}
          <Text style={styles.intentDetail}>
            {describeIntentTarget(intent, calendarLookups)}
          </Text>
        </>
      )}

      {showActions && (
        <View style={styles.intentActions}>
          <Pressable
            onPress={onModify}
            style={({ pressed }) => [
              styles.intentActionBtn,
              styles.intentActionBtnSecondary,
              pressed && styles.intentActionBtnPressed,
            ]}
            accessibilityRole="button"
            testID={`intent-modify-${intent.id}`}
          >
            <Text style={styles.intentActionBtnText}>Modify</Text>
          </Pressable>
          <Pressable
            onPress={onRemove}
            disabled={isRemoving}
            style={({ pressed }) => [
              styles.intentActionBtn,
              styles.intentActionBtnDanger,
              isRemoving && styles.intentActionBtnDisabled,
              pressed && styles.intentActionBtnPressed,
            ]}
            accessibilityRole="button"
            testID={`intent-remove-${intent.id}`}
          >
            <Text style={[styles.intentActionBtnText, styles.intentActionBtnTextDanger]}>
              {isRemoving ? "Removing…" : "Remove"}
            </Text>
          </Pressable>
        </View>
      )}

      {issues.length > 0 && (
        <View style={styles.intentIssues}>
          {issues.map((issue, idx) => (
            <LinterEdgeCard
              key={`${intent.id}-${issue.kind}-${idx}`}
              issue={issue}
              onApplyAutoFix={
                onApplyAutoFix ? () => onApplyAutoFix(intent.id, issue) : undefined
              }
              displayLookups={calendarLookups}
            />
          ))}
        </View>
      )}
    </Animated.View>
  );
}

// ──────────────────────────────────────────────────────────────────
// Tabs
// ──────────────────────────────────────────────────────────────────

interface TabContentProps {
  intents: ReorganizationIntent[];
  linterIssues: LinterIssue[];
  onModify: (intentId: number) => void;
  onRemove: (intentId: number) => void;
  /**
   * PR-UX-19 (2026-05-09): id of the intent currently being removed
   * via `useRemoveReorganizationIntent`, or `null` when no removal
   * is pending. The matching card disables its Remove button and
   * shows a "Removing…" label. Other cards stay interactive — only
   * one Remove can be in flight at a time, but the user can still
   * keep working on the rest of the session while the BE round-trips.
   */
  removingIntentId: number | null;
  onApplyAutoFix: (intentId: number, issue: LinterIssue) => void;
  /**
   * P3-FE-8 (C.12): when the screen was opened with a
   * `?focusAppointmentId=…` deep link, this is the parsed numeric
   * appointment id. The tab finds the matching intent (if any),
   * highlights its IntentCard, and scrolls it into view. `null`
   * means no focus requested → no-op.
   */
  focusAppointmentId: number | null;
  /**
   * PR 3 (item #5): id → appointment lookup for friendly subject
   * lines and tap-to-detail navigation.
   */
  displayLookup: IntentDisplayLookup;
  /**
   * D2P-FE-13 follow-up (2026-04-26): name lookups derived from the
   * day-view query cache. Forwarded to every `IntentCard` so the
   * wire-format technician id, dates, times, and linter messages
   * render in user-friendly form.
   */
  calendarLookups: HumanizeLookups;
  /**
   * PR 3 (item #5): screen-level handler invoked when an intent card
   * is tapped. Receives the resolved appointment id (or null when
   * the intent doesn't target one — tab passes onPress=undefined in
   * that case so the card stays non-tappable).
   */
  onIntentPress: (appointmentId: number) => void;
  /**
   * PR-UX-3 (2026-05-07): screen-level lookup keyed by `intent.id`.
   * Computed ONCE at the screen level (`PendingRealityReviewScreen`)
   * so each tab + card render is an O(1) read, not an O(N) detector
   * re-run. Absent for non-chain-eligible intents (cancel /
   * personal_event_*). Same identity ordering as the chip-row's
   * `chainGlobalIndex`, so "Chain 1" on this screen always matches
   * "Chain 1" on the calendar.
   */
  chainBadgeByIntentId: ReadonlyMap<number, ChainBadgeInfo>;
  /**
   * PR-UX-20: count of intents that are 1-link clean chains with
   * zero conflicts. Drives the "Sweep clean ones" button visibility
   * threshold (≥2). Capped to the underlying `cleanIntents` list
   * length the screen passes down — the button is rendered when
   * this count ≥ 2 and the screen-level `onSweepClean` handler is
   * defined.
   */
  cleanIntentCount: number;
  /**
   * PR-UX-20: optional progress label shown on the Sweep button
   * while the screen-level handler is dispatching. `null` when no
   * sweep is in progress. Set by the screen during the sweep
   * loop.
   */
  sweepProgressLabel: string | null;
  /**
   * PR-UX-20: screen-level handler invoked when the user taps the
   * Sweep button. The handler owns the actual finalize/authorize
   * dispatch; the tab is just a render seam. Undefined when the
   * sweep should be hidden entirely (settings off, no clean
   * intents, etc.).
   */
  onSweepClean?: () => void;
}

// PR-UX-5 (2026-05-08): `FinalStateTab` was removed. The post-commit
// preview now lives on the calendar itself as the Now⇄Future toggle —
// see `app/(tabs)/index.tsx` and
// `src/components/calendar/NowFutureToggle.tsx`. The
// `groupByTarget` / `TargetGroup` helpers were the only consumers
// of that tab and were dropped alongside it.

function SequenceTab({
  intents,
  linterIssues,
  onModify,
  onRemove,
  removingIntentId,
  onApplyAutoFix,
  focusAppointmentId,
  displayLookup,
  calendarLookups,
  onIntentPress,
  chainBadgeByIntentId,
  cleanIntentCount,
  sweepProgressLabel,
  onSweepClean,
}: TabContentProps) {
  const ordered = useMemo(() => sortByCommitOrder(intents), [intents]);
  const scrollRef = useRef<ScrollView | null>(null);
  const focusedIntent = useMemo(
    () =>
      focusAppointmentId == null
        ? null
        : ordered.find((i) => i.appointment_id === focusAppointmentId) ?? null,
    [focusAppointmentId, ordered],
  );
  const handleFocusedY = (y: number) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
  };

  // PR-UX-11 (2026-05-09, originally 0372b77 from PR-UX-10): per-chain
  // dividers. The flat list above already labels each card with its
  // "Chain N" pill via `chainBadge`, but the user requested explicit
  // visual breaks between runs of cards belonging to different chains
  // so they can scan the SoO tab as "Chain 1 → Chain 2 → ..." rather
  // than as an undifferentiated wall. Implementation:
  //   - Group `ordered` into runs by `chainId` (cards without a
  //     chain assignment fall into a synthetic "no-chain" run that
  //     renders no header — they're individual non-chain intents
  //     like cancels / personal_event_*).
  //   - Render one `<ChainDivider>` ABOVE each run that has a
  //     chainBadge; the divider carries the chain number, color
  //     accent, and step count.
  //   - The §6.4.1 commit order is preserved (we group AFTER
  //     `sortByCommitOrder`), so a chain whose cards span multiple
  //     commit groups will paint multiple dividers — that's
  //     accurate and surfaces the cross-group ordering to the user.
  //
  // Anti-instructions:
  //   - Don't change the underlying `ordered` order to group by
  //     chain instead of commit order. The user's mental model for
  //     "the order the backend will apply" is fixed by §6.4.1; the
  //     dividers exist to visually punctuate that flat order, not
  //     to reorder it.
  //   - Don't hide the per-card "Chain N" pill once dividers ship.
  //     Cards may scroll past the divider header; the pill keeps
  //     the chain identity on every card.
  type RunEntry = {
    intent: ReorganizationIntent;
    isFocused: boolean;
    step: number;
  };
  type Run = {
    chainBadge: ChainBadgeInfo | null;
    entries: RunEntry[];
  };
  const runs: Run[] = [];
  ordered.forEach((intent, idx) => {
    const chainBadge = chainBadgeByIntentId.get(intent.id) ?? null;
    const isFocused = focusedIntent?.id === intent.id;
    const entry: RunEntry = { intent, isFocused, step: idx + 1 };
    const lastRun = runs.length > 0 ? runs[runs.length - 1] : null;
    const lastChainId = lastRun?.chainBadge?.chainId ?? null;
    const currChainId = chainBadge?.chainId ?? null;
    if (lastRun && lastChainId === currChainId) {
      lastRun.entries.push(entry);
    } else {
      runs.push({ chainBadge, entries: [entry] });
    }
  });
  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.tabContent}
      testID="review-tab-sequence"
    >
      <Text style={styles.tabHelpText}>
        The order the backend will apply these intents (§6.4.1):
        cancellations, then reschedules, then reassigns, then creates,
        then personal events. Tap the Now⇄Future toggle on the
        calendar tab to see the projected post-commit world.
      </Text>
      {/* PR-UX-20 + FE-CR-1-2: Sweep clean ones — only render when ≥2
          clean intents exist AND the screen passes a handler. The
          button now dispatches the per-intent commit endpoint
          (`commit-many`) with the clean-intent id list, so dirty
          intents in the same session are NOT swept. Replaces the
          all-or-nothing finalize call described by
          `2026-05-09-pr-ux-20-sweep-finalizes-session` (which the
          FE-CR-1-2 in-place "RESOLVED" callout in
          `docs/PLAN-DEVIATIONS.md` formally retires). */}
      {onSweepClean && cleanIntentCount >= 2 ? (
        <Pressable
          onPress={onSweepClean}
          disabled={sweepProgressLabel != null}
          accessibilityRole="button"
          testID="review-sweep-clean-ones"
          style={({ pressed }) => [
            styles.sweepBtn,
            sweepProgressLabel != null && styles.sweepBtnDisabled,
            pressed && styles.sweepBtnPressed,
          ]}
        >
          <MaterialIcons name="auto-awesome" size={18} color="#04220E" />
          <Text style={styles.sweepBtnText}>
            {sweepProgressLabel ?? `Sweep ${cleanIntentCount} clean moves`}
          </Text>
        </Pressable>
      ) : null}
      {runs.map((run, runIdx) => (
        <View
          key={`run-${runIdx}-${run.chainBadge?.chainId ?? "none"}`}
          testID={`review-sequence-run-${run.chainBadge?.chainNumber ?? "none"}`}
        >
          {run.chainBadge ? (
            <ChainDivider
              chainBadge={run.chainBadge}
              stepCount={run.entries.length}
            />
          ) : null}
          {run.entries.map(({ intent, isFocused, step }) => (
            <IntentCard
              key={intent.id}
              intent={intent}
              issues={issuesForIntent(intent, linterIssues)}
              showActions
              onModify={() => onModify(intent.id)}
              onRemove={() => onRemove(intent.id)}
              isRemoving={removingIntentId === intent.id}
              onApplyAutoFix={onApplyAutoFix}
              step={step}
              isFocused={isFocused}
              onMeasuredY={isFocused ? handleFocusedY : undefined}
              displayLookup={displayLookup}
              calendarLookups={calendarLookups}
              onPress={
                intent.appointment_id != null
                  ? () => onIntentPress(intent.appointment_id as number)
                  : undefined
              }
              chainBadge={chainBadgeByIntentId.get(intent.id)}
            />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

// PR-UX-11 (2026-05-09, originally 0372b77 from PR-UX-10): per-chain
// divider header used by SequenceTab. Renders a single colored bar +
// "Chain N · M steps" label between runs of cards belonging to
// different chains. The accent color matches the chain's seed color
// (`chainBadge.color`) so the user can connect this divider to the
// matching chip in `MoveChainChipRow` without tapping in.
function ChainDivider({
  chainBadge,
  stepCount,
}: {
  chainBadge: ChainBadgeInfo;
  stepCount: number;
}) {
  const stepLabel = stepCount === 1 ? "step" : "steps";
  return (
    <View
      style={styles.chainDivider}
      testID={`review-sequence-chain-divider-${chainBadge.chainNumber}`}
    >
      <View
        style={[
          styles.chainDividerAccent,
          { backgroundColor: chainBadge.color },
        ]}
      />
      <Text style={styles.chainDividerLabel}>
        Chain {chainBadge.chainNumber} · {stepCount} {stepLabel}
      </Text>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────
// Empty state
// ──────────────────────────────────────────────────────────────────

/**
 * Technician-role read-only landing for `/pending-reality/review`.
 *
 * Per §2.5 trust gradient (and the
 * 2026-04-24-ai-tab-list-only-render deviation in
 * `docs/PLAN-DEVIATIONS.md`), technicians do not get the AI tab —
 * they cannot Approve / Decline / Counter-propose AI suggestions.
 * That left a gap: when a tech taps a cyan-tinted appointment on
 * their day calendar (P3-FE-8 deep-link from
 * `app/(tabs)/index.tsx:916` / `2206`), the screen used to render
 * the FO-shaped `EmptyState` ("Drag a card to start composing"),
 * which is wrong on two counts:
 *
 *   1. Composing isn't relevant — the cyan overlay means SOMEONE
 *      ELSE already composed, the tech is here to find out who /
 *      what.
 *   2. Drag-to-stage on a tech's calendar would author a *new*
 *      tech-app session, not surface the FO/AI/customer-authored
 *      session whose overlay they tapped.
 *
 * Per the user (2026-04-27): "the pending reality isn't the right
 * screen that shows up" on the technician profile. The cyan
 * overlay is the source of truth visually; this screen now just
 * has to stop misdirecting the tech.
 *
 * What we render instead: a friendly read-only explainer that
 * names the source channel ("franchise owner" / "AI engine" /
 * "customer") and points the user back to the calendar canvas
 * where the per-card overlay carries the per-appointment detail.
 *
 * What we deliberately do NOT render:
 *   - A list of pending sessions (would require a new
 *     tech-scoped reorganization endpoint or expanding the
 *     existing FO endpoint's RBAC; out of scope for this fix).
 *   - Per-appointment intent counts (the BE annotation
 *     `pending_intent_summary` is already on every day-view tile
 *     the tech can see; counting them here would just duplicate
 *     what the cyan overlay communicates visually).
 */
function TechnicianReadOnlyState({
  onDismiss,
}: {
  onDismiss: () => void;
}) {
  return (
    <View
      style={styles.emptyContainer}
      testID="review-tech-readonly-state"
    >
      <View style={styles.emptyCard}>
        <View style={styles.techStateIconWrap}>
          <MaterialIcons name="visibility" size={28} color="#0E7490" />
        </View>
        <Text style={styles.emptyTitle}>Pending changes — read only</Text>
        <Text style={styles.emptyBody}>
          Appointments tinted{" "}
          <Text style={styles.techStateInlineCyan}>cyan</Text> on your
          calendar have a proposed change with your franchise owner. They
          stay on your schedule as-is until your FO approves, declines, or
          counter-proposes. You'll see the card update automatically as soon
          as a decision lands.
        </Text>
        <Text style={styles.techStateSubBody}>
          Tap the badge on any cyan appointment for details about who
          proposed the change.
        </Text>
        <Pressable
          onPress={onDismiss}
          style={({ pressed }) => [
            styles.emptyCta,
            pressed && styles.emptyCtaPressed,
          ]}
          accessibilityRole="button"
          testID="review-tech-readonly-cta"
        >
          <Text style={styles.emptyCtaText}>Back to calendar</Text>
        </Pressable>
      </View>
    </View>
  );
}

function EmptyState({ onDismiss }: { onDismiss: () => void }) {
  return (
    <View style={styles.emptyContainer} testID="review-empty-state">
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>Nothing pending yet</Text>
        <Text style={styles.emptyBody}>
          Drag a card on the calendar tab to start composing a Pending Reality
          session. Once you have at least one proposed change, it will show up
          here.
        </Text>
        <Pressable
          onPress={onDismiss}
          style={({ pressed }) => [
            styles.emptyCta,
            pressed && styles.emptyCtaPressed,
          ]}
          accessibilityRole="button"
          testID="review-empty-cta"
        >
          <Text style={styles.emptyCtaText}>Start drafting</Text>
        </Pressable>

        {/*
         * Dev-only seed buttons — no production producer of intents
         * exists yet (see plan handoff plan Tier 1C). These let
         * device smoke testing exercise the full FAB / HUD / review
         * pipeline today without hand-editing app/(tabs)/index.tsx
         * or wiring up form-sheet handoff (P3-FE-7).
         *
         * Mirrors the precedent set by
         * src/screens/_dev/LinterPrimitivesExample.tsx (P3-FE-5):
         * the seed data is hand-crafted (not derived from real
         * fixtures), one button per scenario, and the whole row is
         * stripped from the production bundle by `if (!__DEV__)
         * return null;` short-circuit.
         */}
        {__DEV__ ? <DevSeedRow /> : null}
      </View>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────
// __DEV__ seed surface (Tier 1C — temporary, removed by P3-FE-7)
// ──────────────────────────────────────────────────────────────────

/**
 * One reusable session shell. Real FE/BE tests build their own (see
 * `app/pending-reality/__tests__/review.test.tsx`); this is the
 * dev-only seed twin so the FAB / HUD / review pipeline can be
 * exercised on a real device today, before P3-FE-7 wires up the
 * form-sheet handoff that will be the real production producer.
 *
 * 2026-05-05 (PR-UX-2 PASS 2.9): `authorUserId` is now sourced from
 * the live `useAuthStore` user (with a `42` fallback for unauthenticated
 * dev runs). Previously hardcoded to `42` (a phantom tech) — that
 * caused any subsequent `op: modify_intent` call from the BE-backed
 * flows (PR-UX-2 ghost-drag, LinterEdgeCard "Apply auto-fix") to 403
 * with `only_author_can_edit`, because the live actor was the FO
 * the device was logged into and the BE compares `actor.userId` to
 * `session.author_user_id`. The companion BE change in
 * `fix/reorg-fo-edit-override` adds an FO-in-same-franchise
 * override so cross-author edits are also permitted; this FE change
 * keeps locally-attributed dev seeds honest at the source.
 */
function makeDevSession(authorUserId: number): ReorganizationSession {
  return {
    id: 99001,
    franchise_id: 1,
    author_user_id: authorUserId,
    source: "tech_app",
    status: "draft",
    required_authorizer_role: "self",
    eligible_committer_ids: [authorUserId],
    policy_snapshot: {
      tech_authored_self_only: "auto",
      tech_authored_cross_tech: "fo_review",
      tech_authored_with_cancel: "fo_review",
      customer_authored_single: "auto",
      customer_authored_multi: "fo_review",
      customer_authored_with_conflict: "fo_review",
      ai_authored: "always_fo_review",
    },
    idempotency_key: "dev-seed-99001",
    notes: "Seeded from review screen empty-state __DEV__ row.",
    template_id: null,
    related_session_id: null,
    source_metadata: { seeded_by: "dev_empty_state" },
    created_at: new Date().toISOString(),
    finalized_at: null,
    committed_at: null,
    cancelled_at: null,
    expires_at: null,
  };
}

/**
 * Per-source metadata harvested from the day-view so dev-seeded
 * destinations can land on the same date/tech as their source — keeps
 * the move-chain ghost destination tile inside whatever week the user
 * is currently viewing.
 *
 * 2026-05-05 (PR-UX-2 PASS 2.5): added `start`/`end` (HH:MM) so the
 * cascade-chain seed can pin one source's destination to another
 * source's *exact* current slot, which is the only way the chain
 * detector forms a multi-step trigger edge (dest overlaps src). The
 * existing single-step `Seed all intent kinds` button doesn't need
 * these — it uses hardcoded times — but harvesting them once at the
 * row level lets both seeds share one harvest pass.
 */
type DevSeedSourceMeta = {
  id: number;
  date: string;
  techId: number;
  start: string;
  end: string;
};

/**
 * Pure harvest used by `DevSeedRow` to pick one tech's "richest"
 * stack of today-or-later appointments out of a week response. Lifted
 * out of `useMemo` so the cascade-chain seed handler can re-derive it
 * AT CLICK TIME (not just at component render time) — see
 * `seedCascadeChain` for the full rationale.
 *
 * 2026-05-05 (PR-UX-2 PASS 2.14, post-mortem on the
 * "chain-506 / chain-510 split"): a `useMemo` snapshot taken at the
 * last calendar render could disagree with the *live* TanStack cache
 * by the time the user actually presses the seed button (e.g. another
 * reorganization session was committed between paint and tap). The
 * chain detector reads source slots from LIVE appointment data, so
 * any drift between the seed's frozen `intent[i].dest` and the live
 * `intent[i+1].source` shatters the cascade into two disconnected
 * chains. Harvesting at click time (and ideally awaiting a refetch
 * first) closes that race window. The function itself is pure so
 * it stays trivially testable.
 *
 * 2026-05-05 (PR-UX-2 PASS 2.15, post-mortem on the "chain seeded on
 * the wrong tech" symptom): without a `preferredTechId` the harvest
 * picked whichever tech had the most future appointments globally,
 * which could be a tech the user wasn't even looking at. The chain
 * would seed correctly server-side but every projected source/dest
 * rect on the workweek calendar (pinned to a different `resourceId`)
 * came back null, the overlay rendered zero arrows, and the user
 * saw a blank canvas. When `preferredTechId` is supplied AND that
 * tech has at least 2 future appointments (the minimum for a
 * cascade), we use it; otherwise we fall back to the busiest tech
 * so the button still produces SOMETHING the user can inspect.
 *
 * Exported for direct unit testing — see
 * `app/pending-reality/__tests__/review.test.tsx`.
 */
export function deriveWeekApptMetaForChain(
  weekData: CalendarDayResponse[] | undefined,
  todayKey: string,
  preferredTechId?: number | null,
): DevSeedSourceMeta[] {
  const days = weekData ?? [];
  const byTech = new Map<number, DevSeedSourceMeta[]>();
  for (const day of days) {
    if ((day.date ?? "") < todayKey) continue;
    for (const t of day.technicians ?? []) {
      for (const a of t.appointments ?? []) {
        if (a.id <= 0) continue;
        const apptDate = a.scheduled_date ?? day.date;
        if ((apptDate ?? "") < todayKey) continue;
        const start = a.scheduled_time?.slice(0, 5) ?? "09:00";
        const end = a.scheduled_end_time?.slice(0, 5) ?? "10:00";
        const meta: DevSeedSourceMeta = {
          id: a.id,
          date: apptDate ?? todayKey,
          techId: t.technician_id,
          start,
          end,
        };
        const arr = byTech.get(t.technician_id) ?? [];
        arr.push(meta);
        byTech.set(t.technician_id, arr);
      }
    }
  }
  // Tech-preference rule (PASS 2.15): the visible workweek tech wins
  // as long as they have ≥2 future appts (the minimum a cascade
  // chain needs to form). Otherwise fall back to the busiest tech so
  // the seed button still produces a visualization the user can
  // inspect — at the cost of landing on a different column. The
  // hint text in `DevSeedRow` surfaces the fallback so it's not
  // surprising.
  let bestTech: DevSeedSourceMeta[] = [];
  if (preferredTechId != null) {
    const preferred = byTech.get(preferredTechId);
    if (preferred && preferred.length >= 2) bestTech = preferred;
  }
  if (bestTech.length === 0) {
    for (const arr of byTech.values()) {
      if (arr.length > bestTech.length) bestTech = arr;
    }
  }
  bestTech.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.start < b.start ? -1 : 1;
  });
  return bestTech.slice(0, 6);
}

/**
 * Build one intent of each `ReorganizationIntentType` the linter is
 * known to flag — the order intentionally mirrors the §6.4.1 commit
 * order so the Sequence tab renders the seeded session in canonical
 * order on first paint. Includes a combo-reschedule (group 3) so
 * the §6.4.1 sub-bucket is exercised.
 */
function makeDevAllIntentKinds(
  sessionId: number,
  realApptMeta: DevSeedSourceMeta[] = [],
): ReorganizationIntent[] {
  // 2026-04-25 fix: when real appointment IDs from today's day-view are
  // available, substitute them for the synthetic 5001..5004 placeholders
  // so `useIntentDisplayLookup` can resolve customer names and the
  // tap-to-detail navigation actually opens an order screen instead of
  // landing on a blank "Order not found" page. If fewer than 4 reals
  // are available we keep the synthetics for the missing slots so the
  // intent count stays stable for sequence-tab tests.
  //
  // 2026-05-04 (PR-UX-2 PASS 2.1): destinations now use the source's
  // own scheduled_date so the move-chain ghost tile lands inside the
  // currently-visible week (previously hardcoded to 2026-04-25, which
  // dropped the ghost off-screen for every week ≠ that one). For
  // reassign we keep the source's date too so its ghost shows up on a
  // day-view (multi-tech) without re-navigating. The fallback dest
  // date is "today" — the only date that's always loadable in the
  // calendar's default view.
  const id = (slot: number, fallback: number) =>
    realApptMeta[slot]?.id ?? fallback;
  const todayKey = (() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  })();
  const destDate = (slot: number) => realApptMeta[slot]?.date ?? todayKey;
  const destTech = (slot: number) => realApptMeta[slot]?.techId ?? 5;
  const proposedAt = new Date().toISOString();
  return [
    {
      id: 99100,
      session_id: sessionId,
      intent_type: "cancel",
      intent_status: "proposed",
      appointment_id: id(0, 5001),
      personal_event_id: null,
      payload: {
        kind: "cancel",
        cancellation_reason: "customer_request",
        cancellation_note: "Customer rescheduled via phone.",
      },
      inverse_payload: null,
      prior_state_snapshot: null,
      linter_dependency_edges: [],
      commit_order: null,
      proposed_at: proposedAt,
      committed_at: null,
      chain_id: "",
    },
    {
      id: 99101,
      session_id: sessionId,
      intent_type: "reschedule",
      intent_status: "proposed",
      appointment_id: id(1, 5002),
      personal_event_id: null,
      payload: {
        kind: "reschedule",
        new_scheduled_date: destDate(1),
        new_start_time: "09:00",
        new_end_time: "10:00",
      },
      inverse_payload: null,
      prior_state_snapshot: null,
      linter_dependency_edges: [],
      commit_order: null,
      proposed_at: proposedAt,
      committed_at: null,
      chain_id: "",
    },
    {
      id: 99102,
      session_id: sessionId,
      intent_type: "reschedule",
      intent_status: "proposed",
      appointment_id: id(2, 5003),
      personal_event_id: null,
      payload: {
        kind: "reschedule",
        new_scheduled_date: destDate(2),
        new_start_time: "13:00",
        new_end_time: "14:00",
        // Same tech as source so the ghost lands on the source's column
        // in workweek view. (Previously pinned to tech 8 which moved
        // the ghost off the source's workweek.)
        new_technician_id: destTech(2),
      },
      inverse_payload: null,
      prior_state_snapshot: null,
      linter_dependency_edges: [],
      commit_order: null,
      proposed_at: proposedAt,
      committed_at: null,
      chain_id: "",
    },
    {
      id: 99103,
      session_id: sessionId,
      intent_type: "reassign",
      intent_status: "proposed",
      appointment_id: id(3, 5004),
      personal_event_id: null,
      payload: {
        kind: "reassign",
        // Pin reassign destination to the FIRST source's tech so the
        // ghost lands on a tech that's commonly visible (tech[0] of
        // the day-view = first column on day-view, first selectable on
        // workweek). If we left this hardcoded to 7 the ghost would
        // disappear into a column the user is rarely viewing.
        new_technician_id: destTech(0),
        dispatcher_reason: "Tech 5 has overlapping window.",
      },
      inverse_payload: null,
      prior_state_snapshot: null,
      linter_dependency_edges: [],
      commit_order: null,
      proposed_at: proposedAt,
      committed_at: null,
      chain_id: "",
    },
    {
      id: 99104,
      session_id: sessionId,
      intent_type: "create",
      intent_status: "proposed",
      appointment_id: null,
      personal_event_id: null,
      payload: {
        kind: "create",
        customer_id: 9001,
        // Anchor create to tech[0] / source[0]'s date so the ghost
        // tile lands inside the visible day/workweek without any
        // navigation gymnastics.
        technician_id: destTech(0),
        scheduled_date: destDate(0),
        scheduled_start_time: "11:00",
        scheduled_end_time: "12:00",
        service_ids: [1],
      },
      inverse_payload: null,
      prior_state_snapshot: null,
      linter_dependency_edges: [],
      commit_order: null,
      proposed_at: proposedAt,
      committed_at: null,
      chain_id: "",
    },
    {
      id: 99105,
      session_id: sessionId,
      intent_type: "personal_event_delete",
      intent_status: "proposed",
      appointment_id: null,
      personal_event_id: "pe-dev-aaa",
      payload: {
        kind: "personal_event_delete",
        version: 3,
      },
      inverse_payload: null,
      prior_state_snapshot: null,
      linter_dependency_edges: [],
      commit_order: null,
      proposed_at: proposedAt,
      committed_at: null,
      chain_id: "",
    },
    {
      id: 99106,
      session_id: sessionId,
      intent_type: "personal_event_update",
      intent_status: "proposed",
      appointment_id: null,
      personal_event_id: "pe-dev-bbb",
      payload: {
        kind: "personal_event_update",
        version: 2,
        patch: { title: "Updated lunch slot" },
      },
      inverse_payload: null,
      prior_state_snapshot: null,
      linter_dependency_edges: [],
      commit_order: null,
      proposed_at: proposedAt,
      committed_at: null,
      chain_id: "",
    },
    {
      id: 99107,
      session_id: sessionId,
      intent_type: "personal_event_create",
      intent_status: "proposed",
      appointment_id: null,
      personal_event_id: "pe-dev-ccc",
      payload: {
        kind: "personal_event_create",
        technician_id: destTech(0),
        scheduled_date: destDate(0),
        start_time: "13:00",
        end_time: "14:00",
        title: "Personal block",
        category: "personal",
      },
      inverse_payload: null,
      prior_state_snapshot: null,
      linter_dependency_edges: [],
      commit_order: null,
      proposed_at: proposedAt,
      committed_at: null,
      chain_id: "",
    },
  ];
}

/**
 * 2026-05-05 (PR-UX-2 PASS 2.5): build a deterministic cascading
 * move chain so the chip row's multi-step rendering can actually be
 * tested. The existing `makeDevAllIntentKinds` builder produces one
 * intent per kind, none of which geometrically chain because each
 * one rewrites a *different* source slot to unrelated coordinates.
 * A multi-step chain requires intents whose *destinations* land on
 * top of *another intent's source slot*, recursively.
 *
 * For N >= 2 harvested appointments this function emits N intents:
 *
 *   - C[i] for i in [0..N-2]: reschedule appt[i] → appt[i+1]'s
 *           exact current slot (date + tech + start + end). Each
 *           one creates the trigger edge C[i] → C[i+1].
 *   - C[N-1]: reschedule appt[N-1] → a guaranteed-empty slot 14
 *           days beyond the latest harvested source date, at
 *           23:00–23:30 on the chain's tech (terminator).
 *
 * The detector walks C0 → C1 → … → C[N-1] as one linear chain
 * (`intentIds` length N), the chip row labels it `Chain 1 (N)`,
 * and on the workweek canvas you'll see N source tiles + N ghost
 * destinations + N-1 arrows in a single chain color.
 *
 * 2026-05-05 (PR-UX-2 PASS 2.10): caller supplies up to 6 sources
 * harvested across the whole current week (one tech, one per day
 * where possible) so the chain visibly spans multiple day-columns
 * in the workweek view. The minimum was lowered from 3 to 2 — a
 * 2-step chain still demonstrates source/dest/arrow rendering even
 * if the week only has two future appointments for the chosen tech.
 *
 * 2026-05-05 (PR-UX-2 PASS 2.13): terminator destination moved
 * OFF the chain's own date window. The PASS 2.5 default of
 * 07:00–08:00 on `sources[N-1].date` silently created a CYCLE
 * in the chain graph any time the harvest included a source
 * whose start time fell before 08:00 (e.g. a 06:55 first appt
 * of the day). With the cycle, every intent gains an incoming
 * edge → no seed candidates → `detectMoveChains` returns ZERO
 * chains → the chip row vanishes (or, worse, returns a partial
 * chain via split-displaced seeding that excludes the late
 * sources, leaving the would-be-terminator card with no chain
 * border because its intent is no longer a member of any
 * `chain.intentIds` and falls through `applyMoveChainBorderOverride`'s
 * `dimOrExempt("intent-not-in-any-chain")` branch — which then
 * returns `base` because the card overlaps the active intermediate
 * ghost). Pushing the terminator 14 days beyond the latest source
 * date AND to 23:00–23:30 (close-of-business) makes overlap
 * impossible against any plausible harvest, eliminating the
 * entire class of cycle-induced "last card has no border" bugs.
 * Anti-instruction: do NOT revert the terminator to the chain's
 * own date or the early-morning slot — the prior layout produced
 * the user-reported "Sophia Patel has cyan tint but no chain
 * border" regression on 2026-05-05.
 *
 * If fewer than 2 real appointments are harvested (e.g. the
 * week-view hasn't loaded yet), returns an empty array and the
 * button no-ops. The hint text in the row already tells the user
 * to open the calendar first.
 */
/**
 * 2026-05-05 (PR-UX-2 PASS 2.17): the cascade-seed terminator
 * placement window MUST match the *visible* workweek the user is
 * staring at — NOT the 7-day fetch range of `useFranchiseWeekView`.
 * The portrait workweek view paints exactly 4 columns starting at
 * the Monday of the calendar's `selectedDate` (see the
 * `workweekStartDate` `useMemo` in `app/(tabs)/index.tsx`); the
 * landscape view does the same. Without matching this window
 * exactly, the picker can plant the terminator on a fetched-but-
 * not-rendered day (e.g. Sunday May 10 of the 7-day fetch when the
 * visible window is Mon May 4 – Thu May 7) and the geometry helper
 * correctly returns `destRect: null` → an off-screen-right stub at
 * the canvas edge — which is exactly the on-device repro this pass
 * is fixing. Exported for testing.
 */
const WORKWEEK_VISIBLE_DAYS = 4;
export function visibleWorkweekWindow(selectedDate: string): string[] {
  const parts = selectedDate.split("-").map((s) => Number.parseInt(s, 10));
  const y = parts[0] ?? 1970;
  const m = (parts[1] ?? 1) - 1;
  const d = parts[2] ?? 1;
  const dt = new Date(y, m, d);
  // JS `getDay()` is 0 = Sun, 1 = Mon, ..., 6 = Sat.
  // Same Monday-anchor formula used by `app/(tabs)/index.tsx`'s
  // `workweekStartDate` `useMemo` — keep them in lockstep.
  const dow = dt.getDay();
  const offsetToMonday = dow === 0 ? 6 : dow - 1;
  dt.setDate(dt.getDate() - offsetToMonday);
  const out: string[] = [];
  for (let i = 0; i < WORKWEEK_VISIBLE_DAYS; i++) {
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    out.push(`${yy}-${mm}-${dd}`);
    dt.setDate(dt.getDate() + 1);
  }
  return out;
}

function parseHmToMin(value: string): number {
  const parts = value.split(":");
  const h = Number.parseInt(parts[0] ?? "0", 10);
  const m = Number.parseInt(parts[1] ?? "0", 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function minToHm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * 2026-05-05 (PR-UX-2 PASS 2.19): pick a terminator destination
 * slot that is BOTH inside the visible workweek window (PASS 2.17
 * date contract) AND visually adjacent to the existing chain
 * destinations on the terminator's tech (the "cluster"). PASS 2.16
 * solved the off-screen-right symptom by clamping the date to the
 * visible window. PASS 2.19 solves the off-screen-bottom symptom
 * the same fix introduced: the previous "22:00 floor + 23:30 cap"
 * placement guaranteed correct cycle-protection (no overlap with
 * working-hours appointments) but parked the terminator at the
 * bottom of the day's column, far below the user's scroll position
 * and far from the rest of the chain. The user's report:
 *
 *   "I don't understand how you're struggling so much with this
 *   arrow bug…"  (the screenshot showed the terminator at 22:00 on
 *   the right date, but with the user scrolled to the cluster
 *   around 14:00; the last arrow shot straight down off the bottom
 *   of the visible scroll area.)
 *
 * Algorithm:
 *   1. Past-protection: filter `weekDayKeys` to those on-or-after
 *      the latest harvested source date.
 *   2. For each candidate day, count the chain-destination cluster
 *      on (day, terminatorTech). Order days by: most cluster first,
 *      ties broken by later date (matches "terminator is the end
 *      of the chain" mental model). Days with zero cluster are
 *      tried last in latest-first order.
 *   3. For each ordered day, run the cluster-adjacent slot search:
 *        a. Compute the cluster's earliest-start, latest-end, and
 *           midpoint centroid on (day, terminatorTech).
 *        b. Try the slot directly AFTER the latest cluster end
 *           (`ceil(latestEnd/30)*30`). Accept if it fits inside
 *           working hours [07:00, 20:00] AND doesn't collide with
 *           any source/destination on (day, terminatorTech).
 *        c. Try the slot directly BEFORE the earliest cluster start
 *           (`floor(earliestStart/30)*30 - 30`). Same accept test.
 *        d. Snap centroid to the 30-min grid and walk outward
 *           ±SLOT_LEN at a time, returning the first non-colliding
 *           in-working-hours slot.
 *   4. If no working-hours slot fits on any candidate day, fall
 *      back to the legacy late-evening band: ordered days again,
 *      but this time slot floor is `max(latestEnd, 22:00)`, cap is
 *      `23:30`. Result is flagged `fallback: true` so the caller
 *      can warn AND surface "(fallback — tight day, terminator at
 *      10 PM)" in the seed-button hint text.
 *   5. If even the fallback band is exhausted on every candidate
 *      day, return `null` — the integrated `makeDevCascadeChain`
 *      has its own last-ditch placement that keeps the seed flow
 *      working in degenerate test fixtures.
 *
 * The chain destinations are derived as `sources.slice(1)` because
 * the cascade construction in `makeDevCascadeChain` always uses
 * `intent[i].destination = source[i + 1]` for `i < N-1` (the
 * terminator is `intent[N-1]`, which is what we're computing). All
 * sources are also added to the blocker set: cycle-protection still
 * forbids overlap with any harvested source slot on the same
 * tech/day, even though the chain semantics will move those
 * appointments away on commit.
 *
 * Exported for direct unit testing.
 */
export type TerminatorSlotResult = {
  date: string;
  start: string;
  end: string;
  /**
   * `true` when the cluster-adjacent working-hours search found
   * nothing on any candidate day and the picker fell back to the
   * 22:00–23:30 late-evening band (always visually below the user's
   * scroll position). The caller surfaces this in `__DEV__` warns
   * AND in the seed-button hint text so an off-bottom arrow is
   * never a surprise.
   */
  fallback: boolean;
};

const WORK_FLOOR_MIN = 7 * 60; // 07:00 — bottom of the working-hours band
const WORK_CAP_END_MIN = 20 * 60; // 20:00 — top of the working-hours band
const FALLBACK_FLOOR_MIN = 22 * 60; // 22:00 — bottom of the legacy late-evening band
const FALLBACK_CAP_END_MIN = 23 * 60 + 30; // 23:30 — never crosses midnight
const SLOT_LEN = 30;

type SlotBlocker = Pick<DevSeedSourceMeta, "date" | "techId" | "start" | "end">;

function slotOverlapsAny(
  date: string,
  techId: number,
  startMin: number,
  endMin: number,
  blockers: ReadonlyArray<SlotBlocker>,
): boolean {
  for (const b of blockers) {
    if (b.date !== date || b.techId !== techId) continue;
    const bStart = parseHmToMin(b.start);
    const bEnd = parseHmToMin(b.end);
    // Half-open overlap test: A = [aS, aE), B = [bS, bE) intersect iff
    // aS < bE && bS < aE. Touching boundaries (aE === bS) do NOT
    // overlap and are OK — that's exactly the "directly after the
    // latest destination" slot we want for cluster adjacency.
    if (startMin < bEnd && bStart < endMin) return true;
  }
  return false;
}

function findClusterAdjacentSlot(
  day: string,
  techId: number,
  cluster: ReadonlyArray<SlotBlocker>,
  blockers: ReadonlyArray<SlotBlocker>,
): { startMin: number; endMin: number } | null {
  let centroidMin: number;
  let afterCluster: number | null = null;
  let beforeCluster: number | null = null;
  if (cluster.length > 0) {
    let earliestStart = Infinity;
    let latestEnd = -Infinity;
    let sumMid = 0;
    for (const c of cluster) {
      const s = parseHmToMin(c.start);
      const e = parseHmToMin(c.end);
      if (s < earliestStart) earliestStart = s;
      if (e > latestEnd) latestEnd = e;
      sumMid += (s + e) / 2;
    }
    centroidMin = sumMid / cluster.length;
    afterCluster = Math.ceil(latestEnd / SLOT_LEN) * SLOT_LEN;
    beforeCluster =
      Math.floor(earliestStart / SLOT_LEN) * SLOT_LEN - SLOT_LEN;
  } else {
    // No cluster on this day — anchor mid-day so the slot lands
    // somewhere a user reading the day column would naturally see.
    centroidMin = 12 * 60;
  }

  const tried = new Set<number>();
  const tryAt = (
    startMin: number,
  ): { startMin: number; endMin: number } | null => {
    if (tried.has(startMin)) return null;
    tried.add(startMin);
    const endMin = startMin + SLOT_LEN;
    if (startMin < WORK_FLOOR_MIN) return null;
    if (endMin > WORK_CAP_END_MIN) return null;
    if (slotOverlapsAny(day, techId, startMin, endMin, blockers)) return null;
    return { startMin, endMin };
  };

  if (afterCluster != null) {
    const r = tryAt(afterCluster);
    if (r) return r;
  }
  if (beforeCluster != null) {
    const r = tryAt(beforeCluster);
    if (r) return r;
  }
  const centerSnap = Math.round(centroidMin / SLOT_LEN) * SLOT_LEN;
  const centerHit = tryAt(centerSnap);
  if (centerHit) return centerHit;
  // Outward walk — alternate +/- by SLOT_LEN until we hit a working-
  // hours slot or run off both ends. Max radius is bounded by the
  // working-hours band itself, so this halts in O((CAP - FLOOR) / SLOT).
  const maxRadius = Math.ceil(
    (WORK_CAP_END_MIN - WORK_FLOOR_MIN) / SLOT_LEN,
  );
  for (let step = 1; step <= maxRadius; step++) {
    const upHit = tryAt(centerSnap + step * SLOT_LEN);
    if (upHit) return upHit;
    const downHit = tryAt(centerSnap - step * SLOT_LEN);
    if (downHit) return downHit;
  }
  return null;
}

export function pickInWindowTerminatorSlot(
  weekDayKeys: readonly string[],
  sources: readonly DevSeedSourceMeta[],
): TerminatorSlotResult | null {
  if (sources.length === 0) return null;
  // Defensive max-by-date instead of `sources[length-1]` — callers
  // (e.g. `deriveWeekApptMetaForChain`) pre-sort, but the contract
  // is "latest source", not "last array entry".
  let latestSourceDate = sources[0].date;
  for (const s of sources) {
    if (s.date > latestSourceDate) latestSourceDate = s.date;
  }
  const candidates = [...weekDayKeys]
    .filter((d) => d >= latestSourceDate)
    .sort();
  if (candidates.length === 0) return null;

  const terminatorTechId = sources[sources.length - 1].techId;
  // Cascade contract: `intent[i].destination = source[i + 1]` for
  // `i < N - 1`. So chain destinations (excluding the terminator,
  // which is what we're computing) are exactly `sources.slice(1)`.
  const chainDests: SlotBlocker[] = sources.slice(1).map((s) => ({
    date: s.date,
    techId: s.techId,
    start: s.start,
    end: s.end,
  }));
  // Cycle-protection: terminator must not overlap any source slot
  // OR any chain destination slot on the same tech/day. With the
  // current chain construction these collapse to the same set
  // (`dest[i] === source[i + 1]`), but the union is the
  // forward-compatible expression — if a future caller threads in a
  // dest that diverges from a source, we still cover it.
  const blockers: SlotBlocker[] = [
    ...sources.map((s) => ({
      date: s.date,
      techId: s.techId,
      start: s.start,
      end: s.end,
    })),
    ...chainDests,
  ];

  // Order candidates by cluster density on (day, terminatorTech),
  // then by latest date for ties — anchors the search to the day
  // the user is most likely reading the chain on.
  const dayClusterCount = new Map<string, number>();
  for (const day of candidates) {
    let n = 0;
    for (const d of chainDests) {
      if (d.date === day && d.techId === terminatorTechId) n++;
    }
    dayClusterCount.set(day, n);
  }
  const orderedDays = [...candidates].sort((a, b) => {
    const ca = dayClusterCount.get(a) ?? 0;
    const cb = dayClusterCount.get(b) ?? 0;
    if (cb !== ca) return cb - ca;
    return b.localeCompare(a);
  });

  // Pass 1: cluster-adjacent working-hours search.
  for (const day of orderedDays) {
    const dayCluster = chainDests.filter(
      (d) => d.date === day && d.techId === terminatorTechId,
    );
    const slot = findClusterAdjacentSlot(
      day,
      terminatorTechId,
      dayCluster,
      blockers,
    );
    if (slot) {
      return {
        date: day,
        start: minToHm(slot.startMin),
        end: minToHm(slot.endMin),
        fallback: false,
      };
    }
  }

  // Pass 2: legacy 22:00–23:30 fallback band, in the SAME ordered-
  // by-cluster order so the terminator at least anchors to the
  // cluster's day even when its time slot has to drop below the
  // visible scroll position.
  for (const day of orderedDays) {
    let latestEndMin = 0;
    for (const b of blockers) {
      if (b.date !== day || b.techId !== terminatorTechId) continue;
      const m = parseHmToMin(b.end);
      if (m > latestEndMin) latestEndMin = m;
    }
    const floor = Math.max(latestEndMin, FALLBACK_FLOOR_MIN);
    const startMin = Math.ceil(floor / SLOT_LEN) * SLOT_LEN;
    const endMin = startMin + SLOT_LEN;
    if (endMin <= FALLBACK_CAP_END_MIN) {
      return {
        date: day,
        start: minToHm(startMin),
        end: minToHm(endMin),
        fallback: true,
      };
    }
  }
  return null;
}

/**
 * Exported for direct unit testing — see
 * `app/pending-reality/__tests__/review.test.tsx`.
 */
export function makeDevCascadeChain(
  sessionId: number,
  realApptMeta: DevSeedSourceMeta[] = [],
  weekDayKeys: readonly string[] = [],
): ReorganizationIntent[] {
  if (realApptMeta.length < 2) return [];
  const proposedAt = new Date().toISOString();
  // Cap at 6 — beyond that the chain detector still works but the
  // chip row + arrow overlay get crowded on a phone-width screen.
  const sources = realApptMeta.slice(0, 6);
  // PR-UX-2 PASS 2.19 (2026-05-05): terminator destination is now
  // anchored cluster-adjacently inside working hours [07:00, 20:00]
  // on the visible-window day with the most chain destinations on
  // the terminator's tech (so all 6 ghosts + 6 arrows visibly cluster
  // together as one group). PASS 2.16 had relocated the terminator
  // to a 22:00–23:30 late-evening slot to avoid working-hours
  // collisions, but that placement reads as off-bottom for the user
  // who is scrolled to the cluster around 14:00. The new picker
  // tries cluster-adjacent slots first (after-cluster, before-
  // cluster, then centroid-outward) and only falls back to the
  // 22:00–23:30 band when the day is genuinely too packed for any
  // working-hours slot. The fallback is surfaced both via `__DEV__`
  // warn here AND via the seedHint preview in `DevSeedRow`. See
  // `pickInWindowTerminatorSlot` for the full algorithm.
  const terminatorTechId = sources[sources.length - 1].techId;
  const picked = pickInWindowTerminatorSlot(weekDayKeys, sources);
  let terminatorDate: string;
  let terminatorStart: string;
  let terminatorEnd: string;
  if (picked) {
    terminatorDate = picked.date;
    terminatorStart = picked.start;
    terminatorEnd = picked.end;
    if (__DEV__ && picked.fallback) {
      console.warn(
        "[DEBUG:Review/DevSeed] cascade terminator: cluster-adjacent search exhausted; using 22:00–23:30 fallback band — terminator may render below user's scroll",
        { weekDayKeys, terminator: picked },
      );
    }
  } else {
    // Picker returned null only when sources are empty, no candidate
    // day passes past-protection, or even the fallback band is full
    // on every candidate day. Last-ditch placement so seeding still
    // completes in degenerate test fixtures (e.g. empty
    // `weekDayKeys`).
    let latestSourceDate = sources[0].date;
    for (const s of sources) {
      if (s.date > latestSourceDate) latestSourceDate = s.date;
    }
    if (__DEV__ && weekDayKeys.length > 0) {
      console.warn(
        "[DEBUG:Review/DevSeed] cascade terminator: no in-window slot fits at all; last-ditch fallback to latest-source-date 22:30–23:00",
        { weekDayKeys, latestSourceDate },
      );
    }
    terminatorDate = latestSourceDate;
    terminatorStart = "22:30";
    terminatorEnd = "23:00";
  }

  const intents: ReorganizationIntent[] = [];
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const isTerminator = i === sources.length - 1;
    const dst = isTerminator
      ? {
          date: terminatorDate,
          techId: terminatorTechId,
          start: terminatorStart,
          end: terminatorEnd,
        }
      : {
          date: sources[i + 1].date,
          techId: sources[i + 1].techId,
          start: sources[i + 1].start,
          end: sources[i + 1].end,
        };
    intents.push({
      id: 99200 + i,
      session_id: sessionId,
      intent_type: "reschedule",
      intent_status: "proposed",
      appointment_id: src.id,
      personal_event_id: null,
      payload: {
        kind: "reschedule",
        new_scheduled_date: dst.date,
        new_start_time: dst.start,
        new_end_time: dst.end,
        new_technician_id: dst.techId,
      },
      inverse_payload: null,
      prior_state_snapshot: null,
      linter_dependency_edges: [],
      commit_order: null,
      proposed_at: proposedAt,
      committed_at: null,
      chain_id: "",
    });
  }
  return intents;
}

// ─────────────────────────────────────────────────────────────────────
// PR-UX-3 (2026-05-07): multi-tech cascade-chain seed.
//
// Sibling to `makeDevCascadeChain` above. Where the single-tech seed
// keeps every step on one resource column (so the chain can be read
// without ever switching techs), the multi-tech seed deliberately
// hops between three techs in the LOCKED sequence
//   T_A → T_B → T_A → T_B → T_C → T_A → T_C
// (7 links, 6 tech changes — every transition pattern across three
// techs is exercised). T_A / T_B / T_C are the three techs in the
// franchise's roster with the most today-or-later appointments at
// harvest time, sorted by count descending. The original handoff doc
// names them Josh / Todd / Trey for narrative purposes, but the seed
// is roster-agnostic.
//
// See `pr-ux-3-multi-tech-handoff.md` §1.A5 + §10.A5 of
// `multi-tech-move-chain-plan.md` for the full design spec, including
// why 7 steps and 4 days were specifically chosen over the 6×3 sketch
// in §4.Q5.
// ─────────────────────────────────────────────────────────────────────

/**
 * The 7-step tech sequence as indices into the resolved `[T_A, T_B,
 * T_C]` triple. Each entry picks which tech owns the SOURCE
 * appointment for that step; the destination is the slot of the
 * NEXT step's source (cascade rule), or the terminator picker's
 * output for the final step.
 *
 * The sequence is locked (handoff doc §1.A5). Don't reshape without
 * a fresh design pass — the 3/2/2 (T_A / T_B / T_C) appointment
 * count is also part of the seed's contract: it tells the harvest
 * how many appts each top-3 tech needs. If you flip indices around,
 * update the `requiredCount` math below to match.
 */
const PR_UX_3_MULTI_TECH_SEQUENCE: ReadonlyArray<0 | 1 | 2> = [
  0, 1, 0, 1, 2, 0, 2,
] as const;

/**
 * Multi-tech harvest sibling to `deriveWeekApptMetaForChain`.
 *
 * Walks every today-or-later appointment in `weekData`, groups by
 * `technician_id`, and returns:
 *
 *   - `byTech` — full Map of every tech to their chronologically
 *     sorted appointments. The seeder picks from this map by tech
 *     id without re-scanning the full week response.
 *   - `techIdsByCount` — every tech id sorted by appointment count
 *     descending, ties broken by tech id ascending. The seed builder
 *     uses the FIRST THREE entries of this list as `[T_A, T_B, T_C]`,
 *     so chronologically-rich techs anchor the chain.
 *
 * The function is pure (no React, no I/O) — same testability bar as
 * `deriveWeekApptMetaForChain`. Unlike the single-tech harvest, this
 * one does NOT take a `preferredTechId` arg. The locked sequence
 * needs THREE techs simultaneously; tying the seed to "whatever tech
 * the user happens to be viewing" doesn't translate cleanly to a
 * cross-tech demo. The PR-UX-3 dev toggle in `DevSeedRow` deliberately
 * ignores the workweek-tech selection for that reason.
 */
export function deriveWeekApptMetaForMultiTechChain(
  weekData: CalendarDayResponse[] | undefined,
  todayKey: string,
): { byTech: Map<number, DevSeedSourceMeta[]>; techIdsByCount: number[] } {
  const days = weekData ?? [];
  const byTech = new Map<number, DevSeedSourceMeta[]>();
  for (const day of days) {
    if ((day.date ?? "") < todayKey) continue;
    for (const t of day.technicians ?? []) {
      for (const a of t.appointments ?? []) {
        if (a.id <= 0) continue;
        const apptDate = a.scheduled_date ?? day.date;
        if ((apptDate ?? "") < todayKey) continue;
        const start = a.scheduled_time?.slice(0, 5) ?? "09:00";
        const end = a.scheduled_end_time?.slice(0, 5) ?? "10:00";
        const meta: DevSeedSourceMeta = {
          id: a.id,
          date: apptDate ?? todayKey,
          techId: t.technician_id,
          start,
          end,
        };
        const arr = byTech.get(t.technician_id) ?? [];
        arr.push(meta);
        byTech.set(t.technician_id, arr);
      }
    }
  }
  for (const arr of byTech.values()) {
    arr.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.start < b.start ? -1 : 1;
    });
  }
  const techIdsByCount = Array.from(byTech.keys()).sort((a, b) => {
    const ca = byTech.get(a)?.length ?? 0;
    const cb = byTech.get(b)?.length ?? 0;
    if (ca !== cb) return cb - ca;
    return a - b;
  });
  return { byTech, techIdsByCount };
}

/**
 * Per-tech minimum appointment count required to satisfy the locked
 * 7-step sequence. Index `k` is the count for `techIdsByCount[k]`.
 * Derived once from `PR_UX_3_MULTI_TECH_SEQUENCE` at module load so a
 * sequence reshape can't drift the count out of sync.
 */
const PR_UX_3_MULTI_TECH_REQUIRED_COUNTS: ReadonlyArray<number> = (() => {
  const counts = [0, 0, 0];
  for (const idx of PR_UX_3_MULTI_TECH_SEQUENCE) counts[idx] += 1;
  return counts;
})();

/**
 * Multi-tech feasibility check. Returns the resolved `[T_A, T_B, T_C]`
 * triple when the harvest has enough appointments on the top 3 techs
 * to cover the locked sequence; otherwise returns null with a
 * structured shortfall description so `DevSeedRow`'s hint text can
 * tell the user exactly what's missing.
 *
 * Exported for direct unit testing.
 */
export type MultiTechFeasibility =
  | {
      ok: true;
      techIds: readonly [number, number, number];
      countsRequired: readonly [number, number, number];
      countsAvailable: readonly [number, number, number];
    }
  | {
      ok: false;
      reason: "insufficient_techs" | "insufficient_appts_per_tech";
      techIdsAvailable: readonly number[];
      countsRequired: readonly number[];
      countsAvailable: readonly number[];
    };

export function checkMultiTechFeasibility(
  byTech: Map<number, DevSeedSourceMeta[]>,
  techIdsByCount: readonly number[],
): MultiTechFeasibility {
  const required = PR_UX_3_MULTI_TECH_REQUIRED_COUNTS;
  if (techIdsByCount.length < 3) {
    return {
      ok: false,
      reason: "insufficient_techs",
      techIdsAvailable: techIdsByCount,
      countsRequired: required,
      countsAvailable: techIdsByCount.map(
        (id) => byTech.get(id)?.length ?? 0,
      ),
    };
  }
  const top3 = techIdsByCount.slice(0, 3);
  const counts: [number, number, number] = [
    byTech.get(top3[0])?.length ?? 0,
    byTech.get(top3[1])?.length ?? 0,
    byTech.get(top3[2])?.length ?? 0,
  ];
  for (let i = 0; i < 3; i++) {
    if (counts[i] < required[i]) {
      return {
        ok: false,
        reason: "insufficient_appts_per_tech",
        techIdsAvailable: top3,
        countsRequired: required,
        countsAvailable: counts,
      };
    }
  }
  return {
    ok: true,
    techIds: [top3[0], top3[1], top3[2]] as const,
    countsRequired: required as readonly [number, number, number],
    countsAvailable: counts,
  };
}

/**
 * Build the multi-tech cascade chain. Same intent shape as
 * `makeDevCascadeChain` (every step is a `reschedule` with explicit
 * `new_technician_id`); the only difference is that consecutive
 * steps live on different techs per the locked sequence.
 *
 * Returns `[]` when the harvest can't satisfy the sequence (callers
 * should gate the dev button on `checkMultiTechFeasibility(...).ok`
 * to avoid surprise no-ops, but this guard remains so the seeder
 * stays defensively callable from tests with thin fixtures).
 *
 * Exported for direct unit testing.
 */
export function makeDevMultiTechCascadeChain(
  sessionId: number,
  byTech: Map<number, DevSeedSourceMeta[]>,
  techIdsByCount: readonly number[],
  weekDayKeys: readonly string[] = [],
): ReorganizationIntent[] {
  const feasibility = checkMultiTechFeasibility(byTech, techIdsByCount);
  if (!feasibility.ok) {
    if (__DEV__) {
      console.warn(
        "[DEBUG:Review/DevSeed] multi-tech seed skipped — feasibility failed",
        feasibility,
      );
    }
    return [];
  }
  const techIds = feasibility.techIds;
  const proposedAt = new Date().toISOString();

  // Pull `requiredCount[k]` appointments off each tech in chronological
  // order. The mapping `slotIndex → techIds[idx] → arr[counters[idx]]`
  // produces a 7-element source array whose tech sequence matches
  // PR_UX_3_MULTI_TECH_SEQUENCE exactly.
  const counters: [number, number, number] = [0, 0, 0];
  const sources: DevSeedSourceMeta[] = [];
  for (const idx of PR_UX_3_MULTI_TECH_SEQUENCE) {
    const techId = techIds[idx];
    const arr = byTech.get(techId) ?? [];
    const ptr = counters[idx];
    if (ptr >= arr.length) {
      if (__DEV__) {
        console.warn(
          "[DEBUG:Review/DevSeed] multi-tech seed underflow — feasibility passed but tech ran out mid-build",
          { techId, ptr, total: arr.length, idx },
        );
      }
      return [];
    }
    sources.push(arr[ptr]);
    counters[idx] = ptr + 1;
  }

  // Terminator placement: same picker as `makeDevCascadeChain`. The
  // locked sequence ends on T_C (`techIds[2]`), so the picker scopes
  // its cluster + working-hours search to that tech.
  //
  // The picker's "cluster on terminator's tech" set is derived from
  // `sources` (it walks every entry whose `techId === terminatorTechId`).
  // For the multi-tech chain, that's T_C's two appointments
  // (steps 4 and 6). The picker correctly anchors the terminator
  // adjacent to T_C's two cards, not to the full chain — which is
  // what the user wants visually (the chain HEAD is on T_A; the
  // terminator should bookend the chain on T_C without crossing
  // back to T_A).
  const terminatorTechId = techIds[2];
  const picked = pickInWindowTerminatorSlot(weekDayKeys, sources);
  let terminatorDate: string;
  let terminatorStart: string;
  let terminatorEnd: string;
  if (picked) {
    terminatorDate = picked.date;
    terminatorStart = picked.start;
    terminatorEnd = picked.end;
    if (__DEV__ && picked.fallback) {
      console.warn(
        "[DEBUG:Review/DevSeed] multi-tech terminator fell back to 22:00–23:30 band",
        { weekDayKeys, picked, terminatorTechId },
      );
    }
  } else {
    let latestSourceDate = sources[0].date;
    for (const s of sources) {
      if (s.date > latestSourceDate) latestSourceDate = s.date;
    }
    if (__DEV__ && weekDayKeys.length > 0) {
      console.warn(
        "[DEBUG:Review/DevSeed] multi-tech terminator: no in-window slot — last-ditch fallback",
        { weekDayKeys, latestSourceDate, terminatorTechId },
      );
    }
    terminatorDate = latestSourceDate;
    terminatorStart = "22:30";
    terminatorEnd = "23:00";
  }

  const intents: ReorganizationIntent[] = [];
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const isTerminator = i === sources.length - 1;
    const dst = isTerminator
      ? {
          date: terminatorDate,
          techId: terminatorTechId,
          start: terminatorStart,
          end: terminatorEnd,
        }
      : {
          date: sources[i + 1].date,
          techId: sources[i + 1].techId,
          start: sources[i + 1].start,
          end: sources[i + 1].end,
        };
    intents.push({
      // Use a distinct id range from `makeDevCascadeChain` (99200..)
      // so the two seeds can coexist in a single session if a future
      // dev workflow ever wants to compare them side-by-side. PR-UX-3
      // currently only stages one seed at a time.
      id: 99300 + i,
      session_id: sessionId,
      intent_type: "reschedule",
      intent_status: "proposed",
      appointment_id: src.id,
      personal_event_id: null,
      payload: {
        kind: "reschedule",
        new_scheduled_date: dst.date,
        new_start_time: dst.start,
        new_end_time: dst.end,
        new_technician_id: dst.techId,
      },
      inverse_payload: null,
      prior_state_snapshot: null,
      linter_dependency_edges: [],
      commit_order: null,
      proposed_at: proposedAt,
      committed_at: null,
      chain_id: "",
    });
  }
  return intents;
}

// ─────────────────────────────────────────────────────────────────────
// PR-UX-3 follow-up (2026-05-08): mixed-runs cascade-chain seed.
//
// Sibling to `makeDevMultiTechCascadeChain`. The locked PR-UX-3 seed
// alternates techs every step (`A B A B C A C`), which makes every
// step its own tech-run — useful for verifying cross-tech handoff
// at every press, but it doesn't exercise the "tech-run grouping"
// half of the side-arrow rule introduced 2026-05-08, where adjacent
// same-tech steps light TOGETHER per press.
//
// This seed produces an 8-step chain on TWO techs in the pattern
// `J J T J T T J J` — five tech-runs of varying length: `[0,1]`,
// `[2]`, `[3]`, `[4,5]`, `[6,7]`. Walking it forward with the side
// arrow exercises:
//   - 2-step run → 1-step run transition (run 0 → run 1)
//   - 1-step run → 1-step run transition (run 1 → run 2)
//   - 1-step run → 2-step run transition (run 2 → run 3)
//   - 2-step run → 2-step run transition (run 3 → run 4)
//   - wrap from last run back to run 0
//
// The chain detector and chip-row don't need to know about the
// "mixed runs" framing; they just see an 8-step chain whose source
// techs happen to be `J J T J T T J J`. The tech-run grouping
// happens inside `useSideArrowTechMount` / `advanceLink` from the
// per-step source tech metadata.
// ─────────────────────────────────────────────────────────────────────

/**
 * The 8-step tech sequence as indices into the resolved `[T_A, T_B]`
 * pair. Each entry picks which tech owns the SOURCE appointment for
 * that step. The destination is the slot of the NEXT step's source
 * (cascade rule), or the terminator picker's output for the final
 * step. Locked — reshape only with a fresh design pass.
 */
const PR_UX_3_MIXED_RUNS_SEQUENCE: ReadonlyArray<0 | 1> = [
  0, 0, 1, 0, 1, 1, 0, 0,
] as const;

/**
 * Per-tech minimum appt count required to satisfy the locked 8-step
 * mixed-runs sequence. Index `k` corresponds to `techIdsByCount[k]`.
 * Derived once from `PR_UX_3_MIXED_RUNS_SEQUENCE` so a sequence
 * reshape can't drift the count out of sync.
 */
const PR_UX_3_MIXED_RUNS_REQUIRED_COUNTS: ReadonlyArray<number> = (() => {
  const counts = [0, 0];
  for (const idx of PR_UX_3_MIXED_RUNS_SEQUENCE) counts[idx] += 1;
  return counts;
})();

/**
 * Two-tech feasibility check. Reuses the harvest output from
 * `deriveWeekApptMetaForMultiTechChain` (which returns every tech
 * with future appointments sorted by count) and verifies the top
 * TWO techs have enough appts to satisfy the mixed-runs sequence.
 *
 * Exported for direct unit testing.
 */
export type MixedRunsFeasibility =
  | {
      ok: true;
      techIds: readonly [number, number];
      countsRequired: readonly [number, number];
      countsAvailable: readonly [number, number];
    }
  | {
      ok: false;
      reason: "insufficient_techs" | "insufficient_appts_per_tech";
      techIdsAvailable: readonly number[];
      countsRequired: readonly number[];
      countsAvailable: readonly number[];
    };

export function checkMixedRunsFeasibility(
  byTech: Map<number, DevSeedSourceMeta[]>,
  techIdsByCount: readonly number[],
): MixedRunsFeasibility {
  const required = PR_UX_3_MIXED_RUNS_REQUIRED_COUNTS;
  if (techIdsByCount.length < 2) {
    return {
      ok: false,
      reason: "insufficient_techs",
      techIdsAvailable: techIdsByCount,
      countsRequired: required,
      countsAvailable: techIdsByCount.map(
        (id) => byTech.get(id)?.length ?? 0,
      ),
    };
  }
  const top2 = techIdsByCount.slice(0, 2);
  const counts: [number, number] = [
    byTech.get(top2[0])?.length ?? 0,
    byTech.get(top2[1])?.length ?? 0,
  ];
  for (let i = 0; i < 2; i++) {
    if (counts[i] < required[i]) {
      return {
        ok: false,
        reason: "insufficient_appts_per_tech",
        techIdsAvailable: top2,
        countsRequired: required,
        countsAvailable: counts,
      };
    }
  }
  return {
    ok: true,
    techIds: [top2[0], top2[1]] as const,
    countsRequired: required as readonly [number, number],
    countsAvailable: counts,
  };
}

/**
 * Build the 8-step mixed-runs cascade chain. Same intent shape as
 * `makeDevMultiTechCascadeChain` (every step is a `reschedule` with
 * explicit `new_technician_id`); the difference is the tech sequence
 * `J J T J T T J J`, which produces the five-run grouping the
 * side-arrow tech-run navigation exercises.
 *
 * Returns `[]` when the harvest can't satisfy the sequence (callers
 * should gate the dev button on `checkMixedRunsFeasibility(...).ok`
 * to avoid surprise no-ops).
 *
 * Exported for direct unit testing.
 */
export function makeDevMixedRunsCascadeChain(
  sessionId: number,
  byTech: Map<number, DevSeedSourceMeta[]>,
  techIdsByCount: readonly number[],
  weekDayKeys: readonly string[] = [],
): ReorganizationIntent[] {
  const feasibility = checkMixedRunsFeasibility(byTech, techIdsByCount);
  if (!feasibility.ok) {
    if (__DEV__) {
      console.warn(
        "[DEBUG:Review/DevSeed] mixed-runs seed skipped — feasibility failed",
        feasibility,
      );
    }
    return [];
  }
  const techIds = feasibility.techIds;
  const proposedAt = new Date().toISOString();

  const counters: [number, number] = [0, 0];
  const sources: DevSeedSourceMeta[] = [];
  for (const idx of PR_UX_3_MIXED_RUNS_SEQUENCE) {
    const techId = techIds[idx];
    const arr = byTech.get(techId) ?? [];
    const ptr = counters[idx];
    if (ptr >= arr.length) {
      if (__DEV__) {
        console.warn(
          "[DEBUG:Review/DevSeed] mixed-runs seed underflow — feasibility passed but tech ran out mid-build",
          { techId, ptr, total: arr.length, idx },
        );
      }
      return [];
    }
    sources.push(arr[ptr]);
    counters[idx] = ptr + 1;
  }

  // Terminator placement: same picker as the multi-tech seed. The
  // locked sequence ends on T_A, so the picker scopes its cluster +
  // working-hours search to that tech.
  const terminatorTechId = techIds[0];
  const picked = pickInWindowTerminatorSlot(weekDayKeys, sources);
  let terminatorDate: string;
  let terminatorStart: string;
  let terminatorEnd: string;
  if (picked) {
    terminatorDate = picked.date;
    terminatorStart = picked.start;
    terminatorEnd = picked.end;
    if (__DEV__ && picked.fallback) {
      console.warn(
        "[DEBUG:Review/DevSeed] mixed-runs terminator fell back to 22:00–23:30 band",
        { weekDayKeys, picked, terminatorTechId },
      );
    }
  } else {
    let latestSourceDate = sources[0].date;
    for (const s of sources) {
      if (s.date > latestSourceDate) latestSourceDate = s.date;
    }
    if (__DEV__ && weekDayKeys.length > 0) {
      console.warn(
        "[DEBUG:Review/DevSeed] mixed-runs terminator: no in-window slot — last-ditch fallback",
        { weekDayKeys, latestSourceDate, terminatorTechId },
      );
    }
    terminatorDate = latestSourceDate;
    terminatorStart = "22:30";
    terminatorEnd = "23:00";
  }

  const intents: ReorganizationIntent[] = [];
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const isTerminator = i === sources.length - 1;
    const dst = isTerminator
      ? {
          date: terminatorDate,
          techId: terminatorTechId,
          start: terminatorStart,
          end: terminatorEnd,
        }
      : {
          date: sources[i + 1].date,
          techId: sources[i + 1].techId,
          start: sources[i + 1].start,
          end: sources[i + 1].end,
        };
    intents.push({
      // Distinct id range from `makeDevCascadeChain` (99200..) and
      // `makeDevMultiTechCascadeChain` (99300..) so the three seeds
      // never collide if a future workflow stages multiple at once.
      id: 99400 + i,
      session_id: sessionId,
      intent_type: "reschedule",
      intent_status: "proposed",
      appointment_id: src.id,
      personal_event_id: null,
      payload: {
        kind: "reschedule",
        new_scheduled_date: dst.date,
        new_start_time: dst.start,
        new_end_time: dst.end,
        new_technician_id: dst.techId,
      },
      inverse_payload: null,
      prior_state_snapshot: null,
      linter_dependency_edges: [],
      commit_order: null,
      proposed_at: proposedAt,
      committed_at: null,
      chain_id: "",
    });
  }
  return intents;
}

/**
 * 2026-05-05 (PR-UX-2 PASS 2.12): stitch the per-row target id (appt or
 * personal-event) into the payload before it leaves the wire seam. The
 * BE zod schemas (`reschedulePayloadSchema` / `reassignPayloadSchema` /
 * `cancelPayloadSchema`) REQUIRE `appointment_id` *inside* the payload,
 * and `personalEventUpdatePayloadSchema` /
 * `personalEventDeletePayloadSchema` REQUIRE `personal_event_id` —
 * `useSessionAwareSubmit.ts` does the same stitch in production. Without
 * it the dev-seeded `initial_intents` 422 against the BE validator
 * because the payload-only `kind: "reschedule"` shape lacks
 * `appointment_id`. `kind: "create"` / `kind: "personal_event_create"`
 * carry no target id by definition; the conditional spread skips them
 * silently.
 */
function intentToWirePayload(
  intent: ReorganizationIntent,
): ReorganizationIntentPayload {
  return {
    ...intent.payload,
    ...(intent.appointment_id != null
      ? { appointment_id: intent.appointment_id }
      : {}),
    ...(intent.personal_event_id != null
      ? { personal_event_id: intent.personal_event_id }
      : {}),
  } as ReorganizationIntentPayload;
}

function DevSeedRow() {
  // 2026-04-25 fix: pull real appointment IDs from today's day-view so
  // seeded intents resolve customer names via `useIntentDisplayLookup`
  // and the tap-to-detail navigation lands on a real order page. We
  // fetch lazily with `useFranchiseDayView` (TanStack cache → no extra
  // request if the calendar was already visited this session) and fall
  // back to synthetic 5001..5004 ids when no day data is loaded yet.
  //
  // 2026-05-05 (PR-UX-2 PASS 2.10): the day-view harvest pinned every
  // seeded intent to a single date, which made the cascade chain
  // collapse into one day-column on the workweek calendar. We now ALSO
  // pull the current week (`useFranchiseWeekView` keyed off the Monday
  // of "today") so the cascade chain seeder can spread sources across
  // multiple day-columns within one tech. The day-view harvest is
  // retained for `seedClean` / `seedAllKinds` (those builders only
  // need a small handful of appts and don't benefit from a wider net).
  const todayKey = (() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  })();
  const mondayOfTodayKey = (() => {
    const d = new Date();
    // JS `getDay()` is 0=Sun..6=Sat; the workweek view starts Monday,
    // so the offset to subtract is `(getDay()+6)%7`.
    const offset = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - offset);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  })();
  const dayView = useFranchiseDayView(todayKey);
  const weekView = useFranchiseWeekView(mondayOfTodayKey);
  // 2026-05-04 (PR-UX-2 PASS 2.1): harvest source date + technician ID
  // alongside the appointment ID so `makeDevAllIntentKinds` can pin
  // each destination to the source's own date/tech. That keeps the
  // move-chain ghost tile inside whatever week the user is currently
  // viewing instead of leaking to a hardcoded date in the past.
  const realApptMeta = useMemo<DevSeedSourceMeta[]>(() => {
    const out: DevSeedSourceMeta[] = [];
    const techs = dayView.data?.technicians ?? [];
    for (const t of techs) {
      for (const a of t.appointments ?? []) {
        if (a.id > 0) {
          // PostgreSQL TIME columns serialize as "HH:MM:SS"; the
          // intent payload (and the chain detector's parser) want
          // the leading "HH:MM". Slice instead of parse so a missing
          // colon still falls through to a safe default.
          const start = a.scheduled_time?.slice(0, 5) ?? "09:00";
          const end = a.scheduled_end_time?.slice(0, 5) ?? "10:00";
          out.push({
            id: a.id,
            date: a.scheduled_date ?? todayKey,
            techId: t.technician_id,
            start,
            end,
          });
        }
        if (out.length >= 4) break;
      }
      if (out.length >= 4) break;
    }
    return out;
  }, [dayView.data, todayKey]);
  const realApptIds = useMemo(
    () => realApptMeta.map((m) => m.id),
    [realApptMeta],
  );

  // 2026-05-05 (PR-UX-2 PASS 2.10): harvest one tech's appointments
  // across the *whole current week* so the cascade chain can spread
  // sources/destinations across multiple day-columns (the workweek
  // view is the primary canvas for chain visualization, and a chain
  // collapsed onto a single day-column is hard to read). Strategy:
  //   1. Group every appointment in the week response by tech_id,
  //      DROPPING any appointment whose date is in the past — moving
  //      an appointment INTO the past breaks a chain (the destination
  //      can't connect back in time), and seeding the chain off a
  //      past source would produce the same broken result.
  //   2. Pick the tech with the most remaining (today-or-later)
  //      appointments — that's the one whose column will look richest.
  //   3. From that tech's appts, take up to 6, sorted chronologically.
  //
  // 2026-05-05 (PR-UX-2 PASS 2.14, "chain-506 / chain-510 split"
  // post-mortem): the actual harvest implementation now lives in
  // `deriveWeekApptMetaForChain` so `seedCascadeChain` can re-derive
  // it at the moment of the click (after a refetch) instead of
  // relying on whatever this `useMemo` snapshotted at the previous
  // render. The memoized value is still useful for the seed-button
  // hint text + label, but it MUST NOT be the value that gets baked
  // into the seeded intents — see `seedCascadeChain` for the
  // re-harvest call.
  //
  // The cascade-chain seeder consumes this directly. Empty array if
  // the week-view hasn't loaded yet — the button no-ops.
  //
  // 2026-05-05 (PR-UX-2 PASS 2.15): also subscribe to the
  // workweek-tech selection from `useCalendarStore`. Passing it into
  // the harvest steers the seed onto the tech the user is actually
  // viewing, instead of the globally-busiest tech (which can sit on
  // a column that's not even rendered in the workweek's
  // single-resource view, producing the "ghosts target Dan, calendar
  // shows Josh, every projected rect is null" symptom). The
  // click-handler re-reads `useCalendarStore.getState()` to pick up
  // any tech change made between the last paint and the actual tap.
  const workweekTechId = useCalendarStore((s) => s.workweekTechId);
  const workweekTechName = useCalendarStore((s) => s.workweekTechName);
  // PR-UX-2 PASS 2.17 (2026-05-05): subscribe to `selectedDate` so
  // the seedHint can preview whether the in-window terminator slot
  // exists *before* the user taps. The visible 4-day workweek
  // window derives from this value (Monday + 4 days, same formula
  // as `app/(tabs)/index.tsx`'s `workweekStartDate` `useMemo`).
  const selectedDate = useCalendarStore((s) => s.selectedDate);
  const weekApptMetaForChain = useMemo<DevSeedSourceMeta[]>(
    () => deriveWeekApptMetaForChain(weekView.data, todayKey, workweekTechId),
    [weekView.data, todayKey, workweekTechId],
  );

  // PR-UX-3 (2026-05-07): multi-tech harvest snapshot for the seed-
  // hint text + dev button enable-state. Recomputed when the week
  // response changes; the actual seed handler re-harvests at click
  // time after a refetch (mirrors the single-tech `seedCascadeChain`
  // pattern from PR-UX-2 PASS 2.14). See
  // `pr-ux-3-multi-tech-handoff.md` §1.A5 for why this seed
  // deliberately ignores the workweek-tech selection.
  const multiTechHarvestSnapshot = useMemo(
    () => deriveWeekApptMetaForMultiTechChain(weekView.data, todayKey),
    [weekView.data, todayKey],
  );
  const multiTechFeasibilitySnapshot = useMemo(
    () =>
      checkMultiTechFeasibility(
        multiTechHarvestSnapshot.byTech,
        multiTechHarvestSnapshot.techIdsByCount,
      ),
    [multiTechHarvestSnapshot],
  );

  // PR-UX-3 follow-up (2026-05-08): mixed-runs feasibility uses the
  // SAME harvest output as the multi-tech snapshot — the harvest
  // helper is tech-count agnostic and just returns every tech with
  // future appts. The mixed-runs check then verifies the top TWO
  // have enough appts for the locked 8-step `J J T J T T J J`
  // sequence (5/3 split). Reusing the harvest avoids a second walk
  // of the same week-view response.
  const mixedRunsFeasibilitySnapshot = useMemo(
    () =>
      checkMixedRunsFeasibility(
        multiTechHarvestSnapshot.byTech,
        multiTechHarvestSnapshot.techIdsByCount,
      ),
    [multiTechHarvestSnapshot],
  );

  // 2026-05-05 (PR-UX-2 PASS 2.12): all three seed buttons now hit the
  // real BE create endpoint with `initial_intents` instead of writing
  // straight into `usePendingRealityStore`. Why: the previous local-only
  // path produced sessions whose `id: 99001` did not exist server-side,
  // so any subsequent write (ghost-drag, LinterEdgeCard auto-fix, intent
  // remove) PATCHed `/reorganizations/99001` and 404'd. The 404 was
  // masked behind a generic alert that mentioned "permission" (since the
  // route guard had been the *previous* failure mode, before the
  // 2026-05-05-tech-reorg-route-fo-passthrough loosening). One round
  // trip via `initialIntents` is preferred over POST + N PATCHes — it's
  // atomic from the linter's POV and matches `useSessionAwareSubmit`'s
  // existing "stage" path. The store hydration is handled by the
  // create hook's `onSuccess` callback (see `setSession` wiring in
  // `useCreateReorganizationSession`); we don't hand-roll a
  // `store.setSession(...)` here.
  const createSession = useCreateReorganizationSession();

  const seedSurfaceError = useCallback(
    (label: string, err: unknown) => {
      if (__DEV__) {
        console.warn(`[DEBUG:Review/DevSeed] ${label} failed`, err);
      }
      const ax = err as AxiosError | undefined;
      const status = ax?.response?.status;
      const data = ax?.response?.data as ApiResponse<unknown> | undefined;
      const detail =
        data?.message || ax?.message || "The seed didn't reach the backend.";
      const title = "Seed failed";
      Alert.alert(
        title,
        status != null ? `(${status}) ${detail}` : detail,
      );
    },
    [],
  );

  const seedClean = () => {
    const authorUserId = useAuthStore.getState().user?.userId ?? 42;
    if (__DEV__) {
      console.log("[DEBUG:Review/DevSeed] tap → Seed clean session", {
        realApptIds,
        authorUserId,
      });
    }
    const wire: ReorganizationIntentPayload = {
      kind: "reschedule",
      // appointment_id is required INSIDE the payload by the BE zod
      // validator. Falls back to a synthetic id only when no calendar
      // data has loaded — that path 422s on tenancy, but the user is
      // expected to open the calendar tab first (the hint text says so).
      appointment_id: realApptIds[0] ?? 5001,
      new_scheduled_date: realApptMeta[0]?.date ?? todayKey,
      new_start_time: "09:00",
      new_end_time: "10:00",
    } as ReorganizationIntentPayload;
    createSession.mutate(
      {
        notes: "Dev seed: clean session (PR-UX-2 PASS 2.12)",
        initialIntents: [wire],
      },
      {
        onError: (err) => seedSurfaceError("Seed clean session", err),
      },
    );
  };

  const seedAllKinds = () => {
    const authorUserId = useAuthStore.getState().user?.userId ?? 42;
    if (__DEV__) {
      console.log("[DEBUG:Review/DevSeed] tap → Seed all intent kinds", {
        realApptIds,
        authorUserId,
      });
    }
    // sessionId=0 is a placeholder — the BE assigns the real one;
    // `intentToWirePayload` only reads `appointment_id` /
    // `personal_event_id` / `payload`, never `session_id`.
    const intents = makeDevAllIntentKinds(0, realApptMeta);
    const wireIntents = intents.map(intentToWirePayload);
    createSession.mutate(
      {
        notes: "Dev seed: all intent kinds (PR-UX-2 PASS 2.12)",
        initialIntents: wireIntents,
      },
      {
        onError: (err) => seedSurfaceError("Seed all intent kinds", err),
      },
    );
  };

  // 2026-05-05 (PR-UX-2 PASS 2.5): seeds a deterministic cascading
  // chain so the chip row's multi-step rendering can be visually
  // verified end-to-end. See `makeDevCascadeChain` for the chain
  // shape.
  //
  // 2026-05-05 (PR-UX-2 PASS 2.10): now reads from the wider
  // `weekApptMetaForChain` harvest (one tech's today-or-later
  // appts, up to 6) so the chain spreads across day-columns and
  // gives the user enough cards to actually read the visualization.
  //
  // 2026-05-05 (PR-UX-2 PASS 2.12): now hits the real BE create
  // endpoint with `initial_intents` instead of pushing into the
  // local store, so subsequent ghost-drag / auto-fix PATCHes don't
  // 404 against a phantom `id: 99001`.
  // 2026-05-05 (PR-UX-2 PASS 2.14): re-harvest sources at click-press
  // time after force-refetching the week-view query. The
  // `weekApptMetaForChain` `useMemo` value is what was visible the
  // last time this component painted, but the chain detector
  // ultimately reads source slots from the LIVE appointment data the
  // calendar view re-fetches on next paint. If the gap between
  // "harvest snapshot" and "live source slot" is wider than the slot
  // itself (e.g. another reorganization session committed a
  // reschedule for one of the picked appointments since we last
  // rendered), the seeded `intent[i].dest` won't overlap the live
  // `intent[i+1].source` and the cascade shatters into two
  // disconnected chains. Awaiting one fresh refetch shrinks that
  // race window to the round-trip latency, which is small enough
  // that any drift is a genuine race the user themselves is
  // creating mid-tap.
  const seedCascadeChain = async () => {
    let freshWeekData = weekView.data;
    try {
      const refetched = await weekView.refetch();
      freshWeekData = refetched.data ?? freshWeekData;
    } catch (err) {
      if (__DEV__) {
        console.warn(
          "[DEBUG:Review/DevSeed] cascade refetch failed; falling back to cached week-view data",
          err,
        );
      }
    }
    // 2026-05-05 (PR-UX-2 PASS 2.15): re-read the workweek tech
    // selection at click time too — the user can navigate techs
    // between the last paint and the tap, and we want the seeded
    // chain to land on whichever column they're looking at NOW.
    const requestedTechId =
      useCalendarStore.getState().workweekTechId ?? null;
    const sources = deriveWeekApptMetaForChain(
      freshWeekData,
      todayKey,
      requestedTechId,
    );
    // PR-UX-2 PASS 2.17 (2026-05-05): the terminator-placement
    // window MUST be the *visible* 4-column workweek the user is
    // looking at, NOT the 7-day fetch range of
    // `useFranchiseWeekView`. PASS 2.16 used the latter, which let
    // the picker plant the terminator on a fetched-but-not-rendered
    // day (e.g. Sunday of the API week when the user's portrait
    // workweek paints Mon–Thu) and the calendar correctly drew an
    // off-screen-right stub. We compute the visible window the
    // same way `app/(tabs)/index.tsx`'s `workweekStartDate`
    // `useMemo` does — Monday of `selectedDate` + 4 days — so the
    // seed always matches what the calendar renders. The 7-day
    // fetch is still the right pool for the *source harvest* (more
    // candidates = a richer chain); only the terminator window
    // narrows.
    const seedSelectedDate =
      useCalendarStore.getState().selectedDate ?? todayKey;
    const visibleWindowDays = visibleWorkweekWindow(seedSelectedDate);
    const intents = makeDevCascadeChain(0, sources, visibleWindowDays);
    const authorUserId = useAuthStore.getState().user?.userId ?? 42;
    if (__DEV__) {
      console.log("[DEBUG:Review/DevSeed] tap → Seed cascade chain", {
        memoSnapshotIds: weekApptMetaForChain.map((m) => m.id),
        clickTimeApptIds: sources.map((m) => m.id),
        clickTimeStartTimes: sources.map((m) => m.start),
        cascadeStepCount: intents.length,
        // PR-UX-2 PASS 2.15: surface BOTH the workweek-selected
        // tech and the tech the harvest actually landed on. When
        // they diverge the user is hitting the busiest-tech
        // fallback (preferred tech had < 2 future appts) — easy
        // to spot in Metro logs without re-deriving by hand.
        requestedTechId,
        chosenTechId: sources[0]?.techId,
        chainDateSpan: [
          sources[0]?.date,
          sources[sources.length - 1]?.date,
        ],
        // PR-UX-2 PASS 2.17: surface the *visible* 4-column
        // workweek window the picker actually used (NOT the 7-day
        // fetch range — that mismatch was the PASS 2.16 → 2.17
        // bug). If the terminator's `date` isn't in this list,
        // something has drifted and the next regression is one
        // log-line away. The terminator is always the LAST intent
        // and is always a `reschedule` payload.
        visibleWindowDays,
        seedSelectedDate,
        terminatorSlot: (() => {
          const last = intents[intents.length - 1];
          if (!last || last.payload.kind !== "reschedule") return null;
          return {
            date: last.payload.new_scheduled_date,
            start: last.payload.new_start_time,
            end: last.payload.new_end_time,
          };
        })(),
        // PR-UX-2 PASS 2.19: re-derive the picker output here so the
        // log surfaces whether the terminator landed cluster-
        // adjacent (`fallback: false`) or in the 22:00 fallback band
        // (`fallback: true`). A future regression that always
        // reports `fallback: true` is one log-line away.
        terminatorPickerResult: pickInWindowTerminatorSlot(
          visibleWindowDays,
          sources,
        ),
        authorUserId,
      });
    }
    if (intents.length === 0) return;
    const wireIntents = intents.map(intentToWirePayload);
    createSession.mutate(
      {
        notes: `Dev seed: cascade chain × ${intents.length} (PR-UX-2 PASS 2.19)`,
        initialIntents: wireIntents,
      },
      {
        onError: (err) => seedSurfaceError("Seed cascade chain", err),
      },
    );
  };

  // PR-UX-3 (2026-05-07): multi-tech variant of `seedCascadeChain`.
  // Same orchestration pattern (refetch → re-harvest → build → wire
  // → create session) as the single-tech path; the only differences
  // are the harvest helper (`deriveWeekApptMetaForMultiTechChain`)
  // and the chain builder (`makeDevMultiTechCascadeChain`). The
  // single-tech seed path above is unchanged so PR-UX-2 regression
  // smoke remains valid.
  const seedMultiTechCascadeChain = async () => {
    let freshWeekData = weekView.data;
    try {
      const refetched = await weekView.refetch();
      freshWeekData = refetched.data ?? freshWeekData;
    } catch (err) {
      if (__DEV__) {
        console.warn(
          "[DEBUG:Review/DevSeed] multi-tech cascade refetch failed; using cached week-view",
          err,
        );
      }
    }
    const harvest = deriveWeekApptMetaForMultiTechChain(
      freshWeekData,
      todayKey,
    );
    const feasibility = checkMultiTechFeasibility(
      harvest.byTech,
      harvest.techIdsByCount,
    );
    if (!feasibility.ok) {
      // Surface the shortfall so the user knows whether to wait for
      // more appts to load, switch the demo to a denser week, or
      // fall back to the single-tech seed.
      const detail =
        feasibility.reason === "insufficient_techs"
          ? `multi-tech seed needs 3 techs with future appts; have ${feasibility.techIdsAvailable.length}`
          : `multi-tech seed needs ${feasibility.countsRequired.join("/")} appts on the top 3 techs; have ${feasibility.countsAvailable.join("/")}`;
      Alert.alert("Multi-tech seed not ready", detail);
      return;
    }
    const seedSelectedDate =
      useCalendarStore.getState().selectedDate ?? todayKey;
    const visibleWindowDays = visibleWorkweekWindow(seedSelectedDate);
    const intents = makeDevMultiTechCascadeChain(
      0,
      harvest.byTech,
      harvest.techIdsByCount,
      visibleWindowDays,
    );
    const authorUserId = useAuthStore.getState().user?.userId ?? 42;
    if (__DEV__) {
      console.log("[DEBUG:Review/DevSeed] tap → Seed cascade chain (multi-tech)", {
        techIds: feasibility.techIds,
        countsRequired: feasibility.countsRequired,
        countsAvailable: feasibility.countsAvailable,
        cascadeStepCount: intents.length,
        visibleWindowDays,
        seedSelectedDate,
        chainTechSequence: intents.map((i) =>
          i.payload.kind === "reschedule" ? i.payload.new_technician_id : null,
        ),
        terminatorSlot: (() => {
          const last = intents[intents.length - 1];
          if (!last || last.payload.kind !== "reschedule") return null;
          return {
            date: last.payload.new_scheduled_date,
            start: last.payload.new_start_time,
            end: last.payload.new_end_time,
            techId: last.payload.new_technician_id,
          };
        })(),
        authorUserId,
      });
    }
    if (intents.length === 0) return;
    const wireIntents = intents.map(intentToWirePayload);
    createSession.mutate(
      {
        notes: `Dev seed: multi-tech cascade chain × ${intents.length} (PR-UX-3)`,
        initialIntents: wireIntents,
      },
      {
        onError: (err) => seedSurfaceError("Seed multi-tech cascade chain", err),
      },
    );
  };

  // PR-UX-3 follow-up (2026-05-08): mixed-runs variant. Same
  // orchestration shape as `seedMultiTechCascadeChain` (refetch →
  // re-harvest → build → wire → create session); the difference
  // is the 2-tech locked sequence `J J T J T T J J` and the
  // resulting 8-step chain whose source-tech grouping produces
  // five tech-runs of varying length. Walking it with the side
  // arrows exercises the run-grouping logic in `advanceLink` end-
  // to-end on a real device — useful for verifying the `[0,1] →
  // [2] → [3] → [4,5] → [6,7]` cycle that the unit tests assert.
  const seedMixedRunsCascadeChain = async () => {
    let freshWeekData = weekView.data;
    try {
      const refetched = await weekView.refetch();
      freshWeekData = refetched.data ?? freshWeekData;
    } catch (err) {
      if (__DEV__) {
        console.warn(
          "[DEBUG:Review/DevSeed] mixed-runs cascade refetch failed; using cached week-view",
          err,
        );
      }
    }
    const harvest = deriveWeekApptMetaForMultiTechChain(
      freshWeekData,
      todayKey,
    );
    const feasibility = checkMixedRunsFeasibility(
      harvest.byTech,
      harvest.techIdsByCount,
    );
    if (!feasibility.ok) {
      const detail =
        feasibility.reason === "insufficient_techs"
          ? `mixed-runs seed needs 2 techs with future appts; have ${feasibility.techIdsAvailable.length}`
          : `mixed-runs seed needs ${feasibility.countsRequired.join("/")} appts on the top 2 techs; have ${feasibility.countsAvailable.join("/")}`;
      Alert.alert("Mixed-runs seed not ready", detail);
      return;
    }
    const seedSelectedDate =
      useCalendarStore.getState().selectedDate ?? todayKey;
    const visibleWindowDays = visibleWorkweekWindow(seedSelectedDate);
    const intents = makeDevMixedRunsCascadeChain(
      0,
      harvest.byTech,
      harvest.techIdsByCount,
      visibleWindowDays,
    );
    const authorUserId = useAuthStore.getState().user?.userId ?? 42;
    if (__DEV__) {
      console.log(
        "[DEBUG:Review/DevSeed] tap → Seed cascade chain (mixed-runs, 2-tech 8-step)",
        {
          techIds: feasibility.techIds,
          countsRequired: feasibility.countsRequired,
          countsAvailable: feasibility.countsAvailable,
          cascadeStepCount: intents.length,
          visibleWindowDays,
          seedSelectedDate,
          // Per-step source-tech sequence so the device log echoes
          // the locked `J J T J T T J J` pattern when smoke-testing.
          sourceTechSequence: intents.map((i) => {
            const apptId = i.appointment_id;
            if (apptId == null) return null;
            for (const arr of harvest.byTech.values()) {
              for (const meta of arr) {
                if (meta.id === apptId) return meta.techId;
              }
            }
            return null;
          }),
          terminatorSlot: (() => {
            const last = intents[intents.length - 1];
            if (!last || last.payload.kind !== "reschedule") return null;
            return {
              date: last.payload.new_scheduled_date,
              start: last.payload.new_start_time,
              end: last.payload.new_end_time,
              techId: last.payload.new_technician_id,
            };
          })(),
          authorUserId,
        },
      );
    }
    if (intents.length === 0) return;
    const wireIntents = intents.map(intentToWirePayload);
    createSession.mutate(
      {
        notes: `Dev seed: mixed-runs cascade chain × ${intents.length} (PR-UX-3 follow-up)`,
        initialIntents: wireIntents,
      },
      {
        onError: (err) =>
          seedSurfaceError("Seed mixed-runs cascade chain", err),
      },
    );
  };

  const seedHint = (() => {
    if (realApptIds.length === 0 && weekApptMetaForChain.length === 0) {
      // PR-UX-2 PASS 2.15: when a workweek tech is selected but
      // doesn't have ≥2 future appts, the harvest also returns
      // empty (the busiest-tech fallback skips when the preferred
      // tech only has 0–1 appts and no other tech meets the
      // threshold either, OR when there's literally no week data).
      // Surface the workweek selection so the user knows whether
      // to switch tech or back to "Show all" before tapping again.
      if (workweekTechId != null) {
        const techLabel = workweekTechName ?? `tech ${workweekTechId}`;
        return `${techLabel} has no future appts — switch tech or exit Workweek view`;
      }
      return "no calendar data — synthetic ids only (open the calendar first to load real appts)";
    }
    const parts: string[] = [];
    if (realApptIds.length > 0) {
      parts.push(`day: ${realApptIds.length} appt(s)`);
    }
    if (weekApptMetaForChain.length > 0) {
      const chosenTech = weekApptMetaForChain[0]?.techId;
      const days = new Set(weekApptMetaForChain.map((m) => m.date)).size;
      // PR-UX-2 PASS 2.15: the harvest now prefers the visible
      // workweek tech. If we landed on a different tech because the
      // preferred one didn't have ≥2 future appts, call out the
      // fallback explicitly so it's not surprising when the seed
      // produces ghosts on a column the user wasn't viewing.
      const techLabel =
        workweekTechId != null && chosenTech === workweekTechId
          ? `${workweekTechName ?? `tech ${workweekTechId}`} (${workweekTechId})`
          : `tech ${chosenTech}`;
      const fallbackHint =
        workweekTechId != null && chosenTech !== workweekTechId
          ? ` (fallback — ${workweekTechName ?? `tech ${workweekTechId}`} has < 2 future appts)`
          : "";
      // PR-UX-2 PASS 2.19 (2026-05-05): preview the picker output
      // so the user sees BEFORE tapping whether the terminator will
      // land cluster-adjacent (the happy path) or in the 22:00
      // fallback band (off-bottom on most scroll positions). PASS
      // 2.17 surfaced the "no in-window slot at all" case; PASS 2.19
      // adds the "cluster-adjacent search exhausted → fallback to
      // 22:00 band" case so the user knows the last arrow will be
      // visible only if they scroll to the bottom of the day.
      const previewWindow = visibleWorkweekWindow(selectedDate);
      const previewSlot = pickInWindowTerminatorSlot(
        previewWindow,
        weekApptMetaForChain,
      );
      const inWindowHint =
        previewSlot == null
          ? " (fallback — no room in visible window)"
          : previewSlot.fallback
            ? " (fallback — tight day, terminator at 10 PM)"
            : "";
      parts.push(
        `chain: ${weekApptMetaForChain.length} appt(s) on ${techLabel} across ${days} day(s)${fallbackHint}${inWindowHint}`,
      );
    }
    // PR-UX-3 (2026-05-07): preview the multi-tech seed's
    // feasibility BEFORE the user taps. Surfaces "ready" with the
    // top-3 tech ids when the seed will land cleanly, or the exact
    // shortfall so the user knows whether to wait for more appts to
    // load, navigate to a denser week, or fall back to the single-
    // tech seed.
    if (multiTechFeasibilitySnapshot.ok) {
      const techIds = multiTechFeasibilitySnapshot.techIds.join(" → ");
      parts.push(`multi-tech: 7-step ready (techs ${techIds})`);
    } else if (
      multiTechFeasibilitySnapshot.reason === "insufficient_techs"
    ) {
      parts.push(
        `multi-tech: needs 3 techs with future appts; have ${multiTechFeasibilitySnapshot.techIdsAvailable.length}`,
      );
    } else {
      const req = multiTechFeasibilitySnapshot.countsRequired.join("/");
      const have = multiTechFeasibilitySnapshot.countsAvailable.join("/");
      parts.push(`multi-tech: needs ${req}; top 3 have ${have}`);
    }
    // PR-UX-3 follow-up (2026-05-08): preview the mixed-runs seed's
    // feasibility BEFORE the user taps. Same shape as the multi-tech
    // hint above but scoped to the top 2 techs and the 8-step
    // sequence (5/3 split).
    if (mixedRunsFeasibilitySnapshot.ok) {
      const techIds = mixedRunsFeasibilitySnapshot.techIds.join(" + ");
      parts.push(`mixed-runs: 8-step ready (techs ${techIds})`);
    } else if (
      mixedRunsFeasibilitySnapshot.reason === "insufficient_techs"
    ) {
      parts.push(
        `mixed-runs: needs 2 techs with future appts; have ${mixedRunsFeasibilitySnapshot.techIdsAvailable.length}`,
      );
    } else {
      const req = mixedRunsFeasibilitySnapshot.countsRequired.join("/");
      const have = mixedRunsFeasibilitySnapshot.countsAvailable.join("/");
      parts.push(`mixed-runs: needs ${req}; top 2 have ${have}`);
    }
    return parts.join(" · ");
  })();

  return (
    <View style={styles.devSeedRow} testID="review-dev-seed-row">
      <Text style={styles.devSeedLabel}>__DEV__ — seed for smoke test</Text>
      <Text style={styles.devSeedHint}>{seedHint}</Text>
      <View style={styles.devSeedButtons}>
        <Pressable
          onPress={seedClean}
          style={({ pressed }) => [
            styles.devSeedBtn,
            pressed && styles.devSeedBtnPressed,
          ]}
          accessibilityRole="button"
          testID="review-dev-seed-clean"
        >
          <Text style={styles.devSeedBtnText}>Seed clean session</Text>
        </Pressable>
        <Pressable
          onPress={seedAllKinds}
          style={({ pressed }) => [
            styles.devSeedBtn,
            pressed && styles.devSeedBtnPressed,
          ]}
          accessibilityRole="button"
          testID="review-dev-seed-all-kinds"
        >
          <Text style={styles.devSeedBtnText}>Seed all intent kinds</Text>
        </Pressable>
        <Pressable
          onPress={seedCascadeChain}
          style={({ pressed }) => [
            styles.devSeedBtn,
            pressed && styles.devSeedBtnPressed,
          ]}
          accessibilityRole="button"
          testID="review-dev-seed-cascade-chain"
        >
          <Text style={styles.devSeedBtnText}>
            {weekApptMetaForChain.length >= 2
              ? `Seed cascade chain (${weekApptMetaForChain.length}-step)`
              : "Seed cascade chain (needs 2+ future appts)"}
          </Text>
        </Pressable>
        <Pressable
          onPress={seedMultiTechCascadeChain}
          style={({ pressed }) => [
            styles.devSeedBtn,
            pressed && styles.devSeedBtnPressed,
          ]}
          accessibilityRole="button"
          testID="review-dev-seed-multi-tech-cascade-chain"
        >
          <Text style={styles.devSeedBtnText}>
            {multiTechFeasibilitySnapshot.ok
              ? "Seed cascade chain (multi-tech, 7-step)"
              : "Seed cascade chain (multi-tech — not enough appts)"}
          </Text>
        </Pressable>
        <Pressable
          onPress={seedMixedRunsCascadeChain}
          style={({ pressed }) => [
            styles.devSeedBtn,
            pressed && styles.devSeedBtnPressed,
          ]}
          accessibilityRole="button"
          testID="review-dev-seed-mixed-runs-cascade-chain"
        >
          <Text style={styles.devSeedBtnText}>
            {mixedRunsFeasibilitySnapshot.ok
              ? "Seed cascade chain (mixed-runs, 2-tech 8-step)"
              : "Seed cascade chain (mixed-runs — not enough appts)"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────
// Main screen
// ──────────────────────────────────────────────────────────────────

export default function PendingRealityReviewScreen() {
  const router = useRouter();
  // P3-FE-8 (C.12): tap-on-overlaid-card from the calendar canvas
  // deep-links here with `?focusAppointmentId=<id>`. We parse it
  // once per param change and forward to both tabs; if the id
  // doesn't match any loaded intent (e.g. the session was
  // finalized between tap and arrival) the tabs no-op silently.
  const { focusAppointmentId: focusAppointmentIdParam } =
    useLocalSearchParams<{ focusAppointmentId?: string }>();
  const focusAppointmentId = useMemo(() => {
    if (!focusAppointmentIdParam) return null;
    const parsed = Number.parseInt(focusAppointmentIdParam, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }, [focusAppointmentIdParam]);
  const sessionId = usePendingRealityStore((s) => s.sessionId);
  const intents = usePendingRealityStore((s) => s.intents);
  const localIssues = usePendingRealityStore((s) => s.linterIssues);
  const clear = usePendingRealityStore((s) => s.clear);
  // PR-UX-14 (2026-05-09) Issue B: subscribe to `session.status` so
  // the primary CTA can flip between "Finalize" and "Approve" once
  // the BE moves the row from `draft` → `pending_review`. Without
  // this subscription the CTA would stay "Finalize" and re-tap would
  // 409 (`session_not_draft`) — `handleFinalize` now branches on the
  // same `liveStore.session.status` snapshot to route to authorize.
  const sessionStatus = usePendingRealityStore(
    (s) => s.session?.status ?? null,
  );

  // PR-UX-12 (2026-05-09): clear the post-cancel adopt snooze on
  // mount. The user explicitly opening the review screen is the
  // signal "I want to engage with my pending reality again" — the
  // next refetch should adopt-fetched normally. Without this clear,
  // a cancel → snooze active → user taps FAB → review screen would
  // show "no session" while the BE quietly has more pending_review
  // sessions waiting. See
  // `usePendingRealityStore.adoptSnoozeUntilMs`'s JSDoc for the
  // full invariant chain (set by cancel handler → cleared by mount
  // OR by 60s timer → reconciler skips adopt while active).
  useEffect(() => {
    usePendingRealityStore.getState().clearAdoptSnooze();
  }, []);

  // PR 3 (item #5): batch-fetch each intent's underlying appointment
  // so the cards can render "Jane Doe — Brake service" instead of
  // "Appointment #5001". Uses TanStack `useQueries` so cache is
  // shared with `useAppointmentDetail` from the calendar tab.
  const intentAppointmentIds = useMemo(
    () =>
      intents
        .map((i) => i.appointment_id)
        .filter((v): v is number => typeof v === "number"),
    [intents],
  );
  const intentDisplayLookup = useIntentDisplayLookup(intentAppointmentIds);

  // PR-UX-3 (2026-05-07 / 2026-05-08 follow-up): chain identity
  // badges for the per-intent cards. Computed ONCE at the screen
  // level so every card render is an O(1) lookup, not an O(N)
  // detector re-run. The user sees the SAME chain numbering here
  // as on the calendar's `MoveChainChipRow` (both share the global
  // ordinal across `graph.chains`), so a card labeled "Chain 2"
  // on this screen is the same chain as the chip-row's "Chain 2"
  // pill.
  //
  // 2026-05-08 follow-up — sourcing fix: the original wiring fed
  // the detector from `useIntentDisplayLookup` (a per-id detail
  // fan-out). That cache populated on a different schedule than the
  // calendar's day/week query, so the same intent set produced a
  // DIFFERENT chain graph here vs. the chip row — chip row showed
  // a 4-step cascade where review showed five 1-step seeds. Now
  // both paths share `useMoveChainGraph`, fed from
  // `useFranchiseWeekView` keyed off the calendar's currently-
  // visible week (same `workweekStartDate` formula as
  // `app/(tabs)/index.tsx`). `intentDisplayLookup` stays in scope
  // for customer/service name display on the cards — it's no
  // longer load-bearing for chain detection.
  //
  // Cancel / personal_event_* intents are filtered out of chain
  // eligibility inside the detector, so their cards never receive a
  // badge entry — the consumer (`IntentCard`) renders no pill in
  // that case, no "no chain" placeholder.
  const calendarSelectedDate = useCalendarStore((s) => s.selectedDate);
  const reviewWorkweekStartDate = useMemo(() => {
    // Mirror `workweekStartDate` from `app/(tabs)/index.tsx`: roll
    // the selected date back to the same calendar week's Monday
    // (Sunday rolls back 6 days to the prior Monday). The week
    // query covers the same 4-day window the chip row consumes, so
    // the appointment projection is identical.
    const baseStr = calendarSelectedDate;
    if (!baseStr || typeof baseStr !== "string") return "";
    const [yStr, mStr, dStr] = baseStr.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    const d = Number(dStr);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
      return "";
    }
    const date = new Date(Date.UTC(y, m - 1, d));
    const dow = date.getUTCDay(); // 0 = Sun..6 = Sat
    const offset = dow === 0 ? 6 : dow - 1;
    date.setUTCDate(date.getUTCDate() - offset);
    const yy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(date.getUTCDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }, [calendarSelectedDate]);
  const chainGraphWeekView = useFranchiseWeekView(reviewWorkweekStartDate);
  const chainGraphWeekData = useMemo(
    () => (Array.isArray(chainGraphWeekView.data) ? chainGraphWeekView.data : undefined),
    [chainGraphWeekView.data],
  );
  const { graph: moveChainGraph } = useMoveChainGraph(
    intents,
    chainGraphWeekData,
  );

  const chainBadgeByIntentId = useMemo<ReadonlyMap<number, ChainBadgeInfo>>(
    () => {
      const out = new Map<number, ChainBadgeInfo>();
      moveChainGraph.chains.forEach((chain, chainIdx) => {
        const chainNumber = chainIdx + 1; // matches MoveChainChipRow.chainGlobalIndex
        // 2026-05-08 follow-up: dot color is the intent's PER-STEP
        // color (`chain.stepColors[stepOrdinal]`), not the chain's
        // first-step `chain.color`. A 4-step chain renders four
        // distinct dot colors across its four cards (red, orange,
        // yellow, green), exactly mirroring the dots in the
        // chip-row chip's per-step flow — so each badge dot is
        // visually identifiable as "this dot in that chip-row
        // chain". The previous wiring used `chain.color` for every
        // card in a chain, collapsing the cascade to a single hue.
        chain.intentIds.forEach((intentId, stepIdx) => {
          const stepColor = chain.stepColors[stepIdx] ?? chain.color;
          out.set(intentId, {
            chainId: chain.id,
            chainNumber,
            color: stepColor,
          });
        });
      });
      return out;
    },
    [moveChainGraph],
  );

  // D2P-FE-13 follow-up (2026-04-26): customer + tech name lookups
  // sourced from the day-view query cache. Used by IntentCard to
  // render dates / times / tech names in user-friendly form, and
  // by the nested LinterEdgeCard to humanize the wire-format
  // `humanMessage` and "Affects:" id chips.
  const calendarLookups = useCalendarDisplayLookups();

  const handleIntentPress = useCallback(
    (appointmentId: number) => {
      if (__DEV__) {
        console.log("[DEBUG:Review] tap → intent card", { appointmentId });
      }
      router.push({
        pathname: "/order/[id]",
        params: { id: String(appointmentId) },
      });
    },
    [router],
  );

  const handleHelpPress = useCallback(() => {
    if (__DEV__) {
      console.log("[DEBUG:Review] tap → help");
    }
    router.push("/pending-reality/help");
  }, [router]);

  // P7-FE-1: surface AI-emitted sessions awaiting FO review. Only
  // franchise-owner / franchisor users see the AI tab — technicians
  // can't act on AI sessions per the trust gradient (§2.5).
  //
  // PLAN-DEVIATION: 2026-05-09-pr-ux-17-strip-ai-demo — the AI tab
  // is now ALSO gated on `Config.DEMO_MODE`. The §5.2.5 spec
  // assumed AI-emitted sessions would be a live production
  // surface, but in v1 the AI engine is BE demo-seeder fodder
  // (`005_pending_reality_demo`) and the FE "AI tab" was its only
  // consumer. Showing a tab whose sole content is demo data on a
  // production-mode FO calendar (a) misleads the user about app
  // capability and (b) sent finalize success copy to a tab that
  // isn't even visible. See docs/PLAN-DEVIATIONS.md#2026-05-09-pr-ux-17-strip-ai-demo.
  const userRole = useAuthStore((s) => s.user?.role ?? null);
  const userId = useAuthStore((s) => s.user?.userId ?? null);
  const isFranchiseOwner =
    userRole === UserRole.FRANCHISE_OWNER ||
    userRole === UserRole.FRANCHISOR;
  const aiTabAvailable = isFranchiseOwner && Config.DEMO_MODE;
  const aiSessionsQuery = useAiSuggestionSessions({
    enabled: aiTabAvailable,
  });
  const aiSessions = aiSessionsQuery.data ?? [];
  const aiBadgeCount = aiSessions.length;

  // DEV: only re-log when something visible to the gate changes
  // (was previously per-render, which spammed the console on every
  // calendar tick).
  const aiGateTraceRef = useRef<string>("");
  useEffect(() => {
    if (!__DEV__) return;
    const errMsg = aiSessionsQuery.error
      ? String((aiSessionsQuery.error as Error).message)
      : null;
    const key = `${userRole ?? "null"}|${isFranchiseOwner}|${aiTabAvailable}|${aiSessionsQuery.status}|${aiBadgeCount}|${errMsg ?? ""}`;
    if (aiGateTraceRef.current === key) return;
    aiGateTraceRef.current = key;
    console.log("[DEBUG:Review] aiTabGate", {
      userRole,
      isFranchiseOwner,
      aiTabAvailable,
      aiSessionsStatus: aiSessionsQuery.status,
      aiSessionsError: errMsg,
      aiBadgeCount,
    });
  }, [
    userRole,
    isFranchiseOwner,
    aiTabAvailable,
    aiSessionsQuery.status,
    aiSessionsQuery.error,
    aiBadgeCount,
  ]);

  const authorizeMutation = useAuthorizeReorganizationSession();
  const denyMutation = useDenyReorganizationSession();

  // PR 4 (item E): inline counter-propose composer state. We store
  // the AI session id under `counterProposeTargetId` and resolve the
  // full session row from the AI sessions list (rather than the FO
  // having to refetch detail) so the sheet can populate intents
  // without a round-trip.
  const [counterProposeTargetId, setCounterProposeTargetId] = useState<
    number | null
  >(null);
  const counterProposeSession = useMemo(
    () =>
      counterProposeTargetId == null
        ? null
        : (aiSessions.find((s) => s.id === counterProposeTargetId) ?? null),
    [counterProposeTargetId, aiSessions],
  );

  const [activeTab, setActiveTabRaw] = useState<ReviewTab>("sequence");
  const setActiveTab = useCallback((next: ReviewTab) => {
    if (__DEV__) {
      console.log("[DEBUG:Review] setActiveTab", { next });
    }
    setActiveTabRaw(next);
  }, []);
  const [declineTarget, setDeclineTarget] = useState<number | null>(null);

  // 2026-05-11 (post-FE-CR-1-2 smoke): Modify-from-review target.
  // When non-null, the `AppointmentDetailSheet` (the same customer-
  // info popup the calendar tab shows on appointment-tap) opens
  // anchored to this intent's appointment. Held as the intent ref
  // rather than the appointment id so the sheet's `appointment` prop
  // can fall through `intentDisplayLookup.get(...)` once on each
  // render (any later refetch of the appointment query reflects
  // immediately). See `handleModify` for the producer side.
  const [modifyTargetIntent, setModifyTargetIntent] =
    useState<ReorganizationIntent | null>(null);
  const modifyDetailSheetRef = useRef<AppSheetRef>(null);

  /**
   * Server-side linter issues from a 422 finalize response. Held in
   * local state (not in the store) so the next local linter run
   * doesn't clobber them — `usePendingRealityStore.runLocalLinter`
   * overwrites `linterIssues` outright. We render `localIssues +
   * serverIssues` deduped by `(kind, ids, message)` so the user
   * sees both sets on the same intent without doubles.
   */
  const [serverIssues, setServerIssues] = useState<LinterIssue[]>([]);
  const finalizeMutation = useFinalizeReorganizationSession();
  // FE-CR-1-2 (2026-05-11) — `useCommitIntentsBatch` consumes the
  // `B-CR-1-2` per-intent commit endpoint. Used by `handleSweepClean`
  // below to commit only the clean subset of a mixed clean+dirty
  // session, replacing the prior session-scoped finalize that forced
  // an all-or-nothing gate on Sweep visibility.
  const commitIntentsBatchMutation = useCommitIntentsBatch();
  const applyAutoFixMutation = useApplyAutoFix();
  // PR-UX-19 (2026-05-09) — fix for the post-PR-UX-18 hole: the
  // review screen's "Remove" button used to drop the intent from
  // the local Zustand store ONLY (`removeIntent(intentId)`),
  // never sending the BE-side `op: "remove_intent"` PATCH. The
  // very next active-session refetch (foreground bridge,
  // staleTime, or any other invalidation) hydrated the still-
  // present BE intent back into the store via
  // `setSession(refresh+intents)`, and finalize then committed
  // every "removed" intent — exactly the same shape PR-UX-18
  // fixed for `useSessionAwareSubmit`'s de-escalation drag, just
  // missed on the manual Remove path. The hook below routes the
  // remove through the same `useRemoveReorganizationIntent`
  // producer the drag path uses; its `onSuccess` calls
  // `setSession(session, intents)` with the BE's trimmed intent
  // list, so the local store reflects the truth and the next
  // refetch can't resurrect the removed intent. Don't add a
  // local `removeIntent(...)` call alongside — that's the
  // regression PR-UX-18 closed at the drag callsite, and
  // re-introducing it here would re-open the same race.
  const removeIntentMutation = useRemoveReorganizationIntent();
  // PLAN-DEVIATION: 2026-05-08-cancel-hook-no-auto-coord — local-state
  // cleanup after a successful BE cancel (calling `clear()` and writing
  // `null` into the active-session cache so rehydration polling can't
  // resurrect the just-cancelled draft) lives HERE, not in
  // `useCancelReorganizationSession.onSuccess`. The hook is now a pure
  // network primitive; this handler owns the local coordination so the
  // cleanup can be gated on "the cancelled session is still the active
  // one" — preventing a stale in-flight cancel mutation completing
  // after a fresh stage from wiping the new session. See
  // docs/PLAN-DEVIATIONS.md#2026-05-08-cancel-hook-no-auto-coord.
  const cancelMutation = useCancelReorganizationSession();
  const queryClient = useQueryClient();
  const franchiseIdForCacheWrite = useAuthStore(
    (s) => s.user?.franchiseId ?? null,
  );
  // D2P-FE-13 — single seam for the post-auto-fix `runLocalLinter`
  // call. Replaces the local `EMPTY_WORLD_SNAPSHOT` constant with the
  // memoized day-view-cache snapshot the rest of the calendar already
  // consumes (drag handler + four form sheets). Resolves the
  // 2026-04-23-pending-reality-trim deviation's deferred consumer
  // half. See docs/PLAN-DEVIATIONS.md#2026-04-23-pending-reality-trim
  // for the full rationale.
  const worldSnapshot = useCalendarWorldSnapshot();

  // ── PR-UX-20 + FE-CR-1-2: Sweep clean ones ─────────────────────
  // The detection hook gives us the mechanically-clean intent set
  // (1-link chain, no linter conflict, no cross-chain conflict),
  // ignoring suppression/snooze. The Sweep button is an explicit
  // user action — passive suppression rules don't apply.
  //
  // FE-CR-1-2 (2026-05-11) — the original PR-UX-20 implementation
  // used `useFinalizeReorganizationSession` (session-scoped) and
  // gated the button on "every intent in the session is clean."
  // That compromise was documented as
  // `2026-05-09-pr-ux-20-sweep-finalizes-session` because per-intent
  // commit didn't exist on the BE yet. The 2026-05-10 BE chunk
  // `B-CR-1-2` (REMIBackend PR #61) shipped
  // `POST /reorganizations/:id/intents/commit-many`, so we now
  // dispatch `useCommitIntentsBatch` with the clean-intent id list
  // and the all-or-nothing gate retires. See the in-place
  // "RESOLVED by FE-CR-1-2" callout in
  // `docs/PLAN-DEVIATIONS.md#2026-05-09-pr-ux-20-sweep-finalizes-session`.
  const sweepLinterAppointments = useMemo(() => {
    if (!chainGraphWeekData) {
      return [] as readonly import("@technician/utils/logistics-linter").LinterAppointment[];
    }
    return dayDataToLinterAppointments(chainGraphWeekData);
  }, [chainGraphWeekData]);
  const sweepDetection = useCleanIntentPromotion({
    appointments: sweepLinterAppointments,
  });
  // FE-CR-1-2 (2026-05-11) — the all-or-nothing "every intent must be
  // clean" gate retires here. `useCommitIntentsBatch` commits only the
  // ids we pass in, so dirty intents are safely left alone on the
  // server. The Sweep CTA now surfaces whenever there are ≥2 clean
  // intents, even if dirty intents are present alongside them. See
  // PLAN-DEVIATION `2026-05-09-pr-ux-20-sweep-finalizes-session` for
  // the prior compromise this resolves.
  const sweepCleanIntents = useMemo<ReorganizationIntent[]>(
    () => sweepDetection.cleanIntents,
    [sweepDetection.cleanIntents],
  );
  const [sweepProgressLabel, setSweepProgressLabel] = useState<string | null>(
    null,
  );

  const issuesForRender = useMemo(
    () => mergeIssues(localIssues, serverIssues),
    [localIssues, serverIssues],
  );

  const dismissScreen = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  // PLAN-DEVIATION: 2026-05-11-modify-opens-detail-popup — the
  // master plan §5.3.5 sketched a dedicated edit-intent sheet, and
  // the historical P3-FE-6 chunk-prompt promised the same thing
  // ("sheet-draft store + edit sheet"). Neither landed.
  //
  // 2026-05-11 (post-FE-CR-1-2 smoke) — the prior revisions of
  // this handler routed to the calendar with an instructional
  // "Drag to update" Alert, then to a silent dismiss-to-calendar.
  // The user rejected the alert during smoke ("unacceptable") and
  // clarified what they want: the SAME customer-info popup that
  // opens when an appointment is tapped on the calendar
  // (`AppointmentDetailSheet`) — anchored to the intent's
  // underlying appointment, mounted inline on the review screen.
  // The popup gives them read-only customer info (name, phone,
  // address, service summary) immediately, plus the standard
  // Reschedule / Cancel / Edit / Quick text actions. Those
  // actions route back to the calendar so the existing flow
  // takes over (no need to duplicate `RescheduleSheet` /
  // `CancelSheet` / `AppointmentFormSheet` mounts here).
  //
  // Personal-event intents (no `appointment_id`) fall through to
  // the silent dismiss-to-calendar path — the detail sheet only
  // understands `CalendarAppointmentItem`, and the user has no
  // "customer info" to view for a personal block anyway.
  //
  // Anti-instructions:
  //   - Don't re-introduce the "Drag to update" Alert. The user
  //     rejected it; the popup IS the answer.
  //   - Don't re-introduce a dedicated "Edit intent" sheet without
  //     deleting this handler first; two paths for the same edit
  //     would race against each other (one fires `modify_intent`
  //     against the BE; the other rewrites the local store).
  //   - Don't drop the calendar-date sync on the fallback path: if
  //     the user opens the review screen from a different week than
  //     the personal-event intent lives in, returning to the
  //     calendar without the date update lands them on the wrong
  //     week and the card they're supposed to drag isn't visible.
  const handleModify = (intentId: number) => {
    const intent = intents.find((i) => i.id === intentId);
    if (!intent) {
      if (__DEV__) {
        console.warn("[DEBUG:Review] Modify: intent not found", { intentId });
      }
      dismissScreen();
      return;
    }
    // Customer-info popup path — only for intents bound to an
    // appointment (reschedule / reassign / cancel / create on the
    // appointments table). The `AppointmentDetailSheet` takes a
    // `CalendarAppointmentItem`; we resolve from the lookup the
    // screen already builds for the per-intent card chrome. If the
    // appointment isn't in the cache yet (newly-created intent the
    // BE hasn't returned a full row for, or a stale lookup mid-
    // refetch), fall through to the silent dismiss-to-calendar
    // path so the user still has SOMETHING happen on tap.
    if (intent.appointment_id != null) {
      const appt = intentDisplayLookup.get(intent.appointment_id);
      if (appt) {
        if (__DEV__) {
          console.log("[DEBUG:Review] Modify → customer-info popup", {
            intentId,
            intentType: intent.intent_type,
            appointmentId: intent.appointment_id,
          });
        }
        setModifyTargetIntent(intent);
        // Imperatively snap the gorhom BottomSheet open. The mount
        // is gated on `modifyTargetIntent != null`, so the sheet's
        // ref isn't populated until React commits. Mirror the
        // calendar's `trySnapSheetOpen` retry pattern — ~6 frames
        // is usually enough; we cap at 24 attempts (~1s) before
        // giving up to avoid a stuck timer.
        const trySnap = (attempt = 0) => {
          if (modifyDetailSheetRef.current) {
            modifyDetailSheetRef.current.snapToIndex(0);
            return;
          }
          if (attempt >= 24) return;
          setTimeout(() => trySnap(attempt + 1), 40);
        };
        trySnap();
        return;
      }
    }
    // Fallback: silent dismiss-to-calendar with the date pre-set.
    // Covers personal-event intents (no `appointment_id`) and the
    // cache-miss case above. The cyan-tile overlay on the
    // destination tile makes the dragable card obvious; PR-UX-18
    // re-stage handles the wire write when the user re-drags.
    let targetDate: string | null = null;
    const payload = intent.payload as unknown as Record<string, unknown>;
    if (typeof payload.new_scheduled_date === "string") {
      targetDate = payload.new_scheduled_date;
    } else if (typeof payload.scheduled_date === "string") {
      targetDate = payload.scheduled_date;
    } else if (typeof payload.new_start_time === "string") {
      // personal_event_update: `new_start_time` is a full ISO string,
      // slice the date portion.
      targetDate = (payload.new_start_time as string).slice(0, 10);
    } else if (typeof payload.start_time === "string") {
      // personal_event_create
      targetDate = (payload.start_time as string).slice(0, 10);
    } else {
      // Snapshot fallback — populated by the BE on `add_intent` /
      // `modify_intent` for cancel/reassign cases where the payload
      // doesn't carry a date itself.
      const snapshot = intent.prior_state_snapshot as
        | Record<string, unknown>
        | null;
      if (snapshot && typeof snapshot.scheduled_date === "string") {
        targetDate = snapshot.scheduled_date;
      }
    }
    if (targetDate) {
      useCalendarStore.getState().setSelectedDate(targetDate);
    }
    if (__DEV__) {
      console.log("[DEBUG:Review] Modify → calendar (silent navigate)", {
        intentId,
        intentType: intent.intent_type,
        appointmentId: intent.appointment_id,
        targetDate,
        reason:
          intent.appointment_id == null
            ? "no-appointment-id (personal event?)"
            : "appointment-not-in-display-lookup",
      });
    }
    dismissScreen();
  };

  /**
   * Shared action-callback handler for the customer-info popup. The
   * detail sheet exposes Reschedule / Cancel / Edit / Quick text as
   * separate callbacks, but they all route the same way from this
   * screen: close the popup, pre-set the calendar's `selectedDate`
   * to the intent's destination so the right week is in view, and
   * dismiss the review screen so the user lands on the calendar.
   * From there the user taps the appointment again to invoke the
   * specific sheet they want — the calendar's existing tap-on-
   * appointment flow takes over. Replicating the calendar's per-
   * action sheet mounts here would double the surface area without
   * adding value (the user came from the calendar, they know that
   * route works).
   */
  const handleModifyDetailActionRouting = (
    targetIntent: ReorganizationIntent,
  ) => {
    let targetDate: string | null = null;
    const payload = targetIntent.payload as unknown as Record<string, unknown>;
    if (typeof payload.new_scheduled_date === "string") {
      targetDate = payload.new_scheduled_date;
    } else if (typeof payload.scheduled_date === "string") {
      targetDate = payload.scheduled_date;
    } else if (typeof payload.new_start_time === "string") {
      targetDate = (payload.new_start_time as string).slice(0, 10);
    } else if (typeof payload.start_time === "string") {
      targetDate = (payload.start_time as string).slice(0, 10);
    } else {
      const snapshot = targetIntent.prior_state_snapshot as
        | Record<string, unknown>
        | null;
      if (snapshot && typeof snapshot.scheduled_date === "string") {
        targetDate = snapshot.scheduled_date;
      }
    }
    if (targetDate) {
      useCalendarStore.getState().setSelectedDate(targetDate);
    }
    setModifyTargetIntent(null);
    dismissScreen();
  };

  /**
   * Sweep handler — commits the clean subset of the session via the
   * `commit-many` endpoint (FE-CR-1-2).
   *
   * Per FE-CR-1-2, this no longer finalizes the entire session. The
   * BE accepts a `intent_ids: number[]` list and commits exactly that
   * subset, leaving dirty intents in `proposed` state for the user to
   * resolve. Two terminal shapes from the BE:
   *
   *   - `session.status === "committed"` (all intents in the session
   *     are now committed) — the review screen has no work left;
   *     show the same celebratory alert + dismiss-to-calendar flow
   *     `useFinalizeReorganizationSession` previously drove. The
   *     hook's `onSuccess` already wrote `null` to the active-session
   *     cache and cleared `usePendingRealityStore`; we just route.
   *
   *   - `session.status` still `draft` / `pending_review` (dirty
   *     intents remain) — toast-style alert summarizing the partial
   *     commit, then STAY on the review screen. The hook called
   *     `setSession(session, intents)` with the BE's trimmed list, so
   *     the screen re-renders with only the leftover dirty intents.
   *     The user can then `Modify` / `Remove` / `Apply auto-fix`
   *     them and re-Sweep later. PLAN-DEVIATION
   *     `2026-05-09-pr-ux-18-clear-before-alert` explains why the
   *     store mutation must precede the alert (Android Alert blocks
   *     the JS event loop on the OS modal).
   *
   * Per FE-CR-1-2's regression watch points, this handler:
   *   - Captures the swept-count (and the swept ids, for future
   *     batch-Undo in FE-CR-UX-20-UNDO) BEFORE firing the mutation so
   *     the success alert can reference them after the local store
   *     has been mutated.
   *   - Does NOT call `clear()` itself — the hook owns that on the
   *     terminal branch and skips it on the partial branch.
   *   - Does NOT route to `authorizeMutation` when status is
   *     `pending_review`. Pre-FE-CR-1-2, Sweep on pending_review
   *     called authorize (the FO action that commits the whole
   *     session). The new commit-many endpoint accepts both
   *     `draft` and `pending_review`, so the routing collapses to
   *     one path.
   *
   * Batch-Undo on the success alert ships in FE-CR-UX-20-UNDO; this
   * handler captures the `committedIntentIds` on the response so the
   * follow-up chunk can wire an `Undo` button into the alert without
   * touching this control flow.
   */
  const handleSweepClean = useCallback(() => {
    if (sessionId == null) return;
    if (sweepCleanIntents.length < 2) return;
    if (sweepProgressLabel != null) return;
    const intentIds = sweepCleanIntents.map((intent) => intent.id);
    const count = intentIds.length;
    setSweepProgressLabel(`Sweeping ${count} clean moves…`);
    commitIntentsBatchMutation.mutate(
      { sessionId, intentIds },
      {
        onSuccess: ({ session, committedIntentIds }) => {
          setSweepProgressLabel(null);
          const appliedCount = committedIntentIds.length;
          if (session.status === "committed") {
            // Terminal — the session is closed. Existing flow:
            // celebrate + dismiss to calendar. (The hook already
            // cleared `usePendingRealityStore` and the active-session
            // cache; see the hook's `onSuccess` for the rationale.)
            Alert.alert(
              `Applied ${appliedCount} clean moves`,
              "The session has been committed. Open the calendar to see the result.",
              [{ text: "OK", onPress: dismissScreen }],
            );
            return;
          }
          // Partial — dirty intents remain. The hook called
          // `setSession(session, intents)` so the review screen
          // re-renders against the trimmed BE-canonical list.
          // Surface a quick toast-style alert summarizing what was
          // applied and explicitly mention that more work remains;
          // do NOT dismiss the screen — the user has dirty intents
          // to handle.
          Alert.alert(
            `Applied ${appliedCount} clean moves`,
            "Some intents still need attention — review the remaining cards.",
          );
        },
        onError: (err) => {
          setSweepProgressLabel(null);
          if (err instanceof CommitBatchRejectedError) {
            // 409 INTENT_HAS_CONFLICTS — overlay the server-side
            // issues on top of the local linter output so the user
            // can resolve them inline (mirrors the
            // `useFinalizeReorganizationSession` `linter_rejected`
            // flow).
            setServerIssues(err.issues);
            Alert.alert(
              "Couldn't sweep",
              "The server-side linter caught a conflict. Review the inline issues and try again.",
            );
            return;
          }
          if (err instanceof CommitBatchIntentNotFoundError) {
            // 404 INTENT_NOT_FOUND — one of the ids is gone (likely
            // the user has a stale local copy). The realtime
            // session-detail invalidation will refresh the store on
            // the next cycle; surface a "refresh and retry" alert.
            Alert.alert(
              "Couldn't sweep",
              "Some intents are no longer available. Refresh and try again.",
            );
            return;
          }
          // Network / 5xx / unexpected.
          Alert.alert(
            "Couldn't sweep",
            "Something went wrong reaching the server. The session is unchanged.",
          );
        },
      },
    );
  }, [
    sessionId,
    sweepCleanIntents,
    sweepProgressLabel,
    commitIntentsBatchMutation,
    dismissScreen,
  ]);

  const handleApplyAutoFix = (intentId: number, issue: LinterIssue) => {
    if (sessionId == null || !issue.suggestedAutoFix) {
      if (__DEV__) {
        console.log("[DEBUG:Review] applyAutoFix ignored", {
          sessionId,
          intentId,
          hasSuggestion: !!issue.suggestedAutoFix,
        });
      }
      return;
    }
    if (__DEV__) {
      console.log("[DEBUG:Review] tap → Apply auto-fix", {
        intentId,
        issueKind: issue.kind,
        issueSeverity: issue.severity,
      });
    }
    // 2026-05-12 fix/auto-fix-payload-target-id — stitch the target id
    // onto the suggestedAutoFix payload before it leaves this seam.
    // The BE Zod schemas require:
    //   - `appointment_id` for reschedule / reassign / cancel
    //   - `personal_event_id` for personal_event_update / personal_event_delete
    //   - (no target id for create / personal_event_create)
    // Mirrors the `useSessionAwareSubmit` D2P-FE-13 producer pattern at
    // `src/hooks/schedule/use-session-aware-submit.ts`. The auto-fix
    // path was the missing producer — the BE rejected `op:modify_intent`
    // with `intent.appointment_id: Required` (HTTP 422) because the
    // linter's `shiftIntentByMinutes` helper produces a TS-shape payload
    // (mirrors `ReorganizationIntentPayload` which doesn't declare the
    // id field — it's wire-only). We read the target id off the
    // originating intent's `appointment_id` / `personal_event_id`
    // column, which `serializeIntent` populates on every read.
    const sourceIntent = intents.find((i) => i.id === intentId);
    if (sourceIntent == null) {
      if (__DEV__) {
        console.warn("[DEBUG:Review] applyAutoFix — source intent not found", {
          intentId,
          knownIntentIds: intents.map((i) => i.id),
        });
      }
      // No source intent means the BE call would have failed anyway
      // (modify_intent against an unknown intent_id → 404). Bail
      // quietly instead of sending a deterministically-broken request.
      return;
    }
    // Conditional spread (no explicit cast) so the produced type stays
    // assignable to `ReorganizationIntentPayload`. Mirrors the
    // `proposedForWire = { ...proposed, ...(maybeApptId ? {appointment_id: ...} : {}), ... }`
    // pattern in `useSessionAwareSubmit.ts` — TS excess-property checks
    // skip non-fresh object literals so the union stays narrow.
    const stitchedIntent = {
      ...issue.suggestedAutoFix,
      ...(sourceIntent.appointment_id != null
        ? { appointment_id: sourceIntent.appointment_id }
        : {}),
      ...(sourceIntent.personal_event_id != null
        ? { personal_event_id: sourceIntent.personal_event_id }
        : {}),
    };
    // Clear any prior server-side issues for the affected intent so a
    // stale 422 from a previous finalize doesn't outlive its
    // resolution. The next finalize will re-populate.
    setServerIssues((prev) =>
      prev.filter((i) => !i.affectedAppointmentIds.some((id) =>
        issue.affectedAppointmentIds.includes(id),
      )),
    );
    applyAutoFixMutation.mutate(
      {
        sessionId,
        intentId,
        intent: stitchedIntent,
        // D2P-FE-13 — real snapshot from the day-view query cache.
        // `routes`, `customerSlas`, and `fleet.accounts` are still
        // empty until their respective caches ship (R3/R4/R9/R10
        // simply don't fire); the high-value rules (R1+R2 time
        // conflict, R6 series consistency) are live.
        worldSnapshot,
      },
      {
        onError: (err) => {
          if (err instanceof ApplyAutoFixRejectedError) {
            // Server-side linter rejected the auto-fix itself.
            // Surface the new issues inline so the dispatcher can
            // see what's wrong with the suggested replacement.
            setServerIssues((prev) => [...prev, ...err.issues]);
            setActiveTab("sequence");
            return;
          }
          // In DEV, surface the wire-level failure on-screen so a
          // reproduction reveals the cause without scrolling Metro
          // logs. The hook's catch block has already emitted a
          // structured `console.warn` — this is the eyeball-level
          // companion. Production users still get the clean message.
          // Common modes worth recognizing:
          //   - 409 session_not_draft → the staged session was
          //     finalized; auto-fix can't edit non-draft sessions.
          //     Bug surface: usually means the user finalized the
          //     review screen between staging and tapping auto-fix.
          //   - 403 only_author_can_edit → another user authored
          //     the session (shouldn't happen on a single device).
          //   - 404 intent_not_found / session_not_found → stale
          //     local state pointing at a row the BE doesn't have.
          //   - 400 zod-invalid → the suggestedAutoFix payload is
          //     missing a required field (e.g. appointment_id).
          let detail: string | null = null;
          if (__DEV__) {
            const axiosErr = err as AxiosError<ApiResponse<unknown>>;
            const status = axiosErr.response?.status;
            const beMessage = axiosErr.response?.data?.message;
            if (status != null) {
              detail = `\n\n[DEV] HTTP ${status}${
                beMessage ? ` — "${beMessage}"` : ""
              }`;
            } else if (axiosErr.message) {
              detail = `\n\n[DEV] ${axiosErr.message}`;
            }
          }
          Alert.alert(
            "Couldn't apply auto-fix",
            "Something went wrong reaching the server. The change wasn't applied — try again in a moment." +
              (detail ?? ""),
          );
        },
      },
    );
  };

  const handleRemove = (intentId: number) => {
    if (__DEV__) {
      console.log("[DEBUG:Review] tap → Remove intent (confirm)", { intentId });
    }
    Alert.alert(
      "Remove this change?",
      "The intent will be removed from this Pending Reality session. The original appointment is unaffected until you finalize.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            // PR-UX-19 (2026-05-09): defensive — the action bar
            // ensures intents.length > 0, but the mutation requires
            // a real `sessionId`. If the store is mid-clear (e.g. a
            // finalize completing while the alert is on screen) the
            // mutation would 404. Surface a quiet alert and bail.
            if (sessionId == null) {
              Alert.alert(
                "Couldn't remove",
                "This change is no longer attached to an active session.",
              );
              return;
            }
            removeIntentMutation.mutate(
              { sessionId, intentId, worldSnapshot },
              {
                onSuccess: ({ intents: nextIntents }) => {
                  if (__DEV__) {
                    console.log("[DEBUG:Review] remove_intent BE success", {
                      sessionId,
                      intentId,
                      remainingIntentCount: nextIntents.length,
                    });
                  }
                  // Clear any stale server-side issues that named
                  // the removed intent's appointment — the next
                  // finalize will re-populate if they still apply
                  // to whatever's left.
                  setServerIssues((prev) =>
                    prev.filter(
                      (issue) =>
                        !issue.affectedAppointmentIds.some((id) =>
                          nextIntents.every((i) => i.appointment_id !== id),
                        ),
                    ),
                  );
                },
                onError: (err) => {
                  let detail: string | null = null;
                  if (__DEV__) {
                    const axiosErr = err as AxiosError<ApiResponse<unknown>>;
                    const status = axiosErr.response?.status;
                    const beMessage = axiosErr.response?.data?.message;
                    if (status != null) {
                      detail = `\n\n[DEV] HTTP ${status}${
                        beMessage ? ` — "${beMessage}"` : ""
                      }`;
                    } else if (axiosErr.message) {
                      detail = `\n\n[DEV] ${axiosErr.message}`;
                    }
                  }
                  Alert.alert(
                    "Couldn't remove",
                    "Something went wrong reaching the server. The change wasn't removed — try again in a moment." +
                      (detail ?? ""),
                  );
                },
              },
            );
          },
        },
      ],
    );
  };

  const handleCancelSession = () => {
    if (__DEV__) {
      console.log("[DEBUG:Review] tap → Cancel session (confirm)", {
        sessionId,
        intentCount: intents.length,
      });
    }
    Alert.alert(
      "Cancel this session?",
      "All staged changes will be cancelled. Nothing on the calendar moves.",
      [
        { text: "Keep editing", style: "cancel" },
        {
          text: "Cancel session",
          style: "destructive",
          onPress: () => {
            // No backend session yet (defensive — should not happen
            // because the action bar only renders once intents are
            // staged, and staging always creates a session first).
            // Treat as a local-only clear and dismiss.
            if (sessionId == null) {
              clear();
              setServerIssues([]);
              dismissScreen();
              return;
            }
            // Capture the cancelled session id before firing so the
            // per-call `onSuccess` can compare it against the live
            // store state. Rapid Cancel-then-stage flows can complete
            // a stale mutation AFTER the user has staged a fresh
            // session; gating the local clear on a sessionId match
            // prevents the new session from being wiped.
            const cancelledSessionId = sessionId;
            cancelMutation.mutate(
              { sessionId: cancelledSessionId },
              {
                onSuccess: () => {
                  // Only clear local state if the cancelled session
                  // is still the device's active one. Otherwise a
                  // stale-in-flight cancel completing after a fresh
                  // stage would clear the new session.
                  const liveStore = usePendingRealityStore.getState();
                  if (liveStore.sessionId === cancelledSessionId) {
                    liveStore.clear();
                    // P3-FE-REHYDRATE-MOUNT §7.3 — write `null` into
                    // the active-session cache so the rehydration
                    // poll can't resurrect the just-cancelled draft.
                    // Conditional for the same reason as the clear.
                    cacheReorganizationResult(
                      queryClient,
                      franchiseIdForCacheWrite,
                      null,
                    );
                    // PR-UX-12 (2026-05-09): suppress the next
                    // adopt-fetched for ~60s. Without this, the
                    // realtime `session_cancelled` event fires a
                    // refetch, the BE returns the NEXT pending_review
                    // session (FOs typically have several queued), and
                    // `reconcileActiveSession` adopts it — wiping the
                    // user's just-cancelled clean state and re-staging
                    // cards on the calendar under their cursor. The
                    // user reported "had to do it twice" + "still see
                    // staged cards on the calendar"; the snooze gives
                    // them a quiet calendar after every cancel and
                    // expires automatically OR clears when they
                    // navigate back to the review screen via the FAB
                    // (the screen calls `clearAdoptSnooze()` on mount).
                    // Read AFTER `clear()` so the snooze survives the
                    // INITIAL_STATE reset. See
                    // `usePendingRealityStore.adoptSnoozeUntilMs` JSDoc
                    // for anti-instructions.
                    usePendingRealityStore
                      .getState()
                      .setAdoptSnoozeUntil(
                        Date.now() + ADOPT_SNOOZE_DURATION_MS,
                      );
                  } else if (__DEV__) {
                    console.log(
                      "[handleCancelSession] stale cancel onSuccess — skipping local clear",
                      {
                        cancelledSessionId,
                        liveSessionId: liveStore.sessionId,
                      },
                    );
                  }
                  setServerIssues([]);
                  dismissScreen();
                },
                onError: (err) => {
                  if (__DEV__) {
                    console.warn(
                      "[handleCancelSession] cancel mutation failed",
                      err,
                    );
                  }
                  // Leave local state intact — the user's draft is
                  // still alive on the BE and locally; they can
                  // retry without losing intents.
                  Alert.alert(
                    "Couldn't cancel session",
                    "Something went wrong reaching the server. The session is still active — try again in a moment.",
                  );
                },
              },
            );
          },
        },
      ],
    );
  };

  const handleAiApprove = (aiSessionId: number) => {
    if (__DEV__) {
      console.log("[DEBUG:Review/AI] tap → Approve", { aiSessionId });
    }
    Alert.alert(
      "Approve this AI suggestion?",
      "The session will be authorized for commit. The franchise calendar updates as soon as the BE finishes the atomic commit.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve",
          onPress: () =>
            authorizeMutation.mutate(
              { sessionId: aiSessionId },
              {
                onError: () => {
                  Alert.alert(
                    "Couldn't approve",
                    "Something went wrong reaching the server. Try again in a moment.",
                  );
                },
              },
            ),
        },
      ],
    );
  };

  const handleAiDecline = (aiSessionId: number) => {
    if (__DEV__) {
      console.log("[DEBUG:Review/AI] tap → Decline (open picker)", {
        aiSessionId,
      });
    }
    setDeclineTarget(aiSessionId);
  };

  const handleAiCounterPropose = (aiSessionId: number) => {
    if (__DEV__) {
      console.log("[DEBUG:Review/AI] tap → Counter-propose (open sheet)", {
        aiSessionId,
      });
    }
    // PR 4 (item E): open the inline counter-propose sheet. Replaces
    // the placeholder Alert that pointed users back to the calendar.
    // The sheet supports inline edits to `reschedule` and `reassign`
    // intents — other intent types stay read-only (the FO declines
    // the suggestion to remove them).
    setCounterProposeTargetId(aiSessionId);
  };

  const handleDeclineSubmit = (payload: {
    kind: DeclineReasonKind;
    text?: string;
  }) => {
    if (declineTarget == null) {
      if (__DEV__) {
        console.log(
          "[DEBUG:Review/AI] decline submit ignored (no target)",
          payload,
        );
      }
      return;
    }
    const target = declineTarget;
    if (__DEV__) {
      console.log("[DEBUG:Review/AI] decline submit", {
        aiSessionId: target,
        kind: payload.kind,
        hasText: payload.text !== undefined,
      });
    }
    denyMutation.mutate(
      {
        sessionId: target,
        declineReasonKind: payload.kind,
        declineReasonText: payload.text,
      },
      {
        onSuccess: () => {
          setDeclineTarget(null);
        },
        onError: () => {
          Alert.alert(
            "Couldn't decline",
            "Something went wrong reaching the server. The suggestion is still pending — try again in a moment.",
          );
        },
      },
    );
  };

  const handleFinalize = () => {
    if (sessionId == null) {
      if (__DEV__) {
        console.log(
          "[DEBUG:Review] tap → Finalize ignored (no active session)",
        );
      }
      return;
    }
    // PR-UX-13 (2026-05-09) Issue B diagnostics. The user reports
    // tap-to-finalize fails with HTTP 409 ("Couldn't finalize"). The
    // BE finalizeSession only emits 409 from one site:
    //   if (session.status !== "draft") throw new AppError(409,
    //     "session_not_draft");
    // We log the FE-perceived state at tap time so the smoke pass
    // can correlate the BE 409 with what the FE thought it was
    // submitting. Specifically: sessionId, intent count, FE-perceived
    // session status, last setSession timestamp + age, adopt-snooze
    // state. If the FE is sending a sessionId for a session whose BE
    // status is no longer `draft` (auto-adopted pending_review row,
    // re-finalize after a stale onSuccess, etc.), this log is the
    // first place to check.
    //
    // PR-UX-14 (2026-05-09) Issue 5 expansion: also capture
    // session terminal-state timestamps (committed_at, cancelled_at)
    // — either being non-null means the BE has already moved the
    // session out of `draft` and the upcoming finalize will 409
    // even if the FE-perceived `status` field hasn't been refreshed
    // by the realtime invalidation yet (the most likely
    // stale-pointer path). Also capture session.created_at + age
    // (long-lived sessions are more likely to be auto-adopted) and
    // a compact intents summary so we can correlate FE intent ids
    // with BE intent rows.
    const liveStore = usePendingRealityStore.getState();
    const liveSession = liveStore.session;
    const sessionCreatedAtMs = liveSession?.created_at
      ? new Date(liveSession.created_at).getTime()
      : null;
    const finalizeSnapshot = {
      sessionId,
      intentCount: intents.length,
      // The store keeps a normalized session row (rehydrated from
      // realtime + GET responses). `status` mirrors the BE column.
      perceivedStatus: liveSession?.status ?? null,
      perceivedRequiredRole:
        liveSession?.required_authorizer_role ?? null,
      perceivedFinalizedAt: liveSession?.finalized_at ?? null,
      // PR-UX-14: terminal-state timestamps. Either being non-null
      // is the smoking gun for a 409 — BE already moved the
      // session out of `draft`. ReorganizationSession does NOT
      // expose a `version` column on this app's type surface, so
      // the timestamp triple is the diagnostic surrogate.
      perceivedCommittedAt: liveSession?.committed_at ?? null,
      perceivedCancelledAt: liveSession?.cancelled_at ?? null,
      perceivedExpiresAt: liveSession?.expires_at ?? null,
      // Session age: very-young sessions (<10s) are most likely
      // local-fresh; long-lived sessions (>1h) are most likely
      // auto-adopted from the BE on a previous mount and at higher
      // risk of server-side state changes the FE hasn't seen.
      perceivedCreatedAt: liveSession?.created_at ?? null,
      perceivedAgeMs:
        sessionCreatedAtMs != null ? Date.now() - sessionCreatedAtMs : null,
      // Compact intents summary: id + appointment_id + status for
      // up to 20 entries. Bounded to keep the log line grep-friendly.
      intentSummary: intents.slice(0, 20).map((it) => ({
        id: it.id,
        appointmentId: it.appointment_id,
        status: it.intent_status,
      })),
      lastSetAt: liveStore.lastSetAt,
      lastSetAtAgeMs:
        liveStore.lastSetAt != null ? Date.now() - liveStore.lastSetAt : null,
      adoptSnoozeUntilMs: liveStore.adoptSnoozeUntilMs,
      adoptSnoozeRemainingMs:
        liveStore.adoptSnoozeUntilMs != null
          ? liveStore.adoptSnoozeUntilMs - Date.now()
          : null,
    };
    if (__DEV__) {
      console.log("[DEBUG:Review] tap → Finalize", finalizeSnapshot);
    }
    // Always-on diagnostic fire (NOT __DEV__-gated) so the user's
    // on-device log dump captures it even on a release build. Cheap
    // — single object, no recursion.
    console.log("[DIAG-FINALIZE] tap-snapshot", finalizeSnapshot);
    setServerIssues([]);

    // PR-UX-14 (2026-05-09) Issue B fix: when the local store already
    // perceives the session as `pending_review` (because the user
    // previously tapped Finalize and the BE moved the row out of
    // `draft`, OR the BE auto-finalized via realtime), tapping the
    // primary CTA again must route to AUTHORIZE, not FINALIZE. The BE
    // emits 409 `session_not_draft` from the finalize endpoint when
    // status !== "draft", which is exactly this case. The authorize
    // endpoint is the correct successor for `pending_review` sessions
    // whose `required_authorizer_role` matches the current user's
    // role (the BE rejects with 403 if the role doesn't match — we
    // surface that error to the user via the existing error path).
    //
    // The CTA label changes to "Approve" in this branch via the
    // render-side ctaLabel logic that reads `perceivedStatus`.
    //
    // PLAN-DEVIATION: 2026-05-09-finalize-cta-pending-review-routes-to-authorize
    // — see docs/PLAN-DEVIATIONS.md.
    if (liveSession?.status === "pending_review") {
      if (__DEV__) {
        console.log("[DEBUG:Review] tap → Finalize routing to authorize", {
          sessionId,
          perceivedStatus: liveSession.status,
          perceivedRequiredRole: liveSession.required_authorizer_role,
        });
      }
      console.log("[DIAG-FINALIZE] routing-to-authorize", {
        sessionId,
        perceivedStatus: liveSession.status,
        perceivedRequiredRole: liveSession.required_authorizer_role,
      });
      // PLAN-DEVIATION: 2026-05-09-pr-ux-18-clear-before-alert —
      // clear local store BEFORE firing authorize, mirroring the
      // finalize success path. The mutation may take 100-500ms
      // server-side; clearing first means the calendar's pending
      // tint drops the moment the user taps Approve, regardless
      // of network latency. On error the user re-opens the review
      // screen and reconcile rehydrates the BE-canonical row.
      clear();
      authorizeMutation.mutate(
        { sessionId },
        {
          onSuccess: (session) => {
            console.log("[DIAG-FINALIZE] authorize success", {
              sessionId,
              newStatus: session.status,
            });
            dismissScreen();
          },
          onError: (err) => {
            const axiosErr = err as {
              response?: {
                status?: number;
                data?: unknown;
                config?: { url?: string; method?: string };
              };
              message?: string;
              code?: string;
            };
            const errSnapshot = {
              sessionId,
              httpStatus: axiosErr.response?.status ?? null,
              httpUrl: axiosErr.response?.config?.url ?? null,
              httpMethod: axiosErr.response?.config?.method ?? null,
              beMessage:
                (axiosErr.response?.data as { message?: string } | undefined)
                  ?.message ?? null,
              beData: axiosErr.response?.data ?? null,
              axiosCode: axiosErr.code ?? null,
              message: axiosErr.message ?? null,
            };
            if (__DEV__) {
              console.log("[DEBUG:Review] authorize error", errSnapshot);
            }
            console.log("[DIAG-FINALIZE] authorize error", errSnapshot);
            Alert.alert(
              "Couldn't approve",
              "Something went wrong reaching the server. Try again in a moment.",
            );
          },
        },
      );
      return;
    }

    finalizeMutation.mutate(sessionId, {
      onSuccess: (result) => {
        if (__DEV__) {
          console.log("[DEBUG:Review] finalize result", {
            kind: result.kind,
            issueCount:
              result.kind === "linter_rejected" ? result.issues.length : 0,
            warningCount:
              result.kind === "linter_rejected" ? 0 : result.warnings.length,
          });
        }
        console.log("[DIAG-FINALIZE] success", {
          sessionId,
          kind: result.kind,
        });
        if (result.kind === "linter_rejected") {
          setServerIssues(result.issues);
          setActiveTab("sequence");
          // 2026-05-12 fix/finalize-linter-rejected-feedback — before
          // this fix, this branch silently updated state. The user
          // tapped Finalize, the BE rejected on N conflicts, the
          // screen wrote the SAME conflict cards back into the same
          // (already-visible) Sequence tab, and from the user's
          // perspective "nothing happened." A non-blocking Alert here
          // confirms the tap was processed and names the blocker so
          // the user knows where to look. Issue count comes from the
          // BE-shipped `result.issues` array (`linter_rejected` is the
          // discriminated branch that carries it; the `committed` /
          // `pending_review` branches carry `warnings` instead and
          // get their own success copy below).
          const errorCount = result.issues.filter(
            (i) => i.severity === "error",
          ).length;
          const warningCount = result.issues.filter(
            (i) => i.severity === "warning",
          ).length;
          const issueWord = (n: number) =>
            n === 1 ? "conflict" : "conflicts";
          const headline =
            errorCount > 0 && warningCount > 0
              ? `Can't finalize — ${errorCount} ${issueWord(errorCount)} (+${warningCount} warning${warningCount === 1 ? "" : "s"}) to resolve`
              : errorCount > 0
                ? `Can't finalize — ${errorCount} ${issueWord(errorCount)} to resolve`
                : `Can't finalize — ${result.issues.length} item${result.issues.length === 1 ? "" : "s"} to resolve`;
          Alert.alert(
            headline,
            "We highlighted the affected cards on the Sequence tab. Adjust or remove them, then try Finalize again.",
            [{ text: "OK", style: "default" }],
          );
          return;
        }

        // PLAN-DEVIATION: 2026-05-09-pr-ux-18-clear-before-alert — see
        // docs/PLAN-DEVIATIONS.md#2026-05-09-pr-ux-18-clear-before-alert.
        //
        // Both `committed` and `pending_review` terminate the local
        // session: the BE has either committed the intents or
        // moved the session out of `draft`, and from this device's
        // perspective there's nothing left to compose. Clear
        // BEFORE showing the success alert so the calendar's
        // pending tint / chain wires drop the moment the user
        // sees the alert, not 2-30 seconds later when they tap
        // OK / Approve / Dismiss. Pre-PR-UX-18 the clear happened
        // inside the per-button `onPress` callback (`dismissAfter`),
        // which manifested as the user-reported "I see Committed N
        // changes but cards don't move on the calendar" because
        // the calendar tile overlays still read non-empty
        // `usePendingRealityStore.intents` until the alert was
        // dismissed.
        //
        // Capture intent count BEFORE clear for the alert title,
        // so the user still sees "Committed 7 changes" even
        // though `intents` has gone to `[]`.
        const intentCountAtFinalize = intents.length;
        clear();

        // committed | pending_review — both end the local session.
        // The BE may also return non-blocking `warnings` on either
        // success branch (see `useFinalizeReorganizationSession`'s
        // P3-FE-12 reconciliation). Surface them to the user before
        // dismissing — the screen tears down right after, so the
        // alert is the only chance the user has to see them.
        //
        // PR-UX-15 (2026-05-09) — visual confirmation. Pre-PR-UX-15
        // the no-warnings success path silently dismissed the
        // screen, which was visually identical to Cancel: the chips
        // collapse, the cyan tiles disappear (PR-UX-7's reconciler
        // skip-non-draft + PR-UX-8's known-set narrow), and the
        // user is dropped back on the calendar with no signal that
        // their finalize tap actually succeeded. User report: *"I
        // did finalize on a chain, and it didn't work, it just
        // pretty much did the same thing cancel would."* Logs
        // confirmed the BE flipped draft→pending_review and the FE
        // reconciler handled it correctly — pure UX gap.
        //
        // The fix: always show a brief success alert before
        // dismissing. Warnings still render inline in the body
        // when present, capped at 5 + "and N more" overflow.
        //
        // PLAN-DEVIATION: 2026-05-09-pr-ux-17-strip-ai-demo — the
        // pending_review copy is now actor-aware. PR-UX-15's first
        // pass copy ("Awaiting approval — check the AI tab to
        // review.") was wrong on two counts: (1) it directs a
        // self-staging franchise_owner to a tab that's not even
        // visible in production (the AI tab is a demo-only surface)
        // and (2) it implies a separate approver exists when the
        // FO IS the approver. The branches below detect self-
        // approve via `required_authorizer_role === "self"` OR the
        // current user being in `eligible_committer_ids`, and
        // surface an "Approve now" CTA that fires the existing
        // authorize hook. Non-self-approve branch is reserved for
        // tech-staged sessions awaiting FO review and shows plain
        // "OK" copy. See docs/PLAN-DEVIATIONS.md#2026-05-09-pr-ux-17-strip-ai-demo.
        // PLAN-DEVIATION: 2026-05-09-pr-ux-18-clear-before-alert —
        // `clear()` already ran above (immediately on mutation
        // success). `dismissAfter` is now just the navigation
        // closer; the local store is already empty by the time
        // the user taps any alert button.
        const dismissAfter = () => {
          dismissScreen();
        };
        const isSelfApprove =
          liveSession?.required_authorizer_role === "self" ||
          (userId != null &&
            (liveSession?.eligible_committer_ids ?? []).includes(userId));
        const baseTitle =
          result.kind === "committed"
            ? `Committed ${intentCountAtFinalize} change${intentCountAtFinalize === 1 ? "" : "s"}`
            : isSelfApprove
              ? `Submitted ${intentCountAtFinalize} change${intentCountAtFinalize === 1 ? "" : "s"}`
              : `Submitted ${intentCountAtFinalize} change${intentCountAtFinalize === 1 ? "" : "s"} for franchise-owner review`;
        const titleWithWarnings =
          result.warnings.length > 0
            ? `${baseTitle} (${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"})`
            : baseTitle;
        const successFooter =
          result.kind === "committed"
            ? "Changes are live on the calendar."
            : isSelfApprove
              ? "They'll commit when you approve them."
              : "They'll commit once approved.";
        const warningsBody =
          result.warnings.length > 0
            ? result.warnings
                .slice(0, 5)
                .map((w) => `• ${w.humanMessage}`)
                .join("\n")
            : "";
        const overflow = result.warnings.length - 5;
        const warningsBodyWithOverflow =
          overflow > 0 ? `${warningsBody}\n…and ${overflow} more.` : warningsBody;
        const fullBody =
          warningsBodyWithOverflow.length > 0
            ? `${warningsBodyWithOverflow}\n\n${successFooter}`
            : successFooter;
        // Self-approve branch: fire authorize on the just-finalized
        // session id and dismiss immediately. The local store has
        // already cleared by the time the user sees the alert, so
        // we capture `sessionId` from outer scope (it's stable —
        // the `finalizeMutation.mutate(sessionId, ...)` callback
        // is the closure over this value). Authorize errors
        // surface as a transient alert so the user can re-open
        // Pending Reality and try again.
        const handleApproveNow = () => {
          if (__DEV__) {
            console.log("[DEBUG:Review] post-finalize approve-now", {
              sessionId,
            });
          }
          authorizeMutation.mutate(
            { sessionId },
            {
              onError: (err) => {
                const axiosErr = err as {
                  response?: { status?: number; data?: { message?: string } };
                  message?: string;
                };
                if (__DEV__) {
                  console.log("[DEBUG:Review] post-finalize approve error", {
                    sessionId,
                    status: axiosErr.response?.status ?? null,
                    beMessage: axiosErr.response?.data?.message ?? null,
                    message: axiosErr.message ?? null,
                  });
                }
                Alert.alert(
                  "Couldn't approve",
                  "Something went wrong reaching the server. Try again in a moment.",
                );
              },
            },
          );
          dismissAfter();
        };
        const buttons:
          | {
              text: string;
              onPress?: () => void;
              style?: "cancel" | "default" | "destructive";
            }[] =
          result.kind === "pending_review" && isSelfApprove
            ? [
                { text: "Dismiss", onPress: dismissAfter, style: "cancel" },
                { text: "Approve now", onPress: handleApproveNow },
              ]
            : [{ text: "OK", onPress: dismissAfter }];
        Alert.alert(titleWithWarnings, fullBody, buttons);
      },
      onError: (err) => {
        // PR #105 / PR-UX-7 Finalize-B (2026-05-09) — distinguish a
        // real network failure from a structured BE rejection. Pre
        // PR-#105 the toast was always the generic "Something went
        // wrong reaching the server." copy; on a 4xx with a BE
        // message (e.g. `session_not_draft` after the user has
        // already finalized once and a stray re-tap arrived) that
        // copy was actively misleading because the network was
        // fine. The 422 `linter_errors_block_finalize` path is
        // handled inside `useFinalizeReorganizationSession` as a
        // `linter_rejected` discriminated-union result and never
        // reaches this `onError` branch — the codes mapped below
        // are the OTHER `AppError`s thrown by
        // REMIBackend/src/services/reorganizationService.ts
        // `finalizeSessionInTrx`.
        //
        // PR-UX-13 Issue B diagnostics: also capture the HTTP url +
        // method + axios code so the smoke pass tells us exactly
        // which BE branch tripped (the user-facing toast
        // intentionally elides the status, but the diagnostic log
        // carries it). Combined with the structured `mapFinalizeError`
        // call above, the user gets the right copy AND the dev log
        // captures everything we need to root-cause if a new BE
        // status starts surfacing.
        const axiosErr = err as {
          response?: {
            status?: number;
            data?: { message?: string };
            config?: { url?: string; method?: string };
          };
          message?: string;
          code?: string;
        };
        const status = axiosErr?.response?.status;
        const beMessage = axiosErr?.response?.data?.message;
        const isNetworkFault = axiosErr?.response == null;
        const errSnapshot = {
          sessionId,
          httpStatus: status ?? null,
          httpUrl: axiosErr.response?.config?.url ?? null,
          httpMethod: axiosErr.response?.config?.method ?? null,
          beMessage: beMessage ?? null,
          axiosCode: axiosErr.code ?? null,
          message: axiosErr.message ?? null,
          isNetworkFault,
        };
        if (__DEV__) {
          console.log("[DEBUG:Review] finalize error", errSnapshot);
        }
        console.log("[DIAG-FINALIZE] error", errSnapshot);
        // Match on the BE message string. The codes are stable
        // identifiers thrown by `finalizeSessionInTrx` — see
        // `REMIBackend/src/services/reorganizationService.ts`
        // around `finalizeSessionInTrx` for the canonical list.
        const { title, body } = mapFinalizeError({
          status,
          beMessage,
          isNetworkFault,
        });
        Alert.alert(title, body);
      },
    });
  };

  // The screen has four render modes:
  //   - intents.length > 0 → composing tabs (Final / Sequence / [AI])
  //   - intents.length === 0 && AI tab has rows → AI-only mode (FO
  //     users land here when they have suggestions but no draft of
  //     their own)
  //   - intents.length === 0 && viewer is NOT a franchise-owner /
  //     franchisor → read-only explainer (techs + customers + role-
  //     unresolved cases all land here per §2.5; their cyan-overlay
  //     deep-link must not misdirect them to the "drag a card to
  //     compose" empty state — see `TechnicianReadOnlyState`
  //     docstring above for the full rationale and bug context).
  //   - everyone else (FO with no AI rows) → friendly empty state
  //
  // 2026-04-27 widening: previously gated on
  // `userRole === UserRole.TECHNICIAN`, but the auth `user` blob
  // sometimes hydrates with `role` undefined on Expo Go reloads
  // and demo-login round-trips (observed via
  // `[DEBUG:Review] aiTabGate userRole: null` on a logged-in
  // technician sim). Broadening to `!isFranchiseOwner` covers
  // those cases without changing FO behavior — an FO with no
  // intents still falls through to the AI-only or empty-state
  // branches above based on `aiBadgeCount`.
  const showAiOnly =
    intents.length === 0 && aiTabAvailable && aiBadgeCount > 0;
  const showTechReadOnly =
    intents.length === 0 && !showAiOnly && !isFranchiseOwner;
  const showEmpty = intents.length === 0 && !showAiOnly && !showTechReadOnly;
  // Force the active tab into a valid bucket whenever the available
  // tab set shrinks (e.g. all intents removed → "sequence" no
  // longer valid → fall back to "ai" if available, else state stays
  // so empty-state renders).
  //
  // PLAN-DEVIATION: 2026-05-09-pr-ux-17-strip-ai-demo — both
  // branches now require `aiTabAvailable` before resolving to
  // `"ai"`. With the AI tab demo-gated, the empty-intents fallback
  // must NOT silently flip into the AI tab body in production —
  // there's no AI tab visible to flip back from. The render
  // selectors above (`showAiOnly` / `showTechReadOnly` /
  // `showEmpty`) cover the user-visible shape; this guard just
  // keeps `effectiveTab` consistent with `aiTabAvailable` so a
  // future regression that wires a third consumer to
  // `effectiveTab === "ai"` can't accidentally reach the AI tab
  // body when the tab itself is hidden.
  const effectiveTab: ReviewTab =
    intents.length === 0 && activeTab === "sequence" && aiTabAvailable
      ? "ai"
      : activeTab === "ai" && !aiTabAvailable
        ? "sequence"
        : activeTab;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "Pending Reality",
          // D2P-FE-13 follow-up (2026-04-26): explicit back button.
          // The screen's parent stack uses
          // `headerBackButtonDisplayMode: "minimal"` (no label), but
          // the default back chevron only renders when
          // `router.canGoBack()` is truthy — and the FAB / HUD
          // navigators that land users here use `router.push`, so
          // the chevron usually appears. However, the screen is
          // also reachable via deep-link / `router.replace` (e.g.
          // post-finalize → cancel-session reload), in which case
          // the stack history is empty and the default chevron
          // disappears — leaving the user trapped between
          // "Cancel session" (destructive) and "Finalize"
          // (commits). A custom `headerLeft` short-circuits to
          // `dismissScreen()` (which falls back to
          // `router.replace("/(tabs)")`) so the user always has a
          // non-destructive escape hatch.
          headerLeft: () => (
            <Pressable
              onPress={dismissScreen}
              accessibilityRole="button"
              accessibilityLabel="Back to calendar"
              testID="review-back-btn"
              hitSlop={10}
              style={({ pressed }) => [
                styles.backBtn,
                pressed && styles.backBtnPressed,
              ]}
            >
              <MaterialIcons
                name="chevron-left"
                size={28}
                color="#FFFFFF"
              />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={handleHelpPress}
              accessibilityRole="button"
              accessibilityLabel="What is Pending Reality?"
              testID="review-help-btn"
              hitSlop={10}
              style={({ pressed }) => [
                styles.helpBtn,
                pressed && styles.helpBtnPressed,
              ]}
            >
              <MaterialIcons
                name="help-outline"
                size={22}
                color="#374151"
              />
            </Pressable>
          ),
        }}
      />

      {showEmpty ? (
        <EmptyState onDismiss={dismissScreen} />
      ) : showTechReadOnly ? (
        <TechnicianReadOnlyState onDismiss={dismissScreen} />
      ) : (
        <>
          {/* PR-UX-5 (2026-05-08): the segmented control collapses to
              one tab for non-FO users (Sequence) since the Final
              state tab was cut. We still render the bar when the
              FO has the AI tab available so they can switch
              between Sequence and AI. Single-tab states hide the
              bar entirely to avoid showing a degenerate one-button
              control. */}
          <View style={styles.tabBar} testID="review-tab-bar">
            {intents.length > 0 && aiTabAvailable ? (
              <Pressable
                onPress={() => setActiveTab("sequence")}
                style={({ pressed }) => [
                  styles.tabBtn,
                  effectiveTab === "sequence" && styles.tabBtnActive,
                  pressed && styles.tabBtnPressed,
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: effectiveTab === "sequence" }}
                testID="review-tab-btn-sequence"
              >
                <Text
                  style={[
                    styles.tabBtnText,
                    effectiveTab === "sequence" && styles.tabBtnTextActive,
                  ]}
                >
                  Sequence of operations
                </Text>
              </Pressable>
            ) : null}
            {aiTabAvailable ? (
              <Pressable
                onPress={() => setActiveTab("ai")}
                style={({ pressed }) => [
                  styles.tabBtn,
                  effectiveTab === "ai" && styles.tabBtnActive,
                  pressed && styles.tabBtnPressed,
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: effectiveTab === "ai" }}
                testID="review-tab-btn-ai"
              >
                <View style={styles.aiTabLabelRow}>
                  <Text
                    style={[
                      styles.tabBtnText,
                      effectiveTab === "ai" && styles.tabBtnTextActive,
                    ]}
                  >
                    AI
                  </Text>
                  {aiBadgeCount > 0 ? (
                    <View
                      style={styles.aiTabBadge}
                      testID="review-tab-ai-badge"
                    >
                      <Text style={styles.aiTabBadgeText}>{aiBadgeCount}</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.tabBody}>
            {effectiveTab === "ai" ? (
              <AiTab
                sessions={aiSessions}
                isLoading={aiSessionsQuery.isPending}
                onApprove={handleAiApprove}
                onDecline={handleAiDecline}
                onCounterPropose={handleAiCounterPropose}
                busySessionId={
                  authorizeMutation.isPending
                    ? (authorizeMutation.variables?.sessionId ?? null)
                    : denyMutation.isPending
                      ? (denyMutation.variables?.sessionId ?? null)
                      : null
                }
              />
            ) : (
              <SequenceTab
                intents={intents}
                linterIssues={issuesForRender}
                onModify={handleModify}
                onRemove={handleRemove}
                removingIntentId={
                  removeIntentMutation.isPending
                    ? (removeIntentMutation.variables?.intentId ?? null)
                    : null
                }
                onApplyAutoFix={handleApplyAutoFix}
                focusAppointmentId={focusAppointmentId}
                displayLookup={intentDisplayLookup}
                calendarLookups={calendarLookups}
                onIntentPress={handleIntentPress}
                chainBadgeByIntentId={chainBadgeByIntentId}
                cleanIntentCount={sweepCleanIntents.length}
                sweepProgressLabel={sweepProgressLabel}
                onSweepClean={
                  sweepCleanIntents.length >= 2 ? handleSweepClean : undefined
                }
              />
            )}
          </View>

          {/* Action bar applies to user's own composed session only.
              The AI tab's per-card actions are inline (Approve /
              Counter / Decline live on each AiSuggestionCard), so
              the bottom bar would be misleading on AI-only mode. */}
          {intents.length > 0 ? (
            <View style={styles.actionBar} testID="review-action-bar">
              <Pressable
                onPress={handleCancelSession}
                disabled={cancelMutation.isPending}
                style={({ pressed }) => [
                  styles.actionBtn,
                  styles.actionBtnSecondary,
                  cancelMutation.isPending && styles.actionBtnDisabled,
                  pressed && styles.actionBtnPressed,
                ]}
                accessibilityRole="button"
                testID="review-cancel-btn"
              >
                <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>
                  {cancelMutation.isPending ? "Cancelling…" : "Cancel session"}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleFinalize}
                disabled={
                  sessionId == null ||
                  finalizeMutation.isPending ||
                  authorizeMutation.isPending
                }
                style={({ pressed }) => [
                  styles.actionBtn,
                  styles.actionBtnPrimary,
                  (sessionId == null ||
                    finalizeMutation.isPending ||
                    authorizeMutation.isPending) &&
                    styles.actionBtnDisabled,
                  pressed && styles.actionBtnPressed,
                ]}
                accessibilityRole="button"
                testID="review-finalize-btn"
              >
                {/* PR-UX-14 (2026-05-09) Issue B: when the session
                    is already `pending_review` (FE-perceived), the
                    primary CTA routes to the authorize endpoint
                    instead of finalize — see `handleFinalize`. The
                    label reflects that branch so users see "Approve"
                    once a draft has graduated to pending_review. */}
                <Text style={styles.actionBtnText}>
                  {(() => {
                    if (authorizeMutation.isPending) return "Approving…";
                    if (finalizeMutation.isPending) return "Finalizing…";
                    return sessionStatus === "pending_review"
                      ? "Approve"
                      : "Finalize";
                  })()}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}

      <DeclineReasonPicker
        visible={declineTarget != null}
        onClose={() => setDeclineTarget(null)}
        onSubmit={handleDeclineSubmit}
        title="Decline this AI suggestion?"
        isSubmitting={denyMutation.isPending}
      />

      <CounterProposeSheet
        visible={counterProposeTargetId != null}
        session={counterProposeSession}
        onClose={() => setCounterProposeTargetId(null)}
      />

      {/* 2026-05-11 Modify-from-review customer-info popup. Mirrors
          the calendar tab's tap-on-appointment surface so the user
          gets the SAME `AppointmentDetailSheet` they already know
          (name, phone, address, services, status, plus Reschedule /
          Cancel / Edit / Quick text actions). The mount is gated on
          `modifyTargetIntent` AND a successful `intentDisplayLookup`
          resolution so a stale-cache miss returns `null` cleanly
          rather than rendering an empty drawer.

          Action callbacks (Reschedule / Cancel / Edit / Quick text)
          all route through `handleModifyDetailActionRouting` which
          closes the popup and dismisses the review screen — the
          calendar's existing tap-on-appointment flow handles the
          per-action sheet from there. See `handleModify` for the
          full design rationale and anti-instructions. */}
      {modifyTargetIntent != null &&
        modifyTargetIntent.appointment_id != null && (
          (() => {
            const appt = intentDisplayLookup.get(
              modifyTargetIntent.appointment_id,
            );
            if (!appt) return null;
            return (
              <AppointmentDetailSheet
                ref={modifyDetailSheetRef}
                appointment={appt}
                onClose={() => setModifyTargetIntent(null)}
                onReschedule={() =>
                  handleModifyDetailActionRouting(modifyTargetIntent)
                }
                onCancel={() =>
                  handleModifyDetailActionRouting(modifyTargetIntent)
                }
                onQuickText={() =>
                  handleModifyDetailActionRouting(modifyTargetIntent)
                }
                onEdit={() =>
                  handleModifyDetailActionRouting(modifyTargetIntent)
                }
              />
            );
          })()
        )}
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────
// AI tab body
// ──────────────────────────────────────────────────────────────────

interface AiTabProps {
  sessions: import("@technician/hooks/schedule/use-reorganization").ReorganizationApiSession[];
  isLoading: boolean;
  onApprove: (sessionId: number) => void;
  onDecline: (sessionId: number) => void;
  onCounterPropose: (sessionId: number) => void;
  busySessionId: number | null;
}

function AiTab({
  sessions,
  isLoading,
  onApprove,
  onDecline,
  onCounterPropose,
  busySessionId,
}: AiTabProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.tabContent}
      testID="review-tab-ai"
    >
      <Text style={styles.tabHelpText}>
        Suggestions emitted by the AI engine awaiting your review. Per the
        trust gradient (§2.5), AI never auto-commits — every suggestion needs
        franchise-owner approval before it lands on the calendar.
      </Text>
      {isLoading ? (
        <Text style={styles.aiLoadingText} testID="review-ai-loading">
          Loading suggestions…
        </Text>
      ) : sessions.length === 0 ? (
        <View style={styles.aiEmptyCard} testID="review-ai-empty">
          <Text style={styles.aiEmptyTitle}>No AI suggestions</Text>
          <Text style={styles.aiEmptyBody}>
            Nothing pending right now. The AI engine reviews tomorrow's
            schedule overnight; new suggestions will show up here.
          </Text>
        </View>
      ) : (
        sessions.map((session) => (
          <AiSuggestionCard
            key={session.id}
            session={session}
            onApprove={() => onApprove(session.id)}
            onDecline={() => onDecline(session.id)}
            onCounterPropose={() => onCounterPropose(session.id)}
            isBusy={busySessionId === session.id}
          />
        ))
      )}
    </ScrollView>
  );
}

/**
 * Merge local + server linter issues without duplicates. Two issues
 * are considered the same when their `(kind, sorted ids,
 * humanMessage)` tuple matches — the kind+ids alone could collide
 * across rules with similar targeting (e.g. R1 and R2 both report
 * `time_conflict` on the same pair), but the humanMessage carries
 * the rule-specific phrasing so it disambiguates.
 */
function mergeIssues(local: LinterIssue[], server: LinterIssue[]): LinterIssue[] {
  if (server.length === 0) return local;
  const seen = new Set<string>();
  const out: LinterIssue[] = [];
  const keyOf = (issue: LinterIssue) =>
    `${issue.kind}|${[...issue.affectedAppointmentIds].sort((a, b) => a - b).join(",")}|${issue.humanMessage}`;
  for (const issue of [...local, ...server]) {
    const key = keyOf(issue);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },

  // ── Tab bar (segmented control) ─────────────────────────────────
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  tabBtnActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  tabBtnPressed: {
    opacity: 0.85,
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  tabBtnTextActive: {
    color: "#FFFFFF",
  },

  // ── Tab body ────────────────────────────────────────────────────
  tabBody: {
    flex: 1,
  },
  tabContent: {
    padding: 16,
    paddingBottom: 24,
    gap: 16,
  },
  tabHelpText: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },

  // PR-UX-20: Sweep clean ones button. Pinned at the top of the
  // sequence list right after the help text. Pill-shaped to match
  // the existing primary CTA styling on the action bar; uses the
  // same tonal-green as the toast's primary button.
  sweepBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#22C55E",
  },
  sweepBtnDisabled: { opacity: 0.6 },
  sweepBtnPressed: { opacity: 0.85 },
  sweepBtnText: {
    color: "#04220E",
    fontSize: 14,
    fontWeight: "700",
  },

  // ── Per-chain divider (PR-UX-11 cherry-pick from PR-UX-10's 0372b77) ─
  // Sits ABOVE each run of cards belonging to the same chain in the
  // Sequence-of-Operations tab. Reuses the chip-row's chain colour
  // (left accent bar) and labels the run with chain number + step
  // count.
  chainDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    marginBottom: -4,
    paddingVertical: 4,
  },
  chainDividerAccent: {
    width: 4,
    height: 18,
    borderRadius: 2,
  },
  chainDividerLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },


  // ── Intent card ─────────────────────────────────────────────────
  intentCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  intentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  stepBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  stepBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 78,
    alignItems: "center",
  },
  typeBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  // PR-UX-3 (2026-05-07): chain identity badge. Outlined pill —
  // visually subordinate to the filled type pill so the kind stays
  // the primary signal. Height ~22pt (smaller than the 24pt step
  // badge / type pill row) so it reads as supporting metadata.
  chainBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    minHeight: 22,
  },
  chainBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chainBadgeText: {
    color: "#4B5563",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  intentSubject: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    flexShrink: 1,
  },
  intentSubjectChevron: {
    marginLeft: "auto",
  },
  intentCardPressed: {
    opacity: 0.7,
  },
  helpBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  helpBtnPressed: {
    opacity: 0.6,
  },
  backBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    marginLeft: -4,
  },
  backBtnPressed: {
    opacity: 0.6,
  },
  intentDetail: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  intentActions: {
    flexDirection: "row",
    gap: 8,
  },
  intentActionBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
  },
  intentActionBtnSecondary: {
    backgroundColor: "#F9FAFB",
    borderColor: "#D1D5DB",
  },
  intentActionBtnDanger: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
  },
  intentActionBtnPressed: {
    opacity: 0.85,
  },
  intentActionBtnDisabled: {
    opacity: 0.5,
  },
  intentActionBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  intentActionBtnTextDanger: {
    color: "#B91C1C",
  },
  intentIssues: {
    gap: 8,
    marginTop: 4,
  },

  // ── Bottom action bar ───────────────────────────────────────────
  actionBar: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  actionBtnPrimary: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  actionBtnSecondary: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D1D5DB",
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnPressed: {
    opacity: 0.85,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  actionBtnTextSecondary: {
    color: "#374151",
  },

  // ── Empty state ─────────────────────────────────────────────────
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    gap: 14,
    maxWidth: 480,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  emptyBody: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
  emptyCta: {
    backgroundColor: "#111827",
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 10,
    marginTop: 4,
  },
  emptyCtaPressed: {
    opacity: 0.85,
  },
  emptyCtaText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },

  // ── Technician read-only state ──────────────────────────────────
  // Cyan accent (~#06B6D4 / #0E7490) intentionally matches
  // `PendingOverlayColors.tile` from `src/constants/colors.ts` so
  // the icon + inline "cyan" word echo the calendar overlay the
  // tech just tapped. Anti-instruction: do NOT introduce a second
  // hue here without checking RESERVED_OVERLAY_HUES.
  techStateIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#CFFAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  techStateInlineCyan: {
    color: "#0E7490",
    fontWeight: "700",
  },
  techStateSubBody: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 18,
    marginTop: -4,
  },

  // ── __DEV__ seed row (Tier 1C — removed by P3-FE-7) ─────────────
  devSeedRow: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    width: "100%",
    gap: 8,
    alignItems: "center",
  },
  devSeedLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9CA3AF",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  devSeedHint: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 4,
    marginBottom: 8,
    fontStyle: "italic",
    textAlign: "center",
  },
  devSeedButtons: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  devSeedBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  devSeedBtnPressed: {
    opacity: 0.85,
  },
  devSeedBtnText: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "600",
  },

  // ── AI tab (P7-FE-1) ────────────────────────────────────────────
  aiTabLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  aiTabBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: SourceBadgeColors.ai_suggestion,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  aiTabBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  aiLoadingText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    paddingVertical: 24,
  },
  aiEmptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  aiEmptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  aiEmptyBody: {
    fontSize: 14,
    color: "#4B5563",
    textAlign: "center",
    lineHeight: 20,
  },
});
