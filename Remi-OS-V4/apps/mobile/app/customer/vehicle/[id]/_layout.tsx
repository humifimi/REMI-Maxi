import { TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';

export default function VehicleLayout() {
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerTintColor: Theme.colors.primary,
        headerBackTitle: 'Back',
        headerStyle: { backgroundColor: Theme.colors.background },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Vehicle Details',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={{ marginRight: 8 }}>
              <Ionicons name="chevron-back" size={28} color={Theme.colors.primary} />
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen name="health" options={{ title: 'Vehicle Health' }} />
    </Stack>
  );
}
