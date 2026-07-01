/**
 * Tests for `LinterInterceptSheet` — `2026-05-08-linter-sheet-filter-dragged`.
 *
 * The sheet receives the entire active-session linter result through
 * `useLinterInterceptHost`. Producer-side
 * `useSessionAwareSubmit` packs an optional `scopeAppointmentIds` set
 * onto the request so the sheet can narrow what it renders to "rows
 * touching the dragged card / its chain". Tests below pin the
 * filter:
 *
 *   1. Single-chain session, drag belongs to that chain → the
 *      chain's issues render.
 *   2. Two-chain session, drag belongs to chain A → only chain A's
 *      issues render; chain B's row is suppressed.
 *   3. Drag is a candidate not yet staged into any chain (linter
 *      just fired for the first time) → only the candidate's own
 *      issues render.
 *   4. Scope filter would empty the sheet → render an EMPTY list +
 *      `__DEV__` warning (post-2026-05-11 fix). Pre-2026-05-11 this
 *      branch fell back to the unfiltered list, which silently
 *      exposed stale conflicts on cards the user never touched —
 *      exactly the "clean drop shows stale conflicts" bug that fix
 *      addresses. See
 *      `docs/PLAN-DEVIATIONS.md#2026-05-11-clean-drops-stale-intercept`.
 *   5. Scope is `null` (legacy callsites that don't yet plumb a
 *      target id) → render every issue, same as before this filter
 *      landed.
 *
 * 2026-05-10 smoke fix — the sheet is now orientation-aware:
 *   - Portrait → `@gorhom/bottom-sheet` bottom-drawer (the historical
 *     surface the filter test fixtures above were authored against).
 *   - Landscape → half-width side-pinned popup (`useDynamicPopupSide`).
 *
 * jest-expo's default `Dimensions.get('window')` is portrait
 * (375×667), so the filter tests above all exercise the portrait
 * branch. The bottom-block of tests below mocks
 * `useWindowDimensions` to a landscape viewport and re-runs one
 * representative filter scenario against the landscape branch,
 * confirming both render paths honor the same scope semantics.
 *
 * PLAN-DEVIATION: 2026-05-10-linter-intercept-half-width — the
 * landscape-only carve-out is documented at
 * docs/PLAN-DEVIATIONS.md#2026-05-10-linter-intercept-half-width.
 */

import React from "react";
import { act, render } from "@testing-library/react-native";

// ── @gorhom/bottom-sheet stub ────────────────────────────────────
//
// The real sheet portals into a UIManager surface and animates via
// Reanimated worklets — neither plays nicely under the jest-expo
// test environment. Stub it down to a passthrough View tree so the
// children render synchronously and we can assert on the issue rows.
// `BottomSheetScrollView` is similarly stubbed to a plain ScrollView.
jest.mock("@gorhom/bottom-sheet", () => {
  const React = jest.requireActual("react");
  const { ScrollView, View } = jest.requireActual("react-native");
  const BottomSheet = React.forwardRef(function BottomSheetMock(
    props: { children?: React.ReactNode },
    _ref: unknown,
  ) {
    return <View testID="linter-intercept-sheet-host">{props.children}</View>;
  });
  const BottomSheetScrollView = ({
    children,
    contentContainerStyle,
  }: {
    children?: React.ReactNode;
    contentContainerStyle?: unknown;
  }) => <ScrollView contentContainerStyle={contentContainerStyle}>{children}</ScrollView>;
  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetScrollView,
  };
});

// `react-native-gesture-handler` ships its own jest stub, but the
// `TouchableOpacity` re-export pulls in animated bindings the
// jest-expo preset doesn't auto-mock. Replace it with the RN
// equivalent — fine for filter assertions, the buttons aren't
// pressed in this suite.
jest.mock("react-native-gesture-handler", () => {
  const RN = jest.requireActual("react-native");
  return {
    __esModule: true,
    TouchableOpacity: RN.TouchableOpacity,
  };
});

// Haptic stub — same pattern as `PendingRealityFAB.test.tsx`.
jest.mock("@technician/hooks/utility/use-haptics", () => ({
  __esModule: true,
  haptic: { light: jest.fn(), medium: jest.fn() },
}));

// `useCalendarDisplayLookups` reads from the day-view query cache;
// stub to empty lookups so the cards render with bare `#NNN` chips
// (the wire-format fallback). The filter logic doesn't care.
jest.mock("@technician/hooks/schedule/use-calendar-display-lookups", () => ({
  __esModule: true,
  useCalendarDisplayLookups: () => ({
    appointmentLabels: new Map(),
    technicianNames: new Map(),
  }),
}));

// `LinterEdgeCard` pulls in `expo-router` for the affected-id chip
// links. Stub the router so the tree doesn't need a real
// `RootLayoutContext` mounted.
jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn() }),
}));

import {
  LinterInterceptSheet,
  LinterInterceptSheetLandscape,
} from "../linter-intercept-sheet";
import {
  __resetLinterInterceptHostForTests,
  useLinterInterceptHost,
} from "@technician/stores/linter-intercept-host";
import type { LinterIssue } from "@technician/utils/logistics-linter";

// ── Fixtures ─────────────────────────────────────────────────────
//
// Two chains share an active session:
//   Chain A: appointments 101 → 102 (reschedule cascade).
//   Chain B: appointments 201 → 202 (independent reassign cascade).
// A third issue sits on appointment 999 (not in either chain) —
// stays in the bag to verify the filter excludes it from a chain-A
// drag's intercept.

const CHAIN_A_ISSUE: LinterIssue = {
  severity: "error",
  kind: "time_conflict",
  affectedAppointmentIds: [101, 102],
  humanMessage: "Chain A overlap on tech 5.",
};

const CHAIN_B_ISSUE: LinterIssue = {
  severity: "error",
  kind: "time_conflict",
  affectedAppointmentIds: [201, 202],
  humanMessage: "Chain B overlap on tech 9.",
};

const UNRELATED_ISSUE: LinterIssue = {
  severity: "warning",
  kind: "fleet_capacity",
  affectedAppointmentIds: [999],
  humanMessage: "Fleet capacity warning on appointment #999.",
};

beforeEach(() => {
  __resetLinterInterceptHostForTests();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Helper that drives the host store from the producer's perspective:
// fires `present(...)` with an explicit scope set and returns the
// unresolved Promise so the caller can clean up via `resolveActive`.
function presentWithScope(
  issues: LinterIssue[],
  scope: ReadonlySet<number> | null,
) {
  return useLinterInterceptHost
    .getState()
    .present(issues, { scopeAppointmentIds: scope });
}

describe("LinterInterceptSheet — chain-scoped issue filter", () => {
  it("renders only the dragged chain's issue when one chain is active", () => {
    let promise!: Promise<unknown>;
    act(() => {
      promise = presentWithScope([CHAIN_A_ISSUE], new Set([101, 102]));
    });

    const node = render(<LinterInterceptSheet />);

    expect(node.queryByText(CHAIN_A_ISSUE.humanMessage)).toBeTruthy();
    // No other chain issues exist in this fixture; just sanity-check
    // we didn't render an unrelated row anyway.
    expect(node.queryByText(UNRELATED_ISSUE.humanMessage)).toBeNull();

    act(() => {
      useLinterInterceptHost.getState().resolveActive(undefined);
    });
    return promise;
  });

  it("hides chain B's issues when the user drags into chain A in a multi-chain session", () => {
    let promise!: Promise<unknown>;
    act(() => {
      promise = presentWithScope(
        [CHAIN_A_ISSUE, CHAIN_B_ISSUE, UNRELATED_ISSUE],
        // Scope mirrors what `useSessionAwareSubmit` would pack: the
        // dragged appointment plus the rest of its chain. Chain B
        // (201, 202) and the unrelated #999 row stay out of scope.
        new Set([101, 102]),
      );
    });

    const node = render(<LinterInterceptSheet />);

    expect(node.queryByText(CHAIN_A_ISSUE.humanMessage)).toBeTruthy();
    expect(node.queryByText(CHAIN_B_ISSUE.humanMessage)).toBeNull();
    expect(node.queryByText(UNRELATED_ISSUE.humanMessage)).toBeNull();

    act(() => {
      useLinterInterceptHost.getState().resolveActive(undefined);
    });
    return promise;
  });

  it("renders only the candidate's own issues for a first-time drag not yet staged into a chain", () => {
    // Producer scenario: the user just dragged a card; there's no
    // pre-existing chain yet. `useSessionAwareSubmit` falls back to
    // scoping by just the dragged appointment id.
    const FIRST_TIME_ISSUE: LinterIssue = {
      severity: "error",
      kind: "time_conflict",
      affectedAppointmentIds: [501],
      humanMessage: "First-time drag overlap.",
    };
    let promise!: Promise<unknown>;
    act(() => {
      promise = presentWithScope(
        [FIRST_TIME_ISSUE, UNRELATED_ISSUE],
        new Set([501]),
      );
    });

    const node = render(<LinterInterceptSheet />);

    expect(node.queryByText(FIRST_TIME_ISSUE.humanMessage)).toBeTruthy();
    expect(node.queryByText(UNRELATED_ISSUE.humanMessage)).toBeNull();

    act(() => {
      useLinterInterceptHost.getState().resolveActive(undefined);
    });
    return promise;
  });

  it("renders an empty list (no stale cross-card conflicts) and warns when scope filter would empty the sheet", () => {
    // Producer regression scenario: scope was constructed but no
    // issue's `affectedAppointmentIds` intersects it. Pre-2026-05-11
    // this branch fell back to the unfiltered list, which surfaced
    // the exact "clean drop shows stale conflicts" bug the
    // 2026-05-11 fix addresses: the user would see "Hold on — this
    // would conflict." over rows on cards they never touched.
    //
    // The producer (`useSessionAwareSubmit`) now scope-filters the
    // issue list BEFORE the live-commit-vs-intercept decision, so
    // the sheet should never receive a non-null scope whose issues
    // fail the scope filter. If that invariant ever breaks again,
    // rendering an empty conflict surface (visible bug) is better
    // than misleading conflicts on unrelated cards (silent bug).
    let promise!: Promise<unknown>;
    act(() => {
      promise = presentWithScope([CHAIN_A_ISSUE], new Set([7777]));
    });

    const warnSpy = jest.spyOn(console, "warn");
    const node = render(<LinterInterceptSheet />);

    expect(node.queryByText(CHAIN_A_ISSUE.humanMessage)).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      "[LinterInterceptSheet] scope filter removed every issue; rendering empty list (producer should have live-committed instead of opening sheet)",
      expect.objectContaining({ scopeIds: [7777], issueCount: 1 }),
    );

    act(() => {
      useLinterInterceptHost.getState().resolveActive(undefined);
    });
    return promise;
  });

  it("renders every issue when scope is null (legacy callsites without a target id)", () => {
    let promise!: Promise<unknown>;
    act(() => {
      promise = presentWithScope([CHAIN_A_ISSUE, CHAIN_B_ISSUE], null);
    });

    const node = render(<LinterInterceptSheet />);

    expect(node.queryByText(CHAIN_A_ISSUE.humanMessage)).toBeTruthy();
    expect(node.queryByText(CHAIN_B_ISSUE.humanMessage)).toBeTruthy();

    act(() => {
      useLinterInterceptHost.getState().resolveActive(undefined);
    });
    return promise;
  });
});

// ── Landscape branch — half-width side-pinned popup ────────────────
//
// PLAN-DEVIATION: 2026-05-10-linter-intercept-half-width — the
// half-width side-pinned surface only renders in landscape; portrait
// is unchanged from the pre-aa2d078 BottomSheet shape. This block
// renders the named landscape sub-component directly, which is
// equivalent to mounting the orientation-aware host on a landscape
// viewport. (`useWideCanvas` resolves orientation at module-load time
// via a captured `useWindowDimensions` reference; spying RN's export
// after the import resolves doesn't update the binding inside the
// hook, and `jest.isolateModules` corrupts the singleton React copy
// the `@testing-library/react-native` renderer holds. Rendering the
// landscape sub-component directly side-steps both.)
describe("LinterInterceptSheet — landscape branch", () => {
  it("renders the dragged chain's issues from the landscape side-pinned popup", () => {
    let promise!: Promise<unknown>;
    act(() => {
      promise = presentWithScope(
        [CHAIN_A_ISSUE, CHAIN_B_ISSUE],
        new Set([101, 102]),
      );
    });

    const node = render(<LinterInterceptSheetLandscape />);

    // Same scope-filter behaviour as portrait — chain A renders,
    // chain B is suppressed. The popup itself is identifiable by
    // its `linter-intercept-sheet` testID (set on the landscape
    // backdrop wrapper; the portrait branch nests inside the
    // mocked BottomSheet so it doesn't expose this id).
    expect(node.queryByTestId("linter-intercept-sheet")).toBeTruthy();
    expect(node.queryByText(CHAIN_A_ISSUE.humanMessage)).toBeTruthy();
    expect(node.queryByText(CHAIN_B_ISSUE.humanMessage)).toBeNull();

    act(() => {
      useLinterInterceptHost.getState().resolveActive(undefined);
    });
    return promise;
  });

  it("renders an empty list and warns when scope filter would empty the landscape sheet (2026-05-11 fix)", () => {
    let promise!: Promise<unknown>;
    act(() => {
      promise = presentWithScope([CHAIN_A_ISSUE], new Set([7777]));
    });

    const warnSpy = jest.spyOn(console, "warn");
    const node = render(<LinterInterceptSheetLandscape />);

    expect(node.queryByText(CHAIN_A_ISSUE.humanMessage)).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      "[LinterInterceptSheet] scope filter removed every issue; rendering empty list (producer should have live-committed instead of opening sheet)",
      expect.objectContaining({ scopeIds: [7777], issueCount: 1 }),
    );

    act(() => {
      useLinterInterceptHost.getState().resolveActive(undefined);
    });
    return promise;
  });
});

// ── Stale-content gate (2026-05-11 phantom-sheet-on-rotate fix) ────
//
// User report from on-device smoke (2026-05-10 / 11):
//   - In landscape: the sheet opens for request 2; user taps "Stage
//     for review"; `resolveActive` clears request 2 — log line
//     `resolveActive {choice: "stage", requestId: 2}`.
//   - User rotates to portrait.
//   - Portrait sheet renders the title + Stage / Apply buttons as if
//     a fresh request was open. User taps Stage again — log line
//     `resolveActive (no-op) {choice: "stage"}` (no requestId).
//
// Root cause: gorhom's BottomSheet was observed shipping stale
// children across an orientation unmount/remount under Reanimated
// worklets — the host store `request` was correctly null, but the
// sheet surface still presented its previous render's children. The
// fix gates the rendered children on `request != null` so even if
// gorhom inadvertently surfaces the BottomSheet, there's no title
// and no tappable buttons.
//
// These tests pin the gate in BOTH branches so the regression can't
// silently reintroduce itself by editing one branch without the other.
describe("LinterInterceptSheet — stale content gate", () => {
  it("portrait: renders no title / buttons when request is null (rotation safety)", () => {
    // No `present(...)` — the store stays at `request: null`, the
    // shape we end up in after `resolveActive` resolves a request.
    expect(useLinterInterceptHost.getState().request).toBeNull();

    const node = render(<LinterInterceptSheet />);

    expect(node.queryByText("Hold on — this would conflict.")).toBeNull();
    expect(node.queryByTestId("linter-intercept-apply-btn")).toBeNull();
    expect(node.queryByTestId("linter-intercept-stage-btn")).toBeNull();
  });

  it("portrait: clears title / buttons when request transitions to null mid-render", () => {
    let promise!: Promise<unknown>;
    act(() => {
      promise = presentWithScope([CHAIN_A_ISSUE], new Set([101, 102]));
    });

    const node = render(<LinterInterceptSheet />);
    expect(node.queryByText("Hold on — this would conflict.")).toBeTruthy();
    expect(node.queryByTestId("linter-intercept-stage-btn")).toBeTruthy();

    // Resolve as if the user tapped Stage — the gate must clear the
    // surface even though the BottomSheet stays mounted at index -1.
    act(() => {
      useLinterInterceptHost.getState().resolveActive("stage");
    });

    expect(node.queryByText("Hold on — this would conflict.")).toBeNull();
    expect(node.queryByTestId("linter-intercept-apply-btn")).toBeNull();
    expect(node.queryByTestId("linter-intercept-stage-btn")).toBeNull();

    return promise;
  });

  it("landscape: renders no title / buttons when request is null (rotation safety)", () => {
    expect(useLinterInterceptHost.getState().request).toBeNull();

    const node = render(<LinterInterceptSheetLandscape />);

    expect(node.queryByText("Hold on — this would conflict.")).toBeNull();
    expect(node.queryByTestId("linter-intercept-apply-btn")).toBeNull();
    expect(node.queryByTestId("linter-intercept-stage-btn")).toBeNull();
  });

  it("landscape: clears title / buttons when request transitions to null mid-render", () => {
    let promise!: Promise<unknown>;
    act(() => {
      promise = presentWithScope([CHAIN_A_ISSUE], new Set([101, 102]));
    });

    const node = render(<LinterInterceptSheetLandscape />);
    expect(node.queryByText("Hold on — this would conflict.")).toBeTruthy();
    expect(node.queryByTestId("linter-intercept-stage-btn")).toBeTruthy();

    act(() => {
      useLinterInterceptHost.getState().resolveActive("stage");
    });

    expect(node.queryByText("Hold on — this would conflict.")).toBeNull();
    expect(node.queryByTestId("linter-intercept-apply-btn")).toBeNull();
    expect(node.queryByTestId("linter-intercept-stage-btn")).toBeNull();

    return promise;
  });
});

// ── Drawer-shell unmount gate (2026-05-12 blank-drawer-on-rotate) ──
//
// User report from on-device smoke (2026-05-12):
//   "Things seem to be working good, but there is a blank drawer
//    that always pops up when I turn out of landscape mode in either
//    portrait calendar."
//
// Root cause: the 2026-05-11 phantom-sheet-on-rotate fix gated
// CONTENT on `request != null` but left the gorhom `BottomSheet`
// shell mounted permanently at `index={-1}`. Across an orientation
// flip, that shell was observed surfacing (background + handle
// visible, no body) — a "blank drawer" from the user's point of
// view, with no actionable affordance behind it.
//
// The fix conditionally unmounts the whole `BottomSheet` (and the
// landscape half-width wrapper) when no intercept request is
// active. A deferred-unmount timer keeps the shell mounted for
// SHEET_UNMOUNT_DELAY_MS after `request` clears so the normal
// close animation still plays.
//
// These tests pin the new behavior:
//   1. Portrait: with no active request, NO BottomSheet ever renders.
//   2. Landscape: with no active request, NO wrapper testID renders.
//   3. Portrait: after present, the BottomSheet renders.
//   4. Landscape: after present, the wrapper testID renders.
describe("LinterInterceptSheet — drawer-shell unmount gate", () => {
  it("portrait: does not mount the BottomSheet shell when request is null", () => {
    expect(useLinterInterceptHost.getState().request).toBeNull();

    const node = render(<LinterInterceptSheet />);

    // The mocked BottomSheet tags itself with `linter-intercept-sheet-host`
    // (see the jest.mock at the top of this file). If the entire
    // BottomSheet returns null, that testID must NOT exist.
    expect(node.queryByTestId("linter-intercept-sheet-host")).toBeNull();
  });

  it("landscape: does not mount the wrapper or BottomSheet shell when request is null", () => {
    expect(useLinterInterceptHost.getState().request).toBeNull();

    const node = render(<LinterInterceptSheetLandscape />);

    // Landscape's half-width wrapper has its own `linter-intercept-sheet`
    // testID; both that and the inner mocked BottomSheet host must
    // be absent from the tree.
    expect(node.queryByTestId("linter-intercept-sheet")).toBeNull();
    expect(node.queryByTestId("linter-intercept-sheet-host")).toBeNull();
  });

  it("portrait: mounts the BottomSheet shell once a request arrives", () => {
    let promise!: Promise<unknown>;
    act(() => {
      promise = presentWithScope([CHAIN_A_ISSUE], new Set([101, 102]));
    });

    const node = render(<LinterInterceptSheet />);

    expect(node.queryByTestId("linter-intercept-sheet-host")).toBeTruthy();

    act(() => {
      useLinterInterceptHost.getState().resolveActive(undefined);
    });
    return promise;
  });

  it("landscape: mounts the wrapper + BottomSheet shell once a request arrives", () => {
    let promise!: Promise<unknown>;
    act(() => {
      promise = presentWithScope([CHAIN_A_ISSUE], new Set([101, 102]));
    });

    const node = render(<LinterInterceptSheetLandscape />);

    expect(node.queryByTestId("linter-intercept-sheet")).toBeTruthy();
    expect(node.queryByTestId("linter-intercept-sheet-host")).toBeTruthy();

    act(() => {
      useLinterInterceptHost.getState().resolveActive(undefined);
    });
    return promise;
  });

  it("portrait: keeps the shell mounted during the close-animation grace window after resolve", () => {
    let promise!: Promise<unknown>;
    act(() => {
      promise = presentWithScope([CHAIN_A_ISSUE], new Set([101, 102]));
    });

    const node = render(<LinterInterceptSheet />);
    expect(node.queryByTestId("linter-intercept-sheet-host")).toBeTruthy();

    // Resolve clears the request synchronously. The shell should
    // STILL be present immediately after, so gorhom's close
    // animation has a target to animate against. The deferred
    // unmount fires later (we don't advance fake timers here — we
    // just want to assert the synchronous state).
    act(() => {
      useLinterInterceptHost.getState().resolveActive("stage");
    });

    expect(node.queryByTestId("linter-intercept-sheet-host")).toBeTruthy();

    return promise;
  });
});
