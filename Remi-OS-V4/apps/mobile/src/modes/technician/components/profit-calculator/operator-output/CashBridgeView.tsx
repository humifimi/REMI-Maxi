import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { currency } from "@profit-model/format";
import type { CashBridge } from "@profit-model/types";

type Props = {
  bridge: CashBridge;
  glossaryKey?: string;
  onGlossaryPress?: (key: string) => void;
};

type StepKind = "anchor" | "positive" | "negative";

interface BridgeStep {
  label: string;
  amount: number;
  kind: StepKind;
}

function signed(amount: number): StepKind {
  if (amount === 0) return "positive";
  return amount > 0 ? "positive" : "negative";
}

function buildSteps(b: CashBridge): BridgeStep[] {
  return [
    { label: "Starting cash", amount: b.starting_cash, kind: "anchor" },
    { label: "+ EBITDA", amount: b.ebitda_period, kind: signed(b.ebitda_period) },
    {
      label: "+ Depreciation",
      amount: b.non_cash_addbacks.depreciation,
      kind: "positive",
    },
    {
      label: "+ Amortization",
      amount: b.non_cash_addbacks.amortization,
      kind: "positive",
    },
    {
      label: "Δ A/R",
      amount: b.working_capital_changes.ar_delta,
      kind: signed(b.working_capital_changes.ar_delta),
    },
    {
      label: "Δ Inventory",
      amount: b.working_capital_changes.inventory_delta,
      kind: signed(b.working_capital_changes.inventory_delta),
    },
    {
      label: "Δ Prepaid",
      amount: b.working_capital_changes.prepaid_delta,
      kind: signed(b.working_capital_changes.prepaid_delta),
    },
    {
      label: "Δ A/P",
      amount: b.working_capital_changes.ap_delta,
      kind: signed(b.working_capital_changes.ap_delta),
    },
    {
      label: "− Loan principal",
      amount: -Math.abs(b.financing_outflows.loan_principal),
      kind: "negative",
    },
    {
      label: "− Loan interest",
      amount: -Math.abs(b.financing_outflows.loan_interest),
      kind: "negative",
    },
    {
      label: "− Owner draws",
      amount: -Math.abs(b.financing_outflows.owner_draws),
      kind: "negative",
    },
    {
      label: "− Sales tax",
      amount: -Math.abs(b.tax_outflows.sales_tax_remitted),
      kind: "negative",
    },
    {
      label: "− Income tax",
      amount: -Math.abs(b.tax_outflows.income_tax_estimated),
      kind: "negative",
    },
    {
      label: "= Ending (calc)",
      amount: b.ending_cash_calculated,
      kind: "anchor",
    },
    {
      label: "= Ending (reported)",
      amount: b.ending_cash_reported,
      kind: "anchor",
    },
  ];
}

const KIND_VALUE_COLOR: Record<StepKind, string> = {
  anchor: "#111827",
  positive: "#15803D",
  negative: "#B91C1C",
};

export function CashBridgeView({
  bridge,
  glossaryKey,
  onGlossaryPress,
}: Props) {
  const steps = buildSteps(bridge);
  const diff = bridge.reconciliation_diff;
  const diffMaterial = Math.abs(diff) > 0.5;
  const showInfo = !!glossaryKey && !!onGlossaryPress;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Cash bridge</Text>
          {showInfo ? (
            <Pressable
              hitSlop={10}
              onPress={() => onGlossaryPress!(glossaryKey!)}
              accessibilityRole="button"
              accessibilityLabel="Learn more: cash bridge"
            >
              <MaterialIcons name="help-outline" size={14} color="#6B7280" />
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.subtitle}>
          How EBITDA turned into cash this period.
        </Text>
      </View>

      <View style={styles.steps}>
        {steps.map((step, idx) => {
          const isAnchor = step.kind === "anchor";
          return (
            <View
              key={`${step.label}-${idx}`}
              style={[styles.row, isAnchor && styles.rowAnchor]}
            >
              <Text style={[styles.rowLabel, isAnchor && styles.rowLabelAnchor]}>
                {step.label}
              </Text>
              <Text
                style={[
                  styles.rowValue,
                  { color: KIND_VALUE_COLOR[step.kind] },
                  isAnchor && styles.rowValueAnchor,
                ]}
              >
                {step.amount < 0
                  ? `-${currency(Math.abs(step.amount))}`
                  : `${step.kind === "positive" ? "+" : ""}${currency(step.amount)}`}
              </Text>
            </View>
          );
        })}
      </View>

      <View
        style={[
          styles.reconCard,
          diffMaterial
            ? diff > 0
              ? styles.reconWarn
              : styles.reconBad
            : styles.reconGood,
        ]}
      >
        <Text style={styles.reconLabel}>Reconciliation</Text>
        <Text
          style={[
            styles.reconValue,
            diffMaterial
              ? diff > 0
                ? styles.reconWarnText
                : styles.reconBadText
              : styles.reconGoodText,
          ]}
        >
          {diffMaterial
            ? `${diff > 0 ? "+" : ""}${currency(diff)} drift`
            : "Reconciled"}
        </Text>
        {diffMaterial ? (
          <Text style={styles.reconNote}>
            Calculated ending ({currency(bridge.ending_cash_calculated)}) vs.
            reported ({currency(bridge.ending_cash_reported)}). Usually owner
            deposits/withdrawals or A/R aging not in the period actuals.
          </Text>
        ) : null}
      </View>
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
  header: { gap: 2 },
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
  subtitle: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  steps: {
    marginTop: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  rowAnchor: {
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 10,
    marginHorizontal: -10,
    borderRadius: 6,
    borderBottomWidth: 0,
    marginTop: 4,
    marginBottom: 4,
  },
  rowLabel: {
    fontSize: 13,
    color: "#374151",
    flexShrink: 1,
    paddingRight: 8,
  },
  rowLabelAnchor: {
    fontWeight: "700",
    color: "#111827",
  },
  rowValue: {
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  rowValueAnchor: {
    fontWeight: "800",
    fontSize: 14,
  },
  reconCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  reconGood: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  reconWarn: {
    backgroundColor: "#FEFCE8",
    borderColor: "#FDE68A",
  },
  reconBad: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  reconLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  reconValue: {
    fontSize: 16,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  reconGoodText: { color: "#15803D" },
  reconWarnText: { color: "#A16207" },
  reconBadText: { color: "#B91C1C" },
  reconNote: {
    marginTop: 4,
    fontSize: 12,
    color: "#374151",
    lineHeight: 16,
  },
});
