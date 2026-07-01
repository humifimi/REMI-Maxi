import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

interface Props {
  visible: boolean;
  initialName?: string | null;
  isUpdate: boolean;
  isSaving: boolean;
  onSave: (name: string) => void;
  onClose: () => void;
}

/**
 * Modal that asks the technician to name (or rename) the scenario before
 * persisting it server-side. `name` is required for authenticated saves —
 * the backend rejects empty strings with a 422 — so we enforce it client-side
 * to avoid a round-trip.
 */
export function SaveScenarioModal({
  visible,
  initialName,
  isUpdate,
  isSaving,
  onSave,
  onClose,
}: Props) {
  const [name, setName] = useState(initialName ?? "");

  useEffect(() => {
    if (visible) setName(initialName ?? "");
  }, [visible, initialName]);

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && !isSaving;

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <MaterialIcons name="bookmark-add" size={20} color="#3B82F6" />
            <Text style={styles.title}>
              {isUpdate ? "Update scenario" : "Save scenario"}
            </Text>
          </View>
          <Text style={styles.subtitle}>
            Give it a name so you can find it later in My Scenarios.
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Year 1 baseline"
            placeholderTextColor="#9CA3AF"
            autoFocus
            maxLength={80}
            style={styles.input}
            returnKeyType="done"
            onSubmitEditing={() => canSave && onSave(trimmed)}
          />
          <View style={styles.actions}>
            <Pressable style={styles.secondary} onPress={onClose}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.primary, !canSave && styles.primaryDisabled]}
              disabled={!canSave}
              onPress={() => onSave(trimmed)}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryText}>
                  {isUpdate ? "Update" : "Save"}
                </Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 16, fontWeight: "700", color: "#111827" },
  subtitle: { fontSize: 13, color: "#6B7280", lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
  },
  actions: { flexDirection: "row", gap: 8, marginTop: 4 },
  secondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: "#6B7280", fontWeight: "700", fontSize: 14 },
  primary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryDisabled: { backgroundColor: "#9CA3AF" },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
