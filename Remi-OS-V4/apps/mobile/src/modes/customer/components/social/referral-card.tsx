import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { IconSymbol } from '../../../../../../../packages/ui/src/icon-symbol';
import { Theme } from '@customer/constants/colors';
import type { Notification } from '@customer/types/api';

interface ReferralCardProps {
  notification: Notification;
  onDismiss?: () => void;
}

export function ReferralCard({ notification, onDismiss }: ReferralCardProps) {
  const { metadata } = notification;
  const category = metadata?.referral_category ?? 'Service Referral';
  const partnerName = metadata?.partner_name;
  const partnerPhone = metadata?.partner_phone;
  const nextSteps = metadata?.next_steps;

  function handleCall() {
    if (partnerPhone) {
      Linking.openURL(`tel:${partnerPhone}`);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <IconSymbol name="exclamationmark.triangle.fill" size={18} color={Theme.colors.warning} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.category}>{category}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {notification.message}
          </Text>
        </View>
        {onDismiss ? (
          <TouchableOpacity
            onPress={onDismiss}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <IconSymbol name="xmark" size={16} color={Theme.colors.textTertiary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {partnerName ? (
        <View style={styles.partnerRow}>
          <IconSymbol name="building.2.fill" size={14} color={Theme.colors.textSecondary} />
          <Text style={styles.partnerName}>{partnerName}</Text>
        </View>
      ) : null}

      {nextSteps ? (
        <Text style={styles.nextSteps}>{nextSteps}</Text>
      ) : null}

      {partnerPhone ? (
        <TouchableOpacity style={styles.ctaButton} onPress={handleCall} activeOpacity={0.7}>
          <IconSymbol name="phone.fill" size={14} color={Theme.colors.white} />
          <Text style={styles.ctaText}>Call {partnerName ?? 'Partner'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.warning + '40',
    borderLeftWidth: 3,
    borderLeftColor: Theme.colors.warning,
    ...Theme.shadow.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Theme.spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.colors.warning + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  headerText: {
    flex: 1,
  },
  category: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '700',
    color: Theme.colors.warning,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  title: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '500',
    color: Theme.colors.text,
    lineHeight: 20,
  },
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.xs,
    marginTop: Theme.spacing.sm,
    paddingLeft: 40,
  },
  partnerName: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  nextSteps: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    lineHeight: 18,
    marginTop: Theme.spacing.xs,
    paddingLeft: 40,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.xs,
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.md,
    paddingVertical: Theme.spacing.sm + 2,
    marginTop: Theme.spacing.sm,
  },
  ctaText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.white,
  },
});
