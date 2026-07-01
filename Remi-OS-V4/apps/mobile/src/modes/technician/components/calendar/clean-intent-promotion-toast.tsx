/**
 * `CleanIntentPromotionToast` (PR-UX-20) — auto-promote toast for a
 * single, conflict-free move-chain intent.
 *
 * Mirrors the half-width pinned-popup pattern from
 * `ChainToChainConflictToast` (PR-UX-19): the toast appears on the
 * half of the calendar OPPOSITE the intent's destination so the
 * destination tile stays visible. Reuses `useDynamicPopupSide`
 * directly.
 *
 * UX surface
 * ──────────
 * Visual layout (post 2026-05-10 smoke fix):
 *   The card lives in a half-width wrapper opposite the promoted
 *   intent's destination tile (same `useDynamicPopupSide` math). It
 *   slides UP from the bottom of the screen and anchors to the
 *   bottom of the wrapper — mirroring the AppointmentDetailSheet
 *   bottom-drawer feel rather than a side-slide. The user
 *   explicitly asked for this on 2026-05-10: "have them come up
 *   vertically from the bottom of the screen, like the
 *   AppointmentDetailSheet drawer does." The card auto-sizes to
 *   its content; it does NOT stretch top-to-bottom (an earlier
 *   version did, producing a tall dark slab where only the green
 *   icon was visible — see the pre-fix entry on
 *   docs/PLAN-DEVIATIONS.md).
 *
 * Three primary actions on the visible card:
 *
 *   1. **Apply now** — commits ONLY this one intent via the BE's
 *      `POST /reorganizations/:id/intents/commit-many` endpoint
 *      (FE-CR-1-2, 2026-05-11), passing a single-element id array.
 *      Dirty intents elsewhere in the session are left alone. This
 *      supersedes the prior session-scoped finalize → authorize
 *      sequence, which forced the toast to ONLY surface when the
 *      whole session was already clean.
 *   2. **Remove** — calls `useRemoveReorganizationIntent.mutateAsync`.
 *      Disables the toast actions and shows "Removing…" briefly,
 *      then dismisses on success.
 *   3. **Dismiss** — closes the toast and bumps the per-intent
 *      counter on `useCleanIntentPromotionStore` (rate limit + 2nd-
 *      attempt suppression).
 *
 * **Long-press anywhere on the card** reveals an inline snooze panel
 * with four options (`Snooze for this card`, `Snooze for this
 * session`, `Snooze 1 hour`, `Snooze today`). The panel replaces
 * the action row in-place — a compact bottom-sheet would have been
 * more visually consistent with the appointment-detail UX, but the
 * tight half-width footprint of this popup makes the in-place
 * affordance more reliable on landscape. Tap-outside collapses the
 * panel without committing a snooze; tapping any option dismisses
 * the toast immediately.
 *
 * Auto-dismiss
 * ────────────
 * 8s timer with a visible thin progress bar at the bottom. The
 * timer is suspended while the snooze panel is open or while the
 * Apply / Remove mutations are pending — the user shouldn't lose
 * the toast mid-decision.
 *
 * Post-apply Undo
 * ───────────────
 * On a successful Apply, the toast is replaced by a 6s post-apply
 * confirmation showing "Applied [tech name]'s [time] move" + an
 * Undo button. The Undo strategy is documented inline at
 * `handleUndo` — we capture the pre-apply appointment state at
 * Apply time and dispatch `op:modify_intent` against the appointment
 * to restore it. PLAN-DEVIATION:
 * 2026-05-09-pr-ux-20-undo-via-modify documents the constraints
 * (no `original_state` on `ReorganizationIntent`, no per-intent
 * commit endpoint).
 *
 * Anti-instructions
 * ─────────────────
 *   - Don't show this toast simultaneously with
 *     `ChainToChainConflictToast` — both compete for the same half-
 *     screen real estate. The detection hook's `isSystemWideSuppressed`
 *     will quiet this toast naturally if the user is generating
 *     conflicts; the calendar tab is responsible for not mounting
 *     both toasts in the same render frame for the same conflict
 *     window.
 *   - FE-CR-1-2 (2026-05-11) — the prior anti-instruction "don't
 *     change 'Apply now' to fire against just this one intent — the
 *     BE finalize endpoint is session-scoped" no longer holds. The
 *     BE shipped `POST /reorganizations/:id/intents/commit-many` in
 *     `B-CR-1-2` (REMIBackend, 2026-05-10) and this toast consumes
 *     it directly. The detection hook's "no dirty intents in
 *     session" gate has therefore been relaxed in the sibling
 *     PR-UX-20 review screen handler so Sweep can pick up clean
 *     intents in a mixed session — but the toast still only
 *     promotes the SINGLE clean intent `currentlyPromotingIntent`
 *     points at. PLAN-DEVIATION
 *     `2026-05-09-pr-ux-20-sweep-finalizes-session` is the entry
 *     resolved by this rewire.
 *   - Don't drop the per-intent suppression bump on Dismiss. The
 *     "user dismissed twice → stop pestering" rule is the
 *     load-bearing pacifier for the auto-promote pattern.
 *   - Don't extend the toast's lifetime beyond TOAST_DISMISS_MS by
 *     restarting the timer on every render. The timer is set once
 *     per `(intentId, postApplyShown)` transition and cleared on
 *     unmount or on action.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDynamicPopupSide } from "@technician/hooks/ui/use-dynamic-popup-side";
import {
  useCleanIntentPromotion,
  type UseCleanIntentPromotionResult,
} from "@technician/hooks/schedule/use-clean-intent-promotion";
import {
  CommitBatchIntentNotFoundError,
  CommitBatchRejectedError,
  useCommitIntentsBatch,
  useModifyReorganizationIntent,
  useRemoveReorganizationIntent,
} from "@technician/hooks/schedule/use-reorganization";
import { useCleanIntentPromotionStore } from "@technician/stores/clean-intent-promotion";
import { useCleanIntentSettingsStore } from "@technician/stores/clean-intent-settings";
import { useCleanIntentSnoozeStore } from "@technician/stores/clean-intent-snooze";
import { usePendingRealityStore } from "@technician/stores/pending-reality";
import type { LinterAppointment, LinterWorldSnapshot } from "@technician/utils/logistics-linter";
import type { ReorganizationIntent } from "@technician/types/reorganization";

export const TOAST_DISMISS_MS = 8000;
export const POST_APPLY_DISMISS_MS = 6000;
const SLIDE_IN_MS = 280;
const SLIDE_OUT_MS = 220;
const LONG_PRESS_MS = 400;
// Off-screen distance for the bottom slide-up entry/exit. 320 covers
// the typical card height (header + actions + progress bar) plus a
// margin so the card is fully off-screen at rest.
const SLIDE_OFFSCREEN_Y = 320;

interface CleanIntentPromotionToastProps {
  /**
   * Linter-shape appointment list. Same source the
   * `ChainToChainConflictToast` consumes — see calendar-tab mount
   * for the projection.
   */
  appointments: readonly LinterAppointment[] | undefined;
  /**
   * Optional positioner — given the destination of an intent and
   * the viewport width, returns the X coord of the intent's
   * destination on the calendar canvas, or `null` when geometry
   * isn't resolvable. The toast pins to the OPPOSITE half.
   */
  getIntentDestX?: (
    intent: ReorganizationIntent,
    viewportWidth: number,
  ) => number | null;
  /**
   * World snapshot for the post-success local linter re-run on the
   * Undo `op:modify_intent` PATCH. Same shape `useApplyAutoFix`
   * consumes — pass an empty snapshot if the caller hasn't
   * assembled real world data.
   */
  worldSnapshot: LinterWorldSnapshot;
  /**
   * Lookup `Map<technicianId, technicianName>` for the post-apply
   * "Applied [tech]'s [time]" copy. Sourced from the calendar's
   * existing `useCalendarDisplayLookups` hook on the calendar tab
   * mount.
   */
  technicianNames?: ReadonlyMap<number, string>;
}

interface PostApplyState {
  intent: ReorganizationIntent;
  preApplyDate: string;
  preApplyStartTime: string;
  preApplyEndTime: string;
  preApplyTechnicianId: number | null;
  message: string;
}

export function CleanIntentPromotionToast({
  appointments,
  getIntentDestX,
  worldSnapshot,
  technicianNames,
}: CleanIntentPromotionToastProps) {
  const { currentlyPromotingIntent } = useCleanIntentPromotion({ appointments });

  // Captured at Apply time so an Undo right after the BE round-trip
  // has the original appointment shape. Cleared whenever a new toast
  // surfaces.
  const [postApply, setPostApply] = useState<PostApplyState | null>(null);
  const [snoozeMenuOpen, setSnoozeMenuOpen] = useState(false);

  // FE-CR-1-2 (2026-05-11) — `useCommitIntentsBatch` replaces the
  // prior finalize/authorize pair. The toast commits ONLY the
  // currently-promoting intent's id (single-element array); dirty
  // intents staged elsewhere in the same session are left
  // untouched.
  const commitIntentsBatchMutation = useCommitIntentsBatch();
  const removeMutation = useRemoveReorganizationIntent();
  const modifyMutation = useModifyReorganizationIntent();

  const sessionId = usePendingRealityStore((s) => s.sessionId);

  const recordDismissal = useCleanIntentPromotionStore((s) => s.recordDismissal);
  const snoozeIntentForCard = useCleanIntentSnoozeStore(
    (s) => s.snoozeIntentForCard,
  );
  const snoozeIntentOneHour = useCleanIntentSnoozeStore(
    (s) => s.snoozeIntentOneHour,
  );
  const snoozeIntentToday = useCleanIntentSnoozeStore(
    (s) => s.snoozeIntentToday,
  );
  const snoozeForSession = useCleanIntentSnoozeStore((s) => s.snoozeForSession);
  const confirmBeforeApplying = useCleanIntentSettingsStore(
    (s) => s.confirmBeforeApplyingCleanMoves,
  );

  // Reset the snooze panel + post-apply state when the promoted
  // intent changes. Without this, a snooze panel left open for
  // intent A would still be visible when intent B started promoting.
  const promotingIntentId = currentlyPromotingIntent?.id ?? null;
  const previousPromotingIntentIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (previousPromotingIntentIdRef.current !== promotingIntentId) {
      previousPromotingIntentIdRef.current = promotingIntentId;
      setSnoozeMenuOpen(false);
      // The post-apply confirmation has its own lifetime; don't
      // wipe it just because the underlying promoted intent
      // changed (it might have changed AS A RESULT of the apply).
    }
  }, [promotingIntentId]);

  // The toast is visible when there's either an active promotion
  // OR a post-apply confirmation in flight.
  const visibleIntent =
    postApply?.intent ?? currentlyPromotingIntent ?? null;

  // ── Geometry / dynamic side positioning ─────────────────────────
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const intentX = useMemo<number | null>(() => {
    if (!visibleIntent) return null;
    if (!getIntentDestX) return null;
    const x = getIntentDestX(visibleIntent, windowWidth);
    return typeof x === "number" && Number.isFinite(x) ? x : null;
  }, [visibleIntent, getIntentDestX, windowWidth]);

  // 2026-05-10 user fix: `popupWidth` is no longer used (card uses
  // `translateY` instead of `translateX` for entry/exit). Pull
  // only the values we actually consume.
  const { side, wrapperStyle } = useDynamicPopupSide({
    conflictX: intentX,
    viewportWidth: windowWidth,
  });

  // ── Slide-up-from-bottom animation ──────────────────────────────
  // 2026-05-10 smoke fix: switched from `translateX` (side-slide) to
  // `translateY` (bottom-up slide) so the toast feels like a drawer
  // rising over the calendar canvas rather than a banner sliding in
  // from the edge. Matches the AppointmentDetailSheet pattern the
  // user explicitly compared us against.
  const translateY = useSharedValue(SLIDE_OFFSCREEN_Y);
  const opacity = useSharedValue(0);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressShared = useSharedValue(0); // 0 → 1 over the active dismiss window

  // Pause / resume the dismiss countdown on user interaction.
  const pauseTimer = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  }, []);

  const onClose = useCallback(() => {
    pauseTimer();
    setPostApply(null);
    setSnoozeMenuOpen(false);
  }, [pauseTimer]);

  // Drive the entry / exit animation against the visible-intent
  // lifecycle. The card slides up from below and fades in on
  // appear, slides back down and fades out on dismiss. `side` is
  // kept in the dep array so a rotation that flips the wrapper to
  // the other half re-asserts the at-rest position even if a
  // dismiss animation was mid-flight.
  useEffect(() => {
    if (visibleIntent) {
      translateY.value = SLIDE_OFFSCREEN_Y;
      opacity.value = 0;
      translateY.value = withTiming(0, {
        duration: SLIDE_IN_MS,
        easing: Easing.out(Easing.cubic),
      });
      opacity.value = withTiming(1, { duration: SLIDE_IN_MS });
    } else {
      translateY.value = withTiming(SLIDE_OFFSCREEN_Y, {
        duration: SLIDE_OUT_MS,
        easing: Easing.in(Easing.cubic),
      });
      opacity.value = withTiming(0, { duration: SLIDE_OUT_MS });
    }
  }, [visibleIntent, side, opacity, translateY]);

  // Auto-dismiss timer. One timer per `(visibleIntent, postApply,
  // snoozeMenuOpen)` cell. The `pending-mutation` clauses suspend
  // the timer so a slow Apply / Remove network round-trip doesn't
  // race with the auto-close.
  const isPending =
    commitIntentsBatchMutation.isPending ||
    removeMutation.isPending ||
    modifyMutation.isPending;
  useEffect(() => {
    if (!visibleIntent) {
      pauseTimer();
      return;
    }
    if (snoozeMenuOpen || isPending) {
      pauseTimer();
      return;
    }
    const duration = postApply ? POST_APPLY_DISMISS_MS : TOAST_DISMISS_MS;
    progressShared.value = 0;
    progressShared.value = withTiming(1, {
      duration,
      easing: Easing.linear,
    });
    pauseTimer();
    dismissTimer.current = setTimeout(() => {
      if (__DEV__) {
        console.log("[CleanIntentPromotion] auto-dismiss", {
          intentId: visibleIntent.id,
          phase: postApply ? "post-apply" : "promotion",
        });
      }
      // Auto-dismiss does NOT count as a user dismissal — the
      // suppression rule is keyed on explicit user choice only.
      onClose();
    }, duration);
    return () => {
      pauseTimer();
    };
  }, [
    visibleIntent,
    postApply,
    snoozeMenuOpen,
    isPending,
    pauseTimer,
    onClose,
    progressShared,
  ]);

  // ── Action handlers ─────────────────────────────────────────────
  const handleApply = useCallback(() => {
    if (!currentlyPromotingIntent || sessionId == null) return;
    if (postApply) return; // Already applied — Undo is the next step.
    const intent = currentlyPromotingIntent;

    const dispatchApply = () => {
      // Capture pre-apply appointment state for the Undo path.
      // PLAN-DEVIATION 2026-05-09-pr-ux-20-undo-via-modify — the
      // intent type doesn't carry an `original_state` field, and
      // `inverse_payload` is null on FE-staged intents. We snapshot
      // from the intent's payload (the staged destination) plus
      // the appointment row for the source — the Undo flow then
      // dispatches `op:modify_intent` against the (now committed)
      // appointment to restore. If the appointment isn't found in
      // the supplied appointments list (e.g. cross-day promotion
      // when the toast lives on a single-day view), the Undo
      // falls back to a transient alert.
      //
      // NOTE: the Undo path itself ships its proper batch-Undo in
      // `FE-CR-UX-20-UNDO` (sibling chunk) — that chunk replaces
      // the modify-intent-back-to-source approximation with a true
      // reverse-intent commit. This handler intentionally stays
      // compatible with the existing PR-UX-20 Undo flow until that
      // chunk lands.
      const apptId = intent.appointment_id;
      const sourceAppt = apptId == null
        ? null
        : appointments?.find((a) => a.id === apptId) ?? null;
      const techName =
        intent.payload.kind === "reschedule" && intent.payload.new_technician_id != null
          ? technicianNames?.get(intent.payload.new_technician_id)
          : intent.payload.kind === "reassign"
            ? technicianNames?.get(intent.payload.new_technician_id)
            : sourceAppt != null
              ? technicianNames?.get(sourceAppt.technician_id ?? -1)
              : undefined;
      const timeLabel = (() => {
        if (intent.payload.kind === "reschedule") {
          return `${intent.payload.new_scheduled_date} ${intent.payload.new_start_time}`;
        }
        if (intent.payload.kind === "reassign") {
          return sourceAppt?.scheduled_start_time ?? "move";
        }
        return "move";
      })();
      const prePayload: PostApplyState = {
        intent,
        preApplyDate: sourceAppt?.scheduled_date ?? "",
        preApplyStartTime: sourceAppt?.scheduled_start_time ?? "",
        preApplyEndTime: sourceAppt?.scheduled_end_time ?? "",
        preApplyTechnicianId: sourceAppt?.technician_id ?? null,
        message: `Applied ${techName ?? "the move"}'s ${timeLabel} move`,
      };

      // FE-CR-1-2 (2026-05-11): Apply now → POST /:id/intents/commit-many
      // with a single-element id array. The BE commits just this
      // intent; dirty intents elsewhere in the session stay staged.
      commitIntentsBatchMutation.mutate(
        { sessionId, intentIds: [intent.id] },
        {
          onSuccess: () => {
            setPostApply(prePayload);
          },
          onError: (err) => {
            if (err instanceof CommitBatchRejectedError) {
              // 409 INTENT_HAS_CONFLICTS — the server-side linter
              // caught a conflict the local detector missed (FE-
              // CR-1-1 is the longer-term fix here; for now, point
              // the user at the review screen where the issues
              // surface inline).
              Alert.alert(
                "Couldn't apply",
                "The server-side linter caught a conflict. Open the review screen for details.",
              );
              return;
            }
            if (err instanceof CommitBatchIntentNotFoundError) {
              // 404 INTENT_NOT_FOUND — the intent was removed or
              // committed by another actor between toast surface
              // and tap. Dismiss silently; the realtime store
              // refresh will hide the toast on the next render.
              Alert.alert(
                "Couldn't apply",
                "This move is no longer available.",
              );
              onClose();
              return;
            }
            Alert.alert(
              "Couldn't apply",
              "Something went wrong reaching the server. Try again in a moment.",
            );
          },
        },
      );
    };

    if (confirmBeforeApplying) {
      Alert.alert(
        "Apply this clean move?",
        "This commits the staged change to the calendar.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Apply", onPress: dispatchApply },
        ],
      );
      return;
    }
    dispatchApply();
  }, [
    currentlyPromotingIntent,
    sessionId,
    postApply,
    appointments,
    technicianNames,
    confirmBeforeApplying,
    commitIntentsBatchMutation,
    onClose,
  ]);

  const handleRemove = useCallback(() => {
    if (!currentlyPromotingIntent || sessionId == null) return;
    if (postApply) return;
    const intent = currentlyPromotingIntent;
    removeMutation.mutate(
      { sessionId, intentId: intent.id, worldSnapshot },
      {
        onSuccess: () => {
          onClose();
        },
        onError: () => {
          Alert.alert(
            "Couldn't remove",
            "Something went wrong reaching the server. Try again in a moment.",
          );
        },
      },
    );
  }, [
    currentlyPromotingIntent,
    sessionId,
    postApply,
    worldSnapshot,
    removeMutation,
    onClose,
  ]);

  const handleDismiss = useCallback(() => {
    if (!currentlyPromotingIntent) return;
    recordDismissal(currentlyPromotingIntent.id);
    onClose();
  }, [currentlyPromotingIntent, recordDismissal, onClose]);

  const handleUndo = useCallback(() => {
    if (!postApply) return;
    if (sessionId == null) {
      // Session has been cleared post-finalize. The Undo cannot
      // dispatch through the reorganization endpoint anymore —
      // surface a friendly alert and dismiss.
      Alert.alert(
        "Undo unavailable",
        "The session that committed this change has been cleared. Use the calendar to reschedule.",
      );
      onClose();
      return;
    }
    const { intent, preApplyDate, preApplyStartTime, preApplyEndTime } = postApply;
    if (!preApplyDate || !preApplyStartTime || !preApplyEndTime) {
      Alert.alert(
        "Undo unavailable",
        "Couldn't recover the previous state of this appointment.",
      );
      onClose();
      return;
    }
    // PLAN-DEVIATION 2026-05-09-pr-ux-20-undo-via-modify — Undo
    // dispatches `op:modify_intent` to put the appointment back to
    // its source slot. The mutation hook handles the
    // session+intents state update on success; on error we surface
    // a transient alert and leave the calendar where the apply
    // left it.
    modifyMutation.mutate(
      {
        sessionId,
        intentId: intent.id,
        intent: {
          kind: "reschedule",
          new_scheduled_date: preApplyDate,
          new_start_time: preApplyStartTime,
          new_end_time: preApplyEndTime,
        },
        worldSnapshot,
      },
      {
        onSuccess: () => {
          onClose();
        },
        onError: () => {
          Alert.alert(
            "Couldn't undo",
            "Something went wrong reaching the server. The change is still committed.",
          );
        },
      },
    );
  }, [postApply, sessionId, modifyMutation, worldSnapshot, onClose]);

  // ── Snooze menu handlers ────────────────────────────────────────
  const closeSnoozeMenu = useCallback(() => {
    setSnoozeMenuOpen(false);
  }, []);
  const handleSnoozeForCard = useCallback(() => {
    if (!currentlyPromotingIntent) return;
    snoozeIntentForCard(currentlyPromotingIntent.id);
    closeSnoozeMenu();
    onClose();
  }, [currentlyPromotingIntent, snoozeIntentForCard, closeSnoozeMenu, onClose]);
  const handleSnoozeForSession = useCallback(() => {
    snoozeForSession();
    closeSnoozeMenu();
    onClose();
  }, [snoozeForSession, closeSnoozeMenu, onClose]);
  const handleSnoozeOneHour = useCallback(() => {
    if (!currentlyPromotingIntent) return;
    snoozeIntentOneHour(currentlyPromotingIntent.id);
    closeSnoozeMenu();
    onClose();
  }, [currentlyPromotingIntent, snoozeIntentOneHour, closeSnoozeMenu, onClose]);
  const handleSnoozeToday = useCallback(() => {
    if (!currentlyPromotingIntent) return;
    snoozeIntentToday(currentlyPromotingIntent.id);
    closeSnoozeMenu();
    onClose();
  }, [currentlyPromotingIntent, snoozeIntentToday, closeSnoozeMenu, onClose]);

  // ── Tap-outside ─────────────────────────────────────────────────
  // For the promotion phase, tap-outside dismisses + counts as a
  // user dismissal. For the post-apply phase, tap-outside silently
  // closes — the user has already made the apply choice.
  const handleBackdropPress = useCallback(() => {
    if (postApply) {
      onClose();
      return;
    }
    handleDismiss();
  }, [postApply, onClose, handleDismiss]);

  // ── Animated styles ─────────────────────────────────────────────
  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
  const progressBarStyle = useAnimatedStyle(() => ({
    width: `${Math.min(100, Math.max(0, progressShared.value * 100))}%`,
  }));

  if (!visibleIntent) return null;

  // Wrapper geometry — same fallback shape as the chain-to-chain
  // toast for the no-x case.
  const fallbackWrapper: import("react-native").ViewStyle = {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: insets.right,
    width: Math.max(Math.round(windowWidth * 0.5) - insets.right, 200),
  };
  const resolvedWrapperStyle = wrapperStyle ?? fallbackWrapper;
  // The card anchors to the BOTTOM of the half-width wrapper and
  // auto-sizes to its content (no top stretch). Bottom inset keeps
  // it clear of the home indicator on iPhone X+ devices.
  const bottomInset = insets.bottom + 12;

  // Pre-resolved labels for the active phase. The post-apply phase
  // uses the captured `postApply.message`; the promotion phase
  // builds a "Move [tech]'s [time]?" headline from the same lookup
  // sources.
  //
  // Smoke-fix 2026-05-10: the user reported "I see a new popup or
  // button next to the Show All button, but I don't know what it's
  // supposed to be." Adding an eyebrow LABEL above the headline
  // ("SUGGESTED MOVE" / "MOVE APPLIED") so the toast announces its
  // identity on sight — matches the `ChainToChainConflictToast`
  // pattern where the title doubles as the toast's name (e.g.
  // "Pending chain conflict"). The existing `auto-awesome` sparkle
  // icon continues to do its job as the visual anchor.
  const eyebrow = postApply ? "Move applied" : "Suggested move";
  const headline = postApply ? postApply.message : "Looks safe to apply";
  const subhead = postApply
    ? "Tap Undo to revert."
    : describeIntent(visibleIntent, appointments, technicianNames);

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      testID="clean-intent-promotion-toast"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss clean-intent suggestion"
        onPress={handleBackdropPress}
        style={[
          styles.backdrop,
          side === "left"
            ? { left: 0, right: undefined, width: "50%" }
            : { right: 0, left: undefined, width: "50%" },
        ]}
      />
      <View style={resolvedWrapperStyle} pointerEvents="box-none">
        <Pressable
          // Long-press to reveal the snooze panel. `onPress` is a
          // no-op here — actions live on the explicit buttons.
          onLongPress={() => {
            if (postApply) return;
            if (__DEV__) {
              console.log("[CleanIntentPromotion] long-press → snooze menu");
            }
            setSnoozeMenuOpen(true);
          }}
          delayLongPress={LONG_PRESS_MS}
          accessibilityRole="alert"
          accessibilityLabel={postApply ? "Applied — undo available" : "Clean move suggestion"}
        >
          <Animated.View
            style={[
              styles.card,
              { bottom: bottomInset },
              cardStyle,
            ]}
          >
            <View style={styles.iconWrap}>
              <MaterialIcons
                name={postApply ? "check-circle" : "auto-awesome"}
                size={22}
                color="#fff"
              />
            </View>
            <View style={styles.content}>
              <Text
                style={styles.eyebrow}
                testID="clean-intent-toast-eyebrow"
                accessibilityRole="text"
              >
                {eyebrow}
              </Text>
              <Text style={styles.title} testID="clean-intent-toast-headline">
                {headline}
              </Text>
              <Text style={styles.detail}>{subhead}</Text>
              {snoozeMenuOpen ? (
                <SnoozeMenu
                  onSnoozeForCard={handleSnoozeForCard}
                  onSnoozeForSession={handleSnoozeForSession}
                  onSnoozeOneHour={handleSnoozeOneHour}
                  onSnoozeToday={handleSnoozeToday}
                  onCancel={closeSnoozeMenu}
                />
              ) : postApply ? (
                <View style={styles.actionsRow}>
                  <Pressable
                    onPress={handleUndo}
                    accessibilityRole="button"
                    testID="clean-intent-toast-undo"
                    style={({ pressed }) => [
                      styles.btnPrimary,
                      pressed && styles.btnPressed,
                    ]}
                  >
                    <Text style={styles.btnPrimaryText}>Undo</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.actionsRow}>
                  <Pressable
                    onPress={handleApply}
                    disabled={isPending}
                    accessibilityRole="button"
                    testID="clean-intent-toast-apply"
                    style={({ pressed }) => [
                      styles.btnPrimary,
                      isPending && styles.btnDisabled,
                      pressed && styles.btnPressed,
                    ]}
                  >
                    <Text style={styles.btnPrimaryText}>
                      {commitIntentsBatchMutation.isPending
                        ? "Applying…"
                        : "Apply now"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleRemove}
                    disabled={isPending}
                    accessibilityRole="button"
                    testID="clean-intent-toast-remove"
                    style={({ pressed }) => [
                      styles.btnSecondary,
                      isPending && styles.btnDisabled,
                      pressed && styles.btnPressed,
                    ]}
                  >
                    <Text style={styles.btnSecondaryText}>
                      {removeMutation.isPending ? "Removing…" : "Remove"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleDismiss}
                    disabled={isPending}
                    accessibilityRole="button"
                    testID="clean-intent-toast-dismiss"
                    style={({ pressed }) => [
                      styles.btnGhost,
                      isPending && styles.btnDisabled,
                      pressed && styles.btnPressed,
                    ]}
                  >
                    <Text style={styles.btnGhostText}>Dismiss</Text>
                  </Pressable>
                </View>
              )}
            </View>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, progressBarStyle]} />
            </View>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

interface SnoozeMenuProps {
  onSnoozeForCard: () => void;
  onSnoozeForSession: () => void;
  onSnoozeOneHour: () => void;
  onSnoozeToday: () => void;
  onCancel: () => void;
}

function SnoozeMenu({
  onSnoozeForCard,
  onSnoozeForSession,
  onSnoozeOneHour,
  onSnoozeToday,
  onCancel,
}: SnoozeMenuProps) {
  return (
    <View style={styles.snoozeMenu} testID="clean-intent-toast-snooze-menu">
      <Text style={styles.snoozeMenuHeading}>Snooze suggestion</Text>
      <Pressable
        onPress={onSnoozeForCard}
        accessibilityRole="button"
        testID="clean-intent-toast-snooze-card"
        style={({ pressed }) => [styles.snoozeRow, pressed && styles.btnPressed]}
      >
        <Text style={styles.snoozeRowText}>Snooze for this card (24h)</Text>
      </Pressable>
      <Pressable
        onPress={onSnoozeForSession}
        accessibilityRole="button"
        testID="clean-intent-toast-snooze-session"
        style={({ pressed }) => [styles.snoozeRow, pressed && styles.btnPressed]}
      >
        <Text style={styles.snoozeRowText}>Snooze for this session</Text>
      </Pressable>
      <Pressable
        onPress={onSnoozeOneHour}
        accessibilityRole="button"
        testID="clean-intent-toast-snooze-hour"
        style={({ pressed }) => [styles.snoozeRow, pressed && styles.btnPressed]}
      >
        <Text style={styles.snoozeRowText}>Snooze 1 hour</Text>
      </Pressable>
      <Pressable
        onPress={onSnoozeToday}
        accessibilityRole="button"
        testID="clean-intent-toast-snooze-today"
        style={({ pressed }) => [styles.snoozeRow, pressed && styles.btnPressed]}
      >
        <Text style={styles.snoozeRowText}>Snooze today</Text>
      </Pressable>
      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        testID="clean-intent-toast-snooze-cancel"
        style={({ pressed }) => [styles.snoozeRow, pressed && styles.btnPressed]}
      >
        <Text style={[styles.snoozeRowText, styles.snoozeCancelText]}>Cancel</Text>
      </Pressable>
    </View>
  );
}

/**
 * Build a short human-readable description of where the intent
 * wants to land. Used on the promotion phase as the toast subhead.
 * Pure — no store reads.
 */
function describeIntent(
  intent: ReorganizationIntent,
  appointments: readonly LinterAppointment[] | undefined,
  technicianNames: ReadonlyMap<number, string> | undefined,
): string {
  const sourceAppt =
    intent.appointment_id != null && appointments
      ? appointments.find((a) => a.id === intent.appointment_id) ?? null
      : null;
  if (intent.payload.kind === "reschedule") {
    const techId =
      intent.payload.new_technician_id ?? sourceAppt?.technician_id ?? null;
    const techLabel =
      techId != null && technicianNames?.get(techId)
        ? technicianNames.get(techId)
        : techId != null
          ? `Tech #${techId}`
          : "the technician";
    return `Move ${techLabel} to ${intent.payload.new_scheduled_date} ${intent.payload.new_start_time}`;
  }
  if (intent.payload.kind === "reassign") {
    const techLabel =
      technicianNames?.get(intent.payload.new_technician_id) ??
      `Tech #${intent.payload.new_technician_id}`;
    return `Reassign to ${techLabel}`;
  }
  return "Apply this staged change";
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: "transparent",
  },
  // 2026-05-10 smoke fix: card pinned to the BOTTOM of the
  // half-width wrapper and auto-sized to its content. Pre-fix the
  // card stretched top-to-bottom (`top: topInset, bottom: bottomInset`
  // both set), producing a tall dark slab where only the green
  // icon was visible — the user reported "STILL LOOKS BAD. It's
  // like there is something inside of it, but I can't see what it
  // is." The bottom-anchored card auto-sizes to icon + headline +
  // actions + progress bar, and slides up from below
  // (`translateY` animation) so it reads as a drawer rather than a
  // banner.
  card: {
    position: "absolute",
    left: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    borderRadius: 16,
    backgroundColor: "#0F172A",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
    overflow: "hidden",
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#22C55E",
    flexShrink: 0,
  },
  content: { flex: 1, minWidth: 0 },
  eyebrow: {
    color: "#86EFAC",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  title: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  detail: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "500",
    marginTop: 4,
    lineHeight: 18,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
    gap: 8,
    alignItems: "center",
  },
  btnPrimary: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#22C55E",
  },
  btnPrimaryText: {
    color: "#04220E",
    fontSize: 13,
    fontWeight: "700",
  },
  btnSecondary: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(248, 113, 113, 0.18)",
    borderWidth: 1,
    borderColor: "#F87171",
  },
  btnSecondaryText: {
    color: "#FCA5A5",
    fontSize: 13,
    fontWeight: "700",
  },
  btnGhost: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  btnGhostText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
  },
  btnPressed: { opacity: 0.7 },
  btnDisabled: { opacity: 0.5 },
  progressTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  progressFill: {
    height: 3,
    backgroundColor: "rgba(34,197,94,0.8)",
  },
  snoozeMenu: {
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    paddingVertical: 4,
  },
  snoozeMenuHeading: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  snoozeRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  snoozeRowText: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "600",
  },
  snoozeCancelText: {
    color: "#94A3B8",
  },
});

// Type-only re-export so consumers writing toast tests can import
// the result shape without pulling in the stores.
export type { UseCleanIntentPromotionResult };
