import { useMutation } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import * as ImageManipulator from "expo-image-manipulator";
import { apiClient } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";

export interface ScanVehicleResult {
  text: string;
  confidence: number;
  raw_candidates: string[];
  detected_state?: string | null;
}

export function useScanVehicle() {
  return useMutation({
    mutationFn: async (data: {
      imageUri: string;
      type: "plate" | "vin";
    }) => {
      // Resize image to reduce file size. PlateRecognizer rejects files > ~2.5MB.
      // Max width 1920px keeps enough detail for OCR while staying under the limit.
      const manipulated = await ImageManipulator.manipulateAsync(
        data.imageUri,
        [{ resize: { width: 1920 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      const formData = new FormData();
      formData.append("image", {
        uri: manipulated.uri,
        type: "image/jpeg",
        name: "scan.jpg",
      } as unknown as Blob);
      formData.append("type", data.type);

      try {
        const response = await apiClient.post<{
          error: boolean;
          message: string;
          data: ScanVehicleResult;
        }>(Endpoints.jobs.scanVehicle, formData, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 30000,
        });

        return response.data.data;
      } catch (err) {
        // Field-debug instrumentation: dump the full axios failure shape so
        // we can tell a 404 from a 5xx from a multer file-too-large rejection
        // in Metro. The on-device alert ("Couldn't process the photo") is too
        // generic for live debugging. Tagged `[scan-vehicle error]` to stand
        // out in the feed; safe to leave on while we stabilize the field flow.
        if (err && typeof err === "object" && "isAxiosError" in err) {
          const axErr = err as AxiosError<{
            error: boolean;
            message: string;
          }>;
          console.error("[scan-vehicle error]", {
            status: axErr.response?.status,
            statusText: axErr.response?.statusText,
            url: axErr.config?.url,
            baseURL: axErr.config?.baseURL,
            method: axErr.config?.method,
            response_data: axErr.response?.data,
            message: axErr.message,
            code: axErr.code,
          });
        } else {
          console.error("[scan-vehicle error] (non-axios)", err);
        }
        throw err;
      }
    },
  });
}
