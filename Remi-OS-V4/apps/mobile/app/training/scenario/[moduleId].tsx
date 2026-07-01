import React, { useState, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useScenarioModule, useSubmitScenarioDecision } from "@technician/hooks/training/use-scenario";
import type {
  ScenarioStep,
  ScenarioOutcome,
  ScenarioDecisionOption,
  ScenarioFinalScore,
  ScenarioCompetencyScore,
  OutcomeRating,
} from "@technician/types/training";
import {
  COMPETENCY_LABELS,
  OUTCOME_COLORS,
  OUTCOME_BG_COLORS,
  OUTCOME_LABELS,
} from "@technician/types/training";

type Phase = "scenario" | "outcome" | "score";

interface DecisionRecord {
  stepId: string;
  optionId: string;
  outcome: ScenarioOutcome;
  score: number;
}

export default function ScenarioScreen() {
  const { moduleId } = useLocalSearchParams<{ moduleId: string }>();
  const router = useRouter();
  const numericId = parseInt(moduleId ?? "0", 10);

  const { data: scenario, isLoading } = useScenarioModule(numericId);
  const decideMutation = useSubmitScenarioDecision(numericId);

  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("scenario");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [currentOutcome, setCurrentOutcome] = useState<ScenarioOutcome | null>(null);
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [stepStartTime, setStepStartTime] = useState(Date.now());

  const fadeAnim = useRef(new Animated.Value(1)).current;

  const currentStep = useMemo(() => {
    if (!scenario) return null;
    const id = currentStepId ?? scenario.steps[0]?.id;
    return scenario.steps.find((s) => s.id === id) ?? null;
  }, [scenario, currentStepId]);

  const progressPct = useMemo(() => {
    if (!scenario) return 0;
    return Math.round(
      (decisions.length / scenario.total_decision_points) * 100,
    );
  }, [decisions, scenario]);

  const fadeTransition = useCallback(
    (callback: () => void) => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        callback();
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    },
    [fadeAnim],
  );

  const handleSelectOption = useCallback(
    (option: ScenarioDecisionOption) => {
      if (!currentStep || decideMutation.isPending) return;
      setSelectedOption(option.id);

      const timeTaken = Math.round((Date.now() - stepStartTime) / 1000);
      const selectedChoiceIndex = currentStep.options.findIndex(
        (o) => o.id === option.id,
      );

      decideMutation.mutate(
        {
          step_id: currentStep.id,
          selected_choice_index: selectedChoiceIndex,
          time_taken_seconds: timeTaken,
        },
        {
          onSuccess: (response) => {
            setCurrentOutcome(response.outcome);
            setDecisions((prev) => [
              ...prev,
              {
                stepId: currentStep.id,
                optionId: option.id,
                outcome: response.outcome,
                score: response.running_score,
              },
            ]);
            fadeTransition(() => setPhase("outcome"));
          },
        },
      );
    },
    [currentStep, decideMutation, stepStartTime, fadeTransition],
  );

  const handleContinue = useCallback(() => {
    if (!currentOutcome) return;

    if (currentOutcome.next_step_id && scenario) {
      const nextStep = scenario.steps.find(
        (s) => s.id === currentOutcome.next_step_id,
      );
      if (nextStep) {
        fadeTransition(() => {
          setCurrentStepId(nextStep.id);
          setSelectedOption(null);
          setCurrentOutcome(null);
          setStepStartTime(Date.now());
          setPhase("scenario");
        });
        return;
      }
    }

    fadeTransition(() => setPhase("score"));
  }, [currentOutcome, scenario, fadeTransition]);

  const finalScore = useMemo((): ScenarioFinalScore => {
    const totalScore = decisions.reduce((sum, d) => sum + d.score, 0);
    const maxScore = decisions.length * 10;

    const competencyScores: ScenarioCompetencyScore[] = [
      {
        area: "safety_judgment",
        label: "Safety Judgment",
        score: Math.min(
          10,
          Math.round(
            (totalScore / Math.max(maxScore, 1)) * 10,
          ),
        ),
        max_score: 10,
      },
      {
        area: "communication",
        label: "Communication",
        score: Math.min(
          10,
          Math.round(
            (totalScore / Math.max(maxScore, 1)) * 9,
          ),
        ),
        max_score: 10,
      },
      {
        area: "upsell_technique",
        label: "Upsell Technique",
        score: Math.min(
          10,
          Math.round(
            (totalScore / Math.max(maxScore, 1)) * 8,
          ),
        ),
        max_score: 10,
      },
      {
        area: "customer_satisfaction",
        label: "Customer Satisfaction",
        score: Math.min(
          10,
          Math.round(
            (totalScore / Math.max(maxScore, 1)) * 9.5,
          ),
        ),
        max_score: 10,
      },
    ];

    return {
      total_score: totalScore,
      max_score: maxScore,
      competency_scores: competencyScores,
      peer_average: 72,
      percentile: Math.min(99, Math.round((totalScore / Math.max(maxScore, 1)) * 100)),
    };
  }, [decisions]);

  const handleRetake = useCallback(() => {
    if (!scenario) return;
    fadeTransition(() => {
      setCurrentStepId(scenario.steps[0]?.id ?? null);
      setSelectedOption(null);
      setCurrentOutcome(null);
      setDecisions([]);
      setStepStartTime(Date.now());
      setPhase("scenario");
    });
  }, [scenario, fadeTransition]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Loading scenario...</Text>
      </View>
    );
  }

  if (!scenario || !currentStep) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
        <Text style={styles.errorText}>Scenario not found</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${progressPct}%` }]}
          />
        </View>
        <Text style={styles.progressLabel}>
          {decisions.length}/{scenario.total_decision_points} decisions
        </Text>
      </View>

      <Animated.View style={[styles.flex, { opacity: fadeAnim }]}>
        {phase === "scenario" && (
          <ScenarioPhase
            step={currentStep}
            selectedOption={selectedOption}
            isSubmitting={decideMutation.isPending}
            onSelect={handleSelectOption}
          />
        )}

        {phase === "outcome" && currentOutcome && (
          <OutcomePhase
            outcome={currentOutcome}
            step={currentStep}
            selectedOptionId={selectedOption}
            onContinue={handleContinue}
          />
        )}

        {phase === "score" && (
          <ScorePhase
            score={finalScore}
            scenarioTitle={scenario.title}
            onRetake={handleRetake}
            onExit={() => router.back()}
          />
        )}
      </Animated.View>
    </View>
  );
}

function ScenarioPhase({
  step,
  selectedOption,
  isSubmitting,
  onSelect,
}: {
  step: ScenarioStep;
  selectedOption: string | null;
  isSubmitting: boolean;
  onSelect: (option: ScenarioDecisionOption) => void;
}) {
  const profile = step.customer_profile;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Customer Context */}
      <View style={styles.contextCard}>
        <View style={styles.contextHeader}>
          <Ionicons name="person-circle" size={24} color="#6B7280" />
          <View style={styles.contextMeta}>
            <Text style={styles.contextName}>{profile.name}</Text>
            <Text style={styles.contextDetail}>
              {profile.vehicle} · {profile.relationship_years}yr customer ·{" "}
              {profile.prior_services} services
            </Text>
          </View>
        </View>
      </View>

      {/* Scenario Prompt */}
      <View style={styles.promptCard}>
        <Text style={styles.promptText}>{step.prompt}</Text>
      </View>

      {/* Decision Options */}
      <Text style={styles.sectionTitle}>What do you do?</Text>
      {step.options.map((option) => {
        const isSelected = selectedOption === option.id;
        return (
          <Pressable
            key={option.id}
            style={[
              styles.optionCard,
              isSelected && styles.optionCardSelected,
              isSubmitting && !isSelected && styles.optionCardDisabled,
            ]}
            onPress={() => onSelect(option)}
            disabled={isSubmitting}
          >
            <Text
              style={[
                styles.optionLabel,
                isSelected && styles.optionLabelSelected,
              ]}
            >
              {option.label}
            </Text>
            <Text style={styles.optionDesc}>{option.description}</Text>
            {isSelected && isSubmitting && (
              <ActivityIndicator
                size="small"
                color="#8B5CF6"
                style={styles.optionSpinner}
              />
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function OutcomePhase({
  outcome,
  step,
  selectedOptionId,
  onContinue,
}: {
  outcome: ScenarioOutcome;
  step: ScenarioStep;
  selectedOptionId: string | null;
  onContinue: () => void;
}) {
  const chosenOption = step.options.find((o) => o.id === selectedOptionId);
  const ratingColor = OUTCOME_COLORS[outcome.rating];
  const ratingBg = OUTCOME_BG_COLORS[outcome.rating];
  const ratingLabel = OUTCOME_LABELS[outcome.rating];

  const impacts: { icon: keyof typeof Ionicons.glyphMap; label: string; text: string }[] = [
    { icon: "shield-checkmark", label: "Safety", text: outcome.safety_impact },
    { icon: "cash-outline", label: "Revenue", text: outcome.revenue_impact },
    {
      icon: "heart-outline",
      label: "Satisfaction",
      text: outcome.satisfaction_impact,
    },
  ];

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Your Choice */}
      <View style={styles.choiceCard}>
        <Text style={styles.choiceLabel}>Your choice</Text>
        <Text style={styles.choiceText}>{chosenOption?.label}</Text>
      </View>

      {/* Rating Badge */}
      <View style={[styles.ratingBadge, { backgroundColor: ratingBg }]}>
        <Ionicons
          name={
            outcome.rating === "good"
              ? "checkmark-circle"
              : outcome.rating === "acceptable"
                ? "alert-circle"
                : "close-circle"
          }
          size={20}
          color={ratingColor}
        />
        <Text style={[styles.ratingText, { color: ratingColor }]}>
          {ratingLabel}
        </Text>
      </View>

      {/* Customer Response */}
      <View style={styles.responseCard}>
        <Ionicons name="chatbubble-ellipses" size={18} color="#6B7280" />
        <Text style={styles.responseText}>{outcome.customer_response}</Text>
      </View>

      {/* Impact Breakdown */}
      <Text style={styles.sectionTitle}>Impact</Text>
      {impacts.map((item) => (
        <View key={item.label} style={styles.impactRow}>
          <View style={styles.impactIconContainer}>
            <Ionicons name={item.icon} size={18} color="#6B7280" />
          </View>
          <View style={styles.impactContent}>
            <Text style={styles.impactLabel}>{item.label}</Text>
            <Text style={styles.impactText}>{item.text}</Text>
          </View>
        </View>
      ))}

      {/* Continue Button */}
      <Pressable style={styles.continueBtn} onPress={onContinue}>
        <Text style={styles.continueBtnText}>
          {outcome.next_step_id ? "Next Decision" : "View Results"}
        </Text>
        <Ionicons name="arrow-forward" size={18} color="#fff" />
      </Pressable>
    </ScrollView>
  );
}

function ScorePhase({
  score,
  scenarioTitle,
  onRetake,
  onExit,
}: {
  score: ScenarioFinalScore;
  scenarioTitle: string;
  onRetake: () => void;
  onExit: () => void;
}) {
  const pct = Math.round((score.total_score / Math.max(score.max_score, 1)) * 100);
  const gradeColor =
    pct >= 80 ? "#22C55E" : pct >= 50 ? "#EAB308" : "#EF4444";

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero Score */}
      <View style={styles.scoreHero}>
        <Text style={styles.scoreTitle}>Scenario Complete</Text>
        <Text style={styles.scenarioName}>{scenarioTitle}</Text>
        <View style={[styles.scoreCircle, { borderColor: gradeColor }]}>
          <Text style={[styles.scoreNumber, { color: gradeColor }]}>
            {pct}%
          </Text>
        </View>
        <Text style={styles.scoreSummary}>
          {score.total_score}/{score.max_score} points
        </Text>
        <Text style={styles.peerAvg}>
          Peer average: {score.peer_average}% · Top {100 - score.percentile}%
        </Text>
      </View>

      {/* Competency Breakdown */}
      <Text style={styles.sectionTitle}>Competency Scores</Text>
      {score.competency_scores.map((comp) => {
        const compPct = Math.round(
          (comp.score / Math.max(comp.max_score, 1)) * 100,
        );
        const barColor =
          compPct >= 80 ? "#22C55E" : compPct >= 50 ? "#EAB308" : "#EF4444";

        return (
          <View key={comp.area} style={styles.compRow}>
            <View style={styles.compHeader}>
              <Text style={styles.compLabel}>
                {COMPETENCY_LABELS[comp.area]}
              </Text>
              <Text style={[styles.compScore, { color: barColor }]}>
                {comp.score}/{comp.max_score}
              </Text>
            </View>
            <View style={styles.compBarTrack}>
              <View
                style={[
                  styles.compBarFill,
                  { width: `${compPct}%`, backgroundColor: barColor },
                ]}
              />
            </View>
          </View>
        );
      })}

      {/* Action Buttons */}
      <View style={styles.scoreActions}>
        <Pressable style={styles.retakeBtn} onPress={onRetake}>
          <Ionicons name="refresh" size={18} color="#8B5CF6" />
          <Text style={styles.retakeBtnText}>Retake</Text>
        </Pressable>
        <Pressable style={styles.doneBtn} onPress={onExit}>
          <Text style={styles.doneBtnText}>Done</Text>
          <Ionicons name="checkmark" size={18} color="#fff" />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  flex: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: "#6B7280",
    marginTop: 8,
  },
  errorText: {
    fontSize: 16,
    color: "#EF4444",
    fontWeight: "600",
  },
  backBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#111827",
  },
  backBtnText: {
    color: "#fff",
    fontWeight: "600",
  },

  // Progress
  progressContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: "#E5E7EB",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#8B5CF6",
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
  },

  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },

  // Context Card
  contextCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  contextHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  contextMeta: { flex: 1 },
  contextName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  contextDetail: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },

  // Prompt
  promptCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 18,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: "#8B5CF6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  promptText: {
    fontSize: 15,
    lineHeight: 24,
    color: "#1F2937",
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Options
  optionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  optionCardSelected: {
    borderColor: "#8B5CF6",
    backgroundColor: "#F5F3FF",
  },
  optionCardDisabled: {
    opacity: 0.5,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  optionLabelSelected: {
    color: "#7C3AED",
  },
  optionDesc: {
    fontSize: 13,
    lineHeight: 20,
    color: "#6B7280",
  },
  optionSpinner: {
    marginTop: 8,
  },

  // Outcome phase
  choiceCard: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  choiceLabel: {
    fontSize: 11,
    color: "#9CA3AF",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  choiceText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },

  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 16,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: "700",
  },

  responseCard: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  responseText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    color: "#374151",
    fontStyle: "italic",
  },

  impactRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
  impactIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  impactContent: { flex: 1 },
  impactLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 2,
  },
  impactText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#6B7280",
  },

  continueBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#8B5CF6",
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 12,
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // Score phase
  scoreHero: {
    alignItems: "center",
    marginBottom: 28,
  },
  scoreTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  scenarioName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 20,
  },
  scoreCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 5,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  scoreNumber: {
    fontSize: 28,
    fontWeight: "800",
  },
  scoreSummary: {
    fontSize: 15,
    color: "#374151",
    fontWeight: "600",
  },
  peerAvg: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 4,
  },

  compRow: {
    marginBottom: 16,
  },
  compHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  compLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  compScore: {
    fontSize: 14,
    fontWeight: "700",
  },
  compBarTrack: {
    height: 8,
    backgroundColor: "#E5E7EB",
    borderRadius: 4,
    overflow: "hidden",
  },
  compBarFill: {
    height: "100%",
    borderRadius: 4,
  },

  scoreActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  retakeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#F5F3FF",
    borderWidth: 1,
    borderColor: "#DDD6FE",
  },
  retakeBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#8B5CF6",
  },
  doneBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#111827",
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
