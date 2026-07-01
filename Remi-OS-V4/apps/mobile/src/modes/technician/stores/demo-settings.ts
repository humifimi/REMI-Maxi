import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * `useDemoSettingsStore` — D2P-FE-14.
 *
 * Backs the FO-only "Demo Mode" section of the Settings tab plus the
 * imperative `linterStrictness` filter inside
 * `useSessionAwareSubmit`. Three independent pieces of state live
 * here so that one feature flag can land without entangling the
 * others:
 *
 * - `devShortcutVisible` — controls whether
 *   `PendingRealityDevShortcut` renders on the review screen. Only
 *   meaningful inside `__DEV__` builds; the dev-shortcut self-gates
 *   via `if (!__DEV__) return null;` so flipping this in a
 *   production EAS build is a no-op (the toggle still persists, it
 *   just doesn't render anything).
 * - `linterStrictness` — `"strict"` (default) or `"loose"`. Read
 *   imperatively from `useSessionAwareSubmit` to filter linter
 *   issues before the intercept decision. `"strict"` keeps only
 *   `severity === "error"` issues; `"loose"` keeps everything the
 *   linter returned. See `pending-reality-demo-bundle.md` §6.3.
 * - `dualDeviceMode` — `"a"|"b"|"c"|"d"|null`. Demo-flow sequencing
 *   only; does NOT gate any code path. The Settings UI renders an
 *   inline help card for the chosen mode mirroring PRD §3.3.
 *
 * Persistence: AsyncStorage via Zustand `persist` middleware under
 * `STORAGE_KEY = "demo-settings:v1"`. Same pattern as
 * `useAccessibilityStore` (see `src/stores/accessibility.ts`). NO
 * `expo-secure-store` — these are demo-flow knobs, not secrets.
 *
 * Why imperative reads from the linter wrapper:
 *   `useSessionAwareSubmit` is wrapped in a `useCallback` that takes
 *   a small set of stable dependencies. Subscribing to the
 *   strictness field via `useStore` would force the wrapper to
 *   re-create on every store mutation — defeating the upstream
 *   `useCallback` memoization in form sheets. Imperative
 *   `.getState()` reads are the canonical way to consume
 *   "preference-style" Zustand state from inside a memoized
 *   callback. See PRD §6.3.
 */

export type LinterStrictness = "strict" | "loose";

export type DualDeviceMode = "a" | "b" | "c" | "d" | null;

interface DemoSettingsState {
  devShortcutVisible: boolean;
  linterStrictness: LinterStrictness;
  dualDeviceMode: DualDeviceMode;
  setDevShortcutVisible: (visible: boolean) => void;
  setLinterStrictness: (strictness: LinterStrictness) => void;
  setDualDeviceMode: (mode: DualDeviceMode) => void;
  /** True once the persisted slice has rehydrated from AsyncStorage. */
  _hasHydrated: boolean;
}

const STORAGE_KEY = "demo-settings:v1";

const initialState: Omit<
  DemoSettingsState,
  "setDevShortcutVisible" | "setLinterStrictness" | "setDualDeviceMode"
> = {
  devShortcutVisible: false,
  linterStrictness: "strict",
  dualDeviceMode: null,
  _hasHydrated: false,
};

export const useDemoSettingsStore = create<DemoSettingsState>()(
  persist(
    (set) => ({
      ...initialState,
      setDevShortcutVisible: (visible) => set({ devShortcutVisible: visible }),
      setLinterStrictness: (strictness) =>
        set({ linterStrictness: strictness }),
      setDualDeviceMode: (mode) => set({ dualDeviceMode: mode }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        devShortcutVisible: state.devShortcutVisible,
        linterStrictness: state.linterStrictness,
        dualDeviceMode: state.dualDeviceMode,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn(
            "[demo-settings:store] failed to rehydrate from AsyncStorage",
            error,
          );
          return;
        }
        if (!state) return;
        useDemoSettingsStore.setState({ _hasHydrated: true });
      },
    },
  ),
);

/**
 * Test-only helper. Resets the in-memory store back to defaults so
 * each test starts from a known state. Not exported through the
 * barrel — tests import directly from this module.
 */
export const __resetDemoSettingsStoreForTests = (): void => {
  useDemoSettingsStore.setState({
    ...initialState,
    setDevShortcutVisible:
      useDemoSettingsStore.getState().setDevShortcutVisible,
    setLinterStrictness: useDemoSettingsStore.getState().setLinterStrictness,
    setDualDeviceMode: useDemoSettingsStore.getState().setDualDeviceMode,
  });
};
