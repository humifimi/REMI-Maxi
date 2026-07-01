import { StyleSheet, View, Text } from "react-native";
import { StatusColorMap, StatusLabels } from "@technician/constants/colors";
import type { AppointmentStatus } from "@technician/types/enums";

interface StatusBadgeProps {
  status: AppointmentStatus;
  size?: "small" | "default";
}

export function StatusBadge({ status, size = "default" }: StatusBadgeProps) {
  const color = StatusColorMap[status];
  const label = StatusLabels[status];
  const isSmall = size === "small";

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: color + "20", borderColor: color },
        isSmall && styles.badgeSmall,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text
        style={[
          styles.label,
          { color },
          isSmall && styles.labelSmall,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    alignSelf: "flex-start",
  },
  badgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
  },
  labelSmall: {
    fontSize: 11,
  },
});
