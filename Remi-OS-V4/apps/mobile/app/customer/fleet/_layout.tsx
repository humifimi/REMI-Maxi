import { Stack } from 'expo-router';
import { Theme } from '@customer/constants/colors';

export default function FleetLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Theme.colors.background },
        headerTintColor: Theme.colors.text,
        headerBackTitle: 'Back',
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Fleet Dashboard' }} />
      <Stack.Screen name="vehicles/index" options={{ title: 'Fleet Vehicles' }} />
      <Stack.Screen name="vehicles/[id]" options={{ title: 'Vehicle Detail' }} />
      <Stack.Screen name="drivers" options={{ title: 'Drivers' }} />
      <Stack.Screen name="compliance" options={{ title: 'Fleet Compliance' }} />
      <Stack.Screen name="inspections" options={{ title: 'Fleet Inspections' }} />
      <Stack.Screen name="inspection" options={{ headerShown: false }} />
      <Stack.Screen name="book" options={{ title: 'Book Fleet Service' }} />
      <Stack.Screen name="approvals" options={{ title: 'Approvals' }} />
      <Stack.Screen name="spend" options={{ title: 'Budget & Spend' }} />
      <Stack.Screen name="settings" options={{ title: 'Fleet Settings' }} />
      <Stack.Screen name="shuttle/[id]" options={{ title: 'Shuttle Tracking' }} />
    </Stack>
  );
}
