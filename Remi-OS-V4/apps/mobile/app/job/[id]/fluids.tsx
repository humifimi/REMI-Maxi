import { useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useJobFlowStore } from "@technician/stores/job-flow";
import { useFluidHistory, useRecordFluids } from "@technician/hooks/jobs/use-fluid-tracking";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { extractErrorMessage } from "@technician/api/errors";
import type { FluidType, FluidLevelInput, FluidHistoryEntry } from "@technician/types/api";

const FLUID_TYPES: { type: FluidType; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { type: "coolant", label: "Coolant", icon: "thermostat" },
  { type: "washer", label: "Washer Fluid", icon: "water-drop" },
  { type: "brake", label: "Brake Fluid", icon: "disc-full" },
  { type: "transmission", label: "Transmission", icon: "settings" },
  { type: "power_steering", label: "Power Steering", icon: "rotate-right" },
  { type: "differential", label: "Differential", icon: "sync" },
];

const ACTIONS = ["Normal", "Topped off 2oz", "Topped off 4oz", "Topped off 8oz", "Low — notified customer", "Dirty — recommend flush"];

function getLastRecord(history: FluidHistoryEntry[] | undefined, fluidType: FluidType) {
  const entry = history?.find((h) => h.fluid_type === fluidType);
  if (!entry || entry.records.length === 0) return null;
  return entry.records[0];
}

function getLevelColor(action: string): string {
  if (!action || action === "Normal") return "#22C55E";
  if (action.startsWith("Low") || action.startsWith("Dirty")) return "#EF4444";
  return "#EAB308";
}

export default function FluidsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobId = parseInt(id, 10);
  const router = useRouter();
  const { vehicle } = useJobFlowStore();
  const vehicleId = vehicle?.id ?? 0;

  const { data: history, isLoading: historyLoading } = useFluidHistory(vehicleId);
  const recordFluids = useRecordFluids(jobId);

  const [inputs, setInputs] = useState<Record<FluidType, { level: string; action: string }>>({
    coolant: { level: "", action: "Normal" },
    washer: { level: "", action: "Normal" },
    brake: { level: "", action: "Normal" },
    transmission: { level: "", action: "Normal" },
    power_steering: { level: "", action: "Normal" },
    differential: { level: "", action: "Normal" },
  });

  const [expandedAction, setExpandedAction] = useState<FluidType | null>(null);

  const updateInput = (type: FluidType, field: "level" | "action", value: string) => {
    setInputs((prev) => ({
      ...prev,
      [type]: { ...prev[type], [field]: value },
    }));
  };

  const filledCount = useMemo(
    () => FLUID_TYPES.filter((f) => inputs[f.type].level.trim().length > 0).length,
    [inputs],
  );

  const handleSubmit = async () => {
    const fluids: FluidLevelInput[] = FLUID_TYPES
      .filter((f) => inputs[f.type].level.trim().length > 0)
      .map((f) => ({
        fluid_type: f.type,
        measured_level: inputs[f.type].level.trim(),
        action_taken: inputs[f.type].action,
      }));

    if (fluids.length === 0) {
      router.replace(`/job/${id}/invoice` as never);
      return;
    }

    try {
      haptic.medium();
      await recordFluids.mutateAsync({ vehicleId, entries: fluids });
      haptic.success();
      router.replace(`/job/${id}/invoice` as never);
    } catch (err) {
      Alert.alert("Could not save fluid levels", extractErrorMessage(err));
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Fluid Levels" }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <MaterialIcons name="opacity" size={28} color="#3B82F6" />
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Fluid Level Documentation</Text>
            <Text style={styles.headerSub}>
              Record levels for each fluid. Delta from last visit shown.
            </Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{filledCount}/6</Text>
          </View>
        </View>

        {historyLoading && (
          <ActivityIndicator size="small" color="#3B82F6" style={{ marginVertical: 12 }} />
        )}

        {FLUID_TYPES.map((fluid) => {
          const last = getLastRecord(history, fluid.type);
          const current = inputs[fluid.type];
          const levelColor = getLevelColor(current.action);
          const isActionExpanded = expandedAction === fluid.type;

          return (
            <View key={fluid.type} style={styles.fluidCard}>
              <View style={styles.fluidHeader}>
                <View style={[styles.gaugeIcon, { backgroundColor: `${levelColor}18` }]}>
                  <MaterialIcons name={fluid.icon} size={22} color={levelColor} />
                </View>
                <Text style={styles.fluidLabel}>{fluid.label}</Text>
              </View>

              {last && (
                <View style={styles.deltaRow}>
                  <MaterialIcons name="history" size={14} color="#9CA3AF" />
                  <Text style={styles.deltaText}>
                    Last visit: {last.action_taken}
                    {current.action !== "Normal" && current.action !== last.action_taken
                      ? ` → This visit: ${current.action}`
                      : ""}
                    {!last && current.action !== "Normal"
                      ? " — first time"
                      : ""}
                  </Text>
                </View>
              )}

              <View style={styles.inputRow}>
                <TextInput
                  style={styles.levelInput}
                  placeholder="Level (e.g. Full, 3/4, Low)"
                  placeholderTextColor="#9CA3AF"
                  value={current.level}
                  onChangeText={(v) => updateInput(fluid.type, "level", v)}
                />
              </View>

              <Pressable
                style={styles.actionSelector}
                onPress={() => {
                  haptic.light();
                  setExpandedAction(isActionExpanded ? null : fluid.type);
                }}
              >
                <Text style={[styles.actionText, { color: levelColor }]}>
                  {current.action}
                </Text>
                <MaterialIcons
                  name={isActionExpanded ? "expand-less" : "expand-more"}
                  size={20}
                  color="#6B7280"
                />
              </Pressable>

              {isActionExpanded && (
                <View style={styles.actionList}>
                  {ACTIONS.map((action) => (
                    <Pressable
                      key={action}
                      style={[
                        styles.actionOption,
                        current.action === action && styles.actionOptionActive,
                      ]}
                      onPress={() => {
                        haptic.selection();
                        updateInput(fluid.type, "action", action);
                        setExpandedAction(null);
                      }}
                    >
                      <Text
                        style={[
                          styles.actionOptionText,
                          current.action === action && styles.actionOptionTextActive,
                        ]}
                      >
                        {action}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        <Pressable
          style={[styles.submitBtn, recordFluids.isPending && styles.disabled]}
          onPress={handleSubmit}
          disabled={recordFluids.isPending}
        >
          <Text style={styles.submitText}>
            {recordFluids.isPending
              ? "Saving..."
              : filledCount > 0
                ? `Save ${filledCount} Fluid Record${filledCount > 1 ? "s" : ""} & Continue`
                : "Skip — Continue to Invoice"}
          </Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16, paddingBottom: 40 },
  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#EFF6FF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#1E40AF" },
  headerSub: { fontSize: 12, color: "#3B82F6", marginTop: 2 },
  countBadge: {
    backgroundColor: "#3B82F6",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  fluidCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  fluidHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  gaugeIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  fluidLabel: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
  deltaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
    paddingLeft: 4,
  },
  deltaText: { fontSize: 12, color: "#6B7280", fontStyle: "italic", flex: 1 },
  inputRow: { marginBottom: 8 },
  levelInput: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: "#1F2937",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  actionSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  actionText: { fontSize: 14, fontWeight: "600" },
  actionList: {
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  actionOption: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  actionOptionActive: { backgroundColor: "#EFF6FF" },
  actionOptionText: { fontSize: 14, color: "#374151" },
  actionOptionTextActive: { color: "#1D4ED8", fontWeight: "600" },
  submitBtn: {
    backgroundColor: "#3B82F6",
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 12,
  },
  disabled: { opacity: 0.6 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
