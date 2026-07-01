import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Theme } from '@customer/constants/colors';
import { useBookingStore } from '@/src/stores/customer/booking';
import { toISODate } from '@customer/utils/date-format';

const TIME_SLOTS = [
  { value: '09:00', label: '9:00 AM' },
  { value: '10:00', label: '10:00 AM' },
  { value: '11:00', label: '11:00 AM' },
  { value: '13:00', label: '1:00 PM' },
  { value: '14:00', label: '2:00 PM' },
  { value: '15:00', label: '3:00 PM' },
  { value: '16:00', label: '4:00 PM' },
] as const;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SelectDateTimeScreen() {
  const router = useRouter();
  const setDateTime = useBookingStore((s) => s.setDateTime);
  const storedDate = useBookingStore((s) => s.selectedDate);
  const storedTime = useBookingStore((s) => s.selectedTime);

  const days = useMemo(() => {
    const out: { iso: string; dow: string; dayNum: number; month: string }[] = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push({
        iso: toISODate(d),
        dow: WEEKDAYS[d.getDay()],
        dayNum: d.getDate(),
        month: d.toLocaleString('en-US', { month: 'short' }),
      });
    }
    return out;
  }, []);

  const initialDate = storedDate && days.some((d) => d.iso === storedDate) ? storedDate : days[0]?.iso ?? null;
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate);
  const [selectedTime, setSelectedTime] = useState<string | null>(storedTime);

  const canContinue = Boolean(selectedDate && selectedTime);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionTitle}>Pick a day</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dayRow}
        >
          {days.map((d) => {
            const active = selectedDate === d.iso;
            return (
              <TouchableOpacity
                key={d.iso}
                style={[styles.dayPill, active && styles.dayPillActive]}
                onPress={() => {
                  setSelectedDate(d.iso);
                  setSelectedTime(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.dayDow, active && styles.dayDowActive]}>{d.dow}</Text>
                <Text style={[styles.dayNum, active && styles.dayNumActive]}>{d.dayNum}</Text>
                <Text style={[styles.dayMonth, active && styles.dayMonthActive]}>{d.month}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Available times</Text>
        <View style={styles.timeGrid}>
          {TIME_SLOTS.map((slot) => {
            const active = selectedTime === slot.value;
            return (
              <TouchableOpacity
                key={slot.value}
                style={[styles.timeCell, active && styles.timeCellActive]}
                onPress={() => setSelectedTime(slot.value)}
                activeOpacity={0.85}
              >
                <Text style={[styles.timeLabel, active && styles.timeLabelActive]}>{slot.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueBtn, !canContinue && styles.continueBtnDisabled]}
          disabled={!canContinue}
          onPress={() => {
            if (selectedDate && selectedTime) {
              setDateTime(selectedDate, selectedTime);
              router.push('/customer/booking/select-address');
            }
          }}
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
    paddingTop: Theme.spacing.md,
    paddingBottom: Theme.spacing.xxl,
  },
  sectionTitle: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
    color: Theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
  },
  sectionSpaced: {
    marginTop: Theme.spacing.lg,
  },
  dayRow: {
    paddingHorizontal: Theme.spacing.md,
    gap: Theme.spacing.sm,
    paddingBottom: Theme.spacing.xs,
  },
  dayPill: {
    width: 72,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.lg,
    backgroundColor: Theme.colors.surface,
    borderWidth: 2,
    borderColor: Theme.colors.border,
    alignItems: 'center',
  },
  dayPillActive: {
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.primary + '12',
  },
  dayDow: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    fontWeight: '600',
  },
  dayDowActive: {
    color: Theme.colors.primary,
  },
  dayNum: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: '700',
    color: Theme.colors.text,
    marginVertical: 2,
  },
  dayNumActive: {
    color: Theme.colors.primary,
  },
  dayMonth: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
  },
  dayMonthActive: {
    color: Theme.colors.primary,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Theme.spacing.md,
    gap: Theme.spacing.sm,
  },
  timeCell: {
    width: '31%',
    minWidth: 100,
    flexGrow: 1,
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Theme.colors.surfaceElevated,
    borderWidth: 2,
    borderColor: Theme.colors.border,
    alignItems: 'center',
    ...Theme.shadow.sm,
  },
  timeCellActive: {
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.primary + '10',
  },
  timeLabel: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  timeLabelActive: {
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
