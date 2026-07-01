import { Alert, Pressable, StyleSheet } from "react-native";
import {
  Stack,
  useLocalSearchParams,
  useRouter,
  useSegments,
} from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useJobFlowStore } from "@technician/stores/job-flow";
import { haptic } from "@technician/hooks/utility/use-haptics";
import {
  JOB_FLOW_STEPS,
  HIDDEN_STEP_BACK,
  type HiddenJobFlowStep,
  type JobFlowRoute,
} from "@technician/hooks/jobs/use-flow-back";

/**
 * Layout-level back arrow used as the default for any job-flow screen that
 * doesn't override `headerLeft` itself (currently fluids, debrief, complete).
 * Walks the canonical step order in reverse so back is always "previous step
 * in the flow" rather than "pop the navigation stack" — the latter exited
 * early when users entered the flow via direct pushes (WalkInCard, customer
 * detail "Start Job", etc.) instead of the full Calendar -> briefing chain.
 */
function FlowBackButton() {
  const router = useRouter();
  const segments = useSegments();
  const { id } = useLocalSearchParams<{ id?: string }>();

  // Expo Router segments shape inside this layout looks like
  // ["(app)", "job", "[id]", "<step>"] (or similar). The trailing entry is
  // always the current step file name. If we can't resolve a known step,
  // fall back to native back to avoid blocking the user.
  const current = segments[segments.length - 1] as JobFlowRoute | undefined;
  const idx =
    current && (JOB_FLOW_STEPS as readonly string[]).includes(current)
      ? JOB_FLOW_STEPS.indexOf(current as (typeof JOB_FLOW_STEPS)[number])
      : -1;

  const handleBack = () => {
    haptic.selection();
    // Walk-in path uses `id="new"` until booked; previous-step routes don't
    // exist for that case, so always exit to the Calendar.
    if (id === "new" || !id) {
      router.replace("/(tabs)" as never);
      return;
    }
    if (idx > 0) {
      router.replace(`/job/${id}/${JOB_FLOW_STEPS[idx - 1]}` as never);
      return;
    }
    if (idx === 0) {
      router.replace("/(tabs)" as never);
      return;
    }
    const hiddenBack = current
      ? HIDDEN_STEP_BACK[current as HiddenJobFlowStep]
      : undefined;
    if (hiddenBack) {
      router.replace(`/job/${id}/${hiddenBack}` as never);
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)" as never);
    }
  };

  return (
    <Pressable onPress={handleBack} hitSlop={8}>
      <MaterialIcons name="arrow-back" size={24} color="#fff" />
    </Pressable>
  );
}

function CancelJobButton() {
  const router = useRouter();
  const reset = useJobFlowStore((s) => s.reset);

  const handleCancel = () => {
    haptic.medium();
    Alert.alert("Cancel Job", "Are you sure you want to cancel this job?", [
      { text: "Keep Working", style: "cancel" },
      {
        text: "Cancel Job",
        style: "destructive",
        onPress: () => {
          reset();
          // Land on the Calendar tab regardless of how deep we are in the
          // job stack. `dismissAll` only collapses modal dismissals; replace
          // takes us back to the tabs root which renders the Calendar.
          router.replace("/(tabs)" as never);
        },
      },
    ]);
  };

  return (
    <Pressable onPress={handleCancel} hitSlop={8} style={styles.cancelBtn}>
      <MaterialIcons name="close" size={22} color="#EF4444" />
    </Pressable>
  );
}

export default function JobFlowLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#111827" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "700" },
        headerTitleAlign: "center",
        headerBackButtonDisplayMode: "minimal",
        headerLeft: () => <FlowBackButton />,
        headerRight: () => <CancelJobButton />,
      }}
    />
  );
}

const styles = StyleSheet.create({
  cancelBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(239,68,68,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
});
