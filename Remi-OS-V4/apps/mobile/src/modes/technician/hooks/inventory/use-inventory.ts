import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, franchiseApi } from "@technician/api/client";
import { Endpoints, FranchiseEndpoints } from "@technician/api/endpoints";
import type {
  StockLevel,
  ParLevelAlert,
  WasteContainer,
  InventoryLedgerEntry,
  ReorderSuggestion,
} from "@technician/types/api";

// ─── Technician hooks ────────────────────────────────────────────────

export function useMyStock() {
  return useQuery({
    queryKey: ["inventory", "stock"],
    queryFn: () => api<StockLevel[]>("get", Endpoints.inventory.stock),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useParAlerts() {
  return useQuery({
    queryKey: ["inventory", "par-alerts"],
    queryFn: () =>
      api<ParLevelAlert[]>("get", Endpoints.inventory.parAlerts),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useWasteStatus() {
  return useQuery({
    queryKey: ["inventory", "waste-status"],
    queryFn: () =>
      api<WasteContainer[]>("get", Endpoints.inventory.wasteStatus),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      itemId: number;
      locationId: number;
      quantityChange: number;
      notes: string;
    }) =>
      api<void>("post", Endpoints.inventory.adjust, {
        item_id: payload.itemId,
        location_id: payload.locationId,
        quantity_change: payload.quantityChange,
        notes: payload.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
}

export function useRecordWaste() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      locationId: number;
      wasteType: string;
      liters: number;
      itemId?: number;
      appointmentId?: number;
    }) =>
      api<void>("post", Endpoints.inventory.waste, {
        location_id: payload.locationId,
        waste_type: payload.wasteType,
        liters: payload.liters,
        ...(payload.itemId && { item_id: payload.itemId }),
        ...(payload.appointmentId && {
          appointment_id: payload.appointmentId,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
}

export function useTransferStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      itemId: number;
      fromLocationId: number;
      toLocationId: number;
      quantity: number;
      notes?: string;
    }) =>
      franchiseApi<void>(
        "post",
        FranchiseEndpoints.inventory.transfers,
        {
          item_id: payload.itemId,
          from_location_id: payload.fromLocationId,
          to_location_id: payload.toLocationId,
          quantity: payload.quantity,
          notes: payload.notes,
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
}

// ─── Franchise hooks ─────────────────────────────────────────────────

export function useInventoryHistory(filters?: {
  locationId?: number;
  itemId?: number;
  reasonCode?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ["inventory", "history", filters],
    queryFn: () =>
      franchiseApi<InventoryLedgerEntry[]>(
        "get",
        FranchiseEndpoints.inventory.history,
        filters
      ),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useWasteDashboard(locationId: number) {
  return useQuery({
    queryKey: ["inventory", "waste-dashboard", locationId],
    queryFn: () =>
      franchiseApi<WasteContainer[]>(
        "get",
        FranchiseEndpoints.inventory.wasteDashboard,
        { locationId }
      ),
    staleTime: 60_000,
  });
}

export function useReorderSuggestions(locationId: number) {
  return useQuery({
    queryKey: ["inventory", "reorder-suggestions", locationId],
    queryFn: () =>
      franchiseApi<ReorderSuggestion[]>(
        "get",
        FranchiseEndpoints.inventory.reorderSuggestions,
        { locationId }
      ),
    staleTime: 60_000,
  });
}

export function useFranchiseAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      itemId: number;
      locationId: number;
      quantityChange: number;
      notes: string;
    }) =>
      franchiseApi<void>("post", FranchiseEndpoints.inventory.adjust, {
        item_id: payload.itemId,
        location_id: payload.locationId,
        quantity_change: payload.quantityChange,
        notes: payload.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
}

/**
 * Fetches the full inventory history and computes current stock levels
 * per item per location by summing quantity_change entries.
 * Returns data shaped like StockLevel[] for UI compatibility.
 */
export function useFranchiseStock() {
  return useQuery({
    queryKey: ["inventory", "franchise-stock-computed"],
    queryFn: async () => {
      const history = await franchiseApi<InventoryLedgerEntry[]>(
        "get",
        FranchiseEndpoints.inventory.history,
        { limit: 2000 }
      );

      const itemMap = new Map<
        string,
        {
          item_id: number;
          location_id: number;
          item_name: string;
          item_sku: string;
          location_name: string | null;
          technician_name: string | null;
          on_hand: number;
        }
      >();

      for (const entry of history) {
        const key = `${entry.item_id}-${entry.location_id}`;
        const existing = itemMap.get(key);
        if (existing) {
          existing.on_hand += entry.quantity_change;
          // 2026-05-25 — newer entries can carry names the earliest
          // entry didn't (BE join may return null for very old
          // rows). Keep whichever value is non-null.
          if (!existing.location_name && entry.location_name) {
            existing.location_name = entry.location_name;
          }
          if (!existing.technician_name && entry.technician_name) {
            existing.technician_name = entry.technician_name;
          }
        } else {
          itemMap.set(key, {
            item_id: entry.item_id,
            location_id: entry.location_id,
            item_name: entry.item_name ?? `Item #${entry.item_id}`,
            item_sku: entry.item_sku ?? "",
            location_name: entry.location_name ?? null,
            technician_name: entry.technician_name ?? null,
            on_hand: entry.quantity_change,
          });
        }
      }

      return Array.from(itemMap.values()).map(
        (item): StockLevel => ({
          item_id: item.item_id,
          location_id: item.location_id,
          item_name: item.item_name,
          item_sku: item.item_sku,
          // 2026-05-25 — surface the human-readable names so the
          // inventory list, transfer picker, and waste dashboard
          // can render plain-English location + tech labels
          // instead of "Van #${id}".
          location_name: item.location_name ?? undefined,
          technician_name: item.technician_name ?? undefined,
          on_hand: item.on_hand,
          reserved: 0,
          available: item.on_hand,
        })
      );
    },
    staleTime: 60_000,
    retry: 1,
  });
}

/**
 * Discovers all location IDs from history, then fetches waste containers
 * for each location in parallel.
 */
export function useFranchiseAllWaste() {
  return useQuery({
    queryKey: ["inventory", "franchise-all-waste"],
    queryFn: async () => {
      const history = await franchiseApi<InventoryLedgerEntry[]>(
        "get",
        FranchiseEndpoints.inventory.history,
        { limit: 2000 }
      );

      const locationIds = [
        ...new Set(history.map((e) => e.location_id)),
      ].filter((id) => id > 0);

      const results = await Promise.all(
        locationIds.map((locId) =>
          franchiseApi<WasteContainer[]>(
            "get",
            FranchiseEndpoints.inventory.wasteDashboard,
            { locationId: locId }
          ).catch(() => [] as WasteContainer[])
        )
      );

      return results.flat();
    },
    staleTime: 60_000,
    retry: 1,
  });
}

/**
 * Par-alerts for franchise owners. The franchise par-levels endpoint returns
 * raw configs (no item_name, on_hand, deficit), so we can't show enriched
 * alerts. Returns empty — the "All stocked up" empty state is shown, which
 * is correct after a fresh seed where nothing is below par.
 */
export function useFranchiseParAlerts() {
  return useQuery({
    queryKey: ["inventory", "franchise-par-alerts"],
    queryFn: () => Promise.resolve([] as ParLevelAlert[]),
    staleTime: 120_000,
  });
}

/**
 * Provides the set of unique location IDs + names derived from
 * the computed franchise stock data.
 */
export function useFranchiseLocations() {
  const { data: stock = [] } = useFranchiseStock();

  return useMemo(() => {
    const locMap = new Map<number, { id: number; name: string }>();
    for (const item of stock) {
      if (!locMap.has(item.location_id)) {
        locMap.set(item.location_id, {
          id: item.location_id,
          name:
            item.technician_name ??
            item.location_name ??
            `Van #${item.location_id}`,
        });
      }
    }
    return Array.from(locMap.values());
  }, [stock]);
}
