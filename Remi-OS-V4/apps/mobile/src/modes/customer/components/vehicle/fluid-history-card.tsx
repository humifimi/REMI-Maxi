import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Theme, HealthColors } from '@customer/constants/colors';
import { FluidType, FLUID_TYPE_LABELS } from '@customer/types/enums';
import type { FluidLevelRecord } from '@customer/types/api';

const FLUID_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  [FluidType.COOLANT]: 'coolant-temperature',
  [FluidType.WASHER]: 'car-wash',
  [FluidType.BRAKE]: 'car-brake-fluid-level',
  [FluidType.TRANSMISSION]: 'cog-transfer',
  [FluidType.POWER_STEERING]: 'steering',
  [FluidType.DIFFERENTIAL]: 'car-cog',
};

function getActionColor(action: string): string {
  const lower = action.toLowerCase();
  if (lower.includes('normal') || lower.includes('full') || lower.includes('ok')) {
    return HealthColors.good;
  }
  if (lower.includes('topped') || lower.includes('added') || lower.includes('low')) {
    return HealthColors.warning;
  }
  if (lower.includes('critical') || lower.includes('empty') || lower.includes('replace')) {
    return HealthColors.critical;
  }
  return Theme.colors.textSecondary;
}

interface GroupedFluid {
  fluidType: string;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  latest: FluidLevelRecord;
  prior: FluidLevelRecord | null;
}

interface Props {
  records: FluidLevelRecord[];
}

export function FluidHistoryCard({ records }: Props) {
  const grouped = useMemo(() => {
    const byType = new Map<string, FluidLevelRecord[]>();
    for (const r of records) {
      const list = byType.get(r.fluid_type) ?? [];
      list.push(r);
      byType.set(r.fluid_type, list);
    }

    const result: GroupedFluid[] = [];
    for (const [ft, recs] of byType) {
      result.push({
        fluidType: ft,
        label: FLUID_TYPE_LABELS[ft as keyof typeof FLUID_TYPE_LABELS] ?? ft,
        icon: FLUID_ICONS[ft] ?? 'water',
        latest: recs[0],
        prior: recs.length > 1 ? recs[1] : null,
      });
    }
    return result;
  }, [records]);

  if (grouped.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="water-check" size={20} color={Theme.colors.text} />
        <Text style={styles.title}>Fluid Levels</Text>
      </View>

      {grouped.map((g) => {
        const actionColor = getActionColor(g.latest.action_taken);
        const date = new Date(g.latest.created_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });

        return (
          <View key={g.fluidType} style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: actionColor + '14' }]}>
              <MaterialCommunityIcons name={g.icon} size={20} color={actionColor} />
            </View>

            <View style={styles.rowContent}>
              <View style={styles.rowTop}>
                <Text style={styles.fluidName}>{g.label}</Text>
                <View style={[styles.levelBadge, { backgroundColor: actionColor + '1A' }]}>
                  <Text style={[styles.levelText, { color: actionColor }]}>
                    {g.latest.measured_level}
                  </Text>
                </View>
              </View>
              <View style={styles.rowBottom}>
                <Text style={styles.actionText}>{g.latest.action_taken}</Text>
                <Text style={styles.dateText}>{date}</Text>
              </View>
              {g.prior ? (
                <Text style={styles.deltaText}>
                  Prior: {g.prior.measured_level} ({g.prior.action_taken})
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
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
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.borderLight,
    gap: Theme.spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: Theme.borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  rowContent: {
    flex: 1,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  fluidName: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  levelBadge: {
    paddingHorizontal: Theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: Theme.borderRadius.full,
  },
  levelText: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  rowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
  },
  dateText: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
  },
  deltaText: {
    fontSize: 11,
    color: Theme.colors.textTertiary,
    marginTop: 2,
    fontStyle: 'italic',
  },
});
