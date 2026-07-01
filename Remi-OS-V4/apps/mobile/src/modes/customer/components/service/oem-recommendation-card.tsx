import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Theme, HealthColors } from '@customer/constants/colors';
import { CheckResult, CHECK_RESULT_LABELS } from '@customer/types/enums';
import type { ManufacturerRecommendation } from '@customer/types/api';

function getDueStatus(rec: ManufacturerRecommendation): {
  label: string;
  color: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
} {
  if (rec.last_checked_result === CheckResult.REPLACED) {
    return { label: 'Replaced', color: HealthColors.good, icon: 'check-circle' };
  }
  if (rec.last_checked_result === CheckResult.CHECKED_OK) {
    return { label: 'OK', color: HealthColors.good, icon: 'check-circle-outline' };
  }

  if (rec.next_due_date) {
    const due = new Date(rec.next_due_date);
    const now = new Date();
    const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilDue < 0) {
      return { label: 'Overdue', color: HealthColors.critical, icon: 'alert-circle' };
    }
    if (daysUntilDue <= 30) {
      return { label: 'Due Soon', color: HealthColors.warning, icon: 'clock-alert-outline' };
    }
  }

  return { label: 'Not Checked', color: Theme.colors.textSecondary, icon: 'help-circle-outline' };
}

function formatInterval(rec: ManufacturerRecommendation): string {
  const parts: string[] = [];
  if (rec.interval_miles) {
    parts.push(`${rec.interval_miles.toLocaleString()} mi`);
  }
  if (rec.interval_months) {
    parts.push(`${rec.interval_months} mo`);
  }
  return parts.length > 0 ? `Every ${parts.join(' / ')}` : '';
}

function formatDueDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  recommendations: ManufacturerRecommendation[];
  onBookService?: (component: string) => void;
}

export function OemRecommendationCard({ recommendations, onBookService }: Props) {
  if (recommendations.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="shield-car" size={20} color={Theme.colors.text} />
        <Text style={styles.title}>OEM Recommendations</Text>
        <View style={styles.sourceBadge}>
          <Text style={styles.sourceText}>Carfax</Text>
        </View>
      </View>

      {recommendations.map((rec) => {
        const due = getDueStatus(rec);
        const interval = formatInterval(rec);
        const isActionable =
          rec.last_checked_result !== CheckResult.CHECKED_OK &&
          rec.last_checked_result !== CheckResult.REPLACED;

        return (
          <View key={rec.id} style={styles.recRow}>
            <View style={[styles.statusDot, { backgroundColor: due.color }]} />

            <View style={styles.recContent}>
              <View style={styles.recTop}>
                <Text style={styles.componentName}>{rec.component}</Text>
                <View style={[styles.dueBadge, { backgroundColor: due.color + '1A' }]}>
                  <MaterialCommunityIcons name={due.icon} size={12} color={due.color} />
                  <Text style={[styles.dueText, { color: due.color }]}>{due.label}</Text>
                </View>
              </View>

              {interval ? <Text style={styles.intervalText}>{interval}</Text> : null}

              <View style={styles.recMeta}>
                {rec.last_checked_at ? (
                  <Text style={styles.metaText}>
                    Last: {formatDueDate(rec.last_checked_at)} — {CHECK_RESULT_LABELS[rec.last_checked_result]}
                  </Text>
                ) : null}
                {rec.next_due_date ? (
                  <Text style={styles.metaText}>
                    Due: {formatDueDate(rec.next_due_date)}
                  </Text>
                ) : null}
              </View>

              {isActionable && onBookService ? (
                <Pressable
                  style={styles.bookBtn}
                  onPress={() => onBookService(rec.component)}
                  hitSlop={8}
                >
                  <MaterialCommunityIcons name="calendar-plus" size={14} color={Theme.colors.primary} />
                  <Text style={styles.bookBtnText}>Book This Service</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    ...Theme.shadow.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.md,
  },
  title: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.text,
    flex: 1,
  },
  sourceBadge: {
    backgroundColor: Theme.colors.primary + '14',
    paddingHorizontal: Theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: Theme.borderRadius.full,
  },
  sourceText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  recRow: {
    flexDirection: 'row',
    paddingVertical: Theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.borderLight,
    gap: Theme.spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  recContent: {
    flex: 1,
  },
  recTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  componentName: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
    flex: 1,
  },
  dueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: Theme.borderRadius.full,
    gap: 3,
  },
  dueText: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '700',
  },
  intervalText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginBottom: 2,
  },
  recMeta: {
    gap: 1,
  },
  metaText: {
    fontSize: 11,
    color: Theme.colors.textTertiary,
  },
  bookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Theme.spacing.xs,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.full,
    backgroundColor: Theme.colors.primary + '0A',
    borderWidth: 1,
    borderColor: Theme.colors.primary + '33',
  },
  bookBtnText: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
});
