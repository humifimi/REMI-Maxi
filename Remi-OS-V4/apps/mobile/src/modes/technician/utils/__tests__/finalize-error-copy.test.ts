/**
 * Tests for `mapFinalizeError` (PR #105 Finalize-B, 2026-05-09).
 *
 * Five buckets:
 *
 *   1. Network fault (no response) → generic copy with "Couldn't
 *      finalize" — preserves the legacy behavior so existing
 *      reproductions of true network faults still see the
 *      familiar wording.
 *   2. 409 `session_not_draft` → specific "Session no longer
 *      editable" copy. This is the user-visible bug from the
 *      report: a stray re-tap after a successful finalize raised
 *      "couldn't reach the server" even though the previous 200
 *      had just landed.
 *   3. 404 `session_not_found` → "Session is gone" copy.
 *   4. 422 `session_has_no_intents` → "Nothing to finalize" copy.
 *      (The other 422 — `linter_errors_block_finalize` — is
 *      intercepted as a discriminated-union result inside
 *      `useFinalizeReorganizationSession` and never reaches the
 *      onError handler.)
 *   5. 5xx fallback → "Server hiccup" copy.
 *   6. Unknown 4xx fallback → generic "Couldn't finalize" copy
 *      (back-compat with the pre-PR-#105 behavior).
 */

import {
  mapFinalizeError,
  type FinalizeErrorInput,
} from "../finalize-error-copy";

function inputFor(
  partial: Partial<FinalizeErrorInput> = {},
): FinalizeErrorInput {
  return {
    status: undefined,
    beMessage: undefined,
    isNetworkFault: false,
    ...partial,
  };
}

describe("mapFinalizeError", () => {
  it("returns the generic 'Couldn't finalize' copy on a true network fault", () => {
    const result = mapFinalizeError(
      inputFor({ isNetworkFault: true }),
    );
    expect(result.title).toBe("Couldn't finalize");
    expect(result.body).toMatch(/Something went wrong reaching the server/);
    expect(result.body).toMatch(/saved locally/);
  });

  it("returns 'Session no longer editable' for 409 session_not_draft", () => {
    // The PR #105 user-report scenario: tap → 200 → re-tap →
    // 409 session_not_draft. Pre-PR-#105 this raised the
    // generic network-fault copy — actively misleading.
    const result = mapFinalizeError(
      inputFor({ status: 409, beMessage: "session_not_draft" }),
    );
    expect(result.title).toBe("Session no longer editable");
    expect(result.body).toMatch(/already been submitted/);
    // CRITICAL: must NOT mention reaching the server — the
    // server WAS reached.
    expect(result.body).not.toMatch(/reaching the server/i);
  });

  it("returns 'Session is gone' for 404 session_not_found", () => {
    const result = mapFinalizeError(
      inputFor({ status: 404, beMessage: "session_not_found" }),
    );
    expect(result.title).toBe("Session is gone");
    expect(result.body).toMatch(/cancelled or expired/);
  });

  it("returns 'Nothing to finalize' for 422 session_has_no_intents", () => {
    const result = mapFinalizeError(
      inputFor({ status: 422, beMessage: "session_has_no_intents" }),
    );
    expect(result.title).toBe("Nothing to finalize");
  });

  it("returns 'Can't finalize this draft' for 403 self_finalize_requires_self_committer", () => {
    const result = mapFinalizeError(
      inputFor({
        status: 403,
        beMessage: "self_finalize_requires_self_committer",
      }),
    );
    expect(result.title).toBe("Can't finalize this draft");
    expect(result.body).toMatch(/owner with commit authority/);
  });

  it("returns 'Server hiccup' on a 5xx with no recognized BE code", () => {
    const result = mapFinalizeError(
      inputFor({ status: 500, beMessage: "internal_server_error" }),
    );
    expect(result.title).toBe("Server hiccup");
    expect(result.body).toMatch(/server hit an unexpected error/);
  });

  it("returns 'Server hiccup' on a 503 with no body message at all", () => {
    const result = mapFinalizeError(
      inputFor({ status: 503, beMessage: undefined }),
    );
    expect(result.title).toBe("Server hiccup");
  });

  it("falls back to the generic 'Couldn't finalize' copy on an unknown 4xx (back-compat with pre-PR-#105 default)", () => {
    const result = mapFinalizeError(
      inputFor({ status: 418, beMessage: "i_am_a_teapot" }),
    );
    expect(result.title).toBe("Couldn't finalize");
    expect(result.body).toMatch(/saved locally/);
  });

  it("does NOT match by status alone — the BE message is the source of truth (e.g. 409 with no message falls through)", () => {
    // Defensive: the helper should only emit the specific copy
    // when the BE message string matches. A 409 with no body
    // (defensive against a misbehaving proxy) falls back to the
    // generic copy rather than guessing.
    const result = mapFinalizeError(
      inputFor({ status: 409, beMessage: undefined }),
    );
    expect(result.title).toBe("Couldn't finalize");
  });
});
