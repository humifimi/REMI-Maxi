import { useState, useRef, useCallback, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  useCopilotChatStart,
  useCopilotChatSend,
  useCopilotChatEnd,
} from "@technician/hooks/ai/use-copilot";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { IS_EXPO_GO } from "@technician/constants/runtime";
import type { ChatMessage, ChatSource } from "@technician/types/copilot";

const SOURCE_TYPE_ICONS: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  sop: "menu-book",
  inventory: "inventory",
  vehicle_db: "directions-car",
  training: "school",
  general: "language",
};

const SOURCE_TYPE_COLORS: Record<string, string> = {
  sop: "#3B82F6",
  inventory: "#F59E0B",
  vehicle_db: "#8B5CF6",
  training: "#22C55E",
  general: "#6B7280",
};

export default function CopilotChatScreen() {
  const params = useLocalSearchParams<{ appointmentId?: string }>();
  const appointmentId = params.appointmentId
    ? parseInt(params.appointmentId, 10)
    : undefined;
  const router = useRouter();
  // PLAN-DEVIATION: 2026-04-26-ask-remi-session-wire — the BE chat is
  // sessionful. We start a session on screen mount, send messages keyed by
  // sessionId, and best-effort end the session on unmount. See
  // docs/PLAN-DEVIATIONS.md#2026-04-26-ask-remi-session-wire.
  const startMutation = useCopilotChatStart();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sendMutation = useCopilotChatSend(sessionId);
  const endMutation = useCopilotChatEnd();
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [sessionError, setSessionError] = useState(false);

  const startMutateRef = useRef(startMutation.mutate);
  startMutateRef.current = startMutation.mutate;
  const endMutateRef = useRef(endMutation.mutate);
  endMutateRef.current = endMutation.mutate;

  useEffect(() => {
    // Pass appointment_id so the BE seeds the system prompt with the
    // active job's vehicle/customer/services. See PLAN-DEVIATIONS.md#
    // 2026-04-26-ask-remi-session-wire (round 2).
    startMutateRef.current(
      appointmentId ? { appointment_id: appointmentId } : undefined,
      {
        onSuccess: (data) => {
          setSessionId(data.sessionId);
        },
        onError: () => {
          setSessionError(true);
        },
      },
    );
  }, [appointmentId]);

  useEffect(() => {
    return () => {
      if (sessionId) {
        endMutateRef.current(sessionId);
      }
    };
  }, [sessionId]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages.length, scrollToBottom]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || sendMutation.isPending || !sessionId) return;

    haptic.light();
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputText("");

    sendMutation.mutate(
      { message: text },
      {
        onSuccess: (response) => {
          const assistantMessage: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: response.reply,
            created_at: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
        },
        onError: () => {
          const errorMessage: ChatMessage = {
            id: `error-${Date.now()}`,
            role: "assistant",
            content:
              "Sorry, I couldn't process your request right now. The AI service may be unavailable. Please try again.",
            created_at: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, errorMessage]);
        },
      }
    );
  }, [inputText, sendMutation, sessionId]);

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => {
      const isUser = item.role === "user";
      return (
        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.assistantBubble,
          ]}
        >
          {!isUser ? (
            <View style={styles.assistantIcon}>
              <MaterialIcons name="auto-awesome" size={14} color="#fff" />
            </View>
          ) : null}
          <View
            style={[
              styles.bubbleContent,
              isUser ? styles.userContent : styles.assistantContent,
            ]}
          >
            <Text
              style={[
                styles.messageText,
                isUser ? styles.userText : styles.assistantText,
              ]}
            >
              {item.content}
            </Text>
            {item.sources && item.sources.length > 0 ? (
              <View style={styles.sourcesRow}>
                {item.sources.map((source: ChatSource) => (
                  <Pressable
                    key={source.id}
                    style={styles.sourcePill}
                    onPress={() => {
                      haptic.selection();
                    }}
                  >
                    <MaterialIcons
                      name={SOURCE_TYPE_ICONS[source.type] ?? "language"}
                      size={12}
                      color={SOURCE_TYPE_COLORS[source.type] ?? "#6B7280"}
                    />
                    <Text
                      style={[
                        styles.sourceText,
                        {
                          color:
                            SOURCE_TYPE_COLORS[source.type] ?? "#6B7280",
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {source.title}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      );
    },
    []
  );

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Ask REMI",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
          headerRight: () => (
            <View style={styles.headerBadge}>
              <MaterialIcons name="auto-awesome" size={16} color="#8B5CF6" />
              <Text style={styles.headerBadgeText}>AI</Text>
            </View>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyChat}>
            <View style={styles.emptyChatIcon}>
              <MaterialIcons name="auto-awesome" size={40} color="#8B5CF6" />
            </View>
            <Text style={styles.emptyChatTitle}>Ask REMI Anything</Text>
            <Text style={styles.emptyChatBody}>
              Get instant answers about vehicle specs, service procedures,
              inventory, and more.
            </Text>
            <View style={styles.suggestionGrid}>
              <SuggestionChip
                text="What oil does this vehicle need?"
                onPress={() => setInputText("What oil does this vehicle need?")}
              />
              <SuggestionChip
                text="Do we have cabin filters in stock?"
                onPress={() => setInputText("Do we have cabin filters in stock?")}
              />
              <SuggestionChip
                text="What's the SOP for brake inspection?"
                onPress={() => setInputText("What's the SOP for brake inspection?")}
              />
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={keyExtractor}
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
            onContentSizeChange={scrollToBottom}
          />
        )}

        {sendMutation.isPending ? (
          <View style={styles.typingIndicator}>
            <ActivityIndicator size="small" color="#8B5CF6" />
            <Text style={styles.typingText}>REMI is thinking...</Text>
          </View>
        ) : !sessionId && !sessionError ? (
          <View style={styles.typingIndicator}>
            <ActivityIndicator size="small" color="#8B5CF6" />
            <Text style={styles.typingText}>Connecting to REMI...</Text>
          </View>
        ) : sessionError ? (
          <View style={styles.typingIndicator}>
            <MaterialIcons name="error-outline" size={14} color="#EF4444" />
            <Text style={[styles.typingText, { color: "#EF4444" }]}>
              Couldn&apos;t connect to REMI. Try reopening this screen.
            </Text>
          </View>
        ) : null}

        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            placeholder="Ask a question..."
            placeholderTextColor="#9CA3AF"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={1000}
            returnKeyType="default"
            blurOnSubmit={false}
          />
          {/* The voice copilot relies on react-native-webrtc, a native
              module that doesn't exist in Expo Go. Loading the route
              there triggers an Invariant Violation at JS-eval time and
              expo-router never registers /copilot/voice — tapping the
              mic lands the user on an "Unmatched Route" screen. Hide
              the mic in Expo Go so the chat stays usable; full builds
              keep voice as before. Rebuild on a dev-client / EAS build
              to test voice locally. */}
          {IS_EXPO_GO ? null : (
            <Pressable
              style={styles.micBtn}
              onPress={() => {
                haptic.medium();
                const qs = appointmentId
                  ? `?appointmentId=${appointmentId}`
                  : "";
                router.push(`/copilot/voice${qs}` as never);
              }}
              hitSlop={6}
            >
              <MaterialIcons name="mic" size={20} color="#8B5CF6" />
            </Pressable>
          )}
          <Pressable
            style={[
              styles.sendBtn,
              (!inputText.trim() ||
                sendMutation.isPending ||
                !sessionId) &&
                styles.sendBtnDisabled,
            ]}
            onPress={handleSend}
            disabled={
              !inputText.trim() || sendMutation.isPending || !sessionId
            }
          >
            <MaterialIcons name="send" size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

function SuggestionChip({
  text,
  onPress,
}: {
  text: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.suggestionChip} onPress={onPress}>
      <MaterialIcons name="lightbulb-outline" size={14} color="#8B5CF6" />
      <Text style={styles.suggestionText}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },

  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(139,92,246,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8B5CF6",
  },

  messageList: { flex: 1 },
  messageListContent: { padding: 16, paddingBottom: 8 },

  messageBubble: {
    flexDirection: "row",
    marginBottom: 16,
    maxWidth: "88%",
  },
  userBubble: { alignSelf: "flex-end" },
  assistantBubble: { alignSelf: "flex-start", gap: 8 },

  assistantIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#8B5CF6",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  bubbleContent: {
    borderRadius: 18,
    padding: 14,
    maxWidth: "100%",
    flexShrink: 1,
  },
  userContent: {
    backgroundColor: "#3B82F6",
    borderBottomRightRadius: 4,
  },
  assistantContent: {
    backgroundColor: "#fff",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: { color: "#fff" },
  assistantText: { color: "#111827" },

  sourcesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  sourcePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sourceText: {
    fontSize: 12,
    fontWeight: "600",
    maxWidth: 140,
  },

  typingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  typingText: { fontSize: 13, color: "#8B5CF6", fontWeight: "500" },

  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    paddingBottom: Platform.OS === "ios" ? 28 : 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    gap: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: "#111827",
    maxHeight: 120,
    minHeight: 44,
  },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },

  emptyChat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyChatIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyChatTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
  },
  emptyChatBody: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
  },
  suggestionGrid: {
    gap: 8,
    marginTop: 8,
    width: "100%",
  },
  suggestionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EDE9FE",
  },
  suggestionText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
    flex: 1,
  },
});
