import { Stack } from "expo-router";

export default function ReferralLayout() {
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
      <Stack.Screen name="index" options={{ title: "Referrals" }} />
      <Stack.Screen name="create" options={{ title: "Flag an Issue" }} />
    </Stack>
  );
}
