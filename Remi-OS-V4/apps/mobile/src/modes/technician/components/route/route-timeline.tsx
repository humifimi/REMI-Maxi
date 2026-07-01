import { useCallback, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  RefreshControl,
  Pressable,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { RouteStopStatus } from "@technician/types/enums";
import { RouteStopCard } from "./route-stop-card";
import { formatTravelTime } from "@technician/utils/navigation";
import type { RouteWithStops, RouteStopWithDetails } from "@technician/types/api";

interface RouteTimelineProps {
  route: RouteWithStops;
  onStopPress?: (stop: RouteStopWithDetails) => void;
  onStockPress?: (stop: RouteStopWithDetails) => void;
  onArrive?: (stopId: number) => void;
  onDepart?: (stopId: number) => void;
  onContinueJob?: (appointmentId: number, serviceNames: string | null) => void;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

function getCurrentStopIndex(stops: RouteStopWithDetails[]): number {
  const idx = stops.findIndex(
    (s) =>
      s.status === RouteStopStatus.PENDING ||
      s.status === RouteStopStatus.EN_ROUTE ||
      s.status === RouteStopStatus.ARRIVED
  );
  return idx >= 0 ? idx : stops.length - 1;
}

export function RouteTimeline({
  route,
  onStopPress,
  onStockPress,
  onArrive,
  onDepart,
  onContinueJob,
  isRefreshing = false,
  onRefresh,
}: RouteTimelineProps) {
  const listRef = useRef<FlatList<RouteStopWithDetails>>(null);
  const currentIdx = getCurrentStopIndex(route.stops);

  const completedCount = route.stops.filter(
    (s) => s.status === RouteStopStatus.COMPLETED
  ).length;
  const remainingCount = route.stops.length - completedCount;

  const stockIssueStops = route.stops.filter(
    (s) =>
      s.stock_status &&
      s.stock_status !== "ok" &&
      s.status !== RouteStopStatus.COMPLETED &&
      s.status !== RouteStopStatus.SKIPPED,
  ).length;

  const distanceLabel =
    route.estimated_distance_mi != null
      ? `${Math.round(route.estimated_distance_mi * 10) / 10} mi`
      : "--";
  const durationLabel =
    route.estimated_duration_min != null
      ? formatTravelTime(route.estimated_duration_min)
      : "--";

  const renderItem = useCallback(
    ({ item, index }: { item: RouteStopWithDetails; index: number }) => (
      <View>
        {index > 0 && (
          <View style={styles.connector}>
            <View style={styles.connectorLine} />
          </View>
        )}
        <RouteStopCard
          stop={item}
          stopNumber={index + 1}
          isCurrentStop={index === currentIdx}
          onPress={() => onStopPress?.(item)}
          onArrive={() => onArrive?.(item.id)}
          onDepart={() => onDepart?.(item.id)}
          onContinueJob={
            onContinueJob
              ? () => onContinueJob(item.appointment_id, item.service_names)
              : undefined
          }
          onStockPress={onStockPress ? () => onStockPress(item) : undefined}
        />
      </View>
    ),
    [currentIdx, onStopPress, onStockPress, onArrive, onDepart, onContinueJob]
  );

  return (
    <FlatList
      ref={listRef}
      data={route.stops}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <MaterialIcons name="pin-drop" size={16} color="#6B7280" />
            <Text style={styles.summaryText}>
              {route.stops.length} stop{route.stops.length !== 1 ? "s" : ""}
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <MaterialIcons name="straighten" size={16} color="#6B7280" />
            <Text style={styles.summaryText}>{distanceLabel}</Text>
          </View>
          <View style={styles.summaryItem}>
            <MaterialIcons name="schedule" size={16} color="#6B7280" />
            <Text style={styles.summaryText}>{durationLabel}</Text>
          </View>
          <View style={styles.summaryItem}>
            <MaterialIcons name="check-circle" size={16} color="#22C55E" />
            <Text style={styles.summaryText}>
              {completedCount}/{route.stops.length}
            </Text>
          </View>
          {stockIssueStops > 0 && (
            <Pressable
              style={styles.summaryItem}
              onPress={() => {
                const idx = route.stops.findIndex(
                  (s) =>
                    s.stock_status &&
                    s.stock_status !== "ok" &&
                    s.status !== RouteStopStatus.COMPLETED &&
                    s.status !== RouteStopStatus.SKIPPED,
                );
                if (idx >= 0) {
                  listRef.current?.scrollToIndex({
                    index: idx,
                    animated: true,
                    viewOffset: 40,
                  });
                }
              }}
              hitSlop={8}
            >
              <MaterialIcons name="warning" size={16} color="#EF4444" />
              <Text style={styles.stockIssueSummaryText}>
                {stockIssueStops} stock
              </Text>
            </Pressable>
          )}
        </View>
      }
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        ) : undefined
      }
      onLayout={() => {
        if (currentIdx > 0 && route.stops.length > 0) {
          setTimeout(() => {
            listRef.current?.scrollToIndex({
              index: currentIdx,
              animated: true,
              viewOffset: 60,
            });
          }, 300);
        }
      }}
      onScrollToIndexFailed={() => {}}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  summaryBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  summaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  stockIssueSummaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#EF4444",
  },
  connector: {
    alignItems: "center",
    height: 20,
  },
  connectorLine: {
    width: 2,
    flex: 1,
    backgroundColor: "#D1D5DB",
    borderStyle: "dashed",
  },
});
