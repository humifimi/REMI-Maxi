import { StyleSheet, View, Text, FlatList, Pressable, RefreshControl } from "react-native";
import { useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMyReferrals } from "@technician/hooks/customers/use-referrals";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";
import { ReferralStatusColorMap } from "@technician/constants/colors";
import type { Referral } from "@technician/types/api";

const CATEGORY_ICONS: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  windshield: "visibility",
  brakes: "disc-full",
  tires: "tire-repair",
  cel: "warning",
  tow: "local-shipping",
  detailing: "auto-awesome",
};

export default function ReferralHistoryScreen() {
  const router = useRouter();
  const { data: referrals = [], isLoading, isRefetching, refetch } = useMyReferrals();

  if (isLoading && !isRefetching) return <SkeletonListScreen />;

  const renderItem = ({ item }: { item: Referral }) => {
    const color = ReferralStatusColorMap[item.status];
    const icon = CATEGORY_ICONS[item.category] ?? "flag";
    const date = new Date(item.created_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    return (
      <View style={[styles.card, { borderLeftColor: color }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconWrap, { backgroundColor: color + "15" }]}>
            <MaterialIcons name={icon} size={20} color={color} />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.category}>
              {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
            </Text>
            {item.customer_name ? (
              <Text style={styles.customer}>{item.customer_name}</Text>
            ) : null}
          </View>
          <View style={styles.cardRight}>
            <View style={[styles.statusBadge, { backgroundColor: color + "20" }]}>
              <Text style={[styles.statusText, { color }]}>
                {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
              </Text>
            </View>
            <Text style={styles.date}>{date}</Text>
          </View>
        </View>
        {item.notes ? (
          <Text style={styles.notes} numberOfLines={2}>{item.notes}</Text>
        ) : null}
        {item.partner_name ? (
          <View style={styles.partnerRow}>
            <MaterialIcons name="handshake" size={14} color="#6B7280" />
            <Text style={styles.partnerName}>{item.partner_name}</Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Referrals",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <View style={styles.container}>
      <FlatList
        data={referrals}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name="flag" size={56} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No referrals</Text>
            <Text style={styles.emptyText}>
              Flag issues during job completion to create referrals for partner services.
            </Text>
          </View>
        }
      />
    </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  list: { padding: 16, paddingBottom: 24 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: { flex: 1 },
  category: { fontSize: 16, fontWeight: "700", color: "#111827" },
  customer: { fontSize: 13, color: "#6B7280", marginTop: 1 },
  cardRight: { alignItems: "flex-end" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: "700" },
  date: { fontSize: 11, color: "#9CA3AF", marginTop: 4 },
  notes: { fontSize: 13, color: "#6B7280", marginTop: 10, lineHeight: 18 },
  partnerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  partnerName: { fontSize: 13, color: "#6B7280", fontWeight: "500" },
  empty: { alignItems: "center", paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#374151" },
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    paddingHorizontal: 40,
    lineHeight: 20,
  },
});
