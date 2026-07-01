import { StyleSheet, View, Text, FlatList, RefreshControl } from "react-native";
import { Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useAuthStore } from "@/src/stores/auth";
import {
  useParAlerts,
  useFranchiseParAlerts,
} from "@technician/hooks/inventory/use-inventory";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";
import { UserRole } from "@technician/types/enums";
import type { ParLevelAlert } from "@technician/types/api";

function AlertCard({
  item,
  suggestMap,
  showLocation,
}: {
  item: ParLevelAlert;
  suggestMap: Map<string, { suggested_quantity: number }>;
  showLocation?: boolean;
}) {
  const suggestion = suggestMap.get(`${item.item_id}-${item.location_id}`);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <MaterialIcons name="warning" size={20} color="#EF4444" />
        <Text style={styles.itemName}>{item.item_name}</Text>
      </View>
      <Text style={styles.sku}>{item.item_sku}</Text>
      {showLocation && item.location_name ? (
        <View style={styles.locationRow}>
          <MaterialIcons name="local-shipping" size={14} color="#6B7280" />
          <Text style={styles.locationText}>{item.location_name}</Text>
        </View>
      ) : null}
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{item.on_hand}</Text>
          <Text style={styles.statLabel}>On Hand</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: "#EF4444" }]}>
            {item.par_min}
          </Text>
          <Text style={styles.statLabel}>Minimum</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{item.par_target}</Text>
          <Text style={styles.statLabel}>Target</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: "#DC2626" }]}>
            -{item.deficit}
          </Text>
          <Text style={styles.statLabel}>Deficit</Text>
        </View>
      </View>
      {suggestion ? (
        <View style={styles.suggestion}>
          <MaterialIcons name="lightbulb-outline" size={16} color="#F59E0B" />
          <Text style={styles.suggestionText}>
            Reorder {suggestion.suggested_quantity} units to reach target
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function ParAlertsScreen() {
  const user = useAuthStore((s) => s.user);
  const isFranchiseOwner = user?.role === UserRole.FRANCHISE_OWNER;

  const techQuery = useParAlerts();
  const franchiseQuery = useFranchiseParAlerts();

  const activeQuery = isFranchiseOwner ? franchiseQuery : techQuery;
  const alerts = activeQuery.data ?? [];
  const { isLoading, isRefetching, isError, refetch } = activeQuery;

  if (isLoading && !isRefetching && !isError) return <SkeletonListScreen />;

  const suggestMap = new Map<
    string,
    { suggested_quantity: number }
  >();

  return (
    <>
      <Stack.Screen options={{ title: "Par Level Alerts" }} />
      <FlatList
        style={styles.container}
        data={alerts}
        keyExtractor={(item) => `${item.item_id}-${item.location_id}`}
        renderItem={({ item }) => (
          <AlertCard
            item={item}
            suggestMap={suggestMap}
            showLocation={isFranchiseOwner}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name="check-circle" size={56} color="#22C55E" />
            <Text style={styles.emptyTitle}>All stocked up</Text>
            <Text style={styles.emptyText}>
              No items are below their minimum par level.
            </Text>
          </View>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  list: { padding: 16, paddingBottom: 24 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#EF4444",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
  },
  sku: { fontSize: 12, color: "#9CA3AF", marginTop: 2, marginLeft: 28 },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    marginLeft: 28,
  },
  locationText: { fontSize: 12, color: "#6B7280", fontWeight: "500" },
  stats: { flexDirection: "row", marginTop: 14, gap: 4 },
  stat: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    paddingVertical: 10,
    borderRadius: 8,
  },
  statValue: { fontSize: 18, fontWeight: "800", color: "#111827" },
  statLabel: {
    fontSize: 10,
    color: "#9CA3AF",
    marginTop: 2,
    fontWeight: "600",
  },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  suggestionText: {
    fontSize: 13,
    color: "#92400E",
    fontWeight: "500",
    flex: 1,
  },
  empty: { alignItems: "center", paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#374151" },
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
