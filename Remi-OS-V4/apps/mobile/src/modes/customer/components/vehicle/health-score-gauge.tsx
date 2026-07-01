import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { getHealthColor, HealthColors, Theme } from '@customer/constants/colors';
import type { HealthScoreSnapshot } from '@customer/types/api';

const HERO_SIZE = 180;
const HERO_STROKE = 14;
const COMP_SIZE = 52;
const COMP_STROKE = 6;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface GaugeRingProps {
  score: number;
  size: number;
  strokeWidth: number;
  showScore?: boolean;
  fontSize?: number;
}

function GaugeRing({ score, size, strokeWidth, showScore = false, fontSize = 18 }: GaugeRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(score / 100, 0), 1);
  const color = getHealthColor(score);

  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    animValue.setValue(0);
    Animated.timing(animValue, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: false,
    }).start();
  }, [animValue, score]);

  const animatedOffset = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, circumference * (1 - progress)],
  });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color + '15'}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={animatedOffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {showScore && (
        <View style={[StyleSheet.absoluteFill, styles.scoreCenter]}>
          <Text style={[styles.heroScore, { color, fontSize }]}>{score}</Text>
          <Text style={styles.heroLabel}>out of 100</Text>
        </View>
      )}
    </View>
  );
}

function getHealthStatus(score: number): { text: string; color: string } {
  if (score > 70) return { text: 'Good Condition', color: HealthColors.good };
  if (score >= 40) return { text: 'Needs Attention', color: HealthColors.warning };
  return { text: 'Service Recommended', color: HealthColors.critical };
}

const COMPONENT_LABELS: Record<string, string> = {
  oil: 'Oil',
  filter: 'Filter',
  tires: 'Tires',
  wipers: 'Wipers',
  brakes: 'Brakes',
  fluids: 'Fluids',
};

interface HealthScoreGaugeProps {
  snapshot: HealthScoreSnapshot;
}

export function HealthScoreGauge({ snapshot }: HealthScoreGaugeProps) {
  const overall = snapshot.overall_score;
  const status = getHealthStatus(overall);

  const components: { key: string; score: number }[] = [
    { key: 'oil', score: snapshot.oil_life_score },
    { key: 'filter', score: snapshot.filter_score },
    { key: 'tires', score: snapshot.tire_score },
    { key: 'wipers', score: snapshot.wiper_score },
    { key: 'brakes', score: snapshot.brake_score ?? 0 },
    { key: 'fluids', score: snapshot.fluid_score ?? 0 },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.heroContainer}>
        <GaugeRing score={overall} size={HERO_SIZE} strokeWidth={HERO_STROKE} showScore fontSize={42} />
        <Text style={[styles.statusText, { color: status.color }]}>{status.text}</Text>
      </View>

      <View style={styles.componentsRow}>
        {components.map(({ key, score }) => (
          <View key={key} style={styles.componentItem}>
            <GaugeRing score={score} size={COMP_SIZE} strokeWidth={COMP_STROKE} />
            <Text style={[styles.compScore, { color: getHealthColor(score) }]}>{score}</Text>
            <Text style={styles.compLabel}>{COMPONENT_LABELS[key] ?? key}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    ...Theme.shadow.md,
  },
  heroContainer: {
    alignItems: 'center',
    marginBottom: Theme.spacing.lg,
  },
  scoreCenter: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroScore: {
    fontWeight: '800',
    letterSpacing: -1,
  },
  heroLabel: {
    fontSize: 11,
    color: Theme.colors.textTertiary,
    fontWeight: '500',
    marginTop: 2,
  },
  statusText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    marginTop: Theme.spacing.sm,
  },
  componentsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    gap: Theme.spacing.md,
  },
  componentItem: {
    alignItems: 'center',
    width: 64,
  },
  compScore: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
    marginTop: 4,
  },
  compLabel: {
    fontSize: 10,
    color: Theme.colors.textTertiary,
    fontWeight: '500',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
