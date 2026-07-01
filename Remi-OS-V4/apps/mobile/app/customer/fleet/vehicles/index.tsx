import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Theme, getHealthColor, HealthColors } from '@customer/constants/colors';
import { SkeletonBox } from '@customer/components/shared/skeleton';
import { EmptyState } from '@customer/components/shared/empty-state';
import { useFleetVehicles } from '@customer/hooks/fleet/use-fleet-vehicles';
import type { FleetVehicleCard } from '@customer/types/fleet';

type SortKey = 'health_asc' | 'last_service' | 'driver' | 'plate';
type FilterStatus = 'all' | 'overdue' | 'due_soon' | 'on_track';
type FilterAssignment = 'all' | 'assigned' | 'unassigned';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'health_asc', label: 'Health (worst first)' },
  { key: 'last_service', label: 'Last Service' },
  { key: 'driver', label: 'Driver Name' },
  { key: 'plate', label: 'Plate' },
];

const STATUS_FILTERS: { key: FilterStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'due_soon', label: 'Due Soon' },
  { key: 'on_track', label: 'On Track' },
];

const INSPECTION_ICONS: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  current: { icon: 'checkmark-circle', color: HealthColors.good },
  due_soon: { icon: 'time', color: HealthColors.warning },
  overdue: { icon: 'alert-circle', color: HealthColors.critical },
  never: { icon: 'help-circle', color: Theme.colors.textTertiary },
};

function VehicleCard({ vehicle, onPress }: { vehicle: FleetVehicleCard; onPress: () => void }) {
  const healthColor = getHealthColor(vehicle.health_score);
  const inspectionInfo = INSPECTION_ICONS[vehicle.inspection_status] ?? INSPECTION_ICONS.never;
  const vehicleName = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
  const daysSinceService = vehicle.last_service_date
    ? Math.floor((Date.now() - new Date(vehicle.last_service_date).getTime()) / 86400000)
    : null;

  return (
    <TouchableOpacity
      style={[cardStyles.container, { borderLeftColor: healthColor }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={cardStyles.topRow}>
        <View style={cardStyles.nameSection}>
          <Text style={cardStyles.name} numberOfLines={1}>{vehicleName || 'Unknown Vehicle'}</Text>
          {vehicle.license_plate && (
            <Text style={cardStyles.plate}>{vehicle.license_plate}</Text>
          )}
        </View>
        <View style={[cardStyles.healthBadge, { backgroundColor: healthColor + '15', borderColor: healthColor + '30' }]}>
          <View style={[cardStyles.healthDot, { backgroundColor: healthColor }]} />
          <Text style={[cardStyles.healthScore, { color: healthColor }]}>{vehicle.health_score}</Text>
        </View>
      </View>

      <View style={cardStyles.detailsRow}>
        <View style={cardStyles.detail}>
          <Ionicons name="person-outline" size={14} color={Theme.colors.textSecondary} />
          <Text style={cardStyles.detailText} numberOfLines={1}>
            {vehicle.assigned_driver?.name ?? 'Unassigned'}
          </Text>
        </View>

        <View style={cardStyles.detail}>
          <Ionicons name="calendar-outline" size={14} color={Theme.colors.textSecondary} />
          <Text style={cardStyles.detailText}>
            {daysSinceService !== null ? `${daysSinceService}d ago` : 'Never'}
          </Text>
        </View>

        <View style={cardStyles.detail}>
          <Ionicons name={inspectionInfo.icon} size={14} color={inspectionInfo.color} />
        </View>

        {vehicle.deferred_item_count > 0 && (
          <View style={cardStyles.deferredBadge}>
            <Ionicons name="construct-outline" size={12} color={HealthColors.warning} />
            <Text style={cardStyles.deferredText}>{vehicle.deferred_item_count}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function FleetVehiclesScreen() {
  const router = useRouter();
  const { data: vehicles, isLoading, isError, refetch } = useFleetVehicles();

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('health_asc');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterAssignment, setFilterAssignment] = useState<FilterAssignment>('all');
  const [showSort, setShowSort] = useState(false);

  const filtered = useMemo(() => {
    if (!vehicles) return [];
    let result = [...vehicles];

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((v) => {
        const name = [v.year, v.make, v.model].filter(Boolean).join(' ').toLowerCase();
        const plate = (v.license_plate ?? '').toLowerCase();
        const driver = (v.assigned_driver?.name ?? '').toLowerCase();
        return name.includes(q) || plate.includes(q) || driver.includes(q);
      });
    }

    if (filterStatus !== 'all') {
      result = result.filter((v) => v.next_due_indicator === filterStatus);
    }

    if (filterAssignment === 'assigned') {
      result = result.filter((v) => v.assigned_driver !== null);
    } else if (filterAssignment === 'unassigned') {
      result = result.filter((v) => v.assigned_driver === null);
    }

    switch (sortKey) {
      case 'health_asc':
        result.sort((a, b) => a.health_score - b.health_score);
        break;
      case 'last_service':
        result.sort((a, b) => {
          const da = a.last_service_date ?? '';
          const db = b.last_service_date ?? '';
          return da.localeCompare(db);
        });
        break;
      case 'driver':
        result.sort((a, b) => {
          const na = a.assigned_driver?.name ?? 'zzz';
          const nb = b.assigned_driver?.name ?? 'zzz';
          return na.localeCompare(nb);
        });
        break;
      case 'plate':
        result.sort((a, b) => (a.license_plate ?? '').localeCompare(b.license_plate ?? ''));
        break;
    }

    return result;
  }, [vehicles, search, sortKey, filterStatus, filterAssignment]);

  const handleVehiclePress = useCallback(
    (vehicle: FleetVehicleCard) => {
      router.push(`/customer/fleet/vehicles/${vehicle.id}`);
    },
    [router],
  );

  const renderVehicle = useCallback(
    ({ item }: { item: FleetVehicleCard }) => (
      <VehicleCard vehicle={item} onPress={() => handleVehiclePress(item)} />
    ),
    [handleVehiclePress],
  );

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        {[1, 2, 3].map((i) => (
          <SkeletonBox key={i} width="100%" height={100} borderRadius={12} style={{ marginBottom: 12 }} />
        ))}
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.emptyWrap}>
        <EmptyState
          title="Couldn't load fleet vehicles"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchInput}>
          <Ionicons name="search" size={18} color={Theme.colors.textTertiary} />
          <TextInput
            style={styles.searchText}
            placeholder="Search plate, driver, vehicle..."
            placeholderTextColor={Theme.colors.textTertiary}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={Theme.colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={styles.sortToggle}
          onPress={() => setShowSort(!showSort)}
          activeOpacity={0.7}
        >
          <Ionicons name="swap-vertical" size={20} color={Theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Sort dropdown */}
      {showSort && (
        <View style={[styles.sortDropdown, Theme.shadow.md]}>
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.sortOption, sortKey === opt.key && styles.sortOptionActive]}
              onPress={() => { setSortKey(opt.key); setShowSort(false); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.sortOptionText, sortKey === opt.key && styles.sortOptionTextActive]}>
                {opt.label}
              </Text>
              {sortKey === opt.key && (
                <Ionicons name="checkmark" size={16} color={Theme.colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Status filter chips */}
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filterStatus === f.key && styles.filterChipActive]}
            onPress={() => setFilterStatus(f.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, filterStatus === f.key && styles.filterChipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={styles.filterSpacer} />
        <TouchableOpacity
          style={[styles.filterChip, filterAssignment !== 'all' && styles.filterChipActive]}
          onPress={() =>
            setFilterAssignment(
              filterAssignment === 'all' ? 'unassigned' : filterAssignment === 'unassigned' ? 'assigned' : 'all',
            )
          }
          activeOpacity={0.7}
        >
          <Ionicons
            name="person-outline"
            size={14}
            color={filterAssignment !== 'all' ? Theme.colors.white : Theme.colors.textSecondary}
          />
          <Text style={[styles.filterChipText, filterAssignment !== 'all' && styles.filterChipTextActive]}>
            {filterAssignment === 'all' ? 'Driver' : filterAssignment === 'assigned' ? 'Assigned' : 'Unassigned'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Vehicle list */}
      <FlatList
        data={filtered}
        keyExtractor={(v) => String(v.id)}
        renderItem={renderVehicle}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            title="No vehicles match"
            message={search ? 'Try a different search term.' : 'No fleet vehicles found.'}
          />
        }
      />

      {/* Add vehicle FAB */}
      <TouchableOpacity
        style={[styles.fab, Theme.shadow.lg]}
        onPress={() => router.push('/customer/garage')}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={Theme.colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    borderLeftWidth: 4,
    marginBottom: Theme.spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.spacing.sm,
  },
  nameSection: {
    flex: 1,
    marginRight: Theme.spacing.sm,
  },
  name: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  plate: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    fontFamily: 'Courier',
    marginTop: 2,
  },
  healthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Theme.borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    gap: 4,
  },
  healthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  healthScore: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '800',
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.md,
    flexWrap: 'wrap',
  },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
  },
  deferredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: HealthColors.warning + '15',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  deferredText: {
    fontSize: 11,
    fontWeight: '700',
    color: HealthColors.warning,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    padding: Theme.spacing.md,
  },
  emptyWrap: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    justifyContent: 'center',
    padding: Theme.spacing.lg,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.sm,
    gap: Theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.md,
    paddingHorizontal: Theme.spacing.sm,
    paddingVertical: 10,
    gap: Theme.spacing.sm,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  searchText: {
    flex: 1,
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text,
    padding: 0,
  },
  sortToggle: {
    width: 44,
    height: 44,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Theme.colors.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortDropdown: {
    position: 'absolute',
    top: 60,
    right: Theme.spacing.md,
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    zIndex: 10,
    overflow: 'hidden',
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.colors.borderLight,
  },
  sortOptionActive: {
    backgroundColor: Theme.colors.primary + '08',
  },
  sortOptionText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text,
  },
  sortOptionTextActive: {
    fontWeight: '600',
    color: Theme.colors.primary,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
    gap: Theme.spacing.xs,
    flexWrap: 'wrap',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Theme.borderRadius.full,
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  filterChipActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  filterChipText: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
  filterChipTextActive: {
    color: Theme.colors.white,
  },
  filterSpacer: {
    flex: 1,
  },
  list: {
    padding: Theme.spacing.md,
    paddingBottom: Theme.spacing.xxl + 60,
  },
  fab: {
    position: 'absolute',
    bottom: Theme.spacing.xl,
    right: Theme.spacing.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
