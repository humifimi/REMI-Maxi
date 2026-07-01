import { useState, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSignalFeed, useToggleLike } from "@technician/hooks/ai/use-signal";
import { PostCard } from "@technician/components/signal/post-card";
import { FeedFilterBar } from "@technician/components/signal/feed-filter-bar";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type { SignalPostType } from "@technician/types/signal";

export default function SignalFeedScreen() {
  const router = useRouter();
  const [filterType, setFilterType] = useState<SignalPostType | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const feedQuery = useSignalFeed({
    type: filterType ?? undefined,
    search: searchQuery || undefined,
  });

  const toggleLike = useToggleLike();

  const posts = useMemo(
    () => feedQuery.data?.pages.flatMap((p) => p.posts) ?? [],
    [feedQuery.data]
  );

  const isLoading = feedQuery.isLoading && !feedQuery.isError;

  const handleLike = useCallback(
    (postId: number, liked: boolean) => {
      toggleLike.mutate({ postId, liked });
    },
    [toggleLike]
  );

  const handleComment = useCallback(
    (postId: number) => {
      router.push(`/signal/post?id=${postId}` as never);
    },
    [router]
  );

  const handlePostPress = useCallback(
    (postId: number) => {
      router.push(`/signal/post?id=${postId}` as never);
    },
    [router]
  );

  const handleRefresh = useCallback(() => {
    feedQuery.refetch();
  }, [feedQuery]);

  if (isLoading) {
    return <SkeletonListScreen />;
  }

  return (
    <View style={styles.container}>
      <FeedFilterBar
        activeType={filterType}
        searchQuery={searchQuery}
        onTypeChange={setFilterType}
        onSearchChange={setSearchQuery}
      />

      <FlatList
        data={posts}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onLike={handleLike}
            onComment={handleComment}
            onPress={handlePostPress}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={feedQuery.isFetching && !feedQuery.isLoading}
            onRefresh={handleRefresh}
            tintColor="#3B82F6"
          />
        }
        onEndReached={() => {
          if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
            feedQuery.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name="forum" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No posts yet</Text>
            <Text style={styles.emptySubtitle}>
              Be the first to share something with the team
            </Text>
          </View>
        }
      />

      <Pressable
        style={styles.fab}
        onPress={() => {
          haptic.medium();
          router.push("/signal/create-post" as never);
        }}
      >
        <MaterialIcons name="edit" size={24} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  list: {
    padding: 16,
    paddingBottom: 100,
  },
  empty: {
    alignItems: "center",
    paddingTop: 80,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#374151",
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    maxWidth: 240,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 100,
  },
});
