/**
 * Tests for `PendingRealityFAB` (P3-FE-2).
 *
 * Coverage:
 *   1. Empty store / portrait → renders nothing.
 *   2. Active session with N intents and clean linter → renders the
 *      FAB tinted green with badge "N".
 *   3. Active session with intents + a warning issue → yellow tint,
 *      badge count matches.
 *   4. Active session with intents + an error issue → red tint, even
 *      when warnings are also present (errors win).
 *   5. Tap forwards to `router.push` with the canonical
 *      `/pending-reality/review` route.
 *   6. Landscape orientation → the FAB hides itself even when intents
 *      are present (the HUD from P3-FE-3 owns that surface).
 */

import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

// ── expo-router stub ─────────────────────────────────────────────
//
// `jest.mock` calls hoist above imports — anything referenced inside
// the factory must either be inlined or be a `mock`-prefixed name
// (jest's babel hoist whitelist).
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ push: mockPush }),
}));

// ── Haptic stub ──────────────────────────────────────────────────
const hapticCalls: string[] = [];
jest.mock("@technician/hooks/utility/use-haptics", () => ({
  haptic: {
    light: () => hapticCalls.push("light"),
    medium: () => hapticCalls.push("medium"),
    heavy: () => hapticCalls.push("heavy"),
    success: () => hapticCalls.push("success"),
    warning: () => hapticCalls.push("warning"),
    error: () => hapticCalls.push("error"),
    selection: () => hapticCalls.push("selection"),
  },
}));

// ── useWideCanvas stub ───────────────────────────────────────────
//
// We could mock `react-native`'s `useWindowDimensions` with
// `jest.requireActual("react-native")` and override the one export,
// but that pulls in `DevMenu` (a TurboModule that explodes outside a
// real RN runtime — see the failure log left on
// `src/hooks/ui/__tests__/use-wide-canvas.test.ts`). Mocking the
// hook the FAB consumes directly is both narrower and avoids the
// TurboModule trap entirely.
let mockOrientation: "portrait" | "landscape" = "portrait";
jest.mock("@technician/hooks/ui/use-wide-canvas", () => ({
  __esModule: true,
  useWideCanvas: () => ({
    isWide: false,
    orientation: mockOrientation,
    canvasKind:
      mockOrientation === "portrait" ? "phone-portrait" : "phone-landscape",
  }),
}));

function setPortrait() {
  mockOrientation = "portrait";
}

function setLandscape() {
  mockOrientation = "landscape";
}

// ── useAiSuggestionSessions stub ─────────────────────────────────
//
// The FAB calls this hook for franchise-owner role detection; the
// real implementation routes through TanStack Query, which needs a
// `QueryClientProvider` we don't set up in this suite. The default
// state — `data: []` — keeps the FAB's AI-side count at zero, so
// the existing tests behave exactly like they did before D2P-FE-14.
// Tests that exercise the FO branch override `mockAiSessionData`
// before rendering.
let mockAiSessionData: Array<unknown> = [];
jest.mock("@technician/hooks/franchise/use-franchise-reorganizations", () => ({
  __esModule: true,
  useAiSuggestionSessions: () => ({
    data: mockAiSessionData,
    error: null,
    status: "success",
  }),
}));

// ── useAuthStore stub helper ─────────────────────────────────────
//
// The auth store ships a `null` user by default, so the technician
// tests below get `isFranchiseOwner === false` for free without
// touching the real store. The FO tests reach in via `setState`
// rather than mocking the whole module so the `useAuthStore(s =>
// s.user?.role)` selector still works.
function setUserRole(role: string | null) {
  // Lazy require to avoid a circular evaluation at jest hoist time.
  const { useAuthStore } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/src/stores/auth") as typeof import("@/src/stores/auth");
  useAuthStore.setState((s) => ({
    ...s,
    user: role
      ? // The selector only reads `.role`, so a partial fixture is OK
        // here.
        ({ ...(s.user ?? {}), role } as typeof s.user)
      : null,
  }));
}

// Imports AFTER the mocks so the component's imports bind to the
// stubs (jest hoists `jest.mock` but not the factory's closures).
import { PendingRealityFAB } from "../PendingRealityFAB";
import { PENDING_REALITY_REVIEW_ROUTE } from "@technician/constants/pending-reality-routes";
import { StatusColors } from "@technician/constants/colors";
import {
  __resetPendingRealityStoreForTests,
  usePendingRealityStore,
} from "@technician/stores/pending-reality";
import {
  makeIntent,
  makeSession,
} from "@technician/stores/__fixtures__/pending-reality";
import type { LinterIssue } from "@technician/utils/logistics-linter";
import { UserRole } from "@technician/types/enums";

// ── Fixtures ──────────────────────────────────────────────────────
//
// Session + intent factories live in
// `src/stores/__fixtures__/pending-reality.ts` and are shared with
// the HUD and review-screen suites. Build a single `SESSION` here so
// every test starts from the same row.

const SESSION = makeSession();

const WARNING_ISSUE: LinterIssue = {
  severity: "warning",
  kind: "fleet_capacity",
  affectedAppointmentIds: [5001],
  humanMessage: "Fleet capacity warning",
};

const ERROR_ISSUE: LinterIssue = {
  severity: "error",
  kind: "time_conflict",
  affectedAppointmentIds: [5001, 5002],
  humanMessage: "Two changes overlap on the same tech",
};

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  __resetPendingRealityStoreForTests();
  mockPush.mockClear();
  hapticCalls.length = 0;
  mockAiSessionData = [];
  setUserRole(null);
  setPortrait();
});

// ── Visibility ────────────────────────────────────────────────────

describe("PendingRealityFAB — visibility", () => {
  it("renders nothing when the store is empty", () => {
    const { queryByTestId } = render(<PendingRealityFAB />);
    expect(queryByTestId("pending-reality-fab")).toBeNull();
    expect(queryByTestId("pending-reality-fab-host")).toBeNull();
  });

  it("renders nothing when a session is active but no intents are staged", () => {
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });
    const { queryByTestId } = render(<PendingRealityFAB />);
    expect(queryByTestId("pending-reality-fab")).toBeNull();
  });

  it("hides itself in landscape even when intents are present (HUD owns that surface)", () => {
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(makeIntent(1));
    });
    setLandscape();
    const { queryByTestId } = render(<PendingRealityFAB />);
    expect(queryByTestId("pending-reality-fab")).toBeNull();
  });
});

// ── Severity tints ────────────────────────────────────────────────

function tintOf(node: ReturnType<typeof render>): string | undefined {
  // `Pressable`'s `style` prop is a function `({pressed}) => style`.
  // We invoke it ourselves to get the resolved style array, then
  // walk it for the inline `backgroundColor` we set above the
  // hardcoded `styles.fab` shadow/sizing rules.
  const fab = node.getByTestId("pending-reality-fab");
  const styleProp = fab.props.style;
  const resolved =
    typeof styleProp === "function" ? styleProp({ pressed: false }) : styleProp;
  const flat = Array.isArray(resolved) ? resolved : [resolved];
  for (const entry of flat) {
    if (entry && typeof entry === "object" && "backgroundColor" in entry) {
      const bg = (entry as { backgroundColor?: string }).backgroundColor;
      if (bg) return bg;
    }
  }
  return undefined;
}

describe("PendingRealityFAB — tints + badge", () => {
  it("renders green with badge 'N' when intents are staged and the linter is clean", () => {
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(makeIntent(1));
      usePendingRealityStore.getState().addIntent(makeIntent(2));
    });
    const node = render(<PendingRealityFAB />);
    expect(node.getByTestId("pending-reality-fab")).toBeTruthy();
    expect(tintOf(node)).toBe(StatusColors.finalized);
    expect(node.getByTestId("pending-reality-fab-badge")).toBeTruthy();
    expect(node.getByText("2")).toBeTruthy();
  });

  it("renders yellow with badge '2' when 2 intents and a warning issue are present", () => {
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(makeIntent(1));
      usePendingRealityStore.getState().addIntent(makeIntent(2));
      usePendingRealityStore.setState({ linterIssues: [WARNING_ISSUE] });
    });
    const node = render(<PendingRealityFAB />);
    expect(tintOf(node)).toBe(StatusColors.scheduled);
    expect(node.getByText("2")).toBeTruthy();
  });

  it("renders red when at least one error is present, even alongside warnings", () => {
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(makeIntent(1));
      usePendingRealityStore.setState({
        linterIssues: [WARNING_ISSUE, ERROR_ISSUE],
      });
    });
    const node = render(<PendingRealityFAB />);
    expect(tintOf(node)).toBe(StatusColors.paymentDue);
  });

  it("clamps the badge to '9+' once the intent count exceeds 9", () => {
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      for (let i = 1; i <= 12; i++) {
        usePendingRealityStore.getState().addIntent(makeIntent(i));
      }
    });
    const node = render(<PendingRealityFAB />);
    expect(node.getByText("9+")).toBeTruthy();
  });
});

// ── Tap → router.push ─────────────────────────────────────────────

describe("PendingRealityFAB — tap", () => {
  it("calls router.push with the canonical review route on press", () => {
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(makeIntent(1));
    });
    const node = render(<PendingRealityFAB />);
    fireEvent.press(node.getByTestId("pending-reality-fab"));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(PENDING_REALITY_REVIEW_ROUTE);
    expect(hapticCalls).toContain("light");
  });
});

// ── Franchise-owner AI suggestion entry point ─────────────────────
//
// The FAB doubles as the FO's only navigation surface to the Pending
// Reality review screen's AI tab. Without this branch, AI-emitted
// reorganization sessions stay reachable only via the alert dialog
// the AI scan posts ("Open the AI tab on the review screen") and the
// FO has no way to actually do that. See the §2.5 deviation note in
// `PendingRealityFAB.tsx` for the why.

describe("PendingRealityFAB — franchise-owner AI suggestions", () => {
  it("renders when a franchise owner has pending AI sessions but zero local intents", () => {
    setUserRole(UserRole.FRANCHISE_OWNER);
    mockAiSessionData = [{ id: "ai-1" }, { id: "ai-2" }];
    const node = render(<PendingRealityFAB />);
    expect(node.getByTestId("pending-reality-fab")).toBeTruthy();
    expect(node.getByText("2")).toBeTruthy();
  });

  it("ignores AI sessions for technicians (count stays scoped to local intents)", () => {
    setUserRole(UserRole.TECHNICIAN);
    mockAiSessionData = [{ id: "ai-1" }, { id: "ai-2" }];
    const { queryByTestId } = render(<PendingRealityFAB />);
    expect(queryByTestId("pending-reality-fab")).toBeNull();
  });

  it("sums local intents and AI sessions when both are present for a franchise owner", () => {
    setUserRole(UserRole.FRANCHISE_OWNER);
    mockAiSessionData = [{ id: "ai-1" }];
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(makeIntent(1));
    });
    const node = render(<PendingRealityFAB />);
    expect(node.getByText("2")).toBeTruthy();
  });
});
