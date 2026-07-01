import { AccessibilityInfo } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Global accessibility preferences. Used by:
 *   - bug reporter (preferredHand → bubble snap edge, settings UI)
 *   - landscape calendar avatar strip placement (P2-FE-4 — reads
 *     preferredHand to decide which side of the screen to anchor the
 *     strip to)
 *   - any future a11y feature (font scale, hit-slop boost, etc.)
 *
 * Persistence: AsyncStorage via Zustand `persist` middleware. Same
 * pattern as `useCalendarStore` (see `src/stores/calendar.ts`).
 *
 * Why a dedicated store instead of nesting these prefs inside a
 * feature-specific store: landscape work (Phase 2) needs preferredHand
 * but should not import from a bug-reporter store. See master plan
 * §1.5/A1 + chunk P0-FE-1.
 */

export type PreferredHand = "left" | "right";

/**
 * Pure helper — returns the screen edge OPPOSITE the user's preferred
 * hand. Used by every landscape control whose visual home is "the
 * edge the avatar strip ISN'T on" (the avatar strip itself anchors
 * to `preferredHand`).
 *
 * Today's callsites:
 *   - `MapToggleButton` (P2-FE-7) — top corner of the opposite edge.
 *   - `PendingRealityHUD` (P3-FE-3) — stacked under the map toggle on
 *     the same opposite edge.
 *
 * Single-source the rule here so a future "swap which edge the strip
 * lives on for left-handed users" change touches one definition
 * instead of N inlined ternaries that can drift independently.
 */
export function getOppositeEdge(hand: PreferredHand): "left" | "right" {
  return hand === "right" ? "left" : "right";
}

export interface AccessibilityPrefs {
  preferredHand: PreferredHand;
  reducedMotion: boolean;
}

interface AccessibilityState extends AccessibilityPrefs {
  setPreferredHand: (hand: PreferredHand) => void;
  setReducedMotion: (enabled: boolean) => void;
  /** True once the persisted slice has rehydrated from AsyncStorage. */
  _hasHydrated: boolean;
  /**
   * One-time migration flag — set to true once we have either copied a
   * legacy `@bug_report/preferred_hand` value into this store, or
   * confirmed there was nothing to migrate. Prevents the migration
   * shim from ever running twice.
   *
   * TODO: remove this flag along with the migration block in
   * `runOneTimeMigrations` below once enough users have upgraded past
   * the cutover release.
   * REMOVE-AFTER: v2.5.0
   */
  _migratedFromBugReport: boolean;
  /**
   * One-time flag — set to true after we've sampled the system's
   * "Reduce Motion" preference for this install. After that, the value
   * is fully user-controlled (toggling in settings, toggling here).
   * The system preference is NOT re-sampled on every launch because
   * doing so would silently override the user's explicit choice.
   */
  _initializedReducedMotion: boolean;
}

/**
 * Legacy AsyncStorage key the bug reporter used to persist this
 * preference under. Kept here (not imported from
 * `src/constants/bug-report`) so the migration shim has a stable
 * reference even if the bug-report constant is later removed.
 *
 * REMOVE-AFTER: v2.5.0 (alongside `_migratedFromBugReport` and the
 * `runOneTimeMigrations` block).
 */
const LEGACY_BUG_REPORT_PREFERRED_HAND_KEY = "@bug_report/preferred_hand";

const initialState: Omit<
  AccessibilityState,
  "setPreferredHand" | "setReducedMotion"
> = {
  preferredHand: "right",
  reducedMotion: false,
  _hasHydrated: false,
  _migratedFromBugReport: false,
  _initializedReducedMotion: false,
};

export const useAccessibilityStore = create<AccessibilityState>()(
  persist(
    (set) => ({
      ...initialState,

      setPreferredHand: (hand) => set({ preferredHand: hand }),
      setReducedMotion: (enabled) =>
        set({ reducedMotion: enabled, _initializedReducedMotion: true }),
    }),
    {
      name: "@remi/accessibility/v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        preferredHand: state.preferredHand,
        reducedMotion: state.reducedMotion,
        _migratedFromBugReport: state._migratedFromBugReport,
        _initializedReducedMotion: state._initializedReducedMotion,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn(
            "[a11y:store] failed to rehydrate accessibility prefs",
            error,
          );
          return;
        }
        if (!state) return;
        useAccessibilityStore.setState({ _hasHydrated: true });
        void runOneTimeMigrations();
        void initializeReducedMotionFromSystem();
      },
    },
  ),
);

/**
 * Migrates `preferredHand` out of the legacy bug-report AsyncStorage
 * blob into this store. Idempotent — guarded by
 * `_migratedFromBugReport`.
 *
 * REMOVE-AFTER: v2.5.0 (drop this function and the legacy key
 * constant; users on builds that old will accept the default value).
 */
async function runOneTimeMigrations(): Promise<void> {
  const { _migratedFromBugReport } = useAccessibilityStore.getState();
  if (_migratedFromBugReport) return;

  try {
    const legacy = await AsyncStorage.getItem(
      LEGACY_BUG_REPORT_PREFERRED_HAND_KEY,
    );
    if (legacy === "left" || legacy === "right") {
      useAccessibilityStore.setState({
        preferredHand: legacy,
        _migratedFromBugReport: true,
      });
      await AsyncStorage.removeItem(LEGACY_BUG_REPORT_PREFERRED_HAND_KEY);
      console.log(
        "[a11y:store] migrated preferredHand from bug-report storage",
        legacy,
      );
    } else {
      useAccessibilityStore.setState({ _migratedFromBugReport: true });
    }
  } catch (err) {
    console.warn(
      "[a11y:store] migration from bug-report storage failed; will retry on next launch",
      err,
    );
  }
}

/**
 * Samples the system "Reduce Motion" preference exactly once per
 * install and seeds `reducedMotion`. After that the value is
 * user-controlled — we deliberately do NOT re-sync from the system on
 * every launch, because the user may have toggled it off in our
 * settings even with system reduce-motion on.
 */
async function initializeReducedMotionFromSystem(): Promise<void> {
  const { _initializedReducedMotion } = useAccessibilityStore.getState();
  if (_initializedReducedMotion) return;

  try {
    const enabled = await AccessibilityInfo.isReduceMotionEnabled();
    useAccessibilityStore.setState({
      reducedMotion: enabled,
      _initializedReducedMotion: true,
    });
  } catch (err) {
    console.warn(
      "[a11y:store] could not read system reduce-motion preference",
      err,
    );
    useAccessibilityStore.setState({ _initializedReducedMotion: true });
  }
}

/**
 * Test-only helper. Resets the in-memory store back to defaults so
 * each test starts from a known state. Not exported through the
 * barrel — tests import directly from this module.
 */
export const __resetAccessibilityStoreForTests = (): void => {
  useAccessibilityStore.setState({
    ...initialState,
    setPreferredHand: useAccessibilityStore.getState().setPreferredHand,
    setReducedMotion: useAccessibilityStore.getState().setReducedMotion,
  });
};
