import { StyleSheet, View, Text, FlatList, Pressable, RefreshControl } from "react-native";
import { useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useFleetCompanies } from "@technician/hooks/inventory/use-fleet";
import { FleetCompanyCard } from "@technician/components/fleet/fleet-company-card";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";
import type { FleetCompany, FleetDashboard } from "@technician/types/api";

/**
 * 2026-05-25 — uses the batched aggregates returned inline on each
 * `FleetCompany` row from `/franchise/fleet/companies` instead of
 * issuing a per-row `useFleetDashboard` call. Eliminates the
 * N=161 round-trip pattern that was leaving most cards stuck on
 * the zero-fallback while their individual dashboards loaded.
 *
 * `overdue_count` + `upcoming_due_count` aren't part of the batch
 * (they require per-vehicle iterative compute that's too heavy for
 * a list endpoint). The list card displays them as 0; the detail
 * screen calls `useFleetDashboard` for the accurate breakdown.
 */
function FleetCompanyListItem({ company, onPress }: { company: FleetCompany; onPress: () => void }) {
  const display: FleetDashboard = {
    company_id: company.id,
    company_name: company.name,
    vehicle_count: company.vehicle_count ?? 0,
    overdue_count: 0,
    upcoming_due_count: 0,
    last_service_date: company.last_service_date ?? null,
    total_spend: company.total_spend ?? 0,
  };
  return <FleetCompanyCard dashboard={display} onPress={onPress} />;
}

export default function FleetListScreen() {
  const router = useRouter();
  const { data: companies = [], isLoading, isRefetching, refetch } = useFleetCompanies();

  if (isLoading && !isRefetching) return <SkeletonListScreen />;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Fleet Manager",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
          headerRight: () => (
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable onPress={() => router.push("/fleet/due-soon")} hitSlop={8}>
                <MaterialIcons name="notification-important" size={22} color="#fff" />
              </Pressable>
              <Pressable onPress={() => router.push("/fleet/shuttle")} hitSlop={8}>
                <MaterialIcons name="local-shipping" size={22} color="#fff" />
              </Pressable>
              <Pressable onPress={() => router.push("/fleet/analytics")} hitSlop={8}>
                <MaterialIcons name="analytics" size={22} color="#fff" />
              </Pressable>
            </View>
          ),
        }}
      />
      <FlatList
        style={styles.container}
        data={companies}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <FleetCompanyListItem
            company={item}
            onPress={() => router.push(`/fleet/${item.id}`)}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name="local-shipping" size={56} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No fleet accounts</Text>
            <Text style={styles.emptyText}>
              Fleet accounts will appear here once companies are configured.
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
  empty: { alignItems: "center", paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#374151" },
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
