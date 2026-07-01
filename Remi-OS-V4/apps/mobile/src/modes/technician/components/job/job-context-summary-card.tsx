import { StyleSheet, View, Text } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type {
  Appointment,
  DecodedVehicle,
  User,
  Vehicle,
} from "@technician/types/api";

export interface JobContextSummary {
  customerName: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  engine: string | null;
  color: string | null;
  licensePlate: string | null;
  licensePlateState: string | null;
  vin: string | null;
}

export function resolveJobContextSummary(input: {
  vehicle?: Vehicle | null;
  decodedVehicle?: DecodedVehicle | null;
  customer?: User | null;
  appointment?: Appointment | null;
}): JobContextSummary {
  const { vehicle, decodedVehicle, customer, appointment } = input;
  const apptVehicle = appointment?.vehicle;

  return {
    customerName:
      customer?.full_name ??
      appointment?.customer_name ??
      appointment?.customer?.full_name ??
      null,
    year:
      vehicle?.year ??
      decodedVehicle?.year ??
      appointment?.vehicle_year ??
      apptVehicle?.year ??
      null,
    make:
      vehicle?.make ??
      decodedVehicle?.make ??
      appointment?.vehicle_make ??
      apptVehicle?.make ??
      null,
    model:
      vehicle?.model ??
      decodedVehicle?.model ??
      appointment?.vehicle_model ??
      apptVehicle?.model ??
      null,
    engine: vehicle?.engine ?? decodedVehicle?.engine ?? apptVehicle?.engine ?? null,
    color: vehicle?.color ?? apptVehicle?.color ?? null,
    licensePlate:
      vehicle?.license_plate ??
      appointment?.license_plate ??
      apptVehicle?.license_plate ??
      null,
    licensePlateState:
      vehicle?.license_plate_state ?? apptVehicle?.license_plate_state ?? null,
    vin: vehicle?.vin ?? decodedVehicle?.vin ?? apptVehicle?.vin ?? null,
  };
}

function formatVin(vin: string): string {
  const trimmed = vin.trim();
  if (trimmed.length <= 8) return trimmed;
  return `…${trimmed.slice(-8)}`;
}

function formatPlate(plate: string, state: string | null): string {
  const normalized = plate.trim();
  if (!state?.trim()) return normalized;
  return `${state.trim().toUpperCase()} ${normalized}`;
}

/** Compact vehicle + customer reference for in-flow job screens. */
export function JobContextSummaryCard({
  summary,
}: {
  summary: JobContextSummary;
}) {
  const vehicleTitle = [summary.year, summary.make, summary.model]
    .filter(Boolean)
    .join(" ");

  const detailParts = [
    summary.engine,
    summary.color,
    summary.licensePlate
      ? formatPlate(summary.licensePlate, summary.licensePlateState)
      : null,
    summary.vin ? `VIN ${formatVin(summary.vin)}` : null,
  ].filter(Boolean);

  if (!vehicleTitle && !summary.customerName && detailParts.length === 0) {
    return null;
  }

  return (
    <View style={styles.card}>
      {vehicleTitle ? (
        <View style={styles.row}>
          <MaterialIcons name="directions-car" size={16} color="#3B82F6" />
          <Text style={styles.vehicleTitle} numberOfLines={1}>
            {vehicleTitle}
          </Text>
        </View>
      ) : null}

      {summary.customerName ? (
        <View style={styles.row}>
          <MaterialIcons name="person" size={16} color="#6B7280" />
          <Text style={styles.customerName} numberOfLines={1}>
            {summary.customerName}
          </Text>
        </View>
      ) : null}

      {detailParts.length > 0 ? (
        <Text style={styles.details} numberOfLines={2}>
          {detailParts.join(" · ")}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  vehicleTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  customerName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  details: {
    fontSize: 12,
    lineHeight: 16,
    color: "#6B7280",
    paddingLeft: 24,
  },
});
