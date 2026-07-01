import { useQuery } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { User, Vehicle } from "@technician/types/api";

export interface UnifiedSearchCustomer {
  id: number;
  full_name: string;
  phone: string | null;
  email: string | null;
  profile_image_url: string | null;
}

export interface UnifiedSearchResult {
  customer: UnifiedSearchCustomer;
  vehicles: Vehicle[];
  matchSource: "customer" | "vehicle" | "both";
}

type VehicleWithOwner = Vehicle & {
  owner_name?: string;
  owner_phone?: string;
  owner_email?: string;
};

export function useUnifiedSearch(query: string) {
  return useQuery({
    queryKey: ["unified-search", query],
    queryFn: async (): Promise<UnifiedSearchResult[]> => {
      const [customerResult, vehicleResult] = await Promise.allSettled([
        api<User[]>("get", Endpoints.customers.search, { q: query }),
        api<VehicleWithOwner[]>("get", Endpoints.vehicles.search, { q: query }),
      ]);

      const customers =
        customerResult.status === "fulfilled" ? customerResult.value : [];

      const vehicleResults: VehicleWithOwner[] =
        vehicleResult.status === "fulfilled" ? vehicleResult.value : [];

      const resultMap = new Map<number, UnifiedSearchResult>();

      for (const c of customers) {
        resultMap.set(c.id, {
          customer: {
            id: c.id,
            full_name: c.full_name,
            phone: c.phone,
            email: c.email,
            profile_image_url: c.profile_image_url,
          },
          vehicles: [],
          matchSource: "customer",
        });
      }

      for (const v of vehicleResults) {
        const existing = resultMap.get(v.user_id);
        if (existing) {
          existing.vehicles.push(v);
          if (existing.matchSource === "customer") {
            existing.matchSource = "both";
          }
        } else {
          resultMap.set(v.user_id, {
            customer: {
              id: v.user_id,
              full_name: v.owner_name ?? `Customer #${v.user_id}`,
              phone: v.owner_phone ?? null,
              email: v.owner_email ?? null,
              profile_image_url: null,
            },
            vehicles: [v],
            matchSource: "vehicle",
          });
        }
      }

      return Array.from(resultMap.values());
    },
    enabled: query.length >= 2,
    staleTime: 0,
  });
}
