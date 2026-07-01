import { StyleSheet, View, Text, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useModules } from "@technician/hooks/training/use-university";
import { SkeletonDetailScreen } from "@/src/components/shared/skeleton";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type { TrainingModule } from "@technician/types/api";

export default function CourseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const courseId = parseInt(id, 10);
  const router = useRouter();
  const { data: modules = [], isLoading } = useModules(courseId);

  if (isLoading) return <SkeletonDetailScreen />;

  const sorted = [...modules].sort((a, b) => a.sort_order - b.sort_order);

  const isUnlocked = (index: number) => {
    if (index === 0) return true;
    const prev = sorted[index - 1];
    return !!prev.completion;
  };

  return (
    <>
      <Stack.Screen options={{ title: "Modules" }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {sorted.length === 0 && (
          <View style={styles.empty}>
            <MaterialIcons name="view-module" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>No modules in this course yet</Text>
          </View>
        )}

        {sorted.map((mod, index) => {
          const unlocked = isUnlocked(index);
          const completed = !!mod.completion;

          return (
            <Pressable
              key={mod.id}
              style={[styles.moduleCard, !unlocked && styles.moduleCardLocked]}
              onPress={() => {
                if (!unlocked) return;
                haptic.light();
                router.push(`/training/lesson/${mod.id}` as never);
              }}
              disabled={!unlocked}
            >
              <View style={styles.moduleRow}>
                <View
                  style={[
                    styles.moduleIcon,
                    completed && styles.moduleIconComplete,
                    !unlocked && styles.moduleIconLocked,
                  ]}
                >
                  {completed ? (
                    <MaterialIcons name="check" size={18} color="#fff" />
                  ) : !unlocked ? (
                    <MaterialIcons name="lock" size={16} color="#9CA3AF" />
                  ) : (
                    <Text style={styles.moduleNum}>{index + 1}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.moduleTitle,
                      !unlocked && styles.moduleTitleLocked,
                    ]}
                  >
                    {mod.name}
                  </Text>
                  {mod.duration_minutes != null && (
                    <Text style={styles.moduleDuration}>
                      {mod.duration_minutes} min
                    </Text>
                  )}
                </View>
                {completed && (
                  <View style={styles.completeBadge}>
                    <Text style={styles.completeText}>Done</Text>
                  </View>
                )}
                {unlocked && !completed && (
                  <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16, paddingBottom: 40 },
  empty: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 15, color: "#9CA3AF" },
  moduleCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  moduleCardLocked: { opacity: 0.5 },
  moduleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  moduleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  moduleIconComplete: { backgroundColor: "#22C55E" },
  moduleIconLocked: { backgroundColor: "#F3F4F6" },
  moduleNum: { fontSize: 14, fontWeight: "800", color: "#3B82F6" },
  moduleTitle: { fontSize: 15, fontWeight: "600", color: "#1F2937" },
  moduleTitleLocked: { color: "#9CA3AF" },
  moduleDuration: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  completeBadge: {
    backgroundColor: "#F0FDF4",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  completeText: { fontSize: 12, fontWeight: "700", color: "#22C55E" },
});
