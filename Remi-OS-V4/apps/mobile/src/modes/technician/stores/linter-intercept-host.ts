// PLAN-DEVIATION: 2026-04-24-smart-default-intent-producer
//   — Zustand singleton (NOT React Context) so producers deep in
//   the render tree can `await present(...)` without forcing the
//   sheet host into the tree-root. See
//   docs/PLAN-DEVIATIONS.md#2026-04-24-smart-default-intent-producer
//   before considering a Context migration.
/**
 * `linter-intercept-host` (P3-FE-7) — Zustand store + presenter that
 * lets `useSessionAwareSubmit` (anywhere in the app) trigger the
 * shared `LinterInterceptSheet` mounted at the calendar tab level
 * and `await` the user's choice.
 *
 * Why a store and not a React Context:
 *   - The producer (`useSessionAwareSubmit`) is called from RHF
 *     submit handlers and drag callsites that are deep in the render
 *     tree relative to where the sheet is hosted. A context provider
 *     would force every hooked callsite to live below the host;
 *     today's drag handlers in `app/(tabs)/index.tsx` are siblings
 *     of the sheet host, not descendants.
 *   - A Zustand singleton matches the `usePendingRealityStore` /
 *     `useCalendarStore` pattern already used for cross-tree
 *     calendar coordination (drafts, multi-tech selection, etc.).
 *   - Consumers don't need React reactivity to call `present(...)` —
 *     they need a Promise. Imperative singletons map cleanly to
 *     async/await without `useImperativeHandle` ref plumbing.
 *
 * The sheet itself (`LinterInterceptSheet`) subscribes to this
 * store via Zustand selectors, opens when `request != null`, and
 * calls `resolve(...)` when the user picks (or dismisses).
 *
 * ESC / backdrop tap → resolves to `undefined`. The producer
 * interprets that as "drop the live mutation; canvas snaps back
 * to its pre-mutation position" (the snap-back itself is the
 * caller's responsibility — see `useSessionAwareSubmit` callers
 * in `app/(tabs)/index.tsx`'s drag handlers).
 *
 * Master plan §5.3.7 (this chunk) for the full pattern writeup.
 */

import { create } from "zustand";

import type { LinterIssue } from "@technician/utils/logistics-linter";
import { traceCalendar } from "@technician/utils/sentry-diagnostics";

/**
 * Possible resolutions for a `present(...)` call.
 *
 * - `"apply"` — user tapped "Apply anyway"
 * - `"stage"` — user tapped "Stage for review"
 * - `undefined` — user dismissed via ESC / backdrop tap, OR a new
 *   `present(...)` arrived while this one was still open and the
 *   host evicted it. Producer treats both the same: drop the live
 *   mutation; the canvas snaps back. (2026-05-13 — the
 *   short-lived `"evicted"` sentinel + auto-stage hack was
 *   reverted at user request; eviction now snaps back like a
 *   regular dismiss.)
 */
export type LinterInterceptChoice = "apply" | "stage" | undefined;

export interface LinterInterceptRequest {
  /** Auto-incrementing id so React keying / tests can disambiguate
   *  rapidly-fired requests. */
  id: number;
  /** The issues the local linter returned for the proposed change. */
  issues: LinterIssue[];
  /**
   * Optional appointment-id scope used by `LinterInterceptSheet` to
   * narrow the rendered issue list to "rows that touch the dragged
   * card or its chain", instead of dumping every pending issue from
   * the active reorganization session.
   *
   * Producer responsibility (`useSessionAwareSubmit`):
   *   - Drag callsites pass the dragged appointment id PLUS every
   *     other appointment id that shares a chain with the candidate
   *     intent (computed via `detectMoveChains`).
   *   - Form-sheet callsites that bind to a single appointment pass
   *     just that appointment's id (no chain context yet).
   *   - Callsites that have no usable target id (e.g. brand-new
   *     `create` intents from the Generate sheet) pass `null` to
   *     opt out of filtering — the sheet will render every issue,
   *     matching pre-filter behaviour.
   *
   * `null` ≡ "no scope known, render everything". An empty `Set` is
   * a degenerate signal (the producer thinks it has scope but it's
   * empty); the sheet treats it the same as `null` and logs a
   * `__DEV__` warning so the regression is visible in development.
   */
  scopeAppointmentIds: ReadonlySet<number> | null;
  /** Resolver for the `present(...)` Promise. The sheet calls this
   *  with the user's choice; ESC / backdrop tap call with
   *  `undefined`. */
  resolve: (choice: LinterInterceptChoice) => void;
}

/**
 * Optional second argument to `present(...)`. Kept as an options
 * object so future scope additions (e.g. session-id, intent-kind
 * narrowing) don't keep widening the positional signature.
 */
export interface LinterInterceptPresentOptions {
  /** See `LinterInterceptRequest.scopeAppointmentIds` for semantics. */
  scopeAppointmentIds?: ReadonlySet<number> | null;
}

interface LinterInterceptHostState {
  /** Currently-open intercept request, or `null` when the sheet is
   *  closed. The producer is responsible for serialising calls — if
   *  `present(...)` is invoked while a previous request is still
   *  open, the previous one is auto-resolved with `undefined` and
   *  replaced. */
  request: LinterInterceptRequest | null;
  /** Internal: monotonically-increasing id source. */
  _nextId: number;
  /**
   * Open the sheet and resolve when the user picks. The returned
   * Promise resolves to:
   *   - `"apply"`  → user tapped "Apply anyway"
   *   - `"stage"`  → user tapped "Stage for review"
   *   - `undefined` → user dismissed via ESC / backdrop tap
   *
   * Calling `present(...)` while a previous request is still open
   * resolves the previous request with `undefined` and replaces
   * it. This matches the user expectation that a second dragged
   * card should not silently queue behind a stale intercept.
   *
   * Pass `options.scopeAppointmentIds` to narrow the rendered issue
   * list to rows touching the dragged card / its chain — the sheet
   * filters internally. Omit (or pass `null`) to keep the legacy
   * "render every issue" behaviour, e.g. for callsites that don't
   * yet plumb a target id.
   */
  present: (
    issues: LinterIssue[],
    options?: LinterInterceptPresentOptions,
  ) => Promise<LinterInterceptChoice>;
  /**
   * Resolve the active request (if any) with the given choice and
   * clear it. Called by `LinterInterceptSheet`'s button handlers.
   */
  resolveActive: (choice: LinterInterceptChoice) => void;
}

export const useLinterInterceptHost = create<LinterInterceptHostState>(
  (set, get) => ({
    request: null,
    _nextId: 1,
    present: (issues, options) =>
      new Promise<LinterInterceptChoice>((resolve) => {
        const previous = get().request;
        const id = get()._nextId;
        const scopeAppointmentIds = options?.scopeAppointmentIds ?? null;
        const errors = issues.filter((i) => i.severity === "error").length;
        const warnings = issues.length - errors;
        traceCalendar("linterIntercept.present", {
          requestId: id,
          issueCount: issues.length,
          errors,
          warnings,
          scopeSize: scopeAppointmentIds?.size ?? null,
          evictsPrevious: !!previous,
          previousId: previous?.id ?? null,
        });
        if (previous) {
          // A second `present(...)` arrived while a previous request
          // was still open. Resolve the previous one with `undefined`
          // — the producer treats that the same as ESC / backdrop
          // dismissal (snap-back). 2026-05-13 — the brief
          // `"evicted"` + auto-stage path was reverted at user
          // request: "I don't want auto-staging." The real bug we
          // are now hunting is "for drop A no sheet ever appears
          // visually," which means we need the sheet to actually
          // OPEN for drop A in the first place — that's a render
          // problem, not a producer-side eviction-policy problem.
          console.log(
            "[linter-intercept] evicting in-flight request",
            { previousId: previous.id },
          );
          previous.resolve(undefined);
        }
        if (__DEV__) {
          console.log("[DEBUG:LinterIntercept] present", {
            requestId: id,
            issueCount: issues.length,
            errors,
            warnings,
            issueKinds: issues.map((i) => i.kind),
            scopeSize: scopeAppointmentIds?.size ?? null,
          });
        }
        set({
          request: { id, issues, scopeAppointmentIds, resolve },
          _nextId: id + 1,
        });
      }),
    resolveActive: (choice) => {
      const active = get().request;
      if (!active) {
        traceCalendar(
          "linterIntercept.resolveActive NO-OP",
          { choice: choice ?? "dismissed" },
        );
        if (__DEV__) {
          console.log("[DEBUG:LinterIntercept] resolveActive (no-op)", {
            choice: choice ?? "dismissed",
          });
        }
        return;
      }
      traceCalendar("linterIntercept.resolveActive", {
        requestId: active.id,
        choice: choice ?? "dismissed",
      });
      if (__DEV__) {
        console.log("[DEBUG:LinterIntercept] resolveActive", {
          requestId: active.id,
          choice: choice ?? "dismissed",
        });
      }
      active.resolve(choice);
      set({ request: null });
    },
  }),
);

/**
 * Test helper — restores the store to its initial state. Lives in
 * the same module (rather than a separate test-utils file) so test
 * files can import it without pulling in Jest setup that production
 * code shouldn't see.
 *
 * NOT exported from any package barrel — the only legitimate caller
 * is a `beforeEach` in `__tests__/`.
 */
export function __resetLinterInterceptHostForTests(): void {
  const active = useLinterInterceptHost.getState().request;
  if (active) active.resolve(undefined);
  useLinterInterceptHost.setState({ request: null, _nextId: 1 });
}
