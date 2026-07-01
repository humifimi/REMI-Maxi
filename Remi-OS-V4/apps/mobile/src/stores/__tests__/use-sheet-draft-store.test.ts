/**
 * Tests for `useSheetDraftStore` (P3-FE-6).
 *
 * NOTE: this repo does not currently ship a Jest runner (see
 * `pending-reality.test.ts` for the matching note). Until
 * `jest-expo` lands, this file is excluded from `tsc --noEmit` via
 * the `**\/__tests__\/**` glob in `tsconfig.json` and is treated as
 * executable specification.
 *
 * Coverage:
 *   - defaults (empty drafts map)
 *   - setDraft (fresh write, overwrite same (cacheKey, sheetKind),
 *     coexisting sheetKinds under same cacheKey, coexisting cacheKeys)
 *   - getDraft (hit, miss, isolated by sheetKind)
 *   - clearDraft (drops one sheetKind, removes empty bucket, no-op
 *     on absent key)
 *   - clearForDraft (drops every sheetKind under one cacheKey,
 *     no-op on absent key, leaves siblings intact)
 *   - reset
 *   - sheetDraftCacheKey constructors (string shape)
 */

import {
  __resetSheetDraftStoreForTests,
  sheetDraftCacheKey,
  useSheetDraftStore,
  type SheetKind,
} from "../use-sheet-draft-store";

// ---------------------------------------------------------------------------
// Setup.
// ---------------------------------------------------------------------------

beforeEach(() => {
  __resetSheetDraftStoreForTests();
});

// ---------------------------------------------------------------------------
// Defaults.
// ---------------------------------------------------------------------------

describe("useSheetDraftStore — defaults", () => {
  it("starts with an empty drafts map", () => {
    const state = useSheetDraftStore.getState();
    expect(state.drafts).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// sheetDraftCacheKey.
// ---------------------------------------------------------------------------

describe("sheetDraftCacheKey", () => {
  it("constructs the documented string shapes", () => {
    expect(sheetDraftCacheKey.draft("draft-1")).toBe("draft:draft-1");
    expect(sheetDraftCacheKey.appointment(42)).toBe("appt:42");
    expect(sheetDraftCacheKey.appointment("abc")).toBe("appt:abc");
    expect(sheetDraftCacheKey.personalEvent("pe-uuid")).toBe("pe:pe-uuid");
    expect(sheetDraftCacheKey.reschedule(7)).toBe("reschedule:7");
    expect(sheetDraftCacheKey.cancel(7)).toBe("cancel:7");
    expect(sheetDraftCacheKey.generate()).toBe("generate");
  });
});

// ---------------------------------------------------------------------------
// setDraft / getDraft.
// ---------------------------------------------------------------------------

describe("useSheetDraftStore — setDraft / getDraft", () => {
  it("writes a fresh entry and reads it back via getDraft", () => {
    useSheetDraftStore
      .getState()
      .setDraft("appt:5", "appointment", { note: "WIP" });

    expect(
      useSheetDraftStore.getState().getDraft<{ note: string }>("appt:5", "appointment"),
    ).toEqual({ note: "WIP" });
  });

  it("overwrites the prior values for the same (cacheKey, sheetKind)", () => {
    const store = useSheetDraftStore.getState();
    store.setDraft("appt:5", "appointment", { note: "v1" });
    store.setDraft("appt:5", "appointment", { note: "v2" });

    expect(
      useSheetDraftStore.getState().getDraft<{ note: string }>("appt:5", "appointment"),
    ).toEqual({ note: "v2" });
  });

  it("keeps separate buckets for different sheetKinds under the same cacheKey", () => {
    const store = useSheetDraftStore.getState();
    store.setDraft("appt:5", "appointment", { note: "edit" });
    store.setDraft("appt:5", "cancel", { reason: "weather" });

    const final = useSheetDraftStore.getState();
    expect(final.getDraft("appt:5", "appointment")).toEqual({ note: "edit" });
    expect(final.getDraft("appt:5", "cancel")).toEqual({ reason: "weather" });
  });

  it("keeps separate buckets for different cacheKeys", () => {
    const store = useSheetDraftStore.getState();
    store.setDraft("appt:5", "appointment", { note: "five" });
    store.setDraft("appt:6", "appointment", { note: "six" });

    const final = useSheetDraftStore.getState();
    expect(final.getDraft("appt:5", "appointment")).toEqual({ note: "five" });
    expect(final.getDraft("appt:6", "appointment")).toEqual({ note: "six" });
  });

  it("returns undefined for a miss", () => {
    expect(
      useSheetDraftStore.getState().getDraft("appt:nope", "appointment"),
    ).toBeUndefined();
  });

  it("returns undefined when the cacheKey exists but the sheetKind doesn't", () => {
    useSheetDraftStore.getState().setDraft("appt:5", "appointment", { x: 1 });
    expect(useSheetDraftStore.getState().getDraft("appt:5", "cancel")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// clearDraft.
// ---------------------------------------------------------------------------

describe("useSheetDraftStore — clearDraft", () => {
  it("removes one sheetKind and leaves siblings under the same cacheKey intact", () => {
    const store = useSheetDraftStore.getState();
    store.setDraft("appt:5", "appointment", { note: "edit" });
    store.setDraft("appt:5", "cancel", { reason: "weather" });

    useSheetDraftStore.getState().clearDraft("appt:5", "cancel");

    const final = useSheetDraftStore.getState();
    expect(final.getDraft("appt:5", "appointment")).toEqual({ note: "edit" });
    expect(final.getDraft("appt:5", "cancel")).toBeUndefined();
  });

  it("removes the bucket entirely when the last sheetKind is cleared", () => {
    useSheetDraftStore.getState().setDraft("appt:5", "appointment", { x: 1 });
    useSheetDraftStore.getState().clearDraft("appt:5", "appointment");

    expect(useSheetDraftStore.getState().drafts).toEqual({});
  });

  it("is a no-op when the cacheKey is absent", () => {
    useSheetDraftStore.getState().setDraft("appt:5", "appointment", { x: 1 });
    useSheetDraftStore.getState().clearDraft("appt:nope", "appointment");

    expect(
      useSheetDraftStore.getState().getDraft("appt:5", "appointment"),
    ).toEqual({ x: 1 });
  });

  it("is a no-op when the sheetKind is absent in an existing bucket", () => {
    useSheetDraftStore.getState().setDraft("appt:5", "appointment", { x: 1 });
    useSheetDraftStore.getState().clearDraft("appt:5", "cancel" satisfies SheetKind);

    expect(
      useSheetDraftStore.getState().getDraft("appt:5", "appointment"),
    ).toEqual({ x: 1 });
  });
});

// ---------------------------------------------------------------------------
// clearForDraft.
// ---------------------------------------------------------------------------

describe("useSheetDraftStore — clearForDraft", () => {
  it("removes every sheetKind under the given cacheKey", () => {
    const store = useSheetDraftStore.getState();
    store.setDraft("draft:abc", "appointment", { note: "wip" });
    store.setDraft("draft:abc", "personal-event", { title: "lunch" });

    useSheetDraftStore.getState().clearForDraft("draft:abc");

    const final = useSheetDraftStore.getState();
    expect(final.getDraft("draft:abc", "appointment")).toBeUndefined();
    expect(final.getDraft("draft:abc", "personal-event")).toBeUndefined();
    expect(final.drafts["draft:abc"]).toBeUndefined();
  });

  it("leaves other cacheKeys untouched", () => {
    const store = useSheetDraftStore.getState();
    store.setDraft("draft:abc", "appointment", { note: "abc" });
    store.setDraft("draft:def", "appointment", { note: "def" });

    useSheetDraftStore.getState().clearForDraft("draft:abc");

    expect(
      useSheetDraftStore.getState().getDraft("draft:def", "appointment"),
    ).toEqual({ note: "def" });
  });

  it("is a no-op when the cacheKey is absent", () => {
    useSheetDraftStore.getState().setDraft("appt:5", "appointment", { x: 1 });
    useSheetDraftStore.getState().clearForDraft("draft:nope");

    expect(
      useSheetDraftStore.getState().getDraft("appt:5", "appointment"),
    ).toEqual({ x: 1 });
  });
});

// ---------------------------------------------------------------------------
// reset.
// ---------------------------------------------------------------------------

describe("useSheetDraftStore — reset", () => {
  it("wipes every cacheKey and sheetKind", () => {
    const store = useSheetDraftStore.getState();
    store.setDraft("appt:5", "appointment", { x: 1 });
    store.setDraft("draft:abc", "personal-event", { y: 2 });

    useSheetDraftStore.getState().reset();

    expect(useSheetDraftStore.getState().drafts).toEqual({});
  });
});
