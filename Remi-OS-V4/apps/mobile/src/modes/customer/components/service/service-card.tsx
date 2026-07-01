import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';
import type { Service } from '@customer/types/api';

interface ServiceCardProps {
  service: Service;
  selected: boolean;
  onToggle: () => void;
  suggested?: boolean;
  vehicleNote?: string | null;
  deferredNote?: string | null;
}

export function ServiceCard({ service, selected, onToggle, suggested, vehicleNote, deferredNote }: ServiceCardProps) {
  const isSuggested = suggested && !selected;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isSuggested && styles.cardSuggested,
        selected && styles.cardSelected,
      ]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      {isSuggested && (
        <View style={styles.suggestedStrip}>
          <Ionicons name="star" size={10} color="#166534" />
          <Text style={styles.suggestedStripText}>Suggested</Text>
        </View>
      )}
      <View style={styles.content}>
        <Text style={[styles.name, selected && styles.nameSelected]}>{service.name}</Text>
        {vehicleNote ? (
          <View style={styles.vehicleNoteRow}>
            <Ionicons name="car-outline" size={12} color={Theme.colors.primary} />
            <Text style={styles.vehicleNoteText}>{vehicleNote}</Text>
          </View>
        ) : null}
        {deferredNote ? (
          <View style={styles.deferredNoteRow}>
            <Ionicons name="alert-circle-outline" size={12} color="#92400E" />
            <Text style={styles.deferredNoteText} numberOfLines={2}>{deferredNote}</Text>
          </View>
        ) : null}
        {service.description ? (
          <Text style={styles.description} numberOfLines={2}>{service.description}</Text>
        ) : null}
        <View style={styles.footer}>
          <Text style={[styles.price, selected && styles.priceSelected]}>
            ${Number(service.base_price).toFixed(2)}
          </Text>
          <Text style={styles.duration}>{service.duration_minutes} min</Text>
        </View>
      </View>
      <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
        {selected && <Text style={styles.checkmark}>✓</Text>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: Theme.colors.border,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardSuggested: {
    borderColor: '#22C55E50',
    backgroundColor: '#22C55E08',
  },
  cardSelected: {
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.primary + '08',
  },
  suggestedStrip: {
    position: 'absolute',
    top: -1,
    right: Theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#22C55E40',
  },
  suggestedStripText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#166534',
    letterSpacing: 0.3,
  },
  content: {
    flex: 1,
  },
  name: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
    marginBottom: 2,
  },
  nameSelected: {
    color: Theme.colors.primary,
  },
  vehicleNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
    backgroundColor: Theme.colors.primary + '0A',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Theme.borderRadius.sm,
  },
  vehicleNoteText: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
  deferredNoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginBottom: 4,
    backgroundColor: '#FEF3C7',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: Theme.borderRadius.sm,
  },
  deferredNoteText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400E',
    flex: 1,
  },
  description: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginBottom: Theme.spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.md,
  },
  price: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  priceSelected: {
    color: Theme.colors.primary,
  },
  duration: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Theme.spacing.md,
  },
  checkboxSelected: {
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.primary,
  },
  checkmark: {
    color: Theme.colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
});
