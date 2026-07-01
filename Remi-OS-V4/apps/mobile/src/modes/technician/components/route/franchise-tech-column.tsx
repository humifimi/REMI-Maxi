import { StyleSheet, View, Text, Pressable, ScrollView } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { RouteStopStatus } from "@technician/types/enums";
import type { FranchiseCalendarEntry, RouteStop } from "@technician/types/api";

interface FranchiseTechColumnProps {
  entry: FranchiseCalendarEntry;
  onStopPress?: (stop: RouteStop) => void;
  onReassign?: (stop: RouteStop) => void;
}

const STOP_DOT_COLORS: Record<string, string> = {
  [RouteStopStatus.PENDING]: "#9CA3AF",
  [RouteStopStatus.EN_ROUTE]: "#3B82F6",
  [RouteStopStatus.ARRIVED]: "#2563EB",
  [RouteStopStatus.COMPLETED]: "#22C55E",
  [RouteStopStatus.SKIPPED]: "#D1D5DB",
};

function formatStopTime(arrival: string | null): string {
  if (!arrival) return "--:--";
  const d = new Date(arrival);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}:${m} ${ampm}`;
}

export function FranchiseTechColumn({
  entry,
  onStopPress,
  onReassign,
}: FranchiseTechColumnProps) {
  const completedCount = entry.stops.filter(
    (s) => s.status === RouteStopStatus.COMPLETED
  ).length;

  return (
    <View style={styles.column}>
      <View style={styles.header}>
        <Text style={styles.techName} numberOfLines={1}>
          {entry.technicianName}
        </Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>
            {completedCount}/{entry.stopCount}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.stopList}
        contentContainerStyle={styles.stopListContent}
        showsVerticalScrollIndicator={false}
      >
        {entry.stops.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="event-busy" size={20} color="#D1D5DB" />
            <Text style={styles.emptyText}>No stops</Text>
          </View>
        ) : (
          entry.stops
            .sort((a, b) => a.stop_order - b.stop_order)
            .map((stop) => (
              <Pressable
                key={stop.id}
                style={styles.stopCard}
                onPress={() => onStopPress?.(stop)}
                onLongPress={() => onReassign?.(stop)}
              >
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor:
                        STOP_DOT_COLORS[stop.status] ?? "#9CA3AF",
                    },
                  ]}
                />
                <View style={styles.stopInfo}>
                  <Text style={styles.stopTime}>
                    {formatStopTime(stop.estimated_arrival)}
                  </Text>
                  <Text style={styles.stopAppointment} numberOfLines={1}>
                    {stop.customer_name ?? `Appt #${stop.appointment_id}`}
                  </Text>
                </View>
              </Pressable>
            ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    width: 160,
    backgroundColor: "#fff",
    borderRadius: 12,
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#F9FAFB",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  techName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
    marginRight: 6,
  },
  countBadge: {
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  countText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#3B82F6",
  },
  stopList: {
    maxHeight: 340,
  },
  stopListContent: {
    padding: 8,
  },
  stopCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
    backgroundColor: "#F9FAFB",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  stopInfo: {
    flex: 1,
  },
  stopTime: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  stopAppointment: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 1,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 6,
  },
  emptyText: {
    fontSize: 12,
    color: "#9CA3AF",
  },
});
