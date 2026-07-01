import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BUG_REPORT_CONFIG } from "@technician/constants/bug-report";

const KEYS = BUG_REPORT_CONFIG.ASYNC_STORAGE_KEYS;
const DISMISS_CFG = BUG_REPORT_CONFIG.DISMISS;

interface DismissEntry {
  timestamp: number;
}

interface BubblePosition {
  x: number;
  y: number;
}

interface BubbleStoreState {
  isEnabled: boolean;
  isVisible: boolean;
  position: BubblePosition;
  showFirstTimeTooltip: boolean;
  dismissCount: number;
  shouldSuggestDisable: boolean;
  shakeEnabled: boolean;
  isHydrated: boolean;

  hydrate: () => Promise<void>;
  dismiss: () => Promise<void>;
  updatePosition: (pos: BubblePosition) => Promise<void>;
  disablePermanently: () => Promise<void>;
  enablePermanently: () => Promise<void>;
  resetDismissCount: () => Promise<void>;
  smartHide: () => void;
  smartShow: () => void;
  dismissTooltip: () => Promise<void>;
  setShakeEnabled: (enabled: boolean) => Promise<void>;
}

const useBubbleStore = create<BubbleStoreState>((set, get) => ({
  isEnabled: true,
  isVisible: true,
  position: { x: -1, y: -1 },
  showFirstTimeTooltip: false,
  dismissCount: 0,
  shouldSuggestDisable: false,
  shakeEnabled: true,
  isHydrated: false,

  hydrate: async () => {
    if (get().isHydrated) return;
    try {
      const [enabledRaw, posRaw, tooltipRaw, dismissRaw, shakeRaw] =
        await Promise.all([
          AsyncStorage.getItem(KEYS.BUBBLE_ENABLED),
          AsyncStorage.getItem(KEYS.BUBBLE_POSITION),
          AsyncStorage.getItem(KEYS.FIRST_TIME_TOOLTIP),
          AsyncStorage.getItem(KEYS.BUBBLE_DISMISS_LOG),
          AsyncStorage.getItem(KEYS.SHAKE_ENABLED),
        ]);

      const updates: Partial<BubbleStoreState> = { isHydrated: true };

      if (enabledRaw !== null) {
        const enabled = enabledRaw !== "false";
        updates.isEnabled = enabled;
        updates.isVisible = enabled;
      }

      if (posRaw) {
        try {
          updates.position = JSON.parse(posRaw) as BubblePosition;
        } catch {
          /* use default */
        }
      }

      updates.showFirstTimeTooltip = tooltipRaw !== "shown";

      if (dismissRaw) {
        try {
          const log = JSON.parse(dismissRaw) as DismissEntry[];
          const windowMs =
            DISMISS_CFG.DISABLE_SUGGESTION_WINDOW_HOURS * 60 * 60 * 1000;
          const cutoff = Date.now() - windowMs;
          const recent = log.filter((e) => e.timestamp > cutoff);
          updates.dismissCount = recent.length;
          updates.shouldSuggestDisable =
            recent.length >= DISMISS_CFG.DISABLE_SUGGESTION_COUNT;
        } catch {
          /* use default */
        }
      }

      if (shakeRaw !== null) {
        updates.shakeEnabled = shakeRaw !== "false";
      }

      set(updates);
    } catch {
      set({ isHydrated: true });
    }
  },

  dismiss: async () => {
    set({ isVisible: false });

    try {
      const raw = await AsyncStorage.getItem(KEYS.BUBBLE_DISMISS_LOG);
      const log: DismissEntry[] = raw ? JSON.parse(raw) : [];
      log.push({ timestamp: Date.now() });

      const windowMs =
        DISMISS_CFG.DISABLE_SUGGESTION_WINDOW_HOURS * 60 * 60 * 1000;
      const cutoff = Date.now() - windowMs;
      const filtered = log.filter((e) => e.timestamp > cutoff);

      await AsyncStorage.setItem(
        KEYS.BUBBLE_DISMISS_LOG,
        JSON.stringify(filtered)
      );
      set({
        dismissCount: filtered.length,
        shouldSuggestDisable:
          filtered.length >= DISMISS_CFG.DISABLE_SUGGESTION_COUNT,
      });
    } catch {
      /* non-critical */
    }
  },

  updatePosition: async (pos) => {
    set({ position: pos });
    try {
      await AsyncStorage.setItem(KEYS.BUBBLE_POSITION, JSON.stringify(pos));
    } catch {
      /* non-critical */
    }
  },

  disablePermanently: async () => {
    set({ isEnabled: false, isVisible: false });
    await AsyncStorage.setItem(KEYS.BUBBLE_ENABLED, "false");
  },

  enablePermanently: async () => {
    set({ isEnabled: true, isVisible: true });
    await AsyncStorage.setItem(KEYS.BUBBLE_ENABLED, "true");
  },

  resetDismissCount: async () => {
    set({ dismissCount: 0, shouldSuggestDisable: false });
    await AsyncStorage.removeItem(KEYS.BUBBLE_DISMISS_LOG);
  },

  smartHide: () => {
    set({ isVisible: false });
  },

  smartShow: () => {
    if (get().isEnabled) set({ isVisible: true });
  },

  dismissTooltip: async () => {
    set({ showFirstTimeTooltip: false });
    await AsyncStorage.setItem(KEYS.FIRST_TIME_TOOLTIP, "shown");
  },

  setShakeEnabled: async (enabled) => {
    set({ shakeEnabled: enabled });
    await AsyncStorage.setItem(
      KEYS.SHAKE_ENABLED,
      enabled ? "true" : "false"
    );
  },
}));

export function useBubbleState() {
  const state = useBubbleStore();
  return {
    ...state,
    isVisible: state.isVisible && state.isEnabled,
  };
}
