import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { currency } from "@profit-model/format";
import type { TrappedWorkingCapital } from "@profit-model/types";

type Props = {
  trapped: TrappedWorkingCapital;
  glossaryKey?: string;
  onGlossaryPress?: (key: string) => void;
};

export function TrappedWorkingCapitalCard({
  trapped,
  glossaryKey,
  onGlossaryPress,
}: Props) {
  const netPositive = trapped.net_trapped >= 0;
  const showInfo = !!glossaryKey && !!onGlossaryPress;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Trapped working capital</Text>
        {showInfo ? (
          <Pressable
            hitSlop={10}
            onPress={() => onGlossaryPress!(glossaryKey!)}
            accessibilityRole="button"
            accessibilityLabel="Learn more: trapped working capital"
          >
            <MaterialIcons name="help-outline" size={14} color="#6B7280" />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.subtitle}>
        Cash you&rsquo;ve earned but can&rsquo;t spend yet.
      </Text>

      <View
        style={[
          styles.netCard,
          netPositive ? styles.netCardWarn : styles.netCardGood,
        ]}
      >
        <Text
          style={[
            styles.netLabel,
            netPositive ? styles.netLabelWarn : styles.netLabelGood,
          ]}
        >
          Net trapped
        </Text>
        <Text
          style={[
            styles.netValue,
            netPositive ? styles.netValueWarn : styles.netValueGood,
          ]}
        >
          {currency(trapped.net_trapped)}
        </Text>
      </View>

      <View style={styles.rows}>
        <Row label="Accounts receivable" value={trapped.accounts_receivable} />
        <Row label="Inventory" value={trapped.inventory_value} />
        <Row label="Prepaid expenses" value={trapped.prepaid_expenses} />
        <Row
          label="Less: accounts payable"
          value={trapped.accounts_payable_offset}
          cost
        />
        <Row label="Net trapped" value={trapped.net_trapped} emphasis />
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  cost,
  emphasis,
}: {
  label: string;
  value: number;
  cost?: boolean;
  emphasis?: boolean;
}) {
  return (
    <View style={[styles.row, emphasis && styles.rowEmphasis]}>
      <Text style={[styles.rowLabel, emphasis && styles.rowLabelEmphasis]}>
        {label}
      </Text>
      <Text
        style={[
          styles.rowValue,
          emphasis && styles.rowValueEmphasis,
          cost && styles.rowValueCost,
        ]}
      >
        {cost ? `(${currency(Math.abs(value))})` : currency(value)}
      </Text>
    </View>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 2,
  },
  netCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  netCardGood: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  netCardWarn: {
    backgroundColor: "#FEFCE8",
    borderColor: "#FDE68A",
  },
  netLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  netLabelGood: { color: "#166534" },
  netLabelWarn: { color: "#854D0E" },
  netValue: {
    marginTop: 2,
    fontSize: 26,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  netValueGood: { color: "#15803D" },
  netValueWarn: { color: "#A16207" },
  rows: {
    marginTop: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingVertical: 6,
  },
  rowEmphasis: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    marginTop: 4,
    paddingTop: 8,
  },
  rowLabel: {
    fontSize: 13,
    color: "#374151",
  },
  rowLabelEmphasis: {
    fontWeight: "700",
    color: "#111827",
  },
  rowValue: {
    fontSize: 13,
    color: "#111827",
    fontVariant: ["tabular-nums"],
  },
  rowValueCost: {
    color: "#B91C1C",
  },
  rowValueEmphasis: {
    fontWeight: "800",
    fontSize: 14,
  },
});
