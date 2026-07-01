import { forwardRef, useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet, View, Text, Alert } from "react-native";
import { BottomSheetScrollView, BottomSheetTextInput, TouchableOpacity } from "@gorhom/bottom-sheet";
import { AppSheet, type AppSheetRef } from "@technician/components/sheets";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import dayjs, { type Dayjs } from "dayjs";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRescheduleAppointment, useTechnicianRescheduleAppointment } from "@technician/hooks/schedule/use-calendar";
import { useCalendarWorldSnapshot } from "@technician/hooks/schedule/use-calendar-world-snapshot";
import { useSessionAwareSubmit } from "@technician/hooks/schedule/use-session-aware-submit";
import { NOTIFICATION_PREF_OPTIONS } from "@technician/constants/calendar";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { rescheduleSchema, type RescheduleFormValues } from "@technician/schemas/reschedule";
import type { CalendarAppointmentItem } from "@technician/types/calendar";
import type { ReorganizationIntentPayload } from "@technician/types/reorganization";
import {
  clearSheetDraft,
  useSheetDraftRead,
  useSheetDraftWrite,
} from "@technician/hooks/calendar/use-sheet-draft-cache";

interface RescheduleSheetProps {
  appointment: CalendarAppointmentItem | null;
  newStartTime?: string;
  newEndTime?: string;
  newTechnicianId?: number;
  newTechnicianName?: string;
  onClose: () => void;
  isTechnician?: boolean;
  /**
   * P3-FE-6 — opaque cache key for the in-flight reschedule form.
   * Typically `reschedule:<appointmentId>` so re-opening the same
   * appointment's reschedule sheet restores the user's stepper
   * adjustments + custom message. Pass `undefined` to disable
   * caching.
   *
   * See `docs/DEVELOPMENT-LOG.md#deferred-chunk-p3-fe-6`.
   */
  cacheKey?: string;
}

export const RescheduleSheet = forwardRef<AppSheetRef, RescheduleSheetProps>(
  function RescheduleSheet(
    { appointment, newStartTime, newEndTime, newTechnicianId, newTechnicianName, onClose, isTechnician, cacheKey },
    ref,
  ) {
    const snapPoints = useMemo(() => ["95%"], []);
    const franchiseMutation = useRescheduleAppointment();
    const techMutation = useTechnicianRescheduleAppointment();
    const rescheduleMutation = isTechnician ? techMutation : franchiseMutation;

    const fromDrag = !!(newStartTime && newEndTime);

    // Tracks whether the user has interacted with the date/time
    // steppers since the sheet opened (or since the props changed).
    // Mirrors the legacy `hasManualTimeEdit` boolean and is reset by
    // the same effect deps it used to be.
    const hasManualTimeEdit = useRef(false);

    const initialDate = useMemo(() => {
      if (newStartTime) return dayjs(newStartTime);
      if (appointment?.scheduled_date && appointment.scheduled_time) {
        return dayjs(`${appointment.scheduled_date}T${appointment.scheduled_time}`);
      }
      return dayjs().add(1, "hour").startOf("hour");
    }, [newStartTime, appointment]);

    const initialDuration = useMemo(() => {
      if (newStartTime && newEndTime) {
        const diff = dayjs(newEndTime).diff(dayjs(newStartTime), "minute");
        if (diff > 0) return diff;
      }
      if (appointment?.services?.length) {
        const dur = appointment.services.reduce((s, svc) => s + svc.quantity * 30, 0);
        if (dur > 0) return dur;
      }
      return 60;
    }, [appointment, newStartTime, newEndTime]);

    const derivedDefaults = useMemo<RescheduleFormValues>(
      () => ({
        selectedDate: initialDate,
        durationMin: initialDuration,
        notificationPreference: "email_and_text",
        customMessage: "",
      }),
      [initialDate, initialDuration],
    );

    // P3-FE-6 — sheet draft cache. Read-once snapshot seeds RHF
    // defaults so a reopen restores the user's stepper edits +
    // custom message. The cache stores Dayjs instances directly —
    // safe because the store is session-scoped and never persisted,
    // so prototype identity is preserved for the app's lifetime.
    const cachedValues = useSheetDraftRead<RescheduleFormValues>({
      cacheKey,
      sheetKind: "reschedule",
    });
    const initialValues = cachedValues ?? derivedDefaults;
    // Tracks whether the dep-sync effect below should swallow its
    // first run. When the cache restored values, we don't want the
    // mount-time effect to immediately reset back to derivedDefaults
    // and overwrite the restoration. Subsequent dep changes (parent
    // re-uses sheet for a different appointment) flow normally.
    const skipNextDepSyncRef = useRef<boolean>(cachedValues != null);

    const { control, handleSubmit, watch, setValue, reset } = useForm<RescheduleFormValues>({
      resolver: zodResolver(rescheduleSchema),
      defaultValues: initialValues,
      mode: "onSubmit",
    });

    const watchedValues = watch();
    useSheetDraftWrite<RescheduleFormValues>({
      cacheKey,
      sheetKind: "reschedule",
      values: watchedValues,
    });

    const closeAndClearCache = useCallback(() => {
      clearSheetDraft(cacheKey, "reschedule");
      onClose();
    }, [cacheKey, onClose]);

    const selectedDate = watch("selectedDate");

    // ── P3-FE-7 — smart-default linter intercept ────────────────
    // Wrap the live `rescheduleMutation.mutateAsync(...)` in
    // `useSessionAwareSubmit`. On a clean linter result the live
    // mutation fires (no behavior change). If the linter flags
    // anything, the `LinterInterceptSheet` opens with "Apply
    // anyway" / "Stage for review" — see master plan §5.3.7.
    const worldSnapshot = useCalendarWorldSnapshot();

    interface RescheduleSubmitInput {
      startIso: string;
      endIso: string;
      startDate: string;
      startHHmm: string;
      endHHmm: string;
      notificationPreference: RescheduleFormValues["notificationPreference"];
      customMessage: string;
    }

    const buildProposedIntent = useCallback(
      (input: RescheduleSubmitInput): ReorganizationIntentPayload => ({
        kind: "reschedule",
        new_scheduled_date: input.startDate,
        new_start_time: input.startHHmm,
        new_end_time: input.endHHmm,
        ...(newTechnicianId ? { new_technician_id: newTechnicianId } : {}),
      }),
      [newTechnicianId],
    );

    const liveMutate = useCallback(
      async (input: RescheduleSubmitInput) => {
        if (!appointment) return;
        await rescheduleMutation.mutateAsync({
          id: appointment.id,
          payload: {
            new_start_time: input.startIso,
            new_end_time: input.endIso,
            new_technician_id: newTechnicianId,
            notification_preference: input.notificationPreference,
            custom_message: input.customMessage || undefined,
          },
        });
        console.log("[CAL:reschedule] mutation SUCCESS");
        closeAndClearCache();
      },
      [appointment, rescheduleMutation, newTechnicianId, closeAndClearCache],
    );

    const sessionAwareSubmit = useSessionAwareSubmit<RescheduleSubmitInput>({
      buildProposedIntent,
      liveMutate,
      worldSnapshot,
      targetAppointmentId: appointment?.id ?? null,
    });

    useEffect(() => {
      console.log("[CAL:reschedule] MOUNT", { apptId: appointment?.id, fromDrag, newStartTime, newEndTime, newTechnicianId, newTechnicianName });
      return () => console.log("[CAL:reschedule] UNMOUNT");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Reset the form (and the manual-edit flag) when the underlying
    // appointment / drag-source props change. This matches the
    // pre-RHF behaviour where two `useEffect`s reset `selectedDate`,
    // `durationMin`, and `hasManualTimeEdit` independently.
    //
    // P3-FE-6: skip the first run when the cache restored values
    // so the restoration isn't immediately overwritten by
    // derivedDefaults. Subsequent dep changes still reset normally
    // (e.g. parent re-uses the sheet for a different appointment).
    useEffect(() => {
      if (skipNextDepSyncRef.current) {
        skipNextDepSyncRef.current = false;
        return;
      }
      hasManualTimeEdit.current = false;
      reset({
        selectedDate: initialDate,
        durationMin: initialDuration,
        notificationPreference: "email_and_text",
        customMessage: "",
      });
    }, [appointment?.id, newStartTime, newEndTime, newTechnicianId, initialDate, initialDuration, reset]);

    const adjustDate = (days: number) => {
      haptic.light();
      hasManualTimeEdit.current = true;
      setValue("selectedDate", selectedDate.add(days, "day"), { shouldValidate: false });
    };
    const adjustHour = (hours: number) => {
      haptic.light();
      hasManualTimeEdit.current = true;
      setValue("selectedDate", selectedDate.add(hours, "hour"), { shouldValidate: false });
    };
    const adjustMinute = (mins: number) => {
      haptic.light();
      hasManualTimeEdit.current = true;
      const next = selectedDate.add(mins, "minute");
      setValue(
        "selectedDate",
        next.minute(Math.round(next.minute() / 15) * 15).second(0),
        { shouldValidate: false },
      );
    };

    const onSubmit = async (values: RescheduleFormValues) => {
      console.log("[CONFIRM TAP]", { hasAppt: !!appointment, isPending: rescheduleMutation.isPending });
      if (!appointment) {
        Alert.alert("Error", "No appointment selected");
        return;
      }
      haptic.medium();
      const startIso = fromDrag && !hasManualTimeEdit.current && newStartTime
        ? dayjs(newStartTime).format("YYYY-MM-DDTHH:mm:ss")
        : values.selectedDate.format("YYYY-MM-DDTHH:mm:ss");
      const endIso = fromDrag && !hasManualTimeEdit.current && newEndTime
        ? dayjs(newEndTime).format("YYYY-MM-DDTHH:mm:ss")
        : values.selectedDate.add(values.durationMin, "minute").format("YYYY-MM-DDTHH:mm:ss");
      const startDayjs = dayjs(startIso);
      const endDayjs = dayjs(endIso);
      const submitInput: RescheduleSubmitInput = {
        startIso,
        endIso,
        startDate: startDayjs.format("YYYY-MM-DD"),
        startHHmm: startDayjs.format("HH:mm:ss"),
        endHHmm: endDayjs.format("HH:mm:ss"),
        notificationPreference: values.notificationPreference,
        customMessage: values.customMessage || "",
      };
      console.log("[CONFIRM PAYLOAD]", {
        id: appointment.id,
        fromDrag,
        hasManualTimeEdit: hasManualTimeEdit.current,
        startIso,
        endIso,
        newTechnicianId,
      });
      try {
        const outcome = await sessionAwareSubmit(submitInput);
        // D2P-FE-13 follow-up — close the sheet on `staged` so a
        // second tap can't double-stage the same intent. The
        // `live-committed` and `applied-anyway` paths already
        // close themselves from inside `liveMutate` (via
        // `closeAndClearCache()` after `mutateAsync` resolves);
        // calling close again from here would be a double-close,
        // which is harmless on `BottomSheet` but redundant. The
        // `dismissed` path intentionally leaves the sheet open
        // so the user can re-edit the unapplied draft.
        if (outcome.kind === "staged") {
          closeAndClearCache();
        }
      } catch (err) {
        // P3-FE-DIAG-409-LOGGING (transient): structured log of the
        // backend envelope so a 409 from the Reschedule sheet's
        // submit path surfaces `data.message`. The centralized
        // `useRescheduleAppointment.onError` already logs this; the
        // sheet-side log additionally captures the form-derived
        // payload (start/end/notification preference) the user just
        // confirmed. Greppable prefix `[CAL:409-DIAG]`.
        const e = err as
          | {
              response?: {
                status?: number;
                data?: { message?: string } | unknown;
              };
            }
          | undefined;
        const body = e?.response?.data;
        console.error("[CAL:409-DIAG] reschedule sheet submit failed", {
          status: e?.response?.status,
          message:
            body && typeof body === "object" && "message" in body
              ? (body as { message?: string }).message
              : undefined,
          body,
          payload: {
            appointmentId: appointment.id,
            startIso: submitInput.startIso,
            endIso: submitInput.endIso,
            newTechnicianId,
            notificationPreference: submitInput.notificationPreference,
          },
        });
      }
    };

    if (!appointment) return null;

    const originalTime = appointment.scheduled_time
      ? formatTime(appointment.scheduled_time)
      : "--:--";
    const originalDate = appointment.scheduled_date ?? "--";

    return (
      <AppSheet defaultSide="right"
        ref={ref}
        index={0}
        defaultSnapPoints={snapPoints}
        enablePanDownToClose
        onClose={onClose}
        onChange={(idx) => console.log("[CAL:reschedule] sheet index →", idx)}
      >
        <BottomSheetScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Reschedule Appointment</Text>
          <Text style={styles.customer}>{appointment.customer_name}</Text>

          <View style={styles.fromSection}>
            <Text style={styles.fromLabel}>Current</Text>
            <Text style={styles.fromValue}>{originalDate} at {originalTime}</Text>
            {appointment.technician_name && (
              <Text style={styles.fromTech}>{appointment.technician_name}</Text>
            )}
          </View>

          <View style={styles.pickerSection}>
            <Text style={styles.pickerTitle}>New Date & Time</Text>

            <View style={styles.pickerRow}>
              <Text style={styles.pickerLabel}>Date</Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustDate(-1)}>
                  <MaterialIcons name="chevron-left" size={22} color="#3B82F6" />
                </TouchableOpacity>
                <Text style={styles.stepperValue}>
                  {(selectedDate as Dayjs).format("ddd, MMM D")}
                </Text>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustDate(1)}>
                  <MaterialIcons name="chevron-right" size={22} color="#3B82F6" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.pickerRow}>
              <Text style={styles.pickerLabel}>Time</Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustHour(-1)}>
                  <MaterialIcons name="remove" size={18} color="#3B82F6" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustMinute(-15)}>
                  <Text style={styles.stepperMini}>-15m</Text>
                </TouchableOpacity>
                <Text style={styles.stepperValue}>
                  {(selectedDate as Dayjs).format("h:mm A")}
                </Text>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustMinute(15)}>
                  <Text style={styles.stepperMini}>+15m</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustHour(1)}>
                  <MaterialIcons name="add" size={18} color="#3B82F6" />
                </TouchableOpacity>
              </View>
            </View>

            {newTechnicianName && (
              <View style={styles.pickerRow}>
                <Text style={styles.pickerLabel}>Technician</Text>
                <Text style={styles.techValue}>{newTechnicianName}</Text>
              </View>
            )}
          </View>

          <Text style={styles.label}>Notification</Text>
          <Controller
            control={control}
            name="notificationPreference"
            render={({ field: { onChange, value } }) => (
              <View style={styles.prefRow}>
                {NOTIFICATION_PREF_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.prefBtn, value === opt.value && styles.prefBtnActive]}
                    onPress={() => onChange(opt.value)}
                  >
                    <Text style={[styles.prefText, value === opt.value && styles.prefTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          />

          <Text style={styles.label}>Custom Message (optional)</Text>
          <Controller
            control={control}
            name="customMessage"
            render={({ field: { onChange, value } }) => (
              <BottomSheetTextInput
                style={styles.input}
                value={value}
                onChangeText={onChange}
                placeholder="Add a personal note..."
                placeholderTextColor="#9CA3AF"
                multiline
              />
            )}
          />

          <TouchableOpacity
            style={[styles.confirmBtn, rescheduleMutation.isPending && { opacity: 0.6 }]}
            onPress={handleSubmit(onSubmit)}
            disabled={rescheduleMutation.isPending}
          >
            <Text style={styles.confirmText}>Confirm Reschedule</Text>
          </TouchableOpacity>
        </BottomSheetScrollView>
      </AppSheet>
    );
  },
);

function formatTime(time: string): string {
  const d = dayjs(`2000-01-01T${time}`);
  return d.isValid() ? d.format("h:mm A") : time;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 4 },
  customer: { fontSize: 14, color: "#6B7280", marginBottom: 16 },
  fromSection: {
    backgroundColor: "#F9FAFB", padding: 14, borderRadius: 12,
    marginBottom: 16, borderWidth: 1, borderColor: "#E5E7EB",
  },
  fromLabel: { fontSize: 11, fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", marginBottom: 4 },
  fromValue: { fontSize: 14, fontWeight: "600", color: "#374151" },
  fromTech: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  pickerSection: {
    backgroundColor: "#EFF6FF", padding: 14, borderRadius: 12,
    marginBottom: 16, borderWidth: 1, borderColor: "#BFDBFE",
  },
  pickerTitle: { fontSize: 13, fontWeight: "700", color: "#1D4ED8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  pickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  pickerLabel: { fontSize: 13, fontWeight: "600", color: "#374151", width: 70 },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1, justifyContent: "center" },
  stepperBtn: {
    width: 34, height: 34, borderRadius: 8, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#DBEAFE",
  },
  stepperMini: { fontSize: 11, fontWeight: "600", color: "#3B82F6" },
  stepperValue: { fontSize: 15, fontWeight: "700", color: "#1E40AF", minWidth: 100, textAlign: "center" },
  techValue: { fontSize: 14, fontWeight: "600", color: "#1E40AF" },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 },
  prefRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 },
  prefBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "#F3F4F6" },
  prefBtnActive: { backgroundColor: "#3B82F6" },
  prefText: { fontSize: 13, fontWeight: "500", color: "#6B7280" },
  prefTextActive: { color: "#fff" },
  input: {
    borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10,
    padding: 12, fontSize: 14, color: "#374151",
    minHeight: 50, textAlignVertical: "top", marginBottom: 20,
  },
  confirmBtn: { backgroundColor: "#3B82F6", paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  confirmText: { fontSize: 16, fontWeight: "600", color: "#fff" },
});
