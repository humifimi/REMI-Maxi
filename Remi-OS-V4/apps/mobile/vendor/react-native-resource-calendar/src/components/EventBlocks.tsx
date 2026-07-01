import React, {useMemo} from "react";
import {useCalendarBinding} from "@/store/bindings/BindingProvider";
import {Event, LayoutMode} from "@/types/calendarTypes";
import {EventRenderer} from "./EventBlock";
import {computeEventFrames} from "@/utilities/helpers";

type FlagFn = (event: Event) => boolean;

interface EventBlocksProps {
    id: number;
    EVENT_BLOCK_WIDTH: number;
    hourHeight: number;
    onLongPress: (evt: Event) => void;
    onPress: (evt: Event) => void;
    eventRenderer: EventRenderer;
    isEventSelected?: FlagFn;
    isEventDisabled?: FlagFn;
    mode: LayoutMode;
    date?: Date;
}

const EventBlocks: React.FC<EventBlocksProps> = React.memo(({
                                                                id,
                                                                onLongPress,
                                                                onPress,
                                                                hourHeight,
                                                                EVENT_BLOCK_WIDTH,
                                                                eventRenderer,
                                                                isEventDisabled, isEventSelected,
                                                                mode,
                                                                date: dateProp
                                                            }) => {

    const {useEventsFor, useGetDate} =
        useCalendarBinding();
    const date = useGetDate();
    const events = useEventsFor(id, dateProp ?? date);
    const frameMap = useMemo(
        () => computeEventFrames(events, EVENT_BLOCK_WIDTH, mode),
        [events, mode, EVENT_BLOCK_WIDTH]
    );

    const Renderer = eventRenderer;

    return (events?.map((evt: Event, index: number) => {
                const selected = isEventSelected?.(evt) ?? false;
                const disabled = isEventDisabled?.(evt) ?? false;

                return <Renderer
                    // FORK Phase 38 (2026-05-13 — key by stable event id, not slot position).
                    // Pre-Phase-38 key was `${evt.from}-${evt.to}-${index}` (slot-based). When
                    // `applyIntentsToWorld` swaps an appointment into a slot held by another
                    // appointment in the same column, React reconciled by matching the slot key
                    // and reused the existing EventBlock instance with a new `event` prop.
                    // Because the View's position did not change, `onLayout` did not fire and
                    // the consumer-side `useEventBoundsRegistry` (Phase 26) silently retained
                    // the previous occupant's rect → wrong-direction arrows after Future→Now
                    // toggle. Keying by `evt.id` forces React to unmount the previous occupant
                    // and mount the new one, which fires `onLayout` and keeps the registry
                    // consistent with what's painted on screen.
                    key={evt.id}
                    event={evt}
                    onLongPress={(evt: Event) => onLongPress(evt)}
                    onPress={(evt: Event) => onPress(evt)}
                    hourHeight={hourHeight}
                    frame={frameMap.get(evt.id)!}
                    selected={selected}
                    disabled={disabled}
                />
            }
        )
    );
});

export default EventBlocks;
