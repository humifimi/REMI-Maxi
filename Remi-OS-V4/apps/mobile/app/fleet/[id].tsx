import { useState, useCallback, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  RefreshControl,
  Alert,
  TextInput,
  Linking,
} from "react-native";
import { type AppSheetRef } from "@technician/components/sheets";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  useFleetDashboard,
  useFleetCompanyVehicles,
  useFleetDueSoon,
  useFleetBilling,
  useFleetHealthDashboard,
  useFleetDeferredSummary,
  useFleetOutreachTargets,
  useAssignFleetVehicle,
  useAssignFleetDriver,
} from "@technician/hooks/inventory/use-fleet";
import { useFleetOrders } from "@technician/hooks/jobs/use-jobs";
import { SkeletonDetailScreen } from "@/src/components/shared/skeleton";
import { OrderCard } from "@technician/components/order/order-card";
import { SwipeableRow } from "@/src/components/shared/swipeable-row";
import { NudgeActionSheet } from "@technician/components/fleet/nudge-action-sheet";
import { haptic } from "@technician/hooks/utility/use-haptics";
import {
  DueStatusColorMap,
  ObservationTypeLabels,
  StatusColors,
  SeverityColorMap,
} from "@technician/constants/colors";
import type {
  Appointment,
  FleetDeferredSummary as FleetDeferredSummaryType,
  FleetDueSoonEntry,
  FleetVehicle,
  FleetOutreachTarget,
} from "@technician/types/api";

type FleetTab =
  | "health"
  | "overview"
  | "vehicles"
  | "orders"
  | "discovered"
  | "due-soon"
  | "billing";

const TABS: { key: FleetTab; label: string }[] = [
  { key: "health", label: "Health" },
  { key: "overview", label: "Overview" },
  { key: "vehicles", label: "Vehicles" },
  { key: "orders", label: "Orders" },
  { key: "discovered", label: "Discovered" },
  { key: "due-soon", label: "Due Soon" },
  { key: "billing", label: "Billing" },
];

export default function FleetCompanyDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const companyId = parseInt(id, 10) || 0;
  const [activeTab, setActiveTab] = useState<FleetTab>("health");

  const { data: dashboard, isLoading } = useFleetDashboard(companyId);

  if (isLoading) return <SkeletonDetailScreen />;

  return (
    <>
      <Stack.Screen
        options={{
          title: dashboard?.company_name ?? "Fleet Company",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <View style={styles.container}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabScroll}
          contentContainerStyle={styles.tabBar}
        >
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab.key && styles.tabTextActive,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.actionBar}>
          <Pressable
            style={styles.actionBtn}
            onPress={() =>
              router.push({ pathname: "/fleet/check", params: { companyId: String(companyId) } })
            }
          >
            <MaterialIcons name="checklist" size={18} color="#3B82F6" />
            <Text style={styles.actionBtnText}>Fleet Check</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.actionBtnPrimary]}
            onPress={() =>
              router.push({ pathname: "/fleet/book", params: { companyId: String(companyId) } })
            }
          >
            <MaterialIcons name="add-circle-outline" size={18} color="#fff" />
            <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>
              Book Service
            </Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={() =>
              router.push({ pathname: "/fleet/shuttle", params: { companyId: String(companyId) } })
            }
          >
            <MaterialIcons name="local-shipping" size={18} color="#8B5CF6" />
            <Text style={styles.actionBtnText}>Shuttle</Text>
          </Pressable>
        </View>

        {activeTab === "health" ? <HealthTab companyId={companyId} /> : null}
        {activeTab === "overview" && dashboard ? (
          <OverviewTab dashboard={dashboard} />
        ) : null}
        {activeTab === "vehicles" ? (
          <VehiclesTab companyId={companyId} />
        ) : null}
        {activeTab === "orders" ? (
          <OrdersTab companyId={companyId} />
        ) : null}
        {activeTab === "discovered" ? (
          <DiscoveredServicesTab companyId={companyId} />
        ) : null}
        {activeTab === "due-soon" ? (
          <DueSoonTab companyId={companyId} />
        ) : null}
        {activeTab === "billing" ? <BillingTab companyId={companyId} /> : null}
      </View>
    </>
  );
}

function HealthTab({ companyId }: { companyId: number }) {
  const { data: health, isLoading } = useFleetHealthDashboard(companyId);
  const { data: deferredSummary = [] } = useFleetDeferredSummary(companyId);

  if (isLoading) {
    return (
      <View style={styles.tabEmpty}>
        <SkeletonDetailScreen />
      </View>
    );
  }

  // 2026-05-25 — distinguish "BE returned nothing" from "BE returned
  // all-zeros because no health snapshots / no deferred items exist
  // yet for this fleet." The Droptop historical import doesn't carry
  // per-job health observations — those are only generated when a
  // tech completes a job and records condition data in-app. Showing
  // a literal "0 / Health" big circle when there's NO data behind it
  // misleads the operator; show a more honest "no data yet" CTA
  // instead. Once jobs start completing, the dashboard populates
  // automatically via `health_score_snapshots` + `deferred_work_items`.
  const hasNoActionableHealthData =
    !health ||
    (health.avg_health_score === 0 &&
      health.total_unresolved_deferred === 0 &&
      deferredSummary.length === 0);

  if (hasNoActionableHealthData) {
    return (
      <View style={styles.healthEmpty}>
        <View style={styles.healthEmptyIcon}>
          <MaterialIcons name="health-and-safety" size={40} color="#9CA3AF" />
        </View>
        <Text style={styles.healthEmptyTitle}>No health data yet</Text>
        <Text style={styles.healthEmptyText}>
          {health?.vehicle_count
            ? `Health scores and deferred work items populate as your team completes jobs on this fleet's ${health.vehicle_count} vehicle${health.vehicle_count === 1 ? "" : "s"}. Complete a Fleet Check or Service to start tracking.`
            : "Health scores and deferred work items populate as your team completes jobs in-app."}
        </Text>
      </View>
    );
  }

  const scoreColor =
    health.avg_health_score >= 80
      ? "#22C55E"
      : health.avg_health_score >= 60
        ? "#EAB308"
        : health.avg_health_score >= 40
          ? "#F97316"
          : "#EF4444";

  const totalRevenue = deferredSummary.reduce(
    (sum: number, d: FleetDeferredSummaryType) => sum + d.total_estimated_cost,
    0
  );

  return (
    <ScrollView contentContainerStyle={styles.healthContent}>
      <View style={styles.healthScoreCard}>
        <View style={[styles.healthScoreCircle, { borderColor: scoreColor }]}>
          <Text style={[styles.healthScoreValue, { color: scoreColor }]}>
            {Math.round(health.avg_health_score)}
          </Text>
          <Text style={styles.healthScoreLabel}>Health</Text>
        </View>
        <Text style={styles.healthScoreCaption}>Fleet Average</Text>
      </View>

      <View style={styles.healthMetrics}>
        <HealthMetricCard
          label="Vehicles"
          value={String(health.vehicle_count)}
          icon="directions-car"
          color="#3B82F6"
        />
        <HealthMetricCard
          label="Below Threshold"
          value={String(health.vehicles_below_threshold)}
          icon="warning"
          color={health.vehicles_below_threshold > 0 ? "#EF4444" : "#22C55E"}
        />
        <HealthMetricCard
          label="Unresolved Items"
          value={String(health.total_unresolved_deferred)}
          icon="assignment-late"
          color={health.total_unresolved_deferred > 0 ? "#F97316" : "#22C55E"}
        />
      </View>

      {deferredSummary.length > 0 && (
        <View style={styles.deferredSection}>
          <View style={styles.deferredHeader}>
            <Text style={styles.deferredTitle}>Discovered Services</Text>
            {totalRevenue > 0 && (
              <View style={styles.revenueBadge}>
                <MaterialIcons name="trending-up" size={14} color="#059669" />
                <Text style={styles.revenueText}>
                  ${totalRevenue >= 1000 ? `${(totalRevenue / 1000).toFixed(1)}k` : totalRevenue.toFixed(0)} opportunity
                </Text>
              </View>
            )}
          </View>
          {deferredSummary.map((item: FleetDeferredSummaryType) => {
            const label =
              ObservationTypeLabels[item.observation_type] ??
              item.observation_type;
            return (
              <View key={item.observation_type} style={styles.deferredRow}>
                <View style={styles.deferredRowLeft}>
                  <View style={styles.deferredDot} />
                  <Text style={styles.deferredLabel}>{label}</Text>
                </View>
                <View style={styles.deferredRowRight}>
                  <View style={styles.deferredCountPill}>
                    <Text style={styles.deferredCountPillText}>
                      {item.count}
                    </Text>
                  </View>
                  {item.total_estimated_cost > 0 && (
                    <Text style={styles.deferredCost}>
                      ${item.total_estimated_cost.toFixed(0)}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function HealthMetricCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: color + "15" }]}>
        <MaterialIcons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function OverviewTab({
  dashboard,
}: {
  dashboard: NonNullable<ReturnType<typeof useFleetDashboard>["data"]>;
}) {
  const cards = [
    {
      label: "Vehicles",
      value: String(dashboard.vehicle_count),
      icon: "directions-car" as const,
      color: "#3B82F6",
    },
    {
      label: "Overdue",
      value: String(dashboard.overdue_count),
      icon: "warning" as const,
      color: "#EF4444",
    },
    {
      label: "Due Soon",
      value: String(dashboard.upcoming_due_count),
      icon: "schedule" as const,
      color: "#EAB308",
    },
    {
      label: "Total Spend",
      value: `$${dashboard.total_spend >= 1000 ? `${(dashboard.total_spend / 1000).toFixed(1)}k` : dashboard.total_spend.toFixed(0)}`,
      icon: "attach-money" as const,
      color: "#22C55E",
    },
  ];

  return (
    <ScrollView contentContainerStyle={styles.overviewGrid}>
      {cards.map((c) => (
        <View key={c.label} style={styles.metricCard}>
          <View
            style={[styles.metricIcon, { backgroundColor: c.color + "15" }]}
          >
            <MaterialIcons name={c.icon} size={22} color={c.color} />
          </View>
          <Text style={styles.metricValue}>{c.value}</Text>
          <Text style={styles.metricLabel}>{c.label}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function OrdersTab({ companyId }: { companyId: number }) {
  const router = useRouter();
  const {
    data: orders = [],
    isRefetching,
    refetch,
  } = useFleetOrders(companyId);

  const renderItem = ({ item }: { item: Appointment }) => (
    <SwipeableRow
      leftActions={[
        {
          key: "reschedule",
          icon: "event",
          label: "Reschedule",
          color: StatusColors.scheduled,
          onPress: () =>
            router.push({
              pathname: "/order/[id]",
              params: { id: String(item.id), action: "reschedule" },
            }),
        },
        {
          key: "note",
          icon: "note-add",
          label: "Add Note",
          color: StatusColors.cancelled,
          onPress: () => router.push(`/order/${item.id}`),
        },
      ]}
      rightActions={[
        {
          key: "call",
          icon: "phone",
          label: "Call",
          color: StatusColors.finalized,
          onPress: () => {
            const phone = item.customer?.phone;
            if (phone) Linking.openURL(`tel:${phone}`);
            else Alert.alert("No Phone", "No phone number on file.");
          },
        },
        {
          key: "navigate",
          icon: "navigation",
          label: "Navigate",
          color: StatusColors.inProgress,
          onPress: () => {
            const address = [item.address_line, item.address_city]
              .filter(Boolean)
              .join(", ");
            if (address) Linking.openURL(`comgooglemaps://?daddr=${encodeURIComponent(address)}&directionsmode=driving`).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`));
            else Alert.alert("No Address", "No address on file.");
          },
        },
      ]}
    >
      <OrderCard
        appointment={item}
        onPress={() => router.push(`/order/${item.id}`)}
      />
    </SwipeableRow>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <FlatList
        data={orders}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.tabContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.tabEmpty}>
            <MaterialIcons name="receipt-long" size={40} color="#D1D5DB" />
            <Text style={styles.tabEmptyText}>No orders yet</Text>
          </View>
        }
      />
    </GestureHandlerRootView>
  );
}

function VehiclesTab({ companyId }: { companyId: number }) {
  const {
    data: vehicles = [],
    isRefetching,
    refetch,
  } = useFleetCompanyVehicles(companyId);
  const assignVehicle = useAssignFleetVehicle(companyId);
  const assignDriver = useAssignFleetDriver(companyId);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [addVehicleId, setAddVehicleId] = useState("");

  const handleAddVehicle = useCallback(() => {
    const vid = parseInt(addVehicleId, 10);
    if (!vid || vid <= 0) {
      Alert.alert("Invalid", "Enter a valid vehicle ID.");
      return;
    }
    assignVehicle.mutate(
      { vehicle_id: vid },
      {
        onSuccess: () => {
          setAddVehicleId("");
          setShowAddVehicle(false);
        },
        onError: () => Alert.alert("Error", "Could not assign vehicle."),
      }
    );
  }, [addVehicleId, assignVehicle]);

  const handleAssignDriver = useCallback(
    (vehicleId: number) => {
      Alert.prompt?.(
        "Assign Driver",
        "Enter driver user ID:",
        (text: string) => {
          const uid = parseInt(text, 10);
          if (uid > 0) {
            assignDriver.mutate(
              { vehicleId, driverUserId: uid },
              {
                onError: () =>
                  Alert.alert("Error", "Could not assign driver."),
              }
            );
          }
        }
      );
    },
    [assignDriver]
  );

  const renderItem = ({ item }: { item: FleetVehicle }) => {
    const v = item.vehicle;
    const label = v
      ? [v.year, v.make, v.model].filter(Boolean).join(" ")
      : `Vehicle #${item.vehicle_id}`;

    return (
      <View style={styles.vehicleRow}>
        <MaterialIcons name="directions-car" size={20} color="#6B7280" />
        <View style={styles.vehicleInfo}>
          <Text style={styles.vehicleName}>{label}</Text>
          {item.driver_name ? (
            <Text style={styles.vehicleDriver}>{item.driver_name}</Text>
          ) : (
            <Pressable onPress={() => handleAssignDriver(item.vehicle_id)}>
              <Text style={styles.assignDriverLink}>+ Assign driver</Text>
            </Pressable>
          )}
        </View>
        {v?.license_plate ? (
          <View style={styles.plateBadge}>
            <Text style={styles.plateText}>{v.license_plate}</Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <FlatList
      data={vehicles}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderItem}
      contentContainerStyle={styles.tabContent}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
      }
      ListHeaderComponent={
        <View style={styles.vehicleActions}>
          {showAddVehicle ? (
            <View style={styles.addVehicleRow}>
              <TextInput
                style={styles.addVehicleInput}
                placeholder="Vehicle ID"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                value={addVehicleId}
                onChangeText={setAddVehicleId}
              />
              <Pressable style={styles.addVehicleBtn} onPress={handleAddVehicle}>
                <Text style={styles.addVehicleBtnText}>Add</Text>
              </Pressable>
              <Pressable onPress={() => setShowAddVehicle(false)}>
                <MaterialIcons name="close" size={22} color="#6B7280" />
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={styles.addVehicleLink}
              onPress={() => setShowAddVehicle(true)}
            >
              <MaterialIcons name="add" size={18} color="#3B82F6" />
              <Text style={styles.addVehicleLinkText}>Add Vehicle</Text>
            </Pressable>
          )}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.tabEmpty}>
          <Text style={styles.tabEmptyText}>No vehicles assigned</Text>
        </View>
      }
    />
  );
}

function DiscoveredServicesTab({ companyId }: { companyId: number }) {
  const {
    data: targets = [],
    isRefetching,
    refetch,
  } = useFleetOutreachTargets(companyId);

  const renderItem = ({ item }: { item: FleetOutreachTarget }) => {
    const label = [item.year, item.make, item.model].filter(Boolean).join(" ") ||
      "Unknown";
    const healthColor =
      item.health_score == null
        ? "#9CA3AF"
        : item.health_score >= 80
          ? "#22C55E"
          : item.health_score >= 60
            ? "#EAB308"
            : "#EF4444";

    return (
      <View style={styles.discoveredRow}>
        <View style={styles.discoveredInfo}>
          <Text style={styles.discoveredName}>{label}</Text>
          {item.driver_name ? (
            <Text style={styles.discoveredDriver}>{item.driver_name}</Text>
          ) : null}
          {item.license_plate ? (
            <Text style={styles.discoveredPlate}>{item.license_plate}</Text>
          ) : null}
        </View>
        <View style={styles.discoveredMeta}>
          {item.health_score != null ? (
            <View
              style={[
                styles.healthBadge,
                { backgroundColor: healthColor + "20" },
              ]}
            >
              <Text style={[styles.healthBadgeText, { color: healthColor }]}>
                {Math.round(item.health_score)}
              </Text>
            </View>
          ) : null}
          {item.unresolved_deferred_count > 0 ? (
            <View style={styles.deferredCountBadge}>
              <Text style={styles.deferredCountText}>
                {item.unresolved_deferred_count} item
                {item.unresolved_deferred_count !== 1 ? "s" : ""}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <FlatList
      data={targets}
      keyExtractor={(item) => String(item.vehicle_id)}
      renderItem={renderItem}
      contentContainerStyle={styles.tabContent}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
      }
      ListEmptyComponent={
        <View style={styles.tabEmpty}>
          <MaterialIcons name="check-circle" size={40} color="#22C55E" />
          <Text style={styles.tabEmptyText}>No discovered services</Text>
        </View>
      }
    />
  );
}

type DueSegment = "7_days" | "14_days" | "overdue";

const DUE_SEGMENTS: { key: DueSegment; label: string; color: string }[] = [
  { key: "overdue", label: "Overdue", color: "#EF4444" },
  { key: "7_days", label: "7 Days", color: "#F59E0B" },
  { key: "14_days", label: "14 Days", color: "#EAB308" },
];

function DueSoonTab({ companyId }: { companyId: number }) {
  const {
    data: entries = [],
    isRefetching,
    refetch,
  } = useFleetDueSoon(companyId);

  const [segment, setSegment] = useState<DueSegment>("overdue");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const nudgeRef = useRef<AppSheetRef>(null);

  const segmentedEntries = entries.filter((e) => {
    if (segment === "overdue") return e.due_status === "overdue";
    if (segment === "7_days")
      return e.due_status !== "overdue" && (e.days_until_due ?? 99) <= 7;
    return (
      e.due_status !== "overdue" &&
      (e.days_until_due ?? 99) > 7 &&
      (e.days_until_due ?? 99) <= 14
    );
  });

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(segmentedEntries.map((e) => e.vehicle_id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const renderItem = ({ item }: { item: FleetDueSoonEntry }) => {
    const label =
      [item.year, item.make, item.model].filter(Boolean).join(" ") ||
      "Unknown";
    const color = DueStatusColorMap[item.due_status] ?? "#6B7280";
    const statusLabel =
      item.due_status === "overdue"
        ? "Overdue"
        : item.days_until_due != null
          ? `Due in ${item.days_until_due}d`
          : "Due Soon";
    const isSelected = selectedIds.has(item.vehicle_id);

    return (
      <Pressable
        style={[styles.dueRow, { borderLeftColor: color }]}
        onPress={() => toggleSelect(item.vehicle_id)}
        onLongPress={() => {
          haptic.medium();
          toggleSelect(item.vehicle_id);
        }}
      >
        <View
          style={[
            styles.dueCheckbox,
            isSelected && styles.dueCheckboxActive,
          ]}
        >
          {isSelected && (
            <MaterialIcons name="check" size={14} color="#fff" />
          )}
        </View>
        <View style={styles.dueInfo}>
          <Text style={styles.dueName}>{label}</Text>
          {item.driver_name ? (
            <Text style={styles.dueDriver}>{item.driver_name}</Text>
          ) : null}
          {item.license_plate ? (
            <Text style={styles.duePlate}>{item.license_plate}</Text>
          ) : null}
          {item.last_service_date ? (
            <Text style={styles.dueDetail}>
              Last service: {item.last_service_date}
            </Text>
          ) : null}
        </View>
        <View style={[styles.dueBadge, { backgroundColor: color + "20" }]}>
          <Text style={[styles.dueBadgeText, { color }]}>{statusLabel}</Text>
        </View>
      </Pressable>
    );
  };

  const segmentCounts = {
    overdue: entries.filter((e) => e.due_status === "overdue").length,
    "7_days": entries.filter(
      (e) => e.due_status !== "overdue" && (e.days_until_due ?? 99) <= 7
    ).length,
    "14_days": entries.filter(
      (e) =>
        e.due_status !== "overdue" &&
        (e.days_until_due ?? 99) > 7 &&
        (e.days_until_due ?? 99) <= 14
    ).length,
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.segmentBar}>
        {DUE_SEGMENTS.map((s) => (
          <Pressable
            key={s.key}
            style={[
              styles.segmentChip,
              segment === s.key && { backgroundColor: s.color },
            ]}
            onPress={() => {
              setSegment(s.key);
              clearSelection();
            }}
          >
            <Text
              style={[
                styles.segmentText,
                segment === s.key && styles.segmentTextActive,
              ]}
            >
              {s.label} ({segmentCounts[s.key]})
            </Text>
          </Pressable>
        ))}
      </View>

      {selectedIds.size > 0 && (
        <View style={styles.nudgeBar}>
          <Text style={styles.nudgeCount}>
            {selectedIds.size} selected
          </Text>
          <View style={styles.nudgeActions}>
            <Pressable style={styles.nudgeTextBtn} onPress={selectAll}>
              <Text style={styles.nudgeTextBtnLabel}>All</Text>
            </Pressable>
            <Pressable style={styles.nudgeTextBtn} onPress={clearSelection}>
              <Text style={[styles.nudgeTextBtnLabel, { color: "#EF4444" }]}>
                Clear
              </Text>
            </Pressable>
            <Pressable
              style={styles.nudgeSendBtn}
              onPress={() => nudgeRef.current?.snapToIndex(0)}
            >
              <MaterialIcons name="send" size={16} color="#fff" />
              <Text style={styles.nudgeSendText}>Nudge</Text>
            </Pressable>
          </View>
        </View>
      )}

      <FlatList
        data={segmentedEntries}
        keyExtractor={(item) => String(item.vehicle_id)}
        renderItem={renderItem}
        contentContainerStyle={styles.tabContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.tabEmpty}>
            <MaterialIcons name="check-circle" size={40} color="#22C55E" />
            <Text style={styles.tabEmptyText}>
              No vehicles in this segment
            </Text>
          </View>
        }
      />

      <NudgeActionSheet
        ref={nudgeRef}
        companyId={companyId}
        selectedVehicleIds={[...selectedIds]}
        onClose={() => {}}
        onSuccess={() => {
          clearSelection();
          nudgeRef.current?.close();
          Alert.alert("Sent", "Nudge sent successfully.");
        }}
      />
    </View>
  );
}

function BillingTab({ companyId }: { companyId: number }) {
  const { data: billing } = useFleetBilling(companyId);

  if (!billing) {
    return (
      <View style={styles.tabEmpty}>
        <Text style={styles.tabEmptyText}>No billing configured</Text>
      </View>
    );
  }

  const FREQ_LABELS: Record<string, string> = {
    per_service: "Per Service",
    weekly: "Weekly",
    monthly: "Monthly",
  };

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <View style={styles.billingCard}>
        <BillingRow
          label="Invoice Frequency"
          value={FREQ_LABELS[billing.invoice_frequency] ?? billing.invoice_frequency}
        />
        <BillingRow
          label="Auto-Invoice"
          value={billing.auto_invoice ? "Yes" : "No"}
        />
        {billing.default_po_number ? (
          <BillingRow label="Default PO" value={billing.default_po_number} />
        ) : null}
        {billing.billing_notes ? (
          <BillingRow label="Notes" value={billing.billing_notes} />
        ) : null}
      </View>
    </ScrollView>
  );
}

function BillingRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.billingRow}>
      <Text style={styles.billingLabel}>{label}</Text>
      <Text style={styles.billingValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  // 2026-05-25 — `flexGrow: 0` constrains the horizontal ScrollView's
  // vertical size to its content. Without it, the ScrollView inherits
  // its `flex: 1` container's full available height; the default
  // `alignItems: 'stretch'` on the inner row then stretches every
  // Pressable tab vertically to fill that space. Inactive tabs hide
  // the stretch (gray-on-gray) but the active blue-background tab
  // becomes a giant rectangle. Pattern borrowed from
  // `app/inventory/adjust.tsx::itemScroll`.
  tabScroll: { flexGrow: 0 },
  tabBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    alignItems: "center",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
  },
  tabActive: { backgroundColor: "#3B82F6" },
  tabText: { fontSize: 14, fontWeight: "600", color: "#6B7280" },
  tabTextActive: { color: "#fff" },
  tabContent: { padding: 16, paddingBottom: 24 },
  tabEmpty: { alignItems: "center", paddingTop: 60, gap: 8 },
  tabEmptyText: { fontSize: 15, color: "#9CA3AF", fontWeight: "500" },

  healthEmpty: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 64,
    paddingBottom: 24,
    gap: 12,
  },
  healthEmptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  healthEmptyTitle: { fontSize: 18, fontWeight: "700", color: "#374151" },
  healthEmptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },

  healthContent: { padding: 16, alignItems: "center" },
  healthScoreCard: { alignItems: "center", marginBottom: 24 },
  healthScoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  healthScoreValue: { fontSize: 36, fontWeight: "800" },
  healthScoreLabel: { fontSize: 12, color: "#6B7280", fontWeight: "600" },
  healthScoreCaption: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginTop: 10,
  },
  healthMetrics: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },

  overviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 16,
    gap: 12,
  },
  metricCard: {
    flex: 1,
    minWidth: "28%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  metricIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  metricValue: { fontSize: 22, fontWeight: "800", color: "#111827" },
  metricLabel: {
    fontSize: 11,
    color: "#9CA3AF",
    fontWeight: "600",
    textAlign: "center",
  },

  vehicleActions: { marginBottom: 8 },
  addVehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 10,
  },
  addVehicleInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: "#111827",
  },
  addVehicleBtn: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addVehicleBtnText: { fontSize: 14, fontWeight: "600", color: "#fff" },
  addVehicleLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
  },
  addVehicleLinkText: { fontSize: 14, fontWeight: "600", color: "#3B82F6" },
  assignDriverLink: { fontSize: 12, color: "#3B82F6", fontWeight: "500", marginTop: 2 },

  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    gap: 12,
  },
  vehicleInfo: { flex: 1 },
  vehicleName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  vehicleDriver: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  plateBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  plateText: { fontSize: 12, fontWeight: "700", color: "#374151" },

  discoveredRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#F97316",
    gap: 10,
  },
  discoveredInfo: { flex: 1 },
  discoveredName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  discoveredDriver: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  discoveredPlate: { fontSize: 11, color: "#9CA3AF", marginTop: 1 },
  discoveredMeta: { alignItems: "flex-end", gap: 4 },
  healthBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  healthBadgeText: { fontSize: 14, fontWeight: "800" },
  deferredCountBadge: {
    backgroundColor: "#FFF7ED",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#FDBA74",
  },
  deferredCountText: { fontSize: 11, fontWeight: "600", color: "#9A3412" },

  segmentBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  segmentChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  segmentText: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  segmentTextActive: { color: "#fff" },
  nudgeBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#EFF6FF",
    borderBottomWidth: 1,
    borderBottomColor: "#BFDBFE",
  },
  nudgeCount: { fontSize: 14, fontWeight: "700", color: "#1D4ED8" },
  nudgeActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  nudgeTextBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  nudgeTextBtnLabel: { fontSize: 13, fontWeight: "600", color: "#3B82F6" },
  nudgeSendBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#3B82F6",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  nudgeSendText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  dueCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  dueCheckboxActive: {
    backgroundColor: "#3B82F6",
    borderColor: "#3B82F6",
  },
  dueDetail: { fontSize: 11, color: "#9CA3AF", marginTop: 1 },
  dueRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderLeftWidth: 4,
  },
  dueInfo: { flex: 1 },
  dueName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  dueDriver: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  duePlate: { fontSize: 11, color: "#9CA3AF", marginTop: 1 },
  dueBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  dueBadgeText: { fontSize: 12, fontWeight: "700" },

  billingCard: { backgroundColor: "#fff", borderRadius: 12, padding: 16 },
  billingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  billingLabel: { fontSize: 14, color: "#6B7280" },
  billingValue: { fontSize: 14, fontWeight: "600", color: "#111827" },

  actionBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
  },
  actionBtnPrimary: { backgroundColor: "#3B82F6" },
  actionBtnText: { fontSize: 13, fontWeight: "600", color: "#374151" },
  actionBtnTextPrimary: { color: "#fff" },

  deferredSection: {
    width: "100%",
    marginTop: 24,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  deferredHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  deferredTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  revenueBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  revenueText: { fontSize: 12, fontWeight: "700", color: "#059669" },
  deferredRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  deferredRowLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  deferredDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F97316",
  },
  deferredLabel: { fontSize: 14, fontWeight: "500", color: "#374151" },
  deferredRowRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  deferredCountPill: {
    backgroundColor: "#FFF7ED",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FDBA74",
  },
  deferredCountPillText: { fontSize: 12, fontWeight: "700", color: "#9A3412" },
  deferredCost: { fontSize: 13, fontWeight: "600", color: "#059669", minWidth: 50, textAlign: "right" },
});
