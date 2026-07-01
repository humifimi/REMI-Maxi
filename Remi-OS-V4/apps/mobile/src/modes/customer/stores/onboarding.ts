import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ASYNC_STORAGE_KEYS } from '@customer/constants/config';

export const ONBOARDING_STEPS = [
  'welcome',
  'identity',
  'addVehicle',
  'garageConfirmation',
  'schedulePreferences',
  'notificationPreferences',
  'payment',
  'dashboard',
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

interface OnboardingState {
  completedSteps: Record<OnboardingStepId, boolean>;
  isHydrated: boolean;
  completionPercent: number;
  isComplete: boolean;
  completeStep: (step: OnboardingStepId) => Promise<void>;
  hydrate: () => Promise<void>;
  reset: () => Promise<void>;
}

const DEFAULT_STEPS: Record<OnboardingStepId, boolean> = {
  welcome: false,
  identity: false,
  addVehicle: false,
  garageConfirmation: false,
  schedulePreferences: false,
  notificationPreferences: false,
  payment: false,
  dashboard: false,
};

function computePercent(steps: Record<OnboardingStepId, boolean>): number {
  const total = ONBOARDING_STEPS.length;
  const done = ONBOARDING_STEPS.filter((s) => steps[s]).length;
  return Math.round((done / total) * 100);
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  completedSteps: { ...DEFAULT_STEPS },
  isHydrated: false,
  completionPercent: 0,
  isComplete: false,

  completeStep: async (step) => {
    const updated = { ...get().completedSteps, [step]: true };
    const percent = computePercent(updated);
    await AsyncStorage.setItem(
      ASYNC_STORAGE_KEYS.ONBOARDING_PROGRESS,
      JSON.stringify(updated)
    );
    set({
      completedSteps: updated,
      completionPercent: percent,
      isComplete: percent === 100,
    });
  },

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(ASYNC_STORAGE_KEYS.ONBOARDING_PROGRESS);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<OnboardingStepId, boolean>;
        const merged = { ...DEFAULT_STEPS, ...parsed };
        const percent = computePercent(merged);
        set({
          completedSteps: merged,
          completionPercent: percent,
          isComplete: percent === 100,
          isHydrated: true,
        });
      } else {
        set({ isHydrated: true });
      }
    } catch {
      set({ isHydrated: true });
    }
  },

  reset: async () => {
    await AsyncStorage.removeItem(ASYNC_STORAGE_KEYS.ONBOARDING_PROGRESS);
    set({
      completedSteps: { ...DEFAULT_STEPS },
      completionPercent: 0,
      isComplete: false,
    });
  },
}));
