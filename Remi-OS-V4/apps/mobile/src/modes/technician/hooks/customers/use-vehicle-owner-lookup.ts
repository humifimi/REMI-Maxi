import { useQuery } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import { useAuthStore } from "@/src/stores/auth";
import type {
  CustomerDetailResponse,
  User,
  Vehicle,
} from "@technician/types/api";

type VehicleWithOwner = Vehicle & {
  owner_name?: string;
  owner_phone?: string;
  owner_email?: string;
};

function detailCustomerToUser(
  customer: CustomerDetailResponse["customer"],
): User {
  return {
    id: customer.id,
    full_name: customer.full_name,
    email: customer.email,
    phone: customer.phone,
    role: "customer",
    status: "active",
    profile_image_url: customer.profile_image_url,
    created_at: customer.created_at,
    updated_at: customer.created_at,
  };
}

async function resolveVerifiedCustomer(
  userId: number,
): Promise<User | null> {
  if (userId <= 0) return null;
  try {
    const detail = await api<CustomerDetailResponse>(
      "get",
      Endpoints.customers.detail(userId),
    );
    if (detail?.customer) {
      return detailCustomerToUser(detail.customer);
    }
  } catch {
    // user_id may be a tech placeholder or non-customer row
  }
  return null;
}

/**
 * Resolves the customer who owns the vehicle from confirm-vehicle — only
 * returns users verified as `role: customer` via `/customers/:id`. Skips the
 * logged-in technician's id (used as a placeholder on brand-new walk-in vehicles).
 */
export function useVehicleOwnerLookup(vehicle: Vehicle | null) {
  const authUserId = useAuthStore((s) => s.user?.userId ?? null);

  return useQuery({
    queryKey: [
      "vehicle-owner-lookup",
      vehicle?.id,
      vehicle?.user_id,
      vehicle?.vin,
      vehicle?.license_plate,
      vehicle?.license_plate_state,
      authUserId,
    ],
    queryFn: async (): Promise<User | null> => {
      if (!vehicle) return null;

      const candidateIds: number[] = [];

      const addCandidate = (userId: number | null | undefined) => {
        if (!userId || userId <= 0) return;
        if (authUserId != null && userId === authUserId) return;
        if (!candidateIds.includes(userId)) {
          candidateIds.push(userId);
        }
      };

      addCandidate(vehicle.user_id);

      const searchParams: Record<string, string> = {};
      if (vehicle.vin?.trim()) {
        searchParams.vin = vehicle.vin.trim();
      } else if (
        vehicle.license_plate?.trim() &&
        vehicle.license_plate_state?.trim()
      ) {
        searchParams.plate = vehicle.license_plate.trim();
        searchParams.plate_state = vehicle.license_plate_state
          .trim()
          .toUpperCase();
      }

      if (Object.keys(searchParams).length > 0) {
        const rows = await api<VehicleWithOwner[]>(
          "get",
          Endpoints.vehicles.search,
          searchParams,
        );

        const match =
          rows.find((row) => row.id === vehicle.id) ??
          rows.find((row) => row.user_id > 0) ??
          null;

        addCandidate(match?.user_id);
      }

      for (const userId of candidateIds) {
        const customer = await resolveVerifiedCustomer(userId);
        if (customer) return customer;
      }

      return null;
    },
    enabled: vehicle != null,
    staleTime: 0,
    retry: 0,
  });
}
