import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import React from "react";
import { BUG_REPORT_CONFIG } from "@technician/constants/bug-report";
import { FrustrationEventType, type CreateFrustrationEventData } from "@technician/types/bug-report";
import { frustrationTracker } from "@technician/services/frustration-tracker";

interface FrustrationContextValue {
  shouldNudge: boolean;
  weightedScore: number;
  getSessionEvents: () => CreateFrustrationEventData[];
  getRecentForScreen: (screenName: string) => CreateFrustrationEventData[];
  recordTap: (x: number, y: number, screenName: string) => void;
  recordScrollBounce: (screenName: string) => void;
  recordBackNav: (screenName: string) => void;
  recordFormAbandon: (screenName: string) => void;
  recordErrorDwell: (screenName: string) => void;
  recordRepeatedAction: (screenName: string, metadata?: Record<string, unknown>) => void;
  markNudged: () => void;
  clearSession: () => Promise<void>;
}

const FrustrationContext = createContext<FrustrationContextValue | null>(null);

const CFG = BUG_REPORT_CONFIG.FRUSTRATION;

export function FrustrationDetectionProvider({ children }: { children: ReactNode }) {
  const [shouldNudge, setShouldNudge] = useState(false);
  const [weightedScore, setWeightedScore] = useState(0);

  const tapLog = useRef<Array<{ x: number; y: number; time: number }>>([]);
  const scrollBounceLog = useRef<number[]>([]);
  const backNavLog = useRef<number[]>([]);

  useEffect(() => {
    frustrationTracker.hydrate();
  }, []);

  const refreshState = useCallback(() => {
    setWeightedScore(frustrationTracker.getWeightedScore());
    setShouldNudge(frustrationTracker.shouldNudge());
  }, []);

  const recordEvent = useCallback(
    async (
      type: FrustrationEventType,
      screenName: string,
      coords?: { x: number; y: number },
      metadata?: Record<string, unknown>
    ) => {
      await frustrationTracker.recordEvent(type, screenName, coords, metadata);
      refreshState();
    },
    [refreshState]
  );

  const recordTap = useCallback(
    (x: number, y: number, screenName: string) => {
      const now = Date.now();
      const log = tapLog.current;
      log.push({ x, y, time: now });

      const cutoff = now - CFG.RAGE_TAP_WINDOW_MS;
      tapLog.current = log.filter((t) => t.time > cutoff);

      if (tapLog.current.length >= CFG.RAGE_TAP_COUNT) {
        const recent = tapLog.current.slice(-CFG.RAGE_TAP_COUNT);
        const first = recent[0];
        const allClose = recent.every(
          (t) =>
            Math.abs(t.x - first.x) <= CFG.RAGE_TAP_RADIUS_PT &&
            Math.abs(t.y - first.y) <= CFG.RAGE_TAP_RADIUS_PT
        );

        if (allClose) {
          recordEvent(FrustrationEventType.RAGE_TAP, screenName, { x, y });
          tapLog.current = [];
        }
      }
    },
    [recordEvent]
  );

  const recordScrollBounce = useCallback(
    (screenName: string) => {
      const now = Date.now();
      scrollBounceLog.current.push(now);
      scrollBounceLog.current = scrollBounceLog.current.filter(
        (t) => now - t < CFG.DEAD_END_SCROLL_WINDOW_MS
      );

      if (scrollBounceLog.current.length >= CFG.DEAD_END_SCROLL_BOUNCES) {
        recordEvent(FrustrationEventType.DEAD_END_SCROLL, screenName);
        scrollBounceLog.current = [];
      }
    },
    [recordEvent]
  );

  const recordBackNav = useCallback(
    (screenName: string) => {
      const now = Date.now();
      backNavLog.current.push(now);
      backNavLog.current = backNavLog.current.filter(
        (t) => now - t < CFG.RAPID_BACK_NAV_WINDOW_MS
      );

      if (backNavLog.current.length >= CFG.RAPID_BACK_NAV_CYCLES) {
        recordEvent(FrustrationEventType.RAPID_BACK_NAV, screenName);
        backNavLog.current = [];
      }
    },
    [recordEvent]
  );

  const recordFormAbandon = useCallback(
    (screenName: string) => {
      recordEvent(FrustrationEventType.FORM_ABANDON, screenName);
    },
    [recordEvent]
  );

  const recordErrorDwell = useCallback(
    (screenName: string) => {
      recordEvent(FrustrationEventType.ERROR_DWELL, screenName);
    },
    [recordEvent]
  );

  const recordRepeatedAction = useCallback(
    (screenName: string, metadata?: Record<string, unknown>) => {
      recordEvent(FrustrationEventType.REPEATED_ACTION, screenName, undefined, metadata);
    },
    [recordEvent]
  );

  const markNudged = useCallback(() => {
    frustrationTracker.markNudged();
    setShouldNudge(false);
  }, []);

  const clearSession = useCallback(async () => {
    await frustrationTracker.clearSession();
    setWeightedScore(0);
    setShouldNudge(false);
  }, []);

  const getSessionEvents = useCallback(() => {
    return frustrationTracker.getSessionEvents();
  }, []);

  const getRecentForScreen = useCallback((screenName: string) => {
    return frustrationTracker.getRecentForScreen(screenName);
  }, []);

  const value: FrustrationContextValue = {
    shouldNudge,
    weightedScore,
    getSessionEvents,
    getRecentForScreen,
    recordTap,
    recordScrollBounce,
    recordBackNav,
    recordFormAbandon,
    recordErrorDwell,
    recordRepeatedAction,
    markNudged,
    clearSession,
  };

  return React.createElement(FrustrationContext.Provider, { value }, children);
}

export function useFrustrationDetection(): FrustrationContextValue {
  const ctx = useContext(FrustrationContext);
  if (!ctx) {
    throw new Error(
      "useFrustrationDetection must be used within FrustrationDetectionProvider"
    );
  }
  return ctx;
}
