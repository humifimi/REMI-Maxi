import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  runOnJS,
  interpolateColor,
} from "react-native-reanimated";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { useBubbleState } from "@technician/hooks/utility/use-bubble-state";
import { useFrustrationDetection } from "@technician/hooks/ai/use-frustration-detection";

const BUBBLE_SIZE = 48;
const EDGE_PADDING = 8;
const SPRING_CONFIG = { damping: 20, stiffness: 200 };
const DISMISS_ZONE_SIZE = 56;
const DISMISS_ZONE_BOTTOM = 120;
const DISMISS_HIT_RADIUS = 64;

interface BugReportBubbleProps {
  onPress: () => void;
}

export function BugReportBubble({ onPress }: BugReportBubbleProps) {
  const { width: screenWidth, height: screenHeight } =
    Dimensions.get("window");
  const bubbleState = useBubbleState();
  const frustration = useFrustrationDetection();
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const translateX = useSharedValue(screenWidth - BUBBLE_SIZE - EDGE_PADDING);
  const translateY = useSharedValue(screenHeight * 0.6);
  const scale = useSharedValue(1);
  const contextX = useSharedValue(0);
  const contextY = useSharedValue(0);
  const isDragging = useSharedValue(0);
  const isNearDismiss = useSharedValue(0);

  const dismissCenterX = screenWidth / 2;
  const dismissCenterY = screenHeight - DISMISS_ZONE_BOTTOM;

  useEffect(() => {
    if (bubbleState.isVisible) {
      scale.value = 1;
    }
  }, [bubbleState.isVisible, scale]);

  useEffect(() => {
    if (bubbleState.position.x >= 0 && bubbleState.position.y >= 0) {
      translateX.value = bubbleState.position.x;
      translateY.value = bubbleState.position.y;
    }
  }, [bubbleState.position, translateX, translateY]);

  useEffect(() => {
    if (bubbleState.showFirstTimeTooltip && bubbleState.isVisible) {
      setShowTooltip(true);
      tooltipTimer.current = setTimeout(() => {
        setShowTooltip(false);
        bubbleState.dismissTooltip();
      }, 5000);
    }
    return () => {
      if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    };
  }, [bubbleState.showFirstTimeTooltip, bubbleState.isVisible]);

  useEffect(() => {
    if (frustration.shouldNudge) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 200 }),
          withTiming(1.0, { duration: 200 })
        ),
        3,
        false
      );
      frustration.markNudged();
    }
  }, [frustration.shouldNudge, scale, frustration]);

  const handlePress = () => {
    haptic.light();
    setShowTooltip(false);
    bubbleState.dismissTooltip();
    onPress();
  };

  const handleDismiss = () => {
    haptic.warning();
    if (bubbleState.shouldSuggestDisable) {
      Alert.alert(
        "Disable Bug Reporter?",
        "You've dismissed this a few times. Would you like to turn it off? You can re-enable it in Settings.",
        [
          {
            text: "Keep It",
            style: "cancel",
            onPress: () => bubbleState.dismiss(),
          },
          {
            text: "Turn Off",
            style: "destructive",
            onPress: () => bubbleState.disablePermanently(),
          },
        ]
      );
    } else {
      bubbleState.dismiss();
    }
  };

  const onEnterDismissZone = () => haptic.light();

  const savePosition = (x: number, y: number) => {
    bubbleState.updatePosition({ x, y });
  };

  const snapToEdge = (currentX: number, currentY: number) => {
    "worklet";
    const midpoint = screenWidth / 2;
    const snapX =
      currentX < midpoint
        ? EDGE_PADDING
        : screenWidth - BUBBLE_SIZE - EDGE_PADDING;
    const clampedY = Math.max(
      EDGE_PADDING + 44,
      Math.min(currentY, screenHeight - BUBBLE_SIZE - EDGE_PADDING - 80)
    );

    translateX.value = withSpring(snapX, SPRING_CONFIG);
    translateY.value = withSpring(clampedY, SPRING_CONFIG);
    runOnJS(savePosition)(snapX, clampedY);
  };

  const isInDismissZone = (bx: number, by: number) => {
    "worklet";
    const cx = bx + BUBBLE_SIZE / 2;
    const cy = by + BUBBLE_SIZE / 2;
    const dx = cx - dismissCenterX;
    const dy = cy - dismissCenterY;
    return Math.sqrt(dx * dx + dy * dy) < DISMISS_HIT_RADIUS;
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      contextX.value = translateX.value;
      contextY.value = translateY.value;
      isDragging.value = withTiming(1, { duration: 200 });
    })
    .onUpdate((event) => {
      translateX.value = contextX.value + event.translationX;
      translateY.value = contextY.value + event.translationY;

      const near = isInDismissZone(translateX.value, translateY.value);
      const wasNear = isNearDismiss.value > 0.5;

      if (near && !wasNear) {
        isNearDismiss.value = withTiming(1, { duration: 150 });
        runOnJS(onEnterDismissZone)();
      } else if (!near && wasNear) {
        isNearDismiss.value = withTiming(0, { duration: 150 });
      }
    })
    .onEnd(() => {
      isDragging.value = withTiming(0, { duration: 200 });

      if (isInDismissZone(translateX.value, translateY.value)) {
        translateX.value = withTiming(dismissCenterX - BUBBLE_SIZE / 2, {
          duration: 150,
        });
        translateY.value = withTiming(dismissCenterY - BUBBLE_SIZE / 2, {
          duration: 150,
        });
        scale.value = withTiming(0, { duration: 200 });
        isNearDismiss.value = withTiming(0, { duration: 200 });
        runOnJS(handleDismiss)();
      } else {
        isNearDismiss.value = withTiming(0, { duration: 150 });
        snapToEdge(translateX.value, translateY.value);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const dismissZoneStyle = useAnimatedStyle(() => ({
    opacity: isDragging.value,
    transform: [
      { scale: 0.8 + isDragging.value * 0.2 + isNearDismiss.value * 0.15 },
    ],
    backgroundColor: interpolateColor(
      isNearDismiss.value,
      [0, 1],
      ["rgba(31, 41, 55, 0.8)", "rgba(239, 68, 68, 0.9)"]
    ),
  }));

  const inactiveIconOpacity = useAnimatedStyle(() => ({
    opacity: 1 - isNearDismiss.value,
  }));

  const activeIconOpacity = useAnimatedStyle(() => ({
    opacity: isNearDismiss.value,
  }));

  if (!bubbleState.isVisible) return null;

  const isNudging = frustration.shouldNudge;

  return (
    <>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.container, animatedStyle]}>
          <Pressable onPress={handlePress} style={styles.bubble}>
            <MaterialIcons name="bug-report" size={24} color="#fff" />
          </Pressable>
          {isNudging && <View style={styles.nudgeDot} />}
        </Animated.View>
      </GestureDetector>

      <Animated.View
        style={[
          styles.dismissZone,
          {
            left: dismissCenterX - DISMISS_ZONE_SIZE / 2,
            top: dismissCenterY - DISMISS_ZONE_SIZE / 2,
          },
          dismissZoneStyle,
        ]}
        pointerEvents="none"
      >
        <Animated.View style={inactiveIconOpacity}>
          <MaterialIcons name="delete-outline" size={26} color="#9CA3AF" />
        </Animated.View>
        <Animated.View style={[styles.dismissIconOverlay, activeIconOpacity]}>
          <MaterialIcons name="delete" size={28} color="#fff" />
        </Animated.View>
      </Animated.View>

      {showTooltip && (
        <Animated.View
          style={[
            styles.tooltip,
            {
              top: translateY.value - 40,
              right: EDGE_PADDING + BUBBLE_SIZE + 8,
            },
          ]}
        >
          <Text style={styles.tooltipText}>Tap here to report issues</Text>
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    zIndex: 9999,
  },
  bubble: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  nudgeDot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#F59E0B",
    borderWidth: 2,
    borderColor: "#fff",
  },
  dismissZone: {
    position: "absolute",
    width: DISMISS_ZONE_SIZE,
    height: DISMISS_ZONE_SIZE,
    borderRadius: DISMISS_ZONE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9998,
  },
  dismissIconOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  tooltip: {
    position: "absolute",
    backgroundColor: "#1F2937",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    maxWidth: 200,
  },
  tooltipText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
  },
});
