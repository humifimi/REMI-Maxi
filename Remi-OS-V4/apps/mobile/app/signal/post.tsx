import { useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  useSignalPost,
  useSignalComments,
  useAddComment,
  useToggleLike,
} from "@technician/hooks/ai/use-signal";
import { PostCard } from "@technician/components/signal/post-card";
import { SkeletonDetailScreen } from "@/src/components/shared/skeleton";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type { SignalComment } from "@technician/types/signal";

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function CommentRow({ comment }: { comment: SignalComment }) {
  return (
    <View style={styles.commentRow}>
      <View style={styles.commentAvatar}>
        <MaterialIcons name="person" size={16} color="#9CA3AF" />
      </View>
      <View style={styles.commentContent}>
        <View style={styles.commentHeader}>
          <Text style={styles.commentAuthor}>{comment.author.name}</Text>
          <Text style={styles.commentTime}>
            {formatTimeAgo(comment.created_at)}
          </Text>
        </View>
        <Text style={styles.commentBody}>{comment.body}</Text>
      </View>
    </View>
  );
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = Number(id) || 0;

  const postQuery = useSignalPost(postId);
  const commentsQuery = useSignalComments(postId);
  const addComment = useAddComment(postId);
  const toggleLike = useToggleLike();

  const [newComment, setNewComment] = useState("");

  const comments = commentsQuery.data ?? [];

  const handleLike = useCallback(
    (pid: number, liked: boolean) => {
      toggleLike.mutate({ postId: pid, liked });
    },
    [toggleLike]
  );

  const handleSubmitComment = async () => {
    const text = newComment.trim();
    if (!text) return;
    haptic.light();

    try {
      await addComment.mutateAsync({ body: text });
      setNewComment("");
    } catch {
      // Backend not ready — silently fail
    }
  };

  if (postQuery.isLoading && !postQuery.isError) {
    return <SkeletonDetailScreen />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={100}
    >
      <FlatList
        data={comments}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <CommentRow comment={item} />}
        ListHeaderComponent={
          postQuery.data ? (
            <View style={styles.postSection}>
              <PostCard
                post={postQuery.data}
                onLike={handleLike}
                onComment={() => {}}
                onPress={() => {}}
              />
              <Text style={styles.commentsHeader}>
                Comments ({comments.length})
              </Text>
            </View>
          ) : (
            <View style={styles.postSection}>
              <Text style={styles.commentsHeader}>
                Comments ({comments.length})
              </Text>
            </View>
          )
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyComments}>
            <MaterialIcons name="chat-bubble-outline" size={32} color="#D1D5DB" />
            <Text style={styles.emptyText}>No comments yet</Text>
          </View>
        }
      />

      <View style={styles.inputBar}>
        <TextInput
          style={styles.commentInput}
          placeholder="Add a comment..."
          placeholderTextColor="#9CA3AF"
          value={newComment}
          onChangeText={setNewComment}
          returnKeyType="send"
          onSubmitEditing={handleSubmitComment}
          maxLength={500}
        />
        <Pressable
          style={[
            styles.sendBtn,
            !newComment.trim() && styles.sendBtnDisabled,
          ]}
          onPress={handleSubmitComment}
          disabled={!newComment.trim() || addComment.isPending}
        >
          <MaterialIcons name="send" size={20} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  list: { padding: 16, paddingBottom: 24 },
  postSection: { marginBottom: 8 },
  commentsHeader: { fontSize: 16, fontWeight: "700", color: "#111827", marginTop: 12, marginBottom: 12 },
  commentRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  commentContent: { flex: 1 },
  commentHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  commentAuthor: { fontSize: 13, fontWeight: "700", color: "#111827" },
  commentTime: { fontSize: 11, color: "#9CA3AF" },
  commentBody: { fontSize: 14, color: "#374151", lineHeight: 20 },
  emptyComments: { alignItems: "center", paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 14, color: "#9CA3AF" },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingBottom: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  commentInput: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
    maxHeight: 80,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: "#93C5FD" },
});
