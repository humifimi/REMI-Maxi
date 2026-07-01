// Observability layer for job-flow mutation failures (note saves,
// part-add, etc.). Mirrors `sentry-diagnostics.ts` in shape: structured
// tags + extras so Sentry saved searches and alerts can filter on
// `job.mutation`, `job.status_code`, and `job.role` without us having
// to thread the values through every call site.
//
// Why this exists: prior to 2026-05-24, `app/job/[id]/timer.tsx`
// caught mutation errors and showed a generic "Could not save note.
// Try again." Alert with no Sentry capture and no surfacing of the
// actual server message (auth failure, 404 on a missing migration,
// network timeout — all looked identical to the technician). The
// next failure is now a one-click triage in Sentry.
//
// Use one `captureJobMutationFailure` call per terminal failure of a
// job mutation. Pair with `extractApiErrorMessage` to pull the BE's
// human-readable error string out of the axios error envelope so the
// user-facing alert can show "Not authorized to add notes to this
// appointment" instead of a static "Try again."

import * as Sentry from "@sentry/react-native";
import type { AxiosError } from "axios";
import type { ApiResponse } from "@technician/types/api";

/**
 * Discrete mutation kinds, kept as a string-literal union so Sentry's
 * tag-based search treats each as a filterable value. Add a new
 * member when wiring a new mutation through this helper — don't
 * pass arbitrary strings.
 */
export type JobMutationKind = "add-note" | "add-part";

interface CaptureJobMutationFailureArgs {
  mutation: JobMutationKind;
  /** Defined for any mutation scoped to a single appointment. */
  appointmentId?: number;
  /** Actor's role (technician vs franchise_owner) — useful to know
   * whether 403s are coming from one role disproportionately. */
  role?: string;
  /** The error thrown by the mutation. Almost always an `AxiosError`,
   * but we accept `unknown` to avoid forcing type assertions at every
   * call site. */
  error: unknown;
  /** Optional free-form extras (e.g., the part name we tried to add)
   * that show up in the Sentry event detail view. */
  extras?: Record<string, unknown>;
}

/**
 * Capture a structured Sentry event for a failed job mutation.
 * Heavier than a breadcrumb — emits a discrete event so saved
 * searches and alerts trigger.
 */
export function captureJobMutationFailure({
  mutation,
  appointmentId,
  role,
  error,
  extras,
}: CaptureJobMutationFailureArgs): void {
  const axiosError = isAxiosErrorWithEnvelope(error) ? error : null;
  const statusCode = axiosError?.response?.status;
  const responseBody = axiosError?.response?.data ?? null;
  const responseMessage = responseBody?.message ?? null;

  Sentry.withScope((scope) => {
    scope.setLevel(statusCode && statusCode >= 500 ? "error" : "warning");
    scope.setTag("job.mutation", mutation);
    if (appointmentId !== undefined) {
      scope.setTag("job.appointment_id", String(appointmentId));
    }
    if (role) {
      scope.setTag("job.role", role);
    }
    if (statusCode !== undefined) {
      scope.setTag("job.status_code", String(statusCode));
    }
    scope.setExtras({
      response_body: responseBody,
      response_message: responseMessage,
      error_message: error instanceof Error ? error.message : String(error),
      ...(extras ?? {}),
    });
    Sentry.captureMessage(`job:mutation_failure ${mutation}`);
  });
}

/**
 * Pull a human-readable error string out of an axios error response.
 * Falls back to the error's own `.message` (e.g., "Network Error",
 * "timeout of 15000ms exceeded") and finally to `fallback` so the
 * UI alert is never empty.
 */
export function extractApiErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (isAxiosErrorWithEnvelope(error)) {
    const message = error.response?.data?.message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function isAxiosErrorWithEnvelope(
  error: unknown,
): error is AxiosError<ApiResponse<unknown>> {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { isAxiosError?: unknown };
  return candidate.isAxiosError === true;
}
