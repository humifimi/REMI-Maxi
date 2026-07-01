import { create } from "zustand";

interface ActiveTimerState {
  jobId: number | null;
  serviceId: number | null;
  serviceName: string | null;
  startedAtMs: number | null;
  scheduledDurationSec: number;
  isRunning: boolean;

  startTimer: (params: {
    jobId: number;
    serviceId: number;
    serviceName: string;
    scheduledDurationSec: number;
  }) => void;
  reconcile: (serverElapsedMin: number) => void;
  stopTimer: () => void;
  clearTimer: () => void;
}

export const useActiveTimerStore = create<ActiveTimerState>((set) => ({
  jobId: null,
  serviceId: null,
  serviceName: null,
  startedAtMs: null,
  scheduledDurationSec: 0,
  isRunning: false,

  startTimer: ({ jobId, serviceId, serviceName, scheduledDurationSec }) =>
    set({
      jobId,
      serviceId,
      serviceName,
      startedAtMs: Date.now(),
      scheduledDurationSec,
      isRunning: true,
    }),

  reconcile: (serverElapsedMin) =>
    set((state) => {
      if (!state.isRunning) return state;
      return { startedAtMs: Date.now() - serverElapsedMin * 60_000 };
    }),

  stopTimer: () => set({ isRunning: false }),

  clearTimer: () =>
    set({
      jobId: null,
      serviceId: null,
      serviceName: null,
      startedAtMs: null,
      scheduledDurationSec: 0,
      isRunning: false,
    }),
}));
