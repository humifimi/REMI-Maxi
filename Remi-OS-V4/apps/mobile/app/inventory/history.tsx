import { useState } from "react";
import { StyleSheet, View, Text, FlatList, Pressable, RefreshControl } from "react-native";
import { Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useAuthStore } from "@/src/stores/auth";
import { useInventoryHistory } from "@technician/hooks/inventory/use-inventory";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";
import { UserRole } from "@technician/types/enums";
import type { InventoryLedgerEntry } from "@technician/types/api";

const REASON_LABELS: Record<string, string> = {
  receive_stock: "Received",
  transfer_in: "Transfer In",
  transfer_out: "Transfer Out",
  reserve_for_job: "Reserved",
  release_reservation: "Released",
  consume_on_complete: "Consumed",
  adjustment: "Adjusted",
  cycle_count_correction: "Cycle Count",
  waste_added: "Waste",
};

const REASON_ICONS: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  receive_stock: "add-box",
  transfer_in: "call-received",
  transfer_out: "call-made",
  reserve_for_job: "lock",
  release_reservation: "lock-open",
  consume_on_complete: "check-circle",
  adjustment: "tune",
  cycle_count_correction: "fact-check",
  waste_added: "delete-outline",
};

export default function HistoryScreen() {
  const user = useAuthStore((s) => s.user);
  const isFranchiseOwner = user?.role === UserRole.FRANCHISE_OWNER;
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const { data: entries = [], isLoading, isRefetching, isError, refetch } = useInventoryHistory(
    filter ? { reasonCode: filter } : undefined
  );

  if (isLoading && !isRefetching && !isError) return <SkeletonListScreen />;

  const filters = [
    { key: undefined, label: "All" },
    { key: "adjustment", label: "Adjustments" },
    { key: "consume_on_complete", label: "Consumed" },
    { key: "receive_stock", label: "Received" },
    { key: "waste_added", label: "Waste" },
  ] as const;

  const renderItem = ({ item }: { item: InventoryLedgerEntry }) => {
    const isPositive = item.quantity_change > 0;
    const icon = REASON_ICONS[item.reason_code] ?? "swap-vert";
    const label = REASON_LABELS[item.reason_code] ?? item.reason_code;
    const date = new Date(item.created_at);

    return (
      <View style={styles.entry}>
        <View style={[styles.iconWrap, { backgroundColor: isPositive ? "#DCFCE7" : "#FEE2E2" }]}>
          <MaterialIcons name={icon} size={18} color={isPositive ? "#16A34A" : "#DC2626"} />
        </View>
        <View style={styles.entryInfo}>
          <Text style={styles.entryItem}>{item.item_name ?? `Item #${item.item_id}`}</Text>
          <Text style={styles.entryReason}>{label}</Text>
          {isFranchiseOwner && (item.technician_name || item.location_name) ? (
            <Text style={styles.entryLocation}>
              {item.technician_name ?? item.location_name}
            </Text>
          ) : null}
          {item.notes ? <Text style={styles.entryNotes}>{item.notes}</Text> : null}
        </View>
        <View style={styles.entryRight}>
          <Text style={[styles.entryQty, { color: isPositive ? "#16A34A" : "#DC2626" }]}>
            {isPositive ? "+" : ""}{item.quantity_change}
          </Text>
          <Text style={styles.entryDate}>
            {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: "Inventory History" }} />
      <View style={styles.container}>
      <View style={styles.filterRow}>
        {filters.map((f) => (
          <Pressable
            key={f.key ?? "all"}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={entries}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name="history" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No history yet</Text>
          </View>
        }
      />
    </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  filterChipActive: { backgroundColor: "#3B82F6" },
  filterText: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  filterTextActive: { color: "#fff" },
  list: { padding: 16, paddingBottom: 24 },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    gap: 12,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  entryInfo: { flex: 1 },
  entryItem: { fontSize: 14, fontWeight: "600", color: "#111827" },
  entryReason: { fontSize: 12, color: "#6B7280", marginTop: 1 },
  entryLocation: { fontSize: 11, color: "#6B7280", marginTop: 2 },
  entryNotes: { fontSize: 11, color: "#9CA3AF", marginTop: 2, fontStyle: "italic" },
  entryRight: { alignItems: "flex-end" },
  entryQty: { fontSize: 16, fontWeight: "800" },
  entryDate: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  empty: { alignItems: "center", paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#374151" },
});
