import React$1 from 'react';
import { TextStyle, ViewStyle } from 'react-native';
import { StyleProp } from 'react-native/Libraries/StyleSheet/StyleSheet';

type ResourceId = number;
type Event = {
    id: number;
    resourceId: ResourceId;
    date: string;
    from: number;
    to: number;
    title?: string;
    description?: string;
    meta?: {
        [key: string]: any;
    };
};
type DisabledBlock = {
    id: number;
    resourceId: ResourceId;
    date: string;
    from: number;
    to: number;
    title?: string;
};
type DisabledInterval = {
    resourceId: ResourceId;
    date: string;
    from: number;
    to: number;
};
type Resource = {
    id: ResourceId;
    name: string;
    avatar?: string;
};
type DraggedEventDraft = {
    event: Event;
    date: string;
    from: number;
    to: number;
    resourceId: ResourceId;
};
type CalendarTheme = {
    typography?: {
        /** Expo-registered font name */
        fontFamily?: string;
    };
};
type LayoutMode = "columns" | "stacked";
type EventRenderContext = {
    hourHeight: number;
};
type CalendarMode = 'day' | '3days' | 'week';

type EventSlots = {
    TopRight?: React$1.ComponentType<{
        event: Event;
        ctx: EventRenderContext;
    }>;
    Body?: React$1.ComponentType<{
        event: Event;
        ctx: EventRenderContext;
    }>;
};
type StyleOverrides = Partial<{
    time: StyleProp<TextStyle>;
    container: ViewStyle;
    content: ViewStyle;
    title: TextStyle;
    desc: TextStyle;
}>;
/**
 * FORK Phase 25 (PR-UX-2 / move-chain tile pulse, 2026-05-05).
 * Per-event animated-opacity descriptor returned by the consumer's
 * `getEventOpacity` callback. EventBlock applies this on the UI thread
 * via `useAnimatedStyle`. The `phase` discriminator lets two tile
 * groups breathe in opposite phase from the same SharedValue (used by
 * the move-chain pulse: `"source"` for appointment-card chain members,
 * `"dest"` for ghost destination frames). When the resolver returns
 * `null`/`undefined`, EventBlock collapses the worklet to opacity:1
 * with no visual effect.
 */
type EventOpacityDescriptor = {
    sv: import("react-native-reanimated").SharedValue<number>;
    phase: "source" | "dest";
};
type GetEventOpacity = (event: Event) => EventOpacityDescriptor | null | undefined;

/**
 * FORK Phase 26 (2026-05-10) — per-event rendered-bounds report.
 *
 * Fires from the outer Animated.View's `onLayout` whenever the
 * EventBlock's rendered rect changes (initial mount, frame-prop
 * change, styleOverrides container resize, multi-tech layout
 * recompute, etc.). Reports the rect in the EventBlock's parent
 * coordinate space — i.e., column-local (X is intra-column, Y is
 * intra-grid since columns share a Y=0 origin in the calendar body).
 *
 * Why this exists: consumers that paint overlays anchored to event
 * cards (move-chain arrows, drag-ghost frames) need to know the
 * card's ACTUAL rendered position, not the column-cell rect. The
 * pre-Phase-26 path forced consumers to recompute geometry from
 * grid descriptors (`appointmentBlockWidth`, `hourHeight`, etc.),
 * which produced a "logical cell" that was inset by the
 * EventBlock's own `dynamicStyle` (`+1`/`+2`/`-3`/`-4`) plus any
 * `styleOverrides.container` border / padding. Arrows anchored to
 * the cell rect hover a few pixels outside the visible card edge.
 * Bounds reported here are post-style, so consumers can land arrow
 * endpoints flush against the visible card.
 *
 * Coordinate space: column-local. Consumers combine with their own
 * column-offset math to produce grid-coordinate rects.
 *
 * Performance: `onLayout` fires once per actual layout pass, not
 * continuously during scroll. For a calendar with 50 visible
 * events, expect ~50 callbacks on initial mount and burst-fire on
 * horizontal pans / resize, then quiet.
 */
type OnEventLayout = (event: Event, layout: {
    x: number;
    y: number;
    width: number;
    height: number;
}) => void;

type FlagFn = (event: Event) => boolean;
interface CalendarProps {
    timezone?: string;
    date: Date;
    startMinutes?: number;
    /** Upper bound in minutes since midnight; defaults to 1440 (full day). */
    endMinutes?: number;
    resources: Array<Resource & {
        events: Event[];
        disabledBlocks?: DisabledBlock[];
        disableIntervals?: DisabledInterval[];
    }>;
    snapIntervalInMinutes?: number;
    numberOfColumns?: number;
    hourHeight?: number;
    onResourcePress?: (resource: Resource) => void;
    /**
     * FORK: fired when an avatar in the resources header is double-tapped.
     * Single vs. double tap is disambiguated inside the library via
     * react-native-gesture-handler. Use this for "focus this tech"
     * (e.g. enter a Workweek view).
     */
    onResourceDoublePress?: (resource: Resource) => void;
    /**
     * FORK: fired after the user hold-drags an avatar to a new horizontal
     * position in the resources header. Receives the new id order. The
     * library handles the gesture + animation; the consumer is expected
     * to persist this order (e.g. into a Zustand store) and pass it back
     * into `resources` on the next render so the new order sticks.
     */
    onResourceReorder?: (orderedIds: number[]) => void;
    /**
     * FORK: ids of resources currently selected in the multi-select.
     * Empty / undefined = no filtering (all resources visible, no dimming).
     * When non-empty:
     *   - The header keeps rendering ALL avatars from `resources`, with
     *     unselected ones dimmed (and the body column hidden).
     *   - The body only renders columns for selected ids, so remaining
     *     columns get wider when others are toggled off.
     */
    selectedResourceIds?: number[];
    /**
     * FORK Phase 37 (2026-05-12 — arrow lane-order source of truth):
     * fired once on mount and again whenever the library's internal
     * `bodyResourceIds` array changes. `bodyResourceIds` is the
     * selection-filtered, resources-prop-ordered id list the body
     * grid actually paints lanes for. Consumers overlaying geometry
     * (move-chain arrows, drag-target ghosts, custom labels) should
     * derive per-tech sub-lane X coordinates from THIS array's order,
     * not from any consumer-side selection-order array — the two can
     * differ when `resources` isn't sorted the same way the user
     * toggled them on.
     *
     * Coordinate space: the array is in body-paint order; lane index
     * for tech `T` is `bodyResourceIds.indexOf(T)`. Lane width is
     * `BODY_BLOCK_WIDTH / bodyResourceIds.length` in mini-cols mode.
     *
     * When `undefined`, the callback machinery short-circuits — zero
     * overhead for calendars that don't opt in. See README-FORK
     * Phase 37 + docs/PLAN-DEVIATIONS.md#2026-05-12-arrow-lane-order-from-vendor.
     */
    onBodyResourceIdsChange?: (bodyResourceIds: number[]) => void;
    onBlockLongPress?: (resource: Resource, date: Date) => void;
    onBlockTap?: (resource: Resource, date: Date) => void;
    onDisabledBlockPress?: (block: DisabledBlock) => void;
    onEventPress?: (event: Event) => void;
    onEventLongPress?: (event: Event) => void;
    /**
     * FORK Phase 17 (P2-FE-5 chunk 2b): fires when the user
     * double-taps an event. The library starts drag automatically on
     * this gesture (replacing the pre-Phase-17 long-press-to-drag
     * model). This callback runs synchronously before drag init so
     * consumers can observe the gesture without owning the drag
     * state. See README-FORK Phase 17.
     */
    onEventDoubleTap?: (event: Event) => void;
    enableHapticFeedback?: boolean;
    eventSlots?: EventSlots;
    eventStyleOverrides?: StyleOverrides | ((event: Event) => StyleOverrides | undefined);
    /**
     * FORK Phase 25 (PR-UX-2 / move-chain tile pulse, 2026-05-05):
     * Per-event animated-opacity callback. When supplied AND it
     * returns a non-null descriptor, the matching EventBlock wraps
     * its outer container in an `Animated.View` whose opacity reads
     * the supplied SharedValue on the UI thread. Pass `undefined` to
     * skip animation entirely (zero overhead).
     */
    getEventOpacity?: GetEventOpacity;
    /**
     * FORK Phase 26 (2026-05-10 — move-chain arrow alignment):
     * receives the post-style rendered rect of each EventBlock on
     * every layout change. Fires once per actual layout pass
     * (mount + frame changes); scroll does NOT re-fire because
     * scroll doesn't change child layouts.
     *
     * Coordinate space: column-local. Consumers combine with their
     * existing column-offset math to produce grid-coordinate rects
     * for overlay painting (move-chain arrows, drag-ghost frames).
     *
     * When `undefined`, EventBlock skips the onLayout wiring
     * entirely — zero overhead for calendars that don't opt in.
     * See README-FORK Phase 26.
     */
    onEventLayout?: OnEventLayout;
    isEventSelected?: FlagFn;
    isEventDisabled?: FlagFn;
    theme?: CalendarTheme;
    overLappingLayoutMode?: LayoutMode;
    mode?: CalendarMode;
    activeResourceId?: number;
    /** Override the number of visible days in multi-day modes (e.g. 4 for a Mon-Thu workweek). */
    multiDayCount?: number;
    scrollsToTop?: boolean;
    /** Fired when a pinch-zoom gesture changes the visible hour height. */
    onZoom?: (newHourHeight: number) => void;
    /**
     * FORK: override the viewport width the library uses to derive
     * `APPOINTMENT_BLOCK_WIDTH` and `BODY_BLOCK_WIDTH`. When omitted
     * (the portrait default) the library falls back to
     * `useWindowDimensions().width`, preserving historical behavior.
     * When provided, the library derives column widths — and the
     * workweek/multiDay header's day-label positions — from this
     * value instead.
     *
     * Consumers that render the calendar inside a constrained
     * container (e.g. the landscape canvas with a side strip that
     * eats horizontal space) MUST pass their measured container
     * width here, otherwise columns are sized for the full window
     * and the `DaysComponent` date labels bleed outside the calendar
     * wrapper. Per `docs/implementation-plans/landscape-calendar.md`
     * §3.6 "pass canvas constraints as props, don't have inner
     * components poll dimensions themselves."
     */
    viewportWidth?: number;
    /**
     * FORK (Phase 12 — `showResourceHeader` prop): when `false`, the
     * `DaysComponent` header's leading slot (the time-gutter column) renders
     * empty instead of showing the active resource's `StaffAvatar`. Day
     * labels stay aligned with their body columns because the empty slot
     * preserves the layout offset. Defaults to `true` so portrait day/week
     * views render unchanged. Landscape multi-tech views pass `false` because
     * the avatar in the time-gutter column is portrait-era chrome — landscape
     * has its own avatar strip on the side and the in-grid avatar is
     * redundant + visually misleading (it pins to `resourceIds[0]` regardless
     * of `selectedResourceIds`).
     */
    showResourceHeader?: boolean;
    /**
     * FORK (Phase 13 — `multiTechMode`, refined Phase 14): in multi-day
     * mode (`mode === "3days"` or `"week"`), controls how multiple
     * selected resources' events are rendered inside each day-column.
     * Has no effect in single-day mode.
     *
     * - `undefined` (default): legacy behavior — only the first
     *   `bodyResourceIds[0]` resource's events render in each day-column.
     *   Preserves the historical multi-day path; recommended for any
     *   consumer not yet ready to migrate.
     * - `"stacked"`: every selected resource's events render in the same
     *   day-column wrapper, full-width, stacking visually via
     *   z-order. Color the events via `eventStyleOverrides` to keep
     *   per-tech identification.
     * - `"mini-columns"`: subdivides each day-column into N equal-width
     *   lanes (one per selected resource), `BODY_BLOCK_WIDTH / N` each.
     *
     * History: a `"stacked-bands"` treatment shipped in Ship 2 (each
     * tech got a full-width, full-day-height band stacked vertically)
     * and was cut in Ship 3 after the user evaluated all three on real
     * data. Don't re-add without going through the same evaluation.
     * (PLAN-DEVIATION: 2026-04-20-cut-stacked-bands —
     *  docs/PLAN-DEVIATIONS.md#2026-04-20-cut-stacked-bands)
     *
     * See `docs/implementation-plans/landscape-overlay-rendering.md`
     * for the full UX rationale and tradeoff matrix.
     *
     * Drag-end (Phase 15): cross-tech drops are now resolved inside
     * `finalizeDrag`. `"mini-columns"` resolves the destination tech
     * spatially from the in-column drop offset; `"stacked"` keeps the
     * dragged event's original tech (overlap exposes no inter-tech
     * spatial signal, so spatial guessing would be wrong). Resize
     * never reassigns techs in any mode. See `resolveLandedResourceId`
     * below for the exact rule.
     * (PLAN-DEVIATION: 2026-04-20-cross-tech-drag-end —
     *  docs/PLAN-DEVIATIONS.md#2026-04-20-cross-tech-drag-end)
     */
    multiTechMode?: "stacked" | "mini-columns";
    /**
     * FORK (Phase 16 — `getResourceColor`): optional consumer-supplied
     * resolver from `resourceId` to a CSS color string. Used today to
     * tint the snap-target drop shadow rendered during drag in
     * `multiTechMode === "mini-columns"` so the user can preview which
     * tech the dropped card will be reassigned to before releasing.
     *
     * The library has no opinion on tech coloring (consumers like the
     * REMITechnician landscape canvas pipe `colorForTech` from
     * `@/src/utils/color-for-tech`); when omitted, the drop shadow
     * falls back to a neutral semi-transparent black.
     *
     * Called on the JS side once per `bodyResourceIds` change — the
     * results are flattened into an array indexed by lane index inside
     * the worklet that drives the shadow's animated style. Don't make
     * this prop expensive or branch on per-render state; treat it as a
     * pure id → color map.
     * (PLAN-DEVIATION: 2026-04-20-mini-cols-drop-shadow —
     *  docs/PLAN-DEVIATIONS.md#2026-04-20-mini-cols-drop-shadow)
     */
    getResourceColor?: (resourceId: number) => string;
    /**
     * FORK Phase 24 (PR-UX-2 / move-chain arrow overlay): the calendar
     * body's vertical scroll offset is held in an internal `scrollY`
     * `SharedValue<number>` driven by `useAnimatedScrollHandler`.
     * Consumers that mount an absolutely-positioned overlay aligned
     * with body content (move-chain arrows, future drag-shadow extras,
     * etc.) need to translate by that scroll offset to stay glued to
     * the tiles instead of drifting with the wrapper.
     *
     * When provided, this callback fires once on mount with the live
     * `SharedValue` instance. The consumer is expected to hold the ref
     * and read `.value` from a worklet (or pass it into `useDerivedValue`
     * / `useAnimatedReaction` / `useAnimatedStyle`). Read-only contract:
     * do NOT write to `.value` from the consumer side; the library owns
     * the writes via its scroll handler.
     *
     * Stable across re-renders — the SharedValue identity does not
     * change between Calendar render passes. Safe to capture in a ref.
     * Pure observability hook; omitting the prop changes nothing.
     */
    onScrollYRef?: (scrollY: import("react-native-reanimated").SharedValue<number>) => void;
    /**
     * FORK Phase 24-x (2026-05-10 — landscape arrow horizontal
     * anchoring): mirror of `onScrollYRef` for the FlashList's
     * HORIZONTAL scroll offset. Fires once on mount with the live
     * `scrollX` SharedValue. Read-only contract; the library owns
     * the writes via `flashListScrollHandler` (which now updates
     * `scrollX.value` regardless of `isMultiDay` so multi-day mode
     * is observable too).
     *
     * Why this exists: the move-chain arrow overlay sits OUTSIDE
     * the vendored calendar's transform tree and translates its SVG
     * layer via Reanimated `useAnimatedStyle` to stay glued to the
     * cards. Without observability of the horizontal scroll
     * position, the overlay drifts horizontally when the user
     * scrolls between days in workweek mode. See README-FORK
     * Phase 24-x.
     */
    onScrollXRef?: (scrollX: import("react-native-reanimated").SharedValue<number>) => void;
    /**
     * FORK Phase 24-x (2026-05-10 — landscape arrow horizontal
     * anchoring): expose the zoom-pan transform SharedValues
     * (`zoomTX`/`zoomTY`) to consumers. The library applies these
     * via the inner `zoomStyle` `useAnimatedStyle`; an overlay
     * mounted as a sibling of `<Calendar>` does NOT inherit that
     * transform, so it must apply the same translate explicitly to
     * stay glued to the cards. Fires once on mount with both SVs;
     * identities are stable across re-renders. Read-only contract.
     *
     * The 1-finger pan gesture writes these SVs every frame on iOS
     * (panGesture auto-activates and the simultaneous zoomPanGesture
     * accumulates `evt.translationX/Y`), so without this hook the
     * arrows drift even when the user just pans the canvas without
     * any pinch-zoom intent.
     */
    onContentTransformRef?: (transform: {
        zoomTX: import("react-native-reanimated").SharedValue<number>;
        zoomTY: import("react-native-reanimated").SharedValue<number>;
    }) => void;
    /**
     * FORK Phase 21 (P3-FE-DRAG-GHOST chunk b) — per-resource color
     * resolver. When provided AND the calendar is in `multiTechMode:
     * "mini-columns"` with 2+ techs, each lane on the body grid gets a
     * tinted "ghost" outline overlay during a drag, indicating the
     * destination lane the drop will land on. Tint is `getResourceColor(
     * bodyResourceIds[laneIndex])`. The lane outline is rendered as a
     * dashed border with low-opacity fill so it doesn't compete with
     * the dragged card. Omit this prop to skip the drop-target ghost
     * (the floating card alone remains the drop indicator).
     *
     * The color string MUST be valid for `style.backgroundColor` and
     * `style.borderColor` (hex / rgb / rgba — anything React Native
     * accepts). Returning the same value as the source card's color is
     * fine; the ghost adds its own opacity layering.
     */
    getResourceColor?: (resourceId: number) => string;
    /**
     * FORK Phase 28.2-logging (P3-FE-DRAG-GHOST follow-up, 2026-05-06) —
     * stable identifier for this Calendar instance, mixed into every
     * `[CAL:*]` log line the library emits as `[CAL:${calendarId}:${
     * subtag}]`. When omitted the logs fall back to the historical
     * `[CAL:${subtag}]` form so existing grep patterns still match.
     *
     * Designed for apps that mount multiple `<Calendar>` instances
     * (REMITechnician runs three: `DAY-PORTRAIT`, `WEEK-PORTRAIT`,
     * `WORKWEEK-LANDSCAPE`). Pure dev-tool plumbing; production
     * bundles strip the logs at the `__DEV__` gate so this prop has
     * zero runtime cost in release builds.
     *
     * Convention: use `SCREAMING-KEBAB-CASE` so the resulting tag
     * (`[CAL:WORKWEEK-LANDSCAPE:gesture]`) reads cleanly in Metro /
     * device logs. Don't put spaces or `[`/`]` in the value — the
     * library doesn't sanitize.
     */
    calendarId?: string;
}
declare const Calendar: React$1.FC<CalendarProps>;

type DayKey = string;
type SetDayDataPayload = {
    events?: Record<ResourceId, Event[]>;
    disabledBlocks?: Record<ResourceId, DisabledBlock[]>;
    disableIntervals?: Record<ResourceId, DisabledInterval[]>;
};
type CalendarStoreBinding = {
    /** Instance-scoped provider (no globals). */
    Provider: React.FC<{
        children: React.ReactNode;
    }>;
    useResourceById: (id: ResourceId) => Resource;
    useEventsFor: (resourceId: ResourceId, dayDate: Date) => ReadonlyArray<Event>;
    useDisabledBlocksFor: (resourceId: ResourceId, dayDate: Date) => ReadonlyArray<DisabledBlock>;
    useDisabledIntervalsFor: (resourceId: ResourceId, dayDate: Date) => ReadonlyArray<DisabledInterval>;
    useUpsertResources: () => (rs: Array<Pick<Resource, 'id' | 'name' | 'avatar'>>) => void;
    useSetDayDataFor: () => (dayKey: DayKey, payload: SetDayDataPayload) => void;
    useGetSelectedEvent: () => Event | null;
    useSetSelectedEvent: () => (ev: Event | null) => void;
    useSetDate: () => (date: Date) => void;
    useGetDate: () => Date;
    useGetDraggedEventDraft: () => DraggedEventDraft | null;
    useSetDraggedEventDraft: () => (draft: DraggedEventDraft | null) => void;
};

declare const useCalendarBinding: () => CalendarStoreBinding;
declare const CalendarBindingProvider: React$1.FC<{
    binding?: CalendarStoreBinding;
    children: React$1.ReactNode;
}>;

/**
 * FORK Phase 18 (P2-FE-6 chunk a): live drag-centroid + isDragging
 * shared values exposed through the binding provider so sibling
 * consumers (e.g. the landscape `<DragToAvatarTarget>` overlay) can
 * subscribe to the same instances `<Calendar>` writes to per-frame.
 *
 * Master plan §5.1.7 — the avatar-strip drag-to-tech handler reads
 * `panXAbs.value` / `panYAbs.value` inside a `useAnimatedReaction`
 * each frame to compute "is the dragged centroid inside any avatar
 * bounding box?" and toggle a per-tile highlight ring while
 * `isDragging.value === true`. Designed for worklet consumption —
 * never read `.value` on the JS thread inside a render path.
 *
 * Coordinate space (IMPORTANT — naming is historical and misleading):
 *
 *   `panXAbs` / `panYAbs` carry the dragged card's CENTER in the
 *   calendar's VIEWPORT-LOCAL coordinate space (i.e. relative to the
 *   calendar component's top-left corner, AFTER `scrollX`/`scrollY`
 *   are subtracted). The `Abs` suffix means "absolute within the
 *   calendar viewport," NOT screen-absolute.
 *
 *   Examples from the writers (search for `panXAbs.value =` in
 *   `dist/index.js`):
 *     - `panYAbs.value = snappedAbsoluteTop - scrollY.value + eventHeight/2`
 *     - `panXAbs.value = TIME_LABEL_WIDTH + colIndex * BODY_BLOCK_WIDTH - scrollX.value + BODY_BLOCK_WIDTH/2`
 *
 *   Confirmation from the existing `DropShadow` consumer: it derives
 *   within-column-X via `panXAbs - TIME_LABEL_WIDTH - colIndex * BODY_BLOCK_WIDTH`,
 *   which only makes sense if `panXAbs` is calendar-local.
 *
 *   To compare against screen-absolute geometry (e.g. avatar tile
 *   bounding boxes from `View.measureInWindow`), consumers must add
 *   the calendar wrapper's window-relative offset:
 *
 *     const screenCentroidX = calendarLeftInWindow + panXAbs.value;
 *     const screenCentroidY = calendarTopInWindow  + panYAbs.value;
 *
 *   `calendarLeftInWindow` / `calendarTopInWindow` come from a
 *   one-time `measureInWindow` on the calendar wrapper (re-run on
 *   orientation change). Avatar bboxes captured the same way live in
 *   the same screen-absolute space, so the hit-test is then a direct
 *   numeric compare.
 *
 * Lifetime: the SVs are created once per `<CalendarBindingProvider>`
 * mount and survive every re-render of the provider or its children.
 * They are NOT cleared on drag-end — `isDragging` flips back to
 * `false` and `panXAbs` / `panYAbs` retain whatever the last frame
 * wrote. Consumers that care about stale values should gate their
 * reaction on `isDragging.value`.
 *
 * Throws if called outside `<CalendarBindingProvider>`. See
 * `vendor/react-native-resource-calendar/README-FORK.md` Phase 18.
 *
 * ─── FORK Phase 19 (P2-FE-6 chunk b) — finger window-coords ───
 *
 * `fingerXAbs` / `fingerYAbs` mirror the RNGH pan event's
 * `evt.absoluteX` / `evt.absoluteY` — the RAW finger position in
 * SCREEN-WINDOW coordinates (origin = top-left of the device window,
 * same coordinate space as `View.measureInWindow`).
 *
 * Why these exist alongside `panXAbs` / `panYAbs`:
 *
 *   - `panXAbs` is HARD-CLAMPED to the inside of the calendar grid
 *     (`max(BODY_BLOCK_WIDTH/2 + TIME_LABEL_WIDTH, ...)` ...
 *     `min(layout.width - BODY_BLOCK_WIDTH/2, ...)`). When the user
 *     drags toward an avatar strip rendered as a sibling outside the
 *     calendar's `layout.width`, `panXAbs` stops at the grid edge
 *     and a hit-test against the strip's window bbox would always
 *     miss.
 *
 *   - `fingerXAbs` / `fingerYAbs` are NOT clamped (the gesture has
 *     `.shouldCancelWhenOutside(false)`, so the finger continues to
 *     be tracked when it leaves the calendar's bounds).
 *
 *   - These also remove the calendar-offset conversion step:
 *     `fingerXAbs` is already in the same space as
 *     `View.measureInWindow`, so an avatar-strip hit-test is a
 *     direct numeric compare with no need to plumb the calendar
 *     wrapper's window origin.
 *
 * Use them for any "what UI tile is the finger over right now?"
 * question. Use `panXAbs` / `panYAbs` for anything that needs to
 * snap to or measure against the calendar's column geometry.
 *
 * Lifetime nuance: `fingerXAbs` / `fingerYAbs` are initialised to
 * `Number.NaN` (so a first-frame hit-test reads NaN-NaN = "no hit"
 * via NaN propagation in the < / > comparisons) and are reset to
 * NaN on every `pan.onEnd` (every exit path, drag or no-drag).
 * Within a drag, they are written every `onUpdate` frame from the
 * RNGH event's absolute coords. Consumers MUST guard against NaN
 * (e.g. `if (Number.isFinite(fingerXAbs.value))`) before using the
 * value in numeric math, or rely on NaN propagation to make their
 * hit-test naturally fail.
 */
type DragSharedValues = {
    panXAbs: { value: number };
    panYAbs: { value: number };
    isDragging: { value: boolean };
    /**
     * FORK Phase 19 — raw finger X in window coordinates (matches
     * `View.measureInWindow`'s origin). NaN when not dragging.
     * Updated every pan `onUpdate` frame. NOT clamped to the
     * calendar grid — this is the value to compare against avatar /
     * external-tile bboxes.
     */
    fingerXAbs: { value: number };
    /**
     * FORK Phase 19 — raw finger Y in window coordinates. See
     * `fingerXAbs` for semantics.
     */
    fingerYAbs: { value: number };
    /**
     * FORK Phase 20 — pickup-time width of the floating drag card in
     * pixels. Captured at drag-init from `BODY_BLOCK_WIDTH` and read by
     * DraggableEvent's animated styles so the card visual size stays
     * frozen across mid-drag layout changes (e.g. dwell-driven tech
     * swap that adds/removes a column). 0 when no drag is active.
     */
    dragCardPickupWidth: { value: number };
};
declare const useDragSharedValues: () => DragSharedValues;

/**
 * Pure resolver for the destination tech of a drag-end (FORK Phase 15).
 * Extracted from `CalendarInner.finalizeDrag` so the consumer can
 * unit-test the rule independently of the gesture/worklet machinery.
 *
 * - Single-day mode: returns `bodyResourceIds[colIndex]` (each column
 *   already IS a tech).
 * - Multi-day "mini-columns" with 2+ techs and a non-null `xWithinColumn`:
 *   returns `bodyResourceIds[laneIndex]`, where `laneIndex` is computed
 *   from the in-column drop offset.
 * - Multi-day "stacked" / single-tech / no multi-tech / resize:
 *   keeps the dragged event's original tech via
 *   `selectedEvent.resourceId ?? activeResourceId ?? resourceIds[0]`.
 *
 * `xWithinColumn` MUST be measured before any snap-to-column animation
 * overwrites the gesture's panX, otherwise mini-columns will always
 * resolve to the column-center lane.
 */
declare const resolveLandedResourceId: (args: {
    mode: CalendarMode;
    colIndex: number;
    bodyResourceIds: number[];
    resourceIds: number[];
    selectedEvent: Event | null;
    activeResourceId: number | null;
    multiTechMode?: "stacked" | "mini-columns";
    bodyBlockWidth: number;
    xWithinColumn?: number | null;
    isResize: boolean;
}) => number | undefined;

/**
 * Pure resolver for the LIVE drop preview (FORK Phase 16). Mirrors the
 * spatial branch of `resolveLandedResourceId` but returns positional
 * data (col / lane indices and the absolute X/Y of the lane's
 * top-left corner in the calendar's coordinate system) instead of a
 * `resourceId`. Used by the snap-shadow animated style on the UI
 * thread to render the destination preview every frame.
 *
 * - Single-day or non-mini-columns: returns `null` (no live preview;
 *   the shadow is gated to mini-columns + 2+ techs only).
 * - Mini-columns with 2+ techs: clamps both `colIndex` (0 …
 *   `numberOfColumns - 1`) and `laneIndex` (0 … `techCount - 1`) so the
 *   shadow stays inside the grid even when the gesture wanders past
 *   the right edge during auto-scroll. `translateX` accounts for the
 *   horizontal scroll offset; `translateY` is in scroll-relative coords
 *   because the shadow is mounted as a sibling of `DraggableEvent` in
 *   the same absolute overlay.
 *
 * MUST stay synchronous and worklet-safe (no closures, no JS-only
 * APIs) so consumers that mark it `"worklet"` can call it from inside
 * a `useAnimatedStyle`.
 */
declare const resolveLaneDropPosition: (args: {
    panXAbs: number;
    eventStartedTop: number;
    eventHeight: number;
    scrollX: number;
    scrollY: number;
    timeLabelWidth: number;
    bodyBlockWidth: number;
    techCount: number;
    columnCount: number;
}) => {
    colIndex: number;
    laneIndex: number;
    translateX: number;
    translateY: number;
    width: number;
    height: number;
} | null;

export { Calendar, CalendarBindingProvider, type CalendarMode, type CalendarTheme, type DisabledBlock, type DisabledInterval, type DraggedEventDraft, type DragSharedValues, type Event, type EventOpacityDescriptor, type EventRenderContext, type GetEventOpacity, type LayoutMode, type OnEventLayout, type Resource, type StyleOverrides, resolveLandedResourceId, resolveLaneDropPosition, useCalendarBinding, useDragSharedValues };
