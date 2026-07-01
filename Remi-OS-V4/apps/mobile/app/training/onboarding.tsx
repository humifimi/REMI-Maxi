import { StyleSheet, View, Text, FlatList, Pressable, Alert } from "react-native";
import { useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMyOnboarding, useMarkOnboardingStep } from "@technician/hooks/training/use-training";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";
import type { OnboardingChecklistItem } from "@technician/types/api";

export default function OnboardingScreen() {
  const router = useRouter();
  const { data: checklists = [], isLoading } = useMyOnboarding();
  const markStep = useMarkOnboardingStep();

  if (isLoading) return <SkeletonListScreen />;

  const allItems: Array<OnboardingChecklistItem & { checklistId: number; checklistName: string }> = [];
  for (const entry of checklists) {
    const cl = entry.checklist;
    const items = (cl?.items ?? entry.items ?? []) as OnboardingChecklistItem[];
    for (const item of items) {
      allItems.push({ ...item, checklistId: cl?.id ?? item.checklist_id, checklistName: cl?.name ?? "" });
    }
  }

  allItems.sort((a, b) => a.sort_order - b.sort_order);

  const completed = allItems.filter((i) => i.completed_at != null).length;
  const total = allItems.length;
  const pct = total > 0 ? (completed / total) * 100 : 0;

  const handleComplete = (item: (typeof allItems)[0]) => {
    if (item.completed_at) return;
    Alert.alert("Mark Complete?", `Complete "${item.step_name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Complete",
        onPress: () =>
          markStep.mutate({ stepName: item.step_name, checklistId: item.checklistId }),
      },
    ]);
  };

  const renderItem = ({
    item,
    index,
  }: {
    item: (typeof allItems)[0];
    index: number;
  }) => {
    const done = item.completed_at != null;
    return (
      <Pressable
        style={styles.stepRow}
        onPress={() => handleComplete(item)}
        disabled={done}
      >
        <View style={styles.timeline}>
          <View style={[styles.stepCircle, done && styles.stepCircleDone]}>
            {done ? (
              <MaterialIcons name="check" size={14} color="#fff" />
            ) : (
              <Text style={styles.stepNumber}>{index + 1}</Text>
            )}
          </View>
          {index < allItems.length - 1 ? (
            <View style={[styles.stepLine, done && styles.stepLineDone]} />
          ) : null}
        </View>
        <View style={styles.stepContent}>
          <Text style={[styles.stepName, done && styles.stepNameDone]}>{item.step_name}</Text>
          {item.description ? (
            <Text style={styles.stepDesc}>{item.description}</Text>
          ) : null}
          {done && item.completed_at ? (
            <Text style={styles.stepCompleted}>
              Completed{" "}
              {new Date(item.completed_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Onboarding",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <View style={styles.container}>
      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressTitle}>Onboarding Progress</Text>
          <Text style={styles.progressPct}>{pct.toFixed(0)}%</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.progressLabel}>
          {completed} of {total} steps completed
        </Text>
      </View>

      <FlatList
        data={allItems}
        keyExtractor={(item) => `${item.checklist_id}-${item.id}`}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name="checklist" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>No onboarding checklist assigned</Text>
          </View>
        }
      />
    </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  progressCard: {
    backgroundColor: "#fff",
    margin: 16,
    padding: 18,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  progressTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  progressPct: { fontSize: 18, fontWeight: "800", color: "#8B5CF6" },
  progressBar: {
    height: 10,
    backgroundColor: "#E5E7EB",
    borderRadius: 5,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "#8B5CF6", borderRadius: 5 },
  progressLabel: { fontSize: 12, color: "#9CA3AF", marginTop: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  stepRow: { flexDirection: "row", minHeight: 72 },
  timeline: { width: 36, alignItems: "center" },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircleDone: { backgroundColor: "#22C55E", borderColor: "#22C55E" },
  stepNumber: { fontSize: 12, fontWeight: "700", color: "#9CA3AF" },
  stepLine: { flex: 1, width: 2, backgroundColor: "#E5E7EB", marginVertical: 4 },
  stepLineDone: { backgroundColor: "#86EFAC" },
  stepContent: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginLeft: 8,
    marginBottom: 8,
  },
  stepName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  stepNameDone: { color: "#6B7280", textDecorationLine: "line-through" },
  stepDesc: { fontSize: 13, color: "#9CA3AF", marginTop: 4, lineHeight: 18 },
  stepCompleted: { fontSize: 11, color: "#22C55E", fontWeight: "600", marginTop: 6 },
  empty: { alignItems: "center", paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 14, color: "#9CA3AF" },
});
