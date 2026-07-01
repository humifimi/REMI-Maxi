import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { G, Path } from "react-native-svg";

export type PieSlice = {
  label: string;
  value: number;
  color: string;
};

type Props = {
  slices: PieSlice[];
  size?: number;
};

const PALETTE = ["#3B82F6", "#22C55E", "#EAB308", "#EF4444", "#8B5CF6", "#06B6D4", "#F97316", "#14B8A6"];

export function pieColor(i: number): string {
  return PALETTE[i % PALETTE.length];
}

export function RevenuePieChart({ slices, size = 180 }: Props) {
  const { paths, total } = useMemo(() => {
    const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
    if (total <= 0) return { paths: [], total: 0 };

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 4;

    let angle = -Math.PI / 2;
    const paths = slices
      .filter((s) => s.value > 0)
      .map((s) => {
        const slice = (s.value / total) * Math.PI * 2;
        const x1 = cx + radius * Math.cos(angle);
        const y1 = cy + radius * Math.sin(angle);
        const next = angle + slice;
        const x2 = cx + radius * Math.cos(next);
        const y2 = cy + radius * Math.sin(next);
        const large = slice > Math.PI ? 1 : 0;
        const d = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`;
        angle = next;
        return { d, color: s.color };
      });

    return { paths, total };
  }, [slices, size]);

  if (total <= 0) {
    return (
      <View style={[styles.empty, { width: size, height: size }]}>
        <Text style={styles.emptyText}>No revenue yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <G>
          {paths.map((p, i) => (
            <Path key={i} d={p.d} fill={p.color} stroke="#fff" strokeWidth={1} />
          ))}
        </G>
      </Svg>
      <View style={styles.legend}>
        {slices
          .filter((s) => s.value > 0)
          .map((s) => {
            const pct = total > 0 ? (s.value / total) * 100 : 0;
            return (
              <View key={s.label} style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: s.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.legendLabel}>{s.label}</Text>
                  <Text style={styles.legendValue}>
                    {pct.toFixed(0)}% · ${Math.round(s.value).toLocaleString()}
                  </Text>
                </View>
              </View>
            );
          })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 999,
  },
  emptyText: {
    color: "#9CA3AF",
    fontSize: 12,
  },
  legend: {
    flex: 1,
    gap: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  legendLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  legendValue: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 1,
  },
});
