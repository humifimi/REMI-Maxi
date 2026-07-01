import { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useJobFlowStore } from "@technician/stores/job-flow";
import { useSubmitTechRating } from "@technician/hooks/orders/use-ratings";
import {
  useDeferredItemsByAppointment,
  useCommunicateDeferred,
} from "@technician/hooks/jobs/use-deferred-work";
import { DeferredServicesCard } from "@technician/components/service/deferred-services-card";
import { PostJobRatingPrompt } from "@technician/components/job/post-job-rating-prompt";
import type { RatingTag } from "@technician/types/api";
import { usePlaySound } from "@technician/hooks/utility/use-sound-context";

export default function CompleteScreen() {
  const router = useRouter();
  const { appointmentId, vehicle, customer, reset } =
    useJobFlowStore();
  const [showRating, setShowRating] = useState(true);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const submitRating = useSubmitTechRating();
  const playSound = usePlaySound();

  useEffect(() => {
    playSound("job_complete");
  }, [playSound]);

  const { data: deferredFromApi = [] } = useDeferredItemsByAppointment(
    appointmentId ?? 0
  );
  const communicate = useCommunicateDeferred();

  const deferredItems = deferredFromApi.length > 0 ? deferredFromApi : [];

  const vehicleLabel = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
    : "Vehicle";

  const handleRatingSubmit = (values: { stars: number; tags: RatingTag[] }) => {
    setShowRating(false);
    setRatingSubmitted(true);
    if (appointmentId) {
      submitRating.mutate({
        appointmentId,
        payload: { stars: values.stars, tags: values.tags },
      });
    }
  };

  const handleRatingDismiss = () => {
    setShowRating(false);
  };

  const handleDone = () => {
    reset();
    router.replace("/(tabs)");
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Job Complete",
          headerBackVisible: false,
          headerLeft: () => null,
        }}
      />

      <PostJobRatingPrompt
        visible={showRating}
        customerName={customer?.full_name ?? "Customer"}
        onSubmit={handleRatingSubmit}
        onDismiss={handleRatingDismiss}
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.successIcon}>
          <MaterialIcons name="check-circle" size={72} color="#22C55E" />
        </View>

        <Text style={styles.heading}>Job Complete!</Text>
        <Text style={styles.subtext}>Great work. Here's the summary.</Text>

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Customer</Text>
            <Text style={styles.summaryValue}>
              {customer?.full_name ?? "—"}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Vehicle</Text>
            <Text style={styles.summaryValue}>{vehicleLabel}</Text>
          </View>
        </View>

        {ratingSubmitted && (
          <View style={styles.ratingConfirm}>
            <MaterialIcons name="star" size={16} color="#F59E0B" />
            <Text style={styles.ratingConfirmText}>Rating submitted</Text>
          </View>
        )}

        {deferredItems.length > 0 ? (
          <View style={styles.deferredSection}>
            <DeferredServicesCard
              items={deferredItems}
              showActions
              onRecommendToCustomer={async (itemIds) => {
                if (appointmentId) {
                  await communicate.mutateAsync({
                    appointmentId,
                    itemIds,
                  });
                }
              }}
            />
          </View>
        ) : null}

        <View style={styles.referralCard}>
          <View style={styles.referralHeader}>
            <MaterialIcons name="flag" size={22} color="#EF4444" />
            <Text style={styles.referralTitle}>Flag an Issue?</Text>
          </View>
          <Text style={styles.referralSubtext}>
            Did you notice any issues during the inspection? Flag them for a partner referral.
          </Text>
          <View style={styles.referralCategories}>
            {(["windshield", "brakes", "tires", "cel"] as const).map((cat) => (
              <Pressable
                key={cat}
                style={styles.referralChip}
                onPress={() =>
                  router.push(
                    `/referral/create?appointmentId=${appointmentId}&category=${cat}`
                  )
                }
              >
                <Text style={styles.referralChipText}>
                  {cat === "cel" ? "CEL" : cat.charAt(0).toUpperCase() + cat.slice(1)}
                </Text>
              </Pressable>
            ))}
            <Pressable
              style={[styles.referralChip, styles.referralChipMore]}
              onPress={() =>
                router.push(`/referral/create?appointmentId=${appointmentId}`)
              }
            >
              <Text style={styles.referralChipMoreText}>More...</Text>
            </Pressable>
          </View>
        </View>

        <Pressable style={styles.doneBtn} onPress={handleDone}>
          <Text style={styles.doneBtnText}>Back to Calendar</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 24, alignItems: "center" },
  successIcon: { marginTop: 20, marginBottom: 16 },
  heading: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  subtext: { fontSize: 16, color: "#6B7280", marginBottom: 24 },
  summaryCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    width: "100%",
    gap: 14,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryLabel: { fontSize: 14, color: "#6B7280" },
  summaryValue: { fontSize: 14, fontWeight: "600", color: "#111827" },
  ratingConfirm: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFBEB",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 20,
    alignSelf: "flex-start",
  },
  ratingConfirmText: { fontSize: 14, color: "#92400E", fontWeight: "600" },
  deferredSection: {
    width: "100%",
    marginBottom: 24,
  },
  referralCard: {
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    padding: 18,
    width: "100%",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  referralHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  referralTitle: { fontSize: 16, fontWeight: "700", color: "#991B1B" },
  referralSubtext: { fontSize: 13, color: "#B91C1C", marginBottom: 12, lineHeight: 18 },
  referralCategories: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  referralChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  referralChipText: { fontSize: 13, fontWeight: "600", color: "#DC2626" },
  referralChipMore: { borderColor: "#E5E7EB" },
  referralChipMoreText: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  doneBtn: {
    backgroundColor: "#3B82F6",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    width: "100%",
  },
  doneBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
