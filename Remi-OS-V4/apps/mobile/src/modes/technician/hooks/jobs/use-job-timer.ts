import { useState, useEffect, useRef, useCallback } from "react";
import { AppState } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { useActiveTimerStore } from "@technician/stores/active-timer";
import {
  TimerStatusColors,
  TimerStatusBg,
  TimerStatusLabels,
} from "@technician/constants/colors";
import type { TimerStatusKey } from "@technician/constants/colors";
import type { JobTimerState, LeaveByData } from "@technician/types/api";

export function useJobTimerStatus(jobId: number) {
  return useQuery({
    queryKey: ["job-timer", jobId],
    queryFn: () => api<JobTimerState>("get", `/jobs/${jobId}/timer`),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: jobId > 0,
  });
}

export function useCheckLateness(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ shouldNotify: boolean; minutesOver: number }>(
        "post",
        `/jobs/${jobId}/timer/check`
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job-timer", jobId] }),
  });
}

export function useLeaveByCountdown(jobId: number) {
  return useQuery({
    queryKey: ["job-timer", "leave-by", jobId],
    queryFn: () => api<LeaveByData>("get", Endpoints.timer.leaveBy(jobId)),
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: jobId > 0,
  });
}

export type LeaveByUrgency = "green" | "amber" | "red";

export interface LiveLeaveByState {
  secondsUntilLeave: number;
  minutesUntilLeave: number;
  isBehind: boolean;
  urgency: LeaveByUrgency;
  nextStopName: string | null;
  travelMinutes: number | null;
}

function getUrgency(minutesLeft: number, isBehind: boolean): LeaveByUrgency {
  if (isBehind || minutesLeft <= 5) return "red";
  if (minutesLeft <= 10) return "amber";
  return "green";
}

/**
 * Client-side countdown that ticks every second between API refetches.
 * Fires haptic.warning() once when crossing the 2-minute threshold.
 */
export function useLiveLeaveBy(apiData: LeaveByData | undefined): LiveLeaveByState | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const alertFiredRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!apiData?.leave_by_time) {
      setSecondsLeft(null);
      return;
    }
    const leaveByMs = new Date(apiData.leave_by_time).getTime();
    const nowMs = Date.now();
    const diff = Math.round((leaveByMs - nowMs) / 1000);
    setSecondsLeft(diff);

    if (diff > 120) alertFiredRef.current = false;
  }, [apiData?.leave_by_time]);

  useEffect(() => {
    if (secondsLeft === null) return;

    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [secondsLeft !== null]);

  useEffect(() => {
    if (secondsLeft === null) return;
    if (secondsLeft <= 120 && secondsLeft > 115 && !alertFiredRef.current) {
      alertFiredRef.current = true;
      haptic.warning();
      haptic.warning();
    }
  }, [secondsLeft]);

  if (secondsLeft === null || !apiData?.next_stop_customer_name) return null;

  const minutesLeft = secondsLeft / 60;
  const isBehind = apiData.is_behind || secondsLeft < 0;

  return {
    secondsUntilLeave: secondsLeft,
    minutesUntilLeave: minutesLeft,
    isBehind,
    urgency: getUrgency(minutesLeft, isBehind),
    nextStopName: apiData.next_stop_customer_name,
    travelMinutes: apiData.travel_minutes,
  };
}

export interface ActiveTimerTick {
  elapsedSec: number;
  remainingSec: number;
  overSec: number;
  overMin: number;
  hasSchedule: boolean;
  status: TimerStatusKey | "in_progress";
  statusColor: string;
  statusBg: string;
  statusLabel: string;
  progressPct: number;
}

const IN_PROGRESS_COLOR = "#3B82F6";
const IN_PROGRESS_BG = "#DBEAFE";

/**
 * Wall-clock timer tick. Reads startedAtMs from the Zustand store and
 * recomputes elapsed every second. Survives backgrounding because it
 * uses Date.now() on each tick rather than an incremental counter.
 *
 * `now` is stored in state so the React Compiler sees it as a real
 * data dependency and doesn't optimize away the interval re-renders.
 */
export function useActiveTimerTick(): ActiveTimerTick | null {
  const { isRunning, startedAtMs, scheduledDurationSec } = useActiveTimerStore();
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!isRunning) return;

    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) return;

    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") setNow(Date.now());
    });
    return () => sub.remove();
  }, [isRunning]);

  if (!isRunning || startedAtMs === null) return null;

  const elapsedSec = Math.max(0, Math.round((now - startedAtMs) / 1000));
  const hasSchedule = scheduledDurationSec > 0;
  const remainingSec = hasSchedule ? scheduledDurationSec - elapsedSec : 0;
  const overSec = Math.max(0, -remainingSec);
  const overMin = overSec / 60;

  let status: TimerStatusKey | "in_progress";
  let statusColor: string;
  let statusBg: string;
  let statusLabel: string;

  if (!hasSchedule) {
    status = "in_progress";
    statusColor = IN_PROGRESS_COLOR;
    statusBg = IN_PROGRESS_BG;
    statusLabel = "In Progress";
  } else if (remainingSec >= 0) {
    status = "on_track";
    statusColor = TimerStatusColors.on_track;
    statusBg = TimerStatusBg.on_track;
    statusLabel = TimerStatusLabels.on_track;
  } else if (overMin < 7) {
    status = "tight";
    statusColor = TimerStatusColors.tight;
    statusBg = TimerStatusBg.tight;
    statusLabel = TimerStatusLabels.tight;
  } else {
    status = "running_late";
    statusColor = TimerStatusColors.running_late;
    statusBg = TimerStatusBg.running_late;
    statusLabel = TimerStatusLabels.running_late;
  }

  const progressPct = hasSchedule
    ? Math.min(100, (elapsedSec / scheduledDurationSec) * 100)
    : 0;

  return {
    elapsedSec,
    remainingSec,
    overSec,
    overMin,
    hasSchedule,
    status,
    statusColor,
    statusBg,
    statusLabel,
    progressPct,
  };
}

export function formatTimerDisplay(sec: number): string {
  const absSec = Math.abs(sec);
  const mins = Math.floor(absSec / 60);
  const secs = absSec % 60;
  const prefix = sec < 0 ? "+" : "";
  return `${prefix}${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function useNotifyLate(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nextCustomerId: number) =>
      api<void>("post", Endpoints.timer.notify(jobId), { nextCustomerId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job-timer", jobId] }),
  });
}
