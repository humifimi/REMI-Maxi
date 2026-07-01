import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  APPOINTMENT_TIMELINE_ORDER,
  APPOINTMENT_STATUS_LABELS,
  AppointmentStatus,
} from '@customer/types/enums';
import { getStatusColor, Theme } from '@customer/constants/colors';
import { DEFAULT_FRANCHISE_ID } from '@customer/constants/config';
import {
  useAppointments,
  useRescheduleAppointment,
  useCancelAppointment,
  useAddServiceToAppointment,
} from '@customer/hooks/appointments/use-appointments';
import { useBookingETA, useBookingTracking, useSuggestBooking } from '@customer/hooks/appointments/use-booking';
import { useServices } from '@customer/hooks/services/use-services';
import { useRealtimeLocation } from '@customer/hooks/utility/use-realtime';
import { EmptyState } from '@customer/components/shared/empty-state';
import { AppointmentDetailSkeleton } from '@customer/components/shared/skeleton';
import { ServiceCard } from '@customer/components/service/service-card';
import { formatVehicleDisplayTitle } from '@customer/utils/vehicle-display';
import { formatDateShort as formatDateDisplay, formatTime as formatTimeDisplay, toISODate } from '@customer/utils/date-format';
import { TrackingMap } from '@customer/components/appointment/tracking-map';
import { successHaptic, warningHaptic, selectionTap } from '@customer/services/haptics';
import { useBookingStore } from '@/src/stores/customer/booking';
import { AppointmentPickerModal } from '@customer/components/appointment/appointment-picker-modal';
import { useMyReferrals } from '@customer/hooks/referrals/use-referrals';
import { REFERRAL_STATUS_LABELS, ReferralStatus } from '@customer/types/enums';
import { useStartConversation } from '@customer/hooks/communication/use-messages';
import type { Appointment, Service, ScoredSuggestion } from '@customer/types/api';

const RESCHEDULE_ELIGIBLE: string[] = [
  AppointmentStatus.CREATED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.ACCEPTED,
];

const CANCEL_REASONS = [
  'Schedule conflict',
  'Found another provider',
  'Vehicle issue resolved',
  'Cost concerns',
  'Moving / relocation',
  'Other',
] as const;

function getCurrentTimelineIndex(status: AppointmentStatus): number {
  switch (status) {
    case AppointmentStatus.CREATED:
      return 0;
    case AppointmentStatus.CONFIRMED:
    case AppointmentStatus.ACCEPTED:
      return 1;
    case AppointmentStatus.EN_ROUTE:
      return 2;
    case AppointmentStatus.ARRIVED:
    case AppointmentStatus.IN_PROGRESS:
    case AppointmentStatus.WRAP_UP:
      return 3;
    case AppointmentStatus.COMPLETED:
      return 4;
    case AppointmentStatus.PAID:
      return 5;
    case AppointmentStatus.CANCELLED:
      return -1;
    default:
      return 0;
  }
}


function PulseDot() {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View style={[styles.dotCurrentOuter, { transform: [{ scale: pulse }] }]}>
      <View style={styles.dotCurrentInner} />
    </Animated.View>
  );
}

function ETABanner({ etaMinutes, distanceMi }: { etaMinutes: number; distanceMi: number | null }) {
  const pulse = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.85, duration: 1200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.etaBanner}>
      <View style={styles.etaIconRow}>
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <View style={styles.etaIconCircle}>
            <Ionicons name="car" size={24} color={Theme.colors.white} />
          </View>
        </Animated.View>
      </View>
      <Text style={styles.etaHeadline}>
        Your technician is {etaMinutes} {etaMinutes === 1 ? 'minute' : 'minutes'} away
      </Text>
      <Text style={styles.etaSubtext}>
        {distanceMi != null ? `${distanceMi.toFixed(1)} mi away` : "Distance unavailable"} &middot; Updates every 30s
      </Text>
    </View>
  );
}

function RescheduleModal({
  visible,
  appointment,
  onClose,
  onConfirmed,
}: {
  visible: boolean;
  appointment: Appointment;
  onClose: () => void;
  onConfirmed: (oldDate: string, oldTime: string, newDate: string, newTime: string) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmedOldDate, setConfirmedOldDate] = useState('');
  const [confirmedOldTime, setConfirmedOldTime] = useState('');
  const [confirmedNewDate, setConfirmedNewDate] = useState('');
  const [confirmedNewTime, setConfirmedNewTime] = useState('');

  const suggest = useSuggestBooking();
  const reschedule = useRescheduleAppointment();

  useEffect(() => {
    if (!visible) {
      setPicked(null);
      setShowConfirmation(false);
      return;
    }
    const today = new Date();
    const end = new Date(today);
    end.setDate(today.getDate() + 7);
    suggest.mutate({
      serviceIds: appointment.services?.map((s) => s.service_id) ?? [],
      vehicleId: appointment.vehicle_id ?? undefined,
      addressId: appointment.address_id ?? 0,
      preferredDateStart: toISODate(today),
      preferredDateEnd: toISODate(end),
      franchiseId: appointment.franchise_id ?? DEFAULT_FRANCHISE_ID,
    });
  }, [visible]);

  const slots: ScoredSuggestion[] = suggest.data ?? [];

  const handleConfirm = useCallback(() => {
    if (picked == null) return;
    const slot = slots[picked];
    if (!slot) return;

    reschedule.mutate(
      {
        appointmentId: appointment.id,
        body: { scheduledDate: slot.date, scheduledTime: slot.timeSlot },
      },
      {
        onSuccess: (res) => {
          successHaptic();
          // P5-CU-3: when the franchise's reorganization policy required FO
          // review (`requiresApproval`), the session was minted as
          // `pending_review` rather than auto-committing. Show the toast
          // copy from the chunk prompt and close optimistically; the
          // appointment will move once the FO approves.
          if (res.requiresApproval) {
            Alert.alert(
              'Request submitted',
              "You'll get a notification when it's confirmed.",
            );
            onClose();
            return;
          }
          setConfirmedOldDate(res.oldDate ?? appointment.scheduled_date ?? '');
          setConfirmedOldTime(res.oldTime ?? appointment.scheduled_time ?? '');
          setConfirmedNewDate(res.newDate ?? slot.date);
          setConfirmedNewTime(res.newTime ?? slot.timeSlot);
          setShowConfirmation(true);
        },
        onError: () => {
          Alert.alert('Reschedule failed', 'Could not reschedule your appointment. Please try again.');
        },
      },
    );
  }, [picked, slots, appointment, reschedule]);

  const handleDone = useCallback(() => {
    onConfirmed(confirmedOldDate, confirmedOldTime, confirmedNewDate, confirmedNewTime);
    onClose();
  }, [confirmedOldDate, confirmedOldTime, confirmedNewDate, confirmedNewTime, onConfirmed, onClose]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{showConfirmation ? 'Rescheduled' : 'Reschedule'}</Text>
          <Pressable onPress={showConfirmation ? handleDone : onClose} hitSlop={12}>
            <Ionicons name="close-circle" size={28} color={Theme.colors.textTertiary} />
          </Pressable>
        </View>

        {showConfirmation ? (
          <View style={styles.confirmationBody}>
            <View style={styles.confirmationIcon}>
              <Ionicons name="checkmark-circle" size={64} color={Theme.colors.success} />
            </View>
            <Text style={styles.confirmationHeadline}>Appointment rescheduled</Text>
            <View style={styles.timeCompare}>
              <View style={styles.timeBox}>
                <Text style={styles.timeBoxLabel}>Previous</Text>
                <Text style={styles.timeBoxDate}>{formatDateDisplay(confirmedOldDate)}</Text>
                <Text style={styles.timeBoxTime}>{formatTimeDisplay(confirmedOldTime)}</Text>
              </View>
              <Ionicons name="arrow-forward" size={24} color={Theme.colors.primary} />
              <View style={[styles.timeBox, styles.timeBoxNew]}>
                <Text style={styles.timeBoxLabel}>New</Text>
                <Text style={[styles.timeBoxDate, { color: Theme.colors.primary }]}>
                  {formatDateDisplay(confirmedNewDate)}
                </Text>
                <Text style={[styles.timeBoxTime, { color: Theme.colors.primary }]}>
                  {formatTimeDisplay(confirmedNewTime)}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleDone} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalSubtitle}>Pick a new date and time</Text>

              {suggest.isPending ? (
                <View style={styles.loadingBlock}>
                  {[0, 1, 2].map((i) => (
                    <View key={i} style={styles.skeletonSlot}>
                      <View style={styles.skeletonLine} />
                      <View style={[styles.skeletonLine, styles.skeletonShort]} />
                    </View>
                  ))}
                </View>
              ) : slots.length === 0 ? (
                <View style={styles.emptySlots}>
                  <Ionicons name="calendar-outline" size={32} color={Theme.colors.textTertiary} />
                  <Text style={styles.emptySlotsText}>
                    No available slots in the next 7 days. Try again later.
                  </Text>
                </View>
              ) : (
                slots.map((s, index) => {
                  const isSelected = picked === index;
                  return (
                    <TouchableOpacity
                      key={`${s.technicianId}-${s.date}-${s.timeSlot}`}
                      style={[styles.slotCard, isSelected && styles.slotCardSelected]}
                      onPress={() => {
                        selectionTap();
                        setPicked(index);
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={styles.slotHeader}>
                        <Text style={styles.slotDate}>{formatDateDisplay(s.date)}</Text>
                        <Text style={[styles.slotTime, isSelected && { color: Theme.colors.primary }]}>
                          {formatTimeDisplay(s.timeSlot)}
                        </Text>
                      </View>
                      <View style={styles.slotTechRow}>
                        <Ionicons name="person-circle-outline" size={22} color={Theme.colors.textSecondary} />
                        <Text style={styles.slotTechName}>{s.technicianName}</Text>
                        <Text style={styles.slotDrive}>~{s.estimatedDriveMinutes} min</Text>
                        {isSelected ? (
                          <Ionicons name="checkmark-circle" size={22} color={Theme.colors.primary} />
                        ) : (
                          <Ionicons name="ellipse-outline" size={22} color={Theme.colors.border} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.primaryBtn, (picked == null || reschedule.isPending) && styles.primaryBtnDisabled]}
                disabled={picked == null || reschedule.isPending}
                onPress={handleConfirm}
                activeOpacity={0.85}
              >
                {reschedule.isPending ? (
                  <ActivityIndicator size="small" color={Theme.colors.white} />
                ) : (
                  <Text style={styles.primaryBtnText}>Confirm new time</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function CancelModal({
  visible,
  appointmentId,
  onClose,
  onCancelled,
}: {
  visible: boolean;
  appointmentId: number;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const cancelMutation = useCancelAppointment();

  useEffect(() => {
    if (!visible) setSelectedReason(null);
  }, [visible]);

  const handleConfirm = useCallback(() => {
    if (!selectedReason) return;
    cancelMutation.mutate(
      { appointmentId, body: { reason: selectedReason } },
      {
        onSuccess: (res) => {
          warningHaptic();
          // P5-CU-3: pending_review path mirrors the reschedule modal —
          // surface the chunk-prompt copy and close optimistically without
          // navigating away from the appointment yet. The appointment will
          // flip to `cancelled` after FO approval.
          if (res.requiresApproval) {
            Alert.alert(
              'Request submitted',
              "You'll get a notification when it's confirmed.",
            );
            onClose();
            return;
          }
          onCancelled();
          onClose();
        },
        onError: () => {
          Alert.alert('Cancel failed', 'Could not cancel your appointment. Please try again.');
        },
      },
    );
  }, [selectedReason, appointmentId, cancelMutation, onCancelled, onClose]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Cancel Booking</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close-circle" size={28} color={Theme.colors.textTertiary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.cancelWarning}>
            <Ionicons name="warning-outline" size={22} color={Theme.colors.error} />
            <Text style={styles.cancelWarningText}>
              This action cannot be undone. Please select a reason for cancellation.
            </Text>
          </View>

          <Text style={styles.cancelReasonLabel}>Reason</Text>
          {CANCEL_REASONS.map((reason) => {
            const isActive = selectedReason === reason;
            return (
              <TouchableOpacity
                key={reason}
                style={[styles.reasonRow, isActive && styles.reasonRowActive]}
                onPress={() => {
                  selectionTap();
                  setSelectedReason(reason);
                }}
                activeOpacity={0.85}
              >
                <Text style={[styles.reasonText, isActive && styles.reasonTextActive]}>{reason}</Text>
                {isActive ? (
                  <Ionicons name="checkmark-circle" size={22} color={Theme.colors.primary} />
                ) : (
                  <Ionicons name="ellipse-outline" size={22} color={Theme.colors.border} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.modalFooter}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.secondaryBtnText}>Keep booking</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.destructiveBtn,
              (!selectedReason || cancelMutation.isPending) && styles.destructiveBtnDisabled,
            ]}
            disabled={!selectedReason || cancelMutation.isPending}
            onPress={handleConfirm}
            activeOpacity={0.85}
          >
            {cancelMutation.isPending ? (
              <ActivityIndicator size="small" color={Theme.colors.white} />
            ) : (
              <Text style={styles.destructiveBtnText}>Cancel booking</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function AddServicesModal({
  visible,
  appointment,
  allAppointments,
  onClose,
  onServicesAdded,
}: {
  visible: boolean;
  appointment: Appointment;
  allAppointments: Appointment[];
  onClose: () => void;
  onServicesAdded: () => void;
}) {
  const router = useRouter();
  const startWithPreselectedServices = useBookingStore((s) => s.startWithPreselectedServices);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [addedNames, setAddedNames] = useState<string[]>([]);
  const [pickerEntries, setPickerEntries] = useState<Service[]>([]);
  const { data: catalog, isPending: catalogLoading } = useServices();
  const addService = useAddServiceToAppointment();

  useEffect(() => {
    if (!visible) {
      setSelected(new Set());
      setShowConfirmation(false);
      setShowPicker(false);
      setAddedNames([]);
      setPickerEntries([]);
    }
  }, [visible]);

  const existingIds = useMemo(
    () => new Set(appointment.services?.map((s) => s.service_id) ?? []),
    [appointment.services],
  );

  const available = useMemo(
    () => (catalog ?? []).filter((s) => !existingIds.has(s.id) && s.is_active),
    [catalog, existingIds],
  );

  const toggleService = useCallback((service: Service) => {
    selectionTap();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(service.id)) next.delete(service.id);
      else next.add(service.id);
      return next;
    });
  }, []);

  const { count, total, totalDuration } = useMemo(() => {
    const items = available.filter((s) => selected.has(s.id));
    return {
      count: items.length,
      total: items.reduce((sum, s) => sum + Number(s.base_price), 0),
      totalDuration: items.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0),
    };
  }, [available, selected]);

  const existingDuration = useMemo(
    () =>
      (appointment.services ?? []).reduce(
        (sum, s) => sum + (s.service?.duration_minutes ?? 0),
        0,
      ),
    [appointment.services],
  );

  const vehicleAppointments = useMemo(
    () =>
      allAppointments.filter(
        (a) =>
          a.vehicle_id === appointment.vehicle_id &&
          !['in_progress', 'en_route', 'arrived', 'wrap_up', 'completed', 'paid', 'cancelled'].includes(a.status),
      ),
    [allAppointments, appointment.vehicle_id],
  );
  const hasMultipleAppointments = vehicleAppointments.length > 1;

  const handleConfirm = useCallback(async () => {
    if (selected.size === 0) return;
    const entries = available.filter((s) => selected.has(s.id));

    if (hasMultipleAppointments) {
      setPickerEntries(entries);
      setShowPicker(true);
      return;
    }

    // @demo-start — time overflow check for single-appointment path
    // Always warn when adding 2+ services. Emulate that the next appointment
    // is 50% of the combined new duration away, so overage is always positive.
    const newDuration = entries.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
    const overage = Math.ceil(newDuration * 0.5);

    if (entries.length > 1) {
      warningHaptic();
      Alert.alert(
        'Time Limit Warning',
        `Adding these services (~${newDuration} min) would put the technician ${overage} min over the limit before their next appointment.\n\nWould you like to schedule a separate visit instead?`,
        [
          { text: 'Go Back', style: 'cancel' },
          {
            text: 'Schedule New Appt',
            onPress: () => {
              const vehicle = appointment.vehicle ?? null;
              onClose();
              const route = startWithPreselectedServices(entries, vehicle);
              router.push(route);
            },
          },
          {
            text: 'Add Anyway',
            onPress: () => addToAppointment(appointment.id, entries),
          },
        ],
      );
      return;
    }
    // @demo-end

    await addToAppointment(appointment.id, entries);
  }, [selected, available, hasMultipleAppointments, appointment.id, existingDuration, addToAppointment, onClose, startWithPreselectedServices, router, appointment.vehicle]);

  const addToAppointment = useCallback(async (targetId: number, entries: Service[]) => {
    try {
      for (const svc of entries) {
        await addService.mutateAsync({
          appointmentId: targetId,
          serviceId: svc.id,
        });
      }
      successHaptic();
      setAddedNames(entries.map((s) => s.name));
      setShowPicker(false);
      setShowConfirmation(true);
    } catch {
      Alert.alert('Error', 'Could not add services. Please try again.');
    }
  }, [addService]);

  const handlePickerSelect = useCallback(
    (target: Appointment) => {
      addToAppointment(target.id, pickerEntries);
    },
    [addToAppointment, pickerEntries],
  );

  const handleScheduleNew = useCallback(() => {
    const vehicle = appointment.vehicle ?? null;
    setShowPicker(false);
    onClose();
    const route = startWithPreselectedServices(pickerEntries, vehicle);
    router.push(route);
  }, [appointment.vehicle, pickerEntries, onClose, startWithPreselectedServices, router]);

  const handleDone = useCallback(() => {
    onServicesAdded();
    onClose();
  }, [onServicesAdded, onClose]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{showConfirmation ? 'Services Added' : 'Add Services'}</Text>
          <Pressable onPress={showConfirmation ? handleDone : onClose} hitSlop={12}>
            <Ionicons name="close-circle" size={28} color={Theme.colors.textTertiary} />
          </Pressable>
        </View>

        {showConfirmation ? (
          <View style={styles.confirmationBody}>
            <View style={styles.confirmationIcon}>
              <Ionicons name="checkmark-circle" size={64} color={Theme.colors.success} />
            </View>
            <Text style={styles.confirmationHeadline}>
              {addedNames.length} service{addedNames.length !== 1 ? 's' : ''} added
            </Text>
            <View style={styles.addedServicesList}>
              {addedNames.map((name, idx) => (
                <View key={`${name}-${idx}`} style={styles.addedServicePill}>
                  <Ionicons name="checkmark" size={14} color={Theme.colors.success} />
                  <Text style={styles.addedServiceText}>{name}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleDone} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalSubtitle}>
                Select services to add to your appointment.
              </Text>
              {catalogLoading ? (
                <View style={styles.loadingBlock}>
                  {[0, 1, 2].map((i) => (
                    <View key={i} style={styles.skeletonSlot}>
                      <View style={styles.skeletonLine} />
                      <View style={[styles.skeletonLine, styles.skeletonShort]} />
                    </View>
                  ))}
                </View>
              ) : available.length === 0 ? (
                <View style={styles.emptySlots}>
                  <Ionicons name="build-outline" size={32} color={Theme.colors.textTertiary} />
                  <Text style={styles.emptySlotsText}>
                    All available services are already on this appointment.
                  </Text>
                </View>
              ) : (
                available.map((service) => {
                  const isSelected = selected.has(service.id);
                  return (
                    <ServiceCard
                      key={service.id}
                      service={service}
                      selected={isSelected}
                      onToggle={() => toggleService(service)}
                    />
                  );
                })
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <View style={styles.addServicesSummary}>
                <View>
                  <Text style={styles.addSummaryLabel}>Selected</Text>
                  <Text style={styles.addSummaryValue}>
                    {count === 0
                      ? 'No services'
                      : `${count} service${count !== 1 ? 's' : ''} · ~${totalDuration} min`}
                  </Text>
                </View>
                <View style={styles.addSummaryRight}>
                  <Text style={styles.addSummaryLabel}>Total</Text>
                  <Text style={styles.addSummaryTotal}>${total.toFixed(2)}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  (count === 0 || addService.isPending) && styles.primaryBtnDisabled,
                ]}
                disabled={count === 0 || addService.isPending}
                onPress={handleConfirm}
                activeOpacity={0.85}
              >
                {addService.isPending ? (
                  <ActivityIndicator size="small" color={Theme.colors.white} />
                ) : (
                  <Text style={styles.primaryBtnText}>Add to Appointment</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </SafeAreaView>

      <AppointmentPickerModal
        visible={showPicker}
        servicesToAdd={pickerEntries}
        vehicleId={appointment.vehicle_id ?? 0}
        allAppointments={allAppointments}
        onSelect={handlePickerSelect}
        onScheduleNew={handleScheduleNew}
        onCancel={() => setShowPicker(false)}
      />
    </Modal>
  );
}

export default function AppointmentTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const appointmentId = Number(id);
  const { data: appointments, isPending, isError, refetch } = useAppointments();

  const { data: allReferrals } = useMyReferrals();
  const appointmentReferrals = useMemo(
    () => allReferrals?.filter((r) => r.appointment_id === Number(id)) ?? [],
    [allReferrals, id],
  );

  const [showReschedule, setShowReschedule] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showAddServices, setShowAddServices] = useState(false);

  const appointment = useMemo(
    () => appointments?.find((a) => a.id === appointmentId),
    [appointments, appointmentId],
  );

  const isEnRoute = appointment?.status === AppointmentStatus.EN_ROUTE;
  const apptStatus = appointment?.status;
  const isTrackable =
    apptStatus === AppointmentStatus.EN_ROUTE ||
    apptStatus === AppointmentStatus.ARRIVED ||
    apptStatus === AppointmentStatus.IN_PROGRESS;

  const canModify = apptStatus != null && RESCHEDULE_ELIGIBLE.includes(apptStatus);

  const { data: eta, isPending: etaLoading } = useBookingETA(appointmentId, isEnRoute);
  const { data: tracking } = useBookingTracking(appointmentId, isTrackable ?? false);
  const { lastUpdate } = useRealtimeLocation(isTrackable ? `booking:${appointmentId}` : null);

  const currentIdx = appointment ? getCurrentTimelineIndex(appointment.status) : -1;
  const isCancelled = appointment?.status === AppointmentStatus.CANCELLED;

  const handleRescheduleConfirmed = useCallback(
    (_oldDate: string, _oldTime: string, _newDate: string, _newTime: string) => {
      refetch();
    },
    [refetch],
  );

  const handleCancelConfirmed = useCallback(() => {
    refetch();
    router.replace('/customer');
  }, [refetch, router]);

  // MSG-FE-CUST: explicit "Message technician" entry point. Posts to
  // `/customer/messages/conversations` (find-or-create) and routes to the
  // resulting conversation thread. The BE upserts on the
  // (customer_id, technician_id) unique constraint, so re-tapping is
  // idempotent.
  const startConversation = useStartConversation();
  const handleMessageTechnician = useCallback(() => {
    const technicianId = appointment?.technician_id;
    if (!technicianId || startConversation.isPending) return;
    startConversation.mutate(
      { technician_id: technicianId },
      {
        onSuccess: (conversation) => {
          router.push(`/customer/messages/${conversation.id}`);
        },
        onError: () => {
          Alert.alert(
            "Couldn't start conversation",
            'Please check your connection and try again.',
          );
        },
      },
    );
  }, [appointment?.technician_id, router, startConversation]);

  if (isPending) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView
          style={styles.scrollFill}
          contentContainerStyle={styles.scrollSkeletonContent}
          showsVerticalScrollIndicator={false}
        >
          <AppointmentDetailSkeleton />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (isError || !appointment) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <EmptyState
          title="Appointment not found"
          message="We couldn't load this appointment. It may have been removed."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </SafeAreaView>
    );
  }

  const statusColor = getStatusColor(appointment.status);
  const vehicleLabel = appointment.vehicle
    ? formatVehicleDisplayTitle(appointment.vehicle)
    : 'Vehicle';
  const serviceNames =
    appointment.services
      ?.map((s) => s.service?.name)
      .filter(Boolean)
      .join(', ') ?? 'Services TBD';
  const whenLabel =
    appointment.scheduled_date || appointment.scheduled_time
      ? [
          appointment.scheduled_date ? formatDateDisplay(appointment.scheduled_date) : null,
          appointment.scheduled_time ? formatTimeDisplay(appointment.scheduled_time) : null,
        ].filter(Boolean).join(' · ')
      : 'Schedule TBD';
  const techName = appointment.technician?.full_name;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {isTrackable && tracking ? (
          <>
            {tracking.etaMinutes != null ? (
              <ETABanner
                etaMinutes={tracking.etaMinutes}
                distanceMi={tracking.distanceMi}
              />
            ) : isEnRoute && etaLoading ? (
              <View style={styles.etaBannerLoading}>
                <ActivityIndicator size="small" color={Theme.colors.primary} />
                <Text style={styles.etaLoadingText}>Calculating arrival time...</Text>
              </View>
            ) : null}
            <TrackingMap tracking={tracking} liveUpdate={lastUpdate} />
          </>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Ionicons name="navigate-outline" size={28} color={Theme.colors.textTertiary} />
            <Text style={styles.mapPlaceholderText}>
              {isCancelled
                ? 'Tracking unavailable'
                : 'Live tracking will appear when your technician is en route'}
            </Text>
          </View>
        )}

        <View style={styles.timelineCard}>
          {isCancelled ? (
            <Text style={styles.cancelledBanner}>This appointment was cancelled.</Text>
          ) : null}
          {APPOINTMENT_TIMELINE_ORDER.map((step, index) => {
            const label = APPOINTMENT_STATUS_LABELS[step];
            const isPast = !isCancelled && currentIdx > index;
            const isCurrent = !isCancelled && currentIdx === index;
            const isFuture = isCancelled || currentIdx < index;

            return (
              <View key={step} style={styles.timelineRow}>
                <View style={styles.timelineAxis}>
                  {isCurrent ? (
                    <PulseDot />
                  ) : (
                    <View
                      style={[
                        styles.dot,
                        isPast && styles.dotDone,
                        isFuture && styles.dotFuture,
                      ]}
                    />
                  )}
                  {index < APPOINTMENT_TIMELINE_ORDER.length - 1 ? (
                    <View
                      style={[
                        styles.connector,
                        !isCancelled && index < currentIdx && styles.connectorDone,
                      ]}
                    />
                  ) : null}
                </View>
                <View style={styles.timelineLabelBlock}>
                  <Text
                    style={[
                      styles.timelineLabel,
                      isCurrent && { color: Theme.colors.primary, fontWeight: '700' },
                      isPast && { color: Theme.colors.success },
                      isFuture && { color: Theme.colors.textTertiary },
                    ]}
                  >
                    {label}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={[styles.detailsCard, Theme.shadow.md]}>
          <View style={[styles.statusPill, { backgroundColor: statusColor + '22' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusPillText, { color: statusColor }]}>
              {APPOINTMENT_STATUS_LABELS[appointment.status]}
            </Text>
          </View>
          <Text style={styles.detailTitle}>Appointment details</Text>
          {techName ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>Technician</Text>
              <Text style={styles.detailVal}>{techName}</Text>
            </View>
          ) : null}
          {appointment.technician_id && !isCancelled ? (
            <TouchableOpacity
              style={styles.messageTechBtn}
              onPress={handleMessageTechnician}
              disabled={startConversation.isPending}
              activeOpacity={0.85}
            >
              {startConversation.isPending ? (
                <ActivityIndicator size="small" color={Theme.colors.primary} />
              ) : (
                <>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={18}
                    color={Theme.colors.primary}
                  />
                  <Text style={styles.messageTechBtnText}>
                    Message technician
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
          <View style={styles.detailRow}>
            <Text style={styles.detailKey}>When</Text>
            <Text style={styles.detailVal}>{whenLabel}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailKey}>Vehicle</Text>
            <Text style={styles.detailVal}>{vehicleLabel}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailKey}>Services</Text>
            {appointment.services && appointment.services.length > 0 ? (
              <View style={styles.servicePillsWrap}>
                {appointment.services.map((as, idx) => (
                  <View key={`${as.service_id}-${idx}`} style={styles.servicePill}>
                    <Text style={styles.servicePillName}>
                      {as.service?.name ?? 'Service'}
                    </Text>
                    {as.service?.duration_minutes != null && (
                      <Text style={styles.servicePillDuration}>
                        {as.service.duration_minutes}m
                      </Text>
                    )}
                    <Text style={styles.servicePillPrice}>
                      ${Number(as.price).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.detailVal}>{serviceNames}</Text>
            )}
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailKey}>Address</Text>
            <Text style={styles.detailVal}>
              {appointment.address
                ? `${appointment.address.address_line}, ${appointment.address.city}, ${appointment.address.state} ${appointment.address.zip}`
                : 'Address on file'}
            </Text>
          </View>
        </View>

        {(apptStatus === AppointmentStatus.COMPLETED || apptStatus === AppointmentStatus.PAID) ? (
          <TouchableOpacity
            style={styles.serviceRecordBtn}
            onPress={() => router.push(`/customer/appointment/${appointmentId}/service-record`)}
            activeOpacity={0.85}
          >
            <Ionicons name="shield-checkmark" size={20} color="#D4A843" />
            <Text style={styles.serviceRecordBtnText}>View Service Record</Text>
            <Ionicons name="chevron-forward" size={18} color={Theme.colors.textTertiary} />
          </TouchableOpacity>
        ) : null}

        {appointmentReferrals.length > 0 ? (
          <View style={styles.referralsSection}>
            <Text style={styles.referralsSectionTitle}>Referrals</Text>
            {appointmentReferrals.map((ref) => {
              const refColor =
                ref.status === ReferralStatus.COMPLETED ? Theme.colors.success
                : ref.status === ReferralStatus.SCHEDULED || ref.status === ReferralStatus.ACCEPTED ? Theme.colors.primary
                : Theme.colors.warning;
              return (
                <TouchableOpacity
                  key={ref.id}
                  style={[styles.referralRow, { borderLeftColor: refColor }]}
                  onPress={() => router.push(`/customer/referral/${ref.id}`)}
                  activeOpacity={0.85}
                >
                  <View style={styles.referralRowInfo}>
                    <Text style={styles.referralRowService} numberOfLines={1}>
                      {ref.service_need}
                    </Text>
                    {ref.selected_partner_name ? (
                      <Text style={styles.referralRowPartner} numberOfLines={1}>
                        {ref.selected_partner_name}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[styles.referralStatusBadge, { backgroundColor: refColor + '18' }]}>
                    <Text style={[styles.referralStatusText, { color: refColor }]}>
                      {REFERRAL_STATUS_LABELS[ref.status] ?? ref.status}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Theme.colors.textTertiary} />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {canModify ? (
          <View style={styles.actionGroup}>
            <TouchableOpacity
              style={styles.addServicesBtn}
              onPress={() => setShowAddServices(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="add-circle-outline" size={20} color={Theme.colors.primary} />
              <Text style={styles.addServicesBtnText}>Add Services</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rescheduleBtn}
              onPress={() => setShowReschedule(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="calendar-outline" size={20} color={Theme.colors.primary} />
              <Text style={styles.rescheduleBtnText}>Reschedule</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBookingBtn}
              onPress={() => setShowCancel(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="close-circle-outline" size={20} color={Theme.colors.error} />
              <Text style={styles.cancelBookingBtnText}>Cancel Booking</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>

      <RescheduleModal
        visible={showReschedule}
        appointment={appointment}
        onClose={() => setShowReschedule(false)}
        onConfirmed={handleRescheduleConfirmed}
      />
      <CancelModal
        visible={showCancel}
        appointmentId={appointment.id}
        onClose={() => setShowCancel(false)}
        onCancelled={handleCancelConfirmed}
      />
      <AddServicesModal
        visible={showAddServices}
        appointment={appointment}
        allAppointments={appointments ?? []}
        onClose={() => setShowAddServices(false)}
        onServicesAdded={() => refetch()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  scroll: {
    padding: Theme.spacing.md,
    paddingBottom: Theme.spacing.xxl,
  },
  scrollFill: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  scrollSkeletonContent: {
    flexGrow: 1,
  },
  etaBanner: {
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    alignItems: 'center',
    ...Theme.shadow.lg,
  },
  etaIconRow: {
    marginBottom: Theme.spacing.sm,
  },
  etaIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Theme.colors.white + '33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  etaHeadline: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '800',
    color: Theme.colors.white,
    textAlign: 'center',
    marginBottom: Theme.spacing.xs,
  },
  etaSubtext: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.white + 'BF',
    textAlign: 'center',
  },
  etaBannerLoading: {
    backgroundColor: Theme.colors.primary + '15',
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.sm,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '33',
  },
  etaLoadingText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.primary,
    fontWeight: '600',
  },
  mapPlaceholder: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    paddingVertical: Theme.spacing.xl,
    paddingHorizontal: Theme.spacing.md,
    alignItems: 'center',
    marginBottom: Theme.spacing.md,
    gap: Theme.spacing.sm,
  },
  mapPlaceholderText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  timelineCard: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  cancelledBanner: {
    color: Theme.colors.error,
    fontWeight: '600',
    marginBottom: Theme.spacing.md,
    fontSize: Theme.fontSize.sm,
  },
  timelineRow: {
    flexDirection: 'row',
  },
  timelineAxis: {
    width: 28,
    alignItems: 'center',
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: Theme.colors.border,
    backgroundColor: Theme.colors.background,
  },
  dotDone: {
    backgroundColor: Theme.colors.success,
    borderColor: Theme.colors.success,
  },
  dotFuture: {
    borderColor: Theme.colors.border,
    backgroundColor: Theme.colors.surface,
  },
  dotCurrentOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Theme.colors.primary + '33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotCurrentInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Theme.colors.primary,
  },
  connector: {
    width: 2,
    flex: 1,
    minHeight: 20,
    backgroundColor: Theme.colors.border,
    marginVertical: 2,
  },
  connectorDone: {
    backgroundColor: Theme.colors.success,
  },
  timelineLabelBlock: {
    flex: 1,
    paddingBottom: Theme.spacing.md,
    paddingLeft: Theme.spacing.sm,
  },
  timelineLabel: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
  },
  detailsCard: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: Theme.borderRadius.full,
    marginBottom: Theme.spacing.md,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusPillText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
  },
  detailTitle: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.md,
  },
  detailRow: {
    marginBottom: Theme.spacing.sm,
  },
  detailKey: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  detailVal: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
    lineHeight: 22,
  },
  messageTechBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.sm,
    marginTop: Theme.spacing.sm,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.lg,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '40',
    backgroundColor: Theme.colors.primary + '10',
    minHeight: 44,
  },
  messageTechBtnText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.primary,
  },

  serviceRecordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    backgroundColor: '#1E3A5F' + '0A',
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.lg,
    borderWidth: 2,
    borderColor: '#D4A843' + '33',
    marginBottom: Theme.spacing.md,
    minHeight: 52,
  },
  serviceRecordBtnText: {
    flex: 1,
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: '#1E3A5F',
  },
  actionGroup: {
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.md,
  },
  rescheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.sm,
    backgroundColor: Theme.colors.primary + '12',
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    borderWidth: 2,
    borderColor: Theme.colors.primary + '33',
    minHeight: 52,
  },
  rescheduleBtnText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  cancelBookingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.sm,
    backgroundColor: Theme.colors.error + '08',
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    borderWidth: 2,
    borderColor: Theme.colors.error + '22',
    minHeight: 52,
  },
  cancelBookingBtnText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.error,
  },

  modalSafe: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.borderLight,
  },
  modalTitle: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  modalSubtitle: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: Theme.spacing.lg,
  },
  modalScroll: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.lg,
    paddingBottom: Theme.spacing.xxl,
  },
  modalFooter: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.sm,
    paddingBottom: Theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.borderLight,
    backgroundColor: Theme.colors.background,
    gap: Theme.spacing.sm,
  },

  loadingBlock: {
    gap: Theme.spacing.md,
  },
  skeletonSlot: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    gap: Theme.spacing.sm,
  },
  skeletonLine: {
    height: 16,
    borderRadius: 8,
    backgroundColor: Theme.colors.border,
    width: '70%',
  },
  skeletonShort: {
    width: '45%',
  },
  emptySlots: {
    alignItems: 'center',
    padding: Theme.spacing.xl,
    gap: Theme.spacing.sm,
  },
  emptySlotsText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  slotCard: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
    borderWidth: 2,
    borderColor: Theme.colors.border,
  },
  slotCardSelected: {
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.primary + '08',
  },
  slotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: Theme.spacing.xs,
  },
  slotDate: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  slotTime: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '800',
    color: Theme.colors.text,
  },
  slotTechRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.xs,
  },
  slotTechName: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text,
    flex: 1,
  },
  slotDrive: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    marginRight: Theme.spacing.xs,
  },

  confirmationBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Theme.spacing.lg,
    gap: Theme.spacing.lg,
  },
  confirmationIcon: {
    marginBottom: Theme.spacing.sm,
  },
  confirmationHeadline: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Theme.colors.text,
    textAlign: 'center',
  },
  timeCompare: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.md,
    width: '100%',
  },
  timeBox: {
    flex: 1,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  timeBoxNew: {
    borderColor: Theme.colors.primary + '55',
    backgroundColor: Theme.colors.primary + '08',
  },
  timeBoxLabel: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '700',
    color: Theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Theme.spacing.xs,
  },
  timeBoxDate: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  timeBoxTime: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },

  primaryBtn: {
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    width: '100%',
  },
  primaryBtnDisabled: {
    backgroundColor: Theme.colors.border,
  },
  primaryBtnText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
  },
  secondaryBtn: {
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Theme.colors.border,
    backgroundColor: Theme.colors.surface,
    minHeight: 52,
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: Theme.colors.text,
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
  },
  destructiveBtn: {
    backgroundColor: Theme.colors.error,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  destructiveBtnDisabled: {
    backgroundColor: Theme.colors.border,
  },
  destructiveBtnText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
  },

  cancelWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Theme.spacing.sm,
    backgroundColor: Theme.colors.error + '0A',
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.error + '22',
  },
  cancelWarningText: {
    flex: 1,
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text,
    lineHeight: 20,
  },
  cancelReasonLabel: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '700',
    color: Theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Theme.spacing.sm,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.md,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
    borderWidth: 2,
    borderColor: Theme.colors.border,
  },
  reasonRowActive: {
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.primary + '08',
  },
  reasonText: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
  },
  reasonTextActive: {
    fontWeight: '600',
    color: Theme.colors.primary,
  },
  addServicesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.sm,
    backgroundColor: Theme.colors.primary + '12',
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    borderWidth: 2,
    borderColor: Theme.colors.primary + '33',
    minHeight: 52,
  },
  addServicesBtnText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  servicePillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  servicePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Theme.colors.primary + '0C',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Theme.borderRadius.full,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '22',
  },
  servicePillName: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  servicePillDuration: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    fontWeight: '500',
  },
  servicePillPrice: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  addedServicesList: {
    gap: Theme.spacing.sm,
    width: '100%',
    paddingHorizontal: Theme.spacing.lg,
  },
  addedServicePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    backgroundColor: Theme.colors.success + '10',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.success + '25',
  },
  addedServiceText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  addServicesSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
  },
  addSummaryLabel: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  addSummaryValue: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  addSummaryRight: {
    alignItems: 'flex-end',
  },
  addSummaryTotal: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  referralsSection: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  referralsSectionTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.sm,
  },
  referralRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.sm,
    borderLeftWidth: 3,
    marginBottom: Theme.spacing.xs,
    gap: Theme.spacing.sm,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.sm,
  },
  referralRowInfo: {
    flex: 1,
  },
  referralRowService: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  referralRowPartner: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    marginTop: 1,
  },
  referralStatusBadge: {
    paddingHorizontal: Theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: Theme.borderRadius.full,
  },
  referralStatusText: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '600',
  },
});
