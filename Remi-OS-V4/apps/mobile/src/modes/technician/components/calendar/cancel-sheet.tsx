import { forwardRef, useCallback, useMemo, useState } from "react";
import { StyleSheet, View, Text, useWindowDimensions } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { BottomSheetScrollView, BottomSheetTextInput, TouchableOpacity } from "@gorhom/bottom-sheet";
import { AppSheet, type AppSheetRef } from "@technician/components/sheets";
import { useCancelAppointment } from "@technician/hooks/schedule/use-calendar";
import { useCalendarWorldSnapshot } from "@technician/hooks/schedule/use-calendar-world-snapshot";
import { useSessionAwareSubmit } from "@technician/hooks/schedule/use-session-aware-submit";
import { NOTIFICATION_PREF_OPTIONS } from "@technician/constants/calendar";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type { CalendarAppointmentItem, FlexListEntry } from "@technician/types/calendar";
import type { CalendarNotificationPreference } from "@technician/types/enums";
import type { ReorganizationIntentPayload } from "@technician/types/reorganization";
import {
  clearSheetDraft,
  useSheetDraftRead,
  useSheetDraftWrite,
} from "@technician/hooks/calendar/use-sheet-draft-cache";
import { useRotateBackToastStore } from "@technician/stores/rotate-back-toast";

interface CancelSheetProps {
  appointment: CalendarAppointmentItem | null;
  onClose: () => void;
  onFlexMatches?: (matches: FlexListEntry[]) => void;
  /**
   * P3-FE-6 — opaque cache key for the in-flight cancel form.
   * Typically `cancel:<appointmentId>` so re-opening the sheet for
   * the same appointment restores the user's reason / custom
   * message. Pass `undefined` to disable caching.
   *
   * See `docs/DEVELOPMENT-LOG.md#deferred-chunk-p3-fe-6`.
   */
  cacheKey?: string;
  /**
   * PR 2.3 (2026-04-24) — visual presentation. Mirrors the
   * `AppointmentFormSheet` / `RescheduleSheet` pattern:
   * - "upright" (default): standard portrait sheet contents.
   * - "sideways": form contents are rotated 90° behind a "Rotate to
   *   portrait" banner. Used when the parent screen is in landscape,
   *   so the user knows to rotate the phone before editing. The
   *   sheet does NOT remount on rotation — when the parent re-renders
   *   with `presentation="upright"`, the banner and transform peel
   *   away in place.
   *
   * See PLAN-DEVIATIONS#2026-04-21-rotation-sideways-draft for the
   * pattern's history.
   */
  presentation?: "upright" | "sideways";
}

export const CancelSheet = forwardRef<AppSheetRef, CancelSheetProps>(
  function CancelSheet({ appointment, onClose, onFlexMatches, cacheKey, presentation = "upright" }, ref) {
    const snapPoints = useMemo(() => ["55%"], []);
    const cancelMutation = useCancelAppointment();
    const isSideways = presentation === "sideways";
    const { width: screenW, height: screenH } = useWindowDimensions();

    const sidewaysInnerStyle = useMemo(() => {
      if (!isSideways) return undefined;
      const sheetH = screenH * 0.55;
      return {
        width: sheetH,
        height: screenW,
        transform: [{ rotate: "90deg" as const }],
      };
    }, [isSideways, screenW, screenH]);

    // P3-FE-6 — see use-sheet-draft-cache.ts. Read-once seed for
    // each useState; debounced writer keeps cache fresh; cleared on
    // explicit close path below.
    interface CancelCachedDraft {
      reason: string;
      notifPref: CalendarNotificationPreference;
      customMessage: string;
    }
    const cachedDraft = useSheetDraftRead<CancelCachedDraft>({
      cacheKey,
      sheetKind: "cancel",
    });
    const [reason, setReason] = useState(cachedDraft?.reason ?? "");
    const [notifPref, setNotifPref] = useState<CalendarNotificationPreference>(
      cachedDraft?.notifPref ?? "email_and_text",
    );
    const [customMessage, setCustomMessage] = useState(cachedDraft?.customMessage ?? "");

    const draftSnapshot = useMemo<CancelCachedDraft>(
      () => ({ reason, notifPref, customMessage }),
      [reason, notifPref, customMessage],
    );
    useSheetDraftWrite<CancelCachedDraft>({
      cacheKey,
      sheetKind: "cancel",
      values: draftSnapshot,
    });

    const closeAndClearCache = useCallback(() => {
      clearSheetDraft(cacheKey, "cancel");
      onClose();
    }, [cacheKey, onClose]);

    // ── P3-FE-7 — smart-default linter intercept ────────────────
    // Cancel intents are load-bearing: §6.4.1 commits cancels FIRST
    // at finalize so they free up capacity before downstream
    // reschedules. Wiring this CTA through `useSessionAwareSubmit`
    // is the entry-point that lets the user stage a cancel for FO
    // review when the linter sees an SLA breach or a cascading
    // dependency.
    const worldSnapshot = useCalendarWorldSnapshot();

    interface CancelSubmitInput {
      reason: string;
      notifPref: CalendarNotificationPreference;
      customMessage: string;
    }

    const buildCancelIntent = useCallback(
      (input: CancelSubmitInput): ReorganizationIntentPayload => ({
        kind: "cancel",
        cancellation_reason: input.reason || "unspecified",
        ...(input.customMessage ? { cancellation_note: input.customMessage } : {}),
      }),
      [],
    );

    const liveCancel = useCallback(
      async (input: CancelSubmitInput) => {
        if (!appointment) return;
        const data = await cancelMutation.mutateAsync({
          id: appointment.id,
          payload: {
            reason: input.reason || undefined,
            notification_preference: input.notifPref,
            custom_message: input.customMessage || undefined,
          },
        });
        if (data.flex_matches?.length && onFlexMatches) {
          onFlexMatches(data.flex_matches);
        }
        // PR 2.4 (2026-04-24) — fire the rotate-back toast if the
        // sheet was opened in landscape (forced portrait via the
        // sideways banner). Goal: nudge the user back to the
        // landscape calendar canvas they started from instead of
        // marooning them in portrait.
        if (isSideways) {
          useRotateBackToastStore.getState().show();
        }
        closeAndClearCache();
      },
      [appointment, cancelMutation, closeAndClearCache, onFlexMatches, isSideways],
    );

    const sessionAwareCancel = useSessionAwareSubmit<CancelSubmitInput>({
      buildProposedIntent: buildCancelIntent,
      liveMutate: liveCancel,
      worldSnapshot,
      targetAppointmentId: appointment?.id ?? null,
    });

    const handleCancel = async () => {
      if (!appointment) return;
      haptic.heavy();
      try {
        const outcome = await sessionAwareCancel({
          reason,
          notifPref,
          customMessage,
        });
        // D2P-FE-13 follow-up — close on `staged` so a second tap
        // can't double-stage. Live-commit and apply-anyway already
        // close from inside `liveCancel`; dismissed leaves it open.
        if (outcome.kind === "staged") {
          closeAndClearCache();
        }
      } catch (err) {
        console.error("[CancelSheet] cancel failed", err);
      }
    };

    if (!appointment) return null;

    const svcs = appointment.services ?? [];

    const formBody = (
      <>
        <Text style={styles.title}>Cancel Appointment</Text>

        <View style={styles.summary}>
          <Text style={styles.summaryName}>{appointment.customer_name}</Text>
          <Text style={styles.summaryDetail}>
            {svcs.map((s) => s.service_name).join(", ") || "No services"}
          </Text>
        </View>

        <Text style={styles.label}>Reason (optional)</Text>
        <BottomSheetTextInput
          style={styles.input}
          value={reason}
          onChangeText={setReason}
          placeholder="Why is this being cancelled?"
          placeholderTextColor="#9CA3AF"
          multiline
        />

        <Text style={styles.label}>Notification</Text>
        <View style={styles.prefRow}>
          {NOTIFICATION_PREF_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.prefBtn, notifPref === opt.value && styles.prefBtnActive]}
              onPress={() => setNotifPref(opt.value as CalendarNotificationPreference)}
            >
              <Text style={[styles.prefText, notifPref === opt.value && styles.prefTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Custom Message (optional)</Text>
        <BottomSheetTextInput
          style={styles.input}
          value={customMessage}
          onChangeText={setCustomMessage}
          placeholder="Personal note to customer..."
          placeholderTextColor="#9CA3AF"
        />

        <TouchableOpacity
          style={[styles.cancelBtn, cancelMutation.isPending && { opacity: 0.6 }]}
          onPress={handleCancel}
          disabled={cancelMutation.isPending}
        >
          <Text style={styles.cancelBtnText}>Cancel Appointment</Text>
        </TouchableOpacity>
      </>
    );

    return (
      <AppSheet defaultSide="right" ref={ref} index={-1} defaultSnapPoints={snapPoints} enablePanDownToClose onClose={onClose}>
        {isSideways ? (
          <View style={styles.sidewaysWrapper} collapsable={false}>
            <View style={styles.sidewaysBanner}>
              <MaterialIcons name="screen-rotation" size={20} color="#1D4ED8" />
              <Text style={styles.sidewaysBannerText}>
                Rotate to portrait to fill in details
              </Text>
            </View>
            <View style={styles.sidewaysContentClip} collapsable={false}>
              <View
                style={[styles.sidewaysContentWrap, sidewaysInnerStyle]}
                pointerEvents="none"
              >
                <BottomSheetScrollView
                  contentContainerStyle={[styles.content, styles.sidewaysContentDim]}
                  scrollEnabled={false}
                >
                  {formBody}
                </BottomSheetScrollView>
              </View>
            </View>
          </View>
        ) : (
          <BottomSheetScrollView contentContainerStyle={styles.content}>
            {formBody}
          </BottomSheetScrollView>
        )}
      </AppSheet>
    );
  }
);

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 18, fontWeight: "700", color: "#EF4444", marginBottom: 12 },
  summary: { backgroundColor: "#FEF2F2", padding: 14, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: "#FCA5A5" },
  summaryName: { fontSize: 16, fontWeight: "700", color: "#111827" },
  summaryDetail: { fontSize: 13, color: "#6B7280", marginTop: 4 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, padding: 12, fontSize: 14, color: "#374151", minHeight: 50, textAlignVertical: "top", marginBottom: 16 },
  prefRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 },
  prefBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "#F3F4F6" },
  prefBtnActive: { backgroundColor: "#3B82F6" },
  prefText: { fontSize: 13, fontWeight: "500", color: "#6B7280" },
  prefTextActive: { color: "#fff" },
  cancelBtn: { backgroundColor: "#EF4444", paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  cancelBtnText: { fontSize: 16, fontWeight: "600", color: "#fff" },

  // PR 2.3 (2026-04-24) — sideways presentation, mirrors AppointmentFormSheet.
  sidewaysWrapper: { flex: 1 },
  sidewaysBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#EFF6FF",
    borderBottomWidth: 1,
    borderBottomColor: "#BFDBFE",
  },
  sidewaysBannerText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1D4ED8",
  },
  sidewaysContentClip: {
    flex: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  sidewaysContentWrap: {
    // Width/height/transform set inline via `sidewaysInnerStyle`.
  },
  sidewaysContentDim: {
    opacity: 0.4,
  },
});
