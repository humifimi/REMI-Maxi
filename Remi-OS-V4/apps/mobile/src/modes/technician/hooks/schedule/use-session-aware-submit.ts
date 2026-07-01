// PLAN-DEVIATION: 2026-04-24-smart-default-intent-producer
//   — this wrapper IS the smart-default linter intercept. The
//   master plan §5.3.3 originally sketched an explicit "Stage"
//   CTA on every form sheet OR a top-level session-mode toggle;
//   the user explicitly rejected both. See
//   docs/PLAN-DEVIATIONS.md#2026-04-24-smart-default-intent-producer
//   before refactoring this hook's surface.
/**
 * `useSessionAwareSubmit` (P3-FE-7) — the producer half of the
 * Pending Reality stack.
 *
 * Wraps a live calendar mutation with the smart-default linter
 * intercept: every proposed change runs the local linter first;
 * if clean, the live mutation fires (existing behavior, unchanged);
 * if the linter returns ANY issue, the live commit is paused and
 * the user gets a `LinterInterceptSheet` with two options:
 *
 *   - **Apply anyway** → run the live mutation as if no intercept
 *     fired. The user has overridden the linter's judgment.
 *   - **Stage for review** → ensure a `reorganization_session`
 *     exists (creating one if `usePendingRealityStore.sessionId
 *     == null`), then add the proposed change as an intent. The
 *     FAB / HUD light up; the user finishes via the review screen.
 *
 * ESC / backdrop-tap on the sheet drops the live mutation entirely;
 * the canvas snaps back to its pre-mutation position. Drag callsites
 * are responsible for the snap-back animation BEFORE calling this
 * hook (the sheet is awkward mid-gesture); form-sheet callsites
 * just don't fire `liveMutate`, leaving the sheet open with the
 * unapplied draft so the user can re-edit.
 *
 * Why `lintSession` is the only seam (no server preflight):
 *   - Per master plan §5.3.3, the local linter is the source of
 *     truth for the intercept decision. Hitting the BE for a
 *     preflight on every submit would double the network cost,
 *     introduce a network-error UX state to the form-sheet, and
 *     race against the user's typing.
 *   - The BE re-runs the linter on `finalize` and is allowed to
 *     overrule (422 → review screen handles inline cards via
 *     `useFinalizeReorganizationSession`'s discriminated-union
 *     result). The local linter being stricter than the BE is a
 *     non-issue (more intercepts is safer); the BE being stricter
 *     is what the 422 path covers.
 *
 * Shape design:
 *
 *   useSessionAwareSubmit<TPayload>({
 *     buildProposedIntent: (payload) =>
 *       ReorganizationIntentPayload,
 *     liveMutate: (payload) => Promise<void>,
 *     worldSnapshot: LinterWorldSnapshot,
 *   }): (payload: TPayload) => Promise<SubmitOutcome>
 *
 * Callers pass:
 *   - `buildProposedIntent` — pure transform from their form
 *     payload to the discriminated `ReorganizationIntentPayload`
 *     the linter and BE consume.
 *   - `liveMutate` — the existing live-commit Promise (typically
 *     `someMutation.mutateAsync(payload)` returning `void`).
 *   - `worldSnapshot` — the same world snapshot the caller would
 *     pass to `usePendingRealityStore.runLocalLinter` directly.
 *     Assembled at the callsite to keep the store cache-free
 *     (per `2026-04-23-pending-reality-trim`).
 *
 * Returns a single async submit function. The submit function
 * resolves with a `SubmitOutcome` so callers (form sheets, the
 * drag handler) can dispatch on what actually happened — the
 * primary motivation is letting form sheets close themselves on
 * the `staged` path. The live-commit and apply-anyway paths
 * already close via the mutation's own `closeAndClearCache()`
 * inside `liveMutate`; the staged path never calls `liveMutate`,
 * so without the outcome the sheet would stay open and a second
 * tap would create a duplicate intent for the same target. The
 * dismissed path is the only one that intentionally leaves the
 * sheet open (so the user can re-edit the unapplied draft).
 */

import { useCallback } from "react";
import * as Sentry from "@sentry/react-native";

import {
  useAddReorganizationIntent,
  useCreateReorganizationSession,
  useModifyReorganizationIntent,
  useRemoveReorganizationIntent,
} from "@technician/hooks/schedule/use-reorganization";
import { useCalendarStore } from "@technician/stores/calendar";
import {
  captureMoveOutcome,
  type LinterDecision,
  type MoveSource,
} from "@technician/utils/sentry-diagnostics";
import {
  useCrossCardCollisionToastStore,
  type CrossCardCollisionEntry,
} from "@technician/stores/cross-card-collision-toast";
import { useDemoSettingsStore } from "@technician/stores/demo-settings";
import { usePendingRealityStore } from "@technician/stores/pending-reality";
import { useLinterInterceptHost } from "@technician/stores/linter-intercept-host";
import type {
  ReorganizationIntent,
  ReorganizationIntentPayload,
  ReorganizationSession,
} from "@technician/types/reorganization";
import {
  type LinterAppointment,
  type LinterIssue,
  type LinterWorldSnapshot,
  lintSession,
} from "@technician/utils/logistics-linter";

// 2026-05-13 — module-level singleton lock for the "first
// createSession wins" race. Two parallel submits (drag A awaiting
// intercept, drag B starting and evicting A) can both reach the
// staged path with `liveSessionId === null` if A's createSession
// network round-trip hasn't returned yet by the time B reads the
// store. Without this lock both fire `createSession.mutateAsync`,
// the BE creates two sessions, and the second `setSession` in
// onSuccess stomps the first — wiping out the first drag's
// just-staged intent. Symptom: "every other card with conflict
// snaps back / does nothing."
//
// The lock holds the in-flight createSession promise. Subsequent
// staged-path callers await it instead of firing their own; they
// then re-read the store and follow the addIntent / modifyIntent
// branch against the now-existing session. The lock self-clears
// in finally so a failed createSession doesn't deadlock future
// submits.
let inflightCreateSession: Promise<unknown> | null = null;
/**
 * Discriminated union describing how `useSessionAwareSubmit` resolved
 * a submit. Form-sheet callsites use this to decide whether to close
 * themselves: anything other than `dismissed` means the work landed
 * (or is in flight on the BE) and the sheet should go away. The
 * `live-committed` and `applied-anyway` paths typically close
 * themselves from inside `liveMutate` already (via
 * `closeAndClearCache()` after `mutation.mutateAsync` resolves), so
 * the practical use is "close on `staged`". The drag callsite
 * (`app/(tabs)/index.tsx`) ignores the outcome — it has no sheet to
 * close, the drag has already snapped back during the gesture phase.
 *
 * Why a discriminated union, not a string literal: leaves room to
 * carry context fields per-variant later (e.g. the staged session id
 * could ride on `kind: "staged"`) without breaking existing
 * `switch`/`if` chains.
 */
export type SubmitOutcome =
  | { kind: "live-committed" }
  | { kind: "applied-anyway" }
  | { kind: "staged" }
  | { kind: "dismissed" };

export interface UseSessionAwareSubmitOptions<TPayload> {
  /**
   * Pure transform from the caller's form / drag payload into the
   * discriminated `ReorganizationIntentPayload` the linter and BE
   * consume. MUST be referentially stable across re-renders (wrap
   * in `useCallback` if it closes over component state).
   */
  buildProposedIntent: (payload: TPayload) => ReorganizationIntentPayload;
  /**
   * The existing live-commit Promise. Typically
   * `someMutation.mutateAsync(payload)`. The wrapper does NOT
   * surface success / error from this — callers attach their own
   * `mutation.onSuccess` / `onError` via the underlying hook (the
   * wrapper has no opinion about post-commit UX).
   */
  liveMutate: (payload: TPayload) => Promise<void>;
  /**
   * World snapshot for the local linter run. Same shape the caller
   * would pass to `usePendingRealityStore.runLocalLinter` directly.
   * Pass an empty snapshot (`{ appointments: [], routes: [],
   * customerSlas: [], fleet: { accounts: [] } }`) if the caller
   * hasn't assembled real world data yet — the linter tolerates
   * empty snapshots and will simply return `[]`, which means every
   * submit will go straight to live-commit. Tests rely on this
   * graceful degradation.
   */
  worldSnapshot: LinterWorldSnapshot;
  /**
   * Optional: target appointment id to attach to the synthetic
   * `ReorganizationIntent` the local linter sees. The BE generates
   * a real id at finalize; the local linter only needs *something*
   * in the slot so its rules can reason about which appointment is
   * being mutated. **Critically**, `lintTimeConflicts`'s
   * `projectIntentsToTechSlots` (`src/utils/logistics-linter.ts`)
   * silently SKIPS reschedule / reassign intents whose
   * `appointment_id` is `null`, so omitting this on a drag callsite
   * means the linter cannot detect overlap-with-existing-card and
   * the cascade-build flow degrades to live-commit. Always pass a
   * real id when the intent targets an existing appointment.
   *
   * Accepts either a static value (form sheets that bind to one
   * appointment for their lifetime) OR a function of the submit
   * input (drag callsites that submit a different appointment per
   * gesture). The function form is invoked **once per submit**
   * inside the wrapper's callback, so it does NOT need to be
   * referentially stable — but the caller MUST keep it stable
   * across renders (wrap in `useCallback` or define module-level)
   * if they want to avoid the wrapper re-creating every render
   * from the deps array. Form-sheet callsites that pass a static
   * value are unaffected.
   */
  targetAppointmentId?:
    | number
    | null
    | ((payload: TPayload) => number | null);
  /**
   * Optional: target personal-event id to attach to the synthetic
   * `ReorganizationIntent`. Same role as `targetAppointmentId` but
   * for `personal_event_*` intent types. Same static-or-function
   * shape — pass `null` (or omit) when the intent has no
   * personal-event target.
   */
  targetPersonalEventId?:
    | string
    | null
    | ((payload: TPayload) => string | null);
  /**
   * Optional: UNFILTERED `LinterAppointment[]`. Today this is only
   * threaded through `computeInterceptScope` (as a future-use
   * placeholder for per-chain summary headers in the linter sheet)
   * and IS NOT consulted by the live-commit-vs-stage decision.
   *
   * History (PLAN-DEVIATION 2026-05-12-scope-clean-always-live-commit):
   * Earlier shapes of this wrapper ran
   * `wouldExtendExistingChain(newIntent, currentIntents,
   * chainAppointments)` on the linter-clean branch and stage'd the
   * intent when the predicate was true ("session-sticky chain
   * extension"). That gate caused a user-visible bug: a re-move of
   * a previously live-committed card into a CLEAN slot would
   * incorrectly stage instead of live-committing, because the
   * chain detector still saw the card at its stale prior position
   * and reported an apparent chain link with another intent's
   * destination. Per the user's stated rule — *"Cards that are
   * dropped without conflict ... are just moved, no questions
   * asked"* — the wrapper now ALWAYS live-commits when the dragged
   * card's scoped issue list is empty, regardless of session state
   * or chain extension. `chainAppointments` stays in the option
   * surface for backward compat (drag callsites already pass it)
   * but is intentionally not used to decide stage-vs-commit.
   *
   * MUST be the UNFILTERED list (typically
   * `dayDataToLinterAppointments(weekQuery.data)`) when passed —
   * the world snapshot's filtered list erases the source slots of
   * existing staged intents and would produce stale chain signals
   * for any future consumer.
   *
   * See docs/PLAN-DEVIATIONS.md#2026-05-12-scope-clean-always-live-commit.
   */
  chainAppointments?: readonly LinterAppointment[];
  /**
   * Optional: caller identity for the Sentry diagnostics layer.
   * Drag callsites pass `"drag"`; form sheets pass `"sheet"`.
   * Defaults to `"unknown"` so legacy callsites still report
   * coherently. Surfaced as a Sentry tag (`move.source`) so we
   * can saved-search the snap-back bug to the drag callsite
   * specifically without having to grep the message body.
   */
  source?: MoveSource;
}

/**
 * Hypothetical session row used by the local linter when no real
 * session is active yet. The shipped `lintSession` rules don't
 * read any session field today, but the function signature requires
 * one — so we synthesize a minimal placeholder. Once a real
 * session exists (`usePendingRealityStore.session != null`), the
 * real row replaces this.
 */
const HYPOTHETICAL_SESSION: ReorganizationSession = {
  id: -1,
  franchise_id: -1,
  author_user_id: null,
  source: "tech_app",
  status: "draft",
  required_authorizer_role: "self",
  eligible_committer_ids: [],
  policy_snapshot: {
    tech_authored_self_only: "auto",
    tech_authored_cross_tech: "fo_review",
    tech_authored_with_cancel: "fo_review",
    customer_authored_single: "auto",
    customer_authored_multi: "fo_review",
    customer_authored_with_conflict: "fo_review",
    ai_authored: "always_fo_review",
  },
  idempotency_key: null,
  notes: null,
  template_id: null,
  related_session_id: null,
  source_metadata: {},
  created_at: new Date(0).toISOString(),
  finalized_at: null,
  committed_at: null,
  cancelled_at: null,
  expires_at: null,
};

/**
 * Compute the appointment-id "scope" the `LinterInterceptSheet` will
 * use to filter the rendered issue list down to rows that touch the
 * dragged card or its chain (instead of dumping every pending issue
 * from the active reorganization session).
 *
 * Producer-side rather than sheet-side because the producer already
 * knows everything needed (the candidate intent, the pre-existing
 * intent set, the unfiltered appointment list) — letting the sheet
 * recompute would force it to reach into Zustand for context that
 * doesn't otherwise belong there. Keep the sheet prop-driven; pass
 * scope along the existing `present(...)` Promise.
 *
 * Returns:
 *   - `null` when the producer has no usable scope info (no target
 *     appointment id, no chain context). The sheet renders every
 *     issue in that case — same as legacy behaviour.
 *   - A `Set<number>` of appointment ids otherwise. Always includes
 *     `resolvedTargetApptId` (when set) so the dragged card itself
 *     is in scope even when chain detection short-circuits. Plus
 *     every appointment id reachable via `detectMoveChains` from
 *     any intent the candidate's chain contains.
 *
 * Empty set is theoretically possible (e.g. cancel of an appointment
 * with no chain; but cancels keep their target id, so this only
 * fires when the target id is itself null AND no chain matches).
 * We still return the empty set rather than `null` so the sheet's
 * own `__DEV__` warning fires and surfaces the regression.
 */
function computeInterceptScope(args: {
  hypothetical: ReorganizationIntent;
  currentIntents: readonly ReorganizationIntent[];
  chainAppointments: readonly LinterAppointment[] | undefined;
  resolvedTargetApptId: number | null;
}): ReadonlySet<number> | null {
  const {
    hypothetical: _hypothetical,
    currentIntents: _currentIntents,
    chainAppointments,
    resolvedTargetApptId,
  } = args;
  // PR-UX-11 (2026-05-09, follow-up to PR #97): the previous
  // chain-expansion produced 2-3 cards in the LinterInterceptSheet
  // for a single drag in dense multi-chain sessions because every
  // chain sibling's conflicts were considered "in scope". User
  // report (2026-05-09): *"more conflicts come up on the popup toast
  // thing when it's moved"* — combined with Task C (the parallel
  // "replace existing intent for the same appointment in the linter
  // call" fix), this narrowing ensures the sheet shows ONE card per
  // genuine NEW conflict on the dragged card, no carried-over noise
  // from the stale intent.
  //
  // Anti-instructions:
  //   - Don't reintroduce chain expansion here without a user-driven
  //     ticket (the previous expansion was wrong by feedback, not by
  //     design).
  //   - Don't dedupe issue cards inside the sheet by `kind` +
  //     `proposed_time`. Each conflict card carries unique
  //     `affectedAppointmentIds` data the user needs to triage.
  //
  // The `chainAppointments` arg stays in the signature for future
  // use (e.g., a per-chain summary header) but is intentionally
  // unused today.
  void _hypothetical;
  void _currentIntents;

  // No chain context AND no target id → caller is opted out (e.g.
  // a Generate sheet creating a brand-new appointment from scratch).
  // Render every issue.
  if (chainAppointments == null && resolvedTargetApptId == null) {
    return null;
  }

  const scope = new Set<number>();
  if (resolvedTargetApptId != null) scope.add(resolvedTargetApptId);
  return scope;
}

/**
 * PLAN-DEVIATION: 2026-05-12-pending-move-overlap-soft-framing —
 * format a short human label describing where an intent's pending
 * destination lands, used in the cross-card collision toast body.
 * Pure — no store reads, no hooks. The submit hook calls this once
 * per conflicting intent when an apply-anyway live-commit leaves
 * another card's intent in conflict with the new committed world.
 *
 * Format:
 *   - Reschedule: "Pending move 10:10–11:10 on Mon May 11 (tech #5)"
 *     — drops customer name on purpose: the world snapshot is
 *     id-only (no customer.name field) and the submit hook is
 *     intentionally lookup-free per `2026-04-23-pending-reality-trim`.
 *     The toast's "Adjust pending" CTA routes to the review screen
 *     which DOES have humanized labels.
 *   - Reassign: "Pending reassign to tech #5 on Mon May 11"
 *   - Other kinds (create / cancel / personal_event_*): "Pending move"
 *     — these don't appear in R1 staged-intent overlaps in practice
 *     because cancel/personal_event_* don't project a tech slot
 *     (`projectIntentsToTechSlots` skips them), and `create` intents
 *     have synthetic negative ids the FE drag callsites don't
 *     typically produce. Kept as a fallback so a future intent kind
 *     that DOES collide doesn't crash the toast.
 */
function buildCollisionEntryLabel(
  intent: ReorganizationIntent,
): string {
  const p = intent.payload;
  if (p.kind === "reschedule") {
    const techLabel =
      p.new_technician_id != null ? ` (tech #${p.new_technician_id})` : "";
    return `Pending move ${p.new_start_time}–${p.new_end_time} on ${p.new_scheduled_date}${techLabel}`;
  }
  if (p.kind === "reassign") {
    return `Pending reassign to tech #${p.new_technician_id}`;
  }
  return "Pending move";
}

/**
 * Build the lead-in label for the toast describing where the
 * just-live-committed card landed. Mirrors
 * `buildCollisionEntryLabel`'s format choices for consistency.
 */
function buildCommittedLabel(
  payload: ReorganizationIntentPayload,
): string {
  if (payload.kind === "reschedule") {
    const techLabel =
      payload.new_technician_id != null
        ? ` (tech #${payload.new_technician_id})`
        : "";
    return `Moved to ${payload.new_start_time}–${payload.new_end_time} on ${payload.new_scheduled_date}${techLabel}`;
  }
  if (payload.kind === "reassign") {
    return `Reassigned to tech #${payload.new_technician_id}`;
  }
  return "Applied this move";
}

/**
 * Map the discriminated `payload.kind` to the matching
 * `ReorganizationIntent.intent_type` so the synthetic intent the
 * linter sees has both fields wired correctly.
 */
function intentTypeForPayload(
  payload: ReorganizationIntentPayload,
): ReorganizationIntent["intent_type"] {
  switch (payload.kind) {
    case "reschedule":
      return "reschedule";
    case "reassign":
      return "reassign";
    case "cancel":
      return "cancel";
    case "create":
      return "create";
    case "personal_event_create":
      return "personal_event_create";
    case "personal_event_update":
      return "personal_event_update";
    case "personal_event_delete":
      return "personal_event_delete";
  }
}

export function useSessionAwareSubmit<TPayload>({
  buildProposedIntent,
  liveMutate,
  worldSnapshot,
  targetAppointmentId = null,
  targetPersonalEventId = null,
  chainAppointments,
  source = "unknown",
}: UseSessionAwareSubmitOptions<TPayload>): (
  payload: TPayload,
) => Promise<SubmitOutcome> {
  const present = useLinterInterceptHost((s) => s.present);
  const createSession = useCreateReorganizationSession();
  const addIntent = useAddReorganizationIntent();
  // PLAN-DEVIATION: 2026-05-09-pr-ux-18-restage-modify-not-add — re-stage paths
  // (drag a card that already has an intent) use `modify_intent` to update
  // the existing intent's payload in place, and `remove_intent` (BE op) when
  // a re-stage de-escalates back to live-commit. The pre-PR-UX-18 pattern of
  // local-only `removeIntent(...)` + `add_intent(...)` left orphan intents on
  // the BE that resurrected via `setSession` and shattered chain detection.
  // See docs/PLAN-DEVIATIONS.md#2026-05-09-pr-ux-18-restage-modify-not-add.
  const modifyIntent = useModifyReorganizationIntent();
  const removeIntent = useRemoveReorganizationIntent();

  return useCallback(
    async (payload: TPayload) => {
      // 2026-05-13 — short submit id so concurrent submits (the
      // 2026-05-13 race scenario: drag-A awaits intercept while
      // drag-B starts and evicts) can be told apart in the
      // Sentry breadcrumb stream. Cheaper than crypto, plenty
      // of entropy for human reading.
      const submitId = Math.random().toString(36).slice(2, 8);
      const submitStartTs = Date.now();
      const proposed = buildProposedIntent(payload);

      // 2026-05-08 (cascade-real, this branch): resolve the
      // per-submit appointment / personal-event ids. Form sheets
      // pass a static value (one target for the sheet's lifetime);
      // drag callsites pass a function of the input so each
      // gesture binds to whichever card the user is dragging.
      // Resolved once per submit — both forms read the latest
      // input synchronously, no closure-over-stale-state risk.
      const resolvedTargetApptId =
        typeof targetAppointmentId === "function"
          ? targetAppointmentId(payload)
          : (targetAppointmentId ?? null);
      const resolvedTargetPersonalEventId =
        typeof targetPersonalEventId === "function"
          ? targetPersonalEventId(payload)
          : (targetPersonalEventId ?? null);

      // D2P-FE-13 — stitch the target id into the payload before it
      // leaves this seam. The BE zod schemas
      // (`reschedulePayloadSchema` / `reassignPayloadSchema` /
      // `cancelPayloadSchema` REQUIRE `appointment_id`;
      // `personalEventUpdatePayloadSchema` /
      // `personalEventDeletePayloadSchema` REQUIRE `personal_event_id`)
      // — and the BE service's `deriveTargetsFromPayload` reads them
      // off the payload directly, not off a separate field — so any
      // staged intent that omits the target id round-trips as a 422
      // zod validation error against `validate({ body: ... })` on
      // `POST /reorganizations` and `PATCH /reorganizations/:id`.
      // Sheet `buildProposedIntent` callbacks intentionally don't
      // know about the target id (they think of "the appointment"
      // as the `targetAppointmentId` prop, not a payload field), so
      // the stitch happens here at the single seam rather than in
      // four parallel sheets. `kind: "create"` /
      // `kind: "personal_event_create"` payloads have no target id
      // by definition; the conditional spread skips them silently.
      // The cast widens the discriminated union just enough to
      // accept the optional target keys — the same shape the BE
      // service uses to read them off the payload (see
      // `deriveTargetsFromPayload` in
      // `REMIBackend/src/services/reorganizationService.ts`).
      const proposedForWire = {
        ...proposed,
        ...(resolvedTargetApptId != null
          ? { appointment_id: resolvedTargetApptId }
          : {}),
        ...(resolvedTargetPersonalEventId != null
          ? { personal_event_id: resolvedTargetPersonalEventId }
          : {}),
      } as ReorganizationIntentPayload;

      // Read the store imperatively so the wrapper isn't
      // re-created on every store mutation. Selectors would force
      // RHF callers to re-bind their submit handlers on every
      // intent add, which defeats their `useCallback` memoization
      // upstream.
      const { session: currentSession, intents: currentIntents, sessionId } =
        usePendingRealityStore.getState();

      const sessionForLinter = currentSession ?? HYPOTHETICAL_SESSION;

      // PR-UX-11 (2026-05-09) — the move-out-of-conflict / re-stage
      // fix. When the user drags a card that already has a staged
      // intent in the active session (= "re-stage"), the new drop
      // SUPERSEDES the old intent — the same appointment can't have
      // two pending mutations, and treating both intents as live in
      // the linter call double-counts conflicts on the OLD position
      // (which the new intent should obsolete).
      //
      // User report (PR-UX-9 smoke 2026-05-09):
      //   #7. "When I move a card that is currently staged/in
      //        conflict, out of conflict, it stays staged, when it
      //        should de-escalate and unstage IF the user doesn't
      //        undo the move."
      //   #8. "more conflicts come up on the popup toast thing when
      //        it's moved."
      //
      // PR-UX-10's earlier attempt added a `removeIntent` call in
      // the linter-clean + no-chain-extension branch only — but the
      // linter still ran with [oldIntent, newIntent] together, so
      // the OLD intent's conflicts kept the linter from being clean
      // and the de-escalation branch was never reached.
      //
      // The fix applies a single `effectiveCurrentIntents` substitution
      // that excludes the existing intent for the dragged appointment
      // BEFORE running the linter. Both Task #7 and Task #8 collapse
      // into the same change because the linter then sees only the
      // NEW intent for that appointment, which:
      //
      //   - linter-clean → de-escalate (remove old intent, live-commit)
      //   - linter-conflict → only the NEW conflicts surface in the
      //     intercept sheet (combined with Task D's narrowed
      //     `computeInterceptScope`, exactly one card per distinct
      //     conflict on the dragged appointment)
      //   - stage path → same — replace old intent (remove + add)
      //
      // The `existingIntentForCard` ref is also returned so the
      // commit path can `removeIntent` it after the new mutation
      // completes.
      const existingIntentForCard =
        resolvedTargetApptId != null
          ? currentIntents.find(
              (i) => i.appointment_id === resolvedTargetApptId,
            ) ?? null
          : null;
      const effectiveCurrentIntents = existingIntentForCard
        ? currentIntents.filter((i) => i.id !== existingIntentForCard.id)
        : currentIntents;

      if (__DEV__ && existingIntentForCard) {
        console.log(
          "[DEBUG:SessionAwareSubmit] re-stage substitution",
          {
            existingIntentId: existingIntentForCard.id,
            existingIntentType: existingIntentForCard.intent_type,
            draggedApptId: resolvedTargetApptId,
            sessionId,
            currentIntentCount: currentIntents.length,
            effectiveIntentCount: effectiveCurrentIntents.length,
            note:
              "Existing staged intent for this appointment will be replaced/removed depending on the linter outcome.",
          },
        );
      }

      const hypothetical: ReorganizationIntent = {
        id: -1,
        session_id: sessionForLinter.id,
        intent_type: intentTypeForPayload(proposed),
        intent_status: "proposed",
        appointment_id: resolvedTargetApptId,
        personal_event_id: resolvedTargetPersonalEventId,
        payload: proposedForWire,
        inverse_payload: null,
        prior_state_snapshot: null,
        linter_dependency_edges: [],
        commit_order: null,
        proposed_at: new Date(0).toISOString(),
        committed_at: null,
        // PLAN-DEVIATION: 2026-05-10-sticky-chain-identity-fe — this
        // is a hypothetical intent the FE constructs to feed the
        // linter / chain detector for `wouldExtendExistingChain`.
        // It has never been ack'd by the BE so it cannot carry a
        // BE-assigned chain id; the empty string is the
        // "no chain_id" sentinel the detector falls back from to
        // its synthesized `chain-{seedIntentId}` group. Production
        // intents from the BE always carry a non-empty value.
        chain_id: "",
      };

      if (__DEV__) {
        // ── 2026-05-08 diagnostic instrumentation ─────────────────
        // Capture the world-snapshot composition + drag context so
        // we can answer the user's "no notice of conflict on the
        // week calendar in portrait mode" report. The hypothesis is
        // that the world snapshot is scoped to a single date /
        // single tech (driven by `useCalendarWorldSnapshot`'s
        // dependence on `useCalendarStore.selectedDate`), which
        // would explain why same-tech overlaps fire but cross-tech
        // / cross-date overlaps don't.
        //
        // Read calendar / view state imperatively (`getState()`) so
        // the wrapper isn't re-created on every store mutation —
        // selectors here would defeat the upstream `useCallback`
        // memoization in form sheets and the drag callsite.
        const calStore = useCalendarStore.getState();
        const techCounts: Record<string, number> = {};
        const dateCounts: Record<string, number> = {};
        for (const appt of worldSnapshot.appointments) {
          const techKey =
            appt.technician_id == null ? "null" : String(appt.technician_id);
          techCounts[techKey] = (techCounts[techKey] ?? 0) + 1;
          const dateKey = appt.scheduled_date ?? "null";
          dateCounts[dateKey] = (dateCounts[dateKey] ?? 0) + 1;
        }
        const dateKeys = Object.keys(dateCounts).sort();
        const intentKindCounts: Record<string, number> = {};
        for (const i of currentIntents) {
          intentKindCounts[i.intent_type] =
            (intentKindCounts[i.intent_type] ?? 0) + 1;
        }

        console.log("[DEBUG:SessionAwareSubmit] submit invoked", {
          intentType: hypothetical.intent_type,
          resolvedTargetApptId,
          resolvedTargetPersonalEventId,
          sessionId,
          existingIntentCount: currentIntents.length,
          worldAppointmentCount: worldSnapshot.appointments.length,
          worldRouteCount: worldSnapshot.routes.length,
        });

        console.log("[DEBUG:SessionAwareSubmit] submit context", {
          // View state — the smoking-gun fields for the week-portrait
          // "no notice" report. If `viewMode === "week"` and
          // `worldDateCoverage.dateCount === 1`, the linter is
          // running with a one-day snapshot inside a multi-day
          // canvas — same-day overlaps will fire, cross-day won't.
          viewMode: calStore.viewMode,
          workweekTechId: calStore.workweekTechId,
          calendarSelectedDate: calStore.selectedDate,
          // Drag context (the candidate intent the linter is about
          // to evaluate). For drag callsites this is the dropped
          // card; for form sheets this is the sheet's bound target.
          // `targetTechId` is read off the proposed payload to
          // catch reschedule-with-tech-change + reassign without
          // having to branch on `payload.kind` here.
          dragSourceApptId: resolvedTargetApptId,
          dragTargetTechId:
            "new_technician_id" in proposed
              ? (proposed as { new_technician_id?: number | null })
                  .new_technician_id ?? null
              : null,
          dragTargetDate:
            "new_scheduled_date" in proposed
              ? (proposed as { new_scheduled_date?: string | null })
                  .new_scheduled_date ?? null
              : null,
          dragTargetStart:
            "new_start_time" in proposed
              ? (proposed as { new_start_time?: string | null })
                  .new_start_time ?? null
              : null,
          dragTargetEnd:
            "new_end_time" in proposed
              ? (proposed as { new_end_time?: string | null })
                  .new_end_time ?? null
              : null,
          // World-snapshot composition — the load-bearing
          // diagnostic. If `dateCount === 1` and `viewMode === "week"`,
          // we have our smoking gun. If `worldAppointmentsByTech`
          // shows only one tech populated in week-portrait, we have
          // a second smoking gun (week-portrait restricting to
          // `workweekTechId`). Truncated to top-10 most-populated
          // tech ids to keep the log line readable; full counts can
          // be reproduced from `worldAppointmentCount` + entry count.
          worldAppointmentsByTech: techCounts,
          worldDateCoverage: {
            minDate: dateKeys[0] ?? null,
            maxDate: dateKeys[dateKeys.length - 1] ?? null,
            dateCount: dateKeys.length,
            byDate: dateCounts,
          },
          intentKindCounts,
        });
      }

      let issues: LinterIssue[];
      let linterThrew = false;
      try {
        // PR-UX-11 (2026-05-09): use `effectiveCurrentIntents` (not
        // `currentIntents`) so a re-stage substitution erases the
        // OLD intent for the dragged appointment from the linter's
        // view. See the doc-block above `existingIntentForCard` for
        // the full rationale + the user reports this fixes.
        issues = lintSession(
          sessionForLinter,
          [...effectiveCurrentIntents, hypothetical],
          worldSnapshot,
        );
      } catch (err) {
        // The linter is pure but defensive — if a future rule throws
        // on a malformed snapshot, fail open (live-commit) rather
        // than blocking the user from submitting at all.
        console.error("[session-aware-submit] linter threw; falling back to live commit", err);
        issues = [];
        linterThrew = true;
      }

      if (__DEV__) {
        // Issue-kind histogram on the raw (pre-strictness-filter)
        // result. Lets us see whether the linter is detecting
        // certain issue kinds and they're being silently filtered
        // out at strictness=loose, vs. not detecting them at all.
        // `time_conflict` is the kind to watch for the cross-tech
        // / cross-date drop scenarios — if this is zero in
        // week-portrait but non-zero for the equivalent drag in
        // day mode, the world-snapshot scoping hypothesis is
        // confirmed.
        const issueKindCounts: Record<string, number> = {};
        for (const i of issues) {
          issueKindCounts[i.kind] = (issueKindCounts[i.kind] ?? 0) + 1;
        }
        console.log("[DEBUG:SessionAwareSubmit] linter raw output", {
          rawIssueCount: issues.length,
          issueKindCounts,
          rawIssues: issues.slice(0, 5).map((i) => ({
            kind: i.kind,
            severity: i.severity,
            humanMessage: i.humanMessage,
          })),
        });
      }

      // D2P-FE-14 — strictness filter (demo-mode toggle, FO surface).
      // `"strict"` (default) drops warnings entirely so the intercept
      // fires only on hard conflicts. `"loose"` keeps everything the
      // linter returned. Read imperatively (`.getState()`) so the
      // wrapper isn't re-created on every preference flip — a
      // selector subscription would defeat the upstream `useCallback`
      // memoization in form sheets. See
      // `docs/implementation-plans/pending-reality-demo-bundle.md` §6.3.
      const strictness =
        useDemoSettingsStore.getState().linterStrictness;
      const filteredIssues =
        strictness === "strict"
          ? issues.filter((i) => i.severity === "error")
          : issues;

      // PLAN-DEVIATION: 2026-05-11-clean-drops-stale-intercept —
      // compute the intercept scope BEFORE the live-commit-vs-
      // intercept decision, and scope-filter `filteredIssues` to
      // issues touching the dragged card. The previous shape ran the
      // decision on the session-wide raw `filteredIssues`, which
      // caused this bug:
      //
      //   1. User drags card A into a conflict slot, taps "Apply
      //      anyway" → live-commit. World now has a real conflict.
      //   2. User drags card B (or A again) to a clean slot. The
      //      linter still sees the session-wide conflict from step
      //      1 (or any pre-existing dirty intent in the session).
      //      `filteredIssues.length > 0` → sheet opens.
      //   3. The sheet's `useDisplayedIssues` scope-filters to the
      //      dragged card's id and finds zero matching rows. Its
      //      "scope filter emptied the sheet → fall back to
      //      unfiltered list" defensive branch then shows the user
      //      conflicts on cards they never touched.
      //
      // The fix moves the scope filter upstream: the dragged-card-
      // scoped issue list is the source of truth for "is this drop
      // clean from the user's perspective?". A scope-empty list now
      // takes the live-commit branch, even when the session has
      // unresolved conflicts on other cards. Same-card-becomes-clean
      // and other-card-was-already-clean both collapse to the same
      // branch — and the sheet only ever opens with issues that
      // genuinely touch the dragged card.
      //
      // The legacy `scopeAppointmentIds == null` path (create-intent
      // from scratch, no target id) is unchanged: render every
      // issue, same as before.
      const scopeAppointmentIds = computeInterceptScope({
        hypothetical,
        currentIntents: effectiveCurrentIntents,
        chainAppointments,
        resolvedTargetApptId,
      });

      const scopedIssues =
        scopeAppointmentIds == null
          ? filteredIssues
          : filteredIssues.filter((issue) =>
              issue.affectedAppointmentIds.some((id) =>
                scopeAppointmentIds.has(id),
              ),
            );

      // 2026-05-13 — Sentry move-pipeline observability. Computed
      // once and reused at every terminal outcome below. The
      // breadcrumbs (auto-captured from `[DEBUG:SessionAwareSubmit]`
      // console logs above) carry the verbose decision-tree state;
      // these capture calls are the anchor events that group by
      // outcome / intent type / view mode in the Sentry dashboard.
      // See `src/utils/sentry-diagnostics.ts` for the tag schema.
      const linterDecision: LinterDecision = linterThrew
        ? "errored"
        : scopedIssues.length === 0
          ? "clean"
          : "intercept";
      const moveContextBase = {
        source,
        intentType: hypothetical.intent_type,
        isRestage: existingIntentForCard != null,
        linterDecision,
        rawIssueCount: issues.length,
        scopedIssueCount: scopedIssues.length,
        sessionId: sessionId ?? null,
        viewMode: useCalendarStore.getState().viewMode ?? null,
        targetAppointmentId: resolvedTargetApptId,
        targetPersonalEventId: resolvedTargetPersonalEventId,
        submitId,
      } as const;

      Sentry.addBreadcrumb({
        category: "drag",
        level: "info",
        message: "submit start",
        data: {
          submitId,
          source,
          intentType: hypothetical.intent_type,
          isRestage: existingIntentForCard != null,
          capturedSessionId: sessionId ?? null,
          capturedIntentCount: currentIntents.length,
          targetAppointmentId: resolvedTargetApptId,
          targetPersonalEventId: resolvedTargetPersonalEventId,
          inflightCreateSessionSet: inflightCreateSession != null,
          activeInterceptId:
            useLinterInterceptHost.getState().request?.id ?? null,
        },
      });

      if (__DEV__) {
        const errors = filteredIssues.filter(
          (i) => i.severity === "error",
        ).length;
        const warnings = filteredIssues.length - errors;
        const scopedErrors = scopedIssues.filter(
          (i) => i.severity === "error",
        ).length;
        console.log("[DEBUG:SessionAwareSubmit] linter result", {
          rawIssueCount: issues.length,
          strictness,
          issueCount: filteredIssues.length,
          errors,
          warnings,
          scopedIssueCount: scopedIssues.length,
          scopedErrors,
          scopeSize: scopeAppointmentIds?.size ?? null,
          decision: scopedIssues.length === 0 ? "live-commit" : "intercept",
        });
      }

      // PLAN-DEVIATION: 2026-05-12-live-commit-deescalates-symmetric —
      // both the scope-clean and apply-anyway paths "live-commit"
      // (= write the new world directly to the BE without staging
      // an intent). When the dragged card already had a staged
      // intent in the active session, that intent is by definition
      // OBSOLETE the moment the live mutation lands — the card is
      // now where the live mutation says it is, not where the
      // intent said it would be. Leaving the orphan intent in
      // place causes the symptoms the user reported on 2026-05-12:
      //
      //   - The chip row keeps showing a chain step for the
      //     just-moved card, so the cascade count is wrong.
      //   - On a subsequent re-drag the chain detector still sees
      //     the orphan and fights the new submit.
      //   - The review screen lists a pending intent for a card
      //     that's already at its destination.
      //
      // Earlier shapes only fired the de-escalation in the
      // scope-clean branch (PR-UX-18, PLAN-DEVIATION
      // 2026-05-09-pr-ux-18-restage-modify-not-add). Apply-anyway
      // never fired it, so a re-drag of a staged card that the
      // user resolved via "Apply anyway" stayed orphan-staged
      // forever. The fix is symmetric: any path that ends in
      // `liveMutate(payload)` must also de-escalate the
      // existing-intent-for-this-card, since the resolved-world
      // outcome makes the stale intent meaningless.
      //
      // The de-escalation is local-first (`store.removeIntent`)
      // for synchronous UI feedback AND BE-second
      // (`removeIntent.mutate`) so the session row converges with
      // the server. On BE-mutation failure the user can clear the
      // orphan from the review screen — no worse than pre-PR-UX-18
      // and survivable.
      //
      // See docs/PLAN-DEVIATIONS.md#2026-05-12-live-commit-deescalates-symmetric.
      const deescalateExistingIntentForCard = (reasonTag: string) => {
        if (sessionId == null || !existingIntentForCard) return;
        if (__DEV__) {
          console.log(
            "[DEBUG:SessionAwareSubmit] de-escalating staged intent",
            {
              reason: reasonTag,
              sessionId,
              droppedIntentId: existingIntentForCard.id,
              dragTargetApptId: resolvedTargetApptId,
              remainingIntentCount: currentIntents.length - 1,
              note:
                "Local removeIntent for UI; BE remove_intent for backing.",
            },
          );
        }
        usePendingRealityStore
          .getState()
          .removeIntent(existingIntentForCard.id);
        // Fire-and-forget BE remove_intent. The await on
        // `liveMutate(payload)` below gates the user-visible
        // "card moved" feedback; the BE intent removal is
        // bookkeeping that races with realtime invalidation
        // safely.
        removeIntent.mutate({
          sessionId,
          intentId: existingIntentForCard.id,
          worldSnapshot,
        });
      };

      if (scopedIssues.length === 0) {
        // PLAN-DEVIATION: 2026-05-12-scope-clean-always-live-commit —
        // when the dragged card's SCOPED issue list is empty, this
        // is a "clean drop" from the user's perspective and we
        // ALWAYS live-commit, regardless of session state or any
        // apparent chain extension. Earlier shapes ran
        // `decideSessionSticky` here (gated on
        // `wouldExtendExistingChain`) so a session-active canvas
        // would stage clean drops to preserve cascade visibility.
        // That gate produced a user-visible bug: a re-move of a
        // previously live-committed card into a CLEAN slot was
        // forced into "Set intention" instead of "Apply anyways"
        // because the chain detector still saw the card at its
        // stale prior position and reported an apparent chain
        // link. The user's rule — *"Cards that are dropped without
        // conflict ... are just moved, no questions asked"* —
        // makes the chain-extension gate wrong by definition for
        // scope-clean drops.
        // See docs/PLAN-DEVIATIONS.md#2026-05-12-scope-clean-always-live-commit
        // (supersedes 2026-05-12-clean-re-move-deescalates).
        deescalateExistingIntentForCard("scope-clean-live-commit");
        if (__DEV__) {
          console.log(
            "[DEBUG:SessionAwareSubmit] live-commit (scope-clean, unconditional)",
            {
              sessionId,
              newIntentTargetApptId: resolvedTargetApptId,
              existingIntentCount: currentIntents.length,
              hadExistingIntentForCard: existingIntentForCard != null,
            },
          );
        }
        try {
          await liveMutate(payload);
        } catch (err) {
          captureMoveOutcome({
            ...moveContextBase,
            outcome: "errored",
            error: err,
            submitDurationMs: Date.now() - submitStartTs,
          });
          throw err;
        }
        if (__DEV__) {
          console.log("[DEBUG:SessionAwareSubmit] live-commit completed");
        }
        captureMoveOutcome({
          ...moveContextBase,
          outcome: "live-committed",
          submitDurationMs: Date.now() - submitStartTs,
        });
        return { kind: "live-committed" };
      }

      // 2026-05-08 (linter-sheet-filter-dragged): narrow the sheet's
      // rendered issues to rows touching the dragged card / its chain
      // (instead of dumping every pending issue from the active
      // session). Producer-side because we already have the candidate
      // intent, the existing intent set, and the unfiltered
      // appointment list — letting the sheet recompute would force it
      // to reach into Zustand for context that doesn't otherwise
      // belong there.
      // PR-UX-11 (2026-05-09): the helper is now narrowed to
      // dragged-card-only (Task D). The chain-walk hypothetical /
      // currentIntents are no longer consumed but stay in the
      // signature for future use. Pass `effectiveCurrentIntents`
      // anyway so the args are consistent with the linter call.
      //
      // 2026-05-11 (fix/clean-drops-stale-intercept): `scopedIssues`
      // and `scopeAppointmentIds` are now computed upstream so the
      // live-commit-vs-intercept decision sees the scoped view. We
      // pass the scoped list to the sheet (instead of the full
      // session-wide `filteredIssues`) so the sheet renders only
      // dragged-card-relevant rows by construction; the sheet's own
      // scope filter is now redundant but kept as defense-in-depth.

      if (__DEV__) {
        console.log("[DEBUG:SessionAwareSubmit] intercept scope", {
          scopeSize: scopeAppointmentIds?.size ?? null,
          scopeIds:
            scopeAppointmentIds == null
              ? null
              : Array.from(scopeAppointmentIds),
          totalIssueCount: filteredIssues.length,
          scopedIssueCount: scopedIssues.length,
        });
      }

      const presentStartTs = Date.now();
      Sentry.addBreadcrumb({
        category: "drag",
        level: "info",
        message: "intercept presented",
        data: {
          submitId,
          scopedIssueCount: scopedIssues.length,
          scopeIds:
            scopeAppointmentIds == null
              ? null
              : Array.from(scopeAppointmentIds),
        },
      });
      const choice = await present(scopedIssues, { scopeAppointmentIds });
      const presentDurationMs = Date.now() - presentStartTs;

      Sentry.addBreadcrumb({
        category: "drag",
        level: "info",
        message: "intercept resolved",
        data: {
          submitId,
          choice: choice ?? "dismissed",
          presentDurationMs,
        },
      });

      if (__DEV__) {
        console.log("[DEBUG:SessionAwareSubmit] intercept resolved", {
          submitId,
          choice: choice ?? "dismissed",
          presentDurationMs,
        });
      }

      if (choice === undefined) {
        // ESC / backdrop dismiss OR programmatic eviction (a second
        // `present(...)` arrived while this one was still open).
        // Both collapse to the same outcome: drop the live mutation,
        // canvas snaps back. 2026-05-13 — the short-lived
        // `"evicted"` + auto-stage path was reverted at user
        // request: "I don't want auto-staging." The bug surface we
        // care about now is "for drop A no sheet appears visually,"
        // which is a render problem, not a producer-side
        // eviction-policy problem.
        captureMoveOutcome({
          ...moveContextBase,
          outcome: "dismissed",
          submitDurationMs: Date.now() - submitStartTs,
        });
        return { kind: "dismissed" };
      }

      if (choice === "apply") {
        // PLAN-DEVIATION: 2026-05-12-live-commit-deescalates-symmetric —
        // apply-anyway is a live-commit (same as the scope-clean
        // path), so it must also de-escalate any existing staged
        // intent for the dragged card. Pre-2026-05-12 only the
        // scope-clean branch fired this; a user who resolved a
        // conflict via Apply anyway on a card that was already
        // staged was left with an orphan intent that re-drove the
        // chip row's chain count and confused subsequent drags.
        // See docs/PLAN-DEVIATIONS.md#2026-05-12-live-commit-deescalates-symmetric.
        deescalateExistingIntentForCard("apply-anyway-live-commit");

        // PLAN-DEVIATION: 2026-05-12-pending-move-overlap-soft-framing
        // foot-gun guard — when the user resolves the intercept by
        // tapping "Apply anyway", any R1 (`time_conflict` +
        // `collisionWith === "staged_intent"`) issue in the scoped
        // list names ANOTHER card's still-pending intent that now
        // overlaps the just-committed slot. Surface that consequence
        // via a non-blocking toast with a one-tap path to the
        // pending-reality review screen so the user can drop /
        // modify the conflicting intent. The dragged card's own
        // pre-existing intent was already cleared by the
        // de-escalate call above, so any survivor in
        // `effectiveCurrentIntents` is genuinely another card.
        //
        // We resolve the labels HERE rather than after `liveMutate`
        // because (a) the toast info doesn't depend on the live
        // mutation's response payload — it's purely "what was
        // pending before this commit landed?" — and (b) doing it
        // before the await lets us avoid a `useState` round-trip
        // for the lookup map. The toast is presented AFTER the
        // await so the live-mutate's optimistic UI lands first and
        // the toast doesn't appear over a still-moving card.
        const crossCardEntries: CrossCardCollisionEntry[] = [];
        if (resolvedTargetApptId != null) {
          const seenIntentIds = new Set<number>();
          for (const issue of scopedIssues) {
            if (issue.kind !== "time_conflict") continue;
            if (issue.collisionWith !== "staged_intent") continue;
            for (const apptId of issue.affectedAppointmentIds) {
              if (apptId === resolvedTargetApptId) continue;
              const otherIntent = effectiveCurrentIntents.find(
                (i) => i.appointment_id === apptId,
              );
              if (!otherIntent) continue;
              if (seenIntentIds.has(otherIntent.id)) continue;
              seenIntentIds.add(otherIntent.id);
              crossCardEntries.push({
                intentId: otherIntent.id,
                appointmentId: otherIntent.appointment_id,
                label: buildCollisionEntryLabel(otherIntent),
              });
            }
          }
        }

        try {
          await liveMutate(payload);
        } catch (err) {
          captureMoveOutcome({
            ...moveContextBase,
            outcome: "errored",
            error: err,
            submitDurationMs: Date.now() - submitStartTs,
          });
          throw err;
        }
        if (__DEV__) {
          console.log(
            "[DEBUG:SessionAwareSubmit] apply-anyway live-commit completed",
            {
              crossCardCollisionEntryCount: crossCardEntries.length,
              crossCardCollisionIntentIds: crossCardEntries.map(
                (e) => e.intentId,
              ),
            },
          );
        }
        if (crossCardEntries.length > 0) {
          useCrossCardCollisionToastStore.getState().present({
            committedLabel: buildCommittedLabel(proposed),
            entries: crossCardEntries,
          });
        }
        captureMoveOutcome({
          ...moveContextBase,
          outcome: "applied-anyway",
          submitDurationMs: Date.now() - submitStartTs,
        });
        return { kind: "applied-anyway" };
      }

      // choice === "stage" — ensure a session exists, then add the
      // proposed intent. The atomic create-with-initial-intents
      // path (one round trip, not two) is preferred when no session
      // is active yet.
      //
      // 2026-05-13 — root cause of the "every other card with
      // conflict does nothing" prod bug. Two submits running in
      // parallel (drag-evicted A + user-tap-Stage B) BOTH had
      // `sessionId === null` captured at submit-start, so both
      // hit the `createSession.mutateAsync` branch. Each
      // `createSession.onSuccess` calls `setSession(...)` which
      // REPLACES the local store's session — so the second
      // create's response wiped out the first's just-staged
      // intent. We now re-read store state freshly right before
      // the mutation decision so a session created by a
      // concurrent submit is visible.
      const liveStore = usePendingRealityStore.getState();
      const liveSessionId = liveStore.session?.id ?? null;
      const liveExistingIntentForCard =
        liveStore.intents.find((intent) => {
          if (resolvedTargetApptId == null && resolvedTargetPersonalEventId == null) {
            return false;
          }
          if (
            resolvedTargetApptId != null &&
            intent.appointment_id === resolvedTargetApptId
          ) {
            return true;
          }
          if (
            resolvedTargetPersonalEventId != null &&
            intent.personal_event_id === resolvedTargetPersonalEventId
          ) {
            return true;
          }
          return false;
        }) ?? null;
      Sentry.addBreadcrumb({
        category: "drag",
        level: "info",
        message: "stage path — store state pre-mutation",
        data: {
          choice,
          capturedSessionId: sessionId,
          liveSessionId,
          capturedIntentCount: currentIntents.length,
          liveIntentCount: liveStore.intents.length,
          capturedExistingId: existingIntentForCard?.id ?? null,
          liveExistingId: liveExistingIntentForCard?.id ?? null,
          targetAppointmentId: resolvedTargetApptId,
          targetPersonalEventId: resolvedTargetPersonalEventId,
        },
      });
      try {
      if (liveSessionId == null) {
        if (inflightCreateSession) {
          // 2026-05-13 — another submit is already creating a
          // session. Wait for it instead of starting a second
          // createSession that the BE would happily honor and
          // whose onSuccess `setSession` would stomp the first
          // submit's just-staged intent. After the wait, the
          // store has the freshly-created session and we fall
          // through to the addIntent branch.
          if (__DEV__) {
            console.log(
              "[DEBUG:SessionAwareSubmit] stage → awaiting inflight createSession from a parallel submit",
              { submitId },
            );
          }
          Sentry.addBreadcrumb({
            category: "drag",
            level: "info",
            message: "stage path — awaiting inflight createSession",
            data: { submitId },
          });
          try {
            await inflightCreateSession;
          } catch {
            // The other submit's createSession failed; surface
            // by falling through and trying our own create.
          }
          const refetchedStore = usePendingRealityStore.getState();
          const refetchedSessionId = refetchedStore.session?.id ?? null;
          Sentry.addBreadcrumb({
            category: "drag",
            level: "info",
            message: "stage path — inflight createSession resolved",
            data: {
              submitId,
              refetchedSessionId,
              refetchedIntentCount: refetchedStore.intents.length,
            },
          });
          if (refetchedSessionId != null) {
            // Re-check whether the now-staged set already has an
            // intent for this card (it might if the parallel
            // submit covered the same card; rare but possible).
            const refetchedExisting =
              refetchedStore.intents.find((intent) => {
                if (resolvedTargetApptId != null && intent.appointment_id === resolvedTargetApptId) return true;
                if (resolvedTargetPersonalEventId != null && intent.personal_event_id === resolvedTargetPersonalEventId) return true;
                return false;
              }) ?? null;
            if (refetchedExisting) {
              await modifyIntent.mutateAsync({
                sessionId: refetchedSessionId,
                intentId: refetchedExisting.id,
                intent: proposedForWire,
                worldSnapshot,
              });
            } else {
              await addIntent.mutateAsync({
                sessionId: refetchedSessionId,
                intent: proposedForWire,
                worldSnapshot,
              });
            }
          } else {
            // The other submit's createSession failed and the
            // store has no session. Take ownership of the lock
            // and retry our own createSession.
            const ownPromise = createSession.mutateAsync({
              initialIntents: [proposedForWire],
            });
            inflightCreateSession = ownPromise;
            try {
              await ownPromise;
            } finally {
              if (inflightCreateSession === ownPromise) {
                inflightCreateSession = null;
              }
            }
          }
        } else {
          if (__DEV__) {
            console.log(
              "[DEBUG:SessionAwareSubmit] stage → creating new session",
              { submitId },
            );
          }
          const ownPromise = createSession.mutateAsync({
            initialIntents: [proposedForWire],
          });
          inflightCreateSession = ownPromise;
          try {
            await ownPromise;
          } finally {
            if (inflightCreateSession === ownPromise) {
              inflightCreateSession = null;
            }
          }
          if (__DEV__) {
            console.log(
              "[DEBUG:SessionAwareSubmit] stage → session created with seed intent",
              { submitId },
            );
          }
        }
      } else {
        // PLAN-DEVIATION: 2026-05-09-pr-ux-18-restage-modify-not-add —
        // re-stage uses BE `modify_intent` to update payload in
        // place. See the equivalent branch in the linter-clean
        // session-sticky path above for the full rationale.
        if (liveExistingIntentForCard) {
          if (__DEV__) {
            console.log(
              "[DEBUG:SessionAwareSubmit] re-stage (intercept choice=stage): modify_intent",
              {
                intentId: liveExistingIntentForCard.id,
                sessionId: liveSessionId,
              },
            );
          }
          await modifyIntent.mutateAsync({
            sessionId: liveSessionId,
            intentId: liveExistingIntentForCard.id,
            intent: proposedForWire,
            worldSnapshot,
          });
        } else {
          if (__DEV__) {
            console.log(
              "[DEBUG:SessionAwareSubmit] stage → appending intent to existing session",
              { sessionId: liveSessionId },
            );
          }
          await addIntent.mutateAsync({
            sessionId: liveSessionId,
            intent: proposedForWire,
            worldSnapshot,
          });
          if (__DEV__) {
            console.log("[DEBUG:SessionAwareSubmit] stage → intent appended");
          }
        }
      }
      } catch (err) {
        captureMoveOutcome({
          ...moveContextBase,
          outcome: "errored",
          error: err,
          liveSessionIdAtMutation: liveSessionId,
          submitDurationMs: Date.now() - submitStartTs,
        });
        throw err;
      }
      // Post-mutation forensic breadcrumb — confirms the just-
      // staged intent actually landed in the local store and
      // wasn't immediately overwritten by another concurrent
      // submit's createSession (the original 2026-05-13 bug).
      const postStore = usePendingRealityStore.getState();
      const targetIdForCheck = resolvedTargetApptId;
      const targetPersonalEventIdForCheck = resolvedTargetPersonalEventId;
      const intentForOurCardLanded =
        postStore.intents.find((i) => {
          if (
            targetIdForCheck != null &&
            i.appointment_id === targetIdForCheck
          ) {
            return true;
          }
          if (
            targetPersonalEventIdForCheck != null &&
            i.personal_event_id === targetPersonalEventIdForCheck
          ) {
            return true;
          }
          return false;
        }) ?? null;
      Sentry.addBreadcrumb({
        category: "drag",
        level: intentForOurCardLanded ? "info" : "warning",
        message: "stage path — store state post-mutation",
        data: {
          submitId,
          choice,
          postSessionId: postStore.session?.id ?? null,
          postIntentCount: postStore.intents.length,
          postIntentIds: postStore.intents.map((i) => i.id),
          postIntentApptIds: postStore.intents.map((i) => i.appointment_id),
          targetAppointmentId: resolvedTargetApptId,
          targetPersonalEventId: resolvedTargetPersonalEventId,
          intentForOurCardLanded: intentForOurCardLanded?.id ?? null,
        },
      });
      if (!intentForOurCardLanded) {
        // 2026-05-13 — high-signal capture event when the post-
        // mutation store does NOT contain an intent for the card
        // we just dragged. This is the snap-back ground truth:
        // we made it to the staged-path, the BE call returned
        // (no error throw), but the local store doesn't have an
        // intent for this card. Most likely cause is a parallel
        // submit's createSession.onSuccess `setSession(...)`
        // replacing the store right after our `addIntent` /
        // `createSession` landed. Fires a Sentry message so we
        // see this even when the user hasn't otherwise hit an
        // error path.
        Sentry.withScope((scope) => {
          scope.setLevel("warning");
          scope.setTag("snapback.detected", "true");
          scope.setTag("move.submit_id", submitId);
          scope.setTag(
            "move.choice",
            choice === undefined ? "undefined" : String(choice),
          );
          scope.setExtras({
            submitId,
            choice,
            capturedSessionId: sessionId,
            liveSessionIdAtMutation: liveSessionId,
            postSessionId: postStore.session?.id ?? null,
            postIntentCount: postStore.intents.length,
            postIntentIds: postStore.intents.map((i) => i.id),
            postIntentApptIds: postStore.intents.map((i) => i.appointment_id),
            targetAppointmentId: resolvedTargetApptId,
            targetPersonalEventId: resolvedTargetPersonalEventId,
            submitDurationMs: Date.now() - submitStartTs,
          });
          Sentry.captureMessage(
            "snapback: stage-path completed but post-mutation store missing target intent",
            "warning",
          );
        });
      }
      captureMoveOutcome({
        ...moveContextBase,
        outcome: "staged",
        liveSessionIdAtMutation: liveSessionId,
        postMutationIntentCount: postStore.intents.length,
        postMutationIntentIds: postStore.intents.map((i) => i.id),
        submitDurationMs: Date.now() - submitStartTs,
      });
      return { kind: "staged" };
    },
    [
      buildProposedIntent,
      liveMutate,
      worldSnapshot,
      targetAppointmentId,
      targetPersonalEventId,
      chainAppointments,
      source,
      present,
      createSession,
      addIntent,
      modifyIntent,
      removeIntent,
    ],
  );
}
