import { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { useRequestTransfer } from "@technician/hooks/inventory/use-substitution";
import type { StockCheckResult, SubstitutePart } from "@technician/types/api";

interface SubstitutionSheetProps {
  visible: boolean;
  items: StockCheckResult[];
  onDismiss: () => void;
}

const STATUS_CONFIG = {
  in_stock: { label: "In Stock", color: "#22C55E", bg: "#F0FDF4" },
  low: { label: "Low Stock", color: "#EAB308", bg: "#FEFCE8" },
  out_of_stock: { label: "Out of Stock", color: "#EF4444", bg: "#FEF2F2" },
} as const;

function SubstituteRow({
  sub,
  originalItemId,
}: {
  sub: SubstitutePart;
  originalItemId: number;
}) {
  const requestTransfer = useRequestTransfer();
  const [requested, setRequested] = useState(false);

  const handlePullFromHQ = () => {
    haptic.medium();
    Alert.alert(
      "Request Transfer",
      `Pull ${sub.item_name} from ${sub.location_name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Request",
          onPress: () => {
            requestTransfer.mutate(
              {
                item_id: sub.item_id,
                quantity: sub.available_quantity,
                from_location_id: sub.location_id,
                reason: `Substitute for item #${originalItemId}`,
              },
              {
                onSuccess: () => {
                  setRequested(true);
                  haptic.success();
                },
                onError: () => {
                  Alert.alert("Error", "Could not create transfer request.");
                },
              }
            );
          },
        },
      ]
    );
  };

  return (
    <View style={styles.subRow}>
      <View style={styles.subInfo}>
        <Text style={styles.subName}>{sub.item_name}</Text>
        <Text style={styles.subSku}>{sub.item_sku}</Text>
        {sub.compatibility_note && (
          <Text style={styles.subNote}>{sub.compatibility_note}</Text>
        )}
        <View style={styles.subMeta}>
          <View style={styles.subMetaItem}>
            <MaterialIcons name="inventory-2" size={12} color="#6B7280" />
            <Text style={styles.subMetaText}>
              {sub.available_quantity} at {sub.location_name}
            </Text>
          </View>
          {sub.price_difference !== 0 && (
            <Text
              style={[
                styles.priceDiff,
                {
                  color:
                    sub.price_difference > 0 ? "#EF4444" : "#22C55E",
                },
              ]}
            >
              {sub.price_difference > 0 ? "+" : ""}$
              {Math.abs(sub.price_difference).toFixed(2)}
            </Text>
          )}
        </View>
      </View>
      {requested ? (
        <View style={styles.requestedBadge}>
          <MaterialIcons name="check" size={14} color="#22C55E" />
          <Text style={styles.requestedText}>Requested</Text>
        </View>
      ) : (
        <Pressable
          style={styles.pullBtn}
          onPress={handlePullFromHQ}
          disabled={requestTransfer.isPending}
        >
          <MaterialIcons name="local-shipping" size={14} color="#fff" />
          <Text style={styles.pullBtnText}>Pull</Text>
        </Pressable>
      )}
    </View>
  );
}

function StockItemCard({
  item,
  onViewInventory,
}: {
  item: StockCheckResult;
  onViewInventory?: () => void;
}) {
  const config = STATUS_CONFIG[item.status];
  const [expanded, setExpanded] = useState(item.status === "out_of_stock");

  return (
    <View style={[styles.itemCard, { borderLeftColor: config.color }]}>
      <Pressable
        style={styles.itemHeader}
        onPress={() => setExpanded(!expanded)}
      >
        <View style={styles.itemHeaderLeft}>
          <Text style={styles.itemName}>{item.item_name}</Text>
          <Text style={styles.itemSku}>{item.item_sku}</Text>
        </View>
        <View style={styles.itemHeaderRight}>
          <View style={[styles.statusPill, { backgroundColor: config.bg }]}>
            <Text style={[styles.statusText, { color: config.color }]}>
              {config.label}
            </Text>
          </View>
          <Text style={styles.stockQty}>
            {item.available_quantity}/{item.required_quantity}
          </Text>
        </View>
      </Pressable>

      {expanded && item.substitutes.length > 0 && (
        <View style={styles.subsContainer}>
          <Text style={styles.subsTitle}>Substitutes Available</Text>
          {item.substitutes.map((sub) => (
            <SubstituteRow
              key={sub.item_id}
              sub={sub}
              originalItemId={item.item_id}
            />
          ))}
        </View>
      )}

      {expanded && item.substitutes.length === 0 && (
        <View style={styles.noSubsContainer}>
          <MaterialIcons name="info-outline" size={16} color="#9CA3AF" />
          <Text style={styles.noSubsText}>No substitutes available</Text>
          {onViewInventory && (
            <Pressable style={styles.viewInventoryBtn} onPress={onViewInventory}>
              <MaterialIcons name="inventory-2" size={14} color="#3B82F6" />
              <Text style={styles.viewInventoryText}>View in Inventory</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

export function SubstitutionSheet({
  visible,
  items,
  onDismiss,
}: SubstitutionSheetProps) {
  const router = useRouter();
  const issueItems = items.filter((i) => i.status !== "in_stock");
  const okItems = items.filter((i) => i.status === "in_stock");

  const handleViewInventory = () => {
    onDismiss();
    setTimeout(() => router.push("/inventory"), 300);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View style={styles.sheetContainer}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Stock Check</Text>
          <Pressable onPress={onDismiss} hitSlop={8}>
            <MaterialIcons name="close" size={24} color="#6B7280" />
          </Pressable>
        </View>

        <ScrollView style={styles.sheetContent}>
          {issueItems.length > 0 && (
            <View style={styles.sheetSection}>
              <Text style={styles.sheetSectionTitle}>
                Needs Attention ({issueItems.length})
              </Text>
              {issueItems.map((item) => (
                <StockItemCard
                  key={item.item_id}
                  item={item}
                  onViewInventory={handleViewInventory}
                />
              ))}
            </View>
          )}

          {okItems.length > 0 && (
            <View style={styles.sheetSection}>
              <Text style={styles.sheetSectionTitle}>
                Ready ({okItems.length})
              </Text>
              {okItems.map((item) => (
                <StockItemCard key={item.item_id} item={item} />
              ))}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetContainer: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  sheetContent: {
    flex: 1,
    padding: 16,
  },
  sheetSection: {
    marginBottom: 24,
  },
  sheetSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },

  // Stock item card
  itemCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderLeftWidth: 4,
    marginBottom: 10,
    overflow: "hidden",
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
  },
  itemHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  itemName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  itemSku: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
  },
  itemHeaderRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  stockQty: {
    fontSize: 12,
    color: "#6B7280",
    fontVariant: ["tabular-nums"],
  },

  // Substitutes
  subsContainer: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 10,
  },
  subsTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
  },
  subInfo: {
    flex: 1,
    marginRight: 10,
  },
  subName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  subSku: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 1,
  },
  subNote: {
    fontSize: 12,
    color: "#6B7280",
    fontStyle: "italic",
    marginTop: 2,
  },
  subMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  subMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  subMetaText: {
    fontSize: 11,
    color: "#6B7280",
  },
  priceDiff: {
    fontSize: 12,
    fontWeight: "700",
  },
  pullBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#3B82F6",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 44,
  },
  pullBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  requestedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  requestedText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#22C55E",
  },
  noSubsContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  noSubsText: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  viewInventoryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    backgroundColor: "#EFF6FF",
    minHeight: 36,
    width: "100%",
    justifyContent: "center",
  },
  viewInventoryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3B82F6",
  },
});
