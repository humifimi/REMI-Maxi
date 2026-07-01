import { useState } from "react";
import { StyleSheet, View, Text, Pressable, ActivityIndicator } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  SeverityColorMap,
  SeverityLabels,
  ObservationTypeLabels,
  DeferredStatusColorMap,
  DeferredStatusLabels,
} from "@technician/constants/colors";
import type { DeferredWorkItem } from "@technician/types/api";

interface DeferredServicesCardProps {
  items: DeferredWorkItem[];
  showActions?: boolean;
  isFleetCustomer?: boolean;
  onRecommendToCustomer?: (itemIds: number[]) => Promise<void>;
  onAddToFleetQueue?: (itemIds: number[]) => Promise<void>;
  showStatusBadge?: boolean;
}

export function DeferredServicesCard({
  items,
  showActions = false,
  isFleetCustomer = false,
  onRecommendToCustomer,
  onAddToFleetQueue,
  showStatusBadge = false,
}: DeferredServicesCardProps) {
  const [recommendSent, setRecommendSent] = useState(false);
  const [fleetQueued, setFleetQueued] = useState(false);
  const [loading, setLoading] = useState<"recommend" | "fleet" | null>(null);

  if (items.length === 0) return null;

  const handleRecommend = async () => {
    if (!onRecommendToCustomer || recommendSent) return;
    setLoading("recommend");
    try {
      await onRecommendToCustomer(items.map((i) => i.id));
      setRecommendSent(true);
    } finally {
      setLoading(null);
    }
  };

  const handleFleetQueue = async () => {
    if (!onAddToFleetQueue || fleetQueued) return;
    setLoading("fleet");
    try {
      await onAddToFleetQueue(items.map((i) => i.id));
      setFleetQueued(true);
    } finally {
      setLoading(null);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <MaterialIcons name="assignment-late" size={20} color="#F97316" />
        <Text style={styles.title}>Deferred Services Observed</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{items.length}</Text>
        </View>
      </View>

      {items.map((item) => {
        const severityColor = SeverityColorMap[item.severity] ?? "#6B7280";
        const statusColor = DeferredStatusColorMap[item.status] ?? "#6B7280";
        return (
          <View key={item.id} style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>
                {ObservationTypeLabels[item.observation_type] ??
                  item.observation_type}
              </Text>
              {item.service_name ? (
                <Text style={styles.itemService}>{item.service_name}</Text>
              ) : null}
            </View>
            <View style={styles.itemBadges}>
              <View
                style={[
                  styles.severityBadge,
                  { backgroundColor: severityColor + "20" },
                ]}
              >
                <Text style={[styles.severityText, { color: severityColor }]}>
                  {SeverityLabels[item.severity] ?? item.severity}
                </Text>
              </View>
              {showStatusBadge ? (
                <View
                  style={[
                    styles.severityBadge,
                    { backgroundColor: statusColor + "20" },
                  ]}
                >
                  <Text style={[styles.severityText, { color: statusColor }]}>
                    {DeferredStatusLabels[item.status] ?? item.status}
                  </Text>
                </View>
              ) : null}
            </View>
            {item.estimated_cost != null && item.estimated_cost > 0 ? (
              <Text style={styles.itemCost}>
                ${Number(item.estimated_cost).toFixed(2)}
              </Text>
            ) : null}
          </View>
        );
      })}

      {showActions ? (
        <View style={styles.actions}>
          <Pressable
            style={[
              styles.actionBtn,
              styles.recommendBtn,
              recommendSent && styles.actionBtnDone,
            ]}
            onPress={handleRecommend}
            disabled={loading !== null || recommendSent}
          >
            {loading === "recommend" ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : recommendSent ? (
              <>
                <MaterialIcons name="check" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>Sent</Text>
              </>
            ) : (
              <>
                <MaterialIcons name="send" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>Recommend to Customer</Text>
              </>
            )}
          </Pressable>

          {isFleetCustomer ? (
            <Pressable
              style={[
                styles.actionBtn,
                styles.fleetBtn,
                fleetQueued && styles.actionBtnDone,
              ]}
              onPress={handleFleetQueue}
              disabled={loading !== null || fleetQueued}
            >
              {loading === "fleet" ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : fleetQueued ? (
                <>
                  <MaterialIcons name="check" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>Added</Text>
                </>
              ) : (
                <>
                  <MaterialIcons name="local-shipping" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>Add to Fleet Queue</Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFF7ED",
    borderRadius: 12,
    padding: 16,
    width: "100%",
    borderWidth: 1,
    borderColor: "#FDBA74",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  title: { flex: 1, fontSize: 16, fontWeight: "700", color: "#9A3412" },
  countBadge: {
    backgroundColor: "#F97316",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    gap: 8,
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: "600", color: "#111827" },
  itemService: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  itemBadges: { flexDirection: "row", gap: 4 },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  severityText: { fontSize: 11, fontWeight: "700" },
  itemCost: { fontSize: 13, fontWeight: "600", color: "#374151", minWidth: 50, textAlign: "right" },
  actions: { marginTop: 10, gap: 8 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  recommendBtn: { backgroundColor: "#3B82F6" },
  fleetBtn: { backgroundColor: "#8B5CF6" },
  actionBtnDone: { backgroundColor: "#22C55E" },
  actionBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
