import { useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useAuthStore } from "@/src/stores/auth";
import {
  useMyStock,
  useFranchiseStock,
  useTransferStock,
} from "@technician/hooks/inventory/use-inventory";
import { extractErrorMessage } from "@technician/api/errors";
import { UserRole } from "@technician/types/enums";
import type { StockLevel } from "@technician/types/api";

export default function TransferScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isFranchiseOwner = user?.role === UserRole.FRANCHISE_OWNER;

  const techStockQuery = useMyStock();
  const franchiseStockQuery = useFranchiseStock();
  const transfer = useTransferStock();

  const allStock: StockLevel[] = isFranchiseOwner
    ? franchiseStockQuery.data ?? []
    : techStockQuery.data ?? [];

  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(
    null
  );
  const [destLocationId, setDestLocationId] = useState<number | null>(null);
  const [selectedItemIdx, setSelectedItemIdx] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");

  const locations = useMemo(() => {
    if (!isFranchiseOwner) return [];
    const map = new Map<number, { id: number; name: string }>();
    for (const item of allStock) {
      if (!map.has(item.location_id)) {
        const techName = item.technician_name?.trim();
        const locName = item.location_name?.trim();
        map.set(item.location_id, {
          id: item.location_id,
          // 2026-05-25 — friendly-naming policy (matches inventory
          // list + adjust screen): tech name → location name →
          // numeric fallback.
          name: techName
            ? `${techName}'s Van`
            : locName && locName.length > 0
              ? locName
              : `Location #${item.location_id}`,
        });
      }
    }
    return Array.from(map.values());
  }, [allStock, isFranchiseOwner]);

  const filteredStock = isFranchiseOwner
    ? allStock.filter((s) => s.location_id === selectedLocationId)
    : allStock;

  const selectedItem =
    selectedItemIdx != null ? filteredStock[selectedItemIdx] : null;

  const handleLocationSelect = (locId: number) => {
    setSelectedLocationId(locId);
    setDestLocationId(null);
    setSelectedItemIdx(null);
  };

  const destLocations = useMemo(
    () => locations.filter((l) => l.id !== selectedLocationId),
    [locations, selectedLocationId]
  );

  const handleSubmit = () => {
    if (!selectedItem || !quantity) {
      Alert.alert("Missing Info", "Select an item and enter a quantity.");
      return;
    }
    if (isFranchiseOwner && !destLocationId) {
      Alert.alert("Missing Info", "Select a destination location.");
      return;
    }
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert("Invalid", "Enter a positive quantity.");
      return;
    }
    if (qty > selectedItem.available) {
      Alert.alert(
        "Insufficient Stock",
        `Only ${selectedItem.available} available.`
      );
      return;
    }

    const fromLabel =
      isFranchiseOwner && selectedItem.technician_name
        ? selectedItem.technician_name
        : "your van";
    const destLoc = locations.find((l) => l.id === destLocationId);
    const toLabel = destLoc ? destLoc.name : "warehouse";

    Alert.alert(
      "Confirm Transfer",
      `Transfer ${qty} × ${selectedItem.item_name ?? "item"} from ${fromLabel} to ${toLabel}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Transfer",
          onPress: () => {
            transfer.mutate(
              {
                itemId: selectedItem.item_id,
                fromLocationId: selectedItem.location_id,
                toLocationId: destLocationId ?? selectedItem.location_id,
                quantity: qty,
                notes: notes || undefined,
              },
              {
                onSuccess: () => {
                  Alert.alert("Done", "Stock transferred successfully.");
                  router.back();
                },
                onError: (err) =>
                  Alert.alert("Error", extractErrorMessage(err)),
              }
            );
          },
        },
      ]
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: "Transfer Stock" }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.directionCard}>
            <View style={styles.directionSide}>
              <MaterialIcons
                name="local-shipping"
                size={28}
                color="#3B82F6"
              />
              <Text style={styles.directionLabel}>
                {selectedLocationId
                  ? locations.find((l) => l.id === selectedLocationId)?.name ?? "Van"
                  : "Van"}
              </Text>
            </View>
            <MaterialIcons name="arrow-forward" size={24} color="#9CA3AF" />
            <View style={styles.directionSide}>
              <MaterialIcons name="local-shipping" size={28} color="#8B5CF6" />
              <Text style={styles.directionLabel}>
                {destLocationId
                  ? locations.find((l) => l.id === destLocationId)?.name ?? "Destination"
                  : "Destination"}
              </Text>
            </View>
          </View>

          {isFranchiseOwner && (
            <>
              <Text style={styles.label}>Select Van</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.itemScroll}
              >
                {locations.map((loc) => (
                  <Pressable
                    key={loc.id}
                    style={[
                      styles.locationChip,
                      selectedLocationId === loc.id &&
                        styles.locationChipSelected,
                    ]}
                    onPress={() => handleLocationSelect(loc.id)}
                  >
                    <MaterialIcons
                      name="local-shipping"
                      size={16}
                      color={
                        selectedLocationId === loc.id ? "#6D28D9" : "#6B7280"
                      }
                    />
                    <Text
                      style={[
                        styles.locationChipText,
                        selectedLocationId === loc.id &&
                          styles.locationChipTextSelected,
                      ]}
                    >
                      {loc.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}

          {isFranchiseOwner && selectedLocationId != null && (
            <>
              <Text style={styles.label}>Destination</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.itemScroll}
              >
                {destLocations.map((loc) => (
                  <Pressable
                    key={loc.id}
                    style={[
                      styles.locationChip,
                      destLocationId === loc.id &&
                        styles.locationChipSelected,
                    ]}
                    onPress={() => setDestLocationId(loc.id)}
                  >
                    <MaterialIcons
                      name="local-shipping"
                      size={16}
                      color={
                        destLocationId === loc.id ? "#6D28D9" : "#6B7280"
                      }
                    />
                    <Text
                      style={[
                        styles.locationChipText,
                        destLocationId === loc.id &&
                          styles.locationChipTextSelected,
                      ]}
                    >
                      {loc.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}

          <Text style={styles.label}>Select Item</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.itemScroll}
          >
            {filteredStock.map((item, idx) => (
              <Pressable
                key={`${item.item_id}-${item.location_id}`}
                style={[
                  styles.itemChip,
                  selectedItemIdx === idx && styles.itemChipSelected,
                ]}
                onPress={() => setSelectedItemIdx(idx)}
              >
                <Text
                  style={[
                    styles.itemChipText,
                    selectedItemIdx === idx && styles.itemChipTextSelected,
                  ]}
                >
                  {item.item_name ?? `#${item.item_id}`}
                </Text>
                <Text style={styles.itemChipQty}>
                  {item.available} available
                </Text>
              </Pressable>
            ))}
            {isFranchiseOwner && selectedLocationId == null && (
              <View style={styles.selectHint}>
                <Text style={styles.selectHintText}>
                  Select a van first
                </Text>
              </View>
            )}
          </ScrollView>

          <Text style={styles.label}>Quantity</Text>
          <TextInput
            style={styles.input}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="numeric"
            placeholder="Enter quantity"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Transfer notes..."
            placeholderTextColor="#9CA3AF"
            multiline
          />

          <Pressable
            style={[
              styles.submitBtn,
              transfer.isPending && { opacity: 0.6 },
            ]}
            onPress={handleSubmit}
            disabled={transfer.isPending}
          >
            <Text style={styles.submitBtnText}>
              {transfer.isPending ? "Transferring..." : "Transfer Stock"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 20, paddingBottom: 40 },
  directionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 16,
    gap: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  directionSide: { alignItems: "center", gap: 6 },
  directionLabel: { fontSize: 14, fontWeight: "700", color: "#374151" },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
    marginTop: 20,
    marginBottom: 10,
  },
  itemScroll: { flexGrow: 0 },
  locationChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    marginRight: 8,
  },
  locationChipSelected: {
    borderColor: "#8B5CF6",
    backgroundColor: "#F5F3FF",
  },
  locationChipText: { fontSize: 14, fontWeight: "600", color: "#374151" },
  locationChipTextSelected: { color: "#6D28D9" },
  itemChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    marginRight: 8,
    minWidth: 100,
  },
  itemChipSelected: { borderColor: "#8B5CF6", backgroundColor: "#F5F3FF" },
  itemChipText: { fontSize: 14, fontWeight: "600", color: "#374151" },
  itemChipTextSelected: { color: "#6D28D9" },
  itemChipQty: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  selectHint: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: "center",
  },
  selectHintText: {
    fontSize: 13,
    color: "#9CA3AF",
    fontStyle: "italic",
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: "#111827",
  },
  submitBtn: {
    backgroundColor: "#8B5CF6",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 28,
  },
  submitBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
