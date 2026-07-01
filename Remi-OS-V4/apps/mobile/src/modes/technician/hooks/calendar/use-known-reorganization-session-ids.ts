/**
 * `useKnownReorganizationSessionIds` (PR-UX-2 PASS 2.18 → narrowed
 * in PASS 2.20, 2026-05-05 → narrowed further in PR-UX-8,
 * 2026-05-09).
 *
 * Defensive companion to `usePendingChangeOverlay`. Builds the union
 * of "reorganization session ids the FO can act on or has authored
 * AND that should still paint a draft-state cyan tile on the
 * calendar canvas." Sessions outside this set get suppressed from
 * the BE-side `appointment.pending_intent_summary` annotation —
 * either because they're cross-actor drafts the FO can't see
 * (`ai_suggestion` orphans), or because they've already moved past
 * the local-composing lifecycle (`pending_review`, see PR-UX-8
 * below).
 *
 * # PASS 2.20 narrowing — why
 *
 * PASS 2.18 unioned EVERY active `draft` + `pending_review` session
 * in the franchise into the "known" set. That was wrong: an
 * `ai_suggestion`-source `draft` is not yet ready for FO eyes (the
 * AI engine emits at status `draft` and only promotes to
 * `pending_review` once it's ready for human review), so it doesn't
 * surface in `useAiSuggestionSessions` and doesn't appear in the
 * Pending Reality screen. The user's repro:
 *
 *   "Pending Reality says 'Nothing pending yet' but the calendar
 *    still paints cyan + sparkle '+1' badges on multiple cards."
 *
 * The orphan AI drafts WERE in the "known" set, so suppression
 * never fired. This pass narrows the contract to match what the
 * user can actually see on the Pending Reality screen.
 *
 * # PR-UX-8 narrowing — why (2026-05-09)
 *
 * PASS 2.20 still unioned EVERY `pending_review` session into the
 * known set on the assumption that those rows were "the FO's
 * actual queue" and should keep painting cyan so the FO knows to
 * act. The user-reported repro after PR-UX-7's finalize fix
 * landed:
 *
 *   "I was able to finalize this time, so good job. But after I
 *    did, I still was able to find staged cards on the calendar.
 *    I was able to move those and stage them as well, and then
 *    finalize them. But I kept finding more."
 *
 * Once an FO has finalized a session, the calendar's purpose for
 * the cyan tile (signaling "still editable / still in your local
 * draft") no longer applies — the session is submitted, awaiting
 * approval, and is not editable from the calendar canvas (the
 * Pending Reality screen owns that surface). Painting a cyan tile
 * on a `pending_review`-status appointment misled the FO into
 * thinking it was still draft-state; tapping/dragging it spawned a
 * NEW draft session and the cycle repeated.
 *
 * Mirror of PR-UX-7 at the BE-annotation layer: PR-UX-7 stopped
 * the local pending-reality store from re-hydrating `pending_review`
 * rows; PR-UX-8 stops the BE annotation from painting them. The
 * calendar reverts to "clean" view as soon as the FO finalizes;
 * the Pending Reality screen continues to surface the row for
 * approval. See `docs/PLAN-DEVIATIONS.md#2026-05-09-pending-review-overlay-suppression`.
 *
 * # The narrowed contract (PR-UX-8)
 *
 *   1. Always include `usePendingRealityStore.sessionId` if it's
 *      non-null. (Local active draft — this device staged it, the
 *      user knows about it.)
 *
 *   2. For FO / Franchisor:
 *      - Include `draft` sessions ONLY when:
 *          a. `source === "franchise_dashboard"` AND
 *          b. `author_user_id === current user id`.
 *        i.e. the FO authored it themselves on another device or
 *        web session. All other `draft` sessions (AI engine, other
 *        FO in the same franchise, tech) are NOT in the known set.
 *      - `pending_review` sessions are NEVER in the known set
 *        (PR-UX-8). They've moved past the calendar-canvas
 *        lifecycle; the Pending Reality screen renders them via
 *        a separate query, no overlay needed.
 *      - This means an `ai_suggestion` `draft` falls through to
 *        suppression (PASS 2.20) AND a `pending_review` session
 *        falls through to suppression (PR-UX-8). Both correctly
 *        produce a "clean" calendar.
 *
 *   3. For technicians: still return `null` (legacy behavior — no
 *      suppression). Tech-authored drafts always paint via the
 *      existing local-intents path; the BE annotation rarely fires
 *      for tech accounts on their own appointments.
 *
 * # Return contract
 *
 *   - `null` → user is a role we can't enumerate "actionable"
 *     sessions for (technician), OR the FO list is in flight /
 *     errored. Callers MUST treat `null` as "no suppression
 *     possible — fall back to legacy behavior" and let the BE
 *     annotation paint through. Safe default; missing data must
 *     never hide cyan paint that the BE thinks the user should
 *     see (better to show too much than hide a real signal).
 *
 *   - `Set<number>` → the narrow union of (1) and (2). When
 *     non-null and the BE annotation's `most_recent_session_id`
 *     is not in the set, the suppression branch in
 *     `computePendingChangeOverlay` drops the overlay + emits a
 *     `[Cleanup:OrphanedSession]` dev warn for observability.
 *
 * # Why a separate hook
 *
 *   - The three calendar wrappers (`ResourceCalendarDayView`,
 *     `ResourceCalendarWorkweekView`, `LandscapeWorkweekView`)
 *     would otherwise each carry the `useAuthStore` role check +
 *     the `useFranchiseReorganizationSessions` subscriptions +
 *     the narrowing logic. Drift between the three would be
 *     near-impossible to spot in review.
 *
 *   - The hook is the natural place to gate the FO subscription
 *     on role — calling `useFranchiseReorganizationSessions`
 *     unconditionally from a technician's wrapper would 403 on
 *     every render and pollute Sentry.
 *
 * NOT a replacement for `useAiSuggestionSessions`; the AI tab in
 * `app/pending-reality/review.tsx` still uses that selector
 * directly. Both hooks share the underlying
 * `useFranchiseReorganizationSessions` query, so the refetch and
 * cache hit only once across the screen tree per `staleTime`
 * window (TanStack Query dedupes by query key).
 */

import { useMemo } from "react";

import { useFranchiseReorganizationSessions } from "@technician/hooks/franchise/use-franchise-reorganizations";
import { usePendingRealityStore } from "@technician/stores/pending-reality";
import { useAuthStore } from "@/src/stores/auth";
import { UserRole } from "@technician/types/enums";
import type { ReorganizationSession } from "@technician/types/reorganization";

/**
 * Module-scope signature dedupe for the `[Cleanup:KnownSessions]
 * narrowed union` log line.
 *
 * Each consumer of this hook (the day view, the workweek view, the
 * landscape view, AND every `PendingChangeBadge` mount — one per
 * pending appointment) used to carry its own per-instance
 * `useRef<string | null>(null)` dedupe. With ~17 pending
 * appointments + the day-view host, that meant up to 18 instances
 * each emitting their own "first" line on every signature change.
 * Each signature change therefore produced 18 identical log lines,
 * not 1.
 *
 * Moving the ref to module scope means: across the whole React
 * tree, the log fires exactly ONCE per actual signature change.
 * The signature is fully derived from inputs that are themselves
 * shared across all consumers (TanStack Query data + local store
 * state + auth role), so per-instance dedupe never had a reason to
 * exist beyond the fact that the original implementation lived
 * inside the hook body.
 *
 * 2026-05-07 follow-up — see
 * `docs/DEVELOPMENT-LOG.md` (chip-row freeze entry) for the
 * cumulative log-volume cost this dedupe consolidation addresses.
 */
let lastNarrowedUnionSignature: string | null = null;

/**
 * Test-only reset hook for the module-scope signature dedupe.
 */
export function __resetNarrowedUnionLogDedupeForTests(): void {
  lastNarrowedUnionSignature = null;
}

/**
 * Pure helper exposed for unit testing — the hook below is a thin
 * subscription wrapper around this function. Call sites that need
 * the live data should use `useKnownReorganizationSessionIds()`.
 *
 * Returns `null` (no enumeration possible — fall back to legacy
 * paint) for non-FO roles or when either query is not yet loaded
 * / errored. Returns the narrowed set otherwise.
 *
 * The narrowing rules are documented on the file's top-level
 * comment block; this function is the single executable copy of
 * those rules.
 */
export function narrowKnownSessionIds(args: {
  isFranchiseOwner: boolean;
  userId: number | null;
  localSessionId: number | null;
  draftQueryReady: boolean;
  reviewQueryReady: boolean;
  drafts: ReorganizationSession[] | null | undefined;
  reviews: ReorganizationSession[] | null | undefined;
}): ReadonlySet<number> | null {
  if (!args.isFranchiseOwner) return null;
  if (!args.draftQueryReady || !args.reviewQueryReady) return null;

  const ids = new Set<number>();

  if (args.localSessionId != null) ids.add(args.localSessionId);

  // PR-UX-8 (2026-05-09): `pending_review` sessions are intentionally
  // NOT included. Once a session has moved past `draft`, the FO has
  // finalized it — the calendar's cyan-tile semantics ("still
  // editable in your local draft") no longer apply. The Pending
  // Reality screen owns the approval surface and reads the row
  // from a separate query, so dropping pending_review here does
  // NOT lose any user-visible signal — it only removes the stale
  // calendar-canvas paint that confused users into spawning new
  // drafts on top of just-finalized appointments. See the
  // file-level "PR-UX-8 narrowing — why" block.
  //
  // The `args.reviews` arg remains in the signature so callers
  // (and the hook below) can keep their `reviewQueryReady` gate
  // active — we still need both queries loaded before returning a
  // non-null set, otherwise the orphan-suppression branch could
  // briefly fire on legitimate `franchise_dashboard` drafts during
  // the cold-start window when only one query has settled. The
  // value of `args.reviews` itself is unused; intentional, keep it.
  void args.reviews;

  for (const session of args.drafts ?? []) {
    if (session.source !== "franchise_dashboard") continue;
    if (args.userId == null) continue;
    if (session.author_user_id !== args.userId) continue;
    ids.add(session.id);
  }

  return ids;
}

export function useKnownReorganizationSessionIds(): ReadonlySet<number> | null {
  const userRole = useAuthStore((s) => s.user?.role ?? null);
  const userId = useAuthStore((s) => s.user?.userId ?? null);
  const localSessionId = usePendingRealityStore((s) => s.sessionId);
  // Diagnostic-log dedupe — see the module-scope
  // `lastNarrowedUnionSignature` comment block. The signature
  // is shared across all consumers of this hook (every day /
  // workweek / landscape host + every `PendingChangeBadge` mount),
  // so a per-instance `useRef` would emit N identical lines on
  // each signature change. Single-source dedupe → 1 line per real
  // change.

  const isFranchiseOwner =
    userRole === UserRole.FRANCHISE_OWNER ||
    userRole === UserRole.FRANCHISOR;

  // Only fetch the franchise-wide list when the role can actually
  // read it. Technicians 403 on the route; firing the query on
  // their behalf would generate a stream of failed requests that
  // hide real auth errors in Sentry / log streams.
  //
  // We pull BOTH `draft` and `pending_review` because the BE's
  // `pending_intent_summary` annotation includes both statuses
  // (see `reorganization-intent-annotation.repository.ts:
  // ACTIVE_SESSION_STATUSES`). The list endpoint accepts only one
  // status at a time today, so we issue two queries. They share
  // the same staleTime window and are debounced through TanStack
  // Query.
  //
  // PASS 2.20 — we still pull both statuses, but the narrowing
  // logic below treats them differently: pending_review is unioned
  // wholesale; draft is filtered to `franchise_dashboard` +
  // FO-self-authored only.
  //
  // PR-UX-8 (2026-05-09) — pending_review sessions are NO LONGER
  // unioned. The query is still issued because `narrowKnownSessionIds`
  // gates on `reviewQueryReady` to avoid returning a half-loaded set
  // (which would otherwise let the orphan-suppression branch fire on
  // legitimate FO-self drafts during the cold-start window). Once
  // both queries have settled, only drafts contribute to the union.
  const draftQuery = useFranchiseReorganizationSessions({
    status: "draft",
    enabled: isFranchiseOwner,
  });
  const reviewQuery = useFranchiseReorganizationSessions({
    status: "pending_review",
    enabled: isFranchiseOwner,
  });

  return useMemo<ReadonlySet<number> | null>(() => {
    const ids = narrowKnownSessionIds({
      isFranchiseOwner,
      userId,
      localSessionId,
      draftQueryReady: !draftQuery.isPending && !draftQuery.isError,
      reviewQueryReady: !reviewQuery.isPending && !reviewQuery.isError,
      drafts: draftQuery.data,
      reviews: reviewQuery.data,
    });

    if (__DEV__ && ids != null) {
      const totalDrafts = draftQuery.data?.length ?? 0;
      const includedFoSelfDrafts = (draftQuery.data ?? []).filter(
        (s) =>
          s.source === "franchise_dashboard" &&
          userId != null &&
          s.author_user_id === userId,
      ).length;
      const reviewCount = reviewQuery.data?.length ?? 0;
      // Stable signature of fields the log emits — compare to last
      // emit so we only print on real change. Avoids the per-render
      // log flood that swamps drag / API / gesture logs in the
      // simulator stream. (Diagnosis aid added 2026-05-06 alongside
      // Phase 27.4 to keep the snap-in animation logs findable.)
      const signature = [
        userRole,
        userId,
        localSessionId,
        totalDrafts,
        includedFoSelfDrafts,
        reviewCount,
        ids.size,
      ].join("|");
      if (signature !== lastNarrowedUnionSignature) {
        lastNarrowedUnionSignature = signature;
        console.log("[Cleanup:KnownSessions] narrowed union", {
          role: userRole,
          userId,
          localSessionId,
          totalDrafts,
          includedFoSelfDrafts,
          droppedDrafts: totalDrafts - includedFoSelfDrafts,
          // PR-UX-8 (2026-05-09): pending_review sessions are no
          // longer in the known set — they were submitted, not
          // editable from the calendar canvas. Logged separately
          // so a regression that re-adds them stands out in
          // `knownCount` vs `droppedReviews`.
          reviewCount,
          droppedReviews: reviewCount,
          knownCount: ids.size,
        });
      }
    }
    return ids;
  }, [
    isFranchiseOwner,
    userId,
    localSessionId,
    draftQuery.isPending,
    draftQuery.isError,
    draftQuery.data,
    reviewQuery.isPending,
    reviewQuery.isError,
    reviewQuery.data,
    userRole,
  ]);
}
