import { useQuery } from "@tanstack/react-query";
import { api, franchiseApi } from "@technician/api/client";
import { Endpoints, FranchiseEndpoints } from "@technician/api/endpoints";
import { useAuthStore } from "@/src/stores/auth";
import { UserRole } from "@technician/types/enums";
import type { ServiceListItem } from "@technician/types/calendar";

export function useCalendarServices() {
  const role = useAuthStore((s) => s.user?.role);
  const isFranchise = role === UserRole.FRANCHISE_OWNER;
  return useQuery({
    queryKey: ["calendar-services"],
    queryFn: () =>
      isFranchise
        ? franchiseApi<ServiceListItem[]>(
            "get",
            FranchiseEndpoints.calendarV2.services,
          )
        : api<ServiceListItem[]>(
            "get",
            Endpoints.calendar.services,
          ),
    staleTime: 60_000,
  });
}
