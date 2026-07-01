import { useEffect, useRef, useCallback } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/src/stores/auth";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import { EXPO_GO_GUARDS_ACTIVE } from "@technician/constants/runtime";
import { playSoundOnce } from "@technician/hooks/utility/use-sound";
import {
  handleNotificationTap,
  notificationSoundFor,
  type NotificationData,
} from "@technician/notifications/handlers";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotifications(): Promise<string | null> {
  if (EXPO_GO_GUARDS_ACTIVE) return null;
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (finalStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return null;

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenData.data;
}

export function useNotifications() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const tokenSentRef = useRef(false);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  const handleNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as
        | NotificationData
        | undefined;
      handleNotificationTap(data, router);
    },
    [router],
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    if (EXPO_GO_GUARDS_ACTIVE) return;

    (async () => {
      if (tokenSentRef.current) return;
      const token = await registerForPushNotifications();
      if (!token) return;

      try {
        await api("post", Endpoints.profileDeviceToken, {
          token,
          platform: Platform.OS,
        });
        tokenSentRef.current = true;
      } catch {
        // Backend may not have the endpoint yet — silent fail
      }
    })();

    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        const sound = notificationSoundFor(notification);
        if (sound) playSoundOnce(sound);
      });

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener(
        handleNotificationResponse,
      );

    return () => {
      // 2026-05-24 — `Notifications.removeNotificationSubscription` was
      // removed in expo-notifications 0.32+ (see Expo SDK 54 changelog).
      // The new pattern is to call `.remove()` directly on the
      // EventSubscription object that `addNotificationReceivedListener`
      // and `addNotificationResponseReceivedListener` already return.
      // The deprecated call surfaced as a Render Error on Josh's device:
      // "Notifications.removeNotificationSubscription is not a function
      // (it is undefined)" with the failing line at use-notifications.ts:97.
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [isAuthenticated, handleNotificationResponse]);
}
