import { StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline, Line, Circle as SvgCircle, Rect, Text as SvgText } from 'react-native-svg';
import { getHealthColor, Theme } from '@customer/constants/colors';
import type { HealthTrendPoint } from '@customer/types/api';

interface HealthTrendChartProps {
  data: HealthTrendPoint[];
  height?: number;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatMonth(month: string): string {
  const parts = month.split('-');
  const idx = parseInt(parts[1], 10) - 1;
  return MONTH_SHORT[idx] ?? month;
}

export function HealthTrendChart({ data, height = 160 }: HealthTrendChartProps) {
  if (data.length < 2) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.emptyText}>
          Trend appears after 2+ services
        </Text>
      </View>
    );
  }

  const padding = { top: 16, bottom: 28, left: 8, right: 8 };
  const chartWidth = 320;
  const chartHeight = height - padding.top - padding.bottom;

  const minScore = Math.max(0, Math.min(...data.map((d) => d.score)) - 10);
  const maxScore = Math.min(100, Math.max(...data.map((d) => d.score)) + 10);
  const scoreRange = maxScore - minScore || 1;

  const xStep = (chartWidth - padding.left - padding.right) / (data.length - 1);

  const points = data.map((d, i) => ({
    x: padding.left + i * xStep,
    y: padding.top + chartHeight - ((d.score - minScore) / scoreRange) * chartHeight,
    score: d.score,
    month: d.month,
  }));

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  const lastPoint = points[points.length - 1];
  const lastColor = getHealthColor(lastPoint.score);

  return (
    <View style={styles.container}>
      <Svg width={chartWidth} height={height}>
        <Rect x={0} y={0} width={chartWidth} height={height} rx={12} fill={Theme.colors.surface} />

        {[70, 40].map((threshold) => {
          const y = padding.top + chartHeight - ((threshold - minScore) / scoreRange) * chartHeight;
          if (y < padding.top || y > padding.top + chartHeight) return null;
          return (
            <Line
              key={threshold}
              x1={padding.left}
              y1={y}
              x2={chartWidth - padding.right}
              y2={y}
              stroke={Theme.colors.border}
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          );
        })}

        <Polyline
          points={polylinePoints}
          fill="none"
          stroke={lastColor}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((p, i) => (
          <SvgCircle
            key={i}
            cx={p.x}
            cy={p.y}
            r={4}
            fill={getHealthColor(p.score)}
            stroke={Theme.colors.white}
            strokeWidth={2}
          />
        ))}

        {points.map((p, i) => (
          <SvgText
            key={`label-${i}`}
            x={p.x}
            y={height - 6}
            textAnchor="middle"
            fontSize={10}
            fill={Theme.colors.textTertiary}
          >
            {formatMonth(p.month)}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  emptyText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: Theme.spacing.xl,
  },
});
