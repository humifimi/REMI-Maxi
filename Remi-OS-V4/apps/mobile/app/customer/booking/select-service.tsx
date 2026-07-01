import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';
import { ServiceCard } from '@customer/components/service/service-card';
import { BookingServiceListSkeleton } from '@customer/components/shared/skeleton';
import { EmptyState } from '@customer/components/shared/empty-state';
import { useServices } from '@customer/hooks/services/use-services';
import { useDeferredItems, useAllDeferredItems } from '@customer/hooks/services/use-deferred-items';
import { useVehicles } from '@customer/hooks/vehicles/use-vehicles';
import { useBookingStore } from '@/src/stores/customer/booking';
import { selectionTap } from '@customer/services/haptics';
import { getVehicleServiceNote, getBestOilServiceId } from '@customer/utils/vehicle-service-notes';
import { OBSERVATION_TYPE_LABELS } from '@customer/types/enums';
import type { DeferredWorkItem, Vehicle } from '@customer/types/api';

// @demo-start — hardcoded service names per component hint + vehicle
// When a "Book" button passes a suggestedComponent, this map determines
// exactly which services appear in the "Suggested" section.
const DEMO_SUGGESTIONS: Record<string, { default: string[]; vehicles?: Record<string, string[]> }> = {
  oil: {
    default: ['Small Oil Change'],
    vehicles: {
      'toyota-camry': ['Medium Oil Change'],
      'toyota-rav4': ['Medium Oil Change'],
      'honda-civic': ['Small Oil Change'],
      'honda-crv': ['Small Oil Change'],
      'ford-f150': ['Large Oil Change'],
      'ford-f-250-super-duty': ['Diesel Oil Change'],
      'chevrolet-equinox': ['Medium Oil Change'],
    },
  },
  brakes: {
    default: ['Brake Inspection', 'Brake Pad Replacement'],
    vehicles: {
      'ford-f-250-super-duty': ['Brake Inspection', 'Brake Pad Replacement', 'Brake Fluid Flush'],
    },
  },
  filter: {
    default: ['Air Filter Replacement', 'Cabin Air Filter'],
  },
  tires: {
    default: ['Tire Rotation'],
  },
  wipers: {
    default: ['Wiper Blade Replacement'],
  },
  fluids: {
    default: ['Coolant Flush', 'Transmission Fluid Service'],
    vehicles: {
      'ford-f-250-super-duty': ['Coolant Flush', 'Transmission Fluid Service', 'Fuel Filter Replacement'],
    },
  },
};

const DEMO_BANNER_LABELS: Record<string, string> = {
  oil: 'Based on your vehicle\'s oil life',
  brakes: 'Based on your vehicle\'s brake condition',
  filter: 'Based on your vehicle\'s filter status',
  tires: 'Based on your vehicle\'s tire wear',
  wipers: 'Based on your vehicle\'s wiper condition',
  fluids: 'Based on your vehicle\'s fluid levels',
};

function getDemoSuggestedNames(component: string, vehicle: Vehicle | null): string[] {
  const config = DEMO_SUGGESTIONS[component];
  if (!config) return [];
  if (vehicle && config.vehicles) {
    const make = (vehicle.make ?? '').toLowerCase().trim();
    const model = (vehicle.model ?? '').toLowerCase().trim().replace(/\s+/g, '-');
    const vKey = `${make}-${model}`;
    if (config.vehicles[vKey]) return config.vehicles[vKey];
  }
  return config.default;
}
// @demo-end

export default function SelectServiceScreen() {
  const router = useRouter();
  const { data: services, isPending, isError, refetch } = useServices();
  const selectedServices = useBookingStore((s) => s.selectedServices);
  const selectedVehicle = useBookingStore((s) => s.selectedVehicle);
  const prefilled = useBookingStore((s) => s.prefilled);
  const toggleService = useBookingStore((s) => s.toggleService);
  const suggestedComponent = useBookingStore((s) => s.suggestedComponent);
  const suggestedComponents = useBookingStore((s) => s.suggestedComponents);

  const { data: vehicles } = useVehicles();
  // Only show vehicle-specific notes when we actually know which vehicle.
  // In the normal flow (service → vehicle), selectedVehicle is null until chosen.
  // From deferred "Book Now", the vehicle is pre-set in the store.
  const firstVehicle = selectedVehicle ?? null;

  const { data: vehicleDeferredItems } = useDeferredItems(firstVehicle?.id);
  const { data: allDeferredItems } = useAllDeferredItems();

  const activeDeferredItems = useMemo(() => {
    const items = firstVehicle?.id ? vehicleDeferredItems : allDeferredItems;
    if (!items) return [];
    return items.filter((d) => d.status === 'observed' || d.status === 'communicated');
  }, [vehicleDeferredItems, allDeferredItems, firstVehicle?.id]);

  const deferredByServiceId = useMemo(() => {
    const map = new Map<number, DeferredWorkItem>();
    for (const item of activeDeferredItems) {
      if (item.recommended_service_id != null) {
        map.set(item.recommended_service_id, item);
      }
    }
    return map;
  }, [activeDeferredItems]);

  const recommendedServiceIds = useMemo(
    () => new Set(deferredByServiceId.keys()),
    [deferredByServiceId],
  );

  const bestOilId = useMemo(
    () => getBestOilServiceId(services ?? [], firstVehicle),
    [services, firstVehicle],
  );

  // @demo-start — banner reason text
  const allComponents = useMemo(
    () => suggestedComponents.length > 0 ? suggestedComponents : (suggestedComponent ? [suggestedComponent] : []),
    [suggestedComponents, suggestedComponent],
  );
  const suggestedReason = allComponents.length > 0
    ? (allComponents.length === 1
        ? (DEMO_BANNER_LABELS[allComponents[0]] ?? `Based on your vehicle's ${allComponents[0]}`)
        : `Based on ${allComponents.length} components needing service`)
    : null;
  // @demo-end

  const { recommended, suggested, regular } = useMemo(() => {
    if (!services) return { recommended: [], suggested: [], regular: [] };

    const recIds = recommendedServiceIds;
    const rec = services.filter((s) => recIds.has(s.id));
    const remaining = services.filter((s) => !recIds.has(s.id));

    // @demo-start — simple name-based lookup instead of dynamic matching
    if (allComponents.length === 0) {
      return { recommended: rec, suggested: [], regular: remaining };
    }

    const demoNames = allComponents.flatMap((c) => getDemoSuggestedNames(c, firstVehicle));
    const nameSet = new Set(demoNames.map((n) => n.toLowerCase()));

    const sug = remaining.filter((s) => nameSet.has(s.name.toLowerCase()));
    const reg = remaining.filter((s) => !nameSet.has(s.name.toLowerCase()));

    return { recommended: rec, suggested: sug, regular: reg };
    // @demo-end
  }, [services, recommendedServiceIds, allComponents, firstVehicle]);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof regular> = {};
    for (const svc of regular) {
      const cat = svc.category ?? 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(svc);
    }
    return Object.entries(groups);
  }, [regular]);

  const handleToggle = (service: typeof regular[number]) => {
    selectionTap();
    toggleService(service);
  };

  const { count, total } = useMemo(() => {
    const c = selectedServices.length;
    const t = selectedServices.reduce((sum, s) => sum + Number(s.base_price), 0);
    return { count: c, total: t };
  }, [selectedServices]);

  if (isPending) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <BookingServiceListSkeleton />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <EmptyState
          title="Couldn't load services"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </SafeAreaView>
    );
  }

  if (!services?.length) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <EmptyState
          title="No services available"
          message="Check back soon — we're updating our menu."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.lead}>
          Choose one or more services. You can adjust details before confirming.
        </Text>

        {prefilled && selectedServices.length > 0 && (
          <View style={styles.prefilledBanner}>
            <Ionicons name="sparkles" size={16} color={Theme.colors.primary} />
            <Text style={styles.prefilledText}>Recommended by your technician</Text>
          </View>
        )}

        {suggested.length > 0 && (
          <>
            <View style={styles.suggestedBanner}>
              <Ionicons name="fitness-outline" size={16} color="#166534" />
              <Text style={styles.suggestedText}>{suggestedReason}</Text>
            </View>
            <Text style={styles.groupTitle}>Suggested Services</Text>
            {suggested.map((service) => {
              const isSelected = selectedServices.some((s) => s.id === service.id);
              return (
                <ServiceCard
                  key={service.id}
                  service={service}
                  selected={isSelected}
                  suggested
                  vehicleNote={getVehicleServiceNote(service, firstVehicle, bestOilId)}
                  onToggle={() => handleToggle(service)}
                />
              );
            })}
          </>
        )}

        {recommended.length > 0 && (
          <>
            <Text style={styles.groupTitle}>Recommended for You</Text>
            {recommended.map((service) => {
              const isSelected = selectedServices.some((s) => s.id === service.id);
              const deferredItem = deferredByServiceId.get(service.id);
              const techNote = deferredItem?.technician_notes
                ? `Technician noted: ${deferredItem.technician_notes}`
                : null;
              return (
                <View key={service.id}>
                  {deferredItem ? (
                    <View style={styles.observationBanner}>
                      <View style={styles.observationBadge}>
                        <Ionicons name="eye-outline" size={12} color={Theme.colors.white} />
                        <Text style={styles.observationBadgeText}>Technician Observed</Text>
                      </View>
                      <Text style={styles.observationText}>
                        Your technician noted{' '}
                        <Text style={styles.observationHighlight}>
                          {OBSERVATION_TYPE_LABELS[deferredItem.observation_type]?.toLowerCase() ??
                            deferredItem.observation_type}
                        </Text>
                        {' on '}
                        {new Date(deferredItem.created_at).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                        })}
                      </Text>
                    </View>
                  ) : null}
                  <ServiceCard
                    service={service}
                    selected={isSelected}
                    onToggle={() => handleToggle(service)}
                    vehicleNote={getVehicleServiceNote(service, firstVehicle, bestOilId)}
                    deferredNote={techNote}
                  />
                </View>
              );
            })}
          </>
        )}

        {(recommended.length > 0 || suggested.length > 0) && regular.length > 0 && (
          <View style={styles.allServicesDivider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>All Services</Text>
            <View style={styles.dividerLine} />
          </View>
        )}

        {grouped.length > 1 ? (
          grouped.map(([category, svcs]) => (
            <View key={category}>
              <Text style={styles.groupTitle}>{formatCategory(category)}</Text>
              {svcs.map((service) => {
                const isSelected = selectedServices.some((s) => s.id === service.id);
                return (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    selected={isSelected}
                    vehicleNote={getVehicleServiceNote(service, firstVehicle, bestOilId)}
                    onToggle={() => handleToggle(service)}
                  />
                );
              })}
            </View>
          ))
        ) : (
          regular.map((service) => {
            const isSelected = selectedServices.some((s) => s.id === service.id);
            return (
              <ServiceCard
                key={service.id}
                service={service}
                selected={isSelected}
                vehicleNote={getVehicleServiceNote(service, firstVehicle, bestOilId)}
                onToggle={() => handleToggle(service)}
              />
            );
          })
        )}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.summaryCard}>
          <View>
            <Text style={styles.summaryLabel}>Selected</Text>
            <Text style={styles.summaryValue}>
              {count === 0 ? 'No services yet' : `${count} service${count === 1 ? '' : 's'}`}
            </Text>
          </View>
          <View style={styles.summaryRight}>
            <Text style={styles.summaryLabel}>Total</Text>
            <Text style={styles.summaryTotal}>${total.toFixed(2)}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.continueBtn, count === 0 && styles.continueBtnDisabled]}
          disabled={count === 0}
          onPress={() => router.push('/customer/booking/select-vehicle')}
          activeOpacity={0.85}
        >
          <Text style={styles.continueText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function formatCategory(cat: string): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  scrollContent: {
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
  prefilledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    backgroundColor: Theme.colors.primary + '10',
    borderRadius: Theme.borderRadius.md,
    paddingVertical: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
  },
  prefilledText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
  allServicesDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Theme.spacing.lg,
    marginBottom: Theme.spacing.xs,
    gap: Theme.spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Theme.colors.border,
  },
  dividerLabel: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '600',
    color: Theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  suggestedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    backgroundColor: '#22C55E12',
    borderRadius: Theme.borderRadius.md,
    paddingVertical: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.md,
    marginBottom: Theme.spacing.xs,
    borderWidth: 1,
    borderColor: '#22C55E30',
  },
  suggestedText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: '#166534',
  },
  groupTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
    marginTop: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
  },
  observationBanner: {
    backgroundColor: Theme.colors.warning + '10',
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.sm,
    marginBottom: Theme.spacing.xs,
    borderWidth: 1,
    borderColor: Theme.colors.warning + '25',
  },
  observationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: Theme.colors.warning,
    borderRadius: Theme.borderRadius.full,
    paddingHorizontal: Theme.spacing.sm,
    paddingVertical: 2,
    gap: 4,
    marginBottom: Theme.spacing.xs,
  },
  observationBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.colors.white,
  },
  observationText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    lineHeight: 20,
  },
  observationHighlight: {
    fontWeight: '600',
    color: Theme.colors.text,
  },
  footer: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.sm,
    paddingBottom: Theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.borderLight,
    backgroundColor: Theme.colors.background,
    ...Theme.shadow.md,
  },
  summaryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
  },
  summaryLabel: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  summaryRight: {
    alignItems: 'flex-end',
  },
  summaryTotal: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Theme.colors.primary,
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
