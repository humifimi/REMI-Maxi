import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { currency } from "@profit-model/format";
import type { ThirteenWeekForecast, ThirteenWeekForecastWeek } from "@profit-model/types";

type Props = {
  forecast: ThirteenWeekForecast;
  glossaryKey?: string;
  onGlossaryPress?: (key: string) => void;
};

const SEVERITY_STYLES: Record<
  ThirteenWeekForecastWeek["severity"],
  { rowBg: string; badgeBg: string; badgeText: string; label: string }
> = {
  ok: {
    rowBg: "#fff",
    badgeBg: "#DCFCE7",
    badgeText: "#166534",
    label: "OK",
  },
  low: {
    rowBg: "#FEFCE8",
    badgeBg: "#FEF3C7",
    badgeText: "#92400E",
    label: "Low",
  },
  critical: {
    rowBg: "#FEF2F2",
    badgeBg: "#FEE2E2",
    badgeText: "#991B1B",
    label: "Critical",
  },
};

function formatWeekOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function ThirteenWeekForecastList({
  forecast,
  glossaryKey,
  onGlossaryPress,
}: Props) {
  const showInfo = !!glossaryKey && !!onGlossaryPress;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>13-week cash forecast</Text>
          {showInfo ? (
            <Pressable
              hitSlop={10}
              onPress={() => onGlossaryPress!(glossaryKey!)}
              accessibilityRole="button"
              accessibilityLabel="Learn more: 13-week forecast"
            >
              <MaterialIcons name="help-outline" size={14} color="#6B7280" />
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.subtitle}>
          Weekly projection from current cash, period burn, and obligations.
        </Text>
      </View>

      {forecast.length === 0 ? (
        <Text style={styles.empty}>Forecast not available.</Text>
      ) : (
        <View style={styles.list}>
          {forecast.map((week) => (
            <WeekRow key={week.week_index} week={week} />
          ))}
        </View>
      )}
    </View>
  );
}

function WeekRow({ week }: { week: ThirteenWeekForecastWeek }) {
  const [expanded, setExpanded] = useState(false);
  const s = SEVERITY_STYLES[week.severity];
  const endingNegative = week.ending_cash < 0;

  return (
    <Pressable
      style={[styles.row, { backgroundColor: s.rowBg }]}
      onPress={() => setExpanded((v) => !v)}
      accessibilityRole="button"
      accessibilityLabel={`Week ${week.week_index + 1}, ${expanded ? "collapse" : "expand"}`}
      hitSlop={4}
    >
      <View style={styles.rowMain}>
        <View style={styles.rowMainLeft}>
          <Text style={styles.weekNum}>W{week.week_index + 1}</Text>
          <View style={styles.weekColumn}>
            <Text style={styles.weekDate}>{formatWeekOf(week.week_start_date)}</Text>
            <Text style={styles.opening}>
              Open {currency(week.opening_cash)}
            </Text>
          </View>
        </View>
        <View style={styles.rowMainRight}>
          <Text
            style={[
              styles.endingValue,
              endingNegative && styles.endingValueNeg,
            ]}
          >
            {currency(week.ending_cash)}
          </Text>
          <View style={styles.rightSub}>
            <View style={[styles.badge, { backgroundColor: s.badgeBg }]}>
              <Text style={[styles.badgeText, { color: s.badgeText }]}>
                {s.label}
              </Text>
            </View>
            <MaterialIcons
              name={expanded ? "expand-less" : "expand-more"}
              size={18}
              color="#6B7280"
            />
          </View>
        </View>
      </View>
      {expanded ? (
        <View style={styles.expanded}>
          <View style={styles.expRow}>
            <Text style={styles.expLabel}>Inflows</Text>
            <Text style={styles.expValuePos}>+{currency(week.inflows)}</Text>
          </View>
          <View style={styles.expRow}>
            <Text style={styles.expLabel}>Outflows</Text>
            <Text style={styles.expValueNeg}>
              -{currency(Math.abs(week.outflows))}
            </Text>
          </View>
          <View style={[styles.expRow, styles.expRowTotal]}>
            <Text style={styles.expLabelTotal}>Net change</Text>
            <Text
              style={[
                styles.expValueTotal,
                week.inflows - Math.abs(week.outflows) < 0 &&
                  styles.expValueNeg,
              ]}
            >
              {currency(week.inflows - Math.abs(week.outflows))}
            </Text>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  header: { gap: 2 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 4 },
  title: { fontSize: 15, fontWeight: "700", color: "#111827" },
  subtitle: { fontSize: 11, color: "#9CA3AF" },
  empty: { marginTop: 12, fontSize: 13, color: "#6B7280" },
  list: { marginTop: 12, gap: 6 },
  row: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowMainLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  rowMainRight: { alignItems: "flex-end", gap: 4 },
  weekNum: {
    fontSize: 12,
    fontWeight: "800",
    color: "#6B7280",
    width: 32,
    fontVariant: ["tabular-nums"],
  },
  weekColumn: { gap: 1, flexShrink: 1 },
  weekDate: { fontSize: 13, fontWeight: "700", color: "#111827" },
  opening: {
    fontSize: 11,
    color: "#6B7280",
    fontVariant: ["tabular-nums"],
  },
  endingValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
    fontVariant: ["tabular-nums"],
  },
  endingValueNeg: { color: "#B91C1C" },
  rightSub: { flexDirection: "row", alignItems: "center", gap: 4 },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  expanded: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    gap: 4,
  },
  expRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingVertical: 2,
  },
  expRowTotal: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  expLabel: { fontSize: 12, color: "#6B7280" },
  expLabelTotal: { fontSize: 12, fontWeight: "700", color: "#374151" },
  expValuePos: {
    fontSize: 12,
    fontWeight: "600",
    color: "#15803D",
    fontVariant: ["tabular-nums"],
  },
  expValueNeg: {
    color: "#B91C1C",
  },
  expValueTotal: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
    fontVariant: ["tabular-nums"],
  },
});
