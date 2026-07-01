import { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  useShuttleOrders,
  useShuttleDashboard,
  useShuttleCompanyOrders,
} from "@technician/hooks/operations/use-shuttle";
import {
  ShuttleStatusColorMap,
  ShuttleStatusLabels,
  ShuttlePriorityColorMap,
  ShuttlePriorityLabels,
} from "@technician/constants/colors";
import type { ShuttleOrder } from "@technician/types/api";
import type { ShuttleStatus } from "@technician/types/enums";

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "created", label: "Created" },
  { key: "assigned", label: "Assigned" },
  { key: "in_transit", label: "In Transit" },
  { key: "in_service", label: "In Service" },
  { key: "returning", label: "Returning" },
  { key: "completed", label: "Done" },
];

export default function ShuttleScreen() {
  const router = useRouter();
  const { companyId } = useLocalSearchParams<{ companyId?: string }>();
  const cId = companyId ? parseInt(companyId, 10) : 0;
  const [statusFilter, setStatusFilter] = useState("all");

  const filterParam = statusFilter === "all" ? undefined : statusFilter;

  const allOrders = useShuttleOrders(
    cId ? undefined : { status: filterParam }
  );
  const companyOrders = useShuttleCompanyOrders(
    cId,
    cId ? { status: filterParam } : undefined
  );

  const { data: dashboard } = useShuttleDashboard();

  const source = cId ? companyOrders : allOrders;
  const orders = source.data ?? [];
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    try { await source.refetch(); } finally { setRefreshing(false); }
  }

  const renderItem = ({ item }: { item: ShuttleOrder }) => {
    const vehicleLabel = [item.vehicle_year, item.vehicle_make, item.vehicle_model]
      .filter(Boolean)
      .join(" ") || `Vehicle #${item.vehicle_id}`;
    const statusColor = ShuttleStatusColorMap[item.status];
    const priorityColor = ShuttlePriorityColorMap[item.priority];

    return (
      <Pressable
        style={[styles.orderCard, { borderLeftColor: statusColor }]}
        onPress={() =>
          router.push({
            pathname: "/fleet/shuttle-order",
            params: { orderId: String(item.id) },
          })
        }
      >
        <View style={styles.orderHeader}>
          <Text style={styles.orderId}>#{item.id}</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusColor + "20" },
            ]}
          >
            <Text style={[styles.statusText, { color: statusColor }]}>
              {ShuttleStatusLabels[item.status]}
            </Text>
          </View>
        </View>
        <Text style={styles.orderVehicle}>{vehicleLabel}</Text>
        {item.vehicle_license_plate && (
          <Text style={styles.orderPlate}>{item.vehicle_license_plate}</Text>
        )}
        <Text style={styles.orderService} numberOfLines={1}>
          {item.service_description}
        </Text>
        <View style={styles.orderFooter}>
          {item.fleet_company_name && (
            <Text style={styles.orderCompany}>{item.fleet_company_name}</Text>
          )}
          {item.partner_name && (
            <View style={styles.partnerBadge}>
              <MaterialIcons name="store" size={12} color="#6366F1" />
              <Text style={styles.partnerText}>{item.partner_name}</Text>
            </View>
          )}
          <View
            style={[
              styles.priorityBadge,
              { backgroundColor: priorityColor + "15" },
            ]}
          >
            <Text style={[styles.priorityText, { color: priorityColor }]}>
              {ShuttlePriorityLabels[item.priority]}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Shuttle Tracker",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <View style={styles.container}>
        {dashboard && (
          <View style={styles.dashboardRow}>
            <DashStat label="Active" value={dashboard.active_orders} color="#3B82F6" />
            <DashStat label="Transit" value={dashboard.in_transit} color="#8B5CF6" />
            <DashStat label="In Shop" value={dashboard.in_service} color="#F97316" />
            <DashStat label="Returning" value={dashboard.returning} color="#06B6D4" />
            <DashStat label="Done/wk" value={dashboard.completed_this_week} color="#22C55E" />
          </View>
        )}

        <FlatList
          data={STATUS_FILTERS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => (
            <Pressable
              style={[
                styles.filterChip,
                statusFilter === item.key && styles.filterChipActive,
              ]}
              onPress={() => setStatusFilter(item.key)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  statusFilter === item.key && styles.filterChipTextActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          )}
          contentContainerStyle={styles.filterBar}
        />

        <FlatList
          data={orders}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialIcons name="local-shipping" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>No shuttle orders</Text>
            </View>
          }
        />
      </View>
    </>
  );
}

function DashStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={styles.dashStat}>
      <Text style={[styles.dashValue, { color }]}>{value}</Text>
      <Text style={styles.dashLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },

  dashboardRow: {
    flexDirection: "row",
    backgroundColor: "#fff",
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  dashStat: { flex: 1, alignItems: "center" },
  dashValue: { fontSize: 20, fontWeight: "800" },
  dashLabel: { fontSize: 10, color: "#9CA3AF", fontWeight: "600", marginTop: 2 },

  filterBar: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
  },
  filterChipActive: { backgroundColor: "#3B82F6" },
  filterChipText: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  filterChipTextActive: { color: "#fff" },

  listContent: { padding: 16, paddingBottom: 24 },
  orderCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  orderId: { fontSize: 13, fontWeight: "700", color: "#374151" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: "700" },
  orderVehicle: { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 2 },
  orderPlate: { fontSize: 12, color: "#6B7280", marginBottom: 4 },
  orderService: { fontSize: 13, color: "#6B7280", marginBottom: 8 },
  orderFooter: { flexDirection: "row", alignItems: "center", gap: 8 },
  orderCompany: { fontSize: 12, fontWeight: "600", color: "#374151" },
  partnerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  partnerText: { fontSize: 11, fontWeight: "600", color: "#6366F1" },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: "auto",
  },
  priorityText: { fontSize: 11, fontWeight: "700" },

  empty: { alignItems: "center", paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, color: "#9CA3AF", fontWeight: "500" },
});
