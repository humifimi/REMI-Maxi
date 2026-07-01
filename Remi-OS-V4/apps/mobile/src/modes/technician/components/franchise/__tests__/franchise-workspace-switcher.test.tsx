/**
 * LDM-WAVE-1 CHUNK-4 — Hermetic tests for `<FranchiseWorkspaceSwitcher>`.
 *
 * Covers:
 *   - "All franchises" chip is always rendered + sets selection to null
 *   - Each franchise from `useAdminFranchiseList` becomes a chip
 *   - Tapping a franchise chip fires onChange with that franchiseId
 *   - Loading + error states render their indicators
 */

import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

jest.mock("@technician/hooks/auth/use-permissions-admin", () => ({
  __esModule: true,
  useAdminFranchiseList: jest.fn(),
}));

import { useAdminFranchiseList } from "@technician/hooks/auth/use-permissions-admin";
import { FranchiseWorkspaceSwitcher } from "../franchise-workspace-switcher";

const useAdminFranchiseListMock =
  useAdminFranchiseList as jest.MockedFunction<typeof useAdminFranchiseList>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("FranchiseWorkspaceSwitcher", () => {
  it("renders an 'All franchises' chip and a chip per franchise; tapping fires onChange", () => {
    useAdminFranchiseListMock.mockReturnValue({
      data: {
        franchises: [
          {
            franchiseId: 1,
            name: "Alpha",
            userCount: 4,
            lastActivityAt: null,
          },
          {
            franchiseId: 2,
            name: "Beta",
            userCount: 1,
            lastActivityAt: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    const onChange = jest.fn();
    const node = render(
      <FranchiseWorkspaceSwitcher
        selectedFranchiseId={null}
        onChange={onChange}
        testIDPrefix="ws"
      />
    );

    expect(node.getByTestId("ws-chip-all")).toBeTruthy();
    expect(node.getByTestId("ws-chip-1")).toBeTruthy();
    expect(node.getByTestId("ws-chip-2")).toBeTruthy();

    fireEvent.press(node.getByTestId("ws-chip-2"));
    expect(onChange).toHaveBeenCalledWith(2);

    fireEvent.press(node.getByTestId("ws-chip-all"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("shows the loading indicator while the list is loading", () => {
    useAdminFranchiseListMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const node = render(
      <FranchiseWorkspaceSwitcher
        selectedFranchiseId={null}
        onChange={jest.fn()}
        testIDPrefix="ws"
      />
    );

    expect(node.getByTestId("ws-loading")).toBeTruthy();
  });

  it("shows the error message but still renders 'All franchises' for graceful fallback", () => {
    useAdminFranchiseListMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    const node = render(
      <FranchiseWorkspaceSwitcher
        selectedFranchiseId={null}
        onChange={jest.fn()}
        testIDPrefix="ws"
      />
    );

    expect(node.getByTestId("ws-error")).toBeTruthy();
    expect(node.getByTestId("ws-chip-all")).toBeTruthy();
  });
});
