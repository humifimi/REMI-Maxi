/**
 * PLAN-DEVIATION: 2026-05-21-chip-bar-snap-mini-sheet — this entire
 * component is the deviation's mini-sheet. The Notify-customer toggle
 * lives in the action row (originally drawn below the picker), and the
 * sheet hosts B2-7's per-side duration stepper which is itself part of
 * 2026-05-22-chip-bar-plan-mode-batch. See
 * docs/PLAN-DEVIATIONS.md#2026-05-21-chip-bar-snap-mini-sheet and
 * docs/PLAN-DEVIATIONS.md#2026-05-22-chip-bar-plan-mode-batch.
 *
 * `<DragRescheduleSheet>` (chip-bar snap-zone rescheduler — Phase 2) —
 * the dual-mode mini-rescheduler that opens when the user drags a
 * chip on the franchise route map's chip bar.
 *
 * Two modes:
 *
 *   - `kind: "insert"` — single picker. The dragged chip is being
 *     dropped into a gap between two other chips. The picker is
 *     bounded by `[leftNeighbor.end_time, rightNeighbor.start_time]`
 *     (passed in as `mode.window`). Default = midpoint of the valid
 *     start range, snapped to the nearest 15-min slot.
 *
 *   - `kind: "swap"` — two pickers, A and B. Chip A was dropped onto
 *     chip B's body (snap-zone hit). Each side's window equals the
 *     OTHER side's old neighborhood (so A can land anywhere B used
 *     to be able to land, and vice versa). Each side's default
 *     equals the OTHER side's pre-swap `scheduled_time` — so hitting
 *     Save immediately on open is identical to today's auto-trade
 *     swap behavior. This preserves the "Save with no changes = the
 *     old chip-bar behavior" regression check.
 *
 * Both modes:
 *
 *   - End times are ALWAYS derived as `pickedStart + durationMinutes`,
 *     never picked. Matches the 2026-05-21 swapStops duration
 *     preservation fix.
 *   - A single "Notify customer" toggle applies to the whole sheet
 *     (in swap mode, applies to BOTH appointments via the BE's
 *     per-appointment notification_preference plumbing). Defaults
 *     OFF every time the sheet opens.
 *   - Per-side window clamping: step arrows are disabled when
 *     stepping past the window boundary. No visual jolt — the value
 *     just doesn't move.
 *
 * Edge cases:
 *
 *   - **No-room window** (`endHHMM - startHHMM < durationMinutes`):
 *     pickers render but every step arrow is disabled, Save is
 *     disabled, footer shows a "No room in this slot" message.
 *   - **Cross-midnight window** (`endHHMM < startHHMM`): treated as
 *     an impossible state (per user direction 2026-05-21,
 *     appointments never occur around midnight). Pickers hidden,
 *     error message shown, only Cancel + Advanced visible.
 *
 * What this sheet is NOT:
 *
 *   - NOT wired to any backend mutation. Submit hands the payload
 *     to the parent via `onSubmit` and the parent decides what to
 *     do (extended `swapStops` for swap mode, new `repositionStop`
 *     for insert mode). The wiring lands in Phases 4 + 6.
 *   - NOT a replacement for `<RescheduleSheet>`. That's the long-
 *     tail (date change, full notification editing). The optional
 *     `onAdvanced` prop lets the parent switch to that sheet for
 *     users who need more than time-picking.
 *   - NOT a replacement for `<QuickTimeSheet>` either. That sheet
 *     is for "I tapped a chip and want to nudge its time"; this
 *     one is for "I dragged a chip somewhere new and need to pick
 *     a time that fits there."
 *
 * Built on `<MapActionModal>` (not gorhom `<AppSheet>`) — same
 * reasoning as `<QuickTimeSheet>`, the gorhom-around-MapView
 * pitfall documented in PLAN-DEVIATION 2026-05-17.
 *
 * Gesture model: no swipe-to-dismiss. Backdrop tap (via
 * `<MapActionModal>`) and the explicit Cancel button are the only
 * dismiss affordances.
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
import type { MapStop } from "@technician/types/api";
import { formatTime12h, formatTimeRange12h } from "@technician/utils/format-display";
import { haptic } from "@technician/hooks/utility/use-haptics";

// ─── Time helpers (exported for unit-test reuse) ────────────────────

export interface TimeWindow {
  startHHMM: string;
  endHHMM: string;
}

/**
 * Parse a wire-format time string (`HH:MM` or `HH:MM:SS`) into
 * minutes-of-day. Returns null when the string doesn't match the
 * wire shape — the caller decides whether to fall back or hard-fail.
 *
 * NOTE: this is the same shape contract as `format-display.ts`'s
 * `formatTime12h` accepts. Keep them in sync if the contract widens.
 */
export function parseHHMMToMinutes(time: string): number | null {
  if (typeof time !== "string") return null;
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!match) return null;
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

/**
 * Inverse of `parseHHMMToMinutes` — emits `HH:MM` (no seconds; the
 * BE accepts both and `HH:MM` is cheaper to compare in the sheet's
 * own state). Caller appends `:00` if it needs the seconds-bearing
 * shape for the BE payload.
 */
export function formatMinutesToHHMM(minutes: number): string {
  const wrapped = ((Math.round(minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(wrapped / 60);
  const min = wrapped % 60;
  return `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
}

/**
 * True when `window.endHHMM < window.startHHMM` — the "wraps past
 * midnight" case. Per user direction 2026-05-21, appointments never
 * occur near midnight, so this is treated as an impossible state by
 * the sheet (error render, only Cancel + Advanced visible).
 */
export function isCrossMidnightWindow(window: TimeWindow): boolean {
  const start = parseHHMMToMinutes(window.startHHMM);
  const end = parseHHMMToMinutes(window.endHHMM);
  if (start == null || end == null) return false;
  return end < start;
}

/**
 * True when the window can't fit the appointment's duration — i.e.
 * `end - start < duration`. Sheet renders with all step arrows
 * disabled and a "no room" footer message in this case.
 */
export function hasNoRoomInWindow(
  window: TimeWindow,
  durationMinutes: number,
): boolean {
  const start = parseHHMMToMinutes(window.startHHMM);
  const end = parseHHMMToMinutes(window.endHHMM);
  if (start == null || end == null) return true;
  if (end < start) return true; // cross-midnight is also "no room"
  return end - start < durationMinutes;
}

/**
 * Clamp a candidate start time to the valid range
 * `[window.startHHMM, window.endHHMM - durationMinutes]`. Returns
 * the unchanged candidate when the window is invalid (caller should
 * have already filtered those via `isCrossMidnightWindow` /
 * `hasNoRoomInWindow`).
 */
export function clampStartHHMM(
  candidateHHMM: string,
  window: TimeWindow,
  durationMinutes: number,
): string {
  const cand = parseHHMMToMinutes(candidateHHMM);
  const start = parseHHMMToMinutes(window.startHHMM);
  const end = parseHHMMToMinutes(window.endHHMM);
  if (cand == null || start == null || end == null) return candidateHHMM;
  const latestValidStart = end - durationMinutes;
  if (latestValidStart < start) return candidateHHMM; // no room
  const clamped = Math.max(start, Math.min(latestValidStart, cand));
  return formatMinutesToHHMM(clamped);
}

/**
 * Default start time for INSERT mode: midpoint of the valid start
 * range `[window.start, window.end - duration]`, snapped to the
 * nearest 15-min slot, and clamped back into the valid range (the
 * snap can push us out by up to 7 minutes).
 *
 * For SWAP mode the consumer passes `defaultStartHHMM` directly
 * (the other side's pre-swap `scheduled_time`), so this helper is
 * insert-only.
 */
export function defaultInsertStartHHMM(
  window: TimeWindow,
  durationMinutes: number,
): string {
  const start = parseHHMMToMinutes(window.startHHMM);
  const end = parseHHMMToMinutes(window.endHHMM);
  if (start == null || end == null) return window.startHHMM;
  const latestValidStart = end - durationMinutes;
  if (latestValidStart <= start) return window.startHHMM;
  const midpoint = start + Math.floor((latestValidStart - start) / 2);
  const snapped = Math.round(midpoint / 15) * 15;
  const final = Math.min(latestValidStart, Math.max(start, snapped));
  return formatMinutesToHHMM(final);
}

/**
 * Add `durationMinutes` to a wire-format start time and return the
 * resulting `HH:MM` end time. Used to derive payload end times from
 * the picked start.
 */
export function addDurationToHHMM(
  startHHMM: string,
  durationMinutes: number,
): string {
  const start = parseHHMMToMinutes(startHHMM);
  if (start == null) return startHHMM;
  return formatMinutesToHHMM(start + durationMinutes);
}

// ─── Duration stepper bounds (B2-7) ────────────────────────────────

/**
 * B2-7 (2026-05-22) — stepper geometry for the duration chevron
 * control. The BE accepts `[1, 480]` and validates out-of-range as
 * `bad_input`; the FE clamps at `[15, 480]` because sub-15-minute
 * appointments don't exist in the product today and a 15-min floor
 * matches the time picker's `MIN_STEP` so the two controls feel
 * symmetric. 480 = 8 hours — generous ceiling that lets a dispatcher
 * cover an unusually long job without forcing a fallback to
 * `<RescheduleSheet>`.
 *
 * `DURATION_STEP_INCREMENT` = step size (each chevron tap moves
 * this many minutes); `DURATION_MIN_MINUTES` / `DURATION_MAX_MINUTES`
 * are the absolute floor/ceiling. These are separate concepts and
 * the names keep them distinct even though they happen to share a
 * value with the floor today.
 */
export const DURATION_STEP_INCREMENT = 15;
export const DURATION_MIN_MINUTES = 15;
export const DURATION_MAX_MINUTES = 480;

/**
 * Clamp a candidate duration to `[15, 480]` snapped to the
 * 15-minute grid the stepper exposes. Caller is responsible for
 * also re-clamping the start time against the window with the new
 * duration (see `clampStartHHMM`).
 */
export function clampDurationMinutes(candidate: number): number {
  if (!Number.isFinite(candidate)) return DURATION_MIN_MINUTES;
  const snapped =
    Math.round(candidate / DURATION_STEP_INCREMENT) * DURATION_STEP_INCREMENT;
  return Math.max(
    DURATION_MIN_MINUTES,
    Math.min(DURATION_MAX_MINUTES, snapped),
  );
}

// ─── Mode + props contract ─────────────────────────────────────────

export interface DragRescheduleInsertMode {
  kind: "insert";
  appointment: MapStop;
  durationMinutes: number;
  window: TimeWindow;
  /**
   * Optional override. When omitted, the sheet derives the default
   * via `defaultInsertStartHHMM(window, durationMinutes)`. Tests
   * may pass an explicit value to pin behavior without re-deriving.
   */
  defaultStartHHMM?: string;
}

export interface DragRescheduleSwapSide {
  appointment: MapStop;
  durationMinutes: number;
  window: TimeWindow;
  /**
   * REQUIRED for swap. Matches the spec — defaults to the OTHER
   * side's pre-swap `scheduled_time` so hitting Save immediately
   * reproduces today's auto-trade behavior. The sheet does not
   * derive this; the consumer (or test) must supply it.
   */
  defaultStartHHMM: string;
}

export interface DragRescheduleSwapMode {
  kind: "swap";
  aSide: DragRescheduleSwapSide;
  bSide: DragRescheduleSwapSide;
}

export type DragRescheduleSheetMode =
  | DragRescheduleInsertMode
  | DragRescheduleSwapMode;

export interface DragRescheduleInsertPayload {
  kind: "insert";
  stopId: number;
  newStartHHMM: string;
  newEndHHMM: string;
  notifyCustomer: boolean;
  /**
   * B2-7 (2026-05-22) — present only when the dispatcher stepped
   * the duration off its base value via the chevron stepper.
   * Maps 1:1 to `useRouteStopReposition`'s `newDurationMin`
   * (and on the wire, to the BE's `newDurationMin` on the
   * reposition endpoint). Undefined for un-stepped rows so the
   * parent's mutation call stays byte-identical to the pre-B2-7
   * legacy shape and the audit log records "no override".
   */
  newDurationMin?: number;
}

export interface DragRescheduleSwapPayload {
  kind: "swap";
  aStopId: number;
  aNewStartHHMM: string;
  aNewEndHHMM: string;
  bStopId: number;
  bNewStartHHMM: string;
  bNewEndHHMM: string;
  notifyCustomer: boolean;
  /**
   * B2-7 (2026-05-22) — present per side only when the
   * dispatcher stepped that side's duration off its base via
   * the chevron stepper. Each side is independently optional —
   * a swap where only the A-side was stretched ships
   * `aNewDurationMin` but omits `bNewDurationMin`, and the BE
   * leaves the un-overridden side's `scheduled_duration_min`
   * alone.
   */
  aNewDurationMin?: number;
  bNewDurationMin?: number;
}

export type DragRescheduleSheetPayload =
  | DragRescheduleInsertPayload
  | DragRescheduleSwapPayload;

export interface DragRescheduleSheetProps {
  /** Open/closed. Parent owns this state. */
  visible: boolean;
  /**
   * Mode payload. `null` is allowed so the parent can render the
   * sheet with `visible={false}` from the start without churn.
   * When `visible` is true and `mode` is null, the sheet renders
   * an empty loading state.
   */
  mode: DragRescheduleSheetMode | null;
  /** Save handler. Parent dispatches the appropriate BE mutation. */
  onSubmit: (payload: DragRescheduleSheetPayload) => void;
  /** Cancel handler — backdrop tap + Cancel button. */
  onCancel: () => void;
  /** Disables Save and shows a spinner while the parent's mutation is in flight. */
  isSubmitting: boolean;
  /**
   * Optional "Advanced…" escape hatch. When provided, an Advanced
   * button renders in the footer that hands off to the full
   * `<RescheduleSheet>` (or whatever the parent chooses). Always
   * available in the cross-midnight error state per spec.
   */
  onAdvanced?: () => void;
}

// ─── Component ─────────────────────────────────────────────────────

const MIN_STEP = 15;
const HOUR_STEP = 1;

export function DragRescheduleSheet({
  visible,
  mode,
  onSubmit,
  onCancel,
  isSubmitting,
  onAdvanced,
}: DragRescheduleSheetProps) {
  // Per-side state — one Pair for insert (only `a` used), both for swap.
  const [startA, setStartA] = useState<string | null>(null);
  const [startB, setStartB] = useState<string | null>(null);
  // B2-7 (2026-05-22) — per-side duration override. `null` means
  // "use the mode's base duration"; a number means "the dispatcher
  // stepped this side to a new duration". Seeded to the mode base
  // on open so the chevron stepper renders with the appointment's
  // current duration; only flips to non-null when the user actually
  // taps a chevron. Submit emits the value as `aNewDurationMin` /
  // `bNewDurationMin` / `newDurationMin` only when it differs from
  // the base (see `handleSave`) so un-edited rows keep producing
  // the legacy wire body.
  const [durationA, setDurationA] = useState<number | null>(null);
  const [durationB, setDurationB] = useState<number | null>(null);
  const [notifyCustomer, setNotifyCustomer] = useState(false);

  // Identity key derived from the mode's stops — changes when the
  // underlying appointment(s) change, NOT when the parent re-renders
  // with a fresh object. Without this, an in-flight parent re-render
  // would re-seed mid-edit and lose the user's stepper input.
  const modeIdentityKey = useMemo(() => {
    if (!mode) return "none";
    if (mode.kind === "insert") {
      return `insert:${mode.appointment.stopId}`;
    }
    return `swap:${mode.aSide.appointment.stopId}:${mode.bSide.appointment.stopId}`;
  }, [mode]);

  // Seed when the sheet opens for a new mode payload, and clear on
  // close. Cycling visibility on the same mode payload also re-seeds
  // (matches `<QuickTimeSheet>` semantics — defaults are stable per
  // open, edits don't leak across opens).
  useEffect(() => {
    if (!visible || !mode) {
      setStartA(null);
      setStartB(null);
      setDurationA(null);
      setDurationB(null);
      setNotifyCustomer(false);
      return;
    }
    if (mode.kind === "insert") {
      const seed =
        mode.defaultStartHHMM ??
        defaultInsertStartHHMM(mode.window, mode.durationMinutes);
      setStartA(seed);
      setStartB(null);
      // B2-7 (2026-05-22) — seed duration to the mode base so the
      // stepper renders with the current value. Stays `null` semantic
      // (== "not yet edited") until the dispatcher taps a chevron,
      // but we initialize with the base number so the display reads
      // sensibly on open without a separate `effectiveDuration`
      // derivation.
      setDurationA(mode.durationMinutes);
      setDurationB(null);
    } else {
      setStartA(mode.aSide.defaultStartHHMM);
      setStartB(mode.bSide.defaultStartHHMM);
      setDurationA(mode.aSide.durationMinutes);
      setDurationB(mode.bSide.durationMinutes);
    }
    // Notify toggle resets every open per spec.
    setNotifyCustomer(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- modeIdentityKey is the meaningful identity; mode itself changes per parent render.
  }, [visible, modeIdentityKey]);

  // Pre-compute window state per side. Used to gate render shape +
  // arrow-disabled state.
  const aWindowState = useMemo(() => {
    if (!mode) return null;
    const side =
      mode.kind === "insert"
        ? { window: mode.window, durationMinutes: mode.durationMinutes }
        : { window: mode.aSide.window, durationMinutes: mode.aSide.durationMinutes };
    return classifyWindow(side.window, side.durationMinutes);
  }, [mode]);

  const bWindowState = useMemo(() => {
    if (!mode || mode.kind !== "swap") return null;
    return classifyWindow(mode.bSide.window, mode.bSide.durationMinutes);
  }, [mode]);

  const isCrossMidnight =
    aWindowState?.kind === "cross-midnight" ||
    bWindowState?.kind === "cross-midnight";

  const isNoRoom =
    aWindowState?.kind === "no-room" || bWindowState?.kind === "no-room";

  // B2-7 (2026-05-22) — `aDuration` / `bDuration` resolve to the
  // override (if set) or the mode's base. Every arrow-disabled
  // helper and the submit math reads through these instead of
  // mode.aSide.durationMinutes directly so the time stepper's
  // valid range tracks the duration stepper's current value.
  const aDuration = useMemo(() => {
    if (!mode) return 0;
    const base =
      mode.kind === "insert" ? mode.durationMinutes : mode.aSide.durationMinutes;
    return durationA ?? base;
  }, [mode, durationA]);

  const bDuration = useMemo(() => {
    if (!mode || mode.kind !== "swap") return 0;
    return durationB ?? mode.bSide.durationMinutes;
  }, [mode, durationB]);

  const adjustA = useCallback(
    (deltaMinutes: number) => {
      if (!mode || !startA) return;
      haptic.light();
      const cand = parseHHMMToMinutes(startA);
      if (cand == null) return;
      const next = cand + deltaMinutes;
      const window =
        mode.kind === "insert" ? mode.window : mode.aSide.window;
      const clamped = clampStartHHMM(
        formatMinutesToHHMM(next),
        window,
        aDuration,
      );
      setStartA(clamped);
    },
    [mode, startA, aDuration],
  );

  const adjustB = useCallback(
    (deltaMinutes: number) => {
      if (!mode || mode.kind !== "swap" || !startB) return;
      haptic.light();
      const cand = parseHHMMToMinutes(startB);
      if (cand == null) return;
      const next = cand + deltaMinutes;
      const clamped = clampStartHHMM(
        formatMinutesToHHMM(next),
        mode.bSide.window,
        bDuration,
      );
      setStartB(clamped);
    },
    [mode, startB, bDuration],
  );

  // B2-7 (2026-05-22) — adjust A/B duration by ±15 min and re-clamp
  // the start time against the new duration. When stretching the
  // duration would push end-time past the window, the start time
  // is clamped DOWN to fit (latestValidStart = end - newDuration).
  // When that's still infeasible, the arrow is gated upstream by
  // `isDurationArrowDisabledA/B` so this path never sees an
  // impossible stretch.
  const adjustDurationA = useCallback(
    (deltaMinutes: number) => {
      if (!mode || !startA) return;
      const window =
        mode.kind === "insert" ? mode.window : mode.aSide.window;
      const nextDuration = clampDurationMinutes(aDuration + deltaMinutes);
      if (nextDuration === aDuration) return;
      haptic.light();
      setDurationA(nextDuration);
      // Re-clamp start against the new duration so an existing
      // start that no longer fits gets pulled in instead of
      // silently exposing an invalid Save.
      const reclamped = clampStartHHMM(startA, window, nextDuration);
      if (reclamped !== startA) setStartA(reclamped);
    },
    [mode, startA, aDuration],
  );

  const adjustDurationB = useCallback(
    (deltaMinutes: number) => {
      if (!mode || mode.kind !== "swap" || !startB) return;
      const nextDuration = clampDurationMinutes(bDuration + deltaMinutes);
      if (nextDuration === bDuration) return;
      haptic.light();
      setDurationB(nextDuration);
      const reclamped = clampStartHHMM(startB, mode.bSide.window, nextDuration);
      if (reclamped !== startB) setStartB(reclamped);
    },
    [mode, startB, bDuration],
  );

  // Arrow-disabled helpers — true when stepping the given delta
  // would land outside the valid range. Drives the visual disabled
  // state of each arrow.
  const isArrowDisabledA = useCallback(
    (deltaMinutes: number): boolean => {
      if (!mode || !startA || aWindowState?.kind !== "valid") return true;
      const cand = parseHHMMToMinutes(startA);
      if (cand == null) return true;
      const window =
        mode.kind === "insert" ? mode.window : mode.aSide.window;
      const start = parseHHMMToMinutes(window.startHHMM);
      const end = parseHHMMToMinutes(window.endHHMM);
      if (start == null || end == null) return true;
      const latestValidStart = end - aDuration;
      const next = cand + deltaMinutes;
      // Already-at-boundary check: a non-moving step is "disabled"
      // even if the clamped result equals the candidate.
      return next < start || next > latestValidStart;
    },
    [mode, startA, aWindowState, aDuration],
  );

  const isArrowDisabledB = useCallback(
    (deltaMinutes: number): boolean => {
      if (!mode || mode.kind !== "swap" || !startB || bWindowState?.kind !== "valid")
        return true;
      const cand = parseHHMMToMinutes(startB);
      if (cand == null) return true;
      const start = parseHHMMToMinutes(mode.bSide.window.startHHMM);
      const end = parseHHMMToMinutes(mode.bSide.window.endHHMM);
      if (start == null || end == null) return true;
      const latestValidStart = end - bDuration;
      const next = cand + deltaMinutes;
      return next < start || next > latestValidStart;
    },
    [mode, startB, bWindowState, bDuration],
  );

  // B2-7 (2026-05-22) — duration chevron disabled gating. Down is
  // disabled at the floor (15 min); up is disabled either at the
  // ceiling (480 min) OR when stretching by the delta would push
  // end-time past `window.end` AND the start can't slide back any
  // further (start is already at `window.start`). The latter
  // "start can't slide back" check means we permit the stretch
  // when there's still slack at the front; `adjustDurationA/B`
  // handles the re-clamp.
  const isDurationArrowDisabledA = useCallback(
    (deltaMinutes: number): boolean => {
      if (!mode || aWindowState?.kind !== "valid") return true;
      const nextDuration = clampDurationMinutes(aDuration + deltaMinutes);
      if (nextDuration === aDuration) return true;
      if (deltaMinutes < 0) return false;
      const window =
        mode.kind === "insert" ? mode.window : mode.aSide.window;
      const start = parseHHMMToMinutes(window.startHHMM);
      const end = parseHHMMToMinutes(window.endHHMM);
      if (start == null || end == null) return true;
      const maxFittingDuration = end - start;
      return nextDuration > maxFittingDuration;
    },
    [mode, aWindowState, aDuration],
  );

  const isDurationArrowDisabledB = useCallback(
    (deltaMinutes: number): boolean => {
      if (!mode || mode.kind !== "swap" || bWindowState?.kind !== "valid")
        return true;
      const nextDuration = clampDurationMinutes(bDuration + deltaMinutes);
      if (nextDuration === bDuration) return true;
      if (deltaMinutes < 0) return false;
      const start = parseHHMMToMinutes(mode.bSide.window.startHHMM);
      const end = parseHHMMToMinutes(mode.bSide.window.endHHMM);
      if (start == null || end == null) return true;
      const maxFittingDuration = end - start;
      return nextDuration > maxFittingDuration;
    },
    [mode, bWindowState, bDuration],
  );

  const canSave = useMemo(() => {
    if (!mode || isSubmitting) return false;
    if (isCrossMidnight || isNoRoom) return false;
    if (!startA) return false;
    if (mode.kind === "swap" && !startB) return false;
    return true;
  }, [mode, startA, startB, isSubmitting, isCrossMidnight, isNoRoom]);

  const handleSave = useCallback(() => {
    if (!mode || !canSave || !startA) return;
    haptic.medium();
    if (mode.kind === "insert") {
      // B2-7 (2026-05-22) — emit `newDurationMin` only when the
      // dispatcher actually stepped duration off its base. The
      // strict-equality check is safe because both sides come
      // from the same integer source (the seed sets `durationA`
      // to `mode.durationMinutes`; the stepper produces clamped
      // multiples of 15). Omitting the field preserves the
      // pre-B2-7 wire body for un-edited rows.
      const overrideDuration =
        durationA != null && durationA !== mode.durationMinutes
          ? durationA
          : undefined;
      onSubmit({
        kind: "insert",
        stopId: mode.appointment.stopId,
        newStartHHMM: startA,
        newEndHHMM: addDurationToHHMM(startA, aDuration),
        notifyCustomer,
        ...(overrideDuration !== undefined
          ? { newDurationMin: overrideDuration }
          : {}),
      });
      return;
    }
    if (!startB) return;
    const aOverride =
      durationA != null && durationA !== mode.aSide.durationMinutes
        ? durationA
        : undefined;
    const bOverride =
      durationB != null && durationB !== mode.bSide.durationMinutes
        ? durationB
        : undefined;
    onSubmit({
      kind: "swap",
      aStopId: mode.aSide.appointment.stopId,
      aNewStartHHMM: startA,
      aNewEndHHMM: addDurationToHHMM(startA, aDuration),
      bStopId: mode.bSide.appointment.stopId,
      bNewStartHHMM: startB,
      bNewEndHHMM: addDurationToHHMM(startB, bDuration),
      notifyCustomer,
      ...(aOverride !== undefined ? { aNewDurationMin: aOverride } : {}),
      ...(bOverride !== undefined ? { bNewDurationMin: bOverride } : {}),
    });
  }, [
    mode,
    startA,
    startB,
    canSave,
    notifyCustomer,
    onSubmit,
    durationA,
    durationB,
    aDuration,
    bDuration,
  ]);

  const handleCancel = useCallback(() => {
    haptic.light();
    onCancel();
  }, [onCancel]);

  const handleAdvanced = useCallback(() => {
    if (!onAdvanced) return;
    haptic.light();
    onAdvanced();
  }, [onAdvanced]);

  // ─── Layout-driven shape ─────────────────────────────────────────

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  // 2026-05-22 follow-up — swap mode needs more horizontal room
  // than the default 50% landscape width because two pickers
  // side-by-side (+ two AM/PM badges + colons + gaps) clip the
  // trailing "PM" on iPhone landscape. Insert mode keeps the
  // 50% default; the single picker has plenty of room.
  const landscapeWidth = mode?.kind === "swap" ? "65%" : "50%";

  if (!visible || !mode) {
    return (
      <MapActionModal
        visible={false}
        onRequestClose={onCancel}
        instanceId="drag-reschedule"
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
      instanceId="drag-reschedule"
      landscapeWidth={landscapeWidth}
    >
      <View style={styles.content}>
        <Header mode={mode} onClose={handleCancel} />

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          {isCrossMidnight ? (
            <CrossMidnightErrorState />
          ) : (
            <View
              style={[
                styles.body,
                mode.kind === "swap" && isLandscape && styles.bodyLandscapeSwap,
              ]}
            >
              <PickerColumn
                testID="drag-reschedule-side-a"
                label={pickerColumnLabel(mode, "a")}
                appointmentName={pickerColumnAppointmentName(mode, "a")}
                originalTimeHHMM={pickerColumnOriginal(mode, "a")}
                window={pickerColumnWindow(mode, "a")}
                durationMinutes={aDuration}
                baseDurationMinutes={pickerColumnDuration(mode, "a")}
                selectedStartHHMM={startA}
                onStepHour={(d) => adjustA(d * 60)}
                onStepMinute={(d) => adjustA(d)}
                onStepDuration={adjustDurationA}
                isUpDisabled={isArrowDisabledA(MIN_STEP)}
                isDownDisabled={isArrowDisabledA(-MIN_STEP)}
                isUpHourDisabled={isArrowDisabledA(60)}
                isDownHourDisabled={isArrowDisabledA(-60)}
                isDurationUpDisabled={isDurationArrowDisabledA(DURATION_STEP_INCREMENT)}
                isDurationDownDisabled={isDurationArrowDisabledA(-DURATION_STEP_INCREMENT)}
                windowState={aWindowState}
              />

              {mode.kind === "swap" ? (
                <PickerColumn
                  testID="drag-reschedule-side-b"
                  label={pickerColumnLabel(mode, "b")}
                  appointmentName={pickerColumnAppointmentName(mode, "b")}
                  originalTimeHHMM={pickerColumnOriginal(mode, "b")}
                  window={pickerColumnWindow(mode, "b")}
                  durationMinutes={bDuration}
                  baseDurationMinutes={pickerColumnDuration(mode, "b")}
                  selectedStartHHMM={startB}
                  onStepHour={(d) => adjustB(d * 60)}
                  onStepMinute={(d) => adjustB(d)}
                  onStepDuration={adjustDurationB}
                  isUpDisabled={isArrowDisabledB(MIN_STEP)}
                  isDownDisabled={isArrowDisabledB(-MIN_STEP)}
                  isUpHourDisabled={isArrowDisabledB(60)}
                  isDownHourDisabled={isArrowDisabledB(-60)}
                  isDurationUpDisabled={isDurationArrowDisabledB(DURATION_STEP_INCREMENT)}
                  isDurationDownDisabled={isDurationArrowDisabledB(-DURATION_STEP_INCREMENT)}
                  windowState={bWindowState}
                />
              ) : null}
            </View>
          )}

        </ScrollView>

        {/* 2026-05-22 follow-up — the action row holds the Notify
            toggle on the left and Save on the right. The standalone
            Notify row that previously lived inside the scroll body
            is gone: it was clipped below the fold on first paint
            (landscape iPhone) and there was no visual hint that the
            sheet scrolled. Folding Notify into the always-visible
            action row makes it impossible to miss.

            The grey Cancel button is also gone — the header's X
            already cancels, and reclaiming the row width for the
            Notify control matters more than the redundant Cancel
            affordance. Advanced... stays when the consumer passes
            `onAdvanced` and is rendered above the action row in
            the cross-midnight error case (where Notify is hidden
            and Save is disabled). */}
        <View style={styles.actionRow}>
          {!isCrossMidnight && (
            <View style={styles.actionNotify}>
              <Switch
                testID="drag-reschedule-notify-toggle"
                value={notifyCustomer}
                onValueChange={(next) => {
                  haptic.light();
                  setNotifyCustomer(next);
                }}
                disabled={isNoRoom}
                accessibilityLabel="Notify customer of new time"
              />
              <Text style={styles.actionNotifyLabel} numberOfLines={1}>
                Notify customer
              </Text>
            </View>
          )}
          {onAdvanced ? (
            <Pressable
              style={[styles.button, styles.secondaryButton]}
              onPress={handleAdvanced}
              accessibilityRole="button"
              accessibilityLabel="Open full reschedule sheet"
            >
              <Text style={styles.secondaryButtonText}>Advanced…</Text>
            </Pressable>
          ) : null}
          {!isCrossMidnight && (
            <Pressable
              style={[
                styles.button,
                styles.primaryButton,
                styles.primaryButtonFlex,
                !canSave && styles.buttonDisabled,
              ]}
              onPress={handleSave}
              disabled={!canSave}
              accessibilityRole="button"
              accessibilityLabel={
                mode.kind === "swap" ? "Save both" : "Save new time"
              }
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {mode.kind === "swap" ? "Save Both" : "Save"}
                </Text>
              )}
            </Pressable>
          )}
        </View>
      </View>
    </MapActionModal>
  );
}

// ─── Sub-views ─────────────────────────────────────────────────────

interface HeaderProps {
  mode: DragRescheduleSheetMode;
  onClose: () => void;
}

function Header({ mode, onClose }: HeaderProps) {
  const title = useMemo(() => {
    if (mode.kind === "insert") {
      return mode.appointment.customerName ?? "Appointment";
    }
    const a = mode.aSide.appointment.customerName ?? "Appointment";
    const b = mode.bSide.appointment.customerName ?? "Appointment";
    return `${a}  ↔  ${b}`;
  }, [mode]);

  const subtitle = useMemo(() => {
    if (mode.kind === "insert") {
      return `Inserting at position ${mode.appointment.stopOrder}`;
    }
    return `Swap positions ${mode.aSide.appointment.stopOrder} ↔ ${mode.bSide.appointment.stopOrder}`;
  }, [mode]);

  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
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

interface PickerColumnProps {
  testID: string;
  label: string;
  appointmentName: string;
  originalTimeHHMM: string | null;
  window: TimeWindow;
  /** Live duration (override || base) — drives the chevron stepper display. */
  durationMinutes: number;
  /** Mode-base duration — drives the "dirty" tint on the duration value. */
  baseDurationMinutes: number;
  selectedStartHHMM: string | null;
  onStepHour: (delta: number) => void;
  onStepMinute: (delta: number) => void;
  /**
   * B2-7 (2026-05-22) — chevron-stepper handler. Delta is signed
   * minutes (+15 / -15). Parent owns the clamp + start re-clamp;
   * column just dispatches the request.
   */
  onStepDuration: (delta: number) => void;
  isUpDisabled: boolean;
  isDownDisabled: boolean;
  isUpHourDisabled: boolean;
  isDownHourDisabled: boolean;
  isDurationUpDisabled: boolean;
  isDurationDownDisabled: boolean;
  windowState: WindowClassification | null;
}

function PickerColumn({
  testID,
  label,
  appointmentName,
  originalTimeHHMM,
  window,
  durationMinutes,
  baseDurationMinutes,
  selectedStartHHMM,
  onStepHour,
  onStepMinute,
  onStepDuration,
  isUpDisabled,
  isDownDisabled,
  isUpHourDisabled,
  isDownHourDisabled,
  isDurationUpDisabled,
  isDurationDownDisabled,
  windowState,
}: PickerColumnProps) {
  const display = useMemo(() => {
    if (!selectedStartHHMM) return { hour: "—", minute: "—", period: "" };
    const cand = parseHHMMToMinutes(selectedStartHHMM);
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
  }, [selectedStartHHMM]);

  const isDirty = useMemo(() => {
    if (!originalTimeHHMM || !selectedStartHHMM) return false;
    return parseHHMMToMinutes(originalTimeHHMM) !==
      parseHHMMToMinutes(selectedStartHHMM);
  }, [originalTimeHHMM, selectedStartHHMM]);

  // B2-7 (2026-05-22) — duration dirty tint matches the time
  // picker's "dispatcher changed this" affordance. Drives the
  // green-text style on the duration value.
  const isDurationDirty = durationMinutes !== baseDurationMinutes;

  const windowLabel = formatTimeRange12h(window.startHHMM, window.endHHMM);

  return (
    <View style={styles.column} testID={testID}>
      <Text style={styles.columnLabel}>{label}</Text>
      <Text style={styles.columnAppointmentName}>{appointmentName}</Text>

      {windowState?.kind === "no-room" ? (
        <View style={styles.noRoomBox}>
          <MaterialIcons name="block" size={20} color="#EF4444" />
          <Text style={styles.noRoomText}>
            No room in this slot — pick another position
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.stepperRow}>
            <StepperBlock
              label="Hour"
              onUp={() => onStepHour(HOUR_STEP)}
              onDown={() => onStepHour(-HOUR_STEP)}
              upDisabled={isUpHourDisabled}
              downDisabled={isDownHourDisabled}
              value={display.hour}
            />
            <View style={styles.colon}>
              <Text style={styles.colonText}>:</Text>
            </View>
            <StepperBlock
              label="Min"
              onUp={() => onStepMinute(MIN_STEP)}
              onDown={() => onStepMinute(-MIN_STEP)}
              upDisabled={isUpDisabled}
              downDisabled={isDownDisabled}
              value={display.minute}
            />
            {display.period ? (
              <View style={styles.ampm}>
                <Text style={styles.ampmText}>{display.period}</Text>
              </View>
            ) : null}
          </View>

          {originalTimeHHMM ? (
            <Text style={styles.changeHint}>
              <Text>{formatTime12h(originalTimeHHMM)}</Text>
              <Text>{"  →  "}</Text>
              <Text style={[styles.changeHintNew, isDirty && styles.changeHintDirty]}>
                {selectedStartHHMM ? formatTime12h(selectedStartHHMM) : "—"}
              </Text>
            </Text>
          ) : null}

          <Text style={styles.windowHint}>Window: {windowLabel}</Text>

          {/* B2-7 (2026-05-22) — horizontal chevron stepper for
              duration, anchored directly under the Window hint
              per the user's spec. Left/right chevrons shrink /
              stretch by 15-min steps. The center value reads as
              the current minutes (override or base); when the
              dispatcher steps it off the base, the value goes
              green to match the time picker's dirty tint. Arrow
              gating mirrors the time picker's pattern — disabled
              at floor (15), ceiling (480), or when stretching
              would push end-time past the window. Always
              rendered (not hidden when un-edited) so the affordance
              is visible from open. */}
          <View style={styles.durationRow} testID={`${testID}-duration`}>
            <Pressable
              onPress={() => onStepDuration(-DURATION_STEP_INCREMENT)}
              disabled={isDurationDownDisabled}
              style={[
                styles.durationArrow,
                isDurationDownDisabled && styles.durationArrowDisabled,
              ]}
              accessibilityLabel="Shorten appointment by 15 minutes"
              accessibilityRole="button"
              hitSlop={8}
            >
              <MaterialIcons
                name="chevron-left"
                size={22}
                color={isDurationDownDisabled ? "#D1D5DB" : "#1F2937"}
              />
            </Pressable>
            <Text
              style={[
                styles.durationValue,
                isDurationDirty && styles.durationValueDirty,
              ]}
              accessibilityLabel={`Appointment length ${durationMinutes} minutes`}
            >
              {durationMinutes} min
            </Text>
            <Pressable
              onPress={() => onStepDuration(DURATION_STEP_INCREMENT)}
              disabled={isDurationUpDisabled}
              style={[
                styles.durationArrow,
                isDurationUpDisabled && styles.durationArrowDisabled,
              ]}
              accessibilityLabel="Extend appointment by 15 minutes"
              accessibilityRole="button"
              hitSlop={8}
            >
              <MaterialIcons
                name="chevron-right"
                size={22}
                color={isDurationUpDisabled ? "#D1D5DB" : "#1F2937"}
              />
            </Pressable>
          </View>
        </>
      )}
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
          size={28}
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
          size={28}
          color={downDisabled ? "#D1D5DB" : "#1F2937"}
        />
      </Pressable>
      <Text style={styles.stepperLabel}>{label}</Text>
    </View>
  );
}

function CrossMidnightErrorState() {
  return (
    <View
      style={styles.errorBox}
      testID="drag-reschedule-cross-midnight-error"
    >
      <MaterialIcons name="error-outline" size={28} color="#EF4444" />
      <Text style={styles.errorText}>
        Invalid time window — please use Advanced
      </Text>
    </View>
  );
}

// ─── Internal helpers ──────────────────────────────────────────────

type WindowClassification =
  | { kind: "valid" }
  | { kind: "no-room" }
  | { kind: "cross-midnight" };

function classifyWindow(
  window: TimeWindow,
  durationMinutes: number,
): WindowClassification {
  if (isCrossMidnightWindow(window)) return { kind: "cross-midnight" };
  if (hasNoRoomInWindow(window, durationMinutes)) return { kind: "no-room" };
  return { kind: "valid" };
}

function pickerColumnLabel(mode: DragRescheduleSheetMode, side: "a" | "b"): string {
  if (mode.kind === "insert") return "New time";
  if (side === "a") return "Drop here";
  return "Displaced";
}

function pickerColumnAppointmentName(
  mode: DragRescheduleSheetMode,
  side: "a" | "b",
): string {
  if (mode.kind === "insert") {
    return mode.appointment.customerName ?? "Appointment";
  }
  const sideData = side === "a" ? mode.aSide : mode.bSide;
  return sideData.appointment.customerName ?? "Appointment";
}

function pickerColumnOriginal(
  mode: DragRescheduleSheetMode,
  side: "a" | "b",
): string | null {
  if (mode.kind === "insert") return mode.appointment.scheduledTime;
  const sideData = side === "a" ? mode.aSide : mode.bSide;
  return sideData.appointment.scheduledTime;
}

function pickerColumnWindow(
  mode: DragRescheduleSheetMode,
  side: "a" | "b",
): TimeWindow {
  if (mode.kind === "insert") return mode.window;
  return side === "a" ? mode.aSide.window : mode.bSide.window;
}

function pickerColumnDuration(
  mode: DragRescheduleSheetMode,
  side: "a" | "b",
): number {
  if (mode.kind === "insert") return mode.durationMinutes;
  return side === "a" ? mode.aSide.durationMinutes : mode.bSide.durationMinutes;
}

// ─── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // 2026-05-22 follow-up #2 — vertical paddings shrunk across the
  // header → scroll → action chain so the per-column "Window: …"
  // hint at the bottom of the picker body is visible without
  // scrolling in landscape swap mode. The body was naturally taller
  // than the viewport on landscape iPhone with the pinned action
  // row in play, pushing the windowHint below the fold.
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
    gap: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingBottom: 4,
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
  body: {
    flexDirection: "column",
    gap: 24,
  },
  bodyLandscapeSwap: {
    flexDirection: "row",
    gap: 16,
  },
  column: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  columnLabel: {
    fontSize: 11,
    color: "#9CA3AF",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  columnAppointmentName: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "600",
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    // 2026-05-22 follow-up #2 — was 130 (a comfortable bottom-margin
    // for a tall picker), now 100 to match the actual stepper height
    // (up-arrow 24 + value 38 + label 14 + down-arrow 24 = 100). The
    // 30px of slack we cut frees the windowHint to render in-fold.
    minHeight: 100,
  },
  stepperBlock: {
    alignItems: "center",
    paddingHorizontal: 6,
  },
  stepperArrow: {
    padding: 4,
  },
  stepperArrowDisabled: {
    opacity: 0.4,
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
    // 2026-05-22 follow-up #2 — was 28 to lift the colon glyph above
    // each StepperBlock's "HOUR" / "MIN" label baseline. With the
    // stepperRow shrunk from 130 → 100 the label sits closer to the
    // colon's natural bottom anyway; 18 keeps the optical alignment
    // without burning extra row height.
    marginBottom: 18,
  },
  colonText: {
    fontSize: 36,
    fontWeight: "700",
    color: "#9CA3AF",
  },
  ampm: {
    marginLeft: 6,
    // 2026-05-22 follow-up #2 — same rationale as `colon.marginBottom`.
    marginBottom: 18,
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
  changeHint: {
    textAlign: "center",
    fontSize: 13,
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
    fontSize: 12,
    color: "#9CA3AF",
  },
  // B2-7 (2026-05-22) — duration chevron stepper. Sits directly
  // under the Window hint; chevrons left/right of a tabular
  // "{N} min" label. Subtle pill background so it reads as an
  // interactive control without competing with the (larger) time
  // stepper above it.
  durationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#F3F4F6",
    borderRadius: 14,
    alignSelf: "center",
  },
  durationArrow: {
    padding: 2,
  },
  durationArrowDisabled: {
    opacity: 0.4,
  },
  durationValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1F2937",
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
    // 2026-05-22 follow-up #2 — paddingTop 12 → 6 and marginTop 8 → 4.
    // The hairline border + the row's intrinsic height already make
    // the action row read as separate from the body; the original
    // spacing was generous. Tightening here is the cheapest way to
    // give the scroll body more room without changing typography.
    paddingTop: 6,
    marginTop: 4,
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
  noRoomBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 20,
    paddingHorizontal: 12,
  },
  noRoomText: {
    flex: 1,
    fontSize: 13,
    color: "#EF4444",
    fontWeight: "600",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: "#991B1B",
    fontWeight: "600",
  },
});
