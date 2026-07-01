import { useState, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  Dimensions,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useTrainingModule, useCompleteLesson, useSubmitAssessment } from "@technician/hooks/training/use-training-modules";
import { SkeletonDetailScreen } from "@/src/components/shared/skeleton";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type {
  LessonContent,
  AssessmentDetail,
  AssessmentQuestion,
  LessonContentType,
} from "@technician/types/api";

const CONTENT_TYPE_ICONS: Record<LessonContentType, keyof typeof MaterialIcons.glyphMap> = {
  video: "play-circle-fill",
  diagram: "image",
  sop: "description",
  assessment: "quiz",
};

const CONTENT_TYPE_COLORS: Record<LessonContentType, string> = {
  video: "#EF4444",
  diagram: "#8B5CF6",
  sop: "#3B82F6",
  assessment: "#F97316",
};

type ActiveView = "list" | "video" | "diagram" | "sop" | "assessment";

export default function ModuleScreen() {
  const { moduleId } = useLocalSearchParams<{ moduleId: string }>();
  const id = parseInt(moduleId, 10);
  const router = useRouter();
  const { data: mod, isLoading } = useTrainingModule(id);
  const completeLesson = useCompleteLesson();

  const [activeView, setActiveView] = useState<ActiveView>("list");
  const [activeLesson, setActiveLesson] = useState<LessonContent | null>(null);

  const openLesson = useCallback((lesson: LessonContent) => {
    haptic.light();
    setActiveLesson(lesson);
    if (lesson.content_type === "assessment") {
      setActiveView("assessment");
    } else {
      setActiveView(lesson.content_type);
    }
  }, []);

  const goBackToList = useCallback(() => {
    setActiveView("list");
    setActiveLesson(null);
  }, []);

  const markComplete = useCallback((lessonId: number) => {
    haptic.success();
    completeLesson.mutate(lessonId, {
      onError: () => Alert.alert("Error", "Could not mark lesson as complete."),
    });
  }, [completeLesson]);

  if (isLoading || !mod) return <SkeletonDetailScreen />;

  const resumeLesson = mod.last_position
    ? mod.lessons.find((l) => l.id === mod.last_position!.lesson_id)
    : mod.lessons.find((l) => !l.is_completed);

  return (
    <>
      <Stack.Screen
        options={{
          title: activeView === "list" ? mod.title : activeLesson?.title ?? "Lesson",
          headerLeft: () => (
            <Pressable
              onPress={() => {
                if (activeView !== "list") {
                  goBackToList();
                } else {
                  router.back();
                }
              }}
              hitSlop={12}
              style={{ padding: 8, marginLeft: -8 }}
            >
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />

      {activeView === "list" && (
        <ModuleOverview
          mod={mod}
          resumeLesson={resumeLesson ?? null}
          onOpenLesson={openLesson}
          onMarkComplete={markComplete}
        />
      )}

      {activeView === "video" && activeLesson && (
        <VideoViewer
          lesson={activeLesson}
          onComplete={() => markComplete(activeLesson.id)}
          onBack={goBackToList}
          isCompleted={activeLesson.is_completed}
        />
      )}

      {activeView === "diagram" && activeLesson && (
        <DiagramViewer
          lesson={activeLesson}
          onComplete={() => markComplete(activeLesson.id)}
          onBack={goBackToList}
          isCompleted={activeLesson.is_completed}
        />
      )}

      {activeView === "sop" && activeLesson && (
        <SOPViewer
          lesson={activeLesson}
          onComplete={() => markComplete(activeLesson.id)}
          onBack={goBackToList}
          isCompleted={activeLesson.is_completed}
        />
      )}

      {activeView === "assessment" && mod.assessment && (
        <AssessmentView
          assessment={mod.assessment}
          moduleId={mod.id}
          onBack={goBackToList}
        />
      )}
    </>
  );
}

// ── Module Overview ─────────────────────────────────────────────

function ModuleOverview({
  mod,
  resumeLesson,
  onOpenLesson,
  onMarkComplete,
}: {
  mod: NonNullable<ReturnType<typeof useTrainingModule>["data"]>;
  resumeLesson: LessonContent | null;
  onOpenLesson: (lesson: LessonContent) => void;
  onMarkComplete: (lessonId: number) => void;
}) {
  const progressPct = mod.lessons_total > 0
    ? (mod.lessons_completed / mod.lessons_total) * 100
    : 0;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.heroCard}>
        <View style={s.heroMeta}>
          <Text style={s.heroSchool}>{mod.school_name}</Text>
          <Text style={s.heroCourse}>{mod.course_name}</Text>
        </View>
        {mod.description && (
          <Text style={s.heroDesc}>{mod.description}</Text>
        )}
        <View style={s.heroStats}>
          {mod.duration_minutes != null && (
            <View style={s.heroStat}>
              <MaterialIcons name="schedule" size={14} color="#9CA3AF" />
              <Text style={s.heroStatText}>{mod.duration_minutes} min</Text>
            </View>
          )}
          <View style={s.heroStat}>
            <MaterialIcons name="star" size={14} color="#FCD34D" />
            <Text style={s.heroStatText}>{mod.xp_reward} XP</Text>
          </View>
          {mod.is_mandatory && (
            <View style={[s.heroStat, s.mandatoryPill]}>
              <Text style={s.mandatoryText}>MANDATORY</Text>
            </View>
          )}
        </View>
        <View style={s.progressRow}>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${progressPct}%` }]} />
          </View>
          <Text style={s.progressLabel}>
            {mod.lessons_completed}/{mod.lessons_total} lessons
          </Text>
        </View>
      </View>

      {resumeLesson && !resumeLesson.is_completed && (
        <Pressable
          style={s.resumeBtn}
          onPress={() => onOpenLesson(resumeLesson)}
        >
          <MaterialIcons name="play-arrow" size={22} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={s.resumeBtnLabel}>Resume where you left off</Text>
            <Text style={s.resumeBtnTitle}>{resumeLesson.title}</Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.6)" />
        </Pressable>
      )}

      <Text style={s.sectionTitle}>Lessons</Text>
      {mod.lessons.map((lesson, idx) => (
        <LessonRow
          key={lesson.id}
          lesson={lesson}
          index={idx}
          onPress={() => onOpenLesson(lesson)}
        />
      ))}

      {mod.due_date && (
        <View style={s.dueRow}>
          <MaterialIcons name="event" size={16} color="#6B7280" />
          <Text style={s.dueText}>
            Due{" "}
            {new Date(mod.due_date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function LessonRow({
  lesson,
  index,
  onPress,
}: {
  lesson: LessonContent;
  index: number;
  onPress: () => void;
}) {
  const color = CONTENT_TYPE_COLORS[lesson.content_type];
  const icon = CONTENT_TYPE_ICONS[lesson.content_type];

  return (
    <Pressable style={s.lessonCard} onPress={onPress}>
      <View style={s.lessonNumberWrap}>
        {lesson.is_completed ? (
          <View style={s.lessonCheckCircle}>
            <MaterialIcons name="check" size={14} color="#fff" />
          </View>
        ) : (
          <Text style={s.lessonNumber}>{index + 1}</Text>
        )}
      </View>
      <View style={[s.lessonIconWrap, { backgroundColor: `${color}14` }]}>
        <MaterialIcons name={icon} size={22} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.lessonTitle, lesson.is_completed && s.lessonTitleDone]}>
          {lesson.title}
        </Text>
        <View style={s.lessonMetaRow}>
          <Text style={s.lessonType}>
            {lesson.content_type.toUpperCase()}
          </Text>
          {lesson.duration_minutes != null && (
            <Text style={s.lessonDuration}>{lesson.duration_minutes} min</Text>
          )}
        </View>
      </View>
      <MaterialIcons name="chevron-right" size={20} color="#D1D5DB" />
    </Pressable>
  );
}

// ── Video Viewer ────────────────────────────────────────────────

function VideoViewer({
  lesson,
  onComplete,
  onBack,
  isCompleted,
}: {
  lesson: LessonContent;
  onComplete: () => void;
  onBack: () => void;
  isCompleted: boolean;
}) {
  const { width } = useWindowDimensions();
  const videoHeight = (width * 9) / 16;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={[s.videoPlaceholder, { height: videoHeight }]}>
        <MaterialIcons name="play-circle-fill" size={64} color="rgba(255,255,255,0.8)" />
        <Text style={s.videoPlaceholderText}>
          Video Player{"\n"}(expo-av)
        </Text>
        {lesson.content_url && (
          <Text style={s.videoUrl} numberOfLines={1}>
            {lesson.content_url}
          </Text>
        )}
      </View>

      <View style={s.viewerMeta}>
        <Text style={s.viewerTitle}>{lesson.title}</Text>
        {lesson.duration_minutes != null && (
          <Text style={s.viewerDuration}>{lesson.duration_minutes} min</Text>
        )}
      </View>

      {!isCompleted && (
        <Pressable style={s.markCompleteBtn} onPress={onComplete}>
          <MaterialIcons name="check-circle" size={20} color="#fff" />
          <Text style={s.markCompleteText}>Mark as Complete</Text>
        </Pressable>
      )}

      {isCompleted && (
        <View style={s.completedBadge}>
          <MaterialIcons name="check-circle" size={18} color="#22C55E" />
          <Text style={s.completedText}>Completed</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── Diagram Viewer ──────────────────────────────────────────────

function DiagramViewer({
  lesson,
  onComplete,
  onBack,
  isCompleted,
}: {
  lesson: LessonContent;
  onComplete: () => void;
  onBack: () => void;
  isCompleted: boolean;
}) {
  const { width } = useWindowDimensions();

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={[s.diagramContainer, { minHeight: width * 0.75 }]}>
        <MaterialIcons name="zoom-in" size={48} color="#D1D5DB" />
        <Text style={s.diagramPlaceholder}>
          Zoomable Diagram Viewer{"\n"}(react-native-image-zoom)
        </Text>
        {lesson.content_url && (
          <Text style={s.videoUrl} numberOfLines={1}>
            {lesson.content_url}
          </Text>
        )}
      </View>

      <View style={s.viewerMeta}>
        <Text style={s.viewerTitle}>{lesson.title}</Text>
        <Text style={s.viewerHint}>Pinch to zoom · Double-tap to reset</Text>
      </View>

      {!isCompleted && (
        <Pressable style={s.markCompleteBtn} onPress={onComplete}>
          <MaterialIcons name="check-circle" size={20} color="#fff" />
          <Text style={s.markCompleteText}>Mark as Complete</Text>
        </Pressable>
      )}

      {isCompleted && (
        <View style={s.completedBadge}>
          <MaterialIcons name="check-circle" size={18} color="#22C55E" />
          <Text style={s.completedText}>Completed</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── SOP Viewer ──────────────────────────────────────────────────

function SOPViewer({
  lesson,
  onComplete,
  onBack,
  isCompleted,
}: {
  lesson: LessonContent;
  onComplete: () => void;
  onBack: () => void;
  isCompleted: boolean;
}) {
  const body = lesson.content_body ?? "";
  const lines = body.split("\n");

  return (
    <ScrollView style={s.container} contentContainerStyle={s.sopContent}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("# ")) {
          return (
            <Text key={i} style={s.sopH1}>
              {trimmed.slice(2)}
            </Text>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <Text key={i} style={s.sopH2}>
              {trimmed.slice(3)}
            </Text>
          );
        }
        if (/^\d+\.\s/.test(trimmed)) {
          const match = trimmed.match(/^(\d+)\.\s(.*)$/);
          if (match) {
            const isBold = match[2].startsWith("**") && match[2].endsWith("**");
            const text = isBold ? match[2].slice(2, -2) : match[2];
            return (
              <View key={i} style={s.sopStepRow}>
                <View style={s.sopStepNumber}>
                  <Text style={s.sopStepNumText}>{match[1]}</Text>
                </View>
                <Text style={[s.sopStepText, isBold && s.sopBold]}>
                  {text}
                </Text>
              </View>
            );
          }
        }
        if (trimmed === "") return <View key={i} style={s.sopSpacer} />;
        return (
          <Text key={i} style={s.sopBody}>
            {trimmed}
          </Text>
        );
      })}

      {!isCompleted && (
        <Pressable style={[s.markCompleteBtn, { marginTop: 24 }]} onPress={onComplete}>
          <MaterialIcons name="check-circle" size={20} color="#fff" />
          <Text style={s.markCompleteText}>I've Read This — Mark Complete</Text>
        </Pressable>
      )}

      {isCompleted && (
        <View style={[s.completedBadge, { marginTop: 24 }]}>
          <MaterialIcons name="check-circle" size={18} color="#22C55E" />
          <Text style={s.completedText}>Completed</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── Assessment View ─────────────────────────────────────────────

function AssessmentView({
  assessment,
  moduleId,
  onBack,
}: {
  assessment: AssessmentDetail;
  moduleId: number;
  onBack: () => void;
}) {
  const submitAssessment = useSubmitAssessment();

  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{
    score: number;
    passed: boolean;
    correct: Record<string, number>;
    feedback: string | null;
  } | null>(null);

  const questions = assessment.questions;
  const allAnswered = questions.length > 0 && Object.keys(answers).length === questions.length;

  const handleSubmit = async () => {
    haptic.medium();
    try {
      const res = await submitAssessment.mutateAsync({
        assessmentId: assessment.id,
        answers,
      });
      setResult({
        score: res.score,
        passed: res.passed,
        correct: res.correct_answers,
        feedback: res.feedback,
      });
      setSubmitted(true);
      if (res.passed) haptic.success();
      else haptic.warning();
    } catch {
      haptic.error();
      Alert.alert(
        "Couldn't submit assessment",
        "Please check your connection and try again."
      );
    }
  };

  const handleRetry = () => {
    setAnswers({});
    setSubmitted(false);
    setResult(null);
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.assessmentHeader}>
        <Text style={s.assessmentTitle}>{assessment.title}</Text>
        <View style={s.assessmentMeta}>
          <View style={s.assessmentMetaPill}>
            <MaterialIcons name="help-outline" size={14} color="#6B7280" />
            <Text style={s.assessmentMetaText}>
              {assessment.question_count} questions
            </Text>
          </View>
          <View style={s.assessmentMetaPill}>
            <MaterialIcons name="grade" size={14} color="#6B7280" />
            <Text style={s.assessmentMetaText}>
              Pass: {assessment.passing_score}%
            </Text>
          </View>
          {assessment.time_limit_minutes && (
            <View style={s.assessmentMetaPill}>
              <MaterialIcons name="timer" size={14} color="#6B7280" />
              <Text style={s.assessmentMetaText}>
                {assessment.time_limit_minutes} min
              </Text>
            </View>
          )}
        </View>
        {assessment.max_attempts != null && (
          <Text style={s.attemptsText}>
            Attempts: {assessment.attempts_used}/{assessment.max_attempts}
          </Text>
        )}
      </View>

      {questions.map((q, qi) => (
        <QuestionCard
          key={q.id}
          question={q}
          index={qi}
          selectedAnswer={answers[q.id]}
          submitted={submitted}
          correctAnswer={result?.correct[q.id]}
          onSelect={(optIdx) => {
            if (submitted) return;
            haptic.selection();
            setAnswers((prev) => ({ ...prev, [q.id]: optIdx }));
          }}
        />
      ))}

      {!submitted && (
        <Pressable
          style={[s.submitBtn, !allAnswered && s.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!allAnswered || submitAssessment.isPending}
        >
          <Text style={s.submitBtnText}>
            {submitAssessment.isPending ? "Submitting..." : "Submit Assessment"}
          </Text>
        </Pressable>
      )}

      {submitted && result && (
        <View
          style={[
            s.resultCard,
            result.passed ? s.resultPass : s.resultFail,
          ]}
        >
          <MaterialIcons
            name={result.passed ? "celebration" : "replay"}
            size={32}
            color={result.passed ? "#22C55E" : "#EF4444"}
          />
          <Text style={[s.resultScore, { color: result.passed ? "#166534" : "#991B1B" }]}>
            {result.score}%
          </Text>
          <Text style={[s.resultTitle, { color: result.passed ? "#166534" : "#991B1B" }]}>
            {result.passed ? "Assessment Passed!" : "Not Quite — Try Again"}
          </Text>
          {result.feedback && (
            <Text style={s.resultFeedback}>{result.feedback}</Text>
          )}
          {!result.passed && (
            <Text style={s.resultHint}>
              You need {assessment.passing_score}% to pass. Review the material and try again.
            </Text>
          )}
        </View>
      )}

      {submitted && result?.passed && (
        <Pressable
          style={s.doneBtn}
          onPress={() => {
            haptic.success();
            onBack();
          }}
        >
          <MaterialIcons name="check-circle" size={20} color="#fff" />
          <Text style={s.doneBtnText}>Done — Back to Module</Text>
        </Pressable>
      )}

      {submitted && result && !result.passed && (
        <Pressable style={s.retryBtn} onPress={handleRetry}>
          <MaterialIcons name="replay" size={20} color="#3B82F6" />
          <Text style={s.retryBtnText}>Retry Assessment</Text>
        </Pressable>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function QuestionCard({
  question,
  index,
  selectedAnswer,
  submitted,
  correctAnswer,
  onSelect,
}: {
  question: AssessmentQuestion;
  index: number;
  selectedAnswer: number | undefined;
  submitted: boolean;
  correctAnswer: number | undefined;
  onSelect: (idx: number) => void;
}) {
  return (
    <View style={s.questionCard}>
      <Text style={s.questionText}>
        {index + 1}. {question.text}
      </Text>
      {question.options.map((opt, oi) => {
        const selected = selectedAnswer === oi;
        const isCorrect = submitted && correctAnswer === oi;
        const isWrong = submitted && selected && correctAnswer !== oi;

        return (
          <Pressable
            key={oi}
            style={[
              s.optionBtn,
              selected && !submitted && s.optionSelected,
              isCorrect && s.optionCorrect,
              isWrong && s.optionWrong,
            ]}
            onPress={() => onSelect(oi)}
            disabled={submitted}
          >
            <View style={[s.optionRadio, selected && !submitted && s.optionRadioSelected, isCorrect && s.optionRadioCorrect, isWrong && s.optionRadioWrong]}>
              {(selected || isCorrect) && <View style={s.optionRadioDot} />}
            </View>
            <Text
              style={[
                s.optionText,
                selected && !submitted && s.optionTextSelected,
                isCorrect && s.optionTextCorrect,
                isWrong && s.optionTextWrong,
              ]}
            >
              {opt}
            </Text>
            {isCorrect && <MaterialIcons name="check-circle" size={18} color="#22C55E" />}
            {isWrong && <MaterialIcons name="cancel" size={18} color="#EF4444" />}
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16, paddingBottom: 40 },
  sopContent: { padding: 20, paddingBottom: 40 },

  // Hero
  heroCard: { backgroundColor: "#1E1B4B", borderRadius: 20, padding: 20, marginBottom: 16 },
  heroMeta: { marginBottom: 8 },
  heroSchool: { fontSize: 12, fontWeight: "700", color: "#A5B4FC", textTransform: "uppercase", letterSpacing: 1 },
  heroCourse: { fontSize: 12, color: "#C7D2FE", marginTop: 2 },
  heroDesc: { fontSize: 14, color: "#E0E7FF", lineHeight: 20, marginBottom: 12 },
  heroStats: { flexDirection: "row", gap: 12, marginBottom: 14, flexWrap: "wrap" },
  heroStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  heroStatText: { fontSize: 12, color: "#C7D2FE" },
  mandatoryPill: { backgroundColor: "#EF444420", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  mandatoryText: { fontSize: 10, fontWeight: "800", color: "#FCA5A5", letterSpacing: 0.5 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  progressTrack: { flex: 1, height: 6, backgroundColor: "#312E81", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, backgroundColor: "#22C55E", borderRadius: 3 },
  progressLabel: { fontSize: 12, color: "#A5B4FC", fontVariant: ["tabular-nums"] },

  // Resume
  resumeBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#3B82F6", borderRadius: 14, padding: 14, marginBottom: 20,
  },
  resumeBtnLabel: { fontSize: 11, color: "rgba(255,255,255,0.7)" },
  resumeBtnTitle: { fontSize: 14, fontWeight: "700", color: "#fff" },

  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#111827", marginBottom: 10 },

  // Lesson rows
  lessonCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: "#E5E7EB",
  },
  lessonNumberWrap: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  lessonNumber: { fontSize: 13, fontWeight: "700", color: "#6B7280" },
  lessonCheckCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#22C55E", alignItems: "center", justifyContent: "center" },
  lessonIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  lessonTitle: { fontSize: 14, fontWeight: "600", color: "#1F2937" },
  lessonTitleDone: { color: "#9CA3AF" },
  lessonMetaRow: { flexDirection: "row", gap: 8, marginTop: 2 },
  lessonType: { fontSize: 10, fontWeight: "700", color: "#9CA3AF" },
  lessonDuration: { fontSize: 10, color: "#9CA3AF" },

  dueRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, justifyContent: "center" },
  dueText: { fontSize: 13, color: "#6B7280" },

  // Video viewer
  videoPlaceholder: {
    backgroundColor: "#111827", borderRadius: 16, alignItems: "center", justifyContent: "center",
    marginBottom: 16,
  },
  videoPlaceholderText: { color: "rgba(255,255,255,0.5)", fontSize: 13, textAlign: "center", marginTop: 8 },
  videoUrl: { color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 8, paddingHorizontal: 20 },

  // Diagram viewer
  diagramContainer: {
    backgroundColor: "#F3F4F6", borderRadius: 16, alignItems: "center", justifyContent: "center",
    marginBottom: 16, borderWidth: 1, borderColor: "#E5E7EB",
  },
  diagramPlaceholder: { color: "#9CA3AF", fontSize: 13, textAlign: "center", marginTop: 8 },

  // Shared viewer
  viewerMeta: { marginBottom: 16 },
  viewerTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  viewerDuration: { fontSize: 13, color: "#6B7280", marginTop: 4 },
  viewerHint: { fontSize: 12, color: "#9CA3AF", marginTop: 4 },

  markCompleteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#22C55E", paddingVertical: 16, borderRadius: 14,
  },
  markCompleteText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  completedBadge: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "#F0FDF4", paddingVertical: 12, borderRadius: 14,
    borderWidth: 1, borderColor: "#BBF7D0",
  },
  completedText: { fontSize: 14, fontWeight: "700", color: "#22C55E" },

  // SOP
  sopH1: { fontSize: 22, fontWeight: "800", color: "#111827", marginBottom: 16 },
  sopH2: { fontSize: 17, fontWeight: "700", color: "#1F2937", marginTop: 20, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: "#E5E7EB", paddingBottom: 6 },
  sopStepRow: { flexDirection: "row", gap: 10, marginBottom: 10, alignItems: "flex-start" },
  sopStepNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", marginTop: 1 },
  sopStepNumText: { fontSize: 12, fontWeight: "700", color: "#3B82F6" },
  sopStepText: { flex: 1, fontSize: 15, color: "#374151", lineHeight: 22 },
  sopBold: { fontWeight: "700", color: "#111827" },
  sopBody: { fontSize: 15, color: "#374151", lineHeight: 22, marginBottom: 6 },
  sopSpacer: { height: 8 },

  // Assessment
  assessmentHeader: { backgroundColor: "#FFF7ED", borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: "#FED7AA" },
  assessmentTitle: { fontSize: 18, fontWeight: "700", color: "#9A3412", marginBottom: 10 },
  assessmentMeta: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  assessmentMetaPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FFF", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  assessmentMetaText: { fontSize: 12, color: "#6B7280" },
  attemptsText: { fontSize: 12, color: "#B45309", marginTop: 8 },

  questionCard: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#E5E7EB" },
  questionText: { fontSize: 15, fontWeight: "600", color: "#1F2937", marginBottom: 12 },

  optionBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 12, borderRadius: 10, marginBottom: 6,
    borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#F9FAFB",
  },
  optionSelected: { borderColor: "#3B82F6", backgroundColor: "#EFF6FF" },
  optionCorrect: { borderColor: "#22C55E", backgroundColor: "#F0FDF4" },
  optionWrong: { borderColor: "#EF4444", backgroundColor: "#FEE2E2" },

  optionRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: "#D1D5DB", alignItems: "center", justifyContent: "center" },
  optionRadioSelected: { borderColor: "#3B82F6" },
  optionRadioCorrect: { borderColor: "#22C55E" },
  optionRadioWrong: { borderColor: "#EF4444" },
  optionRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#3B82F6" },

  optionText: { flex: 1, fontSize: 14, color: "#374151" },
  optionTextSelected: { color: "#1D4ED8", fontWeight: "600" },
  optionTextCorrect: { color: "#166534", fontWeight: "600" },
  optionTextWrong: { color: "#991B1B", fontWeight: "600" },

  submitBtn: { backgroundColor: "#F97316", paddingVertical: 16, borderRadius: 14, alignItems: "center", marginTop: 8 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  resultCard: { alignItems: "center", borderRadius: 16, padding: 24, marginTop: 16, gap: 8 },
  resultPass: { backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#BBF7D0" },
  resultFail: { backgroundColor: "#FEE2E2", borderWidth: 1, borderColor: "#FECACA" },
  resultScore: { fontSize: 36, fontWeight: "900", fontVariant: ["tabular-nums"] },
  resultTitle: { fontSize: 18, fontWeight: "700" },
  resultFeedback: { fontSize: 14, color: "#6B7280", textAlign: "center" },
  resultHint: { fontSize: 13, color: "#6B7280", textAlign: "center", marginTop: 4 },

  doneBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#22C55E", paddingVertical: 16, borderRadius: 14, marginTop: 12,
  },
  doneBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  retryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#EFF6FF", paddingVertical: 16, borderRadius: 14, marginTop: 12,
    borderWidth: 1, borderColor: "#BFDBFE",
  },
  retryBtnText: { color: "#3B82F6", fontSize: 16, fontWeight: "700" },
});
