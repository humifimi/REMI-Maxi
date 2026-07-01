/**
 * Tests for the pure copy helpers driving the `LinterInterceptSheet`
 * header. The full component test would require standing up a
 * BottomSheet + reanimated worklets + dynamic popup-side viewport
 * mocks; these helpers are extracted so the copy contract can be
 * pinned without that overhead.
 *
 * The user-visible contract:
 *
 *   - When EVERY displayed issue is `time_conflict` +
 *     `collisionWith === "staged_intent"`, the sheet uses a softer
 *     amber framing ("Pending move overlap" / "This would overlap a
 *     pending move."). This is the case from the 2026-05-12
 *     "why does it stage 2 intentions in 1 place?" user feedback —
 *     the user already owns both sides of the conflict, nothing on
 *     the committed calendar is in danger, and Stage-for-review is
 *     a reasonable thing to do on purpose for drag imprecision the
 *     user plans to fine-tune later.
 *
 *   - Otherwise (any committed-world overlap, OR a non-time_conflict
 *     issue, OR an empty list), the sheet keeps its original red
 *     "Conflict notice" / "Hold on — this would conflict." framing.
 *
 * See docs/PLAN-DEVIATIONS.md#2026-05-12-pending-move-overlap-soft-framing.
 */

import {
  classifyIssueMix,
  buildSheetHeader,
} from "@technician/components/calendar/linter-intercept-sheet";
import type { LinterIssue } from "@technician/utils/logistics-linter";

const STAGED_INTENT_OVERLAP: LinterIssue = {
  severity: "error",
  kind: "time_conflict",
  affectedAppointmentIds: [5002, 7777],
  humanMessage: "Two changes in this session …",
  collisionWith: "staged_intent",
};

const COMMITTED_OVERLAP: LinterIssue = {
  severity: "error",
  kind: "time_conflict",
  affectedAppointmentIds: [5002, 200],
  humanMessage: "Proposed time overlaps committed appointment #200 …",
  collisionWith: "committed",
};

const DRIVE_TIME_WARNING: LinterIssue = {
  severity: "warning",
  kind: "drive_time_impossible",
  affectedAppointmentIds: [5002, 5003],
  humanMessage: "New end time leaves only 2 min before the next stop …",
};

describe("classifyIssueMix", () => {
  it("returns 'pending-only' when every issue is staged-intent overlap", () => {
    expect(classifyIssueMix([STAGED_INTENT_OVERLAP])).toBe("pending-only");
    expect(
      classifyIssueMix([STAGED_INTENT_OVERLAP, STAGED_INTENT_OVERLAP]),
    ).toBe("pending-only");
  });

  it("returns 'committed-or-mixed' when any issue is committed-world overlap", () => {
    expect(classifyIssueMix([COMMITTED_OVERLAP])).toBe("committed-or-mixed");
    expect(
      classifyIssueMix([STAGED_INTENT_OVERLAP, COMMITTED_OVERLAP]),
    ).toBe("committed-or-mixed");
  });

  it("returns 'committed-or-mixed' when any non-time_conflict issue is present", () => {
    // A drive-time / sla / fleet / recurring issue carries no
    // `collisionWith` discriminator, and the user-facing copy
    // should not soft-frame those — they're not "your pending move
    // overlaps another pending move," they're real-world conflicts.
    expect(classifyIssueMix([DRIVE_TIME_WARNING])).toBe("committed-or-mixed");
    expect(
      classifyIssueMix([STAGED_INTENT_OVERLAP, DRIVE_TIME_WARNING]),
    ).toBe("committed-or-mixed");
  });

  it("returns 'committed-or-mixed' on empty list (fall-through to the urgent framing)", () => {
    // An empty list is the post-scope-filter "we don't actually
    // have any conflicts on the dragged card" case. The sheet
    // shouldn't have opened — but if it did, keep the urgent
    // framing since it's the safer default.
    expect(classifyIssueMix([])).toBe("committed-or-mixed");
  });
});

describe("buildSheetHeader", () => {
  it("pending-only mix → soft amber eyebrow + 'overlap pending move' title", () => {
    const header = buildSheetHeader("pending-only", 1, 0);
    expect(header.eyebrow).toBe("Pending move overlap");
    expect(header.title).toBe("This would overlap a pending move.");
    expect(header.subtitle).toMatch(/staged this session/i);
    expect(header.eyebrowColor).toBe("#B45309"); // amber-700
  });

  it("pending-only mix with multiple overlaps → plural subtitle", () => {
    const header = buildSheetHeader("pending-only", 2, 1);
    // 2 errors + 1 warning = 3 total → plural copy
    expect(header.subtitle).toMatch(/3 other changes/i);
  });

  it("committed-or-mixed mix → original red 'Hold on — this would conflict.' framing", () => {
    const header = buildSheetHeader("committed-or-mixed", 1, 0);
    expect(header.eyebrow).toBe("Conflict notice");
    expect(header.title).toBe("Hold on — this would conflict.");
    expect(header.eyebrowColor).toBe("#DC2626"); // red-600
  });

  it("committed-or-mixed subtitle uses the legacy error/warning count phrasing", () => {
    const header = buildSheetHeader("committed-or-mixed", 2, 1);
    expect(header.subtitle).toMatch(/error/);
    expect(header.subtitle).toMatch(/warning/);
  });
});
