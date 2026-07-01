import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { franchiseApi } from "@technician/api/client";
import { FranchiseEndpoints } from "@technician/api/endpoints";
import type {
  FleetCompany,
  FleetVehicle,
  FleetDashboard,
  FleetDueSoonEntry,
  FleetBillingConfig,
  FleetHealthDashboard,
  FleetDeferredSummary,
  FleetOutreachTarget,
  FleetBookingInput,
  Appointment,
} from "@technician/types/api";

export function useFleetCompanies(franchiseId?: number) {
  return useQuery({
    queryKey: ["fleet", "companies", franchiseId],
    queryFn: () =>
      franchiseApi<FleetCompany[]>(
        "get",
        FranchiseEndpoints.fleet.companies,
        franchiseId ? { franchiseId } : undefined
      ),
    staleTime: 60_000,
  });
}

export interface FleetAnalyticsRollup {
  dashboards: FleetDashboard[];
  healths: FleetHealthDashboard[];
  allDeferred: FleetDeferredSummary[];
}

/**
 * 2026-05-25 — single batched fetch for the FleetAnalyticsScreen.
 * Replaces the previous `useAggregatedFleetData` pattern that
 * issued 3×N per-company queries (`useFleetDashboard` +
 * `useFleetHealthDashboard` + `useFleetDeferredSummary` for each of
 * 161 fleets = 483 round-trips). Companion to REMIBackend's new
 * `GET /franchise/fleet/companies/analytics-rollup` endpoint.
 */
export function useFleetAnalyticsRollup() {
  return useQuery({
    queryKey: ["fleet", "analytics-rollup"],
    queryFn: () =>
      franchiseApi<FleetAnalyticsRollup>(
        "get",
        FranchiseEndpoints.fleet.companiesAnalyticsRollup
      ),
    staleTime: 60_000,
  });
}

export function useFleetCompanyDetail(id: number) {
  return useQuery({
    queryKey: ["fleet", "company", id],
    queryFn: () =>
      franchiseApi<FleetCompany>(
        "get",
        FranchiseEndpoints.fleet.companyDetail(id)
      ),
    enabled: id > 0,
  });
}

export function useFleetCompanyVehicles(companyId: number) {
  return useQuery({
    queryKey: ["fleet", "vehicles", companyId],
    queryFn: () =>
      franchiseApi<FleetVehicle[]>(
        "get",
        FranchiseEndpoints.fleet.companyVehicles(companyId)
      ),
    enabled: companyId > 0,
    staleTime: 60_000,
  });
}

export function useFleetDashboard(companyId: number) {
  return useQuery({
    queryKey: ["fleet", "dashboard", companyId],
    queryFn: () =>
      franchiseApi<FleetDashboard>(
        "get",
        FranchiseEndpoints.fleet.companyDashboard(companyId)
      ),
    enabled: companyId > 0,
    staleTime: 30_000,
  });
}

export function useFleetDueSoon(
  companyId: number,
  params?: { intervalDays?: number; graceDays?: number }
) {
  return useQuery({
    queryKey: ["fleet", "due-soon", companyId, params],
    queryFn: () =>
      franchiseApi<FleetDueSoonEntry[]>(
        "get",
        FranchiseEndpoints.fleet.companyDueSoon(companyId),
        params
      ),
    enabled: companyId > 0,
    staleTime: 30_000,
  });
}

export function useFleetBilling(companyId: number) {
  return useQuery({
    queryKey: ["fleet", "billing", companyId],
    queryFn: () =>
      franchiseApi<FleetBillingConfig>(
        "get",
        FranchiseEndpoints.fleet.companyBilling(companyId)
      ),
    enabled: companyId > 0,
    staleTime: 60_000,
  });
}

export function useFleetHealthDashboard(companyId: number) {
  return useQuery({
    queryKey: ["fleet", "health", companyId],
    queryFn: () =>
      franchiseApi<FleetHealthDashboard>(
        "get",
        FranchiseEndpoints.fleet.companyHealth(companyId)
      ),
    enabled: companyId > 0,
    staleTime: 30_000,
  });
}

export function useFleetDeferredSummary(companyId: number) {
  return useQuery({
    queryKey: ["fleet", "deferred-summary", companyId],
    queryFn: () =>
      franchiseApi<FleetDeferredSummary[]>(
        "get",
        FranchiseEndpoints.fleet.companyDeferredSummary(companyId)
      ),
    enabled: companyId > 0,
    staleTime: 30_000,
  });
}

export function useFleetOutreachTargets(companyId: number) {
  return useQuery({
    queryKey: ["fleet", "outreach-targets", companyId],
    queryFn: () =>
      franchiseApi<FleetOutreachTarget[]>(
        "get",
        FranchiseEndpoints.fleet.companyOutreachTargets(companyId)
      ),
    enabled: companyId > 0,
    staleTime: 30_000,
  });
}

// --- Mutations ---

export function useCreateFleetBooking(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FleetBookingInput) =>
      franchiseApi<Appointment>(
        "post",
        FranchiseEndpoints.fleet.createBooking(companyId),
        input
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet"] });
      qc.invalidateQueries({ queryKey: ["fleet-orders", companyId] });
    },
  });
}

export function useAssignFleetVehicle(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { vehicle_id: number }) =>
      franchiseApi<FleetVehicle>(
        "post",
        FranchiseEndpoints.fleet.assignVehicle(companyId),
        data
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet", "vehicles", companyId] });
      qc.invalidateQueries({ queryKey: ["fleet", "dashboard", companyId] });
    },
  });
}

export function useSendFleetNudge(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      vehicleIds: number[];
      channel: "sms" | "email" | "call_list";
      template: string;
      targetType: "coordinator" | "drivers" | "region";
    }) =>
      franchiseApi<{ sent: number }>(
        "post",
        FranchiseEndpoints.fleet.nudge(companyId),
        data
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet", "due-soon", companyId] });
    },
  });
}

export function useAssignFleetDriver(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      vehicleId,
      driverUserId,
    }: {
      vehicleId: number;
      driverUserId: number;
    }) =>
      franchiseApi<FleetVehicle>(
        "put",
        FranchiseEndpoints.fleet.vehicleDriver(companyId, vehicleId),
        { driver_user_id: driverUserId }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet", "vehicles", companyId] });
    },
  });
}
