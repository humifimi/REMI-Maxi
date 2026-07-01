import { StyleSheet, View, Text, ScrollView, Image, Pressable } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useShieldInspectionDetail } from "@technician/hooks/operations/use-shield";
import { SkeletonDetailScreen } from "@/src/components/shared/skeleton";
import { ShieldStatusColorMap } from "@technician/constants/colors";

export default function InspectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const inspectionId = parseInt(id, 10) || 0;
  const { data: inspection, isLoading } = useShieldInspectionDetail(inspectionId);

  if (isLoading || !inspection) return <SkeletonDetailScreen />;

  const color = ShieldStatusColorMap[inspection.status];

  return (
    <>
      <Stack.Screen
        options={{
          title: `Inspection #${inspection.id}`,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={[styles.statusPill, { backgroundColor: color + "20" }]}>
              <Text style={[styles.statusText, { color }]}>
                {inspection.status.charAt(0).toUpperCase() + inspection.status.slice(1)}
              </Text>
            </View>
            {inspection.overall_score != null ? (
              <Text style={styles.score}>{inspection.overall_score.toFixed(1)}/10</Text>
            ) : null}
          </View>
          <Text style={styles.period}>
            {inspection.period_start} — {inspection.period_end}
          </Text>
          {inspection.reviewer_notes ? (
            <View style={styles.reviewerNotes}>
              <MaterialIcons name="rate-review" size={16} color="#F59E0B" />
              <Text style={styles.reviewerNotesText}>{inspection.reviewer_notes}</Text>
            </View>
          ) : null}
        </View>

        {inspection.items && inspection.items.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Submitted Photos</Text>
            {inspection.items.map((item) => {
              const itemColor =
                item.passed === true ? "#22C55E" : item.passed === false ? "#EF4444" : "#EAB308";
              return (
                <View key={item.id} style={styles.itemCard}>
                  <Image source={{ uri: item.photo_url }} style={styles.itemPhoto} />
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemCategory}>{item.category.replace(/_/g, " ")}</Text>
                    <View style={[styles.itemStatus, { backgroundColor: itemColor + "20" }]}>
                      <Text style={[styles.itemStatusText, { color: itemColor }]}>
                        {item.passed === true ? "Pass" : item.passed === false ? "Fail" : "Pending"}
                      </Text>
                    </View>
                    {item.score != null ? (
                      <Text style={styles.itemScore}>{item.score.toFixed(1)}/10</Text>
                    ) : null}
                    {item.reviewer_notes ? (
                      <Text style={styles.itemNotes}>{item.reviewer_notes}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </>
        ) : null}

        {inspection.status === "rejected" ? (
          <Pressable style={styles.resubmitBtn} onPress={() => router.push("/shield/submit")}>
            <MaterialIcons name="refresh" size={20} color="#fff" />
            <Text style={styles.resubmitText}>Re-submit Inspection</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16, paddingBottom: 40 },
  headerCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12 },
  statusText: { fontSize: 14, fontWeight: "700" },
  score: { fontSize: 26, fontWeight: "800", color: "#111827" },
  period: { fontSize: 13, color: "#6B7280", marginTop: 10 },
  reviewerNotes: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 14,
    padding: 12,
    backgroundColor: "#FFFBEB",
    borderRadius: 10,
  },
  reviewerNotesText: { fontSize: 13, color: "#92400E", flex: 1, lineHeight: 18 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6B7280",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  itemCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  itemPhoto: { width: 72, height: 72, borderRadius: 10 },
  itemInfo: { flex: 1 },
  itemCategory: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    textTransform: "capitalize",
  },
  itemStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: "flex-start", marginTop: 4 },
  itemStatusText: { fontSize: 11, fontWeight: "700" },
  itemScore: { fontSize: 13, fontWeight: "700", color: "#374151", marginTop: 4 },
  itemNotes: { fontSize: 12, color: "#6B7280", marginTop: 4, fontStyle: "italic" },
  resubmitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#EF4444",
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 12,
  },
  resubmitText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
