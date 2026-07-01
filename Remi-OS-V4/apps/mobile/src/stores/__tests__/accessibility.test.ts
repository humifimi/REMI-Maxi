/**
 * Tests for `useAccessibilityStore` (P0-FE-1).
 *
 * NOTE: this repo does not currently ship a Jest runner. The master
 * plan §1.2 / §3.10 assumes one exists ("REMITechnician's Jest config
 * aliases…") but the scaffold was never landed in this codebase. Wiring
 * `jest-expo` is tracked separately and is OTA-eligible (devDeps only).
 *
 * Until then this file is excluded from `tsc --noEmit` via the
 * `**\/__tests__\/**` entry in `tsconfig.json` and is treated as
 * executable specification: every assertion below should pass once the
 * runner lands. The shape is standard `jest-expo` semantics.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { AccessibilityInfo } from "react-native";

import {
  useAccessibilityStore,
  __resetAccessibilityStoreForTests,
} from "../accessibility";

const STORE_KEY = "@remi/accessibility/v1";
const LEGACY_KEY = "@bug_report/preferred_hand";

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetAccessibilityStoreForTests();
});

describe("useAccessibilityStore — defaults", () => {
  it("has preferredHand='right' and reducedMotion=false by default", () => {
    const state = useAccessibilityStore.getState();
    expect(state.preferredHand).toBe("right");
    expect(state.reducedMotion).toBe(false);
  });
});

describe("useAccessibilityStore — persistence round-trip", () => {
  it("persists preferredHand under the v1 storage key", async () => {
    useAccessibilityStore.getState().setPreferredHand("left");
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem(STORE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw ?? "{}");
    expect(parsed.state.preferredHand).toBe("left");
  });

  it("persists reducedMotion toggles", async () => {
    useAccessibilityStore.getState().setReducedMotion(true);
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem(STORE_KEY);
    const parsed = JSON.parse(raw ?? "{}");
    expect(parsed.state.reducedMotion).toBe(true);
    expect(parsed.state._initializedReducedMotion).toBe(true);
  });
});

describe("useAccessibilityStore — migration from bug-report storage", () => {
  it("copies legacy @bug_report/preferred_hand value into the store and removes the legacy key", async () => {
    await AsyncStorage.setItem(LEGACY_KEY, "left");
    jest.resetModules();
    const mod = await import("../accessibility");
    await new Promise((r) => setTimeout(r, 50));
    const state = mod.useAccessibilityStore.getState();
    expect(state.preferredHand).toBe("left");
    expect(state._migratedFromBugReport).toBe(true);
    expect(await AsyncStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("is a no-op when the legacy key is absent", async () => {
    jest.resetModules();
    const mod = await import("../accessibility");
    await new Promise((r) => setTimeout(r, 50));
    const state = mod.useAccessibilityStore.getState();
    expect(state.preferredHand).toBe("right");
    expect(state._migratedFromBugReport).toBe(true);
  });

  it("does not run twice — second hydrate respects the migrated flag", async () => {
    await AsyncStorage.setItem(LEGACY_KEY, "left");
    jest.resetModules();
    const first = await import("../accessibility");
    await new Promise((r) => setTimeout(r, 50));
    expect(first.useAccessibilityStore.getState().preferredHand).toBe("left");

    first.useAccessibilityStore.getState().setPreferredHand("right");
    await new Promise((r) => setTimeout(r, 0));

    await AsyncStorage.setItem(LEGACY_KEY, "left");
    jest.resetModules();
    const second = await import("../accessibility");
    await new Promise((r) => setTimeout(r, 50));
    expect(second.useAccessibilityStore.getState().preferredHand).toBe("right");
  });
});

describe("useAccessibilityStore — system reduce-motion sampling", () => {
  it("seeds reducedMotion from AccessibilityInfo on first hydrate only", async () => {
    const spy = jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(true);
    jest.resetModules();
    const mod = await import("../accessibility");
    await new Promise((r) => setTimeout(r, 50));
    expect(mod.useAccessibilityStore.getState().reducedMotion).toBe(true);
    expect(
      mod.useAccessibilityStore.getState()._initializedReducedMotion,
    ).toBe(true);
    spy.mockRestore();
  });
});
