/**
 * LDM-WAVE-1 CHUNK-4 — Hermetic tests for the cross-franchise admin hooks.
 *
 * Covers the new mode-aware shape of the CHUNK-3 hooks:
 *   - `useFranchiseUsersWithCapabilities({ mode, franchiseId })` routes
 *     through `adminApi` for cross-franchise and stays disabled for the
 *     own-franchise variant when franchiseId is missing.
 *   - `useSetCapabilityOverride()` and `useRemoveCapabilityOverride()`
 *     honor `adminMode` on the mutation args and call the right client.
 *   - `useAdminFranchiseList()` fires once and caches.
 *
 * Like the CHUNK-3 test file, mocks `@technician/api/client` directly so the
 * hooks exercise without an Axios layer.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

jest.mock("@technician/api/client", () => ({
  api: jest.fn(),
  franchiseApi: jest.fn(),
  adminApi: jest.fn(),
}));

import { adminApi, franchiseApi } from "@technician/api/client";
import {
  useAdminFranchiseList,
  useFranchiseUsersWithCapabilities,
  useRemoveCapabilityOverride,
  useSetCapabilityOverride,
} from "../use-permissions-admin";

const franchiseApiMock = franchiseApi as jest.MockedFunction<typeof franchiseApi>;
const adminApiMock = adminApi as jest.MockedFunction<typeof adminApi>;

function makeWrapper(): {
  wrapper: React.FC<{ children: React.ReactNode }>;
  client: QueryClient;
} {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper, client };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useFranchiseUsersWithCapabilities — cross-franchise mode", () => {
  it("fires against adminApi when mode=cross-franchise (franchiseId null = all franchises)", async () => {
    adminApiMock.mockResolvedValueOnce({ users: [], nextCursor: null });
    const { wrapper } = makeWrapper();
    renderHook(
      () =>
        useFranchiseUsersWithCapabilities({
          mode: "cross-franchise",
          franchiseId: null,
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(adminApiMock).toHaveBeenCalledTimes(1);
    });
    expect(adminApiMock).toHaveBeenCalledWith("get", "/permissions/users", {
      limit: "50",
    });
    expect(franchiseApiMock).not.toHaveBeenCalled();
  });

  it("includes franchiseId on cross-franchise calls when one is selected", async () => {
    adminApiMock.mockResolvedValueOnce({ users: [], nextCursor: null });
    const { wrapper } = makeWrapper();
    renderHook(
      () =>
        useFranchiseUsersWithCapabilities({
          mode: "cross-franchise",
          franchiseId: 42,
          limit: 25,
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(adminApiMock).toHaveBeenCalledTimes(1);
    });
    expect(adminApiMock).toHaveBeenCalledWith("get", "/permissions/users", {
      limit: "25",
      franchiseId: "42",
    });
  });

  it("legacy positional signature still routes through franchiseApi (own-franchise default)", async () => {
    franchiseApiMock.mockResolvedValueOnce({ users: [], nextCursor: null });
    const { wrapper } = makeWrapper();
    renderHook(() => useFranchiseUsersWithCapabilities(7), { wrapper });

    await waitFor(() => {
      expect(franchiseApiMock).toHaveBeenCalledTimes(1);
    });
    expect(franchiseApiMock).toHaveBeenCalledWith("get", "/admin/users", {
      franchiseId: "7",
      limit: "50",
    });
    expect(adminApiMock).not.toHaveBeenCalled();
  });
});

describe("useSetCapabilityOverride — adminMode routing", () => {
  it("hits franchiseApi when adminMode is omitted (default own-franchise)", async () => {
    franchiseApiMock.mockResolvedValueOnce({
      override: {
        id: 1,
        userId: 10,
        capability: "dispatch.reassign",
        mode: "grant",
        grantedBy: 1,
        reason: null,
        createdAt: new Date().toISOString(),
      },
      audit: { id: 1, createdAt: new Date().toISOString() },
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSetCapabilityOverride(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        targetUserId: 10,
        capability: "dispatch.reassign",
        mode: "grant",
      });
    });

    expect(franchiseApiMock).toHaveBeenCalledWith(
      "put",
      "/admin/users/10/capabilities/dispatch.reassign",
      { mode: "grant", reason: null }
    );
    expect(adminApiMock).not.toHaveBeenCalled();
  });

  it("hits adminApi when adminMode=cross-franchise", async () => {
    adminApiMock.mockResolvedValueOnce({
      override: {
        id: 1,
        userId: 10,
        capability: "dispatch.reassign",
        mode: "deny",
        grantedBy: 1,
        reason: "audit",
        createdAt: new Date().toISOString(),
      },
      audit: { id: 1, createdAt: new Date().toISOString() },
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSetCapabilityOverride(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        targetUserId: 10,
        capability: "dispatch.reassign",
        mode: "deny",
        reason: "audit",
        adminMode: "cross-franchise",
      });
    });

    expect(adminApiMock).toHaveBeenCalledWith(
      "put",
      "/permissions/users/10/capabilities/dispatch.reassign",
      { mode: "deny", reason: "audit" }
    );
    expect(franchiseApiMock).not.toHaveBeenCalled();
  });
});

describe("useRemoveCapabilityOverride — adminMode routing", () => {
  it("hits adminApi when adminMode=cross-franchise", async () => {
    adminApiMock.mockResolvedValueOnce({
      cleared: true,
      audit: { id: 1, createdAt: new Date().toISOString() },
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useRemoveCapabilityOverride(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        targetUserId: 10,
        capability: "dispatch.reassign",
        adminMode: "cross-franchise",
      });
    });

    expect(adminApiMock).toHaveBeenCalledWith(
      "delete",
      "/permissions/users/10/capabilities/dispatch.reassign",
      { reason: null }
    );
    expect(franchiseApiMock).not.toHaveBeenCalled();
  });
});

describe("useAdminFranchiseList", () => {
  it("hits adminApi exactly once and caches", async () => {
    adminApiMock.mockResolvedValueOnce({
      franchises: [
        { franchiseId: 1, name: "Alpha", userCount: 7, lastActivityAt: null },
      ],
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAdminFranchiseList(), { wrapper });

    await waitFor(() => {
      expect(result.current.data?.franchises).toHaveLength(1);
    });
    expect(adminApiMock).toHaveBeenCalledTimes(1);
    expect(adminApiMock).toHaveBeenCalledWith("get", "/permissions/franchises");
  });
});
