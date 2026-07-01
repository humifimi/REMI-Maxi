/**
 * Tests for the new `setSelectedTechIds` action on `useCalendarStore`
 * (P2-FE-6 — drag-to-avatar drop calls this to "switch to a single
 * tech's calendar" when an event is released over an avatar tile).
 *
 * Coverage:
 *
 *   1. Replaces the entire `selectedTechIds` array (not append-style
 *      like `toggleCalendarTech`).
 *   2. Dedupes input order-preserving.
 *   3. Coerces stringy ids defensively (the bbox map uses string keys
 *      so the drop hit-test could conceivably surface a stringified
 *      tech id).
 *   4. Drops non-finite ids (NaN from a bad parse, etc.).
 *   5. Is a no-op when `next` array equals current selection — no
 *      state write, no listener notification.
 *
 * NOTE (executable spec): this file lives under
 * `src/stores/__tests__/` so it's already excluded from `tsc
 * --noEmit` via the workspace `tsconfig.json` exclude pattern that
 * skips all `**\/__tests__\/**`. See `accessibility.test.ts` for the
 * established convention.
 */

import { useCalendarStore } from "../calendar";

const SETTING_KEYS_TO_PRESERVE: Array<keyof ReturnType<typeof useCalendarStore.getState>> = [];

beforeEach(() => {
  // Reset only the slice we're testing — keep the rest of the
  // persisted defaults untouched so other store actions can still
  // function during teardown if jest re-uses the module.
  useCalendarStore.setState({ selectedTechIds: [] });
  void SETTING_KEYS_TO_PRESERVE; // intentionally unused — placeholder for future expansions.
});

describe("useCalendarStore.setSelectedTechIds", () => {
  it("replaces the whole selection array (not additive like toggle)", () => {
    useCalendarStore.setState({ selectedTechIds: [1, 2, 3] });

    useCalendarStore.getState().setSelectedTechIds([99]);

    expect(useCalendarStore.getState().selectedTechIds).toEqual([99]);
  });

  it("dedupes input order-preserving", () => {
    useCalendarStore.getState().setSelectedTechIds([5, 5, 7, 5, 7, 11]);

    expect(useCalendarStore.getState().selectedTechIds).toEqual([5, 7, 11]);
  });

  it("coerces stringy ids defensively", () => {
    useCalendarStore
      .getState()
      .setSelectedTechIds([
        // The drop hit-test pulls keys from a `Record<string, AvatarBbox>`
        // SV — those keys are stringified at insertion time. The store
        // must accept and normalise them rather than silently keeping a
        // string in the selection array.
        "42" as unknown as number,
        "42" as unknown as number,
        "7" as unknown as number,
      ]);

    expect(useCalendarStore.getState().selectedTechIds).toEqual([42, 7]);
  });

  it("drops non-finite ids (NaN from a bad parse)", () => {
    useCalendarStore
      .getState()
      .setSelectedTechIds([
        Number.NaN,
        "abc" as unknown as number,
        7,
        Number.POSITIVE_INFINITY,
        9,
      ]);

    expect(useCalendarStore.getState().selectedTechIds).toEqual([7, 9]);
  });

  it("is a no-op when `next` equals current selection (no reference change)", () => {
    useCalendarStore.setState({ selectedTechIds: [3, 5] });
    const before = useCalendarStore.getState().selectedTechIds;

    useCalendarStore.getState().setSelectedTechIds([3, 5]);

    // Same content → identical reference (no `set()` call), proving
    // the `prev.every(...)` guard short-circuited the write. Without
    // that guard every drop-on-already-selected-avatar would re-emit
    // a new array reference and force every Calendar consumer to
    // re-render.
    const after = useCalendarStore.getState().selectedTechIds;
    expect(after).toBe(before);

    // Different content → new reference.
    useCalendarStore.getState().setSelectedTechIds([3]);
    const next = useCalendarStore.getState().selectedTechIds;
    expect(next).not.toBe(before);
    expect(next).toEqual([3]);
  });

  it("treats order-different inputs as a real change (not a dedupe-equal no-op)", () => {
    useCalendarStore.setState({ selectedTechIds: [1, 2] });
    useCalendarStore.getState().setSelectedTechIds([2, 1]);
    expect(useCalendarStore.getState().selectedTechIds).toEqual([2, 1]);
  });
});
