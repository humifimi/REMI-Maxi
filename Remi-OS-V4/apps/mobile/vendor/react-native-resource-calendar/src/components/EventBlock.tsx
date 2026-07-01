import React from "react";
import {
    LayoutChangeEvent,
    StyleSheet,
    Text,
    TextInput,
    TextStyle,
    TouchableOpacity,
    ViewStyle,
} from "react-native";
import Animated, {SharedValue, useAnimatedStyle} from "react-native-reanimated";
import Row from "../components/common/layout/Row";
import Col from "../components/common/layout/Col";
import {Event, EventRenderContext} from "@/types/calendarTypes";
import {EventFrame, getTextSize, minutesToTime, scalePosition} from "@/utilities/helpers";
import {useCalendarBinding} from "@/store/bindings/BindingProvider";
import {useResolvedFont} from "@/theme/ThemeContext";
import {StyleProp} from "react-native/Libraries/StyleSheet/StyleSheet";

export type EventSlots = {
    // TopLeft?: React.ComponentType<{ event: Event; ctx: EventRenderContext }>;
    TopRight?: React.ComponentType<{ event: Event; ctx: EventRenderContext }>;
    Body?: React.ComponentType<{ event: Event; ctx: EventRenderContext }>;
};

export type EventRenderer = (
    props: EventBlockProps & { children?: React.ReactNode }
) => React.ReactNode;

export type StyleOverrides = Partial<{
    time: StyleProp<TextStyle>;
    container: ViewStyle;
    content: ViewStyle;
    title: TextStyle;
    desc: TextStyle;
}>;

/**
 * FORK Phase 25 (PR-UX-2 / move-chain tile pulse, 2026-05-05): per-event
 * animated-opacity descriptor. When the consumer's
 * `getEventOpacity` callback returns a non-null value, EventBlock
 * applies it via `useAnimatedStyle` so the tile breathes on the UI
 * thread without re-rendering the calendar's FlashList.
 *
 * `phase` is a discriminator the consumer chooses (e.g. "source" /
 * "dest" for chain visualization). EventBlock just multiplies/inverts
 * around `[0, 1]` per phase — see the worklet body below.
 */
export interface EventOpacityDescriptor {
    sv: SharedValue<number>;
    phase: "source" | "dest";
}

export type GetEventOpacity = (
    event: Event,
) => EventOpacityDescriptor | null | undefined;

/**
 * FORK Phase 26 (2026-05-10) — per-event rendered-bounds report.
 *
 * Fires from the outer Animated.View's `onLayout` whenever the
 * EventBlock's rendered rect changes (initial mount, frame-prop
 * change, styleOverrides container resize, multi-tech layout
 * recompute, etc.). Reports the rect in the EventBlock's parent
 * coordinate space — i.e., column-local (X is intra-column,
 * Y is intra-grid since columns share a Y=0 origin in the calendar
 * body).
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
 * Bounds reported here are post-style, so consumers can land
 * arrow endpoints flush against the visible card.
 *
 * Coordinate space: column-local (matches what `View.onLayout`
 * naturally reports on an absolutely-positioned child). Consumers
 * combine with their existing column-offset math to produce
 * grid-coordinate rects.
 *
 * Performance: `onLayout` fires once per actual layout pass, not
 * continuously during scroll (scroll doesn't change a child's
 * layout, only the parent's transform). For a calendar with 50
 * visible events, expect ~50 callbacks on initial mount and
 * burst-fire on horizontal pans / resize, then quiet.
 */
export type OnEventLayout = (
    event: Event,
    layout: { x: number; y: number; width: number; height: number },
) => void;

interface EventBlockProps {
    event: Event;
    hourHeight: number;
    frame: EventFrame;
    disabled?: boolean;
    selected?: boolean;
    onLongPress?: (event: Event) => void;
    onPress?: (event: Event) => void;
    slots?: EventSlots;
    styleOverrides?:
        | StyleOverrides
        | ((event: Event) => StyleOverrides | undefined);
    /**
     * FORK Phase 25 (PR-UX-2). Optional per-event opacity animator.
     * When the callback returns a descriptor, the tile's outer
     * container is wrapped in an `Animated.View` whose opacity reads
     * from the supplied SharedValue (interpolated by phase). When the
     * callback returns null/undefined OR is itself absent, opacity
     * stays static at 1 — zero-overhead path for non-animated
     * calendars.
     */
    getEventOpacity?: GetEventOpacity;
    /**
     * FORK Phase 26 (2026-05-10) — receives the post-style rendered
     * rect of this EventBlock on every layout change. Optional; when
     * absent, EventBlock skips the onLayout wiring entirely (zero
     * cost). See `OnEventLayout` doc-block above for the coordinate-
     * space contract.
     */
    onEventLayout?: OnEventLayout;
}

const EventBlock: React.FC<EventBlockProps> = React.memo(({
                                                              event,
                                                              onLongPress,
                                                              onPress, disabled, selected,
                                                              hourHeight, slots,
                                                              frame,
                                                              styleOverrides,
                                                              getEventOpacity,
                                                              onEventLayout,
                                                          }) => {
    const {useGetSelectedEvent} =
        useCalendarBinding();
    const selectedAppointment = useGetSelectedEvent();

    const eventTop = scalePosition(event.from, hourHeight);
    const eventHeight = scalePosition(event.to - event.from, hourHeight);

    const start = minutesToTime(event.from);
    const end = minutesToTime(event.to);

    const dynamicStyle = {
        top: eventTop + 2,
        height: eventHeight < hourHeight / 4 ? eventHeight : eventHeight - 4,
        left: frame.leftPx + 1,
        width: frame.widthPx - 3,
        zIndex: frame.zIndex,
        opacity: selectedAppointment || disabled ? 0.5 : 1,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? "#4d959c" : "rgba(0,0,0,0.12)",
    };

    const resolved =
        typeof styleOverrides === 'function'
            ? styleOverrides(event) ?? {}
            : styleOverrides ?? {};

    // FORK Phase 25 (PR-UX-2 / move-chain tile pulse): resolve the
    // per-event opacity descriptor up-front so `useAnimatedStyle` sees
    // a stable identity in its dep array. When `getEventOpacity` is
    // absent or returns null, `desc` stays null and the worklet
    // returns opacity:1 — i.e. the animation engine becomes a no-op
    // for calendars that don't opt in.
    //
    // Hooks-rules note: we MUST always call `useAnimatedStyle` (not
    // conditionally on `desc`), otherwise React will trip
    // "Rendered more hooks than during the previous render" the
    // moment a chain selection flips on/off mid-mount. The conditional
    // lives inside the worklet instead.
    // Phase 25.1 fix (2026-05-05): return {} when no descriptor (NOT
    // {opacity: 1}) so static container.opacity from
    // applyMoveChainBorderOverride's dim path isn't clobbered by the
    // animated wrapper layer. See dist/index.js for the full rationale.
    const opacityDesc = getEventOpacity ? getEventOpacity(event) ?? null : null;

    // FORK Phase 25.2 (PR-UX-2 / move-chain pulse diagnostics, 2026-05-05):
    // log a single line per event whenever the opacity descriptor's
    // *meaning* changes (null → source, source → dest, dest → null,
    // etc.) so we can confirm at a glance that the descriptor produced
    // by the consumer-side resolver actually reaches this render path.
    //
    // FORK Phase 25.3 (avatar-reorder regression fix, 2026-05-05):
    // moved the `lastPhaseRef.current = currentPhase` mutation OUT of
    // the render body and into a `useEffect`. Mutating a ref directly
    // during render is a React anti-pattern; while it doesn't trigger
    // a re-render on its own, it makes the component's behavior
    // incorrect under StrictMode's double-invoke (the ref value
    // observed in render #1 is "wrong" by the time render #2 reads
    // it) and is flagged as a smell by every linter that knows the
    // rule. Empirically this also coincided with a user-visible
    // regression in the avatar long-press → reorder flow on a real
    // device build; we couldn't conclusively root-cause it via static
    // analysis but moving the mutation behind a `useEffect` removes
    // it as a candidate AND keeps the diagnostic log intact. See
    // dev-log entry 2026-05-05 "Avatar reorder LongPress regression".
    const lastPhaseRef = React.useRef<"source" | "dest" | null>(null);
    const currentPhase = opacityDesc?.phase ?? null;
    React.useEffect(() => {
        if (!__DEV__) return;
        if (lastPhaseRef.current === currentPhase) return;
        // eslint-disable-next-line no-console
        console.log("[MoveChain:Pulse:EventBlock]", {
            eventId: (event as {id?: number | string}).id,
            from: lastPhaseRef.current,
            to: currentPhase,
        });
        lastPhaseRef.current = currentPhase;
    }, [currentPhase, event]);

    const opacityAnimatedStyle = useAnimatedStyle(() => {
        if (!opacityDesc) return {};
        const v = opacityDesc.sv.value;
        if (opacityDesc.phase === "source") return {opacity: v};
        // "dest" phase: anti-symmetric around the [MIN, MAX] midpoint.
        // The consumer's pulse value is bounded inside [MIN, MAX]
        // (singleton enforces) so MAX + MIN - v stays inside the same
        // band. See `moveChainPulseOpacity` in
        // `src/components/calendar/move-chain-pulse-singleton.ts` for
        // the reference implementation — kept inline here so the
        // vendored library has zero outbound dependency on consumer
        // code.
        const MIN = 0.3;
        const MAX = 1.0;
        return {opacity: MAX + MIN - v};
    }, [opacityDesc]);

    // FORK Phase 26 (2026-05-10) — outer-View layout reporter. Wraps
    // the consumer callback in a `useCallback` keyed on the event +
    // callback identity so React doesn't re-fire layout on every
    // parent render. Bailout when `onEventLayout` is absent — the
    // resulting `undefined` skips the onLayout wiring on the
    // Animated.View entirely.
    //
    // Hooks-rules note: like `useAnimatedStyle` above, this hook is
    // called UNCONDITIONALLY (the conditional is on the consumer
    // path, not on hook presence). Keeping it stable across the
    // `eventHeight == 0` early-return guard below.
    const handleEventLayout = React.useCallback(
        (e: LayoutChangeEvent) => {
            if (!onEventLayout) return;
            const { x, y, width, height } = e.nativeEvent.layout;
            onEventLayout(event, { x, y, width, height });
        },
        [event, onEventLayout],
    );

    if (eventHeight == 0)
        return null;

    const TopRight = slots?.TopRight;
    const Body = slots?.Body;
    const titleFace = useResolvedFont({fontWeight: '700'});
    const timeFace = useResolvedFont({fontWeight: '600'});

    return (
        // FORK Phase 25 (PR-UX-2 / move-chain tile pulse): outer
        // Animated.View carries position + animated opacity; inner
        // TouchableOpacity owns press handlers and visual content. We
        // intentionally keep the press surface on TouchableOpacity (not
        // on the Animated.View) so iOS still gets the native press-down
        // feedback. The Animated.View is `pointerEvents="box-none"` so
        // touches pass through to the TouchableOpacity unchanged.
        <Animated.View
            pointerEvents="box-none"
            style={[styles.event, dynamicStyle, resolved?.container, opacityAnimatedStyle]}
            // FORK Phase 26 (2026-05-10) — only attach the onLayout
            // handler when the consumer provided a callback. Passing
            // `undefined` lets React skip the layout-change tracking
            // for calendars that don't need bounds reporting.
            onLayout={onEventLayout ? handleEventLayout : undefined}
        >
        <TouchableOpacity
            // FORK Phase 23 (PR-UX-2): swapped `resolved?.container` to
            // last so user-supplied container styles (opacity, borderWidth,
            // borderColor) actually override the library's hard-coded
            // dynamicStyle. Matches the order already used in DraggableEvent.
            // FORK Phase 25 follow-up: container styles now live on the
            // wrapping Animated.View above, so the inner Touchable just
            // takes the inner content layout (`flex: 1`).
            style={styles.eventInner}
            disabled={disabled}
            onPress={() => {
                onPress && onPress(event);
            }}
            onLongPress={() => {
                onLongPress && onLongPress(event);
            }}
        >
            <Col style={[{position: "relative"}, resolved?.content]}>
                <TextInput
                    editable={false}
                    allowFontScaling={false}
                    underlineColorAndroid="transparent" // Disables underline on Android
                    style={[{
                        width: "100%",
                        fontFamily: timeFace,
                        fontSize: getTextSize(hourHeight),
                        pointerEvents: "none",
                        padding: 0,
                        margin: 0,
                        color: "black",
                    }, resolved?.time]}
                    defaultValue={`${start} - ${end}`}
                />

                {
                    Body ? <Body event={event} ctx={{hourHeight}}/> :
                        <>
                            <Row style={{alignItems: "center", height: 18}}>
                                <Text
                                    allowFontScaling={false}
                                    style={[{
                                        fontFamily: titleFace,
                                        fontSize: getTextSize(hourHeight),
                                        fontWeight: "700"
                                    }, resolved?.title]}
                                >{event?.title}</Text>
                            </Row>
                            <Text
                                allowFontScaling={false}
                                style={[{
                                    fontFamily: timeFace,
                                    fontSize: getTextSize(hourHeight),
                                    fontWeight: "600"
                                }, resolved?.desc]}>{event?.description}</Text>
                        </>
                }
                <Row style={{
                    position: "absolute",
                    right: 2
                }}>
                    {TopRight ? <TopRight event={event} ctx={{hourHeight}}/> : null}
                </Row>
            </Col>
        </TouchableOpacity>
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    event: {
        backgroundColor: '#4d959c',
        position: 'absolute',
        borderRadius: 5,
        padding: 2,
        overflow: "hidden",
        zIndex: 9999, // Ensure events stay above the background blocks
    },
    // FORK Phase 25 (PR-UX-2 / move-chain tile pulse): inner
    // TouchableOpacity inside the outer Animated.View. `flex:1` so it
    // fills the wrapper, no padding/border (those still come from
    // the wrapper's `dynamicStyle` + `resolved?.container`).
    eventInner: {
        flex: 1,
    }
});

export default EventBlock;
