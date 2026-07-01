import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Theme } from '@customer/constants/colors';
import { getSoundEnabled, setSoundEnabled } from '@customer/services/sound';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@customer/hooks/communication/use-notification-preferences';

export default function NotificationSettingsScreen() {
  const { data: prefs, isLoading } = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();

  const [pushOn, setPushOn] = useState(true);
  const [emailOn, setEmailOn] = useState(true);
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    getSoundEnabled().then(setSoundOn);
  }, []);

  useEffect(() => {
    if (prefs) {
      setPushOn(prefs.push_enabled);
      setEmailOn(prefs.email_enabled);
    }
  }, [prefs]);

  const handleToggle = useCallback(
    (field: 'push_enabled' | 'email_enabled', value: boolean) => {
      const next = {
        push_enabled: field === 'push_enabled' ? value : pushOn,
        sms_enabled: prefs?.sms_enabled ?? false,
        email_enabled: field === 'email_enabled' ? value : emailOn,
      };
      if (field === 'push_enabled') setPushOn(value);
      if (field === 'email_enabled') setEmailOn(value);
      updatePrefs.mutate(next);
    },
    [pushOn, emailOn, prefs?.sms_enabled, updatePrefs],
  );

  const handleSoundToggle = useCallback(async (value: boolean) => {
    setSoundOn(value);
    await setSoundEnabled(value);
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Text style={styles.title}>Notifications</Text>
      <Text style={styles.subtitle}>Control how REMI keeps you updated.</Text>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Theme.colors.primary} />
        </View>
      ) : (
        <View style={[styles.card, Theme.shadow.md]}>
          <View style={styles.row}>
            <View style={styles.labelWrap}>
              <Text style={styles.rowLabel}>Appointment updates</Text>
              <Text style={styles.rowHint}>Push notifications for booking status</Text>
            </View>
            <Switch
              value={pushOn}
              onValueChange={(v) => handleToggle('push_enabled', v)}
              trackColor={{ false: Theme.colors.border, true: Theme.colors.primary + '80' }}
              thumbColor={pushOn ? Theme.colors.primary : Theme.colors.surface}
            />
          </View>
          <View style={styles.row}>
            <View style={styles.labelWrap}>
              <Text style={styles.rowLabel}>Email updates</Text>
              <Text style={styles.rowHint}>Receipts, reminders, and promotions</Text>
            </View>
            <Switch
              value={emailOn}
              onValueChange={(v) => handleToggle('email_enabled', v)}
              trackColor={{ false: Theme.colors.border, true: Theme.colors.primary + '80' }}
              thumbColor={emailOn ? Theme.colors.primary : Theme.colors.surface}
            />
          </View>
        </View>
      )}

      <Text style={styles.sectionLabel}>Sounds</Text>
      <View style={[styles.card, Theme.shadow.md]}>
        <View style={styles.row}>
          <View style={styles.labelWrap}>
            <Text style={styles.rowLabel}>Sound effects</Text>
            <Text style={styles.rowHint}>Confirmation chimes and notifications</Text>
          </View>
          <Switch
            value={soundOn}
            onValueChange={handleSoundToggle}
            trackColor={{ false: Theme.colors.border, true: Theme.colors.primary + '80' }}
            thumbColor={soundOn ? Theme.colors.primary : Theme.colors.surface}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    paddingHorizontal: Theme.spacing.md,
  },
  title: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.sm,
  },
  subtitle: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: Theme.spacing.lg,
  },
  loadingWrap: {
    paddingVertical: Theme.spacing.xl,
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '600',
    color: Theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: Theme.spacing.lg,
    marginBottom: Theme.spacing.sm,
  },
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    paddingVertical: Theme.spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.colors.border,
  },
  labelWrap: {
    flex: 1,
    marginRight: Theme.spacing.md,
  },
  rowLabel: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
  },
  rowHint: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    marginTop: 2,
  },
});
