import { useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type { Appointment } from "@technician/types/api";

/**
 * 2026-05-25 — extended OrderFilters with:
 *
 *   - `sortBy` + `sortDir` so the user can choose how rows are
 *     ordered. Defaults are `createdAt` + `desc` (newest job first)
 *     so same-day walk-ins surface at the top — see
 *     `DEFAULT_ORDER_SORT` below. Use the filter sheet to switch to
 *     scheduled-date ordering when needed.
 *   - `technician`, `amountRange`, `hasAddress` filter chips for
 *     more useful slicing of a large order list.
 *
 * `sortBy` + `sortDir` are NOT counted in the "active filter
 * count" badge because they don't reduce the result set — they
 * just reorder it. They're also not surfaced in the active-chip
 * row at the top of the screen for the same reason; the filter
 * sheet's Sort section is their UI.
 */
export type OrderSortBy = "scheduledDate" | "createdAt" | "amount";
export type OrderSortDir = "asc" | "desc";

export interface OrderFilters {
  status: string | null;
  payStatus: string | null;
  dateRange: string | null;
  vehicleMake: string | null;
  fleetCompany: string | null;
  hasNotes: boolean | null;
  technician: string | null;
  amountRange: string | null;
  hasAddress: boolean | null;
  sortBy: OrderSortBy;
  sortDir: OrderSortDir;
}

export const DEFAULT_ORDER_SORT: { sortBy: OrderSortBy; sortDir: OrderSortDir } = {
  sortBy: "createdAt",
  sortDir: "desc",
};

export const EMPTY_ORDER_FILTERS: OrderFilters = {
  status: null,
  payStatus: null,
  dateRange: null,
  vehicleMake: null,
  fleetCompany: null,
  hasNotes: null,
  technician: null,
  amountRange: null,
  hasAddress: null,
  sortBy: DEFAULT_ORDER_SORT.sortBy,
  sortDir: DEFAULT_ORDER_SORT.sortDir,
};

export const AMOUNT_RANGE_OPTIONS = [
  "Under $100",
  "$100 – $500",
  "$500 – $1,500",
  "Over $1,500",
] as const;

export function getActiveOrderFilterCount(f: OrderFilters): number {
  let n = 0;
  if (f.status) n += 1;
  if (f.payStatus) n += 1;
  if (f.dateRange) n += 1;
  if (f.vehicleMake) n += 1;
  if (f.fleetCompany) n += 1;
  if (f.hasNotes !== null) n += 1;
  if (f.technician) n += 1;
  if (f.amountRange) n += 1;
  if (f.hasAddress !== null) n += 1;
  // Sort is intentionally excluded — it reorders, doesn't filter.
  return n;
}

export function getActiveOrderFilterLabels(
  f: OrderFilters
): { key: keyof OrderFilters; label: string }[] {
  const labels: { key: keyof OrderFilters; label: string }[] = [];
  if (f.status) labels.push({ key: "status", label: f.status });
  if (f.payStatus) labels.push({ key: "payStatus", label: `Pay: ${f.payStatus}` });
  if (f.dateRange) labels.push({ key: "dateRange", label: f.dateRange });
  if (f.vehicleMake) labels.push({ key: "vehicleMake", label: f.vehicleMake });
  if (f.fleetCompany)
    labels.push({ key: "fleetCompany", label: f.fleetCompany });
  if (f.hasNotes !== null)
    labels.push({
      key: "hasNotes",
      label: f.hasNotes ? "Has notes" : "No notes",
    });
  if (f.technician) labels.push({ key: "technician", label: `Tech: ${f.technician}` });
  if (f.amountRange) labels.push({ key: "amountRange", label: f.amountRange });
  if (f.hasAddress !== null)
    labels.push({
      key: "hasAddress",
      label: f.hasAddress ? "Has address" : "No address",
    });
  return labels;
}

export function applyOrderFilters(
  orders: Appointment[],
  f: OrderFilters
): Appointment[] {
  return orders.filter((o) => {
    if (f.status) {
      const statusMap: Record<string, string[]> = {
        Scheduled: ["created", "confirmed", "accepted"],
        "In Progress": ["en_route", "arrived", "in_progress", "wrap_up"],
        Finalized: ["paid"],
        "Payment Due": ["completed"],
        Cancelled: ["cancelled"],
      };
      const allowed = statusMap[f.status];
      if (allowed && !allowed.includes(o.status)) return false;
    }

    if (f.payStatus) {
      const ps = (o.pay_status ?? "none").toLowerCase();
      if (ps !== f.payStatus.toLowerCase()) return false;
    }

    if (f.dateRange) {
      const d = new Date(o.scheduled_date ?? o.created_at);
      const now = new Date();
      const startOfDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );
      switch (f.dateRange) {
        case "Today":
          if (d < startOfDay) return false;
          break;
        case "This week": {
          const weekAgo = new Date(startOfDay);
          weekAgo.setDate(weekAgo.getDate() - 7);
          if (d < weekAgo) return false;
          break;
        }
        case "This month": {
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          if (d < monthStart) return false;
          break;
        }
        case "This quarter": {
          const qMonth = Math.floor(now.getMonth() / 3) * 3;
          const quarterStart = new Date(now.getFullYear(), qMonth, 1);
          if (d < quarterStart) return false;
          break;
        }
      }
    }

    if (f.vehicleMake) {
      const make = o.vehicle_make ?? o.vehicle?.make ?? "";
      if (make !== f.vehicleMake) return false;
    }

    if (f.fleetCompany) {
      if (o.fleet_company_name !== f.fleetCompany) return false;
    }

    if (f.hasNotes !== null) {
      const hasNotes = !!o.notes;
      if (f.hasNotes !== hasNotes) return false;
    }

    if (f.technician) {
      const techName = o.technician_name ?? "";
      if (techName !== f.technician) return false;
    }

    if (f.amountRange) {
      const amt = o.total_amount ?? 0;
      const inRange = (() => {
        switch (f.amountRange) {
          case "Under $100":
            return amt < 100;
          case "$100 – $500":
            return amt >= 100 && amt < 500;
          case "$500 – $1,500":
            return amt >= 500 && amt < 1500;
          case "Over $1,500":
            return amt >= 1500;
          default:
            return true;
        }
      })();
      if (!inRange) return false;
    }

    if (f.hasAddress !== null) {
      const hasAddress = !!(o.address_line && o.address_line.trim().length > 0);
      if (f.hasAddress !== hasAddress) return false;
    }

    return true;
  });
}

/**
 * 2026-05-25 — sorts the already-filtered list according to the
 * user's chosen `sortBy` + `sortDir`. Stable: when two rows compare
 * equal on the primary key (e.g. two orders booked the same day),
 * falls back to `id` DESC so the order is at least deterministic
 * across renders.
 */
export function sortOrders(
  orders: Appointment[],
  sortBy: OrderSortBy,
  sortDir: OrderSortDir
): Appointment[] {
  const mult = sortDir === "asc" ? 1 : -1;
  const keyFor = (o: Appointment): number => {
    switch (sortBy) {
      case "amount":
        return o.total_amount ?? 0;
      case "createdAt":
        return new Date(o.created_at).getTime();
      case "scheduledDate":
      default: {
        // Compose scheduled_date + scheduled_time when both present
        // so two same-day rows sort by their actual start time.
        const datePart = o.scheduled_date ?? o.created_at;
        const timePart = o.scheduled_time ?? "00:00:00";
        const ts = new Date(`${datePart}T${timePart}`).getTime();
        return Number.isFinite(ts) ? ts : new Date(o.created_at).getTime();
      }
    }
  };
  return [...orders].sort((a, b) => {
    const diff = (keyFor(a) - keyFor(b)) * mult;
    if (diff !== 0) return diff;
    // Stable tiebreaker: id DESC (newest id first).
    return b.id - a.id;
  });
}

interface FilterSectionProps {
  title: string;
  options: string[];
  selected: string | null;
  onSelect: (value: string | null) => void;
}

function FilterSection({
  title,
  options,
  selected,
  onSelect,
}: FilterSectionProps) {
  const [expanded, setExpanded] = useState(selected !== null);

  return (
    <View style={styles.section}>
      <Pressable
        style={styles.sectionHeader}
        onPress={() => setExpanded(!expanded)}
      >
        <Text
          style={[
            styles.sectionTitle,
            selected !== null && styles.sectionTitleActive,
          ]}
        >
          {title}
        </Text>
        <View style={styles.sectionRight}>
          {selected !== null && <View style={styles.activeDot} />}
          <MaterialIcons
            name={expanded ? "expand-less" : "expand-more"}
            size={24}
            color="#6B7280"
          />
        </View>
      </Pressable>
      {expanded && (
        <View style={styles.chipRow}>
          {options.map((opt) => {
            const isSelected = selected === opt;
            return (
              <Pressable
                key={opt}
                style={[styles.chip, isSelected && styles.chipSelected]}
                onPress={() => {
                  haptic.selection();
                  onSelect(isSelected ? null : opt);
                }}
              >
                <Text
                  style={[
                    styles.chipText,
                    isSelected && styles.chipTextSelected,
                  ]}
                >
                  {opt}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function BoolFilterSection({
  title,
  selected,
  onSelect,
}: {
  title: string;
  selected: boolean | null;
  onSelect: (value: boolean | null) => void;
}) {
  const [expanded, setExpanded] = useState(selected !== null);

  return (
    <View style={styles.section}>
      <Pressable
        style={styles.sectionHeader}
        onPress={() => setExpanded(!expanded)}
      >
        <Text
          style={[
            styles.sectionTitle,
            selected !== null && styles.sectionTitleActive,
          ]}
        >
          {title}
        </Text>
        <View style={styles.sectionRight}>
          {selected !== null && <View style={styles.activeDot} />}
          <MaterialIcons
            name={expanded ? "expand-less" : "expand-more"}
            size={24}
            color="#6B7280"
          />
        </View>
      </Pressable>
      {expanded && (
        <View style={styles.chipRow}>
          {(["Yes", "No"] as const).map((opt) => {
            const boolVal = opt === "Yes";
            const isSelected = selected === boolVal;
            return (
              <Pressable
                key={opt}
                style={[styles.chip, isSelected && styles.chipSelected]}
                onPress={() => {
                  haptic.selection();
                  onSelect(isSelected ? null : boolVal);
                }}
              >
                <Text
                  style={[
                    styles.chipText,
                    isSelected && styles.chipTextSelected,
                  ]}
                >
                  {opt}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

interface Props {
  visible: boolean;
  filters: OrderFilters;
  vehicleMakes: string[];
  fleetCompanyNames: string[];
  technicianNames: string[];
  onApply: (filters: OrderFilters) => void;
  onClose: () => void;
}

const SORT_BY_OPTIONS: Array<{ value: OrderSortBy; label: string }> = [
  { value: "scheduledDate", label: "Scheduled date" },
  { value: "createdAt", label: "Created date" },
  { value: "amount", label: "Amount" },
];

export function OrderFilterSheet({
  visible,
  filters,
  vehicleMakes,
  fleetCompanyNames,
  technicianNames,
  onApply,
  onClose,
}: Props) {
  const [draft, setDraft] = useState<OrderFilters>(filters);

  const update = <K extends keyof OrderFilters>(
    key: K,
    value: OrderFilters[K]
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const activeCount = useMemo(() => getActiveOrderFilterCount(draft), [draft]);

  const payStatusOptions = useMemo(
    () => ["Paid", "Unpaid", "Partial", "None"],
    []
  );

  const handleApply = () => {
    haptic.medium();
    onApply(draft);
    onClose();
  };

  const handleClear = () => {
    haptic.light();
    setDraft(EMPTY_ORDER_FILTERS);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Filters</Text>
          <View style={styles.headerActions}>
            <Pressable onPress={handleClear} style={styles.clearBtn}>
              <MaterialIcons name="more-horiz" size={24} color="#6B7280" />
            </Pressable>
            <Pressable style={styles.applyBtn} onPress={handleApply}>
              <Text style={styles.applyText}>
                Apply{activeCount > 0 ? ` (${activeCount})` : ""}
              </Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
        >
          {/* Sort section — first so it's the most visible.
              Two side-by-side row of pills: sort field + direction. */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Sort by</Text>
            </View>
            <View style={styles.chipRow}>
              {SORT_BY_OPTIONS.map((opt) => {
                const isSelected = draft.sortBy === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => {
                      haptic.selection();
                      update("sortBy", opt.value);
                    }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        isSelected && styles.chipTextSelected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.chipRow}>
              {(["desc", "asc"] as const).map((dir) => {
                const isSelected = draft.sortDir === dir;
                const label = dir === "desc" ? "Newest first" : "Oldest first";
                return (
                  <Pressable
                    key={dir}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => {
                      haptic.selection();
                      update("sortDir", dir);
                    }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        isSelected && styles.chipTextSelected,
                      ]}
                    >
                      {draft.sortBy === "amount"
                        ? dir === "desc"
                          ? "Highest first"
                          : "Lowest first"
                        : label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <FilterSection
            title="Status"
            options={[
              "Scheduled",
              "In Progress",
              "Finalized",
              "Payment Due",
              "Cancelled",
            ]}
            selected={draft.status}
            onSelect={(v) => update("status", v)}
          />
          <FilterSection
            title="Pay Status"
            options={payStatusOptions}
            selected={draft.payStatus}
            onSelect={(v) => update("payStatus", v)}
          />
          <FilterSection
            title="Date Range"
            options={[
              "Today",
              "This week",
              "This month",
              "This quarter",
              "All time",
            ]}
            selected={draft.dateRange}
            onSelect={(v) =>
              update("dateRange", v === "All time" ? null : v)
            }
          />
          {vehicleMakes.length > 0 && (
            <FilterSection
              title="Vehicle Make"
              options={vehicleMakes}
              selected={draft.vehicleMake}
              onSelect={(v) => update("vehicleMake", v)}
            />
          )}
          {fleetCompanyNames.length > 0 && (
            <FilterSection
              title="Fleet Company"
              options={fleetCompanyNames}
              selected={draft.fleetCompany}
              onSelect={(v) => update("fleetCompany", v)}
            />
          )}
          {technicianNames.length > 0 && (
            <FilterSection
              title="Technician"
              options={technicianNames}
              selected={draft.technician}
              onSelect={(v) => update("technician", v)}
            />
          )}
          <FilterSection
            title="Amount"
            options={[...AMOUNT_RANGE_OPTIONS]}
            selected={draft.amountRange}
            onSelect={(v) => update("amountRange", v)}
          />
          <BoolFilterSection
            title="Has Address"
            selected={draft.hasAddress}
            onSelect={(v) => update("hasAddress", v)}
          />
          <BoolFilterSection
            title="Has Notes"
            selected={draft.hasNotes}
            onSelect={(v) => update("hasNotes", v)}
          />
        </ScrollView>

        <Pressable style={styles.closeBar} onPress={onClose}>
          <Text style={styles.closeText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#111827" },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  clearBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  applyBtn: {
    backgroundColor: "#111827",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  applyText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 4 },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 8,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#374151" },
  sectionTitleActive: { color: "#3B82F6" },
  sectionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#3B82F6",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  chipSelected: {
    backgroundColor: "#EFF6FF",
    borderColor: "#3B82F6",
  },
  chipText: { fontSize: 14, fontWeight: "500", color: "#374151" },
  chipTextSelected: { color: "#3B82F6", fontWeight: "600" },
  closeBar: {
    padding: 20,
    paddingBottom: 40,
    alignItems: "center",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  closeText: { fontSize: 16, fontWeight: "600", color: "#6B7280" },
});
