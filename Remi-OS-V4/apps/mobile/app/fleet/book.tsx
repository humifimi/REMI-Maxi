import { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  useFleetCompanyVehicles,
  useCreateFleetBooking,
} from "@technician/hooks/inventory/use-fleet";
import type { FleetVehicle, Service } from "@technician/types/api";
import { useQuery } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";

// Postgres NUMERIC columns are serialized by node-pg as strings; some rows
// also arrive with a missing field. Coerce defensively at the display
// boundary so .toFixed() / arithmetic never blow up on string | undefined.
function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function FleetBookScreen() {
  const router = useRouter();
  const { companyId } = useLocalSearchParams<{ companyId: string }>();
  const cId = parseInt(companyId, 10) || 0;

  const { data: vehicles = [] } = useFleetCompanyVehicles(cId);
  const { data: services = [] } = useQuery({
    queryKey: ["services-catalog"],
    queryFn: () => api<Service[]>("get", Endpoints.services.catalog),
    staleTime: 120_000,
  });
  const booking = useCreateFleetBooking(cId);

  const [step, setStep] = useState<"vehicle" | "service" | "confirm">(
    "vehicle"
  );
  const [selectedVehicle, setSelectedVehicle] = useState<FleetVehicle | null>(
    null
  );
  const [selectedServices, setSelectedServices] = useState<number[]>([]);
  const [notes, setNotes] = useState("");

  const toggleService = (id: number) => {
    setSelectedServices((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const vehicleLabel = selectedVehicle?.vehicle
    ? [
        selectedVehicle.vehicle.year,
        selectedVehicle.vehicle.make,
        selectedVehicle.vehicle.model,
      ]
        .filter(Boolean)
        .join(" ")
    : selectedVehicle
      ? `Vehicle #${selectedVehicle.vehicle_id}`
      : "";

  const selectedServiceNames = services
    .filter((s) => selectedServices.includes(s.id))
    .map((s) => s.name);

  const totalEstimate = services
    .filter((s) => selectedServices.includes(s.id))
    .reduce((sum, s) => sum + toNumber(s.base_price), 0);

  const handleConfirm = async () => {
    if (!selectedVehicle || selectedServices.length === 0) return;
    try {
      await booking.mutateAsync({
        vehicle_id: selectedVehicle.vehicle_id,
        service_ids: selectedServices,
        notes: notes || undefined,
      });
      Alert.alert("Booked", "Appointment has been created.", [
        { text: "Done", onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert("Error", "Failed to create booking.");
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title:
            step === "vehicle"
              ? "Select Vehicle"
              : step === "service"
                ? "Select Services"
                : "Confirm Booking",
        }}
      />
      <View style={styles.container}>
        <View style={styles.stepper}>
          {["vehicle", "service", "confirm"].map((s, i) => (
            <View
              key={s}
              style={[
                styles.stepDot,
                (step === "vehicle" && i === 0) ||
                (step === "service" && i <= 1) ||
                (step === "confirm" && i <= 2)
                  ? styles.stepDotActive
                  : null,
              ]}
            />
          ))}
        </View>

        {step === "vehicle" && (
          <ScrollView contentContainerStyle={styles.listContent}>
            {vehicles.map((v) => {
              const label = v.vehicle
                ? [v.vehicle.year, v.vehicle.make, v.vehicle.model]
                    .filter(Boolean)
                    .join(" ")
                : `Vehicle #${v.vehicle_id}`;
              return (
                <Pressable
                  key={v.id}
                  style={[
                    styles.optionRow,
                    selectedVehicle?.id === v.id && styles.optionRowSelected,
                  ]}
                  onPress={() => {
                    setSelectedVehicle(v);
                    setStep("service");
                  }}
                >
                  <MaterialIcons
                    name="directions-car"
                    size={22}
                    color="#3B82F6"
                  />
                  <View style={styles.optionInfo}>
                    <Text style={styles.optionName}>{label}</Text>
                    {v.driver_name && (
                      <Text style={styles.optionSub}>{v.driver_name}</Text>
                    )}
                  </View>
                  {v.vehicle?.license_plate && (
                    <View style={styles.plateBadge}>
                      <Text style={styles.plateText}>
                        {v.vehicle.license_plate}
                      </Text>
                    </View>
                  )}
                  <MaterialIcons
                    name="chevron-right"
                    size={22}
                    color="#9CA3AF"
                  />
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {step === "service" && (
          <View style={styles.flex1}>
            <ScrollView contentContainerStyle={styles.listContent}>
              {services.map((s) => {
                const selected = selectedServices.includes(s.id);
                return (
                  <Pressable
                    key={s.id}
                    style={[
                      styles.optionRow,
                      selected && styles.optionRowSelected,
                    ]}
                    onPress={() => toggleService(s.id)}
                  >
                    <MaterialIcons
                      name={selected ? "check-box" : "check-box-outline-blank"}
                      size={24}
                      color={selected ? "#3B82F6" : "#D1D5DB"}
                    />
                    <View style={styles.optionInfo}>
                      <Text style={styles.optionName}>{s.name}</Text>
                      <Text style={styles.optionSub}>
                        ${toNumber(s.base_price).toFixed(2)} ·{" "}
                        {s.duration_minutes} min
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.footer}>
              <Pressable
                style={styles.backBtn}
                onPress={() => setStep("vehicle")}
              >
                <Text style={styles.backText}>Back</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.nextBtn,
                  selectedServices.length === 0 && styles.nextBtnDisabled,
                ]}
                onPress={() => setStep("confirm")}
                disabled={selectedServices.length === 0}
              >
                <Text style={styles.nextText}>
                  Continue ({selectedServices.length})
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {step === "confirm" && (
          <View style={styles.flex1}>
            <ScrollView contentContainerStyle={styles.confirmContent}>
              <View style={styles.confirmCard}>
                <Text style={styles.confirmLabel}>Vehicle</Text>
                <Text style={styles.confirmValue}>{vehicleLabel}</Text>
              </View>
              <View style={styles.confirmCard}>
                <Text style={styles.confirmLabel}>Services</Text>
                {selectedServiceNames.map((name) => (
                  <Text key={name} style={styles.confirmService}>
                    • {name}
                  </Text>
                ))}
              </View>
              <View style={styles.confirmCard}>
                <Text style={styles.confirmLabel}>Estimated Total</Text>
                <Text style={styles.confirmTotal}>
                  ${totalEstimate.toFixed(2)}
                </Text>
              </View>
              <View style={styles.confirmCard}>
                <Text style={styles.confirmLabel}>Notes (optional)</Text>
                <TextInput
                  style={styles.notesInput}
                  placeholder="Add notes..."
                  placeholderTextColor="#9CA3AF"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                />
              </View>
            </ScrollView>
            <View style={styles.footer}>
              <Pressable
                style={styles.backBtn}
                onPress={() => setStep("service")}
              >
                <Text style={styles.backText}>Back</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.confirmBtn,
                  booking.isPending && styles.nextBtnDisabled,
                ]}
                onPress={handleConfirm}
                disabled={booking.isPending}
              >
                {booking.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmBtnText}>Confirm Booking</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  flex1: { flex: 1 },
  stepper: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E5E7EB",
  },
  stepDotActive: { backgroundColor: "#3B82F6", width: 24, borderRadius: 4 },

  listContent: { padding: 16, gap: 8, paddingBottom: 100 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    gap: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  optionRowSelected: { borderColor: "#3B82F6", backgroundColor: "#EFF6FF" },
  optionInfo: { flex: 1 },
  optionName: { fontSize: 16, fontWeight: "600", color: "#111827" },
  optionSub: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  plateBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  plateText: { fontSize: 12, fontWeight: "700", color: "#374151" },

  confirmContent: { padding: 16, gap: 12, paddingBottom: 100 },
  confirmCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  confirmLabel: { fontSize: 12, fontWeight: "600", color: "#6B7280" },
  confirmValue: { fontSize: 16, fontWeight: "700", color: "#111827" },
  confirmService: { fontSize: 15, color: "#374151", marginLeft: 4 },
  confirmTotal: { fontSize: 24, fontWeight: "800", color: "#111827" },
  notesInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#111827",
    minHeight: 60,
    textAlignVertical: "top",
  },

  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    padding: 16,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    flexDirection: "row",
    gap: 12,
  },
  backBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
  },
  backText: { fontSize: 15, fontWeight: "600", color: "#374151" },
  nextBtn: {
    flex: 1,
    backgroundColor: "#3B82F6",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  confirmBtn: {
    flex: 1,
    backgroundColor: "#22C55E",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  confirmBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
