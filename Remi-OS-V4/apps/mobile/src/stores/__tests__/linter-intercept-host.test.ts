/**
 * Tests for `useLinterInterceptHost` (P3-FE-7).
 *
 * The host is a small Zustand singleton that lets `useSessionAwareSubmit`
 * (the producer) trigger the shared `LinterInterceptSheet` (the consumer)
 * and `await` the user's choice. The tests below pin three contracts:
 *
 *   1. **Open / resolve round-trip** — `present(issues)` returns a Promise
 *      that resolves to the choice passed to `resolveActive(...)`. The
 *      `request` selector flips to a populated value while the sheet is
 *      "open" and back to `null` after resolution.
 *   2. **Eviction** — calling `present(...)` while a previous request is
 *      still open auto-resolves the previous Promise with the dedicated
 *      `"evicted"` sentinel (NOT `undefined`) and replaces the request.
 *      The sentinel lets the producer (`useSessionAwareSubmit`) tell a
 *      programmatic eviction (= a second drag arrived through gesture
 *      handler) apart from a user-initiated dismissal (ESC / backdrop
 *      tap), so the first drag's pending change can be auto-staged
 *      instead of snapping back. Root cause of the 2026-05-13 "every
 *      other card move snaps back" prod bug.
 *   3. **Idle resolveActive is a no-op** — `resolveActive(...)` with no
 *      active request must not throw, must not mutate state. Defends
 *      against double-tap on the sheet's close button.
 *
 * NOTE: this repo does not currently ship a Jest runner end-to-end
 * (see `src/hooks/ui/__tests__/use-wide-canvas.test.ts` for the same
 * precedent / executable-spec rationale). The file follows the canonical
 * shape — every assertion below should pass once the runner lands.
 */

import {
  __resetLinterInterceptHostForTests,
  useLinterInterceptHost,
} from "../linter-intercept-host";
import type { LinterIssue } from "@technician/utils/logistics-linter";

const ISSUE_A: LinterIssue = {
  severity: "warning",
  // 2026-05-08 (linter-sheet-filter-dragged): switched from the
  // historical placeholder `"drive_time_tight"` to a real
  // `LinterIssueKind` value so the file typechecks under
  // `npx tsc --noEmit` while we're touching the host store.
  kind: "fleet_capacity",
  affectedAppointmentIds: [101],
  humanMessage: "Fleet capacity warning involving #100 and #101.",
};

const ISSUE_B: LinterIssue = {
  severity: "error",
  kind: "time_conflict",
  affectedAppointmentIds: [202],
  humanMessage: "Direct overlap with appointment #202.",
};

beforeEach(() => {
  __resetLinterInterceptHostForTests();
});

describe("useLinterInterceptHost — open / resolve round-trip", () => {
  it("populates `request` immediately after present() and clears it on resolveActive()", async () => {
    expect(useLinterInterceptHost.getState().request).toBeNull();

    const promise = useLinterInterceptHost.getState().present([ISSUE_A]);

    const opened = useLinterInterceptHost.getState().request;
    expect(opened).not.toBeNull();
    expect(opened!.issues).toEqual([ISSUE_A]);
    // Default scope when callers omit options — null means "no
    // filtering, render every issue" (legacy fallback).
    expect(opened!.scopeAppointmentIds).toBeNull();

    useLinterInterceptHost.getState().resolveActive("apply");

    await expect(promise).resolves.toBe("apply");
    expect(useLinterInterceptHost.getState().request).toBeNull();
  });

  it("propagates `scopeAppointmentIds` from present() options onto the active request", async () => {
    const scope = new Set([101, 202]);
    const promise = useLinterInterceptHost
      .getState()
      .present([ISSUE_A, ISSUE_B], { scopeAppointmentIds: scope });

    const opened = useLinterInterceptHost.getState().request;
    expect(opened).not.toBeNull();
    expect(opened!.scopeAppointmentIds).toBe(scope);

    useLinterInterceptHost.getState().resolveActive("apply");
    await promise;
  });

  it("resolves to `stage` when the user picks Stage for review", async () => {
    const promise = useLinterInterceptHost.getState().present([ISSUE_A]);
    useLinterInterceptHost.getState().resolveActive("stage");
    await expect(promise).resolves.toBe("stage");
  });

  it("resolves to `undefined` on backdrop / ESC dismiss", async () => {
    const promise = useLinterInterceptHost.getState().present([ISSUE_A]);
    useLinterInterceptHost.getState().resolveActive(undefined);
    await expect(promise).resolves.toBeUndefined();
  });

  it("assigns monotonically-increasing ids so React keying / tests can disambiguate rapid requests", async () => {
    const first = useLinterInterceptHost.getState().present([ISSUE_A]);
    const firstId = useLinterInterceptHost.getState().request!.id;
    useLinterInterceptHost.getState().resolveActive("apply");
    await first;

    const second = useLinterInterceptHost.getState().present([ISSUE_B]);
    const secondId = useLinterInterceptHost.getState().request!.id;
    expect(secondId).toBeGreaterThan(firstId);

    useLinterInterceptHost.getState().resolveActive("apply");
    await second;
  });
});

describe("useLinterInterceptHost — eviction", () => {
  it("auto-resolves a stale request to `\"evicted\"` (NOT undefined) when present() is called again", async () => {
    const stale = useLinterInterceptHost.getState().present([ISSUE_A]);
    const fresh = useLinterInterceptHost.getState().present([ISSUE_B]);

    // 2026-05-13 — the eviction sentinel changed from `undefined`
    // to `"evicted"` so the producer can distinguish programmatic
    // replacement from user dismissal. See the file-level
    // doc-block for the prod-bug context.
    await expect(stale).resolves.toBe("evicted");
    expect(useLinterInterceptHost.getState().request).not.toBeNull();
    expect(useLinterInterceptHost.getState().request!.issues).toEqual([
      ISSUE_B,
    ]);

    useLinterInterceptHost.getState().resolveActive("apply");
    await expect(fresh).resolves.toBe("apply");
  });
});

describe("useLinterInterceptHost — idle resolveActive is a no-op", () => {
  it("does not throw and does not mutate state when there is no active request", () => {
    expect(useLinterInterceptHost.getState().request).toBeNull();
    expect(() =>
      useLinterInterceptHost.getState().resolveActive("apply"),
    ).not.toThrow();
    expect(useLinterInterceptHost.getState().request).toBeNull();
  });
});
