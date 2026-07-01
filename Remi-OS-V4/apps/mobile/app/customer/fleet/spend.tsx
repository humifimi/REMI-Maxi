import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect, Line, Circle, Text as SvgText, Path } from 'react-native-svg';
import { Theme, HealthColors } from '@customer/constants/colors';
import { useFleetManagerGuard } from '@customer/components/fleet/fleet-manager-guard';
import { SkeletonBox } from '@customer/components/shared/skeleton';
import { EmptyState } from '@customer/components/shared/empty-state';
import { useFleetSpend, useFleetInvoices, useSetFleetBudget } from '@customer/hooks/fleet/use-fleet-spend';
import type { FleetInvoice, InvoiceStatus, SpendPeriod } from '@customer/types/fleet';

const INVOICE_STATUS_CONFIG: Record<InvoiceStatus, { bg: string; text: string; label: string }> = {
  paid: { bg: '#F0FDF4', text: '#22C55E', label: 'Paid' },
  pending: { bg: '#FEFCE8', text: '#EAB308', label: 'Pending' },
  overdue: { bg: '#FEF2F2', text: '#EF4444', label: 'Overdue' },
};

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getBudgetColor(percent: number): string {
  if (percent >= 90) return HealthColors.critical;
  if (percent >= 70) return HealthColors.warning;
  return HealthColors.good;
}

/* ── Budget Progress Bar ── */
function BudgetBar({ percent, limit, period }: { percent: number; limit: number; period: SpendPeriod | null }) {
  const color = getBudgetColor(percent);
  const clampedWidth = Math.min(percent, 100);
  const periodLabel = period === 'quarterly' ? 'Quarterly' : 'Monthly';

  return (
    <View style={[budgetStyles.container, Theme.shadow.sm]}>
      <View style={budgetStyles.header}>
        <Text style={budgetStyles.title}>Budget</Text>
        <Text style={budgetStyles.periodLabel}>{periodLabel}</Text>
      </View>
      <View style={budgetStyles.trackOuter}>
        <View style={[budgetStyles.trackFill, { width: `${clampedWidth}%`, backgroundColor: color }]} />
      </View>
      <View style={budgetStyles.footer}>
        <Text style={[budgetStyles.percent, { color }]}>{percent}% used</Text>
        <Text style={budgetStyles.limit}>{formatCurrency(limit)} limit</Text>
      </View>
    </View>
  );
}

/* ── Spend by Vehicle (horizontal bar chart via SVG) ── */
function SpendByVehicleChart({ data }: { data: { vehicle_name: string; total: number }[] }) {
  if (data.length === 0) return null;
  const maxVal = Math.max(...data.map((d) => d.total));
  const barHeight = 28;
  const gap = 10;
  const labelHeight = 16;
  const rowHeight = barHeight + labelHeight + gap;
  const chartHeight = data.length * rowHeight;
  const chartWidth = 320;

  return (
    <View style={chartStyles.wrapper}>
      <Text style={chartStyles.sectionLabel}>SPEND BY VEHICLE</Text>
      <View style={[chartStyles.card, Theme.shadow.sm]}>
        <Svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
          {data.map((item, i) => {
            const y = i * rowHeight;
            const barWidth = maxVal > 0 ? (item.total / maxVal) * (chartWidth - 80) : 0;
            return (
              <React.Fragment key={item.vehicle_name}>
                <SvgText
                  x={0}
                  y={y + labelHeight - 2}
                  fontSize={11}
                  fill={Theme.colors.textSecondary}
                  fontWeight="500"
                >
                  {item.vehicle_name.length > 28
                    ? item.vehicle_name.slice(0, 28) + '…'
                    : item.vehicle_name}
                </SvgText>
                <Rect
                  x={0}
                  y={y + labelHeight + 2}
                  width={barWidth}
                  height={barHeight}
                  rx={6}
                  fill={Theme.colors.primary}
                  opacity={0.85}
                />
                <SvgText
                  x={barWidth + 6}
                  y={y + labelHeight + barHeight / 2 + 5}
                  fontSize={12}
                  fill={Theme.colors.text}
                  fontWeight="700"
                >
                  {formatCurrency(item.total)}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      </View>
    </View>
  );
}

/* ── Spend by Service Type (donut-style breakdown) ── */
function SpendByServiceBreakdown({ data }: { data: { service_type: string; total: number; percentage: number }[] }) {
  if (data.length === 0) return null;
  const colors = [Theme.colors.primary, '#8B5CF6', '#F97316', HealthColors.good, Theme.colors.textTertiary];

  return (
    <View style={chartStyles.wrapper}>
      <Text style={chartStyles.sectionLabel}>SPEND BY SERVICE TYPE</Text>
      <View style={[chartStyles.card, Theme.shadow.sm]}>
        {data.map((item, i) => {
          const color = colors[i % colors.length];
          return (
            <View key={item.service_type} style={breakdownStyles.row}>
              <View style={[breakdownStyles.dot, { backgroundColor: color }]} />
              <Text style={breakdownStyles.label} numberOfLines={1}>{item.service_type}</Text>
              <View style={breakdownStyles.barTrack}>
                <View style={[breakdownStyles.barFill, { width: `${item.percentage}%`, backgroundColor: color }]} />
              </View>
              <Text style={breakdownStyles.value}>{formatCurrency(item.total)}</Text>
              <Text style={breakdownStyles.pct}>{item.percentage}%</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* ── Spend Trend Line Chart ── */
function SpendTrendChart({ data }: { data: { month: string; total: number }[] }) {
  if (data.length < 2) return null;

  const chartWidth = 320;
  const chartHeight = 160;
  const padX = 36;
  const padY = 20;
  const padBottom = 30;
  const drawW = chartWidth - padX * 2;
  const drawH = chartHeight - padY - padBottom;

  const maxVal = Math.max(...data.map((d) => d.total));
  const minVal = Math.min(...data.map((d) => d.total));
  const range = maxVal - minVal || 1;

  const points = data.map((d, i) => ({
    x: padX + (i / (data.length - 1)) * drawW,
    y: padY + drawH - ((d.total - minVal) / range) * drawH,
    label: d.month.slice(5),
    value: d.total,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <View style={chartStyles.wrapper}>
      <Text style={chartStyles.sectionLabel}>SPEND OVER TIME</Text>
      <View style={[chartStyles.card, Theme.shadow.sm]}>
        <Svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
          {[0, 0.5, 1].map((frac) => {
            const y = padY + drawH - frac * drawH;
            const val = Math.round(minVal + frac * range);
            return (
              <React.Fragment key={frac}>
                <Line x1={padX} y1={y} x2={chartWidth - padX} y2={y} stroke={Theme.colors.borderLight} strokeWidth={1} />
                <SvgText x={padX - 4} y={y + 4} fontSize={9} fill={Theme.colors.textTertiary} textAnchor="end">
                  ${(val / 1000).toFixed(1)}k
                </SvgText>
              </React.Fragment>
            );
          })}
          <Path d={pathD} stroke={Theme.colors.primary} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((p) => (
            <Circle key={p.label} cx={p.x} cy={p.y} r={4} fill={Theme.colors.primary} />
          ))}
          {points.map((p) => (
            <SvgText key={`lbl-${p.label}`} x={p.x} y={chartHeight - 8} fontSize={10} fill={Theme.colors.textSecondary} textAnchor="middle">
              {p.label}
            </SvgText>
          ))}
        </Svg>
      </View>
    </View>
  );
}

/* ── Invoice Card ── */
function InvoiceCard({ invoice, onPress }: { invoice: FleetInvoice; onPress: () => void }) {
  const statusConf = INVOICE_STATUS_CONFIG[invoice.status];

  return (
    <TouchableOpacity
      style={[invoiceStyles.card, Theme.shadow.sm]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={invoiceStyles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={invoiceStyles.desc} numberOfLines={1}>{invoice.description}</Text>
          <Text style={invoiceStyles.date}>{formatDate(invoice.date)}</Text>
        </View>
        <Text style={invoiceStyles.amount}>{formatCurrency(invoice.amount)}</Text>
      </View>
      <View style={invoiceStyles.bottomRow}>
        <View style={invoiceStyles.vehiclePills}>
          {invoice.vehicle_names.slice(0, 2).map((v) => (
            <View key={v} style={invoiceStyles.vehiclePill}>
              <Text style={invoiceStyles.vehiclePillText} numberOfLines={1}>{v}</Text>
            </View>
          ))}
          {invoice.vehicle_names.length > 2 && (
            <Text style={invoiceStyles.moreVehicles}>+{invoice.vehicle_names.length - 2}</Text>
          )}
        </View>
        <View style={invoiceStyles.rightMeta}>
          {invoice.po_number && (
            <Text style={invoiceStyles.po}>{invoice.po_number}</Text>
          )}
          <View style={[invoiceStyles.statusBadge, { backgroundColor: statusConf.bg }]}>
            <Text style={[invoiceStyles.statusText, { color: statusConf.text }]}>{statusConf.label}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/* ── Main Screen ── */
export default function FleetSpendScreen() {
  const allowed = useFleetManagerGuard();
  const router = useRouter();
  const { data: spend, isLoading: spendLoading, refetch: refetchSpend } = useFleetSpend();
  const { data: invoices, isLoading: invoicesLoading, refetch: refetchInvoices } = useFleetInvoices();
  const budgetMutation = useSetFleetBudget();

  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [budgetPeriod, setBudgetPeriod] = useState<SpendPeriod>('monthly');

  const isLoading = spendLoading || invoicesLoading;

  const mtdChange = useMemo(() => {
    if (!spend) return null;
    if (spend.previous_month_total === 0) return null;
    const pct = ((spend.mtd_total - spend.previous_month_total) / spend.previous_month_total) * 100;
    return pct;
  }, [spend]);

  const handleRefresh = useCallback(() => {
    refetchSpend();
    refetchInvoices();
  }, [refetchSpend, refetchInvoices]);

  const handleVehicleTap = useCallback((vehicleId: number) => {
    router.push(`/customer/fleet/vehicles/${vehicleId}`);
  }, [router]);

  const handleInvoiceTap = useCallback((invoice: FleetInvoice) => {
    // TODO: Navigate to invoice detail or PDF download when backend BE-24 is ready
    Alert.alert(
      invoice.description,
      `Amount: ${formatCurrency(invoice.amount)}\nStatus: ${invoice.status}\n${invoice.po_number ? `PO: ${invoice.po_number}` : 'No PO number'}\n\nPDF download requires backend integration.`,
    );
  }, []);

  const handleSetBudget = useCallback(() => {
    if (spend?.budget_limit) {
      setBudgetInput(String(spend.budget_limit));
      setBudgetPeriod(spend.budget_period ?? 'monthly');
    }
    setShowBudgetModal(true);
  }, [spend]);

  const handleSaveBudget = useCallback(() => {
    const amount = parseFloat(budgetInput);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid budget amount.');
      return;
    }
    budgetMutation.mutate(
      { budget_limit: amount, budget_period: budgetPeriod },
      {
        onSuccess: () => {
          setShowBudgetModal(false);
          Alert.alert('Budget Updated', `${budgetPeriod === 'quarterly' ? 'Quarterly' : 'Monthly'} budget set to ${formatCurrency(amount)}.`);
        },
      },
    );
  }, [budgetInput, budgetPeriod, budgetMutation]);

  const handleExport = useCallback(() => {
    // TODO: Call export endpoint when backend BE-24 is ready
    Alert.alert('Export Report', 'Spend report export coming soon — requires backend integration.');
  }, []);

  if (!allowed) return null;

  if (isLoading) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <SkeletonBox width="100%" height={100} borderRadius={16} />
        <View style={{ height: 16 }} />
        <SkeletonBox width="100%" height={80} borderRadius={12} />
        <View style={{ height: 16 }} />
        <SkeletonBox width="100%" height={200} borderRadius={12} />
        <View style={{ height: 16 }} />
        <SkeletonBox width="100%" height={200} borderRadius={12} />
      </ScrollView>
    );
  }

  if (!spend) {
    return (
      <View style={styles.emptyWrap}>
        <EmptyState
          title="No spend data"
          message="Fleet spend data will appear once service invoices are processed."
          actionLabel="Retry"
          onAction={handleRefresh}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={false} onRefresh={handleRefresh} />
      }
    >
      {/* MTD Spend Hero */}
      <View style={[styles.heroCard, Theme.shadow.md]}>
        <Text style={styles.heroLabel}>Month-to-Date Spend</Text>
        <Text style={styles.heroAmount}>{formatCurrency(spend.mtd_total)}</Text>
        {mtdChange !== null && (
          <View style={styles.changeRow}>
            <Ionicons
              name={mtdChange < 0 ? 'trending-down' : 'trending-up'}
              size={16}
              color={mtdChange < 0 ? HealthColors.good : HealthColors.critical}
            />
            <Text
              style={[
                styles.changeText,
                { color: mtdChange < 0 ? HealthColors.good : HealthColors.critical },
              ]}
            >
              {Math.abs(mtdChange).toFixed(1)}% vs. last month
            </Text>
          </View>
        )}
        <View style={styles.ytdRow}>
          <Text style={styles.ytdLabel}>YTD Total</Text>
          <Text style={styles.ytdValue}>{formatCurrency(spend.ytd_total)}</Text>
        </View>
      </View>

      {/* Budget Bar */}
      {spend.budget_limit && spend.budget_used_percent !== null ? (
        <BudgetBar
          percent={spend.budget_used_percent}
          limit={spend.budget_limit}
          period={spend.budget_period}
        />
      ) : (
        <TouchableOpacity
          style={[styles.setBudgetBtn, Theme.shadow.sm]}
          onPress={handleSetBudget}
          activeOpacity={0.7}
        >
          <Ionicons name="wallet-outline" size={20} color={Theme.colors.primary} />
          <Text style={styles.setBudgetText}>Set Monthly Budget</Text>
        </TouchableOpacity>
      )}

      {/* Spend by Vehicle */}
      <SpendByVehicleChart data={spend.by_vehicle} />

      {/* Spend by Service Type */}
      <SpendByServiceBreakdown data={spend.by_service_type} />

      {/* Spend Trend */}
      <SpendTrendChart data={spend.trend} />

      {/* Invoices */}
      <Text style={chartStyles.sectionLabel}>INVOICES</Text>
      {invoices && invoices.length > 0 ? (
        invoices.map((inv) => (
          <InvoiceCard key={inv.id} invoice={inv} onPress={() => handleInvoiceTap(inv)} />
        ))
      ) : (
        <EmptyState
          title="No invoices"
          message="Invoices will appear after service appointments are completed."
        />
      )}

      {/* Actions Row */}
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleSetBudget} activeOpacity={0.7}>
          <Ionicons name="wallet-outline" size={18} color={Theme.colors.primary} />
          <Text style={styles.actionBtnText}>
            {spend.budget_limit ? 'Update Budget' : 'Set Budget'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleExport} activeOpacity={0.7}>
          <Ionicons name="download-outline" size={18} color={Theme.colors.primary} />
          <Text style={styles.actionBtnText}>Export Report</Text>
        </TouchableOpacity>
      </View>

      {/* Set Budget Inline Form */}
      {showBudgetModal && (
        <View style={[styles.budgetForm, Theme.shadow.md]}>
          <Text style={styles.budgetFormTitle}>Set Budget Target</Text>
          <View style={styles.budgetPeriodRow}>
            {(['monthly', 'quarterly'] as SpendPeriod[]).map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.periodChip, budgetPeriod === p && styles.periodChipActive]}
                onPress={() => setBudgetPeriod(p)}
                activeOpacity={0.7}
              >
                <Text style={[styles.periodChipText, budgetPeriod === p && styles.periodChipTextActive]}>
                  {p === 'quarterly' ? 'Quarterly' : 'Monthly'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.budgetInputRow}>
            <Text style={styles.budgetDollar}>$</Text>
            <TextInput
              style={styles.budgetInput}
              placeholder="5000"
              placeholderTextColor={Theme.colors.textTertiary}
              value={budgetInput}
              onChangeText={setBudgetInput}
              keyboardType="numeric"
              returnKeyType="done"
            />
          </View>
          <View style={styles.budgetBtnRow}>
            <TouchableOpacity
              style={styles.budgetCancel}
              onPress={() => setShowBudgetModal(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.budgetCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.budgetSave}
              onPress={handleSaveBudget}
              activeOpacity={0.7}
              disabled={budgetMutation.isPending}
            >
              <Text style={styles.budgetSaveText}>
                {budgetMutation.isPending ? 'Saving…' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Demo badge */}
      <View style={styles.demoBadgeRow}>
        <View style={styles.demoBadge}>
          <Text style={styles.demoBadgeText}>Budget & Spend — Mock Data (BE-24)</Text>
        </View>
      </View>
    </ScrollView>
  );
}

/* ── Styles ── */

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Theme.colors.background },
  content: { padding: Theme.spacing.md, paddingBottom: Theme.spacing.xxl + Theme.spacing.xl },
  emptyWrap: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    justifyContent: 'center',
    padding: Theme.spacing.lg,
  },
  heroCard: {
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    backgroundColor: Theme.colors.surfaceElevated,
    alignItems: 'center',
  },
  heroLabel: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
    marginBottom: Theme.spacing.xs,
  },
  heroAmount: {
    fontSize: 40,
    fontWeight: '800',
    color: Theme.colors.text,
    letterSpacing: -1,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Theme.spacing.xs,
  },
  changeText: { fontSize: Theme.fontSize.sm, fontWeight: '600' },
  ytdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    marginTop: Theme.spacing.md,
    paddingTop: Theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.colors.border,
  },
  ytdLabel: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    fontWeight: '500',
  },
  ytdValue: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  setBudgetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.sm,
    paddingVertical: 14,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.primary,
    borderStyle: 'dashed',
    backgroundColor: Theme.colors.primary + '06',
    marginBottom: Theme.spacing.md,
  },
  setBudgetText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Theme.spacing.sm,
    marginTop: Theme.spacing.lg,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.sm,
    paddingVertical: 14,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.primary,
  },
  actionBtnText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  budgetForm: {
    marginTop: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    backgroundColor: Theme.colors.surfaceElevated,
  },
  budgetFormTitle: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.md,
  },
  budgetPeriodRow: { flexDirection: 'row', gap: Theme.spacing.sm, marginBottom: Theme.spacing.md },
  periodChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    alignItems: 'center',
  },
  periodChipActive: { backgroundColor: Theme.colors.primary, borderColor: Theme.colors.primary },
  periodChipText: { fontSize: Theme.fontSize.sm, fontWeight: '600', color: Theme.colors.textSecondary },
  periodChipTextActive: { color: Theme.colors.white },
  budgetInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Theme.colors.surface,
    paddingHorizontal: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
  },
  budgetDollar: { fontSize: Theme.fontSize.xl, fontWeight: '700', color: Theme.colors.text },
  budgetInput: {
    flex: 1,
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Theme.colors.text,
    paddingVertical: 14,
    marginLeft: Theme.spacing.xs,
  },
  budgetBtnRow: { flexDirection: 'row', gap: Theme.spacing.sm },
  budgetCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
  },
  budgetCancelText: { fontSize: Theme.fontSize.sm, fontWeight: '600', color: Theme.colors.textSecondary },
  budgetSave: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
  },
  budgetSaveText: { fontSize: Theme.fontSize.sm, fontWeight: '700', color: Theme.colors.white },
  demoBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Theme.spacing.xl,
  },
  demoBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: Theme.borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  demoBadgeText: { fontSize: 11, fontWeight: '600', color: '#92400E' },
});

const budgetStyles = StyleSheet.create({
  container: {
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    backgroundColor: Theme.colors.surfaceElevated,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.spacing.sm,
  },
  title: { fontSize: Theme.fontSize.sm, fontWeight: '700', color: Theme.colors.text },
  periodLabel: { fontSize: Theme.fontSize.xs, fontWeight: '500', color: Theme.colors.textTertiary },
  trackOuter: {
    height: 12,
    borderRadius: 6,
    backgroundColor: Theme.colors.surface,
    overflow: 'hidden',
  },
  trackFill: { height: '100%', borderRadius: 6 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Theme.spacing.xs,
  },
  percent: { fontSize: Theme.fontSize.sm, fontWeight: '700' },
  limit: { fontSize: Theme.fontSize.sm, fontWeight: '500', color: Theme.colors.textSecondary },
});

const chartStyles = StyleSheet.create({
  wrapper: { marginBottom: Theme.spacing.md },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Theme.colors.textTertiary,
    letterSpacing: 1.2,
    marginBottom: Theme.spacing.sm,
    marginTop: Theme.spacing.sm,
  },
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
  },
});

const breakdownStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    paddingVertical: Theme.spacing.sm,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: {
    width: 90,
    fontSize: Theme.fontSize.sm,
    fontWeight: '500',
    color: Theme.colors.text,
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.colors.surface,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4 },
  value: {
    width: 60,
    fontSize: Theme.fontSize.xs,
    fontWeight: '700',
    color: Theme.colors.text,
    textAlign: 'right',
  },
  pct: {
    width: 32,
    fontSize: Theme.fontSize.xs,
    fontWeight: '600',
    color: Theme.colors.textTertiary,
    textAlign: 'right',
  },
});

const invoiceStyles = StyleSheet.create({
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    marginBottom: Theme.spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Theme.spacing.sm,
  },
  desc: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
    marginBottom: 2,
  },
  date: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
  },
  amount: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '800',
    color: Theme.colors.text,
    marginLeft: Theme.spacing.sm,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vehiclePills: { flexDirection: 'row', gap: 4, flexShrink: 1, flex: 1 },
  vehiclePill: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    maxWidth: 120,
  },
  vehiclePillText: {
    fontSize: 11,
    fontWeight: '500',
    color: Theme.colors.textSecondary,
  },
  moreVehicles: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.colors.textTertiary,
    alignSelf: 'center',
  },
  rightMeta: { flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.sm },
  po: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Courier',
    color: Theme.colors.textTertiary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Theme.borderRadius.full,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
});
