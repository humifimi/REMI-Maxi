import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { AppSheet, type AppSheetRef } from "@technician/components/sheets";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMessageDraft } from "@technician/hooks/ai/use-message-draft";
import { INTENT_DISPLAY } from "@technician/types/messaging";
import type { TextInput } from "react-native";
import type { DraftIntent } from "@technician/types/messaging";

interface MessageDraftSheetProps {
  draftId: number | null;
  onClose: () => void;
}

// Bottom sheet for reviewing, editing, sending, or discarding an AI-generated
// customer message. Mounts once per draft id (parent unmount/remount on swap),
// and drives the full lifecycle through `useMessageDraft`. Per
// `docs/implementation-plans/ai-message-draft-contract.md` § 5 the sheet has
// four sections: header (recipient + intent + trigger), editable body, "Why
// this message" collapsible, and the action row.
export function MessageDraftSheet({
  draftId,
  onClose,
}: MessageDraftSheetProps) {
  const sheetRef = useRef<AppSheetRef>(null);
  const inputRef = useRef<TextInput>(null);
  const snapPoints = useMemo(() => ["72%", "92%"], []);

  const {
    draft,
    isLoading,
    editedText,
    setEditedText,
    isEdited,
    isMutating,
    send,
    sendEdited,
    discard,
  } = useMessageDraft(draftId);

  const [isEditMode, setIsEditMode] = useState(false);
  const [whyExpanded, setWhyExpanded] = useState(false);

  // Reset transient UI state on draft swap so a previous edit-in-progress
  // doesn't bleed into the new draft.
  useEffect(() => {
    setIsEditMode(false);
    setWhyExpanded(false);
  }, [draftId]);

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) {
        setIsEditMode(false);
        onClose();
      }
    },
    [onClose],
  );

  const handleEdit = useCallback(() => {
    setIsEditMode(true);
    // Wait a tick for the input to become editable before stealing focus —
    // RN won't focus a disabled input even if `editable` flips synchronously.
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const handleSend = useCallback(async () => {
    try {
      if (isEdited) {
        await sendEdited();
      } else {
        await send();
      }
      sheetRef.current?.close();
    } catch (e) {
      Alert.alert(
        "Couldn't send",
        e instanceof Error ? e.message : "Try again in a moment.",
      );
    }
  }, [isEdited, send, sendEdited]);

  const handleDiscard = useCallback(() => {
    Alert.alert(
      "Discard Draft?",
      "This AI-generated message will not be sent. The AI will learn from your decision.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: async () => {
            try {
              await discard("technician_discarded");
            } catch {
              // best-effort — close even if the reject call fails so the
              // sheet doesn't strand the user with a dead modal
            } finally {
              sheetRef.current?.close();
            }
          },
        },
      ],
    );
  }, [discard]);

  if (!draftId) return null;

  return (
    <AppSheet defaultSide="right"
      ref={sheetRef}
      index={0}
      defaultSnapPoints={snapPoints}
      enablePanDownToClose
      onChange={handleSheetChange}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handleIndicator}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <BottomSheetView style={styles.content}>
          {isLoading || !draft ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color="#3B82F6" />
              <Text style={styles.loadingText}>Loading draft…</Text>
            </View>
          ) : (
            <DraftBody
              recipientName={draft.recipient.name}
              recipientMasked={draft.recipient.masked_contact}
              recipientMethod={draft.recipient.contact_method}
              intent={draft.intent}
              triggerReason={draft.trigger_reason}
              editedText={editedText}
              onChangeText={setEditedText}
              isEditMode={isEditMode}
              isEdited={isEdited}
              isMutating={isMutating}
              whyExpanded={whyExpanded}
              onToggleWhy={() => setWhyExpanded((v) => !v)}
              inputRef={inputRef}
              onEdit={handleEdit}
              onSend={handleSend}
              onDiscard={handleDiscard}
            />
          )}
        </BottomSheetView>
      </KeyboardAvoidingView>
    </AppSheet>
  );
}

interface DraftBodyProps {
  recipientName: string;
  recipientMasked: string;
  recipientMethod: "sms" | "email" | "push";
  intent: DraftIntent;
  triggerReason: string | null;
  editedText: string;
  onChangeText: (text: string) => void;
  isEditMode: boolean;
  isEdited: boolean;
  isMutating: boolean;
  whyExpanded: boolean;
  onToggleWhy: () => void;
  inputRef: React.RefObject<TextInput | null>;
  onEdit: () => void;
  onSend: () => void;
  onDiscard: () => void;
}

function DraftBody({
  recipientName,
  recipientMasked,
  recipientMethod,
  intent,
  triggerReason,
  editedText,
  onChangeText,
  isEditMode,
  isEdited,
  isMutating,
  whyExpanded,
  onToggleWhy,
  inputRef,
  onEdit,
  onSend,
  onDiscard,
}: DraftBodyProps) {
  const display = INTENT_DISPLAY[intent] ?? INTENT_DISPLAY.custom;
  const methodIcon =
    recipientMethod === "email"
      ? "mail-outline"
      : recipientMethod === "push"
        ? "notifications-none"
        : "sms";

  return (
    <>
      <View style={styles.header}>
        <View style={styles.recipientCol}>
          <Text style={styles.recipientLabel}>To</Text>
          <Text style={styles.recipientName} numberOfLines={1}>
            {recipientName}
          </Text>
          <View style={styles.recipientMetaRow}>
            <MaterialIcons name={methodIcon as never} size={12} color="#9CA3AF" />
            <Text style={styles.recipientMeta}>{recipientMasked}</Text>
          </View>
        </View>
        <View style={[styles.intentBadge, { backgroundColor: display.bg }]}>
          <MaterialIcons
            name={display.icon as never}
            size={14}
            color={display.color}
          />
          <Text style={[styles.intentBadgeText, { color: display.color }]}>
            {display.label}
          </Text>
        </View>
      </View>

      {triggerReason ? (
        <View style={styles.triggerRow}>
          <MaterialIcons name="auto-awesome" size={14} color="#6366F1" />
          <Text style={styles.triggerText} numberOfLines={whyExpanded ? 0 : 2}>
            {triggerReason}
          </Text>
        </View>
      ) : null}

      <View style={styles.messageContainer}>
        <BottomSheetTextInput
          ref={inputRef as never}
          style={[
            styles.messageInput,
            isEditMode && styles.messageInputActive,
          ]}
          value={editedText}
          onChangeText={onChangeText}
          multiline
          editable={isEditMode}
          textAlignVertical="top"
          placeholder="Message body…"
          placeholderTextColor="#9CA3AF"
        />
        {isEdited ? (
          <View style={styles.editedBadge}>
            <MaterialIcons name="edit" size={10} color="#3B82F6" />
            <Text style={styles.editedBadgeText}>Edited</Text>
          </View>
        ) : null}
      </View>

      <Pressable
        onPress={onToggleWhy}
        style={styles.whyToggle}
        accessibilityRole="button"
        accessibilityLabel="Why this message"
      >
        <MaterialIcons
          name={whyExpanded ? "expand-less" : "expand-more"}
          size={18}
          color="#6B7280"
        />
        <Text style={styles.whyToggleText}>Why this message</Text>
      </Pressable>
      {whyExpanded ? (
        <View style={styles.whyBody}>
          <Text style={styles.whyBodyText}>
            {triggerReason
              ? `${triggerReason}\n\nYour edits help the AI learn your tone — sent, edited, and discarded drafts all feed the same feedback loop.`
              : "REMI generated this message based on the customer's recent activity. Your edits help the AI learn your tone — sent, edited, and discarded drafts all feed the same feedback loop."}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          style={styles.discardBtn}
          onPress={onDiscard}
          disabled={isMutating}
        >
          <MaterialIcons name="delete-outline" size={18} color="#6B7280" />
          <Text style={styles.discardBtnText}>Discard</Text>
        </Pressable>

        <Pressable
          style={styles.editBtn}
          onPress={onEdit}
          disabled={isMutating || isEditMode}
        >
          <MaterialIcons
            name="edit"
            size={18}
            color={isEditMode ? "#9CA3AF" : "#3B82F6"}
          />
          <Text
            style={[
              styles.editBtnText,
              isEditMode && styles.editBtnTextDisabled,
            ]}
          >
            Edit
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.sendBtn,
            (isMutating || editedText.trim().length === 0) &&
              styles.sendBtnDisabled,
          ]}
          onPress={onSend}
          disabled={isMutating || editedText.trim().length === 0}
        >
          {isMutating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="send" size={16} color="#fff" />
              <Text style={styles.sendBtnText}>
                {isEdited ? "Send Edited" : "Send"}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheetBg: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handleIndicator: {
    backgroundColor: "#D1D5DB",
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 28,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "500",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
    gap: 12,
  },
  recipientCol: {
    flex: 1,
  },
  recipientLabel: {
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "500",
    marginBottom: 2,
  },
  recipientName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  recipientMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  recipientMeta: {
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  intentBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  intentBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  triggerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  triggerText: {
    fontSize: 13,
    color: "#4338CA",
    flex: 1,
    lineHeight: 18,
    fontWeight: "500",
  },
  messageContainer: {
    flex: 1,
    marginBottom: 8,
    position: "relative",
  },
  messageInput: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: "#111827",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    minHeight: 140,
  },
  messageInputActive: {
    borderColor: "#3B82F6",
    backgroundColor: "#FFFFFF",
  },
  editedBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  editedBadgeText: {
    fontSize: 11,
    color: "#3B82F6",
    fontWeight: "600",
  },
  whyToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
  },
  whyToggleText: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
  },
  whyBody: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  whyBodyText: {
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 19,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  discardBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    minHeight: 44,
  },
  discardBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    minHeight: 44,
  },
  editBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3B82F6",
  },
  editBtnTextDisabled: {
    color: "#9CA3AF",
  },
  sendBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#22C55E",
    minHeight: 48,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
