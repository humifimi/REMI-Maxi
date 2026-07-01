import { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
} from "react-native";
import { Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useVideoSubmissions, useSubmitVideo } from "@technician/hooks/training/use-university";
import { SkeletonDetailScreen } from "@/src/components/shared/skeleton";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type { VideoSubmission } from "@technician/types/api";

const STATUS_CONFIG: Record<
  string,
  { color: string; bg: string; icon: keyof typeof MaterialIcons.glyphMap; label: string }
> = {
  pending: { color: "#EAB308", bg: "#FEF9C3", icon: "hourglass-top", label: "Pending Review" },
  approved: { color: "#22C55E", bg: "#F0FDF4", icon: "check-circle", label: "Approved" },
  redo: { color: "#EF4444", bg: "#FEE2E2", icon: "replay", label: "Redo Requested" },
};

export default function VideoUploadScreen() {
  const { data: submissions, isLoading } = useVideoSubmissions();
  const submitVideo = useSubmitVideo();
  const [showForm, setShowForm] = useState(false);
  const [moduleId, setModuleId] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

  if (isLoading) return <SkeletonDetailScreen />;

  const handleSubmit = async () => {
    const mid = parseInt(moduleId, 10);
    if (isNaN(mid) || !videoUrl.trim()) {
      Alert.alert("Missing Info", "Please enter both module ID and video URL.");
      return;
    }

    try {
      haptic.medium();
      await submitVideo.mutateAsync({ module_id: mid, video_url: videoUrl.trim() });
      haptic.success();
      setShowForm(false);
      setModuleId("");
      setVideoUrl("");
    } catch {
      haptic.error();
      Alert.alert("Error", "Could not submit video. Try again.");
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Video Submissions" }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Pressable
          style={styles.uploadBtn}
          onPress={() => {
            haptic.light();
            setShowForm(!showForm);
          }}
        >
          <MaterialIcons
            name={showForm ? "close" : "videocam"}
            size={20}
            color="#fff"
          />
          <Text style={styles.uploadBtnText}>
            {showForm ? "Cancel" : "New Submission"}
          </Text>
        </Pressable>

        {showForm && (
          <View style={styles.formCard}>
            <Text style={styles.formLabel}>Module ID</Text>
            <TextInput
              style={styles.formInput}
              value={moduleId}
              onChangeText={setModuleId}
              keyboardType="number-pad"
              placeholder="e.g. 12"
              placeholderTextColor="#9CA3AF"
            />
            <Text style={styles.formLabel}>Video URL</Text>
            <TextInput
              style={styles.formInput}
              value={videoUrl}
              onChangeText={setVideoUrl}
              placeholder="https://..."
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              keyboardType="url"
            />
            <Pressable
              style={[styles.submitFormBtn, submitVideo.isPending && styles.disabled]}
              onPress={handleSubmit}
              disabled={submitVideo.isPending}
            >
              <Text style={styles.submitFormText}>
                {submitVideo.isPending ? "Submitting..." : "Submit Video"}
              </Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.sectionTitle}>Previous Submissions</Text>

        {(!submissions || submissions.length === 0) && (
          <View style={styles.empty}>
            <MaterialIcons name="videocam-off" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>No video submissions yet</Text>
          </View>
        )}

        {submissions?.map((sub) => (
          <SubmissionCard key={sub.id} submission={sub} />
        ))}
      </ScrollView>
    </>
  );
}

function SubmissionCard({ submission }: { submission: VideoSubmission }) {
  const cfg = STATUS_CONFIG[submission.status] ?? STATUS_CONFIG.pending;

  return (
    <View style={[styles.subCard, { borderLeftColor: cfg.color }]}>
      <View style={styles.subHeader}>
        <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
          <MaterialIcons name={cfg.icon} size={14} color={cfg.color} />
          <Text style={[styles.statusText, { color: cfg.color }]}>
            {cfg.label}
          </Text>
        </View>
        <Text style={styles.subDate}>
          {new Date(submission.created_at).toLocaleDateString()}
        </Text>
      </View>
      <Text style={styles.subModule}>Module #{submission.module_id}</Text>
      {submission.notes && (
        <Text style={styles.subNotes}>{submission.notes}</Text>
      )}
      {submission.reviewed_at && (
        <Text style={styles.subReviewed}>
          Reviewed{" "}
          {new Date(submission.reviewed_at).toLocaleDateString()}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16, paddingBottom: 40 },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#3B82F6",
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 16,
  },
  uploadBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  formCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  formLabel: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6, marginTop: 10 },
  formInput: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: "#1F2937",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  submitFormBtn: {
    backgroundColor: "#22C55E",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  disabled: { opacity: 0.6 },
  submitFormText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  empty: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 15, color: "#9CA3AF" },
  subCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderLeftWidth: 4,
  },
  subHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusText: { fontSize: 12, fontWeight: "700" },
  subDate: { fontSize: 12, color: "#9CA3AF" },
  subModule: { fontSize: 14, fontWeight: "600", color: "#1F2937" },
  subNotes: { fontSize: 13, color: "#6B7280", marginTop: 4 },
  subReviewed: { fontSize: 12, color: "#9CA3AF", marginTop: 4 },
});
