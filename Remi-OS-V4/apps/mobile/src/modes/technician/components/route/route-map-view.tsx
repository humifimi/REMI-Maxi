import { useMemo, useRef, useCallback, useEffect, useState } from "react";
import { StyleSheet, View, Text, Pressable } from "react-native";
import MapView, {
  Marker,
  Polyline,
  Callout,
  PROVIDER_GOOGLE,
} from "react-native-maps";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { RouteStopStatus } from "@technician/types/enums";
import type { RouteWithStops, RouteStopWithDetails } from "@technician/types/api";

const COLUMBUS_FALLBACK = {
  latitude: 39.9612,
  longitude: -82.9988,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

interface RouteMapViewProps {
  route: RouteWithStops;
  technicianLocation?: { lat: number; lng: number } | null;
}

const STOP_STATUS_COLORS: Record<string, string> = {
  [RouteStopStatus.PENDING]: "#9CA3AF",
  [RouteStopStatus.EN_ROUTE]: "#3B82F6",
  [RouteStopStatus.ARRIVED]: "#2563EB",
  [RouteStopStatus.COMPLETED]: "#22C55E",
  [RouteStopStatus.SKIPPED]: "#6B7280",
};

const DONE_STATUSES: Set<string> = new Set([
  RouteStopStatus.COMPLETED,
  RouteStopStatus.SKIPPED,
]);

function segmentColor(prev: RouteStopWithDetails, cur: RouteStopWithDetails) {
  const prevDone = DONE_STATUSES.has(prev.status);
  const curDone = DONE_STATUSES.has(cur.status);
  if (prevDone && curDone) return "#D1D5DB";
  if (prevDone && !curDone) return "#F59E0B";
  return "#3B82F6";
}

export function RouteMapView({ route, technicianLocation }: RouteMapViewProps) {
  const mapRef = useRef<MapView>(null);
  const [mapFitted, setMapFitted] = useState(false);

  const stopsWithCoords = useMemo(
    () => route.stops.filter((s) => s.address_lat != null && s.address_lng != null),
    [route.stops]
  );

  const firstUpcomingStop = useMemo(
    () => stopsWithCoords.find((s) => !DONE_STATUSES.has(s.status)),
    [stopsWithCoords]
  );

  const routeBounds = useMemo(() => {
    const coords = stopsWithCoords.map((s) => ({
      latitude: s.address_lat!,
      longitude: s.address_lng!,
    }));
    if (route.start_lat != null && route.start_lng != null) {
      coords.push({ latitude: route.start_lat, longitude: route.start_lng });
    }
    return coords;
  }, [stopsWithCoords, route.start_lat, route.start_lng]);

  const computedRegion = useMemo(() => {
    if (routeBounds.length === 0) return COLUMBUS_FALLBACK;
    const lats = routeBounds.map((c) => c.latitude);
    const lngs = routeBounds.map((c) => c.longitude);
    return {
      latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
      longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      latitudeDelta: Math.max(0.02, (Math.max(...lats) - Math.min(...lats)) * 1.5),
      longitudeDelta: Math.max(0.02, (Math.max(...lngs) - Math.min(...lngs)) * 1.5),
    };
  }, [routeBounds]);

  const techNearRoute = useMemo(() => {
    if (!technicianLocation || routeBounds.length === 0) return false;
    const center = computedRegion;
    const latDiff = Math.abs(technicianLocation.lat - center.latitude);
    const lngDiff = Math.abs(technicianLocation.lng - center.longitude);
    return latDiff < 1 && lngDiff < 1;
  }, [technicianLocation, routeBounds, computedRegion]);

  const coordsRef = useRef(routeBounds);
  coordsRef.current = routeBounds;

  const fitMap = useCallback(() => {
    if (!mapRef.current) return;
    const coords = coordsRef.current;
    if (coords.length > 0) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 40, bottom: 60, left: 40 },
        animated: false,
      });
    }
    setMapFitted(true);
  }, []);

  const handleMapReady = useCallback(() => {
    fitMap();
    setTimeout(fitMap, 300);
  }, [fitMap]);

  useEffect(() => {
    if (routeBounds.length > 0) {
      const t1 = setTimeout(fitMap, 100);
      const t2 = setTimeout(fitMap, 600);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [routeBounds, fitMap]);

  const fitToFullRoute = useCallback(() => {
    if (!mapRef.current || routeBounds.length === 0) return;
    mapRef.current.fitToCoordinates(routeBounds, {
      edgePadding: { top: 60, right: 40, bottom: 60, left: 40 },
      animated: true,
    });
  }, [routeBounds]);

  return (
    <View style={[styles.container, { opacity: mapFitted ? 1 : 0 }]}>
      <MapView
        ref={mapRef}
        // PROVIDER_GOOGLE pins iOS to Google Maps (Android default).
        // See franchise-route-map.tsx comment for rationale +
        // app.config.js wiring of GOOGLE_MAPS_IOS_API_KEY.
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={computedRegion}
        onMapReady={handleMapReady}
      >
        {route.start_lat != null && route.start_lng != null && (
          <Marker
            coordinate={{
              latitude: route.start_lat,
              longitude: route.start_lng,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.startMarker}>
              <Text style={styles.startMarkerIcon}>{"⌂"}</Text>
            </View>
          </Marker>
        )}

        {technicianLocation && techNearRoute && (
          <Marker
            coordinate={{
              latitude: technicianLocation.lat,
              longitude: technicianLocation.lng,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.youMarker}>
              <View style={styles.youMarkerDot} />
            </View>
          </Marker>
        )}

        {stopsWithCoords.map((stop, index) => (
          <Marker
            key={stop.id}
            coordinate={{
              latitude: stop.address_lat!,
              longitude: stop.address_lng!,
            }}
            pinColor={STOP_STATUS_COLORS[stop.status] ?? "#9CA3AF"}
          >
            <View
              style={[
                styles.markerCircle,
                {
                  backgroundColor:
                    STOP_STATUS_COLORS[stop.status] ?? "#9CA3AF",
                },
              ]}
            >
              <Text style={styles.markerNumber}>{index + 1}</Text>
            </View>
            <Callout>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle}>
                  {stop.customer_name ?? `Stop ${index + 1}`}
                </Text>
                {stop.service_names ? (
                  <Text style={styles.calloutSub}>{stop.service_names}</Text>
                ) : null}
              </View>
            </Callout>
          </Marker>
        ))}

        {technicianLocation && techNearRoute && firstUpcomingStop && (
          <Polyline
            coordinates={[
              {
                latitude: technicianLocation.lat,
                longitude: technicianLocation.lng,
              },
              {
                latitude: firstUpcomingStop.address_lat!,
                longitude: firstUpcomingStop.address_lng!,
              },
            ]}
            strokeColor="#F59E0B"
            strokeWidth={3}
            lineDashPattern={[8, 6]}
          />
        )}

        {stopsWithCoords.map((stop, index) => {
          if (index === 0) return null;
          const prev = stopsWithCoords[index - 1];
          const color = segmentColor(prev, stop);
          const isDone = color === "#D1D5DB";
          return (
            <Polyline
              key={`seg-${prev.id}-${stop.id}`}
              coordinates={[
                { latitude: prev.address_lat!, longitude: prev.address_lng! },
                { latitude: stop.address_lat!, longitude: stop.address_lng! },
              ]}
              strokeColor={color}
              strokeWidth={isDone ? 2 : 3}
              lineDashPattern={isDone ? [4, 4] : undefined}
            />
          );
        })}
      </MapView>

      <View style={styles.mapControls}>
        <Pressable style={styles.controlBtn} onPress={() => {
          mapRef.current?.getCamera().then((cam) => {
            if (cam.zoom != null) {
              mapRef.current?.animateCamera({ zoom: cam.zoom + 1 }, { duration: 200 });
            } else if (cam.altitude != null) {
              mapRef.current?.animateCamera({ altitude: cam.altitude / 2 }, { duration: 200 });
            }
          });
        }}>
          <MaterialIcons name="add" size={22} color="#374151" />
        </Pressable>
        <Pressable style={styles.controlBtn} onPress={() => {
          mapRef.current?.getCamera().then((cam) => {
            if (cam.zoom != null) {
              mapRef.current?.animateCamera({ zoom: cam.zoom - 1 }, { duration: 200 });
            } else if (cam.altitude != null) {
              mapRef.current?.animateCamera({ altitude: cam.altitude * 2 }, { duration: 200 });
            }
          });
        }}>
          <MaterialIcons name="remove" size={22} color="#374151" />
        </Pressable>
        <Pressable style={styles.controlBtn} onPress={fitToFullRoute}>
          <MaterialIcons name="fit-screen" size={22} color="#374151" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  map: {
    flex: 1,
  },
  startMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#6B7280",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  startMarkerIcon: {
    fontSize: 14,
    color: "#fff",
  },
  youMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(59,130,246,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  youMarkerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#3B82F6",
    borderWidth: 2,
    borderColor: "#fff",
  },
  markerCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  markerNumber: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  mapControls: {
    position: "absolute",
    right: 12,
    top: 12,
    gap: 6,
  },
  controlBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  callout: {
    padding: 4,
    minWidth: 120,
  },
  calloutTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  calloutSub: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
});
