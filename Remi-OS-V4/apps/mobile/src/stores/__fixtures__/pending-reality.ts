/**
 * Shared `usePendingRealityStore` fixtures (P3-FE-1 / FE-2 / FE-3 /
 * FE-4 test suites).
 *
 * Lives in `src/stores/__fixtures__/` (not `src/stores/__tests__/`)
 * because:
 *   - It is consumed by tests in three different folders
 *     (`src/components/calendar/__tests__/PendingRealityFAB.test.tsx`,
 *     `src/components/calendar/landscape/__tests__/PendingRealityHUD.test.tsx`,
 *     `app/pending-reality/__tests__/review.test.tsx`).
 *   - Jest's default `testPathIgnorePatterns` ignores `__fixtures__`
 *     subfolders so the file itself is not picked up as a test
 *     suite (no `describe`/`it` callsites).
 *   - The closest precedent in this repo is
 *     `src/utils/__fixtures__/linter-cases/*.json` (P1-BE-4 linter
 *     contract test corpus).
 *
 * Each factory returns a fresh object so tests can mutate or pass to
 * the store without aliasing across suites.
 */

import type {
  ReorganizationIntent,
  ReorganizationIntentPayload,
  ReorganizationIntentType,
  ReorganizationSession,
} from "@technician/types/reorganization";

/**
 * Default policy snapshot — mirrors what the BE currently emits for
 * tech-authored sessions. Pulled out as a constant so tests asserting
 * on policy rules can override one field without re-typing the whole
 * shape.
 */
export const DEFAULT_POLICY_SNAPSHOT = {
  tech_authored_self_only: "auto",
  tech_authored_cross_tech: "fo_review",
  tech_authored_with_cancel: "fo_review",
  customer_authored_single: "auto",
  customer_authored_multi: "fo_review",
  customer_authored_with_conflict: "fo_review",
  ai_authored: "always_fo_review",
} as const satisfies ReorganizationSession["policy_snapshot"];

/**
 * Build a `ReorganizationSession` with sensible test defaults. Pass
 * `overrides` to flip any field — the spread is shallow so nested
 * objects (e.g. `policy_snapshot`, `source_metadata`) replace the
 * default wholesale.
 *
 * Default `id` is `7001` so suites that don't override it land in a
 * predictable place; pass an explicit `id` if a test cares about
 * the value.
 */
export function makeSession(
  overrides: Partial<ReorganizationSession> = {},
): ReorganizationSession {
  return {
    id: 7001,
    franchise_id: 1,
    author_user_id: 42,
    source: "tech_app",
    status: "draft",
    required_authorizer_role: "self",
    eligible_committer_ids: [42],
    policy_snapshot: { ...DEFAULT_POLICY_SNAPSHOT },
    idempotency_key: "test-key-7001",
    notes: null,
    template_id: null,
    related_session_id: null,
    source_metadata: {},
    created_at: "2026-04-23T15:00:00.000Z",
    finalized_at: null,
    committed_at: null,
    cancelled_at: null,
    expires_at: null,
    ...overrides,
  };
}

/**
 * Build a `ReorganizationIntent` with sensible defaults. The default
 * shape is a `reschedule` against a synthetic appointment id derived
 * from `id` (so suites that build N intents get N distinct
 * appointment targets without a collision).
 *
 * Pass `overrides` to flip any field — e.g.
 *
 *   makeIntent(130, { intent_type: "cancel", payload: { kind: "cancel", cancellation_reason: "customer_request" } })
 *
 * Note: when overriding `intent_type`, also override `payload` so the
 * discriminated union stays consistent. The factory does not enforce
 * this at the type level (the overrides are `Partial<>`), but the
 * BE-mirrored types in `src/types/reorganization.ts` will reject
 * mismatched (kind, intent_type) combos at the consumer site.
 */
export function makeIntent(
  id: number,
  overrides: Partial<ReorganizationIntent> = {},
): ReorganizationIntent {
  const defaultPayload: ReorganizationIntentPayload = {
    kind: "reschedule",
    new_scheduled_date: "2026-04-24",
    new_start_time: "09:00",
    new_end_time: "10:00",
  };
  const intentType: ReorganizationIntentType =
    overrides.intent_type ?? "reschedule";
  return {
    id,
    session_id: 7001,
    intent_type: intentType,
    intent_status: "proposed",
    appointment_id: 5000 + id,
    personal_event_id: null,
    payload: defaultPayload,
    inverse_payload: null,
    prior_state_snapshot: null,
    linter_dependency_edges: [],
    commit_order: null,
    proposed_at: "2026-04-23T15:01:00.000Z",
    committed_at: null,
    // Default `chain_id: ""` is a sentinel for "no BE chain_id
    // provided" — the detector treats empty/falsy values as missing
    // and falls back to its synthesized `chain-{seedIntentId}` group
    // id (PLAN-DEVIATION 2026-05-10-sticky-chain-identity-fe). This
    // keeps the bulk of legacy tests (which assert on the
    // synthesized chain id shape) working unchanged. Tests covering
    // the new sticky-chain behavior set `chain_id` explicitly to a
    // shared UUID-shape to exercise the BE-merge path (e.g.
    // `makeIntent(1, { chain_id: "uuid-A" })`,
    // `makeIntent(2, { chain_id: "uuid-A" })` produce one merged
    // chain even when their FE topology splits them).
    chain_id: "",
    // FE-CR-1-1: BE-attached wire fields (serializeIntent). Default
    // `clean: true, conflicts: []` matches the shape the BE ships
    // on mutation responses (POST /create, PATCH /update,
    // commit-many, etc.) where `serializeSession` passes an empty
    // issues array. Tests asserting on the conflict path override
    // these explicitly (`makeIntent(1, { clean: false, conflicts:
    // [...] })`). Tests asserting on BE drift use `clean: undefined`.
    clean: true,
    conflicts: [],
    ...overrides,
  };
}
