import { StyleSheet, View, Text, ScrollView, Pressable } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type {
  ServiceHistoryDisplayRecord,
  ServiceHistoryResult,
} from "@technician/types/api";
import { CarfaxCategoryPill } from "@technician/components/carfax/category-pill";

/**
 * Detail view for a single CARFAX Service History Check (SHC) record.
 *
 * Reached by tapping a row in the External Service History list on
 * `app/customer/[id].tsx` or the briefing's CARFAX section on
 * `app/job/[id]/briefing.tsx`. Both list screens fetch the full SHC
 * payload through `useQuery({ queryKey: ["carfax-service-history", vin], ... })`,
 * so this screen mounts the same query key — cached payload renders
 * instantly. If a deep link lands here without the cache being primed
 * (rare), the same `useQuery` will fetch on its own and show a spinner.
 *
 * Index semantics: `recordIndex` is the index into
 * `serviceHistory.displayRecords` in the order CARFAX returned them,
 * which is the same order the list screens iterate. No client-side
 * sort is applied in either place, so the indexes line up.
 */
export default function CarfaxRecordDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ vin?: string; recordIndex?: string }>();
  const vin = (params.vin ?? "").trim();
  const recordIndex = Number.parseInt(params.recordIndex ?? "", 10);

  const query = useQuery({
    queryKey: ["carfax-service-history", vin],
    queryFn: () =>
      api<ServiceHistoryResult>("get", Endpoints.carfax.serviceHistory, {
        vin: vin.toUpperCase(),
      }),
    enabled: vin.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });

  const sh = query.data?.serviceHistory;
  const records = sh?.displayRecords ?? [];
  const record: ServiceHistoryDisplayRecord | undefined =
    Number.isFinite(recordIndex) ? records[recordIndex] : undefined;

  const headerOptions = {
    headerShown: true,
    title: "Service Record",
    headerStyle: { backgroundColor: "#111827" },
    headerTintColor: "#fff",
    headerTitleStyle: { fontWeight: "700" as const },
    headerTitleAlign: "center" as const,
    headerLeft: () => (
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <MaterialIcons name="arrow-back" size={24} color="#fff" />
      </Pressable>
    ),
  };

  if (!vin || !Number.isFinite(recordIndex)) {
    return (
      <>
        <Stack.Screen options={headerOptions} />
        <View style={styles.center}>
          <MaterialIcons name="error-outline" size={36} color="#9CA3AF" />
          <Text style={styles.emptyText}>Record reference is missing.</Text>
        </View>
      </>
    );
  }

  if (query.isLoading) {
    return (
      <>
        <Stack.Screen options={headerOptions} />
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading record…</Text>
        </View>
      </>
    );
  }

  if (query.isError) {
    const msg =
      (query.error as { response?: { data?: { message?: string } } })?.response
        ?.data?.message ??
      (query.error as Error)?.message ??
      "CARFAX is temporarily unavailable.";
    return (
      <>
        <Stack.Screen options={headerOptions} />
        <View style={styles.center}>
          <MaterialIcons name="error-outline" size={36} color="#B91C1C" />
          <Text style={styles.errorText}>{msg}</Text>
        </View>
      </>
    );
  }

  if (!record) {
    return (
      <>
        <Stack.Screen options={headerOptions} />
        <View style={styles.center}>
          <MaterialIcons name="search-off" size={36} color="#9CA3AF" />
          <Text style={styles.emptyText}>
            That record is no longer in the CARFAX response for this VIN.
          </Text>
        </View>
      </>
    );
  }

  const isRecall = (record.type ?? "").toLowerCase() === "recall";
  const records_text = record.text ?? [];

  const vehicleSummary = [sh?.year, sh?.make, sh?.model]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <Stack.Screen options={headerOptions} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <View style={styles.vehicleBlock}>
          {vehicleSummary ? (
            <Text style={styles.vehicleSummary}>{vehicleSummary}</Text>
          ) : null}
          {sh?.vin ? (
            <Text style={styles.vehicleVin}>VIN {sh.vin}</Text>
          ) : (
            <Text style={styles.vehicleVin}>VIN {vin}</Text>
          )}
          {sh?.bodyTypeDescription || sh?.engineInformation || sh?.driveline ? (
            <View style={styles.vehicleSpecs}>
              {sh?.bodyTypeDescription ? (
                <Text style={styles.vehicleSpec}>
                  {sh.bodyTypeDescription}
                </Text>
              ) : null}
              {sh?.engineInformation ? (
                <Text style={styles.vehicleSpec}>{sh.engineInformation}</Text>
              ) : null}
              {sh?.driveline ? (
                <Text style={styles.vehicleSpec}>{sh.driveline}</Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryDateBlock}>
              <Text style={styles.summaryDate}>
                {record.displayDate && record.displayDate !== "Not Reported"
                  ? record.displayDate
                  : "Date not reported"}
              </Text>
              {record.odometer ? (
                <Text style={styles.summaryOdo}>{record.odometer} mi</Text>
              ) : null}
            </View>
            <CarfaxCategoryPill record={record} size="md" />
          </View>

          {records_text.length === 0 ? (
            <Text style={styles.emptyTextSmall}>
              CARFAX did not include any details for this record.
            </Text>
          ) : (
            <View style={styles.textList}>
              {records_text.map((line, i) => (
                <View key={i} style={styles.textRow}>
                  <View style={styles.textBullet} />
                  <Text style={styles.textLine}>{line}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {isRecall ? (
          <View style={styles.recallNote}>
            <View style={styles.recallNoteHeader}>
              <MaterialIcons name="info-outline" size={16} color="#B91C1C" />
              <Text style={styles.recallNoteTitle}>What does this mean?</Text>
            </View>
            <Text style={styles.recallNoteBody}>
              Recalls are manufacturer-issued safety bulletins. If the status
              above is anything other than &quot;Remedy Completed,&quot; the
              customer should confirm with their dealer that the recall has
              been addressed.
            </Text>
          </View>
        ) : null}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16 },
  bottomSpacer: { height: 40 },
  center: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 24,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  emptyTextSmall: {
    fontSize: 13,
    color: "#9CA3AF",
    fontStyle: "italic",
    paddingTop: 4,
  },
  loadingText: { fontSize: 14, color: "#6B7280" },
  errorText: { fontSize: 14, color: "#B91C1C", textAlign: "center" },

  vehicleBlock: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  vehicleSummary: { fontSize: 16, fontWeight: "700", color: "#111827" },
  vehicleVin: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  vehicleSpecs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  vehicleSpec: {
    fontSize: 12,
    color: "#374151",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },

  summaryCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryDateBlock: { flex: 1, gap: 2 },
  summaryDate: { fontSize: 16, fontWeight: "700", color: "#111827" },
  summaryOdo: { fontSize: 13, color: "#6B7280" },

  textList: { gap: 8 },
  textRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  textBullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#9CA3AF",
    marginTop: 8,
  },
  textLine: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
    lineHeight: 20,
  },

  recallNote: {
    marginTop: 12,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 14,
    gap: 6,
  },
  recallNoteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  recallNoteTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#B91C1C",
  },
  recallNoteBody: {
    fontSize: 13,
    color: "#7F1D1D",
    lineHeight: 19,
  },
});
