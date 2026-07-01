import { useState, useEffect, useCallback, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  useWellnessCheckIn,
  useWellnessStreak,
} from "@technician/hooks/utility/use-wellness";
import {
  MOOD_EMOJI,
  MOOD_LABEL,
  type WellnessMood,
  type AiResponseCard,
} from "@technician/types/wellness";
import { WellnessMoodColors } from "@technician/constants/colors";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { CheckInResult } from "@technician/components/wellness/check-in-result";

const WELLNESS_LAST_CHECKIN_KEY = "wellness_last_checkin_date";

interface WellnessCheckInModalProps {
  enabled: boolean;
}

export function WellnessCheckInModal({ enabled }: WellnessCheckInModalProps) {
  const [visible, setVisible] = useState(false);
  const [selectedMood, setSelectedMood] = useState<WellnessMood | null>(null);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [aiResponse, setAiResponse] = useState<AiResponseCard | null>(null);
  const [resultStreak, setResultStreak] = useState(0);

  const checkinMutation = useWellnessCheckIn();
  const streakQuery = useWellnessStreak();
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const streak = streakQuery.data?.current_streak ?? 0;

  useEffect(() => {
    if (!enabled) return;

    AsyncStorage.getItem(WELLNESS_LAST_CHECKIN_KEY).then((lastDate) => {
      const today = new Date().toISOString().split("T")[0];
      if (lastDate !== today) {
        const timer = setTimeout(() => setVisible(true), 1500);
        return () => clearTimeout(timer);
      }
    });
  }, [enabled]);

  const handleSelectMood = (mood: WellnessMood) => {
    haptic.light();
    setSelectedMood(mood);
  };

  const handleSubmit = useCallback(async () => {
    if (!selectedMood) return;
    haptic.medium();

    const today = new Date().toISOString().split("T")[0];
    await AsyncStorage.setItem(WELLNESS_LAST_CHECKIN_KEY, today);

    setSubmitted(true);

    try {
      // Single round-trip per `wellness-ai-and-walk-in-contract.md` § 2.
      // The check-in response embeds `ai_response` (or null on AI failure).
      const result = await checkinMutation.mutateAsync({
        mood: selectedMood,
        note: note.trim() || undefined,
      });
      setAiResponse(result.ai_response);
      setResultStreak(result.streak);
    } catch {
      setAiResponse(null);
      setResultStreak(streak + 1);
    }
  }, [selectedMood, note, checkinMutation, streak]);

  const handleResultDismiss = useCallback(() => {
    setVisible(false);
    setSubmitted(false);
    setSelectedMood(null);
    setNote("");
    setAiResponse(null);
    setResultStreak(0);
  }, []);

  const handleDismiss = () => {
    haptic.light();
    const today = new Date().toISOString().split("T")[0];
    AsyncStorage.setItem(WELLNESS_LAST_CHECKIN_KEY, today);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    handleResultDismiss();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleDismiss}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdrop} onPress={handleDismiss} />

        <View style={styles.sheet}>
          {submitted ? (
            <CheckInResult
              mood={selectedMood!}
              streak={resultStreak || streak + 1}
              aiResponse={aiResponse}
              isLoadingAi={checkinMutation.isPending}
              onDismiss={handleResultDismiss}
            />
          ) : (
            <>
              <View style={styles.header}>
                <Text style={styles.greeting}>Good morning!</Text>
                <Pressable
                  style={styles.closeBtn}
                  onPress={handleDismiss}
                  hitSlop={12}
                >
                  <MaterialIcons name="close" size={22} color="#9CA3AF" />
                </Pressable>
              </View>

              <Text style={styles.title}>How are you feeling today?</Text>

              {streak > 0 && (
                <View style={styles.streakRow}>
                  <MaterialIcons
                    name="local-fire-department"
                    size={16}
                    color="#F97316"
                  />
                  <Text style={styles.streakRowText}>
                    {streak} day streak — keep it going!
                  </Text>
                </View>
              )}

              <View style={styles.moodRow}>
                {([5, 4, 3, 2, 1] as WellnessMood[]).map((mood) => {
                  const active = selectedMood === mood;
                  return (
                    <Pressable
                      key={mood}
                      style={[
                        styles.moodBtn,
                        active && {
                          backgroundColor: WellnessMoodColors[mood] + "18",
                          borderColor: WellnessMoodColors[mood],
                        },
                      ]}
                      onPress={() => handleSelectMood(mood)}
                    >
                      <Text style={styles.moodEmoji}>{MOOD_EMOJI[mood]}</Text>
                      <Text
                        style={[
                          styles.moodLabel,
                          active && { color: WellnessMoodColors[mood] },
                        ]}
                      >
                        {MOOD_LABEL[mood]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {selectedMood && (
                <View style={styles.noteSection}>
                  <TextInput
                    style={styles.noteInput}
                    placeholder="Add a note (optional)..."
                    placeholderTextColor="#9CA3AF"
                    value={note}
                    onChangeText={setNote}
                    multiline
                    maxLength={200}
                  />
                </View>
              )}

              <View style={styles.actions}>
                <Pressable
                  style={[
                    styles.submitBtn,
                    !selectedMood && styles.submitBtnDisabled,
                  ]}
                  onPress={handleSubmit}
                  disabled={!selectedMood || checkinMutation.isPending}
                >
                  <Text style={styles.submitBtnText}>
                    {checkinMutation.isPending ? "Saving..." : "Check In"}
                  </Text>
                </Pressable>
                <Pressable style={styles.skipBtn} onPress={handleDismiss}>
                  <Text style={styles.skipBtnText}>Skip for today</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: "80%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  greeting: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
  },
  closeBtn: {
    padding: 4,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 12,
  },
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFF7ED",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignSelf: "flex-start",
    marginBottom: 20,
  },
  streakRowText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9A3412",
  },
  moodRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 16,
  },
  moodBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    gap: 4,
  },
  moodEmoji: {
    fontSize: 28,
  },
  moodLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
  },
  noteSection: {
    marginBottom: 16,
  },
  noteInput: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: "#111827",
    minHeight: 60,
    maxHeight: 100,
    textAlignVertical: "top",
  },
  actions: {
    gap: 10,
  },
  submitBtn: {
    backgroundColor: "#3B82F6",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  submitBtnDisabled: {
    backgroundColor: "#93C5FD",
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  skipBtn: {
    paddingVertical: 10,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  skipBtnText: {
    fontSize: 14,
    color: "#9CA3AF",
    fontWeight: "500",
  },
});
