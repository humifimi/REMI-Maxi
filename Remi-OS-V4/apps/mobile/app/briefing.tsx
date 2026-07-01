import { useEffect, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useAuthStore } from "@/src/stores/auth";
import { useDailyBriefing, useFranchiseBriefing } from "@technician/hooks/jobs/use-briefing";
import { SkeletonDetailScreen } from "@/src/components/shared/skeleton";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { UserRole } from "@technician/types/enums";
import type {
  MaterialRequirement,
  BriefingAlert,
  FranchiseBriefing as FranchiseBriefingType,
  FranchiseTechnicianSummary,
  FranchiseRouteStatus,
} from "@technician/types/api";

export const BRIEFING_LAST_SHOWN_KEY = "briefing_last_shown";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function formatDistance(km: number): string {
  const miles = km * 0.621371;
  return `${miles.toFixed(1)} mi`;
}

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m}m`;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function alertIcon(type: BriefingAlert["type"]): string {
  switch (type) {
    case "missing_inventory":
      return "inventory";
    case "pinned_note":
      return "push-pin";
    case "weather":
      return "cloud";
    case "schedule_conflict":
      return "warning";
    default:
      return "info";
  }
}

function alertColor(severity: BriefingAlert["severity"]): string {
  switch (severity) {
    case "critical":
      return "#EF4444";
    case "warning":
      return "#F97316";
    case "info":
      return "#3B82F6";
    default:
      return "#6B7280";
  }
}

function alertBg(severity: BriefingAlert["severity"]): string {
  switch (severity) {
    case "critical":
      return "#FEE2E2";
    case "warning":
      return "#FFF7ED";
    case "info":
      return "#EFF6FF";
    default:
      return "#F3F4F6";
  }
}

function stockColor(item: MaterialRequirement): string {
  if (!item.in_stock) return "#EF4444";
  if (item.current_stock < item.quantity_needed) return "#F97316";
  return "#22C55E";
}

function stockLabel(item: MaterialRequirement): string {
  if (!item.in_stock) return "Out";
  if (item.current_stock < item.quantity_needed) return "Low";
  return "OK";
}

const ROUTE_STATUS_CONFIG: Record<FranchiseRouteStatus, { label: string; color: string; bg: string }> = {
  not_started: { label: "Not Started", color: "#6B7280", bg: "#F3F4F6" },
  in_progress: { label: "In Progress", color: "#3B82F6", bg: "#EFF6FF" },
  completed: { label: "Completed", color: "#22C55E", bg: "#F0FDF4" },
};

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ---------------------------------------------------------------------------
// Shared UI pieces
// ---------------------------------------------------------------------------

function BriefingHeader() {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={12}>
        <MaterialIcons name="arrow-back" size={24} color="#111827" />
      </Pressable>
      <Text style={styles.headerTitle}>Daily Briefing</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.container}>
      <BriefingHeader />
      <View style={styles.emptyState}>
        <MaterialIcons name="wb-sunny" size={56} color="#D1D5DB" />
        <Text style={styles.emptyTitle}>No briefing available</Text>
        <Text style={styles.emptySubtext}>
          Check back once your schedule has been set for today.
        </Text>
      </View>
    </View>
  );
}

function AlertsCard({ alerts }: { alerts: BriefingAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <MaterialIcons name="notifications-active" size={20} color="#F97316" />
        <Text style={styles.cardTitle}>Alerts</Text>
        <View style={styles.alertCountBadge}>
          <Text style={styles.alertCountText}>{alerts.length}</Text>
        </View>
      </View>
      {alerts.map((alert, i) => (
        <View
          key={`alert-${i}`}
          style={[styles.alertRow, { backgroundColor: alertBg(alert.severity) }]}
        >
          <MaterialIcons
            name={alertIcon(alert.type) as keyof typeof MaterialIcons.glyphMap}
            size={18}
            color={alertColor(alert.severity)}
          />
          <Text style={styles.alertMessage}>{alert.message}</Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Technician Briefing View
// ---------------------------------------------------------------------------

function TechnicianBriefingView() {
  const router = useRouter();
  const today = useMemo(() => new Date().toISOString().split("T")[0], []);
  const { data: briefing, isLoading, isRefetching, refetch } = useDailyBriefing(today);

  useEffect(() => {
    AsyncStorage.setItem(BRIEFING_LAST_SHOWN_KEY, today);
  }, [today]);

  if (isLoading && !isRefetching) {
    return <SkeletonDetailScreen />;
  }

  if (!briefing) {
    return <EmptyState />;
  }

  const route = briefing.route_summary;
  const materials = Array.isArray(briefing.material_requirements)
    ? briefing.material_requirements
    : [];
  const workload = briefing.workload_summary;
  const alerts = briefing.alerts ?? [];
  const hasIssues = materials.some((m) => !m.in_stock || m.current_stock < m.quantity_needed);

  return (
    <View style={styles.container}>
      <BriefingHeader />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      >
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="work" size={20} color="#3B82F6" />
            <Text style={styles.cardTitle}>Today's Jobs</Text>
          </View>
          <Text style={styles.bigNumber}>{briefing.job_count}</Text>
          <Text style={styles.bigNumberLabel}>
            {briefing.job_count === 1 ? "job scheduled" : "jobs scheduled"}
          </Text>
          {workload && (
            <View style={styles.statRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {formatDuration(workload.estimated_service_minutes)}
                </Text>
                <Text style={styles.statLabel}>Service time</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {formatDuration(workload.estimated_drive_minutes)}
                </Text>
                <Text style={styles.statLabel}>Drive time</Text>
              </View>
              {workload.estimated_finish_time && (
                <View style={styles.stat}>
                  <Text style={styles.statValue}>
                    {workload.estimated_finish_time}
                  </Text>
                  <Text style={styles.statLabel}>Est. finish</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {route && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="route" size={20} color="#8B5CF6" />
              <Text style={styles.cardTitle}>Route Summary</Text>
            </View>
            <View style={styles.statRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{route.stop_count}</Text>
                <Text style={styles.statLabel}>Stops</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {formatDistance(route.total_distance_km)}
                </Text>
                <Text style={styles.statLabel}>Distance</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {formatDuration(route.total_drive_minutes)}
                </Text>
                <Text style={styles.statLabel}>Drive time</Text>
              </View>
            </View>
            <View style={styles.routeEndpoints}>
              <View style={styles.routeEndpoint}>
                <View style={[styles.dot, { backgroundColor: "#22C55E" }]} />
                <Text style={styles.routeEndpointLabel}>First stop</Text>
                <Text style={styles.routeEndpointValue}>
                  {formatTime(route.first_stop_time)}
                </Text>
              </View>
              <View style={styles.routeEndpoint}>
                <View style={[styles.dot, { backgroundColor: "#EF4444" }]} />
                <Text style={styles.routeEndpointLabel}>Last stop</Text>
                <Text style={styles.routeEndpointValue}>
                  {formatTime(route.last_stop_time)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {materials.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons
                name="local-gas-station"
                size={20}
                color={hasIssues ? "#F97316" : "#22C55E"}
              />
              <Text style={styles.cardTitle}>Materials</Text>
              {hasIssues && (
                <View style={styles.issueBadge}>
                  <Text style={styles.issueBadgeText}>Needs attention</Text>
                </View>
              )}
            </View>
            {materials.map((item, i) => {
              const hasIssue = !item.in_stock || item.current_stock < item.quantity_needed;
              const Row = hasIssue ? Pressable : View;
              return (
                <Row
                  key={`${item.item_name}-${i}`}
                  style={[
                    styles.materialRow,
                    i < materials.length - 1 && styles.materialRowBorder,
                  ]}
                  {...(hasIssue ? { onPress: () => { haptic.light(); router.push("/inventory"); } } : {})}
                >
                  <View style={styles.materialInfo}>
                    <Text style={styles.materialName}>{item.item_name}</Text>
                    {item.item_sku && (
                      <Text style={styles.materialSku}>{item.item_sku}</Text>
                    )}
                  </View>
                  <Text style={styles.materialQty}>x{item.quantity_needed}</Text>
                  <View
                    style={[
                      styles.stockBadge,
                      { backgroundColor: stockColor(item) + "20" },
                    ]}
                  >
                    <View
                      style={[styles.stockDot, { backgroundColor: stockColor(item) }]}
                    />
                    <Text style={[styles.stockText, { color: stockColor(item) }]}>
                      {stockLabel(item)}
                    </Text>
                  </View>
                  {hasIssue && (
                    <MaterialIcons name="chevron-right" size={18} color="#9CA3AF" />
                  )}
                </Row>
              );
            })}
            {hasIssues && (
              <Pressable
                style={styles.viewInventoryBtn}
                onPress={() => { haptic.light(); router.push("/inventory"); }}
              >
                <MaterialIcons name="inventory-2" size={16} color="#3B82F6" />
                <Text style={styles.viewInventoryText}>View Inventory</Text>
                <MaterialIcons name="arrow-forward" size={16} color="#3B82F6" />
              </Pressable>
            )}
          </View>
        )}

        <AlertsCard alerts={alerts} />
        <View style={{ height: 80 }} />
      </ScrollView>

      <View style={styles.ctaContainer}>
        <Pressable
          style={styles.ctaButton}
          onPress={() => {
            haptic.heavy();
            router.replace("/(tabs)");
          }}
        >
          <MaterialIcons name="navigation" size={20} color="#fff" />
          <Text style={styles.ctaText}>Start Route</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Franchise Owner Briefing View
// ---------------------------------------------------------------------------

function TechRow({ tech }: { tech: FranchiseTechnicianSummary }) {
  const cfg = ROUTE_STATUS_CONFIG[tech.route_status];
  return (
    <View style={styles.techRow}>
      <View style={styles.techAvatar}>
        <Text style={styles.techAvatarText}>{initials(tech.technician_name)}</Text>
      </View>
      <View style={styles.techInfo}>
        <Text style={styles.techName}>{tech.technician_name}</Text>
        <Text style={styles.techJobs}>
          {tech.job_count} {tech.job_count === 1 ? "job" : "jobs"} · {tech.stop_count} stops
        </Text>
      </View>
      <View style={[styles.statusPill, { backgroundColor: cfg.bg }]}>
        <Text style={[styles.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
      </View>
      {tech.has_material_issues && (
        <MaterialIcons name="warning" size={18} color="#F97316" style={{ marginLeft: 6 }} />
      )}
    </View>
  );
}

function FranchiseBriefingView() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const franchiseId = user?.franchiseId ?? 0;
  const today = useMemo(() => new Date().toISOString().split("T")[0], []);
  const { data: briefing, isLoading, isRefetching, refetch } = useFranchiseBriefing(franchiseId, today);

  useEffect(() => {
    AsyncStorage.setItem(BRIEFING_LAST_SHOWN_KEY, today);
  }, [today]);

  if (isLoading && !isRefetching) {
    return <SkeletonDetailScreen />;
  }

  if (!briefing) {
    return <EmptyState />;
  }

  const { aggregate_route: agg, material_shortages: shortages, alerts } = briefing;
  const totalServiceMin = briefing.technician_summaries.reduce(
    (s, t) => s + t.estimated_service_minutes, 0
  );
  const totalDriveMin = briefing.technician_summaries.reduce(
    (s, t) => s + t.estimated_drive_minutes, 0
  );

  return (
    <View style={styles.container}>
      <BriefingHeader />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      >
        {/* Operations Overview */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="dashboard" size={20} color="#3B82F6" />
            <Text style={styles.cardTitle}>Operations Overview</Text>
          </View>
          <Text style={styles.bigNumber}>{briefing.total_job_count}</Text>
          <Text style={styles.bigNumberLabel}>
            jobs across {briefing.technician_count}{" "}
            {briefing.technician_count === 1 ? "technician" : "technicians"}
          </Text>
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{formatDuration(totalServiceMin)}</Text>
              <Text style={styles.statLabel}>Service time</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{formatDuration(totalDriveMin)}</Text>
              <Text style={styles.statLabel}>Drive time</Text>
            </View>
            {briefing.total_revenue_estimate_cents != null && (
              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {formatCents(briefing.total_revenue_estimate_cents)}
                </Text>
                <Text style={styles.statLabel}>Est. revenue</Text>
              </View>
            )}
          </View>
        </View>

        {/* Team Status */}
        {briefing.technician_summaries.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="people" size={20} color="#8B5CF6" />
              <Text style={styles.cardTitle}>Team Status</Text>
            </View>
            {briefing.technician_summaries.map((tech) => (
              <TechRow key={tech.technician_id} tech={tech} />
            ))}
          </View>
        )}

        {/* Route Totals */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="route" size={20} color="#8B5CF6" />
            <Text style={styles.cardTitle}>Route Totals</Text>
          </View>
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{agg.total_stops}</Text>
              <Text style={styles.statLabel}>Stops</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{formatDistance(agg.total_distance_km)}</Text>
              <Text style={styles.statLabel}>Distance</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{formatDuration(agg.total_drive_minutes)}</Text>
              <Text style={styles.statLabel}>Drive time</Text>
            </View>
          </View>
          <View style={styles.routeEndpoints}>
            <View style={styles.routeEndpoint}>
              <View style={[styles.dot, { backgroundColor: "#22C55E" }]} />
              <Text style={styles.routeEndpointLabel}>Earliest</Text>
              <Text style={styles.routeEndpointValue}>
                {formatTime(agg.earliest_start_time)}
              </Text>
            </View>
            <View style={styles.routeEndpoint}>
              <View style={[styles.dot, { backgroundColor: "#EF4444" }]} />
              <Text style={styles.routeEndpointLabel}>Latest</Text>
              <Text style={styles.routeEndpointValue}>
                {formatTime(agg.latest_end_time)}
              </Text>
            </View>
          </View>
        </View>

        {/* Material Shortages */}
        {shortages.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="local-gas-station" size={20} color="#F97316" />
              <Text style={styles.cardTitle}>Material Shortages</Text>
              <View style={styles.issueBadge}>
                <Text style={styles.issueBadgeText}>
                  {shortages.length} {shortages.length === 1 ? "item" : "items"}
                </Text>
              </View>
            </View>
            {shortages.map((item, i) => (
              <View
                key={`${item.item_sku ?? item.item_name}-${i}`}
                style={[
                  styles.materialRow,
                  i < shortages.length - 1 && styles.materialRowBorder,
                ]}
              >
                <View style={styles.materialInfo}>
                  <Text style={styles.materialName}>{item.item_name}</Text>
                  <Text style={styles.materialSku}>
                    Affected: {item.affected_technician_names.join(", ")}
                  </Text>
                </View>
                <Text style={styles.materialQty}>x{item.quantity_needed}</Text>
                <View style={[styles.stockBadge, { backgroundColor: "#EF444420" }]}>
                  <View style={[styles.stockDot, { backgroundColor: "#EF4444" }]} />
                  <Text style={[styles.stockText, { color: "#EF4444" }]}>
                    {item.current_stock}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <AlertsCard alerts={alerts} />
        <View style={{ height: 80 }} />
      </ScrollView>

      <View style={styles.ctaContainer}>
        <Pressable
          style={styles.ctaButton}
          onPress={() => {
            haptic.heavy();
            router.replace("/(tabs)");
          }}
        >
          <MaterialIcons name="map" size={20} color="#fff" />
          <Text style={styles.ctaText}>View Dispatch</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Root — role-aware switch
// ---------------------------------------------------------------------------

export default function BriefingScreen() {
  const user = useAuthStore((s) => s.user);
  const isFranchiseOwner = user?.role === UserRole.FRANCHISE_OWNER;

  if (isFranchiseOwner) {
    return <FranchiseBriefingView />;
  }
  return <TechnicianBriefingView />;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  bigNumber: {
    fontSize: 40,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
  },
  bigNumberLabel: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 12,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  stat: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  statLabel: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
  },
  routeEndpoints: {
    marginTop: 12,
    gap: 8,
  },
  routeEndpoint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  routeEndpointLabel: {
    fontSize: 13,
    color: "#6B7280",
    width: 70,
  },
  routeEndpointValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  materialRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  materialRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  materialInfo: {
    flex: 1,
  },
  materialName: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },
  materialSku: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 1,
  },
  materialQty: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    width: 40,
    textAlign: "right",
  },
  stockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  stockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stockText: {
    fontSize: 12,
    fontWeight: "600",
  },
  issueBadge: {
    backgroundColor: "#FFF7ED",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  issueBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#F97316",
  },
  viewInventoryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    backgroundColor: "#EFF6FF",
  },
  viewInventoryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3B82F6",
  },
  alertRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 12,
    marginBottom: 6,
  },
  alertMessage: {
    fontSize: 14,
    color: "#374151",
    flex: 1,
    lineHeight: 20,
  },
  alertCountBadge: {
    backgroundColor: "#FEE2E2",
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  alertCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#EF4444",
  },
  ctaContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 34,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  ctaButton: {
    backgroundColor: "#3B82F6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 999,
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#374151",
  },
  emptySubtext: {
    fontSize: 15,
    color: "#9CA3AF",
    textAlign: "center",
  },
  techRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    gap: 10,
  },
  techAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E0E7FF",
    alignItems: "center",
    justifyContent: "center",
  },
  techAvatarText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#4338CA",
  },
  techInfo: {
    flex: 1,
  },
  techName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  techJobs: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 1,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "600",
  },
});
