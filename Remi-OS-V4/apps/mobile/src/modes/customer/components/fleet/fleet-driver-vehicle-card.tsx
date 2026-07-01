import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Theme, getHealthColor, HealthColors } from '@customer/constants/colors';
import { HealthRing } from '@customer/components/vehicle/health-ring';
import type { FleetDriverVehicleInfo } from '@customer/types/fleet';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function inspectionBadge(status: FleetDriverVehicleInfo['inspection_status']): {
  label: string;
  color: string;
} {
  switch (status) {
    case 'overdue':
      return { label: 'Inspection Overdue', color: HealthColors.critical };
    case 'due_soon':
      return { label: 'Inspection Due Soon', color: HealthColors.warning };
    case 'never':
      return { label: 'No Inspection on File', color: HealthColors.critical };
    case 'current':
    default:
      return { label: 'Inspection Current', color: HealthColors.good };
  }
}

export function FleetDriverVehicleCard({ vehicle }: { vehicle: FleetDriverVehicleInfo }) {
  const router = useRouter();
  const healthColor = getHealthColor(vehicle.health_score);
  const badge = inspectionBadge(vehicle.inspection_status);
  const showInspectionBanner =
    vehicle.inspection_status === 'overdue' || vehicle.inspection_status === 'due_soon' || vehicle.inspection_status === 'never';

  return (
    <View style={styles.container}>
      {showInspectionBanner && (
        <TouchableOpacity
          style={[styles.banner, { backgroundColor: badge.color + '12', borderColor: badge.color + '30' }]}
          onPress={() => router.push('/customer/fleet/inspection/submit')}
          activeOpacity={0.7}
        >
          <Ionicons name="alert-circle" size={18} color={badge.color} />
          <Text style={[styles.bannerText, { color: badge.color }]}>{badge.label}</Text>
          <Text style={[styles.bannerAction, { color: badge.color }]}>Start Inspection</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.card, Theme.shadow.sm]}
        onPress={() => router.push(`/customer/fleet/vehicles/${vehicle.vehicle_id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.header}>
          <HealthRing score={vehicle.health_score} variant="compact" animated />
          <View style={styles.headerInfo}>
            <Text style={styles.vehicleName}>{vehicle.vehicle_name}</Text>
            {vehicle.license_plate && (
              <Text style={styles.plate}>{vehicle.license_plate}</Text>
            )}
          </View>
        </View>

        <View style={styles.metaRow}>
          {vehicle.next_due_service && vehicle.next_due_date && (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={14} color={Theme.colors.textSecondary} />
              <Text style={styles.metaText}>
                {vehicle.next_due_service} — {formatDate(vehicle.next_due_date)}
              </Text>
            </View>
          )}
          {vehicle.last_inspection_date && (
            <View style={styles.metaItem}>
              <Ionicons name="clipboard-outline" size={14} color={Theme.colors.textSecondary} />
              <Text style={styles.metaText}>
                Last inspection: {formatDate(vehicle.last_inspection_date)}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Theme.spacing.md,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    marginBottom: Theme.spacing.sm,
  },
  bannerText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    flex: 1,
  },
  bannerAction: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
  },
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
  },
  headerInfo: {
    flex: 1,
  },
  vehicleName: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  plate: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    fontFamily: 'Courier',
    marginTop: 2,
  },
  metaRow: {
    gap: Theme.spacing.xs,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
  },
});
