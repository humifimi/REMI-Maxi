import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useActiveTimerStore } from "@technician/stores/active-timer";
import {
  useActiveTimerTick,
  formatTimerDisplay,
} from "@technician/hooks/jobs/use-job-timer";
import { haptic } from "@technician/hooks/utility/use-haptics";

export function ActiveTimerBar() {
  const { isRunning, jobId, serviceName } = useActiveTimerStore();
  const tick = useActiveTimerTick();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const isOnTimerScreen = pathname.includes("/timer");
  if (!isRunning || !tick || isOnTimerScreen) return null;

  const displayTime = tick.hasSchedule
    ? formatTimerDisplay(tick.remainingSec)
    : formatTimerDisplay(tick.elapsedSec);

  const handlePress = () => {
    haptic.light();
    if (jobId) router.push(`/job/${jobId}/timer` as never);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.bar,
        { top: insets.top, backgroundColor: tick.statusColor },
      ]}
    >
      <View style={styles.content}>
        <MaterialIcons name="timer" size={16} color="#fff" />
        <Text style={styles.time} numberOfLines={1}>
          {displayTime}
        </Text>
        <Text style={styles.separator}>|</Text>
        <Text style={styles.label} numberOfLines={1}>
          {serviceName ?? "Service"}
        </Text>
        <MaterialIcons name="chevron-right" size={18} color="rgba(255,255,255,0.8)" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  time: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
    fontVariant: ["tabular-nums"],
  },
  separator: {
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.9)",
    flexShrink: 1,
  },
});
