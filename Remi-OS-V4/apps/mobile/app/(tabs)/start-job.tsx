import { useCallback } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useJobFlowStore } from "@technician/stores/job-flow";
import { useActiveJobBlocker } from "@technician/hooks/jobs/use-active-job-blocker";

/**
 * Start Job tab is a redirect into the walk-in job flow. Plate/VIN entry
 * lives on `/job/new/confirm-vehicle` — this file exists only so the tab
 * route stays registered for deep links and fallback navigation.
 */
export default function StartJobRedirect() {
  const router = useRouter();
  const reset = useJobFlowStore((s) => s.reset);
  const blocker = useActiveJobBlocker();

  useFocusEffect(
    useCallback(() => {
      if (blocker.isActive && blocker.resumeRoute) {
        router.replace(blocker.resumeRoute as never);
        return;
      }
      reset();
      router.replace("/job/new/confirm-vehicle" as never);
    }, [blocker.isActive, blocker.resumeRoute, reset, router]),
  );

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#3B82F6" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
});
