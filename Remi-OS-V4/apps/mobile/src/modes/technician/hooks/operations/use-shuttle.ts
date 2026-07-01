import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { franchiseApi } from "@technician/api/client";
import { FranchiseEndpoints } from "@technician/api/endpoints";
import type {
  ShuttleOrder,
  ShuttleStatusLogEntry,
  ShuttleDashboard,
  CreateShuttleOrderInput,
} from "@technician/types/api";
import type { ShopServiceStatus } from "@technician/types/enums";

export function useShuttleOrders(params?: {
  status?: string;
  fleetCompanyId?: number;
  priority?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["shuttle", "orders", params],
    queryFn: () =>
      franchiseApi<ShuttleOrder[]>(
        "get",
        FranchiseEndpoints.shuttle.listOrders,
        params
      ),
    staleTime: 30_000,
  });
}

export function useShuttleOrder(id: number) {
  return useQuery({
    queryKey: ["shuttle", "order", id],
    queryFn: () =>
      franchiseApi<ShuttleOrder>(
        "get",
        FranchiseEndpoints.shuttle.orderDetail(id)
      ),
    enabled: id > 0,
    staleTime: 15_000,
  });
}

export function useShuttleStatusLog(orderId: number) {
  return useQuery({
    queryKey: ["shuttle", "status-log", orderId],
    queryFn: () =>
      franchiseApi<ShuttleStatusLogEntry[]>(
        "get",
        FranchiseEndpoints.shuttle.statusLog(orderId)
      ),
    enabled: orderId > 0,
    staleTime: 15_000,
  });
}

export function useShuttleDashboard() {
  return useQuery({
    queryKey: ["shuttle", "dashboard"],
    queryFn: () =>
      franchiseApi<ShuttleDashboard>(
        "get",
        FranchiseEndpoints.shuttle.dashboard
      ),
    staleTime: 30_000,
  });
}

export function useShuttleCompanyOrders(
  companyId: number,
  params?: { status?: string; page?: number; limit?: number }
) {
  return useQuery({
    queryKey: ["shuttle", "company-orders", companyId, params],
    queryFn: () =>
      franchiseApi<ShuttleOrder[]>(
        "get",
        FranchiseEndpoints.shuttle.companyOrders(companyId),
        params
      ),
    enabled: companyId > 0,
    staleTime: 30_000,
  });
}

function useInvalidateShuttle() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["shuttle", "orders"] });
    qc.invalidateQueries({ queryKey: ["shuttle", "dashboard"] });
    qc.invalidateQueries({ queryKey: ["shuttle", "company-orders"] });
  };
}

export function useCreateShuttleOrder() {
  const invalidate = useInvalidateShuttle();
  return useMutation({
    mutationFn: (input: CreateShuttleOrderInput) =>
      franchiseApi<ShuttleOrder>(
        "post",
        FranchiseEndpoints.shuttle.createOrder,
        input
      ),
    onSuccess: invalidate,
  });
}

export function useAssignShuttleDriver() {
  const invalidate = useInvalidateShuttle();
  return useMutation({
    mutationFn: ({ id, driverUserId }: { id: number; driverUserId: number }) =>
      franchiseApi<ShuttleOrder>(
        "put",
        FranchiseEndpoints.shuttle.assignDriver(id),
        { driverUserId }
      ),
    onSuccess: invalidate,
  });
}

export function useShuttlePickup() {
  const invalidate = useInvalidateShuttle();
  return useMutation({
    mutationFn: ({
      id,
      lat,
      lng,
    }: {
      id: number;
      lat?: number;
      lng?: number;
    }) =>
      franchiseApi<ShuttleOrder>(
        "put",
        FranchiseEndpoints.shuttle.pickup(id),
        { lat, lng }
      ),
    onSuccess: invalidate,
  });
}

export function useShuttleDeliver() {
  const invalidate = useInvalidateShuttle();
  return useMutation({
    mutationFn: ({
      id,
      lat,
      lng,
    }: {
      id: number;
      lat?: number;
      lng?: number;
    }) =>
      franchiseApi<ShuttleOrder>(
        "put",
        FranchiseEndpoints.shuttle.deliver(id),
        { lat, lng }
      ),
    onSuccess: invalidate,
  });
}

export function useUpdateShopStatus() {
  const invalidate = useInvalidateShuttle();
  return useMutation({
    mutationFn: ({
      id,
      shopStatus,
      notes,
    }: {
      id: number;
      shopStatus: ShopServiceStatus;
      notes?: string;
    }) =>
      franchiseApi<ShuttleOrder>(
        "put",
        FranchiseEndpoints.shuttle.shopStatus(id),
        { shopStatus, notes }
      ),
    onSuccess: invalidate,
  });
}

export function useShopComplete() {
  const invalidate = useInvalidateShuttle();
  return useMutation({
    mutationFn: ({
      id,
      actualCost,
      notes,
    }: {
      id: number;
      actualCost?: number;
      notes?: string;
    }) =>
      franchiseApi<ShuttleOrder>(
        "put",
        FranchiseEndpoints.shuttle.shopComplete(id),
        { actualCost, notes }
      ),
    onSuccess: invalidate,
  });
}

export function useShuttleReturnPickup() {
  const invalidate = useInvalidateShuttle();
  return useMutation({
    mutationFn: ({
      id,
      lat,
      lng,
    }: {
      id: number;
      lat?: number;
      lng?: number;
    }) =>
      franchiseApi<ShuttleOrder>(
        "put",
        FranchiseEndpoints.shuttle.returnPickup(id),
        { lat, lng }
      ),
    onSuccess: invalidate,
  });
}

export function useShuttleComplete() {
  const invalidate = useInvalidateShuttle();
  return useMutation({
    mutationFn: ({
      id,
      lat,
      lng,
    }: {
      id: number;
      lat?: number;
      lng?: number;
    }) =>
      franchiseApi<ShuttleOrder>(
        "put",
        FranchiseEndpoints.shuttle.complete(id),
        { lat, lng }
      ),
    onSuccess: invalidate,
  });
}

export function useCancelShuttleOrder() {
  const invalidate = useInvalidateShuttle();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      franchiseApi<ShuttleOrder>(
        "put",
        FranchiseEndpoints.shuttle.cancel(id),
        { reason }
      ),
    onSuccess: invalidate,
  });
}
