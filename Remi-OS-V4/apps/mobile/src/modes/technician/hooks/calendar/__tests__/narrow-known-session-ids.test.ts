/**
 * 2026-05-05 — `narrowKnownSessionIds` unit tests (PR-UX-2 PASS 2.20).
 * 2026-05-09 — narrowed further in PR-UX-8 to drop pending_review.
 *
 * Pins the narrowed contract introduced in PASS 2.20 after the user
 * reported `ai_suggestion`-source `draft` sessions painting cyan
 * tiles even though Pending Reality said "Nothing pending yet,"
 * AND the additional PR-UX-8 narrowing that drops pending_review
 * sessions from the known set so just-finalized appointments stop
 * painting cyan on the FO's calendar.
 *
 * Contract under test (per the file's top-level comment block):
 *
 *   - Non-FO roles (technician) → returns `null` (legacy paint).
 *   - Either query unready → returns `null` (cold-start safety —
 *     dropping pending_review still requires the review query
 *     to have settled, otherwise the orphan-suppression branch
 *     would briefly fire on legitimate drafts).
 *   - FO/Franchisor + both queries loaded → returns a `Set<number>`
 *     containing:
 *       1. Local sessionId if non-null.
 *       2. ONLY franchise_dashboard drafts authored by the current
 *          user. ALL OTHER DRAFTS DROPPED — including ai_suggestion,
 *          tech_app, and franchise_dashboard drafts authored by a
 *          different FO in the same franchise.
 *       3. NO pending_review sessions, regardless of source. They
 *          have moved past the calendar-canvas lifecycle (PR-UX-8);
 *          the Pending Reality screen surfaces them via a separate
 *          query, no overlay needed.
 *
 * The whole point of this pass: an `ai_suggestion`-source `draft`
 * is NOT in the returned set, so `computePendingChangeOverlay` will
 * suppress its cyan paint when the BE annotation references it.
 * Same applies to any pending_review session per PR-UX-8.
 */

import { narrowKnownSessionIds } from "../use-known-reorganization-session-ids";
import type { ReorganizationSession } from "@technician/types/reorganization";

function makeSession(over: Partial<ReorganizationSession>): ReorganizationSession {
  return {
    id: 1,
    franchise_id: 10,
    author_user_id: 99,
    source: "ai_suggestion",
    status: "draft",
    required_authorizer_role: "franchise_owner",
    eligible_committer_ids: [7],
    policy_snapshot: {
      max_open_per_user: 5,
      max_intents_per_session: 50,
      auto_commit: false,
      requires_authorizer: "self",
    } as ReorganizationSession["policy_snapshot"],
    idempotency_key: null,
    notes: null,
    template_id: null,
    related_session_id: null,
    source_metadata: {},
    created_at: "2026-05-05T10:00:00Z",
    finalized_at: null,
    committed_at: null,
    cancelled_at: null,
    expires_at: null,
    ...over,
  };
}

describe("narrowKnownSessionIds — non-FO roles", () => {
  test("returns null for technicians (no enumeration possible)", () => {
    const result = narrowKnownSessionIds({
      isFranchiseOwner: false,
      userId: 7,
      localSessionId: 100,
      draftQueryReady: true,
      reviewQueryReady: true,
      drafts: [makeSession({ id: 200 })],
      reviews: [makeSession({ id: 201, status: "pending_review" })],
    });
    expect(result).toBeNull();
  });
});

describe("narrowKnownSessionIds — query loading state", () => {
  test("returns null when draft query not ready", () => {
    const result = narrowKnownSessionIds({
      isFranchiseOwner: true,
      userId: 7,
      localSessionId: null,
      draftQueryReady: false,
      reviewQueryReady: true,
      drafts: undefined,
      reviews: [],
    });
    expect(result).toBeNull();
  });

  test("returns null when review query not ready", () => {
    const result = narrowKnownSessionIds({
      isFranchiseOwner: true,
      userId: 7,
      localSessionId: null,
      draftQueryReady: true,
      reviewQueryReady: false,
      drafts: [],
      reviews: undefined,
    });
    expect(result).toBeNull();
  });
});

describe("narrowKnownSessionIds — FO with empty queries", () => {
  test("returns empty set when nothing is in flight", () => {
    const result = narrowKnownSessionIds({
      isFranchiseOwner: true,
      userId: 7,
      localSessionId: null,
      draftQueryReady: true,
      reviewQueryReady: true,
      drafts: [],
      reviews: [],
    });
    expect(result).not.toBeNull();
    expect(result?.size).toBe(0);
  });

  test("includes local sessionId when non-null", () => {
    const result = narrowKnownSessionIds({
      isFranchiseOwner: true,
      userId: 7,
      localSessionId: 123,
      draftQueryReady: true,
      reviewQueryReady: true,
      drafts: [],
      reviews: [],
    });
    expect(result?.has(123)).toBe(true);
    expect(result?.size).toBe(1);
  });
});

describe("narrowKnownSessionIds — pending_review sessions (PR-UX-8: always DROPPED)", () => {
  test("DROPS ai_suggestion pending_review session (PR-UX-8: was included pre-2026-05-09)", () => {
    const ai = makeSession({
      id: 301,
      source: "ai_suggestion",
      status: "pending_review",
      author_user_id: null,
    });
    const result = narrowKnownSessionIds({
      isFranchiseOwner: true,
      userId: 7,
      localSessionId: null,
      draftQueryReady: true,
      reviewQueryReady: true,
      drafts: [],
      reviews: [ai],
    });
    expect(result?.has(301)).toBe(false);
    expect(result?.size).toBe(0);
  });

  test("DROPS franchise_dashboard pending_review authored by current FO (the just-finalized case — repro for PR-UX-8)", () => {
    // The user-reported bug: FO finalizes their own session, the
    // pending_review row stays in the BE annotation, the calendar
    // keeps painting cyan, the FO drags the cyan card and spawns a
    // new draft on top of the just-finalized appointment. Dropping
    // the FO's own pending_review row from the known set is what
    // causes the orphan-suppression branch to suppress the paint.
    const myReview = makeSession({
      id: 302,
      source: "franchise_dashboard",
      status: "pending_review",
      author_user_id: 7, // current user
    });
    const result = narrowKnownSessionIds({
      isFranchiseOwner: true,
      userId: 7,
      localSessionId: null,
      draftQueryReady: true,
      reviewQueryReady: true,
      drafts: [],
      reviews: [myReview],
    });
    expect(result?.has(302)).toBe(false);
    expect(result?.size).toBe(0);
  });

  test("DROPS franchise_dashboard pending_review from another FO", () => {
    const otherFo = makeSession({
      id: 303,
      source: "franchise_dashboard",
      status: "pending_review",
      author_user_id: 88, // different from current user (7)
    });
    const result = narrowKnownSessionIds({
      isFranchiseOwner: true,
      userId: 7,
      localSessionId: null,
      draftQueryReady: true,
      reviewQueryReady: true,
      drafts: [],
      reviews: [otherFo],
    });
    expect(result?.has(303)).toBe(false);
  });

  test("DROPS tech_app pending_review", () => {
    const techReview = makeSession({
      id: 304,
      source: "tech_app",
      status: "pending_review",
      author_user_id: 42,
    });
    const result = narrowKnownSessionIds({
      isFranchiseOwner: true,
      userId: 7,
      localSessionId: null,
      draftQueryReady: true,
      reviewQueryReady: true,
      drafts: [],
      reviews: [techReview],
    });
    expect(result?.has(304)).toBe(false);
  });

  test("review-query unready still returns null even if drafts loaded (cold-start safety)", () => {
    // PR-UX-8: dropping pending_review from the union doesn't mean
    // we can ignore the review query's loading state. If we
    // returned the partial draft-only set during the cold-start
    // window, the orphan-suppression branch would briefly fire on
    // legitimate FO-self drafts that just so happen to have been
    // created during the loading gap. The hook MUST wait for both
    // queries before answering.
    const myDraft = makeSession({
      id: 405,
      source: "franchise_dashboard",
      status: "draft",
      author_user_id: 7,
    });
    const result = narrowKnownSessionIds({
      isFranchiseOwner: true,
      userId: 7,
      localSessionId: null,
      draftQueryReady: true,
      reviewQueryReady: false,
      drafts: [myDraft],
      reviews: undefined,
    });
    expect(result).toBeNull();
  });
});

describe("narrowKnownSessionIds — draft sessions (narrow filter)", () => {
  test("DROPS ai_suggestion drafts (the orphan-cyan repro case)", () => {
    const aiDraft = makeSession({
      id: 401,
      source: "ai_suggestion",
      status: "draft",
      author_user_id: null,
    });
    const result = narrowKnownSessionIds({
      isFranchiseOwner: true,
      userId: 7,
      localSessionId: null,
      draftQueryReady: true,
      reviewQueryReady: true,
      drafts: [aiDraft],
      reviews: [],
    });
    expect(result?.has(401)).toBe(false);
    expect(result?.size).toBe(0);
  });

  test("INCLUDES FO-self franchise_dashboard draft", () => {
    const myDraft = makeSession({
      id: 402,
      source: "franchise_dashboard",
      status: "draft",
      author_user_id: 7, // current user
    });
    const result = narrowKnownSessionIds({
      isFranchiseOwner: true,
      userId: 7,
      localSessionId: null,
      draftQueryReady: true,
      reviewQueryReady: true,
      drafts: [myDraft],
      reviews: [],
    });
    expect(result?.has(402)).toBe(true);
  });

  test("DROPS franchise_dashboard drafts authored by a different FO", () => {
    const otherFoDraft = makeSession({
      id: 403,
      source: "franchise_dashboard",
      status: "draft",
      author_user_id: 88, // different FO
    });
    const result = narrowKnownSessionIds({
      isFranchiseOwner: true,
      userId: 7,
      localSessionId: null,
      draftQueryReady: true,
      reviewQueryReady: true,
      drafts: [otherFoDraft],
      reviews: [],
    });
    expect(result?.has(403)).toBe(false);
    expect(result?.size).toBe(0);
  });

  test("DROPS tech_app drafts even with matching author_user_id (FO doesn't own tech drafts)", () => {
    const techDraft = makeSession({
      id: 404,
      source: "tech_app",
      status: "draft",
      author_user_id: 7, // edge case: a user with both roles?
    });
    const result = narrowKnownSessionIds({
      isFranchiseOwner: true,
      userId: 7,
      localSessionId: null,
      draftQueryReady: true,
      reviewQueryReady: true,
      drafts: [techDraft],
      reviews: [],
    });
    expect(result?.has(404)).toBe(false);
  });

  test("DROPS draft when userId is null (cannot match author_user_id)", () => {
    const myDraft = makeSession({
      id: 405,
      source: "franchise_dashboard",
      status: "draft",
      author_user_id: 7,
    });
    const result = narrowKnownSessionIds({
      isFranchiseOwner: true,
      userId: null,
      localSessionId: null,
      draftQueryReady: true,
      reviewQueryReady: true,
      drafts: [myDraft],
      reviews: [],
    });
    expect(result?.has(405)).toBe(false);
  });
});

describe("narrowKnownSessionIds — combined scenarios", () => {
  test("realistic FO-mode demo state — local session + AI pending_review + orphan AI draft (PR-UX-8: pending_review dropped)", () => {
    const localActive = 99001;
    const aiReview = makeSession({
      id: 501,
      source: "ai_suggestion",
      status: "pending_review",
    });
    const orphanAiDraft = makeSession({
      id: 502,
      source: "ai_suggestion",
      status: "draft",
      author_user_id: null,
    });
    const otherFoDraft = makeSession({
      id: 503,
      source: "franchise_dashboard",
      status: "draft",
      author_user_id: 88,
    });
    const myDraft = makeSession({
      id: 504,
      source: "franchise_dashboard",
      status: "draft",
      author_user_id: 7,
    });

    const result = narrowKnownSessionIds({
      isFranchiseOwner: true,
      userId: 7,
      localSessionId: localActive,
      draftQueryReady: true,
      reviewQueryReady: true,
      drafts: [orphanAiDraft, otherFoDraft, myDraft],
      reviews: [aiReview],
    });

    expect(result).not.toBeNull();
    // Included: local + my_draft
    expect(result?.has(localActive)).toBe(true);
    expect(result?.has(504)).toBe(true);
    // Dropped: ai_review (PR-UX-8) + orphan_ai_draft + other_fo_draft
    expect(result?.has(501)).toBe(false);
    expect(result?.has(502)).toBe(false);
    expect(result?.has(503)).toBe(false);
    expect(result?.size).toBe(2);
  });

  test("PR-UX-8 user repro — FO finalizes own draft → pending_review → calendar suppresses overlay", () => {
    // The user's exact repro after PR-UX-7 landed: FO had a
    // franchise_dashboard draft, finalized it on the review
    // screen, the BE flipped it to pending_review, and the
    // calendar kept painting cyan because PASS 2.20 unioned
    // pending_review wholesale. Pre-PR-UX-8 the session would be
    // in the known set; post-PR-UX-8 it's dropped, and the
    // existing orphan-suppression branch in
    // `computePendingChangeOverlay` will suppress the paint.
    const justFinalized = makeSession({
      id: 547,
      source: "franchise_dashboard",
      status: "pending_review",
      author_user_id: 7, // current user — they finalized it themselves
    });
    const result = narrowKnownSessionIds({
      isFranchiseOwner: true,
      userId: 7,
      localSessionId: null, // PR-UX-7 cleared the local store on finalize
      draftQueryReady: true,
      reviewQueryReady: true,
      drafts: [],
      reviews: [justFinalized],
    });
    expect(result).not.toBeNull();
    expect(result?.has(547)).toBe(false);
    expect(result?.size).toBe(0);
  });
});
