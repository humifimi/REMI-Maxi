import { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useJobDetail, useAddOrderNote } from "@technician/hooks/jobs/use-jobs";
import { useFlowBack } from "@technician/hooks/jobs/use-flow-back";
import { openMapsNavigation } from "@technician/utils/navigation";
import { AskRemiFab } from "@technician/components/copilot/ask-remi-fab";
import { AISuggestionOverlay } from "@technician/components/copilot/ai-suggestion-overlay";
import {
  useStartServiceTimer,
  useCompleteServiceTimer,
  useAddService,
} from "@technician/hooks/jobs/use-services";
import { useCopilotSuggestions } from "@technician/hooks/ai/use-copilot";
import {
  useJobTimerStatus,
  useCheckLateness,
  useNotifyLate,
  useLeaveByCountdown,
  useLiveLeaveBy,
  useActiveTimerTick,
  formatTimerDisplay,
} from "@technician/hooks/jobs/use-job-timer";
import { useActiveTimerStore } from "@technician/stores/active-timer";
import { useAuthStore } from "@/src/stores/auth";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { SkeletonTimerScreen } from "@/src/components/shared/skeleton";
import {
  captureJobMutationFailure,
  extractApiErrorMessage,
} from "@technician/utils/sentry-job-diagnostics";
import type { CopilotUpsellItem } from "@technician/types/copilot";

function formatNoteTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay
    ? `Today at ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : d.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

export default function TimerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobId = parseInt(id, 10);
  const router = useRouter();
  const onBack = useFlowBack("timer", id);
  const { data, isLoading, refetch } = useJobDetail(jobId);
  const startTimer = useStartServiceTimer();
  const completeTimer = useCompleteServiceTimer();
  const timerState = useJobTimerStatus(jobId);
  const checkLateness = useCheckLateness(jobId);
  const notifyLate = useNotifyLate(jobId);
  const leaveByQuery = useLeaveByCountdown(jobId);
  const liveLeaveBy = useLiveLeaveBy(leaveByQuery.data);

  const addService = useAddService();
  const { data: suggestionsData } = useCopilotSuggestions(jobId);

  const timerStore = useActiveTimerStore();
  const tick = useActiveTimerTick();

  const handleAddUpsellToOrder = useCallback(
    (item: CopilotUpsellItem) => {
      if (item.service_id) {
        addService.mutate(
          { jobId, service_id: item.service_id },
          {
            onSuccess: () => {
              haptic.success();
              Alert.alert("Added", `${item.part_name} added to this order.`);
              refetch();
            },
            onError: (error) => {
              const role = useAuthStore.getState().user?.role;
              captureJobMutationFailure({
                mutation: "add-part",
                appointmentId: jobId,
                role,
                error,
                extras: {
                  service_id: item.service_id,
                  part_name: item.part_name,
                },
              });
              const detail = extractApiErrorMessage(
                error,
                `Could not add ${item.part_name}. Try again.`,
              );
              Alert.alert("Failed", detail);
            },
          },
        );
      } else {
        haptic.success();
        Alert.alert(
          "Noted",
          `${item.part_name} flagged for this order. The dispatcher will add it to the invoice.`,
        );
      }
    },
    [jobId, addService, refetch],
  );

  const [notes, setNotes] = useState("");
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [hasPromptedNotify, setHasPromptedNotify] = useState(false);
  const addNote = useAddOrderNote(jobId);

  const handleSaveNote = useCallback(() => {
    const trimmed = notes.trim();
    if (!trimmed || addNote.isPending) return;
    haptic.medium();
    Keyboard.dismiss();
    addNote.mutate(trimmed, {
      onSuccess: () => {
        haptic.success();
        setNotes("");
      },
      onError: (error) => {
        const role = useAuthStore.getState().user?.role;
        captureJobMutationFailure({
          mutation: "add-note",
          appointmentId: jobId,
          role,
          error,
          extras: { note_length: trimmed.length },
        });
        const detail = extractApiErrorMessage(
          error,
          "Could not save note. Try again.",
        );
        Alert.alert("Save Failed", detail);
      },
    });
  }, [notes, addNote, jobId]);

  const ts = timerState.data;
  const isRunning = timerStore.isRunning;
  const overMin = tick?.overMin ?? 0;

  const services = data?.services ?? [];
  const beInProgressService = services.find((s) => s.status === "in_progress");
  // PLAN-DEVIATION: 2026-04-26-timer-auto-reconcile (round 7) — see
  // docs/PLAN-DEVIATIONS.md. Round 6 surfaced any BE-side `in_progress`
  // service in its own "In Progress" card with a Begin Service button. The
  // user wanted to be able to PICK which service to start (demo seed marks
  // the first service in_progress on arrival, which forced their hand). The
  // local `useActiveTimerStore` is now the only source of truth for "this
  // tech has explicitly committed to a service" — until they tap Start on
  // some row, no In Progress card renders and EVERY non-completed service
  // is listed under "Pending" with an enabled Start button.
  const activeService =
    isRunning && timerStore.serviceId
      ? services.find((s) => s.id === timerStore.serviceId) ?? beInProgressService
      : null;
  const pickableServices = services.filter(
    (s) => s.status !== "completed" && s.id !== activeService?.id,
  );
  const completedServices = services.filter((s) => s.status === "completed");
  const allDone =
    services.length > 0 && pickableServices.length === 0 && !activeService;

  const DEFAULT_SERVICE_DURATION_MIN = 30;

  const resolveServiceDuration = useCallback(
    (svc?: typeof activeService): number => {
      const fromService = svc?.service?.duration_minutes;
      if (fromService && fromService > 0) return fromService;
      const fromServer = ts?.scheduled_duration_min;
      if (fromServer && fromServer > 0) return fromServer;
      return DEFAULT_SERVICE_DURATION_MIN;
    },
    [ts?.scheduled_duration_min],
  );

  const handleAutoNotifyCheck = useCallback(() => {
    if (overMin >= 10 && !ts?.lateness_notified_at) {
      checkLateness.mutate();
    }
  }, [overMin, ts?.lateness_notified_at, checkLateness]);

  useEffect(() => {
    if (!hasPromptedNotify && overMin >= 7 && isRunning && !ts?.lateness_notified_at) {
      setHasPromptedNotify(true);
      setShowNotifyModal(true);
    }
  }, [overMin, isRunning, hasPromptedNotify, ts?.lateness_notified_at]);

  useEffect(() => {
    if (overMin >= 10 && isRunning) {
      handleAutoNotifyCheck();
    }
  }, [overMin, isRunning, handleAutoNotifyCheck]);

  // PLAN-DEVIATION: 2026-04-26-timer-auto-reconcile — see docs/PLAN-DEVIATIONS.md.
  // ROUND 7 (2026-04-26): only auto-reconcile when the BE has accumulated REAL
  // elapsed time (`ts.elapsed_min > 0`) — the cross-session resume case (tech
  // tapped Start in a previous session, time has passed, app reloaded, local
  // store is empty, BE is the source of truth). For freshly-arrived /timer
  // screens (BE service auto-promoted with elapsed=0, demo seed, hot reload,
  // any state desync), no auto-start fires; the tech sees every non-completed
  // service in the picker and chooses one. The "Begin Service" affordance from
  // round 6 was removed — picking a service from the list is now the only way
  // to start, and it's symmetrical regardless of which service the BE thinks
  // is in_progress.
  useEffect(() => {
    if (!beInProgressService || timerStore.isRunning) return;
    if (!ts?.elapsed_min || ts.elapsed_min <= 0) return;
    const durMin = resolveServiceDuration(beInProgressService);
    timerStore.startTimer({
      jobId,
      serviceId: beInProgressService.id,
      serviceName: beInProgressService.service?.name ?? "Service",
      scheduledDurationSec: durMin * 60,
    });
    timerStore.reconcile(ts.elapsed_min);
  }, [beInProgressService, ts?.elapsed_min, timerStore.isRunning, jobId, resolveServiceDuration]);

  const handleStart = (serviceId: number, serviceName: string, durationMin: number) => {
    haptic.medium();
    const durMin = durationMin > 0 ? durationMin : DEFAULT_SERVICE_DURATION_MIN;
    timerStore.startTimer({
      jobId,
      serviceId,
      serviceName,
      scheduledDurationSec: durMin * 60,
    });
    setHasPromptedNotify(false);
    startTimer.mutate(
      { jobId, serviceId },
      {
        onSuccess: () => refetch(),
        onError: () => timerStore.stopTimer(),
      }
    );
  };

  const handleComplete = (serviceId: number) => {
    haptic.success();
    timerStore.stopTimer();
    completeTimer.mutate(
      { jobId, serviceId },
      { onSuccess: () => refetch() }
    );
  };

  const handleNotifyCustomer = () => {
    haptic.warning();
    setShowNotifyModal(false);
    const customerId = data?.appointment?.customer_id;
    if (customerId) {
      notifyLate.mutate(customerId);
    }
  };

  if (isLoading) {
    return <SkeletonTimerScreen />;
  }

  if (services.length === 0) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "Service In Progress",
            headerLeft: () => (
              <Pressable onPress={onBack} hitSlop={8}>
                <MaterialIcons name="arrow-back" size={24} color="#fff" />
              </Pressable>
            ),
            headerRight: () => (
              <Pressable
                onPress={() => {
                  haptic.light();
                  router.dismissAll();
                  router.replace("/(tabs)");
                }}
                hitSlop={8}
                style={styles.homeBtn}
              >
                <MaterialIcons name="home" size={20} color="#fff" />
              </Pressable>
            ),
          }}
        />
        <View style={styles.center}>
          <MaterialIcons name="error-outline" size={48} color="#EF4444" />
          <Text style={styles.emptyTitle}>No services found</Text>
          <Text style={styles.emptyBody}>
            Services may not have been saved. Go back and re-add them, or check
            your connection.
          </Text>
          <Pressable style={styles.retryBtn} onPress={() => refetch()}>
            <MaterialIcons name="refresh" size={18} color="#fff" />
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
          <Pressable style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backText}>Go Back</Text>
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screenWrap}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: "Service In Progress",
          headerLeft: () => (
            <Pressable onPress={onBack} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={() => {
                haptic.light();
                router.dismissAll();
                router.replace("/(tabs)");
              }}
              hitSlop={8}
              style={styles.homeBtn}
            >
              <MaterialIcons name="home" size={20} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={styles.scrollContent}
      >
        {/* Customer & Vehicle Context */}
        {data?.appointment && (
          <View style={styles.contextCard}>
            <View style={styles.contextRow}>
              <MaterialIcons name="person" size={18} color="#6B7280" />
              <Text style={styles.contextName} numberOfLines={1}>
                {data.appointment.customer_name
                  ?? data.appointment.customer?.first_name
                  ?? "Customer"}
              </Text>
            </View>
            {(data.appointment.vehicle_year || data.appointment.vehicle_make) && (
              <View style={styles.contextRow}>
                <MaterialIcons name="directions-car" size={18} color="#6B7280" />
                <Text style={styles.contextVehicle} numberOfLines={1}>
                  {[
                    data.appointment.vehicle_year,
                    data.appointment.vehicle_make,
                    data.appointment.vehicle_model,
                  ].filter(Boolean).join(" ")}
                  {data.appointment.license_plate
                    ? ` \u00b7 ${data.appointment.license_plate}`
                    : ""}
                </Text>
              </View>
            )}
            {data.appointment.service_names && (
              <View style={styles.contextRow}>
                <MaterialIcons name="build" size={18} color="#6B7280" />
                <Text style={styles.contextServices} numberOfLines={2}>
                  {data.appointment.service_names}
                </Text>
              </View>
            )}
          </View>
        )}

        {data?.appointment?.address_line && (
          <Pressable
            style={styles.navigateCard}
            onPress={() => {
              haptic.light();
              const appt = data.appointment;
              const addr = [appt.address_line, appt.address_city]
                .filter(Boolean)
                .join(", ");
              openMapsNavigation(
                addr,
                appt.address_lat,
                appt.address_lng
              );
            }}
          >
            <View style={styles.navigateInfo}>
              <MaterialIcons name="place" size={20} color="#3B82F6" />
              <Text style={styles.navigateAddress} numberOfLines={1}>
                {[data.appointment.address_line, data.appointment.address_city]
                  .filter(Boolean)
                  .join(", ")}
              </Text>
            </View>
            <View style={styles.navigateBtn}>
              <MaterialIcons name="navigation" size={16} color="#fff" />
              <Text style={styles.navigateBtnText}>Navigate</Text>
            </View>
          </Pressable>
        )}

        {/* Live Timer Display */}
        {isRunning && tick && (
          <View style={[styles.timerHero, { backgroundColor: tick.statusBg, borderColor: tick.statusColor }]}>
            <View style={[styles.statusChip, { backgroundColor: tick.statusColor }]}>
              <Text style={styles.statusChipText}>{tick.statusLabel}</Text>
            </View>
            <Text style={[styles.countdownText, { color: tick.statusColor }]}>
              {tick.hasSchedule
                ? formatTimerDisplay(tick.remainingSec)
                : formatTimerDisplay(tick.elapsedSec)}
            </Text>
            <Text style={styles.countdownLabel}>
              {!tick.hasSchedule
                ? "elapsed"
                : tick.remainingSec >= 0
                  ? "remaining to stay on schedule"
                  : "over scheduled time"}
            </Text>
            {tick.hasSchedule && (
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: tick.statusColor,
                      width: `${tick.progressPct}%`,
                    },
                  ]}
                />
              </View>
            )}
          </View>
        )}

        {/* Compact Leave-By Line */}
        {isRunning && liveLeaveBy ? (
          <View style={styles.leaveByLine}>
            <MaterialIcons
              name={liveLeaveBy.isBehind ? "warning" : "directions-car"}
              size={16}
              color={
                liveLeaveBy.urgency === "red" ? "#EF4444"
                : liveLeaveBy.urgency === "amber" ? "#D97706"
                : "#16A34A"
              }
            />
            <Text
              style={[
                styles.leaveByLineText,
                {
                  color:
                    liveLeaveBy.urgency === "red" ? "#991B1B"
                    : liveLeaveBy.urgency === "amber" ? "#92400E"
                    : "#166534",
                },
              ]}
              numberOfLines={1}
            >
              {liveLeaveBy.isBehind
                ? `Behind schedule \u2014 leave now for ${liveLeaveBy.nextStopName}`
                : `Leave in ${Math.ceil(liveLeaveBy.minutesUntilLeave)} min for ${liveLeaveBy.nextStopName}`}
              {liveLeaveBy.travelMinutes && !liveLeaveBy.isBehind
                ? ` \u00b7 ${liveLeaveBy.travelMinutes} min drive`
                : ""}
            </Text>
          </View>
        ) : isRunning && leaveByQuery.data && !leaveByQuery.data.next_stop_customer_name ? (
          <View style={styles.leaveByLine}>
            <MaterialIcons name="check-circle-outline" size={16} color="#6B7280" />
            <Text
              style={[styles.leaveByLineText, { color: "#6B7280" }]}
              numberOfLines={1}
            >
              No more stops today
            </Text>
          </View>
        ) : null}

        {activeService && isRunning ? (
          <View style={styles.activeServiceCard}>
            <Text style={styles.activeLabel}>In Progress</Text>
            <Text style={styles.serviceName}>
              {activeService.service?.name ?? `Service #${activeService.service_id}`}
            </Text>
            <Pressable
              style={styles.completeBtn}
              onPress={() => handleComplete(activeService.id)}
            >
              <MaterialIcons name="check-circle" size={22} color="#fff" />
              <Text style={styles.completeBtnText}>Complete Service</Text>
            </Pressable>
          </View>
        ) : null}

        {pickableServices.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {isRunning ? "Pending" : "Pick a Service to Start"}
            </Text>
            {pickableServices.map((svc) => {
              const name = svc.service?.name ?? `Service #${svc.service_id}`;
              const dur = svc.service?.duration_minutes ?? 0;
              return (
                <View key={svc.id} style={styles.serviceRow}>
                  <Text style={styles.serviceRowName}>{name}</Text>
                  <Pressable
                    style={[styles.startBtn, isRunning && styles.startBtnDisabled]}
                    onPress={() => handleStart(svc.id, name, dur)}
                    disabled={isRunning}
                  >
                    <Text style={styles.startBtnText}>Start</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}

        {completedServices.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Completed</Text>
            {completedServices.map((svc) => (
              <View key={svc.id} style={styles.serviceRowDone}>
                <MaterialIcons
                  name="check-circle"
                  size={20}
                  color="#22C55E"
                />
                <Text style={styles.serviceRowNameDone}>
                  {svc.service?.name ?? `Service #${svc.service_id}`}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.notesSection}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="Add service notes..."
            placeholderTextColor="#9CA3AF"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
          <Pressable
            style={[
              styles.notesSaveBtn,
              (notes.trim().length === 0 || addNote.isPending) &&
                styles.notesSaveBtnDisabled,
            ]}
            onPress={handleSaveNote}
            disabled={notes.trim().length === 0 || addNote.isPending}
          >
            {addNote.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialIcons name="check" size={18} color="#fff" />
                <Text style={styles.notesSaveText}>Save Note</Text>
              </>
            )}
          </Pressable>

          {data?.notes && data.notes.length > 0 ? (
            <View style={styles.notesHistory}>
              <Text style={styles.notesHistoryHeading}>
                Previous Notes ({data.notes.length})
              </Text>
              {data.notes.map((n) => (
                <View key={n.id} style={styles.noteCard}>
                  <Text style={styles.noteTimestamp}>
                    {formatNoteTimestamp(n.created_at)}
                  </Text>
                  <Text style={styles.noteText}>{n.note}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {allDone ? (
          <Pressable
            style={styles.nextBtn}
            onPress={() => {
              timerStore.clearTimer();
              router.push(`/job/${id}/invoice` as never);
            }}
          >
            <Text style={styles.nextBtnText}>Continue to Invoice</Text>
          </Pressable>
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>

      {isRunning && suggestionsData?.suggestions && (
        <AISuggestionOverlay
          suggestions={suggestionsData.suggestions}
          onAddToOrder={handleAddUpsellToOrder}
        />
      )}

      <AskRemiFab appointmentId={jobId} />

      {/* Notify Customer Modal at +7 min */}
      <Modal
        visible={showNotifyModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNotifyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <MaterialIcons name="schedule" size={32} color="#EF4444" />
            </View>
            <Text style={styles.modalTitle}>Running Behind Schedule</Text>
            <Text style={styles.modalBody}>
              You're {Math.round(tick?.overMin ?? 0)} minutes over the estimated time.
              Would you like to notify the next customer?
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalSecondaryBtn}
                onPress={() => setShowNotifyModal(false)}
              >
                <Text style={styles.modalSecondaryText}>Not Yet</Text>
              </Pressable>
              <Pressable
                style={styles.modalPrimaryBtn}
                onPress={handleNotifyCustomer}
              >
                <MaterialIcons name="notifications" size={18} color="#fff" />
                <Text style={styles.modalPrimaryText}>Notify Customer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screenWrap: { flex: 1 },
  scrollContent: { paddingBottom: 120 },
  homeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 16 },
  navigateCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  navigateInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    marginRight: 12,
  },
  navigateAddress: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1E40AF",
    flex: 1,
  },
  navigateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#3B82F6",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 44,
  },
  navigateBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginTop: 8,
  },
  emptyBody: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#3B82F6",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 999,
    marginTop: 8,
  },
  retryText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  backBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  backText: { color: "#6B7280", fontSize: 14, fontWeight: "500" },
  timerHero: {
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 2,
  },
  statusChip: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 12,
  },
  statusChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  countdownText: {
    fontSize: 52,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    marginBottom: 4,
  },
  countdownLabel: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 16,
  },
  progressBar: {
    width: "100%",
    height: 6,
    backgroundColor: "#E5E7EB",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  contextCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 6,
  },
  contextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  contextName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
  },
  contextVehicle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    flex: 1,
  },
  contextServices: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
    flex: 1,
  },
  leaveByLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    marginBottom: 16,
  },
  leaveByLineText: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  activeServiceCard: {
    backgroundColor: "#EFF6FF",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  activeLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#3B82F6",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  serviceName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginTop: 6,
    marginBottom: 14,
  },
  completeBtn: {
    backgroundColor: "#22C55E",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 999,
  },
  completeBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 10,
  },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  serviceRowName: { fontSize: 15, fontWeight: "500", color: "#111827" },
  startBtn: {
    backgroundColor: "#3B82F6",
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 999,
  },
  startBtnDisabled: { opacity: 0.4 },
  startBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  serviceRowDone: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F0FDF4",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  serviceRowNameDone: { fontSize: 15, color: "#166534", fontWeight: "500" },
  notesSection: { marginBottom: 24 },
  notesInput: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    minHeight: 80,
    textAlignVertical: "top",
  },
  notesSaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#3B82F6",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    marginTop: 10,
    minHeight: 44,
  },
  notesSaveBtnDisabled: {
    backgroundColor: "#93C5FD",
  },
  notesSaveText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  notesHistory: {
    marginTop: 18,
    gap: 8,
  },
  notesHistoryHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  noteCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 4,
  },
  noteTimestamp: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  noteText: {
    fontSize: 14,
    color: "#111827",
    lineHeight: 20,
  },
  nextBtn: {
    backgroundColor: "#3B82F6",
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: "center",
    marginBottom: 40,
  },
  nextBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  modalBody: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  modalSecondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  modalSecondaryText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },
  modalPrimaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: "#EF4444",
  },
  modalPrimaryText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});
