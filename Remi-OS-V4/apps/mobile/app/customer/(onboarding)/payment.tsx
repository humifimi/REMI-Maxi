import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePaymentSheet } from '@stripe/stripe-react-native';
import { Theme } from '@customer/constants/colors';
import { useOnboardingStore, type OnboardingStepId } from '@/src/stores/customer/onboarding';
import { useCreateSetupIntent } from '@customer/hooks/payments/use-payments';

export default function OnboardingPaymentScreen() {
  const router = useRouter();
  const completeStep = useOnboardingStore((s) => s.completeStep);
  const setupIntent = useCreateSetupIntent();
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();
  const [loading, setLoading] = useState(false);

  const handleSkip = () => {
    router.replace('/customer');
  };

  const advance = async () => {
    await completeStep('payment' satisfies OnboardingStepId);
    router.push('/customer/complete');
  };

  const handleAddCard = useCallback(async () => {
    setLoading(true);
    try {
      const result = await setupIntent.mutateAsync();

      const { error: initError } = await initPaymentSheet({
        setupIntentClientSecret: result.setupIntentSecret,
        customerEphemeralKeySecret: result.ephemeralKey,
        merchantDisplayName: 'REMI Service',
        returnURL: 'remicustomer://stripe-redirect',
        allowsDelayedPaymentMethods: false,
      });

      if (initError) {
        Alert.alert('Setup Error', initError.message);
        setLoading(false);
        return;
      }

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code !== 'Canceled') {
          Alert.alert('Error', presentError.message);
        }
        setLoading(false);
        return;
      }

      await advance();
    } catch {
      Alert.alert(
        'Connection Error',
        'Could not connect to payment service. You can add a card later from your profile.',
      );
    } finally {
      setLoading(false);
    }
  }, [setupIntent, initPaymentSheet, presentPaymentSheet]);

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
        <Text style={styles.title}>Payment method</Text>
        <Text style={styles.subtitle}>
          Save a card for seamless checkout after service. Your details stay encrypted.
        </Text>

        <TouchableOpacity
          style={styles.addCard}
          onPress={handleAddCard}
          activeOpacity={0.8}
          disabled={loading}
        >
          <View style={styles.iconCircle}>
            {loading ? (
              <ActivityIndicator size="small" color={Theme.colors.primary} />
            ) : (
              <Ionicons name="card-outline" size={36} color={Theme.colors.primary} />
            )}
          </View>
          <Text style={styles.addCardTitle}>
            {loading ? 'Setting up...' : 'Add payment method'}
          </Text>
          <Text style={styles.addCardHint}>
            Securely save a credit or debit card via Stripe
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipForNow} onPress={advance} activeOpacity={0.8}>
          <Text style={styles.skipForNowText}>Skip for now</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
          onPress={handleAddCard}
          activeOpacity={0.9}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={Theme.colors.white} />
          ) : (
            <Text style={styles.primaryLabel}>Add Card</Text>
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
  addCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Theme.spacing.xxl,
    paddingHorizontal: Theme.spacing.lg,
    borderRadius: Theme.borderRadius.xl,
    borderWidth: 2,
    borderColor: Theme.colors.primary + '40',
    backgroundColor: Theme.colors.primary + '08',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.md,
    ...Theme.shadow.sm,
  },
  addCardTitle: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '600',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.sm,
  },
  addCardHint: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  skipForNow: {
    marginTop: Theme.spacing.lg,
    alignItems: 'center',
    paddingVertical: Theme.spacing.md,
  },
  skipForNowText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.primary,
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
    opacity: 0.7,
  },
  primaryLabel: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.lg,
    fontWeight: '600',
  },
});
