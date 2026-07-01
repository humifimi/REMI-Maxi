/**
 * PLAN-DEVIATION: 2026-05-22-chip-bar-plan-mode-batch — this entire
 * component exists to host the batched-plan review UX. The snap-zone
 * plan called for per-drop mini-sheets only; this sheet is what makes
 * Plan Mode coherent. See
 * docs/PLAN-DEVIATIONS.md#2026-05-22-chip-bar-plan-mode-batch.
 *
 * `<ReviewPlanSheet>` (chip-bar plan-mode batch reorganization
 * — chunk B2-4; see
 * `docs/implementation-plans/chip-bar-plan-mode-batch.md`).
 *
 * Opens from the chip-bar's "N changes · Review & commit" CTA when
 * plan mode is active and `plannedMoves.length > 0`. Lists every
 * staged move with an editable time stepper and a "Remove from
 * plan" affordance. Footer carries a shared Notify toggle, Cancel
 * (close the sheet without discarding the plan), and Commit All.
 *
 * Editing model:
 *   - The sheet is presentational — it does NOT own the plan
 *     state. Stepper edits and remove calls go back to the parent
 *     via `onAdjustTime` / `onRemove`. The parent updates
 *     `plannedMoves`; the sheet re-renders from the new prop on
 *     the next pass. Same flow keeps the polyline + chip-bar in
 *     lockstep with whatever the user is editing here, because
 *     both surfaces also derive from `plannedMoves` via
 *     `applyPlannedMoves` (B2-3).
 *   - Per-row clamping mirrors `<DragRescheduleSheet>`'s
 *     `clampStartHHMM`. Each row carries its own window +
 *     duration captured at plan time so the math works even if
 *     the chip-bar pretends the stop is somewhere else on screen.
 *
 * Commit model:
 *   - B2-4 — Commit fires `onCommit()` with the current
 *     `notifyCustomer` toggle. The parent's wiring is a no-op
 *     stub today (closes the sheet, leaves the plan in place).
 *     B2-5 lands the sequential mutation pipeline.
 *   - Cancel and backdrop-tap both fire `onCancel()` — the plan
 *     is NOT discarded; the user can toggle the chip-bar pill or
 *     hit Discard from B2-6's confirm path to actually clear it.
 *     This matches the user's mental model: "Cancel" closes the
 *     review, not the plan.
 *
 * Out of scope (deferred to later B2 chunks):
 *   - Per-row commit status (idle/in-flight/committed/failed) +
 *     stop-the-pipeline-on-failure UX — B2-5 wires + drives.
 *   - "Window changed since plan time" invalid-row flagging —
 *     B2-6 surfaces; B2-4 just renders what the parent passes.
 *   - Per-row Notify override — single shared toggle for v1.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { MapActionModal } from "@technician/components/route/map-action-modal";
import {
  addDurationToHHMM,
  clampDurationMinutes,
  clampStartHHMM,
  DURATION_MAX_MINUTES,
  DURATION_MIN_MINUTES,
  DURATION_STEP_INCREMENT,
  formatMinutesToHHMM,
  parseHHMMToMinutes,
  type TimeWindow,
} from "@technician/components/route/drag-reschedule-sheet";
import { formatTime12h, formatTimeRange12h } from "@technician/utils/format-display";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type { CommitRowStatus } from "@technician/utils/route-plan-commit";

// Re-export so the parent (and tests) only need one import path
// for the sheet's row contract + the status union the sheet renders.
export type { CommitRowStatus } from "@technician/utils/route-plan-commit";

// ─── Row contract ──────────────────────────────────────────────────

/**
 * One side of a swap or the only side of an insert. The sheet
 * doesn't care which — both kinds present as "name + time picker
 * + window hint" rows.
 *
 * `originalHHMM` is the stop's pre-plan `scheduled_time` (so the
 * "9:00 → 10:00" change-hint can render). `windowLabel` is the
 * 12h human-readable window used in the small grey hint under
 * the picker. `windowEdges` is the wire-format pair the stepper
 * uses for clamping (mirrors `<DragRescheduleSheet>`'s `window`
 * prop).
 */
export interface ReviewPlanRowSide {
  name: string;
  originalHHMM: string | null;
  proposedStartHHMM: string;
  /**
   * Live duration (override || base). End-time math and the
   * duration chevron stepper both read this. The parent surfaces
   * `move.aDurationOverrideMin ?? move.aDurationMinutes` here so
   * the sheet doesn't need to know the override mechanism.
   */
  durationMinutes: number;
  /**
   * B2-7 (2026-05-22) — original (mode-base) duration for the
   * dirty-tint comparison + "30 min → 45 min" hint. Parent passes
   * the un-overridden `move.aDurationMinutes`. Required so the
   * sheet's duration value can render green when the dispatcher
   * has stepped it off the base.
   */
  baseDurationMinutes: number;
  windowEdges: TimeWindow;
  windowLabel: string;
}

export interface ReviewPlanRow {
  /**
   * Stable identity for FlatList-style keying. Parent supplies
   * a string that's unique per move and stable across edits
   * (e.g. `swap:12:34` or `insert:12`).
   */
  rowKey: string;
  /**
   * `swap` rows carry both `aSide` and `bSide`; `insert` rows
   * only carry `aSide` (the dragged stop). The sheet renders
   * one stepper per side.
   */
  kind: "swap" | "insert";
  /** One-line summary that sits under the names (e.g. "Swap with Jim" / "Insert at position 4"). */
  summary: string;
  aSide: ReviewPlanRowSide;
  bSide?: ReviewPlanRowSide;
  /**
   * True when the move references a stop that's no longer in
   * the current route (e.g. the stop got cancelled by another
   * dispatcher mid-plan). Rendered greyed out with a small "no
   * longer valid" hint. B2-4 doesn't COMPUTE this — the parent
   * sets it. B2-6 will wire the actual detection logic.
   */
  isStale?: boolean;
  /**
   * B2-5 (2026-05-22) — per-row lifecycle during the commit
   * pipeline. Undefined / missing entry === `{ kind: "idle" }`
   * (the parent typically omits the field entirely for idle rows
   * to keep the row contract lean).
   *
   * Behavior per status:
   *   - `idle` → no badge. Row is fully interactive.
   *   - `inFlight` → spinner + "Committing…" badge. Steppers +
   *     Remove button are disabled (mid-flight; can't safely
   *     edit or back out of an in-progress mutation).
   *   - `committed` → green check + "Committed" badge. Steppers +
   *     Remove disabled (no-op; mutation succeeded). The parent's
   *     pipeline normally removes committed rows from
   *     `plannedMoves` so this state is mostly visible during the
   *     flash between commit-resolve and the parent's prune;
   *     leaving it accurate keeps the partial-failure case
   *     readable (committed siblings stay visible alongside the
   *     failed row, with their check marks).
   *   - `failed` → red X + "Failed: {message}" badge. Steppers
   *     STAY enabled so the dispatcher can edit and retry.
   *     Remove also stays enabled (back out the move entirely).
   *
   * Resets to `idle` (via parent dropping the entry) whenever the
   * dispatcher edits or removes a row — see
   * `handleReviewAdjustTime` / `handleReviewRemove` in
   * `franchise-route-map.tsx`.
   */
  status?: CommitRowStatus;
}

// ─── Props ─────────────────────────────────────────────────────────

export interface ReviewPlanSheetProps {
  visible: boolean;
  rows: ReviewPlanRow[];
  /**
   * Stepper edit. `side` is `"b"` only for swap rows where the
   * user adjusted the B-side picker; `"a"` is used for the A-
   * side picker AND for every insert row (which only has one
   * side). `newStartHHMM` is the post-clamp value — the sheet
   * computes it locally using the row's `windowEdges` +
   * `durationMinutes` so the parent's only job is to update the
   * matching `PlannedMove` and re-emit `rows`.
   */
  onAdjustTime: (
    rowKey: string,
    side: "a" | "b",
    newStartHHMM: string,
  ) => void;
  /**
   * B2-7 (2026-05-22) — duration chevron stepper edit. Same
   * `(rowKey, side)` shape as `onAdjustTime`; `newDurationMin`
   * is the post-clamp value (15..480, snapped to 15-minute grid).
   * Parent updates the matching `PlannedMove`'s
   * `aDurationOverrideMin` / `bDurationOverrideMin` /
   * `durationOverrideMin` and re-emits `rows`. Status-gated
   * identically to `onAdjustTime` (in-flight + committed lock
   * the stepper; failed leaves it enabled for retry edits).
   */
  onAdjustDuration: (
    rowKey: string,
    side: "a" | "b",
    newDurationMin: number,
  ) => void;
  onRemove: (rowKey: string) => void;
  /**
   * Fires when the user hits "Commit all". The current
   * `notifyCustomer` toggle is passed back; the parent does
   * the actual BE work. B2-5 wires the sequential mutation
   * pipeline; B2-4 ships this as the only entry point so the
   * pipeline plugs in without changing the sheet's contract.
   */
  onCommit: (notifyCustomer: boolean) => void;
  /**
   * Backdrop tap + Cancel button. Closes the sheet WITHOUT
   * discarding the plan — the user can re-open and edit, or
   * tap the header's "Discard plan" button to clear it.
   */
  onCancel: () => void;
  /**
   * B2-6 (2026-05-22) — User tapped the header's "Discard plan"
   * link. The parent is responsible for the confirmation dialog
   * (so the prompt copy stays consistent with other discard
   * surfaces and the parent can decide whether to also exit
   * plan mode). Sheet just emits the intent; nothing local
   * changes here. Hidden when there's nothing to discard
   * (`rows.length === 0`) or a commit is in flight
   * (`isSubmitting === true`) so the dispatcher can't nuke the
   * plan mid-mutation.
   */
  onDiscardPlan: () => void;
  isSubmitting: boolean;
}

// ─── Component ─────────────────────────────────────────────────────

const MIN_STEP = 15;
const HOUR_STEP_MINUTES = 60;

export function ReviewPlanSheet({
  visible,
  rows,
  onAdjustTime,
  onAdjustDuration,
  onRemove,
  onCommit,
  onCancel,
  onDiscardPlan,
  isSubmitting,
}: ReviewPlanSheetProps) {
  // Local-only state — the rest of the sheet is fully controlled
  // by `rows`. Notify resets every open (matches
  // `<DragRescheduleSheet>`'s default-OFF behavior).
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  useEffect(() => {
    if (!visible) setNotifyCustomer(false);
  }, [visible]);

  const validRowCount = useMemo(
    () => rows.filter((r) => !r.isStale).length,
    [rows],
  );
  const canCommit = !isSubmitting && validRowCount > 0;

  const handleCommit = useCallback(() => {
    if (!canCommit) return;
    haptic.medium();
    onCommit(notifyCustomer);
  }, [canCommit, notifyCustomer, onCommit]);

  const handleCancel = useCallback(() => {
    haptic.light();
    onCancel();
  }, [onCancel]);

  // B2-6 (2026-05-22) — emit the discard intent; parent owns the
  // confirm dialog + state clears. Medium haptic on the way out
  // because the action is destructive even if the parent's Alert
  // is what actually does the deleting; the haptic gives the user
  // the "something heavy is about to happen" tactile cue.
  const handleDiscardPlan = useCallback(() => {
    haptic.medium();
    onDiscardPlan();
  }, [onDiscardPlan]);

  // Hide the discard link when there's nothing staged (the user
  // would have nothing to discard anyway, and the closed-sheet
  // state covers that case) AND while a commit is mid-flight
  // (mutations may have already landed at the BE; nuking the
  // plan client-side would orphan the per-row status badges and
  // hide failures from the dispatcher).
  const discardVisible = rows.length > 0 && !isSubmitting;

  // Width — mid-sheet in landscape (wider than the swap sheet at
  // 65% because rows stack vertically and we want each row's
  // stepper-pair to breathe), capped at 78% so the polyline
  // morph behind it stays visible while the user edits times.
  // Portrait is bottom-anchored full-width via `<MapActionModal>`.
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const landscapeWidth = "78%" as const;
  // Mark `isLandscape` as observed so the no-unused-vars rule
  // doesn't trip; the prop sets layout via the modal already.
  void isLandscape;

  if (!visible) {
    return (
      <MapActionModal
        visible={false}
        onRequestClose={onCancel}
        instanceId="review-plan"
        landscapeWidth={landscapeWidth}
      >
        <View />
      </MapActionModal>
    );
  }

  return (
    <MapActionModal
      visible={visible}
      onRequestClose={onCancel}
      instanceId="review-plan"
      landscapeWidth={landscapeWidth}
    >
      <View style={styles.content}>
        <Header
          rowCount={rows.length}
          onClose={handleCancel}
          onDiscardPlan={handleDiscardPlan}
          discardVisible={discardVisible}
        />

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          {rows.length === 0 ? (
            <EmptyState />
          ) : (
            rows.map((row) => (
              <ReviewRow
                key={row.rowKey}
                row={row}
                onAdjustTime={onAdjustTime}
                onAdjustDuration={onAdjustDuration}
                onRemove={onRemove}
              />
            ))
          )}
        </ScrollView>

        <View style={styles.actionRow}>
          <View style={styles.actionNotify}>
            <Switch
              testID="review-plan-notify-toggle"
              value={notifyCustomer}
              onValueChange={(next) => {
                haptic.light();
                setNotifyCustomer(next);
              }}
              disabled={isSubmitting || validRowCount === 0}
              accessibilityLabel="Notify customers of new times"
            />
            <Text style={styles.actionNotifyLabel} numberOfLines={1}>
              Notify customers
            </Text>
          </View>
          <Pressable
            style={[
              styles.button,
              styles.primaryButton,
              styles.primaryButtonFlex,
              !canCommit && styles.buttonDisabled,
            ]}
            onPress={handleCommit}
            disabled={!canCommit}
            accessibilityRole="button"
            accessibilityLabel={`Commit ${validRowCount} change${validRowCount === 1 ? "" : "s"}`}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {validRowCount > 0
                  ? `Commit ${validRowCount}`
                  : "Commit"}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </MapActionModal>
  );
}

// ─── Sub-views ─────────────────────────────────────────────────────

interface HeaderProps {
  rowCount: number;
  onClose: () => void;
  onDiscardPlan: () => void;
  discardVisible: boolean;
}

function Header({
  rowCount,
  onClose,
  onDiscardPlan,
  discardVisible,
}: HeaderProps) {
  const title = `Review ${rowCount} change${rowCount === 1 ? "" : "s"}`;
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerSubRow}>
          <Text style={styles.subtitle} numberOfLines={1}>
            Edit times or remove a move, then commit.
          </Text>
          {discardVisible ? (
            <Pressable
              testID="review-plan-discard"
              onPress={onDiscardPlan}
              style={styles.discardLink}
              accessibilityRole="button"
              accessibilityLabel={`Discard ${rowCount} pending change${rowCount === 1 ? "" : "s"}`}
              hitSlop={6}
            >
              <MaterialIcons name="delete-outline" size={14} color="#DC2626" />
              <Text style={styles.discardLinkText}>Discard plan</Text>
            </Pressable>
          ) : null}
        </View>
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
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <MaterialIcons name="check-circle-outline" size={28} color="#9CA3AF" />
      <Text style={styles.emptyStateText}>
        All staged moves removed. Add another or close to keep the
        plan open.
      </Text>
    </View>
  );
}

interface ReviewRowProps {
  row: ReviewPlanRow;
  onAdjustTime: ReviewPlanSheetProps["onAdjustTime"];
  onAdjustDuration: ReviewPlanSheetProps["onAdjustDuration"];
  onRemove: ReviewPlanSheetProps["onRemove"];
}

function ReviewRow({
  row,
  onAdjustTime,
  onAdjustDuration,
  onRemove,
}: ReviewRowProps) {
  const handleRemove = useCallback(() => {
    haptic.light();
    onRemove(row.rowKey);
  }, [row.rowKey, onRemove]);

  // Status-driven gating. `inFlight` and `committed` lock the row
  // (mutation is mid-flight or already succeeded — editing or
  // removing makes no sense). `failed` stays interactive so the
  // dispatcher can fix the cause and retry, or back out entirely.
  const statusKind = row.status?.kind ?? "idle";
  const rowLocked = statusKind === "inFlight" || statusKind === "committed";
  const steppersDisabled = row.isStale === true || rowLocked;
  const removeDisabled = rowLocked;

  return (
    <View
      style={[styles.row, row.isStale && styles.rowStale]}
      testID={`review-row-${row.rowKey}`}
    >
      <View style={styles.rowHeader}>
        <View style={styles.rowHeaderText}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {row.aSide.name}
            {row.bSide ? `  ↔  ${row.bSide.name}` : ""}
          </Text>
          <Text style={styles.rowSummary}>{row.summary}</Text>
          {row.isStale ? (
            <Text style={styles.rowStaleHint}>
              No longer in route — will be skipped on commit
            </Text>
          ) : null}
          {row.status ? (
            <RowStatusBadge
              status={row.status}
              testID={`review-row-${row.rowKey}-status`}
            />
          ) : null}
        </View>
        <Pressable
          onPress={handleRemove}
          disabled={removeDisabled}
          style={[styles.removeButton, removeDisabled && styles.removeButtonDisabled]}
          accessibilityLabel={`Remove ${row.aSide.name} from plan`}
          accessibilityRole="button"
          hitSlop={8}
        >
          <MaterialIcons
            name="close"
            size={18}
            color={removeDisabled ? "#D1D5DB" : "#6B7280"}
          />
        </Pressable>
      </View>

      <View style={styles.sidesRow}>
        <SidePicker
          testID={`review-row-${row.rowKey}-a`}
          side="a"
          rowKey={row.rowKey}
          data={row.aSide}
          disabled={steppersDisabled}
          onAdjustTime={onAdjustTime}
          onAdjustDuration={onAdjustDuration}
        />
        {row.bSide ? (
          <SidePicker
            testID={`review-row-${row.rowKey}-b`}
            side="b"
            rowKey={row.rowKey}
            data={row.bSide}
            disabled={steppersDisabled}
            onAdjustTime={onAdjustTime}
            onAdjustDuration={onAdjustDuration}
          />
        ) : null}
      </View>
    </View>
  );
}

interface RowStatusBadgeProps {
  status: CommitRowStatus;
  testID: string;
}

/**
 * Per-row commit lifecycle badge. Renders nothing for `idle` (the
 * parent ReviewRow already short-circuits before reaching here, but
 * defense-in-depth so a future refactor that always passes a status
 * still degrades cleanly).
 */
function RowStatusBadge({ status, testID }: RowStatusBadgeProps) {
  if (status.kind === "idle") return null;
  if (status.kind === "inFlight") {
    return (
      <View style={[styles.statusBadge, styles.statusBadgeInFlight]} testID={testID}>
        <ActivityIndicator size="small" color="#3B82F6" />
        <Text style={[styles.statusBadgeText, styles.statusBadgeTextInFlight]}>
          Committing…
        </Text>
      </View>
    );
  }
  if (status.kind === "committed") {
    return (
      <View style={[styles.statusBadge, styles.statusBadgeCommitted]} testID={testID}>
        <MaterialIcons name="check-circle" size={14} color="#22C55E" />
        <Text style={[styles.statusBadgeText, styles.statusBadgeTextCommitted]}>
          Committed
        </Text>
      </View>
    );
  }
  // failed
  return (
    <View style={[styles.statusBadge, styles.statusBadgeFailed]} testID={testID}>
      <MaterialIcons name="error-outline" size={14} color="#EF4444" />
      <Text
        style={[styles.statusBadgeText, styles.statusBadgeTextFailed]}
        numberOfLines={2}
      >
        Failed: {status.message}
      </Text>
    </View>
  );
}

interface SidePickerProps {
  testID: string;
  side: "a" | "b";
  rowKey: string;
  data: ReviewPlanRowSide;
  disabled: boolean;
  onAdjustTime: ReviewPlanSheetProps["onAdjustTime"];
  onAdjustDuration: ReviewPlanSheetProps["onAdjustDuration"];
}

function SidePicker({
  testID,
  side,
  rowKey,
  data,
  disabled,
  onAdjustTime,
  onAdjustDuration,
}: SidePickerProps) {
  const display = useMemo(() => {
    const cand = parseHHMMToMinutes(data.proposedStartHHMM);
    if (cand == null) return { hour: "—", minute: "—", period: "" };
    const hour24 = Math.floor(cand / 60);
    const minute = cand % 60;
    const period = hour24 >= 12 ? "PM" : "AM";
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return {
      hour: hour12.toString(),
      minute: minute.toString().padStart(2, "0"),
      period,
    };
  }, [data.proposedStartHHMM]);

  const adjust = useCallback(
    (deltaMinutes: number) => {
      if (disabled) return;
      const cand = parseHHMMToMinutes(data.proposedStartHHMM);
      if (cand == null) return;
      const next = cand + deltaMinutes;
      const clamped = clampStartHHMM(
        formatMinutesToHHMM(next),
        data.windowEdges,
        data.durationMinutes,
      );
      // No-op when the clamp returns the same value (boundary
      // hit). The disabled-arrow check below uses the same
      // boundary math, so this path should be rare — defense in
      // depth against a future stepper rounding tweak.
      if (clamped === data.proposedStartHHMM) return;
      haptic.light();
      onAdjustTime(rowKey, side, clamped);
    },
    [data, rowKey, side, onAdjustTime, disabled],
  );

  const isArrowDisabled = useCallback(
    (deltaMinutes: number): boolean => {
      if (disabled) return true;
      const cand = parseHHMMToMinutes(data.proposedStartHHMM);
      if (cand == null) return true;
      const start = parseHHMMToMinutes(data.windowEdges.startHHMM);
      const end = parseHHMMToMinutes(data.windowEdges.endHHMM);
      if (start == null || end == null) return true;
      const latestValidStart = end - data.durationMinutes;
      const next = cand + deltaMinutes;
      return next < start || next > latestValidStart;
    },
    [data, disabled],
  );

  const isDirty = useMemo(() => {
    if (!data.originalHHMM) return false;
    return (
      parseHHMMToMinutes(data.originalHHMM) !==
      parseHHMMToMinutes(data.proposedStartHHMM)
    );
  }, [data.originalHHMM, data.proposedStartHHMM]);

  const endHHMM = useMemo(
    () => addDurationToHHMM(data.proposedStartHHMM, data.durationMinutes),
    [data.proposedStartHHMM, data.durationMinutes],
  );

  // B2-7 (2026-05-22) — duration chevron stepper. Mirrors the
  // drag-reschedule-sheet's approach: clamp the proposed duration
  // to [15, 480] AND to the room left in the window from the
  // current start. If the dispatcher extends the appointment past
  // the window edge, re-clamp the start time to `end - newDuration`
  // so the row stays inside the window — emit the start adjustment
  // separately via `onAdjustTime` BEFORE the duration adjustment so
  // the parent's `applyPlannedMoves` re-derivation sees a consistent
  // pair on the next render.
  const isDurationDirty = data.durationMinutes !== data.baseDurationMinutes;

  const adjustDuration = useCallback(
    (deltaMinutes: number) => {
      if (disabled) return;
      const start = parseHHMMToMinutes(data.windowEdges.startHHMM);
      const end = parseHHMMToMinutes(data.windowEdges.endHHMM);
      const cand = parseHHMMToMinutes(data.proposedStartHHMM);
      if (start == null || end == null || cand == null) return;
      const roomFromStart = end - cand;
      const maxAllowed = Math.max(
        DURATION_MIN_MINUTES,
        Math.min(DURATION_MAX_MINUTES, roomFromStart),
      );
      const proposed = clampDurationMinutes(
        data.durationMinutes + deltaMinutes,
      );
      const next = Math.min(proposed, maxAllowed);
      if (next === data.durationMinutes) return;
      haptic.light();
      onAdjustDuration(rowKey, side, next);
    },
    [data, disabled, rowKey, side, onAdjustDuration],
  );

  const isDurationArrowDisabled = useCallback(
    (deltaMinutes: number): boolean => {
      if (disabled) return true;
      const start = parseHHMMToMinutes(data.windowEdges.startHHMM);
      const end = parseHHMMToMinutes(data.windowEdges.endHHMM);
      const cand = parseHHMMToMinutes(data.proposedStartHHMM);
      if (start == null || end == null || cand == null) return true;
      const roomFromStart = end - cand;
      const maxAllowed = Math.max(
        DURATION_MIN_MINUTES,
        Math.min(DURATION_MAX_MINUTES, roomFromStart),
      );
      const next = data.durationMinutes + deltaMinutes;
      return next < DURATION_MIN_MINUTES || next > maxAllowed;
    },
    [data, disabled],
  );

  return (
    <View style={styles.column} testID={testID}>
      <Text style={styles.columnLabel}>{side === "a" ? "Drop" : "Displaced"}</Text>
      <Text style={styles.columnAppointmentName} numberOfLines={1}>
        {data.name}
      </Text>

      <View style={styles.stepperRow}>
        <StepperBlock
          label="Hour"
          value={display.hour}
          onUp={() => adjust(HOUR_STEP_MINUTES)}
          onDown={() => adjust(-HOUR_STEP_MINUTES)}
          upDisabled={isArrowDisabled(HOUR_STEP_MINUTES)}
          downDisabled={isArrowDisabled(-HOUR_STEP_MINUTES)}
        />
        <View style={styles.colon}>
          <Text style={styles.colonText}>:</Text>
        </View>
        <StepperBlock
          label="Min"
          value={display.minute}
          onUp={() => adjust(MIN_STEP)}
          onDown={() => adjust(-MIN_STEP)}
          upDisabled={isArrowDisabled(MIN_STEP)}
          downDisabled={isArrowDisabled(-MIN_STEP)}
        />
        {display.period ? (
          <View style={styles.ampm}>
            <Text style={styles.ampmText}>{display.period}</Text>
          </View>
        ) : null}
      </View>

      {data.originalHHMM ? (
        <Text style={styles.changeHint}>
          <Text>{formatTime12h(data.originalHHMM)}</Text>
          <Text>{"  →  "}</Text>
          <Text style={[styles.changeHintNew, isDirty && styles.changeHintDirty]}>
            {formatTimeRange12h(data.proposedStartHHMM, endHHMM)}
          </Text>
        </Text>
      ) : (
        <Text style={styles.changeHint}>
          {formatTimeRange12h(data.proposedStartHHMM, endHHMM)}
        </Text>
      )}

      <Text style={styles.windowHint}>Window: {data.windowLabel}</Text>

      <View style={styles.durationRow} testID={`${testID}-duration`}>
        <Pressable
          onPress={() => adjustDuration(-DURATION_STEP_INCREMENT)}
          disabled={isDurationArrowDisabled(-DURATION_STEP_INCREMENT)}
          style={[
            styles.durationArrow,
            isDurationArrowDisabled(-DURATION_STEP_INCREMENT) &&
              styles.durationArrowDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Shorten appointment by 15 minutes"
          hitSlop={8}
        >
          <MaterialIcons
            name="chevron-left"
            size={22}
            color={
              isDurationArrowDisabled(-DURATION_STEP_INCREMENT)
                ? "#D1D5DB"
                : "#1F2937"
            }
          />
        </Pressable>
        <Text
          style={[
            styles.durationValue,
            isDurationDirty && styles.durationValueDirty,
          ]}
          numberOfLines={1}
          testID={`${testID}-duration-value`}
        >
          {data.durationMinutes} min
        </Text>
        <Pressable
          onPress={() => adjustDuration(DURATION_STEP_INCREMENT)}
          disabled={isDurationArrowDisabled(DURATION_STEP_INCREMENT)}
          style={[
            styles.durationArrow,
            isDurationArrowDisabled(DURATION_STEP_INCREMENT) &&
              styles.durationArrowDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Extend appointment by 15 minutes"
          hitSlop={8}
        >
          <MaterialIcons
            name="chevron-right"
            size={22}
            color={
              isDurationArrowDisabled(DURATION_STEP_INCREMENT)
                ? "#D1D5DB"
                : "#1F2937"
            }
          />
        </Pressable>
      </View>
    </View>
  );
}

interface StepperBlockProps {
  label: string;
  value: string;
  onUp: () => void;
  onDown: () => void;
  upDisabled: boolean;
  downDisabled: boolean;
}

function StepperBlock({
  label,
  value,
  onUp,
  onDown,
  upDisabled,
  downDisabled,
}: StepperBlockProps) {
  return (
    <View style={styles.stepperBlock}>
      <Pressable
        onPress={onUp}
        disabled={upDisabled}
        style={[styles.stepperArrow, upDisabled && styles.stepperArrowDisabled]}
        accessibilityLabel={`Increase ${label}`}
        accessibilityRole="button"
        hitSlop={8}
      >
        <MaterialIcons
          name="keyboard-arrow-up"
          size={24}
          color={upDisabled ? "#D1D5DB" : "#1F2937"}
        />
      </Pressable>
      <Text style={styles.stepperValue}>{value}</Text>
      <Pressable
        onPress={onDown}
        disabled={downDisabled}
        style={[
          styles.stepperArrow,
          downDisabled && styles.stepperArrowDisabled,
        ]}
        accessibilityLabel={`Decrease ${label}`}
        accessibilityRole="button"
        hitSlop={8}
      >
        <MaterialIcons
          name="keyboard-arrow-down"
          size={24}
          color={downDisabled ? "#D1D5DB" : "#1F2937"}
        />
      </Pressable>
      <Text style={styles.stepperLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
  },
  scrollArea: {
    flex: 1,
    marginTop: 6,
  },
  scrollContent: {
    paddingBottom: 8,
    gap: 14,
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
    flex: 1,
    fontSize: 13,
    color: "#6B7280",
  },
  headerSubRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  discardLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  discardLinkText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#DC2626",
  },
  closeButton: {
    padding: 4,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    gap: 8,
  },
  emptyStateText: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    paddingHorizontal: 16,
  },
  row: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  rowStale: {
    opacity: 0.5,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  rowHeaderText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  rowSummary: {
    fontSize: 12,
    color: "#6B7280",
  },
  rowStaleHint: {
    fontSize: 12,
    color: "#EF4444",
    fontWeight: "600",
    marginTop: 2,
  },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  removeButtonDisabled: {
    opacity: 0.4,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  statusBadgeInFlight: {
    backgroundColor: "#DBEAFE",
  },
  statusBadgeTextInFlight: {
    color: "#1D4ED8",
  },
  statusBadgeCommitted: {
    backgroundColor: "#DCFCE7",
  },
  statusBadgeTextCommitted: {
    color: "#15803D",
  },
  statusBadgeFailed: {
    backgroundColor: "#FEE2E2",
    paddingRight: 10,
    flexShrink: 1,
  },
  statusBadgeTextFailed: {
    color: "#B91C1C",
    flexShrink: 1,
  },
  sidesRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
  },
  column: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  columnLabel: {
    fontSize: 10,
    color: "#9CA3AF",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  columnAppointmentName: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "600",
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 84,
  },
  stepperBlock: {
    alignItems: "center",
    paddingHorizontal: 4,
  },
  stepperArrow: {
    padding: 2,
  },
  stepperArrowDisabled: {
    opacity: 0.4,
  },
  stepperValue: {
    fontSize: 30,
    fontWeight: "700",
    color: "#111827",
    fontVariant: ["tabular-nums"],
    minWidth: 48,
    textAlign: "center",
  },
  stepperLabel: {
    fontSize: 10,
    color: "#9CA3AF",
    marginTop: 2,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  colon: {
    paddingHorizontal: 2,
    marginBottom: 14,
  },
  colonText: {
    fontSize: 28,
    fontWeight: "700",
    color: "#9CA3AF",
  },
  ampm: {
    marginLeft: 4,
    marginBottom: 14,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  ampmText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
  },
  changeHint: {
    textAlign: "center",
    fontSize: 12,
    color: "#6B7280",
  },
  changeHintNew: {
    color: "#1F2937",
    fontWeight: "700",
  },
  changeHintDirty: {
    color: "#22C55E",
  },
  windowHint: {
    textAlign: "center",
    fontSize: 11,
    color: "#9CA3AF",
  },
  durationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
  },
  durationArrow: {
    padding: 4,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
  },
  durationArrowDisabled: {
    opacity: 0.4,
  },
  durationValue: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    fontVariant: ["tabular-nums"],
    minWidth: 56,
    textAlign: "center",
  },
  durationValueDirty: {
    color: "#22C55E",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 8,
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  actionNotify: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  actionNotifyLabel: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "600",
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  primaryButton: {
    backgroundColor: "#22C55E",
  },
  primaryButtonFlex: {
    flex: 1,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
