import { useCallback, useContext, useEffect, useRef, useState, createContext } from "react";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { TechnicianLocation } from "@technician/types/api";
import { Brand } from "@technician/constants/brand";

const LOCATION_TASK_NAME = "REMI_LOCATION_TASK";
const UPDATE_INTERVAL_MS = 60_000;

const LocationContext = createContext<{ lat: number; lng: number } | null>(null);
export const LocationContextProvider = LocationContext.Provider;

export function useCurrentLocation() {
  return useContext(LocationContext);
}

TaskManager.defineTask(
  LOCATION_TASK_NAME,
  async ({ data, error }: TaskManager.TaskManagerTaskBody<{ locations: Location.LocationObject[] }>) => {
    if (error) return;
    const locations = data?.locations;
    if (!locations || locations.length === 0) return;

    const latest = locations[locations.length - 1];
    try {
      await api<TechnicianLocation>("post", Endpoints.location.update, {
        lat: latest.coords.latitude,
        lng: latest.coords.longitude,
      });
    } catch {
      // Silently fail -- next interval will retry
    }
  }
);

export function useLocationTracking() {
  const [isTracking, setIsTracking] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  const startTracking = useCallback(async () => {
    try {
      const { status: fgStatus } =
        await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== "granted") {
        setError("Foreground location permission denied");
        return;
      }

      const initial = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setCurrentLocation({
        lat: initial.coords.latitude,
        lng: initial.coords.longitude,
      });

      // Foreground watcher keeps the map marker responsive
      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 20,
          timeInterval: 15_000,
        },
        (loc) => {
          setCurrentLocation({
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
          });
        }
      );

      const { status: bgStatus } =
        await Location.requestBackgroundPermissionsAsync();

      if (bgStatus === "granted") {
        const isTaskRegistered =
          await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
        if (!isTaskRegistered) {
          await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: UPDATE_INTERVAL_MS,
            distanceInterval: 50,
            showsBackgroundLocationIndicator: true,
            foregroundService: {
              notificationTitle: Brand.techAppName,
              notificationBody: "Tracking location for route updates",
            },
          });
        }
      } else {
        // Fallback: foreground-only interval for API posts
        intervalRef.current = setInterval(async () => {
          try {
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            await api<TechnicianLocation>("post", Endpoints.location.update, {
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
            });
          } catch {
            // Silently fail
          }
        }, UPDATE_INTERVAL_MS);
      }

      setIsTracking(true);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start location tracking"
      );
    }
  }, []);

  const stopTracking = useCallback(async () => {
    try {
      const isTaskRegistered =
        await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
      if (isTaskRegistered) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
    } catch {
      // Task may not be registered
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    watchRef.current?.remove();
    watchRef.current = null;
    setCurrentLocation(null);
    setIsTracking(false);
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      watchRef.current?.remove();
    };
  }, []);

  return { isTracking, currentLocation, startTracking, stopTracking, error };
}
