import { forwardRef, useMemo, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { TouchableOpacity } from "react-native-gesture-handler";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { AppSheet, type AppSheetRef } from "@technician/components/sheets";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  NUDGE_TEMPLATES,
  interpolateTemplate,
  useFleetNudge,
} from "@technician/hooks/use-fleet-due-soon";
import type { FleetDueSoonVehicle, NudgeChannel, NudgeTargetType } from "@technician/types/fleet";
import { haptic } from "@technician/hooks/utility/use-haptics";

interface NudgeTemplatePickerProps {
  selectedVehicles: FleetDueSoonVehicle[];
  onClose: () => void;
  onSuccess: (sentCount: number) => void;
}

const CHANNELS: { key: NudgeChannel; label: string; icon: string }[] = [
  { key: "sms", label: "SMS", icon: "sms" },
  { key: "email", label: "Email", icon: "email" },
  { key: "call_list", label: "Call List", icon: "phone" },
  { key: "schedule_block", label: "Schedule", icon: "calendar-today" },
];

const TARGETS: { key: NudgeTargetType; label: string; description: string }[] = [
  { key: "coordinator", label: "Fleet Coordinator", description: "Single contact per company" },
  { key: "drivers", label: "Individual Drivers", description: "Message each driver directly" },
];

const MAX_CUSTOM_LENGTH = 320;

export const NudgeTemplatePicker = forwardRef<AppSheetRef, NudgeTemplatePickerProps>(
  function NudgeTemplatePicker({ selectedVehicles, onClose, onSuccess }, ref) {
    const snapPoints = useMemo(() => ["85%"], []);
    const nudge = useFleetNudge();

    const [selectedTemplate, setSelectedTemplate] = useState<string>(NUDGE_TEMPLATES[0].key);
    const [channel, setChannel] = useState<NudgeChannel>("sms");
    const [targetType, setTargetType] = useState<NudgeTargetType>("coordinator");
    const [customMessage, setCustomMessage] = useState("");
    const [showCustom, setShowCustom] = useState(false);

    const previewVehicle = selectedVehicles[0] ?? null;
    const activeTemplate = NUDGE_TEMPLATES.find((t) => t.key === selectedTemplate);
    const previewText = previewVehicle && activeTemplate
      ? interpolateTemplate(
          showCustom && customMessage.trim() ? customMessage : activeTemplate.body,
          previewVehicle
        )
      : "";

    const handleSend = useCallback(() => {
      haptic.medium();
      nudge.mutate(
        {
          vehicle_ids: selectedVehicles.map((v) => v.vehicle_id),
          channel,
          template_key: showCustom ? "custom" : selectedTemplate,
          custom_message: showCustom ? customMessage : undefined,
          target_type: targetType,
        },
        {
          onSuccess: (data) => {
            haptic.light();
            onSuccess(data.sent);
          },
          onError: () => {
            Alert.alert("Send Failed", "Could not send nudges. Try again later.");
          },
        }
      );
    }, [selectedVehicles, channel, selectedTemplate, targetType, customMessage, showCustom, nudge, onSuccess]);

    return (
      <AppSheet defaultSide="right"
        ref={ref}
        index={-1}
        defaultSnapPoints={snapPoints}
        enablePanDownToClose
        onClose={onClose}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handle}
      >
        <BottomSheetScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Send Nudge</Text>
            <Text style={styles.subtitle}>
              {selectedVehicles.length} vehicle{selectedVehicles.length !== 1 ? "s" : ""} selected
            </Text>
          </View>

          {/* Template Selection */}
          <Text style={styles.sectionTitle}>Message Template</Text>
          {NUDGE_TEMPLATES.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[
                styles.templateRow,
                selectedTemplate === t.key && !showCustom && styles.templateRowActive,
              ]}
              onPress={() => {
                setSelectedTemplate(t.key);
                setShowCustom(false);
              }}
            >
              <MaterialIcons
                name={t.icon}
                size={20}
                color={selectedTemplate === t.key && !showCustom ? "#3B82F6" : "#6B7280"}
              />
              <View style={styles.templateText}>
                <Text
                  style={[
                    styles.templateLabel,
                    selectedTemplate === t.key && !showCustom && styles.templateLabelActive,
                  ]}
                >
                  {t.label}
                </Text>
                <Text style={styles.templatePreview} numberOfLines={2}>
                  {t.body}
                </Text>
              </View>
              {selectedTemplate === t.key && !showCustom && (
                <MaterialIcons name="check-circle" size={20} color="#3B82F6" />
              )}
            </TouchableOpacity>
          ))}

          {/* Custom Message */}
          <TouchableOpacity
            style={[styles.templateRow, showCustom && styles.templateRowActive]}
            onPress={() => setShowCustom(true)}
          >
            <MaterialIcons
              name="edit"
              size={20}
              color={showCustom ? "#3B82F6" : "#6B7280"}
            />
            <View style={styles.templateText}>
              <Text style={[styles.templateLabel, showCustom && styles.templateLabelActive]}>
                Custom Message
              </Text>
              <Text style={styles.templatePreview}>Write your own message</Text>
            </View>
            {showCustom && <MaterialIcons name="check-circle" size={20} color="#3B82F6" />}
          </TouchableOpacity>

          {showCustom && (
            <View style={styles.customInputWrap}>
              <TextInput
                style={styles.customInput}
                value={customMessage}
                onChangeText={setCustomMessage}
                placeholder="Use {{driver_name}}, {{vehicle}}, {{service_type}}, {{due_date}}"
                placeholderTextColor="#9CA3AF"
                multiline
                maxLength={MAX_CUSTOM_LENGTH}
              />
              <Text style={styles.charCount}>
                {customMessage.length}/{MAX_CUSTOM_LENGTH}
              </Text>
            </View>
          )}

          {/* Preview */}
          {previewText ? (
            <View style={styles.previewBox}>
              <Text style={styles.previewLabel}>Preview</Text>
              <Text style={styles.previewBody}>{previewText}</Text>
            </View>
          ) : null}

          {/* Channel */}
          <Text style={styles.sectionTitle}>Channel</Text>
          <View style={styles.chipRow}>
            {CHANNELS.map((ch) => (
              <TouchableOpacity
                key={ch.key}
                style={[styles.chip, channel === ch.key && styles.chipActive]}
                onPress={() => setChannel(ch.key)}
              >
                <MaterialIcons
                  name={ch.icon as any}
                  size={16}
                  color={channel === ch.key ? "#fff" : "#6B7280"}
                />
                <Text
                  style={[styles.chipText, channel === ch.key && styles.chipTextActive]}
                >
                  {ch.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Smart Targeting */}
          <Text style={styles.sectionTitle}>Send To</Text>
          {TARGETS.map((tg) => (
            <TouchableOpacity
              key={tg.key}
              style={[styles.targetRow, targetType === tg.key && styles.targetRowActive]}
              onPress={() => setTargetType(tg.key)}
            >
              <View style={[styles.radio, targetType === tg.key && styles.radioActive]}>
                {targetType === tg.key && <View style={styles.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.targetLabel, targetType === tg.key && styles.targetLabelActive]}
                >
                  {tg.label}
                </Text>
                <Text style={styles.targetDescription}>{tg.description}</Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* Send Button */}
          <TouchableOpacity
            style={[styles.sendBtn, nudge.isPending && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={nudge.isPending || (showCustom && !customMessage.trim())}
          >
            {nudge.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialIcons
                  name={channel === "sms" ? "sms" : channel === "email" ? "email" : channel === "call_list" ? "phone" : "calendar-today"}
                  size={20}
                  color="#fff"
                />
                <Text style={styles.sendBtnText}>
                  {channel === "call_list"
                    ? "Generate Call List"
                    : channel === "schedule_block"
                      ? "Create Schedule Block"
                      : `Send ${channel === "sms" ? "SMS" : "Email"} to ${selectedVehicles.length}`}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </BottomSheetScrollView>
      </AppSheet>
    );
  }
);

const styles = StyleSheet.create({
  sheetBg: { backgroundColor: "#fff" },
  handle: { backgroundColor: "#D1D5DB", width: 40 },
  content: { padding: 20, paddingTop: 4 },
  header: { marginBottom: 16 },
  title: { fontSize: 20, fontWeight: "800", color: "#111827" },
  subtitle: { fontSize: 14, color: "#9CA3AF", marginTop: 2 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 18,
    marginBottom: 8,
  },
  templateRow: {
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
  templateRowActive: {
    borderColor: "#3B82F6",
    backgroundColor: "#EFF6FF",
  },
  templateText: { flex: 1 },
  templateLabel: { fontSize: 14, fontWeight: "600", color: "#111827" },
  templateLabelActive: { color: "#3B82F6" },
  templatePreview: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  customInputWrap: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
    backgroundColor: "#F9FAFB",
  },
  customInput: {
    fontSize: 14,
    color: "#111827",
    minHeight: 60,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: 11,
    color: "#9CA3AF",
    textAlign: "right",
    marginTop: 4,
  },
  previewBox: {
    backgroundColor: "#F0FDF4",
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#22C55E",
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  previewBody: { fontSize: 13, color: "#374151", lineHeight: 18 },
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
  targetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 6,
    backgroundColor: "#fff",
  },
  targetRowActive: {
    borderColor: "#3B82F6",
    backgroundColor: "#EFF6FF",
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { borderColor: "#3B82F6" },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#3B82F6",
  },
  targetLabel: { fontSize: 14, fontWeight: "600", color: "#111827" },
  targetLabelActive: { color: "#3B82F6" },
  targetDescription: { fontSize: 12, color: "#9CA3AF", marginTop: 1 },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#3B82F6",
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 24,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
