import React, { createContext, useContext } from "react";
import { useSoundSystem } from "@technician/hooks/utility/use-sound";
import type { SoundEventType } from "@technician/types/api";

type PlaySoundFn = (event: SoundEventType) => Promise<void>;

const SoundContext = createContext<PlaySoundFn>(async () => {});

export function SoundSystemProvider({ children }: { children: React.ReactNode }) {
  const { playSound } = useSoundSystem();

  return (
    <SoundContext.Provider value={playSound}>
      {children}
    </SoundContext.Provider>
  );
}

export function usePlaySound(): PlaySoundFn {
  return useContext(SoundContext);
}
