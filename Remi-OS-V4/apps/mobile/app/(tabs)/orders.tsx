import { useState, useMemo, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  TextInput,
  Alert,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  useJobs,
  useFranchiseOrders,
  useOrderSearch,
  useSendReceipt,
  useTagForReview,
  useBulkMarkPaid,
} from "@technician/hooks/jobs/use-jobs";
import { useFleetCompanies } from "@technician/hooks/inventory/use-fleet";
import { useAllFleetDueSoon } from "@technician/hooks/use-fleet-due-soon";
import { useAuthStore } from "@/src/stores/auth";
import { OrderCard } from "@technician/components/order/order-card";
import { OrderNoteSheet } from "@technician/components/order/order-note-sheet";
import { FleetCompanyCard } from "@technician/components/fleet/fleet-company-card";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";
import { SwipeableRow } from "@/src/components/shared/swipeable-row";
import type { SwipeAction } from "@/src/components/shared/swipeable-row";
import { BulkActionBar } from "@/src/components/shared/bulk-action-bar";
import type { BulkAction } from "@/src/components/shared/bulk-action-bar";
import {
  OrderFilterSheet,
  EMPTY_ORDER_FILTERS,
  getActiveOrderFilterCount,
  getActiveOrderFilterLabels,
  applyOrderFilters,
  sortOrders,
} from "@technician/components/order/order-filter-sheet";
import type { OrderFilters } from "@technician/components/order/order-filter-sheet";
import { StatusColors } from "@technician/constants/colors";
import { UserRole } from "@technician/types/enums";
import type { FleetCompany, FleetDashboard, Appointment } from "@technician/types/api";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { extractErrorMessage } from "@technician/api/errors";
import {
  useExportCsv,
  useExportPdf,
} from "@technician/hooks/orders/use-order-export";
import { summarizeReceiptExportErrors } from "@technician/utils/summarize-receipt-export-errors";

type SubTab = "orders" | "fleet";

type BulkMarkPaidResultRow = {
  id: number;
  status: string;
  reason?: string;
};

// Maps an appointment status (the `from` half of "from → paid") to
// sentence-form clauses keyed for subject-verb agreement. The state machine
// only allows `completed → paid`, so every other state needs an
// explanation of what's blocking the transition. Two clause forms so we
// can drop them into either:
//   - "it <singular>" / "this order <singular>"        (1 row failed)
//   - "they <plural>" / "<n> orders <plural>"          (≥ 2 rows failed)
// Tips are always subjectless imperatives so they compose cleanly with
// either form.
const STATUS_LABELS: Record<
  string,
  { singular: string; plural: string; tip: string }
> = {
  created:     { singular: "hasn't been confirmed yet", plural: "haven't been confirmed yet", tip: "Confirm and complete the job first." },
  confirmed:   { singular: "hasn't been started yet",   plural: "haven't been started yet",   tip: "Complete the job first." },
  accepted:    { singular: "hasn't been started yet",   plural: "haven't been started yet",   tip: "Complete the job first." },
  en_route:    { singular: "is still in transit",       plural: "are still in transit",       tip: "Finish the job before marking paid." },
  arrived:     { singular: "hasn't started yet",        plural: "haven't started yet",        tip: "Complete the job first." },
  in_progress: { singular: "is still in progress",      plural: "are still in progress",      tip: "Finish the job, then mark paid." },
  wrap_up:     { singular: "is wrapping up",            plural: "are wrapping up",            tip: "Complete the job first." },
  cancelled:   { singular: "was cancelled",             plural: "were cancelled",             tip: "Cancelled orders can't be paid." },
  no_show:     { singular: "was marked no-show",        plural: "were marked no-show",        tip: "No-show orders can't be paid." },
};

// Parses the BE's verbose state-machine error
// ("Invalid appointment transition: <from> → paid. Valid transitions from <from>: [...]")
// down to the `from` status. Returns null if the message doesn't match
// (e.g., a non-transition error like a DB failure) so the caller can fall
// back to a generic "couldn't be processed" bucket.
function extractFromStatus(reason: string | undefined): string | null {
  if (!reason) return null;
  const m = reason.match(/Invalid appointment transition:\s*(\w+)\s*[→-]>?\s*paid/i);
  return m?.[1]?.toLowerCase() ?? null;
}

function naturalJoin(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

// Builds the alert title + body for a bulk-mark-paid response. Optimizes
// for the common case (all failed for one reason) by rendering a single
// human sentence — "None of these orders are ready to be paid — they
// haven't been confirmed yet. Confirm and complete the job first." —
// and degrades gracefully into a comma-joined sentence when the failure
// set is mixed. The shape is the same for the single-row swipe path
// (`totalRequested === 1`) so we never have to maintain two copies.
function summarizeBulkMarkPaid(
  data: BulkMarkPaidResultRow[],
  totalRequested: number,
): { title: string; body: string } {
  const paid = data.filter((r) => r.status === "paid").length;
  const alreadyPaid = data.filter((r) => r.status === "skipped").length;
  const errors = data.filter((r) => r.status === "error");
  const isSingle = totalRequested === 1;

  const grouped = new Map<string, number>();
  const unparsed: string[] = [];
  for (const e of errors) {
    const from = extractFromStatus(e.reason);
    if (from && STATUS_LABELS[from]) {
      grouped.set(from, (grouped.get(from) ?? 0) + 1);
    } else {
      unparsed.push(e.reason ?? "an unknown error");
    }
  }
  const groups = [...grouped.entries()];
  const isSingleReason = groups.length === 1 && unparsed.length === 0;

  // 1. Pure success.
  if (errors.length === 0 && alreadyPaid === 0) {
    return {
      title: "Marked Paid",
      body: isSingle ? "Order marked paid." : `${paid} orders marked paid.`,
    };
  }

  // 2. Success + some already-paid (no errors).
  if (errors.length === 0 && paid > 0 && alreadyPaid > 0) {
    return {
      title: "Marked Paid",
      body: `${paid} ${paid === 1 ? "order was" : "orders were"} marked paid; ${alreadyPaid} ${alreadyPaid === 1 ? "was" : "were"} already paid.`,
    };
  }

  // 3. Everything was already paid — informational, not a failure.
  if (paid === 0 && errors.length === 0) {
    return {
      title: "Already Paid",
      body: isSingle
        ? "This order was already paid."
        : `All ${alreadyPaid} of these orders were already paid.`,
    };
  }

  // 4. All failed for a single reason — the canonical sentence form.
  if (paid === 0 && alreadyPaid === 0 && isSingleReason) {
    const [from] = groups[0];
    const { singular, plural, tip } = STATUS_LABELS[from];
    if (isSingle) {
      return {
        title: "Mark Paid",
        body: `This order isn't ready to be paid — it ${singular}. ${tip}`,
      };
    }
    return {
      title: "Mark Paid",
      body: `None of these orders are ready to be paid — they ${plural}. ${tip}`,
    };
  }

  // 5. Partial success, single reason among the failures.
  if (paid > 0 && alreadyPaid === 0 && isSingleReason) {
    const [from, n] = groups[0];
    const { singular, plural, tip } = STATUS_LABELS[from];
    const subject = n === 1 ? "The other" : `The other ${n}`;
    const clause = n === 1 ? singular : plural;
    return {
      title: `Mark Paid — ${paid} of ${totalRequested}`,
      body: `${subject} ${clause}. ${tip}`,
    };
  }

  // 6. Mixed reasons. Compose "<n> <clause> and <n> <clause>, so …".
  // Tips are dropped here because stacking "Confirm…; Finish…; Cancelled
  // orders…" reads worse than letting the explicit reason list speak for
  // itself.
  const parts: string[] = [];
  for (const [from, n] of groups) {
    const { singular, plural } = STATUS_LABELS[from];
    parts.push(`${n} ${n === 1 ? singular : plural}`);
  }
  if (unparsed.length > 0) {
    parts.push(`${unparsed.length} couldn't be processed`);
  }
  if (alreadyPaid > 0) {
    parts.push(`${alreadyPaid} ${alreadyPaid === 1 ? "was" : "were"} already paid`);
  }
  const joined = naturalJoin(parts);

  if (paid > 0) {
    return {
      title: `Mark Paid — ${paid} of ${totalRequested}`,
      body: `${joined}, so only ${paid} ${paid === 1 ? "was" : "were"} marked paid.`,
    };
  }
  const subject = isSingle
    ? "This order isn't ready to be paid"
    : "None of these orders are ready to be paid";
  return { title: "Mark Paid", body: `${subject} — ${joined}.` };
}

export default function OrdersScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SubTab>("orders");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterVisible, setFilterVisible] = useState(false);
  const [filters, setFilters] = useState<OrderFilters>(EMPTY_ORDER_FILTERS);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const user = useAuthStore((s) => s.user);
  const isFranchiseOwner = user?.role === UserRole.FRANCHISE_OWNER;
  const franchiseId = user?.franchiseId ?? 0;

  const techJobs = useJobs();
  // 2026-05-25 — franchiseOrders is now a paginated infinite query;
  // see `useFranchiseOrders` docblock. The screen treats `data` as
  // the flat list of all loaded pages and triggers `fetchNextPage`
  // when scroll nears the bottom.
  const franchiseOrders = useFranchiseOrders(
    isFranchiseOwner ? franchiseId : 0
  );
  const searchResults = useOrderSearch(searchQuery);
  const sendReceipt = useSendReceipt();
  const exportCsv = useExportCsv();
  const exportPdf = useExportPdf();
  const bulkMarkPaid = useBulkMarkPaid();
  // Phase 6 Chunk 6.1.1 — the `useExportReceipts` consumer + the
  // dedicated "Receipts" bulk-action button were removed when both
  // role-scoped `/orders/export-pdf` BE controllers were re-routed to
  // `receiptService.generateBatchReceiptPdf` (the same code path the
  // Chunk 4.4 receipts endpoint uses). Both roles now hit the existing
  // "PDF" button and get a Droptop-parity combined PDF directly.
  // `summarizeReceiptExportErrors` is wired into `useExportPdf`'s error
  // path below so FOs get the same actionable structured-error UX
  // technicians used to get from the dropped Receipts button.
  const tagForReview = useTagForReview();
  // D2P-FE-4 — `OrderNoteSheet` is a self-controlled native
  // `<Modal presentationStyle="pageSheet">`. No ref, no snap. Set
  // `noteTarget` to mount the modal; clear it via `onClose` to
  // dismiss. See OrderNoteSheet docblock for why we abandoned the
  // gorhom `BottomSheet` approach (Reanimated 4 worklet bug).
  const [noteTarget, setNoteTarget] = useState<{ id: number; name: string } | null>(null);

  const jobsQuery = isFranchiseOwner ? franchiseOrders : techJobs;
  const { data: jobs = [], isLoading, isRefetching, refetch } = jobsQuery;

  // Walk-in jobs are created on the Start Job tab; refetch when the
  // Orders tab gains focus so a just-finished job appears without pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const isSearching = searchQuery.length >= 2;
  const displayData = isSearching ? (searchResults.data ?? []) : jobs;

  const filtered = useMemo(
    () => applyOrderFilters(displayData, filters),
    [displayData, filters]
  );

  // 2026-05-25 — sort by `filters.sortBy` + `filters.sortDir` (default
  // `createdAt` + `desc`). New walk-ins appear at the top; switch to
  // scheduled-date sort in the filter sheet when needed.
  const sorted = useMemo(
    () => sortOrders(filtered, filters.sortBy, filters.sortDir),
    [filtered, filters.sortBy, filters.sortDir]
  );

  const activeFilterCount = useMemo(
    () => getActiveOrderFilterCount(filters),
    [filters]
  );
  const activeFilterLabels = useMemo(
    () => getActiveOrderFilterLabels(filters),
    [filters]
  );

  const vehicleMakes = useMemo(() => {
    const makes = new Set<string>();
    jobs.forEach((j) => {
      const make = j.vehicle_make ?? j.vehicle?.make;
      if (make) makes.add(make);
    });
    return Array.from(makes).sort();
  }, [jobs]);

  const fleetCompanyNames = useMemo(() => {
    const names = new Set<string>();
    jobs.forEach((j) => {
      if (j.fleet_company_name) names.add(j.fleet_company_name);
    });
    return Array.from(names).sort();
  }, [jobs]);

  const technicianNames = useMemo(() => {
    const names = new Set<string>();
    jobs.forEach((j) => {
      if (j.technician_name) names.add(j.technician_name);
    });
    return Array.from(names).sort();
  }, [jobs]);

  // --- Swipe action handlers ---

  const handleCall = useCallback((item: Appointment) => {
    const phone = item.customer?.phone;
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    } else {
      Alert.alert("No Phone", "No phone number on file for this customer.");
    }
  }, []);

  const handleNavigate = useCallback((item: Appointment) => {
    const address = [item.address_line, item.address_city]
      .filter(Boolean)
      .join(", ");
    if (address) {
      Linking.openURL(
        `comgooglemaps://?daddr=${encodeURIComponent(address)}&directionsmode=driving`
      ).catch(() =>
        Linking.openURL(
          `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
        )
      );
    } else {
      Alert.alert("No Address", "No address on file for this appointment.");
    }
  }, []);

  const handleMarkComplete = useCallback(
    (item: Appointment) => {
      const who =
        item.customer_name ??
        item.customer?.full_name ??
        `Customer #${item.customer_id}`;
      Alert.alert(
        "Mark Paid",
        `Mark ${who}'s order (#${item.id}) as paid?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Mark Paid",
            onPress: () => {
              bulkMarkPaid.mutate([item.id], {
                onSuccess: (data) => {
                  // The BE returns 200 with a per-row error envelope when an
                  // appointment can't transition to "paid" (e.g., it's not
                  // yet completed). Don't fire the success haptic + refetch
                  // unless the row actually transitioned, otherwise the user
                  // gets silent-success behavior on a no-op.
                  const row = data[0];
                  if (row?.status === "paid") {
                    haptic.success();
                    refetch();
                    return;
                  }
                  const { title, body } = summarizeBulkMarkPaid(data, 1);
                  haptic.error();
                  Alert.alert(title, body);
                },
                onError: (e) => Alert.alert("Error", extractErrorMessage(e)),
              });
            },
          },
        ]
      );
    },
    [bulkMarkPaid, refetch]
  );

  const handleReschedule = useCallback(
    (item: Appointment) => {
      router.push({
        pathname: "/order/[id]",
        params: { id: String(item.id), action: "reschedule" },
      });
    },
    [router]
  );

  const handleAddNote = useCallback((item: Appointment) => {
    console.log("[NOTE-DEBUG] handleAddNote → setNoteTarget", { id: item.id });
    setNoteTarget({
      id: item.id,
      name: item.customer_name ?? "Customer",
    });
  }, []);

  // --- Swipe action builders ---

  const buildLeftActions = useCallback(
    (item: Appointment): SwipeAction[] => [
      {
        key: "reschedule",
        icon: "event",
        label: "Reschedule",
        color: StatusColors.scheduled,
        onPress: () => handleReschedule(item),
      },
      {
        key: "note",
        icon: "note-add",
        label: "Add Note",
        color: StatusColors.cancelled,
        onPress: () => handleAddNote(item),
      },
    ],
    [handleReschedule, handleAddNote]
  );

  const buildRightActions = useCallback(
    (item: Appointment): SwipeAction[] => [
      {
        key: "call",
        icon: "phone",
        label: "Call",
        color: StatusColors.finalized,
        onPress: () => handleCall(item),
      },
      {
        key: "navigate",
        icon: "navigation",
        label: "Navigate",
        color: StatusColors.inProgress,
        onPress: () => handleNavigate(item),
      },
      {
        key: "complete",
        icon: "check-circle",
        label: "Complete",
        color: "#8B5CF6",
        onPress: () => handleMarkComplete(item),
      },
    ],
    [handleCall, handleNavigate, handleMarkComplete]
  );

  // --- Bulk mode ---

  const enterBulkMode = useCallback(
    (id: number) => {
      haptic.medium();
      setBulkMode(true);
      setSelectedIds(new Set([id]));
    },
    []
  );

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitBulkMode = useCallback(() => {
    setBulkMode(false);
    setSelectedIds(new Set());
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(sorted.map((o) => o.id)));
  }, [sorted]);

  const selectedTotal = useMemo(() => {
    let sum = 0;
    sorted.forEach((o) => {
      if (selectedIds.has(o.id) && o.total_amount) sum += o.total_amount;
    });
    return sum;
  }, [sorted, selectedIds]);

  // --- Bulk action handlers ---

  const handleBulkExportCsv = useCallback(() => {
    exportCsv.mutate([...selectedIds]);
  }, [exportCsv, selectedIds]);

  // Phase 6 Chunk 6.1.1 — `handleBulkExportPdf` now consumes the same
  // structured error path the dropped "Receipts" button used to. Both
  // role-scoped `/orders/export-pdf` controllers reject with
  // 422/404/403/400 + `data.{missing_ids|cross_franchise_ids|non_paid_ids}`
  // for misshapen / cross-franchise / non-paid selections; the
  // summarizer narrows the AxiosError and turns each shape into
  // actionable copy. Success drops out of bulk mode so the user sees
  // the list state back to normal on share-sheet dismissal.
  const handleBulkExportPdf = useCallback(() => {
    exportPdf.mutate([...selectedIds], {
      onError: (e) => {
        const { title, body } = summarizeReceiptExportErrors(e);
        haptic.error();
        Alert.alert(title, body);
      },
      onSuccess: () => {
        haptic.success();
        exitBulkMode();
      },
    });
  }, [exportPdf, selectedIds, exitBulkMode]);

  const handleBulkSendNotification = useCallback(() => {
    Alert.alert(
      "Send Notification",
      `Send notification for ${selectedIds.size} order(s)?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Email All",
          onPress: () => {
            const ids = [...selectedIds];
            let sent = 0;
            ids.forEach((id) =>
              sendReceipt.mutate(
                { jobId: id, method: "email" },
                {
                  onSuccess: () => {
                    sent++;
                    if (sent === ids.length) {
                      Alert.alert("Done", `${sent} notification(s) sent.`);
                      exitBulkMode();
                    }
                  },
                  onError: (e) =>
                    Alert.alert("Error", extractErrorMessage(e)),
                }
              )
            );
          },
        },
      ]
    );
  }, [sendReceipt, selectedIds, exitBulkMode]);

  const handleBulkReschedule = useCallback(() => {
    Alert.alert(
      "Reschedule",
      `Reschedule ${selectedIds.size} order(s)?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reschedule",
          onPress: () => {
            // TODO: Backend bulk reschedule endpoint
            Alert.alert("Coming Soon", "Bulk reschedule is not yet available.");
          },
        },
      ]
    );
  }, [selectedIds]);

  const handleBulkReassign = useCallback(() => {
    Alert.alert(
      "Reassign",
      `Reassign ${selectedIds.size} order(s) to another technician?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reassign",
          onPress: () => {
            // TODO: Backend bulk reassign endpoint
            Alert.alert("Coming Soon", "Bulk reassign is not yet available.");
          },
        },
      ]
    );
  }, [selectedIds]);

  const handleBulkMarkPaid = useCallback(() => {
    Alert.alert(
      "Mark Paid",
      `Mark ${selectedIds.size} order(s) as paid?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () =>
            bulkMarkPaid.mutate([...selectedIds], {
              onSuccess: (data) => {
                // The BE's per-id loop returns 200 with `{ status: "paid"
                // | "skipped" | "error", reason }` per appointment — never
                // throws. The state machine only allows `completed →
                // paid`, so any order still in created / confirmed /
                // in_progress / wrap_up comes back as an error row with a
                // verbose state-machine reason. `summarizeBulkMarkPaid`
                // groups those reasons into human language and tells the
                // user what they need to do first; see STATUS_LABELS at
                // the top of this file for the per-state copy.
                const requested = selectedIds.size;
                const { title, body } = summarizeBulkMarkPaid(data, requested);
                Alert.alert(title, body);
                exitBulkMode();
                refetch();
              },
              onError: (e) =>
                Alert.alert("Error", extractErrorMessage(e)),
            }),
        },
      ]
    );
  }, [bulkMarkPaid, selectedIds, exitBulkMode, refetch]);

  const handleBulkTagReview = useCallback(() => {
    tagForReview.mutate([...selectedIds], {
      onSuccess: (data) => {
        Alert.alert("Tagged", `${data.tagged} order(s) tagged for review.`);
        exitBulkMode();
        refetch();
      },
      onError: (e) => Alert.alert("Error", extractErrorMessage(e)),
    });
  }, [tagForReview, selectedIds, exitBulkMode, refetch]);

  const bulkActions: BulkAction[] = useMemo(
    () => [
      { key: "reassign", icon: "swap-horiz", label: "Reassign", color: "#3B82F6", onPress: handleBulkReassign },
      { key: "reschedule", icon: "event", label: "Reschedule", color: StatusColors.scheduled, onPress: handleBulkReschedule },
      { key: "export-csv", icon: "table-chart", label: "CSV", color: "#0EA5E9", onPress: handleBulkExportCsv },
      // Phase 6 Chunk 6.1.1 — single canonical "PDF" button. Both
      // technician + franchise routes now produce a Droptop-parity
      // combined PDF (one receipt per page, in input order). The
      // separate "Receipts" button + `useExportReceipts` consumer
      // were dropped — the existing button hits the same code path.
      // Disabled while pending so the user can't double-tap during
      // the ~10s wall-time of an N=20 render.
      {
        key: "export-pdf",
        icon: "picture-as-pdf",
        label: "PDF",
        color: "#DC2626",
        onPress: handleBulkExportPdf,
        disabled: exportPdf.isPending,
      },
      { key: "notify", icon: "send", label: "Notify", color: "#8B5CF6", onPress: handleBulkSendNotification },
      { key: "mark-paid", icon: "payments", label: "Mark Paid", color: StatusColors.finalized, onPress: handleBulkMarkPaid },
      { key: "review", icon: "flag", label: "Review", color: "#6366F1", onPress: handleBulkTagReview },
    ],
    [handleBulkReassign, handleBulkReschedule, handleBulkExportCsv, handleBulkExportPdf, exportPdf.isPending, handleBulkSendNotification, handleBulkMarkPaid, handleBulkTagReview]
  );

  const clearFilter = (key: keyof OrderFilters) => {
    setFilters((prev) => ({ ...prev, [key]: null }));
  };

  if (isLoading && !isRefetching) {
    return <SkeletonListScreen />;
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      {isFranchiseOwner ? (
        <View style={styles.tabBar}>
          <Pressable
            style={[styles.tab, activeTab === "orders" && styles.tabActive]}
            onPress={() => setActiveTab("orders")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "orders" && styles.tabTextActive,
              ]}
            >
              Orders
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === "fleet" && styles.tabActive]}
            onPress={() => setActiveTab("fleet")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "fleet" && styles.tabTextActive,
              ]}
            >
              Fleet Manager
            </Text>
          </Pressable>
        </View>
      ) : null}

      {activeTab === "orders" || !isFranchiseOwner ? (
        <>
          <View style={styles.searchRow}>
            <View style={styles.searchBar}>
              <MaterialIcons name="search" size={20} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search orders..."
                placeholderTextColor="#9CA3AF"
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <Pressable
                  onPress={() => setSearchQuery("")}
                  hitSlop={8}
                >
                  <MaterialIcons name="close" size={20} color="#9CA3AF" />
                </Pressable>
              )}
            </View>
            <Pressable
              style={[
                styles.filterBtn,
                activeFilterCount > 0 && styles.filterBtnActive,
              ]}
              onPress={() => {
                haptic.selection();
                setFilterVisible(true);
              }}
            >
              <MaterialIcons
                name="tune"
                size={22}
                color={activeFilterCount > 0 ? "#3B82F6" : "#6B7280"}
              />
              {activeFilterCount > 0 && (
                <View style={styles.filterCountBadge}>
                  <Text style={styles.filterCountText}>
                    {activeFilterCount}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>

          {activeFilterLabels.length > 0 && (
            <View style={styles.chipBar}>
              {activeFilterLabels.map(({ key, label }) => (
                <Pressable
                  key={key}
                  style={styles.activeChip}
                  onPress={() => clearFilter(key)}
                >
                  <Text style={styles.activeChipText}>{label}</Text>
                  <MaterialIcons name="close" size={14} color="#3B82F6" />
                </Pressable>
              ))}
            </View>
          )}

          {isSearching && searchResults.isLoading && (
            <View style={styles.searchingBar}>
              <Text style={styles.searchingText}>Searching...</Text>
            </View>
          )}

          <FlatList
            data={sorted}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
            }
            // 2026-05-25 — infinite scroll: fetch the next 50 rows
            // when the user scrolls within ~half a viewport of the
            // bottom. Only fires for the franchise-owner role; the
            // tech `useJobs` hook is small (their own jobs) and
            // doesn't paginate. Search results route through a
            // separate hook with its own LIMIT so they don't
            // paginate either.
            onEndReached={() => {
              if (
                isFranchiseOwner &&
                !isSearching &&
                "hasNextPage" in jobsQuery &&
                jobsQuery.hasNextPage &&
                !jobsQuery.isFetchingNextPage
              ) {
                jobsQuery.fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              isFranchiseOwner &&
              !isSearching &&
              "isFetchingNextPage" in jobsQuery &&
              jobsQuery.isFetchingNextPage ? (
                <View style={styles.loadingMore}>
                  <Text style={styles.loadingMoreText}>Loading more orders…</Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <SwipeableRow
                leftActions={buildLeftActions(item)}
                rightActions={buildRightActions(item)}
                enabled={!bulkMode}
              >
                <OrderCard
                  appointment={item}
                  onPress={() => router.push(`/order/${item.id}`)}
                  onLongPress={() => enterBulkMode(item.id)}
                  bulkMode={bulkMode}
                  isSelected={selectedIds.has(item.id)}
                  onToggleSelect={() => toggleSelect(item.id)}
                />
              </SwipeableRow>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <MaterialIcons
                  name="receipt-long"
                  size={48}
                  color="#D1D5DB"
                />
                <Text style={styles.emptyTitle}>
                  {isSearching ? "No results" : "No orders yet"}
                </Text>
                <Text style={styles.emptySubtext}>
                  {isSearching
                    ? "Try a different search term."
                    : "Complete a job to see it here."}
                </Text>
              </View>
            }
          />

          <OrderFilterSheet
            visible={filterVisible}
            filters={filters}
            vehicleMakes={vehicleMakes}
            fleetCompanyNames={fleetCompanyNames}
            technicianNames={technicianNames}
            onApply={setFilters}
            onClose={() => setFilterVisible(false)}
          />

          {noteTarget && (
            <OrderNoteSheet
              key={`note-sheet-${noteTarget.id}`}
              appointmentId={noteTarget.id}
              customerName={noteTarget.name}
              onClose={() => setNoteTarget(null)}
            />
          )}

          {bulkMode && (
            <BulkActionBar
              selectedCount={selectedIds.size}
              totalAmount={selectedTotal}
              actions={bulkActions}
              onSelectAll={selectAll}
              onDone={exitBulkMode}
            />
          )}
        </>
      ) : (
        <FleetManagerTab />
      )}
    </GestureHandlerRootView>
  );
}

/**
 * 2026-05-25 — uses the batched aggregates that
 * `/franchise/fleet/companies` now returns inline on each company
 * row, instead of issuing a per-row `useFleetDashboard` call. See
 * `app/fleet/index.tsx::FleetCompanyListItem` for the matching
 * pattern + rationale.
 */
function FleetCompanyRow({
  company,
  onPress,
}: {
  company: FleetCompany;
  onPress: () => void;
}) {
  const displayDashboard: FleetDashboard = {
    company_id: company.id,
    company_name: company.name,
    vehicle_count: company.vehicle_count ?? 0,
    overdue_count: 0,
    upcoming_due_count: 0,
    last_service_date: company.last_service_date ?? null,
    total_spend: company.total_spend ?? 0,
  };
  return <FleetCompanyCard dashboard={displayDashboard} onPress={onPress} />;
}

function DueSoonBanner() {
  const router = useRouter();
  const { data, isLoading } = useAllFleetDueSoon();

  const totalCount = data?.total_count ?? 0;
  const overdueCount = data?.overdue.length ?? 0;
  const due7Count = data?.due_7.length ?? 0;

  const subtitle = isLoading
    ? "Loading…"
    : totalCount === 0
      ? "All fleet vehicles caught up"
      : `${overdueCount} overdue · ${due7Count} due in 7 days`;

  return (
    <Pressable
      style={styles.dueSoonBanner}
      onPress={() => {
        haptic.selection();
        router.push("/fleet/due-soon");
      }}
      accessibilityRole="button"
      accessibilityLabel="Open Fleet Due Soon — bulk nudge"
    >
      <View style={styles.dueSoonIconWrap}>
        <MaterialIcons name="notification-important" size={22} color="#fff" />
      </View>
      <View style={styles.dueSoonText}>
        <Text style={styles.dueSoonTitle}>Due Soon Across Fleet</Text>
        <Text style={styles.dueSoonSubtitle}>{subtitle}</Text>
      </View>
      {totalCount > 0 ? (
        <View style={styles.dueSoonCountBadge}>
          <Text style={styles.dueSoonCountText}>{totalCount}</Text>
        </View>
      ) : null}
      <MaterialIcons name="chevron-right" size={22} color="#9CA3AF" />
    </Pressable>
  );
}

function FleetManagerTab() {
  const router = useRouter();
  const {
    data: companies = [],
    isLoading,
    isRefetching,
    refetch,
    error,
  } = useFleetCompanies();

  if (isLoading && !isRefetching) {
    return <SkeletonListScreen />;
  }

  const emptyMessage = error
    ? `Error loading fleet data: ${(error as Error).message ?? "Unknown error"}`
    : "Fleet companies will appear here once configured.";

  return (
    <FlatList
      data={companies}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={<DueSoonBanner />}
      renderItem={({ item }) => (
        <FleetCompanyRow
          company={item}
          onPress={() => router.push(`/fleet/${item.company_id ?? item.id}`)}
        />
      )}
      contentContainerStyle={styles.fleetList}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
      }
      ListEmptyComponent={
        <View style={styles.fleetEmpty}>
          <MaterialIcons
            name={error ? "error-outline" : "local-shipping"}
            size={56}
            color={error ? "#EF4444" : "#D1D5DB"}
          />
          <Text style={styles.emptyTitle}>
            {error ? "Fleet Unavailable" : "No Fleet Accounts"}
          </Text>
          <Text style={styles.emptySubtext}>{emptyMessage}</Text>
          {error ? (
            <Pressable
              style={{
                marginTop: 16,
                backgroundColor: "#3B82F6",
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 8,
              }}
              onPress={() => refetch()}
            >
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>
                Retry
              </Text>
            </Pressable>
          ) : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: "#3B82F6" },
  tabText: { fontSize: 15, fontWeight: "600", color: "#9CA3AF" },
  tabTextActive: { color: "#3B82F6" },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    paddingVertical: 0,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  filterBtnActive: {
    borderColor: "#3B82F6",
    backgroundColor: "#EFF6FF",
  },
  filterCountBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#3B82F6",
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  filterCountText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  chipBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 6,
  },
  activeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  activeChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#3B82F6",
  },
  searchingBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchingText: {
    fontSize: 13,
    color: "#9CA3AF",
    fontStyle: "italic",
  },

  list: { padding: 16, paddingBottom: 24 },
  loadingMore: { paddingVertical: 16, alignItems: "center" },
  loadingMoreText: { fontSize: 13, color: "#9CA3AF", fontWeight: "500" },
  empty: {
    alignItems: "center",
    paddingTop: 80,
    gap: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#374151" },
  emptySubtext: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    paddingHorizontal: 40,
  },

  fleetList: { padding: 16, paddingBottom: 24 },
  fleetEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingTop: 80,
    gap: 12,
  },

  dueSoonBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#EF4444",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    gap: 12,
  },
  dueSoonIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  dueSoonText: {
    flex: 1,
    gap: 2,
  },
  dueSoonTitle: { fontSize: 15, fontWeight: "700", color: "#111827" },
  dueSoonSubtitle: { fontSize: 12, color: "#6B7280", fontWeight: "500" },
  dueSoonCountBadge: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    minWidth: 28,
    alignItems: "center",
  },
  dueSoonCountText: { fontSize: 13, fontWeight: "800", color: "#EF4444" },
});
