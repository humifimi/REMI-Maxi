import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';
import { BookingVehicleListSkeleton } from '@customer/components/shared/skeleton';
import { EmptyState } from '@customer/components/shared/empty-state';
import { useVehicles } from '@customer/hooks/vehicles/use-vehicles';
import { useBookingStore } from '@/src/stores/customer/booking';
import { formatVehicleDisplayTitle } from '@customer/utils/vehicle-display';

export default function SelectVehicleScreen() {
  const router = useRouter();
  const { data: vehicles, isPending, isError, refetch } = useVehicles();
  const selectedVehicle = useBookingStore((s) => s.selectedVehicle);
  const setVehicle = useBookingStore((s) => s.setVehicle);

  if (isPending) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <BookingVehicleListSkeleton />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <EmptyState
          title="Couldn’t load vehicles"
          message="Pull to refresh or try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </SafeAreaView>
    );
  }

  const list = vehicles ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lead}>Which vehicle should we service?</Text>

        {list.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              title="No vehicles yet"
              message="Add a vehicle to continue booking."
              actionLabel="Add vehicle"
              onAction={() => router.push('/customer/vehicle/add?from=booking')}
            />
          </View>
        ) : (
          list.map((vehicle) => {
            const selected = selectedVehicle?.id === vehicle.id;
            return (
              <TouchableOpacity
                key={vehicle.id}
                style={[styles.card, selected && styles.cardSelected]}
                onPress={() => setVehicle(vehicle)}
                activeOpacity={0.75}
              >
                <View style={styles.cardIcon}>
                  <Ionicons name="car-sport" size={28} color={selected ? Theme.colors.primary : Theme.colors.textSecondary} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={[styles.cardTitle, selected && styles.cardTitleSelected]} numberOfLines={2}>
                    {formatVehicleDisplayTitle(vehicle)}
                  </Text>
                  <Text style={styles.cardSub}>
                    {(vehicle.license_plate ?? 'No plate').toUpperCase()}
                    {vehicle.license_plate_state ? ` · ${vehicle.license_plate_state}` : ''}
                  </Text>
                </View>
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected ? <Ionicons name="checkmark" size={18} color={Theme.colors.white} /> : null}
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <TouchableOpacity
          style={styles.addRow}
          onPress={() => router.push('/customer/vehicle/add?from=booking')}
          activeOpacity={0.7}
        >
          <View style={styles.addIcon}>
            <Ionicons name="add-circle-outline" size={24} color={Theme.colors.primary} />
          </View>
          <Text style={styles.addText}>Add New Vehicle</Text>
          <Ionicons name="chevron-forward" size={20} color={Theme.colors.textTertiary} />
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueBtn, !selectedVehicle && styles.continueBtnDisabled]}
          disabled={!selectedVehicle}
          onPress={() => router.push('/customer/booking/select-address')}
          activeOpacity={0.85}
        >
          <Text style={styles.continueText}>Continue</Text>
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
  scrollContent: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.md,
    paddingBottom: Theme.spacing.xxl,
  },
  lead: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: Theme.spacing.lg,
  },
  emptyWrap: {
    minHeight: 220,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: Theme.colors.border,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
    ...Theme.shadow.md,
  },
  cardSelected: {
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.primary + '08',
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Theme.spacing.md,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '600',
    color: Theme.colors.text,
    marginBottom: 2,
  },
  cardTitleSelected: {
    color: Theme.colors.primary,
  },
  cardSub: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
  },
  radio: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Theme.spacing.sm,
  },
  radioSelected: {
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.primary,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Theme.spacing.md,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.md,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderStyle: 'dashed',
  },
  addIcon: {
    marginRight: Theme.spacing.sm,
  },
  addText: {
    flex: 1,
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
  footer: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.sm,
    paddingBottom: Theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.borderLight,
    backgroundColor: Theme.colors.background,
  },
  continueBtn: {
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  continueBtnDisabled: {
    backgroundColor: Theme.colors.border,
  },
  continueText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
  },
});
