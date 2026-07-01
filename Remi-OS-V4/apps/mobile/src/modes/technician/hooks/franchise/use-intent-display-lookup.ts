/**
 * `useIntentDisplayLookup` — resolves a list of intent appointment_ids
 * into a `Map<id, CalendarAppointmentItem>` so the Pending Reality
 * review screen can render customer names and service summaries
 * instead of bare numeric ids.
 *
 * PR 3 (2026-04-24) — replaces the bare "Appointment #5001" subjects
 * on the review screen with "John Smith — Brake service". User
 * feedback was that the numeric id is meaningless to a franchise
 * owner / technician scanning their pending session, so this hook
 * pulls the appointment from the existing per-id detail cache,
 * fetching missing entries on demand via `useAppointmentDetail`'s
 * underlying queryFn.
 *
 * Implementation:
 *   - Uses `@tanstack/react-query`'s `useQueries` to fan-out one
 *     query per unique appointment id. Each query reuses the same
 *     cache key (`calendarKeys.appointmentDetail(id)`) as
 *     `useAppointmentDetail`, so a hit in either place warms the
 *     other.
 *   - Returns a Map keyed by appointment id. Entries for ids that
 *     are still loading (or hit a network error) are absent — the
 *     consumer falls back to the bare id display in that case.
 *
 * Why not `useAppointmentDetail` per intent? React's rules-of-hooks
 * forbid calling a hook in a loop. `useQueries` is the canonical
 * batched form of "I have N ids and want N parallel queries".
 */

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";

import { franchiseApi } from "@technician/api/client";
import { FranchiseEndpoints } from "@technician/api/endpoints";
import { calendarKeys } from "@technician/hooks/schedule/use-calendar";
import type { CalendarAppointmentItem } from "@technician/types/calendar";

export function useIntentDisplayLookup(
  appointmentIds: number[],
): Map<number, CalendarAppointmentItem> {
  const uniqueIds = useMemo(() => {
    const seen = new Set<number>();
    const out: number[] = [];
    for (const id of appointmentIds) {
      if (id <= 0 || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }, [appointmentIds]);

  const results = useQueries({
    queries: uniqueIds.map((id) => ({
      queryKey: calendarKeys.appointmentDetail(id),
      queryFn: () =>
        franchiseApi<CalendarAppointmentItem>(
          "get",
          FranchiseEndpoints.calendarV2.appointmentDetail(id),
        ),
      enabled: id > 0,
      staleTime: 30_000,
    })),
  });

  return useMemo(() => {
    const map = new Map<number, CalendarAppointmentItem>();
    uniqueIds.forEach((id, idx) => {
      const data = results[idx]?.data;
      if (data) map.set(id, data);
    });
    return map;
  }, [uniqueIds, results]);
}
