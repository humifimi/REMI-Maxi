export const WellnessMood = {
  GREAT: 5,
  GOOD: 4,
  OKAY: 3,
  LOW: 2,
  ROUGH: 1,
} as const;

export type WellnessMood = (typeof WellnessMood)[keyof typeof WellnessMood];

export interface WellnessCheckIn {
  id: number;
  user_id: number;
  mood: WellnessMood;
  note: string | null;
  checked_in_at: string;
}

export interface WellnessResourceLink {
  title: string;
  url?: string;
  description?: string;
}

export type WellnessAiResponseType =
  | "encouragement"
  | "resource_suggestion"
  | "check_in_followup"
  | "escalation";

export interface WellnessAiResponse {
  id: number;
  check_in_id: number;
  response_text: string;
  response_type: WellnessAiResponseType;
  resource_suggestions: WellnessResourceLink[];
  escalated: boolean;
}

// --- Inline check-in response shape (BE returns this from POST /wellness/check-in) ---
// Per `docs/implementation-plans/wellness-ai-and-walk-in-contract.md` § 2 (Option A):
// the check-in endpoint runs the AI generation synchronously and returns the
// supportive content embedded in `ai_response` so the UI doesn't need a second
// round-trip. `ai_response` is null when AI generation fails or is disabled —
// the UI must fall back to a static "Thanks for checking in!" in that case.

export type AiResponseTone = "celebrate" | "encourage" | "support";

export interface ResourceLink {
  title: string;
  url: string;
  icon?: string;
}

export interface AiResponseCard {
  message: string;
  tone: AiResponseTone;
  resource_links: ResourceLink[];
}

export interface CheckInResponse {
  check_in_id: number;
  mood: WellnessMood;
  note: string | null;
  streak: number;
  created_at: string;
  ai_response: AiResponseCard | null;
}

// Legacy shape — kept for downstream consumers reading the older normalized
// envelope. New code should consume `CheckInResponse` directly.
export interface WellnessCheckInResponse {
  check_in: WellnessCheckIn;
  ai_response?: string;
  resource_links?: WellnessResourceLink[];
  streak: {
    current_streak: number;
    longest_streak: number;
  };
}

export interface WellnessCheckInRequest {
  mood: WellnessMood;
  note?: string;
}

export interface WellnessStreakResponse {
  current_streak: number;
  longest_streak: number;
  last_checkin_date: string | null;
  checked_in_today: boolean;
}

export interface WellnessHistoryResponse {
  checkins: WellnessCheckIn[];
  streak: WellnessStreakResponse;
}

export interface WellnessNudge {
  id: number;
  technician_id: number;
  nudge_type: "mood_decline" | "resource_link";
  message: string;
  resource_links?: WellnessResourceLink[];
  acknowledged: boolean;
}

export const MOOD_EMOJI: Record<number, string> = {
  5: "\u{1F929}",
  4: "\u{1F60A}",
  3: "\u{1F610}",
  2: "\u{1F614}",
  1: "\u{1F616}",
};

export const MOOD_LABEL: Record<number, string> = {
  5: "Great",
  4: "Good",
  3: "Okay",
  2: "Low",
  1: "Rough",
};
