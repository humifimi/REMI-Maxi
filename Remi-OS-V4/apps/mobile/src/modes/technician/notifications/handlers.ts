import type { Router } from "expo-router";
import type * as Notifications from "expo-notifications";
import type { SoundEventType } from "@technician/types/api";
import { triggerDraft } from "@technician/stores/draft-trigger";

// Push payload shape — keep this in lockstep with the backend's notification
// services. Server-side senders (stock alerts, dispatch, wellness nudges,
// AI message drafts, etc.) all share this `data` envelope. Field naming
// intentionally mirrors the backend so we can feature-detect by key without
// translation.
export interface NotificationData {
  type?: string;
  notification_type?: string;
  resourceId?: string;
  nudgeId?: string;
  nudge_id?: string;
  ai_response_id?: string;
  draft_id?: string | number;
  deep_link?: string;
  message?: string;
}

// Single canonical wellness deep-link target. Matches the URI baked into the
// backend's nudge push payload (`maxi://wellness?context=mood_decline`).
const WELLNESS_PATH = "/wellness";

function isWellnessNudge(type?: string): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return t === "wellness_nudge";
}

// Router for `addNotificationResponseReceivedListener` taps. Returns true
// when the payload was matched & routed so the caller can short-circuit
// any further handling. Per `wellness-ai-and-walk-in-contract.md` § 2, the
// wellness_nudge payload includes `ai_response_id` (pre-generated content)
// plus `nudge_id` — both forwarded to the wellness screen via search params
// so it can render the supportive card with no second round-trip flicker.
export function handleNotificationTap(
  data: NotificationData | undefined,
  router: Router,
): boolean {
  if (!data) return false;

  if (data.type === "STOCK_ALERT" && data.resourceId) {
    router.push(`/job/${data.resourceId}/briefing` as never);
    return true;
  }

  if (data.type === "APPOINTMENT_UPDATE" && data.resourceId) {
    router.push(`/order/${data.resourceId}` as never);
    return true;
  }

  // AI message draft trigger — backend pushes `MESSAGE_DRAFT_READY` with
  // the draft id when an automation rule (running-late detection, post-job
  // follow-up cadence, etc.) generates a draft for the tech to review. The
  // sheet is mounted globally via `<DraftTriggerListener />` so just
  // pushing the id into the trigger store is enough — no router push.
  if (
    (data.type === "MESSAGE_DRAFT_READY" ||
      data.notification_type === "message_draft_ready") &&
    data.draft_id !== undefined
  ) {
    const draftId = Number(data.draft_id);
    if (Number.isFinite(draftId) && draftId > 0) {
      triggerDraft(draftId);
      return true;
    }
  }

  if (
    isWellnessNudge(data.type) ||
    isWellnessNudge(data.notification_type)
  ) {
    const nudgeId = data.nudgeId ?? data.nudge_id ?? data.resourceId ?? "";
    const aiResponseId = data.ai_response_id ?? "";
    router.push({
      pathname: WELLNESS_PATH,
      params: {
        nudgeId,
        aiResponseId,
        nudgeMessage: data.message ?? "",
      },
    } as never);
    return true;
  }

  return false;
}

// Sound routing for `addNotificationReceivedListener`. Returns the sound key
// to play, or `null` to play nothing. Caller is responsible for actually
// invoking `playSoundOnce` — keeping that out of this module avoids pulling
// audio into pure routing logic (easier to unit-test).
export function notificationSoundFor(
  notification: Notifications.Notification,
): SoundEventType | null {
  const data = notification.request.content.data as NotificationData | undefined;
  if (!data) return null;

  switch (data.type) {
    case "STOCK_ALERT":
      return "new_job";
    case "MESSAGE":
      return "message_received";
    case "MESSAGE_DRAFT_READY":
      return "message_received";
    case "RATING_RECEIVED":
      return "rating_received";
    case "MILESTONE_UNLOCKED":
      return "milestone_unlocked";
    default:
      if (
        isWellnessNudge(data.type) ||
        isWellnessNudge(data.notification_type)
      ) {
        return "message_received";
      }
      return null;
  }
}
