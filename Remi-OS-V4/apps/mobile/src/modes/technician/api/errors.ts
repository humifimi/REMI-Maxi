import type { AxiosError } from "axios";
import type { ApiResponse } from "@technician/types/api";

/** PDF/CSV export hooks use `responseType: "arraybuffer"`; axios leaves
 *  JSON error bodies as ArrayBuffer instead of parsing the envelope. */
export function decodeAxiosResponseData<T>(data: unknown): T | undefined {
  if (data instanceof ArrayBuffer) {
    try {
      const text = new TextDecoder("utf-8").decode(data);
      return JSON.parse(text) as T;
    } catch {
      return undefined;
    }
  }
  return data as T | undefined;
}

export function extractErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "response" in err) {
    const axErr = err as AxiosError<ApiResponse<null>>;
    const envelope = decodeAxiosResponseData<ApiResponse<null>>(
      axErr.response?.data,
    );
    const serverMsg = envelope?.message;
    if (serverMsg) return serverMsg;
    if (axErr.response?.status) return `Server returned ${axErr.response.status}`;
  }
  if (err instanceof Error) return err.message;
  return "An unexpected error occurred.";
}
