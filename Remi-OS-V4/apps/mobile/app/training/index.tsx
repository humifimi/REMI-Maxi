import { useState, useMemo } from "react";
import { StyleSheet, View, Text, ScrollView, Pressable } from "react-native";
import { useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSchools, useCertificationLevel } from "@technician/hooks/training/use-university";
import { useTrainingXP } from "@technician/hooks/training/use-training-xp";
import { useAssignedTraining } from "@technician/hooks/training/use-training-modules";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type {
  TrainingSchool,
  TrainingXPSummary,
  AssignedTrainingItem,
  AssignedTrainingStatus,
} from "@technician/types/api";

const SCHOOL_ICONS: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  "Oil Change Division": "opacity",
  "Tire Division": "tire-repair",
  "Fleet Operations": "local-shipping",
  "Customer Experience": "sentiment-satisfied",
  "Sales/Upsells": "trending-up",
  "Leadership": "psychology",
};

const SCHOOL_COLORS = [
  "#3B82F6", "#8B5CF6", "#F97316", "#22C55E", "#EF4444", "#06B6D4",
];

const LEVEL_NAMES: Record<number, string> = {
  1: "Rookie Tech",
  2: "Certified Technician",
  3: "Senior Tech",
  4: "Master Technician",
  5: "Trainer / Coach",
};

type FilterKey = "all" | "assigned" | "in_progress" | "completed" | "overdue";

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "assigned", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Done" },
  { key: "overdue", label: "Overdue" },
];

const STATUS_COLORS: Record<AssignedTrainingStatus, string> = {
  assigned: "#3B82F6",
  in_progress: "#8B5CF6",
  completed: "#22C55E",
  overdue: "#EF4444",
};

const STATUS_BG: Record<AssignedTrainingStatus, string> = {
  assigned: "#EFF6FF",
  in_progress: "#F5F3FF",
  completed: "#F0FDF4",
  overdue: "#FEE2E2",
};

const STATUS_LABELS: Record<AssignedTrainingStatus, string> = {
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
  overdue: "Overdue",
};

function XPCard({ xp }: { xp: TrainingXPSummary }) {
  const nextMilestone = xp.milestones.find((m) => !m.is_reached);
  const currentXPBase = xp.milestones.find((m) => m.level === xp.current_level)?.xp_required ?? 0;
  const progressToNext = nextMilestone
    ? ((xp.total_xp - currentXPBase) / (nextMilestone.xp_required - currentXPBase)) * 100
    : 100;

  return (
    <View style={xpStyles.card}>
      <View style={xpStyles.topRow}>
        <View style={xpStyles.xpBadge}>
          <Text style={xpStyles.xpIcon}>⚡</Text>
          <Text style={xpStyles.xpTotal}>{xp.total_xp.toLocaleString()}</Text>
          <Text style={xpStyles.xpLabel}>XP</Text>
        </View>
        <View style={xpStyles.info}>
          <Text style={xpStyles.levelName}>{xp.current_level_name}</Text>
          <Text style={xpStyles.moduleCount}>
            {xp.modules_completed} module{xp.modules_completed !== 1 ? "s" : ""} completed
          </Text>
          {nextMilestone && (
            <Text style={xpStyles.nextLevel}>
              {xp.xp_to_next_level.toLocaleString()} XP to {nextMilestone.name}
            </Text>
          )}
        </View>
      </View>
      {nextMilestone && (
        <View style={xpStyles.progressTrack}>
          <View
            style={[
              xpStyles.progressFill,
              { width: `${Math.min(100, Math.max(0, progressToNext))}%` },
            ]}
          />
        </View>
      )}
      {xp.recent_xp.length > 0 && (
        <View style={xpStyles.recentSection}>
          {xp.recent_xp.slice(0, 2).map((entry) => (
            <View key={entry.module_id} style={xpStyles.recentRow}>
              <Text style={xpStyles.recentName} numberOfLines={1}>
                {entry.module_name}
              </Text>
              <Text style={xpStyles.recentXP}>+{entry.xp_earned} XP</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function UniversityHome() {
  const router = useRouter();
  const { data: schools = [], isLoading } = useSchools();
  const { data: levels = [] } = useCertificationLevel();
  const { data: xpData } = useTrainingXP();
  const { data: assignedData } = useAssignedTraining();
  const [filter, setFilter] = useState<FilterKey>("all");

  if (isLoading) return <SkeletonListScreen />;

  const currentLevel = levels.find((l) => l.is_current);
  const nextLevel = levels.find(
    (l) => l.level === (currentLevel ? currentLevel.level + 1 : 1),
  );

  const retrainingItems = assignedData?.items.filter(
    (t) => t.is_mandatory && t.reassign_reason != null,
  ) ?? [];

  const filteredItems = useMemo(() => {
    if (!assignedData) return [];
    if (filter === "all") return assignedData.items;
    return assignedData.items.filter((t) => t.status === filter);
  }, [assignedData, filter]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "MAXI University",
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={{ padding: 8, marginLeft: -8 }}
            >
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Re-training alerts at the very top */}
        {retrainingItems.map((item) => (
          <Pressable
            key={item.id}
            style={styles.retrainBanner}
            onPress={() => {
              haptic.light();
              router.push(`/training/${item.module_id}` as never);
            }}
          >
            <MaterialIcons name="warning" size={20} color="#DC2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.retrainTitle}>Required Re-Training</Text>
              <Text style={styles.retrainReason}>{item.reassign_reason}</Text>
              <Text style={styles.retrainModule}>{item.title}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
          </Pressable>
        ))}

        {/* Certification card */}
        {currentLevel && (
          <Pressable
            style={styles.certCard}
            onPress={() => {
              haptic.light();
              router.push("/training/certification");
            }}
          >
            <View style={styles.certLeft}>
              <View style={styles.levelBadge}>
                <Text style={styles.levelNumber}>{currentLevel.level}</Text>
              </View>
              <View>
                <Text style={styles.certTitle}>
                  {LEVEL_NAMES[currentLevel.level] ?? `Level ${currentLevel.level}`}
                </Text>
                {nextLevel && (
                  <Text style={styles.certSub}>
                    Next: {LEVEL_NAMES[nextLevel.level] ?? `Level ${nextLevel.level}`}
                  </Text>
                )}
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={22} color="#9CA3AF" />
          </Pressable>
        )}

        {xpData && <XPCard xp={xpData} />}

        {/* Assigned Training Section */}
        {assignedData && assignedData.items.length > 0 && (
          <>
            <View style={styles.assignedHeader}>
              <Text style={styles.sectionTitle}>My Training</Text>
              {assignedData.overdue_count > 0 && (
                <View style={styles.overdueCount}>
                  <Text style={styles.overdueCountText}>
                    {assignedData.overdue_count} overdue
                  </Text>
                </View>
              )}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
              contentContainerStyle={styles.filterRow}
            >
              {FILTER_OPTIONS.map((f) => {
                const count = f.key === "all"
                  ? assignedData.items.length
                  : assignedData.items.filter((t) => t.status === f.key).length;
                return (
                  <Pressable
                    key={f.key}
                    style={[
                      styles.filterChip,
                      filter === f.key && styles.filterChipActive,
                    ]}
                    onPress={() => {
                      haptic.selection();
                      setFilter(f.key);
                    }}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        filter === f.key && styles.filterChipTextActive,
                      ]}
                    >
                      {f.label} ({count})
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {filteredItems.map((item) => (
              <AssignedTrainingCard
                key={item.id}
                item={item}
                onPress={() => {
                  haptic.light();
                  router.push(`/training/${item.module_id}` as never);
                }}
              />
            ))}

            {filteredItems.length === 0 && (
              <View style={styles.emptyFilter}>
                <Text style={styles.emptyFilterText}>No modules match this filter</Text>
              </View>
            )}
          </>
        )}

        {/* Schools grid */}
        <Text style={styles.sectionTitle}>Schools</Text>
        <View style={styles.schoolGrid}>
          {schools.map((school, index) => (
            <SchoolCard
              key={school.id}
              school={school}
              color={SCHOOL_COLORS[index % SCHOOL_COLORS.length]}
              icon={SCHOOL_ICONS[school.name] ?? "school"}
              onPress={() => {
                haptic.light();
                router.push(`/training/school/${school.id}` as never);
              }}
            />
          ))}
        </View>

        {schools.length === 0 && (
          <View style={styles.empty}>
            <MaterialIcons name="school" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>No schools available yet</Text>
          </View>
        )}

        <Pressable
          style={styles.linkRow}
          onPress={() => {
            haptic.light();
            router.push("/training/onboarding");
          }}
        >
          <MaterialIcons name="checklist" size={20} color="#6B7280" />
          <Text style={styles.linkText}>Onboarding Checklist</Text>
          <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
        </Pressable>

        <Pressable
          style={styles.linkRow}
          onPress={() => {
            haptic.light();
            router.push("/training/video-upload" as never);
          }}
        >
          <MaterialIcons name="videocam" size={20} color="#6B7280" />
          <Text style={styles.linkText}>My Video Submissions</Text>
          <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
        </Pressable>
      </ScrollView>
    </>
  );
}

function AssignedTrainingCard({
  item,
  onPress,
}: {
  item: AssignedTrainingItem;
  onPress: () => void;
}) {
  const color = STATUS_COLORS[item.status];
  const bg = STATUS_BG[item.status];
  const isOverdue = item.status === "overdue";

  return (
    <Pressable
      style={[
        styles.assignedCard,
        { borderLeftColor: color },
        isOverdue && styles.assignedCardOverdue,
      ]}
      onPress={onPress}
    >
      <View style={styles.assignedCardTop}>
        <View style={{ flex: 1 }}>
          <View style={styles.assignedBadgeRow}>
            {item.is_mandatory && (
              <View style={styles.mandatoryBadge}>
                <Text style={styles.mandatoryBadgeText}>MANDATORY</Text>
              </View>
            )}
            <View style={[styles.statusBadge, { backgroundColor: bg }]}>
              <Text style={[styles.statusBadgeText, { color }]}>
                {STATUS_LABELS[item.status]}
              </Text>
            </View>
          </View>
          <Text style={styles.assignedTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.assignedSchool}>{item.school_name}</Text>
        </View>
        <View style={styles.assignedRight}>
          <Text style={[styles.assignedPct, { color }]}>
            {item.progress_pct}%
          </Text>
          <MaterialIcons name="chevron-right" size={20} color="#D1D5DB" />
        </View>
      </View>

      <View style={styles.assignedProgress}>
        <View
          style={[
            styles.assignedProgressFill,
            { width: `${item.progress_pct}%`, backgroundColor: color },
          ]}
        />
      </View>

      <View style={styles.assignedMeta}>
        {item.duration_minutes != null && (
          <View style={styles.metaPill}>
            <MaterialIcons name="schedule" size={12} color="#9CA3AF" />
            <Text style={styles.metaPillText}>{item.duration_minutes} min</Text>
          </View>
        )}
        <View style={styles.metaPill}>
          <MaterialIcons name="star" size={12} color="#FCD34D" />
          <Text style={styles.metaPillText}>{item.xp_reward} XP</Text>
        </View>
        {item.due_date && (
          <View style={[styles.metaPill, isOverdue && styles.metaPillOverdue]}>
            <MaterialIcons name="event" size={12} color={isOverdue ? "#EF4444" : "#9CA3AF"} />
            <Text style={[styles.metaPillText, isOverdue && styles.metaPillTextOverdue]}>
              Due{" "}
              {new Date(item.due_date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </Text>
          </View>
        )}
      </View>

      {item.reassign_reason && (
        <View style={styles.reasonRow}>
          <MaterialIcons name="info-outline" size={14} color="#DC2626" />
          <Text style={styles.reasonText}>{item.reassign_reason}</Text>
        </View>
      )}
    </Pressable>
  );
}

function SchoolCard({
  school,
  color,
  icon,
  onPress,
}: {
  school: TrainingSchool;
  color: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
}) {
  const pct = school.completion_pct ?? 0;

  return (
    <Pressable style={styles.schoolCard} onPress={onPress}>
      <View style={[styles.schoolIcon, { backgroundColor: `${color}18` }]}>
        <MaterialIcons name={icon} size={28} color={color} />
      </View>
      <Text style={styles.schoolName} numberOfLines={2}>
        {school.name}
      </Text>
      <View style={styles.schoolProgress}>
        <View
          style={[
            styles.schoolProgressFill,
            { width: `${Math.min(pct, 100)}%`, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={styles.schoolMeta}>
        {school.course_count ?? 0} course{(school.course_count ?? 0) !== 1 ? "s" : ""} ·{" "}
        {Math.round(pct)}%
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16, paddingBottom: 40 },

  // Re-training banner
  retrainBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#FEF2F2", borderRadius: 14, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: "#FECACA",
  },
  retrainTitle: { fontSize: 13, fontWeight: "700", color: "#DC2626" },
  retrainReason: { fontSize: 12, color: "#991B1B", marginTop: 2 },
  retrainModule: { fontSize: 12, fontWeight: "600", color: "#B91C1C", marginTop: 2 },

  // Cert card
  certCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#1E1B4B", borderRadius: 16, padding: 16, marginBottom: 20,
  },
  certLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  levelBadge: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "#8B5CF6", alignItems: "center", justifyContent: "center",
  },
  levelNumber: { fontSize: 20, fontWeight: "900", color: "#fff" },
  certTitle: { fontSize: 16, fontWeight: "700", color: "#fff" },
  certSub: { fontSize: 12, color: "#A5B4FC", marginTop: 2 },

  // Assigned training header
  assignedHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 12 },
  overdueCount: { backgroundColor: "#FEE2E2", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  overdueCountText: { fontSize: 12, fontWeight: "700", color: "#EF4444" },

  // Filters
  filterScroll: { marginBottom: 12, flexGrow: 0 },
  filterRow: { gap: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: "#E5E7EB",
  },
  filterChipActive: { backgroundColor: "#3B82F6" },
  filterChipText: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  filterChipTextActive: { color: "#fff" },

  // Assigned cards
  assignedCard: {
    backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: "#E5E7EB", borderLeftWidth: 4,
  },
  assignedCardOverdue: { backgroundColor: "#FFFBFB" },
  assignedCardTop: { flexDirection: "row", alignItems: "flex-start" },
  assignedBadgeRow: { flexDirection: "row", gap: 6, marginBottom: 6 },
  mandatoryBadge: {
    backgroundColor: "#FEE2E2", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  mandatoryBadgeText: { fontSize: 9, fontWeight: "800", color: "#EF4444", letterSpacing: 0.5 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  statusBadgeText: { fontSize: 10, fontWeight: "700" },
  assignedTitle: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
  assignedSchool: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  assignedRight: { alignItems: "center", marginLeft: 8 },
  assignedPct: { fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"], marginBottom: 2 },

  assignedProgress: { height: 4, backgroundColor: "#E5E7EB", borderRadius: 2, overflow: "hidden", marginTop: 10, marginBottom: 8 },
  assignedProgressFill: { height: 4, borderRadius: 2 },

  assignedMeta: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  metaPill: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaPillText: { fontSize: 11, color: "#9CA3AF" },
  metaPillOverdue: { backgroundColor: "#FEE2E2", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  metaPillTextOverdue: { color: "#EF4444", fontWeight: "600" },

  reasonRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#FEE2E2" },
  reasonText: { flex: 1, fontSize: 12, color: "#DC2626", fontStyle: "italic" },

  emptyFilter: { alignItems: "center", paddingVertical: 20 },
  emptyFilterText: { fontSize: 14, color: "#9CA3AF" },

  // Schools
  schoolGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 20 },
  schoolCard: {
    width: "47%", backgroundColor: "#fff", borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: "#E5E7EB",
  },
  schoolIcon: {
    width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 10,
  },
  schoolName: { fontSize: 14, fontWeight: "700", color: "#1F2937", marginBottom: 8 },
  schoolProgress: { height: 4, backgroundColor: "#E5E7EB", borderRadius: 2, marginBottom: 6, overflow: "hidden" },
  schoolProgressFill: { height: 4, borderRadius: 2 },
  schoolMeta: { fontSize: 11, color: "#9CA3AF" },

  empty: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 15, color: "#9CA3AF" },

  linkRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: "#E5E7EB",
  },
  linkText: { flex: 1, fontSize: 15, fontWeight: "600", color: "#374151" },
});

const xpStyles = StyleSheet.create({
  card: { backgroundColor: "#1E1B4B", borderRadius: 16, padding: 16, marginBottom: 20 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  xpBadge: {
    alignItems: "center", backgroundColor: "#312E81", borderRadius: 14,
    paddingVertical: 10, paddingHorizontal: 14,
  },
  xpIcon: { fontSize: 20 },
  xpTotal: { fontSize: 22, fontWeight: "900", color: "#FCD34D", fontVariant: ["tabular-nums"] },
  xpLabel: { fontSize: 10, fontWeight: "700", color: "#A5B4FC", letterSpacing: 1 },
  info: { flex: 1 },
  levelName: { fontSize: 16, fontWeight: "700", color: "#fff" },
  moduleCount: { fontSize: 12, color: "#C7D2FE", marginTop: 2 },
  nextLevel: { fontSize: 12, color: "#A5B4FC", marginTop: 2 },
  progressTrack: { height: 6, backgroundColor: "#312E81", borderRadius: 3, overflow: "hidden", marginTop: 12 },
  progressFill: { height: 6, backgroundColor: "#FCD34D", borderRadius: 3 },
  recentSection: { marginTop: 12, borderTopWidth: 1, borderTopColor: "#312E81", paddingTop: 10, gap: 6 },
  recentRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  recentName: { fontSize: 12, color: "#C7D2FE", flex: 1, marginRight: 8 },
  recentXP: { fontSize: 12, fontWeight: "700", color: "#FCD34D" },
});
