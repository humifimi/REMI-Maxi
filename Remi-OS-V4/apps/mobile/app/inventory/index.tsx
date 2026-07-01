import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  SectionList,
  FlatList,
  Pressable,
  RefreshControl,
  LayoutAnimation,
  UIManager,
  Platform,
} from "react-native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useAuthStore } from "@/src/stores/auth";
import {
  useMyStock,
  useParAlerts,
  useFranchiseStock,
  useFranchiseParAlerts,
} from "@technician/hooks/inventory/use-inventory";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";
import { getParStatusColor } from "@technician/constants/colors";
import { UserRole } from "@technician/types/enums";
import type { StockLevel } from "@technician/types/api";

const QUICK_ACTIONS = [
  { key: "par-alerts", icon: "warning" as const, label: "Par Alerts", color: "#EF4444" },
  { key: "adjust", icon: "tune" as const, label: "Adjust Stock", color: "#3B82F6" },
  { key: "waste", icon: "delete-outline" as const, label: "Waste", color: "#F59E0B" },
  { key: "transfer", icon: "swap-horiz" as const, label: "Transfer", color: "#8B5CF6" },
  { key: "history", icon: "history" as const, label: "History", color: "#6B7280" },
] as const;

function StockRow({
  item,
  alertMap,
  showLocation,
}: {
  item: StockLevel;
  alertMap: Map<string, { par_min: number; par_target: number }>;
  showLocation?: boolean;
}) {
  const alert = alertMap.get(`${item.item_id}-${item.location_id}`);
  const parMin = alert?.par_min ?? 0;
  const parTarget = alert?.par_target ?? item.on_hand + 1;
  const statusColor = getParStatusColor(item.on_hand, parMin, parTarget);

  return (
    <View style={styles.stockRow}>
      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
      <View style={styles.stockInfo}>
        <Text style={styles.stockName}>
          {item.item_name ?? `Item #${item.item_id}`}
        </Text>
        {item.item_sku ? (
          <Text style={styles.stockSku}>{item.item_sku}</Text>
        ) : null}
        {showLocation && item.location_name ? (
          <Text style={styles.stockLocation}>{item.location_name}</Text>
        ) : null}
      </View>
      <View style={styles.stockNumbers}>
        <Text style={[styles.stockAvail, { color: statusColor }]}>
          {item.available}
        </Text>
        <Text style={styles.stockLabel}>avail</Text>
      </View>
      <View style={styles.stockNumbers}>
        <Text style={styles.stockOnHand}>{item.on_hand}</Text>
        <Text style={styles.stockLabel}>on hand</Text>
      </View>
    </View>
  );
}

function TechnicianInventory() {
  const router = useRouter();
  const { data: stock = [], isLoading, isRefetching, refetch, isError } = useMyStock();
  const { data: alerts = [] } = useParAlerts();

  if (isLoading && !isRefetching && !isError) return <SkeletonListScreen />;

  const alertMap = new Map(
    alerts.map((a) => [
      `${a.item_id}-${a.location_id}`,
      { par_min: a.par_min, par_target: a.par_target },
    ])
  );

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        {QUICK_ACTIONS.map((action) => (
          <Pressable
            key={action.key}
            style={styles.actionBtn}
            onPress={() => router.push(`/inventory/${action.key}`)}
          >
            <View
              style={[
                styles.actionIcon,
                { backgroundColor: action.color + "15" },
              ]}
            >
              <MaterialIcons
                name={action.icon}
                size={22}
                color={action.color}
              />
            </View>
            <Text style={styles.actionLabel}>{action.label}</Text>
            {action.key === "par-alerts" && alerts.length > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{alerts.length}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>
        Van Stock ({stock.length} items)
      </Text>
      <FlatList
        data={stock}
        keyExtractor={(item) => `${item.item_id}-${item.location_id}`}
        renderItem={({ item }) => (
          <StockRow item={item} alertMap={alertMap} />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name="inventory-2" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No stock data</Text>
            <Text style={styles.emptyText}>
              Stock levels will appear once your van is set up.
            </Text>
          </View>
        }
      />
    </View>
  );
}

function FranchiseInventory() {
  const router = useRouter();
  const {
    data: stock = [],
    isLoading,
    isRefetching,
    isError,
    refetch,
  } = useFranchiseStock();
  const { data: alerts = [] } = useFranchiseParAlerts();

  // 2026-05-25 — default every section to COLLAPSED so the user
  // lands on a compact list. `hasInitializedCollapse` ensures we
  // only seed the initial set once (when stock arrives) and don't
  // re-collapse sections the user has explicitly expanded.
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const hasInitializedCollapse = useRef(false);

  const toggleSection = useCallback((locationId: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(locationId)) {
        next.delete(locationId);
      } else {
        next.add(locationId);
      }
      return next;
    });
  }, []);

  const alertMap = useMemo(
    () =>
      new Map(
        alerts.map((a) => [
          `${a.item_id}-${a.location_id}`,
          { par_min: a.par_min, par_target: a.par_target },
        ])
      ),
    [alerts]
  );

  const allSections = useMemo(() => {
    const grouped = new Map<
      number,
      { title: string; locationId: number; totalCount: number; data: StockLevel[] }
    >();
    for (const item of stock) {
      const key = item.location_id;
      if (!grouped.has(key)) {
        // 2026-05-25 — Friendlier titles. Prefer the technician's
        // name ("Josh Bishop's Van") over the raw location name
        // ("Josh's Van"), and prefer the raw location name over
        // "Van #${id}" — which was the visible bug before the BE
        // inventory_ledger query started joining
        // inventory_locations + users.
        const techName = item.technician_name?.trim();
        const locName = item.location_name?.trim();
        const title = techName
          ? `${techName}'s Van`
          : locName && locName.length > 0
            ? locName
            : `Van #${item.location_id}`;
        grouped.set(key, {
          title,
          locationId: key,
          totalCount: 0,
          data: [],
        });
      }
      const group = grouped.get(key)!;
      group.totalCount++;
      group.data.push(item);
    }
    return Array.from(grouped.values());
  }, [stock]);

  // 2026-05-25 — Seed the collapsed-set the first time stock data
  // arrives so every section starts compact. After the user
  // expands one manually, we don't want to re-collapse it on
  // subsequent refetches — so the seeding is one-shot.
  useEffect(() => {
    if (hasInitializedCollapse.current) return;
    if (allSections.length === 0) return;
    hasInitializedCollapse.current = true;
    setCollapsed(new Set(allSections.map((s) => s.locationId)));
  }, [allSections]);

  const sections = useMemo(
    () =>
      allSections.map((s) => ({
        ...s,
        data: collapsed.has(s.locationId) ? [] : s.data,
      })),
    [allSections, collapsed]
  );

  const totalItems = stock.length;
  const locationCount = allSections.length;

  if (isLoading && !isRefetching && !isError) return <SkeletonListScreen />;

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        {QUICK_ACTIONS.map((action) => (
          <Pressable
            key={action.key}
            style={styles.actionBtn}
            onPress={() => router.push(`/inventory/${action.key}`)}
          >
            <View
              style={[
                styles.actionIcon,
                { backgroundColor: action.color + "15" },
              ]}
            >
              <MaterialIcons
                name={action.icon}
                size={22}
                color={action.color}
              />
            </View>
            <Text style={styles.actionLabel}>{action.label}</Text>
            {action.key === "par-alerts" && alerts.length > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{alerts.length}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>

      <View style={styles.franchiseSummary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{locationCount}</Text>
          <Text style={styles.summaryLabel}>Vans</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{totalItems}</Text>
          <Text style={styles.summaryLabel}>Items</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, alerts.length > 0 && { color: "#EF4444" }]}>
            {alerts.length}
          </Text>
          <Text style={styles.summaryLabel}>Alerts</Text>
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => `${item.item_id}-${item.location_id}`}
        renderSectionHeader={({ section }) => {
          const isCollapsed = collapsed.has(section.locationId);
          return (
            <Pressable
              style={styles.sectionHeader}
              onPress={() => toggleSection(section.locationId)}
            >
              <MaterialIcons
                name="local-shipping"
                size={16}
                color="#6B7280"
              />
              <Text style={styles.sectionHeaderText}>
                {section.title} ({section.totalCount})
              </Text>
              <MaterialIcons
                name={isCollapsed ? "expand-more" : "expand-less"}
                size={22}
                color="#9CA3AF"
                style={styles.sectionChevron}
              />
            </Pressable>
          );
        }}
        renderItem={({ item }) => (
          <StockRow item={item} alertMap={alertMap} />
        )}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name="inventory-2" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No stock data</Text>
            <Text style={styles.emptyText}>
              Stock levels will appear once technician vans are set up.
            </Text>
          </View>
        }
      />
    </View>
  );
}

export default function InventoryDashboard() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isFranchiseOwner = user?.role === UserRole.FRANCHISE_OWNER;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Inventory",
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={{ padding: 8, marginLeft: -8 }}
            >
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      {isFranchiseOwner ? <FranchiseInventory /> : <TechnicianInventory />}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  actions: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 16,
    gap: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  actionBtn: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    position: "relative",
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#374151",
    textAlign: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: 4,
    backgroundColor: "#EF4444",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  franchiseSummary: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  summaryItem: { alignItems: "center" },
  summaryValue: { fontSize: 22, fontWeight: "800", color: "#111827" },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6B7280",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: "#F9FAFB",
  },
  sectionHeaderText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionChevron: {
    marginLeft: "auto",
  },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  stockInfo: { flex: 1 },
  stockName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  stockSku: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  stockLocation: { fontSize: 11, color: "#6B7280", marginTop: 2 },
  stockNumbers: { alignItems: "center", minWidth: 44 },
  stockAvail: { fontSize: 18, fontWeight: "800" },
  stockOnHand: { fontSize: 16, fontWeight: "600", color: "#6B7280" },
  stockLabel: { fontSize: 10, color: "#9CA3AF", marginTop: 1 },
  empty: { alignItems: "center", paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#374151" },
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
