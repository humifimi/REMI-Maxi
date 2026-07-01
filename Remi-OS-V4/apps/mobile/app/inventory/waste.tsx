import { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  Alert,
  RefreshControl,
  Modal,
} from "react-native";
import { Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useAuthStore } from "@/src/stores/auth";
import {
  useWasteStatus,
  useFranchiseAllWaste,
  useRecordWaste,
} from "@technician/hooks/inventory/use-inventory";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";
import { UserRole } from "@technician/types/enums";
import type { WasteContainer } from "@technician/types/api";

// 2026-05-25 — Map raw enum/slug waste types ("used_oil",
// "coolant", "transmission_fluid", etc.) to plain-English labels.
// Falls back to a title-cased version of the slug for any type
// that hasn't been mapped yet so a new container type still
// renders readable text instead of `used_oil`.
const WASTE_TYPE_LABELS: Record<string, string> = {
  used_oil: "Used Oil",
  coolant: "Coolant",
  transmission_fluid: "Transmission Fluid",
  brake_fluid: "Brake Fluid",
  oil_filter: "Used Oil Filters",
};

function wasteTypeLabel(raw: string | null | undefined): string {
  if (!raw) return "Waste Container";
  const known = WASTE_TYPE_LABELS[raw];
  if (known) return known;
  return raw
    .split("_")
    .map((tok) => tok.charAt(0).toUpperCase() + tok.slice(1))
    .join(" ");
}

// 2026-05-25 — Friendly location label, mirrors the policy used
// on the inventory list / adjust / transfer screens.
function locationLabel(item: {
  location_name?: string | null;
  technician_name?: string | null;
  location_id: number;
}): string {
  const techName = item.technician_name?.trim();
  const locName = item.location_name?.trim();
  if (techName) return `${techName}'s Van`;
  if (locName && locName.length > 0) return locName;
  return `Location #${item.location_id}`;
}

export default function WasteScreen() {
  const user = useAuthStore((s) => s.user);
  const isFranchiseOwner = user?.role === UserRole.FRANCHISE_OWNER;

  const techQuery = useWasteStatus();
  const franchiseQuery = useFranchiseAllWaste();

  const activeQuery = isFranchiseOwner ? franchiseQuery : techQuery;
  const containers = activeQuery.data ?? [];
  const { isLoading, isRefetching, isError, refetch } = activeQuery;

  const recordWaste = useRecordWaste();
  const [modalContainer, setModalContainer] = useState<WasteContainer | null>(
    null
  );
  const [liters, setLiters] = useState("");

  if (isLoading && !isRefetching && !isError) return <SkeletonListScreen />;

  const handleRecord = () => {
    if (!modalContainer || !liters) return;
    const amount = parseFloat(liters);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid", "Enter a positive amount.");
      return;
    }

    recordWaste.mutate(
      {
        locationId: modalContainer.location_id,
        wasteType: modalContainer.type,
        liters: amount,
      },
      {
        onSuccess: () => {
          Alert.alert("Recorded", `${amount}L waste added.`);
          setModalContainer(null);
          setLiters("");
        },
        onError: () => Alert.alert("Error", "Could not record waste."),
      }
    );
  };

  const renderItem = ({ item }: { item: WasteContainer }) => {
    const current = Number(item.current_level_liters) || 0;
    const capacity = Number(item.capacity_liters) || 1;
    const warningPct = Number(item.warning_threshold_pct) || 75;
    const criticalPct = Number(item.critical_threshold_pct) || 90;
    const pct = (current / capacity) * 100;
    const isCritical = pct >= criticalPct;
    const isWarning = pct >= warningPct;
    const color = isCritical ? "#EF4444" : isWarning ? "#EAB308" : "#22C55E";

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <MaterialIcons
            name={
              isCritical ? "error" : isWarning ? "warning" : "check-circle"
            }
            size={20}
            color={color}
          />
          <Text style={styles.containerType}>{wasteTypeLabel(item.type)}</Text>
          <Text style={[styles.pctText, { color }]}>{pct.toFixed(0)}%</Text>
        </View>

        {isFranchiseOwner ? (
          <View style={styles.locationRow}>
            <MaterialIcons name="local-shipping" size={14} color="#6B7280" />
            <Text style={styles.locationText}>{locationLabel(item)}</Text>
          </View>
        ) : null}

        <View style={styles.barContainer}>
          <View
            style={[
              styles.barFill,
              {
                width: `${Math.min(pct, 100)}%`,
                backgroundColor: color,
              },
            ]}
          />
          {warningPct < 100 ? (
            <View style={[styles.threshold, { left: `${warningPct}%` }]} />
          ) : null}
          {criticalPct < 100 ? (
            <View
              style={[
                styles.threshold,
                { left: `${criticalPct}%`, backgroundColor: "#EF4444" },
              ]}
            />
          ) : null}
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.levelText}>
            {current.toFixed(1)}L / {capacity}L
          </Text>
          <Pressable
            style={styles.recordBtn}
            onPress={() => {
              setModalContainer(item);
              setLiters("");
            }}
          >
            <MaterialIcons name="add" size={16} color="#fff" />
            <Text style={styles.recordBtnText}>Record Waste</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: "Waste Tracking" }} />
      <View style={styles.container}>
        <FlatList
          data={containers}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialIcons
                name="delete-outline"
                size={48}
                color="#D1D5DB"
              />
              <Text style={styles.emptyTitle}>No waste containers</Text>
            </View>
          }
        />

        <Modal visible={!!modalContainer} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                Record Waste — {wasteTypeLabel(modalContainer?.type)}
              </Text>
              {modalContainer ? (
                <Text style={styles.modalLocation}>
                  {locationLabel(modalContainer)}
                </Text>
              ) : null}
              <TextInput
                style={styles.modalInput}
                value={liters}
                onChangeText={setLiters}
                keyboardType="decimal-pad"
                placeholder="Liters added"
                placeholderTextColor="#9CA3AF"
                autoFocus
              />
              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalCancel}
                  onPress={() => setModalContainer(null)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalConfirm,
                    recordWaste.isPending && { opacity: 0.6 },
                  ]}
                  onPress={handleRecord}
                  disabled={recordWaste.isPending}
                >
                  <Text style={styles.modalConfirmText}>
                    {recordWaste.isPending ? "Saving..." : "Record"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  list: { padding: 16, paddingBottom: 24 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  containerType: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
  },
  pctText: { fontSize: 18, fontWeight: "800" },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 10,
  },
  locationText: { fontSize: 12, color: "#6B7280", fontWeight: "500" },
  barContainer: {
    height: 14,
    backgroundColor: "#E5E7EB",
    borderRadius: 7,
    overflow: "hidden",
    position: "relative",
  },
  barFill: { height: "100%", borderRadius: 7 },
  threshold: {
    position: "absolute",
    top: 0,
    width: 2,
    height: "100%",
    backgroundColor: "#F59E0B",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  levelText: { fontSize: 13, color: "#6B7280", fontWeight: "500" },
  recordBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#3B82F6",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  recordBtnText: { fontSize: 13, fontWeight: "600", color: "#fff" },
  empty: { alignItems: "center", paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#374151" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  modalLocation: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 14,
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
  },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  modalCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  modalCancelText: { fontSize: 16, fontWeight: "600", color: "#6B7280" },
  modalConfirm: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#3B82F6",
    alignItems: "center",
  },
  modalConfirmText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
