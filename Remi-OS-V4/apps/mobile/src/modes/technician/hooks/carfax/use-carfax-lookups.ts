import { useMutation } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type {
  ApiResponse,
  QuickVinLookupResult,
  ServiceHistoryResult,
} from "@technician/types/api";

// Field-debug instrumentation: dump the full axios failure shape (status,
// payload, request URL) any time a CARFAX lookup throws. The native alerts
// only surface generic copy ("Lookup Failed"), which makes it impossible to
// tell a 404 from a 502 from a CARFAX validation error in Metro. Tagged
// `[carfax-lookup error]` so it stands out in the feed; safe to leave on
// while we stabilize the field flow.
function logCarfaxLookupError(scope: string, err: unknown): void {
  if (err && typeof err === "object" && "isAxiosError" in err) {
    const axErr = err as AxiosError<ApiResponse<null>>;
    console.error(`[carfax-lookup error] ${scope}`, {
      status: axErr.response?.status,
      statusText: axErr.response?.statusText,
      url: axErr.config?.url,
      baseURL: axErr.config?.baseURL,
      method: axErr.config?.method,
      params: axErr.config?.params,
      response_data: axErr.response?.data,
      message: axErr.message,
    });
    return;
  }
  console.error(`[carfax-lookup error] ${scope} (non-axios)`, err);
}

/**
 * Plate-to-VIN lookup via the backend's QuickVIN proxy.
 * State must be the 2-letter postal abbreviation (e.g. "TX").
 */
export function useQuickVinLookup() {
  return useMutation({
    mutationFn: async ({
      plate,
      state,
    }: {
      plate: string;
      state: string;
    }) => {
      try {
        return await api<QuickVinLookupResult>(
          "get",
          Endpoints.carfax.quickVin,
          {
            plate: plate.trim().toUpperCase(),
            state: state.trim().toUpperCase(),
          },
        );
      } catch (err) {
        logCarfaxLookupError("quickvin", err);
        throw err;
      }
    },
  });
}

/**
 * VIN-to-service-history lookup via the backend's Service History Check
 * proxy. VIN should be a full 17-character VIN.
 */
export function useServiceHistoryLookup() {
  return useMutation({
    mutationFn: async ({ vin }: { vin: string }) => {
      try {
        return await api<ServiceHistoryResult>(
          "get",
          Endpoints.carfax.serviceHistory,
          { vin: vin.trim().toUpperCase() },
        );
      } catch (err) {
        logCarfaxLookupError("service-history", err);
        throw err;
      }
    },
  });
}
