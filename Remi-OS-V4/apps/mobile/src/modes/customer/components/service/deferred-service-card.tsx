import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';
import { OBSERVATION_TYPE_LABELS, DeferredWorkSeverity } from '@customer/types/enums';
import type { Appointment, DeferredWorkItem } from '@customer/types/api';

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  [DeferredWorkSeverity.LOW]: { bg: '#DBEAFE', text: '#1E40AF' },
  [DeferredWorkSeverity.MEDIUM]: { bg: '#FEF3C7', text: '#92400E' },
  [DeferredWorkSeverity.HIGH]: { bg: '#FEE2E2', text: '#991B1B' },
};

const SEVERITY_LABELS: Record<string, string> = {
  [DeferredWorkSeverity.LOW]: 'Low',
  [DeferredWorkSeverity.MEDIUM]: 'Medium',
  [DeferredWorkSeverity.HIGH]: 'High',
};

interface DeferredServiceCardProps {
  item: DeferredWorkItem;
  vehicleName?: string | null;
  isBooked?: boolean;
  existingAppointmentForVehicle?: Appointment;
  onBookNow: (item: DeferredWorkItem) => void;
  onAddService?: (item: DeferredWorkItem, appointment: Appointment) => void;
  onDecline?: (item: DeferredWorkItem) => void;
}

export function DeferredServiceCard({
  item,
  vehicleName,
  isBooked,
  existingAppointmentForVehicle,
  onBookNow,
  onAddService,
  onDecline,
}: DeferredServiceCardProps) {
  const sevStyle = SEVERITY_COLORS[item.severity] ?? SEVERITY_COLORS[DeferredWorkSeverity.MEDIUM];
  const observationLabel = OBSERVATION_TYPE_LABELS[item.observation_type] ?? item.observation_type;
  const serviceName = item.recommended_service?.name;
  const dateStr = new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const showAddService = !isBooked && !!existingAppointmentForVehicle && !!onAddService;

  return (
    <View style={[styles.card, isBooked && styles.cardBooked]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="alert-circle-outline" size={18} color={sevStyle.text} />
          <Text style={styles.title} numberOfLines={1}>{observationLabel}</Text>
        </View>
        <View style={[styles.severityBadge, { backgroundColor: sevStyle.bg }]}>
          <Text style={[styles.severityText, { color: sevStyle.text }]}>
            {SEVERITY_LABELS[item.severity] ?? item.severity}
          </Text>
        </View>
      </View>

      {vehicleName ? (
        <View style={styles.vehicleRow}>
          <Ionicons name="car-outline" size={14} color={Theme.colors.textSecondary} />
          <Text style={styles.vehicleText} numberOfLines={1}>{vehicleName}</Text>
        </View>
      ) : null}

      {item.technician_notes && (
        <Text style={styles.notes} numberOfLines={2}>{item.technician_notes}</Text>
      )}

      {item.photo_url && (
        <Image source={{ uri: item.photo_url }} style={styles.photo} resizeMode="cover" />
      )}

      <View style={styles.footer}>
        <View style={styles.meta}>
          {serviceName && (
            <Text style={styles.metaText}>
              <Ionicons name="construct-outline" size={12} color={Theme.colors.textSecondary} />{' '}
              {serviceName}
            </Text>
          )}
          {item.estimated_cost != null && (
            <Text style={styles.metaText}>
              Est. ${Number(item.estimated_cost).toFixed(2)}
            </Text>
          )}
          <Text style={styles.dateText}>Observed {dateStr}</Text>
        </View>

        <View style={styles.actions}>
          {isBooked ? (
            <View style={styles.bookedBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
              <Text style={styles.bookedText}>Booked</Text>
            </View>
          ) : showAddService ? (
            <TouchableOpacity
              style={styles.addServiceBtn}
              onPress={() => onAddService(item, existingAppointmentForVehicle)}
            >
              <Ionicons name="add-circle" size={14} color={Theme.colors.white} />
              <Text style={styles.bookText}>Add Service</Text>
            </TouchableOpacity>
          ) : (
            <>
              {onDecline && (
                <TouchableOpacity style={styles.declineBtn} onPress={() => onDecline(item)} hitSlop={8}>
                  <Text style={styles.declineText}>Dismiss</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.bookBtn} onPress={() => onBookNow(item)}>
                <Ionicons name="calendar" size={14} color={Theme.colors.white} />
                <Text style={styles.bookText}>Book Now</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    gap: Theme.spacing.sm,
    ...Theme.shadow.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  title: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
    flex: 1,
  },
  severityBadge: {
    paddingHorizontal: Theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: Theme.borderRadius.sm,
  },
  severityText: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '600',
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  vehicleText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '500',
    color: Theme.colors.textSecondary,
  },
  notes: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    lineHeight: 20,
  },
  photo: {
    width: '100%',
    height: 120,
    borderRadius: Theme.borderRadius.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: Theme.spacing.xs,
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  metaText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    fontWeight: '500',
  },
  dateText: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
  },
  declineBtn: {
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
  },
  declineText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textTertiary,
    fontWeight: '500',
  },
  bookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Theme.colors.primary,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.sm,
  },
  bookText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.white,
  },
  cardBooked: {
    opacity: 0.7,
  },
  bookedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.sm,
  },
  bookedText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: '#16A34A',
  },
  addServiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#7C3AED',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.sm,
  },
});
