import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';

export interface ScanVehicleResult {
  text: string;
  confidence: number;
  raw_candidates: string[];
  detected_state?: string | null;
}

export function useScanVehicle() {
  return useMutation({
    mutationFn: async (data: { imageUri: string; type: 'plate' | 'vin' }) => {
      const formData = new FormData();
      formData.append('image', {
        uri: data.imageUri,
        type: 'image/jpeg',
        name: 'scan.jpg',
      } as unknown as Blob);
      formData.append('type', data.type);

      try {
        const response = await apiClient.post<{
          error: boolean;
          message: string;
          data: ScanVehicleResult;
        }>(ENDPOINTS.VEHICLES.SCAN, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 30_000,
        });

        return response.data.data;
      } catch (err) {
        // Temporary diagnostic — remove once scanner is stable. The customer
        // backend doesn't currently expose `/vehicles/scan`, so this path will
        // 404 until the endpoint is added or the scanner is wired to a
        // customer-safe alternative. See PR description for backend ticket.
        if (isAxiosError(err)) {
          console.error('[customer-scan-vehicle error]', {
            type: data.type,
            status: err.response?.status,
            statusText: err.response?.statusText,
            responseData: err.response?.data,
            code: err.code,
            message: err.message,
            url: err.config?.url,
            baseURL: err.config?.baseURL,
          });
        } else {
          console.error('[customer-scan-vehicle error] non-axios', {
            type: data.type,
            err,
          });
        }
        throw err;
      }
    },
  });
}
