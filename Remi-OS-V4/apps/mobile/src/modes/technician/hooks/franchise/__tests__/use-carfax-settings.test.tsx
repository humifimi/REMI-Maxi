/**
 * Phase 2 Chunk 2.3 — tests for `useCarfaxSettings` and
 * `useUpdateCarfaxCadence`.
 *
 * Coverage:
 *   - GET hook fires `franchiseApi("get", "/settings/carfax")` and
 *     returns the parsed `CarfaxSettings` envelope.
 *   - GET hook honors `enabled: false` (non-FO callers don't fire).
 *   - PUT mutation calls `franchiseApi("put", "/settings/carfax", { ... })`
 *     for each cadence value.
 *   - PUT's `onSuccess` invalidates the GET's query key so the next
 *     mount refetches.
 */

import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import {
  useCarfaxSettings,
  useUpdateCarfaxCadence,
  carfaxSettingsKeys,
} from "../use-carfax-settings";
import { CarfaxCadence } from "@technician/types/enums";

const mockFranchiseApi = jest.fn();
jest.mock("@technician/api/client", () => ({
  __esModule: true,
  franchiseApi: (...args: unknown[]) => mockFranchiseApi(...args),
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
  mockFranchiseApi.mockReset();
});

describe("useCarfaxSettings", () => {
  it("calls GET /settings/carfax and exposes the parsed envelope", async () => {
    mockFranchiseApi.mockResolvedValueOnce({
      carfax_submission_cadence: "every_job",
      carfax_location_id: "QV-12345",
    });

    const { Wrapper } = buildWrapper();
    const { result } = renderHook(() => useCarfaxSettings(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFranchiseApi).toHaveBeenCalledWith("get", "/settings/carfax");
    expect(result.current.data).toEqual({
      carfax_submission_cadence: "every_job",
      carfax_location_id: "QV-12345",
    });
  });

  it("does not fire when enabled is false (non-FO callers)", async () => {
    const { Wrapper } = buildWrapper();
    renderHook(() => useCarfaxSettings({ enabled: false }), {
      wrapper: Wrapper,
    });
    // Allow any microtasks to flush.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockFranchiseApi).not.toHaveBeenCalled();
  });
});

describe("useUpdateCarfaxCadence", () => {
  it("PUTs every_job when flipped to every_job", async () => {
    mockFranchiseApi.mockResolvedValueOnce({
      carfax_submission_cadence: "every_job",
    });

    const { Wrapper } = buildWrapper();
    const { result } = renderHook(() => useUpdateCarfaxCadence(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync(CarfaxCadence.EVERY_JOB);
    });

    expect(mockFranchiseApi).toHaveBeenCalledWith(
      "put",
      "/settings/carfax",
      { carfax_submission_cadence: "every_job" },
    );
  });

  it("PUTs nightly_batch when flipped to nightly_batch", async () => {
    mockFranchiseApi.mockResolvedValueOnce({
      carfax_submission_cadence: "nightly_batch",
    });

    const { Wrapper } = buildWrapper();
    const { result } = renderHook(() => useUpdateCarfaxCadence(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync(CarfaxCadence.NIGHTLY_BATCH);
    });

    expect(mockFranchiseApi).toHaveBeenCalledWith(
      "put",
      "/settings/carfax",
      { carfax_submission_cadence: "nightly_batch" },
    );
  });

  it("invalidates the settings query on success so the next read refetches", async () => {
    mockFranchiseApi.mockResolvedValueOnce({
      carfax_submission_cadence: "nightly_batch",
    });

    const { Wrapper, queryClient } = buildWrapper();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateCarfaxCadence(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync(CarfaxCadence.NIGHTLY_BATCH);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: carfaxSettingsKeys.all,
    });
  });
});
