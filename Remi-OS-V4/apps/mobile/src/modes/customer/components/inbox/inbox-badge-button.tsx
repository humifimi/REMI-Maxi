/**
 * P5-CU-2 — Inbox button + badge for the Home-tab header.
 *
 * Extracted from `app/(tabs)/index.tsx` so the badge logic is unit-
 * testable in isolation (the Home tab pulls in ~15 other hooks; mocking
 * them all to assert one badge would be brittle). The badge is a thin
 * presentational component — count comes from
 * `usePendingReorganizationCount()` at the call site.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme } from '@customer/constants/colors';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface InboxBadgeButtonProps {
  /** Pending count from `usePendingReorganizationCount()`. 0 hides the badge. */
  count: number;
  onPress: () => void;
  /** Foreground color for the inbox icon. Defaults to `Theme.colors.text`. */
  iconColor?: string;
  /** Background color for the count badge pill. Defaults to `Theme.colors.primary`. */
  badgeColor?: string;
}

export function InboxBadgeButton({
  count,
  onPress,
  iconColor = Theme.colors.text,
  badgeColor = Theme.colors.primary,
}: InboxBadgeButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.button}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={
        count > 0
          ? `${count} pending changes to review`
          : 'Approval inbox'
      }
      testID="home-inbox-button"
    >
      <IconSymbol name="tray.fill" size={22} color={iconColor} />
      {count > 0 ? (
        <View
          style={[styles.badge, { backgroundColor: badgeColor }]}
          testID="home-inbox-badge"
        >
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Theme.colors.background,
  },
  badgeText: {
    color: Theme.colors.white,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
});
