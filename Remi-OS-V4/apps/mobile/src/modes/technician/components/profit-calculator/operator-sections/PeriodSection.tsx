import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { OperatorState } from "@profit-model/types";
import { Accordion } from "../accordion";
import { CurrencyInput } from "../controls/CurrencyInput";
import { DateField } from "./DateField";

// Mirrors REMIDashboard `_components/operator-sections/PeriodSection.tsx`.
// Two date pickers + four CurrencyInputs in one accordion. We intentionally
// use the engine's bracket-path setter (`setOperatorField`) so we don't have
// to spread `period` deeply on every keystroke.

type Props = {
  operatorState: OperatorState;
  setOperatorField: (path: string, value: unknown) => void;
};

const ISO_DATE = (d: Date) => d.toISOString().slice(0, 10);

function diffInDays(start: string, end: string): number {
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function PeriodSection({ operatorState, setOperatorField }: Props) {
  const period = operatorState.period;

  const days = useMemo(
    () => diffInDays(period.start_date, period.end_date),
    [period.start_date, period.end_date]
  );

  const handleUseLastQuarter = () => {
    const today = new Date();
    const ninetyDaysAgo = new Date(today.getTime() - 90 * 86_400_000);
    setOperatorField("period.start_date", ISO_DATE(ninetyDaysAgo));
    setOperatorField("period.end_date", ISO_DATE(today));
  };

  return (
    <Accordion
      title="1. Reporting period"
      subtitle={days > 0 ? `${days} days` : "Set start & end dates"}
      defaultOpen
    >
      <View style={styles.row}>
        <DateField
          label="Start date"
          value={period.start_date}
          onChange={(v) => setOperatorField("period.start_date", v)}
        />
        <DateField
          label="End date"
          value={period.end_date}
          onChange={(v) => setOperatorField("period.end_date", v)}
        />
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>
          Period:{" "}
          <Text style={styles.metaStrong}>
            {days > 0 ? `${days} days` : "—"}
          </Text>
        </Text>
        <Pressable
          style={styles.quickBtn}
          onPress={handleUseLastQuarter}
          hitSlop={8}
        >
          <Text style={styles.quickBtnText}>Use last quarter</Text>
        </Pressable>
      </View>

      <Text style={styles.subhead}>Period actuals</Text>

      <CurrencyInput
        label="Net sales"
        value={period.net_sales}
        hint="Revenue net of discounts and refunds (excludes sales tax)."
        onChange={(v) => setOperatorField("period.net_sales", v)}
        glossaryKey="net_sales"
        sourceProvider="manual"
      />
      <CurrencyInput
        label="COGS total"
        value={period.cogs_total}
        hint="Chemicals, materials, equipment use directly tied to jobs."
        onChange={(v) => setOperatorField("period.cogs_total", v)}
        glossaryKey="cogs"
        sourceProvider="manual"
      />
      <CurrencyInput
        label="Labor total"
        value={period.labor_total}
        hint="Wages, payroll taxes, and benefits paid during the period."
        onChange={(v) => setOperatorField("period.labor_total", v)}
        glossaryKey="labor"
        sourceProvider="manual"
      />
      <CurrencyInput
        label="Fixed costs total"
        value={period.fixed_costs_total}
        hint="Rent, insurance, software, royalties, and other overhead."
        onChange={(v) => setOperatorField("period.fixed_costs_total", v)}
        glossaryKey="fixed_costs"
        sourceProvider="manual"
      />
    </Accordion>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 10,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    marginTop: -4,
  },
  metaText: {
    fontSize: 13,
    color: "#6B7280",
  },
  metaStrong: {
    color: "#111827",
    fontWeight: "700",
  },
  quickBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    backgroundColor: "#EFF6FF",
  },
  quickBtnText: {
    color: "#3B82F6",
    fontSize: 12,
    fontWeight: "700",
  },
  subhead: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 4,
  },
});
