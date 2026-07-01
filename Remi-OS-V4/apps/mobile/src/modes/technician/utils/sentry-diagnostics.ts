// Production-grade observability layer for the move/drag pipeline
// and other high-value flows. Centralizes the Sentry tag/extra
// shape so callers stay terse and grep-friendly.
//
// Why a helper module instead of inline `Sentry.captureMessage`:
// - Single source of truth for tag names → trivial to write Sentry
//   alerts and saved searches against (`outcome:dismissed`,
//   `linter_decision:intercept`, `view_mode:week-portrait`, etc.).
// - Forces structured shape (no free-text titles) so issues group
//   by `move_outcome` correctly instead of fragmenting per render.
// - Easy to no-op or sample if event volume becomes a concern
//   later without chasing call sites.
//
// Conventions:
// - One `captureMoveOutcome` call PER terminal outcome of a move
//   submit. The four outcomes mirror `SubmitOutcome` in
//   `useSessionAwareSubmit`: live-committed, applied-anyway,
//   staged, dismissed. The level escalates: info for success,
//   warning for the user-visible "snap back" (dismissed), error
//   for unexpected exceptions.
// - Breadcrumbs (auto-captured from `console.log`) carry the
//   verbose decision-tree context. The captured message is the
//   anchor event; breadcrumbs are the trail that led to it.

import * as Sentry from "@sentry/react-native";

/**
 * Terminal outcomes of a move/drag submit. Mirrors `SubmitOutcome`
 * in `useSessionAwareSubmit`. Kept as a string-literal union so
 * Sentry's tag-based search treats each outcome as a discrete
 * filterable value.
 */
export type MoveOutcome =
  | "live-committed"
  | "applied-anyway"
  | "staged"
  | "dismissed"
  | "errored";

/**
 * Source of the submit. Drag = user dragged a card on the calendar
 * canvas; sheet = user filled out a form sheet (e.g., Reschedule
 * sheet). Drag is the high-traffic path and where the snap-back
 * bug lives; sheet is included so we can correlate.
 */
export type MoveSource = "drag" | "sheet" | "unknown";

/**
 * Linter decision the wrapper made BEFORE asking the user. `clean`
 * means scoped issues was zero → live-commit. `intercept` means the
 * intercept sheet opened. `errored` means the linter itself threw
 * (defensive, falls back to live-commit per the existing code).
 */
export type LinterDecision = "clean" | "intercept" | "errored";

export interface MoveOutcomeContext {
  outcome: MoveOutcome;
  source: MoveSource;
  intentType: string;
  /** True when the dragged card already had a staged intent (re-stage path). */
  isRestage: boolean;
  linterDecision: LinterDecision;
  /** Total raw issues from the linter, before strictness filter. */
  rawIssueCount: number;
  /** Issues remaining after strictness + scope filtering — what the sheet would show. */
  scopedIssueCount: number;
  /** Active reorganization session id, or null if no session yet. */
  sessionId: number | null;
  /** Active calendar view mode at submit time, e.g. "day", "week-portrait". */
  viewMode: string | null;
  /** Target appointment / personal-event ids (for trace-to-record correlation). */
  targetAppointmentId: number | null;
  targetPersonalEventId: string | null;
  /** Optional error if outcome === "errored". */
  error?: unknown;
  /** Per-submit correlation id so concurrent submits can be told apart. */
  submitId?: string;
  /** ms elapsed from submit start to terminal outcome. */
  submitDurationMs?: number;
  /** Live store sessionId at the moment the mutation was issued (vs captured at submit start). */
  liveSessionIdAtMutation?: number | null;
  /** Local store intent count immediately after the mutation completed. */
  postMutationIntentCount?: number;
  /** Local store intent ids immediately after the mutation completed. */
  postMutationIntentIds?: number[];
}

/**
 * Capture a structured event for one terminal move outcome. The
 * level matches the user-visible severity: info for happy paths,
 * warning for snap-back (which is the bug we're chasing), error
 * for exceptions.
 *
 * The `tags` block is what makes Sentry's saved-search /
 * alert-rule UI useful — keep tag names stable and short.
 */
export function captureMoveOutcome(ctx: MoveOutcomeContext): void {
  const level: Sentry.SeverityLevel =
    ctx.outcome === "errored"
      ? "error"
      : ctx.outcome === "dismissed"
        ? "warning"
        : "info";

  // Sentry tags accept primitives only. Coerce nullables to
  // sentinel strings so they remain filterable instead of dropping
  // into the "missing" bucket.
  Sentry.withScope((scope) => {
    scope.setLevel(level);
    scope.setTag("move.outcome", ctx.outcome);
    scope.setTag("move.source", ctx.source);
    scope.setTag("move.intent_type", ctx.intentType);
    scope.setTag("move.is_restage", String(ctx.isRestage));
    scope.setTag("move.linter_decision", ctx.linterDecision);
    scope.setTag("move.view_mode", ctx.viewMode ?? "unknown");
    scope.setTag(
      "move.has_session",
      ctx.sessionId == null ? "no" : "yes",
    );
    if (ctx.submitId) {
      scope.setTag("move.submit_id", ctx.submitId);
    }
    scope.setExtras({
      rawIssueCount: ctx.rawIssueCount,
      scopedIssueCount: ctx.scopedIssueCount,
      sessionId: ctx.sessionId,
      targetAppointmentId: ctx.targetAppointmentId,
      targetPersonalEventId: ctx.targetPersonalEventId,
      error: ctx.error == null ? null : String(ctx.error),
      submitId: ctx.submitId ?? null,
      submitDurationMs: ctx.submitDurationMs ?? null,
      liveSessionIdAtMutation: ctx.liveSessionIdAtMutation ?? null,
      postMutationIntentCount: ctx.postMutationIntentCount ?? null,
      postMutationIntentIds: ctx.postMutationIntentIds ?? null,
    });

    if (ctx.outcome === "errored" && ctx.error instanceof Error) {
      Sentry.captureException(ctx.error);
      return;
    }

    Sentry.captureMessage(
      `move:${ctx.outcome} (${ctx.intentType}, ${ctx.source}, linter=${ctx.linterDecision})`,
      level,
    );
  });
}

/**
 * Add a structured breadcrumb for a single drag/move milestone.
 * Cheaper than capturing a full event; rides along with the next
 * captured message (e.g., the move outcome above) so the Sentry
 * issue page shows the trail leading up to the snap-back.
 */
export function dragBreadcrumb(
  message: string,
  data?: Record<string, unknown>,
): void {
  Sentry.addBreadcrumb({
    category: "drag",
    message,
    level: "info",
    data,
  });
}

/**
 * Generic calendar-state breadcrumb. Use for any non-drag transition
 * worth surfacing in Sentry's event detail trail (view-mode toggle,
 * chain selection change, store mutations, arrow re-derivation,
 * etc.). The category is fixed to `"calendar"` so a Sentry filter
 * can isolate the calendar trail from other breadcrumbs (network,
 * navigation, console, etc.).
 *
 * Levels:
 * - `info` (default) — normal state transition.
 * - `warning` — suspicious state (e.g., overlay active but 0
 *   segments resolved; intent count regressed after mutation).
 *
 * Sentry caps breadcrumb count at 100 in the ring buffer per event,
 * so prefer summary fields over verbose dumps. The shape is
 * intentionally flexible (`Record<string, unknown>`) — most
 * consumers will want to include `viewMode`, `intentCount`,
 * `chainCount`, etc. as relevant.
 */
export function traceCalendar(
  message: string,
  data?: Record<string, unknown>,
  level: Sentry.SeverityLevel = "info",
): void {
  Sentry.addBreadcrumb({
    category: "calendar",
    message,
    level,
    data,
  });
}

/**
 * Capture a structured Sentry event for a SUSPICIOUS calendar
 * condition that warrants user-visible attention (e.g., arrows
 * expected but produced 0, intent set regressed unexpectedly,
 * backwards-arrow heuristic tripped). Heavier than a breadcrumb —
 * use sparingly; the event sends to Sentry whether or not anything
 * else captured. Pair with `traceCalendar` breadcrumbs that
 * preceded it so the issue page has a full trail.
 *
 * The `tags` argument flat-merges into the Sentry scope's tag set,
 * so Sentry's saved-search / alert UI can filter by them.
 */
export function captureCalendarAnomaly(
  message: string,
  tags: Record<string, string | number | boolean | null | undefined>,
  extras?: Record<string, unknown>,
): void {
  Sentry.withScope((scope) => {
    scope.setLevel("warning");
    for (const [key, value] of Object.entries(tags)) {
      if (value === undefined) continue;
      scope.setTag(`cal.${key}`, value === null ? "null" : String(value));
    }
    if (extras) {
      scope.setExtras(extras);
    }
    Sentry.captureMessage(`calendar:anomaly ${message}`, "warning");
  });
}

/**
 * 2026-05-13 — diagnostic snapshot event for the wrong-direction
 * arrows investigation.
 *
 * Emits a Sentry MESSAGE EVENT (not just a breadcrumb) at the
 * given level so it's discoverable via Sentry's `search_events`
 * API. Each snapshot carries a `cal.snapshot_type` tag — pick a
 * stable, short string per caller (e.g.
 * `"future_to_now_post_toggle"`, `"arrow_render_degenerate"`,
 * `"arrow_overlap_detected"`) so saved searches can isolate the
 * diagnostic stream.
 *
 * Pairs with `traceCalendar` breadcrumbs: this is the anchor
 * event you'll find via `search_events`; the breadcrumbs are the
 * leading trail on the issue page.
 *
 * Level is `info` by default — these are diagnostic captures, not
 * anomalies. Pass `"warning"` when the snapshot is being taken
 * because something already looks wrong.
 */
export function captureCalendarSnapshot(
  snapshotType: string,
  tags: Record<string, string | number | boolean | null | undefined>,
  extras?: Record<string, unknown>,
  level: Sentry.SeverityLevel = "info",
): void {
  Sentry.withScope((scope) => {
    scope.setLevel(level);
    scope.setTag("cal.snapshot_type", snapshotType);
    for (const [key, value] of Object.entries(tags)) {
      if (value === undefined) continue;
      scope.setTag(`cal.${key}`, value === null ? "null" : String(value));
    }
    if (extras) {
      scope.setExtras(extras);
    }
    Sentry.captureMessage(`calendar:snapshot ${snapshotType}`, level);
  });
}

/**
 * Set process-wide Sentry tags so every captured event is filterable
 * by app role / view state without us having to thread the value
 * through every call site. Re-call when the tracked value changes
 * (e.g., the user toggles between day and week-portrait modes).
 *
 * Sentry tags are top-level filterable in saved searches AND on the
 * Issues page; the same fields stuffed into `extras` are only
 * visible in the event detail view. Anything we want to filter or
 * alert on belongs here.
 */
export function setGlobalSentryTags(tags: {
  role?: string | null;
  viewMode?: string | null;
  linterStrictness?: string | null;
  buildTag?: string | null;
}): void {
  if (tags.role !== undefined) {
    Sentry.setTag("app.role", tags.role ?? "unknown");
  }
  if (tags.viewMode !== undefined) {
    Sentry.setTag("app.view_mode", tags.viewMode ?? "unknown");
  }
  if (tags.linterStrictness !== undefined) {
    Sentry.setTag(
      "app.linter_strictness",
      tags.linterStrictness ?? "unknown",
    );
  }
  if (tags.buildTag !== undefined) {
    Sentry.setTag("app.build_tag", tags.buildTag ?? "unknown");
  }
}
