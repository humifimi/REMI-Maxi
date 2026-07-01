import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { Appointment } from "@technician/types/api";
import type {
  WalkInBookingRequest,
  WalkInBookingResponse,
  ActiveAppointmentCheck,
  QuickRegisterCustomer,
} from "@technician/types/booking";

// GET /technician/appointments?vehicle_id=X&status=active — the contract-shape
// endpoint that decides "continue existing job vs. Quick Book" after the tech
// scans a plate. Falls through to a no-active-appointment result on any error
// so the UI can still show the walk-in branch instead of dead-ending.
//
// `useVehicleActiveAppointment` is the canonical name; `useCheckActiveAppointment`
// is a compatibility alias for callers that haven't been renamed yet.
export function useVehicleActiveAppointment(vehicleId: number | null) {
  return useQuery({
    queryKey: ["vehicle-active-appointment", vehicleId],
    queryFn: async (): Promise<ActiveAppointmentCheck> => {
      try {
        const rows = await api<Appointment[]>(
          "get",
          Endpoints.appointments.list,
          { vehicle_id: vehicleId, status: "active" },
        );

        const match = rows[0];
        if (match) {
          return {
            has_active: true,
            appointment_id: match.id,
            customer_name: match.customer_name ?? null,
            scheduled_time: match.scheduled_time ?? null,
            services: match.service_names ?? null,
          };
        }

        return {
          has_active: false,
          appointment_id: null,
          customer_name: null,
          scheduled_time: null,
          services: null,
        };
      } catch {
        return {
          has_active: false,
          appointment_id: null,
          customer_name: null,
          scheduled_time: null,
          services: null,
        };
      }
    },
    enabled: vehicleId != null && vehicleId > 0,
    staleTime: 0,
    retry: 0,
  });
}

export const useCheckActiveAppointment = useVehicleActiveAppointment;

// POST /technician/jobs/walk-in — contract shape from
// `wellness-ai-and-walk-in-contract.md` § 2. Either `customer_id` OR
// `new_customer` is sent; the server enforces the XOR. Server always stamps
// `creation_source: 'WALK_IN'` and pulls `tech_id` from the JWT, so the
// client never sends those fields.
export function useWalkInBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: WalkInBookingRequest) => {
      console.log("[job-flow] walk-in book request", data);
      const result = await api<WalkInBookingResponse>(
        "post",
        Endpoints.jobs.walkIn,
        {
          vehicle_id: data.vehicle_id,
          customer_id: data.customer_id,
          new_customer: data.new_customer,
          service_ids: data.service_ids,
          notes: data.notes,
        },
      );
      console.log("[job-flow] walk-in book response", result);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["routes"] });
      queryClient.invalidateQueries({
        queryKey: ["vehicle-active-appointment"],
      });
    },
  });
}

// Legacy quick-register hook — preserved so callers that need to create a
// customer outside the walk-in flow keep working. The walk-in card itself now
// sends `new_customer` inline on the same request and does NOT call this.
export function useQuickRegisterCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: QuickRegisterCustomer) =>
      api<{ id: number; full_name: string }>(
        "post",
        Endpoints.customers.quickAdd,
        {
          full_name: data.full_name,
          phone: data.phone,
          email: data.email,
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}
