import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';
import { EmptyState } from '@customer/components/shared/empty-state';
import {
  usePreferences, useUpdatePreferences,
  useProfileDetails, useUpdateProfileDetails,
} from '@customer/hooks/auth/use-preferences';
import type { CustomerPreferences, HouseholdMember } from '@customer/types/api';
import { successHaptic } from '@customer/services/haptics';
import {
  PreferredTimeOfDay,
  PREFERRED_TIME_LABELS,
  CommunicationMode,
  COMMUNICATION_MODE_LABELS,
  ServiceBehavior,
  SERVICE_BEHAVIOR_LABELS,
  Weekday,
  WEEKDAY_LABELS,
  WorkSituation,
  WORK_SITUATION_LABELS,
  RelocationStatus,
  RELOCATION_STATUS_LABELS,
  LeadTimePreference,
  LEAD_TIME_LABELS,
  LEAD_TIME_TO_DAYS,
  daysToLeadTime,
  PreferredLocation,
  PREFERRED_LOCATION_LABELS,
} from '@customer/types/enums';

const preferenceSchema = z.object({
  preferred_time_of_day: z.string().nullable(),
  preferred_days: z.array(z.string()),
  communication_mode: z.string().nullable(),
  same_technician_preferred: z.boolean(),
  service_behavior: z.string().nullable(),
  access_instructions: z.string().nullable(),
  lead_time_preference: z.string().nullable(),
  preferred_location: z.string().nullable(),
});

type PreferenceFormData = z.infer<typeof preferenceSchema>;

const TIME_OPTIONS = Object.entries(PREFERRED_TIME_LABELS) as [string, string][];
const COMM_OPTIONS = Object.entries(COMMUNICATION_MODE_LABELS) as [string, string][];
const BEHAVIOR_OPTIONS = Object.entries(SERVICE_BEHAVIOR_LABELS) as [string, string][];
const DAY_OPTIONS = Object.entries(WEEKDAY_LABELS) as [string, string][];

const LEAD_TIME_OPTIONS = Object.entries(LEAD_TIME_LABELS) as [string, string][];
const LOCATION_OPTIONS = Object.entries(PREFERRED_LOCATION_LABELS) as [string, string][];
const WORK_OPTIONS = Object.entries(WORK_SITUATION_LABELS) as [string, string][];
const RELOCATION_OPTIONS = Object.entries(RELOCATION_STATUS_LABELS) as [string, string][];

/** Stable snapshot so we only reset the form when server data actually changes — not on every React Query refetch identity change. */
function customerPrefsFingerprint(p: CustomerPreferences): string {
  return JSON.stringify({
    preferred_time_of_day: p.preferred_time_of_day,
    preferred_days: p.preferred_days,
    communication_mode: p.communication_mode,
    same_technician_preferred: p.same_technician_preferred,
    service_behavior: p.service_behavior,
    access_instructions: p.access_instructions,
    lead_time_preference_days: p.lead_time_preference_days,
    preferred_location: p.preferred_location,
  });
}

function prefsToFormDefaults(prefs: CustomerPreferences): PreferenceFormData {
  return {
    preferred_time_of_day: prefs.preferred_time_of_day ?? null,
    preferred_days: prefs.preferred_days ?? [],
    communication_mode: prefs.communication_mode ?? null,
    same_technician_preferred: prefs.same_technician_preferred ?? false,
    service_behavior: prefs.service_behavior ?? null,
    access_instructions: prefs.access_instructions ?? null,
    lead_time_preference: daysToLeadTime(prefs.lead_time_preference_days ?? null),
    preferred_location: prefs.preferred_location ?? null,
  };
}

export default function PreferencesScreen() {
  const { data: prefs, isPending, isError, refetch, failureCount } = usePreferences();
  const updatePrefs = useUpdatePreferences();
  const { data: profileDetails } = useProfileDetails();
  const updateProfile = useUpdateProfileDetails();

  const [birthday, setBirthday] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [workSituation, setWorkSituation] = useState<string | null>(null);
  const [relocationStatus, setRelocationStatus] = useState<string | null>(null);
  const [profileDirty, setProfileDirty] = useState(false);

  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>([]);
  const [gateCode, setGateCode] = useState('');
  const [dogWarning, setDogWarning] = useState('');
  const [preferredParking, setPreferredParking] = useState('');
  const [householdAdditional, setHouseholdAdditional] = useState('');

  useEffect(() => {
    if (profileDetails) {
      setBirthday(profileDetails.birthday ? new Date(profileDetails.birthday + 'T00:00:00') : null);
      setWorkSituation(profileDetails.work_situation ?? null);
      setRelocationStatus(profileDetails.relocation_status ?? null);
      const hn = profileDetails.household_notes;
      if (hn) {
        setHouseholdMembers(hn.members ?? []);
        setGateCode(hn.gate_code ?? '');
        setDogWarning(hn.dog_warning ?? '');
        setPreferredParking(hn.preferred_parking ?? '');
        setHouseholdAdditional(hn.additional_notes ?? '');
      }
      setProfileDirty(false);
    }
  }, [profileDetails]);

  const emptyFormDefaults = useMemo<PreferenceFormData>(
    () => ({
      preferred_time_of_day: null,
      preferred_days: [],
      communication_mode: null,
      same_technician_preferred: false,
      service_behavior: null,
      access_instructions: null,
      lead_time_preference: null,
      preferred_location: null,
    }),
    [],
  );

  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<PreferenceFormData>({
    resolver: zodResolver(preferenceSchema),
    defaultValues: emptyFormDefaults,
  });

  const lastSyncedPrefsFingerprint = useRef<string | null>(null);

  useEffect(() => {
    if (!prefs) return;
    const fp = customerPrefsFingerprint(prefs);
    if (lastSyncedPrefsFingerprint.current === fp) return;
    lastSyncedPrefsFingerprint.current = fp;
    reset(prefsToFormDefaults(prefs));
  }, [prefs, reset]);

  const onSubmit = (data: PreferenceFormData) => {
    updatePrefs.mutate(
      {
        preferred_time_of_day: (data.preferred_time_of_day as PreferredTimeOfDay) ?? null,
        preferred_days: data.preferred_days as Weekday[],
        communication_mode: (data.communication_mode as CommunicationMode) ?? null,
        same_technician_preferred: data.same_technician_preferred,
        service_behavior: (data.service_behavior as ServiceBehavior) ?? null,
        access_instructions: data.access_instructions,
        lead_time_preference_days: data.lead_time_preference
          ? LEAD_TIME_TO_DAYS[data.lead_time_preference as LeadTimePreference]
          : null,
        preferred_location: (data.preferred_location as PreferredLocation) ?? null,
      },
      {
        onSuccess: () => {
          if (profileDirty) {
            saveProfileDetails();
          } else {
            successHaptic();
            Alert.alert('Saved', 'Your preferences have been updated.');
          }
        },
        onError: () => Alert.alert('Error', 'Could not save preferences. Please try again.'),
      },
    );
  };

  function saveProfileDetails() {
    const bdayStr = birthday
      ? `${birthday.getFullYear()}-${String(birthday.getMonth() + 1).padStart(2, '0')}-${String(birthday.getDate()).padStart(2, '0')}`
      : null;

    const hasHouseholdData =
      householdMembers.length > 0 || gateCode || dogWarning || preferredParking || householdAdditional;

    updateProfile.mutate(
      {
        birthday: bdayStr,
        work_situation: (workSituation as WorkSituation) ?? null,
        relocation_status: (relocationStatus as RelocationStatus) ?? null,
        household_notes: hasHouseholdData
          ? {
              members: householdMembers,
              gate_code: gateCode || null,
              dog_warning: dogWarning || null,
              preferred_parking: preferredParking || null,
              additional_notes: householdAdditional || null,
            }
          : null,
      },
      {
        onSuccess: () => {
          setProfileDirty(false);
          successHaptic();
          Alert.alert('Saved', 'Your preferences have been updated.');
        },
        onError: () => Alert.alert('Error', 'Could not save profile details. Please try again.'),
      },
    );
  }

  if (isPending) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ActivityIndicator color={Theme.colors.primary} style={styles.loader} />
      </SafeAreaView>
    );
  }

  if (isError || !prefs) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <EmptyState
          title="Couldn’t load preferences"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
        {failureCount > 0 ? (
          <Text style={styles.errorHint}>If this keeps happening, the preferences API may be unavailable.</Text>
        ) : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.lead}>
          These preferences help us schedule at times and in ways that work best for you.
        </Text>

        {/* Preferred Time of Day */}
        <Text style={styles.sectionLabel}>Preferred Time</Text>
        <Controller
          control={control}
          name="preferred_time_of_day"
          render={({ field: { value, onChange } }) => (
            <View style={styles.chipRow}>
              {TIME_OPTIONS.map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.chip, value === key && styles.chipActive]}
                  onPress={() => onChange(value === key ? null : key)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, value === key && styles.chipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        />

        {/* Preferred Days */}
        <Text style={styles.sectionLabel}>Preferred Days</Text>
        <Controller
          control={control}
          name="preferred_days"
          render={({ field: { value, onChange } }) => (
            <View style={styles.chipRow}>
              {DAY_OPTIONS.map(([key, label]) => {
                const selected = value.includes(key);
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.dayChip, selected && styles.chipActive]}
                    onPress={() =>
                      onChange(
                        selected ? value.filter((d) => d !== key) : [...value, key],
                      )
                    }
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        />

        {/* Communication Mode */}
        <Text style={styles.sectionLabel}>Communication Preference</Text>
        <Controller
          control={control}
          name="communication_mode"
          render={({ field: { value, onChange } }) => (
            <View style={styles.optionList}>
              {COMM_OPTIONS.map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={styles.optionRow}
                  onPress={() => onChange(value === key ? null : key)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={value === key ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={value === key ? Theme.colors.primary : Theme.colors.border}
                  />
                  <Text style={styles.optionLabel}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        />

        {/* Same Technician */}
        <Text style={styles.sectionLabel}>Same Technician</Text>
        <Controller
          control={control}
          name="same_technician_preferred"
          render={({ field: { value, onChange } }) => (
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => onChange(!value)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={value ? 'checkbox' : 'square-outline'}
                size={24}
                color={value ? Theme.colors.primary : Theme.colors.border}
              />
              <Text style={styles.toggleLabel}>
                I prefer the same technician each visit
              </Text>
            </TouchableOpacity>
          )}
        />

        {/* Service Behavior */}
        <Text style={styles.sectionLabel}>When the Technician Arrives</Text>
        <Controller
          control={control}
          name="service_behavior"
          render={({ field: { value, onChange } }) => (
            <View style={styles.optionList}>
              {BEHAVIOR_OPTIONS.map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={styles.optionRow}
                  onPress={() => onChange(value === key ? null : key)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={value === key ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={value === key ? Theme.colors.primary : Theme.colors.border}
                  />
                  <Text style={styles.optionLabel}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        />

        {/* Access Instructions */}
        <Text style={styles.sectionLabel}>Access Instructions</Text>
        <Controller
          control={control}
          name="access_instructions"
          render={({ field: { value, onChange } }) => (
            <TextInput
              style={styles.textArea}
              value={value ?? ''}
              onChangeText={(t) => onChange(t || null)}
              placeholder="Gate code, parking notes, special instructions..."
              placeholderTextColor={Theme.colors.textTertiary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          )}
        />

        {/* Lead Time Preference */}
        <Text style={styles.sectionLabel}>Scheduling Lead Time</Text>
        <Controller
          control={control}
          name="lead_time_preference"
          render={({ field: { value, onChange } }) => (
            <View style={styles.chipRow}>
              {LEAD_TIME_OPTIONS.map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.chip, value === key && styles.chipActive]}
                  onPress={() => onChange(value === key ? null : key)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, value === key && styles.chipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        />

        {/* Preferred Location */}
        <Text style={styles.sectionLabel}>Preferred Service Location</Text>
        <Controller
          control={control}
          name="preferred_location"
          render={({ field: { value, onChange } }) => (
            <View style={styles.chipRow}>
              {LOCATION_OPTIONS.map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.chip, value === key && styles.chipActive]}
                  onPress={() => onChange(value === key ? null : key)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, value === key && styles.chipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        />

        {/* --- About You --- */}
        <View style={styles.divider} />
        <Text style={styles.aboutHeading}>About You</Text>
        <Text style={styles.aboutSubtext}>
          Help us serve you better. These fields are optional and never shared.
        </Text>

        {/* Birthday */}
        <Text style={styles.sectionLabel}>Birthday</Text>
        <TouchableOpacity
          style={styles.dateBtn}
          onPress={() => setShowDatePicker(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="calendar-outline" size={18} color={Theme.colors.textSecondary} />
          <Text style={birthday ? styles.dateText : styles.datePlaceholder}>
            {birthday
              ? birthday.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
              : 'Select your birthday'}
          </Text>
          {birthday ? (
            <TouchableOpacity
              hitSlop={12}
              onPress={() => { setBirthday(null); setProfileDirty(true); }}
            >
              <Ionicons name="close-circle" size={18} color={Theme.colors.textTertiary} />
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={birthday ?? new Date(1990, 0, 1)}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={new Date()}
            onChange={(_event, selectedDate) => {
              setShowDatePicker(Platform.OS !== 'ios');
              if (selectedDate) {
                setBirthday(selectedDate);
                setProfileDirty(true);
              }
            }}
          />
        )}

        {/* Work Situation */}
        <Text style={styles.sectionLabel}>Work Situation</Text>
        <View style={styles.optionList}>
          {WORK_OPTIONS.map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={styles.optionRow}
              onPress={() => {
                setWorkSituation(workSituation === key ? null : key);
                setProfileDirty(true);
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name={workSituation === key ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={workSituation === key ? Theme.colors.primary : Theme.colors.border}
              />
              <Text style={styles.optionLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Relocation Status */}
        <Text style={styles.sectionLabel}>Relocation Status</Text>
        <View style={styles.optionList}>
          {RELOCATION_OPTIONS.map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={styles.optionRow}
              onPress={() => {
                setRelocationStatus(relocationStatus === key ? null : key);
                setProfileDirty(true);
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name={relocationStatus === key ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={relocationStatus === key ? Theme.colors.primary : Theme.colors.border}
              />
              <Text style={styles.optionLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* --- Household & Access --- */}
        <View style={styles.divider} />
        <Text style={styles.aboutHeading}>Household & Access</Text>
        <Text style={styles.aboutSubtext}>
          Help technicians personalize your service. Who else might book, access info, and parking details.
        </Text>

        {/* Household Members */}
        <Text style={styles.sectionLabel}>Household Members</Text>
        <Text style={styles.householdHint}>
          People in your household who may book service (e.g. spouse, teenager).
        </Text>
        {householdMembers.map((member, idx) => (
          <View key={idx} style={styles.memberRow}>
            <View style={styles.memberFields}>
              <TextInput
                style={[styles.memberInput, styles.memberNameInput]}
                value={member.name}
                placeholder="Name"
                placeholderTextColor={Theme.colors.textTertiary}
                onChangeText={(text) => {
                  const updated = [...householdMembers];
                  updated[idx] = { ...updated[idx], name: text };
                  setHouseholdMembers(updated);
                  setProfileDirty(true);
                }}
              />
              <TextInput
                style={[styles.memberInput, styles.memberRelInput]}
                value={member.relationship}
                placeholder="Relationship"
                placeholderTextColor={Theme.colors.textTertiary}
                onChangeText={(text) => {
                  const updated = [...householdMembers];
                  updated[idx] = { ...updated[idx], relationship: text };
                  setHouseholdMembers(updated);
                  setProfileDirty(true);
                }}
              />
            </View>
            <View style={styles.memberActions}>
              <TouchableOpacity
                style={styles.memberToggle}
                onPress={() => {
                  const updated = [...householdMembers];
                  updated[idx] = { ...updated[idx], can_book: !updated[idx].can_book };
                  setHouseholdMembers(updated);
                  setProfileDirty(true);
                }}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={member.can_book ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={member.can_book ? Theme.colors.primary : Theme.colors.border}
                />
                <Text style={styles.memberToggleLabel}>Can book</Text>
              </TouchableOpacity>
              <TouchableOpacity
                hitSlop={12}
                onPress={() => {
                  setHouseholdMembers(householdMembers.filter((_, i) => i !== idx));
                  setProfileDirty(true);
                }}
              >
                <Ionicons name="close-circle" size={22} color={Theme.colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
        <TouchableOpacity
          style={styles.addMemberBtn}
          onPress={() => {
            setHouseholdMembers([...householdMembers, { name: '', relationship: '', can_book: false }]);
            setProfileDirty(true);
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="add-circle-outline" size={20} color={Theme.colors.primary} />
          <Text style={styles.addMemberText}>Add household member</Text>
        </TouchableOpacity>

        {/* Gate / Access Code */}
        <Text style={styles.sectionLabel}>Gate / Access Code</Text>
        <TextInput
          style={styles.compactInput}
          value={gateCode}
          onChangeText={(t) => { setGateCode(t); setProfileDirty(true); }}
          placeholder="e.g. #4521 or call box code"
          placeholderTextColor={Theme.colors.textTertiary}
        />

        {/* Dog Warning */}
        <Text style={styles.sectionLabel}>Pet / Dog Warning</Text>
        <TextInput
          style={styles.compactInput}
          value={dogWarning}
          onChangeText={(t) => { setDogWarning(t); setProfileDirty(true); }}
          placeholder="e.g. Friendly golden retriever in backyard"
          placeholderTextColor={Theme.colors.textTertiary}
        />

        {/* Preferred Parking */}
        <Text style={styles.sectionLabel}>Preferred Parking Spot</Text>
        <TextInput
          style={styles.compactInput}
          value={preferredParking}
          onChangeText={(t) => { setPreferredParking(t); setProfileDirty(true); }}
          placeholder="e.g. Driveway left side, visitor spot #12"
          placeholderTextColor={Theme.colors.textTertiary}
        />

        {/* Additional Household Notes */}
        <Text style={styles.sectionLabel}>Additional Notes</Text>
        <TextInput
          style={styles.textArea}
          value={householdAdditional}
          onChangeText={(t) => { setHouseholdAdditional(t); setProfileDirty(true); }}
          placeholder="Anything else that helps the technician — ring doorbell, use side entrance, etc."
          placeholderTextColor={Theme.colors.textTertiary}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.saveBtn,
            ((!isDirty && !profileDirty) || updatePrefs.isPending || updateProfile.isPending) &&
              styles.saveBtnDisabled,
          ]}
          disabled={(!isDirty && !profileDirty) || updatePrefs.isPending || updateProfile.isPending}
          onPress={() => {
            if (isDirty) {
              handleSubmit(onSubmit)();
            } else if (profileDirty) {
              saveProfileDetails();
            }
          }}
          activeOpacity={0.85}
        >
          {updatePrefs.isPending || updateProfile.isPending ? (
            <ActivityIndicator color={Theme.colors.white} />
          ) : (
            <Text style={styles.saveText}>Save Preferences</Text>
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
  loader: {
    flex: 1,
    justifyContent: 'center',
  },
  scroll: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.md,
    paddingBottom: Theme.spacing.xxl,
  },
  lead: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: Theme.spacing.lg,
  },
  sectionLabel: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
    color: Theme.colors.text,
    marginTop: Theme.spacing.lg,
    marginBottom: Theme.spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Theme.spacing.sm,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.full,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
    backgroundColor: Theme.colors.surface,
  },
  dayChip: {
    borderWidth: 1.5,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.full,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
    backgroundColor: Theme.colors.surface,
    minWidth: 48,
    alignItems: 'center',
  },
  chipActive: {
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.primary + '12',
  },
  chipText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '500',
    color: Theme.colors.textSecondary,
  },
  chipTextActive: {
    color: Theme.colors.primary,
    fontWeight: '700',
  },
  optionList: {
    gap: Theme.spacing.xs,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    paddingVertical: Theme.spacing.sm,
  },
  optionLabel: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    paddingVertical: Theme.spacing.sm,
  },
  toggleLabel: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
    flex: 1,
  },
  textArea: {
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
    backgroundColor: Theme.colors.surface,
    minHeight: 88,
  },
  divider: {
    height: 1,
    backgroundColor: Theme.colors.border,
    marginTop: Theme.spacing.xl,
    marginBottom: Theme.spacing.lg,
  },
  aboutHeading: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.xs,
  },
  aboutSubtext: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: Theme.spacing.sm,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.md,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.md,
    backgroundColor: Theme.colors.surface,
  },
  dateText: {
    flex: 1,
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
  },
  datePlaceholder: {
    flex: 1,
    fontSize: Theme.fontSize.md,
    color: Theme.colors.textTertiary,
  },
  footer: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.sm,
    paddingBottom: Theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.borderLight,
    backgroundColor: Theme.colors.background,
  },
  saveBtn: {
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: Theme.colors.border,
  },
  saveText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
  },
  errorHint: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Theme.spacing.lg,
    marginTop: Theme.spacing.md,
  },
  householdHint: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    marginBottom: Theme.spacing.sm,
    lineHeight: 16,
  },
  memberRow: {
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
    gap: Theme.spacing.sm,
  },
  memberFields: {
    flexDirection: 'row',
    gap: Theme.spacing.sm,
  },
  memberInput: {
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.sm,
    paddingHorizontal: Theme.spacing.sm,
    paddingVertical: Theme.spacing.sm,
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text,
    backgroundColor: Theme.colors.background,
  },
  memberNameInput: {
    flex: 1,
  },
  memberRelInput: {
    flex: 1,
  },
  memberActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  memberToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.xs,
  },
  memberToggleLabel: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
  },
  addMemberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.xs,
    paddingVertical: Theme.spacing.sm,
    marginBottom: Theme.spacing.sm,
  },
  addMemberText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
  compactInput: {
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.md,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.md,
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
    backgroundColor: Theme.colors.surface,
  },
});
