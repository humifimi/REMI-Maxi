import { useState } from "react";
import { StyleSheet, View, Text, TextInput } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { TirePosition, TreadHistoryEntry } from "@technician/types/api";

interface TireTreadInputProps {
  values: Record<TirePosition, string>;
  onChange: (position: TirePosition, value: string) => void;
  history?: TreadHistoryEntry[];
}

const POSITIONS: { pos: TirePosition; label: string; short: string }[] = [
  { pos: "left_front", label: "Left Front", short: "LF" },
  { pos: "right_front", label: "Right Front", short: "RF" },
  { pos: "left_rear", label: "Left Rear", short: "LR" },
  { pos: "right_rear", label: "Right Rear", short: "RR" },
];

function getDepthColor(mm: number): string {
  if (mm >= 4) return "#22C55E";
  if (mm >= 2) return "#EAB308";
  return "#EF4444";
}

function getDepthBg(mm: number): string {
  if (mm >= 4) return "#F0FDF4";
  if (mm >= 2) return "#FEF9C3";
  return "#FEE2E2";
}

function getLastDepth(history: TreadHistoryEntry[] | undefined, pos: TirePosition) {
  const entry = history?.find((h) => h.position === pos);
  if (!entry || entry.records.length === 0) return null;
  return entry.records[0].depth_mm;
}

export function TireTreadInput({ values, onChange, history }: TireTreadInputProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <MaterialIcons name="tire-repair" size={20} color="#3B82F6" />
        <Text style={styles.headerText}>Tire Tread Depth (mm)</Text>
      </View>

      <View style={styles.carDiagram}>
        <View style={styles.carBody}>
          <Text style={styles.carLabel}>FRONT</Text>
          <View style={styles.axle}>
            <TireInput
              position={POSITIONS[0]}
              value={values.left_front}
              lastDepth={getLastDepth(history, "left_front")}
              onChange={onChange}
            />
            <TireInput
              position={POSITIONS[1]}
              value={values.right_front}
              lastDepth={getLastDepth(history, "right_front")}
              onChange={onChange}
            />
          </View>
          <View style={styles.carCenter}>
            <View style={styles.carCenterLine} />
          </View>
          <View style={styles.axle}>
            <TireInput
              position={POSITIONS[2]}
              value={values.left_rear}
              lastDepth={getLastDepth(history, "left_rear")}
              onChange={onChange}
            />
            <TireInput
              position={POSITIONS[3]}
              value={values.right_rear}
              lastDepth={getLastDepth(history, "right_rear")}
              onChange={onChange}
            />
          </View>
          <Text style={styles.carLabel}>REAR</Text>
        </View>
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#22C55E" }]} />
          <Text style={styles.legendText}>4mm+ Safe</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#EAB308" }]} />
          <Text style={styles.legendText}>2-4mm Monitor</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#EF4444" }]} />
          <Text style={styles.legendText}>&lt;2mm Replace</Text>
        </View>
      </View>
    </View>
  );
}

function TireInput({
  position,
  value,
  lastDepth,
  onChange,
}: {
  position: { pos: TirePosition; label: string; short: string };
  value: string;
  lastDepth: number | null;
  onChange: (pos: TirePosition, val: string) => void;
}) {
  const numVal = parseFloat(value);
  const hasValue = !isNaN(numVal) && value.length > 0;
  const color = hasValue ? getDepthColor(numVal) : "#9CA3AF";
  const bg = hasValue ? getDepthBg(numVal) : "#F9FAFB";

  const delta = hasValue && lastDepth !== null ? numVal - lastDepth : null;

  return (
    <View style={styles.tireContainer}>
      <Text style={styles.tireLabel}>{position.short}</Text>
      <View style={[styles.tireInput, { borderColor: color, backgroundColor: bg }]}>
        <TextInput
          style={[styles.tireTextInput, { color: hasValue ? color : "#374151" }]}
          value={value}
          onChangeText={(v) => onChange(position.pos, v)}
          keyboardType="decimal-pad"
          placeholder="—"
          placeholderTextColor="#D1D5DB"
          maxLength={4}
        />
        <Text style={styles.tireUnit}>mm</Text>
      </View>
      {delta !== null && (
        <Text
          style={[
            styles.deltaText,
            { color: delta < 0 ? "#EF4444" : delta > 0 ? "#22C55E" : "#9CA3AF" },
          ]}
        >
          {delta > 0 ? "+" : ""}{delta.toFixed(1)}
        </Text>
      )}
      {lastDepth !== null && delta === null && (
        <Text style={styles.lastText}>Last: {lastDepth}mm</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  headerText: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
  carDiagram: { alignItems: "center", marginBottom: 12 },
  carBody: {
    width: 220,
    alignItems: "center",
    gap: 6,
  },
  carLabel: { fontSize: 11, fontWeight: "700", color: "#9CA3AF", letterSpacing: 1.5 },
  axle: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  carCenter: { alignItems: "center", paddingVertical: 4 },
  carCenterLine: {
    width: 2,
    height: 24,
    backgroundColor: "#E5E7EB",
    borderRadius: 1,
  },
  tireContainer: { alignItems: "center", gap: 4 },
  tireLabel: { fontSize: 12, fontWeight: "700", color: "#6B7280" },
  tireInput: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    width: 90,
    gap: 2,
  },
  tireTextInput: {
    fontSize: 20,
    fontWeight: "800",
    flex: 1,
    textAlign: "center",
    padding: 0,
  },
  tireUnit: { fontSize: 12, color: "#9CA3AF", fontWeight: "600" },
  deltaText: { fontSize: 11, fontWeight: "600" },
  lastText: { fontSize: 11, color: "#9CA3AF" },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: "#6B7280" },
});
