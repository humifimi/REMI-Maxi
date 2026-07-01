import { useActiveTimerStore } from "@technician/stores/active-timer";

/**
 * PLAN-DEVIATION: 2026-04-26-active-job-blocker — see docs/PLAN-DEVIATIONS.md.
 *
 * Used by every "Start Job" entry point to prevent the technician from kicking
 * off a *new* appointment when one is already in flight. Without this:
 *   - Tapping "Start Job" on the Customers tab / Customer detail / Order detail
 *     re-enters the walk-in flow and `createWalkIn.mutate` fans out a fresh
 *     `appointments` row each time the technician backs out and taps again.
 *     This is exactly the duplication symptom reported on 2026-04-26 ("the
 *     contact is getting duplicated every time I start a new job").
 *   - The button label stays as "Start Job" even though the only sensible UX
 *     while a timer is running is to *resume* the active job.
 *
 * The hook reads the in-memory `useActiveTimerStore` (the same source of truth
 * that powers the timer hero card on `/job/[id]/timer`). Cross-session safety
 * still comes from `app/job/[id]/briefing.tsx` redirecting in_progress jobs
 * straight to `/timer` — see `2026-04-26-briefing-resume-redirect`.
 */
export interface ActiveJobBlocker {
  /**
   * True when there is a running timer the user should be routed back to
   * instead of starting a new job flow.
   */
  isActive: boolean;
  /** Appointment ID of the active job, or null when nothing is running. */
  activeJobId: number | null;
  /**
   * Pre-built deep link for the active timer screen. Empty string when
   * inactive so callers can pass it to `router.push` only after checking
   * `isActive`.
   */
  resumeRoute: string;
  /** UI label to show on the calling button. */
  label: "Start Job" | "Resume Job";
}

export function useActiveJobBlocker(): ActiveJobBlocker {
  const jobId = useActiveTimerStore((s) => s.jobId);
  const isRunning = useActiveTimerStore((s) => s.isRunning);

  const isActive = isRunning && jobId !== null;

  return {
    isActive,
    activeJobId: isActive ? jobId : null,
    resumeRoute: isActive ? `/job/${jobId}/timer` : "",
    label: isActive ? "Resume Job" : "Start Job",
  };
}
