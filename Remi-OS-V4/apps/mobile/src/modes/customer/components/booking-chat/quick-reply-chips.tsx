import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Theme } from '@customer/constants/colors';
import type { SuggestedAction, SuggestedActionType } from '@customer/types/booking-chat';

interface Props {
  actions: SuggestedAction[];
  onPress: (action: SuggestedAction) => void;
  disabled?: boolean;
}

export function QuickReplyChips({ actions, onPress, disabled = false }: Props) {
  if (actions.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {actions.map((action, index) => (
          <TouchableOpacity
            key={`${action.type}-${index}`}
            style={[styles.chip, disabled && styles.chipDisabled]}
            disabled={disabled}
            onPress={() => {
              Haptics.selectionAsync();
              onPress(action);
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Ionicons
              name={iconForActionType(action.type)}
              size={14}
              color={Theme.colors.primary}
            />
            <Text style={styles.label} numberOfLines={1}>
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function iconForActionType(type: SuggestedActionType): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'change_date':
      return 'calendar-outline';
    case 'change_service':
      return 'construct-outline';
    case 'select_slot':
      return 'time-outline';
    case 'open_help':
      return 'help-circle-outline';
    case 'send_message':
    default:
      return 'chatbubble-outline';
  }
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: Theme.spacing.sm,
  },
  scroll: {
    gap: Theme.spacing.xs,
    paddingRight: Theme.spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Theme.colors.primary + '12',
    borderRadius: Theme.borderRadius.full,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '30',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
    minHeight: 36,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.primary,
    maxWidth: 200,
  },
});
