import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Theme, getHealthColor, HealthColors } from '@customer/constants/colors';
import { useFleetManagerGuard } from '@customer/components/fleet/fleet-manager-guard';
import { HealthRing } from '@customer/components/vehicle/health-ring';
import { HealthTrendChart } from '@customer/components/vehicle/health-trend-chart';
import { SkeletonBox } from '@customer/components/shared/skeleton';
import { EmptyState } from '@customer/components/shared/empty-state';
import { useFleetComplianceEnhanced } from '@customer/hooks/vehicles/use-fleet';
import type {
  ComplianceTimePeriod,
  FleetComplianceVehicle,
  FleetDriverCompliance,
} from '@customer/types/fleet';

const TIME_PERIODS: { key: ComplianceTimePeriod; label: string }[] = [
  { key: 30, label: '30 Days' },
  { key: 60, label: '60 Days' },
  { key: 90, label: '90 Days' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ── Metric Card ── */
function MetricCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={[metricStyles.card, Theme.shadow.sm]}>
      <View style={[metricStyles.iconWrap, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={[metricStyles.value, { color }]}>{value}</Text>
      <Text style={metricStyles.label}>{label}</Text>
    </View>
  );
}

/* ── Compliance Vehicle Row (overdue / due-soon) ── */
function ComplianceVehicleRow({
  vehicle,
  onPress,
}: {
  vehicle: FleetComplianceVehicle;
  onPress: () => void;
}) {
  const healthColor = getHealthColor(vehicle.health_score);
  const isOverdue = vehicle.inspection_status === 'overdue' || vehicle.inspection_status === 'never';

  return (
    <TouchableOpacity
      style={[rowStyles.container, { borderLeftColor: isOverdue ? HealthColors.critical : HealthColors.warning }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={rowStyles.header}>
        <View style={{ flex: 1 }}>
          <Text style={rowStyles.name} numberOfLines={1}>{vehicle.vehicle_name}</Text>
          {vehicle.license_plate && <Text style={rowStyles.plate}>{vehicle.license_plate}</Text>}
        </View>
        <View style={[rowStyles.scorePill, { backgroundColor: healthColor + '15' }]}>
          <Text style={[rowStyles.scoreText, { color: healthColor }]}>{vehicle.health_score}</Text>
        </View>
      </View>

      <View style={rowStyles.details}>
        {vehicle.assigned_driver ? (
          <View style={rowStyles.detailItem}>
            <Ionicons name="person-outline" size={14} color={Theme.colors.textSecondary} />
            <Text style={rowStyles.detailText}>{vehicle.assigned_driver}</Text>
          </View>
        ) : (
          <View style={rowStyles.detailItem}>
            <Ionicons name="person-outline" size={14} color={Theme.colors.textTertiary} />
            <Text style={[rowStyles.detailText, { color: Theme.colors.textTertiary }]}>Unassigned</Text>
          </View>
        )}
        {vehicle.days_overdue > 0 && (
          <View style={rowStyles.detailItem}>
            <Ionicons name="alert-circle" size={14} color={HealthColors.critical} />
            <Text style={[rowStyles.detailText, { color: HealthColors.critical, fontWeight: '600' }]}>
              {vehicle.days_overdue}d overdue
            </Text>
          </View>
        )}
        {vehicle.outstanding_service_items > 0 && (
          <View style={rowStyles.detailItem}>
            <Ionicons name="construct-outline" size={14} color={HealthColors.warning} />
            <Text style={[rowStyles.detailText, { color: HealthColors.warning }]}>
              {vehicle.outstanding_service_items} items
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

/* ── Driver Leaderboard Row ── */
function DriverLeaderboardRow({
  driver,
  rank,
}: {
  driver: FleetDriverCompliance;
  rank: number;
}) {
  const complianceColor = driver.compliance_rate >= 80
    ? HealthColors.good
    : driver.compliance_rate >= 50
      ? HealthColors.warning
      : HealthColors.critical;

  return (
    <View style={leaderStyles.row}>
      <View style={[leaderStyles.rankBadge, { backgroundColor: rank <= 3 ? Theme.colors.primary + '12' : Theme.colors.surface }]}>
        <Text style={[leaderStyles.rankText, rank <= 3 && { color: Theme.colors.primary }]}>{rank}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={leaderStyles.name}>{driver.driver_name}</Text>
        <Text style={leaderStyles.meta}>
          {driver.inspections_on_time}/{driver.inspections_total} on time
          {driver.last_inspection_date ? ` · Last: ${formatDate(driver.last_inspection_date)}` : ''}
        </Text>
      </View>
      <View style={[leaderStyles.rateBadge, { backgroundColor: complianceColor + '15' }]}>
        <Text style={[leaderStyles.rateText, { color: complianceColor }]}>
          {driver.compliance_rate}%
        </Text>
      </View>
    </View>
  );
}

/* ── Main Screen ── */
export default function FleetComplianceScreen() {
  const allowed = useFleetManagerGuard();
  const router = useRouter();
  const [period, setPeriod] = useState<ComplianceTimePeriod>(30);
  const { data: compliance, isLoading, isError, refetch } = useFleetComplianceEnhanced(period);

  const handleVehiclePress = useCallback((vehicleId: number) => {
    router.push(`/customer/fleet/vehicles/${vehicleId}`);
  }, [router]);

  const handleExport = useCallback(() => {
    // TODO: Call compliance report export endpoint when backend BE-23 is ready
    Alert.alert('Export Report', 'Compliance report export coming soon — requires backend integration.');
  }, []);

  const handleBulkReminder = useCallback(() => {
    // TODO: Call bulk reminder endpoint when backend BE-23 is ready
    const overdueCount = compliance?.overdue_vehicles.length ?? 0;
    Alert.alert(
      'Send Reminders',
      `Send inspection reminders to ${overdueCount} driver(s) with overdue vehicles? (Mock — backend not connected)`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', onPress: () => Alert.alert('Sent', 'Reminders sent. (Mock)') },
      ],
    );
  }, [compliance]);

  if (!allowed) return null;

  if (isLoading) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <SkeletonBox width="100%" height={120} borderRadius={16} />
        <View style={{ height: 16 }} />
        <SkeletonBox width="100%" height={80} borderRadius={12} />
        <View style={{ height: 16 }} />
        <SkeletonBox width="100%" height={200} borderRadius={12} />
      </ScrollView>
    );
  }

  if (isError || !compliance) {
    return (
      <View style={styles.emptyWrap}>
        <EmptyState
          title="Couldn't load compliance data"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </View>
    );
  }

  const complianceColor = getHealthColor(compliance.fleet_compliance_score);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Time Period Filter */}
      <View style={styles.filterRow}>
        {TIME_PERIODS.map((tp) => (
          <TouchableOpacity
            key={tp.key}
            style={[styles.filterChip, period === tp.key && styles.filterChipActive]}
            onPress={() => setPeriod(tp.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, period === tp.key && styles.filterChipTextActive]}>
              {tp.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Compliance Score Hero */}
      <View style={[styles.heroCard, Theme.shadow.md]}>
        <HealthRing
          score={compliance.fleet_compliance_score}
          variant="hero"
          animated
          label="Fleet Compliance"
          subtitle={`${compliance.total_vehicles} vehicles · ${compliance.completion_rate}% inspected`}
        />
      </View>

      {/* Metric cards grid */}
      <View style={styles.metricsGrid}>
        <MetricCard
          label="Inspected"
          value={`${compliance.inspected_count}/${compliance.total_vehicles}`}
          color={HealthColors.good}
          icon="checkmark-circle-outline"
        />
        <MetricCard
          label="Overdue"
          value={compliance.overdue_count}
          color={compliance.overdue_count > 0 ? HealthColors.critical : HealthColors.good}
          icon="alert-circle-outline"
        />
        <MetricCard
          label="Due Soon"
          value={compliance.due_soon_count}
          color={compliance.due_soon_count > 0 ? HealthColors.warning : HealthColors.good}
          icon="time-outline"
        />
        <MetricCard
          label="Service Items"
          value={compliance.outstanding_service_items}
          color={compliance.outstanding_service_items > 0 ? HealthColors.warning : HealthColors.good}
          icon="construct-outline"
        />
      </View>

      {/* Inspection Completion Trend */}
      {compliance.trend.length >= 2 && (
        <>
          <Text style={styles.sectionLabel}>INSPECTION COMPLETION TREND</Text>
          <View style={[styles.card, Theme.shadow.sm]}>
            <HealthTrendChart data={compliance.trend} />
          </View>
        </>
      )}

      {/* Overdue Vehicles */}
      {compliance.overdue_vehicles.length > 0 && (
        <>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionLabel, { color: HealthColors.critical }]}>
              OVERDUE VEHICLES ({compliance.overdue_vehicles.length})
            </Text>
            {compliance.overdue_vehicles.length > 0 && (
              <TouchableOpacity onPress={handleBulkReminder} activeOpacity={0.7}>
                <View style={styles.reminderBtn}>
                  <Ionicons name="notifications-outline" size={14} color={Theme.colors.primary} />
                  <Text style={styles.reminderBtnText}>Send Reminders</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.vehicleList}>
            {compliance.overdue_vehicles
              .sort((a, b) => b.days_overdue - a.days_overdue)
              .map((v) => (
                <ComplianceVehicleRow
                  key={v.vehicle_id}
                  vehicle={v}
                  onPress={() => handleVehiclePress(v.vehicle_id)}
                />
              ))}
          </View>
        </>
      )}

      {/* Due Soon Vehicles */}
      {compliance.due_soon_vehicles.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: HealthColors.warning }]}>
            DUE SOON ({compliance.due_soon_vehicles.length})
          </Text>
          <View style={styles.vehicleList}>
            {compliance.due_soon_vehicles.map((v) => (
              <ComplianceVehicleRow
                key={v.vehicle_id}
                vehicle={v}
                onPress={() => handleVehiclePress(v.vehicle_id)}
              />
            ))}
          </View>
        </>
      )}

      {/* Driver Compliance Leaderboard */}
      {compliance.driver_leaderboard.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>DRIVER COMPLIANCE LEADERBOARD</Text>
          <View style={[styles.card, Theme.shadow.sm]}>
            {compliance.driver_leaderboard.map((driver, i) => (
              <View key={driver.driver_id}>
                <DriverLeaderboardRow driver={driver} rank={i + 1} />
                {i < compliance.driver_leaderboard.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>
        </>
      )}

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.exportBtn} onPress={handleExport} activeOpacity={0.7}>
          <Ionicons name="download-outline" size={18} color={Theme.colors.primary} />
          <Text style={styles.exportBtnText}>Export Compliance Report</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.demoBadgeRow}>
        <View style={styles.demoBadge}>
          <Text style={styles.demoBadgeText}>Fleet Compliance — Mock Data</Text>
        </View>
      </View>
    </ScrollView>
  );
}

/* ── Metric Styles ── */
const metricStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    minWidth: 140,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Theme.spacing.xs,
  },
  value: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '800',
  },
  label: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
});

/* ── Vehicle Row Styles ── */
const rowStyles = StyleSheet.create({
  container: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    borderLeftWidth: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.spacing.sm,
  },
  name: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  plate: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    fontFamily: 'Courier',
    marginTop: 2,
  },
  scorePill: {
    borderRadius: Theme.borderRadius.full,
    paddingHorizontal: Theme.spacing.sm + 2,
    paddingVertical: Theme.spacing.xs,
    minWidth: 44,
    alignItems: 'center',
  },
  scoreText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '800',
  },
  details: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Theme.spacing.md,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.xs + 2,
  },
  detailText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
  },
});

/* ── Leaderboard Styles ── */
const leaderStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Theme.spacing.sm + 2,
    gap: Theme.spacing.sm,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '800',
    color: Theme.colors.textSecondary,
  },
  name: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  meta: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    marginTop: 1,
  },
  rateBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Theme.borderRadius.full,
  },
  rateText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '800',
  },
});

/* ── Main Styles ── */
const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  content: {
    padding: Theme.spacing.md,
    paddingBottom: Theme.spacing.xxl + Theme.spacing.xl,
  },
  emptyWrap: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    justifyContent: 'center',
    padding: Theme.spacing.lg,
  },
  filterRow: {
    flexDirection: 'row',
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.md,
  },
  filterChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  filterChipText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
  filterChipTextActive: {
    color: Theme.colors.white,
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
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.md,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Theme.colors.textTertiary,
    letterSpacing: 1.2,
    marginTop: Theme.spacing.lg,
    marginBottom: Theme.spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reminderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Theme.borderRadius.full,
    backgroundColor: Theme.colors.primary + '12',
  },
  reminderBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
  },
  vehicleList: {
    gap: Theme.spacing.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.colors.border,
  },
  actionRow: {
    marginTop: Theme.spacing.lg,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.sm,
    paddingVertical: 14,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.primary,
  },
  exportBtnText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
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
  demoBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400E',
  },
});
