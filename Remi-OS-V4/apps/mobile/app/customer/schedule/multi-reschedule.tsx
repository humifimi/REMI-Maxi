/**
 * P5-CU-7 — Customer-initiated multi-appointment reschedule.
 *
 * Entry point: the "Reschedule multiple" CTA on the Home tab's
 * upcoming-appointments section, visible only when the customer has
 * ≥2 upcoming appointments (master plan §5.4.6). The chunk-prompt
 * body calls this "the Schedule tab" — REMICustomer doesn't have a
 * Schedule tab, so we anchor the button to the existing
 * upcoming-appointments list on Home, which is the only surface that
 * actually enumerates upcoming appointments today. See
 * `docs/PLAN-DEVIATIONS.md#2026-05-02-multi-reschedule-home-entry-point`.
 *
 * Flow (master plan §5.4.6 + §2.5):
 *   1. Multi-select list of upcoming appointments (checkbox per row).
 *   2. Pick a mode:
 *        - "Same time for all" — one shared date/time applies to all
 *          selected appointments (e.g. "shift everything to Monday
 *          at 2pm").
 *        - "Custom per appointment" — each selected row gets its own
 *          date/time fields.
 *   3. Submit mints a single reorganization session with N reschedule
 *      intents (`POST /customer/reorganizations` with
 *      `finalize_immediately: true` + Idempotency-Key).
 *   4. Response branching (via `autoCommitted` boolean, NOT status
 *      code — see `useCreateReorganizationSession` for the
 *      PLAN-DEVIATION note):
 *        - `autoCommitted: true`  → "Scheduled" confirmation + close.
 *          (Rare; only fires if the franchise policy for
 *          `customer_authored_multi` is overridden to `auto`.)
 *        - `autoCommitted: false` → "Submitted for franchise review"
 *          toast + routes into the approval inbox so the customer sees
 *          the session in context.
 *        - 422 linter rejection → `LinterRejection` is bucketed by
 *          `affected_appointment_id` and rendered inline under each
 *          affected row; user can deselect or adjust and resubmit.
 *        - Other error → non-dismissable inline error with Retry.
 *
 * Customer-app overrides honored (from the chunk-prompt master
 * prelude):
 *   - #1 (React Navigation vs Expo Router): this repo uses Expo
 *     Router; the screen is registered as a stack screen with
 *     `presentation: 'modal'` — same pattern sibling `app/inbox/...`
 *     screens established in P5-CU-2 (see
 *     `docs/PLAN-DEVIATIONS.md#2026-05-02-no-gorhom-bottom-sheet`
 *     for the precedent this entry composes with).
 *   - #4 (no offline tolerance): network errors surface an explicit
 *     inline-error state; no optimistic resolve.
 *   - #5 (error-as-empty footgun): if `useAppointments()` returns an
 *     error we render a dedicated error state, not "no appointments
 *     to select".
 *   - #6 (no landscape / no map): list/card UI only.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Ionicons } from '@expo/vector-icons';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { EmptyState } from '@customer/components/shared/empty-state';
import { Theme } from '@customer/constants/colors';
import {
  formatScheduledDate,
  formatScheduledTime,
} from '@customer/utils/date-format';
import { useAppointments } from '@customer/hooks/appointments/use-appointments';
import {
  bucketLinterIssuesByAppointment,
  buildRescheduleIntent,
  useCreateReorganizationSession,
  type BucketedLinterIssues,
  type LinterIssueSummary,
} from '@customer/hooks/reorganizations/use-create-session';
import { extractLinterRejection } from '@customer/hooks/reorganizations/use-session-detail';
import type { Appointment } from '@customer/types/api';

// ---------------------------------------------------------------------------
// Form schema
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const dateTimeShape = z.object({
  date: z.string(),
  time: z.string(),
});

/**
 * Date/time validation is mode-aware: the `shared` fields only need to
 * parse when `mode === 'shared'`, and the `perRow` fields only need to
 * parse for `selected` rows when `mode === 'per_row'`. Enforcing both
 * unconditionally blocks submit in whichever mode is inactive (the
 * inactive fields legitimately stay empty because the user never
 * interacted with them). Everything beyond the bare shape is validated
 * in `superRefine`.
 */
export const multiRescheduleFormSchema = z
  .object({
    mode: z.enum(['shared', 'per_row']),
    selected: z.array(z.number()).min(1, 'Pick at least one appointment.'),
    shared: dateTimeShape,
    perRow: z.record(z.string(), dateTimeShape),
  })
  .superRefine((value, ctx) => {
    if (value.mode === 'shared') {
      if (!ISO_DATE_RE.test(value.shared.date)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shared', 'date'],
          message: 'Use YYYY-MM-DD',
        });
      }
      if (!HH_MM_RE.test(value.shared.time)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shared', 'time'],
          message: 'Use 24h HH:MM',
        });
      }
    } else {
      for (const id of value.selected) {
        const key = String(id);
        const entry = value.perRow[key];
        if (!entry || !ISO_DATE_RE.test(entry.date)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['perRow', key, 'date'],
            message: 'Use YYYY-MM-DD',
          });
        }
        if (!entry || !HH_MM_RE.test(entry.time)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['perRow', key, 'time'],
            message: 'Use 24h HH:MM',
          });
        }
      }
    }
  });

export type MultiRescheduleFormValues = z.infer<typeof multiRescheduleFormSchema>;

export const MULTI_RESCHEDULE_UPCOMING_EXCLUDED_STATUSES: readonly Appointment['status'][] =
  ['completed', 'paid', 'cancelled', 'created'] as const;

export function filterUpcomingForMultiReschedule(
  appointments: Appointment[] | undefined | null,
): Appointment[] {
  if (!appointments) return [];
  const excluded = new Set<Appointment['status']>(
    MULTI_RESCHEDULE_UPCOMING_EXCLUDED_STATUSES,
  );
  return appointments
    .filter((a) => !excluded.has(a.status))
    .filter((a) => a.scheduled_date && a.scheduled_time)
    .sort((a, b) => {
      const da = a.scheduled_date ?? '';
      const db = b.scheduled_date ?? '';
      return da.localeCompare(db);
    });
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function MultiRescheduleScreen() {
  const router = useRouter();
  const {
    data: allAppointments,
    isPending,
    isError,
    refetch,
  } = useAppointments();
  const createSession = useCreateReorganizationSession();

  const upcoming = useMemo(
    () => filterUpcomingForMultiReschedule(allAppointments),
    [allAppointments],
  );

  const form = useForm<MultiRescheduleFormValues>({
    resolver: zodResolver(multiRescheduleFormSchema),
    defaultValues: {
      mode: 'shared',
      selected: [],
      shared: { date: '', time: '' },
      perRow: {},
    },
    mode: 'onSubmit',
  });

  const { control, handleSubmit, watch, setValue, formState } = form;
  const mode = watch('mode');
  const selected = watch('selected');
  const perRow = watch('perRow');

  const [linterBuckets, setLinterBuckets] =
    useState<BucketedLinterIssues | null>(null);
  const [genericError, setGenericError] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/customer');
    }
  }, [router]);

  const toggleSelected = useCallback(
    (id: number) => {
      setLinterBuckets(null);
      setGenericError(null);
      const next = selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id];
      setValue('selected', next, { shouldDirty: true, shouldValidate: false });
      if (mode === 'per_row' && !selected.includes(id)) {
        const appt = upcoming.find((a) => a.id === id);
        const seeded = perRow[String(id)] ?? {
          date: appt?.scheduled_date ?? '',
          time: appt?.scheduled_time ?? '',
        };
        setValue('perRow', { ...perRow, [String(id)]: seeded });
      }
    },
    [mode, perRow, selected, setValue, upcoming],
  );

  const toggleMode = useCallback(
    (next: 'shared' | 'per_row') => {
      if (next === mode) return;
      setLinterBuckets(null);
      setValue('mode', next, { shouldValidate: false });
      if (next === 'per_row') {
        // Seed per-row entries from the appointment's current date/time
        // so a customer who just wants to adjust one in the group
        // doesn't have to re-type every other row.
        const seeded: Record<string, { date: string; time: string }> = {};
        for (const id of selected) {
          const existing = perRow[String(id)];
          if (existing) {
            seeded[String(id)] = existing;
            continue;
          }
          const appt = upcoming.find((a) => a.id === id);
          seeded[String(id)] = {
            date: appt?.scheduled_date ?? '',
            time: appt?.scheduled_time ?? '',
          };
        }
        setValue('perRow', seeded);
      }
    },
    [mode, perRow, selected, setValue, upcoming],
  );

  const onSubmit = useCallback(
    (values: MultiRescheduleFormValues) => {
      setLinterBuckets(null);
      setGenericError(null);
      const selectedAppointments = values.selected
        .map((id) => upcoming.find((a) => a.id === id))
        .filter((a): a is Appointment => a != null);
      if (selectedAppointments.length === 0) return;

      const intents = selectedAppointments.map((appt) => {
        if (values.mode === 'shared') {
          return buildRescheduleIntent(
            appt,
            values.shared.date,
            values.shared.time,
          );
        }
        const row = values.perRow[String(appt.id)];
        return buildRescheduleIntent(appt, row.date, row.time);
      });

      createSession.mutate(
        { intents },
        {
          onSuccess: (result) => {
            if (result.autoCommitted) {
              Alert.alert(
                'Scheduled',
                `Your ${intents.length === 1 ? 'appointment has' : `${intents.length} appointments have`} been updated.`,
                [{ text: 'OK', onPress: handleClose }],
              );
              return;
            }
            // Common case for customer_authored_multi per §2.5:
            // the session landed as pending_review and the customer
            // should see it in the approval inbox.
            Alert.alert(
              'Submitted for franchise review',
              "We've sent your requested changes for review. You'll be notified when your franchise team responds.",
              [
                {
                  text: 'View in inbox',
                  onPress: () => {
                    // Expo Router's auto-generated typed-routes map for
                    // modal-presented screens isn't always inferred; the
                    // `as never` cast matches the sibling inbox wiring
                    // (app/inbox/approvals.tsx). Runtime path is correct.
                    router.replace('/customer/inbox/approvals' as never);
                  },
                },
                { text: 'Done', onPress: handleClose },
              ],
            );
          },
          onError: (error) => {
            // 422 from the linter → bucket by appointment for the
            // per-row error surface. Other errors get a generic
            // error block with Retry (no offline queue per override #4).
            const linter = extractLinterRejection(error);
            if (linter) {
              setLinterBuckets(bucketLinterIssuesByAppointment(linter.issues));
              return;
            }
            setGenericError(
              "We couldn't submit your changes. Check your connection and try again.",
            );
          },
        },
      );
    },
    [createSession, handleClose, router, upcoming],
  );

  // --- Render branches ------------------------------------------------------

  if (isPending) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Header onClose={handleClose} />
        <ActivityIndicator
          color={Theme.colors.primary}
          style={styles.loader}
          testID="multi-reschedule-loader"
        />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Header onClose={handleClose} />
        <EmptyState
          title="Couldn't load your appointments"
          message="We're having trouble reaching the server. Check your connection and try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </SafeAreaView>
    );
  }

  if (upcoming.length < 2) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Header onClose={handleClose} />
        <EmptyState
          title="Not enough upcoming appointments"
          message="You need at least two upcoming appointments to reschedule multiple at once."
          actionLabel="Close"
          onAction={handleClose}
        />
      </SafeAreaView>
    );
  }

  const selectedErrorMessage =
    formState.errors.selected?.message ?? null;
  const sharedDateError =
    mode === 'shared' ? formState.errors.shared?.date?.message : null;
  const sharedTimeError =
    mode === 'shared' ? formState.errors.shared?.time?.message : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Header onClose={handleClose} />

      <FlatList
        ListHeaderComponent={
          <View>
            <Text style={styles.intro}>
              Pick the appointments you&apos;d like to move, then choose
              whether they should all move to the same time or set a
              new time per appointment.
            </Text>
            <Text style={styles.helperCopy}>
              Changes go to your franchise team for review before they
              take effect.
            </Text>

            <ModeToggle mode={mode} onChange={toggleMode} />

            {mode === 'shared' ? (
              <SharedTimeInputs
                control={control}
                dateError={sharedDateError}
                timeError={sharedTimeError}
              />
            ) : null}

            {linterBuckets && linterBuckets.unassigned.length > 0 ? (
              <LinterIssueBlock
                title="Can't move these appointments together"
                issues={linterBuckets.unassigned}
                testID="multi-reschedule-unassigned-linter"
              />
            ) : null}

            {selectedErrorMessage ? (
              <Text style={styles.selectionError}>{selectedErrorMessage}</Text>
            ) : null}
          </View>
        }
        data={upcoming}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => {
          const rowIssues = linterBuckets?.byAppointmentId.get(item.id) ?? [];
          const rowPerRowErrors = formState.errors.perRow?.[
            String(item.id)
          ] as
            | {
                date?: { message?: string };
                time?: { message?: string };
              }
            | undefined;
          return (
            <AppointmentRow
              appointment={item}
              selected={selected.includes(item.id)}
              mode={mode}
              onToggle={() => toggleSelected(item.id)}
              control={control}
              rowIssues={rowIssues}
              dateError={rowPerRowErrors?.date?.message ?? null}
              timeError={rowPerRowErrors?.time?.message ?? null}
            />
          );
        }}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.listContent}
      />

      <View style={styles.footer}>
        {genericError ? (
          <Text style={styles.genericError} testID="multi-reschedule-generic-error">
            {genericError}
          </Text>
        ) : null}
        <TouchableOpacity
          style={[
            styles.primaryBtn,
            (createSession.isPending || selected.length === 0) &&
              styles.primaryBtnDisabled,
          ]}
          onPress={handleSubmit(onSubmit)}
          disabled={createSession.isPending}
          activeOpacity={0.85}
          testID="multi-reschedule-submit-btn"
        >
          {createSession.isPending ? (
            <ActivityIndicator size="small" color={Theme.colors.white} />
          ) : (
            <Text style={styles.primaryBtnText}>
              Continue ({selected.length})
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Header({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>Reschedule multiple</Text>
      <Pressable
        onPress={onClose}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Close"
        testID="multi-reschedule-close-button"
      >
        <IconSymbol name="xmark" size={22} color={Theme.colors.text} />
      </Pressable>
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

interface ModeToggleProps {
  mode: 'shared' | 'per_row';
  onChange: (mode: 'shared' | 'per_row') => void;
}

function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <View style={styles.modeRow}>
      <TouchableOpacity
        style={[styles.modeBtn, mode === 'shared' && styles.modeBtnActive]}
        onPress={() => onChange('shared')}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityState={{ selected: mode === 'shared' }}
        testID="multi-reschedule-mode-shared"
      >
        <Text
          style={[
            styles.modeBtnText,
            mode === 'shared' && styles.modeBtnTextActive,
          ]}
        >
          Same time for all
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.modeBtn, mode === 'per_row' && styles.modeBtnActive]}
        onPress={() => onChange('per_row')}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityState={{ selected: mode === 'per_row' }}
        testID="multi-reschedule-mode-per-row"
      >
        <Text
          style={[
            styles.modeBtnText,
            mode === 'per_row' && styles.modeBtnTextActive,
          ]}
        >
          Custom per appointment
        </Text>
      </TouchableOpacity>
    </View>
  );
}

interface SharedTimeInputsProps {
  control: ReturnType<typeof useForm<MultiRescheduleFormValues>>['control'];
  dateError: string | null | undefined;
  timeError: string | null | undefined;
}

function SharedTimeInputs({
  control,
  dateError,
  timeError,
}: SharedTimeInputsProps) {
  return (
    <View style={styles.sharedBlock}>
      <Text style={styles.sharedLabel}>Move all to</Text>
      <View style={styles.sharedRow}>
        <View style={styles.sharedField}>
          <Text style={styles.fieldLabel}>Date</Text>
          <Controller
            control={control}
            name="shared.date"
            render={({ field }) => (
              <TextInput
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Theme.colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.input,
                  dateError ? styles.inputError : null,
                ]}
                testID="multi-reschedule-shared-date"
              />
            )}
          />
          {dateError ? (
            <Text style={styles.fieldError}>{dateError}</Text>
          ) : null}
        </View>
        <View style={styles.sharedField}>
          <Text style={styles.fieldLabel}>Time</Text>
          <Controller
            control={control}
            name="shared.time"
            render={({ field }) => (
              <TextInput
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                placeholder="HH:MM (24h)"
                placeholderTextColor={Theme.colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.input,
                  timeError ? styles.inputError : null,
                ]}
                testID="multi-reschedule-shared-time"
              />
            )}
          />
          {timeError ? (
            <Text style={styles.fieldError}>{timeError}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

interface AppointmentRowProps {
  appointment: Appointment;
  selected: boolean;
  mode: 'shared' | 'per_row';
  onToggle: () => void;
  control: ReturnType<typeof useForm<MultiRescheduleFormValues>>['control'];
  rowIssues: LinterIssueSummary[];
  dateError: string | null;
  timeError: string | null;
}

function AppointmentRow({
  appointment,
  selected,
  mode,
  onToggle,
  control,
  rowIssues,
  dateError,
  timeError,
}: AppointmentRowProps) {
  const subtitle = `${formatScheduledDate(appointment.scheduled_date)} at ${formatScheduledTime(appointment.scheduled_time)}`;
  const vehicleLabel = formatVehicleSummary(appointment);
  return (
    <View
      style={[styles.row, selected && styles.rowSelected]}
      testID={`multi-reschedule-row-${appointment.id}`}
    >
      <TouchableOpacity
        style={styles.rowHeader}
        activeOpacity={0.75}
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        testID={`multi-reschedule-toggle-${appointment.id}`}
      >
        <View
          style={[styles.checkbox, selected && styles.checkboxChecked]}
          testID={`multi-reschedule-checkbox-${appointment.id}`}
        >
          {selected ? (
            <Ionicons name="checkmark" size={16} color={Theme.colors.white} />
          ) : null}
        </View>
        <View style={styles.rowTextBlock}>
          <Text style={styles.rowTitle}>{vehicleLabel}</Text>
          <Text style={styles.rowSubtitle}>{subtitle}</Text>
        </View>
      </TouchableOpacity>

      {selected && mode === 'per_row' ? (
        <View style={styles.perRowInputs}>
          <View style={styles.perRowField}>
            <Text style={styles.fieldLabel}>New date</Text>
            <Controller
              control={control}
              name={`perRow.${appointment.id}.date` as const}
              render={({ field }) => (
                <TextInput
                  value={field.value ?? ''}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Theme.colors.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[
                    styles.input,
                    dateError ? styles.inputError : null,
                  ]}
                  testID={`multi-reschedule-row-date-${appointment.id}`}
                />
              )}
            />
            {dateError ? (
              <Text style={styles.fieldError}>{dateError}</Text>
            ) : null}
          </View>
          <View style={styles.perRowField}>
            <Text style={styles.fieldLabel}>New time</Text>
            <Controller
              control={control}
              name={`perRow.${appointment.id}.time` as const}
              render={({ field }) => (
                <TextInput
                  value={field.value ?? ''}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="HH:MM (24h)"
                  placeholderTextColor={Theme.colors.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[
                    styles.input,
                    timeError ? styles.inputError : null,
                  ]}
                  testID={`multi-reschedule-row-time-${appointment.id}`}
                />
              )}
            />
            {timeError ? (
              <Text style={styles.fieldError}>{timeError}</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {rowIssues.length > 0 ? (
        <LinterIssueBlock
          title="Can't move this appointment"
          issues={rowIssues}
          testID={`multi-reschedule-row-linter-${appointment.id}`}
        />
      ) : null}
    </View>
  );
}

interface LinterIssueBlockProps {
  title: string;
  issues: LinterIssueSummary[];
  testID: string;
}

function LinterIssueBlock({ title, issues, testID }: LinterIssueBlockProps) {
  return (
    <View style={styles.linterBlock} testID={testID}>
      <View style={styles.linterHeader}>
        <Ionicons
          name="warning-outline"
          size={18}
          color={Theme.colors.warning}
        />
        <Text style={styles.linterTitle}>{title}</Text>
      </View>
      {issues.slice(0, 5).map((issue, idx) => (
        <Text key={idx} style={styles.linterIssue}>
          • {issue.humanMessage}
        </Text>
      ))}
    </View>
  );
}

/**
 * One-line vehicle summary for a row. Falls back to "Appointment #N"
 * when the appointment response didn't hydrate the `vehicle` relation.
 */
export function formatVehicleSummary(appointment: Appointment): string {
  const v = appointment.vehicle;
  if (!v) return `Appointment #${appointment.id}`;
  const parts = [v.year ?? null, v.make, v.model].filter(Boolean);
  if (parts.length === 0) return `Appointment #${appointment.id}`;
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.sm,
    paddingBottom: Theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.colors.borderLight,
  },
  headerTitle: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  loader: {
    marginTop: Theme.spacing.xl,
  },
  intro: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.md,
  },
  helperCopy: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.xs,
    paddingBottom: Theme.spacing.md,
  },
  modeRow: {
    flexDirection: 'row',
    marginHorizontal: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.md,
    padding: 3,
    gap: 2,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Theme.borderRadius.sm,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: Theme.colors.primary,
    ...Theme.shadow.sm,
  },
  modeBtnText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
  modeBtnTextActive: {
    color: Theme.colors.white,
  },
  sharedBlock: {
    marginHorizontal: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
    padding: Theme.spacing.md,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
  },
  sharedLabel: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Theme.spacing.sm,
  },
  sharedRow: {
    flexDirection: 'row',
    gap: Theme.spacing.sm,
  },
  sharedField: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    marginBottom: 4,
  },
  input: {
    backgroundColor: Theme.colors.white,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    paddingVertical: 10,
    paddingHorizontal: Theme.spacing.sm,
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
  },
  inputError: {
    borderColor: Theme.colors.error,
  },
  fieldError: {
    color: Theme.colors.error,
    fontSize: Theme.fontSize.xs,
    marginTop: 4,
  },
  selectionError: {
    color: Theme.colors.error,
    fontSize: Theme.fontSize.sm,
    paddingHorizontal: Theme.spacing.md,
    paddingBottom: Theme.spacing.sm,
  },
  listContent: {
    paddingBottom: Theme.spacing.xl,
  },
  row: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    marginHorizontal: Theme.spacing.md,
    padding: Theme.spacing.md,
    minHeight: 88,
    borderLeftWidth: 4,
    borderLeftColor: Theme.colors.borderLight,
    ...Theme.shadow.sm,
  },
  rowSelected: {
    borderLeftColor: Theme.colors.primary,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  rowTextBlock: {
    flex: 1,
  },
  rowTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  rowSubtitle: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  perRowInputs: {
    marginTop: Theme.spacing.sm,
    flexDirection: 'row',
    gap: Theme.spacing.sm,
  },
  perRowField: {
    flex: 1,
  },
  separator: {
    height: Theme.spacing.sm,
  },
  linterBlock: {
    marginTop: Theme.spacing.sm,
    backgroundColor: '#FEFCE8',
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.colors.warning,
  },
  linterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  linterTitle: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  linterIssue: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text,
    marginTop: 2,
  },
  footer: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.md,
    paddingBottom: Theme.spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.colors.borderLight,
    gap: Theme.spacing.sm,
  },
  genericError: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.error,
    textAlign: 'center',
  },
  primaryBtn: {
    backgroundColor: Theme.colors.primary,
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryBtnDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
  },
});
