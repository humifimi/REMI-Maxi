import { Stack } from 'expo-router';
import { Theme } from '@customer/constants/colors';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Theme.colors.background },
        headerShadowVisible: false,
        headerBackTitle: 'Back',
        headerTintColor: Theme.colors.primary,
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: '' }} />
      <Stack.Screen name="register" options={{ title: '' }} />
      <Stack.Screen name="forgot-password" options={{ title: '' }} />
      <Stack.Screen name="reset-password" options={{ title: '' }} />
    </Stack>
  );
}
