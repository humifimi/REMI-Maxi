import { useEffect, useRef, useCallback, useState } from "react";
import { addScreenshotListener } from "expo-screen-capture";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BUG_REPORT_CONFIG } from "@technician/constants/bug-report";
import { EXPO_GO_GUARDS_ACTIVE } from "@technician/constants/runtime";

const KEY = BUG_REPORT_CONFIG.ASYNC_STORAGE_KEYS.SCREENSHOT_DETECTION_ENABLED;
const { DELAY_MS, VISIBLE_MS } = BUG_REPORT_CONFIG.SCREENSHOT_PROMPT;

interface ScreenshotDetectionResult {
  showPrompt: boolean;
  dismissPrompt: () => void;
}

export function useScreenshotDetection(
  onReport: () => void
): ScreenshotDetectionResult {
  const [showPrompt, setShowPrompt] = useState(false);
  const [enabled, setEnabled] = useState(!EXPO_GO_GUARDS_ACTIVE);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (delayRef.current) clearTimeout(delayRef.current);
    if (dismissRef.current) clearTimeout(dismissRef.current);
  }, []);

  useEffect(() => {
    if (EXPO_GO_GUARDS_ACTIVE) return;
    AsyncStorage.getItem(KEY).then((val) => {
      if (val !== null) setEnabled(val !== "false");
    });
  }, []);

  useEffect(() => {
    if (EXPO_GO_GUARDS_ACTIVE) return;
    if (!enabled) return;

    const subscription = addScreenshotListener(() => {
      clearTimers();

      delayRef.current = setTimeout(() => {
        setShowPrompt(true);
      }, DELAY_MS);
    });

    return () => {
      subscription.remove();
      clearTimers();
    };
  }, [enabled, clearTimers]);

  const dismissPrompt = useCallback(() => {
    setShowPrompt(false);
    clearTimers();
  }, [clearTimers]);

  return { showPrompt, dismissPrompt };
}
