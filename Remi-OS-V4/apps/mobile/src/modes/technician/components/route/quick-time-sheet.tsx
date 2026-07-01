/**
 * `<QuickTimeSheet>` (map-based reschedule chunk 3, r15) — lightweight
 * time-only reschedule sheet that opens from the map screen when the
 * user taps a chip-bar tooltip or the (currently disabled) Reschedule
 * row in `<MarkerContextMenuSheet>`. Replaces the previous
 * "Open this appointment in the calendar to reschedule" disabled stub.
 *
 * Why a separate sheet instead of reusing `<RescheduleSheet>`:
 *
 *   1. The full `<RescheduleSheet>` is built on `<AppSheet>` (gorhom
 *      bottom-sheet) which silently fails to animate when mounted as a
 *      sibling of `<MapView>` — see PLAN-DEVIATION 2026-05-17 in
 *      `marker-context-menu-sheet.tsx` and `map-action-modal.tsx`.
 *      Using `<MapActionModal>` instead matches the rest of the map's
 *      sheets and avoids the gorhom-around-MapView pitfall.
 *
 *   2. The 80% map-reschedule case is "bump the time forward/back 15
 *      minutes" — the user already picked the day when they booked.
 *      A two-stepper UI (hour + minute) gets the job done in one tap.
 *      For the long tail (date change, notification prefs, etc.) we
 *      expose an Advanced… button that flips to the full
 *      `<RescheduleSheet>`. The map component owns both sheets and
 *      switches between them with mutually-exclusive visibility.
 *
 *   3. The sheet fetches the full `CalendarAppointmentItem` via
 *      `useAppointmentDetail(appointmentId)` because the map only has
 *      a `MapStop` (no `scheduled_end_time`, no notification pref).
 *      We need the end time to preserve duration on the reschedule
 *      payload — without it the user's "5 min later" tap would
 *      silently shorten or extend the visit. While the fetch is in
 *      flight the steppers are disabled and a small spinner sits in
 *      their place; the appointment is usually warm in the cache from
 *      the franchise route map query, so the spinner is rarely shown.
 *
 * Save behavior:
 *   - Constructs `new_start_time` and `new_end_time` ISO strings using
 *     the appointment's existing `scheduled_date` (we do NOT touch the
 *     date here — that's what the Advanced sheet is for).
 *   - Preserves duration: `new_end_time = new_start_time + (original
 *     end - original start)` in minutes.
 *   - Fires `useRescheduleAppointment` (the franchise mutation) with
 *     `notification_preference` defaulted to the appointment's
 *     existing preference (so we don't silently spam the customer).
 *   - On success, closes the sheet AND the parent chip bar's tooltip
 *     (the parent handles that via `onClose`).
 *
 * 2026-05-20 — does NOT support tech reassignment from this sheet
 * (that's what the chip bar's "Tech" button is for) and does NOT
 * support changing the day (that's what Advanced is for).
 *
 * Gesture model: no swipe-to-dismiss. The X button and the backdrop
 * tap (via `<MapActionModal>`) are the only dismiss affordances.
 * Consistent with the other map-modal sheets.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import dayjs from "dayjs";
import { MapActionModal } from "@technician/components/route/map-action-modal";
import {
  useAppointmentDetail,
  useRescheduleAppointment,
} from "@technician/hooks/schedule/use-calendar";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { formatTime12h, formatDateFriendly } from "@technician/utils/format-display";
import { traceMap } from "@technician/utils/sentry-map-diagnostics";

export interface QuickTimeSheetProps {
  /**
   * Open/closed. Parent (franchise-route-map) owns this state and
   * sets it true when the user taps a chip tooltip or the context
   * menu's Reschedule row.
   */
  visible: boolean;
  /**
   * Appointment to reschedule. `null` is allowed so the sheet can be
   * mounted with `visible={false}` from the start without churn. When
   * the sheet opens we fetch the full appointment detail for the
   * duration calculation; while in flight, the steppers show a
   * spinner.
   */
  appointmentId: number | null;
  /**
   * Customer name to show in the header — comes from the chip's
   * `MapStop` so we don't have to wait for the appointment fetch.
   */
  customerName: string | null;
  /** Dismiss handler (X button + backdrop tap). */
  onClose: () => void;
  /**
   * "Advanced…" handler — parent closes this sheet and opens the
   * full `<RescheduleSheet>` for the same appointment. Wired in
   * the parent so it can pass the freshly-fetched appointment data
   * straight through without a second fetch.
   */
  onAdvanced: () => void;
}

const MIN_STEPPER = 15;
const HOUR_STEPPER = 1;

export function QuickTimeSheet({
  visible,
  appointmentId,
  customerName,
  onClose,
  onAdvanced,
}: QuickTimeSheetProps) {
  // Lazy detail fetch. `enabled` keys on `id > 0` so we don't poll
  // for null/0 ids when the sheet is closed.
  const { data: appointment, isLoading } = useAppointmentDetail(
    appointmentId ?? 0,
  );

  const mutation = useRescheduleAppointment();

  // Initial start time built from the appointment fields when the
  // sheet opens. Locked into local state via the useEffect below
  // so the steppers operate on a stable value the user can adjust
  // without the appointment refetch resetting their edits.
  const initialStart = useMemo(() => {
    if (!appointment?.scheduled_date || !appointment?.scheduled_time) {
      return null;
    }
    return dayjs(
      `${appointment.scheduled_date}T${appointment.scheduled_time}`,
    );
  }, [appointment]);

  const durationMinutes = useMemo(() => {
    if (!appointment?.scheduled_time || !appointment?.scheduled_end_time) {
      return 60;
    }
    const start = dayjs(
      `${appointment.scheduled_date}T${appointment.scheduled_time}`,
    );
    const end = dayjs(
      `${appointment.scheduled_date}T${appointment.scheduled_end_time}`,
    );
    const diff = end.diff(start, "minute");
    return diff > 0 ? diff : 60;
  }, [appointment]);

  const [selectedTime, setSelectedTime] = useState<dayjs.Dayjs | null>(null);

  // Seed selectedTime whenever the sheet opens for a new appointment
  // or the initialStart resolves after the fetch lands.
  useEffect(() => {
    if (visible && initialStart) {
      setSelectedTime(initialStart);
    }
    if (!visible) {
      // Clear on close so the next open starts fresh.
      setSelectedTime(null);
    }
  }, [visible, initialStart]);

  const adjustHour = useCallback((delta: number) => {
    haptic.light();
    setSelectedTime((prev) => (prev ? prev.add(delta, "hour") : prev));
  }, []);

  const adjustMinute = useCallback((delta: number) => {
    haptic.light();
    setSelectedTime((prev) => {
      if (!prev) return prev;
      const next = prev.add(delta, "minute");
      // Snap to nearest 15-min slot to match the calendar's stepper.
      const snapped = next.minute(Math.round(next.minute() / 15) * 15).second(0);
      return snapped;
    });
  }, []);

  const isDirty = useMemo(() => {
    if (!selectedTime || !initialStart) return false;
    return !selectedTime.isSame(initialStart);
  }, [selectedTime, initialStart]);

  const handleSave = useCallback(async () => {
    if (!appointment || !selectedTime || !appointmentId) return;
    haptic.medium();
    const startIso = selectedTime.format("YYYY-MM-DDTHH:mm:ss");
    const endIso = selectedTime
      .add(durationMinutes, "minute")
      .format("YYYY-MM-DDTHH:mm:ss");
    traceMap("quick_time_save", {
      appointmentId,
      previousStart: appointment.scheduled_time,
      newStart: selectedTime.format("HH:mm:ss"),
      durationMinutes,
    });
    try {
      await mutation.mutateAsync({
        id: appointmentId,
        payload: {
          new_start_time: startIso,
          new_end_time: endIso,
          // Preserve the appointment's existing notification preference
          // so we don't surprise the customer with a different channel.
          notification_preference:
            appointment.notification_preference ?? "email_and_text",
        },
      });
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to reschedule";
      Alert.alert("Reschedule failed", message);
    }
  }, [
    appointment,
    selectedTime,
    appointmentId,
    durationMinutes,
    mutation,
    onClose,
  ]);

  const handleAdvanced = useCallback(() => {
    haptic.light();
    onAdvanced();
  }, [onAdvanced]);

  const dateLabel = useMemo(() => {
    if (!appointment?.scheduled_date) return "";
    return formatDateFriendly(appointment.scheduled_date);
  }, [appointment]);

  const newTimeLabel = useMemo(() => {
    if (!selectedTime) return "";
    return formatTime12h(selectedTime.format("HH:mm:ss"));
  }, [selectedTime]);

  const originalTimeLabel = useMemo(() => {
    if (!appointment?.scheduled_time) return "";
    return formatTime12h(appointment.scheduled_time);
  }, [appointment]);

  return (
    <MapActionModal
      visible={visible}
      onRequestClose={onClose}
      instanceId="quicktime"
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>
              {customerName ?? appointment?.customer_name ?? "Appointment"}
            </Text>
            {dateLabel ? <Text style={styles.subtitle}>{dateLabel}</Text> : null}
          </View>
          <Pressable
            onPress={onClose}
            style={styles.closeButton}
            accessibilityLabel="Close"
            accessibilityRole="button"
            hitSlop={8}
          >
            <MaterialIcons name="close" size={22} color="#6B7280" />
          </Pressable>
        </View>

        <View style={styles.stepperRow}>
          {isLoading || !selectedTime ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color="#3B82F6" />
              <Text style={styles.loadingText}>Loading appointment…</Text>
            </View>
          ) : (
            <>
              <StepperBlock
                label="Hour"
                onUp={() => adjustHour(HOUR_STEPPER)}
                onDown={() => adjustHour(-HOUR_STEPPER)}
                value={selectedTime.format("h")}
              />
              <View style={styles.colon}>
                <Text style={styles.colonText}>:</Text>
              </View>
              <StepperBlock
                label="Min"
                onUp={() => adjustMinute(MIN_STEPPER)}
                onDown={() => adjustMinute(-MIN_STEPPER)}
                value={selectedTime.format("mm")}
              />
              <View style={styles.ampm}>
                <Text style={styles.ampmText}>
                  {selectedTime.format("A")}
                </Text>
              </View>
            </>
          )}
        </View>

        {isDirty && originalTimeLabel ? (
          <Text style={styles.changeHint}>
            {originalTimeLabel}
            {"  →  "}
            <Text style={styles.changeHintNew}>{newTimeLabel}</Text>
          </Text>
        ) : null}

        <View style={styles.actionRow}>
          <Pressable
            style={[
              styles.button,
              styles.primaryButton,
              (!isDirty || mutation.isPending) && styles.buttonDisabled,
            ]}
            onPress={handleSave}
            disabled={!isDirty || mutation.isPending}
            accessibilityRole="button"
            accessibilityLabel="Save new time"
          >
            {mutation.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Save</Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.button, styles.secondaryButton]}
            onPress={handleAdvanced}
            accessibilityRole="button"
            accessibilityLabel="Open full reschedule sheet"
          >
            <Text style={styles.secondaryButtonText}>Advanced…</Text>
          </Pressable>
        </View>
      </View>
    </MapActionModal>
  );
}

interface StepperBlockProps {
  label: string;
  value: string;
  onUp: () => void;
  onDown: () => void;
}

function StepperBlock({ label, value, onUp, onDown }: StepperBlockProps) {
  return (
    <View style={styles.stepperBlock}>
      <Pressable
        onPress={onUp}
        style={styles.stepperArrow}
        accessibilityLabel={`Increase ${label}`}
        accessibilityRole="button"
        hitSlop={8}
      >
        <MaterialIcons name="keyboard-arrow-up" size={28} color="#1F2937" />
      </Pressable>
      <Text style={styles.stepperValue}>{value}</Text>
      <Pressable
        onPress={onDown}
        style={styles.stepperArrow}
        accessibilityLabel={`Decrease ${label}`}
        accessibilityRole="button"
        hitSlop={8}
      >
        <MaterialIcons name="keyboard-arrow-down" size={28} color="#1F2937" />
      </Pressable>
      <Text style={styles.stepperLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    gap: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
  },
  closeButton: {
    padding: 4,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 130,
  },
  stepperBlock: {
    alignItems: "center",
    paddingHorizontal: 6,
  },
  stepperArrow: {
    padding: 4,
  },
  stepperValue: {
    fontSize: 38,
    fontWeight: "700",
    color: "#111827",
    fontVariant: ["tabular-nums"],
    minWidth: 56,
    textAlign: "center",
  },
  stepperLabel: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 4,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  colon: {
    paddingHorizontal: 2,
    marginBottom: 28,
  },
  colonText: {
    fontSize: 36,
    fontWeight: "700",
    color: "#9CA3AF",
  },
  ampm: {
    marginLeft: 6,
    marginBottom: 28,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  ampmText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
  },
  loadingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 30,
  },
  loadingText: {
    fontSize: 14,
    color: "#6B7280",
  },
  changeHint: {
    textAlign: "center",
    fontSize: 13,
    color: "#6B7280",
  },
  changeHintNew: {
    color: "#1F2937",
    fontWeight: "700",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  primaryButton: {
    backgroundColor: "#22C55E",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "#F3F4F6",
  },
  secondaryButtonText: {
    color: "#374151",
    fontSize: 15,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
