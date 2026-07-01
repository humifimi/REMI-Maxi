import { useState } from "react";
import { StyleSheet, View, Text, TextInput, Pressable, Image } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { NativeCamera } from "@technician/constants/runtime";
import { Severity } from "@technician/types/enums";
import { SeverityColorMap, SeverityLabels } from "@technician/constants/colors";
import type { Service } from "@technician/types/api";
import type { ObservationType } from "@technician/types/enums";

interface DeferredItemCaptureProps {
  fieldLabel: string;
  observationType: ObservationType;
  services: Service[];
  onUpdate: (data: {
    observationType: ObservationType;
    severity: ObservationType extends string ? "low" | "medium" | "high" : never;
    recommendedServiceId?: number;
    estimatedCost?: number;
    photoUri?: string;
    notes?: string;
  }) => void;
  onRemove: () => void;
}

const SEVERITIES: { key: typeof Severity[keyof typeof Severity]; label: string }[] = [
  { key: Severity.LOW, label: SeverityLabels.low },
  { key: Severity.MEDIUM, label: SeverityLabels.medium },
  { key: Severity.HIGH, label: SeverityLabels.high },
];

export function DeferredItemCapture({
  fieldLabel,
  observationType,
  services,
  onUpdate,
  onRemove,
}: DeferredItemCaptureProps) {
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("medium");
  const [selectedServiceId, setSelectedServiceId] = useState<number | undefined>();
  const [notes, setNotes] = useState("");
  const [photoUri, setPhotoUri] = useState<string | undefined>();

  const selectedService = services.find((s) => s.id === selectedServiceId);

  const emitUpdate = (overrides: Partial<{
    severity: "low" | "medium" | "high";
    recommendedServiceId: number | undefined;
    notes: string;
    photoUri: string | undefined;
  }> = {}) => {
    const current = {
      observationType,
      severity: overrides.severity ?? severity,
      recommendedServiceId: overrides.recommendedServiceId ?? selectedServiceId,
      estimatedCost: selectedService?.base_price,
      photoUri: overrides.photoUri ?? photoUri,
      notes: overrides.notes ?? notes,
    };
    onUpdate(current);
  };

  const handleSeverityChange = (s: "low" | "medium" | "high") => {
    setSeverity(s);
    emitUpdate({ severity: s });
  };

  const handleServiceSelect = (serviceId: number) => {
    const newId = serviceId === selectedServiceId ? undefined : serviceId;
    setSelectedServiceId(newId);
    emitUpdate({ recommendedServiceId: newId });
  };

  const handlePhoto = async () => {
    NativeCamera.acquire();
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.7,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets[0]) {
        setPhotoUri(result.assets[0].uri);
        emitUpdate({ photoUri: result.assets[0].uri });
      }
    } finally {
      NativeCamera.release();
    }
  };

  const handleNotesChange = (text: string) => {
    setNotes(text);
    emitUpdate({ notes: text });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <MaterialIcons name="warning" size={16} color="#F97316" />
        <Text style={styles.headerText}>Issue flagged: {fieldLabel}</Text>
        <Pressable onPress={onRemove} hitSlop={8}>
          <MaterialIcons name="close" size={18} color="#9CA3AF" />
        </Pressable>
      </View>

      <Text style={styles.label}>Severity</Text>
      <View style={styles.severityRow}>
        {SEVERITIES.map((s) => {
          const active = severity === s.key;
          const color = SeverityColorMap[s.key];
          return (
            <Pressable
              key={s.key}
              style={[
                styles.severityPill,
                active && { backgroundColor: color + "20", borderColor: color },
              ]}
              onPress={() => handleSeverityChange(s.key)}
            >
              <Text
                style={[
                  styles.severityText,
                  active && { color, fontWeight: "700" },
                ]}
              >
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Recommended Service</Text>
      <View style={styles.serviceChips}>
        {services.slice(0, 6).map((s) => {
          const active = selectedServiceId === s.id;
          return (
            <Pressable
              key={s.id}
              style={[styles.serviceChip, active && styles.serviceChipActive]}
              onPress={() => handleServiceSelect(s.id)}
            >
              <Text
                style={[
                  styles.serviceChipText,
                  active && styles.serviceChipTextActive,
                ]}
                numberOfLines={1}
              >
                {s.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.photoRow}>
        <Pressable style={styles.photoBtn} onPress={handlePhoto}>
          <MaterialIcons name="camera-alt" size={18} color="#374151" />
          <Text style={styles.photoBtnText}>
            {photoUri ? "Retake Photo" : "Take Photo"}
          </Text>
        </Pressable>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photoPreview} />
        ) : null}
      </View>

      <TextInput
        style={styles.notesInput}
        value={notes}
        onChangeText={handleNotesChange}
        placeholder="Notes (optional)"
        placeholderTextColor="#9CA3AF"
        multiline
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFF7ED",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#FDBA74",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  headerText: { flex: 1, fontSize: 13, fontWeight: "600", color: "#9A3412" },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 6,
    marginTop: 4,
  },
  severityRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  severityPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  severityText: { fontSize: 13, fontWeight: "500", color: "#6B7280" },
  serviceChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  serviceChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  serviceChipActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#3B82F6",
  },
  serviceChipText: { fontSize: 12, color: "#374151" },
  serviceChipTextActive: { color: "#3B82F6", fontWeight: "600" },
  photoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  photoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  photoBtnText: { fontSize: 13, fontWeight: "500", color: "#374151" },
  photoPreview: { width: 48, height: 48, borderRadius: 6 },
  notesInput: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    minHeight: 40,
  },
});
