import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ProfitModelOutputs } from "@profit-model/types";
import { currency, months_to_human, percent } from "@profit-model/format";
import { MultiYearLineChart } from "./charts/multi-year-line-chart";
import { RevenuePieChart, pieColor } from "./charts/revenue-pie-chart";
import { FixedCostsBars } from "./charts/fixed-costs-bars";
import { SeverityFlagsList } from "./operator-output/SeverityFlagsList";
import { RunwayBadge } from "./operator-output/RunwayBadge";
import { CashBridgeView } from "./operator-output/CashBridgeView";
import { TrappedWorkingCapitalCard } from "./operator-output/TrappedWorkingCapitalCard";
import { ThirteenWeekForecastList } from "./operator-output/ThirteenWeekForecastList";
import { NinetyDayCashCard } from "./operator-output/NinetyDayCashCard";

type Props = {
  visible: boolean;
  onClose: () => void;
  result: ProfitModelOutputs;
  fixedCostsBars: { label: string; value: number }[];
  /**
   * Mode the parent calculator is currently in. Defaults to 'investor' for
   * back-compat with any caller that hasn't been updated yet (only the public
   * profit-calculator screen renders this modal today, so the default is
   * mostly defensive).
   */
  mode?: "investor" | "operator";
  /**
   * PM-MIG-19 will wire this to open the glossary sheet. Until then it stays
   * undefined and the "?" affordances on operator-mode cards are hidden.
   */
  onGlossaryPress?: (key: string) => void;
};

type TabId = "projection" | "diagnostic";

export function DetailedResultsModal({
  visible,
  onClose,
  result,
  fixedCostsBars,
  mode = "investor",
  onGlossaryPress,
}: Props) {
  const { pnl, projection, chart_series, investment, service_mix, cash_collected, goal } = result;

  // Operator-mode "Cash Diagnostic" tab is only meaningful when the engine
  // emitted the operator output blocks. We gate on `cash_bridge` because
  // every operator-mode output set carries it (see types.ts §6); the
  // remaining blocks are always present together.
  const showDiagnosticTab =
    mode === "operator" && result.cash_bridge !== undefined;

  const [activeTab, setActiveTab] = useState<TabId>("projection");

  // Reset to projection tab when diagnostic tab is no longer available so
  // the modal never lands on a hidden tab (e.g., user toggles back to
  // investor mode while the modal is mounted).
  const effectiveTab: TabId = showDiagnosticTab ? activeTab : "projection";

  const pieSlices = useMemo(
    () =>
      service_mix.map((row, i) => ({
        label: row.name,
        value: Math.max(0, row.monthly_revenue),
        color: pieColor(i),
      })),
    [service_mix]
  );

  const lineSeries = useMemo(
    () => [
      { label: "Net Sales", color: "#3B82F6", points: chart_series.net_sales },
      { label: "EBITDA", color: "#22C55E", points: chart_series.ebitda },
      { label: "Net Income", color: "#8B5CF6", points: chart_series.net_income },
      { label: "Cumulative Cash", color: "#EAB308", points: chart_series.cumulative_cash },
    ],
    [chart_series]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Detailed Results</Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <MaterialIcons name="close" size={22} color="#374151" />
          </Pressable>
        </View>

        {showDiagnosticTab ? (
          <View style={styles.tabBar}>
            <TabButton
              label="Projection"
              active={effectiveTab === "projection"}
              onPress={() => setActiveTab("projection")}
            />
            <TabButton
              label="Cash Diagnostic"
              active={effectiveTab === "diagnostic"}
              onPress={() => setActiveTab("diagnostic")}
            />
          </View>
        ) : null}

        {effectiveTab === "diagnostic" && showDiagnosticTab ? (
          <ScrollView contentContainerStyle={styles.scroll}>
            <SeverityFlagsList
              flags={result.severity_flags ?? []}
              onGlossaryPress={onGlossaryPress}
            />
            {result.runway ? (
              <View style={styles.diagSpacer}>
                <RunwayBadge
                  runway={result.runway}
                  glossaryKey={result.info_keys?.runway}
                  onGlossaryPress={onGlossaryPress}
                />
              </View>
            ) : null}
            {result.ninety_day_cash_position ? (
              <View style={styles.diagSpacer}>
                <NinetyDayCashCard
                  position={result.ninety_day_cash_position}
                  glossaryKey={result.info_keys?.ninety_day_cash_position}
                  onGlossaryPress={onGlossaryPress}
                />
              </View>
            ) : null}
            {result.cash_bridge ? (
              <View style={styles.diagSpacer}>
                <CashBridgeView
                  bridge={result.cash_bridge}
                  glossaryKey={result.info_keys?.cash_bridge}
                  onGlossaryPress={onGlossaryPress}
                />
              </View>
            ) : null}
            {result.trapped_working_capital ? (
              <View style={styles.diagSpacer}>
                <TrappedWorkingCapitalCard
                  trapped={result.trapped_working_capital}
                  glossaryKey={result.info_keys?.trapped_working_capital}
                  onGlossaryPress={onGlossaryPress}
                />
              </View>
            ) : null}
            {result.thirteen_week_forecast ? (
              <View style={styles.diagSpacer}>
                <ThirteenWeekForecastList
                  forecast={result.thirteen_week_forecast}
                  glossaryKey={result.info_keys?.thirteen_week_forecast}
                  onGlossaryPress={onGlossaryPress}
                />
              </View>
            ) : null}
            <View style={{ height: 32 }} />
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll}>
          <Section title="P&L Summary (Year 1)" subtitle="All figures annual">
            <PnlRow label="Service Revenue" value={pnl.service_revenue} />
            <PnlRow label="Discounts" value={-pnl.discounts} muted />
            <PnlRow label="Net Sales" value={pnl.net_sales} bold />
            <PnlRow label="COGS" value={-pnl.cogs_total} muted />
            <PnlRow label="Labor" value={-pnl.labor_total} muted />
            <PnlRow label="Fixed Costs" value={-pnl.fixed_costs_total} muted />
            <PnlRow label="EBITDA (pre-franchise)" value={pnl.ebitda_pre_franchise} bold />
            <PnlRow label="Royalty" value={-pnl.franchise_fees.royalty} muted />
            <PnlRow label="Ad Fund" value={-pnl.franchise_fees.ad_fund} muted />
            <PnlRow label="Tech Fee" value={-pnl.franchise_fees.tech_fee} muted />
            <PnlRow label="Other Franchise Fees" value={-pnl.franchise_fees.other} muted />
            <PnlRow label="EBITDA (post-franchise)" value={pnl.ebitda_post_franchise} bold accent />
            <PnlRow label="Depreciation" value={-pnl.depreciation} muted />
            <PnlRow label="Interest Expense" value={-pnl.interest_expense} muted />
            <PnlRow label="Owner Below-Line Draws" value={-pnl.owner_below_line_draws} muted />
            <PnlRow label="Net Income" value={pnl.net_income} bold accent />
            <View style={styles.divider} />
            <PnlRow label="Owner Take-Home Cash" value={pnl.owner_take_home_cash} bold accent />
            <PnlRow label="Loan Principal Paid" value={-pnl.principal_payments} muted />
          </Section>

          <Section title={`Goal: ${currency(goal.goal_amount)} (${goal.goal_metric})`}>
            <View style={[styles.goalCard, GOAL_STYLE[goal.status]]}>
              <Text style={styles.goalStatus}>{goal.status.toUpperCase()}</Text>
              <Text style={styles.goalMessage}>{goal.message}</Text>
              <View style={styles.goalRow}>
                <View style={styles.goalCell}>
                  <Text style={styles.goalCellLabel}>Current</Text>
                  <Text style={styles.goalCellValue}>{currency(goal.current_amount)}</Text>
                </View>
                <View style={styles.goalCell}>
                  <Text style={styles.goalCellLabel}>Gap</Text>
                  <Text style={styles.goalCellValue}>
                    {goal.gap > 0 ? `-${currency(goal.gap)}` : `+${currency(-goal.gap)}`}
                  </Text>
                </View>
              </View>
            </View>
          </Section>

          <Section title="Multi-Year Projection">
            <MultiYearLineChart series={lineSeries} />
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 0.7 }]}>Year</Text>
              <Text style={[styles.th, styles.thRight]}>Net Sales</Text>
              <Text style={[styles.th, styles.thRight]}>EBITDA</Text>
              <Text style={[styles.th, styles.thRight]}>Take-Home</Text>
            </View>
            {projection.map((row) => (
              <View key={row.year} style={styles.tableRow}>
                <Text style={[styles.td, { flex: 0.7 }]}>Y{row.year}</Text>
                <Text style={[styles.td, styles.tdRight]}>{currency(row.net_sales)}</Text>
                <Text style={[styles.td, styles.tdRight]}>{currency(row.ebitda_post_franchise)}</Text>
                <Text style={[styles.td, styles.tdRight]}>{currency(row.owner_take_home_cash)}</Text>
              </View>
            ))}
          </Section>

          <Section title="Monthly Revenue Mix">
            <RevenuePieChart slices={pieSlices} />
          </Section>

          <Section title="Fixed Costs Breakdown">
            <FixedCostsBars bars={fixedCostsBars} />
          </Section>

          <Section title="Investment & Returns">
            <PnlRow label="Total Initial Investment" value={investment.total_initial_investment} bold />
            <PnlRow label="Cash Required at Close" value={investment.cash_required_at_close} />
            <PnlRow label="Loan Principal" value={investment.loan_principal} />
            <PnlRow label="Monthly Loan Payment" value={investment.monthly_loan_payment} />
            <View style={styles.divider} />
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Payback Period</Text>
              <Text style={styles.kvValue}>
                {investment.payback_period_months !== null
                  ? months_to_human(investment.payback_period_months)
                  : "Not within projection"}
              </Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>5-Year IRR</Text>
              <Text style={styles.kvValue}>
                {investment.irr_5yr_pct !== null ? percent(investment.irr_5yr_pct, 1) : "—"}
              </Text>
            </View>
          </Section>

          <Section title="Should I Add Another Truck?">
            {investment.marginal_truck_roi.map((row) => (
              <View key={row.service_id} style={styles.truckCard}>
                <Text style={styles.truckName}>{row.service_name}</Text>
                <View style={styles.truckRow}>
                  <View style={styles.truckCell}>
                    <Text style={styles.truckCellLabel}>+EBITDA / yr</Text>
                    <Text style={styles.truckCellValue}>
                      {currency(row.incremental_annual_ebitda)}
                    </Text>
                  </View>
                  <View style={styles.truckCell}>
                    <Text style={styles.truckCellLabel}>Payback</Text>
                    <Text style={styles.truckCellValue}>
                      {row.payback_years !== null && Number.isFinite(row.payback_years)
                        ? `${row.payback_years.toFixed(1)} yr`
                        : "—"}
                    </Text>
                  </View>
                  <View style={styles.truckCell}>
                    <Text style={styles.truckCellLabel}>Y1 ROI</Text>
                    <Text style={styles.truckCellValue}>{percent(row.roi_year_1_pct, 0)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </Section>

          <Section title="Cash Collected (display-only)">
            <PnlRow label="Service Revenue" value={cash_collected.service_revenue} />
            <PnlRow label="Add-on Revenue" value={cash_collected.addon_revenue} />
            <PnlRow label="Tips" value={cash_collected.tips} />
            <PnlRow label="Discounts" value={cash_collected.discounts} muted />
            <PnlRow label="Net Sales" value={cash_collected.net_sales} bold />
            <PnlRow label="Sales Tax Collected" value={cash_collected.sales_tax_collected} muted />
            <PnlRow label="Total Cash Deposited" value={cash_collected.total_cash_collected} bold accent />
          </Section>

          <View style={{ height: 32 }} />
        </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.tabBtn, active && styles.tabBtnActive]}
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function PnlRow({
  label,
  value,
  bold,
  muted,
  accent,
}: {
  label: string;
  value: number;
  bold?: boolean;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <View style={styles.kvRow}>
      <Text style={[styles.kvLabel, bold && styles.kvLabelBold]}>{label}</Text>
      <Text
        style={[
          styles.kvValue,
          bold && styles.kvValueBold,
          muted && styles.kvValueMuted,
          accent && styles.kvValueAccent,
          value < 0 && styles.kvValueNegative,
        ]}
      >
        {value < 0 ? `-${currency(Math.abs(value))}` : currency(value)}
      </Text>
    </View>
  );
}

const GOAL_STYLE: Record<"achieved" | "short" | "losing", { borderLeftColor: string; backgroundColor: string }> = {
  achieved: { borderLeftColor: "#22C55E", backgroundColor: "#F0FDF4" },
  short: { borderLeftColor: "#EAB308", backgroundColor: "#FEFCE8" },
  losing: { borderLeftColor: "#EF4444", backgroundColor: "#FEF2F2" },
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 4,
  },
  tabBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    minHeight: 44,
    justifyContent: "center",
  },
  tabBtnActive: {
    borderBottomColor: "#3B82F6",
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
  },
  tabBtnTextActive: {
    color: "#3B82F6",
  },
  scroll: { padding: 16, gap: 16 },
  diagSpacer: { marginTop: 12 },
  section: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  sectionSubtitle: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 2,
  },
  sectionBody: {
    marginTop: 12,
    gap: 8,
  },
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingVertical: 4,
  },
  kvLabel: {
    fontSize: 13,
    color: "#374151",
  },
  kvLabelBold: {
    fontWeight: "700",
    color: "#111827",
  },
  kvValue: {
    fontSize: 13,
    color: "#111827",
    fontVariant: ["tabular-nums"],
  },
  kvValueBold: {
    fontWeight: "800",
  },
  kvValueMuted: {
    color: "#6B7280",
  },
  kvValueAccent: {
    color: "#3B82F6",
  },
  kvValueNegative: {
    color: "#B91C1C",
  },
  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 6,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    marginTop: 12,
  },
  th: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  thRight: { textAlign: "right" },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  td: { flex: 1, fontSize: 13, color: "#111827", fontVariant: ["tabular-nums"] },
  tdRight: { textAlign: "right" },
  goalCard: {
    borderLeftWidth: 4,
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  goalStatus: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#374151",
  },
  goalMessage: {
    fontSize: 14,
    color: "#111827",
  },
  goalRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 4,
  },
  goalCell: { flex: 1 },
  goalCellLabel: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "600",
  },
  goalCellValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  truckCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  truckName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  truckRow: {
    flexDirection: "row",
    gap: 12,
  },
  truckCell: { flex: 1 },
  truckCellLabel: {
    fontSize: 10,
    color: "#9CA3AF",
    textTransform: "uppercase",
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  truckCellValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
});
