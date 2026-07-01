import { useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { Theme } from '@customer/constants/colors';
import { useServiceRecord } from '@customer/hooks/services/use-service-record';
import { EmptyState } from '@customer/components/shared/empty-state';
import { formatDateLong } from '@customer/utils/date-format';
import type { ServiceRecord, ServiceRecordLineItem } from '@customer/types/api';

const MAXI_BRAND_BLUE = '#1E3A5F';
const MAXI_SHIELD_GOLD = '#D4A843';
const CARFAX_GREEN = '#22C55E';

function FranchiseHeader({ record }: { record: ServiceRecord }) {
  return (
    <View style={styles.franchiseHeader}>
      <View style={styles.shieldBadge}>
        <Ionicons name="shield-checkmark" size={32} color={MAXI_SHIELD_GOLD} />
      </View>
      <Text style={styles.brandName}>{record.franchise.name}</Text>
      <Text style={styles.locationName}>{record.franchise.locationName}</Text>
      <Text style={styles.franchiseAddress}>{record.franchise.address}</Text>
      {record.franchise.phone ? (
        <Text style={styles.franchisePhone}>{record.franchise.phone}</Text>
      ) : null}
      <View style={styles.headerDivider} />
      <Text style={styles.receiptTitle}>MAXI Shield Service Record</Text>
      <Text style={styles.receiptDate}>{formatDateLong(record.completedAt)}</Text>
    </View>
  );
}

function VehicleSection({ record }: { record: ServiceRecord }) {
  const v = record.vehicle;
  const vehicleLabel = [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle';

  return (
    <View style={[styles.card, Theme.shadow.md]}>
      <View style={styles.sectionHeader}>
        <Ionicons name="car-outline" size={20} color={MAXI_BRAND_BLUE} />
        <Text style={styles.sectionTitle}>Vehicle Information</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Vehicle</Text>
        <Text style={styles.infoValue}>{vehicleLabel}</Text>
      </View>
      {v.vin ? (
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>VIN</Text>
          <Text style={[styles.infoValue, styles.monoText]}>{v.vin}</Text>
        </View>
      ) : null}
      {v.mileageAtService != null ? (
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Mileage at Service</Text>
          <Text style={styles.infoValue}>
            {v.mileageAtService.toLocaleString()} mi
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function ServiceLineItem({ item }: { item: ServiceRecordLineItem }) {
  return (
    <View style={styles.lineItem}>
      <View style={styles.lineItemHeader}>
        <Text style={styles.lineItemName}>{item.serviceName}</Text>
        <Text style={styles.lineItemPrice}>${item.price.toFixed(2)}</Text>
      </View>
      {item.description ? (
        <Text style={styles.lineItemDesc}>{item.description}</Text>
      ) : null}
      {item.partsUsed.length > 0 ? (
        <View style={styles.partsSection}>
          <Text style={styles.partsLabel}>Parts Used</Text>
          {item.partsUsed.map((part, idx) => (
            <View key={idx} style={styles.partRow}>
              <View style={styles.partDot} />
              <Text style={styles.partName}>
                {part.name}
                {part.quantity > 1 ? ` ×${part.quantity}` : ''}
              </Text>
              {part.partNumber ? (
                <Text style={styles.partNumber}>{part.partNumber}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ServicesSection({ record }: { record: ServiceRecord }) {
  return (
    <View style={[styles.card, Theme.shadow.md]}>
      <View style={styles.sectionHeader}>
        <Ionicons name="construct-outline" size={20} color={MAXI_BRAND_BLUE} />
        <Text style={styles.sectionTitle}>Services Performed</Text>
      </View>
      {record.services.map((svc, idx) => (
        <ServiceLineItem key={idx} item={svc} />
      ))}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>${record.totalPrice.toFixed(2)}</Text>
      </View>
    </View>
  );
}

function TechnicianSection({ record }: { record: ServiceRecord }) {
  return (
    <View style={[styles.card, Theme.shadow.md]}>
      <View style={styles.sectionHeader}>
        <Ionicons name="person-outline" size={20} color={MAXI_BRAND_BLUE} />
        <Text style={styles.sectionTitle}>Technician</Text>
      </View>
      <View style={styles.techRow}>
        <View style={styles.techAvatar}>
          <Ionicons name="person" size={24} color={Theme.colors.white} />
        </View>
        <View style={styles.techInfo}>
          <Text style={styles.techName}>{record.technician.name}</Text>
          {record.technician.certificationLevel ? (
            <View style={styles.certBadge}>
              <Ionicons name="ribbon-outline" size={14} color={MAXI_SHIELD_GOLD} />
              <Text style={styles.certText}>{record.technician.certificationLevel}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function CarfaxBadge({ record }: { record: ServiceRecord }) {
  if (!record.carfaxReported) return null;

  return (
    <View style={[styles.card, styles.carfaxCard, Theme.shadow.md]}>
      <View style={styles.carfaxContent}>
        <View style={styles.carfaxIconCircle}>
          <Ionicons name="checkmark" size={20} color={Theme.colors.white} />
        </View>
        <View style={styles.carfaxTextBlock}>
          <Text style={styles.carfaxTitle}>Automatically Reported to CARFAX</Text>
          <Text style={styles.carfaxSubtext}>
            This service is part of your vehicle's permanent history
          </Text>
        </View>
      </View>
    </View>
  );
}

function QRSection({ record }: { record: ServiceRecord }) {
  if (!record.digitalRecordUrl) return null;

  return (
    <View style={[styles.card, Theme.shadow.md, styles.qrCard]}>
      <Text style={styles.qrTitle}>Digital Service Record</Text>
      <Text style={styles.qrSubtext}>
        Scan to view or share this record anytime
      </Text>
      <View style={styles.qrWrapper}>
        <QRCode
          value={record.digitalRecordUrl}
          size={160}
          color={MAXI_BRAND_BLUE}
          backgroundColor={Theme.colors.white}
        />
      </View>
      <Text style={styles.qrUrl} numberOfLines={1}>
        {record.digitalRecordUrl}
      </Text>
    </View>
  );
}

export default function ServiceRecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const appointmentId = Number(id);
  const { data: record, isPending, isError, refetch } = useServiceRecord(appointmentId);

  const handleShare = useCallback(async () => {
    if (!record) return;
    const vehicleLabel = [record.vehicle.year, record.vehicle.make, record.vehicle.model]
      .filter(Boolean)
      .join(' ');
    const serviceList = record.services.map((s) => `• ${s.serviceName}`).join('\n');
    const message = [
      `MAXI Shield Service Record`,
      `${record.franchise.locationName}`,
      ``,
      `Vehicle: ${vehicleLabel}`,
      record.vehicle.vin ? `VIN: ${record.vehicle.vin}` : null,
      `Date: ${formatDateLong(record.completedAt)}`,
      ``,
      `Services:`,
      serviceList,
      ``,
      `Total: $${record.totalPrice.toFixed(2)}`,
      record.carfaxReported ? `\n✓ Reported to CARFAX` : null,
      record.digitalRecordUrl ? `\nView online: ${record.digitalRecordUrl}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await Share.share({
        message,
        ...(Platform.OS === 'ios' && record.digitalRecordUrl
          ? { url: record.digitalRecordUrl }
          : {}),
      });
    } catch {
      // User cancelled share
    }
  }, [record]);

  const handleDownloadPDF = useCallback(() => {
    if (!record?.pdfUrl) {
      // TODO: Backend 18.01-18.05 — PDF generation not available yet
      Alert.alert(
        'Coming Soon',
        'PDF download will be available once your service record is fully processed.',
      );
      return;
    }
    Linking.openURL(record.pdfUrl);
  }, [record]);

  if (isPending) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Theme.colors.primary} />
          <Text style={styles.loadingText}>Loading service record…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError || !record) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <EmptyState
          title="Record not found"
          message="This service record isn't available yet. It will appear after your appointment is completed."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <FranchiseHeader record={record} />
        <VehicleSection record={record} />
        <ServicesSection record={record} />
        <TechnicianSection record={record} />
        <CarfaxBadge record={record} />
        <QRSection record={record} />

        <View style={styles.actionGroup}>
          <TouchableOpacity
            style={styles.shareBtn}
            onPress={handleShare}
            activeOpacity={0.85}
          >
            <Ionicons name="share-outline" size={20} color={Theme.colors.white} />
            <Text style={styles.shareBtnText}>Share Record</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.downloadBtn}
            onPress={handleDownloadPDF}
            activeOpacity={0.85}
          >
            <Ionicons name="download-outline" size={20} color={MAXI_BRAND_BLUE} />
            <Text style={styles.downloadBtnText}>Download PDF</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Ionicons name="shield-checkmark" size={16} color={MAXI_SHIELD_GOLD} />
          <Text style={styles.footerText}>
            Protected by MAXI Shield™ — Your vehicle service guarantee
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  scroll: {
    padding: Theme.spacing.md,
    paddingBottom: Theme.spacing.xxl,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.md,
  },
  loadingText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
  },

  franchiseHeader: {
    alignItems: 'center',
    paddingVertical: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
  },
  shieldBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: MAXI_BRAND_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.md,
    ...Theme.shadow.lg,
  },
  brandName: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '800',
    color: MAXI_BRAND_BLUE,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  locationName: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
    marginTop: Theme.spacing.xs,
  },
  franchiseAddress: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
  franchisePhone: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  headerDivider: {
    width: 48,
    height: 3,
    backgroundColor: MAXI_SHIELD_GOLD,
    borderRadius: 2,
    marginVertical: Theme.spacing.md,
  },
  receiptTitle: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  receiptDate: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginTop: Theme.spacing.xs,
  },

  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.md,
  },
  sectionTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  infoRow: {
    marginBottom: Theme.spacing.sm,
  },
  infoLabel: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
    lineHeight: 22,
  },
  monoText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: Theme.fontSize.sm,
    letterSpacing: 0.8,
  },

  lineItem: {
    paddingBottom: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.borderLight,
  },
  lineItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  lineItemName: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
    flex: 1,
    marginRight: Theme.spacing.sm,
  },
  lineItemPrice: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: MAXI_BRAND_BLUE,
  },
  lineItemDesc: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginTop: Theme.spacing.xs,
    lineHeight: 20,
  },
  partsSection: {
    marginTop: Theme.spacing.sm,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.sm,
    padding: Theme.spacing.sm,
  },
  partsLabel: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '700',
    color: Theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Theme.spacing.xs,
  },
  partRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    flexWrap: 'wrap',
  },
  partDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: MAXI_SHIELD_GOLD,
    marginRight: Theme.spacing.sm,
  },
  partName: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text,
    flex: 1,
  },
  partNumber: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: Theme.spacing.md,
    borderTopWidth: 2,
    borderTopColor: MAXI_BRAND_BLUE + '22',
  },
  totalLabel: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  totalValue: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '800',
    color: MAXI_BRAND_BLUE,
  },

  techRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.md,
  },
  techAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: MAXI_BRAND_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  techInfo: {
    flex: 1,
  },
  techName: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  certBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Theme.spacing.xs,
  },
  certText: {
    fontSize: Theme.fontSize.sm,
    color: MAXI_SHIELD_GOLD,
    fontWeight: '600',
  },

  carfaxCard: {
    borderColor: CARFAX_GREEN + '44',
    backgroundColor: CARFAX_GREEN + '08',
  },
  carfaxContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.md,
  },
  carfaxIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CARFAX_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carfaxTextBlock: {
    flex: 1,
  },
  carfaxTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: CARFAX_GREEN,
  },
  carfaxSubtext: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginTop: 2,
    lineHeight: 20,
  },

  qrCard: {
    alignItems: 'center',
  },
  qrTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.xs,
  },
  qrSubtext: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginBottom: Theme.spacing.lg,
  },
  qrWrapper: {
    padding: Theme.spacing.md,
    backgroundColor: Theme.colors.white,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    ...Theme.shadow.sm,
  },
  qrUrl: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    marginTop: Theme.spacing.md,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  actionGroup: {
    gap: Theme.spacing.sm,
    marginTop: Theme.spacing.sm,
    marginBottom: Theme.spacing.md,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.sm,
    backgroundColor: MAXI_BRAND_BLUE,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    minHeight: 52,
    ...Theme.shadow.md,
  },
  shareBtnText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.white,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.sm,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    borderWidth: 2,
    borderColor: MAXI_BRAND_BLUE + '33',
    minHeight: 52,
  },
  downloadBtnText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: MAXI_BRAND_BLUE,
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.sm,
    paddingVertical: Theme.spacing.lg,
  },
  footerText: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
