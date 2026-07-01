import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { currency } from "@profit-model/format";
import type { NinetyDayCashPosition } from "@profit-model/types";

type Props = {
  position: NinetyDayCashPosition;
  glossaryKey?: string;
  onGlossaryPress?: (key: string) => void;
};

const STATUS_STYLES: Record<
  NinetyDayCashPosition["status"],
  {
    container: string;
    border: string;
    pillBg: string;
    pillText: string;
    ending: string;
  }
> = {
  healthy: {
    container: "#F0FDF4",
    border: "#BBF7D0",
    pillBg: "#DCFCE7",
    pillText: "#166534",
    ending: "#15803D",
  },
  caution: {
    container: "#FEFCE8",
    border: "#FDE68A",
    pillBg: "#FEF3C7",
    pillText: "#92400E",
    ending: "#A16207",
  },
  warning: {
    container: "#FFF7ED",
    border: "#FED7AA",
    pillBg: "#FFEDD5",
    pillText: "#9A3412",
    ending: "#C2410C",
  },
  critical: {
    container: "#FEF2F2",
    border: "#FECACA",
    pillBg: "#FEE2E2",
    pillText: "#991B1B",
    ending: "#B91C1C",
  },
};

const STATUS_LABEL: Record<NinetyDayCashPosition["status"], string> = {
  healthy: "Healthy",
  caution: "Caution",
  warning: "Warning",
  critical: "Critical",
};

export function NinetyDayCashCard({
  position,
  glossaryKey,
  onGlossaryPress,
}: Props) {
  const s = STATUS_STYLES[position.status];
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
          <Text style={styles.title}>90-day cash position</Text>
          {showInfo ? (
            <Pressable
              hitSlop={10}
              onPress={() => onGlossaryPress!(glossaryKey!)}
              accessibilityRole="button"
              accessibilityLabel="Learn more: 90-day cash position"
            >
              <MaterialIcons name="help-outline" size={14} color="#6B7280" />
            </Pressable>
          ) : null}
        </View>
        <View style={[styles.pill, { backgroundColor: s.pillBg }]}>
          <Text style={[styles.pillText, { color: s.pillText }]}>
            {STATUS_LABEL[position.status]}
          </Text>
        </View>
      </View>

      <View style={styles.rows}>
        <Row label="Starting cash" value={position.starting_cash} />
        <Row label="Projected inflows" value={position.projected_inflows} positive />
        <Row label="Projected outflows" value={position.projected_outflows} cost />
      </View>

      <View style={styles.endingBlock}>
        <Text style={styles.endingLabel}>Ending cash</Text>
        <Text style={[styles.endingValue, { color: s.ending }]}>
          {currency(position.ending_cash)}
        </Text>
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  cost,
  positive,
}: {
  label: string;
  value: number;
  cost?: boolean;
  positive?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          cost && styles.rowValueCost,
          positive && styles.rowValuePos,
        ]}
      >
        {cost ? `(${currency(Math.abs(value))})` : currency(value)}
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
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
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
  rows: {
    marginTop: 10,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingVertical: 4,
  },
  rowLabel: {
    fontSize: 13,
    color: "#374151",
  },
  rowValue: {
    fontSize: 13,
    color: "#111827",
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  rowValueCost: {
    color: "#B91C1C",
  },
  rowValuePos: {
    color: "#15803D",
  },
  endingBlock: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(17,24,39,0.08)",
  },
  endingLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  endingValue: {
    marginTop: 2,
    fontSize: 22,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
});
