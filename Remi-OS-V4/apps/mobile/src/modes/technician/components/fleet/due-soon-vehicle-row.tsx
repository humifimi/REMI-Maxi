import { memo } from "react";
import { StyleSheet, View, Text, Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { FleetDueSoonVehicle } from "@technician/types/fleet";
import { DueSoonSegmentColors } from "@technician/constants/colors";

interface DueSoonVehicleRowProps {
  vehicle: FleetDueSoonVehicle;
  isSelected: boolean;
  onToggle: (vehicleId: number) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMileage(mi: number | null): string {
  if (mi == null) return "—";
  return `${mi.toLocaleString()} mi`;
}

function urgencyLabel(days: number | null): string {
  if (days == null) return "Unknown";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  return `${days}d remaining`;
}

export const DueSoonVehicleRow = memo(function DueSoonVehicleRow({
  vehicle,
  isSelected,
  onToggle,
}: DueSoonVehicleRowProps) {
  const borderColor = DueSoonSegmentColors[vehicle.segment];
  const vehicleLabel = [vehicle.year, vehicle.make, vehicle.model]
    .filter(Boolean)
    .join(" ");

  return (
    <Pressable
      style={[styles.card, { borderLeftColor: borderColor }]}
      onPress={() => onToggle(vehicle.vehicle_id)}
      android_ripple={{ color: "#E5E7EB" }}
    >
      <View style={styles.topRow}>
        <Pressable
          style={[styles.checkbox, isSelected && styles.checkboxActive]}
          onPress={() => onToggle(vehicle.vehicle_id)}
          hitSlop={8}
        >
          {isSelected && (
            <MaterialIcons name="check" size={14} color="#fff" />
          )}
        </Pressable>

        <View style={styles.headerInfo}>
          <View style={styles.plateRow}>
            <Text style={styles.plate}>{vehicle.license_plate ?? "N/A"}</Text>
            <Text style={styles.vehicleLabel}>{vehicleLabel || "Unknown Vehicle"}</Text>
          </View>
          <Text style={styles.companyName}>{vehicle.fleet_company_name}</Text>
        </View>

        <View style={styles.urgencyBadge}>
          <Text style={[styles.urgencyText, { color: borderColor }]}>
            {urgencyLabel(vehicle.days_until_due)}
          </Text>
        </View>
      </View>

      <View style={styles.detailGrid}>
        <View style={styles.detailCol}>
          <View style={styles.detailRow}>
            <MaterialIcons name="person" size={14} color="#9CA3AF" />
            <Text style={styles.detailText} numberOfLines={1}>
              {vehicle.driver_name ?? "Unassigned"}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <MaterialIcons name="phone" size={14} color="#9CA3AF" />
            <Text style={styles.detailText} numberOfLines={1}>
              {vehicle.driver_phone ?? "—"}
            </Text>
          </View>
        </View>

        <View style={styles.detailCol}>
          <View style={styles.detailRow}>
            <MaterialIcons name="build" size={14} color="#9CA3AF" />
            <Text style={styles.detailText} numberOfLines={1}>
              {vehicle.service_type_due ?? "General Service"}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <MaterialIcons name="event" size={14} color="#9CA3AF" />
            <Text style={styles.detailText} numberOfLines={1}>
              Due {formatDate(vehicle.estimated_due_date)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.bottomRow}>
        <Text style={styles.metaText}>
          Last service: {formatDate(vehicle.last_service_date)} at{" "}
          {formatMileage(vehicle.last_service_mileage)}
        </Text>
        {vehicle.estimated_due_mileage != null && (
          <Text style={styles.metaText}>
            Due at {formatMileage(vehicle.estimated_due_mileage)}
          </Text>
        )}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#E5E7EB",
    padding: 14,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxActive: {
    backgroundColor: "#3B82F6",
    borderColor: "#3B82F6",
  },
  headerInfo: { flex: 1 },
  plateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  plate: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: 0.5,
  },
  vehicleLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  companyName: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
  },
  urgencyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#F9FAFB",
  },
  urgencyText: {
    fontSize: 11,
    fontWeight: "700",
  },
  detailGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
  },
  detailCol: {
    flex: 1,
    gap: 4,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailText: {
    fontSize: 12,
    color: "#374151",
    flex: 1,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F3F4F6",
  },
  metaText: {
    fontSize: 11,
    color: "#9CA3AF",
  },
});
