import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Theme, getHealthColor } from '@customer/constants/colors';
import { useFleetManagerGuard } from '@customer/components/fleet/fleet-manager-guard';
import { SkeletonBox } from '@customer/components/shared/skeleton';
import { EmptyState } from '@customer/components/shared/empty-state';
import { useFleetVehicles } from '@customer/hooks/fleet/use-fleet-vehicles';
import { useServices } from '@customer/hooks/services/use-services';
import { useFleetBooking, useFleetBatchBooking } from '@customer/hooks/fleet/use-fleet-booking';
import { buildFallbackBookingSuggestions } from '@customer/services/booking-fallback-suggestions';
import { toISODate } from '@customer/utils/date-format';
import type { FleetVehicleCard } from '@customer/types/fleet';
import type { Service, ScoredSuggestion } from '@customer/types/api';

type WizardStep = 'vehicles' | 'services' | 'schedule' | 'review';
const STEPS: WizardStep[] = ['vehicles', 'services', 'schedule', 'review'];
const STEP_TITLES: Record<WizardStep, string> = {
  vehicles: 'Select Vehicle(s)',
  services: 'Select Service',
  schedule: 'Select Date & Time',
  review: 'Review & Confirm',
};
const TAX_RATE = 0.0825;

export default function FleetBookScreen() {
  const allowed = useFleetManagerGuard();
  const router = useRouter();
  const params = useLocalSearchParams<{ vehicleId?: string; serviceDesc?: string }>();

  const [step, setStep] = useState<WizardStep>('vehicles');
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<Set<number>>(new Set());
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<number>>(new Set());
  const [selectedSlot, setSelectedSlot] = useState<ScoredSuggestion | null>(null);
  const [poNumber, setPoNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const { data: fleetVehicles, isLoading: vehiclesLoading } = useFleetVehicles();
  const { data: services, isPending: servicesLoading } = useServices();
  const fleetBooking = useFleetBooking();
  const batchBooking = useFleetBatchBooking();

  useEffect(() => {
    if (params.vehicleId) {
      setSelectedVehicleIds(new Set([Number(params.vehicleId)]));
    }
  }, [params.vehicleId]);

  const fallbackSlots = useMemo(
    () => buildFallbackBookingSuggestions(toISODate(new Date())),
    [],
  );

  const stepIndex = STEPS.indexOf(step);
  const isBatch = selectedVehicleIds.size > 1;

  const selectedVehicles = useMemo(
    () => (fleetVehicles ?? []).filter((v) => selectedVehicleIds.has(v.id)),
    [fleetVehicles, selectedVehicleIds],
  );

  const selectedServices = useMemo(
    () => (services ?? []).filter((s) => selectedServiceIds.has(s.id)),
    [services, selectedServiceIds],
  );

  const { subtotal, tax, total, perVehicleTotal } = useMemo(() => {
    const sub = selectedServices.reduce((sum, s) => sum + Number(s.base_price), 0);
    const t = Math.round(sub * TAX_RATE * 100) / 100;
    const tot = Math.round((sub + t) * 100) / 100;
    const vehicleCount = Math.max(selectedVehicleIds.size, 1);
    return { subtotal: sub, tax: t, total: tot * vehicleCount, perVehicleTotal: tot };
  }, [selectedServices, selectedVehicleIds]);

  const vehicleName = useCallback((v: FleetVehicleCard) => {
    return [v.year, v.make, v.model].filter(Boolean).join(' ') || `Vehicle #${v.id}`;
  }, []);

  const toggleVehicle = useCallback((id: number) => {
    setSelectedVehicleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleService = useCallback((id: number) => {
    setSelectedServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const canAdvance = useMemo(() => {
    switch (step) {
      case 'vehicles': return selectedVehicleIds.size > 0;
      case 'services': return selectedServiceIds.size > 0;
      case 'schedule': return selectedSlot != null;
      case 'review': return true;
    }
  }, [step, selectedVehicleIds, selectedServiceIds, selectedSlot]);

  const goNext = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1]);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [step]);

  const goBack = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) {
      setStep(STEPS[idx - 1]);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } else {
      router.back();
    }
  }, [step, router]);

  const handleSubmit = useCallback(async () => {
    if (!selectedSlot) return;
    setSubmitting(true);

    try {
      const svcIds = Array.from(selectedServiceIds);
      const vehicleIds = Array.from(selectedVehicleIds);

      if (vehicleIds.length === 1) {
        await fleetBooking.mutateAsync({
          vehicle_id: vehicleIds[0],
          service_ids: svcIds,
          address_id: 0,
          scheduled_date: selectedSlot.date,
          scheduled_time: selectedSlot.timeSlot,
          po_number: poNumber || undefined,
        });
      } else {
        await batchBooking.mutateAsync({
          vehicle_ids: vehicleIds,
          service_ids: svcIds,
          address_id: 0,
          scheduled_date: selectedSlot.date,
          scheduled_time: selectedSlot.timeSlot,
          po_number: poNumber || undefined,
        });
      }

      Alert.alert(
        'Booking Confirmed',
        isBatch
          ? `${vehicleIds.length} vehicles scheduled for service.`
          : `Service booked for ${selectedVehicles[0] ? vehicleName(selectedVehicles[0]) : 'your vehicle'}.`,
        [{ text: 'Done', onPress: () => router.back() }],
      );
    } catch {
      Alert.alert('Booking Failed', 'Could not create the booking. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [selectedSlot, selectedServiceIds, selectedVehicleIds, poNumber, isBatch, selectedVehicles, vehicleName, fleetBooking, batchBooking, router]);

  if (!allowed) return null;

  const renderProgressBar = () => (
    <View style={s.progressRow}>
      {STEPS.map((st, i) => (
        <View
          key={st}
          style={[s.progressDot, i <= stepIndex && s.progressDotActive]}
        />
      ))}
    </View>
  );

  const renderVehicleStep = () => {
    if (vehiclesLoading) {
      return (
        <View style={s.stepBody}>
          <SkeletonBox width="100%" height={80} borderRadius={12} />
          <View style={{ height: 12 }} />
          <SkeletonBox width="100%" height={80} borderRadius={12} />
        </View>
      );
    }

    const list = fleetVehicles ?? [];
    if (list.length === 0) {
      return (
        <EmptyState
          title="No fleet vehicles"
          message="Add vehicles to your fleet to book service."
        />
      );
    }

    return (
      <View style={s.stepBody}>
        <Text style={s.stepHint}>
          Select one or more fleet vehicles. Multi-select for batch booking.
        </Text>
        {list.map((v) => {
          const selected = selectedVehicleIds.has(v.id);
          const name = vehicleName(v);
          const healthColor = getHealthColor(v.health_score);
          return (
            <TouchableOpacity
              key={v.id}
              style={[s.vehicleCard, selected && s.vehicleCardSelected]}
              onPress={() => toggleVehicle(v.id)}
              activeOpacity={0.75}
            >
              <View style={s.vehicleIcon}>
                <Ionicons
                  name="bus-outline"
                  size={24}
                  color={selected ? Theme.colors.primary : Theme.colors.textSecondary}
                />
              </View>
              <View style={s.vehicleInfo}>
                <Text style={[s.vehicleName, selected && s.vehicleNameSelected]} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={s.vehicleMeta}>
                  {v.license_plate ?? 'No plate'}
                  {v.assigned_driver ? ` · ${v.assigned_driver.name}` : ''}
                </Text>
              </View>
              <View style={[s.healthDot, { backgroundColor: healthColor }]}>
                <Text style={s.healthText}>{v.health_score}</Text>
              </View>
              <View style={[s.checkbox, selected && s.checkboxSelected]}>
                {selected && <Ionicons name="checkmark" size={16} color={Theme.colors.white} />}
              </View>
            </TouchableOpacity>
          );
        })}
        {selectedVehicleIds.size > 1 && (
          <View style={s.batchBanner}>
            <Ionicons name="layers-outline" size={18} color={Theme.colors.primary} />
            <Text style={s.batchText}>
              Batch booking: {selectedVehicleIds.size} vehicles selected
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderServiceStep = () => {
    if (servicesLoading) {
      return (
        <View style={s.stepBody}>
          <SkeletonBox width="100%" height={60} borderRadius={12} />
          <View style={{ height: 12 }} />
          <SkeletonBox width="100%" height={60} borderRadius={12} />
        </View>
      );
    }

    const list = services ?? [];
    return (
      <View style={s.stepBody}>
        <Text style={s.stepHint}>Choose the service(s) to perform on each selected vehicle.</Text>
        {list.map((svc) => {
          const selected = selectedServiceIds.has(svc.id);
          return (
            <TouchableOpacity
              key={svc.id}
              style={[s.serviceCard, selected && s.serviceCardSelected]}
              onPress={() => toggleService(svc.id)}
              activeOpacity={0.75}
            >
              <View style={s.serviceBody}>
                <Text style={[s.serviceName, selected && s.serviceNameSelected]} numberOfLines={2}>
                  {svc.name}
                </Text>
                {svc.description ? (
                  <Text style={s.serviceDesc} numberOfLines={1}>{svc.description}</Text>
                ) : null}
              </View>
              <Text style={s.servicePrice}>${Number(svc.base_price).toFixed(2)}</Text>
              <View style={[s.checkbox, selected && s.checkboxSelected]}>
                {selected && <Ionicons name="checkmark" size={16} color={Theme.colors.white} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderScheduleStep = () => (
    <View style={s.stepBody}>
      <View style={s.scheduleHero}>
        <Ionicons name="sparkles" size={20} color={Theme.colors.primary} />
        <Text style={s.scheduleHeroText}>
          {isBatch
            ? `Showing availability for your fleet's service location — ${selectedVehicleIds.size} vehicles.`
            : 'Smart suggestions based on fleet service location availability.'}
        </Text>
      </View>
      {fallbackSlots.map((slot, idx) => {
        const isSelected = selectedSlot === slot;
        return (
          <TouchableOpacity
            key={`${slot.date}-${slot.timeSlot}`}
            style={[s.slotCard, isSelected && s.slotCardSelected]}
            onPress={() => setSelectedSlot(slot)}
            activeOpacity={0.8}
          >
            <View style={s.slotHeader}>
              <Text style={s.slotDate}>
                {new Date(slot.date + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </Text>
              <Text style={s.slotTime}>{slot.timeSlot}</Text>
            </View>
            {slot.technicianName ? (
              <Text style={s.slotTech}>{slot.technicianName} · ~{slot.estimatedDriveMinutes} min</Text>
            ) : null}
            {isSelected && (
              <View style={s.slotCheck}>
                <Ionicons name="checkmark-circle" size={22} color={Theme.colors.primary} />
              </View>
            )}
          </TouchableOpacity>
        );
      })}
      <View style={s.demoBadgeRow}>
        <View style={s.demoBadge}>
          <Text style={s.demoBadgeText}>Demo times — live scheduling replaces these when backend BE-24 is ready</Text>
        </View>
      </View>
    </View>
  );

  const renderReviewStep = () => (
    <View style={s.stepBody}>
      <View style={s.reviewHero}>
        <Text style={s.reviewHeroTitle}>
          {isBatch ? `Scheduling ${selectedVehicles.length} vehicles` : 'Review your booking'}
        </Text>
        <Text style={s.reviewHeroSub}>Confirm the details below before submitting.</Text>
      </View>

      <Text style={s.reviewLabel}>
        {isBatch ? `Vehicles (${selectedVehicles.length})` : 'Vehicle'}
      </Text>
      <View style={s.reviewCard}>
        {selectedVehicles.map((v) => (
          <View key={v.id} style={s.reviewLineItem}>
            <Ionicons name="bus-outline" size={16} color={Theme.colors.textSecondary} />
            <Text style={s.reviewLineText}>{vehicleName(v)}</Text>
            <Text style={s.reviewLineMeta}>{v.license_plate}</Text>
          </View>
        ))}
      </View>

      <Text style={s.reviewLabel}>Services</Text>
      <View style={s.reviewCard}>
        {selectedServices.map((svc) => (
          <View key={svc.id} style={s.reviewLineItem}>
            <Text style={s.reviewLineText}>{svc.name}</Text>
            <Text style={s.reviewLinePrice}>${Number(svc.base_price).toFixed(2)}</Text>
          </View>
        ))}
      </View>

      <Text style={s.reviewLabel}>Schedule</Text>
      <View style={s.reviewCard}>
        {selectedSlot ? (
          <>
            <Text style={s.reviewValue}>
              {new Date(selectedSlot.date + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
            <Text style={s.reviewMeta}>{selectedSlot.timeSlot}</Text>
          </>
        ) : (
          <Text style={s.reviewMeta}>No time selected</Text>
        )}
      </View>

      <Text style={s.reviewLabel}>PO Number (optional)</Text>
      <TextInput
        style={s.poInput}
        placeholder="Enter PO number"
        placeholderTextColor={Theme.colors.textTertiary}
        value={poNumber}
        onChangeText={setPoNumber}
        returnKeyType="done"
      />

      <View style={s.totalsCard}>
        <View style={s.totalsRow}>
          <Text style={s.totalsLabel}>
            Subtotal {isBatch ? `(× ${selectedVehicles.length} vehicles)` : ''}
          </Text>
          <Text style={s.totalsValue}>
            ${(subtotal * Math.max(selectedVehicleIds.size, 1)).toFixed(2)}
          </Text>
        </View>
        <View style={s.totalsRow}>
          <Text style={s.totalsLabel}>Est. tax</Text>
          <Text style={s.totalsValue}>
            ${(tax * Math.max(selectedVehicleIds.size, 1)).toFixed(2)}
          </Text>
        </View>
        <View style={s.totalsDivider} />
        <View style={s.totalsRow}>
          <Text style={s.totalsGrandLabel}>Total</Text>
          <Text style={s.totalsGrandValue}>${total.toFixed(2)}</Text>
        </View>
        {isBatch && (
          <Text style={s.perVehicleNote}>
            ${perVehicleTotal.toFixed(2)} per vehicle
          </Text>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      {renderProgressBar()}
      <Text style={s.stepTitle}>{STEP_TITLES[step]}</Text>

      <ScrollView
        ref={scrollRef}
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 'vehicles' && renderVehicleStep()}
        {step === 'services' && renderServiceStep()}
        {step === 'schedule' && renderScheduleStep()}
        {step === 'review' && renderReviewStep()}
      </ScrollView>

      <View style={s.footer}>
        <View style={s.footerButtons}>
          <TouchableOpacity style={s.backBtn} onPress={goBack} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={Theme.colors.text} />
            <Text style={s.backBtnText}>{stepIndex === 0 ? 'Cancel' : 'Back'}</Text>
          </TouchableOpacity>
          {step === 'review' ? (
            <TouchableOpacity
              style={[s.confirmBtn, submitting && s.confirmBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color={Theme.colors.white} />
              ) : (
                <Text style={s.confirmBtnText}>
                  {isBatch ? `Book ${selectedVehicleIds.size} Vehicles` : 'Confirm Booking'}
                </Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[s.nextBtn, !canAdvance && s.nextBtnDisabled]}
              onPress={goNext}
              disabled={!canAdvance}
              activeOpacity={0.85}
            >
              <Text style={s.nextBtnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={18} color={Theme.colors.white} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Theme.colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Theme.spacing.md, paddingBottom: Theme.spacing.xxl },

  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: Theme.spacing.sm,
    paddingBottom: Theme.spacing.xs,
  },
  progressDot: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.colors.borderLight,
  },
  progressDotActive: { backgroundColor: Theme.colors.primary },

  stepTitle: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Theme.colors.text,
    paddingHorizontal: Theme.spacing.md,
    paddingBottom: Theme.spacing.sm,
  },
  stepBody: { paddingTop: Theme.spacing.xs },
  stepHint: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: Theme.spacing.md,
  },

  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: Theme.colors.border,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
    ...Theme.shadow.sm,
  },
  vehicleCardSelected: {
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.primary + '08',
  },
  vehicleIcon: {
    width: 44,
    height: 44,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Theme.spacing.sm,
  },
  vehicleInfo: { flex: 1, minWidth: 0 },
  vehicleName: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  vehicleNameSelected: { color: Theme.colors.primary },
  vehicleMeta: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginTop: 1,
  },
  healthDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Theme.spacing.sm,
  },
  healthText: { fontSize: 11, fontWeight: '800', color: Theme.colors.white },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.primary,
  },
  batchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    backgroundColor: Theme.colors.primary + '10',
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    marginTop: Theme.spacing.sm,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '30',
  },
  batchText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.primary,
  },

  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: Theme.colors.border,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
    ...Theme.shadow.sm,
  },
  serviceCardSelected: {
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.primary + '08',
  },
  serviceBody: { flex: 1, minWidth: 0, marginRight: Theme.spacing.sm },
  serviceName: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  serviceNameSelected: { color: Theme.colors.primary },
  serviceDesc: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  servicePrice: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
    marginRight: Theme.spacing.sm,
  },

  scheduleHero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Theme.spacing.sm,
    backgroundColor: Theme.colors.primary + '10',
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '30',
  },
  scheduleHeroText: {
    flex: 1,
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    lineHeight: 20,
  },
  slotCard: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: Theme.colors.border,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
    ...Theme.shadow.sm,
  },
  slotCardSelected: {
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.primary + '08',
  },
  slotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  slotDate: { fontSize: Theme.fontSize.md, fontWeight: '600', color: Theme.colors.text },
  slotTime: { fontSize: Theme.fontSize.lg, fontWeight: '800', color: Theme.colors.primary },
  slotTech: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginTop: Theme.spacing.xs,
  },
  slotCheck: { position: 'absolute', top: Theme.spacing.md, right: Theme.spacing.md },
  demoBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Theme.spacing.md,
  },
  demoBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: Theme.borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  demoBadgeText: { fontSize: 11, fontWeight: '600', color: '#92400E' },

  reviewHero: {
    backgroundColor: Theme.colors.primary + '10',
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '33',
  },
  reviewHeroTitle: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.xs,
  },
  reviewHeroSub: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    lineHeight: 20,
  },
  reviewLabel: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '700',
    color: Theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: Theme.spacing.sm,
    marginTop: Theme.spacing.sm,
  },
  reviewCard: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    ...Theme.shadow.sm,
  },
  reviewLineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    paddingVertical: Theme.spacing.xs,
  },
  reviewLineText: {
    flex: 1,
    fontSize: Theme.fontSize.md,
    fontWeight: '500',
    color: Theme.colors.text,
  },
  reviewLineMeta: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    fontFamily: 'Courier',
  },
  reviewLinePrice: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  reviewValue: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  reviewMeta: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  poInput: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    padding: Theme.spacing.md,
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
    minHeight: 48,
  },
  totalsCard: {
    marginTop: Theme.spacing.lg,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    ...Theme.shadow.md,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Theme.spacing.sm,
  },
  totalsLabel: { fontSize: Theme.fontSize.md, color: Theme.colors.textSecondary },
  totalsValue: { fontSize: Theme.fontSize.md, fontWeight: '600', color: Theme.colors.text },
  totalsDivider: {
    height: 1,
    backgroundColor: Theme.colors.borderLight,
    marginVertical: Theme.spacing.md,
  },
  totalsGrandLabel: { fontSize: Theme.fontSize.lg, fontWeight: '700', color: Theme.colors.text },
  totalsGrandValue: { fontSize: Theme.fontSize.xxl, fontWeight: '800', color: Theme.colors.primary },
  perVehicleNote: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    textAlign: 'right',
    marginTop: Theme.spacing.xs,
  },

  footer: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.sm,
    paddingBottom: Theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.borderLight,
    backgroundColor: Theme.colors.background,
  },
  footerButtons: {
    flexDirection: 'row',
    gap: Theme.spacing.sm,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.xs,
    paddingVertical: 14,
    paddingHorizontal: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    backgroundColor: Theme.colors.surfaceElevated,
  },
  backBtnText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  nextBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.xs,
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: 14,
    minHeight: 52,
  },
  nextBtnDisabled: { backgroundColor: Theme.colors.border },
  nextBtnText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.white,
  },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.xs,
    backgroundColor: Theme.colors.success,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: 14,
    minHeight: 52,
    ...Theme.shadow.md,
  },
  confirmBtnDisabled: {
    backgroundColor: Theme.colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmBtnText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '800',
    color: Theme.colors.white,
  },
});
