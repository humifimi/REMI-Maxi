import React, { useCallback, useEffect } from "react";
import { useDraftTriggerStore } from "@technician/stores/draft-trigger";
import { MessageDraftSheet } from "@technician/components/ai/message-draft-sheet";
import { useCopilotSuggestions } from "@technician/hooks/ai/use-copilot";
import type { CopilotDraftMessage } from "@technician/types/copilot";

// Mounts the AI message draft sheet at the root of the app and listens for
// triggers from anywhere in the codebase. Two trigger paths today:
//
//  1. **Push / automation events** — `src/notifications/handlers.ts` calls
//     `triggerDraft(draftId)` directly from `useDraftTriggerStore` when a
//     `MESSAGE_DRAFT_READY` push lands. No mount-order coupling: the store
//     is plain Zustand, so the call works whether or not this listener is
//     mounted. If the listener wasn't mounted yet (cold-launch deep link)
//     it picks up the pending id when it does mount.
//
//  2. **Copilot suggestions** — when the in-job copilot returns a
//     suggestion of type `draft_message`, the optional appointment-scoped
//     subscriber forwarded by an active job screen surfaces the sheet.
//     Components that own an appointment context render
//     `<DraftTriggerListener appointmentId={id} />` to opt in.
//
// The sheet itself is fully driven by the draft id — once the sheet closes
// (via send, discard, or pan-down) the store clears.

interface DraftTriggerListenerProps {
  appointmentId?: number | null;
}

export function DraftTriggerListener({
  appointmentId,
}: DraftTriggerListenerProps = {}) {
  const pendingDraftId = useDraftTriggerStore((s) => s.pendingDraftId);
  const triggerDraft = useDraftTriggerStore((s) => s.triggerDraft);
  const clear = useDraftTriggerStore((s) => s.clear);

  // Subscribe to copilot suggestions when an appointment is provided. Skip
  // the subscription entirely (passing 0 to disable the query) when there
  // isn't one — keeps the root mount free of unnecessary network traffic.
  const suggestions = useCopilotSuggestions(
    typeof appointmentId === "number" && appointmentId > 0 ? appointmentId : 0,
  );

  useEffect(() => {
    if (!suggestions.data?.suggestions) return;
    const draftSuggestion = suggestions.data.suggestions.find(
      (s): s is CopilotDraftMessage =>
        s.type === "draft_message" && !s.dismissed,
    );
    if (draftSuggestion && pendingDraftId !== draftSuggestion.draft_id) {
      triggerDraft(draftSuggestion.draft_id);
    }
  }, [suggestions.data, pendingDraftId, triggerDraft]);

  const handleClose = useCallback(() => {
    clear();
  }, [clear]);

  return (
    <MessageDraftSheet draftId={pendingDraftId} onClose={handleClose} />
  );
}
