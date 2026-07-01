import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Theme, getHealthColor, HealthColors } from '@customer/constants/colors';
import { SkeletonBox } from '@customer/components/shared/skeleton';
import { EmptyState } from '@customer/components/shared/empty-state';
import { useFleetManagerGuard } from '@customer/components/fleet/fleet-manager-guard';
import {
  useFleetInspections,
  useSendInspectionReminder,
} from '@customer/hooks/fleet/use-fleet-inspections';
import type {
  FleetInspectionDetail,
  PendingInspectionVehicle,
} from '@customer/types/fleet';

type Tab = 'recent' | 'pending';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function statusBadgeColor(status: 'passed' | 'flagged' | 'failed'): string {
  switch (status) {
    case 'passed': return HealthColors.good;
    case 'flagged': return HealthColors.warning;
    case 'failed': return HealthColors.critical;
  }
}

/* ── Inspection Row (Recent) ── */
function RecentInspectionRow({
  inspection,
  onPress,
}: {
  inspection: FleetInspectionDetail;
  onPress: () => void;
}) {
  const badgeColor = statusBadgeColor(inspection.status);

  return (
    <TouchableOpacity
      style={[styles.row, { borderLeftColor: badgeColor }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.rowHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {inspection.vehicle_name}
          </Text>
          {inspection.license_plate && (
            <Text style={styles.rowPlate}>{inspection.license_plate}</Text>
          )}
        </View>
        <View style={[styles.statusPill, { backgroundColor: badgeColor + '15' }]}>
          <Text style={[styles.statusText, { color: badgeColor }]}>
            {inspection.status === 'passed' ? 'Passed' : inspection.status === 'flagged' ? 'Flagged' : 'Failed'}
          </Text>
        </View>
      </View>

      <View style={styles.rowMeta}>
        {inspection.driver_name && (
          <View style={styles.metaItem}>
            <Ionicons name="person-outline" size={14} color={Theme.colors.textSecondary} />
            <Text style={styles.metaText}>{inspection.driver_name}</Text>
          </View>
        )}
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={14} color={Theme.colors.textSecondary} />
          <Text style={styles.metaText}>{formatDate(inspection.submitted_at)}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="star-outline" size={14} color={Theme.colors.textSecondary} />
          <Text style={styles.metaText}>Score: {inspection.score}</Text>
        </View>
        {inspection.flagged_items > 0 && (
          <View style={styles.metaItem}>
            <Ionicons name="flag-outline" size={14} color={HealthColors.warning} />
            <Text style={[styles.metaText, { color: HealthColors.warning, fontWeight: '600' }]}>
              {inspection.flagged_items} flagged
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

/* ── Pending Inspection Row ── */
function PendingInspectionRow({
  vehicle,
  onRemind,
}: {
  vehicle: PendingInspectionVehicle;
  onRemind: () => void;
}) {
  const isOverdue = vehicle.days_overdue > 0;

  return (
    <View
      style={[
        styles.row,
        { borderLeftColor: isOverdue ? HealthColors.critical : HealthColors.warning },
      ]}
    >
      <View style={styles.rowHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {vehicle.vehicle_name}
          </Text>
          {vehicle.license_plate && (
            <Text style={styles.rowPlate}>{vehicle.license_plate}</Text>
          )}
        </View>
        {isOverdue && (
          <View style={[styles.statusPill, { backgroundColor: HealthColors.critical + '15' }]}>
            <Text style={[styles.statusText, { color: HealthColors.critical }]}>
              {vehicle.days_overdue}d overdue
            </Text>
          </View>
        )}
      </View>

      <View style={styles.rowMeta}>
        {vehicle.driver_name ? (
          <View style={styles.metaItem}>
            <Ionicons name="person-outline" size={14} color={Theme.colors.textSecondary} />
            <Text style={styles.metaText}>{vehicle.driver_name}</Text>
          </View>
        ) : (
          <View style={styles.metaItem}>
            <Ionicons name="person-outline" size={14} color={Theme.colors.textTertiary} />
            <Text style={[styles.metaText, { color: Theme.colors.textTertiary }]}>No driver assigned</Text>
          </View>
        )}
        <View style={styles.metaItem}>
          <Ionicons name="repeat-outline" size={14} color={Theme.colors.textSecondary} />
          <Text style={styles.metaText}>{vehicle.inspection_frequency}</Text>
        </View>
        {vehicle.last_inspection_date ? (
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={14} color={Theme.colors.textSecondary} />
            <Text style={styles.metaText}>Last: {formatDate(vehicle.last_inspection_date)}</Text>
          </View>
        ) : (
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={14} color={Theme.colors.textTertiary} />
            <Text style={[styles.metaText, { color: Theme.colors.textTertiary }]}>Never inspected</Text>
          </View>
        )}
      </View>

      {vehicle.driver_name && (
        <TouchableOpacity style={styles.remindBtn} onPress={onRemind} activeOpacity={0.7}>
          <Ionicons name="notifications-outline" size={16} color={Theme.colors.primary} />
          <Text style={styles.remindBtnText}>Send Reminder</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/* ── Inspection Detail Modal (inline) ── */
function InspectionDetailView({
  inspection,
  onClose,
  onBookService,
}: {
  inspection: FleetInspectionDetail;
  onClose: () => void;
  onBookService: (item: string) => void;
}) {
  const badgeColor = statusBadgeColor(inspection.status);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backRow} onPress={onClose} activeOpacity={0.7}>
        <Ionicons name="arrow-back" size={22} color={Theme.colors.primary} />
        <Text style={styles.backText}>Back to inspections</Text>
      </TouchableOpacity>

      <View style={[styles.detailHero, Theme.shadow.sm]}>
        <Text style={styles.detailVehicle}>{inspection.vehicle_name}</Text>
        {inspection.driver_name && (
          <Text style={styles.detailDriver}>By {inspection.driver_name}</Text>
        )}
        <Text style={styles.detailDate}>{formatDate(inspection.submitted_at)}</Text>

        <View style={styles.detailScoreRow}>
          <View style={[styles.scoreBadge, { backgroundColor: badgeColor + '15' }]}>
            <Text style={[styles.scoreBadgeText, { color: badgeColor }]}>
              {inspection.score}%
            </Text>
          </View>
          <Text style={[styles.detailStatus, { color: badgeColor }]}>
            {inspection.status.charAt(0).toUpperCase() + inspection.status.slice(1)}
          </Text>
          <Text style={styles.detailItemCount}>
            {inspection.flagged_items}/{inspection.total_items} flagged
          </Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>CHECKLIST ITEMS</Text>
      {inspection.checklist.map((item) => {
        const isFlagged = item.result === 'flag';
        return (
          <View
            key={item.key}
            style={[
              styles.checkItem,
              isFlagged && { borderLeftColor: HealthColors.warning, borderLeftWidth: 3 },
            ]}
          >
            <View style={styles.checkHeader}>
              <Ionicons
                name={isFlagged ? 'flag' : 'checkmark-circle'}
                size={20}
                color={isFlagged ? HealthColors.warning : HealthColors.good}
              />
              <Text style={styles.checkLabel}>{item.label}</Text>
              <Text style={[styles.checkCategory, { color: Theme.colors.textTertiary }]}>
                {item.category}
              </Text>
            </View>
            {item.note && <Text style={styles.checkNote}>{item.note}</Text>}
            {isFlagged && (
              <TouchableOpacity
                style={styles.bookFromFlagBtn}
                onPress={() => onBookService(item.label)}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-outline" size={14} color={Theme.colors.primary} />
                <Text style={styles.bookFromFlagText}>Book Service</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      <View style={styles.demoBadgeRow}>
        <View style={styles.demoBadge}>
          <Text style={styles.demoBadgeText}>Fleet Inspections — Mock Data</Text>
        </View>
      </View>
    </ScrollView>
  );
}

/* ── Main Screen ── */
export default function FleetInspectionsScreen() {
  const allowed = useFleetManagerGuard();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('recent');
  const [selectedInspection, setSelectedInspection] = useState<FleetInspectionDetail | null>(null);
  const { data, isLoading, isError, refetch } = useFleetInspections();
  const sendReminder = useSendInspectionReminder();

  const handleRemind = useCallback(
    (vehicle: PendingInspectionVehicle) => {
      Alert.alert(
        'Send Reminder',
        `Send inspection reminder to ${vehicle.driver_name}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Send',
            onPress: () => {
              sendReminder.mutate(vehicle.vehicle_id, {
                onSuccess: () => Alert.alert('Sent', 'Reminder sent successfully.'),
                onError: () => Alert.alert('Error', 'Could not send reminder. Try again.'),
              });
            },
          },
        ],
      );
    },
    [sendReminder],
  );

  const handleBookFromFlag = useCallback(
    (itemLabel: string) => {
      Alert.alert(
        'Book Service',
        `Schedule service for "${itemLabel}"? This will open the fleet booking flow.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Book', onPress: () => router.push('/customer/fleet/book') },
        ],
      );
    },
    [router],
  );

  if (!allowed) return null;

  if (selectedInspection) {
    return (
      <InspectionDetailView
        inspection={selectedInspection}
        onClose={() => setSelectedInspection(null)}
        onBookService={handleBookFromFlag}
      />
    );
  }

  if (isLoading) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <SkeletonBox width="100%" height={100} borderRadius={12} />
        <View style={{ height: 12 }} />
        <SkeletonBox width="100%" height={100} borderRadius={12} />
        <View style={{ height: 12 }} />
        <SkeletonBox width="100%" height={100} borderRadius={12} />
      </ScrollView>
    );
  }

  if (isError || !data) {
    return (
      <View style={styles.emptyWrap}>
        <EmptyState
          title="Couldn't load inspections"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </View>
    );
  }

  const recentList = data.recent;
  const pendingList = data.pending;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Tab Switch */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'recent' && styles.tabBtnActive]}
          onPress={() => setTab('recent')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, tab === 'recent' && styles.tabTextActive]}>
            Recent ({recentList.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'pending' && styles.tabBtnActive]}
          onPress={() => setTab('pending')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, tab === 'pending' && styles.tabTextActive]}>
            Pending ({pendingList.length})
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'recent' ? (
        recentList.length > 0 ? (
          <View style={styles.list}>
            {recentList.map((insp) => (
              <RecentInspectionRow
                key={insp.id}
                inspection={insp}
                onPress={() => setSelectedInspection(insp)}
              />
            ))}
          </View>
        ) : (
          <EmptyState
            title="No recent inspections"
            message="Inspections will appear here once drivers submit them."
          />
        )
      ) : pendingList.length > 0 ? (
        <View style={styles.list}>
          {pendingList.map((v) => (
            <PendingInspectionRow
              key={v.vehicle_id}
              vehicle={v}
              onRemind={() => handleRemind(v)}
            />
          ))}
        </View>
      ) : (
        <EmptyState
          title="All caught up"
          message="No vehicles have overdue inspections."
        />
      )}

      <View style={styles.demoBadgeRow}>
        <View style={styles.demoBadge}>
          <Text style={styles.demoBadgeText}>Fleet Inspections — Mock Data</Text>
        </View>
      </View>
    </ScrollView>
  );
}

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
  tabRow: {
    flexDirection: 'row',
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.md,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.md,
    padding: 3,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Theme.borderRadius.sm,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: Theme.colors.primary,
    ...Theme.shadow.sm,
  },
  tabText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
  tabTextActive: {
    color: Theme.colors.white,
  },
  list: {
    gap: Theme.spacing.sm,
  },
  row: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    borderLeftWidth: 4,
    ...Theme.shadow.sm,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.spacing.sm,
  },
  rowTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  rowPlate: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    fontFamily: 'Courier',
    marginTop: 2,
  },
  statusPill: {
    borderRadius: Theme.borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '700',
  },
  rowMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Theme.spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
  },
  remindBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: Theme.spacing.sm,
    paddingVertical: 10,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Theme.colors.primary + '10',
  },
  remindBtnText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
  /* Detail view */
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.xs,
    marginBottom: Theme.spacing.md,
  },
  backText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
  detailHero: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    marginBottom: Theme.spacing.md,
  },
  detailVehicle: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  detailDriver: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  detailDate: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    marginTop: 2,
  },
  detailScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    marginTop: Theme.spacing.md,
  },
  scoreBadge: {
    borderRadius: Theme.borderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  scoreBadgeText: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '800',
  },
  detailStatus: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
  },
  detailItemCount: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Theme.colors.textTertiary,
    letterSpacing: 1.2,
    marginTop: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
  },
  checkItem: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    marginBottom: Theme.spacing.sm,
  },
  checkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
  },
  checkLabel: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
    flex: 1,
  },
  checkCategory: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '500',
  },
  checkNote: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginTop: Theme.spacing.xs,
    marginLeft: 32,
    fontStyle: 'italic',
  },
  bookFromFlagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Theme.spacing.sm,
    marginLeft: 32,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Theme.colors.primary + '10',
    alignSelf: 'flex-start',
  },
  bookFromFlagText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
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
