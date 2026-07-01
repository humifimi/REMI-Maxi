import { StyleSheet, View, Text, ScrollView, Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  useCertificationLevel,
  useCertificationRequirements,
} from "@technician/hooks/training/use-university";
import { useTrainingXP } from "@technician/hooks/training/use-training-xp";
import { useCertificationProgress } from "@technician/hooks/training/use-certification";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type { CertificationMilestone, CompetencyProgress, CertificationUnlock } from "@technician/types/api";

const LEVEL_NAMES: Record<number, string> = {
  1: "Rookie Tech",
  2: "Certified Technician",
  3: "Senior Tech",
  4: "Master Technician",
  5: "Trainer / Coach",
};

const LEVEL_COLORS: Record<number, string> = {
  1: "#9CA3AF",
  2: "#3B82F6",
  3: "#8B5CF6",
  4: "#F97316",
  5: "#EF4444",
};

const UNLOCK_TYPE_ICONS: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  job_type: "build",
  pay_tier: "payments",
  feature: "auto-awesome",
};

function competencyColor(pct: number): string {
  if (pct >= 80) return "#22C55E";
  if (pct >= 50) return "#3B82F6";
  if (pct >= 25) return "#EAB308";
  return "#EF4444";
}

function MilestoneBar({ milestones, totalXP }: { milestones: CertificationMilestone[]; totalXP: number }) {
  if (milestones.length === 0) return null;

  const maxXP = milestones[milestones.length - 1].xp_required;
  const progressPct = maxXP > 0 ? Math.min((totalXP / maxXP) * 100, 100) : 0;

  return (
    <View style={msStyles.container}>
      <Text style={styles.sectionTitle}>XP Milestone Progress</Text>
      <View style={msStyles.card}>
        <View style={msStyles.track}>
          <View style={[msStyles.fill, { width: `${progressPct}%` }]} />
          {milestones.map((m) => {
            const pos = maxXP > 0 ? (m.xp_required / maxXP) * 100 : 0;
            return (
              <View key={m.level} style={[msStyles.marker, { left: `${pos}%` }]}>
                <View
                  style={[
                    msStyles.dot,
                    m.is_reached ? msStyles.dotReached : msStyles.dotPending,
                  ]}
                >
                  {m.is_reached && (
                    <MaterialIcons name="check" size={10} color="#fff" />
                  )}
                </View>
              </View>
            );
          })}
        </View>
        <View style={msStyles.labels}>
          {milestones.map((m) => {
            const pos = maxXP > 0 ? (m.xp_required / maxXP) * 100 : 0;
            return (
              <View key={m.level} style={[msStyles.labelWrap, { left: `${pos}%` }]}>
                <Text
                  style={[
                    msStyles.labelText,
                    m.is_reached && msStyles.labelReached,
                  ]}
                  numberOfLines={1}
                >
                  L{m.level}
                </Text>
              </View>
            );
          })}
        </View>
        <Text style={msStyles.xpCount}>
          {totalXP.toLocaleString()} / {maxXP.toLocaleString()} XP
        </Text>
      </View>
    </View>
  );
}

export default function CertificationScreen() {
  const router = useRouter();
  const { data: levels = [], isLoading } = useCertificationLevel();
  const { data: xpData } = useTrainingXP();
  const { data: progress } = useCertificationProgress();

  const currentLevel = levels.find((l) => l.is_current);
  const nextLevelNum = currentLevel ? currentLevel.level + 1 : 1;
  const { data: requirements = [] } = useCertificationRequirements(
    nextLevelNum <= 5 ? nextLevelNum : 0,
  );

  if (isLoading) return <SkeletonListScreen />;

  return (
    <>
      <Stack.Screen options={{ title: "Certification Dashboard" }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Hero ring */}
        <View style={styles.levelRing}>
          <View
            style={[
              styles.ringOuter,
              { borderColor: LEVEL_COLORS[currentLevel?.level ?? 1] ?? "#9CA3AF" },
            ]}
          >
            <Text style={styles.ringLevel}>{currentLevel?.level ?? 0}</Text>
          </View>
          <Text style={styles.ringTitle}>
            {progress?.current_level_name ??
              (currentLevel
                ? LEVEL_NAMES[currentLevel.level] ?? `Level ${currentLevel.level}`
                : "Not Certified")}
          </Text>
          {progress?.current_badge_emoji && (
            <Text style={styles.ringEmoji}>{progress.current_badge_emoji}</Text>
          )}
          {currentLevel?.earned_at && (
            <Text style={styles.ringEarned}>
              Earned{" "}
              {new Date(currentLevel.earned_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          )}
          {progress?.current_pay_tier && (
            <View style={styles.payTierBadge}>
              <MaterialIcons name="payments" size={14} color="#22C55E" />
              <Text style={styles.payTierText}>{progress.current_pay_tier}</Text>
            </View>
          )}
        </View>

        {/* XP Milestone Bar */}
        {xpData && (
          <MilestoneBar
            milestones={xpData.milestones}
            totalXP={xpData.total_xp}
          />
        )}

        {/* Per-Competency Progress */}
        {progress && progress.competencies.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Competency Progress</Text>
            {progress.competencies.map((comp) => (
              <CompetencyBar key={comp.competency} item={comp} />
            ))}
          </>
        )}

        {/* Unlocked Section */}
        {progress && progress.unlocked.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Unlocked at This Level</Text>
            <View style={styles.unlockGrid}>
              {progress.unlocked.map((u, i) => (
                <UnlockCard key={i} item={u} isUnlocked />
              ))}
            </View>
          </>
        )}

        {/* Next Unlock Section */}
        {progress && progress.next_level_name && progress.next_unlocks.length > 0 && (
          <>
            <View style={styles.nextUnlockHeader}>
              <Text style={styles.sectionTitle}>
                Next: {progress.next_level_name}
              </Text>
              {progress.next_pay_tier && (
                <View style={styles.nextPayBadge}>
                  <Text style={styles.nextPayText}>{progress.next_pay_tier}</Text>
                </View>
              )}
            </View>
            <View style={styles.unlockGrid}>
              {progress.next_unlocks.map((u, i) => (
                <UnlockCard key={i} item={u} isUnlocked={false} />
              ))}
            </View>
          </>
        )}

        {/* Journey Timeline */}
        <Text style={styles.sectionTitle}>Your Journey</Text>
        <View style={styles.timeline}>
          {[1, 2, 3, 4, 5].map((lvl) => {
            const levelData = levels.find((l) => l.level === lvl);
            const earned = !!levelData?.earned_at;
            const isCurrent = currentLevel?.level === lvl;
            const color = LEVEL_COLORS[lvl];

            return (
              <View key={lvl} style={styles.timelineItem}>
                <View
                  style={[
                    styles.timelineDot,
                    earned && { backgroundColor: color, borderColor: color },
                    isCurrent && styles.timelineDotCurrent,
                  ]}
                >
                  {earned && (
                    <MaterialIcons name="check" size={14} color="#fff" />
                  )}
                </View>
                <View style={styles.timelineContent}>
                  <Text
                    style={[
                      styles.timelineName,
                      isCurrent && { color, fontWeight: "800" },
                    ]}
                  >
                    {LEVEL_NAMES[lvl]}
                  </Text>
                  {earned && levelData?.earned_at && (
                    <Text style={styles.timelineDate}>
                      {new Date(levelData.earned_at).toLocaleDateString()}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Next Level Requirements */}
        {nextLevelNum <= 5 && requirements.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              Requirements for {LEVEL_NAMES[nextLevelNum]}
            </Text>
            {requirements.map((req) => {
              const pct = Math.min(
                (req.current_progress / req.requirement_value) * 100,
                100,
              );

              return (
                <View key={req.id} style={styles.reqCard}>
                  <View style={styles.reqHeader}>
                    <MaterialIcons
                      name={req.is_met ? "check-circle" : "radio-button-unchecked"}
                      size={20}
                      color={req.is_met ? "#22C55E" : "#D1D5DB"}
                    />
                    <Text style={styles.reqType}>{req.requirement_type}</Text>
                    <Text style={styles.reqProgress}>
                      {req.current_progress}/{req.requirement_value}
                    </Text>
                  </View>
                  <View style={styles.reqBar}>
                    <View
                      style={[
                        styles.reqBarFill,
                        {
                          width: `${pct}%`,
                          backgroundColor: req.is_met ? "#22C55E" : "#3B82F6",
                        },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </>
        )}

        {nextLevelNum > 5 && (
          <View style={styles.maxCard}>
            <MaterialIcons name="emoji-events" size={36} color="#F97316" />
            <Text style={styles.maxTitle}>Maximum Level Reached!</Text>
            <Text style={styles.maxSub}>
              You've achieved the highest certification level.
            </Text>
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </>
  );
}

function CompetencyBar({ item }: { item: CompetencyProgress }) {
  const color = competencyColor(item.score_pct);

  return (
    <View style={styles.compCard}>
      <View style={styles.compHeader}>
        <Text style={styles.compName}>{item.competency}</Text>
        <Text style={[styles.compPct, { color }]}>{item.score_pct}%</Text>
      </View>
      <View style={styles.compBarTrack}>
        <View style={[styles.compBarFill, { width: `${item.score_pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.compJobs}>
        {item.jobs_completed}/{item.jobs_required} jobs completed
      </Text>
    </View>
  );
}

function UnlockCard({ item, isUnlocked }: { item: CertificationUnlock; isUnlocked: boolean }) {
  const icon = UNLOCK_TYPE_ICONS[item.type] ?? "lock-open";

  return (
    <View style={[styles.unlockCard, !isUnlocked && styles.unlockCardLocked]}>
      <View style={[styles.unlockIcon, isUnlocked ? styles.unlockIconActive : styles.unlockIconLocked]}>
        <MaterialIcons
          name={isUnlocked ? icon : "lock"}
          size={18}
          color={isUnlocked ? "#22C55E" : "#9CA3AF"}
        />
      </View>
      <Text style={[styles.unlockLabel, !isUnlocked && styles.unlockLabelLocked]} numberOfLines={2}>
        {item.label}
      </Text>
      {item.description && (
        <Text style={styles.unlockDesc} numberOfLines={2}>
          {item.description}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16, paddingBottom: 40 },
  levelRing: { alignItems: "center", paddingVertical: 24 },
  ringOuter: {
    width: 100, height: 100, borderRadius: 50, borderWidth: 6,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#111827", marginBottom: 12,
  },
  ringLevel: { fontSize: 36, fontWeight: "900", color: "#fff" },
  ringTitle: { fontSize: 20, fontWeight: "800", color: "#1F2937" },
  ringEmoji: { fontSize: 28, marginTop: 4 },
  ringEarned: { fontSize: 13, color: "#9CA3AF", marginTop: 4 },
  payTierBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#F0FDF4", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginTop: 10,
    borderWidth: 1, borderColor: "#BBF7D0",
  },
  payTierText: { fontSize: 13, fontWeight: "700", color: "#166534" },

  sectionTitle: {
    fontSize: 17, fontWeight: "700", color: "#111827", marginTop: 20, marginBottom: 12,
  },

  // Competency bars
  compCard: {
    backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: "#E5E7EB",
  },
  compHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  compName: { fontSize: 15, fontWeight: "600", color: "#1F2937" },
  compPct: { fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"] },
  compBarTrack: { height: 8, backgroundColor: "#E5E7EB", borderRadius: 4, overflow: "hidden" },
  compBarFill: { height: 8, borderRadius: 4 },
  compJobs: { fontSize: 12, color: "#9CA3AF", marginTop: 6 },

  // Unlock cards
  unlockGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 8 },
  unlockCard: {
    width: "47%", backgroundColor: "#F0FDF4", borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: "#BBF7D0",
  },
  unlockCardLocked: { backgroundColor: "#F9FAFB", borderColor: "#E5E7EB" },
  unlockIcon: {
    width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 8,
  },
  unlockIconActive: { backgroundColor: "#DCFCE7" },
  unlockIconLocked: { backgroundColor: "#F3F4F6" },
  unlockLabel: { fontSize: 13, fontWeight: "700", color: "#166534" },
  unlockLabelLocked: { color: "#6B7280" },
  unlockDesc: { fontSize: 11, color: "#6B7280", marginTop: 3 },

  // Next unlock header
  nextUnlockHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  nextPayBadge: {
    backgroundColor: "#FEF3C7", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: "#FDE68A",
  },
  nextPayText: { fontSize: 11, fontWeight: "700", color: "#92400E" },

  // Timeline
  timeline: { gap: 2, marginBottom: 16 },
  timelineItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  timelineDot: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB", alignItems: "center", justifyContent: "center",
  },
  timelineDotCurrent: {
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  timelineContent: { flex: 1 },
  timelineName: { fontSize: 14, fontWeight: "600", color: "#374151" },
  timelineDate: { fontSize: 12, color: "#9CA3AF" },

  // Requirements
  reqCard: {
    backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: "#E5E7EB",
  },
  reqHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  reqType: { flex: 1, fontSize: 14, fontWeight: "600", color: "#1F2937" },
  reqProgress: { fontSize: 13, fontWeight: "700", color: "#6B7280" },
  reqBar: { height: 6, backgroundColor: "#E5E7EB", borderRadius: 3, overflow: "hidden" },
  reqBarFill: { height: 6, borderRadius: 3 },

  maxCard: {
    alignItems: "center", backgroundColor: "#FFF7ED", borderRadius: 16, padding: 24, marginTop: 16,
    borderWidth: 1, borderColor: "#FED7AA", gap: 8,
  },
  maxTitle: { fontSize: 18, fontWeight: "800", color: "#9A3412" },
  maxSub: { fontSize: 14, color: "#C2410C" },
});

const msStyles = StyleSheet.create({
  container: { marginBottom: 8 },
  card: {
    backgroundColor: "#fff", borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: "#E5E7EB",
  },
  track: {
    height: 10, backgroundColor: "#E5E7EB", borderRadius: 5,
    overflow: "visible", position: "relative",
  },
  fill: {
    height: 10, backgroundColor: "#8B5CF6", borderRadius: 5,
    position: "absolute", top: 0, left: 0,
  },
  marker: { position: "absolute", top: -5, marginLeft: -10 },
  dot: {
    width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#fff",
  },
  dotReached: { backgroundColor: "#8B5CF6" },
  dotPending: { backgroundColor: "#D1D5DB" },
  labels: { position: "relative", height: 22, marginTop: 6 },
  labelWrap: { position: "absolute", marginLeft: -10, width: 20, alignItems: "center" },
  labelText: { fontSize: 10, fontWeight: "700", color: "#9CA3AF" },
  labelReached: { color: "#8B5CF6" },
  xpCount: {
    fontSize: 13, fontWeight: "700", color: "#6B7280", textAlign: "center",
    marginTop: 4, fontVariant: ["tabular-nums"],
  },
});
