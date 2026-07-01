import { useCallback, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  FlatList,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useVoiceCopilot } from "@technician/hooks/ai/use-voice-copilot";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type { TranscriptEntry } from "@technician/types/copilot";

const ACCENT = "#8B5CF6";
const BG = "#111827";
const SURFACE = "#1F2937";
const TEXT_PRIMARY = "#F9FAFB";
const TEXT_SECONDARY = "#9CA3AF";
const ERROR_COLOR = "#EF4444";
const SUCCESS_COLOR = "#22C55E";
const WARNING_COLOR = "#EAB308";

function formatTimer(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function getConnectionDotColor(
  state: string,
): string {
  switch (state) {
    case "connected":
      return SUCCESS_COLOR;
    case "connecting":
    case "reconnecting":
      return WARNING_COLOR;
    default:
      return ERROR_COLOR;
  }
}

export default function VoiceCopilotScreen() {
  const params = useLocalSearchParams<{
    appointmentId?: string;
    jobLabel?: string;
  }>();
  const appointmentId = params.appointmentId
    ? parseInt(params.appointmentId, 10)
    : undefined;
  const router = useRouter();

  const {
    connectionState,
    isAiSpeaking,
    transcriptEntries,
    sessionDurationMs,
    startSession,
    disconnect,
    error,
  } = useVoiceCopilot();

  const flatListRef = useRef<FlatList<TranscriptEntry>>(null);

  // Pulse animation for the mic circle
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.3);

  useEffect(() => {
    if (connectionState === "connected" && !isAiSpeaking) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.5, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.2, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      );
    } else if (isAiSpeaking) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.25, { duration: 400, easing: Easing.inOut(Easing.ease) }),
          withTiming(1.05, { duration: 400, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 400, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.15, { duration: 400, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      );
    } else {
      cancelAnimation(pulseScale);
      cancelAnimation(pulseOpacity);
      pulseScale.value = withTiming(1, { duration: 300 });
      pulseOpacity.value = withTiming(0.3, { duration: 300 });
    }
  }, [connectionState, isAiSpeaking, pulseScale, pulseOpacity]);

  const pulseRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptEntries.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 50);
    }
  }, [transcriptEntries.length]);

  // Auto-start session on mount
  useEffect(() => {
    startSession(appointmentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = useCallback(() => {
    disconnect();
    router.back();
  }, [disconnect, router]);

  const handleReconnect = useCallback(() => {
    haptic.medium();
    startSession(appointmentId);
  }, [startSession, appointmentId]);

  const handleSwitchToText = useCallback(() => {
    disconnect();
    const chatParams = appointmentId ? `?appointmentId=${appointmentId}` : "";
    router.replace(`/copilot/chat${chatParams}` as never);
  }, [disconnect, router, appointmentId]);

  const renderTranscriptItem = useCallback(
    ({ item }: { item: TranscriptEntry }) => (
      <View
        style={[
          styles.transcriptBubble,
          item.role === "user"
            ? styles.transcriptUser
            : styles.transcriptAssistant,
        ]}
      >
        {item.role === "assistant" && (
          <View style={styles.transcriptIcon}>
            <MaterialIcons name="auto-awesome" size={10} color="#fff" />
          </View>
        )}
        <Text
          style={[
            styles.transcriptText,
            item.role === "user"
              ? styles.transcriptTextUser
              : styles.transcriptTextAssistant,
          ]}
        >
          {item.text || "…"}
        </Text>
      </View>
    ),
    [],
  );

  const isActive =
    connectionState === "connected" || connectionState === "connecting";
  const isError =
    connectionState === "error" || connectionState === "disconnected";
  const showIdle = connectionState === "idle" || connectionState === "connecting";

  const stateLabel = isAiSpeaking
    ? "REMI is speaking..."
    : connectionState === "connected"
      ? "Listening..."
      : connectionState === "connecting"
        ? "Connecting..."
        : connectionState === "error"
          ? "Connection lost"
          : connectionState === "disconnected"
            ? "Session ended"
            : "Starting...";

  const iconName: keyof typeof MaterialIcons.glyphMap = isAiSpeaking
    ? "volume-up"
    : isError
      ? "error-outline"
      : "mic";

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          animation: "slide_from_bottom",
        }}
      />
      <View style={styles.container}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <View style={styles.timerRow}>
            <View
              style={[
                styles.connectionDot,
                { backgroundColor: getConnectionDotColor(connectionState) },
              ]}
            />
            {isActive && (
              <Text style={styles.timerText}>
                {formatTimer(sessionDurationMs)}
              </Text>
            )}
          </View>

          <Pressable
            style={styles.closeBtn}
            onPress={handleClose}
            hitSlop={12}
          >
            <MaterialIcons name="close" size={24} color={TEXT_PRIMARY} />
          </Pressable>
        </View>

        {/* Job context badge */}
        {params.jobLabel && (
          <View style={styles.contextBadge}>
            <MaterialIcons name="build" size={14} color={ACCENT} />
            <Text style={styles.contextText} numberOfLines={1}>
              {params.jobLabel}
            </Text>
          </View>
        )}

        {/* Center area — mic orb */}
        <View style={styles.centerArea}>
          <View style={styles.orbContainer}>
            <Animated.View style={[styles.pulseRing, pulseRingStyle]} />
            <View
              style={[
                styles.micCircle,
                isError && styles.micCircleError,
                isAiSpeaking && styles.micCircleSpeaking,
              ]}
            >
              <MaterialIcons name={iconName} size={48} color="#fff" />
            </View>
          </View>

          <Text style={styles.stateLabel}>{stateLabel}</Text>

          {showIdle && !error && (
            <Text style={styles.hintText}>Ask REMI anything...</Text>
          )}
        </View>

        {/* Error actions */}
        {isError && (
          <View style={styles.errorActions}>
            {error && (
              <Text style={styles.errorText}>{error}</Text>
            )}
            <Pressable style={styles.reconnectBtn} onPress={handleReconnect}>
              <MaterialIcons name="refresh" size={20} color="#fff" />
              <Text style={styles.reconnectLabel}>Reconnect</Text>
            </Pressable>
            <Pressable
              style={styles.textFallbackBtn}
              onPress={handleSwitchToText}
            >
              <MaterialIcons name="keyboard" size={18} color={TEXT_SECONDARY} />
              <Text style={styles.textFallbackLabel}>Type instead</Text>
            </Pressable>
          </View>
        )}

        {/* Transcript area (bottom third) */}
        <View style={styles.transcriptArea}>
          {transcriptEntries.length > 0 ? (
            <FlatList
              ref={flatListRef}
              data={transcriptEntries}
              renderItem={renderTranscriptItem}
              keyExtractor={(item) => item.id}
              style={styles.transcriptList}
              contentContainerStyle={styles.transcriptContent}
              showsVerticalScrollIndicator={false}
            />
          ) : isActive ? (
            <Text style={styles.transcriptPlaceholder}>
              Transcript will appear here...
            </Text>
          ) : null}
        </View>

        {/* Bottom actions */}
        {connectionState === "connected" && (
          <View style={styles.bottomBar}>
            <Pressable
              style={styles.textSwitchLink}
              onPress={handleSwitchToText}
            >
              <MaterialIcons name="keyboard" size={16} color={TEXT_SECONDARY} />
              <Text style={styles.textSwitchText}>Type instead</Text>
            </Pressable>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    height: 44,
  },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timerText: {
    fontSize: 14,
    fontWeight: "600",
    color: TEXT_SECONDARY,
    fontVariant: ["tabular-nums"],
  },
  closeBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: SURFACE,
    alignItems: "center",
    justifyContent: "center",
  },

  contextBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    backgroundColor: "rgba(139,92,246,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    marginTop: 8,
    maxWidth: "80%",
  },
  contextText: {
    fontSize: 13,
    fontWeight: "600",
    color: ACCENT,
  },

  centerArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 24,
  },
  orbContainer: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: ACCENT,
  },
  micCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  micCircleError: {
    backgroundColor: ERROR_COLOR,
    shadowColor: ERROR_COLOR,
  },
  micCircleSpeaking: {
    backgroundColor: "#7C3AED",
    shadowColor: "#7C3AED",
  },

  stateLabel: {
    fontSize: 24,
    fontWeight: "800",
    color: TEXT_PRIMARY,
    marginTop: 24,
    textAlign: "center",
  },
  hintText: {
    fontSize: 16,
    color: TEXT_SECONDARY,
    marginTop: 8,
    textAlign: "center",
  },

  errorActions: {
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: ERROR_COLOR,
    textAlign: "center",
    marginBottom: 4,
  },
  reconnectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: ACCENT,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 999,
    minHeight: 48,
  },
  reconnectLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  textFallbackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    minHeight: 48,
  },
  textFallbackLabel: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    fontWeight: "600",
  },

  transcriptArea: {
    height: "33%",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  transcriptList: {
    flex: 1,
  },
  transcriptContent: {
    padding: 16,
    paddingBottom: 8,
  },
  transcriptPlaceholder: {
    textAlign: "center",
    color: "rgba(255,255,255,0.2)",
    fontSize: 14,
    marginTop: 24,
  },
  transcriptBubble: {
    flexDirection: "row",
    marginBottom: 10,
    maxWidth: "90%",
    gap: 6,
  },
  transcriptUser: {
    alignSelf: "flex-end",
  },
  transcriptAssistant: {
    alignSelf: "flex-start",
  },
  transcriptIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  transcriptText: {
    fontSize: 14,
    lineHeight: 20,
    flexShrink: 1,
  },
  transcriptTextUser: {
    color: "rgba(255,255,255,0.7)",
    fontStyle: "italic",
  },
  transcriptTextAssistant: {
    color: TEXT_PRIMARY,
  },

  bottomBar: {
    alignItems: "center",
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    paddingTop: 8,
  },
  textSwitchLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  textSwitchText: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    fontWeight: "500",
  },
});
