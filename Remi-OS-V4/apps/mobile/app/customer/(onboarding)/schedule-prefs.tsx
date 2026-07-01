import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';
import { useOnboardingStore, type OnboardingStepId } from '@/src/stores/customer/onboarding';
import { useUpdatePreferences } from '@customer/hooks/auth/use-preferences';
import type { Weekday, PreferredTimeOfDay, ServiceBehavior, LeadTimePreference, PreferredLocation } from '@customer/types/enums';
import { LEAD_TIME_TO_DAYS } from '@customer/types/enums';

const TIME_OPTIONS = [
  { key: 'morning' as PreferredTimeOfDay, label: 'Morning' },
  { key: 'afternoon' as PreferredTimeOfDay, label: 'Afternoon' },
  { key: 'evening' as PreferredTimeOfDay, label: 'Evening' },
] as const;

const DAYS = [
  { key: 'mon' as Weekday, label: 'Mon' },
  { key: 'tue' as Weekday, label: 'Tue' },
  { key: 'wed' as Weekday, label: 'Wed' },
  { key: 'thu' as Weekday, label: 'Thu' },
  { key: 'fri' as Weekday, label: 'Fri' },
  { key: 'sat' as Weekday, label: 'Sat' },
  { key: 'sun' as Weekday, label: 'Sun' },
] as const;

const LOCATION_OPTIONS = [
  { key: 'home' as PreferredLocation, label: 'Home' },
  { key: 'office' as PreferredLocation, label: 'Office' },
  { key: 'other' as PreferredLocation, label: 'Other' },
] as const;

const WORKSTYLE_OPTIONS = [
  { key: 'leaves_keys' as ServiceBehavior, label: 'Leave keys in vehicle' },
  { key: 'meets_at_door' as ServiceBehavior, label: 'Meet at door' },
  { key: 'vehicle_unlocked' as ServiceBehavior, label: 'Vehicle will be unlocked' },
] as const;

const LEAD_TIME_OPTIONS = [
  { key: 'same_day' as LeadTimePreference, label: 'Same day' },
  { key: 'one_day' as LeadTimePreference, label: '1 day' },
  { key: 'two_days' as LeadTimePreference, label: '2 days' },
  { key: 'one_week' as LeadTimePreference, label: '1 week' },
] as const;

export default function OnboardingSchedulePrefsScreen() {
  const router = useRouter();
  const completeStep = useOnboardingStore((s) => s.completeStep);
  const updatePreferences = useUpdatePreferences();
  const [apiError, setApiError] = useState<string | null>(null);
  const [timeOfDay, setTimeOfDay] = useState<PreferredTimeOfDay | null>(null);
  const [days, setDays] = useState<Record<Weekday, boolean>>({
    mon: false, tue: false, wed: false, thu: false, fri: false, sat: false, sun: false,
  });
  const [locationType, setLocationType] = useState<PreferredLocation | null>(null);
  const [workstyle, setWorkstyle] = useState<ServiceBehavior | null>(null);
  const [leadTime, setLeadTime] = useState<LeadTimePreference | null>(null);
  const [accessNotes, setAccessNotes] = useState('');

  const handleSkip = () => {
    router.replace('/customer');
  };

  const toggleDay = (key: Weekday) => {
    setDays((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleContinue = async () => {
    setApiError(null);
    try {
      const preferredDays = (Object.entries(days) as [Weekday, boolean][])
        .filter(([, on]) => on)
        .map(([key]) => key as Weekday);

      await updatePreferences.mutateAsync({
        preferred_time_of_day: timeOfDay,
        preferred_days: preferredDays,
        preferred_location: locationType,
        service_behavior: workstyle,
        lead_time_preference_days: leadTime ? LEAD_TIME_TO_DAYS[leadTime] : null,
        access_instructions: accessNotes.trim() || null,
      });
      await completeStep('schedulePreferences' satisfies OnboardingStepId);
      router.push('/customer/notification-prefs');
    } catch {
      setApiError('Could not save preferences. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.headerRow}>
        <View style={styles.headerSpacer} />
        <TouchableOpacity onPress={handleSkip} hitSlop={12}>
          <Text style={styles.skip}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Scheduling preferences</Text>
        <Text style={styles.subtitle}>
          We&apos;ll prioritize slots that match your routine. You can change this anytime.
        </Text>

        <Text style={styles.sectionLabel}>Preferred time of day</Text>
        <View style={styles.chipRow}>
          {TIME_OPTIONS.map(({ key, label }) => {
            const selected = timeOfDay === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setTimeOfDay(selected ? null : key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>Preferred days</Text>
        <View style={styles.daysRow}>
          {DAYS.map(({ key, label }) => {
            const on = days[key];
            return (
              <TouchableOpacity
                key={key}
                style={[styles.dayCell, on && styles.dayCellOn]}
                onPress={() => toggleDay(key)}
                activeOpacity={0.85}
              >
                {on ? (
                  <Ionicons name="checkmark" size={22} color={Theme.colors.white} />
                ) : (
                  <Text style={styles.dayLabel}>{label}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>Service location</Text>
        <View style={styles.locationRow}>
          {LOCATION_OPTIONS.map(({ key, label }) => {
            const selected = locationType === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.locationCard, selected && styles.locationCardSelected]}
                onPress={() => setLocationType(selected ? null : key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.locationTitle, selected && styles.locationTitleSelected]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>How much notice do you need?</Text>
        <View style={styles.chipRow}>
          {LEAD_TIME_OPTIONS.map(({ key, label }) => {
            const selected = leadTime === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setLeadTime(selected ? null : key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>When the technician arrives</Text>
        <View style={styles.chipRow}>
          {WORKSTYLE_OPTIONS.map(({ key, label }) => {
            const selected = workstyle === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setWorkstyle(selected ? null : key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>Access notes</Text>
        <TextInput
          style={styles.textArea}
          value={accessNotes}
          onChangeText={setAccessNotes}
          placeholder="Gate code, parking notes, special instructions..."
          placeholderTextColor={Theme.colors.textTertiary}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {apiError ? <Text style={styles.errorText}>{apiError}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, updatePreferences.isPending && styles.primaryButtonDisabled]}
          onPress={handleContinue}
          disabled={updatePreferences.isPending}
          activeOpacity={0.9}
        >
          {updatePreferences.isPending ? (
            <ActivityIndicator color={Theme.colors.white} />
          ) : (
            <Text style={styles.primaryLabel}>Next</Text>
          )}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: Theme.spacing.lg,
    paddingBottom: Theme.spacing.sm,
  },
  headerSpacer: {
    flex: 1,
  },
  skip: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.textSecondary,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Theme.spacing.lg,
    paddingBottom: Theme.spacing.xl,
  },
  title: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.sm,
  },
  subtitle: {
    fontSize: Theme.fontSize.md,
    lineHeight: 22,
    color: Theme.colors.textSecondary,
    marginBottom: Theme.spacing.xl,
  },
  sectionLabel: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.md,
    marginTop: Theme.spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.lg,
  },
  chip: {
    paddingVertical: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.md,
    borderRadius: Theme.borderRadius.full,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    backgroundColor: Theme.colors.surface,
  },
  chipSelected: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  chipLabel: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  chipLabelSelected: {
    color: Theme.colors.white,
  },
  daysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.lg,
  },
  dayCell: {
    width: 46,
    height: 46,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellOn: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  dayLabel: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
  locationRow: {
    flexDirection: 'row',
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.lg,
  },
  locationCard: {
    flex: 1,
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
  },
  locationCardSelected: {
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.white,
  },
  locationTitle: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
  locationTitleSelected: {
    color: Theme.colors.primary,
  },
  textArea: {
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
    backgroundColor: Theme.colors.surface,
    minHeight: 80,
    marginBottom: Theme.spacing.md,
  },
  footer: {
    paddingHorizontal: Theme.spacing.lg,
    paddingTop: Theme.spacing.md,
    paddingBottom: Theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.border,
    backgroundColor: Theme.colors.background,
  },
  primaryButton: {
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryLabel: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.lg,
    fontWeight: '600',
  },
  errorText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.error,
    marginTop: Theme.spacing.md,
  },
});
