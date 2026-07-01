import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Theme,
  getStatusColor,
  getPendingSourceVisuals,
  type PendingSourceKey,
} from '@customer/constants/colors';
import { StatusBadge } from '../shared/status-badge';
import type { Appointment } from '@customer/types/api';
import type { AppointmentStatus } from '@customer/types/enums';
import type { AppointmentPendingChangeSummary } from '@customer/types/reorganization';
import { formatVehicleDisplayTitle } from '@customer/utils/vehicle-display';
import {
  formatScheduledDate,
  formatScheduledTime,
} from '@customer/utils/date-format';

interface AppointmentCardProps {
  appointment: Appointment;
  onPress?: () => void;
  /**
   * P5-CU-4 — when set, the card renders the "Proposed change" variant:
   * yellow border, source-of-intent badge in the header, and a side-by-
   * side current-vs-proposed diff under the regular body. See master plan
   * §5.4.3 for the visual spec and §3.8.4 for the data shape.
   *
   * Callers normally derive this from `appointment.pending_change` (the
   * BE annotation surfaced on the customer-side appointments list per
   * P6-BE-10); the prop is left explicit so other producers — the
   * approval inbox sheet (D.4 / P5-CU-2), tests, and demo wiring — can
   * drive it directly without going through the `Appointment` shape.
   *
   * PLAN-DEVIATION: 2026-05-02-pendingchange-prop-shape — this prop
   * follows master plan §5.4.3 + §3.8.4 (`{ session_id, source, intent,
   * expires_at }` against typed enums) NOT §8.9 Prompt D.3's reduced
   * `{ source: "franchise_owner"|...; intentType: "transfer"|...;
   * current; proposed }` shape. Diff rows are derived from `intent.payload`
   * inside the component rather than being passed in precomputed. See
   * docs/PLAN-DEVIATIONS.md#2026-05-02-pendingchange-prop-shape for the
   * full anti-instructions before refactoring this prop.
   */
  pendingChange?: AppointmentPendingChangeSummary;
}

export function AppointmentCard({
  appointment,
  onPress,
  pendingChange,
}: AppointmentCardProps) {
  const isPending = pendingChange != null;
  // Yellow `Theme.colors.warning` (#EAB308) replaces the status border per
  // master plan §5.4.3. Falls through to the standard status palette when
  // no pending intent is attached.
  const borderColor = isPending
    ? Theme.colors.warning
    : getStatusColor(appointment.status);
  const dateStr = formatScheduledDate(appointment.scheduled_date);
  const timeStr = formatScheduledTime(appointment.scheduled_time);
  const vehicleName = appointment.vehicle
    ? formatVehicleDisplayTitle(appointment.vehicle)
    : 'Vehicle TBD';
  const techName = appointment.technician?.full_name ?? 'Technician TBD';
  const serviceNames =
    appointment.services?.map((s) => s.service?.name ?? 'Service').join(', ') ?? '';

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: borderColor }]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}
    >
      <View style={styles.header}>
        <Text style={styles.date}>
          {dateStr} at {timeStr}
        </Text>
        {isPending ? (
          <SourceBadge source={pendingChange.source as PendingSourceKey} />
        ) : (
          <StatusBadge status={appointment.status as AppointmentStatus} />
        )}
      </View>
      <Text style={styles.vehicle} numberOfLines={1}>
        {vehicleName}
      </Text>
      {serviceNames ? (
        <Text style={styles.services} numberOfLines={1}>
          {serviceNames}
        </Text>
      ) : null}
      <Text style={styles.tech}>{techName}</Text>
      {isPending ? (
        <PendingChangeDiff
          appointment={appointment}
          pendingChange={pendingChange}
        />
      ) : null}
    </TouchableOpacity>
  );
}

interface SourceBadgeProps {
  source: PendingSourceKey;
}

function SourceBadge({ source }: SourceBadgeProps) {
  const visuals = getPendingSourceVisuals(source);
  return (
    <View
      style={[styles.sourceBadge, { backgroundColor: visuals.background }]}
      testID={`pending-source-badge-${source}`}
    >
      <Text style={[styles.sourceBadgeLabel, { color: visuals.color }]}>
        {visuals.label}
      </Text>
    </View>
  );
}

interface PendingChangeDiffProps {
  appointment: Appointment;
  pendingChange: AppointmentPendingChangeSummary;
}

interface DiffRow {
  label: string;
  current: string;
  proposed: string;
}

function PendingChangeDiff({ appointment, pendingChange }: PendingChangeDiffProps) {
  const rows = computeDiffRows(appointment, pendingChange);

  return (
    <View style={styles.pendingSection} testID="pending-change-diff">
      <Text style={styles.pendingHeading}>Pending change</Text>
      {rows.map((row) => (
        <View key={row.label} style={styles.pendingRow} testID={`pending-row-${row.label}`}>
          <Text style={styles.pendingRowLabel}>{row.label}</Text>
          <View style={styles.pendingRowValues}>
            <Text style={styles.pendingCurrent}>{row.current}</Text>
            <Text style={styles.pendingArrow}>→</Text>
            <Text style={styles.pendingProposed}>{row.proposed}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Build the per-field diff for the "Pending change" footer. Only emits a
 * row for fields the proposed payload actually changes — matches §5.4.3
 * "diff layout: only for fields that actually changed."
 *
 * `intent.payload.kind` is the discriminator (mirrors `intent_type`
 * per §3.8.2). Customers only ever see `reschedule | cancel` per
 * §3.8.4 — defensive default falls through to the status diff.
 */
function computeDiffRows(
  appointment: Appointment,
  pendingChange: AppointmentPendingChangeSummary,
): DiffRow[] {
  const rows: DiffRow[] = [];
  const intent = pendingChange.intent;

  if (intent.payload.kind === 'reschedule') {
    const payload = intent.payload;
    const currentDate = appointment.scheduled_date;
    const currentTime = appointment.scheduled_time;

    if (payload.new_scheduled_date && payload.new_scheduled_date !== currentDate) {
      rows.push({
        label: 'Date',
        current: formatScheduledDate(currentDate),
        proposed: formatScheduledDate(payload.new_scheduled_date),
      });
    }
    if (payload.new_start_time && payload.new_start_time !== currentTime) {
      rows.push({
        label: 'Time',
        current: formatScheduledTime(currentTime),
        proposed: formatScheduledTime(payload.new_start_time),
      });
    }
    // Note: we deliberately do NOT emit a "Duration" row even though
    // §8.9 Prompt D.3 lists `duration` as a current/proposed field.
    // Customer-visible reschedules in v1 don't change duration — the
    // customer is moving the same set of services, so `new_end_time`
    // is always `new_start_time + Σ service_minutes`. A duration change
    // would imply services were added/removed mid-reschedule, which is
    // a different intent shape (`add_service` is a separate appointment
    // mutation, not a reorganization intent — see §3.8.2). If a future
    // payload shape ever carries an explicit duration delta, add the
    // row here; today there's nothing to diff against.
    // Customer-visible reschedule may include a new tech (master plan
    // §3.8.2 ReschedulePayload). The customer-visible payload only
    // carries `new_technician_id`, not a name, so we surface a generic
    // "New technician" string and let the approval sheet (D.5) load
    // the full tech profile when the customer drills in.
    if (
      payload.new_technician_id != null &&
      payload.new_technician_id !== appointment.technician?.id
    ) {
      rows.push({
        label: 'Technician',
        current: appointment.technician?.full_name ?? 'Unassigned',
        proposed: 'New technician assigned',
      });
    }
  } else if (intent.payload.kind === 'cancel') {
    rows.push({
      label: 'Status',
      current: 'Scheduled',
      proposed: 'Cancellation requested',
    });
  }

  // Defensive: if the payload didn't actually change anything visible
  // (shouldn't happen post-finalize, but BE drift is possible) we still
  // render one row so the customer isn't staring at an empty footer.
  if (rows.length === 0) {
    rows.push({
      label: 'Change',
      current: 'See details',
      proposed: 'Pending review',
    });
  }

  return rows;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    borderLeftWidth: 4,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
    ...Theme.shadow.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.spacing.sm,
  },
  date: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  vehicle: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '600',
    color: Theme.colors.text,
    marginBottom: 2,
  },
  services: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginBottom: 2,
  },
  tech: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textTertiary,
  },
  sourceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Theme.borderRadius.full,
    alignSelf: 'flex-start',
  },
  sourceBadgeLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  pendingSection: {
    marginTop: Theme.spacing.sm,
    paddingTop: Theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.colors.border,
  },
  pendingHeading: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '700',
    color: Theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  pendingRowLabel: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    flexShrink: 0,
    marginRight: Theme.spacing.sm,
  },
  pendingRowValues: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  pendingCurrent: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textTertiary,
    textDecorationLine: 'line-through',
  },
  pendingArrow: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textTertiary,
    marginHorizontal: 6,
  },
  pendingProposed: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
  },
});
