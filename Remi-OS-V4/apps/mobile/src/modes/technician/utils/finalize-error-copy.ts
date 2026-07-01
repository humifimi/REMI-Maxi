/**
 * `mapFinalizeError` — translate a `useFinalizeReorganizationSession`
 * `onError` payload into user-facing alert copy.
 *
 * Added PR #105 (2026-05-09) Finalize-B. Lives in its own module
 * (rather than inline in `app/pending-reality/review.tsx`) for two
 * reasons:
 *
 *   1. **Testability.** `app/pending-reality/review.tsx` is a
 *      ~4500-line screen and its existing test file is ~2400 lines
 *      heavy with TanStack Query / store harness wiring; a small
 *      pure mapper deserves its own focused suite, not another
 *      bay added to that ship.
 *   2. **Symmetry with the BE contract.** The BE-message strings
 *      we match on are the canonical `AppError` codes thrown by
 *      `REMIBackend/src/services/reorganizationService.ts`'s
 *      `finalizeSessionInTrx`. Centralizing them here means a
 *      future BE-side rename (or a sibling consumer like the
 *      franchise dashboard's reorganization detail screen) has
 *      one obvious diff target.
 *
 * # Pre-PR-#105 behavior
 *
 * The handler always raised the generic
 * `"Couldn't finalize / Something went wrong reaching the
 * server."` alert. That copy was correct for true network
 * faults — `axiosErr.response == null` — but actively misleading
 * on a 4xx with a structured BE error message: the server WAS
 * reached and answered with a specific reason. The user-visible
 * symptom (logged 2026-05-09) was a stray re-tap after a
 * successful finalize raising "couldn't reach the server" even
 * though the server's previous 200 had just landed; the second
 * tap got a 409 `session_not_draft`.
 *
 * # 422 caveat
 *
 * The 422 `linter_errors_block_finalize` response is intercepted
 * inside `useFinalizeReorganizationSession` as a
 * `linter_rejected` discriminated-union result and never reaches
 * an `onError` handler. A 422 that DOES reach this mapper is
 * therefore the only other 422 `finalizeSessionInTrx` throws:
 * `session_has_no_intents`. If a future BE-side change adds a
 * new 422 code, please add it to the switch below explicitly
 * — the default fallback is intentionally generic.
 */
export interface FinalizeErrorInput {
  /**
   * HTTP status from the BE response. `undefined` when the
   * request failed before the server answered (e.g. true network
   * fault, CORS preflight rejection, dropped connection).
   */
  status: number | undefined;
  /**
   * BE-emitted message string. The BE's `errorHandler` middleware
   * serializes `AppError`'s message into the response envelope's
   * `message` field — that's the value passed here. `undefined`
   * when the response had no body, the body wasn't JSON, or the
   * field wasn't populated (defensive — the shipped BE always
   * sets it on a thrown `AppError`).
   */
  beMessage: string | undefined;
  /**
   * `true` when `axiosErr.response == null` (no HTTP response was
   * received). Computed by the caller so this helper stays free
   * of any axios import. The status / beMessage fields are
   * `undefined` in this case but the boolean keeps the network-
   * fault intent explicit at the callsite.
   */
  isNetworkFault: boolean;
}

export interface FinalizeErrorCopy {
  title: string;
  body: string;
}

export function mapFinalizeError(input: FinalizeErrorInput): FinalizeErrorCopy {
  if (input.isNetworkFault) {
    return {
      title: "Couldn't finalize",
      body: "Something went wrong reaching the server. Your draft is saved locally — try again in a moment.",
    };
  }
  switch (input.beMessage) {
    case "session_not_draft":
      return {
        title: "Session no longer editable",
        body: "This session has already been submitted for review or committed. There's nothing left to finalize from this device.",
      };
    case "session_not_found":
      return {
        title: "Session is gone",
        body: "This draft was cancelled or expired before the finalize landed. Start a new chain to keep going.",
      };
    case "session_has_no_intents":
      return {
        title: "Nothing to finalize",
        body: "Add at least one change before finalizing.",
      };
    case "self_finalize_requires_self_committer":
      return {
        title: "Can't finalize this draft",
        body: "Your role can't commit this session under the current franchise policy. An owner with commit authority needs to finalize it.",
      };
    default:
      // Status-aware fallback. A 5xx tells the user "wait" while
      // a structured 4xx with an unknown code tells the user "try
      // again." The "your draft is saved locally" suggestion is
      // safe in both cases — the BE preserves draft state across
      // failed finalize attempts.
      if (input.status != null && input.status >= 500) {
        return {
          title: "Server hiccup",
          body: "The server hit an unexpected error finalizing this session. Your draft is still here — try again in a moment.",
        };
      }
      return {
        title: "Couldn't finalize",
        body: "Something went wrong reaching the server. Your draft is saved locally — try again in a moment.",
      };
  }
}
