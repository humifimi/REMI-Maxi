import { useCallback, useRef, useState, type RefObject } from "react";
import { captureRef } from "react-native-view-shot";
import * as FileSystem from "expo-file-system";
import type { View } from "react-native";
import { BUG_REPORT_CONFIG } from "@technician/constants/bug-report";
import {
  BUG_REPORT_CAPTURE_DISABLED,
  EXPO_GO_GUARDS_ACTIVE,
  NativeCamera,
} from "@technician/constants/runtime";

const CFG = BUG_REPORT_CONFIG.SESSION_RECORDING;

function getSessionBaseDir(): string | null {
  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!base) return null;
  return `${base}bug-report-sessions/`;
}

type SessionState = "idle" | "recording" | "paused" | "stopped";

export interface SessionRecordingControls {
  state: SessionState;
  sessionDir: string | null;
  frameCount: number;
  startSession: () => Promise<void>;
  pauseSession: () => void;
  resumeSession: () => void;
  stopSession: () => Promise<string | null>;
  cancelSession: () => Promise<void>;
}

export function useSessionRecording(
  viewRef: RefObject<View | null>
): SessionRecordingControls {
  const [state, setState] = useState<SessionState>("idle");
  const [frameCount, setFrameCount] = useState(0);

  const sessionDirRef = useRef<string | null>(null);
  const frameIndexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);
  const stateRef = useRef<SessionState>("idle");

  const capture = useCallback(async () => {
    if (EXPO_GO_GUARDS_ACTIVE) return;
    if (BUG_REPORT_CAPTURE_DISABLED) return;
    if (pausedRef.current || !viewRef.current || !sessionDirRef.current || NativeCamera.isActive) return;

    try {
      const uri = await captureRef(viewRef, {
        format: "jpg",
        quality: CFG.JPEG_QUALITY,
        result: "tmpfile",
      });

      const idx = String(frameIndexRef.current).padStart(5, "0");
      const dest = `${sessionDirRef.current}frame-${idx}.jpg`;
      await FileSystem.moveAsync({ from: uri, to: dest });

      frameIndexRef.current++;
      setFrameCount(frameIndexRef.current);
    } catch {
      // non-critical
    }
  }, [viewRef]);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (hardTimeoutRef.current) {
      clearTimeout(hardTimeoutRef.current);
      hardTimeoutRef.current = null;
    }
  }, []);

  const startSession = useCallback(async () => {
    if (EXPO_GO_GUARDS_ACTIVE) return;
    if (BUG_REPORT_CAPTURE_DISABLED) return;
    if (stateRef.current !== "idle") return;

    const baseDir = getSessionBaseDir();
    if (!baseDir) return;

    const sessionId = `session-${Date.now()}`;
    const dir = `${baseDir}${sessionId}/`;

    try {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    } catch {
      return;
    }

    sessionDirRef.current = dir;
    frameIndexRef.current = 0;
    pausedRef.current = false;
    setFrameCount(0);
    setState("recording");
    stateRef.current = "recording";

    const intervalMs = Math.round(1000 / CFG.FPS);
    timerRef.current = setInterval(capture, intervalMs);

    hardTimeoutRef.current = setTimeout(() => {
      if (stateRef.current === "recording" || stateRef.current === "paused") {
        clearTimers();
        setState("stopped");
        stateRef.current = "stopped";
      }
    }, CFG.HARD_TIMEOUT_MS);
  }, [capture, clearTimers]);

  const pauseSession = useCallback(() => {
    if (stateRef.current !== "recording") return;
    pausedRef.current = true;
    setState("paused");
    stateRef.current = "paused";
  }, []);

  const resumeSession = useCallback(() => {
    if (stateRef.current !== "paused") return;
    pausedRef.current = false;
    setState("recording");
    stateRef.current = "recording";
  }, []);

  const stopSession = useCallback(async (): Promise<string | null> => {
    clearTimers();
    const dir = sessionDirRef.current;
    setState("stopped");
    stateRef.current = "stopped";
    return dir;
  }, [clearTimers]);

  const cancelSession = useCallback(async () => {
    clearTimers();
    const dir = sessionDirRef.current;
    sessionDirRef.current = null;
    frameIndexRef.current = 0;
    pausedRef.current = false;
    setFrameCount(0);
    setState("idle");
    stateRef.current = "idle";

    if (dir) {
      try {
        await FileSystem.deleteAsync(dir, { idempotent: true });
      } catch {
        // cleanup failure is non-critical
      }
    }
  }, [clearTimers]);

  return {
    state,
    sessionDir: sessionDirRef.current,
    frameCount,
    startSession,
    pauseSession,
    resumeSession,
    stopSession,
    cancelSession,
  };
}

export async function cleanupStaleSessions(): Promise<void> {
  if (EXPO_GO_GUARDS_ACTIVE) return;
  const baseDir = getSessionBaseDir();
  if (!baseDir) return;
  try {
    const info = await FileSystem.getInfoAsync(baseDir);
    if (!info.exists) return;

    const entries = await FileSystem.readDirectoryAsync(baseDir);
    for (const entry of entries) {
      await FileSystem.deleteAsync(`${baseDir}${entry}`, {
        idempotent: true,
      });
    }
  } catch {
    // non-critical
  }
}
