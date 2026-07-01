import { forwardRef, useMemo, useState } from "react";
import { StyleSheet, View, Text, ActivityIndicator } from "react-native";
import { AppSheet, type AppSheetRef } from "@technician/components/sheets";
import { TouchableOpacity } from "react-native-gesture-handler";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSendFleetNudge } from "@technician/hooks/inventory/use-fleet";
import { haptic } from "@technician/hooks/utility/use-haptics";

interface NudgeActionSheetProps {
  companyId: number;
  selectedVehicleIds: number[];
  onClose: () => void;
  onSuccess: () => void;
}

type NudgeChannel = "sms" | "email" | "call_list";
type TargetType = "coordinator" | "drivers" | "region";

const TEMPLATES = [
  {
    key: "due_soon",
    label: "Due Soon",
    preview: "Due soon \u2014 pick a time that works for you.",
    icon: "schedule" as const,
  },
  {
    key: "overdue",
    label: "Overdue",
    preview: "Overdue \u2014 quick availability check.",
    icon: "warning" as const,
  },
  {
    key: "onsite",
    label: "We'll Be Onsite",
    preview: "We'll be onsite at your location \u2014 want us to grab yours?",
    icon: "location-on" as const,
  },
] as const;

const CHANNELS: { key: NudgeChannel; label: string; icon: string }[] = [
  { key: "sms", label: "SMS", icon: "sms" },
  { key: "email", label: "Email", icon: "email" },
  { key: "call_list", label: "Call List", icon: "phone" },
];

const TARGETS: { key: TargetType; label: string }[] = [
  { key: "coordinator", label: "Coordinator Only" },
  { key: "drivers", label: "Individual Drivers" },
  { key: "region", label: "By Region" },
];

export const NudgeActionSheet = forwardRef<AppSheetRef, NudgeActionSheetProps>(
  function NudgeActionSheet(
    { companyId, selectedVehicleIds, onClose, onSuccess },
    ref
  ) {
    const snapPoints = useMemo(() => ["70%"], []);
    const nudge = useSendFleetNudge(companyId);
    const [selectedTemplate, setSelectedTemplate] = useState<string>(
      TEMPLATES[0].key
    );
    const [selectedChannel, setSelectedChannel] = useState<NudgeChannel>("sms");
    const [selectedTarget, setSelectedTarget] =
      useState<TargetType>("coordinator");

    const handleSend = () => {
      haptic.medium();
      nudge.mutate(
        {
          vehicleIds: selectedVehicleIds,
          channel: selectedChannel,
          template: selectedTemplate,
          targetType: selectedTarget,
        },
        {
          onSuccess: (data) => {
            haptic.light();
            onSuccess();
          },
        }
      );
    };

    return (
      <AppSheet defaultSide="right"
        ref={ref}
        index={-1}
        defaultSnapPoints={snapPoints}
        enablePanDownToClose
        onClose={onClose}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Send Nudge</Text>
          <Text style={styles.subtitle}>
            {selectedVehicleIds.length} vehicle(s) selected
          </Text>

          <Text style={styles.sectionTitle}>Template</Text>
          {TEMPLATES.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[
                styles.optionRow,
                selectedTemplate === t.key && styles.optionRowActive,
              ]}
              onPress={() => setSelectedTemplate(t.key)}
            >
              <MaterialIcons
                name={t.icon}
                size={20}
                color={selectedTemplate === t.key ? "#3B82F6" : "#6B7280"}
              />
              <View style={styles.optionText}>
                <Text
                  style={[
                    styles.optionLabel,
                    selectedTemplate === t.key && styles.optionLabelActive,
                  ]}
                >
                  {t.label}
                </Text>
                <Text style={styles.optionPreview} numberOfLines={1}>
                  {t.preview}
                </Text>
              </View>
              {selectedTemplate === t.key && (
                <MaterialIcons name="check-circle" size={20} color="#3B82F6" />
              )}
            </TouchableOpacity>
          ))}

          <Text style={styles.sectionTitle}>Channel</Text>
          <View style={styles.chipRow}>
            {CHANNELS.map((ch) => (
              <TouchableOpacity
                key={ch.key}
                style={[
                  styles.chip,
                  selectedChannel === ch.key && styles.chipActive,
                ]}
                onPress={() => setSelectedChannel(ch.key)}
              >
                <MaterialIcons
                  name={ch.icon as any}
                  size={16}
                  color={selectedChannel === ch.key ? "#fff" : "#6B7280"}
                />
                <Text
                  style={[
                    styles.chipText,
                    selectedChannel === ch.key && styles.chipTextActive,
                  ]}
                >
                  {ch.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Target</Text>
          <View style={styles.chipRow}>
            {TARGETS.map((tg) => (
              <TouchableOpacity
                key={tg.key}
                style={[
                  styles.chip,
                  selectedTarget === tg.key && styles.chipActive,
                ]}
                onPress={() => setSelectedTarget(tg.key)}
              >
                <Text
                  style={[
                    styles.chipText,
                    selectedTarget === tg.key && styles.chipTextActive,
                  ]}
                >
                  {tg.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.sendBtn, nudge.isPending && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={nudge.isPending}
          >
            {nudge.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialIcons name="send" size={20} color="#fff" />
                <Text style={styles.sendBtnText}>Send Nudge</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </AppSheet>
    );
  }
);

const styles = StyleSheet.create({
  content: { padding: 20 },
  title: { fontSize: 18, fontWeight: "700", color: "#111827" },
  subtitle: { fontSize: 14, color: "#9CA3AF", marginBottom: 12 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 6,
    backgroundColor: "#fff",
  },
  optionRowActive: {
    borderColor: "#3B82F6",
    backgroundColor: "#EFF6FF",
  },
  optionText: { flex: 1 },
  optionLabel: { fontSize: 14, fontWeight: "600", color: "#111827" },
  optionLabelActive: { color: "#3B82F6" },
  optionPreview: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: "#3B82F6", borderColor: "#3B82F6" },
  chipText: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  chipTextActive: { color: "#fff" },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#3B82F6",
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 20,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
