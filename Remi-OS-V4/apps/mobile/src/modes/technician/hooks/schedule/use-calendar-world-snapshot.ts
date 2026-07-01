/**
 * `useCalendarWorldSnapshot` (P3-FE-7 → D2P-FE-13 → P3-FE-WEEK-SNAPSHOT) —
 * single seam for assembling the `LinterWorldSnapshot` that
 * `useSessionAwareSubmit` and `usePendingRealityStore.runLocalLinter`
 * consume.
 *
 * Resolves the `2026-04-23-pending-reality-trim` deviation's
 * "snapshot is empty until the consumer-side hook is wired" follow-up.
 * The hook reads the day-view OR week-view query cache the calendar
 * tab already populates (depending on the active `viewMode`), maps
 * committed appointments to the `LinterAppointment` shape, and
 * filters out anything with an active intent in
 * `usePendingRealityStore` (so a staged intent doesn't double-count
 * its own committed predecessor).
 *
 * # 2026-05-09 PR-UX-12 — landscape also feeds 7 days
 *
 * `viewMode` is the source-of-truth for portrait. Landscape rotates
 * onto a different canvas (`LandscapeWorkweekView`) that always
 * shows the workweek regardless of the underlying `viewMode` value
 * (the user can rotate from portrait day → landscape week without
 * us toggling viewMode). Pre-2026-05-09 the snapshot still
 * branched on `viewMode === "week"` only, so a landscape drag with
 * `viewMode === "day"` quietly fell back to the day query → linter
 * saw `dateCount === 1` → 0 conflicts on cross-day drops → every
 * landscape submit lived-committed silently. PR-UX-12 fixes this
 * by widening `isWeekMode` to `viewMode === "week" || isLandscape`
 * (where landscape comes from `useWideCanvas`). The companion
 * `weekQuery` enable-gate in `app/(tabs)/index.tsx` already
 * includes `isLandscape`, so the cache is populated at the time
 * we need to read it. See PLAN-DEVIATIONS entry
 * `2026-05-09-landscape-world-snapshot`.
 *
 * # 2026-05-08 P3-FE-WEEK-SNAPSHOT — week mode now feeds 7 days
 *
 * Pre-2026-05-08 the snapshot was always sourced from the day-view
 * query keyed off `useCalendarStore.selectedDate` — even when the
 * user was dragging in week-portrait mode. The user reported drags
 * in week-portrait returning `decision: "live-commit", errors: 0`
 * for cross-tech / cross-date drops that should plausibly conflict
 * (43743 → Todd on 2026-05-07, 43766 → Jake on 2026-05-04). The
 * diagnostic logs from `acd389c` confirmed the cause:
 *
 *   viewMode: "week",
 *   workweekTechId: 2055,
 *   dragTargetDate: "2026-05-06",
 *   worldDateCoverage: { byDate: { "2026-05-08": 33 }, dateCount: 1 }
 *
 * The linter saw zero appointments on the target date, so the time-
 * conflict rule had nothing to compare against. Same-day overlaps
 * still fired (the selected date had data); cross-day didn't.
 *
 * Fix: when `viewMode === "week"`, source from `useFranchiseWeekView`
 * (FO) / `useTechnicianWeekView` (tech) keyed off the week's Monday
 * derived from `selectedDate` (same Monday formula `app/(tabs)/index.tsx`
 * already uses). The week response is `CalendarDayResponse[]` — flatten
 * across all 7 days × all techs into the snapshot. Do NOT scope to
 * `workweekTechId` — even though the visible canvas is one tech in
 * portrait week mode, cross-tech drops happen via avatar hover-dwell,
 * so the linter must see all techs to detect cross-tech overlap.
 *
 * Day mode is unchanged. Both queries are mounted unconditionally
 * but only one is `enabled` at a time (the `viewMode` branch picks
 * which response feeds the snapshot).
 *
 * # v1 surface
 *
 * What's wired:
 *   - `appointments` from `useFranchise{Day,Week}View` (FO) or
 *     `useTechnician{Day,Week}View` (tech), branched on `viewMode`.
 *   - Filtering for appointments in active reschedule/reassign/etc.
 *     intents AND personal events in active personal_event_*
 *     intents.
 *
 * What's deliberately stubbed (unchanged):
 *   - `routes: []`, `customerSlas: []`, `fleet: { accounts: [] }`.
 *
 * The two highest-value rules — `time_conflict` (R1 + R2) and
 * `recurring_series_inconsistency` (R6) — ride on `appointments`
 * alone.
 *
 * # Memoization contract
 *
 * `useMemo` is keyed on the active source data ref (either `dayData`
 * or `weekData`, depending on `viewMode`), `viewMode` itself, AND
 * the two staged-id `Set`s (stable while the intent list hasn't
 * mutated in a way that affects the projection). Stringification
 * is intentionally avoided — the dependency array is references-
 * only.
 */

import { useMemo } from "react";
import dayjs from "dayjs";

import { useCalendarStore } from "@technician/stores/calendar";
import { useAuthStore } from "@/src/stores/auth";
import { usePendingRealityStore } from "@technician/stores/pending-reality";
import { useWideCanvas } from "@technician/hooks/ui/use-wide-canvas";
import type {
  CalendarAppointmentItem,
  CalendarDayResponse,
} from "@technician/types/calendar";
import type { ReorganizationIntent } from "@technician/types/reorganization";
import { UserRole } from "@technician/types/enums";
import type {
  LinterAppointment,
  LinterWorldSnapshot,
} from "@technician/utils/logistics-linter";

import {
  useFranchiseDayView,
  useFranchiseWeekView,
  useTechnicianDayView,
  useTechnicianWeekView,
} from "./use-calendar";

/**
 * Stable empty world snapshot. Exported so tests and any pre-load
 * callsites that need a referential constant (e.g. fixtures, the
 * pending-reality review screen's pre-data render) can reach for the
 * same object the hook returns when `dayData` is undefined.
 */
export const EMPTY_WORLD_SNAPSHOT: LinterWorldSnapshot = {
  appointments: [],
  routes: [],
  customerSlas: [],
  fleet: { accounts: [] },
};

/**
 * Compute the Monday-of-week containing `selectedDate`, formatted
 * as `YYYY-MM-DD`. Mirrors the `workweekStartDate` derivation in
 * `app/(tabs)/index.tsx` so the snapshot's week query and the
 * calendar tab's week query converge on the same cache key. Pure
 * helper exported for testability.
 */
export function deriveWorkweekStartDate(selectedDate: string): string {
  const d = dayjs(selectedDate);
  const dow = d.day();
  const monday = dow === 0 ? d.subtract(6, "day") : d.subtract(dow - 1, "day");
  return monday.format("YYYY-MM-DD");
}

/**
 * Project a `CalendarAppointmentItem` to a `LinterAppointment`,
 * dropping rows missing required scheduled-* fields. Returns `null`
 * for rows that should be filtered out. Pure helper so both the
 * day-source and week-source paths share one mapping function.
 */
function appointmentToLinterRow(
  appt: CalendarAppointmentItem,
): LinterAppointment | null {
  if (
    appt.scheduled_date == null ||
    appt.scheduled_time == null ||
    appt.scheduled_end_time == null
  ) {
    return null;
  }
  return {
    id: appt.id,
    customer_id: appt.customer_id,
    technician_id: appt.technician_id,
    franchise_id: appt.franchise_id,
    fleet_company_id: appt.fleet_account_id ?? null,
    status: appt.status,
    scheduled_date: appt.scheduled_date,
    scheduled_start_time: appt.scheduled_time,
    scheduled_end_time: appt.scheduled_end_time,
    recurrence_series_id: appt.recurrence_series_id ?? null,
  };
}

/**
 * Flatten one or more `CalendarDayResponse` payloads into a
 * `LinterAppointment[]`. Skips appointments whose ids are in the
 * staged-intents set (so a staged intent doesn't double-count its
 * own committed predecessor). Pure — no React, no store reads.
 *
 * Exported for direct unit testing in isolation from the hook
 * (the hook is exercised separately via `renderHook`).
 */
export function flattenCalendarResponseToLinterAppointments(
  source: CalendarDayResponse | readonly CalendarDayResponse[],
  stagedAppointmentIds: ReadonlySet<number>,
): LinterAppointment[] {
  const days = Array.isArray(source) ? source : [source];
  const out: LinterAppointment[] = [];
  for (const day of days) {
    if (!day) continue;
    for (const tech of day.technicians) {
      for (const appt of tech.appointments) {
        if (stagedAppointmentIds.has(appt.id)) continue;
        const row = appointmentToLinterRow(appt);
        if (row != null) out.push(row);
      }
    }
  }
  return out;
}

/**
 * Returns a stable, memoized `LinterWorldSnapshot` assembled from
 * the day-view OR week-view TanStack Query cache (branched on
 * `useCalendarStore.viewMode`). Falls back to
 * `EMPTY_WORLD_SNAPSHOT` while the active source query is loading
 * or disabled (e.g. an unauthenticated mount).
 *
 * **Week mode invariant (P3-FE-WEEK-SNAPSHOT, 2026-05-08):** when
 * `viewMode === "week"`, the snapshot covers all 7 days of the
 * active workweek across ALL techs (NOT scoped to
 * `workweekTechId`). Cross-tech drops via avatar hover-dwell rely
 * on the linter seeing every tech's appointments in the week
 * window.
 */
export function useCalendarWorldSnapshot(): LinterWorldSnapshot {
  const role = useAuthStore((s) => s.user?.role);
  const selectedDate = useCalendarStore((s) => s.selectedDate);
  const viewMode = useCalendarStore((s) => s.viewMode);
  const { orientation } = useWideCanvas();
  const isFranchiseOwner = role === UserRole.FRANCHISE_OWNER;
  // PR-UX-12 (2026-05-09): treat landscape as week-equivalent regardless of
  // `viewMode`. The landscape calendar canvas (`LandscapeWorkweekView`) always
  // renders a 7-day workweek across every visible tech, even when the user
  // rotated in from portrait day mode (which leaves `viewMode === "day"`).
  // The companion week query in `app/(tabs)/index.tsx` already gates on
  // `viewMode === "week" || isLandscape || hasStagedIntents`, so the
  // `weekData` cache is populated; this hook just needed to read the same
  // signal to pick `weekData` over `dayData`. Without this, the linter saw
  // only `selectedDate`'s appointments (`worldDateCoverage.dateCount === 1`)
  // and silently returned 0 conflicts for every cross-day drop in landscape.
  // See docs/PLAN-DEVIATIONS.md#2026-05-09-landscape-world-snapshot for the
  // full bug recap and anti-instructions.
  const isLandscape = orientation === "landscape";
  const isWeekMode = viewMode === "week" || isLandscape;

  // Workweek Monday — only meaningful in week mode but computed
  // unconditionally so the hook order stays stable across mode
  // transitions. The week queries below are gated by `isWeekMode`,
  // so the day-mode lifecycle never fires the week network call.
  const workweekStartDate = useMemo(
    () => deriveWorkweekStartDate(selectedDate),
    [selectedDate],
  );

  // Mount all four queries unconditionally so hook order is stable
  // across role + viewMode transitions; pass an empty string to
  // `enabled` of the inactive ones so they never fire (the queries
  // self-gate on truthy date strings).
  const foDay = useFranchiseDayView(
    isFranchiseOwner && !isWeekMode ? selectedDate : "",
  );
  const techDay = useTechnicianDayView(
    !isFranchiseOwner && !isWeekMode ? selectedDate : "",
  );
  const foWeek = useFranchiseWeekView(
    isFranchiseOwner && isWeekMode ? workweekStartDate : "",
  );
  const techWeek = useTechnicianWeekView(
    !isFranchiseOwner && isWeekMode ? workweekStartDate : "",
  );

  const dayData = isFranchiseOwner ? foDay.data : techDay.data;
  const weekData = isFranchiseOwner ? foWeek.data : techWeek.data;

  // Subscribe to the raw `intents` array (reference-stable in
  // Zustand unless the array actually mutates). Building Sets
  // inside the selector would manufacture a fresh `Set` every
  // render and defeat `Object.is` equality — Zustand would
  // invalidate every consumer on every unrelated store mutation.
  const intents = usePendingRealityStore((s) => s.intents);

  const { stagedAppointmentIds, stagedPersonalEventIds } = useMemo(
    () => projectStagedIds(intents),
    [intents],
  );

  return useMemo<LinterWorldSnapshot>(() => {
    // Pick the active source based on viewMode. The other slot is
    // expected to be `undefined` (its query was disabled by the
    // empty-string date), but we don't rely on that — the branch
    // explicitly picks one or the other.
    const source: CalendarDayResponse | readonly CalendarDayResponse[] | undefined =
      isWeekMode ? weekData : dayData;

    if (!source) {
      logEmptyFallback(
        isWeekMode ? "weekData pending" : "dayData pending",
      );
      return EMPTY_WORLD_SNAPSHOT;
    }

    const appointments = flattenCalendarResponseToLinterAppointments(
      source,
      stagedAppointmentIds,
    );

    const snapshot: LinterWorldSnapshot = {
      appointments,
      routes: [],
      customerSlas: [],
      fleet: { accounts: [] },
    };

    const sourceDays: readonly CalendarDayResponse[] = Array.isArray(source)
      ? source
      : [source];
    const dateKey = isWeekMode
      ? `${workweekStartDate} (week)`
      : sourceDays[0]?.date ?? "?";
    logRealSnapshot({
      appointmentCount: appointments.length,
      dateKey,
      mode: isWeekMode ? "week" : "day",
    });

    // `stagedPersonalEventIds` is intentionally listed in the
    // deps even though personal events aren't projected into the
    // linter snapshot today.
    return snapshot;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isWeekMode,
    dayData,
    weekData,
    workweekStartDate,
    stagedAppointmentIds,
    stagedPersonalEventIds,
  ]);
}

// ── Selector helpers ─────────────────────────────────────────────

function projectStagedIds(intents: readonly ReorganizationIntent[]): {
  stagedAppointmentIds: ReadonlySet<number>;
  stagedPersonalEventIds: ReadonlySet<string>;
} {
  const stagedAppointmentIds = new Set<number>();
  const stagedPersonalEventIds = new Set<string>();
  for (const i of intents) {
    if (i.appointment_id != null) stagedAppointmentIds.add(i.appointment_id);
    if (i.personal_event_id != null)
      stagedPersonalEventIds.add(i.personal_event_id);
  }
  return { stagedAppointmentIds, stagedPersonalEventIds };
}

// ── DEV-only one-shot debug logging ──────────────────────────────
//
// Module-level guards keep these to "first time we entered this
// state" rather than "once per consumer mount". Mode flips
// (real → empty or vice-versa) re-arm so the next agent debugging
// a "linter never fires" report can read the stream and see when
// the snapshot stopped being real.

let lastRealLogKey: string | null = null;
let lastEmptyReason: string | null = null;

function logRealSnapshot(payload: {
  appointmentCount: number;
  dateKey: string;
  mode: "day" | "week";
}): void {
  if (!__DEV__) return;
  const key = `${payload.mode}|${payload.dateKey}|${payload.appointmentCount}`;
  if (lastRealLogKey === key) return;
  lastRealLogKey = key;
  lastEmptyReason = null;
  console.log("[DEBUG:WorldSnapshot] real snapshot", payload);
}

function logEmptyFallback(reason: string): void {
  if (!__DEV__) return;
  if (lastEmptyReason === reason) return;
  lastEmptyReason = reason;
  lastRealLogKey = null;
  console.log("[DEBUG:WorldSnapshot] empty fallback", { reason });
}
