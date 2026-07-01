import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';
import { useOnboardingStore, type OnboardingStepId } from '@/src/stores/customer/onboarding';
import { useVehicles } from '@customer/hooks/vehicles/use-vehicles';
import { GarageListSkeleton } from '@customer/components/shared/skeleton';
import { formatVehicleDisplayTitle } from '@customer/utils/vehicle-display';

export default function OnboardingGarageConfirmScreen() {
  const router = useRouter();
  const completeStep = useOnboardingStore((s) => s.completeStep);
  const { data: vehicles, isLoading } = useVehicles();

  const handleSkip = () => {
    router.replace('/customer');
  };

  const handleContinue = async () => {
    await completeStep('garageConfirmation' satisfies OnboardingStepId);
    router.push('/customer/schedule-prefs');
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
        <Text style={styles.title}>
          {vehicles && vehicles.length > 0 ? 'Your garage' : 'No vehicles yet'}
        </Text>
        <Text style={styles.subtitle}>
          {vehicles && vehicles.length > 0
            ? 'Confirm this looks right. You can edit details anytime in your garage.'
            : 'Go back to add a vehicle, or skip and add one later from your garage.'}
        </Text>

        {isLoading ? (
          <GarageListSkeleton />
        ) : (
          (vehicles ?? []).map((v) => (
            <View key={v.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.avatar}>
                  <Ionicons name="car-sport-outline" size={32} color={Theme.colors.primary} />
                </View>
                <View style={styles.cardHeaderText}>
                  <Text style={styles.vehicleTitle}>{formatVehicleDisplayTitle(v)}</Text>
                  {v.engine ? <Text style={styles.vehicleTrim}>{v.engine}</Text> : null}
                </View>
              </View>
              <View style={styles.divider} />
              {v.license_plate ? (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Plate</Text>
                  <Text style={styles.rowValue}>
                    {v.license_plate.toUpperCase()}
                    {v.license_plate_state ? ` · ${v.license_plate_state}` : ''}
                  </Text>
                </View>
              ) : null}
              {v.color ? (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Color</Text>
                  <Text style={styles.rowValue}>{v.color}</Text>
                </View>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleContinue} activeOpacity={0.9}>
          <Text style={styles.primaryLabel}>Continue</Text>
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
    padding: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    marginBottom: Theme.spacing.md,
    ...Theme.shadow.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: Theme.borderRadius.lg,
    backgroundColor: Theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Theme.spacing.md,
  },
  cardHeaderText: {
    flex: 1,
  },
  vehicleTitle: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  vehicleTrim: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginTop: Theme.spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: Theme.colors.border,
    marginVertical: Theme.spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Theme.spacing.sm,
  },
  rowLabel: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textTertiary,
  },
  rowValue: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
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
