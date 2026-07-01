// Conversational ("chat-to-book") NLP booking types.
// Mirrors the backend `scheduling-copilot.service.ts` `NlpResponse` shape.

export interface TimeSlot {
  date: string;
  time: string;
  technician_name: string | null;
  technician_id: number | null;
  services: { id: number; name: string; price: number }[];
  total_price: number;
  estimated_duration_minutes: number;
}

export interface ExtractedIntent {
  services: string[];
  service_ids: number[];
  date_constraints: {
    preferred_date?: string;
    preferred_date_end?: string;
    day_of_week?: string;
    time_of_day?: 'morning' | 'afternoon' | 'evening';
    specific_time?: string;
    flexibility?: 'exact' | 'flexible' | 'any';
  };
  vehicle_hint?: string;
  notes?: string;
  confidence: number;
  needs_clarification: boolean;
  clarification_question?: string;
}

export type SuggestedActionType =
  | 'send_message'
  | 'select_slot'
  | 'change_service'
  | 'change_date'
  | 'open_help';

export interface SuggestedAction {
  type: SuggestedActionType;
  label: string;
  payload: Record<string, unknown>;
}

export type NlpSessionStatus =
  | 'active'
  | 'gathering'
  | 'awaiting_slot_selection'
  | 'slots_presented'
  | 'booked'
  | 'failed'
  | 'expired'
  | 'cancelled';

export interface NlpSessionMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface NlpSession {
  session_id: string;
  status: NlpSessionStatus;
  messages: NlpSessionMessage[];
  extracted_intent: ExtractedIntent | null;
  matched_slots: TimeSlot[] | null;
  franchise_id: number | null;
}

export interface NlpResponse {
  session_id: string;
  message: string;
  intent: ExtractedIntent | null;
  slots: TimeSlot[] | null;
  status: NlpSessionStatus;
  booked_appointment_id?: number;
  /** Backend CG-4 — quick-reply chips. May be empty array. */
  suggested_actions: SuggestedAction[];
}

// ---------------------------------------------------------------------------
// Local message thread (UI-only — combines user + assistant messages, plus
// inline component data for slot pickers and confirmation cards)
// ---------------------------------------------------------------------------

export type ChatMessageRole = 'user' | 'assistant';

export interface ChatBubbleMessage {
  id: string;
  role: ChatMessageRole;
  text: string;
  timestamp: string;
  /** Slots to render inline below the bubble (assistant messages only) */
  slots?: TimeSlot[];
  /** Quick-reply chips returned by backend `suggested_actions` */
  suggestedActions?: SuggestedAction[];
  /** When set, render the BookingConfirmationCard instead of slots */
  bookedAppointmentId?: number;
  /** When set, render the inline vehicle picker */
  needsVehiclePick?: boolean;
}
