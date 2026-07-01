import { Stack } from "expo-router";

export default function PublicLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: "#111827" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Stack.Screen
        name="profit-calculator"
        options={{ title: "Profit Calculator" }}
      />
      <Stack.Screen
        name="profit-model/share/[token]"
        options={{ title: "Loading scenario…" }}
      />
    </Stack>
  );
}
