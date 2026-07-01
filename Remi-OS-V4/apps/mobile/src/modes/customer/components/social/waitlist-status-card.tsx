import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';
import type { WaitlistEntry } from '@customer/types/api';

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatTime(time: string): string {
  const [h, min] = time.split(':').map(Number);
  if (h == null) return time;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${pad(min ?? 0)} ${ampm}`;
}

function formatWait(minutes: number | null): string {
  if (minutes == null) return 'Estimating...';
  if (minutes < 60) return `~${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `~${hours}h ${rem}m` : `~${hours}h`;
}

export function WaitlistStatusCard({
  entry,
  onClaim,
  onCancel,
  claimLoading,
}: {
  entry: WaitlistEntry;
  onClaim: (entry: WaitlistEntry) => void;
  onCancel: (entry: WaitlistEntry) => void;
  claimLoading?: boolean;
}) {
  const isOffered = entry.status === 'offered';

  return (
    <View style={[styles.card, isOffered && styles.cardOffered]}>
      <View style={styles.header}>
        <View style={[styles.iconCircle, isOffered && styles.iconCircleOffered]}>
          <Ionicons
            name={isOffered ? 'flash' : 'time-outline'}
            size={20}
            color={isOffered ? Theme.colors.success : Theme.colors.primary}
          />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>
            {isOffered ? 'Slot available!' : 'On the Flex List'}
          </Text>
          <Text style={styles.subtitle}>
            {isOffered
              ? 'A slot opened up — claim it before it expires'
              : `Position #${entry.position} · ${formatWait(entry.estimated_wait_minutes)}`}
          </Text>
        </View>
      </View>

      {isOffered && entry.offered_slot_date && entry.offered_slot_time ? (
        <View style={styles.offeredSlot}>
          <View style={styles.offeredSlotInfo}>
            <Text style={styles.offeredDate}>{formatDate(entry.offered_slot_date)}</Text>
            <Text style={styles.offeredTime}>{formatTime(entry.offered_slot_time)}</Text>
          </View>
          {entry.offered_expires_at ? (
            <ExpiryCountdown expiresAt={entry.offered_expires_at} />
          ) : null}
        </View>
      ) : null}

      <View style={styles.meta}>
        <Text style={styles.metaText}>Requested for {formatDate(entry.preferred_date)}</Text>
      </View>

      <View style={styles.actions}>
        {isOffered ? (
          <TouchableOpacity
            style={styles.claimBtn}
            onPress={() => onClaim(entry)}
            disabled={claimLoading}
            activeOpacity={0.85}
          >
            {claimLoading ? (
              <ActivityIndicator size="small" color={Theme.colors.white} />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color={Theme.colors.white} />
                <Text style={styles.claimBtnText}>Claim Slot</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={isOffered ? styles.cancelBtnSmall : styles.cancelBtn}
          onPress={() => onCancel(entry)}
          activeOpacity={0.85}
        >
          <Text style={isOffered ? styles.cancelBtnSmallText : styles.cancelBtnText}>
            {isOffered ? 'Pass' : 'Leave waitlist'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const expiryDate = new Date(expiresAt);
  const now = new Date();
  const diffMs = expiryDate.getTime() - now.getTime();
  const diffMin = Math.max(0, Math.ceil(diffMs / 60_000));

  return (
    <View style={styles.expiryBadge}>
      <Ionicons name="timer-outline" size={14} color={diffMin <= 5 ? Theme.colors.error : Theme.colors.warning} />
      <Text
        style={[
          styles.expiryText,
          diffMin <= 5 && { color: Theme.colors.error },
        ]}
      >
        {diffMin > 0 ? `${diffMin}m left` : 'Expiring'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 2,
    borderColor: Theme.colors.primary + '33',
    borderLeftWidth: 4,
    borderLeftColor: Theme.colors.primary,
    ...Theme.shadow.sm,
  },
  cardOffered: {
    borderColor: Theme.colors.success + '44',
    borderLeftColor: Theme.colors.success,
    backgroundColor: Theme.colors.success + '06',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.sm,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleOffered: {
    backgroundColor: Theme.colors.success + '18',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  subtitle: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  offeredSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Theme.colors.success + '0C',
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.sm,
    marginBottom: Theme.spacing.sm,
    borderWidth: 1,
    borderColor: Theme.colors.success + '22',
  },
  offeredSlotInfo: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Theme.spacing.sm,
  },
  offeredDate: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  offeredTime: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '800',
    color: Theme.colors.success,
  },
  expiryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expiryText: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '600',
    color: Theme.colors.warning,
  },
  meta: {
    marginBottom: Theme.spacing.sm,
  },
  metaText: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
  },
  actions: {
    flexDirection: 'row',
    gap: Theme.spacing.sm,
  },
  claimBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.xs,
    backgroundColor: Theme.colors.success,
    borderRadius: Theme.borderRadius.md,
    paddingVertical: Theme.spacing.sm,
    minHeight: 44,
  },
  claimBtnText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
  },
  cancelBtnSmall: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    minHeight: 44,
  },
  cancelBtnSmallText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    minHeight: 44,
  },
  cancelBtnText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
});
