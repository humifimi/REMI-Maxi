import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
// @demo-start
import { useDemoVehicleStore } from '@/src/stores/customer/demo-vehicles';
// @demo-end
import type {
  ApiResponse,
  Vehicle,
  AddVehicleRequest,
  UpdateVehicleRequest,
  DecodePlateResult,
} from '@customer/types/api';

export function useVehicles() {
  // @demo-start
  const demoVehicles = useDemoVehicleStore((s) => s.vehicles);
  // @demo-end

  const query = useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<Vehicle[]>>(ENDPOINTS.VEHICLES.LIST);
      return data.data;
    },
    staleTime: 60_000,
    retry: 1,
  });

  // @demo-start — merge demo-only vehicles into the API list. We intentionally
  // do NOT filter by trackedIds here: those IDs are used solely to clean up
  // backend rows on a demo reset. Filtering them out of the garage broke the
  // add-vehicle flow (every newly-added real vehicle disappeared).
  const merged = useMemo(() => {
    const real = query.data ?? [];
    if (demoVehicles.length === 0) return real;
    const realIds = new Set(real.map((v) => v.id));
    const extras = demoVehicles.filter((d) => !realIds.has(d.id));
    return [...real, ...extras];
  }, [query.data, demoVehicles]);
  // @demo-end

  return { ...query, data: merged };
}

export function useAddVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: AddVehicleRequest) => {
      const { data } = await apiClient.post<ApiResponse<Vehicle>>(ENDPOINTS.VEHICLES.ADD, body);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });
}

/**
 * Plate-to-VIN decode via `GET /customer/vehicles/decode-plate` (CARFAX
 * QuickVIN proxy). Used by the Add Vehicle flow to pre-fill year, make,
 * model, and VIN before the user hits "Add Vehicle". Backend returns 502
 * with a friendly "enter manually" message when QuickVIN is unreachable
 * — caller should treat error as soft-fail (skip prefill, continue with
 * plate+state only).
 */
export function useDecodePlate() {
  return useMutation({
    mutationFn: async ({
      plate,
      state,
    }: {
      plate: string;
      state: string;
    }) => {
      const normalizedPlate = plate.trim().toUpperCase();
      const normalizedState = state.trim().toUpperCase();
      try {
        const { data } = await apiClient.get<ApiResponse<DecodePlateResult>>(
          ENDPOINTS.VEHICLES.DECODE_PLATE,
          {
            params: { plate: normalizedPlate, state: normalizedState },
          }
        );
        return data.data;
      } catch (err) {
        // Temporary diagnostic — remove once plate decode is stable.
        if (isAxiosError(err)) {
          console.error('[customer-decode-plate error]', {
            plate: normalizedPlate,
            state: normalizedState,
            status: err.response?.status,
            statusText: err.response?.statusText,
            responseData: err.response?.data,
            code: err.code,
            message: err.message,
            url: err.config?.url,
            baseURL: err.config?.baseURL,
          });
        } else {
          console.error('[customer-decode-plate error] non-axios', {
            plate: normalizedPlate,
            state: normalizedState,
            err,
          });
        }
        throw err;
      }
    },
  });
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: UpdateVehicleRequest }) => {
      const { data } = await apiClient.patch<ApiResponse<Vehicle>>(
        ENDPOINTS.VEHICLES.UPDATE(id),
        body
      );
      return data.data;
    },
    onSuccess: (updated) => {
      // Merge into cache only — do not invalidate `['vehicles']` here. A refetch often
      // returns list items without `nickname` if the backend omits it on GET /vehicles,
      // which would wipe the nickname the user just saved (blink / "doesn't save").
      queryClient.setQueryData<Vehicle[]>(['vehicles'], (old) => {
        if (!old?.length) return old;
        return old.map((v) => (v.id === updated.id ? { ...v, ...updated } : v));
      });
    },
  });
}
