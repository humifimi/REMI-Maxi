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
/** FORK Phase 25 (PR-UX-2 / move-chain tile pulse). See index.d.ts. */
type EventOpacityDescriptor = {
    sv: import("react-native-reanimated").SharedValue<number>;
    phase: "source" | "dest";
};
type GetEventOpacity = (event: Event) => EventOpacityDescriptor | null | undefined;

/** FORK Phase 26 (2026-05-10 — move-chain arrow alignment). See index.d.ts for the full contract. */
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
    /** FORK Phase 25 (PR-UX-2 / move-chain tile pulse). See index.d.ts. */
    getEventOpacity?: GetEventOpacity;
    /** FORK Phase 26 (2026-05-10 — move-chain arrow alignment). See index.d.ts. */
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
     * - `"stacked"`: every selected resource's events render in the same
     *   day-column wrapper, full-width, stacking visually via z-order.
     * - `"mini-columns"`: subdivides each day-column into N equal-width
     *   lanes (one per selected resource).
     *
     * History: a `"stacked-bands"` treatment shipped in Ship 2 and was
     * cut in Ship 3. See `dist/index.d.ts` for full notes; this `.mts`
     * mirror summarizes intentionally.
     * (PLAN-DEVIATION: 2026-04-20-cut-stacked-bands —
     *  docs/PLAN-DEVIATIONS.md#2026-04-20-cut-stacked-bands)
     *
     * Drag-end (Phase 15): resolved inside `finalizeDrag`.
     * `"mini-columns"` resolves the destination tech spatially from
     * the in-column drop offset; `"stacked"` keeps the dragged event's
     * original tech. Resize never reassigns techs. See
     * `resolveLandedResourceId` for the exact rule.
     * (PLAN-DEVIATION: 2026-04-20-cross-tech-drag-end —
     *  docs/PLAN-DEVIATIONS.md#2026-04-20-cross-tech-drag-end)
     */
    multiTechMode?: "stacked" | "mini-columns";
    /**
     * FORK (Phase 16 — `getResourceColor`): consumer-supplied
     * `resourceId` → CSS color resolver. Used to tint the snap-target
     * drop shadow during mini-columns drag. See `dist/index.d.ts` for
     * the canonical doc.
     * (PLAN-DEVIATION: 2026-04-20-mini-cols-drop-shadow —
     *  docs/PLAN-DEVIATIONS.md#2026-04-20-mini-cols-drop-shadow)
     */
    getResourceColor?: (resourceId: number) => string;
    /**
     * FORK Phase 24 (PR-UX-2 / move-chain arrow overlay): expose the
     * library's internal `scrollY` SharedValue so consumers can keep
     * absolutely-positioned overlays glued to body content during
     * vertical scroll. See `dist/index.d.ts` for the full doc-block.
     */
    onScrollYRef?: (scrollY: import("react-native-reanimated").SharedValue<number>) => void;
    /**
     * FORK Phase 24-x (2026-05-10) — horizontal-scroll mirror of
     * `onScrollYRef`; updates in multi-day mode too. See `dist/index.d.ts`.
     */
    onScrollXRef?: (scrollX: import("react-native-reanimated").SharedValue<number>) => void;
    /**
     * FORK Phase 24-x (2026-05-10) — zoom-pan transform SVs so an
     * external overlay can mirror the body's `zoomStyle` translate.
     * See `dist/index.d.ts`.
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
     * bodyResourceIds[laneIndex])`. Omit this prop to skip the
     * drop-target ghost. See README-FORK Phase 21.
     */
    getResourceColor?: (resourceId: number) => string;
    /**
     * FORK Phase 28.2-logging (P3-FE-DRAG-GHOST follow-up, 2026-05-06) —
     * stable identifier for this Calendar instance, mixed into every
     * `[CAL:*]` log line as `[CAL:${calendarId}:${subtag}]`. When
     * omitted, logs fall back to `[CAL:${subtag}]`. See `dist/index.d.ts`
     * for the full doc-block.
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
 * shared values. See `dist/index.d.ts` for the canonical doc.
 *
 * COORDINATE SPACE WARNING: `panXAbs` / `panYAbs` are calendar-
 * VIEWPORT-LOCAL (after scroll subtraction), NOT screen-absolute and
 * NOT finger-position. Sibling overlays must add the calendar
 * wrapper's window-relative offset to compare against avatar tile
 * bboxes from `measureInWindow`. See `dist/index.d.ts` for the full
 * cookbook.
 *
 * FORK Phase 19 (P2-FE-6 chunk b): also exposes `fingerXAbs` /
 * `fingerYAbs` — the RAW finger position in window coordinates,
 * mirrored from the pan event's `evt.absoluteX` / `evt.absoluteY`.
 * Unlike `panXAbs`, these are NOT clamped to the calendar grid, so
 * they are the value to compare against external-tile bboxes (avatar
 * strip, map toggle, etc.) from `View.measureInWindow`. Initialised
 * to NaN; reset to NaN on every `pan.onEnd`. See `dist/index.d.ts`
 * for the full coordinate-space cookbook.
 *
 * NOTE: `.mts` declaration is declared but the runtime export is
 * only present in `dist/index.js` per the long-standing `.mjs` policy
 * (see README-FORK "Notes for future agents"). Metro/RN consumers
 * resolve via `react-native` package field → `dist/index.js`, so this
 * is adequate. Other bundlers reading `.mjs` would silently get
 * `undefined` for this export.
 */
type DragSharedValues = {
    panXAbs: { value: number };
    panYAbs: { value: number };
    isDragging: { value: boolean };
    /** FORK Phase 19 — raw finger X in window coords. NaN when not dragging. */
    fingerXAbs: { value: number };
    /** FORK Phase 19 — raw finger Y in window coords. NaN when not dragging. */
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
 * See `dist/index.d.ts` for the canonical doc.
 *
 * NOTE: `.mts` declaration is declared but the runtime export is only
 * present in `dist/index.js`. Metro/RN consumers (the only consumers
 * today) resolve via the `react-native` package field, so this is
 * adequate. Other bundlers reading `.mjs` would silently get
 * `undefined` for this export — non-issue today, called out for future
 * agents per the long-standing `.mjs` policy in `README-FORK.md`.
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
 * Pure resolver for the LIVE drop preview (FORK Phase 16). See
 * `dist/index.d.ts` for the canonical doc. Worklet-safe.
 *
 * Same `.mjs`-export caveat as `resolveLandedResourceId`: declaration
 * present here, runtime export only in `dist/index.js`. The single
 * Metro/RN consumer is fine; bundlers reading `.mjs` would silently
 * get `undefined`.
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
