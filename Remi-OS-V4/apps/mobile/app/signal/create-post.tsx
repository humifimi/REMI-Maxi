import { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCreatePost } from "@technician/hooks/ai/use-signal";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type { SignalPostType } from "@technician/types/signal";

const POST_TYPES: { type: SignalPostType; label: string; icon: string }[] = [
  { type: "text", label: "Text Post", icon: "chat-bubble-outline" },
  { type: "photo", label: "Photo Post", icon: "photo-camera" },
  { type: "video", label: "Video Post", icon: "videocam" },
];

export default function CreatePostScreen() {
  const router = useRouter();
  const createPost = useCreatePost();

  const [postType, setPostType] = useState<SignalPostType>("text");
  const [body, setBody] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const canSubmit = body.trim().length > 0 && !createPost.isPending;

  const addTag = () => {
    const cleaned = tagInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (cleaned && !tags.includes(cleaned) && tags.length < 5) {
      setTags([...tags, cleaned]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    haptic.medium();

    try {
      await createPost.mutateAsync({
        type: postType,
        body: body.trim(),
        tags: tags.length > 0 ? tags : undefined,
      });
      router.back();
    } catch {
      Alert.alert("Error", "Could not create post. Please try again.");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Post Type Selector */}
        <View style={styles.typeRow}>
          {POST_TYPES.map((pt) => {
            const active = pt.type === postType;
            return (
              <Pressable
                key={pt.type}
                style={[styles.typePill, active && styles.typePillActive]}
                onPress={() => {
                  haptic.light();
                  setPostType(pt.type);
                }}
              >
                <MaterialIcons
                  name={pt.icon as any}
                  size={16}
                  color={active ? "#fff" : "#6B7280"}
                />
                <Text
                  style={[
                    styles.typePillText,
                    active && styles.typePillTextActive,
                  ]}
                >
                  {pt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Help Request CTA */}
        <Pressable
          style={styles.helpCta}
          onPress={() => {
            haptic.medium();
            router.push("/signal/help-request" as never);
          }}
        >
          <MaterialIcons name="warning" size={20} color="#EF4444" />
          <View style={styles.helpCtaText}>
            <Text style={styles.helpCtaTitle}>Need help with something?</Text>
            <Text style={styles.helpCtaSubtitle}>
              Take a photo and ask the team
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color="#9CA3AF" />
        </Pressable>

        {/* Body */}
        <View style={styles.bodyCard}>
          <TextInput
            style={styles.bodyInput}
            placeholder="What's on your mind? Share a tip, ask a question, celebrate a win..."
            placeholderTextColor="#9CA3AF"
            multiline
            textAlignVertical="top"
            value={body}
            onChangeText={setBody}
            maxLength={2000}
          />
          <Text style={styles.charCount}>
            {body.length}/2000
          </Text>
        </View>

        {/* Tags */}
        <View style={styles.tagSection}>
          <Text style={styles.sectionLabel}>Tags (optional)</Text>
          <View style={styles.tagInputRow}>
            <TextInput
              style={styles.tagInput}
              placeholder="Add a tag..."
              placeholderTextColor="#9CA3AF"
              value={tagInput}
              onChangeText={setTagInput}
              onSubmitEditing={addTag}
              returnKeyType="done"
              autoCapitalize="none"
              maxLength={24}
            />
            <Pressable
              style={[
                styles.addTagBtn,
                !tagInput.trim() && styles.addTagBtnDisabled,
              ]}
              onPress={addTag}
              disabled={!tagInput.trim()}
            >
              <MaterialIcons name="add" size={18} color="#fff" />
            </Pressable>
          </View>
          {tags.length > 0 && (
            <View style={styles.tagsDisplay}>
              {tags.map((tag) => (
                <View key={tag} style={styles.tagChip}>
                  <Text style={styles.tagChipText}>#{tag}</Text>
                  <Pressable onPress={() => removeTag(tag)} hitSlop={8}>
                    <MaterialIcons name="close" size={14} color="#3B82F6" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Media placeholder */}
        {postType !== "text" && (
          <View style={styles.mediaPlaceholder}>
            <MaterialIcons
              name={postType === "photo" ? "add-a-photo" : "video-call"}
              size={36}
              color="#9CA3AF"
            />
            <Text style={styles.mediaPlaceholderText}>
              {postType === "photo" ? "Add photos" : "Add video"}
            </Text>
            <Text style={styles.mediaPlaceholderSubtext}>
              Media upload will be available when the backend is ready
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          {createPost.isPending ? (
            <Text style={styles.submitBtnText}>Posting...</Text>
          ) : (
            <>
              <MaterialIcons name="send" size={18} color="#fff" />
              <Text style={styles.submitBtnText}>Post to Signal</Text>
            </>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16, paddingBottom: 32 },
  typeRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  typePillActive: { backgroundColor: "#3B82F6", borderColor: "#3B82F6" },
  typePillText: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  typePillTextActive: { color: "#fff" },
  helpCta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  helpCtaText: { flex: 1 },
  helpCtaTitle: { fontSize: 14, fontWeight: "700", color: "#991B1B" },
  helpCtaSubtitle: { fontSize: 12, color: "#B91C1C", marginTop: 1 },
  bodyCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    minHeight: 180,
  },
  bodyInput: { fontSize: 15, color: "#111827", lineHeight: 22, minHeight: 140 },
  charCount: { fontSize: 11, color: "#9CA3AF", textAlign: "right", marginTop: 8 },
  tagSection: { marginBottom: 16 },
  sectionLabel: { fontSize: 13, fontWeight: "600", color: "#6B7280", marginBottom: 8 },
  tagInputRow: { flexDirection: "row", gap: 8 },
  tagInput: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 40,
    fontSize: 14,
    color: "#111827",
  },
  addTagBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },
  addTagBtnDisabled: { backgroundColor: "#D1D5DB" },
  tagsDisplay: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  tagChipText: { fontSize: 13, color: "#3B82F6", fontWeight: "500" },
  mediaPlaceholder: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 32,
    alignItems: "center",
    gap: 8,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
  },
  mediaPlaceholderText: { fontSize: 15, fontWeight: "600", color: "#6B7280" },
  mediaPlaceholderSubtext: { fontSize: 12, color: "#9CA3AF", textAlign: "center" },
  footer: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#3B82F6",
    borderRadius: 12,
    paddingVertical: 14,
  },
  submitBtnDisabled: { backgroundColor: "#93C5FD" },
  submitBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
