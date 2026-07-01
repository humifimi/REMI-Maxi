/**
 * P5-CU-5 — Per-session approval action sheet.
 *
 * Opened from the inbox row tap (D.4 / P5-CU-2). Renders the full
 * intent list for one pending reorganization session and surfaces three
 * CTAs at the bottom (master plan §5.4.4):
 *
 *   - **Approve** → POST `/customer/reorganizations/:id/respond`
 *     `{ action: 'approve' }`. On 200 the action sheet closes and the
 *     pending-list query is invalidated. On 422 (linter caught a
 *     regression since the session was minted) we render the linter
 *     issues inline above the CTAs and keep the sheet open so the user
 *     can decline / counter-propose instead.
 *   - **Decline** → push to `/customer/inbox/approvals/[sessionId]/decline` (D.6
 *     reason picker, P5-CU-6 — not yet shipped). Wiring the navigation
 *     now means the row's primary affordance doesn't have to be
 *     retrofitted in the next chunk; the destination renders the not-
 *     found screen until P5-CU-6 lands. The same pattern was used in
 *     P5-CU-2 to wire this very screen ahead of P5-CU-5.
 *   - **Counter-propose** → opens an inline RescheduleModal-shaped
 *     slot picker, then POSTs `/customer/reorganizations/:id/counter-
 *     propose` with the chosen slot as a single reschedule intent. The
 *     original session's status is **unchanged** per master plan §4.5
 *     ("DO NOT cascade-cancel related_session_id; counter-proposals
 *     are independent and survive the original's denial"). The
 *     customer is still expected to explicitly approve/decline the
 *     original later.
 *
 * Customer-app override #4 (chunk-prompt master prelude): NetInfo /
 * queued mutations are NOT in scope. Approve / decline / counter-
 * propose CTAs surface explicit failure UI on no-connection rather
 * than optimistically resolving — see the `Alert.alert('Network',...)`
 * branches inside each handler's `onError`.
 *
 * Customer-app override #5: a successful GET that returns no session
 * (404 from the BE) is treated as an explicit error, NOT empty —
 * §1.5 C1's silent-empty footgun is exactly the case we have to guard
 * against here ("session was just resolved on another device" should
 * still not look identical to "backend is down").
 *
 * PLAN-DEVIATION: 2026-05-02-no-gorhom-bottom-sheet — same modal-stack
 * pattern that P5-CU-2 used for the inbox surface. The package the
 * master plan references (`@gorhom/bottom-sheet`) is not installed and
 * the providers tree this would need (`BottomSheetModalProvider`) is
 * not mounted; reusing Expo Router's `presentation: 'modal'` is the
 * shipped contract.
 *
 * PLAN-DEVIATION: 2026-05-02-customer-respond-endpoint-shape — the
 * `Approve` and `Decline` CTAs hit `POST .../respond` per master plan
 * §6.2, NOT `POST .../approve` and `POST .../deny` per §8.9 Prompt
 * D.5. Spec body wins per the deviation rule. See
 * `docs/PLAN-DEVIATIONS.md#2026-05-02-customer-respond-endpoint-shape`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { EmptyState } from '@customer/components/shared/empty-state';
import {
  Theme,
  getPendingSourceVisuals,
  type PendingSourceKey,
} from '@customer/constants/colors';
import {
  formatScheduledDate,
  formatScheduledTime,
  toISODate,
} from '@customer/utils/date-format';
import { DEFAULT_FRANCHISE_ID } from '@customer/constants/config';
import { useAppointments } from '@customer/hooks/appointments/use-appointments';
import { useSuggestBooking } from '@customer/hooks/appointments/use-booking';
import {
  extractLinterRejection,
  useCounterProposeReorganizationSession,
  useReorganizationSession,
  useRespondToReorganizationSession,
  type LinterRejection,
} from '@customer/hooks/reorganizations/use-session-detail';
import { formatRelativeTimestamp } from '../approvals';
import type { Appointment, ScoredSuggestion } from '@customer/types/api';
import type {
  CustomerVisibleIntent,
  CustomerVisibleSession,
  ReschedulePayload,
} from '@customer/types/reorganization';

export default function ApprovalSessionDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const sessionId = useMemo(() => {
    const raw = Array.isArray(params.sessionId)
      ? params.sessionId[0]
      : params.sessionId;
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }, [params.sessionId]);

  const { data: session, isPending, isError, refetch } =
    useReorganizationSession(sessionId);
  const { data: appointments } = useAppointments();
  const respondMutation = useRespondToReorganizationSession();
  const counterMutation = useCounterProposeReorganizationSession();

  const [linterRejection, setLinterRejection] = useState<LinterRejection | null>(
    null,
  );
  const [counterTarget, setCounterTarget] =
    useState<CustomerVisibleIntent | null>(null);

  const handleClose = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/customer');
    }
  }, [router]);

  const handleApprove = useCallback(() => {
    if (!sessionId) return;
    setLinterRejection(null);
    respondMutation.mutate(
      { sessionId, action: 'approve' },
      {
        onSuccess: () => {
          handleClose();
        },
        onError: (error) => {
          // 422 from the linter — surface inline. Other errors get a
          // toast (Alert) per customer-app override #4 (no offline
          // tolerance, no optimistic resolve).
          const linter = extractLinterRejection(error);
          if (linter) {
            setLinterRejection(linter);
            return;
          }
          Alert.alert(
            "Couldn't approve",
            "We couldn't reach the server. Check your connection and try again.",
          );
        },
      },
    );
  }, [handleClose, respondMutation, sessionId]);

  const handleDecline = useCallback(() => {
    if (!sessionId) return;
    // D.6 / P5-CU-6 owns the structured-reason picker. Until that
    // route exists this push will hit the not-found screen, but wiring
    // the navigation now means the CTA's primary affordance doesn't
    // have to be retro-fitted in the next chunk. Same pre-wire pattern
    // P5-CU-2 used for THIS screen.
    router.push(`/customer/inbox/approvals/${sessionId}/decline` as never);
  }, [router, sessionId]);

  const reschedulableIntent = useMemo(
    () => session?.intents.find((i) => i.intent_type === 'reschedule') ?? null,
    [session],
  );

  const handleCounterPropose = useCallback(() => {
    if (!reschedulableIntent) return;
    setLinterRejection(null);
    setCounterTarget(reschedulableIntent);
  }, [reschedulableIntent]);

  const handleCounterClose = useCallback(() => setCounterTarget(null), []);
  const handleCounterSubmitted = useCallback(() => {
    setCounterTarget(null);
    handleClose();
  }, [handleClose]);

  if (isPending) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Header title="Pending change" onClose={handleClose} />
        <ActivityIndicator
          color={Theme.colors.primary}
          style={styles.loader}
          testID="session-loader"
        />
      </SafeAreaView>
    );
  }

  if (isError || !session) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Header title="Pending change" onClose={handleClose} />
        <EmptyState
          title="Couldn't load this change"
          message="We're having trouble reaching the server. Check your connection and try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </SafeAreaView>
    );
  }

  const visuals = getPendingSourceVisuals(session.source as PendingSourceKey);
  const timestamp = formatRelativeTimestamp(
    session.finalized_at ?? session.created_at,
  );

  const respondPending =
    respondMutation.isPending || respondMutation.variables?.sessionId === sessionId
      ? respondMutation.isPending
      : false;
  const counterPending = counterMutation.isPending;
  const ctasDisabled = respondPending || counterPending;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Header title="Pending change" onClose={handleClose} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.summaryHeader}>
          <View
            style={[
              styles.sourceBadge,
              { backgroundColor: visuals.background },
            ]}
            testID={`session-source-badge-${session.source}`}
          >
            <Text style={[styles.sourceBadgeLabel, { color: visuals.color }]}>
              {visuals.label}
            </Text>
          </View>
          {timestamp ? <Text style={styles.timestamp}>{timestamp}</Text> : null}
        </View>

        {session.intents.length === 0 ? (
          <EmptyState
            title="No customer-visible changes"
            message="The intents in this session have already been resolved or aren't visible to you."
          />
        ) : (
          <View style={styles.intentList} testID="session-intent-list">
            {session.intents.map((intent) => (
              <IntentRow
                key={intent.id}
                intent={intent}
                appointments={appointments ?? []}
              />
            ))}
          </View>
        )}

        {linterRejection ? (
          <LinterRejectionBlock rejection={linterRejection} />
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.primaryBtn,
            ctasDisabled && styles.primaryBtnDisabled,
          ]}
          onPress={handleApprove}
          disabled={ctasDisabled}
          activeOpacity={0.85}
          testID="session-approve-btn"
        >
          {respondPending && respondMutation.variables?.action === 'approve' ? (
            <ActivityIndicator size="small" color={Theme.colors.white} />
          ) : (
            <Text style={styles.primaryBtnText}>Approve</Text>
          )}
        </TouchableOpacity>

        <View style={styles.secondaryRow}>
          <TouchableOpacity
            style={[
              styles.secondaryBtn,
              ctasDisabled && styles.secondaryBtnDisabled,
            ]}
            onPress={handleDecline}
            disabled={ctasDisabled}
            activeOpacity={0.85}
            testID="session-decline-btn"
          >
            <Text style={styles.secondaryBtnText}>Decline</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.secondaryBtn,
              (ctasDisabled || !reschedulableIntent) && styles.secondaryBtnDisabled,
            ]}
            onPress={handleCounterPropose}
            disabled={ctasDisabled || !reschedulableIntent}
            activeOpacity={0.85}
            testID="session-counter-btn"
          >
            <Text style={styles.secondaryBtnText}>Suggest a different time</Text>
          </TouchableOpacity>
        </View>
      </View>

      {counterTarget && session ? (
        <CounterProposeModal
          visible
          session={session}
          intent={counterTarget}
          appointments={appointments ?? []}
          onClose={handleCounterClose}
          onSubmitted={handleCounterSubmitted}
        />
      ) : null}
    </SafeAreaView>
  );
}

interface HeaderProps {
  title: string;
  onClose: () => void;
}

function Header({ title, onClose }: HeaderProps) {
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>{title}</Text>
      <Pressable
        onPress={onClose}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Close"
        testID="session-close-button"
      >
        <IconSymbol name="xmark" size={22} color={Theme.colors.text} />
      </Pressable>
    </View>
  );
}

interface IntentRowProps {
  intent: CustomerVisibleIntent;
  appointments: Appointment[];
}

function IntentRow({ intent, appointments }: IntentRowProps) {
  const appointment = appointments.find((a) => a.id === intent.appointment_id);
  const summary = describeIntentLong(intent, appointment ?? null);
  const proposedRelative = formatRelativeTimestamp(intent.proposed_at);

  return (
    <View style={styles.intentCard} testID={`session-intent-${intent.id}`}>
      <View style={styles.intentHeader}>
        <Text style={styles.intentKind}>
          {intent.intent_type === 'reschedule' ? 'Reschedule' : 'Cancel'}
        </Text>
        {proposedRelative ? (
          <Text style={styles.timestamp}>Proposed {proposedRelative}</Text>
        ) : null}
      </View>
      <Text style={styles.intentSummary}>{summary}</Text>
      {appointment ? (
        <View style={styles.affectedAppointment}>
          <Ionicons
            name="calendar-outline"
            size={16}
            color={Theme.colors.textSecondary}
          />
          <Text style={styles.affectedAppointmentText}>
            Currently: {formatScheduledDate(appointment.scheduled_date)} at{' '}
            {formatScheduledTime(appointment.scheduled_time)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Long-form intent description used in the detail-row (vs. the inbox
 * row's one-liner from `summarizeIntents`). Includes the new tech id
 * if present and the reschedule's full date+time. Cancel intents echo
 * the cancellation reason (it's a customer-visible field on the
 * payload — master plan §3.8.4 doesn't strip it for the customer
 * source).
 */
export function describeIntentLong(
  intent: CustomerVisibleIntent,
  appointment: Appointment | null,
): string {
  if (intent.payload.kind === 'reschedule') {
    const date = formatScheduledDate(intent.payload.new_scheduled_date);
    const time = formatScheduledTime(intent.payload.new_start_time);
    if (intent.payload.new_technician_id) {
      return `Move to ${date} at ${time} with a new technician.`;
    }
    return `Move to ${date} at ${time}.`;
  }
  if (intent.payload.kind === 'cancel') {
    const apptLabel = appointment?.scheduled_date
      ? `your ${formatScheduledDate(appointment.scheduled_date)} appointment`
      : 'this appointment';
    if (intent.payload.cancellation_reason) {
      return `Cancel ${apptLabel} (${intent.payload.cancellation_reason}).`;
    }
    return `Cancel ${apptLabel}.`;
  }
  return 'Pending change.';
}

interface LinterRejectionBlockProps {
  rejection: LinterRejection;
}

function LinterRejectionBlock({ rejection }: LinterRejectionBlockProps) {
  return (
    <View style={styles.linterBlock} testID="session-linter-rejection">
      <View style={styles.linterHeader}>
        <Ionicons
          name="warning-outline"
          size={20}
          color={Theme.colors.warning}
        />
        <Text style={styles.linterTitle}>
          We couldn&apos;t approve this change
        </Text>
      </View>
      <Text style={styles.linterBody}>
        Something else changed since this was proposed. Please decline or
        suggest a different time.
      </Text>
      {rejection.issues.slice(0, 5).map((issue, idx) => (
        <Text key={idx} style={styles.linterIssue}>
          • {summarizeLinterIssue(issue)}
        </Text>
      ))}
    </View>
  );
}

/**
 * Render a `LinterIssue` into a single human line. The `LinterIssue`
 * type lives in REMIBackend / REMITechnician — we deliberately keep
 * REMICustomer ignorant of the full shape (it's not exported across
 * repos) and rely on the BE shipping a `message` string. Falls back
 * to JSON when the shape is unrecognized so the customer at least
 * sees the issue exists rather than silently dropping it.
 */
export function summarizeLinterIssue(issue: unknown): string {
  if (issue && typeof issue === 'object' && 'message' in issue) {
    const msg = (issue as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.length > 0) return msg;
  }
  return 'A scheduling conflict was detected.';
}

// --- Counter-propose modal -------------------------------------------------

const COUNTER_PROPOSE_WINDOW_DAYS = 7;

interface CounterProposeModalProps {
  visible: boolean;
  session: CustomerVisibleSession;
  intent: CustomerVisibleIntent;
  appointments: Appointment[];
  onClose: () => void;
  onSubmitted: () => void;
}

function CounterProposeModal({
  visible,
  session,
  intent,
  appointments,
  onClose,
  onSubmitted,
}: CounterProposeModalProps) {
  const appointment = appointments.find((a) => a.id === intent.appointment_id);
  const suggest = useSuggestBooking();
  const counterMutation = useCounterProposeReorganizationSession();
  const [picked, setPicked] = useState<number | null>(null);

  // Re-fetch suggestions every time the modal opens. The booking-suggest
  // hook is a mutation (not a query), so it's idempotent at the call
  // site but won't auto-fire — we fire it in the visibility effect.
  useEffect(() => {
    if (!visible) {
      setPicked(null);
      return;
    }
    const today = new Date();
    const end = new Date(today);
    end.setDate(today.getDate() + COUNTER_PROPOSE_WINDOW_DAYS);
    suggest.mutate({
      serviceIds: appointment?.services?.map((s) => s.service_id) ?? [],
      vehicleId: appointment?.vehicle_id ?? undefined,
      addressId: appointment?.address_id ?? 0,
      preferredDateStart: toISODate(today),
      preferredDateEnd: toISODate(end),
      franchiseId: appointment?.franchise_id ?? DEFAULT_FRANCHISE_ID,
    });
    // suggest.mutate is referentially stable across renders; intentionally
    // only re-firing on `visible` and the appointment fixture identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, appointment?.id]);

  // Stable identity across renders so the `handleConfirm` useCallback
  // doesn't re-bind on every parent render (lint: react-hooks/exhaustive-deps).
  const slots: ScoredSuggestion[] = useMemo(
    () => suggest.data ?? [],
    [suggest.data],
  );

  const handleConfirm = useCallback(() => {
    if (picked == null) return;
    const slot = slots[picked];
    if (!slot) return;
    const newEndTime = computeNewEndTime(slot.timeSlot, appointment);
    const newIntent: ReschedulePayload = {
      kind: 'reschedule',
      appointment_id: intent.appointment_id ?? appointment?.id ?? 0,
      new_scheduled_date: slot.date,
      new_start_time: slot.timeSlot,
      new_end_time: newEndTime,
      new_technician_id: slot.technicianId,
    };
    counterMutation.mutate(
      { sessionId: session.id, initialIntents: [newIntent] },
      {
        onSuccess: () => {
          onSubmitted();
        },
        onError: () => {
          Alert.alert(
            "Couldn't send your suggestion",
            "We couldn't reach the server. Check your connection and try again.",
          );
        },
      },
    );
  }, [appointment, counterMutation, intent, onSubmitted, picked, session.id, slots]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Suggest a different time</Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
            testID="counter-close-button"
          >
            <IconSymbol name="xmark" size={22} color={Theme.colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.modalSubtitle}>
            Pick a date and time that works better for you. The
            {'\n'}franchise team will review your suggestion.
          </Text>

          {suggest.isPending ? (
            <ActivityIndicator
              color={Theme.colors.primary}
              style={styles.loader}
              testID="counter-loader"
            />
          ) : slots.length === 0 ? (
            <EmptyState
              title="No available slots"
              message={`We couldn't find an open slot in the next ${COUNTER_PROPOSE_WINDOW_DAYS} days. Try declining instead.`}
            />
          ) : (
            <View style={styles.slotList}>
              {slots.map((s, index) => {
                const isSelected = picked === index;
                return (
                  <TouchableOpacity
                    key={`${s.technicianId}-${s.date}-${s.timeSlot}`}
                    style={[
                      styles.slotCard,
                      isSelected && styles.slotCardSelected,
                    ]}
                    onPress={() => setPicked(index)}
                    activeOpacity={0.85}
                    testID={`counter-slot-${index}`}
                  >
                    <View style={styles.slotHeader}>
                      <Text style={styles.slotDate}>
                        {formatScheduledDate(s.date)}
                      </Text>
                      <Text
                        style={[
                          styles.slotTime,
                          isSelected && { color: Theme.colors.primary },
                        ]}
                      >
                        {formatScheduledTime(s.timeSlot)}
                      </Text>
                    </View>
                    <View style={styles.slotMeta}>
                      <Ionicons
                        name="person-circle-outline"
                        size={18}
                        color={Theme.colors.textSecondary}
                      />
                      <Text style={styles.slotMetaText}>
                        {s.technicianName}
                      </Text>
                      {isSelected ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={Theme.colors.primary}
                        />
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              (picked == null || counterMutation.isPending) &&
                styles.primaryBtnDisabled,
            ]}
            disabled={picked == null || counterMutation.isPending}
            onPress={handleConfirm}
            activeOpacity={0.85}
            testID="counter-submit-btn"
          >
            {counterMutation.isPending ? (
              <ActivityIndicator size="small" color={Theme.colors.white} />
            ) : (
              <Text style={styles.primaryBtnText}>Send suggestion</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/**
 * Derive a reasonable `new_end_time` for the counter-propose intent
 * from the picked slot + the appointment's existing service durations.
 * Mirrors `useRescheduleAppointment`'s `addMinutesToTimeOfDay` /
 * `totalServiceMinutes` helpers — kept inline here so the modal does
 * not depend on the appointments hook's internal helpers.
 */
const DEFAULT_APPOINTMENT_DURATION_MIN = 60;

export function computeNewEndTime(
  startTime: string,
  appointment: Appointment | null | undefined,
): string {
  const services = appointment?.services ?? [];
  const sum = services.reduce(
    (acc, s) => acc + (s.service?.duration_minutes ?? 0),
    0,
  );
  const minutes = sum > 0 ? sum : DEFAULT_APPOINTMENT_DURATION_MIN;
  const [hStr, mStr] = startTime.split(':');
  const base = (Number(hStr) || 0) * 60 + (Number(mStr) || 0);
  const total = ((base + minutes) % (24 * 60) + 24 * 60) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m}`;
}

// --- Styles ----------------------------------------------------------------

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
  scrollContent: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.md,
    paddingBottom: Theme.spacing.xl,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Theme.spacing.md,
  },
  sourceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Theme.borderRadius.full,
    alignSelf: 'flex-start',
  },
  sourceBadgeLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  timestamp: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
  },
  intentList: {
    gap: Theme.spacing.sm,
  },
  intentCard: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    borderLeftWidth: 4,
    borderLeftColor: Theme.colors.warning,
    padding: Theme.spacing.md,
    ...Theme.shadow.md,
  },
  intentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.spacing.xs,
  },
  intentKind: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
    color: Theme.colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  intentSummary: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
    fontWeight: '500',
    marginBottom: 6,
  },
  affectedAppointment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  affectedAppointmentText: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
  },
  linterBlock: {
    marginTop: Theme.spacing.lg,
    backgroundColor: '#FEFCE8',
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.colors.warning,
  },
  linterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  linterTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  linterBody: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginBottom: Theme.spacing.sm,
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
  secondaryRow: {
    flexDirection: 'row',
    gap: Theme.spacing.sm,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: Theme.colors.surface,
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.colors.border,
    minHeight: 48,
  },
  secondaryBtnDisabled: {
    opacity: 0.5,
  },
  secondaryBtnText: {
    color: Theme.colors.text,
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.textSecondary,
    marginBottom: Theme.spacing.md,
  },
  slotList: {
    gap: Theme.spacing.sm,
  },
  slotCard: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 2,
    borderColor: Theme.colors.borderLight,
    ...Theme.shadow.md,
  },
  slotCardSelected: {
    borderColor: Theme.colors.primary,
    backgroundColor: '#EFF6FF',
  },
  slotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  slotDate: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  slotTime: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  slotMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  slotMetaText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    flex: 1,
  },
});
