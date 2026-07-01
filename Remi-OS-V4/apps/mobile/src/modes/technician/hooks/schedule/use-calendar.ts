import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, franchiseApi } from "@technician/api/client";
import { Endpoints, FranchiseEndpoints } from "@technician/api/endpoints";
import { useAuthStore } from "@/src/stores/auth";
import { UserRole } from "@technician/types/enums";
import type {
  CalendarDayResponse,
  CalendarAppointmentItem,
  MonthViewResponse,
  CreateAppointmentFromCalendarPayload,
  UpdateAppointmentPayload,
  ReschedulePayload,
  CancelPayload,
  NoShowPayload,
  FlexListEntry,
} from "@technician/types/calendar";

export const calendarKeys = {
  all: ["calendar"] as const,
  day: (date: string) => [...calendarKeys.all, "day", date] as const,
  week: (startDate: string) =>
    [...calendarKeys.all, "week", startDate] as const,
  month: (year: number, month: number) =>
    [...calendarKeys.all, "month", year, month] as const,
  appointmentDetail: (id: number) =>
    [...calendarKeys.all, "appointment", id] as const,
};

// ── Franchise Day View ──────────────────────────────────────────

export function useFranchiseDayView(date: string) {
  return useQuery({
    queryKey: calendarKeys.day(date),
    queryFn: async () => {
      const data = await franchiseApi<CalendarDayResponse>(
        "get",
        FranchiseEndpoints.calendarV2.dayView(date),
      );
      // 2026-04-22 diagnostic: confirm the backend is returning the
      // personal_events array on the day-view response. If every tech
      // shows `personal_events: 0` even after we send shared_with on
      // create, the bug is on the backend (groupingTo by shared_with
      // not implemented). Remove once root-caused.
      const personalEventTotals = (data?.technicians ?? []).map((t) => ({
        techId: t.technician_id,
        techName: t.technician_name,
        appts: t.appointments?.length ?? 0,
        personal: t.personal_events?.length ?? 0,
      }));
      console.log("[CAL:api] dayView response", {
        date,
        techCount: data?.technicians?.length ?? 0,
        totals: personalEventTotals,
        anyPersonal: personalEventTotals.some((t) => t.personal > 0),
      });
      return data;
    },
    staleTime: 30_000,
    retry: 1,
    enabled: !!date,
  });
}

// ── Franchise Week View ─────────────────────────────────────────

export function useFranchiseWeekView(startDate: string) {
  return useQuery({
    queryKey: calendarKeys.week(startDate),
    queryFn: async () => {
      const data = await franchiseApi<CalendarDayResponse[]>(
        "get",
        FranchiseEndpoints.calendarV2.weekView(startDate),
      );
      // 2026-04-22 diagnostic: see useFranchiseDayView. Per-day +
      // per-tech personal_events count so we can verify the backend
      // is returning newly-created personal events on the right day.
      const perDay = (data ?? []).map((day) => ({
        date: day.date,
        totalPersonal: (day.technicians ?? []).reduce(
          (s, t) => s + (t.personal_events?.length ?? 0),
          0,
        ),
        perTech: (day.technicians ?? [])
          .filter((t) => (t.personal_events?.length ?? 0) > 0)
          .map((t) => ({
            techId: t.technician_id,
            techName: t.technician_name,
            personal: t.personal_events?.length ?? 0,
            sample: t.personal_events?.slice(0, 2).map((pe) => ({
              id: pe.id,
              title: pe.title,
              date: pe.date,
              start: pe.start_time,
              sharedWith: pe.shared_with,
              createdBy: pe.created_by,
            })),
          })),
      }));
      console.log("[CAL:api] weekView response", {
        startDate,
        dayCount: data?.length ?? 0,
        anyPersonal: perDay.some((d) => d.totalPersonal > 0),
        perDay,
      });
      return data;
    },
    staleTime: 30_000,
    retry: 1,
    enabled: !!startDate,
  });
}

// ── Franchise Month View ────────────────────────────────────────

export function useFranchiseMonthView(year: number, month: number) {
  return useQuery({
    queryKey: calendarKeys.month(year, month),
    queryFn: () =>
      franchiseApi<MonthViewResponse>(
        "get",
        FranchiseEndpoints.calendarV2.monthView(year, month),
      ),
    staleTime: 60_000,
    enabled: year > 0 && month >= 1 && month <= 12,
  });
}

// ── Technician Day View ─────────────────────────────────────────

export function useTechnicianDayView(date: string) {
  return useQuery({
    queryKey: [...calendarKeys.day(date), "tech"],
    queryFn: () =>
      api<CalendarDayResponse>("get", Endpoints.calendar.dayView(date)),
    staleTime: 30_000,
    retry: 1,
    enabled: !!date,
  });
}

// ── Technician Week View ────────────────────────────────────────

export function useTechnicianWeekView(startDate: string) {
  return useQuery({
    queryKey: [...calendarKeys.week(startDate), "tech"],
    queryFn: () =>
      api<CalendarDayResponse[]>(
        "get",
        Endpoints.calendar.weekView(startDate),
      ),
    staleTime: 30_000,
    retry: 1,
    enabled: !!startDate,
  });
}

// ── 409 diagnostic logger (P3-FE-DIAG-409-LOGGING) ───────────────
//
// Transient diagnostic helper for the calendar drag-reschedule 409
// investigation. Emits a structured log with the HTTP status, the
// backend's full `{ error, message, data }` envelope, the response
// body's `message` field (the part we most care about for the
// dispatch-bug diagnosis), and the request payload that triggered
// the failure. Greppable prefix `[CAL:409-DIAG]` for filtering in
// Expo Go / Metro logs.
//
// This whole block (helper + every call site) is expected to be
// reverted (or replaced with a user-facing toast) within a day or
// two, once the dispatch-bug diagnosis is confirmed and the backend
// fix lands. Do not promote it to a permanent logger without
// scrubbing the payload of anything sensitive first.
function logCal409Diagnostic(
  label: string,
  err: unknown,
  payload: Record<string, unknown>,
): void {
  const e = err as
    | {
        response?: { status?: number; data?: { message?: string } | unknown };
      }
    | undefined;
  console.error(`[CAL:409-DIAG] ${label}`, {
    status: e?.response?.status,
    message:
      e?.response?.data &&
      typeof e.response.data === "object" &&
      "message" in e.response.data
        ? (e.response.data as { message?: string }).message
        : undefined,
    body: e?.response?.data,
    payload,
  });
}

// ── Technician Reschedule Appointment ────────────────────────────

export function useTechnicianRescheduleAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: ReschedulePayload;
    }) =>
      api<CalendarAppointmentItem>(
        "put",
        Endpoints.calendar.rescheduleAppointment(id),
        payload,
      ),
    onMutate: async ({ id, payload }) => {
      await queryClient.cancelQueries({ queryKey: calendarKeys.all });

      const newDate = payload.new_start_time.split("T")[0];
      const timePart = payload.new_start_time.split("T")[1];
      const newTime = timePart ? timePart.substring(0, 8) : "08:00:00";
      const endPart = payload.new_end_time?.split("T")[1];
      const newEndTime = endPart ? endPart.substring(0, 8) : undefined;

      const snapshot = new Map<string, unknown>();

      const dayQueries = queryClient.getQueriesData<CalendarDayResponse>({
        queryKey: [...calendarKeys.all, "day"],
      });
      for (const [key, value] of dayQueries) {
        snapshot.set(JSON.stringify(key), structuredClone(value));
        if (value) {
          queryClient.setQueryData(
            key,
            applyRescheduleToCache(
              value,
              id,
              newDate,
              newTime,
              newEndTime,
              payload.new_technician_id,
            ),
          );
        }
      }

      const weekQueries = queryClient.getQueriesData<CalendarDayResponse[]>({
        queryKey: [...calendarKeys.all, "week"],
      });
      for (const [key, value] of weekQueries) {
        snapshot.set(JSON.stringify(key), structuredClone(value));
        if (value) {
          queryClient.setQueryData(
            key,
            applyRescheduleToCache(
              value,
              id,
              newDate,
              newTime,
              newEndTime,
              payload.new_technician_id,
            ),
          );
        }
      }

      return { snapshot };
    },
    onError: (err, vars, context) => {
      // P3-FE-DIAG-409-LOGGING (transient): mirror the franchise
      // reschedule diagnostic on the technician route so 409s from
      // either calendar surface the backend envelope.
      logCal409Diagnostic("technician reschedule failed", err, {
        appointmentId: vars.id,
        newStart: vars.payload.new_start_time,
        newEnd: vars.payload.new_end_time,
        newTechId: vars.payload.new_technician_id,
      });
      if (context?.snapshot) {
        for (const [keyStr, value] of context.snapshot) {
          queryClient.setQueryData(JSON.parse(keyStr), value);
        }
      }
    },
    onSettled: async () => {
      queryClient.invalidateQueries({ queryKey: [...calendarKeys.all, "day"] });
      queryClient.invalidateQueries({ queryKey: [...calendarKeys.all, "week"] });
      try {
        console.log("[CAL:reschedule] reoptimizing route…");
        await api("post", Endpoints.routes.optimize);
        console.log("[CAL:reschedule] route reoptimized OK");
      } catch (err) {
        console.log("[CAL:reschedule] route reoptimize skipped", err);
      }
      queryClient.invalidateQueries({ queryKey: ["routes"] });
    },
  });
}

// ── Appointment Detail ──────────────────────────────────────────

export function useAppointmentDetail(id: number) {
  return useQuery({
    queryKey: calendarKeys.appointmentDetail(id),
    queryFn: () =>
      franchiseApi<CalendarAppointmentItem>(
        "get",
        FranchiseEndpoints.calendarV2.appointmentDetail(id),
      ),
    enabled: id > 0,
  });
}

// ── Create Appointment ──────────────────────────────────────────

export function useCreateAppointment() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const isFranchise = role === UserRole.FRANCHISE_OWNER;

  return useMutation({
    mutationFn: (payload: CreateAppointmentFromCalendarPayload) =>
      isFranchise
        ? franchiseApi<CalendarAppointmentItem>(
            "post",
            FranchiseEndpoints.calendarV2.createAppointment,
            payload,
          )
        : api<CalendarAppointmentItem>(
            "post",
            Endpoints.calendar.createAppointment,
            payload,
          ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.all });
      queryClient.invalidateQueries({ queryKey: ["dispatch-overview"] });
    },
  });
}

// ── Update Appointment ──────────────────────────────────────────

export function useUpdateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: UpdateAppointmentPayload;
    }) =>
      franchiseApi<CalendarAppointmentItem>(
        "put",
        FranchiseEndpoints.calendarV2.updateAppointment(id),
        payload,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.all });
      queryClient.invalidateQueries({ queryKey: ["dispatch-overview"] });
    },
  });
}

// ── Reschedule Appointment ──────────────────────────────────────

function normDate(d: string): string {
  return d.split("T")[0] ?? d;
}

function applyRescheduleToCache(
  data: CalendarDayResponse | CalendarDayResponse[] | undefined,
  apptId: number,
  newDate: string,
  newTime: string,
  newEndTime?: string,
  newTechId?: number,
): CalendarDayResponse | CalendarDayResponse[] | undefined {
  if (!data) return data;
  const isArray = Array.isArray(data);
  const days = isArray ? data : [data];

  let movedAppt: CalendarAppointmentItem | null = null;
  let sourceDayIdx = -1;
  let sourceTechIdx = -1;

  for (let di = 0; di < days.length; di++) {
    for (let ti = 0; ti < days[di]!.technicians.length; ti++) {
      const idx = days[di]!.technicians[ti]!.appointments.findIndex((a) => a.id === apptId);
      if (idx !== -1) {
        const targetTechId = newTechId ?? days[di]!.technicians[ti]!.technician_id;
        movedAppt = {
          ...days[di]!.technicians[ti]!.appointments[idx]!,
          scheduled_date: newDate,
          scheduled_time: newTime,
          scheduled_end_time: newEndTime ? newEndTime.substring(0, 8) : days[di]!.technicians[ti]!.appointments[idx]!.scheduled_end_time,
          technician_id: targetTechId,
        };
        sourceDayIdx = di;
        sourceTechIdx = ti;
        break;
      }
    }
    if (movedAppt) break;
  }

  if (!movedAppt || sourceDayIdx === -1) return data;

  const targetDayExists = days.some((d) => normDate(d.date) === normDate(newDate));
  if (!targetDayExists) return data;

  const updated: CalendarDayResponse[] = days.map((day, di) => {
    const techs = day.technicians.map((tech, ti) => {
      let appts = tech.appointments;
      if (di === sourceDayIdx && ti === sourceTechIdx) {
        appts = appts.filter((a) => a.id !== apptId);
      }
      const targetTechId = newTechId ?? movedAppt!.technician_id;
      if (normDate(day.date) === normDate(newDate) && tech.technician_id === targetTechId) {
        appts = [
          ...appts,
          {
            ...movedAppt!,
            technician_id: tech.technician_id,
            technician_name: tech.technician_name,
          },
        ];
      }
      if (appts === tech.appointments) return tech;
      return {
        ...tech,
        appointments: appts,
        job_count: appts.length,
        completed_count: appts.filter(
          (a) => a.status === "completed" || a.status === "paid",
        ).length,
      };
    });
    if (techs.every((t, i) => t === day.technicians[i])) return day;
    return { ...day, technicians: techs };
  });

  return isArray ? updated : updated[0]!;
}

export function useRescheduleAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: ReschedulePayload;
    }) =>
      franchiseApi<CalendarAppointmentItem>(
        "put",
        FranchiseEndpoints.calendarV2.rescheduleAppointment(id),
        payload,
      ),
    onMutate: async ({ id, payload }) => {
      await queryClient.cancelQueries({ queryKey: calendarKeys.all });

      const newDate = payload.new_start_time.split("T")[0];
      const timePart = payload.new_start_time.split("T")[1];
      const newTime = timePart ? timePart.substring(0, 8) : "08:00:00";
      const endPart = payload.new_end_time?.split("T")[1];
      const newEndTime = endPart ? endPart.substring(0, 8) : undefined;

      const snapshot = new Map<string, unknown>();

      const dayQueries = queryClient.getQueriesData<CalendarDayResponse>({
        queryKey: [...calendarKeys.all, "day"],
      });
      for (const [key, value] of dayQueries) {
        snapshot.set(JSON.stringify(key), structuredClone(value));
        if (value) {
          queryClient.setQueryData(
            key,
            applyRescheduleToCache(
              value,
              id,
              newDate,
              newTime,
              newEndTime,
              payload.new_technician_id,
            ),
          );
        }
      }

      const weekQueries = queryClient.getQueriesData<CalendarDayResponse[]>({
        queryKey: [...calendarKeys.all, "week"],
      });
      for (const [key, value] of weekQueries) {
        snapshot.set(JSON.stringify(key), structuredClone(value));
        if (value) {
          queryClient.setQueryData(
            key,
            applyRescheduleToCache(
              value,
              id,
              newDate,
              newTime,
              newEndTime,
              payload.new_technician_id,
            ),
          );
        }
      }

      return { snapshot };
    },
    onError: (err, vars, context) => {
      // P3-FE-DIAG-409-LOGGING (transient): expose the backend's
      // `{ error, message, data }` envelope so we can confirm whether
      // a 409 came from the real overlap check or the dispatch-bug
      // "Appointment already on this route" path. Greppable prefix
      // `[CAL:409-DIAG]`. Revert (or replace with a user-facing
      // toast) once the dispatch-bug diagnosis is confirmed.
      logCal409Diagnostic("franchise reschedule failed", err, {
        appointmentId: vars.id,
        newStart: vars.payload.new_start_time,
        newEnd: vars.payload.new_end_time,
        newTechId: vars.payload.new_technician_id,
      });
      if (context?.snapshot) {
        for (const [keyStr, value] of context.snapshot) {
          queryClient.setQueryData(JSON.parse(keyStr), value);
        }
      }
    },
    onSettled: (_data, _error, { payload: _payload }) => {
      queryClient.invalidateQueries({ queryKey: [...calendarKeys.all, "day"] });
      queryClient.invalidateQueries({ queryKey: [...calendarKeys.all, "week"] });
      queryClient.invalidateQueries({ queryKey: ["dispatch-overview"] });
      queryClient.invalidateQueries({ queryKey: ["franchise-route-map"] });
      // 2026-05-25 — Delayed second invalidate so the FE picks up
      // the real Google Routes polylines once the BE's
      // fire-and-forget refresh finishes (~1-2s). The first
      // invalidate above lands with straight-line fallbacks
      // (which the BE's route_stops rows briefly hold while the
      // Routes API call is in flight); this second one swaps in
      // the real driving paths.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["franchise-route-map"] });
      }, 2500);
    },
  });
}

// ── Reassign Appointment (quick swap) ───────────────────────────
//
// Fires the lightweight `/calendar/reassign` endpoint that ONLY changes
// `technician_id` (no date / time mutation). Used by the calendar's
// quick-swap drag-and-drop fast path: when a card is dragged between two
// currently-selected techs at the same date+time, we skip the full
// Reschedule sheet and fire this with optimistic UI + a toast/Undo.

interface ReassignPayload {
  appointmentId: number;
  fromTechnicianId: number;
  toTechnicianId: number;
  // 2026-05-07 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY Task D, re-applied
  // after revert): backend `/franchise/calendar/reassign` validator
  // requires `franchiseId` in the request body; the route does NOT
  // read it from the JWT for this endpoint. Smoke log: `[CAL:409-DIAG]
  // quick-swap reassign failed { status: 422, body: { data:
  // ["franchiseId: Required"] } }`. Caller is the FO calendar
  // (always single franchise per session) — pass the active
  // franchise id from `useAuthStore.user.franchiseId`.
  //
  // Original commit was 49f1fe3 (lost during a subsequent revert /
  // reset to 9b17afa); this is the same fix re-applied alongside
  // Phase 34 X-edge work.
  franchiseId: number;
}

function applyReassignToCache(
  data: CalendarDayResponse | CalendarDayResponse[] | undefined,
  apptId: number,
  toTechnicianId: number,
): CalendarDayResponse | CalendarDayResponse[] | undefined {
  if (!data) return data;
  const isArray = Array.isArray(data);
  const days = isArray ? data : [data];

  let movedAppt: CalendarAppointmentItem | null = null;
  let sourceDayIdx = -1;
  let sourceTechIdx = -1;
  for (let di = 0; di < days.length; di++) {
    for (let ti = 0; ti < days[di]!.technicians.length; ti++) {
      const idx = days[di]!.technicians[ti]!.appointments.findIndex(
        (a) => a.id === apptId,
      );
      if (idx !== -1) {
        movedAppt = days[di]!.technicians[ti]!.appointments[idx]!;
        sourceDayIdx = di;
        sourceTechIdx = ti;
        break;
      }
    }
    if (movedAppt) break;
  }
  if (!movedAppt || sourceDayIdx === -1) return data;

  const updated: CalendarDayResponse[] = days.map((day, di) => {
    const techs = day.technicians.map((tech, ti) => {
      let appts = tech.appointments;
      if (di === sourceDayIdx && ti === sourceTechIdx) {
        appts = appts.filter((a) => a.id !== apptId);
      }
      if (di === sourceDayIdx && tech.technician_id === toTechnicianId) {
        appts = [
          ...appts,
          {
            ...movedAppt!,
            technician_id: tech.technician_id,
            technician_name: tech.technician_name,
          },
        ];
      }
      if (appts === tech.appointments) return tech;
      return {
        ...tech,
        appointments: appts,
        job_count: appts.length,
        completed_count: appts.filter(
          (a) => a.status === "completed" || a.status === "paid",
        ).length,
      };
    });
    if (techs.every((t, i) => t === day.technicians[i])) return day;
    return { ...day, technicians: techs };
  });

  return isArray ? updated : updated[0]!;
}

export function useReassignAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ReassignPayload) =>
      franchiseApi<{ ok: true }>("put", FranchiseEndpoints.reassign, payload),
    onMutate: async ({ appointmentId, toTechnicianId }) => {
      await queryClient.cancelQueries({ queryKey: calendarKeys.all });

      const snapshot = new Map<string, unknown>();
      const dayQueries = queryClient.getQueriesData<CalendarDayResponse>({
        queryKey: [...calendarKeys.all, "day"],
      });
      for (const [key, value] of dayQueries) {
        snapshot.set(JSON.stringify(key), structuredClone(value));
        if (value) {
          queryClient.setQueryData(
            key,
            applyReassignToCache(value, appointmentId, toTechnicianId),
          );
        }
      }
      const weekQueries = queryClient.getQueriesData<CalendarDayResponse[]>({
        queryKey: [...calendarKeys.all, "week"],
      });
      for (const [key, value] of weekQueries) {
        snapshot.set(JSON.stringify(key), structuredClone(value));
        if (value) {
          queryClient.setQueryData(
            key,
            applyReassignToCache(value, appointmentId, toTechnicianId),
          );
        }
      }
      return { snapshot };
    },
    onError: (err, vars, context) => {
      // P3-FE-DIAG-409-LOGGING (transient): same diagnostic shape as
      // the franchise reschedule mutation — log the full envelope so
      // 409s on the quick-swap fast path surface the backend's
      // `data.message` rather than a bare AxiosError.
      logCal409Diagnostic("quick-swap reassign failed", err, {
        appointmentId: vars.appointmentId,
        fromTechId: vars.fromTechnicianId,
        toTechId: vars.toTechnicianId,
        franchiseId: vars.franchiseId,
      });
      if (context?.snapshot) {
        for (const [keyStr, value] of context.snapshot) {
          queryClient.setQueryData(JSON.parse(keyStr), value);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [...calendarKeys.all, "day"] });
      queryClient.invalidateQueries({ queryKey: [...calendarKeys.all, "week"] });
      queryClient.invalidateQueries({ queryKey: ["dispatch-overview"] });
    },
  });
}

// ── Cancel Appointment ──────────────────────────────────────────

export function useCancelAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: CancelPayload }) =>
      franchiseApi<{ cancelled: true; flex_matches: FlexListEntry[] }>(
        "put",
        FranchiseEndpoints.calendarV2.cancelAppointment(id),
        payload,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.all });
      queryClient.invalidateQueries({ queryKey: ["dispatch-overview"] });
      queryClient.invalidateQueries({ queryKey: ["flex-list"] });
    },
  });
}

// ── Delete Appointment (unpaid only) ───────────────────────────
//
// 2026-05-25 — Hard delete an unpaid appointment. The BE refuses
// if a `stripe_payments.status='succeeded'` row exists OR the
// status is `completed`/`paid`. Use this when the operator wants
// the appointment GONE rather than marked cancelled.

export function useDeleteAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      franchiseApi<{ deleted: true; appointment_id: number }>(
        "delete",
        FranchiseEndpoints.calendarV2.deleteAppointment(id),
      ),
    onSuccess: () => {
      // Bust every surface that lists appointments so the deleted
      // row vanishes immediately from calendar, orders, and
      // dispatch.
      queryClient.invalidateQueries({ queryKey: calendarKeys.all });
      queryClient.invalidateQueries({ queryKey: ["dispatch-overview"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["routes"] });
      queryClient.invalidateQueries({ queryKey: ["franchise-route-map"] });
      // Same delayed second invalidate as reschedule — picks up
      // Google Routes polylines after the BE refresh finishes.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["franchise-route-map"] });
      }, 2500);
    },
  });
}

// ── No-Show Appointment ─────────────────────────────────────────

export function useNoShowAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: NoShowPayload }) =>
      franchiseApi<{ marked: true }>(
        "put",
        FranchiseEndpoints.calendarV2.noShowAppointment(id),
        payload,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.all });
      queryClient.invalidateQueries({ queryKey: ["dispatch-overview"] });
    },
  });
}
