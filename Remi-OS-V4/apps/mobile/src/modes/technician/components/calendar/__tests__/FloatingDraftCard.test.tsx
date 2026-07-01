/**
 * Tests for `FloatingDraftCard` (P2-FE-5, course-corrected
 * 2026-04-21).
 *
 * The original snapshot/restore/expire test suite was deleted along
 * with the 30-second resilience window — see the deviation entries
 * `2026-04-21-tap-to-create-draft` and `2026-04-21-rotation-sideways-draft`
 * in `docs/PLAN-DEVIATIONS.md`. The new suite covers the
 * tap-to-create flow + state-driven popover behavior + the
 * synthetic-event injection hook.
 *
 * Coverage axes:
 *   1. backdrop visibility — nothing rendered without a draft; host
 *      mounts as soon as the store has one; backdrop ONLY appears
 *      while the chooser is open (chunk 1.1 fix on 2026-04-21 — see
 *      the comment in `FloatingDraftCard.tsx` for the trade-off).
 *   2. tap-outside semantics — backdrop tap closes the chooser only
 *      (the draft survives, since the backdrop only exists while the
 *      chooser is open).
 *   3. chooser pick — selecting Customer or Personal invokes the
 *      consumer-supplied `onChooseKind` with the draft and closes
 *      the chooser; tapping Cancel dismisses the draft entirely
 *      (added 2026-04-22 to give the chooser an always-discoverable
 *      dismiss path before the chunk-2b long-press route lands).
 *   4. `useResourcesWithDraft` — synthetic event spliced into the
 *      matching tech's events, no-op without a draft, attached to
 *      the first resource when the draft has no tech assignment.
 *   5. `isDraftSyntheticEventId` — guard recognizes the sentinel.
 */

/* eslint-disable import/no-unresolved -- @testing-library/react-native lands with the jest-expo runner. */

import React from "react";
import { Text, View } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";

import {
  FloatingDraftCard,
  isDraftSyntheticEventId,
  SYNTHETIC_DRAFT_EVENT_ID,
  useResourcesWithDraft,
} from "../FloatingDraftCard";
import { useCalendarStore } from "@technician/stores/calendar";

// Reset the store between tests — Zustand stores are module-scoped so
// state leaks across tests otherwise.
beforeEach(() => {
  useCalendarStore.setState({ pendingDraft: null, draftChooserOpen: false });
});

// ── isDraftSyntheticEventId ────────────────────────────────────────

describe("isDraftSyntheticEventId", () => {
  it("recognizes the sentinel", () => {
    expect(isDraftSyntheticEventId(SYNTHETIC_DRAFT_EVENT_ID)).toBe(true);
  });
  it("rejects real ids and null/undefined", () => {
    expect(isDraftSyntheticEventId(0)).toBe(false);
    expect(isDraftSyntheticEventId(42)).toBe(false);
    expect(isDraftSyntheticEventId(null)).toBe(false);
    expect(isDraftSyntheticEventId(undefined)).toBe(false);
  });
});

// ── FloatingDraftCard — visibility ────────────────────────────────

describe("FloatingDraftCard — visibility", () => {
  it("renders nothing when no pending draft", () => {
    const { queryByTestId } = render(<FloatingDraftCard />);
    expect(queryByTestId("floating-draft-card-host")).toBeNull();
    expect(queryByTestId("floating-draft-card-backdrop")).toBeNull();
  });

  it("renders the host (no backdrop) when a draft is created without the chooser", () => {
    const { queryByTestId } = render(<FloatingDraftCard />);
    act(() => {
      useCalendarStore.getState().createDraft({
        date: "2026-04-21",
        startMinutes: 600,
        technicianId: 7,
      });
    });
    expect(queryByTestId("floating-draft-card-host")).not.toBeNull();
    // No backdrop while the chooser is closed — calendar must own
    // the touch surface so the dashed draft block stays tappable.
    expect(queryByTestId("floating-draft-card-backdrop")).toBeNull();
  });

  it("renders the backdrop once the chooser is opened", () => {
    const { queryByTestId } = render(<FloatingDraftCard />);
    act(() => {
      useCalendarStore.getState().createDraft({
        date: "2026-04-21",
        startMinutes: 600,
        technicianId: 7,
      });
      useCalendarStore.getState().setDraftChooserOpen(true);
    });
    expect(queryByTestId("floating-draft-card-backdrop")).not.toBeNull();
  });

  it("hides everything after dismissDraft", () => {
    const { queryByTestId } = render(<FloatingDraftCard />);
    act(() => {
      useCalendarStore.getState().createDraft({
        date: "2026-04-21",
        startMinutes: 600,
        technicianId: 7,
      });
      useCalendarStore.getState().setDraftChooserOpen(true);
    });
    expect(queryByTestId("floating-draft-card-backdrop")).not.toBeNull();
    act(() => {
      useCalendarStore.getState().dismissDraft();
    });
    expect(queryByTestId("floating-draft-card-backdrop")).toBeNull();
    expect(queryByTestId("floating-draft-card-host")).toBeNull();
  });
});

// ── FloatingDraftCard — tap-outside semantics ─────────────────────

describe("FloatingDraftCard — tap-outside semantics", () => {
  it("closes the chooser (and leaves the draft alive) when the backdrop is tapped", () => {
    const { getByTestId } = render(<FloatingDraftCard />);
    act(() => {
      useCalendarStore.getState().createDraft({
        date: "2026-04-21",
        startMinutes: 600,
        technicianId: 7,
      });
      useCalendarStore.getState().setDraftChooserOpen(true);
    });
    expect(useCalendarStore.getState().draftChooserOpen).toBe(true);
    fireEvent.press(getByTestId("floating-draft-card-backdrop"));
    expect(useCalendarStore.getState().draftChooserOpen).toBe(false);
    expect(useCalendarStore.getState().pendingDraft).not.toBeNull();
  });
});

// ── FloatingDraftCard — chooser pick ──────────────────────────────

describe("FloatingDraftCard — chooser pick", () => {
  it("invokes onChooseKind('customer') and closes the chooser when Customer Appointment is tapped", () => {
    const onChooseKind = jest.fn();
    const { getByText } = render(<FloatingDraftCard onChooseKind={onChooseKind} />);
    act(() => {
      useCalendarStore.getState().createDraft({
        date: "2026-04-21",
        startMinutes: 600,
        technicianId: 7,
      });
      useCalendarStore.getState().setDraftChooserOpen(true);
    });
    fireEvent.press(getByText("Customer Appointment"));
    expect(onChooseKind).toHaveBeenCalledWith(
      "customer",
      expect.objectContaining({
        date: "2026-04-21",
        startMinutes: 600,
        technicianId: 7,
        kind: "customer",
      }),
    );
    expect(useCalendarStore.getState().draftChooserOpen).toBe(false);
  });

  it("dismisses the draft entirely when Cancel is tapped", () => {
    const onChooseKind = jest.fn();
    const { getByTestId } = render(<FloatingDraftCard onChooseKind={onChooseKind} />);
    act(() => {
      useCalendarStore.getState().createDraft({
        date: "2026-04-21",
        startMinutes: 600,
        technicianId: 7,
      });
      useCalendarStore.getState().setDraftChooserOpen(true);
    });
    expect(useCalendarStore.getState().pendingDraft).not.toBeNull();
    fireEvent.press(getByTestId("draft-chooser-cancel"));
    expect(onChooseKind).not.toHaveBeenCalled();
    expect(useCalendarStore.getState().pendingDraft).toBeNull();
    expect(useCalendarStore.getState().draftChooserOpen).toBe(false);
  });

  it("invokes onChooseKind('personal') and closes the chooser when Personal Event is tapped", () => {
    const onChooseKind = jest.fn();
    const { getByText } = render(<FloatingDraftCard onChooseKind={onChooseKind} />);
    act(() => {
      useCalendarStore.getState().createDraft({
        date: "2026-04-21",
        startMinutes: 720,
        technicianId: 3,
      });
      useCalendarStore.getState().setDraftChooserOpen(true);
    });
    fireEvent.press(getByText("Personal Event"));
    expect(onChooseKind).toHaveBeenCalledWith(
      "personal",
      expect.objectContaining({ kind: "personal" }),
    );
    expect(useCalendarStore.getState().draftChooserOpen).toBe(false);
  });
});

// ── FloatingDraftCard — embedded avatar selector (P2-FE-8) ────────

describe("FloatingDraftCard — embedded avatar selector", () => {
  const techs = [
    { id: 1, name: "Alice", profileImageUrl: null },
    { id: 2, name: "Bob", profileImageUrl: null },
  ];

  it("renders the selector when the draft has no technician and techs are provided", () => {
    const { queryByTestId } = render(
      <FloatingDraftCard techs={techs} onPickDraftTechnician={jest.fn()} />,
    );
    act(() => {
      useCalendarStore.getState().createDraft({
        date: "2026-04-21",
        startMinutes: 600,
        technicianId: null,
      });
    });
    expect(queryByTestId("embedded-avatar-selector")).not.toBeNull();
  });

  it("does NOT render the selector when the draft already has a technician", () => {
    const { queryByTestId } = render(
      <FloatingDraftCard techs={techs} onPickDraftTechnician={jest.fn()} />,
    );
    act(() => {
      useCalendarStore.getState().createDraft({
        date: "2026-04-21",
        startMinutes: 600,
        technicianId: 1,
      });
    });
    expect(queryByTestId("embedded-avatar-selector")).toBeNull();
  });

  it("does NOT render the selector when techs list is empty", () => {
    const { queryByTestId } = render(
      <FloatingDraftCard techs={[]} onPickDraftTechnician={jest.fn()} />,
    );
    act(() => {
      useCalendarStore.getState().createDraft({
        date: "2026-04-21",
        startMinutes: 600,
        technicianId: null,
      });
    });
    expect(queryByTestId("embedded-avatar-selector")).toBeNull();
  });

  it("invokes onPickDraftTechnician with the correct tech id when a chip is tapped", () => {
    const onPick = jest.fn();
    const { getByTestId } = render(
      <FloatingDraftCard techs={techs} onPickDraftTechnician={onPick} />,
    );
    act(() => {
      useCalendarStore.getState().createDraft({
        date: "2026-04-21",
        startMinutes: 600,
        technicianId: null,
      });
    });
    // Press the chip wrapper directly; the press bubbles into the
    // child Pressable inside TechAvatarChip.
    fireEvent.press(getByTestId("embedded-avatar-selector-chip-2"));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(2);
  });
});

// ── useResourcesWithDraft ─────────────────────────────────────────

function HookHarness({
  resources,
  onResolve,
}: {
  resources: ReturnType<typeof makeResources>;
  onResolve: (out: ReturnType<typeof makeResources>) => void;
}) {
  const out = useResourcesWithDraft(resources);
  React.useEffect(() => {
    onResolve(out);
  }, [out, onResolve]);
  return <View />;
}

function makeResources() {
  return [
    { id: 1, name: "Alice", events: [{ id: 100, resourceId: 1, date: "2026-04-21", from: 540, to: 600, title: "Existing" }] },
    { id: 2, name: "Bob", events: [] },
  ];
}

describe("useResourcesWithDraft", () => {
  it("returns input unchanged when no draft", () => {
    const resources = makeResources();
    let captured: ReturnType<typeof makeResources> = [];
    render(<HookHarness resources={resources} onResolve={(r) => { captured = r; }} />);
    expect(captured).toBe(resources);
  });

  it("injects synthetic event into the matching tech's events", () => {
    const resources = makeResources();
    let captured: ReturnType<typeof makeResources> = [];
    const { rerender } = render(
      <HookHarness resources={resources} onResolve={(r) => { captured = r; }} />,
    );
    act(() => {
      useCalendarStore.getState().createDraft({
        date: "2026-04-21",
        startMinutes: 720,
        technicianId: 2,
      });
    });
    rerender(<HookHarness resources={resources} onResolve={(r) => { captured = r; }} />);
    const bob = captured.find((r) => r.id === 2);
    expect(bob).toBeDefined();
    expect(bob!.events).toHaveLength(1);
    expect(bob!.events[0].id).toBe(SYNTHETIC_DRAFT_EVENT_ID);
    expect(bob!.events[0].from).toBe(720);
    expect(bob!.events[0].meta?.isDraft).toBe(true);
    // Alice's events untouched.
    const alice = captured.find((r) => r.id === 1);
    expect(alice!.events).toHaveLength(1);
    expect(alice!.events[0].id).toBe(100);
  });

  it("does NOT inject any synthetic event when draft has no technician (P2-FE-8)", () => {
    // Was: "falls back to first resource when draft has no technician
    // assignment". P2-FE-8 (avatar slide-down selector) replaced that
    // chunk-1 compromise — null-tech drafts now render the
    // EmbeddedAvatarSelector instead of attaching to resources[0].
    // See PLAN-DEVIATIONS.md#2026-04-23-empty-mode-draft-vanish.
    const resources = makeResources();
    let captured: ReturnType<typeof makeResources> = [];
    const { rerender } = render(
      <HookHarness resources={resources} onResolve={(r) => { captured = r; }} />,
    );
    act(() => {
      useCalendarStore.getState().createDraft({
        date: "2026-04-21",
        startMinutes: 600,
        technicianId: null,
      });
    });
    rerender(<HookHarness resources={resources} onResolve={(r) => { captured = r; }} />);
    for (const r of captured) {
      expect(r.events.some((e) => e.id === SYNTHETIC_DRAFT_EVENT_ID)).toBe(false);
    }
  });

  it("returns input unchanged when resources is empty", () => {
    let captured: ReturnType<typeof makeResources> = [];
    const { rerender } = render(
      <HookHarness resources={[]} onResolve={(r) => { captured = r; }} />,
    );
    act(() => {
      useCalendarStore.getState().createDraft({
        date: "2026-04-21",
        startMinutes: 600,
        technicianId: 7,
      });
    });
    rerender(<HookHarness resources={[]} onResolve={(r) => { captured = r; }} />);
    expect(captured).toEqual([]);
  });
});

// Silence "not wrapped in act()" noise from the jest-expo runner when
// the store mutates outside a render cycle. The above tests use act()
// where it matters; this is for any straggling re-renders.
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const msg = String(args[0] ?? "");
    if (msg.includes("not wrapped in act")) return;
    originalError(...(args as Parameters<typeof console.error>));
  };
});
afterAll(() => {
  console.error = originalError;
});
// Hint to the linter that `Text` and friends are used implicitly via
// the snapshot tree — keeps the import rule satisfied.
void Text;
