import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Theme, getHealthColor, HealthColors } from '@customer/constants/colors';
import { HealthRing } from '@customer/components/vehicle/health-ring';
import { SkeletonBox } from '@customer/components/shared/skeleton';
import { EmptyState } from '@customer/components/shared/empty-state';
import { useFleetDashboard } from '@customer/hooks/fleet/use-fleet-dashboard';
import { useBookingStore } from '@/src/stores/customer/booking';
import type { FleetAlert, FleetActivityItem } from '@customer/types/fleet';

const ALERT_COLORS: Record<string, { bg: string; text: string; icon: keyof typeof Ionicons.glyphMap }> = {
  overdue: { bg: '#FEF2F2', text: HealthColors.critical, icon: 'alert-circle' },
  due_soon: { bg: '#FEFCE8', text: HealthColors.warning, icon: 'time-outline' },
  pending_approval: { bg: '#EFF6FF', text: Theme.colors.primary, icon: 'clipboard-outline' },
};

const ACTIVITY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  service_completed: 'checkmark-circle',
  booking_created: 'calendar-outline',
  approval_requested: 'hand-left-outline',
  inspection_overdue: 'warning-outline',
  vehicle_added: 'car-outline',
};

function AlertCard({ alert }: { alert: FleetAlert }) {
  const palette = ALERT_COLORS[alert.level] ?? ALERT_COLORS.due_soon;
  return (
    <View style={[alertStyles.card, { backgroundColor: palette.bg, borderColor: palette.text + '20' }]}>
      <View style={[alertStyles.iconWrap, { backgroundColor: palette.text + '15' }]}>
        <Ionicons name={palette.icon} size={20} color={palette.text} />
      </View>
      <View style={alertStyles.text}>
        <Text style={[alertStyles.title, { color: palette.text }]}>{alert.title}</Text>
        <Text style={alertStyles.subtitle}>{alert.subtitle}</Text>
      </View>
      <View style={[alertStyles.countBadge, { backgroundColor: palette.text }]}>
        <Text style={alertStyles.countText}>{alert.count}</Text>
      </View>
    </View>
  );
}

function ActivityRow({ item }: { item: FleetActivityItem }) {
  const icon = ACTIVITY_ICONS[item.type] ?? 'ellipse-outline';
  const age = Date.now() - new Date(item.timestamp).getTime();
  const hours = Math.floor(age / 3600000);
  const timeLabel = hours < 1 ? 'Just now' : hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;

  return (
    <View style={activityStyles.row}>
      <View style={activityStyles.iconWrap}>
        <Ionicons name={icon} size={16} color={Theme.colors.textSecondary} />
      </View>
      <View style={activityStyles.content}>
        <Text style={activityStyles.desc} numberOfLines={1}>{item.description}</Text>
        <Text style={activityStyles.meta}>
          {item.vehicle_name}{item.driver_name ? ` · ${item.driver_name}` : ''}
        </Text>
      </View>
      <Text style={activityStyles.time}>{timeLabel}</Text>
    </View>
  );
}

export function FleetDashboardContent() {
  const router = useRouter();
  const startFreshBooking = useBookingStore((s) => s.startFreshBooking);
  const { data: dashboard, isLoading, isError, refetch } = useFleetDashboard();

  if (isLoading) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <SkeletonBox width="100%" height={200} borderRadius={16} />
        <View style={{ height: 16 }} />
        <SkeletonBox width="100%" height={100} borderRadius={12} />
        <View style={{ height: 12 }} />
        <SkeletonBox width="100%" height={100} borderRadius={12} />
      </ScrollView>
    );
  }

  if (isError || !dashboard) {
    return (
      <View style={styles.emptyWrap}>
        <EmptyState
          title="Couldn't load fleet dashboard"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </View>
    );
  }

  const spendPercent = dashboard.spend.budget_used_percent ?? 0;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.fleetName}>{dashboard.fleet_name}</Text>
          <Text style={styles.vehicleCount}>{dashboard.total_vehicles} vehicles</Text>
        </View>
      </View>

      <View style={[styles.heroCard, Theme.shadow.md]}>
        <HealthRing
          score={dashboard.fleet_health_score}
          variant="hero"
          animated
          label="Fleet Health"
        />
      </View>

      {dashboard.alerts.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Alerts</Text>
          <View style={styles.alertList}>
            {dashboard.alerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </View>
        </>
      )}

      <Text style={styles.sectionTitle}>Spend This Month</Text>
      <View style={[styles.spendCard, Theme.shadow.sm]}>
        <View style={styles.spendHeader}>
          <Text style={styles.spendAmount}>${dashboard.spend.mtd_total.toLocaleString()}</Text>
          {dashboard.spend.budget_limit && (
            <Text style={styles.spendBudget}>
              of ${dashboard.spend.budget_limit.toLocaleString()} budget
            </Text>
          )}
        </View>
        {dashboard.spend.budget_limit && (
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(spendPercent, 100)}%`,
                  backgroundColor: spendPercent > 80 ? HealthColors.critical : spendPercent > 60 ? HealthColors.warning : HealthColors.good,
                },
              ]}
            />
          </View>
        )}
        <Text style={styles.spendYtd}>
          YTD: ${dashboard.spend.ytd_total.toLocaleString()}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.quickRow}>
        <TouchableOpacity
          style={styles.quickCard}
          onPress={() => router.push(startFreshBooking())}
          activeOpacity={0.7}
        >
          <View style={[styles.quickIcon, { backgroundColor: Theme.colors.primary + '18' }]}>
            <Ionicons name="calendar-outline" size={22} color={Theme.colors.primary} />
          </View>
          <Text style={styles.quickLabel}>Book Service</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickCard}
          onPress={() => router.push('/customer/fleet/vehicles')}
          activeOpacity={0.7}
        >
          <View style={[styles.quickIcon, { backgroundColor: Theme.colors.primary + '18' }]}>
            <Ionicons name="car-outline" size={22} color={Theme.colors.primary} />
          </View>
          <Text style={styles.quickLabel}>View Fleet</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickCard}
          onPress={() => router.push('/customer/fleet/drivers')}
          activeOpacity={0.7}
        >
          <View style={[styles.quickIcon, { backgroundColor: Theme.colors.primary + '18' }]}>
            <Ionicons name="people-outline" size={22} color={Theme.colors.primary} />
          </View>
          <Text style={styles.quickLabel}>Drivers</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickCard}
          onPress={() => router.push('/customer/fleet/compliance')}
          activeOpacity={0.7}
        >
          <View style={[styles.quickIcon, { backgroundColor: Theme.colors.primary + '18' }]}>
            <Ionicons name="bar-chart-outline" size={22} color={Theme.colors.primary} />
          </View>
          <Text style={styles.quickLabel}>Reports</Text>
        </TouchableOpacity>
      </View>

      {dashboard.recent_activity.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <View style={[styles.activityCard, Theme.shadow.sm]}>
            {dashboard.recent_activity.map((item, i) => (
              <View key={item.id}>
                <ActivityRow item={item} />
                {i < dashboard.recent_activity.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>
        </>
      )}

      <View style={styles.demoBadgeRow}>
        <View style={styles.demoBadge}>
          <Text style={styles.demoBadgeText}>Fleet Dashboard — Mock Data</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const alertStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    borderWidth: 1,
    gap: Theme.spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: { flex: 1 },
  title: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    marginTop: 1,
  },
  countBadge: {
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

const activityStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Theme.spacing.sm + 2,
    gap: Theme.spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: { flex: 1 },
  desc: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  meta: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    marginTop: 1,
  },
  time: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
  },
});

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  content: {
    padding: Theme.spacing.md,
    paddingBottom: Theme.spacing.xxl,
  },
  emptyWrap: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    justifyContent: 'center',
    padding: Theme.spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.spacing.md,
  },
  fleetName: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  vehicleCount: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  heroCard: {
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    backgroundColor: Theme.colors.surfaceElevated,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.sm,
    marginTop: Theme.spacing.sm,
  },
  alertList: {
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.md,
  },
  spendCard: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    marginBottom: Theme.spacing.md,
  },
  spendHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.sm,
  },
  spendAmount: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: '800',
    color: Theme.colors.text,
  },
  spendBudget: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.colors.borderLight,
    marginBottom: Theme.spacing.sm,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  spendYtd: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
  },
  quickRow: {
    flexDirection: 'row',
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.md,
  },
  quickCard: {
    flex: 1,
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.md,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    ...Theme.shadow.sm,
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.sm,
  },
  quickLabel: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '600',
    color: Theme.colors.text,
    textAlign: 'center',
  },
  activityCard: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.colors.border,
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
