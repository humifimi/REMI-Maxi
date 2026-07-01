import { StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getStatusColor, Theme } from '@customer/constants/colors';
import type { ServiceHistoryEntry } from '@customer/types/api';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getServiceIcon(serviceType: string): keyof typeof MaterialCommunityIcons.glyphMap {
  const lower = serviceType.toLowerCase();
  if (lower.includes('oil')) return 'oil';
  if (lower.includes('brake')) return 'car-brake-alert';
  if (lower.includes('tire') || lower.includes('rotation')) return 'tire';
  if (lower.includes('filter')) return 'air-filter';
  if (lower.includes('full')) return 'wrench';
  return 'car-wrench';
}

interface ServiceHistoryTimelineProps {
  entries: ServiceHistoryEntry[];
}

export function ServiceHistoryTimeline({ entries }: ServiceHistoryTimelineProps) {
  if (entries.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Ionicons name="time-outline" size={32} color={Theme.colors.textTertiary} />
        <Text style={styles.emptyTitle}>No Service History</Text>
        <Text style={styles.emptySubtitle}>Service records will appear here after your first visit</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;
        const statusColor = getStatusColor(entry.status);
        const icon = getServiceIcon(entry.service_type);

        return (
          <View key={entry.id} style={styles.row}>
            <View style={styles.timelineColumn}>
              <View style={[styles.dot, { backgroundColor: statusColor }]} />
              {!isLast && <View style={styles.line} />}
            </View>

            <View style={[styles.card, { borderLeftColor: statusColor, borderLeftWidth: 3 }]}>
              <View style={styles.cardHeader}>
                <View style={styles.iconWrap}>
                  <MaterialCommunityIcons name={icon} size={18} color={statusColor} />
                </View>
                <View style={styles.headerText}>
                  <Text style={styles.serviceType}>{entry.service_type}</Text>
                  <Text style={styles.dateText}>{formatDate(entry.date)}</Text>
                </View>

                {entry.carfax_reported && (
                  <View style={styles.carfaxBadge}>
                    <MaterialCommunityIcons name="shield-check" size={11} color={Theme.colors.primary} />
                    <Text style={styles.carfaxText}>CARFAX</Text>
                  </View>
                )}
              </View>

              <View style={styles.servicesList}>
                {entry.services.map((name, i) => (
                  <View key={i} style={styles.serviceChip}>
                    <Text style={styles.serviceChipText}>{name}</Text>
                  </View>
                ))}
              </View>

              {entry.technician_name && (
                <View style={styles.techRow}>
                  <Ionicons name="person-outline" size={12} color={Theme.colors.textTertiary} />
                  <Text style={styles.techName}>{entry.technician_name}</Text>
                </View>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingLeft: Theme.spacing.xs,
  },
  row: {
    flexDirection: 'row',
    minHeight: 80,
  },
  timelineColumn: {
    width: 24,
    alignItems: 'center',
    paddingTop: Theme.spacing.md,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Theme.colors.background,
    ...Theme.shadow.sm,
  },
  line: {
    width: 2,
    flex: 1,
    backgroundColor: Theme.colors.border,
    marginTop: 4,
  },
  card: {
    flex: 1,
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    marginLeft: Theme.spacing.sm,
    marginBottom: Theme.spacing.sm,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    ...Theme.shadow.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  serviceType: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  dateText: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    marginTop: 1,
  },
  carfaxBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Theme.borderRadius.full,
    backgroundColor: Theme.colors.primary + '12',
    borderWidth: 1,
    borderColor: Theme.colors.primary + '30',
  },
  carfaxText: {
    fontSize: 9,
    fontWeight: '800',
    color: Theme.colors.primary,
    letterSpacing: 0.5,
  },
  servicesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: Theme.spacing.xs,
  },
  serviceChip: {
    backgroundColor: Theme.colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Theme.borderRadius.sm,
  },
  serviceChipText: {
    fontSize: 11,
    color: Theme.colors.textSecondary,
    fontWeight: '500',
  },
  techRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  techName: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    fontWeight: '500',
  },
  emptyCard: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.border,
    gap: Theme.spacing.xs,
  },
  emptyTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  emptySubtitle: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
  },
});
