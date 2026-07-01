import { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Image,
  LayoutAnimation,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { SignalPost } from "@technician/types/signal";
import {
  SignalPostTypeColors,
  HelpRequestStatusColors,
  HelpRequestStatusLabels,
} from "@technician/constants/colors";
import { haptic } from "@technician/hooks/utility/use-haptics";

interface PostCardProps {
  post: SignalPost;
  onLike: (postId: number, currentlyLiked: boolean) => void;
  onComment: (postId: number) => void;
  onPress: (postId: number) => void;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const TYPE_ICON: Record<string, string> = {
  text: "chat-bubble-outline",
  photo: "photo-camera",
  video: "videocam",
  help_request: "warning",
};

export function PostCard({ post, onLike, onComment, onPress }: PostCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isHelpRequest = post.type === "help_request";
  const borderColor = isHelpRequest
    ? SignalPostTypeColors.help_request
    : "#E5E7EB";

  const handleLike = () => {
    haptic.light();
    onLike(post.id, post.liked_by_me);
  };

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  return (
    <Pressable
      style={[styles.card, { borderLeftColor: borderColor }]}
      onPress={() => onPress(post.id)}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          {post.author.avatar_url ? (
            <Image
              source={{ uri: post.author.avatar_url }}
              style={styles.avatarImg}
            />
          ) : (
            <MaterialIcons name="person" size={22} color="#9CA3AF" />
          )}
        </View>
        <View style={styles.headerText}>
          <Text style={styles.authorName}>{post.author.name}</Text>
          <Text style={styles.timestamp}>{formatTimeAgo(post.created_at)}</Text>
        </View>
        <View
          style={[
            styles.typeBadge,
            { backgroundColor: SignalPostTypeColors[post.type] + "18" },
          ]}
        >
          <MaterialIcons
            name={TYPE_ICON[post.type] as any}
            size={14}
            color={SignalPostTypeColors[post.type]}
          />
          <Text
            style={[
              styles.typeBadgeText,
              { color: SignalPostTypeColors[post.type] },
            ]}
          >
            {post.type === "help_request" ? "Help" : post.type}
          </Text>
        </View>
      </View>

      {/* Help Request Badge */}
      {isHelpRequest && post.help_request && (
        <View
          style={[
            styles.helpBadge,
            {
              backgroundColor:
                HelpRequestStatusColors[post.help_request.status] + "18",
            },
          ]}
        >
          <MaterialIcons
            name={
              post.help_request.status === "resolved"
                ? "check-circle"
                : "warning"
            }
            size={14}
            color={HelpRequestStatusColors[post.help_request.status]}
          />
          <Text
            style={[
              styles.helpBadgeText,
              {
                color: HelpRequestStatusColors[post.help_request.status],
              },
            ]}
          >
            {HelpRequestStatusLabels[post.help_request.status]}
          </Text>
        </View>
      )}

      {/* Body */}
      <Pressable onPress={toggleExpand}>
        <Text
          style={styles.body}
          numberOfLines={expanded ? undefined : 3}
        >
          {post.body}
        </Text>
      </Pressable>

      {/* Media Preview */}
      {post.media_urls.length > 0 && (
        <View style={styles.mediaRow}>
          {post.media_urls.slice(0, 3).map((url, i) => (
            <Image key={i} source={{ uri: url }} style={styles.mediaThumbnail} />
          ))}
          {post.media_urls.length > 3 && (
            <View style={styles.mediaMore}>
              <Text style={styles.mediaMoreText}>
                +{post.media_urls.length - 3}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Tags */}
      {post.tags.length > 0 && (
        <View style={styles.tagRow}>
          {post.tags.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>#{tag}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          style={styles.actionBtn}
          onPress={handleLike}
          hitSlop={8}
        >
          <MaterialIcons
            name={post.liked_by_me ? "favorite" : "favorite-border"}
            size={20}
            color={post.liked_by_me ? "#EF4444" : "#9CA3AF"}
          />
          {post.like_count > 0 && (
            <Text
              style={[
                styles.actionCount,
                post.liked_by_me && { color: "#EF4444" },
              ]}
            >
              {post.like_count}
            </Text>
          )}
        </Pressable>

        <Pressable
          style={styles.actionBtn}
          onPress={() => onComment(post.id)}
          hitSlop={8}
        >
          <MaterialIcons name="chat-bubble-outline" size={19} color="#9CA3AF" />
          {post.comment_count > 0 && (
            <Text style={styles.actionCount}>{post.comment_count}</Text>
          )}
        </Pressable>

        <Pressable style={styles.actionBtn} hitSlop={8}>
          <MaterialIcons name="share" size={19} color="#9CA3AF" />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  headerText: {
    flex: 1,
    marginLeft: 10,
  },
  authorName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  timestamp: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 1,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  helpBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 8,
  },
  helpBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  body: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
    marginBottom: 8,
  },
  mediaRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
  },
  mediaThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
  },
  mediaMore: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaMoreText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#6B7280",
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  tag: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 12,
    color: "#3B82F6",
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F3F4F6",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    minWidth: 44,
    minHeight: 44,
  },
  actionCount: {
    fontSize: 13,
    color: "#9CA3AF",
    fontWeight: "500",
  },
});
