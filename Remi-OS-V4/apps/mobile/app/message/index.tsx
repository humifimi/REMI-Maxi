import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Pressable,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useConversations } from "@technician/hooks/communication/use-messages";
import type { Conversation } from "@technician/types/api";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";

function formatTimestamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function initialsOf(name: string | null): string {
  if (!name) return "??";
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function ConversationCard({ item }: { item: Conversation }) {
  const router = useRouter();
  const unread = item.technician_unread_count;

  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/message/${item.id}`)}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initialsOf(item.customer_name)}</Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.customerName} numberOfLines={1}>
            {item.customer_name ?? "Customer"}
          </Text>
          <Text style={styles.timestamp}>
            {formatTimestamp(item.last_message_at)}
          </Text>
        </View>
        <Text style={styles.preview} numberOfLines={1}>
          {item.last_message ?? "No messages yet"}
        </Text>
      </View>
      {unread > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function ConversationListScreen() {
  const router = useRouter();
  const { data: conversations, isLoading, refetch } = useConversations();

  return (
    <>
      <Stack.Screen
        options={{
          title: "Messages",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <View style={styles.container}>
        {isLoading ? (
          <SkeletonListScreen cards={5} />
        ) : !conversations || conversations.length === 0 ? (
          <View style={styles.empty}>
            <MaterialIcons name="chat-bubble-outline" size={56} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySubtext}>
              Conversations are created when you start a job with a customer.
            </Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(c) => String(c.id)}
            renderItem={({ item }) => <ConversationCard item={item} />}
            contentContainerStyle={styles.list}
            onRefresh={refetch}
            refreshing={isLoading}
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  list: { paddingVertical: 8 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 15, fontWeight: "800", color: "#4F46E5" },
  cardBody: { flex: 1 },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  customerName: { fontSize: 15, fontWeight: "700", color: "#111827", flex: 1 },
  timestamp: { fontSize: 12, color: "#9CA3AF", marginLeft: 8 },
  preview: { fontSize: 13, color: "#9CA3AF" },
  badge: {
    backgroundColor: "#3B82F6",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#374151",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 20,
  },
});
