import { useMutation } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';

export interface CarfaxExportInput {
  startDate: string;
  endDate: string;
  format?: 'pdf' | 'txt';
}

export interface CarfaxExportResult {
  empty: boolean;
  fileUri?: string;
  filename?: string;
}

function parseFilenameFromContentDisposition(header?: string | null): string | null {
  if (!header) return null;
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8Match) return decodeURIComponent(utf8Match[1].trim());
  const quoted = /filename="([^"]+)"/i.exec(header);
  if (quoted) return quoted[1];
  const bare = /filename=([^;]+)/i.exec(header);
  return bare ? bare[1].trim() : null;
}

function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof data === 'string') {
    const len = data.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) arr[i] = data.charCodeAt(i) & 0xff;
    return arr;
  }
  throw new Error('Unsupported binary response payload');
}

function utiForContentType(contentType: string): string {
  if (contentType.startsWith('application/pdf')) return 'com.adobe.pdf';
  if (contentType.startsWith('text/')) return 'public.plain-text';
  return 'public.data';
}

export function useCarfaxExport(vehicleId: number) {
  return useMutation<CarfaxExportResult, Error, CarfaxExportInput>({
    mutationFn: async ({ startDate, endDate, format = 'pdf' }) => {
      const response = await apiClient.get<ArrayBuffer>(
        ENDPOINTS.VEHICLES.CARFAX_EXPORT(vehicleId),
        {
          params: { start: startDate, end: endDate, format },
          responseType: 'arraybuffer',
          transformResponse: (data) => data,
          validateStatus: (status) => status >= 200 && status < 300,
        },
      );

      if (response.status === 204) {
        return { empty: true };
      }

      const contentType =
        (response.headers['content-type'] as string | undefined) ??
        (format === 'txt' ? 'text/plain' : 'application/pdf');

      const filenameFromHeader = parseFilenameFromContentDisposition(
        response.headers['content-disposition'] as string | undefined,
      );
      const filename =
        filenameFromHeader ?? `carfax-${vehicleId}-${startDate}_${endDate}.${format}`;

      const cacheDir = new Directory(Paths.cache, 'carfax');
      if (!cacheDir.exists) cacheDir.create({ idempotent: true });

      const file = new File(cacheDir, filename);
      if (file.exists) file.delete();
      file.create();
      file.write(toUint8Array(response.data));

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: contentType,
          dialogTitle: 'Service Records Export',
          UTI: utiForContentType(contentType),
        });
      } else {
        Alert.alert('File Saved', `Saved to ${file.uri}`);
      }

      return { empty: false, fileUri: file.uri, filename };
    },
  });
}
