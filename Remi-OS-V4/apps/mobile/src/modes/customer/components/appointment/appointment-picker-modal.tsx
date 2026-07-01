import { useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';
import { formatDateShort, formatTime } from '@customer/utils/date-format';
import type { Appointment, Service } from '@customer/types/api';

// @demo-start
const DEMO_WINDOW_MULTIPLIER = 1.5;
// @demo-end

const TOO_LATE_STATUSES = [
  'in_progress',
  'en_route',
  'arrived',
  'wrap_up',
  'completed',
  'paid',
  'cancelled',
];

export interface EligibleAppointment {
  appointment: Appointment;
  existingDuration: number;
  windowMinutes: number;
  overage: number;
  fits: boolean;
}

interface AppointmentPickerModalProps {
  visible: boolean;
  servicesToAdd: Service[];
  vehicleId: number;
  allAppointments: Appointment[];
  onSelect: (appointment: Appointment) => void;
  onScheduleNew: () => void;
  onCancel: () => void;
}

export function AppointmentPickerModal({
  visible,
  servicesToAdd,
  vehicleId,
  allAppointments,
  onSelect,
  onScheduleNew,
  onCancel,
}: AppointmentPickerModalProps) {
  const newDuration = useMemo(
    () => servicesToAdd.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0),
    [servicesToAdd],
  );

  const eligible = useMemo(() => {
    const vehicleAppts = allAppointments.filter(
      (a) =>
        a.vehicle_id === vehicleId &&
        !TOO_LATE_STATUSES.includes(a.status),
    );

    return vehicleAppts.map((appt): EligibleAppointment => {
      const existingDuration = (appt.services ?? []).reduce(
        (sum, s) => sum + (s.service?.duration_minutes ?? 0),
        0,
      );
      // @demo-start
      const windowMinutes = Math.round(
        Math.max(existingDuration, 30) * DEMO_WINDOW_MULTIPLIER,
      );
      // @demo-end
      const total = existingDuration + newDuration;
      const overage = total - windowMinutes;
      return {
        appointment: appt,
        existingDuration,
        windowMinutes,
        overage,
        fits: overage <= 0,
      };
    });
  }, [allAppointments, vehicleId, newDuration]);

  const fitsCount = eligible.filter((e) => e.fits).length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>Choose Appointment</Text>
          <Pressable onPress={onCancel} hitSlop={12}>
            <Ionicons
              name="close-circle"
              size={28}
              color={Theme.colors.textTertiary}
            />
          </Pressable>
        </View>

        <Text style={styles.subtitle}>
          Adding {servicesToAdd.length} service{servicesToAdd.length !== 1 ? 's' : ''} (~{newDuration} min).{' '}
          {fitsCount === 0
            ? 'None of your current appointments have enough time.'
            : `Select which appointment to add to.`}
        </Text>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {eligible.map((entry) => {
            const { appointment: appt, existingDuration: ed, fits, overage } = entry;
            const dateLabel = appt.scheduled_date
              ? formatDateShort(appt.scheduled_date)
              : 'Date TBD';
            const timeLabel = appt.scheduled_time
              ? formatTime(appt.scheduled_time)
              : '';
            const serviceNames =
              appt.services
                ?.map((s) => s.service?.name)
                .filter(Boolean)
                .join(', ') || 'No services yet';

            return (
              <TouchableOpacity
                key={appt.id}
                style={[styles.card, fits ? styles.cardFits : styles.cardOver]}
                onPress={() => onSelect(appt)}
                activeOpacity={0.7}
              >
                <View style={styles.cardTop}>
                  <View style={styles.cardDateRow}>
                    <Ionicons
                      name="calendar-outline"
                      size={16}
                      color={Theme.colors.primary}
                    />
                    <Text style={styles.cardDate}>
                      {dateLabel}{timeLabel ? ` · ${timeLabel}` : ''}
                    </Text>
                  </View>
                  {fits ? (
                    <View style={styles.fitBadge}>
                      <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                      <Text style={styles.fitBadgeText}>Fits</Text>
                    </View>
                  ) : (
                    <View style={styles.overBadge}>
                      <Ionicons name="alert-circle" size={14} color="#DC2626" />
                      <Text style={styles.overBadgeText}>
                        {overage}m over
                      </Text>
                    </View>
                  )}
                </View>

                <Text style={styles.cardServices} numberOfLines={2}>
                  {serviceNames}
                </Text>

                <Text style={styles.cardDuration}>
                  Current: ~{ed} min · With new: ~{ed + newDuration} min
                </Text>
              </TouchableOpacity>
            );
          })}

          {eligible.length === 0 && (
            <View style={styles.emptyBlock}>
              <Ionicons
                name="calendar-clear-outline"
                size={32}
                color={Theme.colors.textTertiary}
              />
              <Text style={styles.emptyText}>
                No upcoming appointments for this vehicle.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.scheduleNewRow}
            onPress={onScheduleNew}
            activeOpacity={0.7}
          >
            <View style={styles.scheduleNewIcon}>
              <Ionicons name="add-circle" size={20} color={Theme.colors.primary} />
            </View>
            <View style={styles.scheduleNewText}>
              <Text style={styles.scheduleNewTitle}>Schedule New Appointment</Text>
              <Text style={styles.scheduleNewSub}>
                Book a separate visit for these services
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={Theme.colors.textTertiary}
            />
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
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
    paddingHorizontal: Theme.spacing.lg,
    paddingTop: Theme.spacing.md,
    paddingBottom: Theme.spacing.sm,
  },
  title: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  subtitle: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    paddingHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    lineHeight: 20,
  },
  scroll: {
    paddingHorizontal: Theme.spacing.lg,
    paddingBottom: Theme.spacing.xxl,
  },
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 2,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
  },
  cardFits: {
    borderColor: '#22C55E40',
    backgroundColor: '#22C55E06',
  },
  cardOver: {
    borderColor: '#EF444440',
    backgroundColor: '#EF44440A',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.spacing.xs,
  },
  cardDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardDate: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  fitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Theme.borderRadius.sm,
  },
  fitBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
  },
  overBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Theme.borderRadius.sm,
  },
  overBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  cardServices: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginBottom: 4,
  },
  cardDuration: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
  },
  emptyBlock: {
    alignItems: 'center',
    padding: Theme.spacing.xl,
    gap: Theme.spacing.sm,
  },
  emptyText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textTertiary,
    textAlign: 'center',
  },
  scheduleNewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: Theme.colors.primary + '30',
    borderStyle: 'dashed',
    padding: Theme.spacing.md,
    marginTop: Theme.spacing.sm,
    gap: Theme.spacing.sm,
  },
  scheduleNewIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scheduleNewText: {
    flex: 1,
  },
  scheduleNewTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
  scheduleNewSub: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    marginTop: 1,
  },
});
