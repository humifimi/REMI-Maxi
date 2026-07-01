import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';
import { EmptyState } from '@customer/components/shared/empty-state';
import {
  useConversationMessages,
  useConversationRealtime,
  useSendMessage,
} from '@customer/hooks/communication/use-messages';
import { lightTap } from '@customer/services/haptics';
import type { Message } from '@customer/types/api';

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Number(id);
  const scrollRef = useRef<ScrollView>(null);
  const [text, setText] = useState('');

  const { data: messages, isPending, isError, refetch } = useConversationMessages(
    conversationId || undefined,
  );
  const sendMessage = useSendMessage();

  useConversationRealtime(conversationId || null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || !conversationId) return;
    lightTap();
    setText('');
    sendMessage.mutate({ conversationId, body: trimmed });
  };

  const visibleMessages = messages?.filter((m) => !m.is_internal) ?? [];
  const pinnedNotes = visibleMessages.filter((m) => m.is_pinned);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {pinnedNotes.length > 0 ? (
          <View style={styles.pinnedBar}>
            <Ionicons name="pin" size={14} color={Theme.colors.warning} />
            <Text style={styles.pinnedText} numberOfLines={1}>
              {pinnedNotes[0].body}
            </Text>
          </View>
        ) : null}

        {isPending ? (
          <View style={styles.centerLoader}>
            <ActivityIndicator color={Theme.colors.primary} />
          </View>
        ) : isError ? (
          <EmptyState
            title="Couldn't load messages"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => refetch()}
          />
        ) : (
          <ScrollView
            ref={scrollRef}
            style={styles.thread}
            contentContainerStyle={styles.threadContent}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {visibleMessages.length === 0 ? (
              <Text style={styles.emptyThread}>
                No messages yet. Send a message to get the conversation started.
              </Text>
            ) : (
              visibleMessages.map((m: Message) => {
                const isCustomer = m.sender_type === 'customer';
                // MSG-FE-FO-2 — Franchise-owner voice messages
                // (sender_type === 'franchise_owner') are branded
                // as "Customer Support" with a distinct teal
                // bubble so the customer can tell at a glance
                // they're talking to support, not their tech.
                // Silent takeover (FO sending **as the assigned
                // tech**, sender_type === 'technician' with
                // sent_by_user_id !== sender_user_id) intentionally
                // stays indistinguishable from a normal tech
                // message — that's the locked decision in
                // PLAN-DEVIATIONS.md `2026-04-26-msg-redo`.
                const isCustomerSupport = m.sender_type === 'franchise_owner';
                const rowStyle = isCustomer ? styles.rowCustomer : styles.rowTech;
                const bubbleStyle = isCustomer
                  ? styles.bubbleCustomer
                  : isCustomerSupport
                    ? styles.bubbleSupport
                    : styles.bubbleTech;
                const textStyle = isCustomer
                  ? styles.textCustomer
                  : isCustomerSupport
                    ? styles.textSupport
                    : styles.textTech;
                const timeStyle = isCustomer
                  ? styles.timeCustomer
                  : isCustomerSupport
                    ? styles.timeSupport
                    : styles.timeTech;
                return (
                  <View key={m.id} style={rowStyle}>
                    <View style={bubbleStyle}>
                      {isCustomerSupport ? (
                        <View style={styles.supportBadge}>
                          <Ionicons
                            name="shield-checkmark"
                            size={11}
                            color={Theme.colors.white}
                          />
                          <Text style={styles.supportBadgeText}>
                            Customer Support
                          </Text>
                        </View>
                      ) : null}
                      <Text style={textStyle}>{m.body}</Text>
                      <Text style={timeStyle}>{formatTime(m.created_at)}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}

        <View style={[styles.composer, Theme.shadow.md]}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message..."
            placeholderTextColor={Theme.colors.textTertiary}
            multiline
            editable={!sendMessage.isPending}
          />
          <TouchableOpacity
            style={[styles.send, (!text.trim() || sendMessage.isPending) && styles.sendDisabled]}
            disabled={!text.trim() || sendMessage.isPending}
            onPress={handleSend}
            activeOpacity={0.85}
          >
            {sendMessage.isPending ? (
              <ActivityIndicator color={Theme.colors.white} size="small" />
            ) : (
              <Ionicons name="send" size={18} color={Theme.colors.white} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  flex: {
    flex: 1,
  },
  centerLoader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinnedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
    backgroundColor: Theme.colors.warning + '12',
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.warning + '30',
  },
  pinnedText: {
    flex: 1,
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text,
    fontWeight: '500',
  },
  thread: {
    flex: 1,
  },
  threadContent: {
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.md,
  },
  threadMeta: {
    alignSelf: 'center',
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    marginBottom: Theme.spacing.md,
  },
  emptyThread: {
    textAlign: 'center',
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textTertiary,
    marginTop: Theme.spacing.xl,
  },
  rowCustomer: {
    alignItems: 'flex-end',
    marginBottom: Theme.spacing.sm,
  },
  rowTech: {
    alignItems: 'flex-start',
    marginBottom: Theme.spacing.sm,
  },
  bubbleCustomer: {
    maxWidth: '80%',
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.lg,
    borderBottomRightRadius: Theme.borderRadius.sm,
    paddingVertical: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.md,
  },
  textCustomer: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    lineHeight: 22,
  },
  timeCustomer: {
    color: Theme.colors.white + '80',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'right',
  },
  bubbleTech: {
    maxWidth: '80%',
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.lg,
    borderBottomLeftRadius: Theme.borderRadius.sm,
    paddingVertical: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  textTech: {
    color: Theme.colors.text,
    fontSize: Theme.fontSize.md,
    lineHeight: 22,
  },
  timeTech: {
    color: Theme.colors.textTertiary,
    fontSize: 11,
    marginTop: 4,
  },
  // MSG-FE-FO-2 — Customer Support (FO-voice) bubble. Same
  // incoming side as the tech bubble so it sits in the same
  // visual column the customer expects "team responses" to land
  // in, but a distinct teal so it can't be confused with the
  // assigned tech.
  bubbleSupport: {
    maxWidth: '80%',
    backgroundColor: '#0E7490',
    borderRadius: Theme.borderRadius.lg,
    borderBottomLeftRadius: Theme.borderRadius.sm,
    paddingVertical: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.md,
  },
  supportBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  supportBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.colors.white,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  textSupport: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    lineHeight: 22,
  },
  timeSupport: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    marginTop: 4,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
    backgroundColor: Theme.colors.surfaceElevated,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.border,
    gap: Theme.spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.md,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
    backgroundColor: Theme.colors.background,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    backgroundColor: Theme.colors.border,
  },
});
