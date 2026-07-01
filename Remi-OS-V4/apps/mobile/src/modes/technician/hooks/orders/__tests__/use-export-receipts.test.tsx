/**
 * Phase 4 Chunk 4.5 — tests for `useExportReceipts`.
 *
 * Coverage:
 *   - Happy path: posts to the technician export-receipts endpoint with
 *     `appointmentIds` body, `responseType: "arraybuffer"`, and Bearer
 *     token; writes Base64 to cacheDirectory with the dated filename
 *     (`receipts-YYYY-MM-DD.pdf`); invokes `Sharing.shareAsync` with
 *     `mimeType: "application/pdf"` + `dialogTitle: "Share Receipts PDF"`.
 *   - Share-unavailable: `Sharing.isAvailableAsync` returns false → still
 *     resolves, no alert (matches `useExportPdf` semantics).
 *   - File-write failure: catches inner error, fires the "Could not save
 *     PDF file." Alert, mutation still resolves (not rejects — matches
 *     `useExportPdf` semantics).
 *   - 422/404/403/400 BE rejection → AxiosError propagates unchanged to
 *     the caller's `onError` callback with `response.data.data.{*_ids}`
 *     intact.
 *   - Franchise role guard: stub `useAuthStore.getState()` to return
 *     `UserRole.FRANCHISE_OWNER` → mutation rejects with the gating
 *     error from the hook.
 *
 * Mocks `apiClient` (NOT the abstracted `api()` helper — the export
 * path goes through raw axios because of the `arraybuffer` response
 * type that bypasses the envelope-unwrap).
 */

import { renderHook, act, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { Alert } from "react-native";

// Hoisted mock for the auth store so tests can vary the user role.
const mockGetState = jest.fn();
jest.mock("@/src/stores/auth", () => ({
  useAuthStore: { getState: () => mockGetState() },
}));

const mockApiPost = jest.fn();
jest.mock("@technician/api/client", () => ({
  __esModule: true,
  apiClient: { post: (...args: unknown[]) => mockApiPost(...args) },
}));

const mockWriteAsStringAsync = jest.fn();
jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///mock/cache/",
  writeAsStringAsync: (...args: unknown[]) =>
    mockWriteAsStringAsync(...args),
  EncodingType: { Base64: "base64" },
}));

const mockIsAvailableAsync = jest.fn();
const mockShareAsync = jest.fn();
jest.mock("expo-sharing", () => ({
  isAvailableAsync: () => mockIsAvailableAsync(),
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}));

import { useExportReceipts } from "../use-order-export";
import { UserRole } from "@technician/types/enums";

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

const FAKE_PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]).buffer; // "%PDF-"

beforeEach(() => {
  jest.clearAllMocks();
  mockGetState.mockReturnValue({
    accessToken: "tech-token-abc",
    user: { id: 1, role: UserRole.TECHNICIAN, franchiseId: 1 },
  });
  mockApiPost.mockResolvedValue({ data: FAKE_PDF_BYTES });
  mockWriteAsStringAsync.mockResolvedValue(undefined);
  mockIsAvailableAsync.mockResolvedValue(true);
  mockShareAsync.mockResolvedValue(undefined);
});

describe("useExportReceipts", () => {
  it("posts to /orders/export-receipts with appointmentIds + arraybuffer + Bearer token", async () => {
    const { Wrapper } = buildWrapper();
    const { result } = renderHook(() => useExportReceipts(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync([101, 102, 103]);
    });

    expect(mockApiPost).toHaveBeenCalledTimes(1);
    const [endpoint, body, config] = mockApiPost.mock.calls[0];
    expect(endpoint).toBe("/orders/export-receipts");
    expect(body).toEqual({ appointmentIds: [101, 102, 103] });
    expect(config.responseType).toBe("arraybuffer");
    expect(config.headers.Authorization).toBe("Bearer tech-token-abc");
  });

  it("writes Base64 to cacheDirectory with receipts-YYYY-MM-DD.pdf filename + shares with correct mimeType + dialogTitle", async () => {
    // Filename pattern uses the actual `Date` (asserted via regex
    // rather than pinning, to avoid leaking a Date spy into sibling
    // tests — TanStack Query internals call `Date.now` and a partial
    // spy breaks them).
    const FILENAME_PATTERN =
      /^file:\/\/\/mock\/cache\/receipts-\d{4}-\d{2}-\d{2}\.pdf$/;

    const { Wrapper } = buildWrapper();
    const { result } = renderHook(() => useExportReceipts(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync([101]);
    });

    // Wait for the async onSuccess to drain.
    await waitFor(() => expect(mockShareAsync).toHaveBeenCalled());

    const [writePath, base64Body, writeOpts] = mockWriteAsStringAsync.mock.calls[0];
    expect(writePath).toMatch(FILENAME_PATTERN);
    expect(typeof base64Body).toBe("string");
    expect(writeOpts).toEqual({ encoding: "base64" });

    const [sharePath, shareOpts] = mockShareAsync.mock.calls[0];
    expect(sharePath).toMatch(FILENAME_PATTERN);
    // Same path round-trips between write and share.
    expect(sharePath).toBe(writePath);
    expect(shareOpts).toEqual({
      mimeType: "application/pdf",
      dialogTitle: "Share Receipts PDF",
    });
  });

  it("does not Alert when Sharing.isAvailableAsync returns false (matches useExportPdf semantics)", async () => {
    mockIsAvailableAsync.mockResolvedValueOnce(false);
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation();

    const { Wrapper } = buildWrapper();
    const { result } = renderHook(() => useExportReceipts(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync([101]);
    });
    // Drain microtasks for the onSuccess handler.
    await waitFor(() => expect(mockIsAvailableAsync).toHaveBeenCalled());

    expect(mockShareAsync).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("on filesystem-write failure: fires 'Could not save PDF file.' Alert, mutation still resolves", async () => {
    mockWriteAsStringAsync.mockRejectedValueOnce(new Error("disk full"));
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation();
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    const { Wrapper } = buildWrapper();
    const { result } = renderHook(() => useExportReceipts(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      // mutateAsync still resolves (the failure happens in onSuccess's
      // try/catch, not the mutationFn) — matches useExportPdf.
      await result.current.mutateAsync([101]);
    });
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());

    expect(alertSpy).toHaveBeenCalledWith(
      "Export Error",
      "Could not save PDF file.",
    );
    expect(mockShareAsync).not.toHaveBeenCalled();
    alertSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it("404 BE rejection: propagates AxiosError unchanged with data.missing_ids intact", async () => {
    const beError = {
      isAxiosError: true,
      response: {
        status: 404,
        data: {
          error: true,
          message: "One or more appointments not found",
          data: { missing_ids: [101] },
        },
      },
    };
    mockApiPost.mockRejectedValueOnce(beError);

    const { Wrapper } = buildWrapper();
    const { result } = renderHook(() => useExportReceipts(), {
      wrapper: Wrapper,
    });

    let captured: unknown = null;
    await act(async () => {
      try {
        await result.current.mutateAsync([101]);
      } catch (err) {
        captured = err;
      }
    });

    expect(captured).toBe(beError);
    expect(
      (captured as typeof beError).response.data.data.missing_ids,
    ).toEqual([101]);
  });

  it("403 BE rejection: propagates AxiosError with cross_franchise_ids", async () => {
    const beError = {
      isAxiosError: true,
      response: {
        status: 403,
        data: {
          error: true,
          message: "Not authorized to export these appointments",
          data: { cross_franchise_ids: [202] },
        },
      },
    };
    mockApiPost.mockRejectedValueOnce(beError);

    const { Wrapper } = buildWrapper();
    const { result } = renderHook(() => useExportReceipts(), {
      wrapper: Wrapper,
    });

    let captured: unknown = null;
    await act(async () => {
      try {
        await result.current.mutateAsync([202]);
      } catch (err) {
        captured = err;
      }
    });

    expect(
      (captured as typeof beError).response.data.data.cross_franchise_ids,
    ).toEqual([202]);
  });

  it("franchise-role guard: rejects with gating error when caller is FRANCHISE_OWNER", async () => {
    mockGetState.mockReturnValue({
      accessToken: "fo-token-xyz",
      user: { id: 2, role: UserRole.FRANCHISE_OWNER, franchiseId: 1 },
    });

    const { Wrapper } = buildWrapper();
    const { result } = renderHook(() => useExportReceipts(), {
      wrapper: Wrapper,
    });

    let captured: unknown = null;
    await act(async () => {
      try {
        await result.current.mutateAsync([101]);
      } catch (err) {
        captured = err;
      }
    });

    expect(captured).toBeInstanceOf(Error);
    expect((captured as Error).message).toMatch(/technician-only/i);
    // Network was never hit.
    expect(mockApiPost).not.toHaveBeenCalled();
  });
});
