import { useEffect, useRef } from "react";
import { StyleSheet, View, Text, Pressable, Animated } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type {
  AiResponseCard,
  AiResponseTone,
  WellnessMood,
} from "@technician/types/wellness";
import { MOOD_EMOJI } from "@technician/types/wellness";
import { ResourcePills } from "./resource-pills";

const AUTO_DISMISS_MS = 8000;

// Three visual tones per `wellness-ai-and-walk-in-contract.md` § 5. The
// backend chooses the tone from the mood score; the UI never overrides it.
const TONE_THEME: Record<
  AiResponseTone,
  {
    accent: string;
    surface: string;
    pillTint: string;
    pillSurface: string;
    pillBorder: string;
    label: string;
    icon: React.ComponentProps<typeof MaterialIcons>["name"];
  }
> = {
  celebrate: {
    accent: "#16A34A",
    surface: "#F0FDF4",
    pillTint: "#15803D",
    pillSurface: "#DCFCE7",
    pillBorder: "#BBF7D0",
    label: "Nice work",
    icon: "celebration",
  },
  encourage: {
    accent: "#0284C7",
    surface: "#F0F9FF",
    pillTint: "#0369A1",
    pillSurface: "#E0F2FE",
    pillBorder: "#BAE6FD",
    label: "REMI Coach",
    icon: "auto-awesome",
  },
  support: {
    accent: "#EC4899",
    surface: "#FDF2F8",
    pillTint: "#BE185D",
    pillSurface: "#FCE7F3",
    pillBorder: "#FBCFE8",
    label: "We're here",
    icon: "favorite",
  },
};

interface CheckInResultProps {
  mood: WellnessMood;
  streak: number;
  aiResponse: AiResponseCard | null;
  isLoadingAi: boolean;
  onDismiss: () => void;
}

export function CheckInResult({
  mood,
  streak,
  aiResponse,
  isLoadingAi,
  onDismiss,
}: CheckInResultProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Spring in on mount, then arm the 8s auto-dismiss. We re-arm whenever the
  // AI response transitions from "loading" to "loaded" so the user gets a
  // fresh 8s window once the supportive content is actually visible.
  useEffect(() => {
    Animated.spring(fadeAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 50,
      friction: 9,
    }).start();
  }, [fadeAnim]);

  useEffect(() => {
    if (isLoadingAi) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isLoadingAi, aiResponse, onDismiss]);

  const tone: AiResponseTone = aiResponse?.tone ?? "encourage";
  const theme = TONE_THEME[tone];

  return (
    <Animated.View
      style={[
        styles.container,
        { opacity: fadeAnim, transform: [{ scale: fadeAnim }] },
      ]}
    >
      <Pressable style={styles.touchArea} onPress={onDismiss} hitSlop={8}>
        <View style={styles.confirmRow}>
          <Text style={styles.confirmEmoji}>{MOOD_EMOJI[mood] ?? "\u2705"}</Text>
          <Text style={styles.confirmTitle}>Check-in recorded</Text>
        </View>

        {streak > 0 && (
          <View
            style={[
              styles.streakBadge,
              tone === "celebrate" && {
                backgroundColor: theme.surface,
              },
            ]}
          >
            <MaterialIcons
              name="local-fire-department"
              size={18}
              color="#F97316"
            />
            <Text style={styles.streakText}>{streak} day streak</Text>
          </View>
        )}

        {isLoadingAi && (
          <View style={styles.loadingRow}>
            <MaterialIcons name="auto-awesome" size={16} color="#9CA3AF" />
            <Text style={styles.loadingText}>
              REMI is thinking of something for you...
            </Text>
          </View>
        )}

        {aiResponse ? (
          <View
            style={[
              styles.aiCard,
              {
                backgroundColor: theme.surface,
                borderLeftColor: theme.accent,
              },
            ]}
          >
            <View style={styles.aiHeader}>
              <MaterialIcons
                name={theme.icon}
                size={16}
                color={theme.accent}
              />
              <Text style={[styles.aiLabel, { color: theme.accent }]}>
                {theme.label}
              </Text>
            </View>
            <Text style={styles.aiText}>{aiResponse.message}</Text>

            {aiResponse.resource_links.length > 0 && (
              <View style={styles.linksWrap}>
                <ResourcePills
                  links={aiResponse.resource_links}
                  tint={theme.pillTint}
                  surface={theme.pillSurface}
                  border={theme.pillBorder}
                />
              </View>
            )}
          </View>
        ) : !isLoadingAi ? (
          <Text style={styles.fallbackText}>Thanks for checking in!</Text>
        ) : null}

        <Text style={styles.tapHint}>Tap anywhere to dismiss</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 4,
  },
  touchArea: {
    alignItems: "center",
    width: "100%",
    gap: 12,
  },
  confirmRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  confirmEmoji: {
    fontSize: 36,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFF7ED",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  streakText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#9A3412",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 13,
    color: "#9CA3AF",
    fontWeight: "500",
    fontStyle: "italic",
  },
  aiCard: {
    width: "100%",
    borderRadius: 14,
    padding: 16,
    borderLeftWidth: 4,
    gap: 10,
  },
  aiHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  aiLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  aiText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#374151",
    fontWeight: "500",
  },
  linksWrap: {
    marginTop: 4,
  },
  fallbackText: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
    paddingVertical: 4,
  },
  tapHint: {
    fontSize: 12,
    color: "#D1D5DB",
    fontWeight: "500",
    marginTop: 4,
  },
});
