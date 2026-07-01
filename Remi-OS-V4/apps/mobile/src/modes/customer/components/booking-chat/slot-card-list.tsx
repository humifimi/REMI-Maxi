import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Theme } from '@customer/constants/colors';
import type { TimeSlot } from '@customer/types/booking-chat';

interface SlotCardListProps {
  slots: TimeSlot[];
  onSelect: (slotIndex: number) => void;
  disabled?: boolean;
}

export function SlotCardList({ slots, onSelect, disabled = false }: SlotCardListProps) {
  return (
    <View style={styles.container}>
      {slots.map((slot, index) => (
        <SlotCard
          key={`${slot.date}-${slot.time}-${index}`}
          slot={slot}
          index={index}
          onSelect={onSelect}
          disabled={disabled}
        />
      ))}
    </View>
  );
}

interface SlotCardProps {
  slot: TimeSlot;
  index: number;
  onSelect: (index: number) => void;
  disabled: boolean;
}

function SlotCard({ slot, index, onSelect, disabled }: SlotCardProps) {
  const dayLabel = formatDayLabel(slot.date);

  return (
    <TouchableOpacity
      style={[styles.card, disabled && styles.cardDisabled]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onSelect(index);
      }}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Select ${dayLabel} at ${slot.time}`}
    >
      <View style={styles.header}>
        <View style={styles.timeRow}>
          <Ionicons name="time-outline" size={16} color={Theme.colors.primary} />
          <Text style={styles.time}>{slot.time}</Text>
        </View>
        <Text style={styles.date}>{dayLabel}</Text>
      </View>

      {slot.technician_name ? (
        <View style={styles.detail}>
          <Ionicons name="person-outline" size={14} color={Theme.colors.textSecondary} />
          <Text style={styles.detailText}>{slot.technician_name}</Text>
        </View>
      ) : null}

      <View style={styles.detail}>
        <Ionicons name="timer-outline" size={14} color={Theme.colors.textSecondary} />
        <Text style={styles.detailText}>~{slot.estimated_duration_minutes} min</Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.services} numberOfLines={2}>
          {slot.services.map((s) => s.name).join(', ')}
        </Text>
        <Text style={styles.price}>${slot.total_price.toFixed(2)}</Text>
      </View>

      <View style={styles.selectBtn}>
        <Text style={styles.selectText}>Select this slot</Text>
      </View>
    </TouchableOpacity>
  );
}

function formatDayLabel(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

const styles = StyleSheet.create({
  container: {
    marginTop: Theme.spacing.sm,
    gap: Theme.spacing.sm,
  },
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    padding: Theme.spacing.md,
    ...Theme.shadow.sm,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.spacing.xs,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  time: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  date: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
  },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  detailText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Theme.spacing.sm,
    paddingTop: Theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.colors.border,
  },
  services: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text,
    flex: 1,
    marginRight: Theme.spacing.sm,
  },
  price: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  selectBtn: {
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.sm,
    paddingVertical: Theme.spacing.sm,
    alignItems: 'center',
    marginTop: Theme.spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  selectText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.white,
  },
});
