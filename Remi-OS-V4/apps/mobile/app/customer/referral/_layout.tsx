import { Stack } from 'expo-router';
import { Theme } from '@customer/constants/colors';

export default function ReferralLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Theme.colors.background },
        headerShadowVisible: false,
        headerBackTitle: 'Back',
        headerTintColor: Theme.colors.primary,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'My Referrals' }} />
      <Stack.Screen name="[id]" options={{ title: 'Referral Details' }} />
    </Stack>
  );
}
