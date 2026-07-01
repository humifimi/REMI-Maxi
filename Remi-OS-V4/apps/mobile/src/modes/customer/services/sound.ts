import { createAudioPlayer } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SOUND_ENABLED_KEY = 'remi:sound_enabled';

type SoundName = 'bookingConfirmed' | 'paymentComplete' | 'notificationPop';

const SOUND_URIS: Record<SoundName, string | null> = {
  bookingConfirmed: null,
  paymentComplete: null,
  notificationPop: null,
};

/**
 * Register a sound URI at runtime.
 * Call this once when production audio assets are available.
 */
export function registerSound(name: SoundName, uri: string): void {
  SOUND_URIS[name] = uri;
}

let cachedEnabled: boolean | null = null;

async function isEnabled(): Promise<boolean> {
  if (cachedEnabled !== null) return cachedEnabled;
  const raw = await AsyncStorage.getItem(SOUND_ENABLED_KEY);
  cachedEnabled = raw !== 'false';
  return cachedEnabled;
}

export async function setSoundEnabled(enabled: boolean): Promise<void> {
  cachedEnabled = enabled;
  await AsyncStorage.setItem(SOUND_ENABLED_KEY, String(enabled));
}

export async function getSoundEnabled(): Promise<boolean> {
  return isEnabled();
}

export async function playSound(name: SoundName): Promise<void> {
  const enabled = await isEnabled();
  if (!enabled) return;

  const uri = SOUND_URIS[name];
  if (!uri) return;

  try {
    const player = createAudioPlayer({ uri });
    player.play();
  } catch {
    // Silently fail - sounds are non-critical
  }
}
