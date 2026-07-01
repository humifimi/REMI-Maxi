import { useEffect, useRef, useCallback } from "react";
import { Audio } from "expo-av";
import { useSoundStore } from "@technician/stores/sound";
import { SOUND_ASSETS } from "@technician/constants/sounds";
import type { SoundEventType } from "@technician/types/api";

type SoundMap = Partial<Record<SoundEventType, Audio.Sound>>;

/**
 * Preloads all sound assets on mount and exposes a `playSound` function
 * that respects the user's per-event and master toggles.
 *
 * Mount once in the root layout or a high-level provider.
 */
export function useSoundSystem() {
  const soundsRef = useRef<SoundMap>({});
  const isEventEnabled = useSoundStore((s) => s.isEventEnabled);
  const hydrate = useSoundStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    let mounted = true;

    async function preload() {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      for (const asset of SOUND_ASSETS) {
        if (!mounted) return;
        try {
          const { sound } = await Audio.Sound.createAsync(asset.file, {
            shouldPlay: false,
            volume: 1.0,
          });
          soundsRef.current[asset.key] = sound;
        } catch (e) {
          if (__DEV__) console.warn(`[SOUND] Failed to load ${asset.key}:`, e);
        }
      }
    }

    preload();

    return () => {
      mounted = false;
      Object.values(soundsRef.current).forEach((s) => s?.unloadAsync());
      soundsRef.current = {};
    };
  }, []);

  const playSound = useCallback(
    async (event: SoundEventType) => {
      if (!isEventEnabled(event)) return;

      const sound = soundsRef.current[event];
      if (!sound) return;

      try {
        await sound.setPositionAsync(0);
        await sound.playAsync();
      } catch (e) {
        if (__DEV__) console.warn(`[SOUND] Play error for ${event}:`, e);
      }
    },
    [isEventEnabled]
  );

  return { playSound };
}

/**
 * Standalone imperative play function for use outside React components.
 * Loads and plays a one-shot sound. For frequent use, prefer `useSoundSystem`.
 */
export async function playSoundOnce(event: SoundEventType): Promise<void> {
  const { isEventEnabled } = useSoundStore.getState();
  if (!isEventEnabled(event)) return;

  const asset = SOUND_ASSETS.find((a) => a.key === event);
  if (!asset) return;

  try {
    const { sound } = await Audio.Sound.createAsync(asset.file, {
      shouldPlay: true,
      volume: 1.0,
    });
    sound.setOnPlaybackStatusUpdate((status) => {
      if ("didJustFinish" in status && status.didJustFinish) {
        sound.unloadAsync();
      }
    });
  } catch (e) {
    if (__DEV__) console.warn(`[SOUND] One-shot error for ${event}:`, e);
  }
}
