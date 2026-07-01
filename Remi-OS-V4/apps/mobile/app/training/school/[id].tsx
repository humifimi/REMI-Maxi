import { StyleSheet, View, Text, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCourses } from "@technician/hooks/training/use-university";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";
import { haptic } from "@technician/hooks/utility/use-haptics";

export default function SchoolDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const schoolId = parseInt(id, 10);
  const router = useRouter();
  const { data: courses = [], isLoading } = useCourses(schoolId);

  if (isLoading) return <SkeletonListScreen />;

  return (
    <>
      <Stack.Screen options={{ title: "Courses" }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {courses.length === 0 && (
          <View style={styles.empty}>
            <MaterialIcons name="menu-book" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>No courses available yet</Text>
          </View>
        )}

        {courses.map((course, index) => {
          const pct = course.completion_pct ?? 0;
          const isComplete = pct >= 100;

          return (
            <Pressable
              key={course.id}
              style={styles.courseCard}
              onPress={() => {
                haptic.light();
                router.push(`/training/course/${course.id}` as never);
              }}
            >
              <View style={styles.courseRow}>
                <View
                  style={[
                    styles.courseNum,
                    isComplete && styles.courseNumComplete,
                  ]}
                >
                  {isComplete ? (
                    <MaterialIcons name="check" size={18} color="#fff" />
                  ) : (
                    <Text style={styles.courseNumText}>{index + 1}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.courseTitle}>{course.title}</Text>
                  {course.description && (
                    <Text style={styles.courseDesc} numberOfLines={2}>
                      {course.description}
                    </Text>
                  )}
                  <View style={styles.courseMeta}>
                    <Text style={styles.courseMetaText}>
                      {course.module_count ?? 0} module
                      {(course.module_count ?? 0) !== 1 ? "s" : ""}
                    </Text>
                    {course.level_required != null && (
                      <Text style={styles.courseMetaText}>
                        Level {course.level_required}+
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.pctBadge}>
                  <Text
                    style={[
                      styles.pctText,
                      isComplete && styles.pctTextComplete,
                    ]}
                  >
                    {Math.round(pct)}%
                  </Text>
                </View>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(pct, 100)}%`,
                      backgroundColor: isComplete ? "#22C55E" : "#3B82F6",
                    },
                  ]}
                />
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
  courseCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  courseRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  courseNum: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  courseNumComplete: { backgroundColor: "#22C55E" },
  courseNumText: { fontSize: 15, fontWeight: "800", color: "#374151" },
  courseTitle: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
  courseDesc: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  courseMeta: { flexDirection: "row", gap: 12, marginTop: 4 },
  courseMetaText: { fontSize: 12, color: "#9CA3AF" },
  pctBadge: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pctText: { fontSize: 13, fontWeight: "700", color: "#6B7280" },
  pctTextComplete: { color: "#22C55E" },
  progressBar: {
    height: 4,
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: { height: 4, borderRadius: 2 },
});
