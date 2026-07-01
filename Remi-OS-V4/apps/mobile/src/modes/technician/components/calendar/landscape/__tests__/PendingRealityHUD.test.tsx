/**
 * Tests for `PendingRealityHUD` (P3-FE-3).
 *
 * Coverage:
 *   1. Empty store → renders nothing.
 *   2. Active session with no intents → renders nothing.
 *   3. Intents staged with clean linter → green pill, badge "N",
 *      anchored on the LEFT edge for `preferredHand === "right"`.
 *   4. Intents staged with a warning issue → yellow pill.
 *   5. Intents staged with at least one error → red pill (errors
 *      win even when warnings are also present).
 *   6. `preferredHand === "left"` → pill swaps to the RIGHT edge.
 *   7. Tap → forwards to `router.push` with the canonical
 *      `/pending-reality/review` route.
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

// ── react-native-safe-area-context stub ──────────────────────────
//
// The HUD reads `useSafeAreaInsets()` to position itself below the
// notch. Tests pass `safeAreaInsetsOverride` directly so the live
// hook is bypassed, but the import path still has to resolve when
// the module is required by the JSX bundler. Returning a constant
// keeps the import side-effect-free.
jest.mock("react-native-safe-area-context", () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// AsyncStorage stub so the draggable-hud rehydration is deterministic.
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
  },
}));

// Imports AFTER the mocks so the component's imports bind to the
// stubs (jest hoists `jest.mock` but not the factory's closures).
import {
  PendingRealityHUD,
} from "../PendingRealityHUD";
// PR-UX-11 (2026-05-09): MAP_TOGGLE_HANDLE_* imports were dropped —
// the HUD owns its own corner via `useDraggableHud` instead of
// stacking under the map toggle's handle. Removed to keep the test
// imports aligned with what's actually referenced.
import { PENDING_REALITY_REVIEW_ROUTE } from "@technician/constants/pending-reality-routes";
import { StatusColors } from "@technician/constants/colors";
import {
  __resetPendingRealityStoreForTests,
  usePendingRealityStore,
} from "@technician/stores/pending-reality";
import {
  makeIntent as makeBaseIntent,
  makeSession as makeBaseSession,
} from "@technician/stores/__fixtures__/pending-reality";
import type { LinterIssue } from "@technician/utils/logistics-linter";

// ── Fixtures ──────────────────────────────────────────────────────
//
// Session + intent factories live in
// `src/stores/__fixtures__/pending-reality.ts` and are shared with
// the FAB and review-screen suites. The HUD suite historically used
// distinct ids (8001 / 6000-series) so we override them here for
// stability with prior assertions that reference specific ids.

const SESSION = makeBaseSession({
  id: 8001,
  idempotency_key: "test-key-8001",
});

const makeIntent = (id: number) =>
  makeBaseIntent(id, {
    session_id: 8001,
    appointment_id: 6000 + id,
  });

const WARNING_ISSUE: LinterIssue = {
  severity: "warning",
  kind: "fleet_capacity",
  affectedAppointmentIds: [6001],
  humanMessage: "Fleet capacity warning",
};

const ERROR_ISSUE: LinterIssue = {
  severity: "error",
  kind: "time_conflict",
  affectedAppointmentIds: [6001, 6002],
  humanMessage: "Two changes overlap on the same tech",
};

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  __resetPendingRealityStoreForTests();
  mockPush.mockClear();
  hapticCalls.length = 0;
});

// ── Visibility ────────────────────────────────────────────────────

describe("PendingRealityHUD — visibility", () => {
  it("renders nothing when the store is empty", () => {
    const { queryByTestId } = render(<PendingRealityHUD />);
    expect(queryByTestId("pending-reality-hud")).toBeNull();
    expect(queryByTestId("pending-reality-hud-host")).toBeNull();
  });

  it("renders nothing when a session is active but no intents are staged", () => {
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
    });
    const { queryByTestId } = render(<PendingRealityHUD />);
    expect(queryByTestId("pending-reality-hud")).toBeNull();
  });

  it("renders the pill once at least one intent is staged", () => {
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(makeIntent(1));
    });
    const { getByTestId } = render(<PendingRealityHUD />);
    expect(getByTestId("pending-reality-hud")).toBeTruthy();
    expect(getByTestId("pending-reality-hud-badge")).toBeTruthy();
  });
});

// ── Severity tints ────────────────────────────────────────────────

function tintOf(node: ReturnType<typeof render>): string | undefined {
  // `Pressable`'s `style` prop is a function `({pressed}) => style`.
  // We invoke it ourselves to get the resolved style array, then
  // walk it for the inline `backgroundColor` we set above the
  // hardcoded `styles.pill` shadow/sizing rules.
  const pill = node.getByTestId("pending-reality-hud");
  const styleProp = pill.props.style;
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

describe("PendingRealityHUD — tints + badge", () => {
  it("renders green with badge 'N' when intents are staged and the linter is clean", () => {
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(makeIntent(1));
      usePendingRealityStore.getState().addIntent(makeIntent(2));
      usePendingRealityStore.getState().addIntent(makeIntent(3));
    });
    const node = render(<PendingRealityHUD />);
    expect(tintOf(node)).toBe(StatusColors.finalized);
    // Badge clamps at 9+; "3" is unambiguous.
    expect(node.getAllByText("3").length).toBeGreaterThan(0);
  });

  it("renders yellow when at least one warning is present (and no errors)", () => {
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(makeIntent(1));
      usePendingRealityStore.setState({ linterIssues: [WARNING_ISSUE] });
    });
    const node = render(<PendingRealityHUD />);
    expect(tintOf(node)).toBe(StatusColors.scheduled);
  });

  it("renders red when at least one error is present, even alongside warnings", () => {
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(makeIntent(1));
      usePendingRealityStore.setState({
        linterIssues: [WARNING_ISSUE, ERROR_ISSUE],
      });
    });
    const node = render(<PendingRealityHUD />);
    expect(tintOf(node)).toBe(StatusColors.paymentDue);
  });

  it("clamps the corner badge to '9+' once the intent count exceeds 9", () => {
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      for (let i = 1; i <= 12; i++) {
        usePendingRealityStore.getState().addIntent(makeIntent(i));
      }
    });
    const node = render(<PendingRealityHUD />);
    const badge = node.getByTestId("pending-reality-hud-badge");
    // The corner badge text is the last text descendant of the
    // badge view; querying by text directly avoids depending on
    // RN host-tree internals.
    expect(node.getAllByText("9+").length).toBeGreaterThan(0);
    expect(badge).toBeTruthy();
  });
});

// ── Position depends on preferredHand ─────────────────────────────

function hostStyleOf(node: ReturnType<typeof render>): Record<string, unknown> {
  const host = node.getByTestId("pending-reality-hud-host");
  const styleProp = host.props.style;
  const resolved =
    typeof styleProp === "function" ? styleProp({ pressed: false }) : styleProp;
  const flat = Array.isArray(resolved) ? resolved.flat() : [resolved];
  // Last-write-wins flatten so callers can read either edge or top.
  const merged: Record<string, unknown> = {};
  for (const entry of flat) {
    if (entry && typeof entry === "object") {
      Object.assign(merged, entry);
    }
  }
  return merged;
}

describe("PendingRealityHUD — preferredHand → which edge", () => {
  it("anchors to the LEFT edge when preferredHand is right (avatar strip on the right)", () => {
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(makeIntent(1));
    });
    const node = render(
      <PendingRealityHUD
        preferredHandOverride="right"
        safeAreaInsetsOverride={{ top: 0, right: 0, bottom: 0, left: 0 }}
      />,
    );
    const style = hostStyleOf(node);
    expect("left" in style).toBe(true);
    expect("right" in style).toBe(false);
  });

  it("anchors to the RIGHT edge when preferredHand is left (avatar strip on the left)", () => {
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(makeIntent(1));
    });
    const node = render(
      <PendingRealityHUD
        preferredHandOverride="left"
        safeAreaInsetsOverride={{ top: 0, right: 0, bottom: 0, left: 0 }}
      />,
    );
    const style = hostStyleOf(node);
    expect("right" in style).toBe(true);
    expect("left" in style).toBe(false);
  });

  it("respects the safe-area inset on the anchored edge", () => {
    // PR-UX-11 (2026-05-09): the HUD now wraps the draggable pill in
    // an OUTER View that absorbs the safe-area insets, and the inner
    // host (testID `pending-reality-hud-host`) owns the corner anchor
    // at a fixed `HUD_EDGE_INSET = 8` per edge. The outer View
    // provides the per-edge safe-area padding so the pill clears the
    // notch / Dynamic Island in either rotation. The cumulative
    // distance from the viewport edge is therefore safe-area-edge +
    // HUD_EDGE_INSET; the inner host's `style.left` reflects only
    // the HUD_EDGE_INSET portion.
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(makeIntent(1));
    });
    const node = render(
      <PendingRealityHUD
        preferredHandOverride="right"
        safeAreaInsetsOverride={{ top: 24, right: 0, bottom: 0, left: 47 }}
      />,
    );
    const style = hostStyleOf(node);
    const HUD_EDGE_INSET = 8;
    expect(style.left).toBe(HUD_EDGE_INSET);
    // Top is owned by the corner anchor (top: HUD_EDGE_INSET) — the
    // outer wrapper absorbs the safe-area top inset.
    expect(style.top).toBe(HUD_EDGE_INSET);
  });
});

// ── Tap → router.push ─────────────────────────────────────────────

describe("PendingRealityHUD — tap", () => {
  it("calls router.push with the canonical review route on press", () => {
    act(() => {
      usePendingRealityStore.getState().setSession(SESSION);
      usePendingRealityStore.getState().addIntent(makeIntent(1));
    });
    const node = render(<PendingRealityHUD />);
    fireEvent.press(node.getByTestId("pending-reality-hud"));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(PENDING_REALITY_REVIEW_ROUTE);
    expect(hapticCalls).toContain("light");
  });

});
