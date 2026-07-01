import { Stack } from "expo-router";

export default function TrainingLayout() {
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
      <Stack.Screen name="index" options={{ title: "MAXI University" }} />
      <Stack.Screen name="onboarding" options={{ title: "Onboarding" }} />
      <Stack.Screen name="school/[id]" options={{ title: "Courses" }} />
      <Stack.Screen name="course/[id]" options={{ title: "Modules" }} />
      <Stack.Screen name="lesson/[id]" options={{ title: "Lesson" }} />
      <Stack.Screen name="[moduleId]" options={{ title: "Training Module" }} />
      <Stack.Screen
        name="scenario"
        options={{ headerShown: false }}
      />
      <Stack.Screen name="certification" options={{ title: "Certification" }} />
      <Stack.Screen name="video-upload" options={{ title: "Upload Video" }} />
    </Stack>
  );
}
