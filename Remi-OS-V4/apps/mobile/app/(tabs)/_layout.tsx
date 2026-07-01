import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { Redirect, Tabs, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { HapticTab } from "@/components/haptic-tab";
import { useAuthStore } from "@/src/stores/auth";
import { useBiometric, getBiometricLabel } from "@technician/hooks/auth/use-biometric";
import { useWideCanvas } from "@technician/hooks/ui/use-wide-canvas";
import { useRealtimeReorganization } from "@technician/hooks/realtime/use-realtime-reorganization";
import { useActiveReorganization } from "@technician/hooks/schedule/use-reorganization";
import { useMessagingInboxRealtime } from "@technician/hooks/communication/use-messages";
import { useFranchiseMessagingRealtime } from "@technician/hooks/communication/use-franchise-messages";
import { WellnessCheckInModal } from "@technician/components/wellness/wellness-checkin-modal";
import { BRIEFING_LAST_SHOWN_KEY } from "@/app/briefing";
import { EXPO_GO_GUARDS_ACTIVE } from "@technician/constants/runtime";
import { useThemeStore, selectThemeColors } from "@technician/stores/theme";
import { useJobFlowStore } from "@technician/stores/job-flow";
import { useActiveJobBlocker } from "@technician/hooks/jobs/use-active-job-blocker";

function useBiometricEnrollmentPrompt(enabled: boolean) {
  const setBiometricEnabled = useAuthStore((s) => s.setBiometricEnabled);
  const hasBiometricPreference = useAuthStore((s) => s.hasBiometricPreference);
  const { isAvailable, biometricType, isChecking } = useBiometric();
  const hasPrompted = useRef(false);

  useEffect(() => {
    if (!enabled || isChecking || hasPrompted.current) return;

    async function maybePrompt() {
      if (!isAvailable) return;
      const alreadyAsked = await hasBiometricPreference();
      if (alreadyAsked) return;

      hasPrompted.current = true;
      const label = getBiometricLabel(biometricType);

      Alert.alert(
        `Enable ${label}?`,
        `Unlock REMI quickly with ${label} next time you open the app.`,
        [
          {
            text: "Not Now",
            style: "cancel",
            onPress: () => setBiometricEnabled(false),
          },
          {
            text: "Enable",
            onPress: () => setBiometricEnabled(true),
          },
        ]
      );
    }

    maybePrompt();
  }, [
    enabled,
    isChecking,
    isAvailable,
    biometricType,
    hasBiometricPreference,
    setBiometricEnabled,
  ]);
}

function useDailyBriefingRedirect(enabled: boolean) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const router = useRouter();
  const hasChecked = useRef(false);

  useEffect(() => {
    if (!enabled || !isAuthenticated || hasChecked.current) return;
    hasChecked.current = true;

    AsyncStorage.getItem(BRIEFING_LAST_SHOWN_KEY).then((lastDate) => {
      const today = new Date().toISOString().split("T")[0];
      if (lastDate !== today) {
        router.push("/briefing");
      }
    });
  }, [enabled, isAuthenticated, router]);
}

export default function TabLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const themeColors = useThemeStore(selectThemeColors);
  // Hide the bottom tab bar + nav header when the device is in
  // landscape (master plan §5.1.1). Only the calendar tab can rotate
  // out of portrait — every other tab calls `lockToPortrait()` on
  // focus via `useCalendarTabOrientation`'s blur path, so this branch
  // only fires while the calendar canvas is visible. Reading from
  // `useWideCanvas` instead of `useWindowDimensions` directly so the
  // hook keeps the breakpoint policy (phone vs tablet) in one place.
  const { orientation } = useWideCanvas();
  const isLandscape = orientation === "landscape";
  const router = useRouter();
  const blocker = useActiveJobBlocker();
  const resetJobFlow = useJobFlowStore((s) => s.reset);

  useBiometricEnrollmentPrompt(!EXPO_GO_GUARDS_ACTIVE);
  useDailyBriefingRedirect(!EXPO_GO_GUARDS_ACTIVE);
  // P6-FE-1 / FE-G14 — subscribe to `franchise:{id}:reorganization`
  // for the duration of the authenticated tabs region. The hook
  // is internally a no-op until `useAuthStore.user.franchiseId` is
  // populated; mounting here (instead of inside the calendar tab
  // alone) keeps the cache warm for the review screen and the
  // Pending Reality HUD even when another tab is focused.
  // PLAN-DEVIATION: 2026-04-24-realtime-reorg-be-shape — chunk
  // prompt referenced `app/(tabs)/calendar/_layout.tsx` (which does
  // not exist; calendar is `app/(tabs)/index.tsx`). Mounting on the
  // shared tabs layout has the same effective coverage.
  useRealtimeReorganization();
  // P3-FE-REHYDRATE-MOUNT — cold-start rehydration of the
  // pending-reality store from the BE's authoritative active
  // session. Same auth gate as `useRealtimeReorganization` (the
  // hook is internally a no-op until `isAuthenticated &&
  // user.franchiseId != null`); mounted here so the GET fires once
  // per authenticated tabs region. The hook returns `UseQueryResult`
  // but no consumer reads it directly — the reconcile inside the
  // hook's `queryFn` writes `usePendingRealityStore` via the shared
  // `reconcileActiveSession` helper. This is the chunk that fixes
  // the "Expo Go reload empties staged appointments" bug.
  // Doc-comment style mirrors the `// D2P-FE-14` precedent in
  // `app/_layout.tsx` for documenting auth-mount rehydration.
  useActiveReorganization();
  // MSG-FE-TECH — subscribe to `user:{userId}:inbox` for the
  // duration of the authenticated tabs region so the conversation
  // list cache stays warm for the More → Messages stack and any
  // future tab-bar badge surface.
  useMessagingInboxRealtime();
  // MSG-FE-FO-1 — Franchise Owners also subscribe to
  // `franchise:{franchiseId}:messages` so the FO oversight inbox
  // stays warm regardless of which tab is focused. The hook
  // internally no-ops when `franchiseId` is missing (i.e. for
  // technician users), so this is safe to mount unconditionally.
  useFranchiseMessagingRealtime();

  if (isHydrated && !isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <>
    <WellnessCheckInModal enabled={!EXPO_GO_GUARDS_ACTIVE && isAuthenticated} />
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: themeColors.tab_active,
        tabBarInactiveTintColor: themeColors.tab_inactive,
        headerShown: !isLandscape,
        headerStyle: { backgroundColor: themeColors.header_bg },
        headerTintColor: themeColors.header_text,
        headerTitleStyle: { fontWeight: "700" },
        headerTitleAlign: "center",
        tabBarStyle: isLandscape
          ? { display: "none" }
          : {
              backgroundColor: themeColors.tab_bar_bg,
              borderTopColor: "#E5E7EB",
              paddingBottom: 4,
              height: 56,
            },
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="calendar-today" size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="start-job"
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            if (blocker.isActive && blocker.resumeRoute) {
              router.push(blocker.resumeRoute as never);
              return;
            }
            resetJobFlow();
            router.push("/job/new/confirm-vehicle" as never);
          },
        }}
        options={{
          title: "Start Job",
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="play-circle-outline" size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Orders",
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="receipt-long" size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: "Customers",
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="people" size={26} color={color} />
          ),
        }}
      />
      {/*
        Signal feed moved off the tab bar (2026-05-26) to make room for
        Start Job next to Calendar. Route stays registered; entry is
        More → Signal. `href: null` hides the tab icon only.
      */}
      <Tabs.Screen
        name="signal"
        options={{
          title: "Signal",
          href: null,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="more-horiz" size={26} color={color} />
          ),
        }}
      />
    </Tabs>
    </>
  );
}
