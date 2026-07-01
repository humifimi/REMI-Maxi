/**
 * Phase 4 Chunk 4.5 — pure-function summarizer for the receipt-export
 * (Chunk 4.4) error envelope. Mirrors `summarizeBulkMarkPaid` in
 * `app/(tabs)/orders.tsx` — returns a `{ title, body }` shape ready for
 * `Alert.alert(title, body)`. Lives in `src/utils/` (not inline in
 * `orders.tsx`) because it benefits from isolated unit tests; same
 * placement convention as `src/utils/datetime.ts` and similar pure
 * helpers.
 *
 * The BE (Chunk 4.4 — REMIBackend PR #121, squash `99c39c5`) ships
 * four distinct error shapes for `POST /api/v1/technician/orders/
 * export-receipts`:
 *
 *   422 — input-shape validation (empty / >20 / non-positive-int)
 *   404 — `data.missing_ids: number[]`
 *   403 — `data.cross_franchise_ids: number[]`
 *   400 — `data.non_paid_ids: number[]`
 *
 * Anything else falls through to `extractErrorMessage` (the existing
 * helper that pulls `response.data.message`), preserving the same
 * default UX as the rest of the app.
 *
 * The function accepts `unknown` and narrows defensively so it works
 * against the raw `useMutation.onError` callback signature without
 * needing the caller to pre-cast to AxiosError.
 */

import type { AxiosError } from "axios";
import type {
  ApiResponse,
  ReceiptExportErrorPayload,
} from "@technician/types/api";
import { decodeAxiosResponseData, extractErrorMessage } from "@technician/api/errors";

/**
 * Cap displayed IDs at 5 to keep alert bodies readable; longer
 * selections collapse the tail to a single `…` so the user understands
 * there were more IDs without being asked to read all of them.
 */
const ID_DISPLAY_CAP = 5;

function formatIdList(ids: number[]): string {
  if (ids.length <= ID_DISPLAY_CAP) {
    return ids.map((id) => `#${id}`).join(", ");
  }
  const head = ids.slice(0, ID_DISPLAY_CAP).map((id) => `#${id}`);
  return `${head.join(", ")}, …`;
}

function isAxiosErrorLike(
  err: unknown,
): err is AxiosError<ApiResponse<ReceiptExportErrorPayload>> {
  return (
    err !== null &&
    typeof err === "object" &&
    "response" in err
  );
}

export function summarizeReceiptExportErrors(
  err: unknown,
): { title: string; body: string } {
  if (!isAxiosErrorLike(err)) {
    return { title: "Export Failed", body: extractErrorMessage(err) };
  }

  const envelope = decodeAxiosResponseData<
    ApiResponse<ReceiptExportErrorPayload>
  >(err.response?.data);
  const status = err.response?.status;
  const message = envelope?.message ?? "";
  const payload: ReceiptExportErrorPayload = envelope?.data ?? {};

  // 422 — input-shape validation. The BE message disambiguates between
  // empty-array and over-cap; preserve that signal in the user copy.
  if (status === 422) {
    if (/maximum of 20/i.test(message)) {
      return {
        title: "Export Failed",
        body:
          "You can export at most 20 receipts at a time. Trim your selection and try again.",
      };
    }
    if (/non-empty/i.test(message) || /must be a non-empty/i.test(message)) {
      return {
        title: "Export Failed",
        body:
          "No appointments selected. Pick at least one paid order and try again.",
      };
    }
    return {
      title: "Export Failed",
      body: message || extractErrorMessage(err),
    };
  }

  // 404 — missing IDs (deleted / never existed).
  if (status === 404 && payload.missing_ids && payload.missing_ids.length > 0) {
    const ids = payload.missing_ids;
    const n = ids.length;
    return {
      title: "Receipts Not Found",
      body: `${n} ${n === 1 ? "order is" : "orders are"} no longer available (${formatIdList(ids)}). Refresh and try again.`,
    };
  }

  // 403 — cross-franchise IDs.
  if (
    status === 403 &&
    payload.cross_franchise_ids &&
    payload.cross_franchise_ids.length > 0
  ) {
    const ids = payload.cross_franchise_ids;
    const n = ids.length;
    return {
      title: "Permission Denied",
      body: `${n} of the selected ${n === 1 ? "order belongs" : "orders belong"} to another franchise (${formatIdList(ids)}). Deselect ${n === 1 ? "it" : "them"} and try again.`,
    };
  }

  // 400 — non-paid IDs.
  if (
    status === 400 &&
    payload.non_paid_ids &&
    payload.non_paid_ids.length > 0
  ) {
    const ids = payload.non_paid_ids;
    const n = ids.length;
    return {
      title: "Mark Orders Paid First",
      body: `${n} of the selected ${n === 1 ? "order has" : "orders have"} not been paid yet (${formatIdList(ids)}). Receipts can only be generated for paid orders. Mark ${n === 1 ? "it" : "them"} paid first or deselect ${n === 1 ? "it" : "them"}.`,
    };
  }

  // Anything else (500, network, unmatched 4xx) — delegate.
  return { title: "Export Failed", body: extractErrorMessage(err) };
}
