/// <reference types="react-native-reanimated" />
import React from "react";
import { State as GestureState } from "react-native-gesture-handler";
export default function AnimatedValueProvider({ children, }: {
    children: React.ReactNode;
}): JSX.Element;
export declare function useAnimatedValues(): {
    activeCellOffset: import("react-native-reanimated").SharedValue<number>;
    activeCellSize: import("react-native-reanimated").SharedValue<number>;
    activeIndexAnim: import("react-native-reanimated").SharedValue<number>;
    containerSize: import("react-native-reanimated").SharedValue<number>;
    /** FORK Phase 1 (REMI snap-zone fork) — see README-FORK.md "Phase 1". */
    disableSpacerTracking: import("react-native-reanimated").SharedValue<boolean>;
    /** FORK Phase 2 (REMI split-shift fork) — see README-FORK.md "Phase 2". */
    splitShiftLeftCellIdx: import("react-native-reanimated").SharedValue<number>;
    /** FORK Phase 2 (REMI split-shift fork) — see README-FORK.md "Phase 2". */
    splitShiftRightCellIdx: import("react-native-reanimated").SharedValue<number>;
    /** FORK Phase 3 (REMI off-end shift-all fork) — see README-FORK.md "Phase 3". */
    shiftAllBeforeIdx: import("react-native-reanimated").SharedValue<number>;
    /** FORK Phase 3 (REMI off-end shift-all fork) — see README-FORK.md "Phase 3". */
    shiftAllAfterIdx: import("react-native-reanimated").SharedValue<number>;
    disabled: import("react-native-reanimated").SharedValue<boolean>;
    horizontalAnim: import("react-native-reanimated").SharedValue<boolean>;
    hoverAnim: Readonly<{
        value: number;
    }>;
    hoverOffset: Readonly<{
        value: number;
    }>;
    isDraggingCell: Readonly<{
        value: boolean;
    }>;
    isTouchActiveNative: import("react-native-reanimated").SharedValue<boolean>;
    panGestureState: import("react-native-reanimated").SharedValue<GestureState>;
    placeholderOffset: import("react-native-reanimated").SharedValue<number>;
    resetTouchedCell: () => void;
    scrollOffset: import("react-native-reanimated").SharedValue<number>;
    scrollViewSize: import("react-native-reanimated").SharedValue<number>;
    spacerIndexAnim: import("react-native-reanimated").SharedValue<number>;
    touchPositionDiff: Readonly<{
        value: number;
    }>;
    touchTranslate: import("react-native-reanimated").SharedValue<number>;
    autoScrollDistance: Readonly<{
        value: number;
    }>;
    viewableIndexMin: import("react-native-reanimated").SharedValue<number>;
    viewableIndexMax: import("react-native-reanimated").SharedValue<number>;
};
