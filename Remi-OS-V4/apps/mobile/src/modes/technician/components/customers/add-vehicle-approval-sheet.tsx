import { Modal, View, Text, Pressable, ScrollView, TextInput, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import { ColorPickerAccordion } from "./color-picker-accordion";
import type { ServiceHistoryResult } from "@technician/types/api";
import {
  getCarfaxPrefillMileage,
  parseManualMileageInput,
} from "@technician/utils/carfax-mileage";

interface PendingVehicle {
  vin?: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  engine?: string | null;
  license_plate?: string;
  license_plate_state?: string;
}

interface AddVehicleApprovalSheetProps {
  visible: boolean;
  vehicle: PendingVehicle;
  onClose: () => void;
  onConfirm: (extras: { mileage?: number; color?: string }) => void;
}

export function AddVehicleApprovalSheet({ visible, vehicle, onClose, onConfirm }: AddVehicleApprovalSheetProps) {
  const [mileageText, setMileageText] = useState("");
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [mileageStale, setMileageStale] = useState(false);

  const carfaxQuery = useQuery({
    queryKey: ["carfax-service-history", vehicle.vin],
    queryFn: () =>
      api<ServiceHistoryResult>("get", Endpoints.carfax.serviceHistory, {
        vin: vehicle.vin!.toUpperCase(),
      }),
    enabled: visible && !!vehicle.vin,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });

  const lastCarfaxMileage = useMemo(
    () => getCarfaxPrefillMileage(carfaxQuery.data),
    [carfaxQuery.data]
  );

  useEffect(() => {
    if (lastCarfaxMileage && lastCarfaxMileage > 0) {
      setMileageText(String(lastCarfaxMileage));
      setMileageStale(true);
    } else {
      setMileageText("");
      setMileageStale(false);
    }
  }, [lastCarfaxMileage]);

  const handleConfirm = () => {
    const extras: { mileage?: number; color?: string } = {};
    const parsed = parseManualMileageInput(mileageText);
    if (parsed) extras.mileage = parsed;
    if (selectedColor) extras.color = selectedColor;
    onConfirm(extras);
  };

  const label = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "New Vehicle";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Confirm Vehicle</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <MaterialIcons name="close" size={24} color="#6B7280" />
            </Pressable>
          </View>

          <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.vehicleInfoCard}>
              <MaterialIcons name="directions-car" size={28} color="#3B82F6" />
              <View style={styles.vehicleInfoText}>
                <Text style={styles.vehicleInfoName}>{label}</Text>
                {vehicle.vin && (
                  <Text style={styles.vehicleInfoDetail}>VIN: {vehicle.vin}</Text>
                )}
                {vehicle.license_plate && (
                  <Text style={styles.vehicleInfoDetail}>
                    Plate: {vehicle.license_plate}
                    {vehicle.license_plate_state ? ` (${vehicle.license_plate_state})` : ""}
                  </Text>
                )}
                {vehicle.engine && (
                  <Text style={styles.vehicleInfoDetail}>Engine: {vehicle.engine}</Text>
                )}
              </View>
            </View>

            <Text style={styles.sectionTitle}>Mileage</Text>
            <View style={styles.mileageRow}>
              <TextInput
                style={styles.mileageInput}
                value={mileageText}
                onChangeText={(t) => {
                  setMileageText(t.replace(/[^0-9]/g, ""));
                  setMileageStale(false);
                }}
                placeholder={carfaxQuery.isLoading ? "Loading from CARFAX…" : "Enter current mileage"}
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                returnKeyType="done"
              />
              <Text style={styles.mileageUnit}>mi</Text>
              {carfaxQuery.isLoading && (
                <ActivityIndicator size="small" color="#3B82F6" />
              )}
            </View>
            {mileageStale && (
              <View style={styles.mileageWarning}>
                <MaterialIcons name="warning" size={14} color="#DC2626" />
                <Text style={styles.mileageWarningText}>
                  Default from last CARFAX service — check if mileage needs updating before service
                </Text>
              </View>
            )}

            <ColorPickerAccordion
              selectedColor={selectedColor}
              onSelect={setSelectedColor}
            />
          </ScrollView>

          <View style={styles.footer}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.confirmBtn} onPress={handleConfirm}>
              <MaterialIcons name="check" size={18} color="#fff" />
              <Text style={styles.confirmText}>Add Vehicle</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  content: {
    padding: 16,
  },
  vehicleInfoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  vehicleInfoText: {
    flex: 1,
  },
  vehicleInfoName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1D4ED8",
    marginBottom: 2,
  },
  vehicleInfoDetail: {
    fontSize: 13,
    color: "#4B5563",
    marginTop: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  mileageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mileageInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#F9FAFB",
  },
  mileageUnit: {
    fontSize: 16,
    fontWeight: "500",
    color: "#6B7280",
  },
  mileageWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  mileageWarningText: {
    fontSize: 12,
    color: "#DC2626",
    fontWeight: "500",
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6B7280",
  },
  confirmBtn: {
    flex: 1.5,
    flexDirection: "row",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
});
