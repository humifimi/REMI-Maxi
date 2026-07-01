/**
 * Progressive booking flow: one concern per screen — select service → vehicle → address
 * → suggested date/time slots → review → confirmed. Each step unlocks after the prior
 * selections are valid (see screen continue buttons and booking store).
 */
import { TouchableOpacity, Text } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Theme } from '@customer/constants/colors';

function CloseButton() {
  const router = useRouter();
  return (
    <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
      <Text style={{ fontSize: 17, color: Theme.colors.primary, fontWeight: '500' }}>Cancel</Text>
    </TouchableOpacity>
  );
}

export default function BookingLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Theme.colors.background },
        headerShadowVisible: false,
        headerBackTitle: 'Back',
        headerTintColor: Theme.colors.primary,
      }}
    >
      <Stack.Screen
        name="select-service"
        options={{ title: 'Select Service', headerLeft: () => <CloseButton /> }}
      />
      <Stack.Screen name="select-vehicle" options={{ title: 'Select Vehicle' }} />
      <Stack.Screen name="select-address" options={{ title: 'Select Address' }} />
      <Stack.Screen name="smart-suggestions" options={{ title: 'Choose a Time' }} />
      <Stack.Screen name="review" options={{ title: 'Review Booking' }} />
      <Stack.Screen name="confirmed" options={{ title: 'Booking Confirmed', headerBackVisible: false }} />
      <Stack.Screen name="no-availability" options={{ title: 'No Availability' }} />
      <Stack.Screen
        name="chat"
        options={{ title: 'Book with REMI', headerLeft: () => <CloseButton /> }}
      />
    </Stack>
  );
}
