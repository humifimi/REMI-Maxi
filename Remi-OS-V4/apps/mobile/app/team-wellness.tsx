import { StyleSheet, View, Text, ScrollView, Pressable } from "react-native";
import { useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useTeamWellness } from "@technician/hooks/utility/use-team-wellness";
import { WellnessMoodColors } from "@technician/constants/colors";
import { MOOD_EMOJI, MOOD_LABEL } from "@technician/types/wellness";
import type { TeamWellnessTrend, TeamWellnessFlag } from "@technician/types/api";

const CHART_HEIGHT = 120;

function moodColor(mood: number): string {
  if (mood >= 4.5) return WellnessMoodColors[5];
  if (mood >= 3.5) return WellnessMoodColors[4];
  if (mood >= 2.5) return WellnessMoodColors[3];
  if (mood >= 1.5) return WellnessMoodColors[2];
  return WellnessMoodColors[1];
}

function formatWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function CompletionRing({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  const color =
    pct >= 80 ? "#22C55E" : pct >= 60 ? "#EAB308" : "#EF4444";

  return (
    <View style={ringStyles.container}>
      <View style={[ringStyles.outer, { borderColor: color }]}>
        <Text style={[ringStyles.pct, { color }]}>{pct}%</Text>
      </View>
      <Text style={ringStyles.label}>Check-in Rate</Text>
    </View>
  );
}

function MoodHero({ mood }: { mood: number }) {
  const color = moodColor(mood);
  const nearestMood = Math.round(Math.min(5, Math.max(1, mood)));

  return (
    <View style={heroStyles.container}>
      <Text style={heroStyles.emoji}>{MOOD_EMOJI[nearestMood]}</Text>
      <Text style={[heroStyles.score, { color }]}>{mood.toFixed(1)}</Text>
      <Text style={heroStyles.label}>
        Team Average · {MOOD_LABEL[nearestMood]}
      </Text>
    </View>
  );
}

function MoodDistribution({
  distribution,
  total,
}: {
  distribution: Record<number, number>;
  total: number;
}) {
  const moods = [5, 4, 3, 2, 1];
  const maxCount = Math.max(...Object.values(distribution), 1);

  return (
    <View style={distStyles.container}>
      <Text style={sectionTitle}>Mood Distribution</Text>
      {moods.map((m) => {
        const count = distribution[m] ?? 0;
        const pct = total > 0 ? (count / total) * 100 : 0;
        const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0;

        return (
          <View key={m} style={distStyles.row}>
            <Text style={distStyles.emoji}>{MOOD_EMOJI[m]}</Text>
            <View style={distStyles.barTrack}>
              <View
                style={[
                  distStyles.barFill,
                  {
                    width: `${barWidth}%`,
                    backgroundColor: WellnessMoodColors[m],
                  },
                ]}
              />
            </View>
            <Text style={distStyles.count}>
              {count} ({Math.round(pct)}%)
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function TrendChart({ trends }: { trends: TeamWellnessTrend[] }) {
  if (trends.length === 0) return null;

  const maxMood = 5;
  const barHeight = CHART_HEIGHT;

  return (
    <View style={trendStyles.container}>
      <Text style={sectionTitle}>Weekly Mood Trend</Text>
      <View style={trendStyles.chart}>
        {trends.map((t) => {
          const height = (t.average_mood / maxMood) * barHeight;
          const color = moodColor(t.average_mood);
          return (
            <View key={t.date} style={trendStyles.col}>
              <Text style={trendStyles.score}>
                {t.average_mood.toFixed(1)}
              </Text>
              <View style={trendStyles.barTrack}>
                <View
                  style={[
                    trendStyles.barFill,
                    { height, backgroundColor: color },
                  ]}
                />
              </View>
              <Text style={trendStyles.label}>{formatWeekLabel(t.date)}</Text>
              <Text style={trendStyles.count}>
                {t.checkin_count} check-in{t.checkin_count !== 1 ? "s" : ""}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function FlagCard({ flag }: { flag: TeamWellnessFlag }) {
  const isCritical = flag.severity === "critical";
  const iconColor = isCritical ? "#EF4444" : "#F97316";
  const bgColor = isCritical ? "#FEF2F2" : "#FFF7ED";
  const borderColor = isCritical ? "#FECACA" : "#FED7AA";

  return (
    <View
      style={[flagStyles.card, { backgroundColor: bgColor, borderColor }]}
    >
      <MaterialIcons
        name={isCritical ? "error" : "warning"}
        size={22}
        color={iconColor}
      />
      <Text style={flagStyles.message}>{flag.message}</Text>
    </View>
  );
}

function PrivacyNotice() {
  return (
    <View style={privacyStyles.container}>
      <MaterialIcons name="shield" size={18} color="#6B7280" />
      <Text style={privacyStyles.text}>
        All data shown is aggregated across the team. Individual check-in
        responses are never visible to managers.
      </Text>
    </View>
  );
}

function SkeletonTeamWellness() {
  return (
    <View style={skeletonStyles.container}>
      <View style={skeletonStyles.hero} />
      <View style={skeletonStyles.bar} />
      <View style={skeletonStyles.bar} />
      <View style={skeletonStyles.chart} />
    </View>
  );
}

export default function TeamWellnessScreen() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useTeamWellness();

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Team Wellness",
          headerStyle: { backgroundColor: "#111827" },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "700" },
          headerTitleAlign: "center",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.container}>
        {isLoading && <SkeletonTeamWellness />}

        {error && !data && (
          <View style={styles.errorContainer}>
            <MaterialIcons name="error-outline" size={48} color="#EF4444" />
            <Text style={styles.errorTitle}>Couldn't load team wellness</Text>
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
            <PrivacyNotice />

            <View style={styles.heroRow}>
              <MoodHero mood={data.average_mood} />
              <CompletionRing rate={data.completion_rate} />
            </View>

            <View style={styles.statsRow}>
              <StatPill
                label="Team Size"
                value={String(data.team_size)}
                icon="groups"
              />
              <StatPill
                label="Total Check-ins"
                value={String(data.total_checkins)}
                icon="fact-check"
              />
            </View>

            {data.flags.length > 0 && (
              <View style={styles.section}>
                <Text style={sectionTitle}>Alerts</Text>
                {data.flags.map((f) => (
                  <FlagCard key={f.id} flag={f} />
                ))}
              </View>
            )}

            <TrendChart trends={data.trends} />

            <MoodDistribution
              distribution={data.mood_distribution}
              total={data.total_checkins}
            />

            <View style={{ height: 40 }} />
          </>
        )}
      </ScrollView>
    </>
  );
}

function StatPill({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: keyof typeof MaterialIcons.glyphMap;
}) {
  return (
    <View style={statStyles.pill}>
      <MaterialIcons name={icon} size={20} color="#6B7280" />
      <View>
        <Text style={statStyles.value}>{value}</Text>
        <Text style={statStyles.label}>{label}</Text>
      </View>
    </View>
  );
}

const sectionTitle: object = {
  fontSize: 16,
  fontWeight: "700" as const,
  color: "#374151",
  marginBottom: 12,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  heroRow: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 20,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  errorContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    marginTop: 80,
    gap: 8,
  },
  errorTitle: { fontSize: 18, fontWeight: "700", color: "#111827", marginTop: 8 },
  errorBody: { fontSize: 14, color: "#6B7280", textAlign: "center" },
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
  retryText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});

const heroStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  emoji: { fontSize: 40, marginBottom: 8 },
  score: { fontSize: 32, fontWeight: "800", fontVariant: ["tabular-nums"] },
  label: { fontSize: 13, color: "#6B7280", marginTop: 4, textAlign: "center" },
});

const ringStyles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    paddingHorizontal: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  outer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
    marginBottom: 8,
  },
  pct: { fontSize: 22, fontWeight: "800", fontVariant: ["tabular-nums"] },
  label: { fontSize: 13, color: "#6B7280" },
});

const statStyles = StyleSheet.create({
  pill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  value: { fontSize: 18, fontWeight: "700", color: "#111827" },
  label: { fontSize: 11, color: "#9CA3AF" },
});

const flagStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
  },
  message: { flex: 1, fontSize: 14, fontWeight: "500", color: "#374151", lineHeight: 20 },
});

const distStyles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  emoji: { fontSize: 20, width: 28, textAlign: "center" },
  barTrack: {
    flex: 1,
    height: 10,
    backgroundColor: "#F3F4F6",
    borderRadius: 5,
    overflow: "hidden",
  },
  barFill: { height: 10, borderRadius: 5 },
  count: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    width: 60,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
});

const trendStyles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    paddingTop: 8,
  },
  col: { alignItems: "center", flex: 1 },
  score: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 4,
    fontVariant: ["tabular-nums"],
  },
  barTrack: {
    width: 28,
    height: CHART_HEIGHT,
    backgroundColor: "#F3F4F6",
    borderRadius: 6,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barFill: { width: 28, borderRadius: 6 },
  label: {
    fontSize: 10,
    color: "#6B7280",
    marginTop: 6,
    fontWeight: "600",
  },
  count: {
    fontSize: 9,
    color: "#9CA3AF",
    marginTop: 2,
  },
});

const privacyStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    margin: 16,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    padding: 12,
  },
  text: {
    flex: 1,
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 17,
  },
});

const skeletonStyles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  hero: { height: 160, borderRadius: 20, backgroundColor: "#E5E7EB" },
  bar: { height: 56, borderRadius: 14, backgroundColor: "#E5E7EB" },
  chart: { height: 200, borderRadius: 16, backgroundColor: "#E5E7EB" },
});
