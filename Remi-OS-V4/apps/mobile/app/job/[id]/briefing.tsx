import { useState, useCallback, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useQuery } from "@tanstack/react-query";
import { useCopilotBriefing } from "@technician/hooks/ai/use-copilot";
import { useJobDetail } from "@technician/hooks/jobs/use-jobs";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { ServiceHistoryResult } from "@technician/types/api";
import { useStartConversationWithCustomer } from "@technician/hooks/communication/use-messages";
import { useFlowBack } from "@technician/hooks/jobs/use-flow-back";
import { useActiveTimerStore } from "@technician/stores/active-timer";
import { useJobStockCheck } from "@technician/hooks/inventory/use-substitution";
import { StockWarningBanner } from "@technician/components/inventory/stock-warning-banner";
import { SubstitutionSheet } from "@technician/components/inventory/substitution-sheet";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";
import { CarfaxCategoryPill } from "@technician/components/carfax/category-pill";
import type {
  BriefingTalkingPoint,
  BriefingUpsellOpportunity,
} from "@technician/types/copilot";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "#22C55E",
  medium: "#EAB308",
  low: "#9CA3AF",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "#EF4444",
  medium: "#F59E0B",
  low: "#6B7280",
};

type SectionKey =
  | "customer"
  | "vehicle"
  | "carfax"
  | "talking_points"
  | "upsells";

export default function BriefingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const appointmentId = parseInt(id, 10);
  const router = useRouter();
  const onBack = useFlowBack("briefing", id);
  const { data, isLoading, isError } = useCopilotBriefing(appointmentId);
  const jobDetail = useJobDetail(appointmentId);

  // PLAN-DEVIATION: 2026-04-26-briefing-resume-redirect — see docs/PLAN-DEVIATIONS.md.
  // Two signals can flag "this appointment is already in flight":
  //   1. Server-side `appointment.status === "in_progress"` — set when the
  //      tech goes through the full begin-service → /timer/start flow which
  //      transitions the appointment row.
  //   2. Local `useActiveTimerStore.jobId === appointmentId && isRunning` —
  //      set the moment the tech taps "Begin Service" client-side, even
  //      before/in-flight of the BE call. This catches the round-5 gap where
  //      the *service* row is in_progress but the *appointment* row is still
  //      "arrived", so the BE-status check alone leaves the user stranded
  //      on briefing when they re-enter via the Calendar route card.
  // Either signal alone is sufficient to redirect.
  const activeTimerJobId = useActiveTimerStore((s) => s.jobId);
  const activeTimerIsRunning = useActiveTimerStore((s) => s.isRunning);
  useEffect(() => {
    const status = jobDetail.data?.appointment?.status;
    const apptIsInProgress = status === "in_progress";
    const timerIsForThisJob =
      activeTimerIsRunning && activeTimerJobId === appointmentId;
    if (apptIsInProgress || timerIsForThisJob) {
      router.replace(`/job/${appointmentId}/timer` as never);
    }
  }, [
    jobDetail.data?.appointment?.status,
    activeTimerJobId,
    activeTimerIsRunning,
    appointmentId,
    router,
  ]);

  const stockCheck = useJobStockCheck(appointmentId);
  const [stockSheetVisible, setStockSheetVisible] = useState(false);

  // MSG-FE-TECH-3 — tech-initiated chat from inside an active job.
  // Customer id comes off the appointment row pulled by `useJobDetail`.
  const startConversation = useStartConversationWithCustomer();
  const customerIdFromAppt = jobDetail.data?.appointment?.customer_id ?? null;
  const handleMessageCustomer = useCallback(() => {
    if (customerIdFromAppt === null) return;
    haptic.light();
    startConversation.mutate(
      { customerId: customerIdFromAppt },
      {
        onSuccess: (conversation) => {
          router.push(`/message/${conversation.id}` as never);
        },
      },
    );
  }, [customerIdFromAppt, router, startConversation]);

  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    customer: true,
    vehicle: true,
    carfax: false,
    talking_points: false,
    upsells: false,
  });

  // CARFAX Service History Check — fetched only when the job has a VIN.
  // Lazy: starts disabled, kicks off on first card expansion to avoid
  // burning a CARFAX call on briefings the tech never opens. Cached for
  // 5min so revisiting the screen during prep doesn't re-fetch.
  const vin = jobDetail.data?.appointment?.vehicle?.vin ?? null;
  const carfaxQuery = useQuery({
    queryKey: ["carfax-service-history", vin],
    queryFn: () =>
      api<ServiceHistoryResult>(
        "get",
        Endpoints.carfax.serviceHistory,
        { vin: (vin ?? "").toUpperCase() },
      ),
    enabled: Boolean(vin && expanded.carfax),
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });

  const toggle = useCallback((key: SectionKey) => {
    haptic.selection();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleDismiss = () => {
    haptic.medium();
    router.push(`/job/${id}/confirm-vehicle` as never);
  };

  if (isLoading) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "Pre-Job Briefing",
            headerLeft: () => (
              <Pressable onPress={onBack} hitSlop={8}>
                <MaterialIcons name="arrow-back" size={24} color="#fff" />
              </Pressable>
            ),
          }}
        />
        <SkeletonListScreen cards={4} />
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "Pre-Job Briefing",
            headerLeft: () => (
              <Pressable onPress={onBack} hitSlop={8}>
                <MaterialIcons name="arrow-back" size={24} color="#fff" />
              </Pressable>
            ),
          }}
        />
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <MaterialIcons name="auto-awesome" size={36} color="#9CA3AF" />
          </View>
          <Text style={styles.emptyTitle}>Briefing Unavailable</Text>
          <Text style={styles.emptyBody}>
            The AI briefing service is not available right now. You can
            still proceed with the job.
          </Text>
          <Pressable style={styles.proceedBtn} onPress={handleDismiss}>
            <Text style={styles.proceedText}>Continue to Job</Text>
            <MaterialIcons name="arrow-forward" size={18} color="#fff" />
          </Pressable>
        </View>
      </>
    );
  }

  const customer_summary = data.customer_summary ?? null;
  const vehicle_history = data.vehicle_history ?? null;
  const talking_points = data.talking_points ?? [];
  const upsell_opportunities = data.upsell_opportunities ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          title: "Pre-Job Briefing",
          headerLeft: () => (
            <Pressable onPress={onBack} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.aiHeader}>
          <View style={styles.aiIconCircle}>
            <MaterialIcons name="auto-awesome" size={20} color="#fff" />
          </View>
          <View style={styles.aiHeaderText}>
            <Text style={styles.aiTitle}>AI Briefing</Text>
            <Text style={styles.aiSubtitle}>
              Generated for this appointment
            </Text>
          </View>
        </View>

        {stockCheck.data?.has_issues && (
          <View style={{ marginBottom: 12 }}>
            <StockWarningBanner
              stockCheck={stockCheck.data}
              onPress={() => setStockSheetVisible(true)}
            />
          </View>
        )}

        {/* Customer Summary */}
        {customer_summary && (
          <ExpandableCard
            title="Customer Summary"
            icon="person"
            iconBg="#DBEAFE"
            iconColor="#3B82F6"
            isExpanded={expanded.customer}
            onToggle={() => toggle("customer")}
          >
            <View style={styles.summaryGrid}>
              <SummaryItem
                label="Customer"
                value={customer_summary.customer_name}
              />
              <SummaryItem
                label="Total Visits"
                value={String(customer_summary.total_visits)}
              />
              <SummaryItem
                label="Last Visit"
                value={
                  customer_summary.last_visit_date
                    ? new Date(customer_summary.last_visit_date).toLocaleDateString()
                    : "First visit"
                }
              />
              <SummaryItem
                label="Lifetime Spend"
                value={`$${customer_summary.lifetime_spend.toLocaleString()}`}
              />
            </View>
            {customer_summary.notes ? (
              <View style={styles.noteBox}>
                <MaterialIcons name="sticky-note-2" size={14} color="#6B7280" />
                <Text style={styles.noteText}>{customer_summary.notes}</Text>
              </View>
            ) : null}
            {customerIdFromAppt !== null ? (
              <Pressable
                style={[
                  styles.messageCustomerBtn,
                  startConversation.isPending && styles.messageCustomerBtnDisabled,
                ]}
                onPress={handleMessageCustomer}
                disabled={startConversation.isPending}
                accessibilityRole="button"
                accessibilityLabel="Message customer"
              >
                <MaterialIcons name="chat-bubble" size={18} color="#3B82F6" />
                <Text style={styles.messageCustomerBtnText}>
                  Message customer
                </Text>
              </Pressable>
            ) : null}
          </ExpandableCard>
        )}

        {/* Vehicle History */}
        {vehicle_history && (
          <ExpandableCard
            title="Vehicle History"
            icon="directions-car"
            iconBg="#FEF9C3"
            iconColor="#CA8A04"
            isExpanded={expanded.vehicle}
            onToggle={() => toggle("vehicle")}
          >
            <View style={styles.summaryGrid}>
              <SummaryItem label="Vehicle" value={vehicle_history.vehicle_summary} />
              <SummaryItem
                label="Services"
                value={String(vehicle_history.total_services)}
              />
              <SummaryItem
                label="Last Service"
                value={
                  vehicle_history.last_service_date
                    ? `${vehicle_history.last_service_type ?? "Service"} — ${new Date(
                        vehicle_history.last_service_date
                      ).toLocaleDateString()}`
                    : "No previous service"
                }
              />
              {vehicle_history.mileage ? (
                <SummaryItem
                  label="Mileage"
                  value={`${vehicle_history.mileage.toLocaleString()} mi`}
                />
              ) : null}
            </View>
            {vehicle_history.known_issues.length > 0 ? (
              <View style={styles.issuesList}>
                <Text style={styles.issuesLabel}>Known Issues</Text>
                {vehicle_history.known_issues.map((issue, i) => (
                  <View key={i} style={styles.issueRow}>
                    <MaterialIcons name="warning" size={14} color="#F59E0B" />
                    <Text style={styles.issueText}>{issue}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </ExpandableCard>
        )}

        {/* CARFAX Service History — external (other shops). Distinct from
            the internal Vehicle History card above so the tech can tell
            at a glance what came from REMI's CRM vs what came from
            CARFAX. Only shows when the job's vehicle has a VIN. */}
        {vin ? (
          <ExpandableCard
            title="CARFAX Service History"
            icon="history"
            iconBg="#DBEAFE"
            iconColor="#1D4ED8"
            isExpanded={expanded.carfax}
            onToggle={() => toggle("carfax")}
          >
            <CarfaxServiceHistorySection query={carfaxQuery} vin={vin} />
          </ExpandableCard>
        ) : null}

        {/* Talking Points */}
        <ExpandableCard
          title="Talking Points"
          icon="chat"
          iconBg="#F0FDF4"
          iconColor="#16A34A"
          isExpanded={expanded.talking_points}
          onToggle={() => toggle("talking_points")}
          badge={talking_points.length}
        >
          {talking_points.map((tp: BriefingTalkingPoint, idx: number) => (
            <View key={tp.id ?? `tp-${idx}`} style={styles.talkingPointRow}>
              <View
                style={[
                  styles.priorityDot,
                  { backgroundColor: PRIORITY_COLORS[tp.priority] ?? "#6B7280" },
                ]}
              />
              <Text style={styles.talkingPointText}>{tp.text}</Text>
            </View>
          ))}
          {talking_points.length === 0 ? (
            <Text style={styles.noItemsText}>
              No specific talking points for this visit.
            </Text>
          ) : null}
        </ExpandableCard>

        {/* Upsell Opportunities */}
        <ExpandableCard
          title="Upsell Opportunities"
          icon="trending-up"
          iconBg="#EDE9FE"
          iconColor="#7C3AED"
          isExpanded={expanded.upsells}
          onToggle={() => toggle("upsells")}
          badge={upsell_opportunities.length}
        >
          {upsell_opportunities.map((up: BriefingUpsellOpportunity, idx: number) => (
            <View key={up.id ?? `upsell-${idx}`} style={styles.upsellCard}>
              <View style={styles.upsellHeader}>
                <Text style={styles.upsellName}>{up.service_name}</Text>
                <View
                  style={[
                    styles.confidencePill,
                    { backgroundColor: CONFIDENCE_COLORS[up.confidence] ?? "#9CA3AF" },
                  ]}
                >
                  <Text style={styles.confidenceText}>
                    {up.confidence}
                  </Text>
                </View>
              </View>
              <Text style={styles.upsellReason}>{up.reason}</Text>
              {up.estimated_price != null ? (
                <Text style={styles.upsellPrice}>
                  ~${up.estimated_price.toFixed(2)}
                </Text>
              ) : null}
            </View>
          ))}
          {upsell_opportunities.length === 0 ? (
            <Text style={styles.noItemsText}>
              No upsell opportunities identified.
            </Text>
          ) : null}
        </ExpandableCard>

        <Pressable style={styles.gotItBtn} onPress={handleDismiss}>
          <MaterialIcons name="check-circle" size={22} color="#fff" />
          <Text style={styles.gotItText}>Got It</Text>
        </Pressable>

        <View style={styles.bottomSpacer} />
      </ScrollView>

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

function ExpandableCard({
  title,
  icon,
  iconBg,
  iconColor,
  isExpanded,
  onToggle,
  badge,
  children,
}: {
  title: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  iconBg: string;
  iconColor: string;
  isExpanded: boolean;
  onToggle: () => void;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Pressable
        style={styles.cardHeader}
        onPress={onToggle}
        hitSlop={4}
      >
        <View style={[styles.cardIconCircle, { backgroundColor: iconBg }]}>
          <MaterialIcons name={icon} size={18} color={iconColor} />
        </View>
        <Text style={styles.cardTitle}>{title}</Text>
        {badge != null && badge > 0 ? (
          <View style={styles.badgePill}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
        <MaterialIcons
          name={isExpanded ? "keyboard-arrow-up" : "keyboard-arrow-down"}
          size={24}
          color="#9CA3AF"
        />
      </Pressable>
      {isExpanded ? <View style={styles.cardBody}>{children}</View> : null}
    </View>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

interface CarfaxQueryShape {
  data?: ServiceHistoryResult;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}

const CARFAX_BRIEFING_PAGE_SIZE = 5;

function CarfaxServiceHistorySection({
  query,
  vin,
}: {
  query: CarfaxQueryShape;
  vin: string;
}) {
  const router = useRouter();
  const records = query.data?.serviceHistory?.displayRecords ?? [];
  const [visibleCount, setVisibleCount] = useState(CARFAX_BRIEFING_PAGE_SIZE);
  // Reset pagination when the underlying records change so navigating to
  // a different job doesn't carry over a "show more" expansion.
  useEffect(() => {
    setVisibleCount(CARFAX_BRIEFING_PAGE_SIZE);
  }, [records.length]);

  if (query.isLoading) {
    return (
      <View style={styles.carfaxLoading}>
        <Text style={styles.carfaxLoadingText}>Pulling CARFAX records…</Text>
      </View>
    );
  }

  if (query.isError) {
    const msg =
      (query.error as { response?: { data?: { message?: string } } })?.response
        ?.data?.message ??
      (query.error as Error)?.message ??
      "CARFAX is temporarily unavailable.";
    return (
      <View style={styles.carfaxError}>
        <MaterialIcons name="error-outline" size={16} color="#B91C1C" />
        <Text style={styles.carfaxErrorText}>{msg}</Text>
      </View>
    );
  }

  const data = query.data;
  if (!data) return null;

  const errors = data.errorMessages?.errors ?? [];
  const sh = data.serviceHistory;

  if (errors.length > 0 && !sh) {
    return (
      <View style={styles.carfaxEmpty}>
        <MaterialIcons name="info-outline" size={16} color="#6B7280" />
        <Text style={styles.carfaxEmptyText}>
          {errors.map((e) => e.message).join("; ")}
        </Text>
      </View>
    );
  }

  if (!sh) {
    return (
      <View style={styles.carfaxEmpty}>
        <MaterialIcons name="info-outline" size={16} color="#6B7280" />
        <Text style={styles.carfaxEmptyText}>
          No CARFAX-indexed service records for this VIN.
        </Text>
      </View>
    );
  }

  if (records.length === 0) {
    return (
      <View style={styles.carfaxEmpty}>
        <MaterialIcons name="info-outline" size={16} color="#6B7280" />
        <Text style={styles.carfaxEmptyText}>
          CARFAX has this VIN on file but no recorded services yet.
        </Text>
      </View>
    );
  }

  const recent = records.slice(0, visibleCount);
  const remaining = Math.max(records.length - visibleCount, 0);
  const isExpanded = visibleCount > CARFAX_BRIEFING_PAGE_SIZE;

  return (
    <View style={styles.carfaxList}>
      <Text style={styles.carfaxRecordsHeader}>
        Recent external service records ({sh.numberOfServiceRecords ?? records.length})
      </Text>
      {recent.map((r, idx) => (
        <Pressable
          key={idx}
          style={styles.carfaxRecord}
          hitSlop={6}
          onPress={() => {
            haptic.selection();
            router.push({
              pathname: "/carfax-record/[recordIndex]",
              params: { vin, recordIndex: String(idx) },
            });
          }}
          accessibilityRole="button"
          accessibilityLabel={`View record from ${r.displayDate ?? "unknown date"}`}
        >
          <View style={styles.carfaxRecordMain}>
            <View style={styles.carfaxRecordMeta}>
              <Text style={styles.carfaxRecordDate}>{r.displayDate ?? "—"}</Text>
              {r.odometer ? (
                <Text style={styles.carfaxRecordOdo}>{r.odometer} mi</Text>
              ) : null}
            </View>
            {r.text && r.text.length > 0 ? (
              <Text style={styles.carfaxRecordText} numberOfLines={3}>
                {r.text.slice(0, 4).join(" · ")}
                {r.text.length > 4 ? "…" : ""}
              </Text>
            ) : null}
          </View>
          <CarfaxCategoryPill
            record={r}
            size="sm"
            style={styles.carfaxRecordPill}
          />
          <MaterialIcons
            name="chevron-right"
            size={20}
            color="#9CA3AF"
            style={styles.carfaxRecordChevron}
          />
        </Pressable>
      ))}
      {remaining > 0 ? (
        <Pressable
          style={styles.carfaxMoreBtn}
          onPress={() => {
            haptic.selection();
            setVisibleCount((v) =>
              Math.min(v + CARFAX_BRIEFING_PAGE_SIZE, records.length),
            );
          }}
          hitSlop={6}
          accessibilityRole="button"
        >
          <Text style={styles.carfaxMoreBtnText}>
            Show more ({remaining} remaining)
          </Text>
        </Pressable>
      ) : isExpanded ? (
        <Pressable
          style={styles.carfaxMoreBtn}
          onPress={() => {
            haptic.selection();
            setVisibleCount(CARFAX_BRIEFING_PAGE_SIZE);
          }}
          hitSlop={6}
          accessibilityRole="button"
        >
          <Text style={styles.carfaxMoreBtnText}>Show less</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16 },
  bottomSpacer: { height: 40 },

  aiHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  aiIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#8B5CF6",
    alignItems: "center",
    justifyContent: "center",
  },
  aiHeaderText: { flex: 1 },
  aiTitle: { fontSize: 18, fontWeight: "800", color: "#111827" },
  aiSubtitle: { fontSize: 13, color: "#6B7280", marginTop: 1 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 10,
  },
  cardIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  badgePill: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  cardBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 0,
  },

  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  summaryItem: {
    width: "46%" as unknown as number,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },

  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FEF9C3",
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  noteText: { flex: 1, fontSize: 13, color: "#92400E", lineHeight: 18 },
  messageCustomerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#3B82F6",
    minHeight: 44,
  },
  messageCustomerBtnDisabled: { opacity: 0.6 },
  messageCustomerBtnText: { fontSize: 14, fontWeight: "700", color: "#3B82F6" },

  issuesList: { marginTop: 12, gap: 6 },
  issuesLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 2,
  },
  issueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  issueText: { fontSize: 13, color: "#374151", flex: 1 },

  carfaxLoading: { paddingVertical: 8 },
  carfaxLoadingText: { fontSize: 13, color: "#6B7280" },
  carfaxError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  carfaxErrorText: { flex: 1, fontSize: 12, color: "#B91C1C" },
  carfaxEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  carfaxEmptyText: { flex: 1, fontSize: 13, color: "#6B7280" },
  carfaxList: { gap: 8 },
  carfaxRecordsHeader: {
    fontSize: 11,
    fontWeight: "700",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  carfaxRecord: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    gap: 8,
  },
  carfaxRecordMain: {
    flex: 1,
    gap: 4,
  },
  carfaxRecordChevron: {
    marginLeft: 4,
  },
  carfaxRecordPill: {
    marginLeft: 4,
    maxWidth: 140,
  },
  carfaxRecordMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  carfaxRecordDate: { fontSize: 13, fontWeight: "600", color: "#111827" },
  carfaxRecordOdo: { fontSize: 12, color: "#6B7280" },
  carfaxRecordText: { fontSize: 12, color: "#374151", lineHeight: 17 },
  carfaxMoreBtn: {
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    marginTop: 6,
  },
  carfaxMoreBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1D4ED8",
  },

  talkingPointRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  talkingPointText: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
    lineHeight: 20,
  },

  upsellCard: {
    backgroundColor: "#FAFAFE",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#EDE9FE",
  },
  upsellHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  upsellName: { fontSize: 14, fontWeight: "700", color: "#111827" },
  confidencePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  confidenceText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
    textTransform: "uppercase",
  },
  upsellReason: { fontSize: 13, color: "#6B7280", lineHeight: 18 },
  upsellPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: "#7C3AED",
    marginTop: 4,
  },

  noItemsText: {
    fontSize: 13,
    color: "#9CA3AF",
    fontStyle: "italic",
    paddingVertical: 8,
  },

  gotItBtn: {
    backgroundColor: "#3B82F6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 999,
    marginTop: 8,
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  gotItText: { color: "#fff", fontSize: 17, fontWeight: "700" },

  emptyContainer: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
  },
  proceedBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#3B82F6",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 999,
    marginTop: 8,
  },
  proceedText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
