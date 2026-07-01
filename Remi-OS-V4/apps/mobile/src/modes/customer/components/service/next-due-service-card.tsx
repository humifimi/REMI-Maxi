import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HealthColors, Theme } from '@customer/constants/colors';
import type { NextDueService } from '@customer/types/api';

const URGENCY_CONFIG: Record<NextDueService['urgency'], {
  color: string;
  bg: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = {
  overdue: {
    color: '#991B1B',
    bg: '#FEE2E2',
    label: 'Overdue',
    icon: 'alert-circle',
  },
  urgent: {
    color: '#92400E',
    bg: '#FEF3C7',
    label: 'Due Soon',
    icon: 'warning',
  },
  upcoming: {
    color: '#1E40AF',
    bg: '#DBEAFE',
    label: 'Upcoming',
    icon: 'time-outline',
  },
  on_track: {
    color: '#166534',
    bg: '#DCFCE7',
    label: 'On Track',
    icon: 'checkmark-circle-outline',
  },
};

function formatCountdown(miles: number | null, days: number | null): string {
  const parts: string[] = [];
  if (miles != null) {
    parts.push(`${Math.abs(miles).toLocaleString()} mi`);
  }
  if (days != null) {
    const absDays = Math.abs(days);
    if (days < 0) {
      parts.push(`${absDays}d overdue`);
    } else {
      parts.push(`${absDays}d`);
    }
  }
  return parts.join(' · ') || 'Check schedule';
}

interface NextDueServiceCardProps {
  service: NextDueService;
  vehicleNote?: string | null;
  onBookNow: (service: NextDueService) => void;
}

export function NextDueServiceCard({ service, vehicleNote, onBookNow }: NextDueServiceCardProps) {
  const config = URGENCY_CONFIG[service.urgency];

  return (
    <View style={[styles.card, { borderLeftColor: config.color, borderLeftWidth: 3 }]}>
      <View style={styles.topRow}>
        <View style={styles.nameSection}>
          <Text style={styles.serviceName}>{service.service_name}</Text>
          {vehicleNote ? (
            <View style={styles.vehicleNoteRow}>
              <Ionicons name="car-outline" size={12} color={Theme.colors.primary} />
              <Text style={styles.vehicleNoteText}>{vehicleNote}</Text>
            </View>
          ) : null}
          <Text style={styles.countdown}>{formatCountdown(service.miles_until_due, service.days_until_due)}</Text>
        </View>

        <View style={[styles.urgencyBadge, { backgroundColor: config.bg }]}>
          <Ionicons name={config.icon} size={12} color={config.color} />
          <Text style={[styles.urgencyText, { color: config.color }]}>{config.label}</Text>
        </View>
      </View>

      <View style={styles.bottomRow}>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: config.color,
                width: `${Math.min(Math.max(
                  service.urgency === 'overdue' ? 100 :
                  service.urgency === 'urgent' ? 75 :
                  service.urgency === 'upcoming' ? 45 : 20,
                  0,
                ), 100)}%`,
              },
            ]}
          />
        </View>

        <TouchableOpacity
          style={styles.bookBtn}
          onPress={() => onBookNow(service)}
          activeOpacity={0.7}
          hitSlop={8}
        >
          <Ionicons name="calendar-outline" size={14} color={Theme.colors.primary} />
          <Text style={styles.bookText}>Book Now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface NextDueServiceListProps {
  services: NextDueService[];
  getVehicleNote?: (service: NextDueService) => string | null;
  onBookNow: (service: NextDueService) => void;
}

export function NextDueServiceList({ services, getVehicleNote, onBookNow }: NextDueServiceListProps) {
  if (services.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Ionicons name="checkmark-done-circle-outline" size={32} color={HealthColors.good} />
        <Text style={styles.emptyTitle}>All Caught Up</Text>
        <Text style={styles.emptySubtitle}>No services due right now</Text>
      </View>
    );
  }

  const sorted = [...services].sort((a, b) => {
    const order = { overdue: 0, urgent: 1, upcoming: 2, on_track: 3 };
    return order[a.urgency] - order[b.urgency];
  });

  return (
    <View style={styles.list}>
      {sorted.map((s) => (
        <NextDueServiceCard
          key={s.id}
          service={s}
          vehicleNote={getVehicleNote?.(s) ?? null}
          onBookNow={onBookNow}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Theme.spacing.sm,
  },
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    gap: Theme.spacing.sm,
    ...Theme.shadow.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Theme.spacing.sm,
  },
  nameSection: {
    flex: 1,
  },
  serviceName: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  vehicleNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
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
  countdown: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  urgencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: Theme.borderRadius.full,
    gap: 4,
  },
  urgencyText: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '700',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.md,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: Theme.colors.borderLight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  bookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.sm,
    backgroundColor: Theme.colors.primary + '0F',
    minHeight: 44,
  },
  bookText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.primary,
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
  },
});
