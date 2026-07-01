import { StyleSheet, View, Text, Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { FleetDashboard } from "@technician/types/api";

interface FleetCompanyCardProps {
  dashboard: FleetDashboard;
  onPress: () => void;
}

export function FleetCompanyCard({ dashboard, onPress }: FleetCompanyCardProps) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <MaterialIcons name="business" size={22} color="#3B82F6" />
        </View>
        <Text style={styles.name}>{dashboard.company_name}</Text>
        <MaterialIcons name="chevron-right" size={24} color="#9CA3AF" />
      </View>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{dashboard.vehicle_count}</Text>
          <Text style={styles.statLabel}>Vehicles</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, dashboard.overdue_count > 0 && { color: "#EF4444" }]}>
            {dashboard.overdue_count}
          </Text>
          <Text style={styles.statLabel}>Overdue</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{dashboard.upcoming_due_count}</Text>
          <Text style={styles.statLabel}>Due Soon</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            ${dashboard.total_spend >= 1000
              ? `${(dashboard.total_spend / 1000).toFixed(1)}k`
              : dashboard.total_spend.toFixed(0)}
          </Text>
          <Text style={styles.statLabel}>Total Spend</Text>
        </View>
      </View>
      {dashboard.last_service_date ? (
        <Text style={styles.lastService}>
          Last serviced{" "}
          {new Date(dashboard.last_service_date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 17, fontWeight: "700", color: "#111827", flex: 1 },
  stats: { flexDirection: "row", gap: 4 },
  stat: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    paddingVertical: 10,
    borderRadius: 8,
  },
  statValue: { fontSize: 18, fontWeight: "800", color: "#111827" },
  statLabel: { fontSize: 10, color: "#9CA3AF", marginTop: 2, fontWeight: "600" },
  lastService: { fontSize: 12, color: "#9CA3AF", marginTop: 10 },
});
