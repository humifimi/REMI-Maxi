import { Stack } from "expo-router";

export default function ScenarioLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#111827" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "700" },
        headerTitleAlign: "center",
        headerBackButtonDisplayMode: "minimal",
        gestureEnabled: false,
      }}
    >
      <Stack.Screen
        name="[moduleId]"
        options={{ title: "Scenario Training" }}
      />
    </Stack>
  );
}
