import { StyleSheet, Text, View } from 'react-native';
import { getStatusColor, getStatusBackground } from '@customer/constants/colors';
import { APPOINTMENT_STATUS_LABELS } from '@customer/types/enums';
import type { AppointmentStatus } from '@customer/types/enums';

interface StatusBadgeProps {
  status: AppointmentStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const color = getStatusColor(status);
  const background = getStatusBackground(status);
  const label = APPOINTMENT_STATUS_LABELS[status] ?? status;

  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});
