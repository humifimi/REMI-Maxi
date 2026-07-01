import { useCallback } from "react";
import { useRouter } from "expo-router";
import { haptic } from "@technician/hooks/utility/use-haptics";

/**
 * Canonical job-flow step order. The back arrow on every job/[id]/* screen
 * walks this list in reverse (current step -> previous step) instead of
 * relying on `router.back()`, which exits the stack early when the user
 * arrived via a direct push (WalkInCard, customer-detail "Start Job",
 * order-detail "Start Job", etc.) rather than the full Calendar -> briefing
 * chain.
 *
 * From the first step (briefing) back navigates to the Calendar tab.
 * `complete` is terminal and should not expose a back arrow.
 *
 * `timer`, `payment`, and `debrief` are intentionally omitted from the
 * linear walk-in flow:
 *   - fluids → invoice (timer skipped)
 *   - invoice → complete (payment + debrief skipped)
 * Those routes remain reachable for resume / deep-link / future re-enable.
 */
export const JOB_FLOW_STEPS = [
  "briefing",
  "confirm-vehicle",
  "customer",
  "services",
  "checklist",
  "fluids",
  "invoice",
  "complete",
] as const;

/** Screens kept in the repo but skipped in `JOB_FLOW_STEPS`. */
export const HIDDEN_JOB_FLOW_STEPS = [
  "timer",
  "payment",
  "debrief",
] as const;

export type JobFlowStep = (typeof JOB_FLOW_STEPS)[number];
export type HiddenJobFlowStep = (typeof HIDDEN_JOB_FLOW_STEPS)[number];
export type JobFlowRoute = JobFlowStep | HiddenJobFlowStep;

const HIDDEN_STEP_BACK: Partial<Record<HiddenJobFlowStep, JobFlowStep>> = {
  timer: "fluids",
  payment: "invoice",
  debrief: "invoice",
};

export { HIDDEN_STEP_BACK };

export function useFlowBack(currentStep: JobFlowRoute, jobId: number | string) {
  const router = useRouter();

  return useCallback(() => {
    haptic.selection();

    // The walk-in path uses `id="new"` until the appointment is materialized
    // (typically on the customer step). Navigating to "/job/new/briefing"
    // or "/job/new/customer" would render error states because no
    // appointmentId exists yet, so we always exit to the Calendar tab from
    // any "new" screen — that's the only meaningful "previous step" for an
    // unbooked walk-in.
    if (jobId === "new" || jobId === 0) {
      router.replace("/(tabs)" as never);
      return;
    }

    const idx = JOB_FLOW_STEPS.indexOf(currentStep as JobFlowStep);
    if (idx > 0) {
      const prev = JOB_FLOW_STEPS[idx - 1];
      router.replace(`/job/${jobId}/${prev}` as never);
      return;
    }

    const hiddenBack = HIDDEN_STEP_BACK[currentStep as HiddenJobFlowStep];
    if (hiddenBack) {
      router.replace(`/job/${jobId}/${hiddenBack}` as never);
      return;
    }

    router.replace("/(tabs)" as never);
  }, [currentStep, jobId, router]);
}
