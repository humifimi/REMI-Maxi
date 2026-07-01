/**
 * `useCalendarDisplayLookups` (D2P-FE-13 follow-up, 2026-04-26).
 *
 * Single seam for the `appointmentLabels` / `technicianNames`
 * lookups that user-facing renderings need to humanize a
 * `LinterIssue.humanMessage` (and to render the "Affects:" id chips
 * as customer names instead of bare `#NNN`).
 *
 * Reads from the same day-view query cache the calendar canvas
 * already populates — there is no extra request. The hook mirrors
 * the role-based fan-out in `use-calendar-world-snapshot.ts`
 * (FO ⇒ `useFranchiseDayView`, technician ⇒ `useTechnicianDayView`)
 * so both paths converge on a single source of truth for "what's
 * on the canvas right now."
 *
 * Memoization contract:
 *   The two `Map`s are reference-stable while the underlying
 *   `dayData` reference is unchanged. Consumers (linter intercept
 *   sheet, Pending Reality review screen) hand the lookups
 *   straight to `humanizeLinterMessage`, which is itself idempotent,
 *   so passing the same lookups across two renders is a no-op.
 *
 * Limits:
 *   - Customer labels are sourced from `CalendarAppointmentItem.customer_name`
 *     — a denormalized join the BE writes alongside every calendar row.
 *     Off-canvas appointments (e.g. a conflict involving an appointment
 *     scheduled on a DIFFERENT day) are unknown at this layer; the
 *     humanizer falls back to the bare wire `#NNN` for those, which is
 *     the original pre-D2P-FE-13-followup behaviour.
 *   - Technician names are sourced from each `technicians[].technician_name`.
 *     Both the active tech and any inactive techs that still appear in
 *     the day's bucket list are included.
 */

import { useMemo } from "react";

import { useAuthStore } from "@/src/stores/auth";
import { useCalendarStore } from "@technician/stores/calendar";
import { UserRole } from "@technician/types/enums";
import type { HumanizeLookups } from "@technician/utils/format-display";

import { useFranchiseDayView, useTechnicianDayView } from "./use-calendar";

/**
 * Empty, reference-stable lookups returned while the day-view query
 * is loading. Exported so tests can compare with `===`.
 */
export const EMPTY_DISPLAY_LOOKUPS: HumanizeLookups = Object.freeze({
  appointmentLabels: new Map<number, string>(),
  technicianNames: new Map<number, string>(),
  personalEventTitles: new Map<string, string>(),
});

export function useCalendarDisplayLookups(): HumanizeLookups {
  const role = useAuthStore((s) => s.user?.role);
  const selectedDate = useCalendarStore((s) => s.selectedDate);
  const isFranchiseOwner = role === UserRole.FRANCHISE_OWNER;

  const foDay = useFranchiseDayView(isFranchiseOwner ? selectedDate : "");
  const techDay = useTechnicianDayView(isFranchiseOwner ? "" : selectedDate);
  const dayData = isFranchiseOwner ? foDay.data : techDay.data;

  return useMemo<HumanizeLookups>(() => {
    if (!dayData) return EMPTY_DISPLAY_LOOKUPS;

    const appointmentLabels = new Map<number, string>();
    const technicianNames = new Map<number, string>();
    const personalEventTitles = new Map<string, string>();

    for (const tech of dayData.technicians) {
      if (typeof tech.technician_name === "string" && tech.technician_name) {
        technicianNames.set(tech.technician_id, tech.technician_name);
      }
      for (const appt of tech.appointments) {
        const label =
          typeof appt.customer_name === "string" && appt.customer_name
            ? appt.customer_name
            : null;
        if (label) appointmentLabels.set(appt.id, label);
      }
      const peList: Array<{ id: string; title?: string | null }> | undefined =
        // The day-view rows are typed loosely here because the
        // FO and tech variants share `personal_events` shape. The
        // narrowing happens inline; missing/non-string titles are
        // dropped rather than indexed as the empty string.
        (tech as { personal_events?: Array<{ id: string; title?: string | null }> })
          .personal_events;
      if (Array.isArray(peList)) {
        for (const pe of peList) {
          if (
            pe &&
            typeof pe.id === "string" &&
            typeof pe.title === "string" &&
            pe.title.length > 0
          ) {
            personalEventTitles.set(pe.id, pe.title);
          }
        }
      }
    }

    return { appointmentLabels, technicianNames, personalEventTitles };
  }, [dayData]);
}
