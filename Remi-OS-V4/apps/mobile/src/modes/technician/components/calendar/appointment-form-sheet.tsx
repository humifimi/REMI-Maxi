import { forwardRef, useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View, Text, Alert, useWindowDimensions } from "react-native";
import { TouchableOpacity } from "react-native-gesture-handler";
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { AppSheet, type AppSheetRef } from "@technician/components/sheets";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateAppointment, useUpdateAppointment } from "@technician/hooks/schedule/use-calendar";
import { useCalendarWorldSnapshot } from "@technician/hooks/schedule/use-calendar-world-snapshot";
import { useSessionAwareSubmit } from "@technician/hooks/schedule/use-session-aware-submit";
import {
  useCustomerSearch,
  useQuickCreateCustomer,
} from "@technician/hooks/schedule/use-calendar-customers";
import { useDebouncedValue } from "@technician/hooks/utility/use-debounced-value";
import { useCalendarServices } from "@technician/hooks/schedule/use-calendar-services";
import type { ReorganizationIntentPayload } from "@technician/types/reorganization";
import { NOTIFICATION_PREF_OPTIONS, SLOT_TYPE_COLORS } from "@technician/constants/calendar";
import { SlotTypeLabels } from "@technician/constants/colors";
import { haptic } from "@technician/hooks/utility/use-haptics";
import {
  appointmentFormSchema,
  quickCreateCustomerSchema,
  type AppointmentFormValues,
  type QuickCreateCustomerValues,
} from "@technician/schemas/appointmentForm";
import type { CalendarAppointmentItem, CustomerSearchResult } from "@technician/types/calendar";
import type { SlotType } from "@technician/types/enums";
import {
  clearSheetDraft,
  useSheetDraftRead,
  useSheetDraftWrite,
} from "@technician/hooks/calendar/use-sheet-draft-cache";
import { useRotateBackToastStore } from "@technician/stores/rotate-back-toast";

interface AppointmentFormSheetProps {
  editAppointment?: CalendarAppointmentItem | null;
  defaultDate?: string;
  defaultStartTime?: string;
  defaultTechnicianId?: number;
  onClose: () => void;
  /**
   * P3-FE-6 — fires from save-success branches BEFORE `onClose`.
   * Distinguishes "user committed the form" from "user implicitly
   * closed the sheet" (swipe-down, tap-outside) which only triggers
   * `onClose`. The parent uses this to dismiss the underlying
   * `useCalendarStore.pendingDraft` only on commit, so the dashed
   * draft block stays on the canvas after an implicit close — the
   * user can re-tap it to reopen the form with their typing intact
   * (the cache survives implicit close by design).
   *
   * If omitted, only `onClose` is used and the parent must
   * dismiss-draft itself if it wants the draft cleaned up post-save.
   */
  onSubmitted?: () => void;
  /**
   * P3-FE-6 — opaque cache key for the in-flight RHF values. When
   * provided, this sheet reads any cached values for the same key
   * as `useForm` defaults on mount, and writes the latest watched
   * values back to the cache (debounced) so an implicit close
   * (tap-outside, swipe-down, navigation) preserves the user's
   * typing across re-opens. Save success and the explicit
   * `onClose` path clear the cache for this key.
   *
   * The screen mounting the sheet derives the key — typically
   * `draft:<draftId>` for tap-to-create flows, or
   * `appt:<id>` for edit flows. Pass `undefined` to disable
   * caching (single-shot opens with no stable identity).
   *
   * See `docs/DEVELOPMENT-LOG.md#deferred-chunk-p3-fe-6`.
   */
  cacheKey?: string;
  /**
   * Visual presentation of the form contents.
   *
   * - "upright" (default): normal portrait-oriented form, fully interactive.
   * - "sideways": the form contents are rotated 90° and locked behind a
   *   "Rotate to portrait to fill in details" banner. Used when the sheet
   *   opens while the device is in landscape so the user is prompted to
   *   physically rotate the phone before filling out the form. The sheet
   *   itself does not remount on rotation — the parent re-renders with a
   *   new `presentation` prop and the form snaps back to interactive.
   *
   * See `docs/PLAN-DEVIATIONS.md#2026-04-21-rotation-sideways-draft`.
   */
  presentation?: "upright" | "sideways";
}

const SLOT_TYPES: SlotType[] = ["standard", "eco", "priority", "flex_window"];

export const AppointmentFormSheet = forwardRef<AppSheetRef, AppointmentFormSheetProps>(
  function AppointmentFormSheet(
    {
      editAppointment,
      defaultDate,
      defaultStartTime,
      defaultTechnicianId,
      onClose,
      onSubmitted,
      presentation = "upright",
      cacheKey,
    },
    ref,
  ) {
    const snapPoints = useMemo(() => ["90%"], []);
    const isSideways = presentation === "sideways";
    const { width: screenW, height: screenH } = useWindowDimensions();

    // Sideways mode: the BottomSheet itself stays full-width landscape, but
    // the inner content is rendered in a portrait-shaped box and rotated
    // 90° so it visually appears "on its side coming out of the side of
    // the phone." The dimensions below match the post-rotation visual size:
    // the inner View is laid out as (sheetHeight × screenWidth), then the
    // 90° rotation swaps it to (screenWidth × sheetHeight) on screen.
    const sidewaysInnerStyle = useMemo(() => {
      if (!isSideways) return undefined;
      const sheetH = screenH * 0.9;
      return {
        width: sheetH,
        height: screenW,
        transform: [{ rotate: "90deg" as const }],
      };
    }, [isSideways, screenW, screenH]);
    const createMutation = useCreateAppointment();
    const updateMutation = useUpdateAppointment();
    const servicesQuery = useCalendarServices();
    const quickCreateMutation = useQuickCreateCustomer();
    const isEdit = !!editAppointment;

    const [searchQuery, setSearchQuery] = useState("");
    // 2026-05-25 — debounce the live customer-search query so we
    // don't fire `/calendar/v2/customers/search` on every keystroke
    // (with 1,318 real franchise-169 customers, every search session
    // was firing 10+ network requests of which only the final result
    // ever rendered).
    const debouncedSearchQuery = useDebouncedValue(searchQuery, 250);
    const searchResult = useCustomerSearch(debouncedSearchQuery);
    const [showNewCustomer, setShowNewCustomer] = useState(false);

    const schema = useMemo(() => appointmentFormSchema(isEdit), [isEdit]);

    const derivedDefaults = useMemo<AppointmentFormValues>(
      () => ({
        customer: null,
        services: [],
        date: defaultDate ?? editAppointment?.scheduled_date ?? new Date().toISOString().split("T")[0]!,
        startTime: defaultStartTime ?? "09:00",
        slotType: editAppointment?.slot_type ?? "standard",
        notificationPreference: editAppointment?.notification_preference ?? "email_and_text",
        note: editAppointment?.appointment_note ?? "",
      }),
      [defaultDate, defaultStartTime, editAppointment],
    );

    // P3-FE-6 — sheet draft cache. Read-once snapshot seeds RHF
    // defaults so a re-open of the same draft restores the user's
    // typing; write-on-change keeps the cache fresh (debounced) so
    // the NEXT implicit close has the latest content. The cache is
    // cleared on save success and on the explicit close path below
    // — implicit close (tap-outside, swipe-down) is intentionally
    // NOT a clear, since preserving typing across that path is the
    // whole point of the chunk. See
    // `docs/DEVELOPMENT-LOG.md#deferred-chunk-p3-fe-6`.
    const cachedValues = useSheetDraftRead<AppointmentFormValues>({
      cacheKey,
      sheetKind: "appointment",
    });
    const initialValues = cachedValues ?? derivedDefaults;

    const {
      control,
      handleSubmit,
      setValue,
      watch,
      formState: { errors },
    } = useForm<AppointmentFormValues>({
      resolver: zodResolver(schema),
      defaultValues: initialValues,
      mode: "onSubmit",
    });

    const watchedValues = watch();
    useSheetDraftWrite<AppointmentFormValues>({
      cacheKey,
      sheetKind: "appointment",
      values: watchedValues,
    });

    // Explicit close path (save success / cancel CTA): clears the
    // cache, fires `onSubmitted` so the parent can dismiss the
    // underlying `pendingDraft`, then closes the sheet. Implicit
    // close (tap-outside, swipe-down) routes through
    // `BottomSheet.onClose → parent onClose` directly without
    // going through this helper — by design, that path preserves
    // both the cache and the underlying draft so the user can
    // re-tap the dashed block to reopen with their typing intact.
    const closeAndClearCache = useCallback(() => {
      clearSheetDraft(cacheKey, "appointment");
      // PR 2.4 (2026-04-24) — fire the rotate-back toast if the
      // sheet was opened in landscape (forced portrait via the
      // sideways banner). Goal: nudge the user back to the
      // landscape calendar canvas they started from.
      if (isSideways) {
        useRotateBackToastStore.getState().show();
      }
      onSubmitted?.();
      onClose();
    }, [cacheKey, onSubmitted, onClose, isSideways]);

    const {
      control: customerControl,
      handleSubmit: handleCustomerSubmit,
      reset: resetCustomerForm,
      setValue: setCustomerValue,
      formState: { errors: customerErrors },
    } = useForm<QuickCreateCustomerValues>({
      resolver: zodResolver(quickCreateCustomerSchema),
      defaultValues: { firstName: "", lastName: "", phone: "", email: "" },
      mode: "onSubmit",
    });

    const selectedCustomer = watch("customer");
    const selectedServices = watch("services");

    const services = servicesQuery.data ?? [];
    const isSearching = searchQuery.trim().length >= 1;
    const customers = isSearching ? (searchResult.data ?? []) : [];

    const selectedServiceDuration = services
      .filter((s) => selectedServices.includes(s.id))
      .reduce((sum, s) => sum + (s.base_price > 0 ? 60 : 30), 0);

    const totalPrice = services
      .filter((s) => selectedServices.includes(s.id))
      .reduce((sum, s) => sum + s.base_price, 0);

    const toggleService = useCallback(
      (id: number) => {
        const current = selectedServices ?? [];
        const next = current.includes(id) ? current.filter((s) => s !== id) : [...current, id];
        setValue("services", next, { shouldValidate: false });
      },
      [selectedServices, setValue],
    );

    const openNewCustomerForm = useCallback(() => {
      const trimmed = searchQuery.trim();
      if (trimmed.length > 0) {
        const parts = trimmed.split(/\s+/);
        setCustomerValue("firstName", parts[0] ?? "");
        setCustomerValue("lastName", parts.slice(1).join(" "));
      }
      setShowNewCustomer(true);
      haptic.light();
    }, [searchQuery, setCustomerValue]);

    const cancelNewCustomerForm = useCallback(() => {
      setShowNewCustomer(false);
      resetCustomerForm({ firstName: "", lastName: "", phone: "", email: "" });
    }, [resetCustomerForm]);

    const onSaveNewCustomer = useCallback(
      (values: QuickCreateCustomerValues) => {
        haptic.medium();
        quickCreateMutation.mutate(
          {
            first_name: values.firstName.trim(),
            last_name: values.lastName.trim(),
            phone: values.phone.trim(),
            email: values.email.trim() || undefined,
          },
          {
            onSuccess: (created) => {
              console.log("[ApptForm] quick-created customer", { id: created.id, name: `${created.first_name} ${created.last_name}` });
              setValue("customer", created as CustomerSearchResult, { shouldValidate: false });
              setSearchQuery("");
              cancelNewCustomerForm();
            },
            onError: (err) => {
              console.error("[ApptForm] quick-create failed", err);
              Alert.alert("Could not add customer", err instanceof Error ? err.message : "Please try again");
            },
          },
        );
      },
      [quickCreateMutation, setValue, cancelNewCustomerForm],
    );

    // Surface the first quick-create validation error via Alert so the
    // pre-RHF "Required" copy ("First and last name are required",
    // "Phone number is required") still fires from the same spot.
    useEffect(() => {
      const first =
        customerErrors.firstName?.message ??
        customerErrors.lastName?.message ??
        customerErrors.phone?.message;
      if (first) Alert.alert("Required", first);
    }, [customerErrors.firstName, customerErrors.lastName, customerErrors.phone]);

    // Same surfacing for the main form: keep the legacy Alert copy
    // for missing customer / missing services.
    useEffect(() => {
      const first =
        (errors.customer?.message as string | undefined) ??
        (errors.services?.message as string | undefined);
      if (first) Alert.alert("Required", first);
    }, [errors.customer, errors.services]);

    // ── P3-FE-7 — smart-default linter intercept ────────────────
    // Both modes (create + edit) wrap their live mutation through
    // `useSessionAwareSubmit`. The edit path's "update" mutation
    // doesn't have a clean intent counterpart in the discriminated
    // union (no `kind: "update"`), so today the edit path is wired
    // as a `reschedule` intent only when the user actually changed
    // date / start time. Pure metadata edits (slot type, note,
    // notification preference) skip the linter and call the live
    // mutation directly — there's no dependency edge for the
    // linter to flag on a slot-type change.
    const worldSnapshot = useCalendarWorldSnapshot();

    interface CreateSubmitInput {
      customerId: number;
      serviceIds: number[];
      date: string;
      startTime: string;
      endTime: string;
      slotType: AppointmentFormValues["slotType"];
      notificationPreference: AppointmentFormValues["notificationPreference"];
      note: string;
    }

    const buildCreateIntent = useCallback(
      (input: CreateSubmitInput): ReorganizationIntentPayload => ({
        kind: "create",
        customer_id: input.customerId,
        technician_id: defaultTechnicianId ?? null,
        scheduled_date: input.date,
        scheduled_start_time: input.startTime,
        scheduled_end_time: input.endTime,
        service_ids: input.serviceIds,
        ...(input.note ? { notes: input.note } : {}),
      }),
      [defaultTechnicianId],
    );

    const liveCreate = useCallback(
      async (input: CreateSubmitInput) => {
        await createMutation.mutateAsync({
          customer_id: input.customerId,
          service_ids: input.serviceIds,
          technician_id: defaultTechnicianId ?? 0,
          start_time: `${input.date}T${input.startTime}:00`,
          end_time: `${input.date}T${input.endTime}:00`,
          location_type: "shop",
          slot_type: input.slotType,
          notification_preference: input.notificationPreference,
          appointment_note: input.note || undefined,
        });
        closeAndClearCache();
      },
      [createMutation, defaultTechnicianId, closeAndClearCache],
    );

    const sessionAwareCreate = useSessionAwareSubmit<CreateSubmitInput>({
      buildProposedIntent: buildCreateIntent,
      liveMutate: liveCreate,
      worldSnapshot,
    });

    const onSubmit = async (values: AppointmentFormValues) => {
      haptic.medium();

      const endHour = parseInt(values.startTime.split(":")[0]!) + Math.ceil(selectedServiceDuration / 60);
      const endMinute = parseInt(values.startTime.split(":")[1] ?? "0");
      const endTimeStr = `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;

      if (isEdit && editAppointment) {
        // Pure metadata update — no linter intercept (no
        // ReorganizationIntentPayload kind for this; the linter
        // has no rule that fires on slot-type / note / pref
        // changes). If a future intent kind covers it, swap this
        // arm to `useSessionAwareSubmit`.
        updateMutation.mutate(
          {
            id: editAppointment.id,
            payload: {
              slot_type: values.slotType,
              notification_preference: values.notificationPreference,
              appointment_note: values.note || undefined,
            },
          },
          { onSuccess: closeAndClearCache },
        );
        return;
      }

      try {
        const outcome = await sessionAwareCreate({
          customerId: values.customer!.id,
          serviceIds: values.services,
          date: values.date,
          startTime: `${values.startTime}:00`,
          endTime: `${endTimeStr}:00`,
          slotType: values.slotType,
          notificationPreference: values.notificationPreference,
          note: values.note || "",
        });
        // D2P-FE-13 follow-up — close on `staged`. Live-commit
        // and apply-anyway already close from inside `liveCreate`;
        // dismissed leaves the sheet open so the user can re-edit.
        if (outcome.kind === "staged") {
          closeAndClearCache();
        }
      } catch (err) {
        console.error("[ApptForm] create failed", err);
      }
    };

    const isPending = createMutation.isPending || updateMutation.isPending;

    const formBody = (
      <>
          <Text style={styles.title}>{isEdit ? "Edit Appointment" : "New Appointment"}</Text>

          {!isEdit && (
            <>
              <Text style={styles.label}>Customer</Text>
              {selectedCustomer ? (
                <View style={styles.selectedCustomer}>
                  <Text style={styles.selectedName}>{selectedCustomer.first_name} {selectedCustomer.last_name}</Text>
                  <TouchableOpacity onPress={() => setValue("customer", null, { shouldValidate: false })}>
                    <MaterialIcons name="close" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
              ) : showNewCustomer ? (
                <View style={styles.newCustomerCard}>
                  <View style={styles.newCustomerHeader}>
                    <Text style={styles.newCustomerTitle}>Add new customer</Text>
                    <TouchableOpacity onPress={cancelNewCustomerForm} disabled={quickCreateMutation.isPending}>
                      <MaterialIcons name="close" size={20} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.newCustomerRow}>
                    <Controller
                      control={customerControl}
                      name="firstName"
                      render={({ field: { onChange, value } }) => (
                        <BottomSheetTextInput
                          style={[styles.input, styles.newCustomerInput]}
                          value={value}
                          onChangeText={onChange}
                          placeholder="First name"
                          placeholderTextColor="#9CA3AF"
                          autoCapitalize="words"
                          autoCorrect={false}
                        />
                      )}
                    />
                    <Controller
                      control={customerControl}
                      name="lastName"
                      render={({ field: { onChange, value } }) => (
                        <BottomSheetTextInput
                          style={[styles.input, styles.newCustomerInput]}
                          value={value}
                          onChangeText={onChange}
                          placeholder="Last name"
                          placeholderTextColor="#9CA3AF"
                          autoCapitalize="words"
                          autoCorrect={false}
                        />
                      )}
                    />
                  </View>
                  <Controller
                    control={customerControl}
                    name="phone"
                    render={({ field: { onChange, value } }) => (
                      <BottomSheetTextInput
                        style={styles.input}
                        value={value}
                        onChangeText={onChange}
                        placeholder="Phone number"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="phone-pad"
                      />
                    )}
                  />
                  <Controller
                    control={customerControl}
                    name="email"
                    render={({ field: { onChange, value } }) => (
                      <BottomSheetTextInput
                        style={styles.input}
                        value={value}
                        onChangeText={onChange}
                        placeholder="Email (optional)"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    )}
                  />
                  <TouchableOpacity
                    style={[styles.saveCustomerBtn, quickCreateMutation.isPending && { opacity: 0.6 }]}
                    onPress={handleCustomerSubmit(onSaveNewCustomer)}
                    disabled={quickCreateMutation.isPending}
                  >
                    <Text style={styles.saveCustomerText}>
                      {quickCreateMutation.isPending ? "Adding…" : "Save customer"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <BottomSheetTextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search customers by name or phone..."
                    placeholderTextColor="#9CA3AF"
                  />
                  {isSearching && customers.length > 0 && (
                    <View style={styles.customerList}>
                      {customers.slice(0, 5).map((c) => (
                        <TouchableOpacity
                          key={c.id}
                          style={styles.customerRow}
                          onPress={() => {
                            setValue("customer", c, { shouldValidate: false });
                            setSearchQuery("");
                          }}
                        >
                          <Text style={styles.customerName}>{c.first_name} {c.last_name}</Text>
                          <Text style={styles.customerPhone}>{c.phone}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <TouchableOpacity style={styles.addCustomerBtn} onPress={openNewCustomerForm}>
                    <MaterialIcons name="person-add" size={18} color="#3B82F6" />
                    <Text style={styles.addCustomerText}>
                      {isSearching && customers.length === 0
                        ? `No matches — add "${searchQuery.trim()}" as new customer`
                        : isSearching
                          ? `Add "${searchQuery.trim()}" as new customer`
                          : "Add new customer"}
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              <Text style={styles.label}>Services</Text>
              {services.map((s) => {
                const active = selectedServices.includes(s.id);
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.serviceRow, active && styles.serviceActive]}
                    onPress={() => toggleService(s.id)}
                  >
                    <MaterialIcons name={active ? "check-box" : "check-box-outline-blank"} size={20} color={active ? "#3B82F6" : "#D1D5DB"} />
                    <Text style={styles.serviceName}>{s.name}</Text>
                    <Text style={styles.servicePrice}>${s.base_price.toFixed(2)}</Text>
                  </TouchableOpacity>
                );
              })}
              {selectedServices.length > 0 && (
                <Text style={styles.totalText}>Total: ${totalPrice.toFixed(2)}</Text>
              )}
            </>
          )}

          <View style={styles.timeRow}>
            <View style={styles.timeField}>
              <Text style={styles.label}>Date</Text>
              <Controller
                control={control}
                name="date"
                render={({ field: { onChange, value } }) => (
                  <BottomSheetTextInput
                    style={styles.input}
                    value={value}
                    onChangeText={onChange}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#9CA3AF"
                  />
                )}
              />
              {errors.date?.message && (
                <Text style={styles.fieldError}>{errors.date.message}</Text>
              )}
            </View>
            <View style={styles.timeField}>
              <Text style={styles.label}>Start Time</Text>
              <Controller
                control={control}
                name="startTime"
                render={({ field: { onChange, value } }) => (
                  <BottomSheetTextInput
                    style={styles.input}
                    value={value}
                    onChangeText={onChange}
                    placeholder="HH:MM"
                    placeholderTextColor="#9CA3AF"
                  />
                )}
              />
              {errors.startTime?.message && (
                <Text style={styles.fieldError}>{errors.startTime.message}</Text>
              )}
            </View>
          </View>

          <Text style={styles.label}>Slot Type</Text>
          <Controller
            control={control}
            name="slotType"
            render={({ field: { onChange, value } }) => (
              <View style={styles.slotRow}>
                {SLOT_TYPES.map((st) => {
                  const colors = SLOT_TYPE_COLORS[st];
                  const active = value === st;
                  return (
                    <TouchableOpacity
                      key={st}
                      style={[styles.slotBtn, { borderColor: colors.border }, active && { backgroundColor: colors.bg }]}
                      onPress={() => onChange(st)}
                    >
                      <Text style={[styles.slotText, { color: colors.text }]}>{SlotTypeLabels[st]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          />

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
                    <Text style={[styles.prefText, value === opt.value && styles.prefTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          />

          <Text style={styles.label}>Note (optional)</Text>
          <Controller
            control={control}
            name="note"
            render={({ field: { onChange, value } }) => (
              <BottomSheetTextInput
                style={[styles.input, { minHeight: 60 }]}
                value={value}
                onChangeText={onChange}
                placeholder="Staff note..."
                placeholderTextColor="#9CA3AF"
                multiline
              />
            )}
          />

          <TouchableOpacity
            style={[styles.submitBtn, isPending && { opacity: 0.6 }]}
            onPress={handleSubmit(onSubmit)}
            disabled={isPending}
          >
            <Text style={styles.submitText}>{isEdit ? "Update" : "Create Appointment"}</Text>
          </TouchableOpacity>
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
          // P2-FE-5 chunk 2 follow-up (2026-04-22): sideways presentation —
          // see docs/PLAN-DEVIATIONS.md#2026-04-21-rotation-sideways-draft.
          // The sheet itself stays full-width landscape; the form contents
          // are rotated 90° and locked behind a banner so the user is
          // prompted to physically rotate the phone before filling fields.
          // The sheet does NOT remount on rotation — when the parent
          // re-renders with `presentation="upright"`, the banner and
          // transform peel away and the form becomes interactive in place.
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
  },
);

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: "700", color: "#111827", marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6, marginTop: 8 },
  searchInput: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, padding: 12, fontSize: 14, color: "#374151" },
  customerList: { marginTop: 4, marginBottom: 8 },
  customerRow: { flexDirection: "row", justifyContent: "space-between", padding: 10, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  customerName: { fontSize: 14, fontWeight: "600", color: "#111827" },
  customerPhone: { fontSize: 13, color: "#9CA3AF" },
  selectedCustomer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, backgroundColor: "#EFF6FF", borderRadius: 10, borderWidth: 1, borderColor: "#BFDBFE", marginBottom: 8 },
  selectedName: { fontSize: 15, fontWeight: "600", color: "#1D4ED8" },
  addCustomerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 14, marginTop: 8, marginBottom: 4, borderRadius: 10, borderWidth: 1, borderColor: "#BFDBFE", borderStyle: "dashed", backgroundColor: "#EFF6FF" },
  addCustomerText: { fontSize: 14, fontWeight: "600", color: "#3B82F6" },
  newCustomerCard: { padding: 14, backgroundColor: "#F9FAFB", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 8 },
  newCustomerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  newCustomerTitle: { fontSize: 14, fontWeight: "700", color: "#111827" },
  newCustomerRow: { flexDirection: "row", gap: 8 },
  newCustomerInput: { flex: 1 },
  saveCustomerBtn: { backgroundColor: "#3B82F6", paddingVertical: 12, borderRadius: 10, alignItems: "center", marginTop: 4 },
  saveCustomerText: { fontSize: 15, fontWeight: "600", color: "#fff" },
  serviceRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 8, marginBottom: 4 },
  serviceActive: { backgroundColor: "#EFF6FF" },
  serviceName: { flex: 1, fontSize: 14, color: "#374151" },
  servicePrice: { fontSize: 14, fontWeight: "600", color: "#374151" },
  totalText: { fontSize: 15, fontWeight: "700", color: "#111827", textAlign: "right", marginTop: 4, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, padding: 12, fontSize: 14, color: "#374151", marginBottom: 8 },
  fieldError: { fontSize: 12, color: "#EF4444", marginTop: -4, marginBottom: 6 },
  timeRow: { flexDirection: "row", gap: 12 },
  timeField: { flex: 1 },
  slotRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
  slotBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  slotText: { fontSize: 12, fontWeight: "600" },
  prefRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  prefBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#F3F4F6" },
  prefBtnActive: { backgroundColor: "#3B82F6" },
  prefText: { fontSize: 12, fontWeight: "500", color: "#6B7280" },
  prefTextActive: { color: "#fff" },
  submitBtn: { backgroundColor: "#3B82F6", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 8 },
  submitText: { fontSize: 16, fontWeight: "600", color: "#fff" },

  // Sideways presentation (landscape rotation cue).
  // Banner reads in landscape orientation (so the held-landscape user
  // can read it). The form content below is rotated 90° as a visual
  // hint to rotate the device. Inputs are non-interactive
  // (pointerEvents="none" + dimmed opacity).
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
    // Width/height/transform set inline via `sidewaysInnerStyle` because
    // they depend on `useWindowDimensions()`. This stylesheet entry only
    // exists so callers always have a base to merge into.
  },
  sidewaysContentDim: {
    opacity: 0.4,
  },
});
