/**
 * `<MarkerContextMenuSheet>` (LDM-WAVE-2 CHUNK-4, `DRAG-3-CONTEXT-MENU`) —
 * Action sheet that opens when the user taps an appointment marker on
 * the franchise route map. Four rows:
 *
 *   1. **View details** — opens AppointmentDetailSheet (deferred)
 *   2. **Reschedule…** — opens RescheduleSheet (deferred)
 *   3. **Reassign…** — opens `<MarkerReassignPickerSheet>` (this chunk)
 *   4. **Cancel appointment** — opens CancelSheet (deferred)
 *
 * PLAN-DEVIATION: 2026-05-17-marker-context-menu-passthrough-only-reassign
 *   The spec text said each row "opens" its corresponding sheet
 *   (AppointmentDetailSheet, RescheduleSheet, CancelSheet) for the
 *   tapped appointment. Those three sheets currently live inside the
 *   franchise calendar tab (`app/(tabs)/index.tsx`) and are wired to
 *   the calendar's own state/refs. Surfacing them from the map screen
 *   requires either lifting them to a shared parent OR mounting fresh
 *   instances on the map; both are out of scope for this chunk. For
 *   now the three non-reassign rows render with a disabled subtitle
 *   pointing the user to the calendar tab — consistent with the spec's
 *   "disable + tooltip subtitle, don't hide" decision row. Reassign IS
 *   wired end-to-end. See docs/PLAN-DEVIATIONS.md.
 *
 * PLAN-DEVIATION: 2026-05-17-map-sheets-native-modal
 *   Originally built on `<AppSheet>` per CHUNK-2 so it would open
 *   half-width-on-landscape via `@gorhom/bottom-sheet`. Sentry replay
 *   sessions on 2026-05-17 showed `BottomSheet.snapToIndex(0)` being
 *   called but the wrapped `onChange` never firing — the sheet never
 *   animated when mounted as a sibling of `<MapView>`. Forcing
 *   full-width didn't help. Pivoted to RN's built-in `<Modal>` via
 *   the private `<MapActionModal>` helper, which renders in a
 *   separate OS-level window above the MapView and avoids the gorhom
 *   ↔ MapView interaction entirely. See docs/PLAN-DEVIATIONS.md.
 */

import { useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { MapActionModal } from "@technician/components/route/map-action-modal";
import { traceMap } from "@technician/utils/sentry-map-diagnostics";

export interface MarkerContextMenuSheetProps {
  visible: boolean;
  /** Dragged appointment's customer name (for the header). */
  customerName: string | null;
  /** Optional service summary subtitle. */
  serviceNames: string | null;
  /** Optional time/tech meta string ("Tech Name · 10:30 AM"). */
  metaLabel: string | null;
  /**
   * Whether to allow each action. When `null`, the row stays visible
   * but is disabled with the subtitle baked in below.
   */
  canViewDetails?: boolean;
  canReschedule?: boolean;
  canReassign?: boolean;
  canCancel?: boolean;
  /** Action callbacks. Fire-and-close pattern — sheet closes itself. */
  onViewDetails?: () => void;
  onReschedule?: () => void;
  onReassign?: () => void;
  onCancelAppointment?: () => void;
  /** Dismiss handler (backdrop tap / Dismiss row). */
  onClose: () => void;
}

interface RowSpec {
  key: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  iconColor: string;
  label: string;
  subtitle: string;
  enabled: boolean;
  onPress?: () => void;
  destructive?: boolean;
}

export function MarkerContextMenuSheet({
  visible,
  customerName,
  serviceNames,
  metaLabel,
  canViewDetails = true,
  canReschedule = false,
  canReassign = true,
  canCancel = false,
  onViewDetails,
  onReschedule,
  onReassign,
  onCancelAppointment,
  onClose,
}: MarkerContextMenuSheetProps) {
  useEffect(() => {
    traceMap("menu_sheet_visible_effect", { visible });
  }, [visible]);

  const rows: RowSpec[] = [
    {
      key: "details",
      icon: "info-outline",
      iconColor: "#374151",
      label: "View details",
      subtitle: canViewDetails && onViewDetails
        ? ""
        : "Open this appointment in the calendar to see details",
      enabled: !!(canViewDetails && onViewDetails),
      onPress: onViewDetails,
    },
    {
      key: "reschedule",
      icon: "event",
      iconColor: "#374151",
      label: "Reschedule…",
      subtitle: canReschedule && onReschedule
        ? ""
        : "Open this appointment in the calendar to reschedule",
      enabled: !!(canReschedule && onReschedule),
      onPress: onReschedule,
    },
    {
      key: "reassign",
      icon: "swap-horiz",
      iconColor: "#1D4ED8",
      label: "Reassign…",
      subtitle: canReassign && onReassign
        ? "Pick a different technician for this appointment"
        : "Reassign isn't available for this appointment",
      enabled: !!(canReassign && onReassign),
      onPress: onReassign,
    },
    {
      key: "cancel",
      icon: "cancel",
      iconColor: "#B91C1C",
      label: "Cancel appointment",
      subtitle: canCancel && onCancelAppointment
        ? ""
        : "Open this appointment in the calendar to cancel",
      enabled: !!(canCancel && onCancelAppointment),
      onPress: onCancelAppointment,
      destructive: true,
    },
  ];

  return (
    <MapActionModal
      visible={visible}
      onRequestClose={onClose}
      instanceId="menu"
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>
            {customerName ?? "Appointment"}
          </Text>
          {serviceNames ? (
            <Text style={styles.subtitle}>{serviceNames}</Text>
          ) : null}
          {metaLabel ? (
            <Text style={styles.meta}>{metaLabel}</Text>
          ) : null}
        </View>

        <View style={styles.rows}>
          {rows.map((row, index) => (
            <View key={row.key}>
              {index > 0 ? <View style={styles.rowDivider} /> : null}
              <TouchableOpacity
                style={[
                  styles.row,
                  !row.enabled && styles.rowDisabled,
                ]}
                onPress={row.enabled ? row.onPress : undefined}
                disabled={!row.enabled}
                accessibilityRole="button"
                accessibilityState={{ disabled: !row.enabled }}
                accessibilityLabel={row.label}
              >
                <MaterialIcons
                  name={row.icon}
                  size={22}
                  color={row.enabled ? row.iconColor : "#9CA3AF"}
                />
                <View style={styles.rowText}>
                  <Text
                    style={[
                      styles.rowLabel,
                      !row.enabled && styles.rowLabelDisabled,
                      row.enabled && row.destructive && styles.rowLabelDestructive,
                    ]}
                  >
                    {row.label}
                  </Text>
                  {row.subtitle ? (
                    <Text
                      style={[
                        styles.rowSubtitle,
                        !row.enabled && styles.rowSubtitleDisabled,
                      ]}
                    >
                      {row.subtitle}
                    </Text>
                  ) : null}
                </View>
                {row.enabled ? (
                  <MaterialIcons
                    name="chevron-right"
                    size={20}
                    color="#9CA3AF"
                  />
                ) : null}
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={styles.dismissBtn}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss menu"
        >
          <Text style={styles.dismissText}>Dismiss</Text>
        </TouchableOpacity>
      </ScrollView>
    </MapActionModal>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 16,
  },
  header: {
    gap: 4,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    color: "#374151",
  },
  meta: {
    fontSize: 12,
    color: "#6B7280",
  },
  rows: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
  },
  rowDisabled: {
    opacity: 0.55,
  },
  rowDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 14,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  rowLabelDisabled: {
    color: "#6B7280",
  },
  rowLabelDestructive: {
    color: "#B91C1C",
  },
  rowSubtitle: {
    fontSize: 12,
    color: "#6B7280",
  },
  rowSubtitleDisabled: {
    color: "#9CA3AF",
  },
  dismissBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  dismissText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
});
