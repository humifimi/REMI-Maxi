/**
 * Tests for `useCleanIntentSnoozeStore` (PR-UX-20).
 *
 * Coverage:
 *   1. Defaults — empty per-intent map, sessionSuppressed=false.
 *   2. Each snooze duration option:
 *      - "Snooze for this card" → +24h
 *      - "Snooze 1 hour" → +1h
 *      - "Snooze today" → end-of-local-day (next-day midnight)
 *      - "Snooze for this session" → sessionSuppressed=true
 *   3. `isIntentSnoozed` honors per-intent deadlines AND the
 *      session-wide flag.
 *   4. Session boundary — `sessionSuppressed` is NOT persisted but
 *      `snoozedIntentIds` IS persisted.
 *   5. Lazy purge — past per-intent entries are dropped on read.
 *   6. `clearIntent` removes a per-intent entry.
 *   7. `endOfLocalDayMs` computes next-day midnight from a now value.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  ONE_HOUR_MS,
  TWENTY_FOUR_HOURS_MS,
  __resetCleanIntentSnoozeStoreForTests,
  endOfLocalDayMs,
  useCleanIntentSnoozeStore,
} from "../clean-intent-snooze";

const STORAGE_KEY = "@remi/clean-intent-snooze/v1";

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetCleanIntentSnoozeStoreForTests();
});

describe("useCleanIntentSnoozeStore — defaults", () => {
  it("starts empty", () => {
    const state = useCleanIntentSnoozeStore.getState();
    expect(state.snoozedIntentIds).toEqual({});
    expect(state.sessionSuppressed).toBe(false);
    expect(state.isIntentSnoozed(1)).toBe(false);
  });
});

describe("useCleanIntentSnoozeStore — snooze durations", () => {
  it("snoozeIntentForCard sets a 24h deadline", () => {
    const T0 = 1_000_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(T0);
    try {
      useCleanIntentSnoozeStore.getState().snoozeIntentForCard(101);
      const entry = useCleanIntentSnoozeStore.getState().snoozedIntentIds["101"];
      expect(entry.until).toBe(T0 + TWENTY_FOUR_HOURS_MS);
    } finally {
      (Date.now as jest.Mock).mockRestore();
    }
  });

  it("snoozeIntentOneHour sets a +1h deadline", () => {
    const T0 = 1_000_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(T0);
    try {
      useCleanIntentSnoozeStore.getState().snoozeIntentOneHour(101);
      const entry = useCleanIntentSnoozeStore.getState().snoozedIntentIds["101"];
      expect(entry.until).toBe(T0 + ONE_HOUR_MS);
    } finally {
      (Date.now as jest.Mock).mockRestore();
    }
  });

  it("snoozeIntentToday sets next-day midnight (local)", () => {
    // 2026-01-15T13:30:00 local → next midnight is
    // 2026-01-16T00:00:00.
    const noon = new Date(2026, 0, 15, 13, 30).getTime();
    jest.spyOn(Date, "now").mockReturnValue(noon);
    try {
      useCleanIntentSnoozeStore.getState().snoozeIntentToday(101);
      const entry = useCleanIntentSnoozeStore.getState().snoozedIntentIds["101"];
      const expected = new Date(2026, 0, 16, 0, 0, 0).getTime();
      expect(entry.until).toBe(expected);
    } finally {
      (Date.now as jest.Mock).mockRestore();
    }
  });

  it("snoozeForSession sets the session flag without touching the per-intent map", () => {
    useCleanIntentSnoozeStore.getState().snoozeForSession();
    const post = useCleanIntentSnoozeStore.getState();
    expect(post.sessionSuppressed).toBe(true);
    expect(post.snoozedIntentIds).toEqual({});
  });
});

describe("useCleanIntentSnoozeStore — isIntentSnoozed", () => {
  it("returns true when sessionSuppressed regardless of intent", () => {
    useCleanIntentSnoozeStore.getState().snoozeForSession();
    expect(useCleanIntentSnoozeStore.getState().isIntentSnoozed(999)).toBe(true);
  });

  it("returns true while the per-intent deadline is in the future", () => {
    const T0 = 1_000_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(T0);
    try {
      useCleanIntentSnoozeStore.getState().snoozeIntentOneHour(101);
      expect(useCleanIntentSnoozeStore.getState().isIntentSnoozed(101)).toBe(
        true,
      );
    } finally {
      (Date.now as jest.Mock).mockRestore();
    }
  });

  it("lazily purges past per-intent entries on read", () => {
    const T0 = 1_000_000_000_000;
    const dateSpy = jest.spyOn(Date, "now").mockReturnValue(T0);
    try {
      useCleanIntentSnoozeStore.getState().snoozeIntentOneHour(101);
      // Move past the deadline.
      dateSpy.mockReturnValue(T0 + ONE_HOUR_MS + 1);
      expect(useCleanIntentSnoozeStore.getState().isIntentSnoozed(101)).toBe(
        false,
      );
      // Entry was purged from the map.
      expect(
        useCleanIntentSnoozeStore.getState().snoozedIntentIds["101"],
      ).toBeUndefined();
    } finally {
      dateSpy.mockRestore();
    }
  });
});

describe("useCleanIntentSnoozeStore — persistence boundary", () => {
  it("persists snoozedIntentIds across hydrations", async () => {
    useCleanIntentSnoozeStore.getState().snoozeIntentOneHour(101);
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw ?? "{}");
    expect(parsed.state.snoozedIntentIds["101"]).toBeDefined();
  });

  it("does NOT persist sessionSuppressed", async () => {
    useCleanIntentSnoozeStore.getState().snoozeForSession();
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw ?? "{}");
    expect(parsed.state.sessionSuppressed).toBeUndefined();
  });
});

describe("useCleanIntentSnoozeStore — clearIntent", () => {
  it("removes the per-intent entry without touching session flag", () => {
    useCleanIntentSnoozeStore.getState().snoozeForSession();
    useCleanIntentSnoozeStore.getState().snoozeIntentOneHour(101);
    useCleanIntentSnoozeStore.getState().clearIntent(101);
    const post = useCleanIntentSnoozeStore.getState();
    expect(post.snoozedIntentIds["101"]).toBeUndefined();
    expect(post.sessionSuppressed).toBe(true);
  });
});

describe("endOfLocalDayMs", () => {
  it("returns next-day midnight for a daytime now", () => {
    const noon = new Date(2026, 0, 15, 13, 30).getTime();
    expect(endOfLocalDayMs(noon)).toBe(
      new Date(2026, 0, 16, 0, 0, 0).getTime(),
    );
  });
  it("returns tomorrow's midnight when called at exactly midnight", () => {
    const midnight = new Date(2026, 0, 15, 0, 0, 0).getTime();
    expect(endOfLocalDayMs(midnight)).toBe(
      new Date(2026, 0, 16, 0, 0, 0).getTime(),
    );
  });
});
