import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getHealthColor, Theme } from '@customer/constants/colors';
import { HealthRing } from './health-ring';

interface ComponentStatusCardProps {
  name: string;
  score: number;
  onBookService?: () => void;
  highlighted?: boolean;
  selected?: boolean;
  booked?: boolean;
}

function getStatusText(score: number, booked?: boolean): { text: string; urgent: boolean } {
  if (booked) return { text: 'Booked', urgent: true };
  if (score > 70) return { text: 'Good', urgent: false };
  if (score >= 40) return { text: 'Needs Attention', urgent: false };
  return { text: 'Service Recommended', urgent: true };
}

export function ComponentStatusCard({ name, score, onBookService, highlighted, selected, booked }: ComponentStatusCardProps) {
  const color = booked ? '#22C55E' : getHealthColor(score);
  const { text, urgent } = getStatusText(score, booked);

  return (
    <View style={[
      styles.card,
      highlighted && styles.highlighted,
      highlighted && { borderColor: color },
      selected && { borderColor: Theme.colors.primary, borderWidth: 2, backgroundColor: Theme.colors.primary + '06' },
      booked && { opacity: 0.6 },
    ]}>
      <View style={styles.row}>
        <HealthRing score={score} variant="compact" showScore={true} />
        <View style={styles.info}>
          <Text style={styles.name}>{name}</Text>
          <Text style={[styles.status, { color }]}>{text}</Text>
        </View>
        {booked ? (
          <View style={[styles.bookBtn, { backgroundColor: '#22C55E15' }]}>
            <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
            <Text style={[styles.bookText, { color: '#22C55E' }]}>Booked</Text>
          </View>
        ) : urgent && onBookService ? (
          <TouchableOpacity style={[styles.bookBtn, selected ? { backgroundColor: Theme.colors.primary + '15' } : { backgroundColor: color + '15' }]} onPress={onBookService}>
            {selected ? (
              <>
                <Ionicons name="checkmark-circle" size={16} color={Theme.colors.primary} />
                <Text style={[styles.bookText, { color: Theme.colors.primary }]}>Selected</Text>
              </>
            ) : (
              <>
                <Ionicons name="calendar-outline" size={14} color={color} />
                <Text style={[styles.bookText, { color }]}>Book</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    ...Theme.shadow.sm,
  },
  highlighted: {
    borderWidth: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.md,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  status: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '500',
    marginTop: 2,
  },
  bookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.sm,
  },
  bookText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
  },
});
