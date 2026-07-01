import { Stack } from "expo-router";

export default function FleetLayout() {
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
      <Stack.Screen name="index" options={{ title: "Fleet Manager" }} />
      <Stack.Screen name="[id]" options={{ title: "Fleet Company" }} />
      <Stack.Screen name="check" options={{ title: "Fleet Check" }} />
      <Stack.Screen name="book" options={{ title: "Book Service" }} />
      <Stack.Screen name="shuttle" options={{ title: "Shuttle Tracker" }} />
      <Stack.Screen name="shuttle-order" options={{ title: "Shuttle Order" }} />
      <Stack.Screen name="analytics" options={{ title: "Fleet Analytics" }} />
      <Stack.Screen name="due-soon" options={{ title: "Fleet Due Soon" }} />
    </Stack>
  );
}
