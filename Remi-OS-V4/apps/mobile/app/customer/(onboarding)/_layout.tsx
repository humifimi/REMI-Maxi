import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useOnboardingStore } from '@/src/stores/customer/onboarding';
import { Theme } from '@customer/constants/colors';

function CloseButton() {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/customer'))}
      hitSlop={8}
    >
      <Text style={{ fontSize: 17, color: Theme.colors.primary, fontWeight: '500' }}>Close</Text>
    </TouchableOpacity>
  );
}

function ProgressBar() {
  const percent = useOnboardingStore((s) => s.completionPercent);

  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${percent}%` }]} />
      </View>
      <Text style={styles.progressText}>{percent}% complete</Text>
    </View>
  );
}

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: () => <ProgressBar />,
        headerBackTitle: 'Back',
        headerTintColor: Theme.colors.primary,
        headerStyle: { backgroundColor: Theme.colors.background },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="identity" options={{ title: '' }} />
      <Stack.Screen
        name="add-vehicle"
        options={{ title: '', headerLeft: () => <CloseButton /> }}
      />
      <Stack.Screen name="garage-confirm" options={{ title: '' }} />
      <Stack.Screen name="schedule-prefs" options={{ title: '' }} />
      <Stack.Screen name="notification-prefs" options={{ title: '' }} />
      <Stack.Screen name="payment" options={{ title: '' }} />
      <Stack.Screen name="complete" options={{ title: '', headerBackVisible: false }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  progressContainer: {
    alignItems: 'center',
    flex: 1,
  },
  progressTrack: {
    height: 4,
    backgroundColor: Theme.colors.borderLight,
    borderRadius: 2,
    width: '100%',
    maxWidth: 200,
  },
  progressFill: {
    height: 4,
    backgroundColor: Theme.colors.primary,
    borderRadius: 2,
  },
  progressText: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    marginTop: 2,
  },
});
