import { StyleSheet, View, Text, Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { haptic } from "@technician/hooks/utility/use-haptics";

export interface BulkAction {
  key: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
  color: string;
  onPress: () => void;
  // Phase 4 Chunk 4.5 — optional per-action disabled flag, ORed with
  // the existing `selectedCount === 0` row-wide guard. Lets a long-
  // running action (e.g. the receipts export's ~10s render at N=20)
  // grey out its own button without affecting siblings. Defaults to
  // false; all existing button declarations stay valid.
  disabled?: boolean;
}

interface BulkActionBarProps {
  selectedCount: number;
  totalAmount?: number;
  actions: BulkAction[];
  onSelectAll: () => void;
  onDone: () => void;
}

export function BulkActionBar({
  selectedCount,
  totalAmount,
  actions,
  onSelectAll,
  onDone,
}: BulkActionBarProps) {
  const rows: BulkAction[][] = [];
  for (let i = 0; i < actions.length; i += 3) {
    rows.push(actions.slice(i, i + 3));
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.info}>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{selectedCount}</Text>
          </View>
          <Text style={styles.selectedLabel}>selected</Text>
          {totalAmount != null && totalAmount > 0 && (
            <Text style={styles.totalAmount}>${totalAmount.toFixed(2)}</Text>
          )}
        </View>
        <View style={styles.headerButtons}>
          <Pressable
            style={styles.headerBtn}
            onPress={() => {
              haptic.selection();
              onSelectAll();
            }}
          >
            <Text style={styles.selectAllText}>Select All</Text>
          </Pressable>
          <Pressable
            style={[styles.headerBtn, styles.doneBtn]}
            onPress={() => {
              haptic.light();
              onDone();
            }}
          >
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      </View>

      {rows.map((row, rowIndex) => (
        <View
          key={rowIndex}
          style={[styles.actionRow, rowIndex > 0 && { marginTop: 8 }]}
        >
          {row.map((action) => {
            const isDisabled = selectedCount === 0 || action.disabled === true;
            return (
              <Pressable
                key={action.key}
                style={[
                  styles.actionBtn,
                  { backgroundColor: action.color },
                  // Per-action faded state when the bar otherwise has
                  // rows selected. iOS-disabled feel; 0.5 opacity is
                  // the convention from the existing share-link-modal
                  // disabled-button styles.
                  isDisabled && action.disabled === true && selectedCount > 0
                    ? styles.actionBtnDisabled
                    : null,
                ]}
                onPress={() => {
                  haptic.light();
                  action.onPress();
                }}
                disabled={isDisabled}
              >
                <MaterialIcons name={action.icon} size={18} color="#fff" />
                <Text style={styles.actionText}>{action.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  info: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  countBadge: {
    backgroundColor: "#3B82F6",
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  countText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  selectedLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: "800",
    color: "#22C55E",
  },
  headerButtons: {
    flexDirection: "row",
    gap: 8,
  },
  headerBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  selectAllText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3B82F6",
  },
  doneBtn: {
    backgroundColor: "#111827",
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    minHeight: 44,
  },
  actionText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
});
