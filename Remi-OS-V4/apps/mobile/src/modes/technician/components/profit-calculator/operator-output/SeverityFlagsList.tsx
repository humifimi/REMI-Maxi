import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { SeverityFlag } from "@profit-model/types";

type Props = {
  flags: SeverityFlag[];
  /**
   * PM-MIG-19 wires this to open the glossary sheet. Until then the parent can
   * leave it undefined; the "?" affordance is hidden when no handler is wired.
   */
  onGlossaryPress?: (key: string) => void;
};

const SEVERITY_ORDER: Record<SeverityFlag["severity"], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const SEVERITY_STYLES: Record<
  SeverityFlag["severity"],
  { border: string; badgeBg: string; badgeText: string; label: string }
> = {
  critical: {
    border: "#EF4444",
    badgeBg: "#FEE2E2",
    badgeText: "#991B1B",
    label: "Critical",
  },
  warning: {
    border: "#F59E0B",
    badgeBg: "#FEF3C7",
    badgeText: "#92400E",
    label: "Warning",
  },
  info: {
    border: "#3B82F6",
    badgeBg: "#DBEAFE",
    badgeText: "#1E40AF",
    label: "Info",
  },
};

export function SeverityFlagsList({ flags, onGlossaryPress }: Props) {
  const sorted = useMemo(
    () =>
      [...flags].sort(
        (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      ),
    [flags]
  );

  if (sorted.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <MaterialIcons name="check-circle" size={18} color="#15803D" />
        <Text style={styles.emptyText}>
          No critical cash flags. Your operations look healthy.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {sorted.map((flag) => (
        <FlagCard key={flag.id} flag={flag} onGlossaryPress={onGlossaryPress} />
      ))}
    </View>
  );
}

function FlagCard({
  flag,
  onGlossaryPress,
}: {
  flag: SeverityFlag;
  onGlossaryPress?: (key: string) => void;
}) {
  const s = SEVERITY_STYLES[flag.severity];
  const showInfo = !!flag.glossary_key && !!onGlossaryPress;
  return (
    <View style={[styles.card, { borderLeftColor: s.border }]}>
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <View style={[styles.badge, { backgroundColor: s.badgeBg }]}>
            <Text style={[styles.badgeText, { color: s.badgeText }]}>
              {s.label}
            </Text>
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {flag.title}
          </Text>
        </View>
        <Text style={styles.message}>{flag.message}</Text>
        {flag.suggested_action ? (
          <Text style={styles.action}>{flag.suggested_action}</Text>
        ) : null}
      </View>
      {showInfo ? (
        <Pressable
          style={styles.infoBtn}
          hitSlop={10}
          onPress={() => onGlossaryPress!(flag.glossary_key!)}
          accessibilityRole="button"
          accessibilityLabel={`Learn more: ${flag.title}`}
        >
          <MaterialIcons name="help-outline" size={18} color="#6B7280" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  emptyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4",
  },
  emptyText: {
    flex: 1,
    fontSize: 13,
    color: "#166534",
    fontWeight: "500",
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderLeftWidth: 4,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardBody: { flex: 1, gap: 6 },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  title: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  message: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 18,
  },
  action: {
    fontSize: 12,
    color: "#6B7280",
    fontStyle: "italic",
    lineHeight: 16,
  },
  infoBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
});
