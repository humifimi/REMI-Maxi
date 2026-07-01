import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';
import { VehicleCard } from '@customer/components/vehicle/vehicle-card';
import { GarageListSkeleton } from '@customer/components/shared/skeleton';
import { EmptyState } from '@customer/components/shared/empty-state';
import { useVehicles } from '@customer/hooks/vehicles/use-vehicles';
import { selectionTap } from '@customer/services/haptics';

export default function GarageTabScreen() {
  const router = useRouter();
  const { data: vehicles, isPending, isError, refetch } = useVehicles();

  const goToAddVehicle = () => {
    selectionTap();
    router.push('/customer/vehicle/add');
  };

  const renderHeader = (showAddButton: boolean) => (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>Garage</Text>
      {showAddButton ? (
        <TouchableOpacity
          onPress={goToAddVehicle}
          style={styles.addIconButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Add vehicle"
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={22} color={Theme.colors.white} />
        </TouchableOpacity>
      ) : (
        <View style={styles.addIconPlaceholder} />
      )}
    </View>
  );

  if (isPending) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {renderHeader(false)}
        <GarageListSkeleton />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {renderHeader(true)}
        <EmptyState
          title="Couldn’t load vehicles"
          message="Pull to refresh or try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </SafeAreaView>
    );
  }

  if (!vehicles?.length) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {renderHeader(false)}
        <EmptyState
          title="No vehicles yet"
          message="Add a vehicle to see health scores and book service."
          actionLabel="Add vehicle"
          onAction={goToAddVehicle}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {renderHeader(true)}
      <FlatList
        data={vehicles}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <VehicleCard vehicle={item} onPress={() => router.push(`/customer/vehicle/${item.id}`)} />
        )}
        ListFooterComponent={
          <TouchableOpacity
            style={styles.addRow}
            onPress={goToAddVehicle}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Add another vehicle"
          >
            <View style={styles.addRowIcon}>
              <Ionicons
                name="add-circle-outline"
                size={24}
                color={Theme.colors.primary}
              />
            </View>
            <Text style={styles.addRowText}>Add Another Vehicle</Text>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={Theme.colors.textTertiary}
            />
          </TouchableOpacity>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.md,
    paddingBottom: Theme.spacing.sm,
  },
  headerTitle: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  addIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadow.sm,
  },
  addIconPlaceholder: {
    width: 36,
    height: 36,
  },
  list: {
    paddingHorizontal: Theme.spacing.md,
    paddingBottom: Theme.spacing.xl,
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
  addRowIcon: {
    marginRight: Theme.spacing.sm,
  },
  addRowText: {
    flex: 1,
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
});
