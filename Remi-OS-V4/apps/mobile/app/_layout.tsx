// DEV-only: monkey-patches console.{log,info,warn,error,debug} to
// prefix every line with a short device tag (e.g. `[sim:iPhone15Pro]`
// or `[dev:iPhone]`). Must be the first import so subsequent module
// loads (including dev-instrument-popups below) emit tagged logs from
// the very first line. No-op in production bundles. See
// src/utils/dev-instrument-logs.ts.
import "@technician/utils/dev-instrument-logs";

// DEV-only: monkey-patches Alert.alert to log title/body/buttons +
// the user's tap. Must be the first import so the patch installs
// before any screen-level Alert.alert call site is reached. No-op
// in production bundles. See src/utils/dev-instrument-popups.ts.
import "@technician/utils/dev-instrument-popups";

// PR-UX-13 (2026-05-09) Issue D — DEV-only: captures a JS-thread
// stack trace whenever the Reanimated 4 "Tried to modify key
// `current`" worklet ref-mutation warning fires, emitting an
// additional `[DIAG-WORKLETS-WARN]` log line so the next on-device
// smoke can pinpoint the offending site. Remove this import once
// Issue D closes.
import "@technician/utils/dev-instrument-worklets-warning";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Pressable, StyleSheet, Text } from "react-native";
import { Stack, useNavigationContainerRef } from "expo-router";
import { isRunningInExpoGo } from "expo";
import { StatusBar } from "expo-status-bar";
import { captureRef } from "react-native-view-shot";
import "react-native-reanimated";
import { configureReanimatedLogger, ReanimatedLogLevel } from "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Sentry from "@sentry/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { StripeProvider } from "@stripe/stripe-react-native";
import { Providers } from "@/src/components/shared/providers";
import { queryClient } from "@technician/api/query-client";
import { Config } from "@technician/constants/config";
import { useAuthStore } from "@/src/stores/auth";
// D2P-FE-14 — side-effect import kicks off Zustand `persist`
// rehydration of the demo-settings slice (devShortcutVisible,
// linterStrictness, dualDeviceMode) at app boot so the strictness
// filter inside `useSessionAwareSubmit` reads the persisted choice
// on the first submit instead of the initial-state default. The
// store self-hydrates on creation; we just need it imported here so
// the module evaluates alongside the other root-level stores.
// See `src/stores/demo-settings.ts` and PRD §6.2.
import "@technician/stores/demo-settings";
import { BugReportBubble } from "@technician/components/bug-report/bug-report-bubble";
import {
  BugReportComposer,
  type BugReportComposerHandle,
} from "@technician/components/bug-report/bug-report-composer";
import { BugReportToast } from "@technician/components/bug-report/bug-report-toast";
import { BugReportEntryPoint, LocalBugReportStatus } from "@technician/types/bug-report";
import { bugReportService } from "@technician/services/bug-report.service";
import { RollingBufferProvider, useRollingBuffer } from "@technician/hooks/utility/use-rolling-buffer";
import {
  useSessionRecording,
  cleanupStaleSessions,
} from "@technician/hooks/utility/use-session-recording";
import { useScreenshotDetection } from "@technician/hooks/utility/use-screenshot-detection";
import { BUG_REPORT_CONFIG } from "@technician/constants/bug-report";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { DispatchOfferModal } from "@technician/components/dispatch/dispatch-offer-modal";
import { useDispatchOfferStore } from "@technician/stores/dispatch-offer";
import { useNotifications } from "@technician/hooks/utility/use-notifications";
import { useStockAlerts } from "@technician/hooks/utility/use-stock-alerts";
import { EXPO_GO_GUARDS_ACTIVE } from "@technician/constants/runtime";
import { ActiveTimerBar } from "@technician/components/timer/active-timer-bar";
import { useSoundSystem } from "@technician/hooks/utility/use-sound";
import { SoundSystemProvider } from "@technician/hooks/utility/use-sound-context";
import { DraftTriggerListener } from "@technician/components/ai/draft-trigger-listener";
import { SentryTagSync } from "@technician/components/diagnostics/sentry-tag-sync";
import { AppModeRedirect } from "@/src/navigation/app-mode-redirect";

configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false });

const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: !isRunningInExpoGo(),
});

Sentry.init({
  dsn:
    process.env.EXPO_PUBLIC_SENTRY_DSN ??
    "https://42deaafff3fd89d7b1eb25857357430f@o4511382286958592.ingest.us.sentry.io/4511382333816832",
  sendDefaultPii: true,
  tracesSampleRate: __DEV__ ? 1.0 : 0.2,
  profilesSampleRate: 1.0,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 1.0,
  enableLogs: true,
  integrations: [navigationIntegration, Sentry.mobileReplayIntegration()],
  enableNativeFramesTracking: !isRunningInExpoGo(),
  environment: __DEV__ ? "development" : "production",
});

const ABANDON_CFG = BUG_REPORT_CONFIG.SESSION_RECORDING;

function RootNavigator() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="customer" options={{ headerShown: false }} />
      <Stack.Screen name="customers" options={{ headerShown: true, title: "Customer" }} />
      <Stack.Screen name="(public)" />
      <Stack.Screen name="settings" options={{ headerShown: true, title: "Settings" }} />
      <Stack.Screen name="franchise" options={{ headerShown: false }} />
      <Stack.Screen name="carfax-record" options={{ headerShown: true, title: "CARFAX Record" }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen name="job" />
      <Stack.Screen name="order" />
      <Stack.Screen name="message" />
      <Stack.Screen name="inventory" />
      <Stack.Screen name="fleet" />
      <Stack.Screen name="shield" />
      <Stack.Screen name="training" />
      <Stack.Screen name="referral" />
      <Stack.Screen name="briefing" />
      <Stack.Screen name="pending-reality" />
      <Stack.Screen name="copilot" />
      <Stack.Screen name="signal" />
      <Stack.Screen name="help" />
      <Stack.Screen name="performance" />
      <Stack.Screen name="team-wellness" />
      <Stack.Screen name="wellness" />
    </Stack>
  );
}

function ScreenshotPrompt({ onReport }: { onReport: () => void }) {
  const { showPrompt, dismissPrompt } = useScreenshotDetection(onReport);
  if (!showPrompt) return null;

  return (
    <View style={layoutStyles.screenshotPrompt}>
      <Text style={layoutStyles.promptText}>Want to report an issue?</Text>
      <Pressable
        onPress={() => {
          haptic.light();
          dismissPrompt();
          onReport();
        }}
        style={layoutStyles.promptBtn}
      >
        <Text style={layoutStyles.promptBtnText}>Report</Text>
      </Pressable>
      <Pressable onPress={dismissPrompt} style={layoutStyles.promptDismiss}>
        <Text style={layoutStyles.promptDismissText}>Dismiss</Text>
      </Pressable>
    </View>
  );
}

function BugReportLayerInner({
  rootViewRef,
}: {
  rootViewRef: React.RefObject<View | null>;
}) {
  const [composerVisible, setComposerVisible] = useState(false);
  const [entryPoint, setEntryPoint] = useState<BugReportEntryPoint>("bubble");
  const [preScreenshot, setPreScreenshot] = useState<string | null>(null);
  const [hasComposerContent, setHasComposerContent] = useState(false);
  const [sendPending, setSendPending] = useState(false);
  const [showSentToast, setShowSentToast] = useState(false);

  const composerRef = useRef<BugReportComposerHandle>(null);
  const sendCountRef = useRef(0);
  const rollingBuffer = useRollingBuffer();
  const session = useSessionRecording(rootViewRef);
  const abandonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendDeadlineRef = useRef<number>(0);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useNotifications();
  useStockAlerts();

  useEffect(() => {
    if (isAuthenticated) {
      rollingBuffer.resumeCapture();
    } else {
      rollingBuffer.pauseCapture();
    }
  }, [isAuthenticated, rollingBuffer]);

  useEffect(() => {
    cleanupStaleSessions();
  }, []);

  const clearAbandonTimer = useCallback(() => {
    if (abandonTimerRef.current) {
      clearTimeout(abandonTimerRef.current);
      abandonTimerRef.current = null;
    }
  }, []);

  const clearSendTimer = useCallback(() => {
    if (sendTimerRef.current) {
      clearTimeout(sendTimerRef.current);
      sendTimerRef.current = null;
    }
  }, []);

  const finalizeSend = useCallback(async () => {
    clearAbandonTimer();
    clearSendTimer();

    const dir = await session.stopSession();
    rollingBuffer.resumeCapture();

    const draft = await bugReportService.loadDraft();
    if (draft) {
      await bugReportService.submit({
        ...draft,
        status: LocalBugReportStatus.PENDING_SEND,
        session_recording_dir: dir ?? undefined,
        updated_at: new Date().toISOString(),
      });
    }

    await composerRef.current?.resetForm();
    sendCountRef.current = 0;
    setSendPending(false);
    setShowSentToast(true);
  }, [session, rollingBuffer, clearAbandonTimer, clearSendTimer]);

  const startSendTimer = useCallback((remainingMs?: number) => {
    clearSendTimer();
    const delay = remainingMs ?? BUG_REPORT_CONFIG.UNDO_DELAY_MS;
    sendDeadlineRef.current = Date.now() + delay;
    sendTimerRef.current = setTimeout(() => {
      finalizeSend();
    }, delay);
  }, [clearSendTimer, finalizeSend]);

  const startAbandonTimer = useCallback(
    (hasContent: boolean) => {
      clearAbandonTimer();
      const delay = hasContent
        ? ABANDON_CFG.ABANDON_CONTENT_MS
        : ABANDON_CFG.ABANDON_EMPTY_MS;

      abandonTimerRef.current = setTimeout(() => {
        session.cancelSession();
        rollingBuffer.resumeCapture();
      }, delay);
    },
    [clearAbandonTimer, session, rollingBuffer]
  );

  const captureAndOpen = useCallback(
    async (ep: BugReportEntryPoint) => {
      if (sendPending) {
        clearSendTimer();
        session.pauseSession();
        setComposerVisible(true);
        return;
      }

      try {
        if (rootViewRef.current) {
          const uri = await captureRef(rootViewRef, {
            format: "png",
            quality: 0.8,
            result: "tmpfile",
          });
          setPreScreenshot(uri);
        }
      } catch {
        setPreScreenshot(null);
      }

      if (session.state === "idle") {
        rollingBuffer.pauseCapture();
        await session.startSession();
      }

      clearAbandonTimer();
      session.pauseSession();

      setEntryPoint(ep);
      setComposerVisible(true);
    },
    [session, rollingBuffer, clearAbandonTimer, sendPending, clearSendTimer]
  );

  const handleBubblePress = useCallback(() => {
    captureAndOpen(BugReportEntryPoint.BUBBLE);
  }, [captureAndOpen]);

  const handleScreenshotReport = useCallback(() => {
    captureAndOpen(BugReportEntryPoint.SCREENSHOT);
  }, [captureAndOpen]);

  const handleComposerDismiss = useCallback(() => {
    setComposerVisible(false);
    setPreScreenshot(null);

    if (sendPending) {
      const remaining = Math.max(sendDeadlineRef.current - Date.now(), 1000);
      session.resumeSession();
      startSendTimer(remaining);
      return;
    }

    if (
      session.state === "paused" ||
      session.state === "recording"
    ) {
      session.resumeSession();
      startAbandonTimer(hasComposerContent);
    }
  }, [session, startAbandonTimer, startSendTimer, hasComposerContent, sendPending]);

  const handleQueueSend = useCallback(() => {
    setComposerVisible(false);
    setPreScreenshot(null);
    clearAbandonTimer();

    sendCountRef.current += 1;

    if (sendCountRef.current > 2) {
      finalizeSend();
      return;
    }

    setSendPending(true);

    if (
      session.state === "paused" ||
      session.state === "recording"
    ) {
      session.resumeSession();
    }

    startSendTimer();
  }, [session, clearAbandonTimer, startSendTimer, finalizeSend]);

  return (
    <SoundSystemProvider>
      <View ref={rootViewRef} style={layoutStyles.rootView} collapsable={false}>
        <RootNavigator />
      </View>

      {isAuthenticated && <ActiveTimerBar />}
      {isAuthenticated && <BugReportBubble onPress={handleBubblePress} />}
      {isAuthenticated && <ScreenshotPrompt onReport={handleScreenshotReport} />}
      {isAuthenticated && <DispatchOfferOverlay />}
      {isAuthenticated && <DraftTriggerListener />}

      <BugReportComposer
        ref={composerRef}
        visible={composerVisible}
        onDismiss={handleComposerDismiss}
        onQueueSend={handleQueueSend}
        onContentChange={setHasComposerContent}
        entryPoint={entryPoint}
        preAttachedScreenshot={preScreenshot}
      />

      <BugReportToast
        visible={showSentToast}
        onDismiss={() => setShowSentToast(false)}
      />
    </SoundSystemProvider>
  );
}

function DispatchOfferOverlay() {
  const { isVisible, currentOffer, dismiss } = useDispatchOfferStore();
  return (
    <DispatchOfferModal
      visible={isVisible}
      dispatch={currentOffer}
      onDismiss={dismiss}
    />
  );
}

function BugReportLayer() {
  const rootViewRef = useRef<View>(null);

  return (
    <RollingBufferProvider viewRef={rootViewRef}>
      <BugReportLayerInner rootViewRef={rootViewRef} />
    </RollingBufferProvider>
  );
}

function RootLayout() {
  const navContainerRef = useNavigationContainerRef();

  useEffect(() => {
    if (navContainerRef) {
      navigationIntegration.registerNavigationContainer(navContainerRef);
    }
  }, [navContainerRef]);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={layoutStyles.rootView}>
        <Providers>
          <StripeProvider
          publishableKey={Config.STRIPE_PUBLISHABLE_KEY}
          merchantIdentifier={undefined}
          // Phase 6 Chunk 6.2 — 3DS / SCA support. The Stripe SDK
          // opens the 3DS challenge in a system browser and needs a
          // registered URL scheme to redirect back into the app once
          // the customer completes (or fails) the challenge. Must
          // exactly match one of the schemes registered in
          // `app.json` `expo.scheme`. We use the first array element
          // (`"remitechnician"`) — pre-existing, also used by Expo's
          // dev-client deep-link handshake. Phase 1 only smoke-tested
          // against `4242…` (no 3DS); the real customer card mix
          // includes 3DS-enrolled cards which would have hung at the
          // redirect step pre-6.2.
          urlScheme="remitechnician"
        >
          <SentryTagSync />
          <AppModeRedirect />
          {EXPO_GO_GUARDS_ACTIVE ? (
            <SoundSystemProvider><RootNavigator /></SoundSystemProvider>
          ) : (
            <BugReportLayer />
          )}
          <StatusBar style="light" />
          </StripeProvider>
        </Providers>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);

const layoutStyles = StyleSheet.create({
  rootView: {
    flex: 1,
  },
  screenshotPrompt: {
    position: "absolute",
    bottom: 100,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1F2937",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    zIndex: 9998,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  promptText: {
    flex: 1,
    color: "#E5E7EB",
    fontSize: 14,
    fontWeight: "500",
  },
  promptBtn: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  promptBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  promptDismiss: {
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  promptDismissText: {
    color: "#9CA3AF",
    fontSize: 13,
    fontWeight: "500",
  },
});
