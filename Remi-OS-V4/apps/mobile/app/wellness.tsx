import { useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  Linking,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  useWellnessNudges,
  useAcknowledgeNudge,
  useCoachResponse,
} from "@technician/hooks/utility/use-wellness";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type { WellnessResourceLink } from "@technician/types/wellness";

const DEFAULT_RESOURCES: WellnessResourceLink[] = [
  {
    title: "Talk to Someone",
    url: "tel:988",
    description: "Confidential support line",
  },
  {
    title: "Wellness Resources",
    description: "Employee Assistance Program",
  },
  {
    title: "Anonymous Feedback",
    description: "Share thoughts privately",
  },
];

export default function WellnessScreen() {
  const router = useRouter();
  const { nudgeId, nudgeMessage, aiResponseId } = useLocalSearchParams<{
    nudgeId?: string;
    nudgeMessage?: string;
    aiResponseId?: string;
  }>();
  const nudgesQuery = useWellnessNudges();
  const acknowledgeMutation = useAcknowledgeNudge();

  // Pre-generated supportive content. The wellness_nudge push payload now
  // ships an `ai_response_id` per `wellness-ai-and-walk-in-contract.md` § 2,
  // so the screen can render the coach's message immediately on tap rather
  // than re-running generation. Falls through silently if the id is missing
  // or the fetch fails — the nudge `message` from the local list is still
  // shown either way.
  const coachId = aiResponseId ? Number(aiResponseId) : null;
  const coachQuery = useCoachResponse(
    coachId && coachId > 0 ? coachId : null,
  );
  const coach = coachQuery.data ?? null;

  const nudge = nudgesQuery.data?.find(
    (n) => String(n.id) === nudgeId,
  );

  const displayMessage =
    coach?.response_text ??
    nudge?.message ??
    nudgeMessage ??
    "We noticed you\u2019ve been having a tough few days. Here are some resources that might help.";

  const coachResources: WellnessResourceLink[] = coach?.resource_suggestions
    ? coach.resource_suggestions.map((r) => ({
        title: r.title,
        url: r.url,
        description: r.description,
      }))
    : [];

  const resourceLinks =
    coachResources.length > 0
      ? coachResources
      : nudge?.resource_links && nudge.resource_links.length > 0
        ? nudge.resource_links
        : DEFAULT_RESOURCES;

  const handleDismiss = useCallback(() => {
    haptic.light();
    if (nudgeId) {
      acknowledgeMutation.mutate(Number(nudgeId));
    }
    router.back();
  }, [nudgeId, acknowledgeMutation, router]);

  const handleLinkPress = useCallback((link: WellnessResourceLink) => {
    if (link.url) {
      Linking.openURL(link.url).catch(() => {});
    }
  }, []);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Wellness",
          headerStyle: { backgroundColor: "#111827" },
          headerTintColor: "#fff",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <View style={styles.iconCircle}>
          <MaterialIcons name="favorite" size={36} color="#EC4899" />
        </View>

        <Text style={styles.title}>Hey, checking in on you</Text>

        <View style={styles.messageCard}>
          <Text style={styles.messageText}>{displayMessage}</Text>
        </View>

        <Text style={styles.resourcesLabel}>Resources</Text>
        <View style={styles.linksContainer}>
          {resourceLinks.map((link) => (
            <Pressable
              key={link.title}
              style={styles.linkCard}
              onPress={() => handleLinkPress(link)}
            >
              <View style={styles.linkIconCircle}>
                <MaterialIcons
                  name={
                    link.title.toLowerCase().includes("talk")
                      ? "phone"
                      : link.title.toLowerCase().includes("feedback")
                        ? "feedback"
                        : "open-in-new"
                  }
                  size={20}
                  color="#7C3AED"
                />
              </View>
              <View style={styles.linkInfo}>
                <Text style={styles.linkTitle}>{link.title}</Text>
                {link.description ? (
                  <Text style={styles.linkDesc}>{link.description}</Text>
                ) : null}
              </View>
              {link.url ? (
                <MaterialIcons
                  name="chevron-right"
                  size={22}
                  color="#D1D5DB"
                />
              ) : null}
            </Pressable>
          ))}
        </View>

        <Pressable
          style={styles.dismissBtn}
          onPress={handleDismiss}
          disabled={acknowledgeMutation.isPending}
        >
          {acknowledgeMutation.isPending ? (
            <ActivityIndicator size="small" color="#6B7280" />
          ) : (
            <Text style={styles.dismissText}>
              I'm okay, just a rough week
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    alignItems: "center",
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FDF2F8",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 16,
  },
  messageCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    borderLeftWidth: 4,
    borderLeftColor: "#EC4899",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 28,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#374151",
    fontWeight: "500",
  },
  resourcesLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  linksContainer: {
    width: "100%",
    gap: 10,
    marginBottom: 32,
  },
  linkCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    minHeight: 64,
  },
  linkIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F5F3FF",
    alignItems: "center",
    justifyContent: "center",
  },
  linkInfo: {
    flex: 1,
  },
  linkTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  linkDesc: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  dismissBtn: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  dismissText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6B7280",
  },
});
