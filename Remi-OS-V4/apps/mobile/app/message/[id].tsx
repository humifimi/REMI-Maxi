import { useRef, useEffect, useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  useConversationMessages,
  useConversationRealtime,
  useConversations,
  useTemplates,
  useSendMessage,
} from "@technician/hooks/communication/use-messages";
import type { Message, MessageTemplate } from "@technician/types/api";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";

type ChannelFilter = "customer" | "internal";

/**
 * Substitute the customer's first name into a `{name}` placeholder
 * for display surfaces (QuickText chip preview, confirm bar). The
 * BE composes the stored body from the template's `body` field
 * directly — see MSG-FE-TECH dev-log entry for the follow-up that
 * moves substitution server-side. Until that lands, this keeps the
 * technician-side preview readable.
 */
function substituteName(template: string, fullName: string | null): string {
  if (!template.includes("{name}")) return template;
  const firstName = fullName?.trim().split(/\s+/)[0] ?? "there";
  return template.replaceAll("{name}", firstName);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * MSG-FE-FO-2 — Tech-side rendering of FO-authored messages.
 *
 * Two distinct FO authorship modes from MSG-BE-2 land in the
 * tech inbox now:
 *
 * 1. **FO voice** (`sender_type === 'franchise_owner'`). The
 *    customer sees this as "Customer Support" (handled in
 *    REMICustomer); the tech sees it on their own
 *    (right/outgoing) side because the FO is on the same team
 *    — but with a **purple bubble + "Franchise Owner" badge**
 *    so the tech immediately knows it's not their own message.
 *    Without this, the tech would mistake an FO-authored "we're
 *    running late" for the customer's reply (the bug shipped in
 *    MSG-FE-FO-1).
 *
 * 2. **Silent takeover** (`sender_type === 'technician'` AND
 *    `sent_by_user_id !== sender_user_id` AND `sent_by_user_id`
 *    set). The customer sees the tech as the voice; the FO
 *    audit-trail records the FO as the actual author. On the
 *    tech side we render the bubble in the normal tech blue but
 *    add a small **"via Franchise Owner"** subtitle so the tech
 *    knows their voice was used. The locked-decision "silent on
 *    the customer side" still holds — REMICustomer does NOT
 *    render this subtitle. See PLAN-DEVIATIONS.md
 *    `2026-04-26-msg-redo` for the full rationale.
 */
function Bubble({ message }: { message: Message }) {
  const isCustomer = message.sender_type === "customer";
  const isFranchiseOwner = message.sender_type === "franchise_owner";
  const isSystem = message.sender_type === "system";
  const isInternal = message.is_internal;

  // Takeover detection: a `technician`-voice message whose actual
  // author (`sent_by_user_id`) diverges from the voice
  // (`sender_user_id`). Only possible when an FO used Send-as-Tech.
  const isTakeover =
    message.sender_type === "technician" &&
    message.sent_by_user_id != null &&
    message.sender_user_id != null &&
    message.sent_by_user_id !== message.sender_user_id;

  if (isSystem) {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{message.body}</Text>
      </View>
    );
  }

  // Tech AND FO sit on the same (outgoing/right) side because
  // both are "the team" from the assigned technician's POV.
  const isOutgoing = !isCustomer;

  return (
    <View
      style={[styles.bubbleRow, isOutgoing ? styles.outgoingRow : styles.incomingRow]}
    >
      <View
        style={[
          styles.bubble,
          isInternal
            ? styles.internalBubble
            : isFranchiseOwner
              ? styles.foBubble
              : isOutgoing
                ? styles.outgoingBubble
                : styles.incomingBubble,
        ]}
      >
        {(isFranchiseOwner || isInternal) && (
          <View style={styles.bubbleHeader}>
            {isFranchiseOwner && (
              <View style={styles.foBadge}>
                <MaterialIcons name="shield" size={10} color="#fff" />
                <Text style={styles.foBadgeText}>Franchise Owner</Text>
              </View>
            )}
            {isInternal && (
              <View style={styles.internalTag}>
                <MaterialIcons name="lock" size={11} color="#92400E" />
                <Text style={styles.internalTagText}>Internal</Text>
              </View>
            )}
          </View>
        )}
        {message.is_pinned && (
          <View style={styles.pinnedInlineTag}>
            <MaterialIcons name="push-pin" size={11} color="#6B7280" />
          </View>
        )}
        <Text
          style={[
            styles.bubbleText,
            isInternal
              ? styles.internalText
              : isFranchiseOwner
                ? styles.foText
                : isOutgoing
                  ? styles.outgoingText
                  : styles.incomingText,
          ]}
        >
          {message.body}
        </Text>
        {isTakeover && (
          <Text style={styles.takeoverNote}>via Franchise Owner</Text>
        )}
        <Text
          style={[
            styles.bubbleTime,
            isInternal
              ? styles.internalTime
              : isFranchiseOwner
                ? styles.foTime
                : isOutgoing
                  ? styles.outgoingTime
                  : styles.incomingTime,
          ]}
        >
          {formatTime(message.created_at)}
        </Text>
      </View>
    </View>
  );
}

function PinnedNotes({ messages }: { messages: Message[] }) {
  const pinned = useMemo(
    () => messages.filter((m) => m.is_pinned),
    [messages]
  );

  if (pinned.length === 0) return null;

  return (
    <View style={styles.pinnedSection}>
      <View style={styles.pinnedHeader}>
        <MaterialIcons name="push-pin" size={14} color="#F59E0B" />
        <Text style={styles.pinnedHeaderText}>Pinned Notes</Text>
      </View>
      {pinned.map((m) => (
        <View key={m.id} style={styles.pinnedCard}>
          <Text style={styles.pinnedBody} numberOfLines={3}>
            {m.body}
          </Text>
          <Text style={styles.pinnedTime}>{formatTime(m.created_at)}</Text>
        </View>
      ))}
    </View>
  );
}

function TemplatePicker({
  templates,
  onSelect,
  sending,
}: {
  templates: readonly MessageTemplate[];
  onSelect: (t: MessageTemplate) => void;
  sending: boolean;
}) {
  if (templates.length === 0) return null;

  return (
    <View style={styles.templateBar}>
      <Text style={styles.templateLabel}>QuickText</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.templateScrollOuter}
        contentContainerStyle={styles.templateScroll}
      >
        {templates.map((t) => (
          <Pressable
            key={t.id}
            style={styles.templateChip}
            onPress={() => onSelect(t)}
            disabled={sending}
          >
            <Text style={styles.templateChipText} numberOfLines={1}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export default function ConversationDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Number(id);
  const flatListRef = useRef<FlatList<Message>>(null);

  const {
    data: messages,
    isLoading: messagesLoading,
  } = useConversationMessages(conversationId);
  const { data: templates = [] } = useTemplates();
  const { data: conversations } = useConversations();
  const conversation = useMemo(
    () => conversations?.find((c) => c.id === conversationId) ?? null,
    [conversations, conversationId],
  );
  const sendMessage = useSendMessage();
  const [confirmTemplate, setConfirmTemplate] = useState<MessageTemplate | null>(null);
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("customer");

  useConversationRealtime(Number.isFinite(conversationId) ? conversationId : null);

  const allMessages = messages ?? [];

  const filteredMessages = useMemo(() => {
    if (channelFilter === "internal") {
      return allMessages.filter((m) => m.is_internal);
    }
    return allMessages.filter((m) => !m.is_internal);
  }, [allMessages, channelFilter]);

  const internalCount = useMemo(
    () => allMessages.filter((m) => m.is_internal).length,
    [allMessages]
  );

  useEffect(() => {
    if (filteredMessages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
    }
  }, [filteredMessages]);

  const handleSend = (template: MessageTemplate) => {
    setConfirmTemplate(null);
    sendMessage.mutate({ conversationId, templateId: template.id });
  };

  const confirmPreviewText = confirmTemplate
    ? substituteName(confirmTemplate.body, conversation?.customer_name ?? null)
    : "";

  return (
    <>
      <Stack.Screen
        options={{
          title: "Conversation",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        {/* Channel Toggle */}
        <View style={styles.channelToggle}>
          <Pressable
            style={[
              styles.channelBtn,
              channelFilter === "customer" && styles.channelBtnActive,
            ]}
            onPress={() => setChannelFilter("customer")}
          >
            <MaterialIcons
              name="chat"
              size={16}
              color={channelFilter === "customer" ? "#fff" : "#6B7280"}
            />
            <Text
              style={[
                styles.channelBtnText,
                channelFilter === "customer" && styles.channelBtnTextActive,
              ]}
            >
              Customer
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.channelBtn,
              channelFilter === "internal" && styles.channelBtnInternalActive,
            ]}
            onPress={() => setChannelFilter("internal")}
          >
            <MaterialIcons
              name="lock"
              size={16}
              color={channelFilter === "internal" ? "#fff" : "#92400E"}
            />
            <Text
              style={[
                styles.channelBtnText,
                channelFilter === "internal" && styles.channelBtnTextActive,
                channelFilter !== "internal" && styles.channelBtnTextInternal,
              ]}
            >
              Internal
            </Text>
            {internalCount > 0 && channelFilter !== "internal" && (
              <View style={styles.internalCountBadge}>
                <Text style={styles.internalCountText}>{internalCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Pinned Notes (customer channel only) */}
        {channelFilter === "customer" && <PinnedNotes messages={allMessages} />}

        {messagesLoading ? (
          <SkeletonListScreen cards={4} />
        ) : (
          <FlatList
            ref={flatListRef}
            data={filteredMessages}
            keyExtractor={(m) => String(m.id)}
            renderItem={({ item }) => <Bubble message={item} />}
            contentContainerStyle={styles.messageList}
            ListEmptyComponent={
              <View style={styles.empty}>
                <MaterialIcons
                  name={channelFilter === "internal" ? "lock" : "chat-bubble-outline"}
                  size={40}
                  color="#D1D5DB"
                />
                <Text style={styles.emptyText}>
                  {channelFilter === "internal"
                    ? "No internal notes yet."
                    : "Send a QuickText to start the conversation."}
                </Text>
              </View>
            }
          />
        )}

        {confirmTemplate && (
          <View style={styles.confirmBar}>
            <View style={styles.confirmBody}>
              <Text style={styles.confirmLabel}>Send this message?</Text>
              <Text style={styles.confirmPreview}>{confirmPreviewText}</Text>
            </View>
            <View style={styles.confirmActions}>
              <Pressable
                style={styles.confirmCancel}
                onPress={() => setConfirmTemplate(null)}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.confirmSend}
                onPress={() => handleSend(confirmTemplate)}
              >
                <MaterialIcons name="send" size={18} color="#fff" />
                <Text style={styles.confirmSendText}>Send</Text>
              </Pressable>
            </View>
          </View>
        )}

        {channelFilter === "customer" && (
          <TemplatePicker
            templates={templates}
            onSelect={setConfirmTemplate}
            sending={sendMessage.isPending}
          />
        )}
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  channelToggle: {
    flexDirection: "row",
    padding: 10,
    gap: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  channelBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
  },
  channelBtnActive: {
    backgroundColor: "#3B82F6",
  },
  channelBtnInternalActive: {
    backgroundColor: "#92400E",
  },
  channelBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  channelBtnTextActive: {
    color: "#fff",
  },
  channelBtnTextInternal: {
    color: "#92400E",
  },
  internalCountBadge: {
    backgroundColor: "#FDE68A",
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  internalCountText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#92400E",
  },
  pinnedSection: {
    backgroundColor: "#FFFBEB",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#FDE68A",
  },
  pinnedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  pinnedHeaderText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#92400E",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pinnedCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: "#F59E0B",
  },
  pinnedBody: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 18,
  },
  pinnedTime: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 4,
  },
  messageList: { padding: 16, paddingBottom: 8 },
  bubbleRow: { marginBottom: 8 },
  outgoingRow: { alignItems: "flex-end" },
  incomingRow: { alignItems: "flex-start" },
  bubble: {
    maxWidth: "80%",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  outgoingBubble: {
    backgroundColor: "#3B82F6",
    borderBottomRightRadius: 4,
  },
  incomingBubble: {
    backgroundColor: "#E5E7EB",
    borderBottomLeftRadius: 4,
  },
  internalBubble: {
    backgroundColor: "#FEF3C7",
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  // MSG-FE-FO-2: FO-voice bubble. Same outgoing side as the
  // tech's own messages but a distinct purple so the tech does
  // not mistake an FO message for one of their own.
  foBubble: {
    backgroundColor: "#7C3AED",
    borderBottomRightRadius: 4,
  },
  bubbleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
    flexWrap: "wrap",
  },
  foBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  foBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  internalTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  internalTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#92400E",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pinnedInlineTag: {
    position: "absolute",
    top: 6,
    right: 6,
  },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  outgoingText: { color: "#fff" },
  incomingText: { color: "#111827" },
  internalText: { color: "#78350F" },
  foText: { color: "#fff" },
  bubbleTime: { fontSize: 11, marginTop: 4 },
  outgoingTime: { color: "rgba(255,255,255,0.7)", textAlign: "right" },
  incomingTime: { color: "#9CA3AF" },
  internalTime: { color: "#B45309", textAlign: "right" },
  foTime: { color: "rgba(255,255,255,0.75)", textAlign: "right" },
  // MSG-FE-FO-2: subtitle on takeover messages so the tech
  // knows their voice was used by the FO.
  takeoverNote: {
    fontSize: 11,
    fontStyle: "italic",
    color: "rgba(255,255,255,0.85)",
    textAlign: "right",
    marginTop: 2,
  },
  systemRow: { alignItems: "center", marginVertical: 12 },
  systemText: { fontSize: 12, color: "#9CA3AF", fontStyle: "italic" },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: { fontSize: 14, color: "#9CA3AF", textAlign: "center" },
  templateBar: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  templateLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  templateScrollOuter: { flexGrow: 0 },
  templateScroll: { gap: 8 },
  templateChip: {
    backgroundColor: "#EEF2FF",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  templateChipText: { fontSize: 13, fontWeight: "600", color: "#4F46E5" },
  confirmBar: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    padding: 16,
    gap: 12,
  },
  confirmBody: { gap: 4 },
  confirmLabel: { fontSize: 13, fontWeight: "700", color: "#374151" },
  confirmPreview: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
  },
  confirmActions: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
  confirmCancel: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  confirmCancelText: { fontSize: 14, fontWeight: "600", color: "#6B7280" },
  confirmSend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#3B82F6",
  },
  confirmSendText: { fontSize: 14, fontWeight: "600", color: "#fff" },
});
