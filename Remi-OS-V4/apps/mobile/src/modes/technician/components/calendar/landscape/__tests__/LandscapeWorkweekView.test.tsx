/**
 * Tests for `LandscapeWorkweekView` (P2-FE-4).
 *
 * NOTE: this repo does not currently ship a Jest runner. The master
 * plan §1.2 / §3.10 assumes one exists ("REMITechnician's Jest config
 * aliases…") but the scaffold was never landed in this codebase.
 * Wiring `jest-expo` + `@testing-library/react-native` is tracked
 * separately and is OTA-eligible (devDeps only); this file follows the
 * same precedent established by `P0-FE-1`'s
 * `src/stores/__tests__/accessibility.test.ts`, `P0-FE-2`'s
 * `src/utils/__tests__/color-for-tech.test.ts`, and `P0-FE-7`'s
 * `src/hooks/ui/__tests__/use-wide-canvas.test.ts`.
 *
 * Until then this file is excluded from `tsc --noEmit` via the
 * `**\/__tests__\/**` entry in `tsconfig.json` and is treated as
 * executable specification — every assertion below should pass once
 * the runner lands. The shape is standard `jest-expo` +
 * `@testing-library/react-native` semantics.
 *
 * Coverage axes (per the P2-FE-4 prompt's "tests" deliverable):
 *
 *   - 0 / 1 / 2 / 3 selected techs → correct render mode (empty
 *     grid, status palette, overlay palette).
 *   - preferredHand left vs. right → strip on the matching side.
 *   - Personal events in overlay mode rendered with the diagonal
 *     stripe overlay.
 *
 * `useStrip-side`-style internal layout assertions go through
 * `testID="landscape-workweek-view"` whose flexDirection encodes
 * which edge the strip is anchored to (`row` = strip first, left;
 * `row-reverse` = strip last, right).
 */

import { act, fireEvent, render } from "@testing-library/react-native";

import { LandscapeWorkweekView } from "../LandscapeWorkweekView";
import { CalendarBindingProvider } from "react-native-resource-calendar";
import type { CalendarDayResponse } from "@technician/types/calendar";

// The vendored Calendar performs a lot of native work (gesture
// handlers, reanimated shared values) we don't need in this spec; mock
// it to a thin sentinel that exposes the props for assertion.
jest.mock("react-native-resource-calendar", () => {
  const React = require("react");
  const { View, Text } = require("react-native");
  return {
    __esModule: true,
    Calendar: (props: Record<string, unknown>) => (
      <View
        testID="rc-calendar-mock"
        {...{ "data-props": JSON.stringify({
          mode: props.mode,
          multiDayCount: props.multiDayCount,
          resourceCount: Array.isArray(props.resources) ? props.resources.length : 0,
          totalEvents: Array.isArray(props.resources)
            ? (props.resources as { events: unknown[] }[]).reduce(
                (s, r) => s + (Array.isArray(r.events) ? r.events.length : 0),
                0,
              )
            : 0,
          selectedResourceIds: props.selectedResourceIds,
          hasOverlayBody: !!(props as { eventSlots?: { Body?: unknown } }).eventSlots
            ?.Body,
          viewportWidth: typeof props.viewportWidth === "number" ? props.viewportWidth : null,
          showResourceHeader:
            typeof props.showResourceHeader === "boolean"
              ? props.showResourceHeader
              : null,
          multiTechMode:
            typeof props.multiTechMode === "string" ? props.multiTechMode : null,
          // FORK Phase 28.2-logging — capture the calendarId prop so
          // the test below can assert that the landscape canvas tags
          // its log lines with the WORKWEEK-LANDSCAPE identifier.
          calendarId: typeof props.calendarId === "string" ? props.calendarId : null,
        }) }}
      >
        <Text>{JSON.stringify({
          mode: props.mode,
          multiDayCount: props.multiDayCount,
          selectedResourceIds: props.selectedResourceIds ?? null,
        })}</Text>
      </View>
    ),
    CalendarBindingProvider: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    // `useClearSelectionOnUnmount` (in `resource-calendar-day-view.tsx`,
    // re-exported transitively via `LandscapeWorkweekView`) calls
    // `useCalendarBinding()` to grab the store's setter hooks and
    // clear selection / drag state on unmount. P2-FE-6 added an
    // inline `useDraggedEventDraftSubscription(onDragEnd)` call at
    // the top of `LandscapeWorkweekView` (under the hover-dwell
    // model — see PLAN-DEVIATION
    // 2026-04-22-hover-dwell-avatar-navigator) which ALSO consumes
    // the binding via `useGetDraggedEventDraft` /
    // `useGetSelectedEvent`. The mock returns no-op stubs for the
    // full surface touched by both code paths so neither crashes
    // on mount. Drag behaviour itself is exercised in
    // `use-drag-to-avatar.test.tsx`.
    useCalendarBinding: () => ({
      useSetSelectedEvent: () => () => {},
      useSetDraggedEventDraft: () => () => {},
      useGetDraggedEventDraft: () => null,
      useGetSelectedEvent: () => null,
    }),
    // FORK Phase 18 + 19 (P2-FE-6): `useDragToAvatar` (mounted by
    // `LandscapeWorkweekView`) calls `useDragSharedValues()` from the
    // vendored calendar to read the per-frame drag SVs. The real
    // implementation throws outside `<CalendarBindingProvider>`; this
    // mock returns inert mutable cells (Phase 19 `fingerXAbs/YAbs`
    // initialised to NaN to mirror the real provider's contract).
    useDragSharedValues: () => ({
      panXAbs: { value: 0 },
      panYAbs: { value: 0 },
      isDragging: { value: false },
      fingerXAbs: { value: Number.NaN },
      fingerYAbs: { value: Number.NaN },
    }),
  };
});

jest.mock("@technician/components/route/franchise-route-map", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    FranchiseRouteMap: (props: {
      franchiseId: number;
      date: string;
      fullBleed?: boolean;
    }) => (
      <View
        testID="franchise-route-map-mock"
        {...{
          "data-props": JSON.stringify({
            franchiseId: props.franchiseId,
            date: props.date,
            fullBleed: !!props.fullBleed,
          }),
        }}
      />
    ),
  };
});

const TECHS = [
  { id: 11, name: "Alex" },
  { id: 22, name: "Bea" },
  { id: 33, name: "Cam" },
];

function buildWeek(): CalendarDayResponse[] {
  return [
    {
      date: "2026-04-20",
      technicians: TECHS.map((t) => ({
        technician_id: t.id,
        technician_name: t.name,
        profile_image_url: null,
        job_count: 1,
        completed_count: 0,
        appointments: [
          {
            id: t.id * 100,
            customer_name: `Customer ${t.id}`,
            scheduled_date: "2026-04-20",
            scheduled_time: "09:00:00",
            scheduled_end_time: "10:00:00",
            slot_type: "standard",
            status: "confirmed",
            services: [],
            tax_lines: [],
            alerts: [],
            booking_method: "manual",
          } as never,
        ],
        personal_events:
          t.id === 22
            ? [
                {
                  id: `pe-${t.id}`,
                  franchise_id: 1,
                  created_by: t.id,
                  title: "Lunch",
                  date: "2026-04-20",
                  start_time: "12:00:00",
                  end_time: "13:00:00",
                  duration_minutes: 60,
                  recurrence_rule: null,
                  notes: null,
                  shared_with: [],
                  created_at: "",
                  updated_at: "",
                },
              ]
            : [],
      })),
    },
  ];
}

function getMockProps(node: ReturnType<typeof render>) {
  const calendar = node.getByTestId("rc-calendar-mock");
  const raw = (calendar.props as Record<string, string>)["data-props"];
  return JSON.parse(raw) as {
    mode: string;
    multiDayCount: number;
    resourceCount: number;
    totalEvents: number;
    selectedResourceIds?: number[];
    hasOverlayBody: boolean;
    viewportWidth: number | null;
    showResourceHeader: boolean | null;
    multiTechMode: "stacked" | "mini-columns" | null;
    calendarId: string | null;
  };
}

describe("LandscapeWorkweekView — selection rendering modes", () => {
  it("0 selected techs → empty grid (resources defined, zero events, no body slot)", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    const props = getMockProps(node);
    expect(props.resourceCount).toBe(3);
    expect(props.totalEvents).toBe(0);
    expect(props.hasOverlayBody).toBe(false);
    // 0-tech mode passes undefined so the library shows every column.
    expect(props.selectedResourceIds).toBeUndefined();
  });

  it("1 selected tech → status palette (no overlay body, all events present)", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    const props = getMockProps(node);
    expect(props.resourceCount).toBe(3);
    // events are kept on every resource so toggling selection doesn't
    // require remap; library hides body columns of unselected techs
    // through `selectedResourceIds`.
    expect(props.totalEvents).toBeGreaterThan(0);
    expect(props.selectedResourceIds).toEqual([11]);
    expect(props.hasOverlayBody).toBe(false);
  });

  it("2 selected techs → multi-tech solid mode (no custom overlay body slots)", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11, 22]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    const props = getMockProps(node);
    expect(props.selectedResourceIds).toEqual([11, 22]);
    expect(props.hasOverlayBody).toBe(false);
  });

  it("3 selected techs → still multi-tech solid mode (cardinality boundary >= 2)", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11, 22, 33]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    const props = getMockProps(node);
    expect(props.selectedResourceIds).toEqual([11, 22, 33]);
    expect(props.hasOverlayBody).toBe(false);
  });
});

describe("LandscapeWorkweekView — preferredHand strip placement", () => {
  it("renders the avatar strip on the right edge when preferredHand='right' (row-reverse)", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    const root = node.getByTestId("landscape-workweek-view");
    const flat = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style)
      : root.props.style;
    expect(flat.flexDirection).toBe("row-reverse");
  });

  it("renders the avatar strip on the left edge when preferredHand='left' (row)", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[]}
          preferredHandOverride="left"
        />
      </CalendarBindingProvider>,
    );
    const root = node.getByTestId("landscape-workweek-view");
    const flat = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style)
      : root.props.style;
    expect(flat.flexDirection).toBe("row");
  });
});

describe("LandscapeWorkweekView — map toggle (P2-FE-7)", () => {
  it("preferredHand='right' anchors the map toggle EdgeTab to the LEFT canvas edge (opposite the right-side avatar strip)", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11]}
          preferredHandOverride="right"
          safeAreaInsetsOverride={{ top: 4, right: 9, bottom: 0, left: 13 }}
        />
      </CalendarBindingProvider>,
    );
    const anchor = node.getByTestId("landscape-map-toggle-anchor");
    const flat = Array.isArray(anchor.props.style)
      ? Object.assign({}, ...anchor.props.style.filter(Boolean))
      : anchor.props.style;
    // Container is anchored 16px PAST the screen's left edge so the
    // dark handle background bleeds off the device wall (the handle's
    // own paddingLeft compensates so icons stay visible). Top is
    // nudged 13 below the inset to clear the status bar.
    expect(flat.left).toBe(-16);
    expect(flat.top).toBe(17);
    expect(flat.flexDirection).toBe("row");
  });

  it("preferredHand='left' anchors the map toggle EdgeTab to the RIGHT canvas edge (opposite the left-side avatar strip)", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11]}
          preferredHandOverride="left"
          safeAreaInsetsOverride={{ top: 4, right: 9, bottom: 0, left: 13 }}
        />
      </CalendarBindingProvider>,
    );
    const anchor = node.getByTestId("landscape-map-toggle-anchor");
    const flat = Array.isArray(anchor.props.style)
      ? Object.assign({}, ...anchor.props.style.filter(Boolean))
      : anchor.props.style;
    expect(flat.right).toBe(-16);
    expect(flat.top).toBe(17);
    expect(flat.flexDirection).toBe("row");
  });

  it("map toggle tab switches map mode and swaps the rendered child (calendar grid ↔ full-bleed map)", () => {
    jest.useFakeTimers();
    try {
      const node = render(
        <CalendarBindingProvider>
          <LandscapeWorkweekView
            franchiseId={7}
            selectedDate="2026-04-22"
            weekData={buildWeek()}
            workweekStartDate="2026-04-20"
            hourHeight={48}
            availableTechs={TECHS}
            selectedTechIdsOverride={[11]}
            preferredHandOverride="right"
            mapFadeDurationMsOverride={0}
          />
        </CalendarBindingProvider>,
      );
      expect(node.getByTestId("rc-calendar-mock")).toBeTruthy();
      expect(node.queryByTestId("franchise-route-map-mock")).toBeNull();

      act(() => {
        fireEvent.press(node.getByTestId("landscape-map-toggle-button"));
      });
      expect(node.getByTestId("landscape-map-toggle-anchor-panel")).toBeTruthy();
      act(() => {
        fireEvent.press(node.getByTestId("landscape-map-toggle-segment-map"));
        jest.runAllTimers();
      });
      expect(node.queryByTestId("rc-calendar-mock")).toBeNull();
      const map = node.getByTestId("franchise-route-map-mock");
      const mapProps = JSON.parse(
        (map.props as Record<string, string>)["data-props"],
      ) as { franchiseId: number; date: string; fullBleed: boolean };
      expect(mapProps).toEqual({
        franchiseId: 7,
        date: "2026-04-22",
        fullBleed: true,
      });

      act(() => {
        fireEvent.press(node.getByTestId("landscape-map-toggle-button"));
      });
      expect(node.getByTestId("landscape-map-toggle-anchor-panel")).toBeTruthy();
      act(() => {
        fireEvent.press(node.getByTestId("landscape-map-toggle-segment-grid"));
        jest.runAllTimers();
      });
      expect(node.getByTestId("rc-calendar-mock")).toBeTruthy();
      expect(node.queryByTestId("franchise-route-map-mock")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("LandscapeWorkweekView — personal events while multi-tech is active", () => {
  it("does NOT wire overlay body slots in multi-tech solid mode", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          // Tech id 22 owns the personal event "Lunch" in `buildWeek`.
          selectedTechIdsOverride={[11, 22]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    // The mocked Calendar exposes the eventSlots.Body presence flag;
    // the actual stripe rendering is unit-tested separately under
    // `diagonal-stripe-overlay.tsx`. Asserting the slot is wired here
    // is the contract this view owns — without it, the stripe could
    // never reach the screen.
    const props = getMockProps(node);
    expect(props.hasOverlayBody).toBe(false);
  });

  it("does NOT wire the overlay body slot when in 1-tech mode (status palette retains default body)", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[22]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    const props = getMockProps(node);
    expect(props.hasOverlayBody).toBe(false);
  });
});

describe("LandscapeWorkweekView — safe-area / notch handling", () => {
  it("only applies bottom inset to the canvas container — the strip's split layout clears the strip-side notch and the grid clears the opposite side", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11]}
          preferredHandOverride="right"
          safeAreaInsetsOverride={{ top: 0, right: 47, bottom: 21, left: 47 }}
        />
      </CalendarBindingProvider>,
    );
    const root = node.getByTestId("landscape-workweek-view");
    const flat = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style)
      : root.props.style;
    // Home indicator clearance — affects both the strip's bottom group
    // and the grid's bottom edge so it lives on the canvas root.
    expect(flat.paddingBottom).toBe(21);
    // The split layout reclaims the strip-side L/R inset; we MUST NOT
    // pad the canvas root or we'll double-inset the strip and waste
    // calendar space (the user-reported regression that motivated the
    // split layout in the first place).
    expect(flat.paddingLeft).toBeUndefined();
    expect(flat.paddingRight).toBeUndefined();
    // §5.1.1 wants the calendar to extend under the translucent status
    // bar, so paddingTop must NOT be applied.
    expect(flat.paddingTop).toBeUndefined();
  });

  it("strip on RIGHT → grid has NO L/R padding (time gutter sits flush against the left edge per user preference, follow-up after P2-FE-4 #6)", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11]}
          preferredHandOverride="right"
          safeAreaInsetsOverride={{ top: 0, right: 47, bottom: 21, left: 47 }}
        />
      </CalendarBindingProvider>,
    );
    const grid = node.getByTestId("landscape-workweek-grid");
    const flat = Array.isArray(grid.props.style)
      ? Object.assign({}, ...grid.props.style)
      : grid.props.style;
    // Right-hand mode: deliberately flush — neither paddingLeft nor
    // paddingRight on the grid. The strip-side edge is handled by
    // the strip itself; the gutter-side edge runs to the screen
    // boundary by user preference. Asymmetric with the left-hand
    // case below — see the inline comment in
    // `LandscapeWorkweekView.tsx` for the rationale.
    expect(flat.paddingLeft).toBeUndefined();
    expect(flat.paddingRight).toBeUndefined();
  });

  it("strip on LEFT → paddingRight on grid (mirror case stays inset, per user preference)", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11]}
          preferredHandOverride="left"
          safeAreaInsetsOverride={{ top: 0, right: 47, bottom: 21, left: 47 }}
        />
      </CalendarBindingProvider>,
    );
    const grid = node.getByTestId("landscape-workweek-grid");
    const flat = Array.isArray(grid.props.style)
      ? Object.assign({}, ...grid.props.style)
      : grid.props.style;
    expect(flat.paddingRight).toBe(47);
    expect(flat.paddingLeft).toBeUndefined();
  });
});

describe("LandscapeWorkweekView — primary + secondary avatar strips", () => {
  // Helper: synthesize a roster of N techs and a matching weekData
  // payload so the calendar mock + strip allocation both have
  // consistent input.
  const makeRoster = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: 100 + i,
      name: `Roster${i + 1}`,
    }));
  const makeWeekFor = (techs: { id: number; name: string }[]): CalendarDayResponse[] => [
    {
      date: "2026-04-20",
      technicians: techs.map((t) => ({
        ...t,
        appointments: [],
        personalEvents: [],
      })),
    } as unknown as CalendarDayResponse,
  ];

  it("at 6 techs: primary strip caps at 4 (split 2 top + 2 bottom) and the remaining 2 go to the secondary overflow strip", () => {
    const techs = makeRoster(6);
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={makeWeekFor(techs)}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={techs}
          selectedTechIdsOverride={[]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    // Primary strip: split layout with the 1-slot top offset (clears
    // the date-label area on the calendar header).
    expect(node.getByTestId("avatar-strip-split")).toBeTruthy();
    expect(node.getByTestId("avatar-strip-top-offset")).toBeTruthy();
    // 4 in primary → ceil(4/2)=2 top, floor(4/2)=2 bottom
    expect(node.getByTestId("avatar-strip-top-group").props.children).toHaveLength(2);
    expect(node.getByTestId("avatar-strip-bottom-group").props.children).toHaveLength(2);
    // 6 total chips (4 in primary + 2 in overflow). The current
    // `TechAvatarChip` accessibility surface exposes initials text, so
    // we count rendered initials here instead of accessibility labels.
    expect(node.getAllByText("RO")).toHaveLength(6);
    expect(node.getByLabelText("Calendar technician filter — overflow")).toBeTruthy();
  });

  it("at 4 techs (= primary cap): no secondary strip is rendered — keeps the calendar 44pt wider", () => {
    const techs = makeRoster(4);
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={makeWeekFor(techs)}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={techs}
          selectedTechIdsOverride={[]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    expect(node.queryByLabelText("Calendar technician filter — overflow")).toBeNull();
    expect(node.getByTestId("avatar-strip-top-group").props.children).toHaveLength(2);
    expect(node.getByTestId("avatar-strip-bottom-group").props.children).toHaveLength(2);
  });

  it("at 1 tech: still uses the split layout with a top offset; bottom group is empty (degrades gracefully for tiny rosters)", () => {
    const techs = makeRoster(1);
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={makeWeekFor(techs)}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={techs}
          selectedTechIdsOverride={[]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    expect(node.getByTestId("avatar-strip-top-group").props.children).toHaveLength(1);
    expect(node.getByTestId("avatar-strip-bottom-group").props.children).toHaveLength(0);
    expect(node.queryByLabelText("Calendar technician filter — overflow")).toBeNull();
  });

  it("the primary strip's top offset is exactly 1 slot (44pt) — clears the calendar header where date labels render", () => {
    const techs = makeRoster(4);
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={makeWeekFor(techs)}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={techs}
          selectedTechIdsOverride={[]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    expect(
      node.getByTestId("avatar-strip-top-offset").props.style,
    ).toMatchObject({ height: 44 });
  });

  it("preserves preferredHand placement with two strips: row-reverse on right means the canvas paints the secondary strip second (immediately inside the primary edge-flush strip)", () => {
    const techs = makeRoster(6);
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={makeWeekFor(techs)}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={techs}
          selectedTechIdsOverride={[]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    const root = node.getByTestId("landscape-workweek-view");
    const flat = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style)
      : root.props.style;
    // row-reverse → DOM-order [primary, secondary, calendarWrap] paints
    // as [calendarWrap, secondary, primary] left-to-right, so the
    // primary strip lands on the right edge with the secondary strip
    // tucked just inside it.
    expect(flat.flexDirection).toBe("row-reverse");
  });
});

describe("LandscapeWorkweekView — viewportWidth threading (P2-FE-4 follow-up #5)", () => {
  // Context: the vendored library's `APPOINTMENT_BLOCK_WIDTH` /
  // `BODY_BLOCK_WIDTH` math reads `useWindowDimensions().width` by
  // default. With the landscape strip(s) eating 44–88pt of horizontal
  // real estate, the calendar's own container is narrower than the
  // window, so portrait-default column widths overflow and the
  // `DaysComponent` date labels bleed outside the calendar wrapper.
  // The fix threads a measured wrapper width via the new fork-only
  // `viewportWidth` prop. These tests assert the wiring, not the
  // downstream column math (that lives in the fork and is covered by
  // the library's own layout log).

  it("passes the explicit `calendarViewportWidthOverride` straight through to the Calendar as `viewportWidth`", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11, 22]}
          preferredHandOverride="right"
          // Simulate a measured 800pt wide calendar wrapper (iPhone
          // 15 Pro landscape — 852 window width minus a 44pt primary
          // strip minus an 8pt right-edge safe-area inset).
          calendarViewportWidthOverride={800}
        />
      </CalendarBindingProvider>,
    );
    const props = getMockProps(node);
    expect(props.viewportWidth).toBe(800);
  });

  it("passes `undefined` on the first frame (before onLayout fires) so the library falls back to useWindowDimensions() — no visible regression for portrait-style full-bleed mounts", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11]}
          preferredHandOverride="right"
          // No override and no synthesized onLayout event — this
          // mirrors the initial render frame.
        />
      </CalendarBindingProvider>,
    );
    const props = getMockProps(node);
    expect(props.viewportWidth).toBeNull();
  });

  it("still wires an onLayout handler on the calendar wrapper so the library picks up the measured width on the next frame", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    const grid = node.getByTestId("landscape-workweek-grid");
    // The onLayout handler is the callback that feeds
    // `setMeasuredCalendarWidth` which in turn feeds `viewportWidth`
    // on subsequent renders. Without it, the library stays on the
    // window-width fallback forever and the bleed returns.
    expect(typeof grid.props.onLayout).toBe("function");
  });

  it("threads a re-measured width after onLayout fires (simulates rotation / strip-visibility change)", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    const grid = node.getByTestId("landscape-workweek-grid");
    // Synthesize an onLayout event the way RN would fire it with the
    // measured container rect. The handler commits the value into
    // local state; the next render should see it as `viewportWidth`.
    const onLayout = grid.props.onLayout as (e: {
      nativeEvent: { layout: { x: number; y: number; width: number; height: number } };
    }) => void;
    // Wrap in `act` so the `setMeasuredCalendarWidth` state update flushes
    // before we re-read mock props. Without this, React 19's concurrent
    // batching defers the commit and `props.viewportWidth` reads back as
    // `null`. The runtime behavior is unchanged — RN's `onLayout` callback
    // already fires inside React's update boundary on real devices; the
    // wrapper is only needed in the test environment.
    act(() => {
      onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 760, height: 380 } } });
    });
    const props = getMockProps(node);
    expect(props.viewportWidth).toBe(760);
  });

  it("ignores a zero-width measurement (guard against the first-paint 0-size frame some RN layouts emit)", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    const grid = node.getByTestId("landscape-workweek-grid");
    const onLayout = grid.props.onLayout as (e: {
      nativeEvent: { layout: { x: number; y: number; width: number; height: number } };
    }) => void;
    act(() => {
      onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 0, height: 0 } } });
    });
    const props = getMockProps(node);
    // Zero width must NOT commit — it would divide every column by 0
    // downstream and crash the grid.
    expect(props.viewportWidth).toBeNull();
  });

  it("override wins over a stale onLayout measurement so tests stay deterministic", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11]}
          preferredHandOverride="right"
          calendarViewportWidthOverride={900}
        />
      </CalendarBindingProvider>,
    );
    const grid = node.getByTestId("landscape-workweek-grid");
    const onLayout = grid.props.onLayout as (e: {
      nativeEvent: { layout: { x: number; y: number; width: number; height: number } };
    }) => void;
    onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 123, height: 321 } } });
    const props = getMockProps(node);
    expect(props.viewportWidth).toBe(900);
  });
});

describe("LandscapeWorkweekView — selection transition (P2-FE-4 follow-up #6, clear-on-empty)", () => {
  // Regression test for the bug where deselecting all techs in
  // landscape left the previous selection's cards rendered in the
  // grid. Two pieces of the contract need to hold:
  //
  //   (1) When selection transitions from non-empty to empty, the
  //       resources prop given to <Calendar> must have `events: []`
  //       on every tech (so the library's StoreFeeder sees an empty
  //       payload and can clear stale day buckets — see Phase 11
  //       fork in vendor/.../README-FORK.md).
  //   (2) `selectedResourceIds` must transition to `undefined` so
  //       the library does not retain a single-tech filter that
  //       would also pin the body to one resource.
  //
  // Without (1), the library's old `if (!items?.length) return;`
  // short-circuit would mean the empty payload never reaches the
  // store; the bug fix lives in the library, but the contract this
  // consumer must keep is "always send a fresh resources ref with
  // empty event arrays in 0-tech mode" — that's what we assert
  // here.
  it("transitioning from [11] to [] empties the resources payload (zero totalEvents) and drops selectedResourceIds back to undefined", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    const before = getMockProps(node);
    expect(before.totalEvents).toBeGreaterThan(0);
    expect(before.selectedResourceIds).toEqual([11]);

    node.rerender(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    const after = getMockProps(node);
    expect(after.resourceCount).toBe(3);
    expect(after.totalEvents).toBe(0);
    expect(after.selectedResourceIds).toBeUndefined();
  });

  it("transitioning from [11, 22] (multi-tech solid mode) to [] clears events and keeps overlay body slots disabled", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11, 22]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    const before = getMockProps(node);
    expect(before.hasOverlayBody).toBe(false);
    expect(before.totalEvents).toBeGreaterThan(0);

    node.rerender(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    const after = getMockProps(node);
    expect(after.totalEvents).toBe(0);
    expect(after.hasOverlayBody).toBe(false);
  });
});

describe("LandscapeWorkweekView — calendar configuration", () => {
  it("renders a 4-day workweek in `3days` mode regardless of selection", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11, 22]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    const props = getMockProps(node);
    expect(props.mode).toBe("3days");
    expect(props.multiDayCount).toBe(4);
    // FORK Phase 28.2-logging — landscape always tags its vendored
    // Calendar logs as `WORKWEEK-LANDSCAPE` so device smoke can
    // attribute lines without grepping the surrounding render tree.
    expect(props.calendarId).toBe("WORKWEEK-LANDSCAPE");
  });
});

describe("LandscapeWorkweekView — Ship 3 (multiTechMode + EdgeTab picker)", () => {
  // Context: Ship 2 introduced `multiTechMode` with three candidate
  // visual treatments behind a top-corner cycle chip. After user
  // evaluation, Ship 3 cut `"stacked-bands"` and replaced the chip
  // with a collapsible bottom-corner EdgeTab containing a 2-segment
  // control. The bottom corner avoids conflicts with the iOS
  // home-indicator swipe-up zone and is rarely a drag-end target on
  // the calendar grid. Drag-end / `landedResourceId` math
  // intentionally stays on the legacy path until landscape
  // drag-to-avatar lands in its own chunk.

  it("0-tech mode → multiTechMode is undefined (legacy single-resource path preserved)", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    expect(getMockProps(node).multiTechMode).toBeNull();
  });

  it("1-tech mode → multiTechMode is undefined (no overlay treatment needed)", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    expect(getMockProps(node).multiTechMode).toBeNull();
  });

  it.each([
    ["stacked" as const],
    ["mini-columns" as const],
  ])(
    "2+-tech mode → forwards `landscapeMultiTechModeOverride='%s'` straight through to <Calendar multiTechMode>",
    (mode) => {
      const node = render(
        <CalendarBindingProvider>
          <LandscapeWorkweekView
            weekData={buildWeek()}
            workweekStartDate="2026-04-20"
            hourHeight={48}
            availableTechs={TECHS}
            selectedTechIdsOverride={[11, 22]}
            preferredHandOverride="right"
            landscapeMultiTechModeOverride={mode}
          />
        </CalendarBindingProvider>,
      );
      expect(getMockProps(node).multiTechMode).toBe(mode);
    },
  );

  it("0-tech mode → EdgeTab handle is NOT rendered (no treatment to pick)", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    expect(node.queryByTestId("landscape-multi-tech-tab")).toBeNull();
  });

  it("1-tech mode → EdgeTab handle is NOT rendered (single-tech grid uses the status palette)", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    expect(node.queryByTestId("landscape-multi-tech-tab")).toBeNull();
  });

  it("2+-tech mode → EdgeTab handle IS rendered, panel is NOT mounted until opened", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11, 22]}
          preferredHandOverride="right"
          landscapeMultiTechModeOverride="mini-columns"
        />
      </CalendarBindingProvider>,
    );
    expect(node.getByTestId("landscape-multi-tech-tab-handle-pressable")).toBeTruthy();
    expect(node.queryByTestId("landscape-multi-tech-tab-panel")).toBeNull();
  });

  it("opening the EdgeTab mounts the panel + both segments with the active one marked selected", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11, 22]}
          preferredHandOverride="right"
          landscapeMultiTechModeOverride="mini-columns"
        />
      </CalendarBindingProvider>,
    );
    act(() => {
      fireEvent.press(node.getByTestId("landscape-multi-tech-tab-handle-pressable"));
    });
    expect(node.getByTestId("landscape-multi-tech-tab-panel")).toBeTruthy();
    const stackedSeg = node.getByTestId("landscape-multi-tech-segment-stacked");
    const miniSeg = node.getByTestId("landscape-multi-tech-segment-mini-columns");
    expect(stackedSeg).toBeTruthy();
    expect(miniSeg).toBeTruthy();
    expect(miniSeg.props.accessibilityState.selected).toBe(true);
    expect(stackedSeg.props.accessibilityState.selected).toBe(false);
  });

  it("pressing a segment invokes `setLandscapeMultiTechModeOverride(mode)` with the chosen treatment", () => {
    const setMode = jest.fn();
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11, 22]}
          preferredHandOverride="right"
          landscapeMultiTechModeOverride="stacked"
          setLandscapeMultiTechModeOverride={setMode}
        />
      </CalendarBindingProvider>,
    );
    act(() => {
      fireEvent.press(node.getByTestId("landscape-multi-tech-tab-handle-pressable"));
    });
    fireEvent.press(node.getByTestId("landscape-multi-tech-segment-mini-columns"));
    expect(setMode).toHaveBeenCalledWith("mini-columns");
    fireEvent.press(node.getByTestId("landscape-multi-tech-segment-stacked"));
    expect(setMode).toHaveBeenCalledWith("stacked");
    expect(setMode).toHaveBeenCalledTimes(2);
  });

  it("EdgeTab anchors to the right edge when preferredHand=right", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11, 22]}
          preferredHandOverride="right"
        />
      </CalendarBindingProvider>,
    );
    const tab = node.getByTestId("landscape-multi-tech-tab");
    const styleProp = tab.props.style;
    const flat = Array.isArray(styleProp)
      ? Object.assign({}, ...styleProp.filter(Boolean))
      : styleProp;
    expect(flat.right).toBe(0);
    expect(flat.flexDirection).toBe("row");
  });

  it("EdgeTab anchors to the left edge when preferredHand=left", () => {
    const node = render(
      <CalendarBindingProvider>
        <LandscapeWorkweekView
          weekData={buildWeek()}
          workweekStartDate="2026-04-20"
          hourHeight={48}
          availableTechs={TECHS}
          selectedTechIdsOverride={[11, 22]}
          preferredHandOverride="left"
        />
      </CalendarBindingProvider>,
    );
    const tab = node.getByTestId("landscape-multi-tech-tab");
    const styleProp = tab.props.style;
    const flat = Array.isArray(styleProp)
      ? Object.assign({}, ...styleProp.filter(Boolean))
      : styleProp;
    expect(flat.left).toBe(0);
    expect(flat.flexDirection).toBe("row");
  });
});

describe("LandscapeWorkweekView — Ship 1 (showResourceHeader=false)", () => {
  // Regression test for the user request "I want the avatar in the
  // top left to go away." Landscape passes `showResourceHeader={false}`
  // to the vendored Calendar so its `DaysComponent` skips rendering
  // the in-grid `StaffAvatar` (which would otherwise pin to
  // `resourceIds[0]` regardless of `selectedResourceIds` and visually
  // misrepresent which tech the column is for).
  //
  // The empty time-gutter `Col` is preserved by the library so day
  // labels stay aligned with their body columns; this test only
  // asserts the prop is wired through. Library-side rendering is
  // covered by the fork patch in
  // `vendor/react-native-resource-calendar/dist/index.js` (Phase 12).
  it.each([
    ["right" as const, "0 techs", []],
    ["right" as const, "1 tech", [11]],
    ["right" as const, "2+ techs", [11, 22]],
    ["left" as const, "0 techs", []],
    ["left" as const, "1 tech", [11]],
    ["left" as const, "2+ techs", [11, 22]],
  ])(
    "passes showResourceHeader=false in %s-hand / %s mode",
    (hand, _label, selection) => {
      const node = render(
        <CalendarBindingProvider>
          <LandscapeWorkweekView
            weekData={buildWeek()}
            workweekStartDate="2026-04-20"
            hourHeight={48}
            availableTechs={TECHS}
            selectedTechIdsOverride={selection as number[]}
            preferredHandOverride={hand}
          />
        </CalendarBindingProvider>,
      );
      const props = getMockProps(node);
      expect(props.showResourceHeader).toBe(false);
    },
  );
});
