import { useEffect, useCallback, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
} from "react-native-reanimated";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

interface BugReportToastProps {
  visible: boolean;
  onDismiss: () => void;
  duration?: number;
}

const ENTER_MS = 300;
const EXIT_MS = 250;
const DEFAULT_HOLD = 3000;

export function BugReportToast({
  visible,
  onDismiss,
  duration = DEFAULT_HOLD,
}: BugReportToastProps) {
  const translateY = useSharedValue(80);
  const opacity = useSharedValue(0);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const safeDismiss = useCallback(() => {
    if (isMounted.current) onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (visible) {
      translateY.value = withSequence(
        withTiming(0, { duration: ENTER_MS }),
        withDelay(
          duration,
          withTiming(80, { duration: EXIT_MS }, (finished) => {
            if (finished) runOnJS(safeDismiss)();
          })
        )
      );
      opacity.value = withSequence(
        withTiming(1, { duration: ENTER_MS }),
        withDelay(duration, withTiming(0, { duration: EXIT_MS }))
      );
    } else {
      translateY.value = 80;
      opacity.value = 0;
    }
  }, [visible, duration, translateY, opacity, safeDismiss]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <View style={styles.iconWrap}>
        <MaterialIcons name="check-circle" size={20} color="#22C55E" />
      </View>
      <Text style={styles.message}>Bug report submitted</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: "#1F2937",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
    zIndex: 10001,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    color: "#E5E7EB",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
});
