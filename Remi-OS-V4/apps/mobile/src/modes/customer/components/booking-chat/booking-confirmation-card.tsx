import { useCallback } from 'react';
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Theme } from '@customer/constants/colors';
import type { TimeSlot } from '@customer/types/booking-chat';

interface Props {
  appointmentId: number;
  slot?: TimeSlot;
  onView: () => void;
}

export function BookingConfirmationCard({ appointmentId, slot, onView }: Props) {
  const handleAddToCalendar = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (!slot) {
      Alert.alert(
        'Add to Calendar',
        'Open your appointment to add it to your calendar.',
      );
      return;
    }

    // expo-calendar isn't installed yet — fall back to opening the native
    // calendar app via deep link so the user can quick-add manually.
    // TODO: Replace with `expo-calendar` Calendar.createEventAsync once added.
    const url = buildCalendarUrl(slot);
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert(
        'Calendar',
        `Appointment ${formatSlotForAlert(slot)} — open your calendar app to add it.`,
      );
    }
  }, [slot]);

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name="checkmark-circle" size={40} color={Theme.colors.success} />
      </View>
      <Text style={styles.title}>Booking Confirmed!</Text>
      {slot ? (
        <Text style={styles.subtitle}>
          {formatSlotForAlert(slot)}
        </Text>
      ) : null}
      <Text style={styles.appt}>Appointment #{appointmentId}</Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary]}
          onPress={handleAddToCalendar}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Ionicons name="calendar-outline" size={16} color={Theme.colors.primary} />
          <Text style={styles.btnSecondaryText}>Add to Calendar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary]}
          onPress={onView}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Text style={styles.btnPrimaryText}>View Appointment</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function formatSlotForAlert(slot: TimeSlot): string {
  const day = new Date(slot.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  return `${day} at ${slot.time}`;
}

function buildCalendarUrl(slot: TimeSlot): string {
  const start = new Date(`${slot.date}T${normalizeTime(slot.time)}`);
  const end = new Date(start.getTime() + slot.estimated_duration_minutes * 60_000);
  const startMs = Math.floor(start.getTime() / 1000);
  const endMs = Math.floor(end.getTime() / 1000);
  return `calshow:${startMs}?endDate=${endMs}`;
}

function normalizeTime(time: string): string {
  // Accepts "9:00 AM", "14:30", "9:00am" — returns "HH:MM:00"
  const trimmed = time.trim();
  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const min = ampmMatch[2];
    const isPm = ampmMatch[3].toLowerCase() === 'pm';
    if (isPm && hour < 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${min}:00`;
  }
  const hhmm = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    return `${hhmm[1].padStart(2, '0')}:${hhmm[2]}:00`;
  }
  return '12:00:00';
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F0FDF4',
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: Theme.spacing.lg,
    alignItems: 'center',
    marginTop: Theme.spacing.sm,
  },
  iconWrap: {
    marginBottom: Theme.spacing.sm,
  },
  title: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  appt: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginBottom: Theme.spacing.md,
  },
  actions: {
    width: '100%',
    gap: Theme.spacing.sm,
  },
  btn: {
    minHeight: 44,
    borderRadius: Theme.borderRadius.sm,
    paddingVertical: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  btnPrimary: {
    backgroundColor: Theme.colors.primary,
  },
  btnPrimaryText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.white,
  },
  btnSecondary: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '40',
  },
  btnSecondaryText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
});
