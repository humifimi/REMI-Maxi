import type {
  Resource,
  Event as RCEvent,
} from "react-native-resource-calendar";
import type {
  CalendarDayResponse,
  CalendarTechnicianColumn,
  CalendarAppointmentItem,
  PersonalEvent,
} from "@technician/types/calendar";
import type { PendingIntentSummary } from "@technician/types/reorganization";
import { SLOT_TYPE_COLORS } from "@technician/constants/calendar";
import { Config } from "@technician/constants/config";
import { backendISOToLocalMinutes } from "@technician/utils/datetime";
import { sortTechsByOrder } from "@technician/utils/sort-techs-by-order";

type ResourceWithEvents = Resource & {
  events: RCEvent[];
};

/**
 * Parse a TZ-naive time string ("HH:MM:SS" or "YYYY-MM-DDTHH:MM:SS")
 * into minutes-from-midnight. Suitable for `appointments.scheduled_time`
 * (Postgres `TIME` — no zone) and any locally-built form input.
 *
 * DO NOT pass a `timestamptz` ISO (i.e. anything ending in `Z` or
 * `±HH:MM`). The `Z`/offset is silently dropped here and the returned
 * minutes are interpreted as local-time on the grid → events render
 * shifted by the user's UTC offset. Use `backendISOToLocalMinutes`
 * from `@technician/utils/datetime` instead. See
 * `.cursor/rules/datetime-and-data-format-contracts.mdc` § 1.
 */
export function timeStringToMinutes(time: string): number {
  if (__DEV__ && /(?:Z|[+-]\d{2}:?\d{2})$/.test(time)) {
    console.warn(
      "[CAL:map] timeStringToMinutes called with a TZ-aware ISO string — " +
        "this returns UTC minutes, not local. Use backendISOToLocalMinutes " +
        "from @technician/utils/datetime for any timestamptz field.",
      { input: time },
    );
  }
  const parts = time.split("T").pop()?.split(":") ?? time.split(":");
  const h = parseInt(parts[0] ?? "0", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  return h * 60 + m;
}

export function minutesToTimeString(minutes: number): string {
  const rounded = Math.round(minutes);
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

export function minutesToIso(date: string, minutes: number): string {
  return `${date}T${minutesToTimeString(minutes)}`;
}

function appointmentToEvent(
  appt: CalendarAppointmentItem,
  techId: number,
  dateStr: string,
): RCEvent | null {
  if (!appt.scheduled_time) {
    console.warn("[CAL:map] skipping appt — no scheduled_time", { id: appt.id, name: appt.customer_name });
    return null;
  }

  const from = timeStringToMinutes(appt.scheduled_time);
  let to: number;

  if (appt.scheduled_end_time) {
    to = timeStringToMinutes(appt.scheduled_end_time);
  } else {
    const svcs = appt.services ?? [];
    const dur =
      svcs.length > 0
        ? svcs.reduce((s, svc) => s + svc.quantity * 30, 0) || 60
        : 60;
    to = from + dur;
    console.log("[CAL:map] computed end from services", { id: appt.id, from, to, dur });
  }

  if (to <= from) {
    console.warn("[CAL:map] to <= from, clamping", { id: appt.id, from, to });
    to = from + 60;
  }

  return {
    id: appt.id,
    resourceId: techId,
    date: dateStr,
    from,
    to,
    title: appt.customer_name,
    description:
      appt.services?.map((s) => s.service_name).join(", ") ?? undefined,
    meta: {
      appointment: appt,
      isPersonal: false,
      slotType: appt.slot_type,
      status: appt.status,
      alertCount: appt.alerts?.length ?? 0,
      bookingMethod: appt.booking_method,
      color: (SLOT_TYPE_COLORS[appt.slot_type] ?? SLOT_TYPE_COLORS.standard)
        .border,
      // P3-FE-8 (C.12): carry the BE-side `pending_intent_summary`
      // annotation onto the produced RCEvent so the calendar's render
      // surface can paint the dashed-border + source-badge overlay
      // without rejoining against the source row. Field is `null` when
      // no active intents touch this appointment (P6-BE-9 wire shape).
      // `personalEventToEvent` deliberately does NOT carry this field —
      // the overlay only applies to real appointments.
      pendingIntentSummary: appt.pending_intent_summary ?? null,
    },
  };
}

let personalEventIdCounter = -1;

/**
 * Normalize an arbitrary date string to plain `YYYY-MM-DD`. The
 * calendar library buckets events by an exact `dayKey` string match,
 * so any timezone suffix (e.g. `"2026-04-21T04:00:00.000Z"` from the
 * `personal_events` API field) silently routes the event into a
 * separate dayKey from the appointments on the same day, making it
 * invisible. Strip everything after the date to land in the same
 * bucket the appointments use.
 */
function toCalendarDayKey(value: string): string {
  return value.length >= 10 ? value.slice(0, 10) : value;
}

function personalEventToEvent(
  pe: PersonalEvent,
  techId: number,
  dateStr: string,
): RCEvent | null {
  if (!pe.start_time || !pe.end_time) {
    console.warn("[CAL:map] skipping personal event — missing times", { id: pe.id, title: pe.title });
    return null;
  }

  // 2026-04-21 fix: `pe.start_time`/`end_time` are backend `timestamptz`
  // → full ISO with `Z` (e.g. "2026-04-21T10:00:00.000Z"). The naive
  // `timeStringToMinutes` would slice "10:00" out and place the event at
  // the 10:00 row, but 10:00 UTC = 06:00 EDT — the event lands 4 hours
  // off. `backendISOToLocalMinutes` parses the full ISO and returns the
  // user's local-zone minutes-of-day. See
  // `.cursor/rules/datetime-and-data-format-contracts.mdc` § 1.
  const from = backendISOToLocalMinutes(pe.start_time);
  const to = backendISOToLocalMinutes(pe.end_time);

  // 2026-04-22 bug fix: prefer the parent day's `dateStr` (already
  // `YYYY-MM-DD`) over the personal event's own `pe.date`, which
  // arrives from the backend as a full ISO string (e.g.
  // `"2026-04-21T04:00:00.000Z"`). Passing the ISO through caused
  // the library to bucket personal events under a phantom dayKey
  // separate from same-day appointments → events invisible.
  // Defensive: also normalize `pe.date` if `dateStr` is missing.
  const dayKey = dateStr || toCalendarDayKey(pe.date);

  return {
    id: personalEventIdCounter--,
    resourceId: techId,
    date: dayKey,
    from,
    to,
    title: pe.title,
    meta: {
      personalEvent: pe,
      isPersonal: true,
      color: "#9CA3AF",
    },
  };
}

function mapTechColumn(
  tech: CalendarTechnicianColumn,
  dateStr: string,
): { resource: Resource; events: RCEvent[] } {
  const events: RCEvent[] = [];

  for (const appt of tech.appointments ?? []) {
    const ev = appointmentToEvent(appt, tech.technician_id, dateStr);
    if (ev) events.push(ev);
  }

  // 2026-04-22 diagnostic: user reported personal events not showing
  // on the FO calendar. Log per-tech to find out whether the API is
  // returning them at all (count > 0 → API OK, mapper or render bug)
  // or returning them empty (count = 0 → backend / payload bug, e.g.
  // missing technician/shared_with on create). Remove once root-caused.
  const personalEvents = tech.personal_events ?? [];
  if (personalEvents.length > 0) {
    console.log("[CAL:map] personal events for tech", {
      techId: tech.technician_id,
      techName: tech.technician_name,
      date: dateStr,
      count: personalEvents.length,
      sample: personalEvents.slice(0, 2).map((pe) => ({
        id: pe.id,
        title: pe.title,
        date: pe.date,
        start: pe.start_time,
        end: pe.end_time,
        sharedWith: pe.shared_with,
        createdBy: pe.created_by,
      })),
    });
  } else {
    console.log("[CAL:map] no personal events for tech", {
      techId: tech.technician_id,
      date: dateStr,
    });
  }

  for (const pe of personalEvents) {
    const ev = personalEventToEvent(pe, tech.technician_id, dateStr);
    if (ev) events.push(ev);
  }

  const avatar = tech.profile_image_url
    ? `${Config.API_BASE_URL}${tech.profile_image_url}`
    : undefined;

  return {
    resource: {
      id: tech.technician_id,
      name: tech.technician_name,
      avatar,
    },
    events,
  };
}

interface MapDayOptions {
  /**
   * Persistent global tech order. Techs whose ids appear here are placed first
   * in the order given; remaining techs follow, sorted by technician_id.
   * Empty / undefined falls back to numeric id sort.
   *
   * Note: filtering by selection is done INSIDE the calendar library (via the
   * `selectedResourceIds` prop on <Calendar>) so the header strip can keep
   * rendering all avatars while the body hides unselected columns.
   */
  techOrder?: number[];
}

/**
 * Maps a single CalendarDayResponse into resources with embedded events.
 * Sort order is controlled by the optional `options.techOrder` so the caller
 * (FranchiseOwnerCalendar) can pass store-driven order in. With `techOrder`
 * empty / undefined this is identical to the previous "sort by
 * technician_id" behavior.
 */
export function mapDayResponseToResources(
  day: CalendarDayResponse,
  options: MapDayOptions = {},
): ResourceWithEvents[] {
  // The day-view header reorder gesture and the workweek/landscape
  // avatar rails go through the same shared sort helper so they can't
  // drift. See `src/utils/sort-techs-by-order.ts`.
  const techsWithId = (day.technicians ?? []).map((t) => ({
    ...t,
    id: t.technician_id,
  }));
  const sorted = sortTechsByOrder(techsWithId, options.techOrder);

  return sorted.map((tech) => {
    const { resource, events } = mapTechColumn(tech, day.date);
    return { ...resource, events };
  });
}

/**
 * Maps multiple CalendarDayResponse[] (week data) for a single technician
 * into a single resources array with events from all days.
 */
export function mapWeekResponseForTech(
  days: CalendarDayResponse[],
  techId: number,
): ResourceWithEvents[] {
  const allEvents: RCEvent[] = [];
  let techName = "";
  let techAvatar: string | undefined;

  for (const day of days) {
    const tech = day.technicians?.find((t) => t.technician_id === techId);
    if (!tech) continue;
    if (!techName) techName = tech.technician_name;
    if (!techAvatar && tech.profile_image_url) {
      techAvatar = `${Config.API_BASE_URL}${tech.profile_image_url}`;
    }

    const { events } = mapTechColumn(tech, day.date);
    allEvents.push(...events);
  }

  return [
    {
      id: techId,
      name: techName || `Tech ${techId}`,
      avatar: techAvatar,
      events: allEvents,
    },
  ];
}

/**
 * Extract the original CalendarAppointmentItem from a library Event's meta,
 * or null if it's a personal event / draft / move-chain ghost / meta is
 * missing.
 */
export function getAppointmentFromEvent(
  event: RCEvent,
): CalendarAppointmentItem | null {
  const appt = event.meta?.appointment ?? null;
  if (!appt && __DEV__) {
    // 2026-05-12: don't log for events that legitimately have no
    // underlying appointment. Personal events, draft synthetics,
    // and move-chain ghosts ALL flow through helpers (the
    // overlay-style pipeline, the long-press router, the drag
    // dispatcher) that call this for every RCEvent and check the
    // return for null — that's the normal control flow, not a
    // bug. The warning was flooding logs and obscured genuine
    // mapper regressions (an appointment row that lost its meta
    // attachment during mapping). The remaining warn fires only
    // for the unexpected case: an event WITHOUT one of the known
    // non-appointment marker fields.
    const meta = event.meta as
      | {
          isPersonal?: boolean;
          isDraft?: boolean;
          isMoveChainGhost?: boolean;
        }
      | undefined;
    const isKnownNonAppointment =
      meta?.isPersonal === true ||
      meta?.isDraft === true ||
      meta?.isMoveChainGhost === true;
    if (!isKnownNonAppointment) {
      console.warn("[CAL:map] getAppointmentFromEvent returned null", {
        eventId: event.id,
        hasMeta: !!event.meta,
      });
    }
  }
  return appt;
}

export function isPersonalEvent(event: RCEvent): boolean {
  return event.meta?.isPersonal === true;
}

/**
 * Extract the original PersonalEvent from a library Event's meta, or
 * null if it's a real appointment / draft / meta is missing. Mirror of
 * {@link getAppointmentFromEvent} for the personal-event branch of the
 * long-press router (P2-FE-5 chunk 2c follow-up, 2026-04-22).
 */
export function getPersonalEventFromEvent(
  event: RCEvent,
): PersonalEvent | null {
  const pe = event.meta?.personalEvent ?? null;
  if (!pe && __DEV__) {
    // 2026-05-12: same rationale as `getAppointmentFromEvent`. The
    // overlay / dispatcher pipelines call this for every RCEvent
    // and null is the expected outcome for appointments / drafts /
    // ghosts. Only warn for events that DIDN'T identify themselves
    // as one of those known non-personal kinds.
    const meta = event.meta as
      | {
          isPersonal?: boolean;
          isDraft?: boolean;
          isMoveChainGhost?: boolean;
          appointment?: unknown;
        }
      | undefined;
    const isKnownNonPersonal =
      meta?.appointment != null ||
      meta?.isDraft === true ||
      meta?.isMoveChainGhost === true;
    if (!isKnownNonPersonal) {
      console.warn("[CAL:map] getPersonalEventFromEvent returned null", {
        eventId: event.id,
        hasMeta: !!event.meta,
      });
    }
  }
  return pe;
}

export function isDraftEvent(event: RCEvent | null | undefined): boolean {
  return !!event && event.meta?.isDraft === true;
}

/**
 * Extract the `pending_intent_summary` annotation from a library Event's
 * meta. Returns `null` for personal events, draft synthetics, events
 * built from rows that pre-date P6-BE-9, and any event whose source
 * appointment had no active pending intents.
 *
 * The `usePendingChangeOverlay` hook (P3-FE-8 / C.12) is the canonical
 * consumer; the helper exists so the calendar's render surface
 * (`eventStyleOverrides`, `eventSlots`) can also reach into a raw
 * `RCEvent` without round-tripping through the original
 * `CalendarAppointmentItem`.
 */
export function getPendingIntentSummaryFromEvent(
  event: RCEvent | null | undefined,
): PendingIntentSummary | null {
  if (!event) return null;
  return event.meta?.pendingIntentSummary ?? null;
}

export function getEventColor(event: RCEvent): string {
  return event.meta?.color ?? "#4d959c";
}

/**
 * Compute the effective visible day-range when "auto-expand for events"
 * is on. This is a *fit-to-events* range:
 *
 * - Earliest event start, snapped down to the nearest 30-minute boundary
 * - Latest event end, snapped up to the nearest 30-minute boundary
 *
 * If there are no events on the given day(s), falls back to
 * `[defaultStart, defaultEnd)` so the grid isn't an empty sliver. The
 * defaults are NOT used as a minimum/floor — that was the old behavior
 * and made the user-set bounds look like they were being ignored
 * whenever a single early/late event existed. Now the defaults only
 * apply on a fully-empty day.
 *
 * If the fitted range comes out narrower than 60 minutes (e.g. a single
 * 30-minute event), it's padded equally on both sides to a 60-minute
 * minimum window so the grid still has a usable height.
 *
 * The result is clamped to `[0, 1440]`. Snapping to 30 minutes keeps
 * grid lines tidy and keeps the library's hour labels aligned.
 *
 * Pass an array of day responses for the franchise week / workweek
 * views, or a single-element array for the day view.
 */
export function computeEffectiveDisplayRange(
  days: CalendarDayResponse[] | undefined,
  defaultStart: number,
  defaultEnd: number,
): { startMinutes: number; endMinutes: number } {
  let earliest: number | null = null;
  let latest: number | null = null;

  if (days?.length) {
    for (const day of days) {
      for (const tech of day.technicians ?? []) {
        for (const appt of tech.appointments ?? []) {
          if (!appt.scheduled_time || !appt.scheduled_end_time) continue;
          const s = timeStringToMinutes(appt.scheduled_time);
          const e = timeStringToMinutes(appt.scheduled_end_time);
          if (earliest === null || s < earliest) earliest = s;
          if (latest === null || e > latest) latest = e;
        }
        for (const ev of tech.personal_events ?? []) {
          if (!ev.start_time || !ev.end_time) continue;
          // 2026-04-21 fix: same timestamptz / TIME asymmetry as
          // `personalEventToEvent`. Use the local-minutes helper so the
          // auto-fit visible-window window doesn't open at the UTC hour.
          const s = backendISOToLocalMinutes(ev.start_time);
          const e = backendISOToLocalMinutes(ev.end_time);
          if (earliest === null || s < earliest) earliest = s;
          if (latest === null || e > latest) latest = e;
        }
      }
    }
  }

  // No events anywhere → fall back to the user's defaults so the grid
  // has something sensible to show.
  if (earliest === null || latest === null) {
    return {
      startMinutes: Math.max(0, defaultStart),
      endMinutes: Math.min(1440, defaultEnd),
    };
  }

  let start = Math.floor(earliest / 30) * 30;
  let end = Math.ceil(latest / 30) * 30;

  // Enforce a minimum 60-minute visible window so the calendar isn't
  // unusably short for a single tiny event.
  const MIN_WINDOW = 60;
  if (end - start < MIN_WINDOW) {
    const pad = MIN_WINDOW - (end - start);
    start = Math.max(0, start - Math.floor(pad / 2));
    end = Math.min(1440, start + MIN_WINDOW);
    // If we hit the lower bound, push end out to maintain the window.
    if (end - start < MIN_WINDOW) end = Math.min(1440, start + MIN_WINDOW);
  }

  return {
    startMinutes: Math.max(0, start),
    endMinutes: Math.min(1440, end),
  };
}

/**
 * Pad a `[startMinutes, endMinutes)` window so that the resulting grid
 * pixel height fills the measured calendar viewport. Added 2026-04-22
 * per user feedback: "The portrait map size is messed up for all 4
 * views. They no longer span to the bottom."
 *
 * Why this is needed: the vendored Calendar lays out its body as
 * `(endMinutes - startMinutes) / 60 * hourHeight` pixels and renders it
 * inside a flex-1 container. When the fitted range (from
 * computeEffectiveDisplayRange) is shorter than the viewport, the body
 * just leaves the bottom area blank — there's no flexbox stretch
 * because the body uses an absolute height. We can't fix this purely
 * in CSS; we have to grow the time range until the body's pixel height
 * meets or exceeds the viewport.
 *
 * Behavior:
 * - Events stay top-aligned (we only extend `endMinutes`).
 * - When `endMinutes` would exceed 1440 (end of day), spill the
 *   remaining padding upward into `startMinutes` so we still hit the
 *   target height when there's room earlier in the day.
 * - Snap to the next/previous hour boundary so the grid's hour labels
 *   stay clean.
 * - No-op when `viewportHeight <= 0` (not yet measured) or when the
 *   range already meets or exceeds the viewport.
 *
 * Header reserve: `headerReservePx` defaults to 80px, an empirical
 * estimate of the resources/days strip height (~40px avatar circle +
 * 30px paddingVertical from Calendar.tsx + ~10px buffer). Iterate
 * on-device if the bottom under-/over-shoots noticeably.
 */
export function padRangeToFillViewport(
  startMinutes: number,
  endMinutes: number,
  viewportHeight: number,
  hourHeight: number,
  headerReservePx = 80,
): { startMinutes: number; endMinutes: number } {
  if (viewportHeight <= 0 || hourHeight <= 0) {
    return { startMinutes, endMinutes };
  }
  const gridTargetPx = Math.max(0, viewportHeight - headerReservePx);
  const requiredMinutes = Math.ceil((gridTargetPx * 60) / hourHeight);
  const currentMinutes = endMinutes - startMinutes;
  if (currentMinutes >= requiredMinutes) {
    return { startMinutes, endMinutes };
  }

  let nextEnd = Math.ceil((startMinutes + requiredMinutes) / 60) * 60;
  let nextStart = startMinutes;
  if (nextEnd > 1440) {
    const overflow = nextEnd - 1440;
    nextEnd = 1440;
    nextStart = Math.max(0, Math.floor((startMinutes - overflow) / 60) * 60);
  }
  return { startMinutes: nextStart, endMinutes: nextEnd };
}
