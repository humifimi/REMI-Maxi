import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, Text, Alert, useWindowDimensions } from "react-native";
import { TouchableOpacity } from "react-native-gesture-handler";
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { AppSheet, type AppSheetRef } from "@technician/components/sheets";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCreatePersonalEvent, useUpdatePersonalEvent, useDeletePersonalEvent } from "@technician/hooks/schedule/use-personal-events";
import { useCalendarWorldSnapshot } from "@technician/hooks/schedule/use-calendar-world-snapshot";
import { useSessionAwareSubmit } from "@technician/hooks/schedule/use-session-aware-submit";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type { PersonalEvent } from "@technician/types/calendar";
import type { ReorganizationIntentPayload } from "@technician/types/reorganization";
import { localToBackendISO, backendISOToLocalParts } from "@technician/utils/datetime";
import { TimeField } from "@technician/components/calendar/time-field";
import {
  clearSheetDraft,
  useSheetDraftRead,
  useSheetDraftWrite,
} from "@technician/hooks/calendar/use-sheet-draft-cache";
import { useRotateBackToastStore } from "@technician/stores/rotate-back-toast";

interface PersonalEventFormSheetProps {
  event?: PersonalEvent | null;
  defaultDate?: string;
  defaultStartTime?: string;
  defaultEndTime?: string;
  /**
   * Tech the event should be associated with. Sourced from the
   * tap-to-create context (`newApptDefaults.technicianId`) so that
   * the personal event lands in the column the FO tapped.
   *
   * 2026-04-22 bug fix: previously this prop did not exist, so the
   * form created personal events with no `shared_with` association
   * and the day-view response (which groups personal events under
   * each tech via `tech.shared_with` membership) showed them on no
   * column → invisible. Mirrors `defaultTechnicianId` on
   * `AppointmentFormSheet`.
   *
   * Optional: if the FO opens the form without a tap context, omit
   * to fall back to a solo personal event (only visible to the FO).
   */
  defaultTechnicianId?: number;
  onClose: () => void;
  /**
   * P3-FE-6 — fires from save / delete success branches BEFORE
   * `onClose`. See `AppointmentFormSheet.onSubmitted` for the full
   * contract; in short, the parent uses this to dismiss the
   * underlying `useCalendarStore.pendingDraft` only when the user
   * commits or deletes — implicit close (tap-outside, swipe-down)
   * preserves the draft and the cached typing.
   */
  onSubmitted?: () => void;
  /**
   * P3-FE-6 — opaque cache key for the in-flight form contents.
   * Same contract as `AppointmentFormSheet.cacheKey`: typically
   * `draft:<draftId>` for tap-to-create flows or `pe:<eventId>`
   * for edit flows. When provided, the sheet seeds initial state
   * from the cache (if any) instead of from `event`/defaults, and
   * keeps writing the latest typed values back (debounced) so an
   * implicit close (tap-outside, swipe-down, navigation) preserves
   * the user's typing across re-opens. Save success and the
   * explicit close path clear the cache.
   *
   * Pass `undefined` to disable caching.
   *
   * See `docs/DEVELOPMENT-LOG.md#deferred-chunk-p3-fe-6`.
   */
  cacheKey?: string;
  /**
   * Visual presentation of the form contents. Mirrors the
   * `AppointmentFormSheet` API so both create-paths feel identical
   * when the FO is in landscape (P2-FE-5 chunk 2 follow-up,
   * 2026-04-22).
   *
   * - "upright" (default): normal portrait-oriented form, fully
   *   interactive.
   * - "sideways": form contents are rotated 90° behind a "Rotate to
   *   portrait to fill in details" banner. Used when the sheet opens
   *   while the device is in landscape so the user is prompted to
   *   physically rotate before filling fields. The sheet does NOT
   *   remount on rotation — the parent re-renders with a new
   *   `presentation` prop and the form snaps back to interactive in
   *   place.
   *
   * See `docs/PLAN-DEVIATIONS.md#2026-04-21-rotation-sideways-draft`.
   */
  presentation?: "upright" | "sideways";
}

function addOneHour(time: string): string {
  const [h, m] = time.split(":").map((v) => parseInt(v, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return "10:00";
  const endH = Math.min(23, h + 1);
  return `${String(endH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export const PersonalEventFormSheet = forwardRef<AppSheetRef, PersonalEventFormSheetProps>(
  function PersonalEventFormSheet(
    {
      event,
      defaultDate,
      defaultStartTime,
      defaultEndTime,
      defaultTechnicianId,
      onClose,
      onSubmitted,
      presentation = "upright",
      cacheKey,
    },
    ref,
  ) {
    const snapPoints = useMemo(() => ["60%"], []);
    const isSideways = presentation === "sideways";
    const { width: screenW, height: screenH } = useWindowDimensions();

    // Sideways mode: BottomSheet stays full-width landscape; inner
    // content is laid out in a portrait-shaped box and rotated 90°.
    // The inner box is sized (sheetH × screenW) so that after the
    // rotate it visually appears as a (screenW × sheetH) panel
    // coming out of the side of the phone. Sheet height here is the
    // 60% snap-point — half of AppointmentFormSheet's 90%.
    const sidewaysInnerStyle = useMemo(() => {
      if (!isSideways) return undefined;
      const sheetH = screenH * 0.6;
      return {
        width: sheetH,
        height: screenW,
        transform: [{ rotate: "90deg" as const }],
      };
    }, [isSideways, screenW, screenH]);

    const createMutation = useCreatePersonalEvent();
    const updateMutation = useUpdatePersonalEvent();
    const deleteMutation = useDeletePersonalEvent();
    const isEdit = !!event;

    const initialStart = defaultStartTime ?? "09:00";
    const initialEnd = defaultEndTime ?? addOneHour(initialStart);

    // P3-FE-6 — useState-based sheet variant of the cache pattern.
    // Read once at mount; if cached values exist for this
    // `cacheKey`, seed each useState's initial value from the cache
    // instead of from `event`/defaults. The sync `useEffect` below
    // is then suppressed for the very first render so it doesn't
    // immediately overwrite the restored cache. Subsequent
    // dependency changes (e.g. parent re-uses the sheet for a
    // different event without unmounting) still flow through the
    // effect normally.
    interface PECachedDraft {
      title: string;
      date: string;
      startTime: string;
      endTime: string;
      notes: string;
    }
    const cachedDraft = useSheetDraftRead<PECachedDraft>({
      cacheKey,
      sheetKind: "personal-event",
    });

    const [title, setTitle] = useState(cachedDraft?.title ?? "");
    const [date, setDate] = useState(
      cachedDraft?.date ?? defaultDate ?? new Date().toISOString().split("T")[0],
    );
    const [startTime, setStartTime] = useState(cachedDraft?.startTime ?? initialStart);
    const [endTime, setEndTime] = useState(cachedDraft?.endTime ?? initialEnd);
    const [notes, setNotes] = useState(cachedDraft?.notes ?? "");

    const skipNextDepSyncRef = useRef<boolean>(cachedDraft != null);

    useEffect(() => {
      if (skipNextDepSyncRef.current) {
        // First render after a cache restore — keep the restored
        // values intact. Future dep changes resume normal sync.
        skipNextDepSyncRef.current = false;
        return;
      }
      if (event) {
        // 2026-04-21 fix: `event.start_time`/`end_time` come from the
        // backend as fully-qualified ISO strings (e.g.
        // "2026-04-21T13:00:00.000Z"), NOT as "HH:MM:SS". The previous
        // `.slice(0, 5)` returned literal "2026-" and silently bricked
        // the edit prefill. Use the canonical helper so the edit form
        // always shows the local wall-clock the user originally typed.
        const startParts = backendISOToLocalParts(event.start_time);
        const endParts = backendISOToLocalParts(event.end_time);
        setTitle(event.title);
        setDate(startParts.date);
        setStartTime(startParts.time);
        setEndTime(endParts.time);
        setNotes(event.notes ?? "");
      } else {
        setTitle("");
        setDate(defaultDate ?? new Date().toISOString().split("T")[0]);
        const nextStart = defaultStartTime ?? "09:00";
        setStartTime(nextStart);
        setEndTime(defaultEndTime ?? addOneHour(nextStart));
        setNotes("");
      }
    }, [event, defaultDate, defaultStartTime, defaultEndTime]);

    // Bag the live useState values into a memoized object so the
    // cache writer's dep-equality check fires on any field change.
    const draftSnapshot = useMemo<PECachedDraft>(
      () => ({ title, date, startTime, endTime, notes }),
      [title, date, startTime, endTime, notes],
    );
    useSheetDraftWrite<PECachedDraft>({
      cacheKey,
      sheetKind: "personal-event",
      values: draftSnapshot,
    });

    // Explicit close path (save / delete success). Mirrors
    // `AppointmentFormSheet.closeAndClearCache` — clear cache, fire
    // `onSubmitted` so the parent can dismiss the underlying
    // `pendingDraft`, then close. Implicit close (tap-outside,
    // swipe-down) bypasses this helper by design and preserves both
    // the cache and the dashed draft block.
    const closeAndClearCache = useCallback(() => {
      clearSheetDraft(cacheKey, "personal-event");
      // PR 2.4 (2026-04-24) — fire the rotate-back toast if the
      // sheet was opened in landscape (forced portrait via the
      // sideways banner). See `appointment-form-sheet.tsx` for the
      // pattern's rationale.
      if (isSideways) {
        useRotateBackToastStore.getState().show();
      }
      onSubmitted?.();
      onClose();
    }, [cacheKey, onSubmitted, onClose, isSideways]);

    // ── P3-FE-7 — smart-default linter intercept ────────────────
    // create / update / delete each map to a distinct
    // ReorganizationIntentPayload kind; route all three through
    // `useSessionAwareSubmit`. The version field on update / delete
    // intents is a placeholder (`1`) until the FE PersonalEvent
    // type carries an explicit version — the linter doesn't read
    // the field today, and the BE re-numbers it at finalize.
    const worldSnapshot = useCalendarWorldSnapshot();

    interface PersonalCreateInput {
      technicianId: number;
      date: string;
      startHHmm: string;
      endHHmm: string;
      title: string;
      payload: { title: string; date: string; start_time: string; end_time: string; notes?: string; shared_with?: number[] };
    }
    interface PersonalUpdateInput {
      eventId: string;
      payload: { title: string; date: string; start_time: string; end_time: string; notes?: string; shared_with?: number[] };
      newDate: string;
      newStart: string;
      newEnd: string;
      newTitle: string;
    }
    interface PersonalDeleteInput {
      eventId: string;
    }

    const buildCreateIntent = useCallback(
      (input: PersonalCreateInput): ReorganizationIntentPayload => ({
        kind: "personal_event_create",
        technician_id: input.technicianId,
        scheduled_date: input.date,
        start_time: input.startHHmm,
        end_time: input.endHHmm,
        title: input.title,
        category: "general",
      }),
      [],
    );
    const liveCreate = useCallback(
      async (input: PersonalCreateInput) => {
        await createMutation.mutateAsync(input.payload);
        closeAndClearCache();
      },
      [createMutation, closeAndClearCache],
    );
    const sessionAwareCreate = useSessionAwareSubmit<PersonalCreateInput>({
      buildProposedIntent: buildCreateIntent,
      liveMutate: liveCreate,
      worldSnapshot,
    });

    const buildUpdateIntent = useCallback(
      (input: PersonalUpdateInput): ReorganizationIntentPayload => ({
        kind: "personal_event_update",
        version: 1,
        patch: {
          scheduled_date: input.newDate,
          start_time: input.newStart,
          end_time: input.newEnd,
          title: input.newTitle,
        },
      }),
      [],
    );
    const liveUpdate = useCallback(
      async (input: PersonalUpdateInput) => {
        await updateMutation.mutateAsync({ id: input.eventId, payload: input.payload });
        closeAndClearCache();
      },
      [updateMutation, closeAndClearCache],
    );
    const sessionAwareUpdate = useSessionAwareSubmit<PersonalUpdateInput>({
      buildProposedIntent: buildUpdateIntent,
      liveMutate: liveUpdate,
      worldSnapshot,
    });

    const buildDeleteIntent = useCallback(
      (_input: PersonalDeleteInput): ReorganizationIntentPayload => ({
        kind: "personal_event_delete",
        version: 1,
      }),
      [],
    );
    const liveDelete = useCallback(
      async (input: PersonalDeleteInput) => {
        await deleteMutation.mutateAsync(input.eventId);
        closeAndClearCache();
      },
      [deleteMutation, closeAndClearCache],
    );
    const sessionAwareDelete = useSessionAwareSubmit<PersonalDeleteInput>({
      buildProposedIntent: buildDeleteIntent,
      liveMutate: liveDelete,
      worldSnapshot,
      targetPersonalEventId: event?.id ?? null,
    });

    const handleSubmit = async () => {
      if (!title.trim()) {
        Alert.alert("Required", "Please enter a title");
        return;
      }
      haptic.medium();
      // 2026-04-22 bug fix: include the tech association via
      // `shared_with` so the day-view response groups this event
      // under the tapped tech's column. Without it the event lives
      // solo on the FO's account and is invisible on every column.
      // On edit, preserve the existing `shared_with` (set on the
      // server when the event was originally created) — the form
      // doesn't yet expose a multi-tech picker, so we don't want a
      // second save to silently drop other shared techs.
      const sharedWith =
        isEdit && event
          ? event.shared_with
          : defaultTechnicianId != null
            ? [defaultTechnicianId]
            : undefined;

      // 2026-04-21 audit (item 4): if we're creating and have no
      // sharedWith, the event commits with no tech association and
      // is invisible on every column (the day-view response groups
      // events by `shared_with` membership). The chooser-pick path
      // already guards `defaultTechnicianId`, so this is double-belt
      // for any future caller that opens the sheet without going
      // through the draft → chooser flow (e.g. a hypothetical
      // "Create personal event" button in a settings menu). Don't
      // silently submit a no-association event.
      if (!isEdit && !sharedWith) {
        console.warn(
          "[PE:form] CREATE submitted without shared_with — event will be invisible on tech columns",
          { defaultTechnicianId, date, startTime },
        );
      }

      // 2026-04-21 fix: `personal_events.start_time`/`end_time` are
      // Postgres `timestamptz` columns. A naive `${date}T${time}:00`
      // string has no timezone marker, so Postgres applies the server
      // session TZ (UTC on Render) and the round-trip rendered events
      // 4 hours earlier than the user typed (the "wrong times" bug).
      // `localToBackendISO` emits an ISO string with the device's
      // current UTC offset so the absolute moment is preserved.
      // Contract lives in `src/utils/datetime.ts` (and the
      // `datetime-and-data-format-contracts.mdc` rule, forthcoming).
      const payload = {
        title: title.trim(),
        date,
        start_time: localToBackendISO(date, startTime),
        end_time: localToBackendISO(date, endTime),
        notes: notes.trim() || undefined,
        ...(sharedWith ? { shared_with: sharedWith } : {}),
      };

      console.log("[PE:form] submit", {
        isEdit,
        defaultTechnicianId,
        sharedWith,
        date,
        startTime,
        endTime,
      });

      try {
        const outcome = isEdit && event
          ? await sessionAwareUpdate({
              eventId: event.id,
              payload,
              newDate: date,
              newStart: startTime,
              newEnd: endTime,
              newTitle: title.trim(),
            })
          : await sessionAwareCreate({
              technicianId: defaultTechnicianId ?? 0,
              date,
              startHHmm: startTime,
              endHHmm: endTime,
              title: title.trim(),
              payload,
            });
        // D2P-FE-13 follow-up — close on `staged`. Live-commit
        // and apply-anyway already close from inside the live
        // mutate fn; dismissed leaves the sheet open for re-edit.
        if (outcome.kind === "staged") {
          closeAndClearCache();
        }
      } catch (err) {
        console.error("[PE:form] mutation failed", err);
      }
    };

    const handleDelete = () => {
      if (!event) return;
      Alert.alert("Delete Event", `Delete "${event.title}"?`, [
        { text: "Keep", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            sessionAwareDelete({ eventId: event.id })
              .then((outcome) => {
                // D2P-FE-13 follow-up — close on `staged`; live
                // delete + apply-anyway close from inside
                // `liveDelete` already.
                if (outcome.kind === "staged") {
                  closeAndClearCache();
                }
              })
              .catch((err) => {
                console.error("[PE:form] delete failed", err);
              });
          },
        },
      ]);
    };

    const isPending = createMutation.isPending || updateMutation.isPending;

    // Form children extracted so upright and sideways branches share
    // the same exact tree (mirrors AppointmentFormSheet's `formBody`
    // pattern).
    const formBody = (
      <>
        <Text style={styles.title}>{isEdit ? "Edit Event" : "New Personal Event"}</Text>

        <Text style={styles.label}>Title</Text>
        <BottomSheetTextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Event title" placeholderTextColor="#9CA3AF" />

        <Text style={styles.label}>Date</Text>
        <BottomSheetTextInput style={styles.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor="#9CA3AF" />

        {/* 2026-04-21: native time pickers via <TimeField>. Replaces the
            two raw HH:MM TextInputs that were error-prone (typos →
            invalid payload, no timezone affordance, no AM/PM cue).
            <TimeField> still emits canonical "HH:MM" strings so the
            `localToBackendISO` consumer below is unchanged. */}
        <View style={styles.timeRow}>
          <TimeField label="Start" value={startTime} onChange={setStartTime} />
          <TimeField label="End" value={endTime} onChange={setEndTime} />
        </View>

        <Text style={styles.label}>Notes (optional)</Text>
        <BottomSheetTextInput style={[styles.input, { minHeight: 60 }]} value={notes} onChangeText={setNotes} placeholder="Notes..." placeholderTextColor="#9CA3AF" multiline />

        <TouchableOpacity style={[styles.submitBtn, isPending && { opacity: 0.6 }]} onPress={handleSubmit} disabled={isPending}>
          <Text style={styles.submitText}>{isEdit ? "Update Event" : "Create Event"}</Text>
        </TouchableOpacity>

        {isEdit && (
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <Text style={styles.deleteText}>Delete Event</Text>
          </TouchableOpacity>
        )}
      </>
    );

    return (
      <AppSheet defaultSide="right"
        ref={ref}
        index={0}
        defaultSnapPoints={snapPoints}
        enablePanDownToClose
        onClose={onClose}
      >
        {isSideways ? (
          // P2-FE-5 chunk 2 follow-up (2026-04-22): sideways presentation.
          // Mirrors AppointmentFormSheet — see that file's matching block
          // for the design rationale. The two sheets must behave
          // identically here because the user explicitly called out the
          // inconsistency: "the personal event thing I asked you to fix
          // was about turning for portrait like the other kind of
          // appointment forces you to do from landscape."
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
  title: { fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 },
  input: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, padding: 12, fontSize: 14, color: "#374151", marginBottom: 14 },
  timeRow: { flexDirection: "row", gap: 12 },
  timeField: { flex: 1 },
  submitBtn: { backgroundColor: "#3B82F6", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 4 },
  submitText: { fontSize: 16, fontWeight: "600", color: "#fff" },
  deleteBtn: { paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 10, borderWidth: 1, borderColor: "#FCA5A5" },
  deleteText: { fontSize: 14, fontWeight: "600", color: "#EF4444" },

  // Sideways presentation (landscape rotation cue). Visual styling
  // intentionally identical to AppointmentFormSheet so the two sheets
  // feel like a single family in landscape.
  // See docs/PLAN-DEVIATIONS.md#2026-04-21-rotation-sideways-draft.
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
    // Width/height/transform set inline via `sidewaysInnerStyle`
    // because they depend on `useWindowDimensions()`.
  },
  sidewaysContentDim: {
    opacity: 0.4,
  },
});
