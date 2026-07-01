import { StyleSheet, View } from "react-native";
import { ALERT_SEVERITY_COLORS } from "@technician/constants/calendar";
import type { AppointmentAlert } from "@technician/types/calendar";

interface AlertBadgeProps {
  alerts: AppointmentAlert[];
}

export function AlertBadge({ alerts }: AlertBadgeProps) {
  if (alerts.length === 0) return null;

  const worst = alerts.find((a) => a.severity === "critical") ?? alerts[0];
  const color =
    ALERT_SEVERITY_COLORS[worst.severity] ?? ALERT_SEVERITY_COLORS.warning;

  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    position: "absolute",
    top: 3,
    right: 3,
  },
});
