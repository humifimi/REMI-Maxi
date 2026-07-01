/**
 * Tests for the FO-only "Demo Mode" panel inside `app/(tabs)/more.tsx`
 * (D2P-FE-14).
 *
 * Coverage targets per the chunk prompt:
 *   1. Role-gated render — section appears for `franchise_owner`,
 *      hidden for technicians.
 *   2. Sibling reset button POSTs to
 *      `/demo/reset-with-conflicts` after the destructive
 *      confirmation alert resolves.
 *   3. Manual AI scan trigger POSTs to `/demo/run-ai-scan` (no
 *      confirmation gate).
 *   4. Dual-device mode picker writes to `useDemoSettingsStore`.
 *   5. Linter strictness picker writes to `useDemoSettingsStore`.
 *   6. Dev-shortcut toggle writes to `useDemoSettingsStore`.
 *
 * NOTE: this repo does not currently ship a Jest runner end-to-end
 * (see the same caveat in `src/hooks/schedule/__tests__/use-session-
 * aware-submit.test.tsx`). The file follows the canonical jest-expo
 * + `@testing-library/react-native` shape — every assertion below
 * should pass once the runner lands.
 */

import { Alert } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Endpoints } from "@technician/api/endpoints";

// ── Module mocks ────────────────────────────────────────────────────

// Auth role is the primary render gate. Default to franchise owner so
// the section renders; tech-only test flips this.
let mockAuthRole: "technician" | "franchise_owner" = "franchise_owner";
const mockSetTokens = jest.fn();
const mockSetUser = jest.fn();
const mockSetBiometricEnabled = jest.fn();
const mockGetBiometricEnabled = jest.fn().mockResolvedValue(false);

jest.mock("@/src/stores/auth", () => ({
  __esModule: true,
  useAuthStore: <T,>(
    selector: (state: {
      user: {
        userId: number;
        email: string;
        role: "technician" | "franchise_owner";
        fullName: string;
        franchiseId?: number;
      } | null;
      setTokens: typeof mockSetTokens;
      setUser: typeof mockSetUser;
      setBiometricEnabled: typeof mockSetBiometricEnabled;
      getBiometricEnabled: typeof mockGetBiometricEnabled;
    }) => T,
  ): T =>
    selector({
      user: {
        userId: 1,
        email: "fo@example.com",
        role: mockAuthRole,
        fullName: "Test User",
        franchiseId: 42,
      },
      setTokens: mockSetTokens,
      setUser: mockSetUser,
      setBiometricEnabled: mockSetBiometricEnabled,
      getBiometricEnabled: mockGetBiometricEnabled,
    }),
}));

// Logout / biometric / upload-avatar / training are out of scope for
// the demo-mode panel tests — stub them so the screen mounts cleanly
// without a QueryClientProvider.
jest.mock("@technician/hooks/auth/use-auth", () => ({
  __esModule: true,
  useLogout: () => jest.fn(),
}));
jest.mock("@technician/hooks/auth/use-biometric", () => ({
  __esModule: true,
  useBiometric: () => ({ isAvailable: false, biometricType: null }),
  getBiometricLabel: () => "Biometric",
}));
jest.mock("@technician/hooks/auth/use-upload-avatar", () => ({
  __esModule: true,
  useUploadAvatar: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock("@technician/hooks/training/use-training-xp", () => ({
  __esModule: true,
  useTrainingXP: () => ({ data: undefined }),
}));

// `react-query` is invoked for the dispatch reset path. Stub the
// query client invalidation surface so the demo handlers can call
// `queryClient.invalidateQueries()` without a real provider.
const mockInvalidateQueries = jest.fn();
jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

// `api()` is the seam every demo handler hits. Drive its resolved
// shape per-test via the mock.
const mockApi = jest.fn();
jest.mock("@technician/api/client", () => ({
  __esModule: true,
  api: (...args: unknown[]) => mockApi(...args),
}));

// LDM-WAVE-1 CHUNK-3: more.tsx now renders <CanAccess> for the
// Permissions admin entry. <CanAccess> calls useCapability which uses
// TanStack Query; the existing test harness doesn't wrap in a
// QueryClientProvider. Mock useCapability to a stable false so the
// rest of the test surface (demo panel + role-gated entries) keeps
// working without provider plumbing.
jest.mock("@technician/hooks/auth/use-capability", () => ({
  __esModule: true,
  useCapability: () => false,
}));

// `axios` is also imported for the legacy `Reset Demo Data` path. The
// new D2P-FE-14 buttons use `api()`. Stub axios.post defensively so
// the legacy path doesn't blow up if it's accidentally exercised.
jest.mock("axios", () => {
  const actual = jest.requireActual("axios");
  return {
    __esModule: true,
    default: { post: jest.fn().mockResolvedValue({ data: { data: {} } }) },
    AxiosError: actual.AxiosError,
  };
});

// `expo-notifications` — only mode (d) on the dual-device picker
// reaches this. Default to "registered" so the inline status row
// renders the success copy; the warn case can override per-test.
const mockGetDevicePushTokenAsync = jest.fn();
jest.mock("expo-notifications", () => ({
  __esModule: true,
  getDevicePushTokenAsync: () => mockGetDevicePushTokenAsync(),
}));

// `expo-image-picker` — out-of-scope for demo-mode tests but the
// screen imports it at module load.
jest.mock("expo-image-picker", () => ({
  __esModule: true,
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

// `expo-router` push is benign for these tests — stub it.
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

// `dispatch-offer` store has no impact on the demo-mode panel.
jest.mock("@technician/stores/dispatch-offer", () => ({
  __esModule: true,
  useDispatchOfferStore: { getState: () => ({ showOffer: jest.fn() }) },
}));

// AvatarEditor renders nothing visible by default.
jest.mock("@/src/components/shared/avatar-editor", () => ({
  __esModule: true,
  AvatarEditor: () => null,
}));

// NativeCamera helper — just acquire/release stubs.
jest.mock("@technician/constants/runtime", () => ({
  __esModule: true,
  NativeCamera: { acquire: jest.fn(), release: jest.fn() },
}));

// eslint-disable-next-line import/first
import {
  __resetDemoSettingsStoreForTests,
  useDemoSettingsStore,
} from "@technician/stores/demo-settings";
// eslint-disable-next-line import/first
import MoreScreen from "../more";

// ── Setup ───────────────────────────────────────────────────────────

beforeEach(() => {
  __resetDemoSettingsStoreForTests();
  mockApi.mockReset();
  mockInvalidateQueries.mockReset();
  mockGetDevicePushTokenAsync.mockReset();
  mockGetDevicePushTokenAsync.mockResolvedValue({ data: "device-token-xyz" });
  mockAuthRole = "franchise_owner";
});

afterEach(() => {
  jest.restoreAllMocks();
});

/**
 * Helper: invoke the destructive "Reset" button inside the
 * confirmation Alert that the sibling-reset handler opens. The
 * screen calls `Alert.alert(title, message, buttons)`; intercept
 * that call, find the destructive button, and synchronously fire
 * its onPress so the rest of the handler proceeds.
 */
function tapDestructiveAlertButton(): void {
  const lastCall = (Alert.alert as jest.Mock).mock.calls.at(-1);
  expect(lastCall).toBeDefined();
  const buttons = lastCall![2] as
    | { text: string; style?: string; onPress?: () => void }[]
    | undefined;
  const destructive = buttons?.find((b) => b.style === "destructive");
  expect(destructive).toBeDefined();
  destructive!.onPress?.();
}

// ── Tests ───────────────────────────────────────────────────────────

describe("more.tsx — Demo Mode panel role gate", () => {
  it("renders the Demo Mode section for franchise_owner", () => {
    render(<MoreScreen />);
    expect(screen.queryByTestId("demo-mode-section")).not.toBeNull();
  });

  it("hides the Demo Mode section for technician", () => {
    mockAuthRole = "technician";
    render(<MoreScreen />);
    expect(screen.queryByTestId("demo-mode-section")).toBeNull();
  });
});

describe("more.tsx — Sibling reset (with conflict scenarios)", () => {
  it("POSTs to /demo/reset-with-conflicts after the user confirms the destructive alert", async () => {
    mockApi.mockResolvedValueOnce(undefined);
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    render(<MoreScreen />);
    fireEvent.press(screen.getByTestId("demo-reset-with-conflicts"));

    // The button opens the destructive confirmation alert, NOT the
    // network call. Tapping "Reset" inside that alert is what fires
    // the request.
    expect(mockApi).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalled();

    await act(async () => {
      tapDestructiveAlertButton();
      await Promise.resolve();
    });

    expect(mockApi).toHaveBeenCalledWith(
      "post",
      Endpoints.demo.resetWithConflicts,
    );
  });
});

describe("more.tsx — Manual AI scan trigger", () => {
  it("POSTs to /demo/run-ai-scan with no confirmation alert", async () => {
    mockApi.mockResolvedValueOnce({ detected_count: 3 });

    render(<MoreScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId("demo-run-ai-scan"));
      await Promise.resolve();
    });

    expect(mockApi).toHaveBeenCalledWith("post", Endpoints.demo.runAiScan);
  });
});

describe("more.tsx — Dual-device mode picker writes to the store", () => {
  it("setting mode (a) updates `useDemoSettingsStore.dualDeviceMode`", () => {
    render(<MoreScreen />);
    expect(useDemoSettingsStore.getState().dualDeviceMode).toBeNull();

    fireEvent.press(screen.getByTestId("dual-device-mode-a"));
    expect(useDemoSettingsStore.getState().dualDeviceMode).toBe("a");
  });
});

describe("more.tsx — Linter strictness picker writes to the store", () => {
  it("setting Loose updates `useDemoSettingsStore.linterStrictness`", () => {
    render(<MoreScreen />);
    expect(useDemoSettingsStore.getState().linterStrictness).toBe("strict");

    fireEvent.press(screen.getByTestId("linter-strictness-loose"));
    expect(useDemoSettingsStore.getState().linterStrictness).toBe("loose");
  });
});

describe("more.tsx — Dev-shortcut toggle writes to the store", () => {
  it("toggling on updates `useDemoSettingsStore.devShortcutVisible`", () => {
    render(<MoreScreen />);
    expect(useDemoSettingsStore.getState().devShortcutVisible).toBe(false);

    fireEvent(screen.getByTestId("demo-dev-shortcut-toggle"), "valueChange", true);
    expect(useDemoSettingsStore.getState().devShortcutVisible).toBe(true);
  });
});
