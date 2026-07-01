import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';
import { Brand } from '@customer/constants/brand';
import { useOnboardingStore, type OnboardingStepId } from '@/src/stores/customer/onboarding';

const BENEFITS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: 'flash-outline',
    title: 'Book in 60 seconds',
    body: 'Pick your vehicle, service, and time — confirmation without the phone tag.',
  },
  {
    icon: 'pulse-outline',
    title: 'Vehicle health tracking',
    body: 'Activity-style rings and reminders so nothing important slips by.',
  },
  {
    icon: 'diamond-outline',
    title: 'Premium mobile service',
    body: 'Technicians come to you with pro tools and clear updates at every step.',
  },
];

export default function OnboardingWelcomeScreen() {
  const router = useRouter();
  const completeStep = useOnboardingStore((s) => s.completeStep);

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/customer');
    }
  };

  const handleSkip = () => {
    router.replace('/customer');
  };

  const handleGetStarted = async () => {
    await completeStep('welcome' satisfies OnboardingStepId);
    router.push('/customer/identity');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={handleClose} hitSlop={12}>
          <Text style={styles.close}>Close</Text>
        </TouchableOpacity>
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
        <Text style={styles.eyebrow}>Welcome to {Brand.appName}</Text>
        <Text style={styles.headline}>Car care, reimagined</Text>
        <Text style={styles.subtitle}>
          Everything you need to maintain your vehicle — without losing your Saturday.
        </Text>

        <View style={styles.cards}>
          {BENEFITS.map((item) => (
            <View key={item.title} style={styles.card}>
              <View style={styles.cardIconWrap}>
                <Ionicons name={item.icon} size={24} color={Theme.colors.primary} />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardBody}>{item.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleGetStarted} activeOpacity={0.9}>
          <Text style={styles.primaryLabel}>Let&apos;s Get Started</Text>
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
    paddingTop: Theme.spacing.sm,
    paddingBottom: Theme.spacing.sm,
  },
  headerSpacer: {
    flex: 1,
  },
  close: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.primary,
    fontWeight: '600',
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
    paddingBottom: Theme.spacing.md,
  },
  eyebrow: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: Theme.spacing.sm,
  },
  headline: {
    fontSize: Theme.fontSize.xxxl,
    fontWeight: '700',
    color: Theme.colors.text,
    letterSpacing: -0.5,
    marginBottom: Theme.spacing.sm,
  },
  subtitle: {
    fontSize: Theme.fontSize.md,
    lineHeight: 24,
    color: Theme.colors.textSecondary,
    marginBottom: Theme.spacing.xl,
  },
  cards: {
    gap: Theme.spacing.md,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    ...Theme.shadow.sm,
  },
  cardIconWrap: {
    width: 48,
    height: 48,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Theme.spacing.md,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '600',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.xs,
  },
  cardBody: {
    fontSize: Theme.fontSize.sm,
    lineHeight: 20,
    color: Theme.colors.textSecondary,
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
