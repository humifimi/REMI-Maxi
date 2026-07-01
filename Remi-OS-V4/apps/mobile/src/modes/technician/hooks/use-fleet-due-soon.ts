import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { franchiseApi } from "@technician/api/client";
import { FranchiseEndpoints } from "@technician/api/endpoints";
import type {
  FleetDueSoonVehicle,
  FleetDueSoonResponse,
  NudgeSendPayload,
  NudgeSendResponse,
} from "@technician/types/fleet";

function segmentVehicles(vehicles: FleetDueSoonVehicle[]): FleetDueSoonResponse {
  const overdue = vehicles
    .filter((v) => v.segment === "overdue")
    .sort((a, b) => (a.days_until_due ?? 0) - (b.days_until_due ?? 0));
  const due_7 = vehicles
    .filter((v) => v.segment === "due_7")
    .sort((a, b) => (a.days_until_due ?? 0) - (b.days_until_due ?? 0));
  const due_14 = vehicles
    .filter((v) => v.segment === "due_14")
    .sort((a, b) => (a.days_until_due ?? 0) - (b.days_until_due ?? 0));

  return {
    overdue,
    due_7,
    due_14,
    total_count: overdue.length + due_7.length + due_14.length,
  };
}

export function useAllFleetDueSoon() {
  return useQuery({
    queryKey: ["fleet", "due-soon-all"],
    queryFn: async (): Promise<FleetDueSoonResponse> => {
      const vehicles = await franchiseApi<FleetDueSoonVehicle[]>(
        "get",
        FranchiseEndpoints.fleet.dueSoonAll
      );
      return segmentVehicles(vehicles);
    },
    staleTime: 30_000,
  });
}

export function useFleetNudge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: NudgeSendPayload): Promise<NudgeSendResponse> =>
      franchiseApi<NudgeSendResponse>(
        "post",
        FranchiseEndpoints.fleet.nudgeBulk,
        payload
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet", "due-soon-all"] });
    },
  });
}

export const NUDGE_TEMPLATES = [
  {
    key: "due_soon",
    label: "Due Soon — Pick a Time",
    body: "Hi {{driver_name}}, your {{vehicle}} is due for {{service_type}} around {{due_date}}. Pick a time that works for you!",
    icon: "schedule" as const,
  },
  {
    key: "overdue",
    label: "Overdue — Quick Check",
    body: "Hi {{driver_name}}, your {{vehicle}} is overdue for {{service_type}}. What's your availability this week?",
    icon: "warning" as const,
  },
  {
    key: "onsite",
    label: "We'll Be Onsite",
    body: "Hi {{driver_name}}, we'll be onsite at your location soon — want us to grab your {{vehicle}} for {{service_type}}?",
    icon: "location-on" as const,
  },
] as const;

export function interpolateTemplate(
  template: string,
  vehicle: FleetDueSoonVehicle
): string {
  const vehicleLabel = [vehicle.year, vehicle.make, vehicle.model]
    .filter(Boolean)
    .join(" ");

  return template
    .replace(/\{\{driver_name\}\}/g, vehicle.driver_name ?? "there")
    .replace(/\{\{vehicle\}\}/g, vehicleLabel || "your vehicle")
    .replace(/\{\{service_type\}\}/g, vehicle.service_type_due ?? "service")
    .replace(
      /\{\{due_date\}\}/g,
      vehicle.estimated_due_date
        ? new Date(vehicle.estimated_due_date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })
        : "soon"
    );
}
