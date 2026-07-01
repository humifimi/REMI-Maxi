import { StyleSheet, View, Text, Pressable, Linking, Platform } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { RouteStopStatus } from "@technician/types/enums";
import { useActiveTimerStore } from "@technician/stores/active-timer";
import type { RouteStopWithDetails } from "@technician/types/api";

interface RouteStopCardProps {
  stop: RouteStopWithDetails;
  stopNumber: number;
  isCurrentStop: boolean;
  onPress?: () => void;
  onNavigate?: () => void;
  onArrive?: () => void;
  onDepart?: () => void;
  onContinueJob?: () => void;
  onStockPress?: () => void;
}

const STOP_STATUS_CONFIG: Record<
  string,
  { circleColor: string; borderColor: string; bgColor: string; opacity: number }
> = {
  [RouteStopStatus.PENDING]: {
    circleColor: "#9CA3AF",
    borderColor: "#E5E7EB",
    bgColor: "#FFFFFF",
    opacity: 1,
  },
  [RouteStopStatus.EN_ROUTE]: {
    circleColor: "#3B82F6",
    borderColor: "#3B82F6",
    bgColor: "#EFF6FF",
    opacity: 1,
  },
  [RouteStopStatus.ARRIVED]: {
    circleColor: "#3B82F6",
    borderColor: "#3B82F6",
    bgColor: "#DBEAFE",
    opacity: 1,
  },
  [RouteStopStatus.COMPLETED]: {
    circleColor: "#22C55E",
    borderColor: "#E5E7EB",
    bgColor: "#F9FAFB",
    opacity: 0.6,
  },
  [RouteStopStatus.SKIPPED]: {
    circleColor: "#6B7280",
    borderColor: "#E5E7EB",
    bgColor: "#F3F4F6",
    opacity: 0.5,
  },
};

function formatArrivalTime(isoString: string | null): string {
  if (!isoString) return "--:--";
  const d = new Date(isoString);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}:${m} ${ampm}`;
}

function openMapsWithAddress(address: string) {
  const encoded = encodeURIComponent(address);
  const googleUrl =
    Platform.OS === "ios"
      ? `comgooglemaps://?daddr=${encoded}&directionsmode=driving`
      : `google.navigation:q=${encoded}`;
  Linking.openURL(googleUrl).catch(() => {
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${encoded}`
    );
  });
}

export function RouteStopCard({
  stop,
  stopNumber,
  isCurrentStop,
  onPress,
  onNavigate,
  onArrive,
  onDepart,
  onContinueJob,
  onStockPress,
}: RouteStopCardProps) {
  const config = STOP_STATUS_CONFIG[stop.status] ?? STOP_STATUS_CONFIG.pending;
  const isCompleted = stop.status === RouteStopStatus.COMPLETED;
  const isSkipped = stop.status === RouteStopStatus.SKIPPED;
  const isArrived = stop.status === RouteStopStatus.ARRIVED;

  // PLAN-DEVIATION: 2026-04-26-resume-job-label — see docs/PLAN-DEVIATIONS.md.
  // The route-stop API doesn't surface the underlying appointment's status, so
  // we can't tell from `stop` alone whether the technician already started this
  // job and stepped away. We use the active-timer Zustand store as a same-session
  // signal: if it points at this appointment and is running, the button should
  // read "Resume Job". Cross-session safety still comes from the briefing screen
  // redirecting in_progress → /timer.
  const activeTimerJobId = useActiveTimerStore((s) => s.jobId);
  const activeTimerIsRunning = useActiveTimerStore((s) => s.isRunning);
  const isInProgress =
    activeTimerIsRunning && activeTimerJobId === stop.appointment_id;

  const addressText = [stop.address_line, stop.address_city]
    .filter(Boolean)
    .join(", ");

  const handleNavigate = () => {
    if (onNavigate) {
      onNavigate();
    } else {
      openMapsWithAddress(addressText);
    }
  };

  return (
    <Pressable
      style={[
        styles.card,
        {
          borderLeftColor: config.borderColor,
          backgroundColor: config.bgColor,
          opacity: config.opacity,
        },
        isCurrentStop && styles.currentCard,
      ]}
      onPress={onPress}
    >
      <View style={styles.header}>
        <View style={[styles.stopCircle, { backgroundColor: config.circleColor }]}>
          {isCompleted ? (
            <MaterialIcons name="check" size={14} color="#fff" />
          ) : (
            <Text style={styles.stopNumber}>{stopNumber}</Text>
          )}
        </View>

        <View style={styles.headerRight}>
          <Text style={styles.arrivalTime}>
            {formatArrivalTime(stop.estimated_arrival)}
          </Text>
          {stop.drive_time_from_previous_min != null &&
            stop.drive_time_from_previous_min > 0 && (
              <View style={styles.driveBadge}>
                <MaterialIcons name="directions-car" size={12} color="#6B7280" />
                <Text style={styles.driveText}>
                  {Math.round(stop.drive_time_from_previous_min)} min
                </Text>
              </View>
            )}
        </View>
      </View>

      <View style={styles.body}>
        <Text
          style={[styles.customerName, isSkipped && styles.strikethrough]}
          numberOfLines={1}
        >
          {stop.customer_name ?? `Appointment #${stop.appointment_id}`}
        </Text>
        {addressText ? (
          <Text style={styles.address} numberOfLines={1}>
            {addressText}
          </Text>
        ) : null}
        {stop.service_names ? (
          <Text style={styles.services} numberOfLines={1}>
            {stop.service_names}
          </Text>
        ) : null}
        {stop.stock_status && stop.stock_status !== "ok" && (stop.stock_issue_count ?? 0) > 0 && (
          <Pressable
            style={[
              styles.stockBadge,
              stop.stock_status === "out" ? styles.stockBadgeOut : styles.stockBadgeLow,
            ]}
            onPress={onStockPress}
            hitSlop={6}
          >
            <MaterialIcons
              name="warning"
              size={12}
              color={stop.stock_status === "out" ? "#DC2626" : "#D97706"}
            />
            <Text
              style={[
                styles.stockBadgeText,
                stop.stock_status === "out" ? styles.stockBadgeTextOut : styles.stockBadgeTextLow,
              ]}
            >
              {stop.stock_issue_count} part{stop.stock_issue_count !== 1 ? "s" : ""}{" "}
              {stop.stock_status === "out" ? "out of stock" : "low"}
            </Text>
            <MaterialIcons name="chevron-right" size={14} color={stop.stock_status === "out" ? "#DC2626" : "#D97706"} />
          </Pressable>
        )}
      </View>

      <View style={styles.actions}>
        {!isCompleted && !isSkipped && !isArrived && (
          <Pressable style={styles.navButton} onPress={handleNavigate}>
            <MaterialIcons name="navigation" size={18} color="#3B82F6" />
            <Text style={styles.navText}>Navigate</Text>
          </Pressable>
        )}

        {isCurrentStop && !isArrived && !isCompleted && onArrive && (
          <Pressable style={styles.arriveButton} onPress={onArrive}>
            <MaterialIcons name="place" size={16} color="#fff" />
            <Text style={styles.arriveText}>I'm Here</Text>
          </Pressable>
        )}

        {(isArrived || (isCurrentStop && stop.status === RouteStopStatus.EN_ROUTE)) && onContinueJob && (
          <Pressable style={styles.continueJobButton} onPress={onContinueJob}>
            <MaterialIcons
              name={isInProgress ? "play-arrow" : "play-circle-outline"}
              size={20}
              color="#3B82F6"
            />
            <Text style={styles.continueJobText}>
              {isInProgress ? "Resume Job" : "Start Job"}
            </Text>
          </Pressable>
        )}

        {isArrived && onDepart && (
          <Pressable style={styles.departButton} onPress={onDepart}>
            <MaterialIcons name="exit-to-app" size={16} color="#fff" />
            <Text style={styles.departText}>Leaving</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 14,
    marginBottom: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  currentCard: {
    borderLeftWidth: 5,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  stopCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stopNumber: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  arrivalTime: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  driveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  driveText: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "500",
  },
  body: {
    marginLeft: 36,
    marginBottom: 8,
  },
  customerName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 2,
  },
  strikethrough: {
    textDecorationLine: "line-through",
    color: "#9CA3AF",
  },
  address: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 2,
  },
  services: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  stockBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  stockBadgeOut: {
    backgroundColor: "#FEE2E2",
  },
  stockBadgeLow: {
    backgroundColor: "#FEF3C7",
  },
  stockBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  stockBadgeTextOut: {
    color: "#DC2626",
  },
  stockBadgeTextLow: {
    color: "#D97706",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
  navButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    backgroundColor: "#EFF6FF",
    gap: 4,
  },
  navText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3B82F6",
  },
  continueJobButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    gap: 4,
    minHeight: 44,
  },
  continueJobText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3B82F6",
  },
  arriveButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#3B82F6",
    gap: 4,
  },
  arriveText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  departButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#F59E0B",
    gap: 4,
  },
  departText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
});
