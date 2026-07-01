import { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  Linking,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLessons, useQuiz, useSubmitQuiz } from "@technician/hooks/training/use-university";
import { useCompleteModule } from "@technician/hooks/training/use-training";
import { SkeletonDetailScreen } from "@/src/components/shared/skeleton";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type { Quiz, QuizQuestion } from "@technician/types/api";

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const moduleId = parseInt(id, 10);
  const router = useRouter();
  const { data: lessons = [], isLoading: lessonsLoading } = useLessons(moduleId);
  const { data: quiz, isLoading: quizLoading } = useQuiz(moduleId);
  const completeModule = useCompleteModule();

  if (lessonsLoading || quizLoading) return <SkeletonDetailScreen />;

  return (
    <>
      <Stack.Screen options={{ title: "Lesson" }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {lessons.length === 0 && !quiz && (
          <View style={styles.empty}>
            <MaterialIcons name="play-lesson" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>No content available yet</Text>
          </View>
        )}

        {lessons.map((lesson) => {
          const iconName: keyof typeof MaterialIcons.glyphMap =
            lesson.lesson_type === "video"
              ? "play-circle-fill"
              : lesson.lesson_type === "diagram"
                ? "image"
                : "description";

          return (
            <Pressable
              key={lesson.id}
              style={styles.lessonCard}
              onPress={() => {
                haptic.light();
                if (lesson.content_url) {
                  Linking.openURL(lesson.content_url);
                }
              }}
            >
              <MaterialIcons name={iconName} size={28} color="#3B82F6" />
              <View style={{ flex: 1 }}>
                <Text style={styles.lessonTitle}>{lesson.title}</Text>
                <Text style={styles.lessonType}>
                  {lesson.lesson_type.toUpperCase()}
                </Text>
              </View>
              <MaterialIcons name="open-in-new" size={18} color="#9CA3AF" />
            </Pressable>
          );
        })}

        {quiz && <QuizSection quiz={quiz} />}

        {!quiz && lessons.length > 0 && (
          <Pressable
            style={styles.completeBtn}
            onPress={() => {
              haptic.success();
              completeModule.mutate(
                { moduleId },
                {
                  onSuccess: () => router.back(),
                  onError: () =>
                    Alert.alert("Error", "Could not mark module as complete."),
                },
              );
            }}
          >
            <MaterialIcons name="check-circle" size={20} color="#fff" />
            <Text style={styles.completeBtnText}>Mark Module Complete</Text>
          </Pressable>
        )}
      </ScrollView>
    </>
  );
}

function QuizSection({ quiz }: { quiz: Quiz }) {
  const router = useRouter();
  const submitQuiz = useSubmitQuiz(quiz.id);
  const completeModule = useCompleteModule();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [passed, setPassed] = useState(false);

  const questions = quiz.questions ?? [];
  const allAnswered = questions.length > 0 && Object.keys(answers).length === questions.length;

  const handleSubmit = async () => {
    try {
      haptic.medium();
      const result = await submitQuiz.mutateAsync(answers);
      setScore(result.score);
      setPassed(result.passed);
      setSubmitted(true);
      if (result.passed) {
        haptic.success();
        completeModule.mutate({ moduleId: quiz.module_id });
      } else {
        haptic.warning();
      }
    } catch {
      haptic.error();
      Alert.alert("Error", "Could not submit quiz.");
    }
  };

  return (
    <View style={styles.quizSection}>
      <Text style={styles.quizTitle}>Module Quiz</Text>

      {questions.map((q, qi) => (
        <View key={q.id} style={styles.questionCard}>
          <Text style={styles.questionText}>
            {qi + 1}. {q.text}
          </Text>
          {q.options.map((opt, oi) => {
            const selected = answers[q.id] === oi;
            const isCorrect = submitted && q.correct_index === oi;
            const isWrong = submitted && selected && !isCorrect;

            return (
              <Pressable
                key={oi}
                style={[
                  styles.optionBtn,
                  selected && !submitted && styles.optionSelected,
                  isCorrect && styles.optionCorrect,
                  isWrong && styles.optionWrong,
                ]}
                onPress={() => {
                  if (submitted) return;
                  haptic.selection();
                  setAnswers((prev) => ({ ...prev, [q.id]: oi }));
                }}
                disabled={submitted}
              >
                <Text
                  style={[
                    styles.optionText,
                    selected && !submitted && styles.optionTextSelected,
                    isCorrect && styles.optionTextCorrect,
                    isWrong && styles.optionTextWrong,
                  ]}
                >
                  {opt}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}

      {!submitted && (
        <Pressable
          style={[styles.submitQuizBtn, !allAnswered && styles.disabled]}
          onPress={handleSubmit}
          disabled={!allAnswered || submitQuiz.isPending}
        >
          <Text style={styles.submitQuizText}>
            {submitQuiz.isPending ? "Submitting..." : "Submit Quiz"}
          </Text>
        </Pressable>
      )}

      {submitted && (
        <View
          style={[
            styles.resultCard,
            passed ? styles.resultPass : styles.resultFail,
          ]}
        >
          <MaterialIcons
            name={passed ? "celebration" : "replay"}
            size={24}
            color={passed ? "#22C55E" : "#EF4444"}
          />
          <View>
            <Text
              style={[
                styles.resultTitle,
                { color: passed ? "#166534" : "#991B1B" },
              ]}
            >
              {passed ? "Passed!" : "Not quite"}
            </Text>
            <Text style={styles.resultScore}>
              Score: {score}%
              {!passed && " — Review the material and try again"}
            </Text>
          </View>
        </View>
      )}

      {submitted && passed && (
        <Pressable
          style={styles.doneBtn}
          onPress={() => {
            haptic.success();
            router.back();
          }}
        >
          <Text style={styles.doneBtnText}>Done</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16, paddingBottom: 40 },
  empty: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 15, color: "#9CA3AF" },
  lessonCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  lessonTitle: { fontSize: 15, fontWeight: "600", color: "#1F2937" },
  lessonType: { fontSize: 11, fontWeight: "700", color: "#9CA3AF", marginTop: 2 },
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#22C55E",
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 16,
  },
  completeBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  quizSection: { marginTop: 16 },
  quizTitle: { fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 12 },
  questionCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  questionText: { fontSize: 15, fontWeight: "600", color: "#1F2937", marginBottom: 10 },
  optionBtn: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  optionSelected: { borderColor: "#3B82F6", backgroundColor: "#EFF6FF" },
  optionCorrect: { borderColor: "#22C55E", backgroundColor: "#F0FDF4" },
  optionWrong: { borderColor: "#EF4444", backgroundColor: "#FEE2E2" },
  optionText: { fontSize: 14, color: "#374151" },
  optionTextSelected: { color: "#1D4ED8", fontWeight: "600" },
  optionTextCorrect: { color: "#166534", fontWeight: "600" },
  optionTextWrong: { color: "#991B1B", fontWeight: "600" },
  submitQuizBtn: {
    backgroundColor: "#3B82F6",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  disabled: { opacity: 0.6 },
  submitQuizText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  resultCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
  },
  resultPass: { backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#BBF7D0" },
  resultFail: { backgroundColor: "#FEE2E2", borderWidth: 1, borderColor: "#FECACA" },
  resultTitle: { fontSize: 16, fontWeight: "700" },
  resultScore: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  doneBtn: {
    backgroundColor: "#22C55E",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 12,
  },
  doneBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
