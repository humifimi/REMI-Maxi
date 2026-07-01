/**
 * `useCrossCardCollisionToastStore` — transient "your apply-anyway
 * just put a pending move into conflict with the live calendar"
 * notice.
 *
 * PLAN-DEVIATION: 2026-05-12-pending-move-overlap-soft-framing —
 * paired companion to the linter intercept sheet's softer
 * pending-move framing. When a user resolves a staged-intent
 * overlap by tapping "Apply anyway", the live-commit lands their
 * dragged card on the committed calendar, but the OTHER intent in
 * the session — the one whose pending destination overlapped — is
 * now in conflict with the committed world. This toast fires after
 * that live-commit to surface the consequence with a one-tap path
 * to either drop or adjust the now-conflicting intent.
 *
 * Why a store and not a return value:
 *   The trigger fires inside `useSessionAwareSubmit` (deep in the
 *   submit pipeline) and the toast renders at the calendar tab
 *   level. A store gives us a one-line trigger surface
 *   (`useCrossCardCollisionToastStore.getState().present(info)`)
 *   without threading callbacks through the submit-hook → drag
 *   handler → tab layout chain. Mirrors the rotate-back-toast
 *   pattern shipped 2026-04-24.
 *
 * Why not auto-resolve the conflict:
 *   The user might WANT to keep the conflicting intent (e.g. they
 *   plan to fine-tune times via resize, or both cards belong in
 *   that time band by design). Stay non-blocking; nudge, don't
 *   coerce. The path to the review screen lets them choose: drop,
 *   modify, or finalize as-is.
 *
 * See docs/PLAN-DEVIATIONS.md#2026-05-12-pending-move-overlap-soft-framing.
 */

import { create } from "zustand";

/**
 * Description of a single conflicting intent for the toast body.
 * Built by `useSessionAwareSubmit` from the live linter output;
 * the toast renders one entry per intent so two cross-card
 * collisions land on one toast rather than stacking.
 */
export interface CrossCardCollisionEntry {
  /** Intent id on the other card whose pending destination now
   * overlaps the just-committed slot. */
  intentId: number;
  /** Wire-format appointment id the intent targets. Used to
   * dedupe entries when re-presenting (a noisy session with many
   * drags should coalesce, not flood). */
  appointmentId: number | null;
  /**
   * Pre-built human label — built at the call site so the toast
   * doesn't need to reach into customer / technician lookups
   * (those live on the calendar tab). Format examples:
   *   - "Daniel Kim's 10:10 AM move on Mon May 11"
   *   - "Tech #5's 2:00 PM move on Tue May 12"
   *   - "Pending move on Tue May 12" (no resolvable names)
   */
  label: string;
}

export interface CrossCardCollisionInfo {
  /**
   * Short human label naming the JUST-COMMITTED card, used in the
   * toast lead-in (e.g. "Moved Ava Smith to 9:45 AM"). Built by
   * the caller for the same reason as `entries[i].label`.
   */
  committedLabel: string;
  /** One entry per still-pending intent that now overlaps the
   * committed slot. Always at least one — the caller skips the
   * present(...) call if the conflict list is empty. */
  entries: readonly CrossCardCollisionEntry[];
}

interface CrossCardCollisionToastState {
  /** Active toast payload, or null when no toast is visible. */
  info: CrossCardCollisionInfo | null;
  /** Show / replace the toast. Idempotent — calling it again
   * while a toast is visible replaces the payload (last-write-wins);
   * the auto-dismiss timer restarts on the new payload. */
  present: (info: CrossCardCollisionInfo) => void;
  /** Hide the toast. Called by the auto-dismiss timer, on tap-out,
   * on user action (Adjust pending / Dismiss), or by the producer
   * when the conflict resolves before the user reacts. */
  dismiss: () => void;
}

export const useCrossCardCollisionToastStore =
  create<CrossCardCollisionToastState>((set) => ({
    info: null,
    present: (info) => {
      if (__DEV__) {
        console.log("[CAL:crossCardCollisionToast] present", {
          committedLabel: info.committedLabel,
          entryCount: info.entries.length,
          intentIds: info.entries.map((e) => e.intentId),
        });
      }
      set({ info });
    },
    dismiss: () => {
      if (__DEV__) console.log("[CAL:crossCardCollisionToast] dismiss");
      set({ info: null });
    },
  }));
