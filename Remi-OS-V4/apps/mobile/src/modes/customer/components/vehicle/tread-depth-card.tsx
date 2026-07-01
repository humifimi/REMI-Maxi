import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Theme, HealthColors } from '@customer/constants/colors';
import { TirePosition, TIRE_POSITION_LABELS } from '@customer/types/enums';
import type { TireTreadRecord } from '@customer/types/api';

function getTreadColor(depthMm: number): string {
  if (depthMm >= 4) return HealthColors.good;
  if (depthMm >= 2) return HealthColors.warning;
  return HealthColors.critical;
}

function getTreadLabel(depthMm: number): string {
  if (depthMm >= 4) return 'Good';
  if (depthMm >= 2) return 'Worn';
  return 'Replace';
}

interface TireData {
  depth: number;
  color: string;
  label: string;
  delta: number | null;
  priorDate: string | null;
}

const POSITION_ORDER: TirePosition[] = [
  TirePosition.LEFT_FRONT,
  TirePosition.RIGHT_FRONT,
  TirePosition.LEFT_REAR,
  TirePosition.RIGHT_REAR,
];

interface Props {
  records: TireTreadRecord[];
}

export function TreadDepthCard({ records }: Props) {
  const tireMap = useMemo(() => {
    const byPosition = new Map<TirePosition, TireTreadRecord[]>();
    for (const r of records) {
      const list = byPosition.get(r.position) ?? [];
      list.push(r);
      byPosition.set(r.position, list);
    }

    const result = new Map<TirePosition, TireData>();
    for (const pos of POSITION_ORDER) {
      const posRecords = byPosition.get(pos);
      if (!posRecords || posRecords.length === 0) continue;

      const latest = posRecords[0];
      const depth = Number(latest.depth_mm);
      const prior = posRecords.length > 1 ? posRecords[1] : null;
      const priorDepth = prior ? Number(prior.depth_mm) : null;

      result.set(pos, {
        depth,
        color: getTreadColor(depth),
        label: getTreadLabel(depth),
        delta: priorDepth != null ? depth - priorDepth : null,
        priorDate: prior
          ? new Date(prior.created_at).toLocaleDateString('en-US', { month: 'short' })
          : null,
      });
    }
    return result;
  }, [records]);

  if (tireMap.size === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="tire" size={20} color={Theme.colors.text} />
        <Text style={styles.title}>Tire Tread Depth</Text>
      </View>

      <View style={styles.diagramWrap}>
        <View style={styles.carOutline}>
          <View style={styles.tireRow}>
            {[TirePosition.LEFT_FRONT, TirePosition.RIGHT_FRONT].map((pos) => {
              const data = tireMap.get(pos);
              return (
                <View key={pos} style={styles.tireCell}>
                  {data ? (
                    <>
                      <View style={[styles.tireBlock, { borderColor: data.color }]}>
                        <Text style={[styles.tireDepth, { color: data.color }]}>
                          {data.depth.toFixed(1)}
                        </Text>
                        <Text style={styles.tireMm}>mm</Text>
                      </View>
                      <Text style={[styles.tireLabel, { color: data.color }]}>{data.label}</Text>
                      <Text style={styles.tirePos}>
                        {TIRE_POSITION_LABELS[pos]}
                      </Text>
                      {data.delta != null && data.priorDate ? (
                        <Text style={styles.tireDelta}>
                          {data.delta > 0 ? '+' : ''}
                          {data.delta.toFixed(1)} since {data.priorDate}
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <View style={[styles.tireBlock, { borderColor: Theme.colors.border }]}>
                        <Text style={[styles.tireDepth, { color: Theme.colors.textTertiary }]}>
                          —
                        </Text>
                      </View>
                      <Text style={styles.tirePos}>{TIRE_POSITION_LABELS[pos]}</Text>
                    </>
                  )}
                </View>
              );
            })}
          </View>

          <View style={styles.axleDivider} />

          <View style={styles.tireRow}>
            {[TirePosition.LEFT_REAR, TirePosition.RIGHT_REAR].map((pos) => {
              const data = tireMap.get(pos);
              return (
                <View key={pos} style={styles.tireCell}>
                  {data ? (
                    <>
                      <View style={[styles.tireBlock, { borderColor: data.color }]}>
                        <Text style={[styles.tireDepth, { color: data.color }]}>
                          {data.depth.toFixed(1)}
                        </Text>
                        <Text style={styles.tireMm}>mm</Text>
                      </View>
                      <Text style={[styles.tireLabel, { color: data.color }]}>{data.label}</Text>
                      <Text style={styles.tirePos}>
                        {TIRE_POSITION_LABELS[pos]}
                      </Text>
                      {data.delta != null && data.priorDate ? (
                        <Text style={styles.tireDelta}>
                          {data.delta > 0 ? '+' : ''}
                          {data.delta.toFixed(1)} since {data.priorDate}
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <View style={[styles.tireBlock, { borderColor: Theme.colors.border }]}>
                        <Text style={[styles.tireDepth, { color: Theme.colors.textTertiary }]}>
                          —
                        </Text>
                      </View>
                      <Text style={styles.tirePos}>{TIRE_POSITION_LABELS[pos]}</Text>
                    </>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: HealthColors.good }]} />
          <Text style={styles.legendText}>4mm+ Good</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: HealthColors.warning }]} />
          <Text style={styles.legendText}>2-4mm Worn</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: HealthColors.critical }]} />
          <Text style={styles.legendText}>&lt;2mm Replace</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    ...Theme.shadow.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.md,
  },
  title: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  diagramWrap: {
    alignItems: 'center',
    marginBottom: Theme.spacing.md,
  },
  carOutline: {
    width: '100%',
    maxWidth: 280,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  tireRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tireCell: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: Theme.spacing.sm,
  },
  tireBlock: {
    width: 64,
    height: 64,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
  },
  tireDepth: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
  },
  tireMm: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    marginTop: -2,
  },
  tireLabel: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '700',
    marginTop: Theme.spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tirePos: {
    fontSize: 11,
    color: Theme.colors.textTertiary,
    marginTop: 2,
  },
  tireDelta: {
    fontSize: 10,
    color: Theme.colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  axleDivider: {
    height: 1,
    backgroundColor: Theme.colors.border,
    marginVertical: Theme.spacing.sm,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Theme.spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
  },
});
