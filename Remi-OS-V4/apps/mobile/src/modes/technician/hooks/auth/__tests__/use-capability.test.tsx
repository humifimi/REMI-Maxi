/**
 * LDM-WAVE-1 CHUNK-2 — Hermetic tests for the `useCapability` wrapper.
 *
 * Covers the fail-closed contract from the chunk-2 behavior spec:
 *
 *   - Returns `true` when the capability set contains the requested cap.
 *   - Returns `false` when the set is present but doesn't contain the cap.
 *   - Returns `false` while the underlying `useCapabilities` query is
 *     loading (`capabilities: undefined`, `isLoading: true`).
 *   - Returns `false` when the underlying query errored
 *     (`isError: true`).
 *
 * The plural hook is mocked so these tests do not depend on the
 * Axios client, the auth Zustand store, or a `QueryClientProvider` —
 * which keeps the test surface tight and the failure modes obvious
 * (a test failure here always means the wrapper logic regressed, not
 * that a transitive dep changed shape).
 */

import { renderHook } from "@testing-library/react-native";

import { useCapability } from "../use-capability";
import { useCapabilities } from "../use-capabilities";
import type { Capability } from "@technician/types/capabilities";

jest.mock("../use-capabilities");

const mockedUseCapabilities = useCapabilities as jest.MockedFunction<
  typeof useCapabilities
>;

afterEach(() => {
  jest.resetAllMocks();
});

describe("useCapability", () => {
  it("returns true when the capability set contains the requested cap", () => {
    mockedUseCapabilities.mockReturnValue({
      capabilities: new Set<Capability>(["dispatch.reassign", "calendar.view"]),
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useCapability("dispatch.reassign"));
    expect(result.current).toBe(true);
  });

  it("returns false when the capability set is present but does not contain the cap", () => {
    mockedUseCapabilities.mockReturnValue({
      capabilities: new Set<Capability>(["calendar.view"]),
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useCapability("dispatch.reassign"));
    expect(result.current).toBe(false);
  });

  it("returns false (fail-closed) while the underlying query is loading", () => {
    mockedUseCapabilities.mockReturnValue({
      capabilities: undefined,
      isLoading: true,
      isError: false,
    });

    const { result } = renderHook(() => useCapability("dispatch.reassign"));
    expect(result.current).toBe(false);
  });

  it("returns false (fail-closed) when the underlying query errored", () => {
    mockedUseCapabilities.mockReturnValue({
      capabilities: undefined,
      isLoading: false,
      isError: true,
    });

    const { result } = renderHook(() => useCapability("dispatch.reassign"));
    expect(result.current).toBe(false);
  });

  it("returns false (fail-closed) when capabilities is undefined even without loading/error flags", () => {
    // Belt-and-suspenders: the spec says `capabilities: Set<Capability>
    // | undefined`, so an `undefined` value with both flags off (which
    // shouldn't happen in practice, but the type allows it) must still
    // fail closed.
    mockedUseCapabilities.mockReturnValue({
      capabilities: undefined,
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useCapability("dispatch.reassign"));
    expect(result.current).toBe(false);
  });
});
