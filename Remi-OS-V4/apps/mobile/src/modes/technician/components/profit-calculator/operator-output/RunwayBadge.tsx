import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { currency } from "@profit-model/format";
import type { RunwayAnalysis } from "@profit-model/types";

type Props = {
  runway: RunwayAnalysis;
  glossaryKey?: string;
  onGlossaryPress?: (key: string) => void;
};

const STATUS_STYLES: Record<
  RunwayAnalysis["status"],
  {
    container: string;
    border: string;
    pillBg: string;
    pillText: string;
    value: string;
    label: string;
  }
> = {
  healthy: {
    container: "#F0FDF4",
    border: "#BBF7D0",
    pillBg: "#DCFCE7",
    pillText: "#166534",
    value: "#15803D",
    label: "#166534",
  },
  caution: {
    container: "#FEFCE8",
    border: "#FDE68A",
    pillBg: "#FEF3C7",
    pillText: "#92400E",
    value: "#A16207",
    label: "#854D0E",
  },
  warning: {
    container: "#FFF7ED",
    border: "#FED7AA",
    pillBg: "#FFEDD5",
    pillText: "#9A3412",
    value: "#C2410C",
    label: "#9A3412",
  },
  critical: {
    container: "#FEF2F2",
    border: "#FECACA",
    pillBg: "#FEE2E2",
    pillText: "#991B1B",
    value: "#B91C1C",
    label: "#991B1B",
  },
};

const STATUS_LABEL: Record<RunwayAnalysis["status"], string> = {
  healthy: "Healthy",
  caution: "Caution",
  warning: "Warning",
  critical: "Critical",
};

export function RunwayBadge({ runway, glossaryKey, onGlossaryPress }: Props) {
  const s = STATUS_STYLES[runway.status];
  const months = Number.isFinite(runway.runway_months)
    ? runway.runway_months
    : null;
  const showInfo = !!glossaryKey && !!onGlossaryPress;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: s.container, borderColor: s.border },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.label, { color: s.label }]}>Cash runway</Text>
          {showInfo ? (
            <Pressable
              hitSlop={10}
              onPress={() => onGlossaryPress!(glossaryKey!)}
              accessibilityRole="button"
              accessibilityLabel="Learn more: cash runway"
            >
              <MaterialIcons name="help-outline" size={14} color={s.label} />
            </Pressable>
          ) : null}
        </View>
        <View style={[styles.pill, { backgroundColor: s.pillBg }]}>
          <Text style={[styles.pillText, { color: s.pillText }]}>
            {STATUS_LABEL[runway.status]}
          </Text>
        </View>
      </View>

      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: s.value }]}>
          {months == null ? "∞" : months.toFixed(1)}
        </Text>
        <Text style={[styles.unit, { color: s.label }]}>months</Text>
      </View>

      <Text style={[styles.foot, { color: s.label }]}>
        Based on {currency(runway.monthly_burn)}/mo burn and{" "}
        {currency(runway.cash_on_hand)} cash on hand.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    marginTop: 10,
  },
  value: {
    fontSize: 44,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  unit: {
    fontSize: 16,
    fontWeight: "600",
  },
  foot: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 16,
  },
});
