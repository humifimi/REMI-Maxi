/**
 * Phase 4 Chunk 4.5 — tests for `summarizeReceiptExportErrors`.
 *
 * Exercises every BE error shape from Chunk 4.4
 * (REMIBackend PR #121, squash `99c39c5`):
 *   - 422 (input validation: empty / over-cap / non-positive-int)
 *   - 404 with `missing_ids`
 *   - 403 with `cross_franchise_ids`
 *   - 400 with `non_paid_ids`
 *   - 500 / unknown (fall-through to `extractErrorMessage`)
 *   - Non-AxiosError inputs (graceful narrowing)
 *
 * Pure-function tests — no React, no hooks, no async.
 */

import { summarizeReceiptExportErrors } from "../summarize-receipt-export-errors";

function makeAxiosError(
  status: number,
  message: string,
  data?: Record<string, unknown>,
) {
  return {
    isAxiosError: true,
    response: {
      status,
      data: {
        error: true,
        message,
        data: data ?? null,
      },
    },
  };
}

describe("summarizeReceiptExportErrors", () => {
  // --- 422 input validation ---

  it("422 with empty-array message → 'No appointments selected...'", () => {
    const err = makeAxiosError(
      422,
      "appointmentIds must be a non-empty array",
    );
    expect(summarizeReceiptExportErrors(err)).toEqual({
      title: "Export Failed",
      body:
        "No appointments selected. Pick at least one paid order and try again.",
    });
  });

  it("422 with 'maximum of 20' message → 'You can export at most 20...'", () => {
    const err = makeAxiosError(
      422,
      "appointmentIds exceeds maximum of 20 per request",
    );
    expect(summarizeReceiptExportErrors(err)).toEqual({
      title: "Export Failed",
      body:
        "You can export at most 20 receipts at a time. Trim your selection and try again.",
    });
  });

  it("422 with positive-integer message → falls back to BE message", () => {
    const err = makeAxiosError(
      422,
      "appointmentIds must contain only positive integers",
    );
    const result = summarizeReceiptExportErrors(err);
    expect(result.title).toBe("Export Failed");
    expect(result.body).toContain("positive integers");
  });

  // --- 404 missing_ids ---

  it("404 with single missing_id → singular form, single ID", () => {
    const err = makeAxiosError(
      404,
      "One or more appointments not found",
      { missing_ids: [101] },
    );
    expect(summarizeReceiptExportErrors(err)).toEqual({
      title: "Receipts Not Found",
      body:
        "1 order is no longer available (#101). Refresh and try again.",
    });
  });

  it("404 with multiple missing_ids → plural form, all IDs listed", () => {
    const err = makeAxiosError(
      404,
      "One or more appointments not found",
      { missing_ids: [101, 102, 103] },
    );
    expect(summarizeReceiptExportErrors(err)).toEqual({
      title: "Receipts Not Found",
      body:
        "3 orders are no longer available (#101, #102, #103). Refresh and try again.",
    });
  });

  it("404 with 7 missing_ids → caps display at 5 IDs with '…' overflow", () => {
    const err = makeAxiosError(
      404,
      "One or more appointments not found",
      { missing_ids: [1, 2, 3, 4, 5, 6, 7] },
    );
    const result = summarizeReceiptExportErrors(err);
    expect(result.title).toBe("Receipts Not Found");
    expect(result.body).toContain("7 orders are no longer available");
    expect(result.body).toContain("#1, #2, #3, #4, #5, …");
    expect(result.body).not.toContain("#6");
    expect(result.body).not.toContain("#7");
  });

  // --- 403 cross_franchise_ids ---

  it("403 with single cross_franchise_id → singular form", () => {
    const err = makeAxiosError(
      403,
      "Not authorized to export these appointments",
      { cross_franchise_ids: [201] },
    );
    expect(summarizeReceiptExportErrors(err)).toEqual({
      title: "Permission Denied",
      body:
        "1 of the selected order belongs to another franchise (#201). Deselect it and try again.",
    });
  });

  it("403 with multiple cross_franchise_ids → plural form", () => {
    const err = makeAxiosError(
      403,
      "Not authorized to export these appointments",
      { cross_franchise_ids: [201, 202] },
    );
    expect(summarizeReceiptExportErrors(err)).toEqual({
      title: "Permission Denied",
      body:
        "2 of the selected orders belong to another franchise (#201, #202). Deselect them and try again.",
    });
  });

  // --- 400 non_paid_ids ---

  it("400 with single non_paid_id → singular form, instructional copy", () => {
    const err = makeAxiosError(
      400,
      "All appointments must be in paid status",
      { non_paid_ids: [301] },
    );
    expect(summarizeReceiptExportErrors(err)).toEqual({
      title: "Mark Orders Paid First",
      body:
        "1 of the selected order has not been paid yet (#301). Receipts can only be generated for paid orders. Mark it paid first or deselect it.",
    });
  });

  it("400 with multiple non_paid_ids → plural form", () => {
    const err = makeAxiosError(
      400,
      "All appointments must be in paid status",
      { non_paid_ids: [301, 302, 303] },
    );
    expect(summarizeReceiptExportErrors(err)).toEqual({
      title: "Mark Orders Paid First",
      body:
        "3 of the selected orders have not been paid yet (#301, #302, #303). Receipts can only be generated for paid orders. Mark them paid first or deselect them.",
    });
  });

  // --- Fall-through paths ---

  it("500 with no payload → falls through to extractErrorMessage path", () => {
    const err = makeAxiosError(500, "Internal server error");
    expect(summarizeReceiptExportErrors(err)).toEqual({
      title: "Export Failed",
      body: "Internal server error",
    });
  });

  it("non-AxiosError Error input → returns Error.message", () => {
    expect(summarizeReceiptExportErrors(new Error("boom"))).toEqual({
      title: "Export Failed",
      body: "boom",
    });
  });

  it("null input → graceful default", () => {
    const result = summarizeReceiptExportErrors(null);
    expect(result.title).toBe("Export Failed");
    expect(result.body).toBe("An unexpected error occurred.");
  });

  it("undefined input → graceful default", () => {
    const result = summarizeReceiptExportErrors(undefined);
    expect(result.title).toBe("Export Failed");
    expect(result.body).toBe("An unexpected error occurred.");
  });

  // --- Edge cases ---

  it("404 with empty missing_ids array → falls through (not a real 'missing' case)", () => {
    const err = makeAxiosError(
      404,
      "Some other 404 message",
      { missing_ids: [] },
    );
    // Falls through to extractErrorMessage because the structured
    // branch only fires when `missing_ids.length > 0`.
    expect(summarizeReceiptExportErrors(err)).toEqual({
      title: "Export Failed",
      body: "Some other 404 message",
    });
  });

  it("400 with empty non_paid_ids → falls through", () => {
    const err = makeAxiosError(400, "Bad request", { non_paid_ids: [] });
    expect(summarizeReceiptExportErrors(err)).toEqual({
      title: "Export Failed",
      body: "Bad request",
    });
  });
});
