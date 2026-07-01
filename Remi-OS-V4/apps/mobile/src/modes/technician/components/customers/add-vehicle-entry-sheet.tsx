import { useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

interface AddVehicleEntrySheetProps {
  visible: boolean;
  onClose: () => void;
  onOpenScanner: () => void;
  onManualVin: (vin: string) => void;
  onManualPlate: (plate: string, state: string) => void;
  vinLoading?: boolean;
  plateLoading?: boolean;
}

export function AddVehicleEntrySheet({
  visible,
  onClose,
  onOpenScanner,
  onManualVin,
  onManualPlate,
  vinLoading,
  plateLoading,
}: AddVehicleEntrySheetProps) {
  const [vinInput, setVinInput] = useState("");
  const [plateInput, setPlateInput] = useState("");
  const [stateInput, setStateInput] = useState("");

  const handleVinSubmit = () => {
    const trimmed = vinInput.trim().toUpperCase();
    if (!trimmed) {
      Alert.alert("Required", "Enter a VIN to look up.");
      return;
    }
    if (trimmed.length !== 17) {
      Alert.alert("Invalid VIN", "A VIN must be exactly 17 characters.");
      return;
    }
    onManualVin(trimmed);
  };

  const handlePlateSubmit = () => {
    const plate = plateInput.trim().toUpperCase();
    const state = stateInput.trim().toUpperCase();
    if (!plate) {
      Alert.alert("Required", "Enter a license plate number.");
      return;
    }
    if (!state || state.length !== 2) {
      Alert.alert("Required", "Enter a 2-letter state abbreviation.");
      return;
    }
    onManualPlate(plate, state);
  };

  const handleClose = () => {
    setVinInput("");
    setPlateInput("");
    setStateInput("");
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Add Vehicle</Text>

          {/* Camera scan option */}
          <Pressable style={styles.scanBtn} onPress={onOpenScanner}>
            <View style={styles.scanIconCircle}>
              <MaterialIcons name="photo-camera" size={22} color="#fff" />
            </View>
            <View style={styles.scanTextGroup}>
              <Text style={styles.scanTitle}>Scan VIN or Plate</Text>
              <Text style={styles.scanSub}>
                Use camera to read barcode or plate
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#93C5FD" />
          </Pressable>

          {/* VIN manual input */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or type VIN</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              placeholder="Enter 17-character VIN"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={17}
              value={vinInput}
              onChangeText={setVinInput}
              returnKeyType="go"
              onSubmitEditing={handleVinSubmit}
            />
            <Pressable
              style={[styles.lookupBtn, vinLoading && styles.lookupBtnDisabled]}
              onPress={handleVinSubmit}
              disabled={vinLoading}
            >
              {vinLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <MaterialIcons name="search" size={20} color="#fff" />
              )}
            </Pressable>
          </View>

          {/* Plate + State manual input */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or look up by plate</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={[styles.textInput, { flex: 2 }]}
              placeholder="Plate #"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={10}
              value={plateInput}
              onChangeText={setPlateInput}
            />
            <TextInput
              style={[styles.textInput, { flex: 1, marginLeft: 8 }]}
              placeholder="ST"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={2}
              value={stateInput}
              onChangeText={setStateInput}
              returnKeyType="go"
              onSubmitEditing={handlePlateSubmit}
            />
            <Pressable
              style={[styles.lookupBtn, plateLoading && styles.lookupBtnDisabled]}
              onPress={handlePlateSubmit}
              disabled={plateLoading}
            >
              {plateLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <MaterialIcons name="search" size={20} color="#fff" />
              )}
            </Pressable>
          </View>

          <Pressable style={styles.cancelBtn} onPress={handleClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    backgroundColor: "#1F2937",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#4B5563",
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F9FAFB",
    marginBottom: 16,
  },
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#374151",
    borderRadius: 12,
    padding: 14,
  },
  scanIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#3B82F6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  scanTextGroup: { flex: 1 },
  scanTitle: { fontSize: 15, fontWeight: "600", color: "#F9FAFB" },
  scanSub: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 14,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#374151" },
  dividerText: {
    fontSize: 12,
    color: "#6B7280",
    marginHorizontal: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  textInput: {
    flex: 1,
    height: 44,
    backgroundColor: "#111827",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#374151",
    paddingHorizontal: 12,
    fontSize: 15,
    color: "#F9FAFB",
  },
  lookupBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#3B82F6",
    justifyContent: "center",
    alignItems: "center",
  },
  lookupBtnDisabled: { opacity: 0.5 },
  cancelBtn: {
    marginTop: 20,
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  cancelText: { fontSize: 15, color: "#9CA3AF", fontWeight: "500" },
});
