import { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useJobFlowStore } from "@technician/stores/job-flow";
import { useAuthStore } from "@/src/stores/auth";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { API_BASE_URL } from "@technician/constants/config";

interface FluidSpec {
  id: number;
  description: string;
  type: string;
  specification: string | null;
  capacity: string | null;
  viscosity: string | null;
  source: string;
}

export default function RecommendedFluidsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobId = parseInt(id, 10);
  const router = useRouter();
  const { appointmentId, vehicle } = useJobFlowStore();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [fluids, setFluids] = useState<FluidSpec[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFluidSpecs();
  }, [appointmentId]);

  const loadFluidSpecs = async () => {
    if (!appointmentId || !accessToken) {
      setLoading(false);
      return;
    }

    try {
      console.log("[recommended-fluids] fetching for appointment", appointmentId);
      // Fetch line items for this appointment that are type "fluid" from motor_api
      const response = await fetch(
        `${API_BASE_URL}/technician/jobs/${appointmentId}/line-items`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to load fluid specs");
      }

      const data = await response.json();
      const fluidItems = data.data.filter(
        (item: FluidSpec) => item.type === "fluid" && item.source === "motor_api"
      );
      console.log("[recommended-fluids] loaded", fluidItems.length, "fluid specs");
      setFluids(fluidItems);
    } catch (err) {
      console.warn("[recommended-fluids] Failed to load specs", err);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    haptic.light();
    router.push(`/job/${jobId}/checklist` as never);
  };

  const getFluidIcon = (description: string): keyof typeof MaterialIcons.glyphMap => {
    const lower = description.toLowerCase();
    if (lower.includes("engine") || lower.includes("motor")) return "oil-barrel";
    if (lower.includes("coolant")) return "thermostat";
    if (lower.includes("transmission")) return "settings";
    if (lower.includes("brake")) return "disc-full";
    if (lower.includes("power steering")) return "rotate-right";
    if (lower.includes("differential")) return "sync";
    return "water-drop";
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Recommended Fluids",
          headerShadowVisible: false,
        }}
      />
      <View style={styles.container}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Loading fluid specifications...</Text>
          </View>
        ) : (
          <>
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {vehicle && (
                <View style={styles.vehicleCard}>
                  <MaterialIcons name="directions-car" size={20} color="#6B7280" />
                  <Text style={styles.vehicleText}>
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </Text>
                </View>
              )}

              {fluids.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialIcons name="info-outline" size={48} color="#9CA3AF" />
                  <Text style={styles.emptyTitle}>No Fluid Specs Available</Text>
                  <Text style={styles.emptyDescription}>
                    MOTOR API didn't return specifications for this vehicle. You can continue with
                    the job flow.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.sectionTitle}>OEM Specifications</Text>
                  <Text style={styles.sectionSubtitle}>
                    These are the manufacturer-recommended fluids for this vehicle
                  </Text>

                  {fluids.map((fluid) => (
                    <View key={fluid.id} style={styles.fluidCard}>
                      <View style={styles.fluidHeader}>
                    <MaterialIcons
                      name={getFluidIcon(fluid.description)}
                      size={24}
                      color="#3B82F6"
                      style={styles.fluidIcon}
                    />
                        <Text style={styles.fluidTitle}>
                          {fluid.description.split("—")[0].trim()}
                        </Text>
                      </View>

                      <View style={styles.fluidDetails}>
                        {(fluid.specification || fluid.viscosity) && (
                          <View style={styles.fluidRow}>
                            <Text style={styles.fluidLabel}>Specification:</Text>
                            <Text style={styles.fluidValue}>
                              {fluid.specification || fluid.viscosity}
                            </Text>
                          </View>
                        )}

                        {fluid.capacity && (
                          <View style={styles.fluidRow}>
                            <Text style={styles.fluidLabel}>Capacity:</Text>
                            <Text style={styles.fluidValue}>{fluid.capacity}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>

            <View style={styles.footer}>
              <Pressable
                style={styles.continueButton}
                onPress={handleContinue}
                android_ripple={{ color: "rgba(255,255,255,0.2)" }}
              >
                <Text style={styles.continueButtonText}>Continue</Text>
                <MaterialIcons name="arrow-forward" size={20} color="#FFF" />
              </Pressable>
            </View>
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: "#6B7280",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  vehicleCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 8,
    gap: 8,
    marginBottom: 24,
  },
  vehicleText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 16,
  },
  fluidCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  fluidHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  fluidIcon: {
    marginRight: 12,
  },
  fluidTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  fluidDetails: {
    gap: 8,
  },
  fluidRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fluidLabel: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
  },
  fluidValue: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#F9FAFB",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    padding: 16,
  },
  continueButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3B82F6",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    gap: 8,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFF",
  },
});
