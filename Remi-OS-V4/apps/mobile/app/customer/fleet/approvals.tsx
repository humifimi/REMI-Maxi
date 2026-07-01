import { useCallback, useMemo, useState } from 'react';
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
import { Theme } from '@customer/constants/colors';
import { useFleetManagerGuard } from '@customer/components/fleet/fleet-manager-guard';
import { SkeletonBox } from '@customer/components/shared/skeleton';
import { EmptyState } from '@customer/components/shared/empty-state';
import { useFleetApprovals, useReviewApproval } from '@customer/hooks/fleet/use-fleet-approvals';
import type { FleetApprovalRequest, FleetApprovalRequestType } from '@customer/types/fleet';

type TabKey = 'pending' | 'history';

const TYPE_CONFIG: Record<FleetApprovalRequestType, { label: string; icon: string; color: string }> = {
  driver_request: {
    label: 'Driver Request',
    icon: 'person-outline',
    color: Theme.colors.primary,
  },
  deferred_work: {
    label: 'Deferred Work',
    icon: 'construct-outline',
    color: Theme.colors.warning,
  },
  due_soon_suggestion: {
    label: 'Due-Soon Suggestion',
    icon: 'time-outline',
    color: '#F97316',
  },
};

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  approved: { bg: '#F0FDF4', text: '#22C55E', label: 'Approved' },
  denied: { bg: '#FEF2F2', text: '#EF4444', label: 'Denied' },
  pending: { bg: '#EFF6FF', text: Theme.colors.primary, label: 'Pending' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export default function FleetApprovalsScreen() {
  const allowed = useFleetManagerGuard();
  const router = useRouter();
  const { data: approvals, isLoading, refetch } = useFleetApprovals();
  const reviewMutation = useReviewApproval();
  const [activeTab, setActiveTab] = useState<TabKey>('pending');
  const [denyNoteId, setDenyNoteId] = useState<number | null>(null);
  const [denyNote, setDenyNote] = useState('');

  const { pending, history } = useMemo(() => {
    if (!approvals) return { pending: [], history: [] };
    return {
      pending: approvals.filter((a) => a.status === 'pending'),
      history: approvals.filter((a) => a.status !== 'pending'),
    };
  }, [approvals]);

  const items = activeTab === 'pending' ? pending : history;

  const handleApprove = useCallback((item: FleetApprovalRequest) => {
    Alert.alert(
      'Approve Request',
      `Approve "${item.service_description}" for ${item.vehicle_name}?\n\nThis will navigate to fleet booking pre-filled with this request.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve & Book',
          onPress: async () => {
            await reviewMutation.mutateAsync({
              approvalId: item.id,
              review: { action: 'approve' },
            });
            router.push({
              pathname: '/customer/fleet/book',
              params: {
                vehicleId: String(item.vehicle_id),
                serviceDesc: item.service_description,
              },
            });
          },
        },
      ],
    );
  }, [reviewMutation, router]);

  const handleDeny = useCallback((item: FleetApprovalRequest) => {
    if (denyNoteId === item.id) {
      reviewMutation.mutate(
        {
          approvalId: item.id,
          review: { action: 'deny', review_note: denyNote || undefined },
        },
        {
          onSuccess: () => {
            setDenyNoteId(null);
            setDenyNote('');
          },
        },
      );
    } else {
      setDenyNoteId(item.id);
      setDenyNote('');
    }
  }, [denyNoteId, denyNote, reviewMutation]);

  const handleApproveAll = useCallback(() => {
    if (pending.length === 0) return;
    const sameType = pending.every((p) => p.request_type === pending[0].request_type);
    const typeLabel = sameType ? TYPE_CONFIG[pending[0].request_type].label : 'all pending';

    Alert.alert(
      'Approve All',
      `Approve ${pending.length} ${typeLabel} items?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve All',
          onPress: async () => {
            for (const item of pending) {
              await reviewMutation.mutateAsync({
                approvalId: item.id,
                review: { action: 'approve' },
              });
            }
            Alert.alert('Done', `${pending.length} items approved.`);
          },
        },
      ],
    );
  }, [pending, reviewMutation]);

  const cancelDeny = useCallback(() => {
    setDenyNoteId(null);
    setDenyNote('');
  }, []);

  if (!allowed) return null;

  const renderApprovalCard = (item: FleetApprovalRequest) => {
    const typeConf = TYPE_CONFIG[item.request_type] ?? TYPE_CONFIG.driver_request;
    const statusConf = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending;
    const isPending = item.status === 'pending';
    const isDenyingThis = denyNoteId === item.id;

    return (
      <View key={item.id} style={[cardStyles.card, Theme.shadow.sm]}>
        <View style={cardStyles.header}>
          <View style={[cardStyles.typeBadge, { backgroundColor: typeConf.color + '15' }]}>
            <Ionicons name={typeConf.icon as any} size={14} color={typeConf.color} />
            <Text style={[cardStyles.typeBadgeText, { color: typeConf.color }]}>
              {typeConf.label}
            </Text>
          </View>
          <View style={[cardStyles.statusBadge, { backgroundColor: statusConf.bg }]}>
            <Text style={[cardStyles.statusBadgeText, { color: statusConf.text }]}>
              {statusConf.label}
            </Text>
          </View>
        </View>

        <View style={cardStyles.vehicleRow}>
          <Ionicons name="bus-outline" size={18} color={Theme.colors.textSecondary} />
          <Text style={cardStyles.vehicleName}>{item.vehicle_name}</Text>
        </View>

        {item.driver_name && (
          <View style={cardStyles.driverRow}>
            <Ionicons name="person-outline" size={16} color={Theme.colors.textTertiary} />
            <Text style={cardStyles.driverName}>{item.driver_name}</Text>
          </View>
        )}

        <Text style={cardStyles.serviceDesc}>{item.service_description}</Text>

        <View style={cardStyles.metaRow}>
          <Text style={cardStyles.cost}>{formatCurrency(item.estimated_cost)}</Text>
          <Text style={cardStyles.date}>{formatDate(item.requested_at)}</Text>
        </View>

        {item.review_note && (
          <View style={cardStyles.noteRow}>
            <Ionicons name="chatbubble-outline" size={14} color={Theme.colors.textTertiary} />
            <Text style={cardStyles.noteText}>{item.review_note}</Text>
          </View>
        )}

        {isPending && (
          <View style={cardStyles.actionRow}>
            <TouchableOpacity
              style={cardStyles.approveBtn}
              onPress={() => handleApprove(item)}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark" size={18} color={Theme.colors.white} />
              <Text style={cardStyles.approveBtnText}>Approve & Book</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[cardStyles.denyBtn, isDenyingThis && cardStyles.denyBtnActive]}
              onPress={() => handleDeny(item)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isDenyingThis ? 'send' : 'close'}
                size={18}
                color={isDenyingThis ? Theme.colors.white : Theme.colors.error}
              />
              <Text style={[cardStyles.denyBtnText, isDenyingThis && cardStyles.denyBtnTextActive]}>
                {isDenyingThis ? 'Submit' : 'Deny'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {isDenyingThis && (
          <View style={cardStyles.denyNoteWrap}>
            <TextInput
              style={cardStyles.denyInput}
              placeholder="Reason for denial (optional)"
              placeholderTextColor={Theme.colors.textTertiary}
              value={denyNote}
              onChangeText={setDenyNote}
              multiline
              returnKeyType="done"
              blurOnSubmit
            />
            <TouchableOpacity style={cardStyles.cancelDeny} onPress={cancelDeny}>
              <Text style={cardStyles.cancelDenyText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.skeletonWrap}>
          {[0, 1, 2].map((i) => (
            <SkeletonBox key={i} width="100%" height={140} borderRadius={16} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'pending' && styles.tabActive]}
          onPress={() => setActiveTab('pending')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>
            Pending ({pending.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
            History ({history.length})
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'pending' && pending.length > 1 && (
        <TouchableOpacity style={styles.approveAllBtn} onPress={handleApproveAll} activeOpacity={0.7}>
          <Ionicons name="checkmark-done-outline" size={18} color={Theme.colors.primary} />
          <Text style={styles.approveAllText}>Approve All ({pending.length})</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => refetch()} />
        }
      >
        {items.length === 0 ? (
          <EmptyState
            title={activeTab === 'pending' ? 'No pending approvals' : 'No approval history'}
            message={
              activeTab === 'pending'
                ? 'Driver requests and deferred work items will appear here.'
                : 'Previously approved or denied items will appear here.'
            }
          />
        ) : (
          items.map(renderApprovalCard)
        )}

        <View style={styles.demoBadgeRow}>
          <View style={styles.demoBadge}>
            <Text style={styles.demoBadgeText}>Approval Queue — Mock Data (BE-24)</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.background },
  skeletonWrap: {
    padding: Theme.spacing.md,
    gap: Theme.spacing.md,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.sm,
    gap: Theme.spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: Theme.colors.primary },
  tabText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
  tabTextActive: { color: Theme.colors.white },
  approveAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.xs,
    marginHorizontal: Theme.spacing.md,
    marginTop: Theme.spacing.sm,
    paddingVertical: 10,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.primary + '08',
  },
  approveAllText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  scrollContent: {
    padding: Theme.spacing.md,
    paddingBottom: Theme.spacing.xxl,
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
  demoBadgeText: { fontSize: 11, fontWeight: '600', color: '#92400E' },
});

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    marginBottom: Theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.spacing.sm,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Theme.borderRadius.full,
  },
  typeBadgeText: { fontSize: 12, fontWeight: '700' },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Theme.borderRadius.full,
  },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    marginBottom: 4,
  },
  vehicleName: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.xs,
    marginBottom: Theme.spacing.sm,
  },
  driverName: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
  },
  serviceDesc: {
    fontSize: Theme.fontSize.md,
    fontWeight: '500',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.spacing.sm,
  },
  cost: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  date: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textTertiary,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Theme.spacing.xs,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.sm,
    padding: Theme.spacing.sm,
    marginBottom: Theme.spacing.sm,
  },
  noteText: {
    flex: 1,
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  actionRow: {
    flexDirection: 'row',
    gap: Theme.spacing.sm,
    marginTop: Theme.spacing.xs,
  },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.xs,
    backgroundColor: Theme.colors.success,
    borderRadius: Theme.borderRadius.md,
    paddingVertical: 12,
    minHeight: 48,
  },
  approveBtnText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
    color: Theme.colors.white,
  },
  denyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.xs,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.error,
    paddingVertical: 12,
    minHeight: 48,
  },
  denyBtnActive: {
    backgroundColor: Theme.colors.error,
    borderColor: Theme.colors.error,
  },
  denyBtnText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
    color: Theme.colors.error,
  },
  denyBtnTextActive: { color: Theme.colors.white },
  denyNoteWrap: {
    marginTop: Theme.spacing.sm,
    gap: Theme.spacing.xs,
  },
  denyInput: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    padding: Theme.spacing.sm,
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  cancelDeny: {
    alignSelf: 'flex-end',
    paddingVertical: Theme.spacing.xs,
    paddingHorizontal: Theme.spacing.sm,
  },
  cancelDenyText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
});
