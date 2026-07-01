/**
 * Tests for `useCleanIntentPromotionStore` (PR-UX-20).
 *
 * Coverage:
 *   1. Defaults — empty maps, no system-wide cooldown, persistence
 *      key is `@remi/clean-intent-promotion/v1`.
 *   2. Per-intent rule — first dismissal records, second dismissal
 *      hits the suppression threshold, third call is suppressed.
 *   3. System-wide rule — 5 dismissals inside the 60s window trip
 *      `systemWideSuppressedUntil` to `now + 5 minutes`. Subsequent
 *      reads return `true` until the cooldown lapses.
 *   4. 5-minute auto-clear — `isSystemWideSuppressed()` returns
 *      `false` and clears the timestamp once the deadline passes.
 *   5. `clearIntent` wipes per-intent counters when called.
 *   6. Sliding window — dismissals older than 60s do NOT count
 *      toward the system-wide rule.
 *   7. Persistence boundary — `recentDismissals` and
 *      `systemWideSuppressedUntil` do NOT survive a remount; the
 *      per-intent map does.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  PER_INTENT_DISMISSAL_THRESHOLD,
  SYSTEM_WIDE_COOLDOWN_MS,
  SYSTEM_WIDE_DISMISSAL_THRESHOLD,
  SYSTEM_WIDE_WINDOW_MS,
  __resetCleanIntentPromotionStoreForTests,
  useCleanIntentPromotionStore,
} from "../clean-intent-promotion";

const STORAGE_KEY = "@remi/clean-intent-promotion/v1";

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetCleanIntentPromotionStoreForTests();
});

describe("useCleanIntentPromotionStore — defaults", () => {
  it("starts with empty counters and no cooldown", () => {
    const state = useCleanIntentPromotionStore.getState();
    expect(state.dismissalsByIntentId).toEqual({});
    expect(state.recentDismissals).toEqual([]);
    expect(state.systemWideSuppressedUntil).toBeNull();
    expect(state.isSystemWideSuppressed()).toBe(false);
  });

  it("isIntentSuppressed returns false for unknown ids", () => {
    expect(useCleanIntentPromotionStore.getState().isIntentSuppressed(42)).toBe(
      false,
    );
  });
});

describe("useCleanIntentPromotionStore — per-intent rule", () => {
  it("records each dismissal and trips suppression on the Nth attempt", () => {
    const store = useCleanIntentPromotionStore.getState();
    expect(PER_INTENT_DISMISSAL_THRESHOLD).toBe(2);

    store.recordDismissal(101);
    expect(useCleanIntentPromotionStore.getState().isIntentSuppressed(101)).toBe(
      false,
    );

    store.recordDismissal(101);
    expect(useCleanIntentPromotionStore.getState().isIntentSuppressed(101)).toBe(
      true,
    );

    // Third dismissal still suppressed (the count just keeps growing).
    store.recordDismissal(101);
    expect(useCleanIntentPromotionStore.getState().isIntentSuppressed(101)).toBe(
      true,
    );
  });

  it("clearIntent wipes the per-intent count", () => {
    const store = useCleanIntentPromotionStore.getState();
    store.recordDismissal(101);
    store.recordDismissal(101);
    expect(store.isIntentSuppressed(101)).toBe(true);

    store.clearIntent(101);
    expect(useCleanIntentPromotionStore.getState().isIntentSuppressed(101)).toBe(
      false,
    );
  });

  it("counts are independent per intent id", () => {
    const store = useCleanIntentPromotionStore.getState();
    store.recordDismissal(1);
    store.recordDismissal(1);
    store.recordDismissal(2);
    expect(store.isIntentSuppressed(1)).toBe(true);
    expect(store.isIntentSuppressed(2)).toBe(false);
  });
});

describe("useCleanIntentPromotionStore — system-wide rate limit", () => {
  it("trips after the threshold dismissals inside the window", () => {
    const store = useCleanIntentPromotionStore.getState();
    expect(SYSTEM_WIDE_DISMISSAL_THRESHOLD).toBe(5);

    for (let i = 0; i < SYSTEM_WIDE_DISMISSAL_THRESHOLD - 1; i += 1) {
      store.recordDismissal(1000 + i);
      expect(
        useCleanIntentPromotionStore.getState().isSystemWideSuppressed(),
      ).toBe(false);
    }
    store.recordDismissal(2000);
    const post = useCleanIntentPromotionStore.getState();
    expect(post.systemWideSuppressedUntil).not.toBeNull();
    expect(post.isSystemWideSuppressed()).toBe(true);
  });

  it("auto-clears the cooldown after 5 minutes", () => {
    const realDate = Date.now;
    const T0 = 1_000_000_000_000;
    const dateSpy = jest.spyOn(Date, "now").mockReturnValue(T0);
    try {
      const store = useCleanIntentPromotionStore.getState();
      for (let i = 0; i < SYSTEM_WIDE_DISMISSAL_THRESHOLD; i += 1) {
        store.recordDismissal(1000 + i);
      }
      expect(
        useCleanIntentPromotionStore.getState().isSystemWideSuppressed(),
      ).toBe(true);

      // Jump forward past the cooldown window. `isSystemWideSuppressed`
      // should auto-clear and return false.
      dateSpy.mockReturnValue(T0 + SYSTEM_WIDE_COOLDOWN_MS + 1);
      expect(
        useCleanIntentPromotionStore.getState().isSystemWideSuppressed(),
      ).toBe(false);
      expect(
        useCleanIntentPromotionStore.getState().systemWideSuppressedUntil,
      ).toBeNull();
    } finally {
      dateSpy.mockRestore();
      Date.now = realDate;
    }
  });

  it("dismissals older than the window do NOT count", () => {
    const T0 = 1_000_000_000_000;
    const dateSpy = jest.spyOn(Date, "now").mockReturnValue(T0);
    try {
      const store = useCleanIntentPromotionStore.getState();
      // Dismiss 4 times at T0.
      for (let i = 0; i < 4; i += 1) {
        store.recordDismissal(1000 + i);
      }
      // Move past the sliding window.
      dateSpy.mockReturnValue(T0 + SYSTEM_WIDE_WINDOW_MS + 1);
      // 5th dismissal lands AFTER the window — the older 4 are
      // pruned, so only 1 dismissal counts.
      store.recordDismissal(1004);
      expect(
        useCleanIntentPromotionStore.getState().isSystemWideSuppressed(),
      ).toBe(false);
    } finally {
      dateSpy.mockRestore();
    }
  });
});

describe("useCleanIntentPromotionStore — persistence boundary", () => {
  it("persists per-intent counters across hydrations", async () => {
    useCleanIntentPromotionStore.getState().recordDismissal(101);
    useCleanIntentPromotionStore.getState().recordDismissal(101);
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw ?? "{}");
    expect(parsed.state.dismissalsByIntentId["101"]).toEqual(
      expect.objectContaining({ count: 2 }),
    );
  });

  it("does NOT persist recentDismissals or systemWideSuppressedUntil", async () => {
    const store = useCleanIntentPromotionStore.getState();
    for (let i = 0; i < SYSTEM_WIDE_DISMISSAL_THRESHOLD; i += 1) {
      store.recordDismissal(1000 + i);
    }
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw ?? "{}");
    expect(parsed.state.recentDismissals).toBeUndefined();
    expect(parsed.state.systemWideSuppressedUntil).toBeUndefined();
  });
});

describe("useCleanIntentPromotionStore — reset()", () => {
  it("wipes every counter, the window, and the cooldown", () => {
    const store = useCleanIntentPromotionStore.getState();
    for (let i = 0; i < SYSTEM_WIDE_DISMISSAL_THRESHOLD; i += 1) {
      store.recordDismissal(1000 + i);
    }
    expect(store.isSystemWideSuppressed()).toBe(true);
    store.reset();
    const post = useCleanIntentPromotionStore.getState();
    expect(post.dismissalsByIntentId).toEqual({});
    expect(post.recentDismissals).toEqual([]);
    expect(post.systemWideSuppressedUntil).toBeNull();
  });
});
