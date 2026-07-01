import { useState, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCreatePost } from "@technician/hooks/ai/use-signal";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type { HelpRequestCategory } from "@technician/types/signal";

const CATEGORIES: { key: HelpRequestCategory; label: string; icon: string }[] =
  [
    { key: "mechanical", label: "Mechanical", icon: "build" },
    { key: "electrical", label: "Electrical", icon: "flash-on" },
    { key: "fluid", label: "Fluid / Oil", icon: "water-drop" },
    { key: "diagnostic", label: "Diagnostic", icon: "search" },
    { key: "bodywork", label: "Bodywork", icon: "car-repair" },
    { key: "other", label: "Other", icon: "help-outline" },
  ];

type Step = "photo" | "describe" | "category" | "review";
const STEP_ORDER: Step[] = ["photo", "describe", "category", "review"];

export default function HelpRequestScreen() {
  const router = useRouter();
  const createPost = useCreatePost();
  const descriptionRef = useRef<TextInput>(null);

  const [step, setStep] = useState<Step>("photo");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<HelpRequestCategory | null>(null);

  const handleTakePhoto = () => {
    haptic.medium();
    // TODO: Replace with expo-image-picker when media upload is ready
    setPhotoUri("https://placehold.co/600x400/F3F4F6/6B7280?text=Photo+Captured");
    setStep("describe");
  };

  const handleSkipPhoto = () => {
    haptic.light();
    setStep("describe");
  };

  const handleDescriptionNext = () => {
    if (description.trim().length === 0) return;
    haptic.light();
    setStep("category");
  };

  const handleCategorySelect = (cat: HelpRequestCategory) => {
    haptic.light();
    setCategory(cat);
    setStep("review");
  };

  const handleSubmit = async () => {
    if (!description.trim() || !category) return;
    haptic.medium();

    try {
      await createPost.mutateAsync({
        type: "help_request",
        body: description.trim(),
        media_urls: photoUri ? [photoUri] : undefined,
        help_category: category,
        tags: ["help", category],
      });
      router.dismiss(2);
    } catch {
      Alert.alert("Error", "Could not submit help request. Please try again.");
    }
  };

  const handleBack = () => {
    const currentIdx = STEP_ORDER.indexOf(step);
    if (currentIdx <= 0) {
      router.back();
    } else {
      setStep(STEP_ORDER[currentIdx - 1]);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={100}
    >
      <View style={styles.progressBar}>
        {STEP_ORDER.map((s, i) => (
          <View
            key={s}
            style={[
              styles.progressDot,
              STEP_ORDER.indexOf(step) >= i && styles.progressDotActive,
            ]}
          />
        ))}
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {step === "photo" && (
          <View style={styles.stepContainer}>
            <MaterialIcons name="photo-camera" size={48} color="#3B82F6" />
            <Text style={styles.stepTitle}>Take a Photo</Text>
            <Text style={styles.stepSubtitle}>
              Capture what you need help with so the team can see
            </Text>
            <Pressable style={styles.cameraBtn} onPress={handleTakePhoto}>
              <MaterialIcons name="camera-alt" size={28} color="#fff" />
              <Text style={styles.cameraBtnText}>Open Camera</Text>
            </Pressable>
            <Pressable style={styles.skipBtn} onPress={handleSkipPhoto}>
              <Text style={styles.skipBtnText}>Skip — describe without photo</Text>
            </Pressable>
          </View>
        )}

        {step === "describe" && (
          <View style={styles.stepContainer}>
            {photoUri && (
              <View style={styles.photoPreview}>
                <Image source={{ uri: photoUri }} style={styles.previewImg} />
                <Pressable
                  style={styles.retakeBtn}
                  onPress={() => setStep("photo")}
                >
                  <MaterialIcons name="refresh" size={16} color="#fff" />
                  <Text style={styles.retakeBtnText}>Retake</Text>
                </Pressable>
              </View>
            )}
            <Text style={styles.stepTitle}>Describe the Problem</Text>
            <Text style={styles.stepSubtitle}>
              Be specific — include vehicle make/model if relevant
            </Text>
            <View style={styles.inputCard}>
              <TextInput
                ref={descriptionRef}
                style={styles.descInput}
                placeholder="What do you need help with?"
                placeholderTextColor="#9CA3AF"
                multiline
                textAlignVertical="top"
                value={description}
                onChangeText={setDescription}
                maxLength={1000}
                autoFocus
              />
            </View>
            <Pressable
              style={[
                styles.nextBtn,
                !description.trim() && styles.nextBtnDisabled,
              ]}
              onPress={handleDescriptionNext}
              disabled={!description.trim()}
            >
              <Text style={styles.nextBtnText}>Next</Text>
              <MaterialIcons name="arrow-forward" size={18} color="#fff" />
            </Pressable>
          </View>
        )}

        {step === "category" && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Select Category</Text>
            <Text style={styles.stepSubtitle}>
              This helps route your request to the right expert
            </Text>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat.key}
                  style={[
                    styles.categoryCard,
                    category === cat.key && styles.categoryCardActive,
                  ]}
                  onPress={() => handleCategorySelect(cat.key)}
                >
                  <MaterialIcons
                    name={cat.icon as any}
                    size={28}
                    color={category === cat.key ? "#3B82F6" : "#6B7280"}
                  />
                  <Text
                    style={[
                      styles.categoryLabel,
                      category === cat.key && styles.categoryLabelActive,
                    ]}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {step === "review" && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Review & Submit</Text>
            <View style={styles.reviewCard}>
              {photoUri && (
                <Image source={{ uri: photoUri }} style={styles.reviewImg} />
              )}
              <View style={styles.reviewBadge}>
                <MaterialIcons name="warning" size={14} color="#EF4444" />
                <Text style={styles.reviewBadgeText}>Help Request</Text>
              </View>
              <Text style={styles.reviewCategory}>
                {CATEGORIES.find((c) => c.key === category)?.label}
              </Text>
              <Text style={styles.reviewBody}>{description}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.backBtn} onPress={handleBack}>
          <MaterialIcons name="arrow-back" size={20} color="#6B7280" />
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
        {step === "review" && (
          <Pressable
            style={[
              styles.submitBtn,
              createPost.isPending && styles.submitBtnDisabled,
            ]}
            onPress={handleSubmit}
            disabled={createPost.isPending}
          >
            <MaterialIcons name="send" size={18} color="#fff" />
            <Text style={styles.submitBtnText}>
              {createPost.isPending ? "Submitting..." : "Submit Help Request"}
            </Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16, paddingBottom: 32 },
  progressBar: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#E5E7EB" },
  progressDotActive: { backgroundColor: "#3B82F6", width: 24 },
  stepContainer: { alignItems: "center", paddingTop: 24, gap: 12 },
  stepTitle: { fontSize: 22, fontWeight: "800", color: "#111827", textAlign: "center" },
  stepSubtitle: { fontSize: 14, color: "#6B7280", textAlign: "center", maxWidth: 300, marginBottom: 16 },
  cameraBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#3B82F6",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    marginTop: 8,
  },
  cameraBtnText: { fontSize: 17, fontWeight: "700", color: "#fff" },
  skipBtn: { paddingVertical: 12 },
  skipBtnText: { fontSize: 14, color: "#6B7280", fontWeight: "500" },
  photoPreview: { width: "100%", borderRadius: 14, overflow: "hidden", marginBottom: 8 },
  previewImg: { width: "100%", height: 200, borderRadius: 14, backgroundColor: "#F3F4F6" },
  retakeBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  retakeBtnText: { fontSize: 12, color: "#fff", fontWeight: "600" },
  inputCard: { width: "100%", backgroundColor: "#fff", borderRadius: 14, padding: 16, minHeight: 140 },
  descInput: { fontSize: 15, color: "#111827", lineHeight: 22, minHeight: 100 },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#3B82F6",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 8,
  },
  nextBtnDisabled: { backgroundColor: "#93C5FD" },
  nextBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", width: "100%" },
  categoryCard: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    gap: 8,
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  categoryCardActive: { borderColor: "#3B82F6", backgroundColor: "#EFF6FF" },
  categoryLabel: { fontSize: 14, fontWeight: "600", color: "#6B7280" },
  categoryLabelActive: { color: "#3B82F6" },
  reviewCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    gap: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#EF4444",
  },
  reviewImg: { width: "100%", height: 180, borderRadius: 10, backgroundColor: "#F3F4F6" },
  reviewBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  reviewBadgeText: { fontSize: 12, fontWeight: "700", color: "#EF4444" },
  reviewCategory: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  reviewBody: { fontSize: 14, color: "#374151", lineHeight: 20 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    gap: 12,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 44,
    minHeight: 44,
  },
  backBtnText: { fontSize: 15, color: "#6B7280", fontWeight: "500" },
  submitBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#EF4444",
    paddingVertical: 14,
    borderRadius: 12,
  },
  submitBtnDisabled: { backgroundColor: "#FCA5A5" },
  submitBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
