import { useCallback, useEffect, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type {
  CreateDraftRequest,
  EditDraftRequest,
  ListDraftsParams,
  MessageDraft,
  RejectDraftRequest,
  SendDraftRequest,
} from "@technician/types/messaging";

// ---------------------------------------------------------------------------
// Query keys — all draft state is keyed under `['message-drafts', ...]` so a
// single mutation can invalidate everything (`['message-drafts']`) or a
// specific scope (`['message-drafts', 'detail', id]`) when we know better.
// ---------------------------------------------------------------------------

const draftKeys = {
  all: ["message-drafts"] as const,
  detail: (id: number) => ["message-drafts", "detail", id] as const,
  pending: () => ["message-drafts", "pending"] as const,
  list: (params: ListDraftsParams) =>
    ["message-drafts", "list", params] as const,
};

// ---------------------------------------------------------------------------
// Read hooks
// ---------------------------------------------------------------------------

export function useDraftDetail(draftId: number | null) {
  return useQuery<MessageDraft>({
    queryKey: draftId
      ? draftKeys.detail(draftId)
      : ["message-drafts", "detail", "noop"],
    queryFn: () =>
      api<MessageDraft>("get", Endpoints.messages.draft.detail(draftId!)),
    enabled: typeof draftId === "number" && draftId > 0,
    staleTime: 0,
    retry: 0,
  });
}

export function usePendingDrafts() {
  return useQuery<MessageDraft[]>({
    queryKey: draftKeys.pending(),
    queryFn: () => api<MessageDraft[]>("get", Endpoints.messages.draft.pending),
    staleTime: 30_000,
  });
}

export function useDraftsForAppointment(
  appointmentId: number | null,
  status?: ListDraftsParams["status"],
) {
  const params: ListDraftsParams = {};
  if (typeof appointmentId === "number") params.appointment_id = appointmentId;
  if (status) params.status = status;
  return useQuery<MessageDraft[]>({
    queryKey: draftKeys.list(params),
    queryFn: () =>
      api<MessageDraft[]>("get", Endpoints.messages.draft.list, params),
    enabled: typeof appointmentId === "number" && appointmentId > 0,
    staleTime: 15_000,
  });
}

// ---------------------------------------------------------------------------
// Write hooks — exposed individually for callers that want raw lifecycle
// control. The orchestrating hook (`useMessageDraft` below) wraps these.
// ---------------------------------------------------------------------------

export function useCreateDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDraftRequest) =>
      api<MessageDraft>("post", Endpoints.messages.draft.create, body),
    onSuccess: (draft) => {
      qc.setQueryData(draftKeys.detail(draft.id), draft);
      qc.invalidateQueries({ queryKey: draftKeys.all });
    },
  });
}

export function useEditDraft(draftId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EditDraftRequest) =>
      api<MessageDraft>(
        "post",
        Endpoints.messages.draft.edit(draftId!),
        body,
      ),
    onSuccess: (draft) => {
      qc.setQueryData(draftKeys.detail(draft.id), draft);
      qc.invalidateQueries({ queryKey: draftKeys.all });
    },
  });
}

export function useApproveDraft(draftId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<MessageDraft>("post", Endpoints.messages.draft.approve(draftId!)),
    onSuccess: (draft) => {
      qc.setQueryData(draftKeys.detail(draft.id), draft);
      qc.invalidateQueries({ queryKey: draftKeys.all });
    },
  });
}

export function useSendDraft(draftId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SendDraftRequest = {}) =>
      api<MessageDraft>(
        "post",
        Endpoints.messages.draft.send(draftId!),
        body,
      ),
    onSuccess: (draft) => {
      qc.setQueryData(draftKeys.detail(draft.id), draft);
      qc.invalidateQueries({ queryKey: draftKeys.all });
    },
  });
}

export function useRejectDraft(draftId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RejectDraftRequest = {}) =>
      api<MessageDraft>(
        "post",
        Endpoints.messages.draft.reject(draftId!),
        body,
      ),
    onSuccess: (draft) => {
      qc.setQueryData(draftKeys.detail(draft.id), draft);
      qc.invalidateQueries({ queryKey: draftKeys.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Orchestrator — the single hook the sheet consumes. Owns the local edit
// buffer (text typed but not yet persisted) and exposes the four lifecycle
// actions the UI needs: edit (just persist the edit), send (no edited text),
// sendEdited (combined edit + send via the CG-6 endpoint), and discard
// (rejects the draft so the AI feedback loop sees it as unwanted).
// ---------------------------------------------------------------------------

export interface UseMessageDraftReturn {
  draft: MessageDraft | undefined;
  isLoading: boolean;
  error: unknown;
  editedText: string;
  setEditedText: (text: string) => void;
  isEdited: boolean;
  isMutating: boolean;
  edit: () => Promise<void>;
  send: () => Promise<void>;
  sendEdited: () => Promise<void>;
  discard: (reason?: string) => Promise<void>;
}

export function useMessageDraft(
  draftId: number | null,
): UseMessageDraftReturn {
  const detail = useDraftDetail(draftId);
  const editMut = useEditDraft(draftId);
  const sendMut = useSendDraft(draftId);
  const rejectMut = useRejectDraft(draftId);

  const draft = detail.data;
  const baselineText = draft
    ? draft.edited_text ?? draft.original_text ?? ""
    : "";
  const [editedText, setEditedText] = useState(baselineText);

  // Reset the edit buffer whenever the underlying draft changes (id swap,
  // refetch with new edited_text, or first load). Without this, opening a
  // second draft after closing the first would surface the previous text.
  useEffect(() => {
    setEditedText(baselineText);
  }, [draftId, baselineText]);

  const isEdited = Boolean(draft) && editedText !== baselineText;

  // Persist the edit (no send). The backend marks the draft `edited`
  // (status surfaces as `approved` per the contract envelope) and stores
  // the diff for AI feedback analytics.
  const edit = useCallback(async () => {
    if (!draftId || !isEdited) return;
    await editMut.mutateAsync({ edited_text: editedText });
  }, [draftId, isEdited, editedText, editMut]);

  // Send as-is — no inline edit. Fires when the tech approves the AI text
  // verbatim. Backend will auto-approve before marking sent.
  const send = useCallback(async () => {
    if (!draftId) return;
    await sendMut.mutateAsync({});
  }, [draftId, sendMut]);

  // Combined edit + send (CG-6). Avoids the client-side double-mutation
  // race where the edit succeeds but the send fails — leaving the draft
  // half-finished. Backend handles both inside one transaction.
  const sendEdited = useCallback(async () => {
    if (!draftId) return;
    await sendMut.mutateAsync({ edited_text: editedText });
  }, [draftId, editedText, sendMut]);

  const discard = useCallback(
    async (reason?: string) => {
      if (!draftId) return;
      await rejectMut.mutateAsync(reason ? { reason } : {});
    },
    [draftId, rejectMut],
  );

  return {
    draft,
    isLoading: detail.isLoading,
    error: detail.error,
    editedText,
    setEditedText,
    isEdited,
    isMutating: editMut.isPending || sendMut.isPending || rejectMut.isPending,
    edit,
    send,
    sendEdited,
    discard,
  };
}
