import { useCallback, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Theme, getHealthColor, HealthColors } from '@customer/constants/colors';
import { HealthRing, HealthRingGroup } from '@customer/components/vehicle/health-ring';
import { SkeletonBox } from '@customer/components/shared/skeleton';
import { EmptyState } from '@customer/components/shared/empty-state';
import { useFleetVehicle } from '@customer/hooks/fleet/use-fleet-vehicles';
import { useServices } from '@customer/hooks/services/use-services';
import { useAuthStore } from '@/src/stores/auth';
import { useDriverServiceRequest } from '@customer/hooks/fleet/use-fleet-approvals';
import type {
  FleetServiceHistoryEntry,
  FleetDeferredItem,
  FleetInspectionEntry,
  FleetDueSoonItem,
} from '@customer/types/fleet';

const SEVERITY_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: '#FEF2F2', text: HealthColors.critical, label: 'Critical' },
  high: { bg: '#FEF2F2', text: HealthColors.critical, label: 'High' },
  medium: { bg: '#FEFCE8', text: HealthColors.warning, label: 'Medium' },
  low: { bg: '#F0FDF4', text: HealthColors.good, label: 'Low' },
};

const URGENCY_CONFIG: Record<string, { color: string; label: string }> = {
  overdue: { color: HealthColors.critical, label: 'Overdue' },
  urgent: { color: HealthColors.critical, label: 'Urgent' },
  upcoming: { color: HealthColors.warning, label: 'Upcoming' },
  on_track: { color: HealthColors.good, label: 'On Track' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/* ── Section: Vehicle Header ── */
function VehicleHeader({
  name, plate, vin, score,
}: {
  name: string; plate: string | null; vin: string | null; score: number;
}) {
  return (
    <View style={[sectionStyles.card, Theme.shadow.md]}>
      <View style={sectionStyles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={sectionStyles.vehicleName}>{name}</Text>
          {plate && <Text style={sectionStyles.plate}>{plate}</Text>}
          {vin && <Text style={sectionStyles.vin}>VIN: {vin}</Text>}
        </View>
        <HealthRing score={score} variant="default" animated />
      </View>
    </View>
  );
}

/* ── Section: Assigned Driver ── */
function AssignedDriverCard({
  driver,
  onReassign,
}: {
  driver: { name: string; phone: string | null; email: string } | null;
  onReassign: () => void;
}) {
  const handleCall = useCallback(() => {
    if (driver?.phone) Linking.openURL(`tel:${driver.phone}`);
  }, [driver?.phone]);

  const handleEmail = useCallback(() => {
    if (driver?.email) Linking.openURL(`mailto:${driver.email}`);
  }, [driver?.email]);

  return (
    <View style={[sectionStyles.card, Theme.shadow.sm]}>
      <Text style={sectionStyles.sectionTitle}>Assigned Driver</Text>
      {driver ? (
        <>
          <View style={sectionStyles.driverRow}>
            <View style={sectionStyles.driverAvatar}>
              <Ionicons name="person" size={22} color={Theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={sectionStyles.driverName}>{driver.name}</Text>
              {driver.phone && <Text style={sectionStyles.driverMeta}>{driver.phone}</Text>}
              <Text style={sectionStyles.driverMeta}>{driver.email}</Text>
            </View>
            <View style={sectionStyles.driverActions}>
              {driver.phone && (
                <TouchableOpacity style={sectionStyles.iconBtn} onPress={handleCall}>
                  <Ionicons name="call-outline" size={18} color={Theme.colors.primary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={sectionStyles.iconBtn} onPress={handleEmail}>
                <Ionicons name="mail-outline" size={18} color={Theme.colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity style={sectionStyles.outlineBtn} onPress={onReassign} activeOpacity={0.7}>
            <Ionicons name="swap-horizontal-outline" size={16} color={Theme.colors.primary} />
            <Text style={sectionStyles.outlineBtnText}>Reassign Driver</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity style={sectionStyles.primaryBtn} onPress={onReassign} activeOpacity={0.7}>
          <Ionicons name="person-add-outline" size={18} color={Theme.colors.white} />
          <Text style={sectionStyles.primaryBtnText}>Assign Driver</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/* ── Section: Health Breakdown ── */
function HealthBreakdownCard({
  components,
}: {
  components: { oil: number; tires: number; brakes: number; filters: number; wipers: number; fluids: number };
}) {
  return (
    <View style={[sectionStyles.card, Theme.shadow.sm]}>
      <Text style={sectionStyles.sectionTitle}>Health Breakdown</Text>
      <HealthRingGroup
        health={{
          overall: Math.round(
            (components.oil + components.tires + components.brakes + components.filters + components.wipers + components.fluids) / 6,
          ),
          components: {
            oil: components.oil,
            filter: components.filters,
            tires: components.tires,
            wipers: components.wipers,
            brakes: components.brakes,
            fluids: components.fluids,
          },
        }}
        variant="full"
      />
    </View>
  );
}

/* ── Section: Service Timeline ── */
function ServiceTimelineCard({ entries }: { entries: FleetServiceHistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <View style={[sectionStyles.card, Theme.shadow.sm]}>
        <Text style={sectionStyles.sectionTitle}>Service Timeline</Text>
        <Text style={sectionStyles.emptyText}>No service history yet.</Text>
      </View>
    );
  }

  return (
    <View style={[sectionStyles.card, Theme.shadow.sm]}>
      <Text style={sectionStyles.sectionTitle}>Service Timeline</Text>
      {entries.map((entry, i) => (
        <View key={entry.id}>
          <View style={sectionStyles.timelineRow}>
            <View style={sectionStyles.timelineDot} />
            <View style={{ flex: 1 }}>
              <Text style={sectionStyles.timelineService}>{entry.services.join(', ')}</Text>
              <Text style={sectionStyles.timelineMeta}>
                {formatDate(entry.date)}{entry.technician_name ? ` · ${entry.technician_name}` : ''}
              </Text>
            </View>
            <Text style={sectionStyles.timelineCost}>{formatCurrency(entry.cost)}</Text>
          </View>
          {i < entries.length - 1 && <View style={sectionStyles.timelineLine} />}
        </View>
      ))}
    </View>
  );
}

/* ── Section: Deferred Work ── */
function DeferredWorkCard({
  items,
  onApproveBook,
}: {
  items: FleetDeferredItem[];
  onApproveBook: (item: FleetDeferredItem) => void;
}) {
  if (items.length === 0) return null;

  return (
    <View style={[sectionStyles.card, Theme.shadow.sm]}>
      <Text style={sectionStyles.sectionTitle}>Deferred Work</Text>
      {items.map((item) => {
        const sev = SEVERITY_CONFIG[item.severity] ?? SEVERITY_CONFIG.low;
        return (
          <View key={item.id} style={[sectionStyles.deferredRow, { borderLeftColor: sev.text }]}>
            <View style={{ flex: 1 }}>
              <View style={sectionStyles.deferredHeader}>
                <Text style={sectionStyles.deferredType}>
                  {(item.recommended_service ?? item.observation_type).replace(/_/g, ' ')}
                </Text>
                <View style={[sectionStyles.severityBadge, { backgroundColor: sev.bg }]}>
                  <Text style={[sectionStyles.severityText, { color: sev.text }]}>{sev.label}</Text>
                </View>
              </View>
              {item.technician_notes && (
                <Text style={sectionStyles.deferredNotes} numberOfLines={2}>{item.technician_notes}</Text>
              )}
              {item.estimated_cost != null && (
                <Text style={sectionStyles.deferredCost}>Est. {formatCurrency(item.estimated_cost)}</Text>
              )}
            </View>
            <TouchableOpacity
              style={sectionStyles.approveBtn}
              onPress={() => onApproveBook(item)}
              activeOpacity={0.7}
            >
              <Text style={sectionStyles.approveBtnText}>Approve & Book</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

/* ── Section: Inspection History ── */
function InspectionHistoryCard({ entries }: { entries: FleetInspectionEntry[] }) {
  if (entries.length === 0) {
    return (
      <View style={[sectionStyles.card, Theme.shadow.sm]}>
        <Text style={sectionStyles.sectionTitle}>Inspection History</Text>
        <Text style={sectionStyles.emptyText}>No inspections recorded.</Text>
      </View>
    );
  }

  const statusColor = (s: string) =>
    s === 'passed' ? HealthColors.good : s === 'flagged' ? HealthColors.warning : HealthColors.critical;

  return (
    <View style={[sectionStyles.card, Theme.shadow.sm]}>
      <Text style={sectionStyles.sectionTitle}>Inspection History</Text>
      {entries.map((entry) => (
        <TouchableOpacity key={entry.id} style={sectionStyles.inspectionRow} activeOpacity={0.7}>
          <View style={[sectionStyles.inspectionDot, { backgroundColor: statusColor(entry.status) }]} />
          <View style={{ flex: 1 }}>
            <Text style={sectionStyles.inspectionDate}>{formatDate(entry.date)}</Text>
            {entry.driver_name && <Text style={sectionStyles.inspectionMeta}>{entry.driver_name}</Text>}
          </View>
          <View style={sectionStyles.inspectionScore}>
            <Text style={[sectionStyles.inspectionScoreText, { color: statusColor(entry.status) }]}>
              {entry.score}
            </Text>
            {entry.flagged_items > 0 && (
              <Text style={sectionStyles.inspectionFlags}>{entry.flagged_items} flagged</Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={16} color={Theme.colors.textTertiary} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

/* ── Section: Due-Soon Forecast ── */
function DueSoonCard({ items }: { items: FleetDueSoonItem[] }) {
  if (items.length === 0) return null;

  return (
    <View style={[sectionStyles.card, Theme.shadow.sm]}>
      <Text style={sectionStyles.sectionTitle}>Due-Soon Forecast</Text>
      {items.map((item) => {
        const urg = URGENCY_CONFIG[item.urgency] ?? URGENCY_CONFIG.on_track;
        return (
          <View key={item.id} style={sectionStyles.dueSoonRow}>
            <View style={[sectionStyles.dueSoonDot, { backgroundColor: urg.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={sectionStyles.dueSoonService}>{item.service_name}</Text>
              <Text style={sectionStyles.dueSoonMeta}>
                {item.days_remaining != null ? `${item.days_remaining} days` : ''}
                {item.days_remaining != null && item.miles_remaining != null ? ' · ' : ''}
                {item.miles_remaining != null ? `${item.miles_remaining.toLocaleString()} mi` : ''}
              </Text>
            </View>
            <View style={[sectionStyles.urgencyBadge, { backgroundColor: urg.color + '15' }]}>
              <Text style={[sectionStyles.urgencyText, { color: urg.color }]}>{urg.label}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ── Main Screen ── */
export default function FleetVehicleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicleId = Number(id) || 0;
  const router = useRouter();

  const { data: vehicle, isLoading, isError, refetch } = useFleetVehicle(vehicleId);

  const vehicleName = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Unknown Vehicle'
    : '';

  // @demo-start
  const demoFleetRole = useAuthStore((s) => s.demoFleetRole);
  // @demo-end
  const isDriver = demoFleetRole === 'fleet_driver';
  const { data: services } = useServices();
  const driverServiceRequest = useDriverServiceRequest();
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestServiceId, setRequestServiceId] = useState<number | null>(null);
  const [requestNote, setRequestNote] = useState('');

  const handleReassign = useCallback(() => {
    Alert.alert('Reassign Driver', 'Driver picker coming soon — requires backend integration.');
  }, []);

  const handleBookService = useCallback(() => {
    router.push({ pathname: '/customer/fleet/book', params: { vehicleId: String(vehicleId) } });
  }, [router, vehicleId]);

  const handleApproveDeferred = useCallback((item: FleetDeferredItem) => {
    router.push({
      pathname: '/customer/fleet/book',
      params: { vehicleId: String(vehicleId), serviceDesc: item.recommended_service ?? item.observation_type },
    });
  }, [router, vehicleId]);

  const handleExport = useCallback(() => {
    Alert.alert('Export', 'PDF export coming soon — requires backend integration.');
  }, []);

  const handleRequestService = useCallback(() => {
    setShowRequestModal(true);
    setRequestServiceId(null);
    setRequestNote('');
  }, []);

  const handleSubmitRequest = useCallback(async () => {
    if (!requestServiceId) {
      Alert.alert('Select a Service', 'Please choose a service before submitting.');
      return;
    }
    try {
      const result = await driverServiceRequest.mutateAsync({
        vehicle_id: vehicleId,
        service_ids: [requestServiceId],
        note: requestNote || undefined,
      });
      setShowRequestModal(false);

      // TODO: When fleet settings (BE-24) are available, auto_approve_threshold
      // will be checked server-side. If the server returns status='approved',
      // skip the "sent for approval" message and go straight to booking.
      if (result.status === 'approved') {
        Alert.alert(
          'Auto-Approved',
          'This request is within the auto-approval threshold. Proceeding to booking.',
          [{ text: 'Book Now', onPress: () => router.push({ pathname: '/customer/fleet/book', params: { vehicleId: String(vehicleId) } }) }],
        );
      } else {
        Alert.alert(
          'Request Sent',
          'Your service request has been sent to your fleet manager for approval.',
        );
      }
    } catch {
      Alert.alert('Error', 'Could not submit your request. Please try again.');
    }
  }, [vehicleId, requestServiceId, requestNote, driverServiceRequest, router]);

  if (isLoading) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <SkeletonBox width="100%" height={120} borderRadius={16} />
        <View style={{ height: 16 }} />
        <SkeletonBox width="100%" height={80} borderRadius={12} />
        <View style={{ height: 16 }} />
        <SkeletonBox width="100%" height={160} borderRadius={12} />
      </ScrollView>
    );
  }

  if (isError || !vehicle) {
    return (
      <View style={styles.emptyWrap}>
        <EmptyState
          title="Couldn't load vehicle"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <VehicleHeader
        name={vehicleName}
        plate={vehicle.license_plate}
        vin={vehicle.vin}
        score={vehicle.health_score}
      />

      <AssignedDriverCard
        driver={vehicle.assigned_driver}
        onReassign={handleReassign}
      />

      <HealthBreakdownCard components={vehicle.health_components} />

      <ServiceTimelineCard entries={vehicle.service_history} />

      <DeferredWorkCard items={vehicle.deferred_items} onApproveBook={handleApproveDeferred} />

      <InspectionHistoryCard entries={vehicle.inspection_history} />

      <DueSoonCard items={vehicle.due_soon} />

      {/* Action buttons */}
      <View style={styles.actionRow}>
        {isDriver ? (
          <TouchableOpacity style={styles.actionBtn} onPress={handleRequestService} activeOpacity={0.7}>
            <Ionicons name="hand-left-outline" size={18} color={Theme.colors.white} />
            <Text style={styles.actionBtnText}>Request Service</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.actionBtn} onPress={handleBookService} activeOpacity={0.7}>
            <Ionicons name="calendar-outline" size={18} color={Theme.colors.white} />
            <Text style={styles.actionBtnText}>Book Service</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.actionBtnOutline} onPress={handleExport} activeOpacity={0.7}>
          <Ionicons name="download-outline" size={18} color={Theme.colors.primary} />
          <Text style={styles.actionBtnOutlineText}>Export PDF</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.demoBadgeRow}>
        <View style={styles.demoBadge}>
          <Text style={styles.demoBadgeText}>Fleet Vehicle Detail — Mock Data</Text>
        </View>
      </View>

      {/* Driver Service Request Modal */}
      <Modal
        visible={showRequestModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowRequestModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Request Service</Text>
            <TouchableOpacity onPress={() => setShowRequestModal(false)} hitSlop={12}>
              <Ionicons name="close" size={24} color={Theme.colors.text} />
            </TouchableOpacity>
          </View>
          <Text style={styles.modalSub}>
            Select a service and your fleet manager will review the request.
          </Text>

          <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
            {(services ?? []).map((svc) => {
              const selected = requestServiceId === svc.id;
              return (
                <TouchableOpacity
                  key={svc.id}
                  style={[styles.modalServiceCard, selected && styles.modalServiceCardSelected]}
                  onPress={() => setRequestServiceId(svc.id)}
                  activeOpacity={0.75}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modalServiceName, selected && styles.modalServiceNameSelected]}>
                      {svc.name}
                    </Text>
                    {svc.description ? (
                      <Text style={styles.modalServiceDesc} numberOfLines={1}>{svc.description}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.modalServicePrice}>${Number(svc.base_price).toFixed(2)}</Text>
                  <View style={[styles.modalRadio, selected && styles.modalRadioSelected]}>
                    {selected && <Ionicons name="checkmark" size={14} color={Theme.colors.white} />}
                  </View>
                </TouchableOpacity>
              );
            })}

            <Text style={styles.modalNoteLabel}>Note (optional)</Text>
            <TextInput
              style={styles.modalNoteInput}
              placeholder="Describe the issue or reason..."
              placeholderTextColor={Theme.colors.textTertiary}
              value={requestNote}
              onChangeText={setRequestNote}
              multiline
              returnKeyType="done"
              blurOnSubmit
            />
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.modalSubmitBtn, !requestServiceId && styles.modalSubmitBtnDisabled]}
              onPress={handleSubmitRequest}
              disabled={!requestServiceId || driverServiceRequest.isPending}
              activeOpacity={0.85}
            >
              <Text style={styles.modalSubmitText}>Submit Request</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

/* ── Section Styles ── */
const sectionStyles = StyleSheet.create({
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    marginBottom: Theme.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.md,
  },
  vehicleName: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  plate: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    fontFamily: 'Courier',
    marginTop: 2,
  },
  vin: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    fontFamily: 'Courier',
    marginTop: 2,
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

  /* Driver */
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.sm,
  },
  driverAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverName: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  driverMeta: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
  },
  driverActions: {
    flexDirection: 'row',
    gap: Theme.spacing.xs,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.colors.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.xs,
    paddingVertical: 10,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.primary,
  },
  outlineBtnText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.sm,
    paddingVertical: 12,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Theme.colors.primary,
  },
  primaryBtnText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.white,
  },

  /* Timeline */
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Theme.spacing.sm,
    paddingVertical: Theme.spacing.sm,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Theme.colors.primary,
    marginTop: 4,
  },
  timelineService: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  timelineMeta: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    marginTop: 1,
  },
  timelineCost: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  timelineLine: {
    width: 2,
    height: 12,
    backgroundColor: Theme.colors.borderLight,
    marginLeft: 4,
  },

  /* Deferred */
  deferredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    paddingVertical: Theme.spacing.sm,
    borderLeftWidth: 3,
    paddingLeft: Theme.spacing.sm,
    marginBottom: Theme.spacing.xs,
  },
  deferredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    marginBottom: 2,
  },
  deferredType: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
    textTransform: 'capitalize',
    flex: 1,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Theme.borderRadius.full,
  },
  severityText: {
    fontSize: 11,
    fontWeight: '700',
  },
  deferredNotes: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    marginTop: 1,
  },
  deferredCost: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  approveBtn: {
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  approveBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.colors.white,
  },

  /* Inspection */
  inspectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    paddingVertical: Theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.colors.borderLight,
  },
  inspectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  inspectionDate: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  inspectionMeta: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
  },
  inspectionScore: {
    alignItems: 'flex-end',
  },
  inspectionScoreText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '800',
  },
  inspectionFlags: {
    fontSize: 11,
    color: HealthColors.warning,
    fontWeight: '600',
  },

  /* Due Soon */
  dueSoonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    paddingVertical: Theme.spacing.sm,
  },
  dueSoonDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dueSoonService: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  dueSoonMeta: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    marginTop: 1,
  },
  urgencyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Theme.borderRadius.full,
  },
  urgencyText: {
    fontSize: 11,
    fontWeight: '700',
  },
});

/* ── Main Styles ── */
const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  content: {
    padding: Theme.spacing.md,
    paddingBottom: Theme.spacing.xxl,
  },
  emptyWrap: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    justifyContent: 'center',
    padding: Theme.spacing.lg,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Theme.spacing.sm,
    marginTop: Theme.spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.xs,
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.md,
    paddingVertical: 14,
  },
  actionBtnText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
    color: Theme.colors.white,
  },
  actionBtnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.xs,
    borderWidth: 1,
    borderColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.md,
    paddingVertical: 14,
  },
  actionBtnOutlineText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  demoBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Theme.spacing.xl,
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

  modalContainer: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    paddingTop: Theme.spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.md,
    paddingBottom: Theme.spacing.sm,
  },
  modalTitle: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  modalSub: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    paddingHorizontal: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
    lineHeight: 20,
  },
  modalScroll: {
    flex: 1,
    paddingHorizontal: Theme.spacing.md,
  },
  modalServiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: Theme.colors.border,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
  },
  modalServiceCardSelected: {
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.primary + '08',
  },
  modalServiceName: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  modalServiceNameSelected: { color: Theme.colors.primary },
  modalServiceDesc: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  modalServicePrice: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
    marginHorizontal: Theme.spacing.sm,
  },
  modalRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalRadioSelected: {
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.primary,
  },
  modalNoteLabel: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
    marginTop: Theme.spacing.lg,
    marginBottom: Theme.spacing.sm,
  },
  modalNoteInput: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    padding: Theme.spacing.md,
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalFooter: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.sm,
    paddingBottom: Theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.borderLight,
  },
  modalSubmitBtn: {
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  modalSubmitBtnDisabled: { backgroundColor: Theme.colors.border },
  modalSubmitText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
  },
});
