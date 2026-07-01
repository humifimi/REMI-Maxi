// AI Message Draft contract — mirrors the backend response envelope shipped
// by `POST /technician/messages/draft` and the rest of the lifecycle. See
// `docs/implementation-plans/ai-message-draft-contract.md` § 2 for the
// canonical shape and CG-6 for the combined send-with-edit endpoint.

export const DRAFT_INTENTS = [
  "running_late",
  "service_recommendation",
  "follow_up",
  "deferred_explanation",
  "custom",
] as const;

export type DraftIntent = (typeof DRAFT_INTENTS)[number];

export const DRAFT_STATUSES = [
  "pending",
  "approved",
  "sent",
  "rejected",
] as const;

export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const DRAFT_TRIGGER_SOURCES = [
  "copilot",
  "automation",
  "manual",
] as const;

export type DraftTriggerSource = (typeof DRAFT_TRIGGER_SOURCES)[number];

export type RecipientContactMethod = "sms" | "email" | "push";

export interface DraftRecipient {
  customer_id: number;
  name: string;
  contact_method: RecipientContactMethod;
  masked_contact: string;
}

export interface MessageDraft {
  id: number;
  customer_id: number;
  appointment_id: number | null;
  intent: DraftIntent;
  original_text: string;
  edited_text: string | null;
  status: DraftStatus;
  trigger_reason: string | null;
  trigger_source: DraftTriggerSource | null;
  created_at: string;
  recipient: DraftRecipient;
}

// UI-side mappings — labels + Material icon names + accent palette per intent.
// Kept here (not in the sheet component) so any future surface that needs to
// represent an intent (badge, list row, history) reads from one source.

export interface IntentDisplay {
  label: string;
  icon: string;
  color: string;
  bg: string;
}

export const INTENT_DISPLAY: Record<DraftIntent, IntentDisplay> = {
  running_late: {
    label: "Running Late",
    icon: "schedule",
    color: "#F97316",
    bg: "#FFF7ED",
  },
  service_recommendation: {
    label: "Service Recommendation",
    icon: "build",
    color: "#8B5CF6",
    bg: "#F5F3FF",
  },
  follow_up: {
    label: "Follow-Up",
    icon: "chat-bubble-outline",
    color: "#3B82F6",
    bg: "#EFF6FF",
  },
  deferred_explanation: {
    label: "Deferred Items",
    icon: "event-note",
    color: "#EAB308",
    bg: "#FEF9C3",
  },
  custom: {
    label: "Custom",
    icon: "edit",
    color: "#6B7280",
    bg: "#F3F4F6",
  },
};

// Request payloads — used by `useMessageDraft` and direct lifecycle calls.

export interface CreateDraftRequest {
  customer_id: number;
  franchise_id?: number;
  appointment_id?: number;
  intent: DraftIntent;
  custom_instructions?: string;
  trigger_reason?: string;
  trigger_source?: DraftTriggerSource;
  recipient_contact_method?: RecipientContactMethod;
  recipient_masked_contact?: string;
}

export interface EditDraftRequest {
  edited_text: string;
}

export interface SendDraftRequest {
  // Optional inline edit — when present, the backend records the edit
  // (preserving original_text for AI feedback analytics) and marks the
  // draft `sent` in a single round-trip. See contract doc § 2.
  edited_text?: string;
}

export interface RejectDraftRequest {
  reason?: string;
}

export interface ListDraftsParams {
  appointment_id?: number;
  status?: DraftStatus;
}
