import { Stack } from "expo-router";

export default function InventoryLayout() {
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
      <Stack.Screen name="index" options={{ title: "Inventory" }} />
      <Stack.Screen name="par-alerts" options={{ title: "Par Level Alerts" }} />
      <Stack.Screen name="adjust" options={{ title: "Stock Adjustment" }} />
      <Stack.Screen name="waste" options={{ title: "Waste Tracking" }} />
      <Stack.Screen name="transfer" options={{ title: "Transfer Stock" }} />
      <Stack.Screen name="history" options={{ title: "Inventory History" }} />
    </Stack>
  );
}
