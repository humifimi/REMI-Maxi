import { StyleSheet, View, Text, ScrollView, Pressable } from "react-native";
import { useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useTechPerformance } from "@technician/hooks/auth/use-performance";
import { useCertificationStanding } from "@technician/hooks/training/use-certification";
import type {
  RatingCategoryScore,
  BadgeProgress,
  RatingTrend,
  StandingMetric,
} from "@technician/types/api";

const CATEGORY_LABELS: Record<string, string> = {
  quality: "Quality",
  timeliness: "Timeliness",
  professionalism: "Professionalism",
};

const CATEGORY_ICONS: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  quality: "star",
  timeliness: "schedule",
  professionalism: "handshake",
};

function ratingColor(score: number): string {
  if (score >= 4.5) return "#22C55E";
  if (score >= 3.5) return "#3B82F6";
  if (score >= 2.5) return "#EAB308";
  return "#EF4444";
}

function CategoryBar({ item }: { item: RatingCategoryScore }) {
  const pct = (item.score / 5) * 100;
  const teamPct = (item.team_average / 5) * 100;
  const color = ratingColor(item.score);
  const icon = CATEGORY_ICONS[item.category] ?? "star";

  return (
    <View style={styles.categoryRow}>
      <View style={styles.categoryHeader}>
        <View style={styles.categoryLabelRow}>
          <MaterialIcons name={icon} size={16} color={color} />
          <Text style={styles.categoryLabel}>
            {CATEGORY_LABELS[item.category] ?? item.category}
          </Text>
        </View>
        <Text style={[styles.categoryScore, { color }]}>
          {item.score.toFixed(1)}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
        <View style={[styles.teamMarker, { left: `${teamPct}%` }]} />
      </View>
      <Text style={styles.teamLabel}>
        Team avg: {item.team_average.toFixed(1)}
      </Text>
    </View>
  );
}

function TrendChart({ trends }: { trends: RatingTrend[] }) {
  if (trends.length === 0) return null;

  const maxScore = 5;
  const barHeight = 80;

  return (
    <View style={styles.trendContainer}>
      <Text style={styles.sectionTitle}>Rating Trend</Text>
      <View style={styles.trendBars}>
        {trends.map((t) => {
          const height = (t.score / maxScore) * barHeight;
          const color = ratingColor(t.score);
          return (
            <View key={t.period} style={styles.trendCol}>
              <Text style={styles.trendScore}>{t.score.toFixed(1)}</Text>
              <View style={styles.trendBarTrack}>
                <View
                  style={[
                    styles.trendBarFill,
                    { height, backgroundColor: color },
                  ]}
                />
              </View>
              <Text style={styles.trendPeriod}>{t.period}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function BadgeCard({ badge }: { badge: BadgeProgress }) {
  const pct = badge.target > 0 ? (badge.progress / badge.target) * 100 : 0;

  return (
    <View style={[styles.badgeCard, badge.earned && styles.badgeCardEarned]}>
      <View style={styles.badgeIconWrap}>
        <Text style={styles.badgeIcon}>{badge.icon}</Text>
        {badge.earned && (
          <View style={styles.badgeCheck}>
            <MaterialIcons name="check" size={10} color="#fff" />
          </View>
        )}
      </View>
      <Text style={styles.badgeName} numberOfLines={1}>
        {badge.name}
      </Text>
      {!badge.earned && (
        <>
          <View style={styles.badgeBarTrack}>
            <View
              style={[
                styles.badgeBarFill,
                { width: `${Math.min(100, pct)}%` },
              ]}
            />
          </View>
          <Text style={styles.badgeProgress}>
            {badge.progress}/{badge.target}
          </Text>
        </>
      )}
      {badge.earned && (
        <Text style={styles.badgeEarnedLabel}>Earned</Text>
      )}
    </View>
  );
}

function SkeletonPerformance() {
  return (
    <View style={styles.skeletonContainer}>
      <View style={styles.skeletonHero} />
      <View style={styles.skeletonBar} />
      <View style={styles.skeletonBar} />
      <View style={styles.skeletonBar} />
      <View style={styles.skeletonSection} />
    </View>
  );
}

function StandingSection() {
  const router = useRouter();
  const { data: standing } = useCertificationStanding();

  if (!standing) return null;

  const statusColor = standing.status === "good" ? "#22C55E" : standing.status === "at_risk" ? "#EAB308" : "#EF4444";
  const statusBg = standing.status === "good" ? "#F0FDF4" : standing.status === "at_risk" ? "#FEF9C3" : "#FEE2E2";
  const statusBorder = standing.status === "good" ? "#BBF7D0" : standing.status === "at_risk" ? "#FDE68A" : "#FECACA";
  const statusLabel = standing.status === "good" ? "Good Standing" : standing.status === "at_risk" ? "At Risk" : "Action Required";

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Certification Standing</Text>
      <View style={[styles.standingCard, { backgroundColor: statusBg, borderColor: statusBorder }]}>
        <View style={styles.standingHeader}>
          <MaterialIcons
            name={standing.status === "good" ? "verified" : "warning"}
            size={22}
            color={statusColor}
          />
          <Text style={[styles.standingLabel, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        <Text style={styles.standingMessage}>{standing.message}</Text>
      </View>

      {standing.metrics.map((m) => (
        <View key={m.metric} style={styles.standingMetric}>
          <View style={styles.standingMetricHeader}>
            <MaterialIcons
              name={m.is_below ? "cancel" : "check-circle"}
              size={16}
              color={m.is_below ? "#EF4444" : "#22C55E"}
            />
            <Text style={styles.standingMetricName}>{m.metric}</Text>
            <Text style={[styles.standingMetricValue, { color: m.is_below ? "#EF4444" : "#22C55E" }]}>
              {m.current_value}%
            </Text>
          </View>
          <View style={styles.standingBarTrack}>
            <View
              style={[
                styles.standingBarFill,
                {
                  width: `${Math.min(100, m.current_value)}%`,
                  backgroundColor: m.is_below ? "#EF4444" : "#22C55E",
                },
              ]}
            />
            <View style={[styles.standingThresholdMarker, { left: `${Math.min(100, m.threshold)}%` }]} />
          </View>
          {m.is_below && m.recovery_module_name && (
            <Pressable
              style={styles.recoveryRow}
              onPress={() => {
                if (m.recovery_module_id) {
                  router.push(`/training/${m.recovery_module_id}` as never);
                }
              }}
            >
              <MaterialIcons name="school" size={14} color="#DC2626" />
              <Text style={styles.recoveryText}>
                Complete "{m.recovery_module_name}" to recover
              </Text>
              <MaterialIcons name="chevron-right" size={14} color="#9CA3AF" />
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

export default function PerformanceScreen() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useTechPerformance();

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "My Performance",
          headerStyle: { backgroundColor: "#111827" },
          headerTintColor: "#fff",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.container}>
        {isLoading && <SkeletonPerformance />}

        {error && !data && (
          <View style={styles.errorContainer}>
            <MaterialIcons name="error-outline" size={48} color="#EF4444" />
            <Text style={styles.errorTitle}>Couldn't load performance</Text>
            <Text style={styles.errorBody}>
              Check your connection and try again.
            </Text>
            <Pressable style={styles.retryBtn} onPress={() => refetch()}>
              <MaterialIcons name="refresh" size={18} color="#fff" />
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {data && (
          <>
            {/* Hero Rating Card */}
            <View style={styles.heroCard}>
              <View style={styles.heroRingOuter}>
                <View
                  style={[
                    styles.heroRingInner,
                    { borderColor: ratingColor(data.overall_rating) },
                  ]}
                >
                  <Text
                    style={[
                      styles.heroRating,
                      { color: ratingColor(data.overall_rating) },
                    ]}
                  >
                    {data.overall_rating.toFixed(1)}
                  </Text>
                </View>
              </View>
              <Text style={styles.heroLabel}>Overall Rating</Text>
              <Text style={styles.heroSubtext}>
                Based on {data.total_reviews}{" "}
                {data.total_reviews === 1 ? "review" : "reviews"}
              </Text>
              <View style={styles.heroStatsRow}>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatValue}>
                    {data.team_average_rating.toFixed(1)}
                  </Text>
                  <Text style={styles.heroStatLabel}>Team Avg</Text>
                </View>
                {data.rank != null && data.team_size != null && (
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatValue}>
                      #{data.rank}/{data.team_size}
                    </Text>
                    <Text style={styles.heroStatLabel}>Rank</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Category Breakdown — hidden when BE returns no per-category data */}
            {data.categories.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Category Breakdown</Text>
                {data.categories.map((cat) => (
                  <CategoryBar key={cat.category} item={cat} />
                ))}
              </View>
            )}

            {/* Rating Trend */}
            <TrendChart trends={data.trends} />

            {/* Badges */}
            {data.badges.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Badges & Achievements</Text>
                <View style={styles.badgeGrid}>
                  {data.badges.map((badge) => (
                    <BadgeCard key={badge.id} badge={badge} />
                  ))}
                </View>
              </View>
            )}

            <StandingSection />

            <View style={{ height: 40 }} />
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },

  // Hero
  heroCard: {
    backgroundColor: "#fff",
    margin: 16,
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  heroRingOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  heroRingInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 5,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  heroRating: {
    fontSize: 36,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  heroLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  heroSubtext: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 20,
  },
  heroStatsRow: {
    flexDirection: "row",
    gap: 32,
  },
  heroStat: {
    alignItems: "center",
  },
  heroStatValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  heroStatLabel: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Sections
  section: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 14,
  },

  // Category bars
  categoryRow: {
    marginBottom: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
  },
  categoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  categoryLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  categoryLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  categoryScore: {
    fontSize: 18,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  barTrack: {
    height: 8,
    backgroundColor: "#E5E7EB",
    borderRadius: 4,
    overflow: "visible",
    position: "relative",
  },
  barFill: {
    height: 8,
    borderRadius: 4,
  },
  teamMarker: {
    position: "absolute",
    top: -2,
    width: 3,
    height: 12,
    backgroundColor: "#9CA3AF",
    borderRadius: 1.5,
    marginLeft: -1.5,
  },
  teamLabel: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 4,
    textAlign: "right",
  },

  // Trend chart
  trendContainer: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  trendBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    paddingTop: 8,
  },
  trendCol: {
    alignItems: "center",
    flex: 1,
  },
  trendScore: {
    fontSize: 11,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 4,
    fontVariant: ["tabular-nums"],
  },
  trendBarTrack: {
    width: 24,
    height: 80,
    backgroundColor: "#F3F4F6",
    borderRadius: 6,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  trendBarFill: {
    width: 24,
    borderRadius: 6,
  },
  trendPeriod: {
    fontSize: 10,
    color: "#9CA3AF",
    marginTop: 6,
    fontWeight: "500",
  },

  // Badges
  badgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  badgeCard: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  badgeCardEarned: {
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4",
  },
  badgeIconWrap: {
    position: "relative",
    marginBottom: 8,
  },
  badgeIcon: {
    fontSize: 32,
  },
  badgeCheck: {
    position: "absolute",
    bottom: -2,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#F0FDF4",
  },
  badgeName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 6,
  },
  badgeBarTrack: {
    width: "100%",
    height: 6,
    backgroundColor: "#E5E7EB",
    borderRadius: 3,
    overflow: "hidden",
  },
  badgeBarFill: {
    height: 6,
    backgroundColor: "#3B82F6",
    borderRadius: 3,
  },
  badgeProgress: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
  badgeEarnedLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#22C55E",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Certification Standing
  standingCard: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  standingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  standingLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  standingMessage: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  standingMetric: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  standingMetricHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  standingMetricName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
  },
  standingMetricValue: {
    fontSize: 15,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  standingBarTrack: {
    height: 6,
    backgroundColor: "#E5E7EB",
    borderRadius: 3,
    overflow: "visible",
    position: "relative",
  },
  standingBarFill: {
    height: 6,
    borderRadius: 3,
  },
  standingThresholdMarker: {
    position: "absolute",
    top: -2,
    width: 2,
    height: 10,
    backgroundColor: "#374151",
    borderRadius: 1,
    marginLeft: -1,
  },
  recoveryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#FEE2E2",
  },
  recoveryText: {
    flex: 1,
    fontSize: 12,
    color: "#DC2626",
    fontStyle: "italic",
  },

  // Skeleton
  skeletonContainer: {
    padding: 16,
    gap: 16,
  },
  skeletonHero: {
    height: 240,
    borderRadius: 20,
    backgroundColor: "#E5E7EB",
  },
  skeletonBar: {
    height: 72,
    borderRadius: 12,
    backgroundColor: "#E5E7EB",
  },
  skeletonSection: {
    height: 160,
    borderRadius: 16,
    backgroundColor: "#E5E7EB",
  },

  // Error
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    marginTop: 80,
    gap: 8,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginTop: 8,
  },
  errorBody: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#3B82F6",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 999,
    marginTop: 8,
  },
  retryText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
