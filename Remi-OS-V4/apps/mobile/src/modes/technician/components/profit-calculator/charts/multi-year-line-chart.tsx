import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from "react-native-svg";
import type { ChartPoint } from "@profit-model/types";

type Series = {
  label: string;
  color: string;
  points: ChartPoint[];
};

type Props = {
  series: Series[];
  height?: number;
};

const PADDING = { top: 16, right: 16, bottom: 28, left: 48 };

export function MultiYearLineChart({ series, height = 220 }: Props) {
  const dims = { width: 320, height };

  const { paths, ticksY, xLabels, dots } = useMemo(() => {
    const allPoints = series.flatMap((s) => s.points);
    if (allPoints.length === 0) {
      return { paths: [], ticksY: [], xLabels: [], dots: [] };
    }
    const xs = Array.from(new Set(allPoints.map((p) => p.year))).sort(
      (a, b) => a - b
    );
    const xMin = xs[0];
    const xMax = xs[xs.length - 1];

    const yMaxRaw = Math.max(0, ...allPoints.map((p) => p.value));
    const yMinRaw = Math.min(0, ...allPoints.map((p) => p.value));
    const yMax = yMaxRaw === yMinRaw ? yMaxRaw + 1 : yMaxRaw;
    const yMin = yMinRaw;

    const innerW = dims.width - PADDING.left - PADDING.right;
    const innerH = dims.height - PADDING.top - PADDING.bottom;

    const xScale = (x: number) =>
      PADDING.left +
      (xMax === xMin ? innerW / 2 : ((x - xMin) / (xMax - xMin)) * innerW);
    const yScale = (y: number) =>
      PADDING.top + innerH - ((y - yMin) / (yMax - yMin)) * innerH;

    const paths = series.map((s) => {
      const pts = s.points
        .slice()
        .sort((a, b) => a.year - b.year)
        .map((p) => `${xScale(p.year)},${yScale(p.value)}`)
        .join(" ");
      return { color: s.color, points: pts };
    });

    const dots = series.flatMap((s) =>
      s.points.map((p) => ({
        cx: xScale(p.year),
        cy: yScale(p.value),
        color: s.color,
      }))
    );

    const ticks = 4;
    const ticksY = Array.from({ length: ticks + 1 }, (_, i) => {
      const v = yMin + ((yMax - yMin) * i) / ticks;
      return { y: yScale(v), label: formatTickK(v) };
    });

    const xLabels = xs.map((x) => ({ x: xScale(x), label: `Y${x}` }));

    return { paths, ticksY, xLabels, dots };
  }, [series, dims.width, dims.height]);

  return (
    <View>
      <Svg width="100%" height={dims.height} viewBox={`0 0 ${dims.width} ${dims.height}`}>
        <G>
          {ticksY.map((t, i) => (
            <G key={`g-${i}`}>
              <Line
                x1={PADDING.left}
                x2={dims.width - PADDING.right}
                y1={t.y}
                y2={t.y}
                stroke="#F3F4F6"
                strokeWidth={1}
              />
              <SvgText
                x={PADDING.left - 6}
                y={t.y + 3}
                fontSize="9"
                fill="#9CA3AF"
                textAnchor="end"
              >
                {t.label}
              </SvgText>
            </G>
          ))}
          {xLabels.map((t, i) => (
            <SvgText
              key={`x-${i}`}
              x={t.x}
              y={dims.height - 10}
              fontSize="10"
              fill="#6B7280"
              textAnchor="middle"
            >
              {t.label}
            </SvgText>
          ))}
        </G>
        {paths.map((p, i) => (
          <Polyline
            key={`p-${i}`}
            points={p.points}
            fill="none"
            stroke={p.color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {dots.map((d, i) => (
          <Circle key={`d-${i}`} cx={d.cx} cy={d.cy} r={3} fill={d.color} />
        ))}
      </Svg>

      <View style={styles.legend}>
        {series.map((s) => (
          <View key={s.label} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: s.color }]} />
            <Text style={styles.legendText}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function formatTickK(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
    paddingHorizontal: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#374151",
  },
});
