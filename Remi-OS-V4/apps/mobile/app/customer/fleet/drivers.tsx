import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFleetManagerGuard } from '@customer/components/fleet/fleet-manager-guard';
import { Theme, getHealthColor, HealthColors } from '@customer/constants/colors';
import { SkeletonBox } from '@customer/components/shared/skeleton';
import { EmptyState } from '@customer/components/shared/empty-state';
import { useFleetDrivers, useInviteDriver } from '@customer/hooks/fleet/use-fleet-drivers';
import type { FleetDriverDetail, FleetDriverVehicle, FleetServiceHistoryEntry } from '@customer/types/fleet';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ── Driver Card (list item) ── */
function DriverCard({
  driver,
  onPress,
}: {
  driver: FleetDriverDetail;
  onPress: () => void;
}) {
  const complianceColor = driver.inspections_overdue > 0 ? HealthColors.critical : HealthColors.good;
  const daysSince = driver.last_inspection_date
    ? Math.floor((Date.now() - new Date(driver.last_inspection_date).getTime()) / 86400000)
    : null;

  return (
    <TouchableOpacity
      style={[cardStyles.container, Theme.shadow.sm]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={cardStyles.topRow}>
        <View style={cardStyles.avatarWrap}>
          <Text style={cardStyles.avatarText}>
            {driver.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={cardStyles.name}>{driver.name}</Text>
          {driver.phone && <Text style={cardStyles.meta}>{driver.phone}</Text>}
          <Text style={cardStyles.meta}>{driver.email}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Theme.colors.textTertiary} />
      </View>

      <View style={cardStyles.detailsRow}>
        <View style={cardStyles.detail}>
          <Ionicons name="car-outline" size={14} color={Theme.colors.textSecondary} />
          <Text style={cardStyles.detailText}>
            {driver.assigned_vehicles.length} vehicle{driver.assigned_vehicles.length !== 1 ? 's' : ''}
          </Text>
        </View>

        <View style={cardStyles.detail}>
          <Ionicons name="clipboard-outline" size={14} color={complianceColor} />
          <Text style={[cardStyles.detailText, { color: complianceColor }]}>
            {driver.inspection_compliance}
          </Text>
        </View>

        {daysSince !== null && (
          <View style={cardStyles.detail}>
            <Ionicons name="time-outline" size={14} color={Theme.colors.textSecondary} />
            <Text style={cardStyles.detailText}>{daysSince}d ago</Text>
          </View>
        )}

        {driver.inspections_overdue > 0 && (
          <View style={cardStyles.overdueBadge}>
            <Text style={cardStyles.overdueText}>{driver.inspections_overdue} overdue</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

/* ── Driver Detail Modal ── */
function DriverDetailModal({
  driver,
  visible,
  onClose,
  onVehiclePress,
}: {
  driver: FleetDriverDetail | null;
  visible: boolean;
  onClose: () => void;
  onVehiclePress: (vehicleId: number) => void;
}) {
  if (!driver) return null;

  const complianceColor = driver.inspections_overdue > 0 ? HealthColors.critical : HealthColors.good;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={modalStyles.header}>
        <Text style={modalStyles.title}>{driver.name}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={24} color={Theme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={modalStyles.scroll} contentContainerStyle={modalStyles.content} showsVerticalScrollIndicator={false}>
        {/* Contact */}
        <View style={modalStyles.card}>
          <Text style={modalStyles.sectionTitle}>Contact</Text>
          {driver.phone && (
            <TouchableOpacity
              style={modalStyles.contactRow}
              onPress={() => Linking.openURL(`tel:${driver.phone}`)}
            >
              <Ionicons name="call-outline" size={18} color={Theme.colors.primary} />
              <Text style={modalStyles.contactText}>{driver.phone}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={modalStyles.contactRow}
            onPress={() => Linking.openURL(`mailto:${driver.email}`)}
          >
            <Ionicons name="mail-outline" size={18} color={Theme.colors.primary} />
            <Text style={modalStyles.contactText}>{driver.email}</Text>
          </TouchableOpacity>
        </View>

        {/* Compliance */}
        <View style={modalStyles.card}>
          <Text style={modalStyles.sectionTitle}>Inspection Compliance</Text>
          <View style={modalStyles.complianceRow}>
            <View style={[modalStyles.complianceBadge, { backgroundColor: complianceColor + '15' }]}>
              <Text style={[modalStyles.complianceStat, { color: complianceColor }]}>
                {driver.inspections_on_time}/{driver.inspections_total}
              </Text>
              <Text style={modalStyles.complianceLabel}>On Time</Text>
            </View>
            {driver.inspections_overdue > 0 && (
              <View style={[modalStyles.complianceBadge, { backgroundColor: HealthColors.critical + '15' }]}>
                <Text style={[modalStyles.complianceStat, { color: HealthColors.critical }]}>
                  {driver.inspections_overdue}
                </Text>
                <Text style={modalStyles.complianceLabel}>Overdue</Text>
              </View>
            )}
          </View>
        </View>

        {/* Assigned Vehicles */}
        <View style={modalStyles.card}>
          <Text style={modalStyles.sectionTitle}>Assigned Vehicles</Text>
          {driver.assigned_vehicles.length === 0 ? (
            <Text style={modalStyles.emptyText}>No vehicles assigned.</Text>
          ) : (
            driver.assigned_vehicles.map((v) => {
              const healthColor = getHealthColor(v.health_score);
              const vName = [v.year, v.make, v.model].filter(Boolean).join(' ');
              return (
                <TouchableOpacity
                  key={v.id}
                  style={modalStyles.vehicleRow}
                  onPress={() => onVehiclePress(v.id)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={modalStyles.vehicleName}>{vName}</Text>
                    {v.license_plate && <Text style={modalStyles.vehiclePlate}>{v.license_plate}</Text>}
                  </View>
                  <View style={[modalStyles.healthPill, { backgroundColor: healthColor + '15' }]}>
                    <View style={[modalStyles.healthDot, { backgroundColor: healthColor }]} />
                    <Text style={[modalStyles.healthText, { color: healthColor }]}>{v.health_score}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Service History */}
        <View style={modalStyles.card}>
          <Text style={modalStyles.sectionTitle}>Recent Service History</Text>
          {driver.service_history.length === 0 ? (
            <Text style={modalStyles.emptyText}>No service history.</Text>
          ) : (
            driver.service_history.map((entry) => (
              <View key={entry.id} style={modalStyles.historyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={modalStyles.historyService}>{entry.services.join(', ')}</Text>
                  <Text style={modalStyles.historyMeta}>
                    {formatDate(entry.date)}{entry.technician_name ? ` · ${entry.technician_name}` : ''}
                  </Text>
                </View>
                <Text style={modalStyles.historyCost}>${entry.cost.toFixed(2)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </Modal>
  );
}

/* ── Invite Driver Modal ── */
function InviteDriverModal({
  visible,
  onClose,
  onInvite,
  isLoading,
}: {
  visible: boolean;
  onClose: () => void;
  onInvite: (name: string, email: string) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const handleSubmit = () => {
    if (!name.trim() || !email.trim()) {
      Alert.alert('Missing fields', 'Please enter both name and email.');
      return;
    }
    onInvite(name.trim(), email.trim());
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={inviteStyles.header}>
        <Text style={inviteStyles.title}>Invite Driver</Text>
        <TouchableOpacity onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={24} color={Theme.colors.text} />
        </TouchableOpacity>
      </View>

      <View style={inviteStyles.body}>
        <Text style={inviteStyles.description}>
          Send an invite link so the driver can register and link to your fleet.
        </Text>

        <Text style={inviteStyles.label}>Full Name</Text>
        <TextInput
          style={inviteStyles.input}
          placeholder="e.g. John Smith"
          placeholderTextColor={Theme.colors.textTertiary}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />

        <Text style={inviteStyles.label}>Email Address</Text>
        <TextInput
          style={inviteStyles.input}
          placeholder="john@company.com"
          placeholderTextColor={Theme.colors.textTertiary}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TouchableOpacity
          style={[inviteStyles.sendBtn, isLoading && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={isLoading}
          activeOpacity={0.7}
        >
          <Ionicons name="send-outline" size={18} color={Theme.colors.white} />
          <Text style={inviteStyles.sendBtnText}>
            {isLoading ? 'Sending...' : 'Send Invite'}
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

/* ── Main Screen ── */
export default function FleetDriversScreen() {
  const allowed = useFleetManagerGuard();
  const router = useRouter();
  const { data: drivers, isLoading, isError, refetch } = useFleetDrivers();
  const inviteMutation = useInviteDriver();

  const [selectedDriver, setSelectedDriver] = useState<FleetDriverDetail | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const handleDriverPress = useCallback((driver: FleetDriverDetail) => {
    setSelectedDriver(driver);
  }, []);

  const handleVehiclePress = useCallback((vehicleId: number) => {
    setSelectedDriver(null);
    router.push(`/customer/fleet/vehicles/${vehicleId}`);
  }, [router]);

  const handleInvite = useCallback((name: string, email: string) => {
    // TODO: Wire to backend when BE-23 is ready
    inviteMutation.mutate(
      { name, email },
      {
        onSuccess: () => {
          Alert.alert('Invite Sent', `An invite has been sent to ${email}.`);
          setShowInvite(false);
        },
        onError: () => {
          Alert.alert('Invite Sent', `An invite has been sent to ${email}. (Mock — backend not connected)`);
          setShowInvite(false);
        },
      },
    );
  }, [inviteMutation]);

  const renderDriver = useCallback(
    ({ item }: { item: FleetDriverDetail }) => (
      <DriverCard driver={item} onPress={() => handleDriverPress(item)} />
    ),
    [handleDriverPress],
  );

  if (!allowed) return null;

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
          title="Couldn't load drivers"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={drivers}
        keyExtractor={(d) => String(d.id)}
        renderItem={renderDriver}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            title="No drivers yet"
            message="Invite drivers to join your fleet."
            actionLabel="Invite Driver"
            onAction={() => setShowInvite(true)}
          />
        }
        ListFooterComponent={
          <View style={styles.demoBadgeRow}>
            <View style={styles.demoBadge}>
              <Text style={styles.demoBadgeText}>Drivers — Mock Data</Text>
            </View>
          </View>
        }
      />

      {/* Invite FAB */}
      <TouchableOpacity
        style={[styles.fab, Theme.shadow.lg]}
        onPress={() => setShowInvite(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="person-add" size={24} color={Theme.colors.white} />
      </TouchableOpacity>

      <DriverDetailModal
        driver={selectedDriver}
        visible={selectedDriver !== null}
        onClose={() => setSelectedDriver(null)}
        onVehiclePress={handleVehiclePress}
      />

      <InviteDriverModal
        visible={showInvite}
        onClose={() => setShowInvite(false)}
        onInvite={handleInvite}
        isLoading={inviteMutation.isPending}
      />
    </View>
  );
}

/* ── Card Styles ── */
const cardStyles = StyleSheet.create({
  container: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    marginBottom: Theme.spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.sm,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  name: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  meta: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
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
  overdueBadge: {
    backgroundColor: HealthColors.critical + '15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Theme.borderRadius.full,
  },
  overdueText: {
    fontSize: 11,
    fontWeight: '700',
    color: HealthColors.critical,
  },
});

/* ── Modal Styles ── */
const modalStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.lg,
    paddingBottom: Theme.spacing.sm,
    backgroundColor: Theme.colors.background,
  },
  title: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  scroll: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  content: {
    padding: Theme.spacing.md,
    paddingBottom: Theme.spacing.xxl,
  },
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    marginBottom: Theme.spacing.md,
  },
  sectionTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.sm,
  },
  emptyText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textTertiary,
    textAlign: 'center',
    paddingVertical: Theme.spacing.md,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    paddingVertical: Theme.spacing.sm,
  },
  contactText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.primary,
    fontWeight: '500',
  },
  complianceRow: {
    flexDirection: 'row',
    gap: Theme.spacing.sm,
  },
  complianceBadge: {
    flex: 1,
    alignItems: 'center',
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
  },
  complianceStat: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: '800',
  },
  complianceLabel: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.colors.borderLight,
  },
  vehicleName: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  vehiclePlate: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    fontFamily: 'Courier',
    marginTop: 1,
  },
  healthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Theme.borderRadius.full,
    gap: 4,
  },
  healthDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  healthText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '800',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.colors.borderLight,
  },
  historyService: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  historyMeta: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    marginTop: 1,
  },
  historyCost: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
    color: Theme.colors.text,
  },
});

/* ── Invite Modal Styles ── */
const inviteStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.lg,
    paddingBottom: Theme.spacing.sm,
    backgroundColor: Theme.colors.background,
  },
  title: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  body: {
    flex: 1,
    padding: Theme.spacing.md,
    backgroundColor: Theme.colors.background,
  },
  description: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginBottom: Theme.spacing.lg,
    lineHeight: 20,
  },
  label: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.xs,
    marginTop: Theme.spacing.md,
  },
  input: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: 12,
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.sm,
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.md,
    paddingVertical: 14,
    marginTop: Theme.spacing.xl,
  },
  sendBtnText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.white,
  },
});

/* ── Main Styles ── */
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
  demoBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Theme.spacing.lg,
  },
  demoBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: Theme.borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  demoBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400E',
  },
});
