import { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSubmitDebrief } from "@technician/hooks/jobs/use-voice-debrief";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type { ParsedCategory } from "@technician/types/api";

const CATEGORY_ICONS: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  pets: "pets",
  family_status: "family-restroom",
  work_situation: "work",
  relocation_status: "moving",
  personal_notes: "sticky-note-2",
  birthday: "cake",
};

function getCategoryLabel(field: string): string {
  const map: Record<string, string> = {
    pets: "Pets",
    family_status: "Family",
    work_situation: "Work",
    relocation_status: "Relocation",
    personal_notes: "Notes",
    birthday: "Birthday",
  };
  return map[field] ?? field;
}

export default function DebriefScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobId = parseInt(id, 10);
  const router = useRouter();
  const submitDebrief = useSubmitDebrief(jobId);

  const [mode, setMode] = useState<"idle" | "text">("idle");
  const [textInput, setTextInput] = useState("");
  const [parsedResult, setParsedResult] = useState<{
    categories: ParsedCategory[];
    unclassified: string[];
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleTextSubmit = async () => {
    if (!textInput.trim()) return;
    setIsSubmitting(true);
    try {
      haptic.medium();
      const result = await submitDebrief.mutateAsync({ text: textInput.trim() });
      setParsedResult({
        categories: result.parsed?.parsed_categories ?? [],
        unclassified: result.parsed?.unclassified ?? [],
      });
      haptic.success();
    } catch {
      haptic.error();
      Alert.alert("Error", "Could not process debrief. You can skip and continue.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    haptic.light();
    router.push(`/job/${id}/complete` as never);
  };

  const handleContinue = () => {
    haptic.success();
    router.push(`/job/${id}/complete` as never);
  };

  return (
    <>
      <Stack.Screen options={{ title: "Customer Debrief" }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <MaterialIcons name="record-voice-over" size={28} color="#8B5CF6" />
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>
              Any new information about this customer?
            </Text>
            <Text style={styles.headerSub}>
              Observations are AI-categorized into their profile
            </Text>
          </View>
        </View>

        {!parsedResult && mode === "idle" && (
          <View style={styles.inputOptions}>
            <Pressable
              style={styles.micBtn}
              onPress={() => {
                haptic.medium();
                setMode("text");
              }}
            >
              <View style={styles.micCircle}>
                <MaterialIcons name="mic" size={40} color="#fff" />
              </View>
              <Text style={styles.micLabel}>Tap to type observations</Text>
              <Text style={styles.micSub}>
                Voice recording requires a dev build
              </Text>
            </Pressable>
          </View>
        )}

        {!parsedResult && mode === "text" && (
          <View style={styles.textSection}>
            <TextInput
              style={styles.textArea}
              value={textInput}
              onChangeText={setTextInput}
              multiline
              placeholder={'e.g. "Customer has a new dog named Bob. Just had a baby. Planning to move next month."'}
              placeholderTextColor="#9CA3AF"
              autoFocus
              textAlignVertical="top"
            />
            <Pressable
              style={[styles.analyzeBtn, (!textInput.trim() || isSubmitting) && styles.disabled]}
              onPress={handleTextSubmit}
              disabled={!textInput.trim() || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <MaterialIcons name="auto-awesome" size={18} color="#fff" />
                  <Text style={styles.analyzeBtnText}>Analyze & Categorize</Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {parsedResult && (
          <View style={styles.resultsSection}>
            <Text style={styles.resultsTitle}>Parsed Results</Text>

            {(parsedResult.categories ?? []).map((cat, i) => (
              <View key={i} style={styles.categoryCard}>
                <View style={styles.categoryIcon}>
                  <MaterialIcons
                    name={CATEGORY_ICONS[cat.field] ?? "label"}
                    size={20}
                    color="#8B5CF6"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.categoryLabel}>
                    {getCategoryLabel(cat.field)}
                  </Text>
                  <Text style={styles.categoryValue}>{cat.value}</Text>
                </View>
                <View style={styles.confidenceBadge}>
                  <Text style={styles.confidenceText}>
                    {Math.round(cat.confidence * 100)}%
                  </Text>
                </View>
              </View>
            ))}

            {parsedResult.unclassified.length > 0 && (
              <View style={styles.unclassifiedCard}>
                <MaterialIcons name="help-outline" size={18} color="#F97316" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.unclassifiedTitle}>Unclassified</Text>
                  {parsedResult.unclassified.map((text, i) => (
                    <Text key={i} style={styles.unclassifiedText}>
                      {text}
                    </Text>
                  ))}
                  <Text style={styles.unclassifiedNote}>
                    Sent to admin for review
                  </Text>
                </View>
              </View>
            )}

            {parsedResult.categories.length === 0 &&
              parsedResult.unclassified.length === 0 && (
                <Text style={styles.noResults}>
                  No categories detected. The raw text has been saved.
                </Text>
              )}

            <Pressable style={styles.continueBtn} onPress={handleContinue}>
              <Text style={styles.continueBtnText}>Continue to Summary</Text>
            </Pressable>
          </View>
        )}

        <Pressable style={styles.skipBtn} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16, paddingBottom: 40 },
  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F5F3FF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#DDD6FE",
  },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#5B21B6" },
  headerSub: { fontSize: 12, color: "#7C3AED", marginTop: 2 },
  inputOptions: { alignItems: "center", paddingVertical: 20 },
  micBtn: { alignItems: "center", gap: 12 },
  micCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#8B5CF6",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  micLabel: { fontSize: 16, fontWeight: "700", color: "#374151" },
  micSub: { fontSize: 13, color: "#9CA3AF" },
  textSection: { gap: 12 },
  textArea: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    fontSize: 15,
    color: "#1F2937",
    minHeight: 120,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  analyzeBtn: {
    flexDirection: "row",
    backgroundColor: "#8B5CF6",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  disabled: { opacity: 0.6 },
  analyzeBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  resultsSection: { gap: 10 },
  resultsTitle: { fontSize: 17, fontWeight: "700", color: "#1F2937", marginBottom: 4 },
  categoryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  categoryIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F5F3FF",
    alignItems: "center",
    justifyContent: "center",
  },
  categoryLabel: { fontSize: 12, fontWeight: "600", color: "#6B7280" },
  categoryValue: { fontSize: 15, fontWeight: "600", color: "#1F2937", marginTop: 2 },
  confidenceBadge: {
    backgroundColor: "#F0FDF4",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  confidenceText: { fontSize: 12, fontWeight: "700", color: "#22C55E" },
  unclassifiedCard: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#FFF7ED",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  unclassifiedTitle: { fontSize: 13, fontWeight: "700", color: "#9A3412" },
  unclassifiedText: { fontSize: 14, color: "#92400E", marginTop: 2 },
  unclassifiedNote: {
    fontSize: 11,
    color: "#C2410C",
    fontStyle: "italic",
    marginTop: 4,
  },
  noResults: {
    textAlign: "center",
    color: "#9CA3AF",
    fontSize: 14,
    paddingVertical: 16,
  },
  continueBtn: {
    backgroundColor: "#22C55E",
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  continueBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  skipBtn: {
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 12,
  },
  skipText: { fontSize: 15, fontWeight: "600", color: "#9CA3AF" },
});
