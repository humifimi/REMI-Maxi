import { Stack } from 'expo-router';
import { Theme } from '@customer/constants/colors';

export default function InspectionLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Theme.colors.background },
        headerTintColor: Theme.colors.text,
        headerBackTitle: 'Back',
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="submit" options={{ title: 'Vehicle Inspection' }} />
    </Stack>
  );
}
