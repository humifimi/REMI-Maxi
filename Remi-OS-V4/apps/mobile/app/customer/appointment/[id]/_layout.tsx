import { TouchableOpacity, Text } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Theme } from '@customer/constants/colors';

function BackButton() {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/customer');
        }
      }}
      hitSlop={8}
      style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -8 }}
    >
      <Text style={{ fontSize: 17, color: Theme.colors.primary, fontWeight: '400' }}>
        {'‹ Back'}
      </Text>
    </TouchableOpacity>
  );
}

export default function AppointmentLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: Theme.colors.primary,
        headerStyle: { backgroundColor: Theme.colors.background },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Appointment',
          headerLeft: () => <BackButton />,
        }}
      />
      <Stack.Screen
        name="service-record"
        options={{
          title: 'Service Record',
          headerLeft: () => <BackButton />,
        }}
      />
    </Stack>
  );
}
