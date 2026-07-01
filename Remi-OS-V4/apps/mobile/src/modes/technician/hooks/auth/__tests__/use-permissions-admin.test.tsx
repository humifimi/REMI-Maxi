/**
 * LDM-WAVE-1 CHUNK-3 — Hermetic tests for the permissions admin hooks.
 *
 * Mocks `franchiseApi` so the hooks can be exercised without an Axios
 * client. Verifies:
 *
 *   - The list hook is disabled when franchiseId is missing.
 *   - The list hook calls the right endpoint with the right params.
 *   - The set / remove override mutations invalidate the right query
 *     keys on success (admin matrix + per-user audit + the target
 *     user's auth cap cache).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

jest.mock("@technician/api/client", () => ({
  api: jest.fn(),
  franchiseApi: jest.fn(),
}));

import { franchiseApi } from "@technician/api/client";
import {
  useFranchiseUsersWithCapabilities,
  useRemoveCapabilityOverride,
  useSetCapabilityOverride,
} from "../use-permissions-admin";

const franchiseApiMock = franchiseApi as jest.MockedFunction<typeof franchiseApi>;

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

describe("useFranchiseUsersWithCapabilities", () => {
  it("does not fire when franchiseId is undefined", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useFranchiseUsersWithCapabilities(undefined), {
      wrapper,
    });

    // Wait a tick to let RQ settle.
    await waitFor(() => {
      expect(result.current.isFetching).toBe(false);
    });
    expect(franchiseApiMock).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it("fires with the right url + params when franchiseId is provided", async () => {
    franchiseApiMock.mockResolvedValueOnce({ users: [], nextCursor: null });
    const { wrapper } = makeWrapper();
    renderHook(() => useFranchiseUsersWithCapabilities(7, { limit: 25 }), {
      wrapper,
    });
    await waitFor(() => {
      expect(franchiseApiMock).toHaveBeenCalledTimes(1);
    });
    expect(franchiseApiMock).toHaveBeenCalledWith("get", "/admin/users", {
      franchiseId: "7",
      limit: "25",
    });
  });
});

describe("useSetCapabilityOverride", () => {
  it("PUTs the right URL and invalidates admin + audit + auth cache on success", async () => {
    franchiseApiMock.mockResolvedValueOnce({
      override: {
        id: 5,
        userId: 10,
        capability: "dispatch.reassign",
        mode: "grant",
        grantedBy: 20,
        reason: null,
        createdAt: new Date().toISOString(),
      },
      audit: { id: 50, createdAt: new Date().toISOString() },
    });

    const { wrapper, client } = makeWrapper();
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useSetCapabilityOverride(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        targetUserId: 10,
        capability: "dispatch.reassign" as any,
        mode: "grant",
        reason: "promotion",
      });
    });

    expect(franchiseApiMock).toHaveBeenCalledWith(
      "put",
      "/admin/users/10/capabilities/dispatch.reassign",
      { mode: "grant", reason: "promotion" }
    );

    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        ["perms-admin-users"],
        ["perms-admin-audit", 10],
        ["auth", "capabilities", 10],
      ])
    );
  });
});

describe("useRemoveCapabilityOverride", () => {
  it("DELETEs the right URL and invalidates the same key trio on success", async () => {
    franchiseApiMock.mockResolvedValueOnce({
      cleared: true,
      audit: { id: 60, createdAt: new Date().toISOString() },
    });

    const { wrapper, client } = makeWrapper();
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useRemoveCapabilityOverride(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        targetUserId: 10,
        capability: "dispatch.reassign" as any,
        reason: null,
      });
    });

    expect(franchiseApiMock).toHaveBeenCalledWith(
      "delete",
      "/admin/users/10/capabilities/dispatch.reassign",
      { reason: null }
    );

    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        ["perms-admin-users"],
        ["perms-admin-audit", 10],
        ["auth", "capabilities", 10],
      ])
    );
  });
});
