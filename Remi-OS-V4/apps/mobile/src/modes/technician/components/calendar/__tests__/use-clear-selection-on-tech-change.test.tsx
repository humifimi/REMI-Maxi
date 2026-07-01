/**
 * Unit tests for `useClearSelectionOnTechChange` (PR-UX-8,
 * 2026-05-09).
 *
 * The hook lives in `resource-calendar-day-view.tsx` alongside
 * `useClearSelectionOnUnmount` (so both selection-clear hooks
 * share the binding-import wiring). It is consumed by
 * `ResourceCalendarWorkweekView` to clear the vendored library's
 * `selectedEvent` + `draggedEventDraft` whenever the user taps a
 * different tech's avatar to switch which workweek is being shown.
 *
 * # Why the workweek view matters here (and not the day view)
 *
 * The portrait day view never changes its mounted tech list mid-
 * mount — selections are toggled via `selectedTechIds`, the
 * `CalendarBindingProvider` is keyed `"cal-day"`, and the day's
 * `techId` set is a derivative of the API response. The portrait
 * workweek view DOES change its rendered tech mid-mount: tapping
 * an avatar fires `enterWorkweek({techId, techName})` which
 * updates `useCalendarStore.workweekTechId` and propagates as a
 * fresh `techId` prop to the same `<ResourceCalendarWorkweekView>`
 * instance. The vendored library's per-binding Zustand store is
 * NOT remounted, so `selectedEvent` survives the prop change.
 *
 * Scenarios covered:
 *
 *   1. Initial mount — no clear (nothing was set, and we don't
 *      want to spam the binding setters on first paint).
 *   2. Same techId on re-render — no clear (legitimate within-
 *      tech pickup → drag → finalize flow MUST not be torn down).
 *   3. techId changes — clears both `selectedEvent` AND
 *      `draggedEventDraft`. (The library's existing
 *      `selectedEvent`-changed effect would clear the draft on
 *      its own, but we clear it here too as a defensive
 *      belt-and-suspenders against effect-ordering surprises.)
 *   4. Sequence A → B → A (browse another tech then return)
 *      clears at every transition — the second-to-A clear is
 *      what matters in case the user picked something up on the
 *      first A → B trip.
 *
 * NOTE: this repo does not currently ship a Jest runner end-to-end
 * — see the matching disclaimer in
 * `src/stores/__tests__/pending-reality.test.ts`. The file follows
 * the canonical jest-expo shape — every assertion below should
 * pass once the runner lands.
 */

import { renderHook } from "@testing-library/react-native";

// Names MUST start with `mock` so jest's hoisting of `jest.mock()`
// factories permits referencing them — see the jest docs note about
// "out-of-scope variables" and the case-insensitive `mock`-prefix
// allowance. The hooks under test consume these via the
// react-native-resource-calendar mock factory below.
const mockSetSelectedEvent = jest.fn();
const mockSetDraggedEventDraft = jest.fn();
// PR-UX-15 (2026-05-09): the hook now subscribes to the binding's
// `draggedEventDraft` to gate the clear on "no active drag." Tests
// that need to simulate an in-flight drag flip this to a non-null
// value before the techId transition.
let mockDraggedDraft: unknown = null;
// PR-UX-16 (2026-05-09): the hook ALSO subscribes to
// `selectedEvent` because the cross-tech hover-dwell path can
// trip `enterWorkweek` BEFORE the user's pan exceeds the
// movement threshold that materializes a draft. Tests that
// simulate "pickup happened, drag started, dwell fired before
// the first per-frame draft update" set this without setting
// `mockDraggedDraft`.
let mockSelectedEvent: unknown = null;

// Mock the vendored calendar binding so the hook can be rendered
// without a `<CalendarBindingProvider>` wrapper. The mock returns
// the same setter refs every render so the dep-array equality
// check inside the hook's useEffect doesn't churn.
jest.mock("react-native-resource-calendar", () => ({
  __esModule: true,
  useCalendarBinding: () => ({
    useSetSelectedEvent: () => mockSetSelectedEvent,
    useSetDraggedEventDraft: () => mockSetDraggedEventDraft,
    useGetDraggedEventDraft: () => mockDraggedDraft,
    useGetSelectedEvent: () => mockSelectedEvent,
  }),
}));

// eslint-disable-next-line import/first -- intentional: import after the jest.mock() call so the hook's transitive imports bind to the mock.
import { useClearSelectionOnTechChange } from "@technician/components/calendar/resource-calendar-day-view";

beforeEach(() => {
  mockSetSelectedEvent.mockReset();
  mockSetDraggedEventDraft.mockReset();
  mockDraggedDraft = null;
  mockSelectedEvent = null;
});

describe("useClearSelectionOnTechChange", () => {
  it("does NOT clear on initial mount (the binding store starts empty anyway)", () => {
    renderHook(({ techId }) => useClearSelectionOnTechChange(techId), {
      initialProps: { techId: 2056 },
    });
    expect(mockSetSelectedEvent).not.toHaveBeenCalled();
    expect(mockSetDraggedEventDraft).not.toHaveBeenCalled();
  });

  it("does NOT clear when techId is unchanged across re-renders (legitimate within-tech pickup→drag flow)", () => {
    const { rerender } = renderHook(
      ({ techId }) => useClearSelectionOnTechChange(techId),
      { initialProps: { techId: 2056 } },
    );
    rerender({ techId: 2056 });
    rerender({ techId: 2056 });
    expect(mockSetSelectedEvent).not.toHaveBeenCalled();
    expect(mockSetDraggedEventDraft).not.toHaveBeenCalled();
  });

  it("clears selectedEvent AND draggedEventDraft when techId changes (the avatar-tap repro)", () => {
    // The user-reported bug: pickup on Todd (2056), tap Jake (2055)
    // avatar → workweekTechId flips → workweek view re-renders with
    // techId={2055}. The hook must clear so the next pan in Jake's
    // column doesn't inherit the held card.
    const { rerender } = renderHook(
      ({ techId }) => useClearSelectionOnTechChange(techId),
      { initialProps: { techId: 2056 } },
    );
    rerender({ techId: 2055 });
    expect(mockSetSelectedEvent).toHaveBeenCalledTimes(1);
    expect(mockSetSelectedEvent).toHaveBeenCalledWith(null);
    expect(mockSetDraggedEventDraft).toHaveBeenCalledTimes(1);
    expect(mockSetDraggedEventDraft).toHaveBeenCalledWith(null);
  });

  it("clears at every transition for a A→B→A→C sequence (the user's actual avatar-tap log)", () => {
    // Reproduces the user's exact log: Todd → Jake → Todd → Jake →
    // Josh. Each transition must clear independently — without this,
    // the "browse → return → drag" happy path on the originating
    // tech could still inherit a stale selectedEvent from the
    // intermediate browse.
    const { rerender } = renderHook(
      ({ techId }) => useClearSelectionOnTechChange(techId),
      { initialProps: { techId: 2056 } }, // Todd
    );
    rerender({ techId: 2055 }); // Jake
    rerender({ techId: 2056 }); // back to Todd
    rerender({ techId: 2055 }); // Jake again
    rerender({ techId: 2054 }); // Josh
    expect(mockSetSelectedEvent).toHaveBeenCalledTimes(4);
    expect(mockSetDraggedEventDraft).toHaveBeenCalledTimes(4);
    for (const call of mockSetSelectedEvent.mock.calls) {
      expect(call).toEqual([null]);
    }
    for (const call of mockSetDraggedEventDraft.mock.calls) {
      expect(call).toEqual([null]);
    }
  });

  it("does NOT clear when remounting fresh (the React Strict Mode double-effect path)", () => {
    // Two separate `renderHook` calls — each has its own internal
    // ref, so neither sees a "previous techId" mismatch. This pins
    // that the prevTechIdRef gate is per-mount, which matters for
    // the workweek view's CalendarBindingProvider remount path
    // (orientation change, view-mode toggle), where the parent
    // does want a fresh binding rather than a clear-against-a-
    // stale-store.
    const { unmount } = renderHook(({ techId }) =>
      useClearSelectionOnTechChange(techId),
      { initialProps: { techId: 2056 } },
    );
    unmount();
    renderHook(({ techId }) => useClearSelectionOnTechChange(techId), {
      initialProps: { techId: 2055 },
    });
    expect(mockSetSelectedEvent).not.toHaveBeenCalled();
    expect(mockSetDraggedEventDraft).not.toHaveBeenCalled();
  });

  it("PR-UX-15: does NOT clear when techId changes during an active drag (cross-tech hover-dwell flow)", () => {
    // The cross-tech hover-dwell drag path (the user's regression
    // repro): pickup on Todd, pan toward Jake's avatar, hover-dwell
    // triggers `enterWorkweek(2055)`. The workweek view re-renders
    // with `techId=2055` while the user's finger is still down and
    // the pan gesture is in flight. `draggedEventDraft` is non-null
    // for the duration of the pan. The hook MUST NOT clear here —
    // clearing mid-pan would null `selectedEvent` and the
    // subsequent `pan:end:finalize` would lose the drop
    // (`[RC DRAG] draft has no event, ignoring`).
    mockDraggedDraft = {
      eventId: 47201,
      from: 555,
      to: 615,
      resourceId: 2056,
    };
    const { rerender } = renderHook(
      ({ techId }) => useClearSelectionOnTechChange(techId),
      { initialProps: { techId: 2056 } },
    );
    rerender({ techId: 2055 });
    expect(mockSetSelectedEvent).not.toHaveBeenCalled();
    expect(mockSetDraggedEventDraft).not.toHaveBeenCalled();
  });

  it("PR-UX-15: clears on subsequent techId change AFTER drag ends (browse path resumes once draft is null)", () => {
    // Sequence: cross-tech hover-dwell drag (techId Todd→Jake),
    // drag commits, draft clears, THEN user taps a different tech
    // to browse. The first transition was preserved (active drag);
    // the second transition (now no active drag) must clear.
    mockDraggedDraft = {
      eventId: 47201,
      from: 555,
      to: 615,
      resourceId: 2056,
    };
    const { rerender } = renderHook(
      ({ techId }) => useClearSelectionOnTechChange(techId),
      { initialProps: { techId: 2056 } },
    );
    rerender({ techId: 2055 }); // hover-dwell during drag — preserved
    expect(mockSetSelectedEvent).not.toHaveBeenCalled();
    // Drop commits → draft clears
    mockDraggedDraft = null;
    rerender({ techId: 2056 }); // browse tap — now should clear
    expect(mockSetSelectedEvent).toHaveBeenCalledTimes(1);
    expect(mockSetSelectedEvent).toHaveBeenCalledWith(null);
    expect(mockSetDraggedEventDraft).toHaveBeenCalledTimes(1);
    expect(mockSetDraggedEventDraft).toHaveBeenCalledWith(null);
  });

  it("PR-UX-16: does NOT clear when techId changes mid-pickup BEFORE the draft materializes (cross-tech hover-dwell pre-pan window)", () => {
    // The user-reported PR-UX-15 regression: pickup writes
    // selectedEvent and dragReady=true, the user starts panning
    // toward another tech's avatar, the avatar's hover-dwell
    // dispatcher trips `enterWorkweek` BEFORE the pan has moved
    // far enough for the library to materialize a
    // `draggedEventDraft`. PR-UX-15's draft-only guard didn't fire
    // and the techId change cleared selectedEvent → finalizeDrag
    // dropped the gesture.
    //
    // The guard now treats `selectedEvent != null` as equivalent
    // to "drag in flight" and preserves both refs across the
    // techId change.
    mockSelectedEvent = { id: 47632, resourceId: 2056 };
    mockDraggedDraft = null; // pan hasn't crossed the threshold yet
    const { rerender } = renderHook(
      ({ techId }) => useClearSelectionOnTechChange(techId),
      { initialProps: { techId: 2056 } },
    );
    rerender({ techId: 2071 }); // avatar dwell hand-off
    expect(mockSetSelectedEvent).not.toHaveBeenCalled();
    expect(mockSetDraggedEventDraft).not.toHaveBeenCalled();
  });
});
