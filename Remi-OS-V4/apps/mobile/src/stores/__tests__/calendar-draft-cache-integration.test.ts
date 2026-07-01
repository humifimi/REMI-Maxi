/**
 * Integration tests for the P3-FE-6 wire between
 * `useCalendarStore.{createDraft, dismissDraft}` and
 * `useSheetDraftStore.clearForDraft`.
 *
 * The contract:
 *
 *   - `dismissDraft()` evicts the cache for the outgoing draft so a
 *     fresh draft created at the same cell never silently rehydrates
 *     the previous draft's typing.
 *   - `createDraft()` evicts the cache for the OUTGOING draft (when
 *     replacing an existing pendingDraft without an explicit
 *     dismiss), for the same reason as above.
 *
 * NOTE (executable spec): this file lives under `src/stores/__tests__/`
 * so it's excluded from `tsc --noEmit` via the workspace
 * `tsconfig.json` `**\/__tests__\/**` exclude. See the matching note
 * in `pending-reality.test.ts`.
 */

import { useCalendarStore } from "../calendar";
import {
  __resetSheetDraftStoreForTests,
  sheetDraftCacheKey,
  useSheetDraftStore,
} from "../use-sheet-draft-store";

beforeEach(() => {
  __resetSheetDraftStoreForTests();
  useCalendarStore.getState().dismissDraft();
});

// ---------------------------------------------------------------------------
// dismissDraft → clearForDraft.
// ---------------------------------------------------------------------------

describe("useCalendarStore.dismissDraft → useSheetDraftStore.clearForDraft", () => {
  it("evicts every cached sheetKind under the outgoing draft's cacheKey", () => {
    useCalendarStore.getState().createDraft({
      date: "2026-04-24",
      startMinutes: 9 * 60,
      technicianId: 42,
    });
    const draft = useCalendarStore.getState().pendingDraft!;
    const cacheKey = sheetDraftCacheKey.draft(draft.draftId);

    useSheetDraftStore
      .getState()
      .setDraft(cacheKey, "appointment", { note: "wip" });
    useSheetDraftStore
      .getState()
      .setDraft(cacheKey, "personal-event", { title: "lunch" });

    useCalendarStore.getState().dismissDraft();

    expect(useSheetDraftStore.getState().drafts[cacheKey]).toBeUndefined();
  });

  it("leaves unrelated cache buckets intact", () => {
    useCalendarStore.getState().createDraft({
      date: "2026-04-24",
      startMinutes: 9 * 60,
      technicianId: 42,
    });
    const draft = useCalendarStore.getState().pendingDraft!;
    const draftKey = sheetDraftCacheKey.draft(draft.draftId);

    useSheetDraftStore.getState().setDraft(draftKey, "appointment", { note: "wip" });
    // Unrelated cache entry (e.g. an in-flight reschedule on a real
    // appointment somewhere else on screen).
    useSheetDraftStore
      .getState()
      .setDraft(sheetDraftCacheKey.appointment(7), "appointment", { note: "edit" });

    useCalendarStore.getState().dismissDraft();

    expect(useSheetDraftStore.getState().drafts[draftKey]).toBeUndefined();
    expect(
      useSheetDraftStore.getState().getDraft(
        sheetDraftCacheKey.appointment(7),
        "appointment",
      ),
    ).toEqual({ note: "edit" });
  });
});

// ---------------------------------------------------------------------------
// createDraft cache eviction (outgoing draft replaced).
// ---------------------------------------------------------------------------

describe("useCalendarStore.createDraft → useSheetDraftStore.clearForDraft", () => {
  it("evicts the OUTGOING draft's cache when a new draft replaces it without an explicit dismiss", () => {
    useCalendarStore.getState().createDraft({
      date: "2026-04-24",
      startMinutes: 9 * 60,
      technicianId: 42,
    });
    const firstDraft = useCalendarStore.getState().pendingDraft!;
    const firstKey = sheetDraftCacheKey.draft(firstDraft.draftId);

    useSheetDraftStore.getState().setDraft(firstKey, "appointment", { note: "abandoned" });

    useCalendarStore.getState().createDraft({
      date: "2026-04-24",
      startMinutes: 11 * 60,
      technicianId: 43,
    });
    const secondDraft = useCalendarStore.getState().pendingDraft!;

    expect(secondDraft.draftId).not.toBe(firstDraft.draftId);
    // First draft's cache is gone — no silent rehydrate when the
    // user opens the second draft's form sheet.
    expect(useSheetDraftStore.getState().drafts[firstKey]).toBeUndefined();
    // Second draft starts with no cache (the user hasn't opened a
    // form for it yet).
    expect(
      useSheetDraftStore.getState().drafts[
        sheetDraftCacheKey.draft(secondDraft.draftId)
      ],
    ).toBeUndefined();
  });
});
