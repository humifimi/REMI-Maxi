// Scenario-Based Training Module types (03.04)

export type ScenarioCompetencyArea =
  | "safety_judgment"
  | "communication"
  | "upsell_technique"
  | "customer_satisfaction";

export type OutcomeRating = "good" | "acceptable" | "poor";

export interface ScenarioDecisionOption {
  id: string;
  label: string;
  description: string;
}

export interface ScenarioOutcome {
  option_id: string;
  rating: OutcomeRating;
  customer_response: string;
  safety_impact: string;
  revenue_impact: string;
  satisfaction_impact: string;
  next_step_id: string | null;
}

export interface ScenarioCustomerProfile {
  name: string;
  relationship_years: number;
  vehicle: string;
  vehicle_age_years: number;
  prior_services: number;
}

export interface ScenarioStep {
  id: string;
  prompt: string;
  customer_profile: ScenarioCustomerProfile;
  options: ScenarioDecisionOption[];
  outcomes: ScenarioOutcome[];
  time_limit_seconds: number | null;
}

export interface ScenarioCompetencyScore {
  area: ScenarioCompetencyArea;
  score: number;
  max_score: number;
  label: string;
}

export interface ScenarioFinalScore {
  total_score: number;
  max_score: number;
  competency_scores: ScenarioCompetencyScore[];
  peer_average: number;
  percentile: number;
}

export interface ScenarioModule {
  id: number;
  title: string;
  description: string;
  competency_area: ScenarioCompetencyArea;
  estimated_minutes: number;
  steps: ScenarioStep[];
  total_decision_points: number;
}

export interface ScenarioDecisionPayload {
  step_id: string;
  selected_choice_index: number;
  time_taken_seconds: number;
}

export interface ScenarioDecisionResponse {
  outcome: ScenarioOutcome;
  running_score: number;
  decisions_remaining: number;
}

export interface ScenarioCompleteResponse {
  final_score: ScenarioFinalScore;
  module_id: number;
  xp_earned: number;
}

export const COMPETENCY_LABELS: Record<ScenarioCompetencyArea, string> = {
  safety_judgment: "Safety Judgment",
  communication: "Communication",
  upsell_technique: "Upsell Technique",
  customer_satisfaction: "Customer Satisfaction",
};

export const OUTCOME_COLORS: Record<OutcomeRating, string> = {
  good: "#22C55E",
  acceptable: "#EAB308",
  poor: "#EF4444",
};

export const OUTCOME_BG_COLORS: Record<OutcomeRating, string> = {
  good: "#DCFCE7",
  acceptable: "#FEF9C3",
  poor: "#FEE2E2",
};

export const OUTCOME_LABELS: Record<OutcomeRating, string> = {
  good: "Good Outcome",
  acceptable: "Acceptable",
  poor: "Poor Outcome",
};
