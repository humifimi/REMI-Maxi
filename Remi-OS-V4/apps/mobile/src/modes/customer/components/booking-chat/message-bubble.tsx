import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Theme } from '@customer/constants/colors';
import type { ChatBubbleMessage } from '@customer/types/booking-chat';

interface Props {
  message: ChatBubbleMessage;
  /** Optional inline component slot rendered below the bubble text
   *  (slot card list, vehicle picker, confirmation card, quick replies). */
  children?: ReactNode;
}

export function MessageBubble({ message, children }: Props) {
  const isUser = message.role === 'user';

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.text, isUser ? styles.userText : styles.assistantText]}>
          {message.text}
        </Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: Theme.spacing.sm,
    maxWidth: '88%',
  },
  rowUser: {
    alignSelf: 'flex-end',
  },
  rowAssistant: {
    alignSelf: 'flex-start',
  },
  bubble: {
    borderRadius: Theme.borderRadius.lg,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm + 2,
  },
  userBubble: {
    backgroundColor: Theme.colors.primary,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: Theme.colors.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
  },
  text: {
    fontSize: Theme.fontSize.md,
    lineHeight: 22,
  },
  userText: {
    color: Theme.colors.white,
  },
  assistantText: {
    color: Theme.colors.text,
  },
});
