import { useCallback, useMemo } from 'react';
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { Theme, HealthColors } from '@customer/constants/colors';
import { SkeletonBox } from '@customer/components/shared/skeleton';
import { EmptyState } from '@customer/components/shared/empty-state';
import { useFleetShuttle } from '@customer/hooks/fleet/use-fleet-shuttle';
import type { ShuttleStatus, ShuttleTimelineEntry } from '@customer/types/fleet';

const SHUTTLE_STEPS: ShuttleStatus[] = [
  'pickup',
  'in_transit',
  'in_service',
  'returning',
  'completed',
];

function shuttleStepIndex(status: ShuttleStatus): number {
  return SHUTTLE_STEPS.indexOf(status);
}

function stepColor(step: ShuttleTimelineEntry, currentIdx: number, stepIdx: number): string {
  if (stepIdx < currentIdx) return HealthColors.good;
  if (step.is_current) return Theme.colors.primary;
  return Theme.colors.textTertiary;
}

/* ── Timeline ── */
function ShuttleTimeline({ timeline, currentStatus }: { timeline: ShuttleTimelineEntry[]; currentStatus: ShuttleStatus }) {
  const currentIdx = shuttleStepIndex(currentStatus);

  return (
    <View style={timelineStyles.container}>
      {timeline.map((entry, idx) => {
        const color = stepColor(entry, currentIdx, idx);
        const isCompleted = idx < currentIdx;
        const isCurrent = entry.is_current;

        return (
          <View key={entry.status} style={timelineStyles.step}>
            <View style={timelineStyles.indicator}>
              <View
                style={[
                  timelineStyles.dot,
                  { backgroundColor: color },
                  isCurrent && timelineStyles.dotCurrent,
                ]}
              >
                {isCompleted && (
                  <Ionicons name="checkmark" size={12} color={Theme.colors.white} />
                )}
              </View>
              {idx < timeline.length - 1 && (
                <View
                  style={[
                    timelineStyles.line,
                    { backgroundColor: idx < currentIdx ? HealthColors.good : Theme.colors.borderLight },
                  ]}
                />
              )}
            </View>
            <View style={timelineStyles.content}>
              <Text
                style={[
                  timelineStyles.label,
                  isCurrent && { color: Theme.colors.primary, fontWeight: '700' },
                ]}
              >
                {entry.label}
              </Text>
              {entry.timestamp && (
                <Text style={timelineStyles.time}>
                  {new Date(entry.timestamp).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ── Main Screen ── */
export default function ShuttleTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const shuttleId = id ? parseInt(id, 10) : null;
  const { data: shuttle, isLoading, isError, refetch } = useFleetShuttle(shuttleId);

  const mapRegion = useMemo(() => {
    if (!shuttle?.location) return null;
    return {
      latitude: shuttle.location.latitude,
      longitude: shuttle.location.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
  }, [shuttle?.location]);

  const handleCall = useCallback((phone: string | null) => {
    if (!phone) return;
    const url = `tel:${phone}`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) Linking.openURL(url);
    });
  }, []);

  const handleOpenInMaps = useCallback(() => {
    if (!shuttle?.location) return;
    const { latitude, longitude } = shuttle.location;
    const url = Platform.select({
      ios: `maps:?daddr=${latitude},${longitude}`,
      android: `geo:${latitude},${longitude}?q=${latitude},${longitude}`,
      default: `https://maps.google.com/?q=${latitude},${longitude}`,
    });
    if (url) Linking.openURL(url);
  }, [shuttle?.location]);

  if (isLoading) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <SkeletonBox width="100%" height={200} borderRadius={16} />
        <View style={{ height: 16 }} />
        <SkeletonBox width="100%" height={180} borderRadius={12} />
        <View style={{ height: 16 }} />
        <SkeletonBox width="100%" height={120} borderRadius={12} />
      </ScrollView>
    );
  }

  if (isError || !shuttle) {
    return (
      <View style={styles.emptyWrap}>
        <EmptyState
          title="Couldn't load shuttle info"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </View>
    );
  }

  const showMap = shuttle.location && (shuttle.status === 'in_transit' || shuttle.status === 'returning');

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Map */}
      {showMap && mapRegion && (
        <View style={styles.mapContainer}>
          <MapView
            style={styles.map}
            provider={PROVIDER_DEFAULT}
            initialRegion={mapRegion}
            region={mapRegion}
            showsUserLocation={false}
          >
            <Marker
              coordinate={{
                latitude: shuttle.location!.latitude,
                longitude: shuttle.location!.longitude,
              }}
              title={shuttle.driver_name}
              description={
                shuttle.eta_minutes
                  ? `ETA: ${shuttle.eta_minutes} min`
                  : 'Shuttle driver'
              }
            />
            {shuttle.pickup_address.latitude && shuttle.pickup_address.longitude && (
              <Marker
                coordinate={{
                  latitude: shuttle.pickup_address.latitude,
                  longitude: shuttle.pickup_address.longitude,
                }}
                title="Pickup"
                pinColor={HealthColors.good}
              />
            )}
            {shuttle.delivery_address.latitude && shuttle.delivery_address.longitude && (
              <Marker
                coordinate={{
                  latitude: shuttle.delivery_address.latitude,
                  longitude: shuttle.delivery_address.longitude,
                }}
                title="Delivery"
                pinColor={Theme.colors.primary}
              />
            )}
          </MapView>
          {shuttle.eta_minutes && (
            <View style={styles.etaBadge}>
              <Ionicons name="time-outline" size={16} color={Theme.colors.white} />
              <Text style={styles.etaText}>{shuttle.eta_minutes} min</Text>
            </View>
          )}
        </View>
      )}

      {/* Vehicle Info */}
      <View style={[styles.card, Theme.shadow.sm]}>
        <View style={styles.cardHeader}>
          <Ionicons name="car-outline" size={20} color={Theme.colors.primary} />
          <Text style={styles.cardTitle}>{shuttle.vehicle_name}</Text>
        </View>
        {shuttle.partner_shop_name && (
          <Text style={styles.cardSubtext}>
            Service at {shuttle.partner_shop_name}
          </Text>
        )}
      </View>

      {/* Status Timeline */}
      <View style={[styles.card, Theme.shadow.sm]}>
        <Text style={styles.sectionLabel}>STATUS</Text>
        <ShuttleTimeline timeline={shuttle.timeline} currentStatus={shuttle.status} />
      </View>

      {/* Addresses */}
      <View style={[styles.card, Theme.shadow.sm]}>
        <Text style={styles.sectionLabel}>LOCATIONS</Text>
        <View style={styles.addressRow}>
          <View style={[styles.addressDot, { backgroundColor: HealthColors.good }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.addressLabel}>Pickup</Text>
            <Text style={styles.addressText}>
              {shuttle.pickup_address.street}, {shuttle.pickup_address.city}
            </Text>
          </View>
        </View>
        <View style={styles.addressRow}>
          <View style={[styles.addressDot, { backgroundColor: Theme.colors.primary }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.addressLabel}>Delivery</Text>
            <Text style={styles.addressText}>
              {shuttle.delivery_address.street}, {shuttle.delivery_address.city}
            </Text>
          </View>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actionRow}>
        {shuttle.driver_phone && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleCall(shuttle.driver_phone)}
            activeOpacity={0.7}
          >
            <Ionicons name="call-outline" size={20} color={Theme.colors.primary} />
            <Text style={styles.actionBtnText}>Call Driver</Text>
          </TouchableOpacity>
        )}
        {showMap && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleOpenInMaps}
            activeOpacity={0.7}
          >
            <Ionicons name="navigate-outline" size={20} color={Theme.colors.primary} />
            <Text style={styles.actionBtnText}>Open in Maps</Text>
          </TouchableOpacity>
        )}
        {shuttle.partner_shop_phone && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleCall(shuttle.partner_shop_phone)}
            activeOpacity={0.7}
          >
            <Ionicons name="business-outline" size={20} color={Theme.colors.primary} />
            <Text style={styles.actionBtnText}>Call Shop</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.demoBadgeRow}>
        <View style={styles.demoBadge}>
          <Text style={styles.demoBadgeText}>Shuttle Tracking — Mock Data</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const timelineStyles = StyleSheet.create({
  container: {
    paddingLeft: Theme.spacing.xs,
  },
  step: {
    flexDirection: 'row',
    minHeight: 52,
  },
  indicator: {
    width: 28,
    alignItems: 'center',
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotCurrent: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: Theme.colors.primary + '30',
  },
  line: {
    width: 2,
    flex: 1,
    marginVertical: 2,
  },
  content: {
    flex: 1,
    paddingLeft: Theme.spacing.sm,
    paddingBottom: Theme.spacing.sm,
  },
  label: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  time: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    marginTop: 2,
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
  emptyWrap: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    justifyContent: 'center',
    padding: Theme.spacing.lg,
  },
  mapContainer: {
    height: 220,
    borderRadius: Theme.borderRadius.lg,
    overflow: 'hidden',
    marginBottom: Theme.spacing.md,
    ...Theme.shadow.md,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  etaBadge: {
    position: 'absolute',
    top: Theme.spacing.sm,
    right: Theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  etaText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
    color: Theme.colors.white,
  },
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    marginBottom: Theme.spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
  },
  cardTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  cardSubtext: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginTop: 4,
    marginLeft: 28,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Theme.colors.textTertiary,
    letterSpacing: 1.2,
    marginBottom: Theme.spacing.md,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.md,
  },
  addressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  addressLabel: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '600',
    color: Theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addressText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Theme.spacing.sm,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.primary,
    minWidth: 100,
  },
  actionBtnText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
  demoBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Theme.spacing.xl,
  },
  demoBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: Theme.borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  demoBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400E',
  },
});
