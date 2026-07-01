import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, Switch, TouchableOpacity, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Theme } from '@customer/constants/colors';
import { Brand } from '@customer/constants/brand';
import { useOnboardingStore, type OnboardingStepId } from '@/src/stores/customer/onboarding';
import { useUpdateNotificationPreferences } from '@customer/hooks/communication/use-notification-preferences';

export default function OnboardingNotificationPrefsScreen() {
  const router = useRouter();
  const completeStep = useOnboardingStore((s) => s.completeStep);
  const updateNotifPrefs = useUpdateNotificationPreferences();
  const [pushOn, setPushOn] = useState(true);
  const [smsOn, setSmsOn] = useState(false);
  const [emailOn, setEmailOn] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const handleSkip = () => {
    router.replace('/customer');
  };

  const handleContinue = async () => {
    setApiError(null);
    try {
      await updateNotifPrefs.mutateAsync({
        push_enabled: pushOn,
        sms_enabled: smsOn,
        email_enabled: emailOn,
      });
      await completeStep('notificationPreferences' satisfies OnboardingStepId);
      router.push('/customer/payment');
    } catch {
      setApiError('Could not save preferences. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.headerRow}>
        <View style={styles.headerSpacer} />
        <TouchableOpacity onPress={handleSkip} hitSlop={12}>
          <Text style={styles.skip}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Stay in the loop</Text>
        <Text style={styles.subtitle}>
          Choose how {Brand.appName} reaches you about appointments, ETAs, and vehicle health.
        </Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Push notifications</Text>
              <Text style={styles.rowDesc}>
                Instant alerts when your tech is on the way or your vehicle status changes.
              </Text>
            </View>
            <Switch
              value={pushOn}
              onValueChange={setPushOn}
              trackColor={{ false: Theme.colors.border, true: Theme.colors.primary }}
              thumbColor={Theme.colors.white}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>SMS updates</Text>
              <Text style={styles.rowDesc}>
                Short text updates for confirmations and day-of reminders.
              </Text>
            </View>
            <Switch
              value={smsOn}
              onValueChange={setSmsOn}
              trackColor={{ false: Theme.colors.border, true: Theme.colors.primary }}
              thumbColor={Theme.colors.white}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Email updates</Text>
              <Text style={styles.rowDesc}>
                Receipts, summaries, and tips to keep your vehicle in top shape.
              </Text>
            </View>
            <Switch
              value={emailOn}
              onValueChange={setEmailOn}
              trackColor={{ false: Theme.colors.border, true: Theme.colors.primary }}
              thumbColor={Theme.colors.white}
            />
          </View>
        </View>

        {apiError ? <Text style={styles.errorText}>{apiError}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, updateNotifPrefs.isPending && styles.primaryButtonDisabled]}
          onPress={handleContinue}
          disabled={updateNotifPrefs.isPending}
          activeOpacity={0.9}
        >
          {updateNotifPrefs.isPending ? (
            <ActivityIndicator color={Theme.colors.white} />
          ) : (
            <Text style={styles.primaryLabel}>Continue</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: Theme.spacing.lg,
    paddingBottom: Theme.spacing.sm,
  },
  headerSpacer: {
    flex: 1,
  },
  skip: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.textSecondary,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Theme.spacing.lg,
    paddingBottom: Theme.spacing.xl,
  },
  title: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.sm,
  },
  subtitle: {
    fontSize: Theme.fontSize.md,
    lineHeight: 22,
    color: Theme.colors.textSecondary,
    marginBottom: Theme.spacing.xl,
  },
  card: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    paddingVertical: Theme.spacing.sm,
    ...Theme.shadow.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.md,
    gap: Theme.spacing.md,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.xs,
  },
  rowDesc: {
    fontSize: Theme.fontSize.sm,
    lineHeight: 20,
    color: Theme.colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: Theme.colors.border,
    marginLeft: Theme.spacing.md,
  },
  footer: {
    paddingHorizontal: Theme.spacing.lg,
    paddingTop: Theme.spacing.md,
    paddingBottom: Theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.border,
    backgroundColor: Theme.colors.background,
  },
  primaryButton: {
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryLabel: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.lg,
    fontWeight: '600',
  },
  errorText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.error,
    marginTop: Theme.spacing.md,
    marginHorizontal: Theme.spacing.md,
  },
});
