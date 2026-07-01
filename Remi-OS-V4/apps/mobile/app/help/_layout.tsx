import { Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export default function HelpLayout() {
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#fff" },
        headerTintColor: "#111827",
        headerTitleStyle: { fontWeight: "700" },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Help & Support",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#111827" />
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="history" options={{ title: "My Reports" }} />
      <Stack.Screen
        name="report-settings"
        options={{ title: "Reporter Settings" }}
      />
    </Stack>
  );
}
