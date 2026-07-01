import { useState } from "react";
import { StyleSheet, View, Text, Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { StatusColorMap, StatusBackgroundMap } from "@technician/constants/colors";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { openMapsNavigation, formatTravelTime } from "@technician/utils/navigation";
import type { Appointment, ExceptionAlert } from "@technician/types/api";

const ALERT_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  info: { bg: "#EFF6FF", fg: "#3B82F6", border: "#DBEAFE" },
  warning: { bg: "#FFF7ED", fg: "#F97316", border: "#FFEDD5" },
  critical: { bg: "#FEE2E2", fg: "#EF4444", border: "#FECACA" },
};

interface JobCardProps {
  appointment: Appointment;
  alerts?: ExceptionAlert[];
  onPress?: () => void;
  onStartPress?: () => void;
  onLongPress?: () => void;
  bulkMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

export function JobCard({
  appointment,
  alerts,
  onPress,
  onStartPress,
  onLongPress,
  bulkMode = false,
  isSelected = false,
  onToggleSelect,
}: JobCardProps) {
  const borderColor = StatusColorMap[appointment.status];
  const backgroundColor = StatusBackgroundMap[appointment.status];
  const [expandedAlert, setExpandedAlert] = useState<number | null>(null);

  const customerLabel =
    appointment.customer_name ??
    appointment.customer?.full_name ??
    `Customer #${appointment.customer_id}`;

  const vehicleLabel =
    [
      appointment.vehicle_year ?? appointment.vehicle?.year,
      appointment.vehicle_make ?? appointment.vehicle?.make,
      appointment.vehicle_model ?? appointment.vehicle?.model,
    ]
      .filter(Boolean)
      .join(" ") || "No vehicle";

  const locationLabel = [appointment.address_line, appointment.address_city]
    .filter(Boolean)
    .join(", ");

  const timeLabel = appointment.scheduled_time
    ? formatTime(appointment.scheduled_time)
    : "Walk-in";

  const hasAlerts = alerts && alerts.length > 0;

  const handlePress = () => {
    if (bulkMode) {
      onToggleSelect?.();
    } else {
      onPress?.();
    }
  };

  return (
    <Pressable
      style={[
        styles.card,
        { borderLeftColor: borderColor, backgroundColor: backgroundColor + "40" },
      ]}
      onPress={handlePress}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      {bulkMode && (
        <View style={styles.checkboxRow}>
          <MaterialIcons
            name={isSelected ? "check-box" : "check-box-outline-blank"}
            size={24}
            color={isSelected ? "#3B82F6" : "#D1D5DB"}
          />
        </View>
      )}

      <View style={[styles.header, bulkMode && { paddingLeft: 32 }]}>
        <View style={styles.timeContainer}>
          <Text style={styles.time}>{timeLabel}</Text>
          {hasAlerts && (
            <View style={styles.alertBadgeRow}>
              {alerts.map((alert) => {
                const colors = ALERT_COLORS[alert.severity] ?? ALERT_COLORS.info;
                return (
                  <Pressable
                    key={alert.id}
                    style={[
                      styles.alertDot,
                      { backgroundColor: colors.fg },
                    ]}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      setExpandedAlert(
                        expandedAlert === alert.id ? null : alert.id
                      );
                    }}
                    hitSlop={8}
                  />
                );
              })}
            </View>
          )}
        </View>
        <StatusBadge status={appointment.status} size="small" />
      </View>

      {expandedAlert != null && hasAlerts && (
        <View style={styles.alertDetail}>
          {alerts
            .filter((a) => a.id === expandedAlert)
            .map((alert) => {
              const colors = ALERT_COLORS[alert.severity] ?? ALERT_COLORS.info;
              return (
                <View
                  key={alert.id}
                  style={[
                    styles.alertDetailCard,
                    {
                      backgroundColor: colors.bg,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <MaterialIcons name="info-outline" size={14} color={colors.fg} />
                  <Text style={[styles.alertDetailText, { color: colors.fg }]}>
                    {alert.message}
                  </Text>
                </View>
              );
            })}
        </View>
      )}

      <Text style={styles.customerName}>{customerLabel}</Text>
      <Text style={styles.vehicleInfo}>{vehicleLabel}</Text>

      {locationLabel ? (
        <Pressable
          style={styles.locationRow}
          onPress={() => {
            haptic.light();
            openMapsNavigation(
              locationLabel,
              appointment.address_lat,
              appointment.address_lng
            );
          }}
          hitSlop={4}
        >
          <MaterialIcons name="place" size={14} color="#6B7280" />
          <Text style={styles.locationTappable} numberOfLines={1}>
            {locationLabel}
          </Text>
          {appointment.estimated_travel_minutes != null &&
            appointment.estimated_travel_minutes > 0 && (
              <View style={styles.travelBadge}>
                <MaterialIcons name="directions-car" size={11} color="#6B7280" />
                <Text style={styles.travelText}>
                  {formatTravelTime(appointment.estimated_travel_minutes)}
                </Text>
              </View>
            )}
        </Pressable>
      ) : null}

      {appointment.service_names ? (
        <Text style={styles.services} numberOfLines={1}>
          {appointment.service_names}
        </Text>
      ) : null}

      {appointment.notes ? (
        <Text style={styles.notes} numberOfLines={1}>
          {appointment.notes}
        </Text>
      ) : null}

      {onStartPress &&
        !bulkMode &&
        (appointment.status === "created" ||
          appointment.status === "confirmed" ||
          appointment.status === "accepted") ? (
        <Pressable style={styles.startButton} onPress={() => {
          haptic.medium();
          onStartPress?.();
        }}>
          <Text style={styles.startButtonText}>Start Job</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(":");
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}:${minutes} ${ampm}`;
}

const styles = StyleSheet.create({
  card: {
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 16,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  checkboxRow: {
    position: "absolute",
    left: 16,
    top: 16,
    zIndex: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  timeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  time: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  alertBadgeRow: {
    flexDirection: "row",
    gap: 4,
  },
  alertDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  alertDetail: {
    marginBottom: 8,
  },
  alertDetailCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  alertDetailText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  customerName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  vehicleInfo: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 4,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  locationTappable: {
    fontSize: 13,
    color: "#3B82F6",
    flex: 1,
    textDecorationLine: "underline",
  },
  travelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  travelText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
  },
  services: {
    fontSize: 13,
    color: "#3B82F6",
    fontWeight: "500",
    marginBottom: 4,
  },
  notes: {
    fontSize: 13,
    color: "#9CA3AF",
    fontStyle: "italic",
  },
  startButton: {
    marginTop: 12,
    backgroundColor: "#3B82F6",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  startButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
