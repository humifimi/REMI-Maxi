import { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  useShuttleOrder,
  useShuttleStatusLog,
  useAssignShuttleDriver,
  useShuttlePickup,
  useShuttleDeliver,
  useShopComplete,
  useShuttleReturnPickup,
  useShuttleComplete,
  useCancelShuttleOrder,
} from "@technician/hooks/operations/use-shuttle";
import { useCurrentLocation } from "@technician/hooks/utility/use-location";
import {
  ShuttleStatusColorMap,
  ShuttleStatusLabels,
  ShuttlePriorityColorMap,
  ShuttlePriorityLabels,
} from "@technician/constants/colors";
import { extractErrorMessage } from "@technician/api/errors";
import type { ShuttleOrder } from "@technician/types/api";
import type { ShuttleStatus, ShopServiceStatus } from "@technician/types/enums";

const STATUS_ORDER: ShuttleStatus[] = [
  "created",
  "assigned",
  "in_transit",
  "in_service",
  "returning",
  "completed",
];

const STATUS_ICONS: Record<
  ShuttleStatus,
  keyof typeof MaterialIcons.glyphMap
> = {
  identified: "search",
  created: "add-circle",
  assigned: "person-add",
  in_transit: "local-shipping",
  in_service: "build",
  returning: "undo",
  completed: "check-circle",
  cancelled: "cancel",
};

export default function ShuttleDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const id = parseInt(orderId, 10) || 0;

  const { data: order, isLoading } = useShuttleOrder(id);
  const { data: statusLog = [] } = useShuttleStatusLog(id);

  const location = useCurrentLocation();

  const assignDriver = useAssignShuttleDriver();
  const pickup = useShuttlePickup();
  const deliver = useShuttleDeliver();
  const shopComplete = useShopComplete();
  const returnPickup = useShuttleReturnPickup();
  const complete = useShuttleComplete();
  const cancel = useCancelShuttleOrder();

  const [acting, setActing] = useState(false);

  if (isLoading || !order) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  const vehicleLabel =
    [order.vehicle_year, order.vehicle_make, order.vehicle_model]
      .filter(Boolean)
      .join(" ") || `Vehicle #${order.vehicle_id}`;

  const statusColor = ShuttleStatusColorMap[order.status];
  const currentIndex = STATUS_ORDER.indexOf(order.status);
  const isTerminal = order.status === "completed" || order.status === "cancelled";

  const nextAction = getNextAction(order.status, order.shop_service_status);
  const canCancel =
    order.status === "created" ||
    order.status === "assigned" ||
    order.status === "in_transit";

  const navDestination = getNavDestination(order);

  async function handleAction() {
    if (!nextAction || acting) return;
    setActing(true);
    try {
      const coords = { lat: location?.lat, lng: location?.lng };
      switch (nextAction.action) {
        case "assign":
          await assignDriver.mutateAsync({ id, driverUserId: order!.created_by ?? 0 });
          break;
        case "pickup":
          await pickup.mutateAsync({ id, ...coords });
          break;
        case "deliver":
          await deliver.mutateAsync({ id, ...coords });
          break;
        case "shop-complete":
          await shopComplete.mutateAsync({ id });
          break;
        case "return-pickup":
          await returnPickup.mutateAsync({ id, ...coords });
          break;
        case "complete":
          await complete.mutateAsync({ id, ...coords });
          break;
      }
      queryClient.setQueryData<ShuttleOrder>(
        ["shuttle", "order", id],
        (prev) => {
          if (!prev) return prev;
          switch (nextAction.action) {
            case "assign":
              return { ...prev, status: "assigned" as const };
            case "pickup":
              return { ...prev, status: "in_transit" as const };
            case "deliver":
              return { ...prev, status: "in_service" as const, shop_service_status: "pending" as const };
            case "shop-complete":
              return { ...prev, shop_service_status: "completed" as const };
            case "return-pickup":
              return { ...prev, status: "returning" as const };
            case "complete":
              return { ...prev, status: "completed" as const };
            default:
              return prev;
          }
        }
      );
    } catch (err) {
      const msg = extractErrorMessage(err);
      Alert.alert(
        `${nextAction.label} Failed`,
        `${msg}\n\nThe order may have been updated elsewhere. Pull down to refresh and try again.`,
        [
          { text: "OK" },
          {
            text: "Refresh",
            onPress: () => {
              queryClient.invalidateQueries({ queryKey: ["shuttle", "order", id] });
              queryClient.invalidateQueries({ queryKey: ["shuttle", "status-log", id] });
            },
          },
        ]
      );
    } finally {
      setActing(false);
    }
  }

  function handleCancel() {
    Alert.alert("Cancel Shuttle Order", "Are you sure?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes, Cancel",
        style: "destructive",
        onPress: async () => {
          try {
            await cancel.mutateAsync({ id, reason: "Cancelled by user" });
            router.back();
          } catch (err) {
            Alert.alert("Error", extractErrorMessage(err));
          }
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: `Shuttle #${order.id}`,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={[styles.statusHeader, { backgroundColor: statusColor + "10" }]}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
            <MaterialIcons
              name={STATUS_ICONS[order.status]}
              size={20}
              color={statusColor}
            />
            <Text style={[styles.statusLabel, { color: statusColor }]}>
              {ShuttleStatusLabels[order.status]}
            </Text>
          </View>
          <View style={[styles.priorityPill, { backgroundColor: ShuttlePriorityColorMap[order.priority] + "15" }]}>
            <Text style={[styles.priorityPillText, { color: ShuttlePriorityColorMap[order.priority] }]}>
              {ShuttlePriorityLabels[order.priority]}
            </Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <InfoRow label="Vehicle" value={vehicleLabel} />
          {order.vehicle_license_plate && (
            <InfoRow label="Plate" value={order.vehicle_license_plate} />
          )}
          {order.fleet_company_name && (
            <InfoRow label="Fleet" value={order.fleet_company_name} />
          )}
          {order.partner_name && (
            <InfoRow label="Shop" value={order.partner_name} />
          )}
          {order.driver_name && (
            <InfoRow label="Driver" value={order.driver_name} />
          )}
          <InfoRow label="Service" value={order.service_description} />
          {order.estimated_cost != null && (
            <InfoRow
              label="Est. Cost"
              value={`$${Number(order.estimated_cost).toFixed(2)}`}
            />
          )}
          {order.actual_cost != null && (
            <InfoRow
              label="Actual Cost"
              value={`$${Number(order.actual_cost).toFixed(2)}`}
            />
          )}
        </View>

        <Text style={styles.timelineTitle}>Status Timeline</Text>
        <View style={styles.timeline}>
          {STATUS_ORDER.map((status, i) => {
            const reached = currentIndex >= i;
            const isCurrent = order.status === status;
            const color = reached
              ? ShuttleStatusColorMap[status]
              : "#E5E7EB";
            const logEntry = statusLog.find(
              (e) => e.to_status === status
            );

            return (
              <View key={status} style={styles.timelineStep}>
                <View style={styles.timelineLeft}>
                  <View
                    style={[
                      styles.timelineDot,
                      { backgroundColor: color },
                      isCurrent && styles.timelineDotCurrent,
                    ]}
                  >
                    <MaterialIcons
                      name={STATUS_ICONS[status]}
                      size={14}
                      color={reached ? "#fff" : "#9CA3AF"}
                    />
                  </View>
                  {i < STATUS_ORDER.length - 1 && (
                    <View
                      style={[
                        styles.timelineLine,
                        {
                          backgroundColor:
                            currentIndex > i ? ShuttleStatusColorMap[STATUS_ORDER[i + 1]] : "#E5E7EB",
                        },
                      ]}
                    />
                  )}
                </View>
                <View style={styles.timelineContent}>
                  <Text
                    style={[
                      styles.timelineLabel,
                      reached && styles.timelineLabelReached,
                      isCurrent && styles.timelineLabelCurrent,
                    ]}
                  >
                    {ShuttleStatusLabels[status]}
                  </Text>
                  {logEntry && (
                    <Text style={styles.timelineTime}>
                      {new Date(logEntry.created_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Text>
                  )}
                  {logEntry?.notes && (
                    <Text style={styles.timelineNotes}>{logEntry.notes}</Text>
                  )}
                </View>
              </View>
            );
          })}

          {order.status === "cancelled" && (
            <View style={styles.timelineStep}>
              <View style={styles.timelineLeft}>
                <View
                  style={[
                    styles.timelineDot,
                    { backgroundColor: "#6B7280" },
                  ]}
                >
                  <MaterialIcons name="cancel" size={14} color="#fff" />
                </View>
              </View>
              <View style={styles.timelineContent}>
                <Text style={[styles.timelineLabel, { color: "#6B7280" }]}>
                  Cancelled
                </Text>
                {order.cancellation_reason && (
                  <Text style={styles.timelineNotes}>
                    {order.cancellation_reason}
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>

        {!isTerminal && (
          <>
            {navDestination && (
              <Pressable
                style={styles.navigateBtn}
                onPress={() => {
                  const encoded = encodeURIComponent(navDestination.address);
                  const url =
                    Platform.OS === "ios"
                      ? `comgooglemaps://?daddr=${encoded}&directionsmode=driving`
                      : `google.navigation:q=${encoded}`;
                  Linking.openURL(url).catch(() =>
                    Linking.openURL(
                      `https://maps.google.com/maps?daddr=${encoded}`
                    )
                  );
                }}
              >
                <MaterialIcons name="navigation" size={20} color="#3B82F6" />
                <Text style={styles.navigateBtnText}>
                  Navigate to {navDestination.label}
                </Text>
                <MaterialIcons
                  name="open-in-new"
                  size={14}
                  color="#93C5FD"
                />
              </Pressable>
            )}
            <View style={styles.actionRow}>
              {nextAction && (
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: nextAction.color }]}
                  onPress={handleAction}
                  disabled={acting}
                >
                  {acting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <MaterialIcons
                        name={nextAction.icon}
                        size={20}
                        color="#fff"
                      />
                      <Text style={styles.actionBtnText}>
                        {nextAction.label}
                      </Text>
                    </>
                  )}
                </Pressable>
              )}
              {canCancel && (
                <Pressable style={styles.cancelBtn} onPress={handleCancel}>
                  <MaterialIcons name="cancel" size={18} color="#EF4444" />
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function getNavDestination(
  order: ShuttleOrder
): { address: string; label: string } | null {
  switch (order.status) {
    case "assigned":
      if (order.pickup_notes) return { address: order.pickup_notes, label: "Pickup" };
      if (order.fleet_company_name) return { address: order.fleet_company_name, label: "Pickup" };
      return null;
    case "in_transit":
      if (order.destination_notes) return { address: order.destination_notes, label: "Shop" };
      if (order.partner_name) return { address: order.partner_name, label: "Shop" };
      return null;
    case "in_service":
      if (order.destination_notes) return { address: order.destination_notes, label: "Shop" };
      if (order.partner_name) return { address: order.partner_name, label: "Shop" };
      return null;
    case "returning":
      if (order.pickup_notes) return { address: order.pickup_notes, label: "Customer" };
      if (order.fleet_company_name) return { address: order.fleet_company_name, label: "Customer" };
      return null;
    default:
      return null;
  }
}

function getNextAction(
  status: ShuttleStatus,
  shopStatus: ShopServiceStatus | null
) {
  switch (status) {
    case "created":
      return {
        action: "assign" as const,
        label: "Assign & Ready",
        icon: "person-add" as const,
        color: "#6366F1",
      };
    case "assigned":
      return {
        action: "pickup" as const,
        label: "Pick Up Vehicle",
        icon: "local-shipping" as const,
        color: "#8B5CF6",
      };
    case "in_transit":
      return {
        action: "deliver" as const,
        label: "Deliver to Shop",
        icon: "store" as const,
        color: "#F97316",
      };
    case "in_service":
      if (shopStatus === "completed") {
        return {
          action: "return-pickup" as const,
          label: "Pick Up from Shop",
          icon: "undo" as const,
          color: "#06B6D4",
        };
      }
      return {
        action: "shop-complete" as const,
        label: "Mark Service Complete",
        icon: "check" as const,
        color: "#F59E0B",
      };
    case "returning":
      return {
        action: "complete" as const,
        label: "Complete Return",
        icon: "check-circle" as const,
        color: "#22C55E",
      };
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16, paddingBottom: 40 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },

  statusHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  statusLabel: { fontSize: 16, fontWeight: "700" },
  priorityPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
  },
  priorityPillText: { fontSize: 12, fontWeight: "700" },

  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    gap: 0,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  infoLabel: { fontSize: 14, color: "#6B7280" },
  infoValue: { fontSize: 14, fontWeight: "600", color: "#111827", maxWidth: "60%", textAlign: "right" },

  timelineTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 14,
  },
  timeline: { gap: 0 },
  timelineStep: { flexDirection: "row", minHeight: 48 },
  timelineLeft: { width: 32, alignItems: "center" },
  timelineDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineDotCurrent: {
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  timelineLine: {
    width: 3,
    flex: 1,
    borderRadius: 1.5,
    marginVertical: 2,
  },
  timelineContent: { flex: 1, paddingLeft: 12, paddingBottom: 14 },
  timelineLabel: { fontSize: 14, fontWeight: "500", color: "#9CA3AF" },
  timelineLabelReached: { color: "#374151" },
  timelineLabelCurrent: { fontWeight: "700", color: "#111827" },
  timelineTime: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  timelineNotes: {
    fontSize: 12,
    color: "#6B7280",
    fontStyle: "italic",
    marginTop: 2,
  },

  navigateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  navigateBtnText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#3B82F6",
  },
  actionRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  cancelBtnText: { fontSize: 14, fontWeight: "600", color: "#EF4444" },
});
