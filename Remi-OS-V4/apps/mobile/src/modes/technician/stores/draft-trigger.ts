import { create } from "zustand";

// Global queue for AI message draft triggers. Anywhere in the app that needs
// to surface the draft sheet (push notification handler, copilot suggestion
// of type `draft_message`, an automation event arriving over a websocket,
// etc.) calls `triggerDraft(id)` and the singleton `<DraftTriggerListener />`
// mounted in `app/_layout.tsx` opens the sheet against that draft.
//
// The store deliberately holds only an `id`; the sheet hydrates the full
// `MessageDraft` via `useMessageDraft(id)` so we don't duplicate the
// canonical record between Zustand and TanStack Query.

interface DraftTriggerState {
  pendingDraftId: number | null;
  triggerDraft: (draftId: number) => void;
  clear: () => void;
}

export const useDraftTriggerStore = create<DraftTriggerState>((set) => ({
  pendingDraftId: null,
  triggerDraft: (draftId) => set({ pendingDraftId: draftId }),
  clear: () => set({ pendingDraftId: null }),
}));

// Imperative helper for non-React callers (push notification handler, voice
// copilot tool-call results, etc.) that don't have a hook context handy.
export function triggerDraft(draftId: number): void {
  useDraftTriggerStore.getState().triggerDraft(draftId);
}
