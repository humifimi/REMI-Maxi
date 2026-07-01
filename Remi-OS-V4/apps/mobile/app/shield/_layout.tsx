import { Stack } from "expo-router";
import { Brand } from "@technician/constants/brand";

export default function ShieldLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#111827" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "700" },
        headerTitleAlign: "center",
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen name="index" options={{ title: Brand.shieldName }} />
      <Stack.Screen name="submit" options={{ title: "Submit Inspection" }} />
      <Stack.Screen name="[id]" options={{ title: "Inspection Detail" }} />
    </Stack>
  );
}
