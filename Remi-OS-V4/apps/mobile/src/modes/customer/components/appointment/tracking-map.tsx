import { useEffect, useRef } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';
import type { BookingTrackingData, LocationUpdate } from '@customer/types/api';

interface TrackingMapProps {
  tracking: BookingTrackingData;
  liveUpdate: LocationUpdate | null;
}

export function TrackingMap({ tracking, liveUpdate }: TrackingMapProps) {
  const mapRef = useRef<MapView>(null);

  const techLat = liveUpdate?.lat ?? tracking.technicianLat;
  const techLng = liveUpdate?.lng ?? tracking.technicianLng;
  const destLat = tracking.destinationLat;
  const destLng = tracking.destinationLng;

  const hasPositions =
    techLat != null && techLng != null && destLat != null && destLng != null;

  useEffect(() => {
    if (mapRef.current && hasPositions) {
      mapRef.current.fitToCoordinates(
        [
          { latitude: techLat!, longitude: techLng! },
          { latitude: destLat!, longitude: destLng! },
        ],
        {
          edgePadding: { top: 80, right: 60, bottom: 80, left: 60 },
          animated: true,
        },
      );
    }
  }, [hasPositions, techLat, techLng, destLat, destLng]);

  if (!hasPositions) {
    return (
      <View style={styles.placeholder}>
        <Ionicons name="navigate-outline" size={28} color={Theme.colors.textTertiary} />
        <Text style={styles.placeholderText}>
          Waiting for technician location...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView ref={mapRef} style={styles.map}>
        <Marker
          coordinate={{ latitude: techLat!, longitude: techLng! }}
          title={tracking.technicianName ?? 'Technician'}
        >
          <View style={styles.techMarker}>
            <Ionicons name="car" size={18} color={Theme.colors.white} />
          </View>
        </Marker>

        <Marker
          coordinate={{ latitude: destLat!, longitude: destLng! }}
          title={tracking.destinationAddress ?? 'Destination'}
        >
          <View style={styles.destMarker}>
            <Ionicons name="location" size={18} color={Theme.colors.white} />
          </View>
        </Marker>

        <Polyline
          coordinates={[
            { latitude: techLat!, longitude: techLng! },
            { latitude: destLat!, longitude: destLng! },
          ]}
          strokeColor={Theme.colors.primary}
          strokeWidth={3}
          lineDashPattern={[6, 4]}
        />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Theme.borderRadius.lg,
    overflow: 'hidden',
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  map: {
    height: 220,
    width: '100%',
  },
  techMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadow.sm,
  },
  destMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadow.sm,
  },
  placeholder: {
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
  placeholderText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
