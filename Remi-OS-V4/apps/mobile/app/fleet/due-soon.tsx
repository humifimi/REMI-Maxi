import { useState, useCallback, useRef, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  SectionList,
  Pressable,
  RefreshControl,
  Alert,
} from "react-native";
import { Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { type AppSheetRef } from "@technician/components/sheets";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useAllFleetDueSoon } from "@technician/hooks/use-fleet-due-soon";
import { DueSoonVehicleRow } from "@technician/components/fleet/due-soon-vehicle-row";
import { NudgeTemplatePicker } from "@technician/components/fleet/nudge-template-picker";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type { FleetDueSoonVehicle, DueSoonSegment } from "@technician/types/fleet";
import {
  DueSoonSegmentColors,
  DueSoonSegmentBgColors,
  DueSoonSegmentLabels,
} from "@technician/constants/colors";

type SectionData = {
  segment: DueSoonSegment;
  data: FleetDueSoonVehicle[];
};

const SEGMENT_ORDER: DueSoonSegment[] = ["overdue", "due_7", "due_14"];

export default function FleetDueSoonScreen() {
  const { data, isLoading, isRefetching, refetch } = useAllFleetDueSoon();
  const nudgeRef = useRef<AppSheetRef>(null);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<DueSoonSegment>>(new Set());

  const sections = useMemo<SectionData[]>(() => {
    if (!data) return [];
    return SEGMENT_ORDER.map((seg) => ({
      segment: seg,
      data: collapsedSections.has(seg) ? [] : data[seg],
    })).filter(
      (s) => s.data.length > 0 || (data[s.segment]?.length ?? 0) > 0
    );
  }, [data, collapsedSections]);

  const allVehicles = useMemo(() => {
    if (!data) return [];
    return [...data.overdue, ...data.due_7, ...data.due_14];
  }, [data]);

  const selectedVehicles = useMemo(
    () => allVehicles.filter((v) => selectedIds.has(v.vehicle_id)),
    [allVehicles, selectedIds]
  );

  const sectionCount = useCallback(
    (seg: DueSoonSegment) => data?.[seg]?.length ?? 0,
    [data]
  );

  const toggleCollapse = useCallback((seg: DueSoonSegment) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(seg)) next.delete(seg);
      else next.add(seg);
      return next;
    });
  }, []);

  const toggleVehicle = useCallback((vehicleId: number) => {
    haptic.light();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(vehicleId)) next.delete(vehicleId);
      else next.add(vehicleId);
      return next;
    });
  }, []);

  const selectAllInSection = useCallback(
    (seg: DueSoonSegment) => {
      if (!data) return;
      haptic.light();
      const sectionVehicles = data[seg];
      const allSelected = sectionVehicles.every((v) => selectedIds.has(v.vehicle_id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const v of sectionVehicles) {
          if (allSelected) next.delete(v.vehicle_id);
          else next.add(v.vehicle_id);
        }
        return next;
      });
    },
    [data, selectedIds]
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const openNudgePicker = useCallback(() => {
    if (selectedIds.size === 0) {
      Alert.alert("No Vehicles Selected", "Select at least one vehicle to send a nudge.");
      return;
    }
    haptic.medium();
    nudgeRef.current?.expand();
  }, [selectedIds]);

  const handleNudgeSuccess = useCallback(
    (sentCount: number) => {
      nudgeRef.current?.close();
      clearSelection();
      Alert.alert("Nudge Sent", `Successfully sent to ${sentCount} recipient(s).`);
    },
    [clearSelection]
  );

  if (isLoading && !isRefetching) return <SkeletonListScreen />;

  return (
    <GestureHandlerRootView style={styles.root}>
      <Stack.Screen
        options={{
          title: "Fleet Due Soon",
          headerRight: () =>
            selectedIds.size > 0 ? (
              <Pressable onPress={clearSelection} hitSlop={8}>
                <Text style={styles.clearBtn}>Clear</Text>
              </Pressable>
            ) : null,
        }}
      />

      {/* Summary Bar */}
      <View style={styles.summaryBar}>
        {SEGMENT_ORDER.map((seg) => {
          const count = sectionCount(seg);
          if (count === 0) return null;
          return (
            <View key={seg} style={styles.summaryChip}>
              <View
                style={[styles.summaryDot, { backgroundColor: DueSoonSegmentColors[seg] }]}
              />
              <Text style={styles.summaryText}>
                {count} {DueSoonSegmentLabels[seg]}
              </Text>
            </View>
          );
        })}
        <Text style={styles.summaryTotal}>{data?.total_count ?? 0} total</Text>
      </View>

      <SectionList
        style={styles.list}
        sections={sections}
        keyExtractor={(item) => String(item.vehicle_id)}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => {
          const seg = (section as SectionData).segment;
          const count = sectionCount(seg);
          const isCollapsed = collapsedSections.has(seg);
          const sectionVehicles = data?.[seg] ?? [];
          const allSelected =
            sectionVehicles.length > 0 &&
            sectionVehicles.every((v) => selectedIds.has(v.vehicle_id));

          return (
            <View style={[styles.sectionHeader, { borderLeftColor: DueSoonSegmentColors[seg] }]}>
              <Pressable
                style={styles.sectionHeaderLeft}
                onPress={() => toggleCollapse(seg)}
                hitSlop={8}
              >
                <MaterialIcons
                  name={isCollapsed ? "expand-more" : "expand-less"}
                  size={22}
                  color="#374151"
                />
                <Text style={styles.sectionTitle}>{DueSoonSegmentLabels[seg]}</Text>
                <View style={[styles.countBadge, { backgroundColor: DueSoonSegmentBgColors[seg] }]}>
                  <Text style={[styles.countBadgeText, { color: DueSoonSegmentColors[seg] }]}>
                    {count}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => selectAllInSection(seg)}
                hitSlop={8}
                style={styles.selectAllBtn}
              >
                <MaterialIcons
                  name={allSelected ? "check-box" : "check-box-outline-blank"}
                  size={20}
                  color={allSelected ? "#3B82F6" : "#9CA3AF"}
                />
                <Text style={styles.selectAllText}>All</Text>
              </Pressable>
            </View>
          );
        }}
        renderItem={({ item }) => (
          <DueSoonVehicleRow
            vehicle={item}
            isSelected={selectedIds.has(item.vehicle_id)}
            onToggle={toggleVehicle}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name="check-circle" size={56} color="#22C55E" />
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptyText}>
              No fleet vehicles are due for service in the next 14 days.
            </Text>
          </View>
        }
      />

      {/* Bottom Action Bar */}
      {selectedIds.size > 0 && (
        <View style={styles.actionBar}>
          <View style={styles.actionBarLeft}>
            <View style={styles.selectedBadge}>
              <Text style={styles.selectedBadgeText}>{selectedIds.size}</Text>
            </View>
            <Text style={styles.actionBarLabel}>selected</Text>
          </View>
          <View style={styles.actionBarRight}>
            <Pressable style={styles.actionBtn} onPress={openNudgePicker}>
              <MaterialIcons name="sms" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Send Nudge</Text>
            </Pressable>
          </View>
        </View>
      )}

      <NudgeTemplatePicker
        ref={nudgeRef}
        selectedVehicles={selectedVehicles}
        onClose={() => {}}
        onSuccess={handleNudgeSuccess}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F9FAFB" },
  clearBtn: { color: "#3B82F6", fontSize: 14, fontWeight: "600" },

  summaryBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    gap: 12,
    flexWrap: "wrap",
  },
  summaryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  summaryText: { fontSize: 12, color: "#374151", fontWeight: "600" },
  summaryTotal: {
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "500",
    marginLeft: "auto",
  },

  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 100 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 8,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 4,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: "800",
  },
  selectAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  selectAllText: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
  },

  empty: { alignItems: "center", paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#374151" },
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    paddingHorizontal: 40,
  },

  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#111827",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 28,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  actionBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectedBadge: {
    backgroundColor: "#3B82F6",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  selectedBadgeText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  actionBarLabel: {
    color: "#9CA3AF",
    fontSize: 14,
    fontWeight: "500",
  },
  actionBarRight: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#3B82F6",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});
