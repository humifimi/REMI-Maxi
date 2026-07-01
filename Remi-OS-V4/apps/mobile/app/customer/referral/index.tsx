import { useMemo, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Theme, getStatusColor } from '@customer/constants/colors';
import { REFERRAL_STATUS_LABELS, ReferralStatus } from '@customer/types/enums';
import { useMyReferrals } from '@customer/hooks/referrals/use-referrals';
import { EmptyState } from '@customer/components/shared/empty-state';
import { selectionTap } from '@customer/services/haptics';
import type { ReferralListItem } from '@customer/types/referral';

type FilterMode = 'all' | 'active' | 'completed';

const ACTIVE_STATUSES: string[] = [
  ReferralStatus.DETECTED,
  ReferralStatus.OFFERED,
  ReferralStatus.QUOTED,
  ReferralStatus.ACCEPTED,
  ReferralStatus.SCHEDULED,
];

function formatVehicleShort(v: { year: number | null; make: string | null; model: string | null }): string {
  return [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Unknown Vehicle';
}

function getReferralStatusColor(status: string): string {
  switch (status) {
    case ReferralStatus.COMPLETED:
      return '#22C55E';
    case ReferralStatus.SCHEDULED:
    case ReferralStatus.ACCEPTED:
      return '#3B82F6';
    case ReferralStatus.QUOTED:
    case ReferralStatus.OFFERED:
      return '#EAB308';
    case ReferralStatus.DETECTED:
      return '#6B7280';
    default:
      return '#6B7280';
  }
}

export default function ReferralListScreen() {
  const router = useRouter();
  const { data: referrals, isPending, isError, refetch } = useMyReferrals();

  const [filter, setFilter] = useState<FilterMode>('all');

  const filtered = useMemo(() => {
    if (!referrals) return [];
    switch (filter) {
      case 'active':
        return referrals.filter((r) => ACTIVE_STATUSES.includes(r.status));
      case 'completed':
        return referrals.filter((r) => r.status === ReferralStatus.COMPLETED);
      default:
        return referrals;
    }
  }, [referrals, filter]);

  function renderItem({ item }: { item: ReferralListItem }) {
    const statusColor = getReferralStatusColor(item.status);
    return (
      <TouchableOpacity
        style={[styles.itemCard, { borderLeftColor: statusColor }]}
        onPress={() => router.push(`/customer/referral/${item.id}`)}
        activeOpacity={0.85}
      >
        <View style={styles.itemTop}>
          <View style={styles.itemInfo}>
            <Text style={styles.itemVehicle} numberOfLines={1}>
              {formatVehicleShort(item.vehicle)}
            </Text>
            <Text style={styles.itemService} numberOfLines={1}>
              {item.service_need}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {REFERRAL_STATUS_LABELS[item.status] ?? item.status}
            </Text>
          </View>
        </View>
        <View style={styles.itemBottom}>
          {item.selected_partner_name ? (
            <View style={styles.partnerChip}>
              <Ionicons name="business-outline" size={12} color={Theme.colors.textSecondary} />
              <Text style={styles.partnerChipText}>{item.selected_partner_name}</Text>
            </View>
          ) : null}
          <Text style={styles.itemDate}>
            {new Date(item.detected_at).toLocaleDateString()}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Filter pills */}
      <View style={styles.filterRow}>
        {(['all', 'active', 'completed'] as FilterMode[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterPill, filter === f && styles.filterPillActive]}
            onPress={() => {
              selectionTap();
              setFilter(f);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshing={isPending}
        onRefresh={refetch}
        ListEmptyComponent={
          isPending ? null : (
            <EmptyState
              title={isError ? 'Couldn\'t load referrals' : 'No referrals yet'}
              message={
                isError
                  ? 'Pull to refresh or try again later.'
                  : 'When a technician detects something outside our service scope, referrals to trusted partners will appear here.'
              }
              actionLabel={isError ? 'Retry' : undefined}
              onAction={isError ? refetch : undefined}
            />
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
    gap: Theme.spacing.sm,
  },
  filterPill: {
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.xs + 2,
    borderRadius: Theme.borderRadius.full,
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  filterPillActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  filterText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
  filterTextActive: {
    color: Theme.colors.white,
  },
  listContent: {
    paddingHorizontal: Theme.spacing.md,
    paddingBottom: Theme.spacing.xxl,
  },
  itemCard: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderLeftWidth: 3,
    ...Theme.shadow.sm,
  },
  itemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Theme.spacing.sm,
  },
  itemInfo: {
    flex: 1,
  },
  itemVehicle: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  itemService: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.xs,
    paddingHorizontal: Theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: Theme.borderRadius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '600',
  },
  itemBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Theme.spacing.sm,
  },
  partnerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.xs,
  },
  partnerChipText: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    fontWeight: '500',
  },
  itemDate: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
  },
});
