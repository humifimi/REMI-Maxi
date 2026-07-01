import { useState, useCallback, useEffect } from "react";
import {
  Modal,
  StyleSheet,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { useAcceptDispatch, useRejectDispatch } from "@technician/hooks/operations/use-dispatch";
import type { IncomingDispatch } from "@technician/types/api";
import { DispatchRejectReason } from "@technician/types/enums";
import { DispatchRejectReasonLabels } from "@technician/constants/colors";
import { playSoundOnce } from "@technician/hooks/utility/use-sound";

interface DispatchOfferModalProps {
  visible: boolean;
  dispatch: IncomingDispatch | null;
  onDismiss: () => void;
  onAccepted?: () => void;
  onRejected?: () => void;
}

type ModalPhase = "offer" | "reject-reason";

export function DispatchOfferModal({
  visible,
  dispatch,
  onDismiss,
  onAccepted,
  onRejected,
}: DispatchOfferModalProps) {
  const [phase, setPhase] = useState<ModalPhase>("offer");
  const [selectedReason, setSelectedReason] = useState<DispatchRejectReason | null>(null);

  const acceptMutation = useAcceptDispatch();
  const rejectMutation = useRejectDispatch();

  useEffect(() => {
    if (visible && dispatch) {
      playSoundOnce("new_job");
    }
  }, [visible, dispatch]);

  const resetState = useCallback(() => {
    setPhase("offer");
    setSelectedReason(null);
  }, []);

  const handleAccept = useCallback(async () => {
    if (!dispatch) return;
    haptic.medium();
    await acceptMutation.mutateAsync(dispatch.appointment_id);
    resetState();
    onAccepted?.();
    onDismiss();
  }, [dispatch, acceptMutation, resetState, onAccepted, onDismiss]);

  const handleRejectStart = useCallback(() => {
    haptic.light();
    setPhase("reject-reason");
  }, []);

  const handleRejectConfirm = useCallback(async () => {
    if (!dispatch || !selectedReason) return;
    haptic.medium();
    await rejectMutation.mutateAsync({
      appointmentId: dispatch.appointment_id,
      reason: selectedReason,
    });
    resetState();
    onRejected?.();
    onDismiss();
  }, [dispatch, selectedReason, rejectMutation, resetState, onRejected, onDismiss]);

  const handleBack = useCallback(() => {
    setPhase("offer");
    setSelectedReason(null);
  }, []);

  if (!dispatch) return null;

  const isAccepting = acceptMutation.isPending;
  const isRejecting = rejectMutation.isPending;

  const location = [dispatch.address_line, dispatch.address_city]
    .filter(Boolean)
    .join(", ");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {phase === "offer" ? (
            <>
              <View style={styles.header}>
                <View style={styles.headerIcon}>
                  <MaterialIcons name="notifications-active" size={24} color="#3B82F6" />
                </View>
                <Text style={styles.title}>New Job Dispatch</Text>
                <Text style={styles.subtitle}>
                  You&apos;ve been assigned a new job
                </Text>
              </View>

              <View style={styles.detailCard}>
                <DetailRow icon="person" label="Customer" value={dispatch.customer_name} />
                <DetailRow icon="directions-car" label="Vehicle" value={dispatch.vehicle_summary} />
                <DetailRow
                  icon="build"
                  label="Service"
                  value={dispatch.service_names.join(", ")}
                />
                <DetailRow
                  icon="event"
                  label="Date"
                  value={dispatch.scheduled_date}
                />
                <DetailRow
                  icon="schedule"
                  label="Time"
                  value={dispatch.scheduled_time}
                />
                {location ? (
                  <DetailRow icon="place" label="Location" value={location} />
                ) : null}
                {dispatch.estimated_duration_minutes > 0 && (
                  <DetailRow
                    icon="timer"
                    label="Est. Duration"
                    value={`${dispatch.estimated_duration_minutes} min`}
                  />
                )}
                {dispatch.distance_miles != null && (
                  <DetailRow
                    icon="straighten"
                    label="Distance"
                    value={`${dispatch.distance_miles.toFixed(1)} mi`}
                  />
                )}
              </View>

              <View style={styles.actions}>
                <Pressable
                  style={[styles.btn, styles.rejectBtn]}
                  onPress={handleRejectStart}
                  disabled={isAccepting}
                  hitSlop={4}
                >
                  <MaterialIcons name="close" size={20} color="#EF4444" />
                  <Text style={styles.rejectBtnText}>Reject</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.acceptBtn, isAccepting && styles.btnDisabled]}
                  onPress={handleAccept}
                  disabled={isAccepting}
                  hitSlop={4}
                >
                  {isAccepting ? (
                    <ActivityIndicator size={18} color="#fff" />
                  ) : (
                    <MaterialIcons name="check" size={20} color="#fff" />
                  )}
                  <Text style={styles.acceptBtnText}>
                    {isAccepting ? "Accepting…" : "Accept Job"}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={styles.header}>
                <Pressable style={styles.backBtn} onPress={handleBack} hitSlop={8}>
                  <MaterialIcons name="arrow-back" size={20} color="#6B7280" />
                </Pressable>
                <Text style={styles.title}>Reject Reason</Text>
                <Text style={styles.subtitle}>
                  Why are you declining this job?
                </Text>
              </View>

              <ScrollView style={styles.reasonList} bounces={false}>
                {REJECT_REASONS.map((reason) => {
                  const isSelected = selectedReason === reason;
                  return (
                    <Pressable
                      key={reason}
                      style={[
                        styles.reasonItem,
                        isSelected && styles.reasonItemSelected,
                      ]}
                      onPress={() => {
                        haptic.light();
                        setSelectedReason(reason);
                      }}
                    >
                      <MaterialIcons
                        name={isSelected ? "radio-button-checked" : "radio-button-unchecked"}
                        size={22}
                        color={isSelected ? "#EF4444" : "#9CA3AF"}
                      />
                      <Text
                        style={[
                          styles.reasonText,
                          isSelected && styles.reasonTextSelected,
                        ]}
                      >
                        {DispatchRejectReasonLabels[reason]}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Pressable
                style={[
                  styles.btn,
                  styles.confirmRejectBtn,
                  (!selectedReason || isRejecting) && styles.btnDisabled,
                ]}
                onPress={handleRejectConfirm}
                disabled={!selectedReason || isRejecting}
              >
                {isRejecting ? (
                  <ActivityIndicator size={18} color="#fff" />
                ) : (
                  <MaterialIcons name="close" size={20} color="#fff" />
                )}
                <Text style={styles.confirmRejectText}>
                  {isRejecting ? "Rejecting…" : "Confirm Rejection"}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const REJECT_REASONS: DispatchRejectReason[] = [
  DispatchRejectReason.TOO_FAR,
  DispatchRejectReason.SCHEDULE_CONFLICT,
  DispatchRejectReason.MISSING_PARTS,
  DispatchRejectReason.PERSONAL,
  DispatchRejectReason.OTHER,
];

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <MaterialIcons name={icon} size={18} color="#6B7280" />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 36,
    maxHeight: "85%",
  },
  header: {
    alignItems: "center",
    marginBottom: 20,
    gap: 4,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
  },
  backBtn: {
    position: "absolute",
    left: 0,
    top: 4,
    padding: 4,
  },
  detailCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    padding: 14,
    gap: 12,
    marginBottom: 24,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  detailLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
    width: 80,
  },
  detailValue: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
    textAlign: "right",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 16,
    minHeight: 54,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  rejectBtn: {
    flex: 1,
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  rejectBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#EF4444",
  },
  acceptBtn: {
    flex: 2,
    backgroundColor: "#22C55E",
  },
  acceptBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  reasonList: {
    maxHeight: 280,
    marginBottom: 20,
  },
  reasonItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
    marginBottom: 8,
  },
  reasonItemSelected: {
    borderColor: "#EF4444",
    backgroundColor: "#FEF2F2",
  },
  reasonText: {
    fontSize: 15,
    color: "#374151",
    fontWeight: "500",
  },
  reasonTextSelected: {
    color: "#EF4444",
    fontWeight: "600",
  },
  confirmRejectBtn: {
    backgroundColor: "#EF4444",
    width: "100%",
  },
  confirmRejectText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
});
