import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';
import { useOnboardingStore, type OnboardingStepId } from '@/src/stores/customer/onboarding';

export default function OnboardingCompleteScreen() {
  const router = useRouter();
  const completeStep = useOnboardingStore((s) => s.completeStep);
  const completionPercent = useOnboardingStore((s) => s.completionPercent);

  const handleSkip = () => {
    router.replace('/customer');
  };

  const handleGoToDashboard = async () => {
    await completeStep('dashboard' satisfies OnboardingStepId);
    router.replace('/customer');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.headerRow}>
        <View style={styles.headerSpacer} />
        <TouchableOpacity onPress={handleSkip} hitSlop={12}>
          <Text style={styles.skip}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <View style={styles.celebrateOuter}>
          <View style={styles.celebrateInner}>
            <Ionicons name="checkmark" size={48} color={Theme.colors.white} />
          </View>
        </View>

        <Text style={styles.title}>You&apos;re all set!</Text>
        <Text style={styles.subtitle}>
          Your garage, preferences, and notifications are ready. Book your first service whenever
          you like.
        </Text>

        <View style={styles.percentCard}>
          <Text style={styles.percentLabel}>Onboarding progress</Text>
          <Text style={styles.percentValue}>{completionPercent}%</Text>
          <View style={styles.percentTrack}>
            <View style={[styles.percentFill, { width: `${completionPercent}%` }]} />
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleGoToDashboard} activeOpacity={0.9}>
          <Text style={styles.primaryLabel}>Go to Dashboard</Text>
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
  body: {
    flex: 1,
    paddingHorizontal: Theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  celebrateOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.xl,
    ...Theme.shadow.md,
  },
  celebrateInner: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Theme.colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: Theme.fontSize.xxxl,
    fontWeight: '700',
    color: Theme.colors.text,
    textAlign: 'center',
    marginBottom: Theme.spacing.md,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: Theme.fontSize.md,
    lineHeight: 24,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: Theme.spacing.xl,
    maxWidth: 340,
  },
  percentCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  percentLabel: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
    marginBottom: Theme.spacing.sm,
  },
  percentValue: {
    fontSize: Theme.fontSize.xxxl,
    fontWeight: '700',
    color: Theme.colors.primary,
    marginBottom: Theme.spacing.md,
  },
  percentTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.colors.border,
    overflow: 'hidden',
  },
  percentFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.colors.primary,
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
  primaryLabel: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.lg,
    fontWeight: '600',
  },
});
