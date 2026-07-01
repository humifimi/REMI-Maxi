import { useCallback, useEffect, useRef, useState, createContext, useContext, type RefObject } from "react";
import React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { captureRef } from "react-native-view-shot";
import * as Device from "expo-device";
import { BUG_REPORT_CONFIG } from "@technician/constants/bug-report";
import {
  BUG_REPORT_CAPTURE_DISABLED,
  EXPO_GO_GUARDS_ACTIVE,
  NativeCamera,
} from "@technician/constants/runtime";
import type { View } from "react-native";

const CFG = BUG_REPORT_CONFIG.ROLLING_BUFFER;

interface RollingBufferContextValue {
  exportBuffer: () => string[];
  latestFrame: () => string | null;
  pauseCapture: () => void;
  resumeCapture: () => void;
  isCapturing: boolean;
}

const RollingBufferContext = createContext<RollingBufferContextValue | null>(null);

interface RollingBufferProviderProps {
  viewRef: RefObject<View | null>;
  children: React.ReactNode;
}

export function RollingBufferProvider({ viewRef, children }: RollingBufferProviderProps) {
  const totalRam = Device.totalMemory ?? 0;
  const isLowRam = totalRam > 0 && totalRam < CFG.LOW_RAM_THRESHOLD_MB * 1024 * 1024;

  const fps = isLowRam ? CFG.LOW_RAM_FPS : CFG.DEFAULT_FPS;
  const durationSeconds = isLowRam ? CFG.LOW_RAM_DURATION_SECONDS : CFG.DEFAULT_DURATION_SECONDS;
  const maxFrames = fps * durationSeconds;
  const intervalMs = Math.round(1000 / fps);

  const buffer = useRef<string[]>([]);
  const writeIndex = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const pausedRef = useRef(false);

  const capture = useCallback(async () => {
    if (EXPO_GO_GUARDS_ACTIVE) return;
    if (BUG_REPORT_CAPTURE_DISABLED) return;
    if (pausedRef.current || !viewRef.current || NativeCamera.isActive) return;

    try {
      const uri = await captureRef(viewRef, {
        format: "jpg",
        quality: CFG.JPEG_QUALITY,
        result: "base64",
      });

      if (buffer.current.length < maxFrames) {
        buffer.current.push(uri);
      } else {
        buffer.current[writeIndex.current % maxFrames] = uri;
      }
      writeIndex.current++;
    } catch {
      // Capture failure is non-critical
    }
  }, [viewRef, maxFrames]);

  const startCapture = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(capture, intervalMs);
    setIsCapturing(true);
  }, [capture, intervalMs]);

  const stopCapture = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsCapturing(false);
  }, []);

  const pauseCapture = useCallback(() => {
    pausedRef.current = true;
  }, []);

  const resumeCapture = useCallback(() => {
    pausedRef.current = false;
  }, []);

  useEffect(() => {
    if (EXPO_GO_GUARDS_ACTIVE) return;
    if (BUG_REPORT_CAPTURE_DISABLED) return;
    startCapture();

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        startCapture();
      } else {
        stopCapture();
      }
    });

    return () => {
      stopCapture();
      sub.remove();
    };
  }, [startCapture, stopCapture]);

  const exportBuffer = useCallback((): string[] => {
    const len = buffer.current.length;
    if (len === 0) return [];

    if (len < maxFrames) {
      return [...buffer.current];
    }

    const idx = writeIndex.current % maxFrames;
    return [...buffer.current.slice(idx), ...buffer.current.slice(0, idx)];
  }, [maxFrames]);

  const latestFrame = useCallback((): string | null => {
    if (buffer.current.length === 0) return null;
    const idx = (writeIndex.current - 1 + buffer.current.length) % buffer.current.length;
    return buffer.current[idx] ?? null;
  }, []);

  const value: RollingBufferContextValue = {
    exportBuffer,
    latestFrame,
    pauseCapture,
    resumeCapture,
    isCapturing,
  };

  return React.createElement(RollingBufferContext.Provider, { value }, children);
}

export function useRollingBuffer(): RollingBufferContextValue {
  const ctx = useContext(RollingBufferContext);
  if (!ctx) {
    throw new Error("useRollingBuffer must be used within RollingBufferProvider");
  }
  return ctx;
}
