import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { isAxiosError } from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { HealthRingGroup } from '@customer/components/vehicle/health-ring';
import { HealthTrendChart } from '@customer/components/vehicle/health-trend-chart';
import { ComponentStatusCard } from '@customer/components/vehicle/component-status-card';
import { DeferredServiceCard } from '@customer/components/service/deferred-service-card';
import { TreadDepthCard } from '@customer/components/vehicle/tread-depth-card';
import { FluidHistoryCard } from '@customer/components/vehicle/fluid-history-card';
import { OemRecommendationCard } from '@customer/components/service/oem-recommendation-card';
import { StatusBadge } from '@customer/components/shared/status-badge';
import { ExpandableSection } from '@customer/components/shared/expandable-section';
import {
  ServiceHistoryBlockSkeleton,
  VehicleDetailSkeleton,
} from '@customer/components/shared/skeleton';
import { Theme, getHealthColor, getStatusColor } from '@customer/constants/colors';
import { useVehicleHealth, useTreadHistory, useFluidHistory, useOemRecommendations, useVehicleHealthComposite } from '@customer/hooks/vehicles/use-vehicle-health';
import { useDeferredItems } from '@customer/hooks/services/use-deferred-items';
import { useAppointments, useAddServiceToAppointment } from '@customer/hooks/appointments/use-appointments';
import { useVehicles, useUpdateVehicle } from '@customer/hooks/vehicles/use-vehicles';
import { useServices } from '@customer/hooks/services/use-services';
import { useBookingStore } from '@/src/stores/customer/booking';
import { formatScheduledDate, formatScheduledTime } from '@customer/utils/date-format';
import { getVehicleMakeModel } from '@customer/utils/vehicle-display';
import type { Appointment, DeferredWorkItem, Vehicle } from '@customer/types/api';
import type { AppointmentStatus } from '@customer/types/enums';

const nicknameFormSchema = z.object({
  nickname: z.string().max(60, 'Use 60 characters or fewer'),
});

type NicknameForm = z.infer<typeof nicknameFormSchema>;

function formatAppointmentDate(appointment: Appointment): string {
  if (appointment.scheduled_date) {
    return new Date(appointment.scheduled_date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  return new Date(appointment.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function serviceLine(appointment: Appointment): string {
  return (
    appointment.services?.map((s) => s.service?.name ?? 'Service').join(', ') || 'Services TBD'
  );
}

const COMPONENT_NAMES: Record<string, string> = {
  oil: 'Oil Life',
  filter: 'Filters',
  tires: 'Tires',
  wipers: 'Wipers',
  brakes: 'Brakes',
  fluids: 'Fluids',
};

// Service history shows ONLY terminal/completed visits — never drafts,
// confirmed-but-not-yet-arrived, or in-flight appointments. Drafts
// (`created`) and pending statuses are NOT history.
const HISTORY_STATUSES = ['completed', 'paid', 'no_show'];

const COMPONENT_SERVICE_KEYWORDS: Record<string, string[]> = {
  oil: ['oil change', 'oil'],
  filter: ['air filter', 'cabin filter', 'filter'],
  tires: ['tire rotation', 'tire'],
  wipers: ['wiper blade', 'wiper'],
  brakes: ['brake inspection', 'brake pad', 'brake'],
  fluids: ['coolant flush', 'transmission fluid', 'fluid'],
};

function mapOemComponentToHealthKey(component: string): string {
  const lower = component.toLowerCase();
  if (lower.includes('oil')) return 'oil';
  if (lower.includes('filter')) return 'filter';
  if (lower.includes('tire') || lower.includes('rotation')) return 'tires';
  if (lower.includes('wiper')) return 'wipers';
  if (lower.includes('brake')) return 'brakes';
  if (lower.includes('fluid') || lower.includes('coolant') || lower.includes('transmission')) return 'fluids';
  return lower;
}


function VehicleNicknameForm({ vehicle }: { vehicle: Vehicle }) {
  const updateVehicle = useUpdateVehicle();
  const { control, handleSubmit, reset, formState: { errors } } = useForm<NicknameForm>({
    resolver: zodResolver(nicknameFormSchema),
    defaultValues: { nickname: vehicle.nickname ?? '' },
  });

  useEffect(() => {
    reset({ nickname: vehicle.nickname ?? '' });
  }, [vehicle.id, vehicle.nickname, reset]);

  const onSave = handleSubmit((data) => {
    const trimmed = data.nickname.trim();
    updateVehicle.mutate(
      {
        id: vehicle.id,
        body: { nickname: trimmed.length > 0 ? trimmed : null },
      },
      {
        onSuccess: () => {
          Alert.alert('Saved', 'Nickname updated.');
        },
        onError: (err: unknown) => {
          const msg = isAxiosError(err)
            ? String(err.response?.data?.message ?? err.message)
            : err instanceof Error
              ? err.message
              : 'Please try again.';
          Alert.alert('Could not save nickname', msg || 'Check your connection or try again later.');
        },
      }
    );
  });

  return (
    <View style={styles.nicknameCard}>
      <Text style={styles.nicknameLabel}>Nickname</Text>
      <Text style={styles.nicknameHint}>Optional — e.g. Mom's Car, Work Truck</Text>
      <Controller
        control={control}
        name="nickname"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            style={styles.nicknameInput}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            placeholder="Add a nickname"
            placeholderTextColor={Theme.colors.textTertiary}
            maxLength={60}
            autoCapitalize="words"
            autoCorrect
            editable={!updateVehicle.isPending}
          />
        )}
      />
      {errors.nickname ? (
        <Text style={styles.nicknameError}>{errors.nickname.message}</Text>
      ) : null}
      <TouchableOpacity
        style={[styles.saveNicknameBtn, updateVehicle.isPending && styles.saveNicknameBtnDisabled]}
        onPress={onSave}
        disabled={updateVehicle.isPending}
        activeOpacity={0.85}
      >
        <Text style={styles.saveNicknameText}>
          {updateVehicle.isPending ? 'Saving…' : 'Save nickname'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function VehicleDetailScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const vehicleId = Number(idParam);
  const router = useRouter();

  const { data: vehicles, isLoading: vehiclesLoading } = useVehicles();
  const { data: appointments, isLoading: appointmentsLoading } = useAppointments();
  const { data: deferredItems } = useDeferredItems(vehicleId);
  const { data: allServices } = useServices();
  const { data: treadRecords } = useTreadHistory(vehicleId);
  const { data: fluidRecords } = useFluidHistory(vehicleId);
  const { data: oemRecs } = useOemRecommendations(vehicleId);
  const startFromDeferred = useBookingStore((s) => s.startFromDeferred);
  const startFromDeferredFallback = useBookingStore((s) => s.startFromDeferredFallback);
  const startWithComponent = useBookingStore((s) => s.startWithComponent);
  const startWithComponents = useBookingStore((s) => s.startWithComponents);
  const addServiceMutation = useAddServiceToAppointment();

  const [selectedComponents, setSelectedComponents] = useState<Set<string>>(new Set());

  const vehicle = useMemo(
    () => vehicles?.find((v) => v.id === vehicleId) ?? null,
    [vehicles, vehicleId]
  );

  const history = useMemo(() => {
    if (!appointments || !vehicle) return [];
    return appointments
      .filter(
        (a) =>
          (a.vehicle_id === vehicle.id || a.vehicle?.id === vehicle.id) &&
          HISTORY_STATUSES.includes(a.status),
      )
      .sort((a, b) => {
        const da = a.completed_at ?? a.scheduled_date ?? a.created_at;
        const db = b.completed_at ?? b.scheduled_date ?? b.created_at;
        return db.localeCompare(da);
      });
  }, [appointments, vehicle]);

  const { data: health } = useVehicleHealth(vehicle?.id, vehicle);
  // Real trend points come from the composite endpoint; never fabricate.
  // The HealthTrendChart shows an honest empty state when fewer than 2 points.
  const { data: composite } = useVehicleHealthComposite(vehicle?.id);
  const trendData = composite?.trend ?? [];

  const activeDeferred = useMemo(
    () => deferredItems?.filter((d) => d.status === 'observed' || d.status === 'communicated') ?? [],
    [deferredItems]
  );

  const TERMINAL_STATUSES = ['completed', 'paid', 'cancelled'];

  const bookedComponentKeys = useMemo(() => {
    if (!appointments || !vehicle) return new Set<string>();
    const activeAppts = appointments.filter(
      (a) =>
        (a.vehicle_id === vehicle.id || a.vehicle?.id === vehicle.id) &&
        !TERMINAL_STATUSES.includes(a.status),
    );
    const keys = new Set<string>();
    for (const appt of activeAppts) {
      for (const svc of appt.services ?? []) {
        const name = (svc.service?.name ?? '').toLowerCase();
        if (name.includes('oil')) keys.add('oil');
        if (name.includes('filter') || name.includes('cabin')) keys.add('filter');
        if (name.includes('tire') || name.includes('rotation')) keys.add('tires');
        if (name.includes('wiper')) keys.add('wipers');
        if (name.includes('brake') || name.includes('pad')) keys.add('brakes');
        if (name.includes('fluid') || name.includes('coolant') || name.includes('transmission')) keys.add('fluids');
      }
    }
    return keys;
  }, [appointments, vehicle]);

  const existingAppointment = useMemo(() => {
    if (!appointments || !vehicle) return null;
    return appointments.find(
      (a) =>
        (a.vehicle_id === vehicle.id || a.vehicle?.id === vehicle.id) &&
        !TERMINAL_STATUSES.includes(a.status),
    ) ?? null;
  }, [appointments, vehicle]);

  const bookableComponents = useMemo(() => {
    if (!health) return [];
    return Object.entries(health.components)
      .filter(([key, score]) => score < 40 && !bookedComponentKeys.has(key))
      .map(([key]) => key);
  }, [health, bookedComponentKeys]);

  const findServiceForComponent = useCallback((componentKey: string) => {
    if (!allServices) return null;
    const keywords = COMPONENT_SERVICE_KEYWORDS[componentKey] ?? [];
    for (const kw of keywords) {
      const match = allServices.find((s) => s.name.toLowerCase().includes(kw));
      if (match) return match;
    }
    return null;
  }, [allServices]);

  const toggleComponent = useCallback((key: string) => {
    setSelectedComponents((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleBookSelected = useCallback(() => {
    if (!vehicle || selectedComponents.size === 0) return;
    const components = Array.from(selectedComponents);

    if (existingAppointment) {
      const serviceEntries = components
        .map((key) => ({ key, service: findServiceForComponent(key) }))
        .filter((e) => e.service != null);

      if (serviceEntries.length === 0) {
        router.push(startWithComponents(components, vehicle));
        setSelectedComponents(new Set());
        return;
      }

      const serviceNames = serviceEntries.map((e) => e.service!.name).join(', ');
      const apptDate = formatScheduledDate(existingAppointment.scheduled_date);
      const apptTime = formatScheduledTime(existingAppointment.scheduled_time);

      Alert.alert(
        'Add to Existing Appointment?',
        `Add ${serviceNames} to your ${apptDate} · ${apptTime} appointment?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'New Appointment',
            onPress: () => {
              if (components.length === 1) {
                router.push(startWithComponent(components[0], vehicle));
              } else {
                router.push(startWithComponents(components, vehicle));
              }
              setSelectedComponents(new Set());
            },
          },
          {
            text: 'Add',
            style: 'default',
            onPress: async () => {
              for (const entry of serviceEntries) {
                await addServiceMutation.mutateAsync({
                  appointmentId: existingAppointment.id,
                  serviceId: entry.service!.id,
                });
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setSelectedComponents(new Set());
              Alert.alert('Added', `${serviceNames} added to your appointment.`);
            },
          },
        ],
      );
      return;
    }

    if (components.length === 1) {
      router.push(startWithComponent(components[0], vehicle));
    } else {
      router.push(startWithComponents(components, vehicle));
    }
    setSelectedComponents(new Set());
  }, [vehicle, selectedComponents, existingAppointment, findServiceForComponent, addServiceMutation, startWithComponent, startWithComponents, router]);

  function handleBookDeferred(item: DeferredWorkItem) {
    if (!vehicle) return;
    const service = allServices?.find((s) => s.id === item.recommended_service_id);
    if (service) {
      router.push(startFromDeferred(item, vehicle, service));
    } else {
      router.push(startFromDeferredFallback(item.observation_type, vehicle));
    }
  }

  if (vehiclesLoading && !vehicles) {
    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <VehicleDetailSkeleton />
      </ScrollView>
    );
  }

  if (!vehicle || Number.isNaN(vehicleId)) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notFoundTitle}>Vehicle not found</Text>
        <Text style={styles.notFoundMsg}>This vehicle may have been removed.</Text>
      </View>
    );
  }

  const makeModelLine = getVehicleMakeModel(vehicle);
  const headerPrimary = vehicle.nickname?.trim() || makeModelLine;
  const headerSecondary = vehicle.nickname?.trim() ? makeModelLine : null;
  const plate =
    vehicle.license_plate && vehicle.license_plate_state
      ? `${vehicle.license_plate} · ${vehicle.license_plate_state}`
      : vehicle.license_plate ?? 'No plate on file';

  const healthColor = health ? getHealthColor(health.overall) : Theme.colors.primary;

  const healthMaintenanceSection = (
    <>
      <TouchableOpacity
        style={[styles.healthDashboardCta, { borderColor: healthColor + '40' }]}
        onPress={() => router.push(`/customer/vehicle/${vehicleId}/health`)}
        activeOpacity={0.7}
      >
        <View style={[styles.healthCtaIcon, { backgroundColor: healthColor + '15' }]}>
          <Ionicons name="fitness-outline" size={22} color={healthColor} />
        </View>
        <View style={styles.healthCtaText}>
          <Text style={styles.healthCtaTitle}>Vehicle Health Dashboard</Text>
          <Text style={styles.healthCtaSubtitle}>
            {health ? `Score: ${health.overall}/100` : 'View full health report'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Theme.colors.textTertiary} />
      </TouchableOpacity>

      {health ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Health Score</Text>
          <View style={styles.healthWrap}>
            <HealthRingGroup health={health} />
          </View>
        </View>
      ) : null}

      {health ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Health Trend</Text>
          <HealthTrendChart data={trendData} />
        </View>
      ) : null}

      {health ? (
        <>
          <Text style={styles.sectionHeading}>Component Status</Text>
          {bookableComponents.length > 1 && (
            <Text style={styles.multiSelectHint}>Tap components to select, then book together</Text>
          )}
          <View style={styles.componentGrid}>
            {Object.entries(health.components).map(([key, score]) => {
              const alreadyBooked = bookedComponentKeys.has(key);
              return (
                <ComponentStatusCard
                  key={key}
                  name={COMPONENT_NAMES[key] ?? key}
                  score={score}
                  selected={selectedComponents.has(key)}
                  booked={alreadyBooked}
                  onBookService={
                    score < 40 && !alreadyBooked
                      ? (bookableComponents.length > 1
                          ? () => toggleComponent(key)
                          : () => {
                              setSelectedComponents(new Set([key]));
                              // Defer to handleBookSelected via effect-like pattern:
                              // For single bookable, go straight through
                              if (existingAppointment) {
                                const svc = findServiceForComponent(key);
                                if (svc) {
                                  const apptDate = formatScheduledDate(existingAppointment.scheduled_date);
                                  const apptTime = formatScheduledTime(existingAppointment.scheduled_time);
                                  Alert.alert(
                                    'Add to Existing Appointment?',
                                    `Add ${svc.name} to your ${apptDate} · ${apptTime} appointment?`,
                                    [
                                      { text: 'Cancel', style: 'cancel', onPress: () => setSelectedComponents(new Set()) },
                                      {
                                        text: 'New Appointment',
                                        onPress: () => {
                                          router.push(startWithComponent(key, vehicle));
                                          setSelectedComponents(new Set());
                                        },
                                      },
                                      {
                                        text: 'Add',
                                        style: 'default',
                                        onPress: async () => {
                                          await addServiceMutation.mutateAsync({ appointmentId: existingAppointment.id, serviceId: svc.id });
                                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                          setSelectedComponents(new Set());
                                          Alert.alert('Added', `${svc.name} added to your appointment.`);
                                        },
                                      },
                                    ],
                                  );
                                  return;
                                }
                              }
                              router.push(startWithComponent(key, vehicle));
                              setSelectedComponents(new Set());
                            })
                      : undefined
                  }
                />
              );
            })}
          </View>
          {selectedComponents.size > 0 && (
            <TouchableOpacity
              style={[styles.bookSelectedBtn, existingAppointment && { backgroundColor: '#22C55E' }]}
              onPress={handleBookSelected}
              activeOpacity={0.85}
            >
              <Ionicons name={existingAppointment ? 'add-circle-outline' : 'calendar-outline'} size={18} color="#fff" />
              <Text style={styles.bookSelectedText}>
                {existingAppointment
                  ? `Add ${selectedComponents.size} to Appointment`
                  : `Book ${selectedComponents.size} Service${selectedComponents.size > 1 ? 's' : ''}`}
              </Text>
            </TouchableOpacity>
          )}
        </>
      ) : null}

      {treadRecords && treadRecords.length > 0 ? <TreadDepthCard records={treadRecords} /> : null}
      {fluidRecords && fluidRecords.length > 0 ? <FluidHistoryCard records={fluidRecords} /> : null}
      {oemRecs && oemRecs.length > 0 ? (
        <OemRecommendationCard
          recommendations={oemRecs}
          onBookService={(component) => {
            router.push(startWithComponent(mapOemComponentToHealthKey(component), vehicle));
          }}
        />
      ) : oemRecs ? (
        <Text style={styles.mutedInline}>
          OEM recommendations will appear here once your CARFAX service history is on file.
        </Text>
      ) : null}

      {activeDeferred.length > 0 && (
        <>
          <Text style={styles.sectionHeading}>Your Technician Observed</Text>
          <View style={styles.deferredList}>
            {activeDeferred.map((item) => (
              <DeferredServiceCard
                key={item.id}
                item={item}
                onBookNow={handleBookDeferred}
              />
            ))}
          </View>
        </>
      )}

      {!health &&
      !(treadRecords && treadRecords.length > 0) &&
      !(fluidRecords && fluidRecords.length > 0) &&
      oemRecs == null &&
      activeDeferred.length === 0 ? (
        <Text style={styles.mutedInline}>
          Health and maintenance details will appear when data is available for this vehicle.
        </Text>
      ) : null}
    </>
  );

  const specsSection = (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>Specs</Text>
      <View style={styles.specsGrid}>
        <View style={styles.specCell}>
          <Text style={styles.specLabel}>VIN</Text>
          <Text style={styles.specValue}>{vehicle.vin ?? '—'}</Text>
        </View>
        <View style={styles.specCell}>
          <Text style={styles.specLabel}>Engine</Text>
          <Text style={styles.specValue}>{vehicle.engine ?? '—'}</Text>
        </View>
        <View style={styles.specCell}>
          <Text style={styles.specLabel}>Mileage</Text>
          <Text style={styles.specValue}>
            {vehicle.mileage != null ? `${vehicle.mileage.toLocaleString()} mi` : '—'}
          </Text>
        </View>
        <View style={styles.specCell}>
          <Text style={styles.specLabel}>Color</Text>
          <Text style={styles.specValue}>{vehicle.color ?? '—'}</Text>
        </View>
      </View>
    </View>
  );

  const historySection =
    appointmentsLoading && !appointments ? (
      <ServiceHistoryBlockSkeleton />
    ) : history.length === 0 ? (
      <View style={styles.emptyHistory}>
        <Text style={styles.emptyHistoryText}>No service history yet</Text>
      </View>
    ) : (
      history.map((appt) => (
        <View
          key={appt.id}
          style={[styles.historyCard, { borderLeftColor: getStatusColor(appt.status) }]}
        >
          <View style={styles.historyHeader}>
            <Text style={styles.historyDate}>{formatAppointmentDate(appt)}</Text>
            <StatusBadge status={appt.status as AppointmentStatus} />
          </View>
          <Text style={styles.historyServices} numberOfLines={2}>
            {serviceLine(appt)}
          </Text>
        </View>
      ))
    );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerBlock}>
        <Text style={styles.title} numberOfLines={2}>
          {headerPrimary}
        </Text>
        {headerSecondary ? (
          <Text style={styles.subtitleMakeModel} numberOfLines={1}>
            {headerSecondary}
          </Text>
        ) : null}
        <Text style={styles.plate}>{plate}</Text>
        {vehicle.color ? (
          <View style={[styles.colorBadge, { borderColor: Theme.colors.border }]}>
            <View style={[styles.colorSwatch, { backgroundColor: vehicle.color }]} />
            <Text style={styles.colorLabel}>{vehicle.color}</Text>
          </View>
        ) : null}
      </View>

      <VehicleNicknameForm vehicle={vehicle} />

      <ExpandableSection title="Health & maintenance" defaultOpen>
        {healthMaintenanceSection}
      </ExpandableSection>

      <ExpandableSection title="Specifications">{specsSection}</ExpandableSection>

      <ExpandableSection title="Service history">{historySection}</ExpandableSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  scrollContent: {
    padding: Theme.spacing.md,
    paddingBottom: Theme.spacing.xxl,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Theme.spacing.lg,
    backgroundColor: Theme.colors.background,
  },
  notFoundTitle: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.sm,
  },
  notFoundMsg: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
  },
  headerBlock: {
    marginBottom: Theme.spacing.lg,
  },
  title: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  subtitleMakeModel: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.textSecondary,
    marginTop: Theme.spacing.xs,
  },
  plate: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.textSecondary,
    marginTop: Theme.spacing.xs,
    letterSpacing: 0.5,
  },
  colorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: Theme.spacing.sm,
    paddingVertical: Theme.spacing.xs,
    paddingHorizontal: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.full,
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    gap: Theme.spacing.sm,
  },
  colorSwatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  colorLabel: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
    textTransform: 'capitalize',
  },
  nicknameCard: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    ...Theme.shadow.md,
  },
  nicknameLabel: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.xs,
  },
  nicknameHint: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    marginBottom: Theme.spacing.sm,
  },
  nicknameInput: {
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.md,
    paddingVertical: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.md,
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
    backgroundColor: Theme.colors.surface,
    marginBottom: Theme.spacing.sm,
  },
  nicknameError: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.error,
    marginBottom: Theme.spacing.sm,
  },
  saveNicknameBtn: {
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.md,
    paddingVertical: Theme.spacing.sm,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  saveNicknameBtnDisabled: {
    opacity: 0.6,
  },
  saveNicknameText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
  },
  healthDashboardCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1.5,
    gap: Theme.spacing.md,
    ...Theme.shadow.md,
  },
  healthCtaIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  healthCtaText: {
    flex: 1,
  },
  healthCtaTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  healthCtaSubtitle: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    ...Theme.shadow.md,
  },
  sectionTitle: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.md,
  },
  sectionHeading: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.sm,
  },
  healthWrap: {
    alignItems: 'center',
  },
  multiSelectHint: {
    fontSize: 12,
    color: Theme.colors.textSecondary,
    marginBottom: Theme.spacing.sm,
    fontStyle: 'italic',
  },
  componentGrid: {
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.sm,
  },
  bookSelectedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: 14,
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.lg,
    ...Theme.shadow.md,
  },
  bookSelectedText: {
    color: '#fff',
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
  },
  deferredList: {
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.lg,
  },
  specsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -Theme.spacing.sm,
  },
  specCell: {
    width: '50%',
    paddingHorizontal: Theme.spacing.sm,
    marginBottom: Theme.spacing.md,
  },
  specLabel: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Theme.spacing.xs,
  },
  specValue: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
    fontWeight: '500',
  },
  mutedInline: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    lineHeight: 20,
  },
  emptyHistory: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    alignItems: 'center',
  },
  emptyHistoryText: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.textSecondary,
  },
  historyCard: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
    borderLeftWidth: 4,
    ...Theme.shadow.sm,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.spacing.xs,
    gap: Theme.spacing.sm,
  },
  historyDate: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
    flex: 1,
  },
  historyServices: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
  },
});
