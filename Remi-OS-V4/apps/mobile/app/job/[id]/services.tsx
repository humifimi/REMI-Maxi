import { useState, useEffect, useMemo, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Alert,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useQuery } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import { useAddService } from "@technician/hooks/jobs/use-services";
import { useJobDetail } from "@technician/hooks/jobs/use-jobs";
import { useFlowBack } from "@technician/hooks/jobs/use-flow-back";
import { useCopilotBriefing } from "@technician/hooks/ai/use-copilot";
import { useNotifyTimeOverflow } from "@technician/hooks/jobs/use-time-overflow";
import { useJobFlowStore } from "@technician/stores/job-flow";
import { useJobStockCheck } from "@technician/hooks/inventory/use-substitution";
import { StockWarningBanner } from "@technician/components/inventory/stock-warning-banner";
import { SubstitutionSheet } from "@technician/components/inventory/substitution-sheet";
import {
  JobContextSummaryCard,
  resolveJobContextSummary,
} from "@technician/components/job/job-context-summary-card";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { extractErrorMessage } from "@technician/api/errors";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";
import { Accordion } from "@technician/components/profit-calculator/accordion";
import type { Service } from "@technician/types/api";
import type { BriefingUpsellOpportunity } from "@technician/types/copilot";

/** Flip to re-enable AI upsell cards on this screen. */
const SHOW_RECOMMENDED_SECTION = false;

const PRIMARY_OIL_CHANGE_NAMES = [
  "Small Oil Change",
  "Medium Oil Change",
  "Large Oil Change",
  "Diesel Oil Change",
] as const;

const SERVICE_GROUP_BY_NAME: Record<string, string> = {
  "European Oil Change": "Other Oil Changes",
  "Fleet Oil Change": "Other Oil Changes",
  "Engine Air Filter Replacement": "Filters",
  "Cabin Air Filter Replacement": "Filters",
  "Fuel Filter Replacement": "Filters",
  "Wiper Blade Replacement": "Wipers",
  "Tire Rotation": "Tires",
  "Tire Replacement": "Tires",
  "Tire Flat Fix": "Tires",
  "Tire Sensor Replacement": "Tires",
  "Brake Inspection": "Brakes",
  "Brake Pad Replacement": "Brakes",
  "Coolant Flush": "Fluids",
  "Transmission Fluid Service": "Fluids",
  "Battery Replacement": "Electrical",
  "Headlight Bulb Replacement": "Electrical",
  "Multi-Point Inspection": "Inspection",
};

const SERVICE_GROUP_ORDER = [
  "Other Oil Changes",
  "Filters",
  "Wipers",
  "Tires",
  "Brakes",
  "Fluids",
  "Electrical",
  "Inspection",
  "Other",
] as const;

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "#22C55E",
  medium: "#EAB308",
  low: "#9CA3AF",
};

function OilChangeRadioRow({
  item,
  isSelected,
  onSelect,
}: {
  item: Service;
  isSelected: boolean;
  onSelect: (id: number) => void;
}) {
  return (
    <Pressable
      style={[styles.oilRow, isSelected && styles.oilRowSelected]}
      onPress={() => onSelect(item.id)}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
    >
      <View
        style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}
      >
        {isSelected ? <View style={styles.radioInner} /> : null}
      </View>
      <View style={styles.oilRowBody}>
        <Text
          style={[styles.oilRowName, isSelected && styles.oilRowNameSelected]}
        >
          {item.name}
        </Text>
        <Text style={styles.oilRowMeta}>
          ${Number(item.base_price).toFixed(2)} · {item.duration_minutes} min
        </Text>
      </View>
    </Pressable>
  );
}

function ServiceCard({
  item,
  isSelected,
  onToggle,
}: {
  item: Service;
  isSelected: boolean;
  onToggle: (id: number) => void;
}) {
  return (
    <Pressable
      style={[
        styles.serviceCard,
        isSelected && styles.serviceCardSelected,
      ]}
      onPress={() => onToggle(item.id)}
    >
      <View style={styles.serviceCardTop}>
        <View
          style={[
            styles.checkCircle,
            isSelected && styles.checkCircleSelected,
          ]}
        >
          {isSelected && (
            <MaterialIcons name="check" size={16} color="#fff" />
          )}
        </View>
      </View>
      <Text
        style={[
          styles.serviceName,
          isSelected && styles.serviceNameSelected,
        ]}
        numberOfLines={2}
      >
        {item.name}
      </Text>
      <Text style={styles.servicePrice}>
        ${Number(item.base_price).toFixed(2)}
      </Text>
      <Text style={styles.serviceDuration}>
        {item.duration_minutes} min
      </Text>
    </Pressable>
  );
}

export default function ServicesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const onBack = useFlowBack("services", id);
  const {
    vehicle,
    decodedVehicle,
    customer,
    scheduledServiceNames,
    appointmentId: storeAppointmentId,
  } = useJobFlowStore();
  // The route param may legitimately be the literal "new" when the job flow
  // hasn't materialized a real appointment yet (walk-in path that hasn't
  // booked). In that case we fall back to the appointmentId the previous
  // step put in the job-flow store. parseInt("new") yields NaN, which used
  // to silently bubble through to /jobs/NaN/services and 422 on the BE.
  const parsedId = parseInt(id, 10);
  const storeId =
    typeof storeAppointmentId === "number" &&
    Number.isFinite(storeAppointmentId) &&
    storeAppointmentId > 0
      ? storeAppointmentId
      : 0;
  const jobId =
    Number.isFinite(parsedId) && parsedId > 0 ? parsedId : storeId;

  useEffect(() => {
    console.log("[job-flow] services screen mounted", {
      routeId: id,
      parsedId,
      storeAppointmentId,
      resolvedJobId: jobId,
      vehicleId: vehicle?.id ?? null,
    });
  }, [id, parsedId, storeAppointmentId, jobId, vehicle?.id]);
  const addService = useAddService();

  const { data: jobDetail } = useJobDetail(jobId);
  const { data: briefing } = useCopilotBriefing(jobId);
  const notifyOverflow = useNotifyTimeOverflow(jobId);
  const availableMinutes = briefing?.available_minutes ?? null;

  const contextSummary = useMemo(
    () =>
      resolveJobContextSummary({
        vehicle,
        decodedVehicle,
        customer,
        appointment: jobDetail?.appointment ?? null,
      }),
    [vehicle, decodedVehicle, customer, jobDetail?.appointment],
  );

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["available-services"],
    queryFn: () => api<Service[]>("get", Endpoints.services.catalog),
    staleTime: 300_000,
  });

  const scheduledIdSet = useMemo(() => {
    const fromRecords = (jobDetail?.services ?? []).map((s) => s.service_id);
    if (fromRecords.length > 0) return new Set(fromRecords);

    const nameStr =
      jobDetail?.appointment?.service_names ?? scheduledServiceNames;
    if (!nameStr || services.length === 0) return new Set<number>();

    const names = nameStr
      .split(",")
      .map((n) => n.trim().toLowerCase())
      .filter(Boolean);
    const ids = services
      .filter((s) => names.includes(s.name.toLowerCase().trim()))
      .map((s) => s.id);
    return new Set(ids);
  }, [jobDetail?.services, jobDetail?.appointment?.service_names, scheduledServiceNames, services]);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const stockCheck = useJobStockCheck(jobId);
  const [stockSheetVisible, setStockSheetVisible] = useState(false);

  useEffect(() => {
    if (scheduledIdSet.size > 0 && selectedIds.size === 0) {
      setSelectedIds(new Set(scheduledIdSet));
    }
  }, [scheduledIdSet]);

  const {
    scheduledServices,
    primaryOilChanges,
    accordionGroups,
    aiSuggestions,
  } = useMemo(() => {
    if (services.length === 0) {
      return {
        scheduledServices: [] as Service[],
        primaryOilChanges: [] as Service[],
        accordionGroups: [] as { label: string; services: Service[] }[],
        aiSuggestions: [] as (Service & { upsell: BriefingUpsellOpportunity })[],
      };
    }

    const scheduled = services.filter((s) => scheduledIdSet.has(s.id));
    const scheduledIds = new Set(scheduled.map((s) => s.id));
    const primaryOilIds = new Set<number>();

    const primaryOilChanges = PRIMARY_OIL_CHANGE_NAMES.flatMap((name) => {
      const match = services.find((s) => s.name === name);
      if (!match || scheduledIds.has(match.id)) return [];
      primaryOilIds.add(match.id);
      return [match];
    });

    const upsells = briefing?.upsell_opportunities ?? [];
    const matched: (Service & { upsell: BriefingUpsellOpportunity })[] = [];
    const matchedIds = new Set<number>();

    if (SHOW_RECOMMENDED_SECTION) {
      for (const up of upsells) {
        const upNorm = up.service_name.toLowerCase().trim();
        const match = services.find((s) => {
          if (
            scheduledIds.has(s.id) ||
            matchedIds.has(s.id) ||
            primaryOilIds.has(s.id)
          ) {
            return false;
          }
          const catNorm = s.name.toLowerCase().trim();
          if (catNorm === upNorm) return true;
          if (catNorm.includes(upNorm) || upNorm.includes(catNorm)) return true;
          const upWords = upNorm.split(/\s+/);
          const catWords = catNorm.split(/\s+/);
          const overlap = upWords.filter((w) => catWords.includes(w));
          return overlap.length >= 2 && overlap.length >= catWords.length * 0.6;
        });
        if (match) {
          matched.push({ ...match, upsell: up });
          matchedIds.add(match.id);
        }
      }
    }

    const remaining = services.filter(
      (s) =>
        !scheduledIds.has(s.id) &&
        !primaryOilIds.has(s.id) &&
        !matchedIds.has(s.id),
    );

    const grouped = new Map<string, Service[]>();
    for (const service of remaining) {
      const label = SERVICE_GROUP_BY_NAME[service.name] ?? "Other";
      const bucket = grouped.get(label) ?? [];
      bucket.push(service);
      grouped.set(label, bucket);
    }

    const accordionGroups = SERVICE_GROUP_ORDER.flatMap((label) => {
      const bucket = grouped.get(label);
      if (!bucket?.length) return [];
      bucket.sort((a, b) => a.name.localeCompare(b.name));
      grouped.delete(label);
      return [{ label, services: bucket }];
    });

    for (const [label, bucket] of grouped.entries()) {
      bucket.sort((a, b) => a.name.localeCompare(b.name));
      accordionGroups.push({ label, services: bucket });
    }

    return {
      scheduledServices: scheduled,
      primaryOilChanges,
      accordionGroups,
      aiSuggestions: matched,
    };
  }, [services, scheduledIdSet, briefing?.upsell_opportunities]);

  const selectedDuration = useMemo(() => {
    return services
      .filter((s) => selectedIds.has(s.id))
      .reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
  }, [services, selectedIds]);

  const remainingMinutes =
    availableMinutes != null ? availableMinutes - selectedDuration : null;

  const primaryOilChangeIdSet = useMemo(
    () => new Set(primaryOilChanges.map((s) => s.id)),
    [primaryOilChanges],
  );

  const applyServiceSelection = useCallback(
    (serviceId: number, replaceOilGroup?: boolean) => {
      const svc = services.find((s) => s.id === serviceId);
      const svcDuration = svc?.duration_minutes ?? 0;
      const wouldAdd = !selectedIds.has(serviceId);

      const commit = () => {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (replaceOilGroup) {
            for (const oilId of primaryOilChangeIdSet) {
              next.delete(oilId);
            }
            next.add(serviceId);
            return next;
          }
          if (next.has(serviceId)) {
            next.delete(serviceId);
          } else {
            next.add(serviceId);
          }
          return next;
        });
      };

      if (
        wouldAdd &&
        remainingMinutes != null &&
        svcDuration > 0 &&
        svcDuration > remainingMinutes
      ) {
        Alert.alert(
          "Not Enough Time",
          `${svc?.name ?? "This service"} takes ~${svcDuration} min but only ${Math.max(0, remainingMinutes)} min remain in this appointment window. The customer would need to schedule another visit.`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Notify Customer",
              onPress: () => {
                notifyOverflow.mutate(
                  {
                    service_name: svc?.name ?? "Service",
                    duration_minutes: svcDuration,
                  },
                  {
                    onSuccess: () => {
                      haptic.success();
                      Alert.alert(
                        "Customer Notified",
                        "A message has been sent suggesting they schedule a follow-up.",
                      );
                    },
                    onError: () => {
                      Alert.alert(
                        "Notification Failed",
                        "Could not notify the customer. Try again later.",
                      );
                    },
                  },
                );
              },
            },
            {
              text: "Add Anyway",
              onPress: commit,
            },
          ],
        );
        return;
      }

      commit();
    },
    [
      services,
      selectedIds,
      remainingMinutes,
      notifyOverflow,
      primaryOilChangeIdSet,
    ],
  );

  const selectOilChange = useCallback(
    (serviceId: number) => {
      haptic.selection();
      if (selectedIds.has(serviceId)) return;
      applyServiceSelection(serviceId, true);
    },
    [selectedIds, applyServiceSelection],
  );

  const toggleService = useCallback(
    (serviceId: number) => {
      if (primaryOilChangeIdSet.has(serviceId)) {
        selectOilChange(serviceId);
        return;
      }

      haptic.selection();

      if (selectedIds.has(serviceId)) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(serviceId);
          return next;
        });
        return;
      }

      applyServiceSelection(serviceId, false);
    },
    [
      primaryOilChangeIdSet,
      selectOilChange,
      selectedIds,
      applyServiceSelection,
    ],
  );


  const handleContinue = async () => {
    if (selectedIds.size === 0) {
      Alert.alert("Required", "Select at least one service.");
      return;
    }

    if (!jobId || jobId <= 0) {
      // Don't nuke the user with router.replace — leave them where they
      // are so they can use the back/X buttons naturally. Just block the
      // outbound POST that would 422 with `invalid input syntax for type
      // integer: "NaN"` and surface a non-destructive alert.
      if (__DEV__) {
        console.warn("[services] jobId unresolved", {
          routeId: id,
          parsedId,
          storeAppointmentId,
        });
      }
      Alert.alert(
        "Job Not Found",
        "Could not identify this job. Tap the back arrow or the X in the corner to return to the Calendar.",
      );
      return;
    }

    const backendServiceIds = new Set(
      (jobDetail?.services ?? []).map((s) => s.service_id),
    );
    const newServiceIds = [...selectedIds].filter(
      (sid) => !backendServiceIds.has(sid),
    );

    if (newServiceIds.length === 0) {
      router.push(`/job/${jobId}/recommended-fluids` as never);
      return;
    }

    setIsSubmitting(true);
    try {
      console.log("[job-flow] services continue — adding services", {
        jobId,
        routeId: id,
        storeAppointmentId,
        newServiceIds,
        vehicleId: vehicle?.id ?? null,
      });
      for (const serviceId of newServiceIds) {
        await addService.mutateAsync({
          jobId,
          service_id: serviceId,
          vehicle_id: vehicle?.id,
        });
      }
      console.log("[job-flow] services continue — success, routing to checklist", {
        jobId,
      });
      router.push(`/job/${jobId}/recommended-fluids` as never);
    } catch (err) {
      console.warn("[job-flow] services continue — failed", {
        jobId,
        routeId: id,
        storeAppointmentId,
        err: err instanceof Error ? err.message : String(err),
      });
      Alert.alert("Could not add services", extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedTotal = services
    .filter((s) => selectedIds.has(s.id))
    .reduce((sum, s) => sum + Number(s.base_price), 0);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Select Services",
          headerLeft: () => (
            <Pressable onPress={onBack} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <View style={styles.container}>
        {isLoading ? (
          <SkeletonListScreen cards={5} />
        ) : services.length === 0 ? (
          <View style={styles.emptyWrap}>
            <MaterialIcons name="build" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>
              No services available. Contact your franchise owner.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <JobContextSummaryCard summary={contextSummary} />

            {stockCheck.data?.has_issues && (
              <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
                <StockWarningBanner
                  stockCheck={stockCheck.data}
                  onPress={() => setStockSheetVisible(true)}
                />
              </View>
            )}

            {availableMinutes != null && (
              <View style={styles.timeBadgeRow}>
                <View
                  style={[
                    styles.timeBadge,
                    remainingMinutes != null && remainingMinutes <= 10
                      ? styles.timeBadgeDanger
                      : remainingMinutes != null && remainingMinutes <= 25
                        ? styles.timeBadgeWarn
                        : null,
                  ]}
                >
                  <MaterialIcons
                    name="schedule"
                    size={16}
                    color={
                      remainingMinutes != null && remainingMinutes <= 10
                        ? "#DC2626"
                        : remainingMinutes != null && remainingMinutes <= 25
                          ? "#D97706"
                          : "#3B82F6"
                    }
                  />
                  <Text
                    style={[
                      styles.timeBadgeText,
                      remainingMinutes != null && remainingMinutes <= 10
                        ? styles.timeBadgeTextDanger
                        : remainingMinutes != null && remainingMinutes <= 25
                          ? styles.timeBadgeTextWarn
                          : null,
                    ]}
                  >
                    {remainingMinutes != null && remainingMinutes !== availableMinutes
                      ? `${Math.max(0, remainingMinutes)} min remaining`
                      : `${availableMinutes} min available`}
                  </Text>
                </View>
                {selectedDuration > 0 && (
                  <Text style={styles.durationTally}>
                    {selectedDuration} min selected
                  </Text>
                )}
              </View>
            )}

            {scheduledServices.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionIconCircle}>
                    <MaterialIcons name="event" size={16} color="#fff" />
                  </View>
                  <Text style={styles.sectionTitle}>Scheduled Services</Text>
                  <View style={styles.sectionBadge}>
                    <Text style={styles.sectionBadgeText}>
                      {scheduledServices.length}
                    </Text>
                  </View>
                </View>
                <View style={styles.grid}>
                  {scheduledServices.map((item) => (
                    <ServiceCard
                      key={item.id}
                      item={item}
                      isSelected={selectedIds.has(item.id)}
                      onToggle={toggleService}
                    />
                  ))}
                </View>
              </View>
            )}

            {primaryOilChanges.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionIconCircle}>
                    <MaterialIcons name="opacity" size={16} color="#fff" />
                  </View>
                  <Text style={styles.sectionTitle}>Oil Changes</Text>
                </View>
                <View
                  style={styles.oilRadioList}
                  accessibilityRole="radiogroup"
                >
                  {primaryOilChanges.map((item) => (
                    <OilChangeRadioRow
                      key={item.id}
                      item={item}
                      isSelected={selectedIds.has(item.id)}
                      onSelect={selectOilChange}
                    />
                  ))}
                </View>
              </View>
            )}

            {SHOW_RECOMMENDED_SECTION && aiSuggestions.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionIconCircle, styles.aiIconCircle]}>
                    <MaterialIcons name="auto-awesome" size={16} color="#fff" />
                  </View>
                  <Text style={styles.sectionTitle}>Recommended</Text>
                </View>
                {aiSuggestions.map((item) => {
                  const isSelected = selectedIds.has(item.id);
                  const doesNotFit = item.upsell.fits_in_window === false;
                  return (
                    <Pressable
                      key={item.id}
                      style={[
                        styles.aiCard,
                        isSelected && styles.aiCardSelected,
                        doesNotFit && !isSelected && styles.aiCardOverflow,
                      ]}
                      onPress={() => toggleService(item.id)}
                    >
                      <View style={styles.aiCardBody}>
                        <View style={styles.aiCardInfo}>
                          <View style={styles.aiNameRow}>
                            <Text
                              style={[
                                styles.serviceName,
                                isSelected && styles.serviceNameSelected,
                              ]}
                              numberOfLines={1}
                            >
                              {item.name}
                            </Text>
                            {doesNotFit && (
                              <View style={styles.overflowPill}>
                                <MaterialIcons
                                  name="schedule"
                                  size={10}
                                  color="#D97706"
                                />
                                <Text style={styles.overflowPillText}>
                                  Won't fit
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.aiReason} numberOfLines={2}>
                            {item.upsell.reason}
                          </Text>
                          <View style={styles.aiCardMeta}>
                            <Text style={styles.servicePrice}>
                              ${Number(item.base_price).toFixed(2)}
                            </Text>
                            {item.upsell.duration_minutes != null && (
                              <Text style={styles.aiDuration}>
                                {item.upsell.duration_minutes} min
                              </Text>
                            )}
                            <View
                              style={[
                                styles.confidencePill,
                                {
                                  backgroundColor:
                                    CONFIDENCE_COLORS[item.upsell.confidence] ??
                                    "#9CA3AF",
                                },
                              ]}
                            >
                              <Text style={styles.confidenceText}>
                                {item.upsell.confidence}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <View
                          style={[
                            styles.checkCircle,
                            isSelected && styles.checkCircleSelected,
                          ]}
                        >
                          {isSelected && (
                            <MaterialIcons name="check" size={16} color="#fff" />
                          )}
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {accordionGroups.length > 0 && (
              <View style={styles.accordionSection}>
                {accordionGroups.map((group) => (
                  <Accordion
                    key={group.label}
                    title={group.label}
                    badge={`${group.services.length}`}
                  >
                    <View style={styles.grid}>
                      {group.services.map((item) => (
                        <ServiceCard
                          key={item.id}
                          item={item}
                          isSelected={selectedIds.has(item.id)}
                          onToggle={toggleService}
                        />
                      ))}
                    </View>
                  </Accordion>
                ))}
              </View>
            )}
          </ScrollView>
        )}

        <View style={styles.footer}>
          <View style={styles.footerInfo}>
            <Text style={styles.selectedCount}>
              {selectedIds.size} service{selectedIds.size !== 1 ? "s" : ""}
            </Text>
            {selectedIds.size > 0 && (
              <Text style={styles.selectedTotal}>
                ${selectedTotal.toFixed(2)}
              </Text>
            )}
          </View>
          <Pressable
            style={[
              styles.continueBtn,
              (selectedIds.size === 0 || isSubmitting) && styles.disabled,
            ]}
            onPress={handleContinue}
            disabled={selectedIds.size === 0 || isSubmitting}
          >
            <Text style={styles.continueText}>
              {isSubmitting ? "Adding..." : "Continue"}
            </Text>
            <MaterialIcons name="arrow-forward" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>

      {stockCheck.data && (
        <SubstitutionSheet
          visible={stockSheetVisible}
          items={stockCheck.data.items}
          onDismiss={() => setStockSheetVisible(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyText: {
    textAlign: "center",
    color: "#9CA3AF",
    fontSize: 15,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  timeBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  timeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  timeBadgeWarn: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  timeBadgeDanger: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  timeBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#3B82F6",
  },
  timeBadgeTextWarn: {
    color: "#D97706",
  },
  timeBadgeTextDanger: {
    color: "#DC2626",
  },
  durationTally: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
  },
  section: {
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  accordionSection: {
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
    paddingTop: 14,
    paddingBottom: 10,
  },
  sectionIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },
  aiIconCircle: {
    backgroundColor: "#7C3AED",
  },
  catalogIconCircle: {
    backgroundColor: "#6B7280",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
  },
  sectionBadge: {
    backgroundColor: "#3B82F6",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sectionBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  oilRadioList: {
    gap: 8,
  },
  oilRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  oilRowSelected: {
    borderColor: "#3B82F6",
    backgroundColor: "#EFF6FF",
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: {
    borderColor: "#3B82F6",
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#3B82F6",
  },
  oilRowBody: {
    flex: 1,
  },
  oilRowName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  oilRowNameSelected: {
    color: "#1D4ED8",
  },
  oilRowMeta: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  aiCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "#E9D5FF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  aiCardSelected: {
    borderColor: "#7C3AED",
    backgroundColor: "#FAF5FF",
    shadowColor: "#7C3AED",
    shadowOpacity: 0.1,
  },
  aiCardOverflow: {
    borderColor: "#FDE68A",
    backgroundColor: "#FFFBEB",
  },
  aiNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  overflowPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  overflowPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#D97706",
  },
  aiDuration: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
  },
  aiCardBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  aiCardInfo: {
    flex: 1,
  },
  aiReason: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
    marginBottom: 6,
    lineHeight: 18,
  },
  aiCardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  confidencePill: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  confidenceText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  serviceCard: {
    width: "47.5%" as unknown as number,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    minHeight: 120,
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  serviceCardSelected: {
    borderColor: "#3B82F6",
    backgroundColor: "#EFF6FF",
    shadowColor: "#3B82F6",
    shadowOpacity: 0.1,
  },
  serviceCardTop: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 6,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleSelected: {
    backgroundColor: "#3B82F6",
    borderColor: "#3B82F6",
  },
  serviceName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 6,
  },
  serviceNameSelected: {
    color: "#1D4ED8",
  },
  servicePrice: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
  },
  serviceDuration: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
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
    alignItems: "center",
    gap: 12,
  },
  footerInfo: {
    flex: 1,
  },
  selectedCount: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
  },
  selectedTotal: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginTop: 2,
  },
  continueBtn: {
    backgroundColor: "#3B82F6",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 999,
    gap: 6,
  },
  disabled: { opacity: 0.4 },
  continueText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
