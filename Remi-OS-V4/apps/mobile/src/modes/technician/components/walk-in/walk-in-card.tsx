import { useCallback, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import { useWalkInBook } from "@technician/hooks/schedule/use-walk-in";
import { useJobFlowStore } from "@technician/stores/job-flow";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { extractErrorMessage } from "@technician/api/errors";
import type { DecodedVehicle, User, Service } from "@technician/types/api";
import {
  NewCustomerForm,
  type NewCustomerFields,
} from "./new-customer-form";

interface WalkInCardProps {
  decodedVehicle: DecodedVehicle;
  vehicleId: number;
  linkedCustomer: User | null;
  onCancel: () => void;
}

// Walk-in branch shown after a plate scan when no active appointment exists
// for the decoded vehicle. Sends a single POST /technician/jobs/walk-in with
// the contract shape from `wellness-ai-and-walk-in-contract.md` § 2 — either
// `customer_id` (known) OR `new_customer` (inline name + phone).
export function WalkInCard({
  decodedVehicle,
  vehicleId,
  linkedCustomer,
  onCancel,
}: WalkInCardProps) {
  const router = useRouter();
  const catalogQuery = useQuery({
    queryKey: ["available-services"],
    queryFn: () => api<Service[]>("get", Endpoints.services.catalog),
    staleTime: 300_000,
  });
  const walkInMutation = useWalkInBook();
  const { setAppointmentId } = useJobFlowStore();

  const [selectedServices, setSelectedServices] = useState<number[]>([]);
  const [newCustomer, setNewCustomer] = useState<NewCustomerFields>({
    full_name: "",
    phone: "",
    email: "",
  });

  const vehicleLabel = [
    decodedVehicle.year,
    decodedVehicle.make,
    decodedVehicle.model,
  ]
    .filter(Boolean)
    .join(" ");

  const toggleService = useCallback((id: number) => {
    setSelectedServices((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }, []);

  const handleQuickBook = useCallback(async () => {
    haptic.medium();

    const isKnown = !!linkedCustomer?.id;
    if (!isKnown) {
      const name = newCustomer.full_name.trim();
      const phone = newCustomer.phone.trim();
      if (!name || !phone) {
        Alert.alert(
          "Customer Info Required",
          "Enter a name and phone number for the new customer.",
        );
        return;
      }
    }

    try {
      console.log("[job-flow] walk-in quick book", {
        vehicleId,
        isKnown,
        customerId: linkedCustomer?.id ?? null,
        serviceIds: selectedServices,
      });
      // POST /technician/jobs/walk-in — see contract § 2.
      // Sends `customer_id` XOR `new_customer`; server stamps tech_id +
      // creation_source itself.
      const result = await walkInMutation.mutateAsync({
        vehicle_id: vehicleId,
        customer_id: isKnown ? linkedCustomer!.id : undefined,
        new_customer: isKnown
          ? undefined
          : {
              full_name: newCustomer.full_name.trim(),
              phone: newCustomer.phone.trim(),
            },
        service_ids: selectedServices,
      });

      console.log("[job-flow] walk-in quick book success", {
        appointmentId: result.appointment_id,
        vehicleId,
      });
      setAppointmentId(result.appointment_id);
      router.push(`/job/${result.appointment_id}/services` as never);
    } catch (err) {
      console.warn("[job-flow] walk-in quick book failed", {
        vehicleId,
        err: err instanceof Error ? err.message : String(err),
      });
      const msg = extractErrorMessage(err);
      if (msg.includes("not yet available") || msg.includes("404")) {
        Alert.alert(
          "Walk-in API Not Ready",
          "Walk-in booking API not yet available \u2014 proceeding with ad-hoc service.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Continue Ad-Hoc",
              onPress: () => {
                router.push("/job/new/confirm-vehicle" as never);
              },
            },
          ],
        );
      } else {
        Alert.alert("Booking Failed", msg);
      }
    }
  }, [
    linkedCustomer,
    newCustomer,
    vehicleId,
    selectedServices,
    walkInMutation,
    setAppointmentId,
    router,
  ]);

  const isBusy = walkInMutation.isPending;
  const services = catalogQuery.data ?? [];
  const topServices = services.slice(0, 6);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <MaterialIcons name="add-circle" size={24} color="#3B82F6" />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Walk-In Booking</Text>
          <Text style={styles.headerSub}>
            No active appointment found for this vehicle
          </Text>
        </View>
      </View>

      <View style={styles.vehicleRow}>
        <MaterialIcons name="directions-car" size={20} color="#6B7280" />
        <Text style={styles.vehicleLabel}>
          {vehicleLabel || "Unknown Vehicle"}
        </Text>
        {decodedVehicle.vin ? (
          <Text style={styles.vinText}>
            VIN: {decodedVehicle.vin.slice(-6)}
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Customer</Text>
        {linkedCustomer ? (
          <View style={styles.customerCard}>
            <MaterialIcons name="person" size={20} color="#22C55E" />
            <View style={styles.customerInfo}>
              <Text style={styles.customerName}>
                {linkedCustomer.full_name}
              </Text>
              {linkedCustomer.phone ? (
                <Text style={styles.customerPhone}>
                  {linkedCustomer.phone}
                </Text>
              ) : null}
            </View>
            <View style={styles.knownBadge}>
              <Text style={styles.knownBadgeText}>Known</Text>
            </View>
          </View>
        ) : (
          <NewCustomerForm
            value={newCustomer}
            onChange={setNewCustomer}
            disabled={isBusy}
          />
        )}
      </View>

      {topServices.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Services (optional)</Text>
          <View style={styles.serviceGrid}>
            {topServices.map((svc) => {
              const isSelected = selectedServices.includes(svc.id);
              return (
                <Pressable
                  key={svc.id}
                  style={[
                    styles.serviceChip,
                    isSelected && styles.serviceChipActive,
                  ]}
                  onPress={() => toggleService(svc.id)}
                >
                  {isSelected && (
                    <MaterialIcons name="check" size={14} color="#fff" />
                  )}
                  <Text
                    style={[
                      styles.serviceChipText,
                      isSelected && styles.serviceChipTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {svc.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <View style={styles.actions}>
        <Pressable
          style={[styles.bookBtn, isBusy && styles.bookBtnDisabled]}
          onPress={handleQuickBook}
          disabled={isBusy}
        >
          {isBusy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="flash-on" size={20} color="#fff" />
              <Text style={styles.bookBtnText}>Quick Book</Text>
            </>
          )}
        </Pressable>
        <Pressable style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelBtnText}>Skip &mdash; Ad-Hoc Service</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    marginTop: 16,
    borderWidth: 2,
    borderColor: "#BFDBFE",
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  headerSub: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 12,
  },
  vehicleLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
  },
  vinText: {
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "500",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  customerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  customerPhone: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  knownBadge: {
    backgroundColor: "#22C55E",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  knownBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  serviceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  serviceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    minHeight: 44,
  },
  serviceChipActive: {
    backgroundColor: "#3B82F6",
    borderColor: "#3B82F6",
  },
  serviceChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  serviceChipTextActive: {
    color: "#fff",
  },
  actions: {
    gap: 10,
    marginTop: 4,
  },
  bookBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#3B82F6",
    borderRadius: 14,
    paddingVertical: 16,
    minHeight: 52,
  },
  bookBtnDisabled: {
    opacity: 0.6,
  },
  bookBtnText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
});
