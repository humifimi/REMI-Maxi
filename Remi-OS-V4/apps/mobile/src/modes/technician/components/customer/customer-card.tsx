import { StyleSheet, View, Text, Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { User } from "@technician/types/api";

export interface VehicleSummary {
  plate?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | string | null;
}

interface CustomerCardProps {
  customer: User;
  onPress?: () => void;
  vehicles?: VehicleSummary[];
  highlightQuery?: string;
}

export function CustomerCard({
  customer,
  onPress,
  vehicles,
  highlightQuery,
}: CustomerCardProps) {
  const primaryVehicle = vehicles?.[0];
  const vehicleLine = primaryVehicle
    ? [primaryVehicle.year, primaryVehicle.make, primaryVehicle.model]
        .filter(Boolean)
        .join(" ")
    : null;
  const plateMatch =
    highlightQuery &&
    primaryVehicle?.plate &&
    primaryVehicle.plate.toLowerCase().includes(highlightQuery.toLowerCase());

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {customer.full_name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{customer.full_name}</Text>
        {customer.phone ? (
          <Text style={styles.detail}>{customer.phone}</Text>
        ) : null}
        {customer.email ? (
          <Text style={styles.detail}>{customer.email}</Text>
        ) : null}
        {vehicleLine ? (
          <View style={styles.vehicleRow}>
            <MaterialIcons name="directions-car" size={13} color="#6B7280" />
            <Text style={styles.vehicleText}>{vehicleLine}</Text>
          </View>
        ) : null}
        {primaryVehicle?.plate ? (
          <View
            style={[styles.plateBadge, plateMatch && styles.plateBadgeMatch]}
          >
            <Text
              style={[
                styles.plateText,
                plateMatch && styles.plateTextMatch,
              ]}
            >
              {primaryVehicle.plate}
            </Text>
          </View>
        ) : null}
        {vehicles && vehicles.length > 1 ? (
          <Text style={styles.moreVehicles}>
            +{vehicles.length - 1} more vehicle
            {vehicles.length - 1 > 1 ? "s" : ""}
          </Text>
        ) : null}
      </View>
      <MaterialIcons name="chevron-right" size={24} color="#9CA3AF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4F46E5",
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  detail: {
    fontSize: 13,
    color: "#6B7280",
  },
  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  vehicleText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  plateBadge: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  plateBadgeMatch: {
    backgroundColor: "#FEF3C7",
    borderColor: "#F59E0B",
  },
  plateText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    letterSpacing: 0.5,
  },
  plateTextMatch: {
    color: "#92400E",
  },
  moreVehicles: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 2,
  },
});
