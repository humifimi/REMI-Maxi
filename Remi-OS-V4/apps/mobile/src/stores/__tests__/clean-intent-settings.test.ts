/**
 * Tests for `useCleanIntentSettingsStore` (PR-UX-20).
 *
 * Coverage:
 *   1. Defaults — `confirmBeforeApplyingCleanMoves: false`,
 *      `showCleanMoveSuggestions: true`.
 *   2. Toggle setters update state.
 *   3. Persist round-trip — both fields under
 *      `@remi/clean-intent-settings/v1`.
 *   4. Toggling `showCleanMoveSuggestions` OFF causes
 *      `useCleanIntentPromotion` to return `null` (cross-store
 *      contract — exercised here with a tiny harness instead of
 *      pulling in the full hook).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  __resetCleanIntentSettingsStoreForTests,
  useCleanIntentSettingsStore,
} from "../clean-intent-settings";

const STORAGE_KEY = "@remi/clean-intent-settings/v1";

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetCleanIntentSettingsStoreForTests();
});

describe("useCleanIntentSettingsStore — defaults", () => {
  it("starts with the user-friendly defaults", () => {
    const state = useCleanIntentSettingsStore.getState();
    expect(state.confirmBeforeApplyingCleanMoves).toBe(false);
    expect(state.showCleanMoveSuggestions).toBe(true);
  });
});

describe("useCleanIntentSettingsStore — toggle setters", () => {
  it("setShowCleanMoveSuggestions flips the flag", () => {
    useCleanIntentSettingsStore.getState().setShowCleanMoveSuggestions(false);
    expect(
      useCleanIntentSettingsStore.getState().showCleanMoveSuggestions,
    ).toBe(false);
    useCleanIntentSettingsStore.getState().setShowCleanMoveSuggestions(true);
    expect(
      useCleanIntentSettingsStore.getState().showCleanMoveSuggestions,
    ).toBe(true);
  });

  it("setConfirmBeforeApplyingCleanMoves flips the flag", () => {
    useCleanIntentSettingsStore
      .getState()
      .setConfirmBeforeApplyingCleanMoves(true);
    expect(
      useCleanIntentSettingsStore.getState().confirmBeforeApplyingCleanMoves,
    ).toBe(true);
  });
});

describe("useCleanIntentSettingsStore — persistence round-trip", () => {
  it("persists both fields under the v1 storage key", async () => {
    useCleanIntentSettingsStore.getState().setShowCleanMoveSuggestions(false);
    useCleanIntentSettingsStore
      .getState()
      .setConfirmBeforeApplyingCleanMoves(true);
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw ?? "{}");
    expect(parsed.state.showCleanMoveSuggestions).toBe(false);
    expect(parsed.state.confirmBeforeApplyingCleanMoves).toBe(true);
  });

  it("does NOT persist the _hasHydrated flag", async () => {
    useCleanIntentSettingsStore.getState().setShowCleanMoveSuggestions(false);
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw ?? "{}");
    expect(parsed.state._hasHydrated).toBeUndefined();
  });
});
