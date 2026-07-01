import { StyleSheet, Text, View } from "react-native";
import { InfoIcon } from "./info-icon";

type Props = {
  label: string;
  value: string;
  sublabel?: string;
  tone?: "primary" | "neutral" | "warn" | "negative";
  /**
   * PM-MIG-19 — Optional glossary key. When set, an info icon renders next
   * to the label and tapping it opens the glossary sheet.
   */
  glossaryKey?: string;
};

export function KpiTile({
  label,
  value,
  sublabel,
  tone = "neutral",
  glossaryKey,
}: Props) {
  const accent = TONE_COLORS[tone];
  return (
    <View style={[styles.tile, { borderLeftColor: accent }]}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {glossaryKey ? <InfoIcon glossaryKey={glossaryKey} /> : null}
      </View>
      <Text style={[styles.value, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
    </View>
  );
}

const TONE_COLORS: Record<NonNullable<Props["tone"]>, string> = {
  primary: "#3B82F6",
  neutral: "#111827",
  warn: "#EAB308",
  negative: "#EF4444",
};

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    minWidth: 100,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  value: {
    fontSize: 18,
    fontWeight: "800",
    marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
  sublabel: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 2,
  },
});
