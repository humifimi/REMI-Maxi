import { StyleSheet, Text, View } from "react-native";

type Bar = {
  label: string;
  value: number;
  color?: string;
};

type Props = {
  bars: Bar[];
};

export function FixedCostsBars({ bars }: Props) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const total = bars.reduce((s, b) => s + b.value, 0);

  return (
    <View style={styles.container}>
      {bars.map((b, i) => {
        const pct = total > 0 ? (b.value / total) * 100 : 0;
        const widthPct = (b.value / max) * 100;
        return (
          <View key={`${b.label}-${i}`} style={styles.row}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>{b.label}</Text>
              <Text style={styles.value}>
                ${Math.round(b.value).toLocaleString()}
                <Text style={styles.pct}>  {pct.toFixed(0)}%</Text>
              </Text>
            </View>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  {
                    width: `${widthPct}%`,
                    backgroundColor: b.color ?? "#3B82F6",
                  },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  row: {
    gap: 4,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  label: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "500",
  },
  value: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  pct: {
    color: "#9CA3AF",
    fontWeight: "500",
    fontSize: 11,
  },
  track: {
    height: 6,
    backgroundColor: "#F3F4F6",
    borderRadius: 3,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 3,
  },
});
