import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SoundEventType, SoundPreferences } from "@technician/types/api";

const SOUND_PREFS_KEY = "remi_sound_preferences";

export const DEFAULT_SOUND_PREFS: SoundPreferences = {
  master_enabled: true,
  events: {
    new_job: true,
    job_complete: true,
    rating_received: true,
    message_received: true,
    milestone_unlocked: true,
  },
};

interface SoundState {
  preferences: SoundPreferences;
  isLoaded: boolean;

  hydrate: () => Promise<void>;
  setMasterEnabled: (enabled: boolean) => Promise<void>;
  toggleEvent: (event: SoundEventType) => Promise<void>;
  setEventEnabled: (event: SoundEventType, enabled: boolean) => Promise<void>;
  isEventEnabled: (event: SoundEventType) => boolean;
}

async function persist(prefs: SoundPreferences): Promise<void> {
  await AsyncStorage.setItem(SOUND_PREFS_KEY, JSON.stringify(prefs));
}

export const useSoundStore = create<SoundState>((set, get) => ({
  preferences: DEFAULT_SOUND_PREFS,
  isLoaded: false,

  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(SOUND_PREFS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as SoundPreferences;
        set({ preferences: { ...DEFAULT_SOUND_PREFS, ...parsed, events: { ...DEFAULT_SOUND_PREFS.events, ...parsed.events } }, isLoaded: true });
        return;
      }
    } catch {
      if (__DEV__) console.warn("[SOUND] Failed to hydrate sound preferences");
    }
    set({ isLoaded: true });
  },

  setMasterEnabled: async (enabled) => {
    const next = { ...get().preferences, master_enabled: enabled };
    set({ preferences: next });
    await persist(next);
  },

  toggleEvent: async (event) => {
    const { preferences } = get();
    const next: SoundPreferences = {
      ...preferences,
      events: {
        ...preferences.events,
        [event]: !preferences.events[event],
      },
    };
    set({ preferences: next });
    await persist(next);
  },

  setEventEnabled: async (event, enabled) => {
    const { preferences } = get();
    const next: SoundPreferences = {
      ...preferences,
      events: { ...preferences.events, [event]: enabled },
    };
    set({ preferences: next });
    await persist(next);
  },

  isEventEnabled: (event) => {
    const { preferences } = get();
    return preferences.master_enabled && preferences.events[event];
  },
}));
