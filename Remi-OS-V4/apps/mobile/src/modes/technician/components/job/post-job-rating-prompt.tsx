import { useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { RatingTag } from "@technician/types/api";

const ratingSchema = z.object({
  stars: z.number().min(1).max(5),
  tags: z.array(z.string()),
});

type RatingFormValues = z.infer<typeof ratingSchema>;

const TAG_OPTIONS: { key: RatingTag; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { key: RatingTag.FRIENDLY, label: "Friendly", icon: "sentiment-very-satisfied" },
  { key: RatingTag.PREPARED, label: "Prepared", icon: "check-circle" },
  { key: RatingTag.TIDY_WORKSPACE, label: "Tidy", icon: "cleaning-services" },
  { key: RatingTag.LATE, label: "Late", icon: "schedule" },
  { key: RatingTag.DIFFICULT_ACCESS, label: "Hard Access", icon: "wrong-location" },
  { key: RatingTag.NO_SHOW, label: "No-Show", icon: "person-off" },
];

const STAR_COLOR_ACTIVE = "#F59E0B";
const STAR_COLOR_INACTIVE = "#D1D5DB";

interface PostJobRatingPromptProps {
  visible: boolean;
  customerName: string;
  onSubmit: (values: { stars: number; tags: RatingTag[] }) => void;
  onDismiss: () => void;
}

export function PostJobRatingPrompt({
  visible,
  customerName,
  onSubmit,
  onDismiss,
}: PostJobRatingPromptProps) {
  const [showNudge, setShowNudge] = useState(false);
  const scaleAnims = useRef([1, 2, 3, 4, 5].map(() => new Animated.Value(1))).current;

  const { control, handleSubmit, watch, setValue } = useForm<RatingFormValues>({
    resolver: zodResolver(ratingSchema),
    defaultValues: { stars: 0, tags: [] },
  });

  const selectedStars = watch("stars");
  const selectedTags = watch("tags");

  const animateStar = (index: number) => {
    Animated.sequence([
      Animated.timing(scaleAnims[index], {
        toValue: 1.35,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnims[index], {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleStarPress = (star: number) => {
    haptic.light();
    setValue("stars", star);
    animateStar(star - 1);
  };

  const toggleTag = (tag: RatingTag) => {
    haptic.selection();
    const current = selectedTags;
    if (current.includes(tag)) {
      setValue(
        "tags",
        current.filter((t) => t !== tag)
      );
    } else {
      setValue("tags", [...current, tag]);
    }
  };

  const onValid = (data: RatingFormValues) => {
    haptic.success();
    onSubmit({ stars: data.stars, tags: data.tags as RatingTag[] });
  };

  const handleDismissAttempt = () => {
    if (!showNudge) {
      setShowNudge(true);
      haptic.warning();
      return;
    }
    onDismiss();
  };

  const firstName = customerName.split(" ")[0] || "the customer";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <Text style={styles.title}>How was {firstName}?</Text>
          <Text style={styles.subtitle}>Quick rating helps improve routing</Text>

          <Controller
            control={control}
            name="stars"
            render={() => (
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable
                    key={star}
                    onPress={() => handleStarPress(star)}
                    hitSlop={8}
                    style={styles.starHit}
                  >
                    <Animated.View style={{ transform: [{ scale: scaleAnims[star - 1] }] }}>
                      <MaterialIcons
                        name={star <= selectedStars ? "star" : "star-outline"}
                        size={48}
                        color={star <= selectedStars ? STAR_COLOR_ACTIVE : STAR_COLOR_INACTIVE}
                      />
                    </Animated.View>
                  </Pressable>
                ))}
              </View>
            )}
          />

          {selectedStars > 0 && (
            <>
              <Text style={styles.tagsLabel}>Quick tags (optional)</Text>
              <View style={styles.tagsGrid}>
                {TAG_OPTIONS.map((tag) => {
                  const isSelected = selectedTags.includes(tag.key);
                  return (
                    <Pressable
                      key={tag.key}
                      style={[styles.tagChip, isSelected && styles.tagChipSelected]}
                      onPress={() => toggleTag(tag.key)}
                    >
                      <MaterialIcons
                        name={tag.icon}
                        size={16}
                        color={isSelected ? "#3B82F6" : "#6B7280"}
                      />
                      <Text style={[styles.tagText, isSelected && styles.tagTextSelected]}>
                        {tag.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          <Pressable
            style={[styles.submitBtn, selectedStars === 0 && styles.submitBtnDisabled]}
            onPress={handleSubmit(onValid)}
            disabled={selectedStars === 0}
          >
            <Text style={styles.submitBtnText}>Submit Rating</Text>
          </Pressable>

          {showNudge && (
            <Text style={styles.nudgeText}>
              Ratings take 5 seconds and help everyone. Sure you want to skip?
            </Text>
          )}

          <Pressable style={styles.skipBtn} onPress={handleDismissAttempt}>
            <Text style={styles.skipBtnText}>
              {showNudge ? "Skip Anyway" : "Skip"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    alignItems: "center",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 24,
  },
  starsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 24,
  },
  starHit: {
    padding: 4,
  },
  tagsLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  tagsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
    marginBottom: 28,
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  tagChipSelected: {
    borderColor: "#3B82F6",
    backgroundColor: "#EFF6FF",
  },
  tagText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  tagTextSelected: {
    color: "#3B82F6",
  },
  submitBtn: {
    backgroundColor: "#3B82F6",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    width: "100%",
    marginBottom: 8,
  },
  submitBtnDisabled: {
    backgroundColor: "#D1D5DB",
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  nudgeText: {
    fontSize: 13,
    color: "#F59E0B",
    textAlign: "center",
    marginBottom: 4,
    marginTop: 4,
  },
  skipBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  skipBtnText: {
    fontSize: 15,
    color: "#9CA3AF",
    fontWeight: "600",
  },
});
