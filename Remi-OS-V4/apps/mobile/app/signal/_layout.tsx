import { Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

function BackButton() {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.back()} hitSlop={8}>
      <MaterialIcons name="arrow-back" size={24} color="#fff" />
    </Pressable>
  );
}

export default function SignalLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#111827" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "700" },
        headerTitleAlign: "center",
        headerLeft: () => <BackButton />,
      }}
    >
      <Stack.Screen name="create-post" options={{ title: "New Post" }} />
      <Stack.Screen name="help-request" options={{ title: "Request Help" }} />
      <Stack.Screen name="post" options={{ title: "Post" }} />
    </Stack>
  );
}
