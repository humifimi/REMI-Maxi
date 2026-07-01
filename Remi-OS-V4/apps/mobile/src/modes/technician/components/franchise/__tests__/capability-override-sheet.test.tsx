/**
 * LDM-WAVE-1 CHUNK-3 — Hermetic tests for `<CapabilityOverrideSheet>`.
 *
 * Mocks the mutation hooks so the test exercises form validation +
 * mutation dispatch shape without needing a QueryClientProvider.
 *
 * Covers:
 *   - "grant" path: calls useSetCapabilityOverride with mode=grant.
 *   - "deny" path: calls useSetCapabilityOverride with mode=deny.
 *   - "clear" path: calls useRemoveCapabilityOverride.
 *   - Reason length > 500 chars blocks Confirm (Zod max).
 *   - Empty reason normalizes to null on the mutation payload.
 */

import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

jest.mock("@technician/hooks/auth/use-permissions-admin", () => ({
  useSetCapabilityOverride: jest.fn(),
  useRemoveCapabilityOverride: jest.fn(),
}));

import {
  useRemoveCapabilityOverride,
  useSetCapabilityOverride,
} from "@technician/hooks/auth/use-permissions-admin";
import { CapabilityOverrideSheet } from "../capability-override-sheet";
import type { Capability } from "@technician/types/capabilities";

const setMutateAsyncMock = jest.fn().mockResolvedValue(undefined);
const removeMutateAsyncMock = jest.fn().mockResolvedValue(undefined);

const mockedUseSet = useSetCapabilityOverride as jest.MockedFunction<
  typeof useSetCapabilityOverride
>;
const mockedUseRemove = useRemoveCapabilityOverride as jest.MockedFunction<
  typeof useRemoveCapabilityOverride
>;

mockedUseSet.mockImplementation(
  () =>
    ({
      mutateAsync: setMutateAsyncMock,
      isPending: false,
      error: null,
    } as never)
);
mockedUseRemove.mockImplementation(
  () =>
    ({
      mutateAsync: removeMutateAsyncMock,
      isPending: false,
      error: null,
    } as never)
);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("CapabilityOverrideSheet — grant", () => {
  it("dispatches mode=grant with the trimmed reason on confirm", async () => {
    const onClose = jest.fn();
    const node = render(
      <CapabilityOverrideSheet
        visible
        onClose={onClose}
        targetUserId={10}
        targetUserName="Alice Tech"
        capability={"dispatch.reassign" as Capability}
        action="grant"
      />
    );

    fireEvent.changeText(
      node.getByTestId("capability-override-reason-input"),
      "  promotion to dispatcher  "
    );
    fireEvent.press(node.getByTestId("capability-override-confirm"));

    await waitFor(() => {
      expect(setMutateAsyncMock).toHaveBeenCalledTimes(1);
    });
    expect(setMutateAsyncMock).toHaveBeenCalledWith({
      targetUserId: 10,
      capability: "dispatch.reassign",
      mode: "grant",
      reason: "promotion to dispatcher",
      // LDM-WAVE-1 CHUNK-4: sheet now threads adminMode through to the
      // mutation. Default = own-franchise (CHUNK-3 surface).
      adminMode: "own-franchise",
    });
    expect(removeMutateAsyncMock).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("normalizes empty / whitespace-only reason to null", async () => {
    const onClose = jest.fn();
    const node = render(
      <CapabilityOverrideSheet
        visible
        onClose={onClose}
        targetUserId={10}
        targetUserName="Alice Tech"
        capability={"dispatch.reassign" as Capability}
        action="grant"
      />
    );

    fireEvent.changeText(
      node.getByTestId("capability-override-reason-input"),
      "   "
    );
    fireEvent.press(node.getByTestId("capability-override-confirm"));

    await waitFor(() => {
      expect(setMutateAsyncMock).toHaveBeenCalled();
    });
    expect(setMutateAsyncMock.mock.calls[0][0].reason).toBeNull();
  });
});

describe("CapabilityOverrideSheet — deny", () => {
  it("dispatches mode=deny", async () => {
    const node = render(
      <CapabilityOverrideSheet
        visible
        onClose={jest.fn()}
        targetUserId={10}
        targetUserName="Alice Tech"
        capability={"dispatch.reassign" as Capability}
        action="deny"
      />
    );

    fireEvent.press(node.getByTestId("capability-override-confirm"));

    await waitFor(() => {
      expect(setMutateAsyncMock).toHaveBeenCalled();
    });
    expect(setMutateAsyncMock.mock.calls[0][0].mode).toBe("deny");
  });
});

describe("CapabilityOverrideSheet — clear", () => {
  it("dispatches the remove mutation (not the set mutation)", async () => {
    const node = render(
      <CapabilityOverrideSheet
        visible
        onClose={jest.fn()}
        targetUserId={10}
        targetUserName="Alice Tech"
        capability={"dispatch.reassign" as Capability}
        action="clear"
      />
    );

    fireEvent.press(node.getByTestId("capability-override-confirm"));

    await waitFor(() => {
      expect(removeMutateAsyncMock).toHaveBeenCalledTimes(1);
    });
    expect(removeMutateAsyncMock).toHaveBeenCalledWith({
      targetUserId: 10,
      capability: "dispatch.reassign",
      reason: null,
      // LDM-WAVE-1 CHUNK-4: adminMode passthrough, default own-franchise.
      adminMode: "own-franchise",
    });
    expect(setMutateAsyncMock).not.toHaveBeenCalled();
  });
});

describe("CapabilityOverrideSheet — validation", () => {
  it("blocks confirm when reason exceeds 500 chars (Zod max)", async () => {
    const node = render(
      <CapabilityOverrideSheet
        visible
        onClose={jest.fn()}
        targetUserId={10}
        targetUserName="Alice Tech"
        capability={"dispatch.reassign" as Capability}
        action="grant"
      />
    );

    fireEvent.changeText(
      node.getByTestId("capability-override-reason-input"),
      "x".repeat(501)
    );
    fireEvent.press(node.getByTestId("capability-override-confirm"));

    // No mutation fires; instead the validation error renders.
    await waitFor(() => {
      expect(node.queryByTestId("capability-override-reason-error")).toBeTruthy();
    });
    expect(setMutateAsyncMock).not.toHaveBeenCalled();
  });
});
