/**
 * Reorganization-session mutation hooks.
 *
 * The Pending Reality review screen (`app/pending-reality/review.tsx`)
 * and the linter UI primitives (`src/components/linter/*` per
 * P3-FE-5) consume the hooks defined here. Per the master plan
 * §5.3.3 hooks family, the eventual fully-shipped surface is
 * `useCreateReorganizationSession` / `useUpdateReorganizationSession`
 * / `useFinalizeReorganizationSession` / `useCommitReorganizationSession`
 * / `useCancelReorganizationSession` / etc.; chunks land them
 * incrementally as their consumers ship.
 *
 * Currently shipped:
 *   - `useFinalizeReorganizationSession` (P3-FE-4) — review screen's
 *     "Finalize" CTA. Returns a discriminated-union result so the
 *     screen can render `linter_rejected` 422 responses inline as
 *     data (not as `.isError`).
 *   - `useApplyAutoFix` (P3-FE-9) — `LinterEdgeCard`'s "Apply
 *     auto-fix" CTA. Backed by the BE's `PATCH /reorganizations/:id`
 *     `modify_intent` op (master plan §6.2). Refreshes both the
 *     session and intents in `usePendingRealityStore` and re-runs
 *     the local linter on success. Throws on 422 / network faults
 *     so the consumer can render a toast / retry CTA.
 *
 * Finalize server contract — reconciled with the SHIPPED BE in
 * P3-FE-12 (§8.8 Prompt C.16). The original P3-FE-4 spec (Master
 * plan §6.1 / §6.2) used a `status: 'committed' | 'pending_review'`
 * field on the 200 body and a `linter_failed` 422 message; the BE
 * actually shipped `auto_committed: boolean` + `linter_warnings:
 * LinterIssue[]` on 200, and `linter_errors_block_finalize` with
 * `data.issues` on 422 (post-`P6-BE-8`). This hook now follows the
 * shipped wire shape; see PLAN-DEVIATION marker on the hook for the
 * full rationale.
 *
 *   POST /api/v1/technician/reorganizations/:id/finalize
 *
 *   200 →
 *     { error: false, message: 'Session finalized',
 *       data: {
 *         session: ReorganizationApiSession,  // serializeSession(session, intents)
 *         auto_committed: boolean,
 *         linter_warnings: LinterIssue[],
 *       } }
 *     The server-side linter passed. `auto_committed: true` means
 *     the session committed inline (`requiresAuthorizer === 'self'`
 *     per §4.4); `auto_committed: false` means the session advanced
 *     to `pending_review` awaiting FO authorization. `linter_warnings`
 *     are issues the user should see but did NOT block commit (the
 *     BE shipped warning-vs-error severity in `lintSession`).
 *
 *   422 →
 *     { error: true, message: 'linter_errors_block_finalize',
 *       data: { issues: LinterIssue[] } }
 *     The server-side linter found at least one `severity: "error"`
 *     issue. The review screen surfaces these issues inline (per
 *     §5.2.4 / §5.3.5) so the user can resolve them before retrying.
 *     The 422 is the *normal* failure path for finalize — it is not
 *     a network or auth fault. `data.issues` was added by `P6-BE-8`
 *     (master plan §8.8 Prompt C.15); on a pre-C.15 BE the array is
 *     absent and we degrade to `issues: []` with a `console.warn`.
 *
 *   Other 4xx / 5xx → re-thrown as a generic AxiosError; the screen
 *     shows a "Couldn't reach server" toast and does NOT clear the
 *     store (the user's draft is still locally valid).
 *
 * Rationale for parsing the 422 body explicitly here (rather than
 * letting the screen handle a raw AxiosError):
 *
 *   - The 422 response is structured: `{ data: { issues } }`. The
 *     server already ran the same shared `lintSession` (per §3.10) and
 *     produced `LinterIssue[]` matching the local linter type. Pulling
 *     it out at the hook layer keeps the screen free of axios-specific
 *     shape parsing.
 *   - On 422, we resolve the mutation as a `linter_rejected` discriminated
 *     union (NOT a thrown error), so callers can render the inline
 *     linter cards via TanStack Query's `data` handler instead of
 *     branching on `.isError`. Network / auth faults still throw and
 *     trip `.isError` like normal.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { AxiosError } from "axios";
import * as Crypto from "expo-crypto";

import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import { useAuthStore } from "@/src/stores/auth";
import { usePendingRealityStore } from "@technician/stores/pending-reality";
import type { ApiResponse } from "@technician/types/api";
import type {
  ReorganizationIntent,
  ReorganizationIntentPayload,
  ReorganizationSession,
} from "@technician/types/reorganization";
import type {
  LinterIssue,
  LinterWorldSnapshot,
} from "@technician/utils/logistics-linter";
import { calendarKeys } from "@technician/hooks/schedule/use-calendar";
import { reconcileActiveSession } from "@technician/hooks/schedule/reconcile-active-session";

/**
 * The BE's serialized session shape (REMIBackend
 * `src/routes/v1/_helpers/reorganization.ts#serializeSession`):
 * a flattened `ReorganizationSession` plus a nested `intents[]`.
 * Mirroring the wire shape on the result type lets consumers reach
 * for `result.session.intents` without a separate split — useful
 * for the review screen's success summary, where the freshly-
 * committed intent set is the source of truth for "what just
 * happened" copy.
 */
export type ReorganizationApiSession = ReorganizationSession & {
  intents: ReorganizationIntent[];
};

// ──────────────────────────────────────────────────────────────────
// `useReorganizationSession(id)` (P3-FE-REHYDRATE-DETAIL)
// ──────────────────────────────────────────────────────────────────
//
// Detail GET for a single reorganization session — the foundation
// query the realtime hook (`useRealtimeReorganization`) already
// invalidates via `["reorganizations", "session", id]`. Owning
// section: `docs/implementation-plans/pending-reality-rehydration-plan.md`
// §6.1.
//
// Two consumers:
//   - The review screen mounts this hook with
//     `usePendingRealityStore.sessionId` so realtime status changes
//     (`session_finalized`, `authorization_*`, etc.) refetch the
//     authoritative row and write the store via the shared
//     `reconcileActiveSession` helper. Before this chunk those
//     invalidations had no subscriber and were silently dead.
//   - `useActiveReorganization()` (FE chunk 2,
//     `P3-FE-REHYDRATE-MOUNT`) reuses the same `reconcileActiveSession`
//     helper from its own `queryFn` so the cold-start path and the
//     realtime path share one tested code path (§6.3).
//
// TanStack Query v5 note: v5 removed `onSuccess`/`onError` from
// `useQuery`. The plan §6.1's pseudocode and §6.4 test plan describe
// the side effect as `onSuccess(data) → reconcileActiveSession(...)`
// + an `onError` 404 branch — both behaviors are preserved by
// running the reconcile inside `queryFn` directly:
//   - On success: reconcile with `data` and return it.
//   - On 404: reconcile with `null` (BE has no active session for
//     this id; the local draft is dead) and rethrow so `query.error`
//     surfaces for callers that want to render a "session ended"
//     state.
//   - On any other error (network, 5xx, 401-after-refresh-failure):
//     leave the store untouched and rethrow.
// The user-visible contract is the same as the §6.4 test plan; the
// implementation site differs because of v5's API.

/**
 * `useReorganizationSession` — detail query for a single
 * reorganization session, keyed to match the realtime hook's
 * invalidation key exactly.
 *
 * Pass `null` when no session id is known so consumers can wire it
 * to `usePendingRealityStore.sessionId` without conditional
 * rendering — `enabled: id != null` keeps the query disabled until
 * an id is available.
 *
 * `staleTime: Infinity` because the server is the source of truth
 * for the row; the only paths that should refresh the cache are
 * (a) realtime invalidations from `useRealtimeReorganization`, and
 * (b) cache writes from the mutation hooks (FE chunk 2 wires those
 * via `queryClient.setQueryData`).
 */
export function useReorganizationSession(
  id: number | null,
): UseQueryResult<ReorganizationApiSession> {
  return useQuery<ReorganizationApiSession, AxiosError>({
    queryKey: ["reorganizations", "session", id],
    queryFn: async () => {
      // `enabled: id != null` makes this branch dead in production —
      // the throw is a defensive guard so a future caller that bypasses
      // the gate gets a clear error instead of a silent
      // `Endpoints.reorganizations.detail(null)` URL.
      if (id == null) {
        throw new Error(
          "useReorganizationSession queryFn invoked with null id — caller bypassed the `enabled` gate.",
        );
      }
      try {
        const data = await api<ReorganizationApiSession>(
          "get",
          Endpoints.reorganizations.detail(id),
        );
        // Pull state via `getState()` (NOT the hook). The hook would
        // subscribe this code path to store changes and re-render
        // every consumer of the query on every store update. The
        // reconcile is a one-way write into the store; reading the
        // current `sessionId` for the no-op-vs-clear branch is the
        // only state read we need.
        reconcileActiveSession(
          data,
          usePendingRealityStore.getState(),
          "useReorganizationSession.queryFn(success)",
        );
        return data;
      } catch (rawErr) {
        const err = rawErr as AxiosError;
        if (err.response?.status === 404) {
          // The BE has no record (or no longer accepts) this session
          // id — could be a session that finalized + committed
          // between mount and this GET firing, or an id stale from
          // an old cold-start. Either way the local draft is dead;
          // clear the store before letting TanStack Query surface
          // the error so the review screen can render a "session
          // ended" empty state without the FAB showing stale chains.
          reconcileActiveSession(
            null,
            usePendingRealityStore.getState(),
            "useReorganizationSession.queryFn(404)",
          );
        }
        throw rawErr;
      }
    },
    enabled: id != null,
    staleTime: Infinity,
  });
}

// ──────────────────────────────────────────────────────────────────
// `useActiveReorganization` (P3-FE-REHYDRATE-MOUNT)
// ──────────────────────────────────────────────────────────────────
//
// Cold-start GET for the caller's currently-active reorganization
// session — the chunk that actually fixes the "Expo Go reload empties
// the staged appointments" bug. Owning section:
// `docs/implementation-plans/pending-reality-rehydration-plan.md` §7.
//
// Mounted from `app/(tabs)/_layout.tsx` adjacent to
// `useRealtimeReorganization()` so the cold-start GET fires once per
// authenticated tabs region. The hook exposes `UseQueryResult` for
// debug/test surfaces but no consumer reads it directly — the
// reconcile inside `queryFn` is the only side effect that matters
// (writes `usePendingRealityStore` via the shared
// `reconcileActiveSession` helper).
//
// Auth gate matches `useRealtimeReorganization` byte-for-byte —
// `isAuthenticated && franchiseId != null` via two separate
// `useAuthStore` selectors so cross-store-version equality works the
// same way and so a franchise-switch on login can't return a stale
// answer (the franchise id is folded into the query key).
//
// Cache invalidation comes from two sides, both already wired:
//   - `useRealtimeReorganization` invalidates `["reorganizations"]`
//     (prefix-match), which covers this key.
//   - The mutation hooks (`useCreate` / `useFinalize` / `useCancel` /
//     `useApplyAutoFix` / `useAddIntent` / `useModifyIntent`) write
//     into this cache directly via `cacheReorganizationResult` below
//     so a re-mount reads from cache instead of round-tripping. The
//     write avoids a redundant network refetch on the next render
//     (per the plan §7.3 — required in this chunk, not deferred).
//
// `staleTime: Infinity` because the BE is the source of truth: the
// only legitimate refresh paths are realtime invalidation (which
// triggers a refetch) and direct cache writes from mutation hooks
// (which seed the canonical row). A time-based stale would race the
// realtime path and produce double-fetches.

/**
 * `useActiveReorganization` — mount-time GET for the caller's active
 * reorganization session, used to rehydrate `usePendingRealityStore`
 * on cold start (e.g. after an Expo Go reload).
 *
 * Returns `UseQueryResult<ReorganizationApiSession | null>`:
 *   - `data === null` when the BE reports no active session (the
 *     reconcile clears the store if it had a stale one).
 *   - `data` populated when the BE returns the caller's session +
 *     intents (the reconcile hydrates the store).
 *
 * Disabled (no fetch fires) when the user is logged out OR when
 * `user.franchiseId` is null — same gate as `useRealtimeReorganization`.
 *
 * The reconcile happens inside `queryFn` (not `onSuccess`, which
 * TanStack Query v5 removed from `useQuery`) so the cold-start path
 * and the realtime path share one tested code path via
 * `reconcileActiveSession`.
 */
export function useActiveReorganization(): UseQueryResult<
  ReorganizationApiSession | null
> {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const franchiseId = useAuthStore((s) => s.user?.franchiseId ?? null);

  return useQuery<ReorganizationApiSession | null, AxiosError>({
    queryKey: ["reorganizations", "mine", "active", franchiseId],
    queryFn: async () => {
      try {
        const data = await api<ReorganizationApiSession | null>(
          "get",
          Endpoints.reorganizations.mineActive,
        );
        // Pull state via `getState()` (NOT the hook) for the same
        // reason as `useReorganizationSession`: the reconcile is a
        // one-way write into the store; subscribing here would
        // re-render every consumer of the query on every store
        // update. The reconcile reads the current `sessionId` for
        // the no-op-vs-clear branch and writes via `setSession` /
        // `clear`.
        reconcileActiveSession(
          data,
          usePendingRealityStore.getState(),
          "useActiveReorganization.queryFn(success)",
        );
        return data;
      } catch (rawErr) {
        const err = rawErr as AxiosError;
        if (err.response?.status === 404) {
          // Defensive — `mine/active` should always 200 with `data:
          // null` if there's no session, but if the BE ever 404s
          // (e.g. a misrouted request, an old client) treat it as
          // "no active session": evict any stale local draft and
          // surface the error so the caller can render a non-fatal
          // empty state.
          reconcileActiveSession(
            null,
            usePendingRealityStore.getState(),
            "useActiveReorganization.queryFn(404)",
          );
        }
        throw rawErr;
      }
    },
    enabled: isAuthenticated && franchiseId != null,
    staleTime: Infinity,
  });
}

// ──────────────────────────────────────────────────────────────────
// `cacheReorganizationResult` — mutation-hook cache-write helper
// (P3-FE-REHYDRATE-MOUNT §7.3)
// ──────────────────────────────────────────────────────────────────
//
// Each mutation hook below writes the freshly-shaped session into the
// active-session query cache (and the per-session detail cache) on
// success so a re-mount of `useActiveReorganization()` /
// `useReorganizationSession(id)` reads from cache instead of
// round-tripping the BE. Without this, every successful mutation
// triggers a redundant network refetch on the next render — the
// realtime invalidation of `["reorganizations"]` would otherwise
// invalidate the active-session query our own mutation just resolved.
//
// `result` is `null` for the cancel terminal branch (the active
// session is gone; cache the absence). For every other op, pass
// the canonical `ReorganizationApiSession` (`session + intents`
// flat shape) the BE returned. The per-session detail cache only
// gets a write when `result != null` because we never want to
// overwrite a session row with `null` — the per-session detail's
// own 404 path handles eviction.
//
// `franchiseId` is the same selector the active query keys on. If
// the caller passes `null` (defensive — shouldn't happen because
// the mutation gate is the same), the helper no-ops both writes.
// `setQueryData` is idempotent: if the consumer hooks haven't
// shipped yet, the write seeds the cache so the next consumer mount
// is a cache hit.

export function cacheReorganizationResult(
  queryClient: QueryClient,
  franchiseId: number | null,
  result: ReorganizationApiSession | null,
): void {
  if (franchiseId == null) {
    // Defensive no-op. The mutations themselves are gated on
    // authenticated + franchise-scoped, so this branch is dead in
    // production; the guard exists so a future caller that bypasses
    // the auth gate (test harness, dev-screen seed) can't write
    // under a `null` key and orphan the row.
    return;
  }
  queryClient.setQueryData(
    ["reorganizations", "mine", "active", franchiseId],
    result,
  );
  if (result != null) {
    queryClient.setQueryData(
      ["reorganizations", "session", result.id],
      result,
    );
  }
}

/**
 * Discriminated-union result type for `finalize`. The screen branches
 * on `.kind` to decide between "navigate back to calendar tab" (200,
 * either auto-commit or pending-review) and "render issues inline"
 * (422). Both shapes resolve via TanStack Query's `data`; only
 * network / auth failures throw.
 *
 * `warnings` on the success branches carries `linter_warnings` from
 * the BE — non-blocking issues the user should see (e.g. SLA hint,
 * drive-time soft warning) but that did NOT prevent commit. Empty
 * array when the BE returned no warnings.
 */
export type FinalizeReorganizationResult =
  | {
      kind: "committed";
      session: ReorganizationApiSession;
      warnings: LinterIssue[];
    }
  | {
      kind: "pending_review";
      session: ReorganizationApiSession;
      warnings: LinterIssue[];
    }
  | {
      kind: "linter_rejected";
      issues: LinterIssue[];
    };

interface FinalizeSuccessPayload {
  session: ReorganizationApiSession;
  auto_committed: boolean;
  linter_warnings?: LinterIssue[];
}

interface FinalizeLinterRejectionPayload {
  issues?: LinterIssue[];
}

// PLAN-DEVIATION: 2026-04-24-finalize-hook-contract-reconcile —
//   the original P3-FE-4 spec returned `{ session, status:
//   "committed" | "pending_review" }` on 200; the shipped BE
//   returns `{ session, auto_committed, linter_warnings }`. This
//   hook now derives the FE-facing `kind` from `auto_committed`
//   and surfaces `linter_warnings` as `warnings` on the result.
//   See docs/PLAN-DEVIATIONS.md#2026-04-24-finalize-hook-contract-reconcile
//   for the contract drift, the reasoning, and anti-instructions.
/**
 * Internal variables shape the underlying mutation consumes — the
 * wrapped `mutate` / `mutateAsync` below auto-generate the
 * `Idempotency-Key` so external callers continue to pass just a
 * `sessionId` (number) like every other call site in the codebase.
 *
 * 2026-05-11 — the BE began rejecting finalize requests that omit
 * the `Idempotency-Key` header with 400 `idempotency_key_required`
 * (matching the sibling `create` / `cancel` / `add_intent` /
 * `modify_intent` / `remove_intent` / `authorize` mutation
 * endpoints, all of which already enforced this). Without the
 * key the review screen's "Finalize" CTA dead-ended with a
 * "Couldn't finalize — Something went wrong reaching the server"
 * alert because the producer threw before the BE could even run
 * the linter / state machine.
 */
interface FinalizeReorganizationVariables {
  sessionId: number;
  /**
   * Pre-generated `Idempotency-Key`. The wrapped `mutate` /
   * `mutateAsync` exposed by `useFinalizeReorganizationSession()`
   * auto-generates one per call so consumers keep the same
   * `mutate(sessionId, options)` shape they had before this
   * header became mandatory. Tests / replay scenarios may pass
   * an explicit key.
   */
  idempotencyKey: string;
}

/**
 * `useFinalizeReorganizationSession` — fires the server-side finalize
 * for the active draft session.
 *
 * On success (HTTP 200) the TanStack Query calendar caches are
 * invalidated so the post-commit world replaces the pre-commit world
 * in the calendar tab. On 422 (linter rejection) caches are NOT
 * invalidated — the user's draft is still authoritative locally.
 *
 * Wire shape:
 *   POST /reorganizations/:id/finalize
 *   Headers: { "Idempotency-Key": <uuid> }
 *   Body: (none)
 *
 * The wrapper auto-generates one `Idempotency-Key` per `mutate()`
 * call. TanStack Query reuses the same variables on transient
 * retries within a single call, so the BE's idempotency middleware
 * deduplicates retries automatically. A separate user-initiated
 * retry (tap the button again) is a fresh `mutate()` and therefore
 * gets a fresh key.
 */
export function useFinalizeReorganizationSession() {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    FinalizeReorganizationResult,
    AxiosError,
    FinalizeReorganizationVariables
  >({
    mutationFn: async ({ sessionId, idempotencyKey }) => {
      try {
        const data = await api<FinalizeSuccessPayload>(
          "post",
          Endpoints.reorganizations.finalize(sessionId),
          undefined,
          { headers: { "Idempotency-Key": idempotencyKey } },
        );
        const warnings = Array.isArray(data.linter_warnings)
          ? data.linter_warnings
          : [];
        // Per-branch literals for the discriminated-union construction
        // (NOT a conditional `kind` assignment). A ternary over
        // `kind: auto_committed ? "committed" : "pending_review"`
        // narrows wrong and trips the same `TS2322` pattern P3-FE-4's
        // retro called out — TS widens the inferred return to the
        // union of all `kind` strings, which fails the variant check.
        if (data.auto_committed) {
          return {
            kind: "committed",
            session: data.session,
            warnings,
          };
        }
        return {
          kind: "pending_review",
          session: data.session,
          warnings,
        };
      } catch (rawErr) {
        // The api<T>() wrapper rethrows the underlying AxiosError. A
        // 422 with a `data.issues` payload is the structured linter-
        // rejection — convert it to a `linter_rejected` result so the
        // screen renders inline cards. Anything else (401 already
        // refresh-handled by the client interceptor, 5xx, network
        // fault) we rethrow so TanStack Query trips `.isError`.
        const err = rawErr as AxiosError<
          ApiResponse<FinalizeLinterRejectionPayload>
        >;
        const status = err.response?.status;
        const body = err.response?.data;
        if (status === 422) {
          const issues = body?.data?.issues;
          if (Array.isArray(issues)) {
            return { kind: "linter_rejected", issues };
          }
          // Pre-`P6-BE-8` BE: 422 ships without `data.issues`. This
          // path should be dead post-C.15, but locking in the
          // graceful fallback keeps a hypothetical BE regression
          // from crashing the review screen on `result.issues.map`.
          // The console.warn surfaces the drift in dev so the
          // contract gap is loud, not silent.
          console.warn(
            "[useFinalizeReorganizationSession] 422 response missing `data.issues`; " +
              "falling back to empty array. The BE is out of sync with C.15 (P6-BE-8) " +
              "— inline linter cards on the review screen will not render until the BE ships.",
          );
          return { kind: "linter_rejected", issues: [] };
        }
        throw rawErr;
      }
    },
    onSuccess: (result) => {
      // Only invalidate the calendar caches when the world actually
      // moved. A `linter_rejected` 422 leaves the world untouched, so
      // re-fetching is wasted work and would also cancel an
      // in-progress draft preview render.
      if (result.kind === "committed" || result.kind === "pending_review") {
        queryClient.invalidateQueries({ queryKey: calendarKeys.all });
        queryClient.invalidateQueries({ queryKey: ["dispatch-overview"] });
        // PLAN-DEVIATION: 2026-05-09-pr-ux-18-cache-null-on-commit —
        // see docs/PLAN-DEVIATIONS.md#2026-05-09-pr-ux-18-cache-null-on-commit.
        //
        // Cache-write semantics depend on whether the session is
        // still "active" from the BE's `mineActive` perspective:
        //
        //   - `committed` → the session has terminated. The BE's
        //     `STILL_ALIVE_STATUSES = {draft, pending_review, committing}`
        //     filter excludes it, so `/reorganizations/mine/active`
        //     would return `null` on the next refetch. Writing the
        //     committed row to the active-session cache produces a
        //     stale `useActiveReorganization` data slot — observers
        //     read `data: { ...committedSession }` instead of the
        //     authoritative `data: null` until the next network
        //     round-trip. We write `null` to match the BE's view
        //     immediately. The per-session detail cache still
        //     carries the canonical row for the AI-tab approval
        //     surface and audit-trail consumers.
        //   - `pending_review` → the session is still alive
        //     (a different actor must approve, or the user must
        //     fire the authorize CTA). The committed row IS the
        //     active row; cache it as before.
        //
        // Pre-PR-UX-18 this branch wrote the committed row
        // unconditionally, which combined with stale `localIntents`
        // (cleared only when the user tapped OK on the success
        // alert) made finalize feel like a no-op visually until
        // the next refetch landed.
        if (result.kind === "committed") {
          cacheReorganizationResult(
            queryClient,
            useAuthStore.getState().user?.franchiseId ?? null,
            null,
          );
          // Per-session detail cache still gets the canonical row
          // — committed sessions are observable from the AI tab /
          // audit surfaces. Only the active-session slot must read
          // `null` to match the BE's `mineActive` filter.
          queryClient.setQueryData(
            ["reorganizations", "session", result.session.id],
            result.session,
          );
        } else {
          // P3-FE-REHYDRATE-MOUNT §7.3 — push the freshly-shaped row
          // into the active-session + per-session caches so a re-mount
          // doesn't trigger a redundant network refetch. Read
          // `franchiseId` via `getState()` at mutation-resolution
          // time so a franchise-switch between mount and resolve
          // writes under the right key.
          cacheReorganizationResult(
            queryClient,
            useAuthStore.getState().user?.franchiseId ?? null,
            result.session,
          );
        }
      }
    },
  });

  // 2026-05-11 — keep the historical call-site shape:
  // `finalizeMutation.mutate(sessionId, options)`. The wrapper
  // generates one fresh `Idempotency-Key` per call and forwards
  // the user-supplied `options` (onSuccess / onError) unchanged.
  // TanStack Query reuses variables on transient retries within a
  // single call, so the BE's idempotency middleware deduplicates
  // retries automatically; a fresh user-initiated retry is a new
  // `mutate()` and therefore gets a fresh key.
  const mutate = (
    sessionId: number,
    options?: Parameters<typeof mutation.mutate>[1],
  ) => {
    mutation.mutate(
      { sessionId, idempotencyKey: Crypto.randomUUID() },
      options,
    );
  };

  const mutateAsync = (
    sessionId: number,
    options?: Parameters<typeof mutation.mutateAsync>[1],
  ) => {
    return mutation.mutateAsync(
      { sessionId, idempotencyKey: Crypto.randomUUID() },
      options,
    );
  };

  return {
    ...mutation,
    mutate,
    mutateAsync,
    /**
     * Escape hatch for tests that need to call the underlying
     * mutation directly (e.g. to assert key reuse on a TanStack
     * Query auto-retry without the wrapper interposing a fresh
     * key). Production code should not use this.
     */
    mutationUnsafe: mutation,
  };
}

// ──────────────────────────────────────────────────────────────────
// `useCommitIntentsBatch` (FE-CR-1-2)
// ──────────────────────────────────────────────────────────────────
//
// Producer for the Pending Reality "Sweep clean ones" button and the
// calendar-tab `CleanIntentPromotionToast` "Apply now" CTA. Both used
// to fire `useFinalizeReorganizationSession` (session-scoped finalize
// — see PLAN-DEVIATION `2026-05-09-pr-ux-20-sweep-finalizes-session`),
// which forced the FE to gate Sweep on "every intent in the session
// must be clean" so dirty intents couldn't accidentally piggy-back on
// the finalize.
//
// `B-CR-1-2` (REMIBackend, 2026-05-10) ships
// `POST /reorganizations/:id/intents/commit-many` with body
// `{ intent_ids: number[] }`. The BE locks the session once, runs the
// linter once, and commits the deduped id list in a single
// transaction; dirty intents are left untouched in `proposed` state.
// The "all session intents must be clean" Sweep gate retires with this
// chunk — Sweep can now commit the clean subset of a mixed
// clean+dirty session.
//
// Wire contract (REMIBackend
// `src/services/reorganizationService.ts#commitIntents` +
// `src/routes/v1/technician/reorganizations.ts`):
//
//   POST /api/v1/technician/reorganizations/:id/intents/commit-many
//   Headers: { "Idempotency-Key": <uuid> }
//   Body: { intent_ids: number[] }  // non-empty, positive ints
//
//   200 →
//     { error: false, message: "Intents committed",
//       data: {
//         session: ReorganizationApiSession,
//         committed_intent_ids: number[]   // in request order after dedupe
//       } }
//     The session row may transition to `committed` (every intent now
//     committed → `STILL_ALIVE_STATUSES` no longer includes it) or
//     remain `draft` / `pending_review` when dirty intents are still
//     staged. The BE emits one `intents_committed_batch` realtime
//     event after the transaction, and a `session_committed` event if
//     the batch closed the session.
//
//   409 INTENT_HAS_CONFLICTS →
//     { error: true, message: "intent_has_conflicts",
//       code: "INTENT_HAS_CONFLICTS",
//       data: { issues: LinterIssue[] } }
//     Server-side linter caught a conflict on at least one of the
//     requested intents at commit time. The whole batch rolls back.
//
//   404 INTENT_NOT_FOUND →
//     { error: true, message: "intent_not_found",
//       code: "INTENT_NOT_FOUND",
//       data: { bad_intent_id: number } }
//     One of the requested ids isn't in the session (cross-session or
//     deleted). Caller should refresh the session row before retry.
//
//   Other 4xx/5xx (e.g. 409 SESSION_NOT_COMMITTABLE,
//   INTENT_ALREADY_COMMITTED, TARGET_MISSING) → rethrown as a generic
//   AxiosError; the consumer surfaces a "Couldn't reach server"
//   toast.
//
// NOTE on the linter-rejection status code: the FE-CR-1-2 handoff doc
// specced `422 linter_errors_block_commit` based on an earlier
// version of the BE plan; the shipped BE returns 409
// `intent_has_conflicts` instead (matching the sibling
// `POST /:id/intents/:intentId/commit` endpoint). This hook follows
// the actual wire shape — see
// `/Users/jacegalloway/Documents/codebases/REMIBackend/src/services/reorganizationService.ts`
// `commitOneIntentInTrxNoSessionLock` for the canonical throw site.
//
// Idempotency-Key contract (per master plan §5.3.3 / §6.3): each
// `mutate()` call generates ONE fresh UUID via `Crypto.randomUUID()`;
// TanStack Query reuses the same variables across transient retries
// of the same call so the BE's idempotency middleware deduplicates
// retries automatically. A separate user-initiated retry is a fresh
// `mutate()` and therefore gets a fresh key. See the
// `useFinalizeReorganizationSession` JSDoc on the same pattern.
//
// Cache-write semantics on success — mirrors the finalize hook's
// post-PR-UX-18 contract:
//
//   - `session.status === "committed"` (terminal): write `null` to
//     the active-session cache so `useActiveReorganization` matches
//     the BE's `STILL_ALIVE_STATUSES` filter immediately, AND write
//     the canonical row to the per-session detail cache for audit /
//     approval surfaces. Local store is cleared because the user has
//     no draft anymore.
//     PLAN-DEVIATION: 2026-05-09-pr-ux-18-cache-null-on-commit.
//
//   - `session.status` non-terminal (partial commit; dirty intents
//     remain): call `setSession(session, session.intents)` with the
//     BE's authoritative intent list. The leftover dirty intents
//     preserve their `chain_id`s (sticky-chain identity contract,
//     PLAN-DEVIATION `2026-05-10-sticky-chain-identity-fe`) so the
//     user can keep working in the same session.
//     PLAN-DEVIATION: 2026-05-09-pr-ux-18-clear-before-alert — do NOT
//     call `clear()` on the partial-commit branch; that would wipe
//     the dirty intents the user still needs to resolve. Local store
//     stays populated with the BE's trimmed intent list.
//
// Calendar / dispatch-overview invalidation fires on BOTH branches
// (the world moved). Reorganization-prefix invalidation is owned by
// the realtime hook's `intents_committed_batch` / `session_committed`
// handlers — do NOT duplicate it here.

/**
 * Tagged error thrown when the BE rejects the batch commit with 409
 * `intent_has_conflicts`. Caller-readable: `err.kind ===
 * "linter_rejected"` lets a `try/catch` distinguish a structured
 * rejection from a network / auth fault without sniffing AxiosError
 * shapes. Mirrors `ApplyAutoFixRejectedError`.
 */
export class CommitBatchRejectedError extends Error {
  readonly kind = "linter_rejected" as const;
  readonly issues: LinterIssue[];
  constructor(issues: LinterIssue[]) {
    super("Per-intent commit-many rejected by the server-side linter.");
    this.name = "CommitBatchRejectedError";
    this.issues = issues;
  }
}

/**
 * Tagged error thrown when the BE rejects the batch commit with 404
 * `intent_not_found`. The `bad_intent_id` is surfaced so the consumer
 * can show "Some changes vanished — refresh and retry" with the
 * offending id pinned, but is nullable for forward-compatibility
 * (a pre-`B-CR-1-2`-rev2 BE could plausibly omit it).
 */
export class CommitBatchIntentNotFoundError extends Error {
  readonly kind = "intent_not_found" as const;
  readonly badIntentId: number | null;
  constructor(badIntentId: number | null) {
    super(
      "Per-intent commit-many referenced an intent id missing from the session.",
    );
    this.name = "CommitBatchIntentNotFoundError";
    this.badIntentId = badIntentId;
  }
}

export interface CommitIntentsBatchVariables {
  /** Active session id, from `usePendingRealityStore.sessionId`. */
  sessionId: number;
  /**
   * Intent ids to commit. Non-empty array of positive ints. The BE
   * dedupes preserving first-seen order; the response's
   * `committed_intent_ids` echoes that order back.
   */
  intentIds: number[];
  /**
   * Pre-generated `Idempotency-Key`. The wrapped `mutate` /
   * `mutateAsync` auto-generates one per call.
   */
  idempotencyKey: string;
}

export interface CommitIntentsBatchResult {
  session: ReorganizationSession;
  intents: ReorganizationIntent[];
  committedIntentIds: number[];
}

interface CommitIntentsBatchSuccessPayload {
  session: ReorganizationApiSessionPayload;
  committed_intent_ids: number[];
}

interface CommitIntentsBatchRejectionPayload {
  issues?: LinterIssue[];
  bad_intent_id?: number;
}

/**
 * `useCommitIntentsBatch` — fires `POST /reorganizations/:id/intents/commit-many`
 * with the supplied `intent_ids`. Surgical per-intent commit; the
 * session may close (every intent committed) or remain alive with
 * dirty intents staged.
 *
 * Returns a TanStack Query mutation handle. The exposed `mutate` /
 * `mutateAsync` accept variables WITHOUT `idempotencyKey` — the hook
 * auto-generates one per call. Tests that need a deterministic key
 * can call the underlying `mutation.mutate` (re-exported as
 * `mutationUnsafe`) directly.
 *
 * Throws (caller `onError`):
 *   - `CommitBatchRejectedError` on 409 `intent_has_conflicts`.
 *   - `CommitBatchIntentNotFoundError` on 404 `intent_not_found`.
 *   - Generic `AxiosError` for everything else (network / 5xx / auth
 *     post-refresh-failure).
 */
export function useCommitIntentsBatch() {
  const queryClient = useQueryClient();
  const setSession = usePendingRealityStore((s) => s.setSession);
  const clear = usePendingRealityStore((s) => s.clear);

  const mutation = useMutation<
    CommitIntentsBatchResult,
    Error,
    CommitIntentsBatchVariables
  >({
    mutationFn: async ({ sessionId, intentIds, idempotencyKey }) => {
      try {
        const data = await api<CommitIntentsBatchSuccessPayload>(
          "post",
          Endpoints.reorganizations.commitMany(sessionId),
          { intent_ids: intentIds },
          { headers: { "Idempotency-Key": idempotencyKey } },
        );
        const { session, intents } = splitApiSession(data.session);
        return {
          session,
          intents,
          committedIntentIds: data.committed_intent_ids,
        };
      } catch (rawErr) {
        const err = rawErr as AxiosError<
          ApiResponse<CommitIntentsBatchRejectionPayload>
        >;
        const status = err.response?.status;
        const body = err.response?.data;
        if (__DEV__) {
          console.warn(
            "[useCommitIntentsBatch] POST /reorganizations/:id/intents/commit-many failed",
            {
              sessionId,
              intentIds,
              status: status ?? null,
              beMessage: body?.message ?? null,
              beData: body?.data ?? null,
              isAxiosError: !!err.isAxiosError,
              networkOrCors: err.response == null,
            },
          );
        }
        if (
          status === 409 &&
          body?.message === "intent_has_conflicts" &&
          body.data &&
          Array.isArray(body.data.issues)
        ) {
          throw new CommitBatchRejectedError(body.data.issues);
        }
        if (status === 404 && body?.message === "intent_not_found") {
          const badIntentId =
            typeof body.data?.bad_intent_id === "number"
              ? body.data.bad_intent_id
              : null;
          throw new CommitBatchIntentNotFoundError(badIntentId);
        }
        throw rawErr;
      }
    },
    onSuccess: ({ session, intents }) => {
      const franchiseId = useAuthStore.getState().user?.franchiseId ?? null;
      if (session.status === "committed") {
        // Terminal — every intent in the session is now committed. The
        // BE's `STILL_ALIVE_STATUSES` filter excludes `committed`, so
        // `/reorganizations/mine/active` would return `null` on the
        // next refetch. Match the BE view immediately by writing
        // `null` to the active-session cache; the per-session detail
        // cache still gets the canonical row (audit + AI-tab
        // consumers). PLAN-DEVIATION:
        // 2026-05-09-pr-ux-18-cache-null-on-commit.
        cacheReorganizationResult(queryClient, franchiseId, null);
        queryClient.setQueryData(
          ["reorganizations", "session", session.id],
          { ...session, intents },
        );
        // PLAN-DEVIATION: 2026-05-09-pr-ux-18-clear-before-alert — the
        // local store is cleared synchronously here (not gated on a
        // user alert dismissal) so the cyan pending-tint overlay
        // drops the moment the commit lands. The consumer's
        // `onSuccess` callback can still render a success alert
        // against the committed-intent ids that were captured
        // BEFORE the mutate call.
        clear();
      } else {
        // Partial — dirty intents remain. The BE response's
        // `intents` array is the authoritative trimmed list; pushing
        // it through `setSession` preserves `chain_id`s on the
        // leftover intents (sticky-chain identity contract,
        // PLAN-DEVIATION `2026-05-10-sticky-chain-identity-fe`) so
        // the user's cascade graph stays intact for further work.
        // Don't call `clear()` — that wipes the leftover intents the
        // user still needs to resolve.
        setSession(session, intents);
        cacheReorganizationResult(queryClient, franchiseId, {
          ...session,
          intents,
        });
      }
      // Calendar + dispatch overview must refetch — the world moved.
      // The reorganization-prefix invalidation is owned by the
      // realtime `intents_committed_batch` event handler, so don't
      // duplicate it here.
      queryClient.invalidateQueries({ queryKey: calendarKeys.all });
      queryClient.invalidateQueries({ queryKey: ["dispatch-overview"] });
    },
  });

  type WrappedVariables = Omit<
    CommitIntentsBatchVariables,
    "idempotencyKey"
  > & { idempotencyKey?: string };

  const mutate = (
    variables: WrappedVariables,
    options?: Parameters<typeof mutation.mutate>[1],
  ) => {
    const idempotencyKey = variables.idempotencyKey ?? Crypto.randomUUID();
    mutation.mutate({ ...variables, idempotencyKey }, options);
  };

  const mutateAsync = (
    variables: WrappedVariables,
    options?: Parameters<typeof mutation.mutateAsync>[1],
  ) => {
    const idempotencyKey = variables.idempotencyKey ?? Crypto.randomUUID();
    return mutation.mutateAsync({ ...variables, idempotencyKey }, options);
  };

  return {
    ...mutation,
    mutate,
    mutateAsync,
    /**
     * Escape hatch for tests that need to call the underlying
     * mutation directly (e.g. to assert key reuse on a TanStack
     * Query auto-retry without the wrapper interposing a fresh
     * key). Production code should not use this.
     */
    mutationUnsafe: mutation,
  };
}

// ──────────────────────────────────────────────────────────────────
// `useApplyAutoFix` (P3-FE-9)
// ──────────────────────────────────────────────────────────────────
//
// PLAN-DEVIATION: 2026-04-23-apply-auto-fix-deferred-from-p3-fe-5
//   — this hook was specified in P3-FE-5's prompt body but
//   intentionally deferred to its own chunk (this one). See
//   docs/PLAN-DEVIATIONS.md#2026-04-23-apply-auto-fix-deferred-from-p3-fe-5
//   for the rationale and the don't-list before refactoring or
//   merging this hook into a generic update-session hook.
//
// Producer for `LinterEdgeCard`'s "Apply auto-fix" CTA. The card
// itself was shipped by P3-FE-5 (master plan §5.3.5) but the
// mutation half — the hook that fires the actual server-side
// `modify_intent` op when the user taps the CTA — was specified in
// P3-FE-5's prompt body and never landed. P3-FE-9 ships it so the
// CTA stops calling a no-op handler.
//
// Endpoint contract (master plan §6.2):
//
//   PATCH /api/v1/technician/reorganizations/:id
//   Body: { op: "modify_intent", intent_id: number,
//           intent: ReorganizationIntentPayload }
//   200 → { error: false, data: ReorganizationApiSession }
//         The full session row including a fresh `intents[]` with
//         the modified intent inline. The BE re-derives downstream
//         state (linter_dependency_edges, commit_order) and reflows
//         the rest of the intent set if needed.
//   422 → { error: true, message: 'linter_rejected' | 'invalid_op',
//           data: { issues?: LinterIssue[] } }
//         Same shape as `useFinalizeReorganizationSession` — the
//         server-side linter caught a problem with the proposed
//         replacement payload (e.g. the auto-fix itself violates a
//         different rule). 422 is rethrown as a tagged error so the
//         consumer can render a toast + retry CTA without
//         conflating it with network faults.
//   Other 4xx/5xx → re-thrown as a generic AxiosError; consumer
//     decides whether to surface a toast.
//
// Idempotency-Key (per §5.3.3): generated once per `mutate()` call
// via `Crypto.randomUUID()` and embedded in the mutation variables.
// TanStack Query passes variables verbatim to the `mutationFn` on
// every retry of the same call, so the BE's `P6-BE-1` middleware
// will deduplicate transient retries automatically. A separate
// user-initiated retry (tap the button again after a failure) is a
// fresh `mutate()` and therefore gets a fresh key. Tests assert
// both halves of this contract.
//
// Store post-success protocol (per §5.3.1):
//
//   1. `setSession(session, intents)` — atomic refresh of both the
//      session row and the intent set. The `intents` second-arg
//      overload was added by this chunk for exactly this case
//      (the BE's PATCH response carries the full intent set inline
//      — finer-grained `modifyIntent(id, patch)` would round-trip
//      the linter_dependency_edges through TS structural typing
//      and lose the BE-derived re-flow).
//   2. `runLocalLinter(worldSnapshot)` — re-runs the shared
//      §3.10 linter against the new intent set so the FAB / HUD /
//      review screen reflect the resolved (or newly-introduced)
//      issue immediately. The caller passes the snapshot because
//      the store is intentionally not coupled to the TanStack
//      Query cache (§5.3.1 "Snapshot-driven" paragraph).

export interface ApplyAutoFixVariables {
  /** Active session id, from `usePendingRealityStore.sessionId`. */
  sessionId: number;
  /** The intent whose `payload` is being replaced by the auto-fix. */
  intentId: number;
  /**
   * Replacement payload. Must come from `LinterIssue.suggestedAutoFix`
   * — the linter rule catalog (§4.7) is the only legitimate source.
   * Hand-rolled payloads bypass the linter's invariants.
   */
  intent: ReorganizationIntentPayload;
  /**
   * World snapshot for the post-success local linter re-run. Same
   * snapshot the caller would pass to `runLocalLinter` directly.
   * Pass an empty snapshot (`{ appointments: [], routes: [], … }`)
   * if the caller hasn't assembled real world data yet — the linter
   * tolerates empty snapshots.
   */
  worldSnapshot: LinterWorldSnapshot;
  /**
   * Pre-generated `Idempotency-Key`. The wrapped `mutate` /
   * `mutateAsync` exposed by `useApplyAutoFix()` auto-generates one
   * per call so consumers don't have to think about it. Callers may
   * pass an explicit key for tests / replay scenarios; production
   * code should use the wrapped surface.
   */
  idempotencyKey: string;
}

interface ApplyAutoFixSuccessPayload {
  // The BE's `ReorganizationApiSession` shape (REMIBackend
  // `src/routes/v1/_helpers/reorganization.ts`). It mirrors
  // `ReorganizationSession` plus a nested `intents[]`. The fields
  // `idempotency_key`, `template_id`, and `source_metadata` are
  // not serialized server-side today — see the existing
  // `useFinalizeReorganizationSession` for the same compromise;
  // reconciling the type-vs-wire delta is owned by a later
  // hardening pass and out of scope here.
  intents?: ReorganizationIntent[];
  [key: string]: unknown;
}

interface ApplyAutoFixRejectionPayload {
  issues?: LinterIssue[];
}

/**
 * Tagged error thrown when the BE's PATCH /reorganizations/:id
 * responds with 422 (linter_rejected / invalid_op). Caller-readable:
 * `err.kind === "linter_rejected"` lets a `try/catch` distinguish a
 * structured rejection from a network or auth fault without sniffing
 * AxiosError shapes.
 */
export class ApplyAutoFixRejectedError extends Error {
  readonly kind = "linter_rejected" as const;
  readonly issues: LinterIssue[];
  constructor(issues: LinterIssue[]) {
    super("Apply auto-fix rejected by the server-side linter.");
    this.name = "ApplyAutoFixRejectedError";
    this.issues = issues;
  }
}

/**
 * `useApplyAutoFix` — fires PATCH /reorganizations/:id with a
 * `modify_intent` op so the BE replaces the intent's payload with
 * the linter-suggested auto-fix. On success the active session +
 * intents snapshot is refreshed in `usePendingRealityStore` and the
 * local linter is re-run.
 *
 * Returns a TanStack Query mutation handle. The exposed `mutate` /
 * `mutateAsync` accept variables WITHOUT `idempotencyKey` — the
 * hook auto-generates one per call. Tests that need a deterministic
 * key can call the underlying `mutation.mutate` (re-exported as
 * `mutationUnsafe`) directly.
 */
export function useApplyAutoFix() {
  const queryClient = useQueryClient();
  const setSession = usePendingRealityStore((s) => s.setSession);
  const runLocalLinter = usePendingRealityStore((s) => s.runLocalLinter);

  const mutation = useMutation<
    { session: ReorganizationSession; intents: ReorganizationIntent[] },
    Error,
    ApplyAutoFixVariables
  >({
    mutationFn: async ({ sessionId, intentId, intent, idempotencyKey }) => {
      try {
        const data = await api<ApplyAutoFixSuccessPayload>(
          "patch",
          Endpoints.reorganizations.update(sessionId),
          {
            op: "modify_intent",
            intent_id: intentId,
            intent,
          },
          { headers: { "Idempotency-Key": idempotencyKey } },
        );
        // The BE response is a flat object (session fields + nested
        // `intents`). Split it into a `(session, intents)` tuple so
        // downstream callers don't have to know the wire shape.
        const { intents = [], ...sessionFields } = data;
        return {
          session: sessionFields as unknown as ReorganizationSession,
          intents,
        };
      } catch (rawErr) {
        const err = rawErr as AxiosError<
          ApiResponse<ApplyAutoFixRejectionPayload>
        >;
        const status = err.response?.status;
        const body = err.response?.data;
        // Always log the wire-level failure in DEV. Without this the
        // call site only sees `Error: Request failed with status code
        // 5XX` and the user-facing toast is generic ("Couldn't apply
        // auto-fix"). Logging the status, BE-emitted message, and
        // payload makes the next reproduction immediately diagnosable
        // (e.g. `session_not_draft` 409 vs `intent_not_found` 404 vs
        // a Zod 400 from a payload missing `appointment_id`).
        if (__DEV__) {
          console.warn("[useApplyAutoFix] PATCH /reorganizations/:id failed", {
            sessionId,
            intentId,
            status: status ?? null,
            beMessage: body?.message ?? null,
            beData: body?.data ?? null,
            // Echo the request body so a side-by-side comparison
            // against the BE Zod schema is possible without
            // additional logging.
            requestBody: { op: "modify_intent", intent_id: intentId, intent },
            isAxiosError: !!err.isAxiosError,
            networkOrCors: err.response == null,
          });
        }
        if (
          status === 422 &&
          body &&
          body.data &&
          Array.isArray(body.data.issues)
        ) {
          throw new ApplyAutoFixRejectedError(body.data.issues);
        }
        throw rawErr;
      }
    },
    onSuccess: ({ session, intents }, variables) => {
      // Atomic session + intents refresh — see store JSDoc on the
      // two-arg overload. Clears `linterIssues` so the next
      // `runLocalLinter` writes a fresh result against the new
      // intent set (the variable already-resolved issue should
      // disappear, modulo any new issue the auto-fix introduced).
      setSession(session, intents);
      runLocalLinter(variables.worldSnapshot);
      // PR-UX-16 (PLAN-DEVIATION 2026-05-09-pr-ux-16-followups) —
      // refresh `appointment.pending_intent_summary` so the
      // calendar's cyan-tile / PendingChangeBadge overlay reflects
      // the new intent set immediately. See
      // docs/PLAN-DEVIATIONS.md#2026-05-09-pr-ux-16-followups.
      queryClient.invalidateQueries({ queryKey: calendarKeys.all });
      // P3-FE-REHYDRATE-MOUNT §7.3 — seed the active-session +
      // per-session caches so a re-mount of `useActiveReorganization`
      // / `useReorganizationSession(id)` is a cache hit instead of a
      // redundant network refetch. The BE's PATCH response carries
      // the full `(session, intents)` tuple; reassemble the canonical
      // wire shape here for the cache write.
      cacheReorganizationResult(
        queryClient,
        useAuthStore.getState().user?.franchiseId ?? null,
        { ...session, intents },
      );
    },
  });

  // Wrap `mutate` / `mutateAsync` so consumers don't have to
  // generate the idempotency key themselves. Each call = one fresh
  // key; auto-retries within a single call reuse it via TanStack
  // Query's variable-stability guarantee.
  type WrappedVariables = Omit<ApplyAutoFixVariables, "idempotencyKey"> & {
    idempotencyKey?: string;
  };

  const mutate = (
    variables: WrappedVariables,
    options?: Parameters<typeof mutation.mutate>[1],
  ) => {
    const idempotencyKey = variables.idempotencyKey ?? Crypto.randomUUID();
    mutation.mutate({ ...variables, idempotencyKey }, options);
  };

  const mutateAsync = (
    variables: WrappedVariables,
    options?: Parameters<typeof mutation.mutateAsync>[1],
  ) => {
    const idempotencyKey = variables.idempotencyKey ?? Crypto.randomUUID();
    return mutation.mutateAsync({ ...variables, idempotencyKey }, options);
  };

  return {
    ...mutation,
    mutate,
    mutateAsync,
    /**
     * Escape hatch for tests that need to call the underlying
     * mutation directly (e.g. to assert key reuse on a TanStack
     * Query auto-retry without the wrapper interposing a fresh
     * key). Production code should not use this.
     */
    mutationUnsafe: mutation,
  };
}

// ──────────────────────────────────────────────────────────────────
// Producer-half mutation hooks (P3-FE-7)
// ──────────────────────────────────────────────────────────────────
//
// PLAN-DEVIATION: 2026-04-24-smart-default-intent-producer
//   — these three hooks are the API surface the smart-default
//   linter intercept (`useSessionAwareSubmit`) calls into. The
//   master plan §5.3.3 originally sketched an explicit "Stage"
//   CTA OR a session-mode toggle as the producer trigger; both
//   were rejected in favor of the smart default. See
//   docs/PLAN-DEVIATIONS.md#2026-04-24-smart-default-intent-producer
//   before refactoring or merging these into a generic
//   `useMutateReorganizationSession`.
//
// These three hooks complete the §5.3.3 mutation-hooks family on
// the surface needed by `useSessionAwareSubmit` (the producer this
// chunk introduces). They mirror the `useApplyAutoFix` shape:
//   - Wrapped `mutate` / `mutateAsync` auto-generate one
//     `Idempotency-Key` per call (per §5.3.3) via
//     `Crypto.randomUUID()`. TanStack Query's variable-stability
//     guarantee means transient retries reuse the same key; a
//     fresh user-initiated retry is a fresh `mutate()` call and
//     therefore gets a fresh key. Tests assert both halves.
//   - `mutationUnsafe` re-exports the raw mutation handle so tests
//     can assert key reuse without the wrapper interposing a fresh
//     key. Production code should not use this.
//   - `onSuccess` synchronizes `usePendingRealityStore` so the
//     FAB / HUD / review screen reflect the new total immediately
//     without waiting for a downstream `useFranchisePendingReorganizations`
//     refetch.
//
// Endpoint contracts (master plan §6.2 + REMIBackend
// `src/schemas/reorganization.schema.ts`):
//
//   - POST /api/v1/technician/reorganizations
//       Body: createSessionBodySchema
//             { notes?: string,
//               initial_intents?: ReorganizationIntentPayload[],
//               finalize_immediately?: boolean }
//       NO `source` / `policy_snapshot_request` in the body —
//       `source` is derived from the route prefix
//       (`technician/...` → `"tech_app"`) and `policy_snapshot` is
//       filled in by the service from the franchise's reorg policy.
//       200 → { error: false, data: ReorganizationApiSession }
//
//   - PATCH /api/v1/technician/reorganizations/:id
//       Body: editSessionBodySchema (discriminated by `op`)
//       For the producer surface we only need:
//         { op: "add_intent",
//           intent: ReorganizationIntentPayload }
//       (`modify_intent` is owned by `useApplyAutoFix`; `remove_intent`
//       and `set_notes` land in their own chunks if/when consumers ship.)
//       200 → { error: false, data: ReorganizationApiSession }
//
//   - POST /api/v1/technician/reorganizations/:id/cancel
//       Body: cancelSessionBodySchema { reason?: string }
//       200 → { error: false, data: { cancelled: true } }
//
// Why three hooks instead of one generic `useMutateReorganizationSession`:
//   - The store post-success protocol differs by op (create + add
//     both `setSession` then `runLocalLinter`; cancel `clear()`s).
//   - Cancel returns no session row, so collapsing it into a generic
//     hook would require branching on the response shape inside the
//     mutationFn — uglier than three small siblings.
//   - The three discriminated names give callers (and tests) a
//     readable surface that matches the §5.3.3 hooks-family table.

interface ReorganizationApiSessionPayload {
  // The BE's `ReorganizationApiSession` shape (REMIBackend
  // `src/routes/v1/_helpers/reorganization.ts`). Same compromise
  // as `useApplyAutoFix` — the wire shape is a flat object with a
  // nested `intents[]`; reconciling the type-vs-wire delta is
  // owned by a later hardening pass.
  intents?: ReorganizationIntent[];
  [key: string]: unknown;
}

function splitApiSession(data: ReorganizationApiSessionPayload): {
  session: ReorganizationSession;
  intents: ReorganizationIntent[];
} {
  const { intents = [], ...sessionFields } = data;
  return {
    session: sessionFields as unknown as ReorganizationSession,
    intents,
  };
}

// ──────────────────────────────────────────────────────────────────
// `useCreateReorganizationSession`
// ──────────────────────────────────────────────────────────────────

export interface CreateReorganizationSessionVariables {
  /**
   * Optional free-text notes the author wants attached to the
   * session row. The form-sheet handoff produces these from the
   * sheet body (e.g. cancellation note). Currently always empty
   * for `useSessionAwareSubmit` callsites — wired through so a
   * future "compose notes before staging" affordance has a place
   * to land without re-plumbing the hook surface.
   */
  notes?: string;
  /**
   * Initial intents to attach atomically with session creation.
   * `useSessionAwareSubmit` always passes exactly one intent here
   * so the create-session-with-first-intent round trip is one
   * request rather than two (POST then PATCH).
   */
  initialIntents?: ReorganizationIntentPayload[];
  /**
   * If `true`, the BE auto-runs `finalize` server-side as part of
   * the create response. Only relevant for the auto-policy path
   * (e.g. `tech_authored_self_only = "auto"`); the producer half
   * leaves this `false` so the user always lands on the review
   * screen first.
   */
  finalizeImmediately?: boolean;
  /**
   * Pre-generated `Idempotency-Key`. The wrapped `mutate` /
   * `mutateAsync` exposed by `useCreateReorganizationSession()`
   * auto-generates one per call so consumers don't have to think
   * about it. Tests / replay scenarios may pass an explicit key.
   */
  idempotencyKey: string;
}

export function useCreateReorganizationSession() {
  const queryClient = useQueryClient();
  const setSession = usePendingRealityStore((s) => s.setSession);

  const mutation = useMutation<
    { session: ReorganizationSession; intents: ReorganizationIntent[] },
    AxiosError,
    CreateReorganizationSessionVariables
  >({
    mutationFn: async ({
      notes,
      initialIntents,
      finalizeImmediately,
      idempotencyKey,
    }) => {
      const data = await api<ReorganizationApiSessionPayload>(
        "post",
        Endpoints.reorganizations.create,
        {
          ...(notes !== undefined ? { notes } : {}),
          ...(initialIntents ? { initial_intents: initialIntents } : {}),
          ...(finalizeImmediately !== undefined
            ? { finalize_immediately: finalizeImmediately }
            : {}),
        },
        { headers: { "Idempotency-Key": idempotencyKey } },
      );
      return splitApiSession(data);
    },
    onSuccess: ({ session, intents }) => {
      setSession(session, intents);
      // PR-UX-16 (PLAN-DEVIATION 2026-05-09-pr-ux-16-followups) —
      // refresh `appointment.pending_intent_summary` so the
      // calendar's cyan-tile / PendingChangeBadge overlay reflects
      // the new intent set. Without this, the BE annotation stays
      // stale until the next focus refetch / staleTime expiry, and
      // the user sees aqua-tinted cards for appointments their
      // staged intents no longer actually touch (especially after
      // breaking a chain by re-staging an intent's destination
      // away from the conflict card). See
      // docs/PLAN-DEVIATIONS.md#2026-05-09-pr-ux-16-followups.
      queryClient.invalidateQueries({ queryKey: calendarKeys.all });
      // P3-FE-REHYDRATE-MOUNT §7.3 — seed the active-session cache
      // with the freshly-created session so a subsequent cold-start
      // of `useActiveReorganization` is a cache hit. Without this
      // the realtime `session_created` invalidation that's about to
      // fire would force a redundant GET on the next render.
      cacheReorganizationResult(
        queryClient,
        useAuthStore.getState().user?.franchiseId ?? null,
        { ...session, intents },
      );
    },
  });

  type WrappedVariables = Omit<
    CreateReorganizationSessionVariables,
    "idempotencyKey"
  > & { idempotencyKey?: string };

  const mutate = (
    variables: WrappedVariables,
    options?: Parameters<typeof mutation.mutate>[1],
  ) => {
    const idempotencyKey = variables.idempotencyKey ?? Crypto.randomUUID();
    mutation.mutate({ ...variables, idempotencyKey }, options);
  };

  const mutateAsync = (
    variables: WrappedVariables,
    options?: Parameters<typeof mutation.mutateAsync>[1],
  ) => {
    const idempotencyKey = variables.idempotencyKey ?? Crypto.randomUUID();
    return mutation.mutateAsync({ ...variables, idempotencyKey }, options);
  };

  return { ...mutation, mutate, mutateAsync, mutationUnsafe: mutation };
}

// ──────────────────────────────────────────────────────────────────
// `useAddReorganizationIntent`
// ──────────────────────────────────────────────────────────────────

export interface AddReorganizationIntentVariables {
  /** Active session id, from `usePendingRealityStore.sessionId`. */
  sessionId: number;
  /** The intent payload to append via `op: "add_intent"`. */
  intent: ReorganizationIntentPayload;
  /**
   * World snapshot for the post-success local linter re-run. Same
   * snapshot the caller would pass to `runLocalLinter` directly.
   * Pass an empty snapshot if the caller hasn't assembled real
   * world data yet — the linter tolerates empty snapshots.
   */
  worldSnapshot: LinterWorldSnapshot;
  /**
   * Pre-generated `Idempotency-Key`. The wrapped `mutate` /
   * `mutateAsync` auto-generates one per call.
   */
  idempotencyKey: string;
}

export function useAddReorganizationIntent() {
  const queryClient = useQueryClient();
  const setSession = usePendingRealityStore((s) => s.setSession);
  const runLocalLinter = usePendingRealityStore((s) => s.runLocalLinter);

  const mutation = useMutation<
    { session: ReorganizationSession; intents: ReorganizationIntent[] },
    AxiosError,
    AddReorganizationIntentVariables
  >({
    mutationFn: async ({ sessionId, intent, idempotencyKey }) => {
      const data = await api<ReorganizationApiSessionPayload>(
        "patch",
        Endpoints.reorganizations.update(sessionId),
        { op: "add_intent", intent },
        { headers: { "Idempotency-Key": idempotencyKey } },
      );
      return splitApiSession(data);
    },
    onSuccess: ({ session, intents }, variables) => {
      setSession(session, intents);
      runLocalLinter(variables.worldSnapshot);
      // PR-UX-16 (PLAN-DEVIATION 2026-05-09-pr-ux-16-followups) —
      // refresh `appointment.pending_intent_summary` so the
      // calendar's cyan-tile / PendingChangeBadge overlay reflects
      // the new intent set immediately. See
      // docs/PLAN-DEVIATIONS.md#2026-05-09-pr-ux-16-followups.
      queryClient.invalidateQueries({ queryKey: calendarKeys.all });
      // P3-FE-REHYDRATE-MOUNT §7.3 — same cache-write story as the
      // sibling mutation hooks; the BE's PATCH response is the
      // canonical row, push it into the active-session cache so the
      // next mount is a cache hit.
      cacheReorganizationResult(
        queryClient,
        useAuthStore.getState().user?.franchiseId ?? null,
        { ...session, intents },
      );
    },
  });

  type WrappedVariables = Omit<
    AddReorganizationIntentVariables,
    "idempotencyKey"
  > & { idempotencyKey?: string };

  const mutate = (
    variables: WrappedVariables,
    options?: Parameters<typeof mutation.mutate>[1],
  ) => {
    const idempotencyKey = variables.idempotencyKey ?? Crypto.randomUUID();
    mutation.mutate({ ...variables, idempotencyKey }, options);
  };

  const mutateAsync = (
    variables: WrappedVariables,
    options?: Parameters<typeof mutation.mutateAsync>[1],
  ) => {
    const idempotencyKey = variables.idempotencyKey ?? Crypto.randomUUID();
    return mutation.mutateAsync({ ...variables, idempotencyKey }, options);
  };

  return { ...mutation, mutate, mutateAsync, mutationUnsafe: mutation };
}

// ──────────────────────────────────────────────────────────────────
// `useModifyReorganizationIntent`
// ──────────────────────────────────────────────────────────────────
//
// PR-UX-2 PASS 2.8 task `c7` — drag-on-ghost destination mutation.
//
// `useApplyAutoFix` already calls the same `op: "modify_intent"`
// endpoint, but its name and JSDoc tie it semantically to the
// LinterEdgeCard "Apply auto-fix" CTA (the linter rule catalog is
// the only legitimate source of payloads it accepts). The
// drag-on-ghost flow is a different consumer with a different
// caller contract:
//
//   - The replacement payload comes from a user gesture
//     (`buildModifyIntentPayloadForGhostDrag`), not the linter's
//     `LinterIssue.suggestedAutoFix`.
//   - There is no "linter_rejected" 422 surface to render — if the
//     server-side linter complains, we just let the standard
//     `runLocalLinter` re-run on `onSuccess` write the issue into
//     `linterIssues`. The drag callsite has nowhere to render a
//     22-issue array inline (the calendar canvas is the wrong
//     surface), so we don't tag the rejection class.
//   - Keeping a sibling hook (instead of broadening
//     `useApplyAutoFix`) preserves the auto-fix telemetry and
//     test surface — adding a second consumer would force us to
//     branch the rejection semantics by caller and the JSDoc
//     would no longer be accurate.
//
// Both hooks remain thin wrappers over the same
// `Endpoints.reorganizations.update(sessionId)` PATCH. Future
// consolidation into `useMutateReorganizationSession` (the
// generic the master plan §5.3.3 sketches) is fine, but should
// happen as a deliberate refactor with all three call sites
// (auto-fix, ghost-drag, future modify-intent UIs) accounted for.

export interface ModifyReorganizationIntentVariables {
  /** Active session id, from `usePendingRealityStore.sessionId`. */
  sessionId: number;
  /** The intent whose `payload` is being replaced. */
  intentId: number;
  /**
   * Replacement payload. Built from a user gesture (drag-on-ghost
   * via `buildModifyIntentPayloadForGhostDrag`) — NOT from the
   * linter's `suggestedAutoFix`. See `useApplyAutoFix` for that
   * variant.
   */
  intent: ReorganizationIntentPayload;
  /**
   * World snapshot for the post-success local linter re-run. Same
   * shape every other producer hook expects. Pass an empty
   * snapshot if the caller hasn't assembled real world data yet.
   */
  worldSnapshot: LinterWorldSnapshot;
  /**
   * Pre-generated `Idempotency-Key`. The wrapped `mutate` /
   * `mutateAsync` auto-generates one per call.
   */
  idempotencyKey: string;
}

export function useModifyReorganizationIntent() {
  const queryClient = useQueryClient();
  const setSession = usePendingRealityStore((s) => s.setSession);
  const runLocalLinter = usePendingRealityStore((s) => s.runLocalLinter);

  const mutation = useMutation<
    { session: ReorganizationSession; intents: ReorganizationIntent[] },
    AxiosError,
    ModifyReorganizationIntentVariables
  >({
    mutationFn: async ({ sessionId, intentId, intent, idempotencyKey }) => {
      const data = await api<ReorganizationApiSessionPayload>(
        "patch",
        Endpoints.reorganizations.update(sessionId),
        { op: "modify_intent", intent_id: intentId, intent },
        { headers: { "Idempotency-Key": idempotencyKey } },
      );
      return splitApiSession(data);
    },
    onSuccess: ({ session, intents }, variables) => {
      setSession(session, intents);
      runLocalLinter(variables.worldSnapshot);
      // PR-UX-16 (PLAN-DEVIATION 2026-05-09-pr-ux-16-followups) —
      // refresh `appointment.pending_intent_summary` so the
      // calendar's cyan-tile / PendingChangeBadge overlay clears
      // for the prior conflict card the moment its intent moves
      // away. See docs/PLAN-DEVIATIONS.md#2026-05-09-pr-ux-16-followups.
      queryClient.invalidateQueries({ queryKey: calendarKeys.all });
      // P3-FE-REHYDRATE-MOUNT §7.3 — see sibling mutation hooks.
      cacheReorganizationResult(
        queryClient,
        useAuthStore.getState().user?.franchiseId ?? null,
        { ...session, intents },
      );
    },
  });

  type WrappedVariables = Omit<
    ModifyReorganizationIntentVariables,
    "idempotencyKey"
  > & { idempotencyKey?: string };

  const mutate = (
    variables: WrappedVariables,
    options?: Parameters<typeof mutation.mutate>[1],
  ) => {
    const idempotencyKey = variables.idempotencyKey ?? Crypto.randomUUID();
    mutation.mutate({ ...variables, idempotencyKey }, options);
  };

  const mutateAsync = (
    variables: WrappedVariables,
    options?: Parameters<typeof mutation.mutateAsync>[1],
  ) => {
    const idempotencyKey = variables.idempotencyKey ?? Crypto.randomUUID();
    return mutation.mutateAsync({ ...variables, idempotencyKey }, options);
  };

  return { ...mutation, mutate, mutateAsync, mutationUnsafe: mutation };
}

// ──────────────────────────────────────────────────────────────────
// `useRemoveReorganizationIntent` (PR-UX-18 / fix-chain-splitting)
// ──────────────────────────────────────────────────────────────────
//
// PLAN-DEVIATION: 2026-05-09-pr-ux-18-restage-modify-not-add — see
// docs/PLAN-DEVIATIONS.md#2026-05-09-pr-ux-18-restage-modify-not-add.
//
// Producer for the `op: "remove_intent"` PATCH branch on
// `/api/v1/technician/reorganizations/:id`. Used by
// `useSessionAwareSubmit` when the user drags a card that already
// has a staged intent into a slot that resolves all conflicts —
// the card de-escalates back to a plain live-commit, and the
// existing BE intent must be removed in the same flow so the
// session row's intent list shrinks to match.
//
// Pre-PR-UX-18, the same callsite did a local-only
// `usePendingRealityStore.removeIntent(...)` and relied on the BE's
// next refetch to reconcile. That was wrong on two counts:
//   1. `useAddReorganizationIntent.onSuccess` calls
//      `setSession(session, intents)` with the BE's intent list,
//      which immediately overwrites the local removal — the orphan
//      intent reappeared the moment the next add_intent landed.
//   2. The orphan intent then participated in chain detection,
//      shattering the cascade chain into multiple split-displaced
//      seeds (Regression 1 — see PLAN-DEVIATION 2026-05-09-pr-ux-18-restage-modify-not-add).
//
// This hook closes the gap: the local store is updated only
// AFTER the BE confirms the removal, via the `setSession(session, intents)`
// path that all sibling reorganization mutation hooks share.

export interface RemoveReorganizationIntentVariables {
  sessionId: number;
  intentId: number;
  /**
   * World snapshot for the post-success local linter re-run.
   */
  worldSnapshot: LinterWorldSnapshot;
  idempotencyKey: string;
}

export function useRemoveReorganizationIntent() {
  const queryClient = useQueryClient();
  const setSession = usePendingRealityStore((s) => s.setSession);
  const runLocalLinter = usePendingRealityStore((s) => s.runLocalLinter);

  const mutation = useMutation<
    { session: ReorganizationSession; intents: ReorganizationIntent[] },
    AxiosError,
    RemoveReorganizationIntentVariables
  >({
    mutationFn: async ({ sessionId, intentId, idempotencyKey }) => {
      const data = await api<ReorganizationApiSessionPayload>(
        "patch",
        Endpoints.reorganizations.update(sessionId),
        { op: "remove_intent", intent_id: intentId },
        { headers: { "Idempotency-Key": idempotencyKey } },
      );
      return splitApiSession(data);
    },
    onSuccess: ({ session, intents }, variables) => {
      setSession(session, intents);
      runLocalLinter(variables.worldSnapshot);
      // Refresh `appointment.pending_intent_summary` so the
      // calendar's cyan-tile / PendingChangeBadge overlay drops
      // the removed intent immediately.
      queryClient.invalidateQueries({ queryKey: calendarKeys.all });
      cacheReorganizationResult(
        queryClient,
        useAuthStore.getState().user?.franchiseId ?? null,
        { ...session, intents },
      );
    },
  });

  type WrappedVariables = Omit<
    RemoveReorganizationIntentVariables,
    "idempotencyKey"
  > & { idempotencyKey?: string };

  const mutate = (
    variables: WrappedVariables,
    options?: Parameters<typeof mutation.mutate>[1],
  ) => {
    const idempotencyKey = variables.idempotencyKey ?? Crypto.randomUUID();
    mutation.mutate({ ...variables, idempotencyKey }, options);
  };

  const mutateAsync = (
    variables: WrappedVariables,
    options?: Parameters<typeof mutation.mutateAsync>[1],
  ) => {
    const idempotencyKey = variables.idempotencyKey ?? Crypto.randomUUID();
    return mutation.mutateAsync({ ...variables, idempotencyKey }, options);
  };

  return { ...mutation, mutate, mutateAsync, mutationUnsafe: mutation };
}

// ──────────────────────────────────────────────────────────────────
// `useCancelReorganizationSession`
// ──────────────────────────────────────────────────────────────────

export interface CancelReorganizationSessionVariables {
  /** Active session id, from `usePendingRealityStore.sessionId`. */
  sessionId: number;
  /** Optional human-readable cancellation reason. */
  reason?: string;
  /**
   * Pre-generated `Idempotency-Key`. The wrapped `mutate` /
   * `mutateAsync` auto-generates one per call.
   */
  idempotencyKey: string;
}

// PLAN-DEVIATION: 2026-05-08-cancel-hook-no-auto-coord
//   — this hook intentionally does NOT call `clear()` or
//   `cacheReorganizationResult(..., null)` from `onSuccess`. Both
//   are the responsibility of the user-initiated cancel handler
//   (currently `app/pending-reality/review.tsx#handleCancelSession`),
//   which is the only place that knows whether the cancelled
//   session is still the device's active one. Auto-coordinating
//   here caused a race: an in-flight cancel mutation completing
//   after the user had staged a fresh session would wipe the new
//   session from local state. See
//   docs/PLAN-DEVIATIONS.md#2026-05-08-cancel-hook-no-auto-coord
//   before re-introducing auto-coordination.
export function useCancelReorganizationSession() {
  const mutation = useMutation<
    { cancelled: true },
    AxiosError,
    CancelReorganizationSessionVariables
  >({
    mutationFn: async ({ sessionId, reason, idempotencyKey }) => {
      await api<{ cancelled: true }>(
        "post",
        Endpoints.reorganizations.cancel(sessionId),
        reason !== undefined ? { reason } : {},
        { headers: { "Idempotency-Key": idempotencyKey } },
      );
      return { cancelled: true };
    },
    // No global onSuccess. Local-state cleanup (`clear()`, active-
    // session cache write to `null`) is fired explicitly by the
    // user-initiated handler in its per-call `onSuccess`, gated on
    // "the cancelled session is still the active one." See the
    // PLAN-DEVIATION marker above.
  });

  type WrappedVariables = Omit<
    CancelReorganizationSessionVariables,
    "idempotencyKey"
  > & { idempotencyKey?: string };

  const mutate = (
    variables: WrappedVariables,
    options?: Parameters<typeof mutation.mutate>[1],
  ) => {
    const idempotencyKey = variables.idempotencyKey ?? Crypto.randomUUID();
    mutation.mutate({ ...variables, idempotencyKey }, options);
  };

  const mutateAsync = (
    variables: WrappedVariables,
    options?: Parameters<typeof mutation.mutateAsync>[1],
  ) => {
    const idempotencyKey = variables.idempotencyKey ?? Crypto.randomUUID();
    return mutation.mutateAsync({ ...variables, idempotencyKey }, options);
  };

  return { ...mutation, mutate, mutateAsync, mutationUnsafe: mutation };
}
