/**
 * Phase 3 Chunk 3.2 — tests for `useSubstituteLineItem`.
 *
 * Coverage:
 *   - Mutation POSTs to the correct endpoint with the actual SKU body.
 *   - Optional fields (actual_description, reason) are forwarded ONLY
 *     when supplied — empty strings/undefined drop out of the payload.
 *   - On success, the hook invalidates the matching `['invoice', jobId]`
 *     query so the next read of the invoice screen refetches and
 *     re-renders with the substituted SKU.
 *
 * Mirrors the test patterns from Chunk 2.3's `useCarfaxSettings`
 * suite (`renderHook` + `QueryClientProvider` wrapper, `act` around
 * `mutateAsync`, mocked `api`).
 */

import { renderHook, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import { useSubstituteLineItem } from "../use-substitute-line-item";

const mockApi = jest.fn();
jest.mock("@technician/api/client", () => ({
  __esModule: true,
  api: (...args: unknown[]) => mockApi(...args),
}));

function buildWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: 0, retryDelay: 0 },
    },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return { Wrapper, queryClient };
}

beforeEach(() => {
  mockApi.mockReset();
});

describe("useSubstituteLineItem", () => {
  it("POSTs to the substitute endpoint with the actual SKU and reason", async () => {
    mockApi.mockResolvedValueOnce({
      id: 5001,
      part_number: "MOBIL-M1-104",
      substituted_for_part_number: "FRAM-PH7317",
      substitution_reason: "FRAM out of stock at van",
      type: "part",
      description: "Oil Filter",
      appointment_id: 65322,
      quantity: 1,
      unit_price: 12.99,
      total_price: 12.99,
    });

    const { Wrapper } = buildWrapper();
    const { result } = renderHook(() => useSubstituteLineItem(65322), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        lineItemId: 5001,
        actual_part_number: "MOBIL-M1-104",
        reason: "FRAM out of stock at van",
      });
    });

    expect(mockApi).toHaveBeenCalledWith(
      "post",
      "/jobs/65322/line-items/5001/substitute",
      {
        actual_part_number: "MOBIL-M1-104",
        reason: "FRAM out of stock at van",
      }
    );
  });

  it("omits optional fields from the payload when not supplied", async () => {
    mockApi.mockResolvedValueOnce({
      id: 5001,
      part_number: "STP-S7317",
      substituted_for_part_number: "FRAM-PH7317",
      substitution_reason: null,
      type: "part",
      description: "Oil Filter",
      appointment_id: 65322,
      quantity: 1,
      unit_price: 12.99,
      total_price: 12.99,
    });

    const { Wrapper } = buildWrapper();
    const { result } = renderHook(() => useSubstituteLineItem(65322), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        lineItemId: 5001,
        actual_part_number: "STP-S7317",
      });
    });

    // No `reason`, no `actual_description` keys present.
    const [, , body] = mockApi.mock.calls[0];
    expect(body).toEqual({ actual_part_number: "STP-S7317" });
    expect(body).not.toHaveProperty("reason");
    expect(body).not.toHaveProperty("actual_description");
  });

  it("invalidates ['invoice', jobId] on success so the next read refetches", async () => {
    mockApi.mockResolvedValueOnce({
      id: 5001,
      part_number: "MOBIL-M1-104",
      substituted_for_part_number: "FRAM-PH7317",
      substitution_reason: null,
      type: "part",
      description: "Oil Filter",
      appointment_id: 65322,
      quantity: 1,
      unit_price: 12.99,
      total_price: 12.99,
    });

    const { Wrapper, queryClient } = buildWrapper();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useSubstituteLineItem(65322), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        lineItemId: 5001,
        actual_part_number: "MOBIL-M1-104",
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["invoice", 65322],
    });
  });

  it("forwards actual_description when supplied", async () => {
    mockApi.mockResolvedValueOnce({
      id: 5001,
      part_number: "MOBIL-M1-104",
      description: "Mobil 1 Premium (alt for FRAM)",
      substituted_for_part_number: "FRAM-PH7317",
      substitution_reason: null,
      type: "part",
      appointment_id: 65322,
      quantity: 1,
      unit_price: 12.99,
      total_price: 12.99,
    });

    const { Wrapper } = buildWrapper();
    const { result } = renderHook(() => useSubstituteLineItem(65322), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        lineItemId: 5001,
        actual_part_number: "MOBIL-M1-104",
        actual_description: "Mobil 1 Premium (alt for FRAM)",
      });
    });

    const [, , body] = mockApi.mock.calls[0];
    expect(body).toEqual({
      actual_part_number: "MOBIL-M1-104",
      actual_description: "Mobil 1 Premium (alt for FRAM)",
    });
  });
});
