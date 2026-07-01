import { StyleSheet, View, Text, ScrollView, RefreshControl } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  useFleetCompanies,
  useFleetAnalyticsRollup,
} from "@technician/hooks/inventory/use-fleet";
import { ObservationTypeLabels } from "@technician/constants/colors";

// 2026-05-25 — `useAggregatedFleetData` removed. The old shape iterated
// `useFleetDashboard` / `useFleetHealthDashboard` / `useFleetDeferredSummary`
// inside `companies.map(...)` — 3×N=483 round-trips for a 161-fleet franchise,
// plus a Rules-of-Hooks violation. Replaced with a single
// `useFleetAnalyticsRollup` query that hits the new batched BE endpoint.

export default function FleetAnalyticsScreen() {
  const router = useRouter();
  const {
    data: companies = [],
    isRefetching: companiesRefetching,
    refetch: refetchCompanies,
  } = useFleetCompanies();

  // 2026-05-25 — single batched call instead of 3×N per-fleet queries.
  const {
    data: rollup,
    isRefetching: rollupRefetching,
    refetch: refetchRollup,
  } = useFleetAnalyticsRollup();
  const dashboards = rollup?.dashboards ?? [];
  const healths = rollup?.healths ?? [];
  const allDeferred = rollup?.allDeferred ?? [];

  const isRefetching = companiesRefetching || rollupRefetching;
  const refetch = () => {
    refetchCompanies();
    refetchRollup();
  };

  const totalVehicles = dashboards.reduce(
    (s, d) => s + d.vehicle_count,
    0
  );
  const totalOverdue = dashboards.reduce(
    (s, d) => s + d.overdue_count,
    0
  );
  const totalDueSoon = dashboards.reduce(
    (s, d) => s + d.upcoming_due_count,
    0
  );
  const totalSpend = dashboards.reduce(
    (s, d) => s + d.total_spend,
    0
  );

  const avgHealth =
    healths.length > 0
      ? healths.reduce((s, h) => s + h.avg_health_score, 0) / healths.length
      : 0;
  const totalBelowThreshold = healths.reduce(
    (s, h) => s + h.vehicles_below_threshold,
    0
  );
  const totalUnresolved = healths.reduce(
    (s, h) => s + h.total_unresolved_deferred,
    0
  );

  const deferredMap = new Map<string, { count: number; cost: number }>();
  for (const d of allDeferred) {
    const existing = deferredMap.get(d.observation_type) ?? {
      count: 0,
      cost: 0,
    };
    deferredMap.set(d.observation_type, {
      count: existing.count + d.count,
      cost: existing.cost + d.total_estimated_cost,
    });
  }
  const deferredPipeline = Array.from(deferredMap.entries())
    .map(([type, data]) => ({ type, ...data }))
    .sort((a, b) => b.cost - a.cost);

  const totalOpportunity = deferredPipeline.reduce(
    (s, d) => s + d.cost,
    0
  );

  const healthDistribution = {
    excellent: healths.filter((h) => h.avg_health_score >= 80).length,
    good: healths.filter(
      (h) => h.avg_health_score >= 60 && h.avg_health_score < 80
    ).length,
    fair: healths.filter(
      (h) => h.avg_health_score >= 40 && h.avg_health_score < 60
    ).length,
    poor: healths.filter((h) => h.avg_health_score < 40).length,
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Fleet Analytics",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      >
        <Text style={styles.sectionTitle}>Portfolio Overview</Text>
        <View style={styles.metricsRow}>
          <MetricCard
            icon="business"
            label="Companies"
            value={String(companies.length)}
            color="#3B82F6"
          />
          <MetricCard
            icon="directions-car"
            label="Vehicles"
            value={String(totalVehicles)}
            color="#8B5CF6"
          />
          <MetricCard
            icon="warning"
            label="Overdue"
            value={String(totalOverdue)}
            color="#EF4444"
          />
          <MetricCard
            icon="schedule"
            label="Due Soon"
            value={String(totalDueSoon)}
            color="#EAB308"
          />
        </View>

        <View style={styles.metricsRow}>
          <MetricCard
            icon="attach-money"
            label="Total Spend"
            value={`$${totalSpend >= 1000 ? `${(totalSpend / 1000).toFixed(1)}k` : totalSpend.toFixed(0)}`}
            color="#22C55E"
          />
          <MetricCard
            icon="favorite"
            label="Avg Health"
            value={avgHealth > 0 ? String(Math.round(avgHealth)) : "—"}
            color={
              avgHealth >= 80
                ? "#22C55E"
                : avgHealth >= 60
                  ? "#EAB308"
                  : "#EF4444"
            }
          />
          <MetricCard
            icon="error-outline"
            label="Below Threshold"
            value={String(totalBelowThreshold)}
            color={totalBelowThreshold > 0 ? "#EF4444" : "#22C55E"}
          />
          <MetricCard
            icon="assignment-late"
            label="Unresolved"
            value={String(totalUnresolved)}
            color={totalUnresolved > 0 ? "#F97316" : "#22C55E"}
          />
        </View>

        <Text style={styles.sectionTitle}>Health Distribution</Text>
        <View style={styles.distCard}>
          <DistBar
            label="Excellent (80+)"
            count={healthDistribution.excellent}
            total={companies.length}
            color="#22C55E"
          />
          <DistBar
            label="Good (60–79)"
            count={healthDistribution.good}
            total={companies.length}
            color="#EAB308"
          />
          <DistBar
            label="Fair (40–59)"
            count={healthDistribution.fair}
            total={companies.length}
            color="#F97316"
          />
          <DistBar
            label="Poor (<40)"
            count={healthDistribution.poor}
            total={companies.length}
            color="#EF4444"
          />
        </View>

        <View style={styles.pipelineHeader}>
          <Text style={styles.sectionTitle}>Opportunity Pipeline</Text>
          {totalOpportunity > 0 && (
            <View style={styles.totalOppBadge}>
              <MaterialIcons name="trending-up" size={14} color="#059669" />
              <Text style={styles.totalOppText}>
                ${totalOpportunity >= 1000 ? `${(totalOpportunity / 1000).toFixed(1)}k` : totalOpportunity.toFixed(0)}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.pipelineCard}>
          {deferredPipeline.length === 0 ? (
            <Text style={styles.emptyText}>No outstanding items</Text>
          ) : (
            deferredPipeline.slice(0, 10).map((item) => (
              <View key={item.type} style={styles.pipelineRow}>
                <View style={styles.pipelineObs} />
                <Text style={styles.pipelineName}>
                  {ObservationTypeLabels[item.type] ?? item.type}
                </Text>
                <Text style={styles.pipelineCount}>{item.count}</Text>
                <Text style={styles.pipelineCost}>${item.cost.toFixed(0)}</Text>
              </View>
            ))
          )}
        </View>

        <Text style={styles.sectionTitle}>Company Rankings</Text>
        {dashboards
          .sort((a, b) => b.total_spend - a.total_spend)
          .map((d) => (
            <Pressable
              key={d.company_id}
              style={styles.rankingRow}
              onPress={() => router.push(`/fleet/${d.company_id}`)}
            >
              <View style={styles.rankingInfo}>
                <Text style={styles.rankingName}>{d.company_name}</Text>
                <Text style={styles.rankingSub}>
                  {d.vehicle_count} vehicles · {d.overdue_count} overdue
                </Text>
              </View>
              <Text style={styles.rankingSpend}>
                ${d.total_spend >= 1000 ? `${(d.total_spend / 1000).toFixed(1)}k` : d.total_spend.toFixed(0)}
              </Text>
              <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
            </Pressable>
          ))}
      </ScrollView>
    </>
  );
}

function MetricCard({
  icon,
  label,
  value,
  color,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: color + "15" }]}>
        <MaterialIcons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function DistBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <View style={styles.distRow}>
      <Text style={styles.distLabel}>{label}</Text>
      <View style={styles.distBarBg}>
        <View
          style={[
            styles.distBarFill,
            { width: `${Math.max(pct, 2)}%`, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={styles.distCount}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginTop: 16,
    marginBottom: 10,
  },
  metricsRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  metricCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  metricIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  metricValue: { fontSize: 18, fontWeight: "800", color: "#111827" },
  metricLabel: {
    fontSize: 10,
    color: "#9CA3AF",
    fontWeight: "600",
    textAlign: "center",
  },

  distCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  distRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  distLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
    width: 90,
  },
  distBarBg: {
    flex: 1,
    height: 10,
    backgroundColor: "#F3F4F6",
    borderRadius: 5,
    overflow: "hidden",
  },
  distBarFill: { height: "100%", borderRadius: 5 },
  distCount: { fontSize: 14, fontWeight: "700", color: "#111827", width: 24, textAlign: "right" },

  pipelineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalOppBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  totalOppText: { fontSize: 13, fontWeight: "700", color: "#059669" },
  pipelineCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  pipelineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  pipelineObs: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F97316",
  },
  pipelineName: { flex: 1, fontSize: 14, fontWeight: "500", color: "#374151" },
  pipelineCount: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
    width: 30,
    textAlign: "right",
  },
  pipelineCost: {
    fontSize: 13,
    fontWeight: "700",
    color: "#059669",
    width: 60,
    textAlign: "right",
  },
  emptyText: { fontSize: 14, color: "#9CA3AF", textAlign: "center" },

  rankingRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    gap: 10,
  },
  rankingInfo: { flex: 1 },
  rankingName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  rankingSub: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  rankingSpend: { fontSize: 16, fontWeight: "800", color: "#22C55E" },
});
