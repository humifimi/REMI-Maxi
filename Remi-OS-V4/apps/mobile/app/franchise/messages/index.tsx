import { useMemo, useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  ScrollView,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useFranchiseConversations,
  type FranchiseConversationFilters,
} from "@technician/hooks/communication/use-franchise-messages";
import type { FranchiseConversationListItem } from "@technician/types/api";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";
import { useAuthStore } from "@/src/stores/auth";

/**
 * MSG-FE-FO-1 — Franchise Owner messaging inbox.
 *
 * Mirrors the visual language of the technician inbox at
 * `app/message/index.tsx` but adds franchise-scoped affordances:
 * search across the whole franchise, sort by recent / unread,
 * and a tech-filter chip row derived from the loaded
 * conversation list (avoids a separate technicians endpoint —
 * filters by techs the FO actually has threads for).
 *
 * Per-FO unread state is tracked CLIENT-side in AsyncStorage
 * (per the plan "Out of scope: server-side FO unread counter")
 * so the red "new since last viewed" dot is FO-private and does
 * not interfere with the participant-side counters that drive
 * tech / customer badges.
 */
const FO_LAST_VIEWED_KEY = "msg.fo.lastViewed";

type LastViewedMap = Record<string, string>;

async function readLastViewed(): Promise<LastViewedMap> {
  try {
    const raw = await AsyncStorage.getItem(FO_LAST_VIEWED_KEY);
    return raw ? (JSON.parse(raw) as LastViewedMap) : {};
  } catch {
    return {};
  }
}

async function writeLastViewed(map: LastViewedMap): Promise<void> {
  try {
    await AsyncStorage.setItem(FO_LAST_VIEWED_KEY, JSON.stringify(map));
  } catch {
    // best-effort; not catastrophic if it fails.
  }
}

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

interface ConversationCardProps {
  item: FranchiseConversationListItem;
  hasUnseen: boolean;
  onPress: () => void;
}

function ConversationCard({ item, hasUnseen, onPress }: ConversationCardProps) {
  return (
    <Pressable style={styles.card} onPress={onPress} accessibilityRole="button">
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
        <View style={styles.cardMetaRow}>
          <MaterialIcons name="person-outline" size={12} color="#6B7280" />
          <Text style={styles.techName} numberOfLines={1}>
            {item.technician_name ?? "Unassigned"}
          </Text>
        </View>
        <Text style={styles.preview} numberOfLines={1}>
          {item.last_message ?? "No messages yet"}
        </Text>
      </View>
      {hasUnseen && <View style={styles.unseenDot} />}
    </Pressable>
  );
}

export default function FranchiseMessagesInboxScreen() {
  const router = useRouter();
  const userRole = useAuthStore((s) => s.user?.role);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<"recent" | "unread">("recent");
  const [techFilter, setTechFilter] = useState<number | null>(null);
  const [lastViewed, setLastViewed] = useState<LastViewedMap>({});

  useEffect(() => {
    readLastViewed().then(setLastViewed);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const filters = useMemo<FranchiseConversationFilters>(
    () => ({
      q: debouncedSearch.length > 0 ? debouncedSearch : undefined,
      sort,
      techId: techFilter ?? undefined,
    }),
    [debouncedSearch, sort, techFilter],
  );

  const {
    data: conversations,
    isLoading,
    refetch,
    isRefetching,
  } = useFranchiseConversations(filters);

  // Derive tech filter chips from the *currently loaded* list.
  // Order: most-recent-conversation first, deduped on tech_id.
  const techChips = useMemo(() => {
    if (!conversations) return [] as { id: number; name: string }[];
    const seen = new Set<number>();
    const out: { id: number; name: string }[] = [];
    for (const c of conversations) {
      if (c.technician_id === null || c.technician_id === undefined) continue;
      if (seen.has(c.technician_id)) continue;
      seen.add(c.technician_id);
      out.push({
        id: c.technician_id,
        name: c.technician_name ?? `Tech #${c.technician_id}`,
      });
    }
    return out;
  }, [conversations]);

  const openConversation = useCallback(
    async (conv: FranchiseConversationListItem) => {
      // Stamp the FO-private last-viewed timestamp BEFORE we
      // navigate so the red dot clears immediately on return.
      const next = {
        ...lastViewed,
        [String(conv.id)]: new Date().toISOString(),
      };
      setLastViewed(next);
      await writeLastViewed(next);
      router.push(`/franchise/messages/${conv.id}` as never);
    },
    [lastViewed, router],
  );

  const renderItem = useCallback(
    ({ item }: { item: FranchiseConversationListItem }) => {
      const lastViewedAt = lastViewed[String(item.id)] ?? null;
      const hasUnseen =
        item.last_message_at !== null &&
        (lastViewedAt === null || lastViewedAt < item.last_message_at);
      return (
        <ConversationCard
          item={item}
          hasUnseen={hasUnseen}
          onPress={() => openConversation(item)}
        />
      );
    },
    [lastViewed, openConversation],
  );

  if (userRole !== "franchise_owner") {
    return (
      <>
        <Stack.Screen options={{ title: "Franchise Messages" }} />
        <View style={styles.gateContainer}>
          <MaterialIcons name="block" size={48} color="#9CA3AF" />
          <Text style={styles.gateTitle}>Franchise Owners only</Text>
          <Text style={styles.gateBody}>
            This surface lets franchise owners read and intervene on every
            tech ⇄ customer thread in their franchise.
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "Franchise Messages",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <View style={styles.container}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={18} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search customers or messages…"
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <Pressable
              onPress={() => setSearch("")}
              hitSlop={8}
              accessibilityLabel="Clear search"
            >
              <MaterialIcons name="close" size={18} color="#9CA3AF" />
            </Pressable>
          )}
        </View>

        <View style={styles.sortRow}>
          <Pressable
            style={[styles.sortChip, sort === "recent" && styles.sortChipActive]}
            onPress={() => setSort("recent")}
          >
            <Text
              style={[
                styles.sortChipText,
                sort === "recent" && styles.sortChipTextActive,
              ]}
            >
              Recent
            </Text>
          </Pressable>
          <Pressable
            style={[styles.sortChip, sort === "unread" && styles.sortChipActive]}
            onPress={() => setSort("unread")}
          >
            <Text
              style={[
                styles.sortChipText,
                sort === "unread" && styles.sortChipTextActive,
              ]}
            >
              Unread first
            </Text>
          </Pressable>
        </View>

        {techChips.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.techScrollOuter}
            contentContainerStyle={styles.techRow}
          >
            <Pressable
              style={[styles.techChip, techFilter === null && styles.techChipActive]}
              onPress={() => setTechFilter(null)}
            >
              <Text
                style={[
                  styles.techChipText,
                  techFilter === null && styles.techChipTextActive,
                ]}
              >
                All techs
              </Text>
            </Pressable>
            {techChips.map((t) => (
              <Pressable
                key={t.id}
                style={[
                  styles.techChip,
                  techFilter === t.id && styles.techChipActive,
                ]}
                onPress={() => setTechFilter(t.id === techFilter ? null : t.id)}
              >
                <Text
                  style={[
                    styles.techChipText,
                    techFilter === t.id && styles.techChipTextActive,
                  ]}
                >
                  {t.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {isLoading ? (
          <SkeletonListScreen cards={5} />
        ) : !conversations || conversations.length === 0 ? (
          <View style={styles.empty}>
            <MaterialIcons name="forum" size={56} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>
              {debouncedSearch.length > 0 || techFilter !== null
                ? "No conversations match"
                : "No conversations yet"}
            </Text>
            <Text style={styles.emptySubtext}>
              {debouncedSearch.length > 0 || techFilter !== null
                ? "Try clearing your filters."
                : "When techs and customers chat, threads show up here."}
            </Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(c) => String(c.id)}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            onRefresh={refetch}
            refreshing={isRefetching}
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
    paddingVertical: 0,
  },
  sortRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sortChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sortChipActive: { backgroundColor: "#3B82F6", borderColor: "#3B82F6" },
  sortChipText: { fontSize: 12, fontWeight: "600", color: "#6B7280" },
  sortChipTextActive: { color: "#fff" },
  techScrollOuter: { flexGrow: 0 },
  techRow: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
    flexDirection: "row",
  },
  techChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  techChipActive: { backgroundColor: "#111827", borderColor: "#111827" },
  techChipText: { fontSize: 12, fontWeight: "600", color: "#6B7280" },
  techChipTextActive: { color: "#fff" },
  list: { paddingVertical: 4 },
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
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 3,
  },
  techName: { fontSize: 12, color: "#6B7280", fontWeight: "600" },
  preview: { fontSize: 13, color: "#9CA3AF" },
  unseenDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#EF4444",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
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
  gateContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 12,
    backgroundColor: "#F9FAFB",
  },
  gateTitle: { fontSize: 18, fontWeight: "700", color: "#374151" },
  gateBody: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
});
