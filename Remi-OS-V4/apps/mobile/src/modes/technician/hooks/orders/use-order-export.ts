import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@technician/api/client";
import { Endpoints, FranchiseEndpoints } from "@technician/api/endpoints";
import { useAuthStore } from "@/src/stores/auth";
import { UserRole } from "@technician/types/enums";
// Expo SDK 54 moved the file/directory primitives to a new `File`/`Directory`
// class API on the package root. The classic procedural surface (cacheDirectory,
// writeAsStringAsync, EncodingType) is still shipped, but only via the
// `/legacy` subpath — the top-level re-exports were turned into
// undefined-at-runtime stubs that fire a deprecation warning. Importing from
// `/legacy` is the migration path the deprecation warning itself points at,
// and is the supported way to keep the existing call sites alive until we
// rewrite them onto the new class API in a follow-up.
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Alert } from "react-native";

function getRoleApi() {
  const user = useAuthStore.getState().user;
  return user?.role === UserRole.FRANCHISE_OWNER;
}

export function useExportCsv() {
  return useMutation({
    mutationFn: async (appointmentIds: number[]) => {
      const isFranchise = getRoleApi();
      const { accessToken } = useAuthStore.getState();
      const endpoint = isFranchise
        ? FranchiseEndpoints.exportCsv
        : Endpoints.orders.exportCsv;
      const baseURL = isFranchise
        ? apiClient.defaults.baseURL?.replace(
            "/api/v1/technician",
            "/api/v1/franchise"
          )
        : apiClient.defaults.baseURL;

      // The export endpoints return raw `text/csv` bodies (no `{ error,
      // message, data }` envelope), so we cannot route them through the
      // shared `api()` helper — it unconditionally unwraps
      // `response.data.data`, which is `undefined` for a string body and
      // would silently produce `writeAsStringAsync(path, undefined)`.
      const response = await apiClient.post(endpoint, { appointmentIds }, {
        baseURL,
        responseType: "text",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      return response.data as string;
    },
    onSuccess: async (csv) => {
      try {
        const path = `${FileSystem.cacheDirectory}orders-export.csv`;
        await FileSystem.writeAsStringAsync(path, csv);
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(path, {
            mimeType: "text/csv",
            dialogTitle: "Export Orders CSV",
          });
        } else {
          Alert.alert("Exported", "CSV saved to cache.");
        }
      } catch (err) {
        console.error("[useExportCsv] failed to save/share CSV", err);
        Alert.alert("Export Error", "Could not save CSV file.");
      }
    },
  });
}

/**
 * Phase 6 Chunk 6.1.1 (promptless follow-up to Chunk 6.1) — `useExportPdf`
 * is now Droptop-parity for both roles. The BE controllers behind both
 * the technician's and franchise's `/orders/export-pdf` endpoints
 * delegate to `receiptService.generateBatchReceiptPdf` (the same code
 * path Chunk 4.4's `/orders/export-receipts` uses + Chunk 6.1 enriched).
 * Hook surface stays unchanged — just the filename pattern updates to
 * `receipts-YYYY-MM-DD.pdf` (matching the BE's Content-Disposition) and
 * the share dialog title. The redundant `useExportReceipts` hook is
 * preserved as a thin alias below for any legacy caller; new call sites
 * should use `useExportPdf` directly.
 */
export function useExportPdf() {
  return useMutation({
    mutationFn: async (appointmentIds: number[]) => {
      const isFranchise = getRoleApi();
      const { accessToken } = useAuthStore.getState();
      const endpoint = isFranchise
        ? FranchiseEndpoints.exportPdf
        : Endpoints.orders.exportPdf;
      const baseURL = isFranchise
        ? apiClient.defaults.baseURL?.replace(
            "/api/v1/technician",
            "/api/v1/franchise"
          )
        : apiClient.defaults.baseURL;

      const response = await apiClient.post(endpoint, { appointmentIds }, {
        baseURL,
        responseType: "arraybuffer",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      return response.data as ArrayBuffer;
    },
    onSuccess: async (buffer) => {
      try {
        const dateStr = new Date().toISOString().split("T")[0];
        const path = `${FileSystem.cacheDirectory}receipts-${dateStr}.pdf`;
        const base64 = btoa(
          String.fromCharCode(...new Uint8Array(buffer))
        );
        await FileSystem.writeAsStringAsync(path, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(path, {
            mimeType: "application/pdf",
            dialogTitle: "Share Receipts PDF",
          });
        }
      } catch (err) {
        console.error("[useExportPdf] failed to save/share PDF", err);
        Alert.alert("Export Error", "Could not save PDF file.");
      }
    },
  });
}

/**
 * Phase 4 Chunk 4.5 — combined receipt batch export hook.
 *
 * Near-clone of `useExportPdf` (above), targeting the new Chunk 4.4 BE
 * endpoint `POST /api/v1/technician/orders/export-receipts` that returns
 * one combined multi-page PDF Buffer (one Droptop-style receipt per
 * `<Page>`, in input `appointmentIds` order). Differences from
 * `useExportPdf`:
 *
 *   - Endpoint constant: `Endpoints.orders.exportReceipts` (no
 *     franchise mirror; the BE deliberately doesn't register the
 *     franchise route — the FE button in `orders.tsx` is gated to
 *     `UserRole.TECHNICIAN`, so a franchise-owner caller throws here
 *     as a defensive guard).
 *   - Filename pattern: `receipts-YYYY-MM-DD.pdf` (matches the BE's
 *     `Content-Disposition` header).
 *   - `dialogTitle`: "Share Receipts PDF".
 *   - No `onSuccess` Alert — the share sheet IS the success UX.
 *   - No `Alert.alert(extractErrorMessage(e))` in `onError` — the
 *     caller in `orders.tsx` wires `summarizeReceiptExportErrors(e)`
 *     to consume the structured `data.{missing_ids|cross_franchise_ids|
 *     non_paid_ids}` payloads from Chunk 4.4's BE. The catch-block
 *     "Could not save PDF file" Alert covers catastrophic filesystem/
 *     share failures (distinct from BE-rejection path); matches
 *     `useExportPdf` semantics.
 */
export function useExportReceipts() {
  return useMutation({
    mutationFn: async (appointmentIds: number[]) => {
      // Defensive guard — Chunk 4.4's BE route is technician-scoped
      // only. The FE button in `orders.tsx` already hides itself for
      // FO callers, but reject loudly if anything bypasses that gate.
      if (getRoleApi()) {
        throw new Error("Receipt batch export is technician-only for MVP");
      }

      const { accessToken } = useAuthStore.getState();
      const response = await apiClient.post(
        Endpoints.orders.exportReceipts,
        { appointmentIds },
        {
          responseType: "arraybuffer",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      return response.data as ArrayBuffer;
    },
    onSuccess: async (buffer) => {
      try {
        const dateStr = new Date().toISOString().split("T")[0];
        const path = `${FileSystem.cacheDirectory}receipts-${dateStr}.pdf`;
        const base64 = btoa(
          String.fromCharCode(...new Uint8Array(buffer))
        );
        await FileSystem.writeAsStringAsync(path, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(path, {
            mimeType: "application/pdf",
            dialogTitle: "Share Receipts PDF",
          });
        }
      } catch (err) {
        console.error(
          "[useExportReceipts] failed to save/share PDF",
          err,
        );
        Alert.alert("Export Error", "Could not save PDF file.");
      }
    },
  });
}
