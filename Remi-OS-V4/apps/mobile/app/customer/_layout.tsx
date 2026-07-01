import { useEffect, useMemo } from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { Stack, useRouter, usePathname, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { Providers } from '@customer/components/shared/providers';
import { LoadingScreen } from '@customer/components/shared/loading-screen';
import { useAuthStore } from '@/src/stores/auth';
import { useThemeStore } from '@/src/stores/customer-theme';
import { useRealtimeCustomerReorganization } from '@customer/hooks/realtime/use-realtime-customer-reorganization';

function RootNavigator() {
  const router = useRouter();
  // NOTE: previously used `useSegments()` here, which returns a fresh array
  // reference on every render. That made this effect's dep array compare as
  // changed every render → router.replace fired in a tight loop until React
  // bailed with "Maximum update depth exceeded" before the Face ID prompt
  // could ever surface. `usePathname()` returns a stable string primitive,
  // and the explicit `pathname !== target` guard makes each redirect
  // idempotent.
  const pathname = usePathname();
  const segments = useSegments();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const biometricRequired = useAuthStore((s) => s.biometricRequired);
  const colors = useThemeStore((s) => s.colors);

  // P6-CU-1: subscribe to `customer:{userId}:reorganization` for the
  // whole authenticated session. The hook fail-softs to a no-op while
  // logged out / hydrating, and tears down the WS on logout — see
  // `src/hooks/realtime/use-realtime-customer-reorganization.ts`.
  useRealtimeCustomerReorganization();

  useEffect(() => {
    if (!isHydrated) return;

    // Route groups like `(auth)` are stripped from `pathname`, so both
    // `(auth)/welcome` and `(onboarding)/welcome` report `/customer/welcome`.
    // Use segments so authenticated onboarding entry is not bounced home.
    const inAuthGroup = segments.includes('(auth)');
    const onLogin = pathname === '/customer/login';

    if (biometricRequired) {
      if (!onLogin) {
        router.replace('/customer/login');
      }
      return;
    }

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/customer');
    }
  }, [isAuthenticated, biometricRequired, isHydrated, pathname, segments, router]);

  const screenOptions = useMemo(() => ({
    headerShown: false,
    headerTintColor: colors.primary,
    headerBackTitle: 'Back',
    headerStyle: { backgroundColor: colors.background },
    headerShadowVisible: false,
  }), [colors]);

  if (!isHydrated) {
    return <LoadingScreen />;
  }

  return (
    <>
      <Stack screenOptions={screenOptions}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="vehicle/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="vehicle/add" options={{ headerShown: true, title: 'Add Vehicle' }} />
        <Stack.Screen name="appointment/[id]" options={{ headerShown: false }} />
        <Stack.Screen
          name="rating/[id]"
          options={({ navigation }) => ({
            presentation: 'modal',
            headerShown: true,
            title: 'Rate Your Service',
            headerLeft: () => (
              <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
                <Text style={{ fontSize: 17, color: colors.primary, fontWeight: '500' }}>
                  Close
                </Text>
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen name="messages/[id]" options={{ headerShown: true, title: 'Chat' }} />
        {/* P5-CU-2: approval inbox bottom-sheet surface. Modal presentation
            stands in for `@gorhom/bottom-sheet` per
            docs/PLAN-DEVIATIONS.md#2026-05-02-no-gorhom-bottom-sheet —
            the package is not installed in REMICustomer and the modal
            stack screen gives an equivalent iOS sheet UX with no new
            native dep. The screen owns its own header (close button +
            title) so we hide the navigator header here. */}
        <Stack.Screen
          name="inbox/approvals"
          options={{ presentation: 'modal', headerShown: false }}
        />
        {/* P5-CU-5: per-session detail action sheet pushed from the inbox
            row tap. Same modal-stack pattern as the parent inbox screen
            (docs/PLAN-DEVIATIONS.md#2026-05-02-no-gorhom-bottom-sheet);
            the screen owns its own header (close button + title) so we
            hide the navigator header here. */}
        <Stack.Screen
          name="inbox/approvals/[sessionId]"
          options={{ presentation: 'modal', headerShown: false }}
        />
        {/* P5-CU-6: decline-with-reason picker pushed from the action
            sheet's Decline CTA. Same modal-stack pattern; on success
            the screen calls router.dismiss(2) to also pop the parent
            action sheet so the user lands back on the inbox. */}
        <Stack.Screen
          name="inbox/approvals/[sessionId]/decline"
          options={{ presentation: 'modal', headerShown: false }}
        />
        {/* P5-CU-7: customer-initiated multi-appointment reschedule.
            Opened from the Home-tab upcoming-appointments list's
            "Reschedule multiple" CTA when the customer has ≥2 upcoming
            appointments. Same modal-stack pattern the sibling inbox
            screens use — see
            docs/PLAN-DEVIATIONS.md#2026-05-02-no-gorhom-bottom-sheet
            for the precedent (master plan §5.4.6 says "Schedule tab";
            see
            docs/PLAN-DEVIATIONS.md#2026-05-02-multi-reschedule-home-entry-point
            for why the Home tab is the actual entry surface here). */}
        <Stack.Screen
          name="schedule/multi-reschedule"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen name="booking" options={{ headerShown: false }} />
        <Stack.Screen name="notification-settings" options={{ headerShown: true, title: 'Notifications' }} />
        <Stack.Screen name="profile/edit" options={{ headerShown: true, title: 'Edit Profile' }} />
        <Stack.Screen name="preferences" options={{ headerShown: true, title: 'Preferences' }} />
        <Stack.Screen name="payment-methods" options={{ headerShown: true, title: 'Payment Methods' }} />
        {/* fleet/* screens are registered in app/customer/fleet/_layout.tsx */}
        <Stack.Screen name="fleet" options={{ headerShown: false }} />
        <Stack.Screen name="referral" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}

export default function RootLayout() {
  return (
    <Providers>
      <RootNavigator />
    </Providers>
  );
}
