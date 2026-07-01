export interface BriefingCustomerSummary {
  customer_name: string;
  total_visits: number;
  last_visit_date: string | null;
  lifetime_spend: number;
  preferred_communication: string | null;
  notes: string | null;
}

export interface BriefingVehicleHistory {
  vehicle_summary: string;
  last_service_date: string | null;
  last_service_type: string | null;
  total_services: number;
  mileage: number | null;
  known_issues: string[];
}

export interface BriefingTalkingPoint {
  id: string;
  text: string;
  priority: "high" | "medium" | "low";
}

export interface BriefingUpsellOpportunity {
  id: string;
  service_name: string;
  reason: string;
  estimated_price: number | null;
  confidence: "high" | "medium" | "low";
  duration_minutes: number | null;
  fits_in_window: boolean;
}

export interface CopilotBriefing {
  appointment_id: number;
  customer_summary: BriefingCustomerSummary;
  vehicle_history: BriefingVehicleHistory;
  talking_points: BriefingTalkingPoint[];
  upsell_opportunities: BriefingUpsellOpportunity[];
  available_minutes: number | null;
  generated_at: string;
}

export type SuggestionType = "observation" | "upsell" | "draft_message";

export interface CopilotSuggestionBase {
  id: string;
  type: SuggestionType;
  text: string;
  priority: "high" | "medium" | "low";
  dismissed?: boolean;
}

export interface CopilotObservation extends CopilotSuggestionBase {
  type: "observation";
  source: "mileage" | "history" | "seasonal" | "recall" | "general";
}

export interface CopilotUpsellItem extends CopilotSuggestionBase {
  type: "upsell";
  part_name: string;
  price: number;
  service_id: number | null;
  in_stock: boolean;
  stock_quantity: number | null;
  talking_point: string;
}

// Copilot can hand off a pre-generated AI message draft. The suggestion
// only carries the draft id — the sheet pulls the full `MessageDraft` via
// the lifecycle endpoint so we don't duplicate the canonical record.
export interface CopilotDraftMessage extends CopilotSuggestionBase {
  type: "draft_message";
  draft_id: number;
  intent: string;
}

export type CopilotSuggestion =
  | CopilotObservation
  | CopilotUpsellItem
  | CopilotDraftMessage;

export interface CopilotSuggestionsResponse {
  appointment_id: number;
  suggestions: CopilotSuggestion[];
  generated_at: string;
}

export type ChatMessageRole = "user" | "assistant";

export interface ChatSource {
  id: string;
  title: string;
  type: "sop" | "inventory" | "vehicle_db" | "training" | "general";
  url?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  sources?: ChatSource[];
  created_at: string;
}

// PLAN-DEVIATION: 2026-04-26-ask-remi-session-wire — the BE Copilot chat is
// sessionful: caller POSTs /copilot/chat/start to obtain a sessionId, then
// POSTs /copilot/chat/:sessionId with `{ message }` for every turn. The
// legacy `CopilotChatRequest` (with `appointment_id` + `conversation_id`)
// described a stateless contract that has never existed on the BE.
// See docs/PLAN-DEVIATIONS.md#2026-04-26-ask-remi-session-wire.
export interface CopilotChatStartRequest {
  // Pass the active appointment when the chat is opened from the job flow
  // (e.g. the Ask REMI button on the timer/services screens). The BE seeds
  // the session's system prompt with vehicle/customer/service context so
  // pronouns like "this vehicle" resolve correctly.
  appointment_id?: number;
}

export interface CopilotChatStartResponse {
  sessionId: string;
  message: string;
}

export interface CopilotChatSendRequest {
  message: string;
}

export interface CopilotChatSendResponse {
  sessionId: string;
  reply: string;
  tool_calls_made: string[];
  tokens_used: number;
}

export interface CopilotChatEndResponse {
  deleted: boolean;
}

// --- Voice Copilot (Realtime API via WebRTC) ---

export type VoiceConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export interface VoiceSessionTool {
  name: string;
  description: string;
}

export interface VoiceSessionResponse {
  client_secret: string;
  voice: string;
  tools: VoiceSessionTool[];
  expires_at: string;
  session_id: string;
}

export interface VoiceToolCallRequest {
  tool_name: string;
  arguments: Record<string, unknown>;
  tool_call_id: string;
  session_id: string;
}

export interface VoiceToolCallResponse {
  tool_call_id: string;
  result: unknown;
}

export interface TranscriptEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
}

export interface VoiceSessionEndRequest {
  session_id: string;
  duration_seconds: number;
}

// AI Message Draft types live in `src/types/messaging.ts` per the
// `ai-message-draft-contract.md` rollout. The legacy `AIMessageDraft` /
// `MessageDraftSendPayload` shapes that briefly lived here have been
// removed in favor of the lifecycle-aware `MessageDraft` type.
