import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { getHealthColor, Theme } from '@customer/constants/colors';
import type { HealthScore } from '@customer/types/api';

type RingVariant = 'compact' | 'default' | 'hero';

const VARIANT_CONFIG = {
  compact: { size: 56, strokeWidth: 6, fontSize: 13, fontWeight: '600' as const },
  default: { size: 80, strokeWidth: 8, fontSize: 18, fontWeight: '700' as const },
  hero: { size: 140, strokeWidth: 12, fontSize: 36, fontWeight: '800' as const },
};

interface HealthRingProps {
  score: number;
  variant?: RingVariant;
  size?: number;
  strokeWidth?: number;
  label?: string;
  subtitle?: string;
  showScore?: boolean;
  animated?: boolean;
}

export function HealthRing({
  score,
  variant = 'default',
  size: sizeProp,
  strokeWidth: strokeProp,
  label,
  subtitle,
  showScore = true,
  animated = false,
}: HealthRingProps) {
  const config = VARIANT_CONFIG[variant];
  const size = sizeProp ?? config.size;
  const strokeWidth = strokeProp ?? config.strokeWidth;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(score / 100, 0), 1);
  const color = getHealthColor(score);

  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animated) {
      animatedValue.setValue(0);
      Animated.timing(animatedValue, {
        toValue: 1,
        duration: 800,
        useNativeDriver: false,
      }).start();
    } else {
      animatedValue.setValue(1);
    }
  }, [animated, animatedValue, score]);

  const animatedOffset = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, circumference * (1 - progress)],
  });

  const AnimatedCircle = Animated.createAnimatedComponent(Circle);

  return (
    <View style={styles.container}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color + '20'}
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
            strokeDashoffset={animated ? animatedOffset : circumference * (1 - progress)}
            strokeLinecap="round"
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        {showScore && (
          <View style={[StyleSheet.absoluteFill, styles.scoreContainer]}>
            <Text style={[styles.score, { color, fontSize: config.fontSize, fontWeight: config.fontWeight }]}>
              {score}
            </Text>
          </View>
        )}
      </View>
      {label && <Text style={styles.label}>{label}</Text>}
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

interface HealthRingGroupProps {
  health: HealthScore;
  variant?: 'compact' | 'full';
}

export function HealthRingGroup({ health, variant = 'full' }: HealthRingGroupProps) {
  const { components, overall } = health;
  const isCompact = variant === 'compact';

  const overallSize = isCompact ? 80 : 100;
  const overallStroke = isCompact ? 8 : 10;
  const compSize = isCompact ? 44 : 52;
  const compStroke = isCompact ? 5 : 6;

  return (
    <View style={styles.group}>
      <HealthRing score={overall} size={overallSize} strokeWidth={overallStroke} label="Overall" />
      <View style={styles.componentRings}>
        <HealthRing score={components.oil} size={compSize} strokeWidth={compStroke} label="Oil" />
        <HealthRing score={components.filter} size={compSize} strokeWidth={compStroke} label="Filter" />
        <HealthRing score={components.tires} size={compSize} strokeWidth={compStroke} label="Tires" />
        <HealthRing score={components.wipers} size={compSize} strokeWidth={compStroke} label="Wipers" />
        <HealthRing score={components.brakes} size={compSize} strokeWidth={compStroke} label="Brakes" />
        <HealthRing score={components.fluids} size={compSize} strokeWidth={compStroke} label="Fluids" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  scoreContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  score: {
    fontSize: 18,
    fontWeight: '700',
  },
  label: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    marginTop: 4,
    fontWeight: '500',
  },
  subtitle: {
    fontSize: Theme.fontSize.xs - 1,
    color: Theme.colors.textTertiary,
    marginTop: 2,
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.lg,
  },
  componentRings: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Theme.spacing.sm,
    flex: 1,
    justifyContent: 'center',
  },
});
