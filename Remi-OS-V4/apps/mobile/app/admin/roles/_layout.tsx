import { Stack } from "expo-router";

export default function AdminRolesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#111827" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "700" },
      }}
    />
  );
}
