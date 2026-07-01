/**
 * LDM-WAVE-1 CHUNK-4 — Franchisor cross-franchise workspace switcher.
 *
 * Renders a horizontal chip row at the top of the cross-franchise
 * admin screen. Each chip = one franchise + the synthetic
 * "All franchises" option (id = null). Tapping a chip drives the
 * `selectedFranchiseId` state on the parent, which in turn re-runs
 * the user-list query against the new scope.
 *
 * Why a chip row and not a dropdown:
 * - On mobile, a dropdown sheet for ~3-12 entries is overkill; the
 *   chip row keeps the active option visible and one tap away.
 * - When the franchise count grows past ~12 we can swap this for a
 *   modal sheet without touching the API; the parent only sees
 *   `onChange(id | null)`.
 *
 * Loading / error states are inline (a skinny banner above the chip
 * row); failing to load the list shouldn't tank the rest of the
 * screen because the cross-franchise list can still be queried with
 * franchiseId=null.
 */

import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { useAdminFranchiseList } from "@technician/hooks/auth/use-permissions-admin";

interface FranchiseWorkspaceSwitcherProps {
  selectedFranchiseId: number | null;
  onChange: (id: number | null) => void;
  testIDPrefix?: string;
}

export function FranchiseWorkspaceSwitcher({
  selectedFranchiseId,
  onChange,
  testIDPrefix,
}: FranchiseWorkspaceSwitcherProps) {
  const prefix = testIDPrefix ?? "workspace-switcher";
  const { data, isLoading, isError } = useAdminFranchiseList();

  return (
    <View style={styles.wrap} testID={`${prefix}-root`}>
      {isLoading && (
        <Text style={styles.statusText} testID={`${prefix}-loading`}>
          Loading franchises…
        </Text>
      )}
      {isError && (
        <Text style={styles.errorText} testID={`${prefix}-error`}>
          Could not load franchises. Showing all users.
        </Text>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <Chip
          label="All franchises"
          active={selectedFranchiseId === null}
          onPress={() => onChange(null)}
          testID={`${prefix}-chip-all`}
        />
        {(data?.franchises ?? []).map((f) => (
          <Chip
            key={f.franchiseId}
            label={f.name}
            sublabel={`${f.userCount} ${f.userCount === 1 ? "user" : "users"}`}
            active={selectedFranchiseId === f.franchiseId}
            onPress={() => onChange(f.franchiseId)}
            testID={`${prefix}-chip-${f.franchiseId}`}
          />
        ))}
      </ScrollView>
    </View>
  );
}

interface ChipProps {
  label: string;
  sublabel?: string;
  active: boolean;
  onPress: () => void;
  testID: string;
}

function Chip({ label, sublabel, active, onPress, testID }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && styles.chipPressed,
      ]}
      testID={testID}
    >
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
        {label}
      </Text>
      {sublabel ? (
        <Text style={[styles.chipSub, active && styles.chipSubActive]}>
          {sublabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingVertical: 4,
  },
  row: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipActive: {
    backgroundColor: "#2563EB",
    borderColor: "#1D4ED8",
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  chipLabelActive: {
    color: "#FFFFFF",
  },
  chipSub: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 2,
  },
  chipSubActive: {
    color: "#DBEAFE",
  },
  statusText: {
    paddingHorizontal: 12,
    paddingTop: 8,
    fontSize: 12,
    color: "#6B7280",
  },
  errorText: {
    paddingHorizontal: 12,
    paddingTop: 8,
    fontSize: 12,
    color: "#B91C1C",
  },
});
