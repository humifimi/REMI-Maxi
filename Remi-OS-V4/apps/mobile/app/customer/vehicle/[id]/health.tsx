import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { HealthScoreGauge } from '@customer/components/vehicle/health-score-gauge';
import { HealthTrendChart } from '@customer/components/vehicle/health-trend-chart';
import { CarfaxExportButton } from '@customer/components/vehicle/carfax-export-button';
import { NextDueServiceList } from '@customer/components/service/next-due-service-card';
import { DeferredServiceCard } from '@customer/components/service/deferred-service-card';
import { ServiceHistoryTimeline } from '@customer/components/service/service-history-timeline';
import { OemRecommendationCard } from '@customer/components/service/oem-recommendation-card';
import { VehicleHealthSkeleton } from '@customer/components/shared/skeleton';
import { Theme, getHealthColor, HealthColors } from '@customer/constants/colors';
import { useVehicleHealthComposite } from '@customer/hooks/vehicles/use-vehicle-health';
import { useDeferredItems } from '@customer/hooks/services/use-deferred-items';
import { useVehicles } from '@customer/hooks/vehicles/use-vehicles';
import { useServices } from '@customer/hooks/services/use-services';
import { useBookingStore } from '@/src/stores/customer/booking';
import { useThemeStore } from '@/src/stores/customer-theme';
import { getVehicleMakeModel } from '@customer/utils/vehicle-display';
import { getComponentNote } from '@customer/utils/vehicle-service-notes';
import type { DeferredWorkItem, NextDueService } from '@customer/types/api';

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

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


function DeferredFollowUpBanner({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <View style={bannerStyles.container}>
      <View style={bannerStyles.iconWrap}>
        <Ionicons name="notifications-outline" size={18} color={HealthColors.warning} />
      </View>
      <View style={bannerStyles.textWrap}>
        <Text style={bannerStyles.title}>Follow-Up Reminders</Text>
        <Text style={bannerStyles.subtitle}>
          {count} deferred {count === 1 ? 'item needs' : 'items need'} your attention
        </Text>
      </View>
    </View>
  );
}

export default function VehicleHealthScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const vehicleId = Number(idParam);
  const router = useRouter();
  const themeColors = useThemeStore((s) => s.colors);

  const { data: vehicles } = useVehicles();
  const { data: composite, isLoading } = useVehicleHealthComposite(vehicleId);
  const { data: deferredItems } = useDeferredItems(vehicleId);
  const { data: allServices } = useServices();
  const startFromDeferred = useBookingStore((s) => s.startFromDeferred);
  const startFromDeferredFallback = useBookingStore((s) => s.startFromDeferredFallback);
  const startWithComponent = useBookingStore((s) => s.startWithComponent);

  const vehicle = useMemo(
    () => vehicles?.find((v) => v.id === vehicleId) ?? null,
    [vehicles, vehicleId],
  );

  const activeDeferred = useMemo(() => {
    const items = deferredItems?.filter(
      (d) => d.status === 'observed' || d.status === 'communicated',
    ) ?? [];
    return items.sort(
      (a, b) => (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2),
    );
  }, [deferredItems]);

  function handleBookDeferred(item: DeferredWorkItem) {
    if (!vehicle) return;
    const service = allServices?.find((s) => s.id === item.recommended_service_id);
    if (service) {
      router.push(startFromDeferred(item, vehicle, service));
    } else {
      router.push(startFromDeferredFallback(item.observation_type, vehicle));
    }
  }

  function handleBookNextDue(svc: NextDueService) {
    router.push(startWithComponent(svc.component, vehicle));
  }

  if (isLoading) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <VehicleHealthSkeleton />
      </ScrollView>
    );
  }

  const makeModel = getVehicleMakeModel(vehicle);

  if (!composite || !composite.health_score) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.vehicleHeader}>
          <View style={[styles.vehicleIcon, { backgroundColor: Theme.colors.primary + '15' }]}>
            <Ionicons name="car-sport" size={24} color={Theme.colors.primary} />
          </View>
          <View style={styles.vehicleInfo}>
            <Text style={styles.vehicleName} numberOfLines={1}>
              {vehicle?.nickname?.trim() || makeModel}
            </Text>
            {vehicle?.nickname?.trim() ? (
              <Text style={styles.vehicleSubtitle} numberOfLines={1}>{makeModel}</Text>
            ) : null}
          </View>
        </View>
        <View style={styles.emptyHealthCard}>
          <Ionicons
            name="fitness-outline"
            size={36}
            color={Theme.colors.textTertiary}
          />
          <Text style={styles.emptyHealthTitle}>No health data yet</Text>
          <Text style={styles.emptyHealthBody}>
            Your vehicle&apos;s health score, trend, and OEM recommendations
            will appear here after your first MAXI Shield service is completed.
          </Text>
          <TouchableOpacity
            style={[styles.bookCta, { backgroundColor: themeColors.primary }]}
            onPress={() => {
              router.push(startWithComponent('', vehicle));
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="calendar" size={20} color={themeColors.white} />
            <Text style={styles.bookCtaText}>Book a Service</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  const overallScore = composite.health_score.overall_score;
  const healthColor = getHealthColor(overallScore);
  const trend = composite.trend ?? [];
  const nextDueServices = composite.next_due_services ?? [];
  const serviceHistory = composite.service_history ?? [];
  const oemRecommendations = composite.oem_recommendations ?? [];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Vehicle header */}
      <View style={styles.vehicleHeader}>
        <View style={[styles.vehicleIcon, { backgroundColor: healthColor + '15' }]}>
          <Ionicons name="car-sport" size={24} color={healthColor} />
        </View>
        <View style={styles.vehicleInfo}>
          <Text style={styles.vehicleName} numberOfLines={1}>
            {vehicle?.nickname?.trim() || makeModel}
          </Text>
          {vehicle?.nickname?.trim() ? (
            <Text style={styles.vehicleSubtitle} numberOfLines={1}>{makeModel}</Text>
          ) : null}
        </View>
      </View>

      {/* Section 1: Health Score Gauge */}
      <Text style={styles.sectionLabel}>HEALTH SCORE</Text>
      <HealthScoreGauge snapshot={composite.health_score} />

      {/* Health Trend */}
      <Text style={styles.sectionLabel}>TREND</Text>
      <View style={styles.card}>
        <HealthTrendChart data={trend} />
      </View>

      {/* Section 2: Next Due Services */}
      {nextDueServices.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>NEXT DUE SERVICES</Text>
          <NextDueServiceList
            services={nextDueServices}
            getVehicleNote={(svc) => getComponentNote(svc.component, vehicle)}
            onBookNow={handleBookNextDue}
          />
        </>
      ) : null}

      {/* Section 3: Deferred Work Items */}
      {activeDeferred.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>DEFERRED WORK</Text>
          <DeferredFollowUpBanner count={activeDeferred.length} />
          <View style={styles.deferredList}>
            {activeDeferred.map((item) => {
              const dvName = vehicle
                ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')
                : null;
              return (
                <DeferredServiceCard
                  key={item.id}
                  item={item}
                  vehicleName={dvName}
                  onBookNow={handleBookDeferred}
                />
              );
            })}
          </View>
        </>
      )}

      {/* Section 4: Service History Timeline */}
      {serviceHistory.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>SERVICE HISTORY</Text>
          <ServiceHistoryTimeline entries={serviceHistory} />
        </>
      ) : (
        <>
          <Text style={styles.sectionLabel}>SERVICE HISTORY</Text>
          <View style={[styles.card, styles.emptyInlineCard]}>
            <Ionicons name="document-text-outline" size={22} color={Theme.colors.textTertiary} />
            <Text style={styles.emptyInlineText}>No service history yet</Text>
          </View>
        </>
      )}

      {/* CARFAX Export */}
      <CarfaxExportButton vehicleId={vehicleId} />

      {/* Section 5: OEM Recommendations */}
      {oemRecommendations.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>OEM RECOMMENDATIONS</Text>
          <OemRecommendationCard
            recommendations={oemRecommendations}
            onBookService={(component) => {
              router.push(startWithComponent(mapOemComponentToHealthKey(component), vehicle));
            }}
          />
        </>
      )}

      {/* Book Service CTA */}
      <TouchableOpacity
        style={[styles.bookCta, { backgroundColor: themeColors.primary }]}
        onPress={() => {
          router.push(startWithComponent('', vehicle));
        }}
        activeOpacity={0.8}
      >
        <Ionicons name="calendar" size={20} color={themeColors.white} />
        <Text style={styles.bookCtaText}>Book a Service</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const bannerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: HealthColors.warning + '12',
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
    borderWidth: 1,
    borderColor: HealthColors.warning + '30',
    gap: Theme.spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: HealthColors.warning + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  subtitle: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    marginTop: 1,
  },
});

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  content: {
    padding: Theme.spacing.md,
    paddingBottom: Theme.spacing.xxl + Theme.spacing.xl,
  },
  vehicleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Theme.spacing.lg,
    gap: Theme.spacing.md,
  },
  vehicleIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleName: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  vehicleSubtitle: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Theme.colors.textTertiary,
    letterSpacing: 1.2,
    marginTop: Theme.spacing.lg,
    marginBottom: Theme.spacing.sm,
  },
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    ...Theme.shadow.md,
  },
  emptyHealthCard: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.xl,
    marginTop: Theme.spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    gap: Theme.spacing.sm,
    ...Theme.shadow.md,
  },
  emptyHealthTitle: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.text,
    marginTop: Theme.spacing.xs,
  },
  emptyHealthBody: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Theme.spacing.md,
  },
  emptyInlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    paddingVertical: Theme.spacing.lg,
  },
  emptyInlineText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
  },
  deferredList: {
    gap: Theme.spacing.sm,
  },
  bookCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    marginTop: Theme.spacing.xl,
    gap: Theme.spacing.sm,
    minHeight: 52,
    ...Theme.shadow.md,
  },
  bookCtaText: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.white,
  },
});
