import { useQuery } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { Appointment, ScheduleDay } from "@technician/types/api";

interface TodayScheduleResponse {
  date: string;
  availability: unknown[];
  appointments: Appointment[];
}

export function useTodaySchedule() {
  return useQuery({
    queryKey: ["schedule", "today"],
    queryFn: async () => {
      const res = await api<TodayScheduleResponse>(
        "get",
        Endpoints.schedule.today
      );
      return res.appointments;
    },
    staleTime: 30_000,
  });
}

export function useWeekSchedule(date: string) {
  return useQuery({
    queryKey: ["schedule", "week", date],
    queryFn: () =>
      api<ScheduleDay[]>("get", Endpoints.schedule.range, {
        date,
        range: "week",
      }),
    staleTime: 30_000,
    enabled: !!date,
  });
}
