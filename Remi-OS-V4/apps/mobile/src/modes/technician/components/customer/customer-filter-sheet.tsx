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

export interface CustomerFilters {
  lastVisited: string | null;
  hasntVisited: string | null;
  visitFrequency: string | null;
  vehicleMake: string | null;
  hasDeferredWork: boolean | null;
  creationSource: string | null;
}

export const EMPTY_FILTERS: CustomerFilters = {
  lastVisited: null,
  hasntVisited: null,
  visitFrequency: null,
  vehicleMake: null,
  hasDeferredWork: null,
  creationSource: null,
};

export function getActiveFilterCount(f: CustomerFilters): number {
  return Object.values(f).filter((v) => v !== null).length;
}

export function getActiveFilterLabels(f: CustomerFilters): { key: keyof CustomerFilters; label: string }[] {
  const labels: { key: keyof CustomerFilters; label: string }[] = [];
  if (f.lastVisited) labels.push({ key: "lastVisited", label: `Visited: ${f.lastVisited}` });
  if (f.hasntVisited) labels.push({ key: "hasntVisited", label: `Inactive: ${f.hasntVisited}` });
  if (f.visitFrequency) labels.push({ key: "visitFrequency", label: f.visitFrequency });
  if (f.vehicleMake) labels.push({ key: "vehicleMake", label: f.vehicleMake });
  if (f.hasDeferredWork !== null) labels.push({ key: "hasDeferredWork", label: f.hasDeferredWork ? "Has deferred work" : "No deferred work" });
  if (f.creationSource) labels.push({ key: "creationSource", label: f.creationSource.charAt(0).toUpperCase() + f.creationSource.slice(1).replace("_", "-") });
  return labels;
}

interface FilterSectionProps {
  title: string;
  options: string[];
  selected: string | null;
  onSelect: (value: string | null) => void;
}

function FilterSection({ title, options, selected, onSelect }: FilterSectionProps) {
  const [expanded, setExpanded] = useState(selected !== null);

  return (
    <View style={styles.section}>
      <Pressable
        style={styles.sectionHeader}
        onPress={() => setExpanded(!expanded)}
      >
        <Text style={[styles.sectionTitle, selected !== null && styles.sectionTitleActive]}>
          {title}
        </Text>
        <View style={styles.sectionRight}>
          {selected !== null && (
            <View style={styles.activeDot} />
          )}
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
                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
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

interface BoolFilterSectionProps {
  title: string;
  selected: boolean | null;
  onSelect: (value: boolean | null) => void;
}

function BoolFilterSection({ title, selected, onSelect }: BoolFilterSectionProps) {
  const [expanded, setExpanded] = useState(selected !== null);

  return (
    <View style={styles.section}>
      <Pressable
        style={styles.sectionHeader}
        onPress={() => setExpanded(!expanded)}
      >
        <Text style={[styles.sectionTitle, selected !== null && styles.sectionTitleActive]}>
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
                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
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
  filters: CustomerFilters;
  vehicleMakes: string[];
  onApply: (filters: CustomerFilters) => void;
  onClose: () => void;
}

export function CustomerFilterSheet({ visible, filters, vehicleMakes, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<CustomerFilters>(filters);

  const update = <K extends keyof CustomerFilters>(key: K, value: CustomerFilters[K]) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "lastVisited" && value !== null) next.hasntVisited = null;
      if (key === "hasntVisited" && value !== null) next.lastVisited = null;
      return next;
    });
  };

  const activeCount = useMemo(() => getActiveFilterCount(draft), [draft]);

  const handleApply = () => {
    haptic.medium();
    onApply(draft);
    onClose();
  };

  const handleClear = () => {
    haptic.light();
    setDraft(EMPTY_FILTERS);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
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

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <FilterSection
            title="Last Visited"
            options={["This week", "This month", "This quarter"]}
            selected={draft.lastVisited}
            onSelect={(v) => update("lastVisited", v)}
          />
          <FilterSection
            title="Hasn't Visited"
            options={["30+ days", "60+ days", "90+ days"]}
            selected={draft.hasntVisited}
            onSelect={(v) => update("hasntVisited", v)}
          />
          <FilterSection
            title="Visit Frequency"
            options={["First-time", "Repeat (2-5)", "Loyal (5+)"]}
            selected={draft.visitFrequency}
            onSelect={(v) => update("visitFrequency", v)}
          />
          {vehicleMakes.length > 0 && (
            <FilterSection
              title="Vehicle Make"
              options={vehicleMakes}
              selected={draft.vehicleMake}
              onSelect={(v) => update("vehicleMake", v)}
            />
          )}
          <BoolFilterSection
            title="Has Deferred Work"
            selected={draft.hasDeferredWork}
            onSelect={(v) => update("hasDeferredWork", v)}
          />
          <FilterSection
            title="Creation Source"
            options={["Walk-in", "Booked", "Referral"]}
            selected={draft.creationSource}
            onSelect={(v) => update("creationSource", v)}
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
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
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
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
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
  applyText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
    gap: 4,
  },
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  sectionTitleActive: {
    color: "#3B82F6",
  },
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
  chipText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  chipTextSelected: {
    color: "#3B82F6",
    fontWeight: "600",
  },
  closeBar: {
    padding: 20,
    paddingBottom: 40,
    alignItems: "center",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  closeText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
  },
});
