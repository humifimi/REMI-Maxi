import { StyleSheet, View, Text, FlatList, Pressable, RefreshControl } from "react-native";
import { useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useShieldInspections, useShieldHistory } from "@technician/hooks/operations/use-shield";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";
import { ShieldStatusColorMap } from "@technician/constants/colors";
import { Brand } from "@technician/constants/brand";
import type { ShieldInspection } from "@technician/types/api";

export default function ShieldDashboard() {
  const router = useRouter();
  const { data: inspections = [], isLoading } = useShieldInspections();
  const { data: history = [], isRefetching, refetch } = useShieldHistory();

  if (isLoading) return <SkeletonListScreen />;

  const current = inspections.find(
    (i) => i.status === "pending" || i.status === "submitted"
  );

  const pastInspections = history.filter((h) => h.status === "approved" || h.status === "rejected");
  const scores = pastInspections
    .filter((h) => h.overall_score != null)
    .map((h) => h.overall_score!);
  const lastScore = scores[0];
  const prevScore = scores[1];
  const trend = lastScore != null && prevScore != null
    ? lastScore > prevScore ? "up" : lastScore < prevScore ? "down" : "flat"
    : null;

  const renderHistoryItem = ({ item }: { item: ShieldInspection }) => {
    const color = ShieldStatusColorMap[item.status];
    const date = new Date(item.created_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    return (
      <Pressable
        style={styles.historyRow}
        onPress={() => router.push(`/shield/${item.id}`)}
      >
        <View style={[styles.historyDot, { backgroundColor: color }]} />
        <View style={styles.historyInfo}>
          <Text style={styles.historyDate}>{date}</Text>
          <Text style={[styles.historyStatus, { color }]}>
            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </Text>
        </View>
        {item.overall_score != null ? (
          <Text style={styles.historyScore}>{item.overall_score.toFixed(1)}/10</Text>
        ) : null}
        <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
      </Pressable>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: Brand.shieldName,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <View style={styles.container}>
      <View style={styles.currentCard}>
        <View style={styles.currentHeader}>
          <MaterialIcons name="verified-user" size={28} color="#3B82F6" />
          <Text style={styles.currentTitle}>This Month</Text>
        </View>
        {current ? (
          <View style={styles.currentBody}>
            <View
              style={[
                styles.statusPill,
                { backgroundColor: ShieldStatusColorMap[current.status] + "20" },
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  { color: ShieldStatusColorMap[current.status] },
                ]}
              >
                {current.status.charAt(0).toUpperCase() + current.status.slice(1)}
              </Text>
            </View>
            {current.overall_score != null ? (
              <Text style={styles.currentScore}>{current.overall_score.toFixed(1)}/10</Text>
            ) : null}
          </View>
        ) : (
          <Text style={styles.noCurrent}>No inspection submitted yet</Text>
        )}

        {trend ? (
          <View style={styles.trendRow}>
            <MaterialIcons
              name={trend === "up" ? "trending-up" : trend === "down" ? "trending-down" : "trending-flat"}
              size={18}
              color={trend === "up" ? "#22C55E" : trend === "down" ? "#EF4444" : "#6B7280"}
            />
            <Text style={styles.trendText}>
              {trend === "up" ? "Improving" : trend === "down" ? "Declining" : "Steady"} from last month
            </Text>
          </View>
        ) : null}

        <Pressable
          style={styles.startBtn}
          onPress={() => router.push("/shield/submit")}
        >
          <MaterialIcons name="camera-alt" size={20} color="#fff" />
          <Text style={styles.startBtnText}>
            {current?.status === "rejected" ? "Re-submit Inspection" : "Start Inspection"}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Past Inspections</Text>
      <FlatList
        data={pastInspections}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderHistoryItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No past inspections</Text>
          </View>
        }
      />
    </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  currentCard: {
    backgroundColor: "#fff",
    margin: 16,
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  currentHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  currentTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  currentBody: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  statusPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  statusPillText: { fontSize: 13, fontWeight: "700" },
  currentScore: { fontSize: 22, fontWeight: "800", color: "#111827" },
  noCurrent: { fontSize: 14, color: "#9CA3AF", marginBottom: 8 },
  trendRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14 },
  trendText: { fontSize: 13, color: "#6B7280" },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#3B82F6",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  startBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6B7280",
    paddingHorizontal: 16,
    paddingBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    gap: 10,
  },
  historyDot: { width: 10, height: 10, borderRadius: 5 },
  historyInfo: { flex: 1 },
  historyDate: { fontSize: 14, fontWeight: "600", color: "#111827" },
  historyStatus: { fontSize: 12, fontWeight: "600", marginTop: 1 },
  historyScore: { fontSize: 16, fontWeight: "800", color: "#111827" },
  empty: { alignItems: "center", paddingTop: 40, gap: 8 },
  emptyText: { fontSize: 14, color: "#9CA3AF" },
});
