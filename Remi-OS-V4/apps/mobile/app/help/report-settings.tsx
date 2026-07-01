// TODO(P0-FE-1 followup): the "Preferred Hand" toggle in this screen is
// no longer bug-reporter-specific now that it lives in the global
// `useAccessibilityStore` (landscape avatar-strip placement reads it
// too). Move the toggle to a generic Settings → Accessibility row when
// that section is built. Until then it stays here so users still have
// a UI to flip it.
import { useCallback, useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  Pressable,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BUG_REPORT_CONFIG, type SendDelay } from "@technician/constants/bug-report";
import {
  useAccessibilityStore,
  type PreferredHand,
} from "@technician/stores/accessibility";
import { useBubbleState } from "@technician/hooks/utility/use-bubble-state";
import { haptic } from "@technician/hooks/utility/use-haptics";

const KEYS = BUG_REPORT_CONFIG.ASYNC_STORAGE_KEYS;
const SEND_DELAYS: SendDelay[] = [0, 15, 30, 60];

export default function ReportSettingsScreen() {
  const bubbleState = useBubbleState();
  const preferredHand = useAccessibilityStore((s) => s.preferredHand);
  const setPreferredHandInStore = useAccessibilityStore(
    (s) => s.setPreferredHand,
  );
  const [sendDelay, setSendDelay] = useState<SendDelay>(30);
  const [screenshotDetection, setScreenshotDetection] = useState(true);

  useEffect(() => {
    (async () => {
      const [delayRaw, ssRaw] = await Promise.all([
        AsyncStorage.getItem(KEYS.SEND_DELAY),
        AsyncStorage.getItem(KEYS.SCREENSHOT_DETECTION_ENABLED),
      ]);

      if (delayRaw) {
        const val = parseInt(delayRaw, 10);
        if (SEND_DELAYS.includes(val as SendDelay)) setSendDelay(val as SendDelay);
      }
      if (ssRaw !== null) setScreenshotDetection(ssRaw !== "false");
    })();
  }, []);

  const handlePreferredHand = useCallback(
    (hand: PreferredHand) => {
      haptic.selection();
      setPreferredHandInStore(hand);
    },
    [setPreferredHandInStore],
  );

  const handleSendDelay = useCallback(async (delay: SendDelay) => {
    haptic.selection();
    setSendDelay(delay);
    await AsyncStorage.setItem(KEYS.SEND_DELAY, delay.toString());
  }, []);

  const handleScreenshotDetection = useCallback(async (val: boolean) => {
    setScreenshotDetection(val);
    await AsyncStorage.setItem(KEYS.SCREENSHOT_DETECTION_ENABLED, val ? "true" : "false");
  }, []);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionHeader}>Entry Points</Text>

      <ToggleRow
        label="Floating Bubble"
        description="Show the bug reporter bubble on all screens"
        value={bubbleState.isEnabled}
        onValueChange={(val) =>
          val ? bubbleState.enablePermanently() : bubbleState.disablePermanently()
        }
      />
      <ToggleRow
        label="Shake to Report"
        description="Shake your device to open the bug reporter"
        value={bubbleState.shakeEnabled}
        onValueChange={bubbleState.setShakeEnabled}
      />
      <ToggleRow
        label="Screenshot Detection"
        description="Prompt to report after taking a screenshot"
        value={screenshotDetection}
        onValueChange={handleScreenshotDetection}
      />

      <Text style={styles.sectionHeader}>Preferences</Text>

      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Preferred Hand</Text>
          <Text style={styles.settingDescription}>
            Bubble snaps to your preferred side
          </Text>
        </View>
        <View style={styles.segmented}>
          {(["left", "right"] as PreferredHand[]).map((hand) => (
            <Pressable
              key={hand}
              onPress={() => handlePreferredHand(hand)}
              style={[
                styles.segmentedBtn,
                preferredHand === hand && styles.segmentedBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.segmentedText,
                  preferredHand === hand && styles.segmentedTextActive,
                ]}
              >
                {hand === "left" ? "Left" : "Right"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Send Delay</Text>
          <Text style={styles.settingDescription}>
            Time before report is queued for sending
          </Text>
        </View>
        <View style={styles.segmented}>
          {SEND_DELAYS.map((d) => (
            <Pressable
              key={d}
              onPress={() => handleSendDelay(d)}
              style={[
                styles.segmentedBtn,
                sendDelay === d && styles.segmentedBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.segmentedText,
                  sendDelay === d && styles.segmentedTextActive,
                ]}
              >
                {d === 0 ? "Off" : `${d}s`}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (val: boolean) => void;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingInfo}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#D1D5DB", true: "#93C5FD" }}
        thumbColor={value ? "#3B82F6" : "#F9FAFB"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    gap: 12,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  settingDescription: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 2,
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    padding: 2,
  },
  segmentedBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  segmentedBtnActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentedText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  segmentedTextActive: {
    color: "#111827",
    fontWeight: "600",
  },
});
