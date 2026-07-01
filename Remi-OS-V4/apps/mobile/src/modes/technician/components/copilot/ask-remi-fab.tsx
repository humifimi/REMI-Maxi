import { StyleSheet, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { haptic } from "@technician/hooks/utility/use-haptics";

interface AskRemiFabProps {
  appointmentId?: number;
  jobLabel?: string;
  /** When true, shows a mic FAB for voice-first interaction */
  voiceEnabled?: boolean;
}

export function AskRemiFab({
  appointmentId,
  jobLabel,
  voiceEnabled,
}: AskRemiFabProps) {
  const router = useRouter();

  const handleTextPress = () => {
    haptic.medium();
    const params = appointmentId ? `?appointmentId=${appointmentId}` : "";
    router.push(`/copilot/chat${params}` as never);
  };

  const handleVoicePress = () => {
    haptic.medium();
    const qs = new URLSearchParams();
    if (appointmentId) qs.set("appointmentId", String(appointmentId));
    if (jobLabel) qs.set("jobLabel", jobLabel);
    const params = qs.toString() ? `?${qs.toString()}` : "";
    router.push(`/copilot/voice${params}` as never);
  };

  if (voiceEnabled) {
    return (
      <View style={styles.fabGroup}>
        <Pressable style={styles.voiceFab} onPress={handleVoicePress}>
          <MaterialIcons name="mic" size={24} color="#fff" />
        </Pressable>
        <Pressable style={styles.fabInline} onPress={handleTextPress}>
          <View style={styles.iconCircle}>
            <MaterialIcons name="auto-awesome" size={22} color="#fff" />
          </View>
          <Text style={styles.label}>Ask REMI</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable style={styles.fab} onPress={handleTextPress}>
      <View style={styles.iconCircle}>
        <MaterialIcons name="auto-awesome" size={22} color="#fff" />
      </View>
      <Text style={styles.label}>Ask REMI</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fabGroup: {
    position: "absolute",
    bottom: 24,
    right: 16,
    alignItems: "flex-end",
    gap: 10,
    zIndex: 100,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#8B5CF6",
    paddingVertical: 14,
    paddingHorizontal: 18,
    paddingLeft: 14,
    borderRadius: 999,
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
    zIndex: 100,
  },
  fabInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#8B5CF6",
    paddingVertical: 14,
    paddingHorizontal: 18,
    paddingLeft: 14,
    borderRadius: 999,
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  voiceFab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#7C3AED",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});
