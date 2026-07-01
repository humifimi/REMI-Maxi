import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { AppointmentCard } from '@customer/components/appointment/appointment-card';
import { HealthRing, HealthRingGroup } from '@customer/components/vehicle/health-ring';
import { EmptyState } from '@customer/components/shared/empty-state';
import {
  DashboardAppointmentCardSkeleton,
  DashboardHeroSkeleton,
  SkeletonBox,
} from '@customer/components/shared/skeleton';
import { ReferralCard } from '@customer/components/social/referral-card';
import { DeferredServiceCard } from '@customer/components/service/deferred-service-card';
import { AppointmentPickerModal } from '@customer/components/appointment/appointment-picker-modal';
import { InboxBadgeButton } from '@customer/components/inbox/inbox-badge-button';
import { WaitlistStatusCard } from '@customer/components/social/waitlist-status-card';
import { FleetDashboardContent } from '@customer/components/fleet/fleet-dashboard-content';
import { FleetDriverVehicleCard } from '@customer/components/fleet/fleet-driver-vehicle-card';
import { getHealthColor, Theme } from '@customer/constants/colors';
import { useAppointments, useAddServiceToAppointment } from '@customer/hooks/appointments/use-appointments';
import { useVehicles } from '@customer/hooks/vehicles/use-vehicles';
import { useVehicleHealth } from '@customer/hooks/vehicles/use-vehicle-health';
import { useNotifications, useMarkNotificationRead } from '@customer/hooks/communication/use-notifications';
// P5-CU-2: drives the badge on the Home-tab inbox button. Reads the
// same TanStack Query cache the inbox screen uses so opening the inbox
// doesn't refetch and the badge updates the moment the inbox refetches.
import { usePendingReorganizationCount } from '@customer/hooks/reorganizations/use-pending-sessions';
import { useAllDeferredItems, useDeclineDeferredItem } from '@customer/hooks/services/use-deferred-items';
import { useActiveWaitlistEntries, useClaimWaitlistSlot, useCancelWaitlistEntry } from '@customer/hooks/utility/use-waitlist';
import { useServices } from '@customer/hooks/services/use-services';
import { useFleetDriverVehicle } from '@customer/hooks/fleet/use-fleet-driver';
import { useAuthStore } from '@/src/stores/auth';
import {
  getOnboardingResumeRoute,
  useOnboardingStore,
} from '@/src/stores/customer/onboarding';
import { useBookingStore } from '@/src/stores/customer/booking';
import { useThemeStore } from '@/src/stores/customer-theme';
import { NotificationType, DeferredWorkStatus } from '@customer/types/enums';
import { formatVehicleDisplayTitle } from '@customer/utils/vehicle-display';
import type { Vehicle, Appointment, Service, DeferredWorkItem, WaitlistEntry } from '@customer/types/api';

const MAX_HISTORY = 3;
const MAX_DEFERRED = 5;

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

type HomeView = 'fleet' | 'personal';

export default function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const themeColors = useThemeStore((s) => s.colors);
  const themeBrand = useThemeStore((s) => s.brand);
  const demoFleetRole = useAuthStore((s) => s.demoFleetRole);
  const demoFleetMode = useAuthStore((s) => s.demoFleetMode);
  const effectiveFleetRole = user?.fleetRole ?? demoFleetRole;
  const isFleetManager = effectiveFleetRole === 'fleet_manager';
  const isFleetDriver = effectiveFleetRole === 'fleet_driver';
  const hasFleet = !!(user?.fleetRole || demoFleetMode);
  const [activeView, setActiveView] = useState<HomeView>(isFleetManager ? 'fleet' : 'personal');

  const onboardingHydrated = useOnboardingStore((s) => s.isHydrated);
  const onboardingComplete = useOnboardingStore((s) => s.isComplete);
  const completionPercent = useOnboardingStore((s) => s.completionPercent);
  const completedSteps = useOnboardingStore((s) => s.completedSteps);
  const startFreshBooking = useBookingStore((s) => s.startFreshBooking);
  const startFromDeferred = useBookingStore((s) => s.startFromDeferred);
  const startFromDeferredFallback = useBookingStore((s) => s.startFromDeferredFallback);
  const startWithPreselectedServices = useBookingStore((s) => s.startWithPreselectedServices);

  const { data: driverVehicle } = useFleetDriverVehicle(isFleetDriver);
  const {
    data: allAppointments,
    isLoading: appointmentsLoading,
    isError: appointmentsError,
    refetch: refetchAppointments,
  } = useAppointments();
  const { data: vehicles, isLoading: vehiclesLoading } = useVehicles();
  const { data: notifications } = useNotifications();
  const markRead = useMarkNotificationRead();
  const { data: deferredItems } = useAllDeferredItems();
  const { data: services } = useServices();
  const declineDeferred = useDeclineDeferredItem();
  const { data: activeWaitlist } = useActiveWaitlistEntries();
  const claimSlot = useClaimWaitlistSlot();
  const cancelWaitlist = useCancelWaitlistEntry();
  const addServiceMutation = useAddServiceToAppointment();
  // P5-CU-2 — pending approval count for the Home-tab inbox badge.
  const pendingApprovalsCount = usePendingReorganizationCount();

  const [selectedVehicleIndex, setSelectedVehicleIndex] = useState(0);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerServices, setPickerServices] = useState<Service[]>([]);
  const [pickerVehicleId, setPickerVehicleId] = useState(0);
  const [pickerDeferredItems, setPickerDeferredItems] = useState<DeferredWorkItem[]>([]);

  const referralNotifications = useMemo(
    () =>
      notifications?.filter(
        (n) => n.type === NotificationType.REFERRAL && !n.read_at
      ) ?? [],
    [notifications]
  );

  // Upcoming = anything not yet completed/paid/cancelled and not still a draft.
  // `created` is a draft (cart-stage) booking — never show those as upcoming.
  // Real `confirmed` bookings MUST show; the previous filter hid them by only
  // allowing en_route/arrived/in_progress + negative-ID demo entries through,
  // which meant a customer who just booked a real appointment saw nothing.
  // Active visits (en_route/arrived/in_progress) are sorted to the top.
  const upcomingAppointments = useMemo(() => {
    const activeStatuses = ['en_route', 'arrived', 'in_progress'];
    return (
      allAppointments
        ?.filter((a) => {
          if (['completed', 'paid', 'cancelled', 'created'].includes(a.status)) return false;
          return true;
        })
        ?.sort((a, b) => {
          const aActive = activeStatuses.includes(a.status) ? 0 : 1;
          const bActive = activeStatuses.includes(b.status) ? 0 : 1;
          if (aActive !== bActive) return aActive - bActive;
          const da = a.scheduled_date ?? '';
          const db = b.scheduled_date ?? '';
          return da.localeCompare(db);
        }) ?? []
    );
  }, [allAppointments]);

  const recentHistory = useMemo(
    () =>
      allAppointments
        ?.filter((a) => ['completed', 'paid'].includes(a.status))
        ?.sort((a, b) => {
          const da = a.completed_at ?? a.scheduled_date ?? '';
          const db = b.completed_at ?? b.scheduled_date ?? '';
          return db.localeCompare(da);
        })
        ?.slice(0, MAX_HISTORY) ?? [],
    [allAppointments],
  );

  const pendingDeferred = useMemo(
    () =>
      deferredItems
        ?.filter(
          (d) =>
            d.status === DeferredWorkStatus.OBSERVED ||
            d.status === DeferredWorkStatus.COMMUNICATED ||
            d.status === DeferredWorkStatus.SCHEDULED
        )
        ?.slice(0, MAX_DEFERRED) ?? [],
    [deferredItems]
  );

  const TERMINAL_STATUSES = ['completed', 'paid', 'cancelled'];

  const isDeferredBooked = useCallback(
    (item: DeferredWorkItem): boolean => {
      if (item.scheduled_appointment_id != null) return true;
      if (item.status === DeferredWorkStatus.SCHEDULED) return true;
      if (!item.recommended_service_id) return false;
      return (
        allAppointments?.some(
          (a) =>
            !TERMINAL_STATUSES.includes(a.status) &&
            a.vehicle_id === item.vehicle_id &&
            a.services?.some((s) => s.service_id === item.recommended_service_id)
        ) ?? false
      );
    },
    [allAppointments]
  );

  const getAppointmentsForVehicle = useCallback(
    (vehicleId: number): Appointment[] =>
      allAppointments?.filter(
        (a) => a.vehicle_id === vehicleId && !TERMINAL_STATUSES.includes(a.status)
      ) ?? [],
    [allAppointments],
  );

  const addServicesSequentially = useCallback(
    async (appointmentId: number, items: { serviceId: number; deferredItemId: number }[]) => {
      for (const entry of items) {
        await addServiceMutation.mutateAsync(entry.serviceId > 0 ? {
          appointmentId,
          serviceId: entry.serviceId,
          deferredItemId: entry.deferredItemId,
        } : { appointmentId, serviceId: entry.serviceId });
      }
    },
    [addServiceMutation]
  );

  const handleAddService = useCallback(
    (item: DeferredWorkItem, _appointment: Appointment) => {
      const vehicleAppts = getAppointmentsForVehicle(item.vehicle_id);

      const allItems = [
        item,
        ...pendingDeferred.filter(
          (d) =>
            d.id !== item.id &&
            d.vehicle_id === item.vehicle_id &&
            d.recommended_service_id != null &&
            !isDeferredBooked(d),
        ),
      ];

      const resolvedServices = allItems
        .map((d) => d.recommended_service ?? services?.find((s) => s.id === d.recommended_service_id))
        .filter((s): s is NonNullable<typeof s> => s != null);

      if (vehicleAppts.length > 1) {
        setPickerServices(resolvedServices);
        setPickerVehicleId(item.vehicle_id);
        setPickerDeferredItems(allItems);
        setPickerVisible(true);
        return;
      }

      const targetAppt = vehicleAppts[0] ?? _appointment;
      const serviceName = item.recommended_service?.name ?? 'this service';
      const dateLabel = targetAppt.scheduled_date
        ? new Date(targetAppt.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })
        : 'upcoming';
      const veh = vehicles?.find((v) => v.id === item.vehicle_id);
      const vLabel = veh
        ? [veh.year, veh.make, veh.model].filter(Boolean).join(' ')
        : 'your vehicle';

      const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
        { text: 'Cancel', style: 'cancel' },
      ];

      const otherEligible = allItems.slice(1);

      if (otherEligible.length > 0) {
        const allNames = allItems.map((d) => d.recommended_service?.name ?? 'Service').join(', ');
        buttons.push({
          text: `Add All (${allItems.length})`,
          onPress: () => {
            // @demo-start — time overflow warning when adding multiple services
            const newDuration = resolvedServices.reduce(
              (sum, s) => sum + (s.duration_minutes ?? 0),
              0,
            );
            const overage = Math.ceil(newDuration * 0.5);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Alert.alert(
              'Time Limit Warning',
              `Adding these services (~${newDuration} min) would put the technician ${overage} min over the limit before their next appointment.\n\nWould you like to schedule a separate visit instead?`,
              [
                { text: 'Go Back', style: 'cancel' },
                {
                  text: 'Schedule New Appt',
                  onPress: () => {
                    const vehicle = veh ?? null;
                    const route = startWithPreselectedServices(resolvedServices, vehicle);
                    router.push(route);
                  },
                },
                {
                  text: 'Add Anyway',
                  onPress: async () => {
                    const entries = allItems
                      .filter((d) => d.recommended_service_id != null)
                      .map((d) => ({ serviceId: d.recommended_service_id!, deferredItemId: d.id }));
                    await addServicesSequentially(targetAppt.id, entries);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    Alert.alert('Done', `${allNames} added to your appointment.`);
                  },
                },
              ],
            );
            // @demo-end
          },
        });
      }

      buttons.push({
        text: otherEligible.length > 0 ? `Just ${serviceName}` : 'Add',
        onPress: () => {
          addServiceMutation.mutate(
            {
              appointmentId: targetAppt.id,
              serviceId: item.recommended_service_id!,
              deferredItemId: item.id,
            },
            {
              onSuccess: () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert('Done', `${serviceName} has been added to your appointment.`);
              },
              onError: () => {
                Alert.alert('Error', 'Could not add the service. Please try again.');
              },
            },
          );
        },
      });

      Alert.alert(
        'Add Service',
        otherEligible.length > 0
          ? `Add ${serviceName} to your ${dateLabel} appointment for ${vLabel}? There ${otherEligible.length === 1 ? 'is' : 'are'} ${otherEligible.length} other recommended service${otherEligible.length === 1 ? '' : 's'} for this vehicle.`
          : `Add ${serviceName} to your ${dateLabel} appointment for ${vLabel}?`,
        buttons,
      );
    },
    [addServiceMutation, addServicesSequentially, vehicles, pendingDeferred, isDeferredBooked, getAppointmentsForVehicle, services, startWithPreselectedServices, router],
  );

  const handlePickerSelect = useCallback(
    async (target: Appointment) => {
      const entries = pickerDeferredItems
        .filter((d) => d.recommended_service_id != null)
        .map((d) => ({ serviceId: d.recommended_service_id!, deferredItemId: d.id }));
      setPickerVisible(false);
      await addServicesSequentially(target.id, entries);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Done', `${entries.length} service${entries.length !== 1 ? 's' : ''} added to your appointment.`);
    },
    [pickerDeferredItems, addServicesSequentially],
  );

  const handlePickerScheduleNew = useCallback(() => {
    setPickerVisible(false);
    const vehicle = vehicles?.find((v) => v.id === pickerVehicleId) ?? null;
    const route = startWithPreselectedServices(pickerServices, vehicle);
    router.push(route);
  }, [pickerVehicleId, pickerServices, vehicles, startWithPreselectedServices, router]);

  const firstName = useMemo(() => {
    const name = user?.fullName?.trim();
    if (!name) return 'there';
    return name.split(/\s+/)[0] ?? 'there';
  }, [user?.fullName]);

  const greeting = useMemo(() => greetingForHour(new Date().getHours()), []);

  const showOnboardingBanner = onboardingHydrated && !onboardingComplete;

  const selectedVehicle = vehicles?.[selectedVehicleIndex] ?? null;
  const { data: health, isLoading: healthLoading } = useVehicleHealth(selectedVehicle?.id, selectedVehicle);
  const heroColor = health ? getHealthColor(health.overall) : themeColors.primary;

  const handleDeferredBook = (item: DeferredWorkItem) => {
    const vehicle = vehicles?.find((v) => v.id === item.vehicle_id);
    const service = item.recommended_service ?? services?.find((s) => s.id === item.recommended_service_id);
    if (vehicle && service) {
      const route = startFromDeferred(item, vehicle, service);
      router.push(route);
    } else {
      const route = startFromDeferredFallback(item.observation_type, vehicle);
      router.push(route);
    }
  };

  const handleDeferredDecline = (item: DeferredWorkItem) => {
    declineDeferred.mutate({ itemId: item.id });
  };

  const handleWaitlistClaim = (entry: WaitlistEntry) => {
    claimSlot.mutate(entry.id, {
      onSuccess: (res) => {
        if (res.appointmentId) {
          router.push(`/customer/appointment/${res.appointmentId}`);
        }
      },
      onError: () => {
        Alert.alert('Claim failed', 'The slot may have expired. Please try again.');
      },
    });
  };

  const handleWaitlistCancel = (entry: WaitlistEntry) => {
    Alert.alert('Leave waitlist?', 'You will lose your position in line.', [
      { text: 'Keep spot', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => cancelWaitlist.mutate(entry.id),
      },
    ]);
  };

  if (isFleetManager && activeView === 'fleet') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.segmentRow}>
          <TouchableOpacity
            style={[styles.segmentBtn, styles.segmentBtnActive]}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, styles.segmentTextActive]}>Fleet View</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.segmentBtn}
            onPress={() => setActiveView('personal')}
            activeOpacity={0.8}
          >
            <Text style={styles.segmentText}>My Vehicles</Text>
          </TouchableOpacity>
        </View>
        <FleetDashboardContent />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {isFleetManager && (
        <View style={styles.segmentRow}>
          <TouchableOpacity
            style={styles.segmentBtn}
            onPress={() => setActiveView('fleet')}
            activeOpacity={0.8}
          >
            <Text style={styles.segmentText}>Fleet View</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, styles.segmentBtnActive]}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, styles.segmentTextActive]}>My Vehicles</Text>
          </TouchableOpacity>
        </View>
      )}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting},</Text>
            <Text style={styles.userName}>{firstName}</Text>
          </View>
          <View style={styles.headerActions}>
            {/* P5-CU-2: Approval inbox button + badge. Opens the
                bottom-sheet inbox when tapped (modal stack screen
                registered in `app/_layout.tsx`). Implementation lives
                in `components/inbox/inbox-badge-button.tsx` so the
                badge logic is unit-testable without mocking the rest
                of the Home tab's hook surface. */}
            <InboxBadgeButton
              count={pendingApprovalsCount}
              onPress={() => router.push('/customer/inbox/approvals' as never)}
              iconColor={themeColors.text}
              badgeColor={themeColors.primary}
            />
            <Pressable
              onPress={() => router.push('/customer/messages')}
              style={styles.bellButton}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
            >
              <IconSymbol name="bell.fill" size={24} color={themeColors.text} />
            </Pressable>
          </View>
        </View>

        {showOnboardingBanner ? (
          <View style={styles.onboardingBanner}>
            <View style={styles.onboardingTextWrap}>
              <Text style={styles.onboardingTitle}>Complete your profile</Text>
              <Text style={styles.onboardingSubtitle}>{completionPercent}% done</Text>
            </View>
            <TouchableOpacity
              style={styles.onboardingCta}
              onPress={() =>
                router.push(getOnboardingResumeRoute(completedSteps) as never)
              }
              activeOpacity={0.7}
            >
              <Text style={styles.onboardingCtaText}>Continue</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {referralNotifications.length > 0
          ? referralNotifications.map((n) => (
              <ReferralCard
                key={n.id}
                notification={n}
                onDismiss={() => markRead.mutate(n.id)}
              />
            ))
          : null}

        {/* --- Fleet Driver Vehicle Section --- */}
        {isFleetDriver && driverVehicle && (
          <>
            <Text style={styles.sectionTitle}>Fleet Vehicle</Text>
            <FleetDriverVehicleCard vehicle={driverVehicle} />
          </>
        )}

        {/* --- HERO: Vehicle Health Score --- */}
        {vehiclesLoading ? (
          <DashboardHeroSkeleton />
        ) : vehicles && vehicles.length > 0 ? (
          <TouchableOpacity
            style={[styles.heroCard, { backgroundColor: heroColor + '08' }]}
            activeOpacity={0.8}
            onPress={() => selectedVehicle && router.push(`/customer/vehicle/${selectedVehicle.id}`)}
          >
            <View style={styles.heroContent}>
              {healthLoading ? (
                <SkeletonBox
                  width={160}
                  height={160}
                  borderRadius={80}
                  style={{ marginVertical: Theme.spacing.md }}
                />
              ) : health ? (
                <HealthRing
                  score={health.overall}
                  variant="hero"
                  animated
                  label="Vehicle Health"
                />
              ) : (
                <View style={styles.heroNoHealth}>
                  <IconSymbol name="info.circle" size={28} color={themeColors.textTertiary} />
                  <Text style={styles.heroNoHealthText}>
                    Health score appears after your first service
                  </Text>
                </View>
              )}

              <Text style={styles.heroVehicleName}>
                {selectedVehicle ? formatVehicleDisplayTitle(selectedVehicle) : 'Vehicle'}
              </Text>

              {vehicles.length > 1 && (
                <View style={styles.vehicleSelector}>
                  {vehicles.map((v, i) => (
                    <TouchableOpacity
                      key={v.id}
                      style={[
                        styles.vehicleDot,
                        i === selectedVehicleIndex && styles.vehicleDotActive,
                      ]}
                      onPress={() => setSelectedVehicleIndex(i)}
                      hitSlop={8}
                    />
                  ))}
                </View>
              )}

              {health && (
                <View style={styles.heroComponentRow}>
                  <HealthRingGroup health={health} variant="compact" />
                </View>
              )}
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.hintCard}
            onPress={() => router.push('/customer/garage')}
            activeOpacity={0.7}
          >
            <Text style={styles.hintText}>Add a vehicle in Garage to see your health score.</Text>
          </TouchableOpacity>
        )}

        {/* --- Upcoming Appointments --- */}
        <View style={styles.upcomingHeader}>
          <Text style={styles.sectionTitle}>Upcoming</Text>
          {/* P5-CU-7: "Reschedule multiple" CTA. Visible only when
              the customer has 2+ upcoming appointments (master plan
              §5.4.6). Error-branch guard prevents the silent-empty
              footgun (§1.5 C1) from letting the button appear when
              the real list couldn't be fetched.

              PLAN-DEVIATION: 2026-05-02-multi-reschedule-home-entry-point
              — the chunk-prompt says the entry is on a "Schedule tab".
              REMICustomer has no Schedule tab; Home's upcoming list is
              the only surface that already enumerates upcoming
              appointments. See
              docs/PLAN-DEVIATIONS.md#2026-05-02-multi-reschedule-home-entry-point. */}
          {!appointmentsError && upcomingAppointments.length >= 2 ? (
            <TouchableOpacity
              onPress={() => router.push('/customer/schedule/multi-reschedule' as never)}
              activeOpacity={0.7}
              style={styles.rescheduleMultipleBtn}
              testID="home-reschedule-multiple-btn"
            >
              <Text
                style={[
                  styles.rescheduleMultipleText,
                  { color: themeColors.primary },
                ]}
              >
                Reschedule multiple
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {appointmentsLoading ? (
          <DashboardAppointmentCardSkeleton />
        ) : appointmentsError ? (
          <View style={styles.cardWrap}>
            <EmptyState
              title="Couldn't load appointments"
              message="We're having trouble reaching the server. Check your connection and try again."
              actionLabel="Retry"
              onAction={() => refetchAppointments()}
            />
          </View>
        ) : upcomingAppointments.length > 0 ? (
          upcomingAppointments.map((appt) => (
            <AppointmentCard
              key={appt.id}
              appointment={appt}
              pendingChange={appt.pending_change ?? undefined}
              onPress={() => {
                // P5-CU-4: when a pending intent affects this appointment the
                // master plan §5.4.3 says the tap opens the approval sheet
                // (D.4 / P5-CU-2). That sheet is not yet shipped, so we fall
                // through to the regular detail screen for now — the detail
                // screen still surfaces the proposed change in copy form, so
                // the customer is not stuck. Replace this branch with a
                // navigation into `/customer/inbox/approvals/[sessionId]` once D.4
                // lands. See master plan §5.4.4 for the destination spec.
                // TODO(P5-CU-2): route to approval sheet when D.4 ships.
                router.push(`/customer/appointment/${appt.id}`);
              }}
            />
          ))
        ) : (
          <View style={styles.cardWrap}>
            <EmptyState
              title="No upcoming appointments"
              message="Book your first service"
              actionLabel="Book Service"
              onAction={() => router.push(startFreshBooking())}
            />
          </View>
        )}

        {/* --- Pending Deferred Work --- */}
        {pendingDeferred.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Action Needed</Text>
            <Text style={styles.sectionSubtitle}>
              Your technician observed these during a recent visit
            </Text>
            <View style={styles.deferredList}>
              {pendingDeferred.map((item) => {
                const dv = vehicles?.find((v) => v.id === item.vehicle_id);
                const dvName = dv
                  ? [dv.year, dv.make, dv.model].filter(Boolean).join(' ')
                  : null;
                const booked = isDeferredBooked(item);
                const vehicleAppts = booked ? [] : getAppointmentsForVehicle(item.vehicle_id);
                return (
                  <DeferredServiceCard
                    key={item.id}
                    item={item}
                    vehicleName={dvName}
                    isBooked={booked}
                    existingAppointmentForVehicle={vehicleAppts[0]}
                    onBookNow={handleDeferredBook}
                    onAddService={handleAddService}
                    onDecline={booked ? undefined : handleDeferredDecline}
                  />
                );
              })}
            </View>
          </>
        )}

        {/* --- Waitlist Status --- */}
        {activeWaitlist && activeWaitlist.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Flex List</Text>
            <View style={styles.waitlistList}>
              {activeWaitlist.map((entry) => (
                <WaitlistStatusCard
                  key={entry.id}
                  entry={entry}
                  onClaim={handleWaitlistClaim}
                  onCancel={handleWaitlistCancel}
                  claimLoading={claimSlot.isPending}
                />
              ))}
            </View>
          </>
        ) : null}

        {/* --- Recent Service History --- */}
        {recentHistory.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Recent History</Text>
            {recentHistory.map((appt) => (
              <AppointmentCard
                key={appt.id}
                appointment={appt}
                pendingChange={appt.pending_change ?? undefined}
                onPress={() => router.push(`/customer/appointment/${appt.id}`)}
              />
            ))}
          </>
        )}

        {/* --- Quick Actions --- */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickRow}>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push(startFreshBooking())}
            activeOpacity={0.7}
          >
            <View style={[styles.quickIcon, { backgroundColor: themeColors.primary + '18' }]}>
              <IconSymbol name="calendar.badge.plus" size={22} color={themeColors.primary} />
            </View>
            <Text style={styles.quickLabel}>Book Service</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/customer/garage')}
            activeOpacity={0.7}
          >
            <View style={[styles.quickIcon, { backgroundColor: themeColors.primary + '18' }]}>
              <IconSymbol name="plus.circle.fill" size={22} color={themeColors.primary} />
            </View>
            <Text style={styles.quickLabel}>Add Vehicle</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/customer/garage')}
            activeOpacity={0.7}
          >
            <View style={[styles.quickIcon, { backgroundColor: themeColors.primary + '18' }]}>
              <IconSymbol name="car.fill" size={22} color={themeColors.primary} />
            </View>
            <Text style={styles.quickLabel}>View Garage</Text>
          </TouchableOpacity>
        </View>

        {/* --- Chat Booking CTA --- */}
        <TouchableOpacity
          style={[styles.chatBookingCta, { backgroundColor: themeColors.primary + '08', borderColor: themeColors.primary + '20' }]}
          onPress={() => router.push('/customer/booking/chat')}
          activeOpacity={0.7}
        >
          <View style={[styles.chatBookingIcon, { backgroundColor: themeColors.primary + '18' }]}>
            <IconSymbol name="message.fill" size={18} color={themeColors.primary} />
          </View>
          <View style={styles.chatBookingContent}>
            <Text style={[styles.chatBookingTitle, { color: themeColors.primary }]}>
              Book with {themeBrand.appName}
            </Text>
            <Text style={styles.chatBookingHint}>Describe what you need and let AI handle the rest</Text>
          </View>
          <Text style={[styles.chatBookingChevron, { color: themeColors.primary }]}>›</Text>
        </TouchableOpacity>
      </ScrollView>

      <AppointmentPickerModal
        visible={pickerVisible}
        servicesToAdd={pickerServices}
        vehicleId={pickerVehicleId}
        allAppointments={allAppointments ?? []}
        onSelect={handlePickerSelect}
        onScheduleNew={handlePickerScheduleNew}
        onCancel={() => setPickerVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  segmentRow: {
    flexDirection: 'row',
    marginHorizontal: Theme.spacing.md,
    marginTop: Theme.spacing.sm,
    marginBottom: Theme.spacing.xs,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.md,
    padding: 3,
    gap: 2,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Theme.borderRadius.sm,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: Theme.colors.primary,
    ...Theme.shadow.sm,
  },
  segmentText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
  segmentTextActive: {
    color: Theme.colors.white,
  },
  scrollContent: {
    paddingHorizontal: Theme.spacing.md,
    paddingBottom: Theme.spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.spacing.lg,
    marginTop: Theme.spacing.sm,
  },
  greeting: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.textSecondary,
  },
  userName: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
  },
  bellButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  onboardingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    ...Theme.shadow.sm,
  },
  onboardingTextWrap: {
    flex: 1,
    marginRight: Theme.spacing.sm,
  },
  onboardingTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  onboardingSubtitle: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  onboardingCta: {
    backgroundColor: Theme.colors.primary,
    paddingVertical: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
  },
  onboardingCtaText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
  },
  heroCard: {
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    ...Theme.shadow.md,
  },
  heroContent: {
    alignItems: 'center',
  },
  heroVehicleName: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '600',
    color: Theme.colors.text,
    marginTop: Theme.spacing.sm,
  },
  vehicleSelector: {
    flexDirection: 'row',
    gap: 8,
    marginTop: Theme.spacing.sm,
    marginBottom: Theme.spacing.md,
  },
  vehicleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.colors.border,
  },
  vehicleDotActive: {
    backgroundColor: Theme.colors.primary,
    width: 20,
  },
  heroComponentRow: {
    marginTop: Theme.spacing.md,
    width: '100%',
  },
  heroNoHealth: {
    alignItems: 'center',
    paddingVertical: Theme.spacing.xl,
    paddingHorizontal: Theme.spacing.md,
    gap: Theme.spacing.sm,
  },
  heroNoHealthText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.sm,
    marginTop: Theme.spacing.sm,
  },
  upcomingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rescheduleMultipleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 2,
    marginTop: Theme.spacing.sm,
    marginBottom: Theme.spacing.sm,
  },
  rescheduleMultipleText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
  },
  sectionSubtitle: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginBottom: Theme.spacing.sm,
    marginTop: -4,
  },
  cardWrap: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    overflow: 'hidden',
    marginBottom: Theme.spacing.md,
    ...Theme.shadow.md,
  },
  hintCard: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    alignItems: 'center',
  },
  hintText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
  },
  deferredList: {
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.md,
  },
  waitlistList: {
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.md,
  },
  quickRow: {
    flexDirection: 'row',
    gap: Theme.spacing.sm,
    marginTop: Theme.spacing.xs,
  },
  quickCard: {
    flex: 1,
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.md,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    ...Theme.shadow.sm,
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.sm,
  },
  quickLabel: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '600',
    color: Theme.colors.text,
    textAlign: 'center',
  },
  chatBookingCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.primary + '08',
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '20',
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.md,
    marginTop: Theme.spacing.md,
    gap: Theme.spacing.sm,
  },
  chatBookingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBookingContent: {
    flex: 1,
  },
  chatBookingTitle: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
  chatBookingHint: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    marginTop: 1,
  },
  chatBookingChevron: {
    fontSize: Theme.fontSize.xl,
    color: Theme.colors.primary,
    fontWeight: '500',
  },
});
