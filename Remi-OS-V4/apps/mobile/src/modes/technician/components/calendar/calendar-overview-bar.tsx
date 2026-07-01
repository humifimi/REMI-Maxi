import { useState } from "react";
import { StyleSheet, View, Text, Pressable, ScrollView } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  useDispatchOverview,
  useDispatchAlerts,
  useTechnicianMetrics,
} from "@technician/hooks/operations/use-franchise-calendar";
import type { ExceptionAlert, TechnicianMetric } from "@technician/types/api";

const RISK_COLORS: Record<string, string> = {
  none: "#22C55E",
  low: "#EAB308",
  medium: "#F59E0B",
  high: "#EF4444",
};

const SEVERITY_COLORS: Record<string, string> = {
  info: "#3B82F6",
  warning: "#F59E0B",
  critical: "#EF4444",
};

interface CalendarOverviewBarProps {
  franchiseId: number;
  date: string;
  onFlexPress?: () => void;
}

export function CalendarOverviewBar({ franchiseId, date, onFlexPress }: CalendarOverviewBarProps) {
  const { data } = useDispatchOverview(franchiseId);
  const {
    data: alerts = [],
    isLoading: alertsLoading,
    isError: alertsError,
  } = useDispatchAlerts(franchiseId, date);
  const {
    data: techMetrics = [],
    isLoading: metricsLoading,
    isError: metricsError,
  } = useTechnicianMetrics(franchiseId, date);
  const [expanded, setExpanded] = useState(false);

  const summary = data?.summary;
  if (!summary) return null;

  const criticalAlerts = alerts.filter((a) => a.severity === "critical");
  const alertCount = alerts.length;

  const items = [
    { value: summary.activeRoutes, label: "Active", color: "#111827" },
    { value: summary.completedStops, label: "Done", color: "#111827" },
    { value: summary.pendingStops, label: "Pending", color: "#111827" },
    ...(summary.delayedStops > 0
      ? [{ value: summary.delayedStops, label: "Delayed", color: "#EF4444" }]
      : []),
  ];

  return (
    <View>
      <Pressable
        style={styles.bar}
        onPress={() => setExpanded((p) => !p)}
      >
        {onFlexPress && (
          <Pressable style={styles.flexItem} onPress={onFlexPress}>
            <MaterialIcons name="format-list-bulleted" size={20} color="#8B5CF6" />
            <Text style={styles.flexLabel}>Flex</Text>
          </Pressable>
        )}
        {items.map((item) => (
          <View key={item.label} style={styles.item}>
            <Text style={[styles.value, { color: item.color }]}>
              {item.value}
            </Text>
            <Text style={styles.label}>{item.label}</Text>
          </View>
        ))}
        {alertCount > 0 && (
          <View style={styles.alertBadgeWrap}>
            <View
              style={[
                styles.alertBadge,
                {
                  backgroundColor:
                    criticalAlerts.length > 0 ? "#EF4444" : "#F59E0B",
                },
              ]}
            >
              <MaterialIcons name="warning" size={12} color="#fff" />
              <Text style={styles.alertBadgeText}>{alertCount}</Text>
            </View>
          </View>
        )}
      </Pressable>

      {expanded && (
        <View style={styles.expandedSection}>
          <View style={styles.metricsSection}>
            <Text style={styles.sectionLabel}>Technician Status</Text>
            {metricsLoading ? (
              <Text style={styles.noDataText}>Loading…</Text>
            ) : metricsError ? (
              <Text style={styles.noDataText}>
                Couldn&apos;t load technician metrics
              </Text>
            ) : techMetrics.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {techMetrics.map((m) => (
                  <TechMetricChip key={m.tech_id} metric={m} />
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.noDataText}>No technicians scheduled</Text>
            )}
          </View>

          <View style={styles.alertsSection}>
            <Text style={styles.sectionLabel}>
              Exceptions{alerts.length > 0 ? ` (${alerts.length})` : ""}
            </Text>
            {alertsLoading ? (
              <Text style={styles.noDataText}>Loading…</Text>
            ) : alertsError ? (
              <Text style={styles.noDataText}>Couldn&apos;t load alerts</Text>
            ) : alerts.length > 0 ? (
              <>
                {alerts.slice(0, 5).map((a) => (
                  <AlertRow key={a.id} alert={a} />
                ))}
                {alerts.length > 5 && (
                  <Text style={styles.moreAlerts}>
                    +{alerts.length - 5} more
                  </Text>
                )}
              </>
            ) : (
              <Text style={styles.noDataText}>No alerts</Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function TechMetricChip({ metric }: { metric: TechnicianMetric }) {
  const riskColor = RISK_COLORS[metric.behind_schedule_risk] ?? "#6B7280";
  return (
    <View style={styles.techChip}>
      <View style={[styles.riskDot, { backgroundColor: riskColor }]} />
      <View>
        <Text style={styles.techName} numberOfLines={1}>
          {metric.tech_name}
        </Text>
        <Text style={styles.techDetail}>
          {metric.completed_stops}/{metric.total_stops} stops
          {metric.idle_minutes > 0 ? ` \u00b7 ${metric.idle_minutes}m idle` : ""}
        </Text>
        {metric.next_stop && (
          <Text style={styles.techNext} numberOfLines={1}>
            Next: {metric.next_stop}
          </Text>
        )}
      </View>
    </View>
  );
}

function AlertRow({ alert }: { alert: ExceptionAlert }) {
  const color = SEVERITY_COLORS[alert.severity] ?? "#6B7280";
  return (
    <View style={styles.alertRow}>
      <View style={[styles.alertDot, { backgroundColor: color }]} />
      <Text style={styles.alertMessage} numberOfLines={2}>
        {alert.message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 12,
    borderRadius: 12,
    paddingVertical: 10,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  item: { alignItems: "center" },
  value: { fontSize: 20, fontWeight: "700" },
  label: { fontSize: 11, fontWeight: "600", color: "#9CA3AF", marginTop: 2 },
  flexItem: { alignItems: "center", paddingHorizontal: 4 },
  flexLabel: { fontSize: 11, fontWeight: "600", color: "#8B5CF6", marginTop: 2 },
  alertBadgeWrap: { position: "absolute", top: -6, right: 8 },
  alertBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  alertBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  expandedSection: {
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  metricsSection: { marginBottom: 12 },
  techChip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 10,
    marginRight: 8,
    minWidth: 140,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  riskDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  techName: { fontSize: 13, fontWeight: "600", color: "#111827" },
  techDetail: { fontSize: 11, color: "#6B7280", marginTop: 1 },
  techNext: { fontSize: 11, color: "#9CA3AF", marginTop: 1 },
  alertsSection: {},
  alertRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 6,
  },
  alertDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  alertMessage: { flex: 1, fontSize: 13, color: "#374151", lineHeight: 18 },
  moreAlerts: { fontSize: 12, color: "#9CA3AF", marginTop: 4 },
  noDataText: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
    paddingVertical: 8,
  },
});
