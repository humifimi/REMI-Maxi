import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Theme } from '@customer/constants/colors';
import { formatVehicleDisplayTitle } from '@customer/utils/vehicle-display';
import type { Vehicle } from '@customer/types/api';

interface Props {
  vehicles: Vehicle[];
  onSelect: (vehicle: Vehicle) => void;
  disabled?: boolean;
}

export function VehiclePickerInline({ vehicles, onSelect, disabled = false }: Props) {
  if (vehicles.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Which vehicle?</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {vehicles.map((vehicle) => (
          <TouchableOpacity
            key={vehicle.id}
            style={[styles.card, disabled && styles.cardDisabled]}
            disabled={disabled}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(vehicle);
            }}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`Pick ${formatVehicleDisplayTitle(vehicle)}`}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="car-outline" size={22} color={Theme.colors.primary} />
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {formatVehicleDisplayTitle(vehicle)}
            </Text>
            {vehicle.license_plate ? (
              <Text style={styles.plate} numberOfLines={1}>
                {vehicle.license_plate}
              </Text>
            ) : null}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: Theme.spacing.sm,
  },
  label: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
    marginBottom: Theme.spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  scroll: {
    gap: Theme.spacing.sm,
    paddingRight: Theme.spacing.md,
  },
  card: {
    width: 140,
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    padding: Theme.spacing.md,
    ...Theme.shadow.sm,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.xs,
  },
  name: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  plate: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
});
