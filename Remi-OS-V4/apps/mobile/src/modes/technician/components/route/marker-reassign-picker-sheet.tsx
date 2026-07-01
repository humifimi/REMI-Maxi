/**
 * `<MarkerReassignPickerSheet>` (LDM-WAVE-2 CHUNK-4, `DRAG-3-CONTEXT-MENU`) —
 * Radio list of candidate technicians for the "Reassign…" row in
 * `<MarkerContextMenuSheet>`. Tapping a row + Reassign fires the
 * `onConfirm(toTechId)` callback; parent wires that into
 * `useReassignAppointment.mutate(...)`.
 *
 * Default selection: the next tech in the parent's `techOrder` after
 * `fromTechId` (or the first tech if `fromTechId` is at the end of
 * the order). Mirrors the avatar-row reading order so the user gets a
 * predictable starting point.
 *
 * PLAN-DEVIATION: 2026-05-17-map-sheets-native-modal —
 *   Originally built on `<AppSheet>` (CHUNK-2). Pivoted to RN
 *   `<Modal>` via `<MapActionModal>` because `@gorhom/bottom-sheet`
 *   silently fails to animate when mounted next to `<MapView>` on
 *   iOS. See marker-context-menu-sheet.tsx header and
 *   docs/PLAN-DEVIATIONS.md for the full diagnosis.
 *
 * NB: `<SwapToast>` Undo on the menu-driven reassign is deferred to a
 * follow-up PR that covers both CHUNK-3 same-route reorder Undo AND
 * this chunk's menu reassign Undo — neither has Undo yet (see CHUNK-4
 * spec § Out of scope).
 */

import { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { MapActionModal } from "@technician/components/route/map-action-modal";
import { TechAvatarChip } from "@/src/components/shared/tech-avatar-chip";
import { StatusColors } from "@technician/constants/colors";
import { traceMap } from "@technician/utils/sentry-map-diagnostics";

export interface ReassignPickerCandidate {
  technicianId: number;
  technicianName: string;
  routeColor: string;
}

export interface MarkerReassignPickerSheetProps {
  visible: boolean;
  /** Dragged appointment's customer name for the header. */
  appointmentSummary: string | null;
  /** The source technician's name (informational only — excluded from list). */
  fromTechName: string | null;
  /** Source tech id (excluded from the candidate list). */
  fromTechId: number | null;
  /**
   * All candidate techs ordered by `techOrder`. The sender's own
   * tech should already be filtered out by the caller; this component
   * defensively filters again to be safe.
   */
  candidates: ReassignPickerCandidate[];
  /** Whether the underlying mutation is in flight. */
  isPending?: boolean;
  /** Cancel handler — user dismissed without confirming. */
  onCancel: () => void;
  /** Confirm handler — fires when the user taps Reassign. */
  onConfirm: (toTechId: number) => void;
}

export function MarkerReassignPickerSheet({
  visible,
  appointmentSummary,
  fromTechName,
  fromTechId,
  candidates,
  isPending = false,
  onCancel,
  onConfirm,
}: MarkerReassignPickerSheetProps) {
  const filteredCandidates = useMemo(
    () =>
      candidates.filter(
        (c) => fromTechId == null || c.technicianId !== fromTechId
      ),
    [candidates, fromTechId]
  );

  const defaultTechId = filteredCandidates[0]?.technicianId ?? null;
  const [selectedTechId, setSelectedTechId] = useState<number | null>(
    defaultTechId
  );

  // Reset the selection when the sheet opens (each open is a fresh
  // pick — don't lock in last session's choice).
  useEffect(() => {
    if (visible) {
      setSelectedTechId(defaultTechId);
    }
  }, [visible, defaultTechId]);

  useEffect(() => {
    traceMap("picker_sheet_visible_effect", { visible });
  }, [visible]);

  const summary = appointmentSummary ?? "this appointment";
  const from = fromTechName ?? "the current tech";
  const canConfirm = selectedTechId != null && !isPending;

  return (
    <MapActionModal
      visible={visible}
      onRequestClose={onCancel}
      instanceId="picker"
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Reassign appointment</Text>
          <Text style={styles.subtitle}>
            <Text style={styles.emphasis}>{summary}</Text> is currently
            assigned to <Text style={styles.emphasis}>{from}</Text>. Pick
            who should take it.
          </Text>
        </View>

        {filteredCandidates.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              No other technicians available to reassign to.
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {filteredCandidates.map((cand) => {
              const isSelected = selectedTechId === cand.technicianId;
              return (
                <TouchableOpacity
                  key={cand.technicianId}
                  style={[
                    styles.row,
                    isSelected && styles.rowSelected,
                  ]}
                  onPress={() => setSelectedTechId(cand.technicianId)}
                  disabled={isPending}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`Reassign to ${cand.technicianName}`}
                >
                  <TechAvatarChip
                    name={cand.technicianName}
                    color={cand.routeColor}
                    showName
                    isSelected={isSelected}
                    isFiltered={true}
                  />
                  <View style={styles.radioWrap}>
                    {isSelected ? (
                      <MaterialIcons
                        name="radio-button-checked"
                        size={22}
                        color={StatusColors.inProgress}
                      />
                    ) : (
                      <MaterialIcons
                        name="radio-button-unchecked"
                        size={22}
                        color="#9CA3AF"
                      />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={onCancel}
            disabled={isPending}
            accessibilityRole="button"
            accessibilityLabel="Cancel reassign"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.button,
              styles.confirmButton,
              !canConfirm && styles.confirmButtonDisabled,
            ]}
            onPress={() => {
              if (canConfirm && selectedTechId != null) {
                onConfirm(selectedTechId);
              }
            }}
            disabled={!canConfirm}
            accessibilityRole="button"
            accessibilityLabel="Confirm reassign"
          >
            <Text style={styles.confirmText}>
              {isPending ? "Reassigning…" : "Reassign"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </MapActionModal>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 14,
  },
  header: {
    gap: 6,
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
    lineHeight: 20,
  },
  emphasis: {
    fontWeight: "600",
    color: "#111827",
  },
  empty: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  list: {
    flexGrow: 0,
    maxHeight: 320,
  },
  listContent: {
    gap: 8,
    paddingVertical: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    gap: 12,
    minHeight: 56,
  },
  rowSelected: {
    borderColor: StatusColors.inProgress,
    backgroundColor: "#EFF6FF",
  },
  radioWrap: {
    marginLeft: "auto",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  cancelButton: {
    backgroundColor: "#F3F4F6",
  },
  confirmButton: {
    backgroundColor: StatusColors.inProgress,
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  confirmText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
