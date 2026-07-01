/**
 * Pure-function spec for `resolveLandedResourceId` (vendored
 * `react-native-resource-calendar` Phase 15, P2-FE-4 follow-up #11).
 *
 * The helper lives inside the vendored library and is invoked from the
 * gesture worklet machinery (`finalizeDrag`); it was extracted as a
 * pure function specifically so this contract could be unit-tested
 * without driving FlashList / reanimated / gesture-handler.
 *
 * Coverage axes:
 *   - Single-day mode: colIndex maps directly to bodyResourceIds.
 *   - Multi-day "mini-columns" with 2+ techs: lane index resolved from
 *     in-column X offset; clamps to lane 0 / last lane at boundaries.
 *   - Multi-day "stacked" with 2+ techs: keeps the dragged event's
 *     original tech (no spatial reassignment).
 *   - Multi-day single-tech / undefined multiTechMode: keeps original
 *     tech (no overlay treatment active).
 *   - Resize: never reassigns regardless of mode.
 *   - Defensive fallbacks: missing selectedEvent → activeResourceId →
 *     resourceIds[0].
 */

// The library is mocked in `LandscapeWorkweekView.test.tsx` /
// `avatar-strip.test.tsx`; here we want the REAL helper, so import
// directly. Pure JS, no RN/React internals on this code path.
import { resolveLandedResourceId } from "react-native-resource-calendar";

type ResolveArgs = Parameters<typeof resolveLandedResourceId>[0];

const RESOURCE_IDS = [11, 22, 33] as const;
const baseEvent = {
  id: 9001,
  resourceId: 22,
  date: new Date("2026-04-20"),
  from: 9 * 60,
  to: 10 * 60,
  title: "Test event",
} as unknown as ResolveArgs["selectedEvent"];

function args(overrides: Partial<ResolveArgs> = {}): ResolveArgs {
  return {
    mode: "3days",
    colIndex: 0,
    bodyResourceIds: [...RESOURCE_IDS],
    resourceIds: [...RESOURCE_IDS],
    selectedEvent: baseEvent,
    activeResourceId: null,
    multiTechMode: undefined,
    bodyBlockWidth: 300,
    xWithinColumn: 0,
    isResize: false,
    ...overrides,
  };
}

describe("resolveLandedResourceId — single-day mode", () => {
  it("returns the bodyResourceIds[colIndex] for the dropped column", () => {
    expect(
      resolveLandedResourceId(
        args({ mode: "day", colIndex: 0, bodyResourceIds: [11, 22, 33] }),
      ),
    ).toBe(11);
    expect(
      resolveLandedResourceId(
        args({ mode: "day", colIndex: 1, bodyResourceIds: [11, 22, 33] }),
      ),
    ).toBe(22);
    expect(
      resolveLandedResourceId(
        args({ mode: "day", colIndex: 2, bodyResourceIds: [11, 22, 33] }),
      ),
    ).toBe(33);
  });

  it("ignores multiTechMode in single-day mode (each column already IS a tech)", () => {
    // mini-columns is a multi-day-only treatment; in single-day mode
    // the col index alone should drive the answer regardless of any
    // accidental prop pass-through.
    expect(
      resolveLandedResourceId(
        args({
          mode: "day",
          colIndex: 2,
          bodyResourceIds: [11, 22, 33],
          multiTechMode: "mini-columns",
          xWithinColumn: 5,
        }),
      ),
    ).toBe(33);
  });
});

describe("resolveLandedResourceId — multi-day mini-columns (NEW: spatial lane resolution)", () => {
  // 3 techs × 300pt wide column → 100pt per lane.
  // Lane 0: [0, 100), Lane 1: [100, 200), Lane 2: [200, 300).
  it.each([
    ["lane 0 left edge", 0, 11],
    ["lane 0 mid", 50, 11],
    ["lane 1 left edge", 100, 22],
    ["lane 1 mid", 150, 22],
    ["lane 2 left edge", 200, 33],
    ["lane 2 mid", 250, 33],
    ["lane 2 right edge inside column", 299.99, 33],
  ])("resolves %s (xWithinColumn=%p) to resource %p", (_, x, expected) => {
    expect(
      resolveLandedResourceId(
        args({
          mode: "3days",
          bodyResourceIds: [11, 22, 33],
          multiTechMode: "mini-columns",
          bodyBlockWidth: 300,
          xWithinColumn: x,
        }),
      ),
    ).toBe(expected);
  });

  it("clamps a negative xWithinColumn to lane 0 (drop to the left of the column)", () => {
    expect(
      resolveLandedResourceId(
        args({
          mode: "3days",
          bodyResourceIds: [11, 22, 33],
          multiTechMode: "mini-columns",
          bodyBlockWidth: 300,
          xWithinColumn: -25,
        }),
      ),
    ).toBe(11);
  });

  it("clamps an over-wide xWithinColumn to the last lane (drop to the right of the column)", () => {
    expect(
      resolveLandedResourceId(
        args({
          mode: "3days",
          bodyResourceIds: [11, 22, 33],
          multiTechMode: "mini-columns",
          bodyBlockWidth: 300,
          xWithinColumn: 9999,
        }),
      ),
    ).toBe(33);
  });

  it("falls through to the keep-original branch when xWithinColumn is null/undefined (defensive)", () => {
    // No spatial signal available — should NOT guess a lane. Falls
    // through to selectedEvent.resourceId (= 22 in the fixture).
    expect(
      resolveLandedResourceId(
        args({
          mode: "3days",
          bodyResourceIds: [11, 22, 33],
          multiTechMode: "mini-columns",
          bodyBlockWidth: 300,
          xWithinColumn: null,
        }),
      ),
    ).toBe(22);
    expect(
      resolveLandedResourceId(
        args({
          mode: "3days",
          bodyResourceIds: [11, 22, 33],
          multiTechMode: "mini-columns",
          bodyBlockWidth: 300,
          xWithinColumn: undefined,
        }),
      ),
    ).toBe(22);
  });

  it("falls through to the keep-original branch when only one tech is selected (no overlap to resolve)", () => {
    // techCount === 1 disables the multi-tech branch even with
    // mini-columns + a valid xWithinColumn.
    expect(
      resolveLandedResourceId(
        args({
          mode: "3days",
          bodyResourceIds: [22],
          multiTechMode: "mini-columns",
          bodyBlockWidth: 300,
          xWithinColumn: 250,
        }),
      ),
    ).toBe(22);
  });

  it("falls through to the keep-original branch when isResize=true", () => {
    // Resize never reassigns regardless of mode / treatment.
    expect(
      resolveLandedResourceId(
        args({
          mode: "3days",
          bodyResourceIds: [11, 22, 33],
          multiTechMode: "mini-columns",
          bodyBlockWidth: 300,
          xWithinColumn: 250,
          isResize: true,
        }),
      ),
    ).toBe(22);
  });
});

describe("resolveLandedResourceId — multi-day stacked (overlap)", () => {
  it("keeps the dragged event's original tech regardless of drop X", () => {
    // Stacked overlay has no spatial signal between techs — the
    // resolver must return the originating resourceId.
    expect(
      resolveLandedResourceId(
        args({
          mode: "3days",
          bodyResourceIds: [11, 22, 33],
          multiTechMode: "stacked",
          bodyBlockWidth: 300,
          xWithinColumn: 5, // visually over tech 11 in mini-cols, but stacked ignores
          selectedEvent: { ...baseEvent, resourceId: 33 } as ResolveArgs["selectedEvent"],
        }),
      ),
    ).toBe(33);
  });

  it("falls back to activeResourceId when selectedEvent.resourceId is missing", () => {
    expect(
      resolveLandedResourceId(
        args({
          mode: "3days",
          bodyResourceIds: [11, 22, 33],
          multiTechMode: "stacked",
          selectedEvent: null,
          activeResourceId: 11,
        }),
      ),
    ).toBe(11);
  });

  it("falls back to resourceIds[0] when both selectedEvent and activeResourceId are missing", () => {
    expect(
      resolveLandedResourceId(
        args({
          mode: "3days",
          bodyResourceIds: [11, 22, 33],
          multiTechMode: "stacked",
          selectedEvent: null,
          activeResourceId: null,
        }),
      ),
    ).toBe(11);
  });
});

describe("resolveLandedResourceId — multi-day with no multiTechMode / single-tech", () => {
  it("keeps original tech when multiTechMode is undefined (legacy callers)", () => {
    expect(
      resolveLandedResourceId(
        args({
          mode: "3days",
          bodyResourceIds: [11, 22, 33],
          multiTechMode: undefined,
          xWithinColumn: 250,
        }),
      ),
    ).toBe(22);
  });

  it("keeps original tech when only one tech is in scope", () => {
    expect(
      resolveLandedResourceId(
        args({
          mode: "3days",
          bodyResourceIds: [22],
          multiTechMode: "stacked",
        }),
      ),
    ).toBe(22);
  });
});

describe("resolveLandedResourceId — Phase 21 single-tech-narrowed body (P2-FE-6 hover-dwell)", () => {
  // Dwell pattern: drag starts on multi-tech body, user dwells on
  // tech B's avatar → buzz 3 commits → body narrows to [B]. The
  // dragged event's original resourceId (selectedEvent.resourceId) is
  // still tech A. On drop, the visible body is tech B's calendar, so
  // the destination MUST be B regardless of original.
  it("returns the visible single tech when body narrowed to [B] but dragged event originated on A", () => {
    expect(
      resolveLandedResourceId(
        args({
          mode: "3days",
          bodyResourceIds: [33], // narrowed to tech 33 via dwell
          resourceIds: [11, 22, 33],
          selectedEvent: { ...baseEvent, resourceId: 11 } as ResolveArgs["selectedEvent"], // original = tech 11
          multiTechMode: undefined,
          xWithinColumn: 50,
        }),
      ),
    ).toBe(33);
  });

  it("still returns visible tech for synthetic draft (selectedEvent.resourceId pinned to first multi-tech resource)", () => {
    // Long-press on empty multi-tech grid creates a draft pinned to
    // bodyResourceIds[0] of THAT moment (tech 11). User then dwells
    // to tech 22, body narrows to [22]. Drop must land on 22 (not
    // the pinned 11).
    expect(
      resolveLandedResourceId(
        args({
          mode: "3days",
          bodyResourceIds: [22],
          resourceIds: [11, 22, 33],
          selectedEvent: { ...baseEvent, id: -1, resourceId: 11 } as ResolveArgs["selectedEvent"],
          multiTechMode: undefined,
          xWithinColumn: 80,
        }),
      ),
    ).toBe(22);
  });

  it("single-tech body in mini-columns mode also returns the visible tech (techCount === 1 short-circuits)", () => {
    // Single-tech body should NEVER reach the mini-columns lane
    // resolver (you can't have lanes with one tech).
    expect(
      resolveLandedResourceId(
        args({
          mode: "3days",
          bodyResourceIds: [22],
          resourceIds: [11, 22, 33],
          selectedEvent: { ...baseEvent, resourceId: 33 } as ResolveArgs["selectedEvent"],
          multiTechMode: "mini-columns",
          bodyBlockWidth: 300,
          xWithinColumn: 100,
        }),
      ),
    ).toBe(22);
  });

  it("single-tech body with isResize=true also returns visible tech (no original-tech preservation)", () => {
    // Resize on a single-tech narrowed view: visible === valid drop
    // target. (This case rarely matters in practice because original
    // === visible for honest single-tech sessions; the dwell pattern
    // creates the only realistic divergence and dwell uses move not
    // resize. Branch is exercised here for completeness.)
    expect(
      resolveLandedResourceId(
        args({
          mode: "3days",
          bodyResourceIds: [22],
          resourceIds: [11, 22, 33],
          selectedEvent: { ...baseEvent, resourceId: 11 } as ResolveArgs["selectedEvent"],
          multiTechMode: "stacked",
          isResize: true,
        }),
      ),
    ).toBe(22);
  });
});
