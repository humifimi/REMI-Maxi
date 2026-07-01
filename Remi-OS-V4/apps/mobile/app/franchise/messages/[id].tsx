import { useEffect, useMemo, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  useFranchiseConversation,
  useSendFranchiseMessage,
} from "@technician/hooks/communication/use-franchise-messages";
import type {
  FranchiseConversationListItem,
  Message,
} from "@technician/types/api";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";
import { useAuthStore } from "@/src/stores/auth";

/**
 * MSG-FE-FO-1 — Franchise Owner thread + composer.
 *
 * Dual-attribution rendering: every bubble shows both the
 * "voice" (sender_type/sender_user_id) and, for silent-takeover
 * sends, the actual sender (sent_by_user_id) as a "via …"
 * subtitle. The customer side never sees this distinction —
 * customers only see the technician's voice — but the FO
 * audit-trail surface needs it visible per the locked decision
 * "Audit trail is non-optional".
 *
 * Composer has two voices:
 *   - "Send as Me" (default) → POSTs with
 *     `on_behalf_of_technician: false`. Backend writes
 *     `sender_type='franchise_owner'`.
 *   - "Send as Josh" (the assigned tech) → POSTs with
 *     `on_behalf_of_technician: true`. Backend writes
 *     `sender_type='technician'`,
 *     `sent_by_user_id=foUserId`. A confirmation modal fires
 *     before the request because the customer sees this as the
 *     tech speaking.
 */

type SendVoice = "fo" | "tech";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

interface FOBubbleProps {
  message: Message;
  technicianName: string | null;
  customerName: string | null;
  foUserId: number | null;
}

function FOBubble({
  message,
  technicianName,
  customerName,
  foUserId,
}: FOBubbleProps) {
  if (message.sender_type === "system") {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{message.body}</Text>
      </View>
    );
  }

  const isCustomerSide = message.sender_type === "customer";
  const isInternal = message.is_internal;

  // Detect silent takeover: actual sender (sent_by_user_id)
  // diverges from the voice (sender_user_id). This is only
  // possible on a `technician`-voice message authored by an FO.
  const isTakeover =
    message.sender_type === "technician" &&
    message.sent_by_user_id !== null &&
    message.sent_by_user_id !== undefined &&
    message.sender_user_id !== null &&
    message.sender_user_id !== undefined &&
    message.sent_by_user_id !== message.sender_user_id;

  // Voice label = who the customer thinks they're talking to.
  let voiceLabel: string;
  let voiceBadgeStyle = styles.voiceBadgeTech;
  let voiceTextStyle = styles.voiceBadgeTextTech;
  switch (message.sender_type) {
    case "customer":
      voiceLabel = customerName ?? "Customer";
      voiceBadgeStyle = styles.voiceBadgeCustomer;
      voiceTextStyle = styles.voiceBadgeTextCustomer;
      break;
    case "technician":
      voiceLabel = technicianName ?? "Technician";
      voiceBadgeStyle = styles.voiceBadgeTech;
      voiceTextStyle = styles.voiceBadgeTextTech;
      break;
    case "franchise_owner":
      voiceLabel =
        message.sender_user_id === foUserId ? "You (Franchise Owner)" : "Franchise Owner";
      voiceBadgeStyle = styles.voiceBadgeFO;
      voiceTextStyle = styles.voiceBadgeTextFO;
      break;
    default:
      voiceLabel = "Unknown";
  }

  // For takeover, the actual sender is the FO. We don't have a
  // names map for arbitrary user IDs, so the "via" line just
  // says whether the actual sender was the current FO viewing
  // (== you) or some other FO in the franchise.
  const viaLabel = isTakeover
    ? message.sent_by_user_id === foUserId
      ? "via you (Franchise Owner)"
      : "via another Franchise Owner"
    : null;

  return (
    <View
      style={[
        styles.bubbleRow,
        isCustomerSide ? styles.incomingRow : styles.outgoingRow,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isInternal
            ? styles.internalBubble
            : isCustomerSide
              ? styles.incomingBubble
              : message.sender_type === "franchise_owner"
                ? styles.foBubble
                : isTakeover
                  ? styles.takeoverBubble
                  : styles.outgoingBubble,
        ]}
      >
        <View style={styles.bubbleHeader}>
          <View style={[styles.voiceBadge, voiceBadgeStyle]}>
            <Text style={[styles.voiceBadgeText, voiceTextStyle]}>
              {voiceLabel}
            </Text>
          </View>
          {isInternal && (
            <View style={styles.internalTag}>
              <MaterialIcons name="lock" size={10} color="#92400E" />
              <Text style={styles.internalTagText}>Internal</Text>
            </View>
          )}
        </View>
        <Text
          style={[
            styles.bubbleText,
            isInternal
              ? styles.internalText
              : isCustomerSide
                ? styles.incomingText
                : styles.outgoingText,
          ]}
        >
          {message.body}
        </Text>
        {viaLabel !== null && <Text style={styles.viaLabel}>{viaLabel}</Text>}
        <Text
          style={[
            styles.bubbleTime,
            isCustomerSide ? styles.incomingTime : styles.outgoingTime,
          ]}
        >
          {formatTime(message.created_at)}
        </Text>
      </View>
    </View>
  );
}

interface ConversationHeaderProps {
  conversation: FranchiseConversationListItem;
}

function ConversationHeader({ conversation }: ConversationHeaderProps) {
  return (
    <View style={styles.headerCard}>
      <View style={styles.headerRow}>
        <MaterialIcons name="person" size={16} color="#6B7280" />
        <Text style={styles.headerLabel}>Customer</Text>
        <Text style={styles.headerValue} numberOfLines={1}>
          {conversation.customer_name ?? "Unknown"}
        </Text>
      </View>
      <View style={styles.headerRow}>
        <MaterialIcons name="build" size={16} color="#6B7280" />
        <Text style={styles.headerLabel}>Technician</Text>
        <Text style={styles.headerValue} numberOfLines={1}>
          {conversation.technician_name ?? "Unassigned"}
        </Text>
      </View>
    </View>
  );
}

export default function FranchiseConversationDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Number(id);
  const flatListRef = useRef<FlatList<Message>>(null);

  const foUserId = useAuthStore((s) => s.user?.userId ?? null);

  const { data, isLoading } = useFranchiseConversation(
    Number.isFinite(conversationId) ? conversationId : null,
  );
  const sendMessage = useSendFranchiseMessage();

  const [draft, setDraft] = useState("");
  const [voice, setVoice] = useState<SendVoice>("fo");

  // Filter to customer-channel messages only (FO surface
  // intentionally hides `is_internal` notes for v1; see the
  // plan's "Out of scope: FO internal-only notes" note).
  const messages = useMemo(() => {
    if (!data) return [] as Message[];
    return data.messages.filter((m) => !m.is_internal);
  }, [data]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(
        () => flatListRef.current?.scrollToEnd({ animated: false }),
        100,
      );
    }
  }, [messages.length]);

  const technicianName = data?.conversation.technician_name ?? null;
  const customerName = data?.conversation.customer_name ?? null;

  const submit = (onBehalfOfTechnician: boolean) => {
    const body = draft.trim();
    if (body.length === 0) return;
    sendMessage.mutate(
      {
        conversationId,
        body,
        onBehalfOfTechnician,
      },
      {
        onSuccess: () => {
          setDraft("");
        },
        onError: () => {
          Alert.alert(
            "Send failed",
            "Could not send your message. Check your connection and try again.",
          );
        },
      },
    );
  };

  const handleSendPress = () => {
    if (sendMessage.isPending || draft.trim().length === 0) return;
    if (voice === "fo") {
      submit(false);
      return;
    }
    Alert.alert(
      "Send as " + (technicianName ?? "the technician") + "?",
      `This will appear to the customer as if ${
        technicianName ?? "the assigned technician"
      } sent it. The audit trail will record you as the actual sender. Continue?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send as " + (technicianName ?? "tech"),
          style: "default",
          onPress: () => submit(true),
        },
      ],
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: data?.conversation.customer_name ?? "Conversation",
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
        {isLoading || !data ? (
          <SkeletonListScreen cards={4} />
        ) : (
          <>
            <ConversationHeader conversation={data.conversation} />
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(m) => String(m.id)}
              renderItem={({ item }) => (
                <FOBubble
                  message={item}
                  technicianName={technicianName}
                  customerName={customerName}
                  foUserId={foUserId}
                />
              )}
              contentContainerStyle={styles.messageList}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <MaterialIcons name="chat-bubble-outline" size={40} color="#D1D5DB" />
                  <Text style={styles.emptyText}>No messages yet.</Text>
                </View>
              }
            />
          </>
        )}

        <View style={styles.composer}>
          <View style={styles.voiceRow}>
            <Pressable
              style={[styles.voiceBtn, voice === "fo" && styles.voiceBtnActiveFO]}
              onPress={() => setVoice("fo")}
              accessibilityRole="button"
              accessibilityState={{ selected: voice === "fo" }}
            >
              <MaterialIcons
                name="account-circle"
                size={16}
                color={voice === "fo" ? "#fff" : "#6B21A8"}
              />
              <Text
                style={[
                  styles.voiceBtnText,
                  voice === "fo" && styles.voiceBtnTextActive,
                ]}
                numberOfLines={1}
              >
                Send as Me
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.voiceBtn,
                voice === "tech" && styles.voiceBtnActiveTech,
              ]}
              onPress={() => setVoice("tech")}
              accessibilityRole="button"
              accessibilityState={{ selected: voice === "tech" }}
              disabled={technicianName === null}
            >
              <MaterialIcons
                name="build"
                size={16}
                color={voice === "tech" ? "#fff" : "#1D4ED8"}
              />
              <Text
                style={[
                  styles.voiceBtnText,
                  voice === "tech" && styles.voiceBtnTextActive,
                ]}
                numberOfLines={1}
              >
                {technicianName !== null
                  ? `Send as ${technicianName.split(" ")[0]}`
                  : "Send as Tech"}
              </Text>
            </Pressable>
          </View>
          {voice === "tech" && (
            <View style={styles.takeoverBanner}>
              <MaterialIcons name="info-outline" size={13} color="#1D4ED8" />
              <Text style={styles.takeoverBannerText} numberOfLines={2}>
                The customer will see this as if {technicianName ?? "the tech"} sent it.
                Your name is recorded in the audit trail.
              </Text>
            </View>
          )}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder={
                voice === "tech"
                  ? `Message as ${technicianName ?? "tech"}…`
                  : "Message as yourself…"
              }
              placeholderTextColor="#9CA3AF"
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={2000}
            />
            <Pressable
              style={[
                styles.sendBtn,
                (sendMessage.isPending || draft.trim().length === 0) &&
                  styles.sendBtnDisabled,
              ]}
              onPress={handleSendPress}
              disabled={sendMessage.isPending || draft.trim().length === 0}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              <MaterialIcons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  headerCard: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    gap: 6,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    width: 84,
  },
  headerValue: { fontSize: 14, color: "#111827", flex: 1 },
  messageList: { padding: 16, paddingBottom: 8 },
  bubbleRow: { marginBottom: 10 },
  outgoingRow: { alignItems: "flex-end" },
  incomingRow: { alignItems: "flex-start" },
  bubble: {
    maxWidth: "85%",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  outgoingBubble: { backgroundColor: "#3B82F6", borderBottomRightRadius: 4 },
  incomingBubble: { backgroundColor: "#E5E7EB", borderBottomLeftRadius: 4 },
  foBubble: {
    backgroundColor: "#7C3AED",
    borderBottomRightRadius: 4,
  },
  takeoverBubble: {
    backgroundColor: "#3B82F6",
    borderBottomRightRadius: 4,
    borderWidth: 2,
    borderColor: "#7C3AED",
  },
  internalBubble: {
    backgroundColor: "#FEF3C7",
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  bubbleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  voiceBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  voiceBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  voiceBadgeCustomer: { backgroundColor: "#fff" },
  voiceBadgeTextCustomer: { color: "#374151" },
  voiceBadgeTech: { backgroundColor: "rgba(255,255,255,0.25)" },
  voiceBadgeTextTech: { color: "#fff" },
  voiceBadgeFO: { backgroundColor: "rgba(255,255,255,0.25)" },
  voiceBadgeTextFO: { color: "#fff" },
  internalTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(146, 64, 14, 0.1)",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  internalTagText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#92400E",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  outgoingText: { color: "#fff" },
  incomingText: { color: "#111827" },
  internalText: { color: "#78350F" },
  viaLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.85)",
    fontStyle: "italic",
    marginTop: 4,
  },
  bubbleTime: { fontSize: 11, marginTop: 4 },
  outgoingTime: { color: "rgba(255,255,255,0.7)", textAlign: "right" },
  incomingTime: { color: "#9CA3AF" },
  systemRow: { alignItems: "center", marginVertical: 12 },
  systemText: { fontSize: 12, color: "#9CA3AF", fontStyle: "italic" },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, color: "#9CA3AF", textAlign: "center" },
  composer: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    padding: 12,
    gap: 8,
  },
  voiceRow: { flexDirection: "row", gap: 8 },
  voiceBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  voiceBtnActiveFO: { backgroundColor: "#7C3AED", borderColor: "#7C3AED" },
  voiceBtnActiveTech: { backgroundColor: "#1D4ED8", borderColor: "#1D4ED8" },
  voiceBtnText: { fontSize: 13, fontWeight: "700", color: "#374151" },
  voiceBtnTextActive: { color: "#fff" },
  takeoverBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "#DBEAFE",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  takeoverBannerText: {
    flex: 1,
    fontSize: 12,
    color: "#1D4ED8",
    lineHeight: 16,
  },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#F9FAFB",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: "#93C5FD" },
});
