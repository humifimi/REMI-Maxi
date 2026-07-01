import { useMemo } from 'react';
import { Tabs } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeStore } from '@/src/stores/customer-theme';
import { useMessagingInboxRealtime } from '@customer/hooks/communication/use-messages';

export default function TabLayout() {
  const colors = useThemeStore((s) => s.colors);

  // Keep the conversation list cache warm across the entire
  // authenticated tabs region so the messages tab badge updates
  // without a refetch when a tech sends from the field.
  useMessagingInboxRealtime();

  const screenOptions = useMemo(() => ({
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textTertiary,
    headerShown: false,
    tabBarStyle: {
      borderTopColor: colors.borderLight,
      backgroundColor: colors.background,
    },
  }), [colors]);

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="garage"
        options={{
          title: 'Garage',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="car.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="book"
        options={{
          title: 'Book',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="calendar.badge.plus" color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="message.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="ellipsis.circle.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
