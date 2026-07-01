import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Theme, getHealthColor } from '@customer/constants/colors';
import type { Vehicle } from '@customer/types/api';
import { useVehicleHealth } from '@customer/hooks/vehicles/use-vehicle-health';
import { formatVehicleDisplayTitle } from '@customer/utils/vehicle-display';

interface VehicleCardProps {
  vehicle: Vehicle;
  onPress?: () => void;
}

export function VehicleCard({ vehicle, onPress }: VehicleCardProps) {
  const { data: health } = useVehicleHealth(vehicle.id, vehicle);
  const healthColor = health ? getHealthColor(health.overall) : Theme.colors.textTertiary;
  const displayName = formatVehicleDisplayTitle(vehicle);
  const plate = vehicle.license_plate ?? 'No Plate';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}
    >
      <View style={styles.content}>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.plate}>{plate}</Text>
        </View>
        <View style={styles.healthContainer}>
          <View style={[styles.healthBadge, { backgroundColor: healthColor + '20' }]}>
            <Text style={[styles.healthScore, { color: healthColor }]}>
              {health?.overall ?? '—'}
            </Text>
          </View>
          <Text style={styles.healthLabel}>
            {health ? 'Health' : 'No data yet'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
    ...Theme.shadow.md,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  info: {
    flex: 1,
    marginRight: Theme.spacing.md,
  },
  name: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '600',
    color: Theme.colors.text,
    marginBottom: 2,
  },
  plate: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  healthContainer: {
    alignItems: 'center',
  },
  healthBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  healthScore: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
  },
  healthLabel: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    marginTop: 2,
  },
});
