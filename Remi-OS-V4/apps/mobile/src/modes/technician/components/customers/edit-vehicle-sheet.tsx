import { Modal, View, Text, Pressable, ScrollView, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useState, useEffect } from "react";
import { ColorPickerAccordion } from "./color-picker-accordion";

interface Vehicle {
  id: number;
  year: number | null;
  make: string | null;
  model: string | null;
  color: string | null;
  mileage: number | null;
  license_plate_state: string | null;
}

interface EditVehicleSheetProps {
  visible: boolean;
  vehicle: Vehicle;
  lastCarfaxMileage?: number | null;
  onClose: () => void;
  onSave: (data: { color?: string | null; mileage?: number | null }) => void;
}

export function EditVehicleSheet({ visible, vehicle, lastCarfaxMileage, onClose, onSave }: EditVehicleSheetProps) {
  const [selectedColor, setSelectedColor] = useState<string | null>(vehicle.color);
  const [mileageText, setMileageText] = useState<string>("");
  const [mileageStale, setMileageStale] = useState(false);

  useEffect(() => {
    if (lastCarfaxMileage && lastCarfaxMileage > 0) {
      setMileageText(String(lastCarfaxMileage));
      setMileageStale(true);
    } else if (vehicle.mileage && vehicle.mileage > 0) {
      setMileageText(String(vehicle.mileage));
      setMileageStale(false);
    } else {
      setMileageText("");
      setMileageStale(false);
    }
  }, [vehicle.mileage, lastCarfaxMileage]);

  const handleSave = () => {
    const updates: { color?: string | null; mileage?: number | null } = {};
    if (selectedColor !== vehicle.color) {
      updates.color = selectedColor;
    }
    const parsedMileage = mileageText ? parseInt(mileageText.replace(/,/g, ""), 10) : null;
    if (parsedMileage !== vehicle.mileage) {
      updates.mileage = parsedMileage;
    }

    if (Object.keys(updates).length > 0) {
      onSave(updates);
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>
              Edit {vehicle.year} {vehicle.make} {vehicle.model}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <MaterialIcons name="close" size={24} color="#6B7280" />
            </Pressable>
          </View>

          <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>Mileage</Text>
            <View style={styles.mileageRow}>
              <TextInput
                style={styles.mileageInput}
                value={mileageText}
                onChangeText={(t) => {
                  setMileageText(t.replace(/[^0-9]/g, ""));
                  setMileageStale(false);
                }}
                placeholder="Enter current mileage"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                returnKeyType="done"
              />
              <Text style={styles.mileageUnit}>mi</Text>
            </View>
            {mileageStale && (
              <View style={styles.mileageWarning}>
                <MaterialIcons name="warning" size={14} color="#DC2626" />
                <Text style={styles.mileageWarningText}>
                  Default from last CARFAX service — verify before service
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
            <Pressable style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveText}>Save Changes</Text>
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
    maxHeight: "80%",
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
    flex: 1,
  },
  content: {
    padding: 16,
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
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#3B82F6",
    alignItems: "center",
  },
  saveText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
});
