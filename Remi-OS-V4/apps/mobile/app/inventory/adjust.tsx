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
  useAdjustStock,
  useFranchiseStock,
  useFranchiseAdjustStock,
} from "@technician/hooks/inventory/use-inventory";
import { UserRole, InventoryReasonCode } from "@technician/types/enums";
import type { StockLevel } from "@technician/types/api";

const REASON_CODES = [
  { value: InventoryReasonCode.ADJUSTMENT, label: "Manual Adjustment" },
  {
    value: InventoryReasonCode.CYCLE_COUNT_CORRECTION,
    label: "Cycle Count Correction",
  },
  { value: InventoryReasonCode.RECEIVE_STOCK, label: "Receive Stock" },
] as const;

export default function AdjustStockScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isFranchiseOwner = user?.role === UserRole.FRANCHISE_OWNER;

  const techStockQuery = useMyStock();
  const franchiseStockQuery = useFranchiseStock();
  const techAdjust = useAdjustStock();
  const franchiseAdjust = useFranchiseAdjustStock();

  const stock: StockLevel[] = isFranchiseOwner
    ? franchiseStockQuery.data ?? []
    : techStockQuery.data ?? [];
  const adjustStock = isFranchiseOwner ? franchiseAdjust : techAdjust;

  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(
    null
  );
  const [selectedItemIdx, setSelectedItemIdx] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("");
  const [reasonCode, setReasonCode] = useState<InventoryReasonCode>(REASON_CODES[0].value);
  const [notes, setNotes] = useState("");

  const locations = useMemo(() => {
    if (!isFranchiseOwner) return [];
    const map = new Map<number, { id: number; name: string }>();
    for (const item of stock) {
      if (!map.has(item.location_id)) {
        const techName = item.technician_name?.trim();
        const locName = item.location_name?.trim();
        map.set(item.location_id, {
          id: item.location_id,
          // 2026-05-25 — same friendly-naming policy as the
          // inventory list. Prefer tech name, then location name,
          // then a numeric fallback so the operator never sees a
          // bare ID.
          name: techName
            ? `${techName}'s Van`
            : locName && locName.length > 0
              ? locName
              : `Location #${item.location_id}`,
        });
      }
    }
    return Array.from(map.values());
  }, [stock, isFranchiseOwner]);

  const filteredStock = isFranchiseOwner
    ? stock.filter((s) => s.location_id === selectedLocationId)
    : stock;

  const selectedItem =
    selectedItemIdx != null ? filteredStock[selectedItemIdx] : null;

  const handleLocationSelect = (locId: number) => {
    setSelectedLocationId(locId);
    setSelectedItemIdx(null);
  };

  const handleSubmit = () => {
    if (!selectedItem || !quantity) {
      Alert.alert(
        "Missing Info",
        "Please select an item and enter a quantity."
      );
      return;
    }
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty === 0) {
      Alert.alert(
        "Invalid Quantity",
        "Enter a non-zero quantity (positive or negative)."
      );
      return;
    }

    const locationLabel =
      isFranchiseOwner && selectedItem.technician_name
        ? ` (${selectedItem.technician_name})`
        : "";

    Alert.alert(
      "Confirm Adjustment",
      `Adjust ${selectedItem.item_name ?? "Item"}${locationLabel} by ${qty > 0 ? "+" : ""}${qty}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () => {
            const reasonLabel =
              REASON_CODES.find((r) => r.value === reasonCode)?.label ??
              reasonCode;
            const fullNotes = notes
              ? `[${reasonLabel}] ${notes}`
              : reasonLabel;
            adjustStock.mutate(
              {
                itemId: selectedItem.item_id,
                locationId: selectedItem.location_id,
                quantityChange: qty,
                notes: fullNotes,
              },
              {
                onSuccess: () => {
                  Alert.alert("Done", "Stock adjusted successfully.");
                  router.back();
                },
                onError: () =>
                  Alert.alert("Error", "Could not adjust stock."),
              }
            );
          },
        },
      ]
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: "Stock Adjustment" }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          {isFranchiseOwner && (
            <>
              <Text style={styles.label}>Select Location</Text>
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
                        selectedLocationId === loc.id ? "#1D4ED8" : "#6B7280"
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
                  {item.on_hand} on hand
                </Text>
              </Pressable>
            ))}
            {isFranchiseOwner && selectedLocationId == null && (
              <View style={styles.selectLocationHint}>
                <Text style={styles.selectLocationHintText}>
                  Select a location first
                </Text>
              </View>
            )}
          </ScrollView>

          <Text style={styles.label}>Quantity Change</Text>
          <View style={styles.qtyRow}>
            <Pressable
              style={styles.qtyBtn}
              onPress={() => {
                const n = parseInt(quantity, 10) || 0;
                setQuantity(String(n - 1));
              }}
            >
              <MaterialIcons name="remove" size={24} color="#111827" />
            </Pressable>
            <TextInput
              style={styles.qtyInput}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#9CA3AF"
            />
            <Pressable
              style={styles.qtyBtn}
              onPress={() => {
                const n = parseInt(quantity, 10) || 0;
                setQuantity(String(n + 1));
              }}
            >
              <MaterialIcons name="add" size={24} color="#111827" />
            </Pressable>
          </View>

          <Text style={styles.label}>Reason Code</Text>
          <View style={styles.reasonRow}>
            {REASON_CODES.map((rc) => (
              <Pressable
                key={rc.value}
                style={[
                  styles.reasonChip,
                  reasonCode === rc.value && styles.reasonChipSelected,
                ]}
                onPress={() => setReasonCode(rc.value)}
              >
                <Text
                  style={[
                    styles.reasonChipText,
                    reasonCode === rc.value && styles.reasonChipTextSelected,
                  ]}
                >
                  {rc.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Reason for adjustment..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
          />

          <Pressable
            style={[
              styles.submitBtn,
              adjustStock.isPending && styles.submitBtnDisabled,
            ]}
            onPress={handleSubmit}
            disabled={adjustStock.isPending}
          >
            <Text style={styles.submitBtnText}>
              {adjustStock.isPending ? "Saving..." : "Submit Adjustment"}
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
    borderColor: "#3B82F6",
    backgroundColor: "#EFF6FF",
  },
  locationChipText: { fontSize: 14, fontWeight: "600", color: "#374151" },
  locationChipTextSelected: { color: "#1D4ED8" },
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
  itemChipSelected: { borderColor: "#3B82F6", backgroundColor: "#EFF6FF" },
  itemChipText: { fontSize: 14, fontWeight: "600", color: "#374151" },
  itemChipTextSelected: { color: "#1D4ED8" },
  itemChipQty: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  selectLocationHint: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: "center",
  },
  selectLocationHintText: {
    fontSize: 13,
    color: "#9CA3AF",
    fontStyle: "italic",
  },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  qtyBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyInput: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },
  reasonRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reasonChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  reasonChipSelected: { borderColor: "#3B82F6", backgroundColor: "#EFF6FF" },
  reasonChipText: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  reasonChipTextSelected: { color: "#1D4ED8" },
  notesInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#111827",
    minHeight: 80,
    textAlignVertical: "top",
  },
  submitBtn: {
    backgroundColor: "#3B82F6",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 28,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
