import { useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useFleetCompanyVehicles } from "@technician/hooks/inventory/use-fleet";
import { useCreateDeferredItem } from "@technician/hooks/jobs/use-deferred-work";
import { ObservationTypeLabels } from "@technician/constants/colors";
import type { ObservationType } from "@technician/types/enums";
import type { FleetVehicle } from "@technician/types/api";

const CHECK_ITEMS: {
  observation: ObservationType;
  icon: keyof typeof MaterialIcons.glyphMap;
}[] = [
  { observation: "low_coolant", icon: "water-drop" },
  { observation: "dirty_air_filter", icon: "air" },
  { observation: "tire_wear", icon: "tire-repair" },
  { observation: "low_tire_pressure", icon: "speed" },
  { observation: "check_engine_light", icon: "warning" },
  { observation: "worn_wipers", icon: "water" },
  { observation: "headlight_out", icon: "highlight" },
  { observation: "taillight_out", icon: "flashlight-on" },
  { observation: "windshield_damage", icon: "broken-image" },
  { observation: "brake_noise", icon: "disc-full" },
  { observation: "battery_corrosion", icon: "battery-alert" },
  { observation: "oil_leak", icon: "opacity" },
];

type CheckResult = "pass" | "flag" | null;

export default function FleetCheckScreen() {
  const router = useRouter();
  const { companyId, vehicleId } = useLocalSearchParams<{
    companyId: string;
    vehicleId?: string;
  }>();
  const cId = parseInt(companyId, 10) || 0;
  const preselectedVehicle = vehicleId ? parseInt(vehicleId, 10) : null;

  const { data: vehicles = [] } = useFleetCompanyVehicles(cId);
  const createDeferred = useCreateDeferredItem();

  const [selectedVehicle, setSelectedVehicle] = useState<FleetVehicle | null>(
    null
  );
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const [submitting, setSubmitting] = useState(false);

  const activeVehicle =
    selectedVehicle ??
    (preselectedVehicle
      ? vehicles.find((v) => v.vehicle_id === preselectedVehicle) ?? null
      : null);

  const setResult = useCallback(
    (obs: string, val: CheckResult) => {
      setResults((prev) => ({ ...prev, [obs]: val }));
    },
    []
  );

  const flaggedItems = CHECK_ITEMS.filter(
    (c) => results[c.observation] === "flag"
  );
  const completedCount = CHECK_ITEMS.filter(
    (c) => results[c.observation] != null
  ).length;

  const handleSubmit = async () => {
    if (!activeVehicle) return;
    if (flaggedItems.length === 0) {
      Alert.alert("All Clear", "No issues found — vehicle passes inspection.");
      router.back();
      return;
    }

    setSubmitting(true);
    try {
      for (const item of flaggedItems) {
        await createDeferred.mutateAsync({
          appointment_id: 0,
          vehicle_id: activeVehicle.vehicle_id,
          customer_id: activeVehicle.driver_user_id ?? 0,
          observation_type: item.observation,
          severity: "medium",
        });
      }
      Alert.alert(
        "Inspection Complete",
        `${flaggedItems.length} issue${flaggedItems.length !== 1 ? "s" : ""} logged.`,
        [{ text: "Done", onPress: () => router.back() }]
      );
    } catch {
      Alert.alert("Error", "Failed to submit some items. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!activeVehicle) {
    return (
      <>
        <Stack.Screen options={{ title: "Fleet Check — Select Vehicle" }} />
        <ScrollView style={styles.container} contentContainerStyle={styles.vehicleList}>
          <Text style={styles.selectPrompt}>
            Select a vehicle to inspect
          </Text>
          {vehicles.map((v) => {
            const label = v.vehicle
              ? [v.vehicle.year, v.vehicle.make, v.vehicle.model]
                  .filter(Boolean)
                  .join(" ")
              : `Vehicle #${v.vehicle_id}`;
            return (
              <Pressable
                key={v.id}
                style={styles.vehicleOption}
                onPress={() => setSelectedVehicle(v)}
              >
                <MaterialIcons name="directions-car" size={22} color="#3B82F6" />
                <View style={styles.vehicleOptionInfo}>
                  <Text style={styles.vehicleOptionName}>{label}</Text>
                  {v.driver_name ? (
                    <Text style={styles.vehicleOptionDriver}>
                      {v.driver_name}
                    </Text>
                  ) : null}
                </View>
                {v.vehicle?.license_plate ? (
                  <View style={styles.plateBadge}>
                    <Text style={styles.plateText}>
                      {v.vehicle.license_plate}
                    </Text>
                  </View>
                ) : null}
                <MaterialIcons name="chevron-right" size={22} color="#9CA3AF" />
              </Pressable>
            );
          })}
        </ScrollView>
      </>
    );
  }

  const vehicleLabel = activeVehicle.vehicle
    ? [
        activeVehicle.vehicle.year,
        activeVehicle.vehicle.make,
        activeVehicle.vehicle.model,
      ]
        .filter(Boolean)
        .join(" ")
    : `Vehicle #${activeVehicle.vehicle_id}`;

  return (
    <>
      <Stack.Screen options={{ title: `Check: ${vehicleLabel}` }} />
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.checklistContent}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${(completedCount / CHECK_ITEMS.length) * 100}%`,
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {completedCount}/{CHECK_ITEMS.length} checked
          </Text>

          {CHECK_ITEMS.map((item) => {
            const label =
              ObservationTypeLabels[item.observation] ?? item.observation;
            const result = results[item.observation];
            return (
              <View key={item.observation} style={styles.checkRow}>
                <View style={styles.checkIcon}>
                  <MaterialIcons
                    name={item.icon}
                    size={24}
                    color="#374151"
                  />
                </View>
                <Text style={styles.checkLabel}>{label}</Text>
                <View style={styles.checkActions}>
                  <Pressable
                    style={[
                      styles.checkBtn,
                      styles.passBtn,
                      result === "pass" && styles.passBtnActive,
                    ]}
                    onPress={() => setResult(item.observation, "pass")}
                  >
                    <MaterialIcons
                      name="check"
                      size={20}
                      color={result === "pass" ? "#fff" : "#22C55E"}
                    />
                  </Pressable>
                  <Pressable
                    style={[
                      styles.checkBtn,
                      styles.flagBtn,
                      result === "flag" && styles.flagBtnActive,
                    ]}
                    onPress={() => setResult(item.observation, "flag")}
                  >
                    <MaterialIcons
                      name="flag"
                      size={20}
                      color={result === "flag" ? "#fff" : "#EF4444"}
                    />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.footerInfo}>
            <Text style={styles.footerFlagged}>
              {flaggedItems.length} flagged
            </Text>
            <Text style={styles.footerTotal}>
              {completedCount}/{CHECK_ITEMS.length}
            </Text>
          </View>
          <Pressable
            style={[
              styles.submitBtn,
              completedCount < CHECK_ITEMS.length && styles.submitBtnDisabled,
            ]}
            onPress={handleSubmit}
            disabled={completedCount < CHECK_ITEMS.length || submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.submitText}>Submit Inspection</Text>
            )}
          </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  vehicleList: { padding: 16, gap: 8 },
  selectPrompt: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  vehicleOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  vehicleOptionInfo: { flex: 1 },
  vehicleOptionName: { fontSize: 16, fontWeight: "600", color: "#111827" },
  vehicleOptionDriver: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  plateBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  plateText: { fontSize: 12, fontWeight: "700", color: "#374151" },

  checklistContent: { padding: 16, paddingBottom: 100 },
  progressBar: {
    height: 6,
    backgroundColor: "#E5E7EB",
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#3B82F6",
    borderRadius: 3,
  },
  progressText: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
    marginBottom: 16,
    textAlign: "right",
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  checkIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  checkLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: "#111827" },
  checkActions: { flexDirection: "row", gap: 8 },
  checkBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  passBtn: { borderColor: "#22C55E", backgroundColor: "#F0FDF4" },
  passBtnActive: { backgroundColor: "#22C55E", borderColor: "#22C55E" },
  flagBtn: { borderColor: "#EF4444", backgroundColor: "#FEF2F2" },
  flagBtnActive: { backgroundColor: "#EF4444", borderColor: "#EF4444" },

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
    alignItems: "center",
    gap: 16,
  },
  footerInfo: { gap: 2 },
  footerFlagged: { fontSize: 14, fontWeight: "700", color: "#EF4444" },
  footerTotal: { fontSize: 12, color: "#9CA3AF" },
  submitBtn: {
    flex: 1,
    backgroundColor: "#3B82F6",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
