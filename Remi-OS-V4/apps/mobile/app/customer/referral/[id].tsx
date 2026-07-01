import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';
import { ReferralStatus, REFERRAL_STATUS_LABELS, REFERRAL_TIMELINE_ORDER } from '@customer/types/enums';
import { useReferral, useAcceptQuote } from '@customer/hooks/referrals/use-referrals';
import { EmptyState } from '@customer/components/shared/empty-state';
import { successHaptic, selectionTap } from '@customer/services/haptics';
import type { ReferralPartnerQuote, ReferralSortField } from '@customer/types/referral';

const SORT_OPTIONS: { field: ReferralSortField; label: string }[] = [
  { field: 'price', label: 'Price' },
  { field: 'availability', label: 'Availability' },
  { field: 'rating', label: 'Rating' },
  { field: 'distance', label: 'Distance' },
];

function getCurrentStepIndex(status: ReferralStatus): number {
  const idx = REFERRAL_TIMELINE_ORDER.indexOf(status);
  return idx >= 0 ? idx : 0;
}

function formatVehicleTitle(v: { year: number | null; make: string | null; model: string | null }): string {
  return [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Unknown Vehicle';
}

function sortQuotes(quotes: ReferralPartnerQuote[], field: ReferralSortField): ReferralPartnerQuote[] {
  const sorted = [...quotes];
  switch (field) {
    case 'price':
      return sorted.sort((a, b) => a.price - b.price);
    case 'availability':
      return sorted.sort((a, b) => {
        if (!a.estimated_availability) return 1;
        if (!b.estimated_availability) return -1;
        return a.estimated_availability.localeCompare(b.estimated_availability);
      });
    case 'rating':
      return sorted.sort((a, b) => (b.partner_rating ?? 0) - (a.partner_rating ?? 0));
    case 'distance':
      return sorted.sort((a, b) => a.distance_miles - b.distance_miles);
  }
}

function renderStars(rating: number | null): string {
  if (rating == null) return '—';
  const full = Math.floor(rating);
  const half = rating - full >= 0.5 ? 1 : 0;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - half);
}

export default function ReferralDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const referralId = Number(id) || 0;
  const router = useRouter();

  const { data: referral, isPending, isError, refetch } = useReferral(referralId);
  const acceptQuote = useAcceptQuote(referralId);

  const [sortField, setSortField] = useState<ReferralSortField>('price');

  const currentIdx = useMemo(
    () => (referral ? getCurrentStepIndex(referral.status) : 0),
    [referral],
  );

  const sortedQuotes = useMemo(
    () => (referral?.quotes ? sortQuotes(referral.quotes, sortField) : []),
    [referral?.quotes, sortField],
  );

  const showQuotes =
    referral &&
    currentIdx >= getCurrentStepIndex(ReferralStatus.QUOTED);

  const showFleetApproval =
    referral?.fleet_approval?.required &&
    referral.fleet_approval.status != null;

  const showCompletion =
    referral?.status === ReferralStatus.COMPLETED &&
    referral.completion_details != null;

  const handleAcceptQuote = useCallback(
    (quoteId: number, partnerName: string) => {
      Alert.alert(
        'Select this partner?',
        `Confirm ${partnerName} for this referral service.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            onPress: () => {
              acceptQuote.mutate(
                { quoteId },
                {
                  onSuccess: () => {
                    successHaptic();
                  },
                },
              );
            },
          },
        ],
      );
    },
    [acceptQuote],
  );

  if (isPending) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (isError || !referral) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <EmptyState
          title="Referral not found"
          message="This referral may have been removed or the link is invalid."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header: vehicle info + service need */}
        <View style={styles.headerCard}>
          <View style={styles.headerIconWrap}>
            <Ionicons name="car-sport" size={24} color={Theme.colors.primary} />
          </View>
          <Text style={styles.vehicleTitle}>
            {formatVehicleTitle(referral.vehicle)}
          </Text>
          {referral.vehicle.license_plate ? (
            <Text style={styles.plate}>{referral.vehicle.license_plate}</Text>
          ) : null}
          <View style={styles.serviceNeedPill}>
            <Ionicons name="alert-circle" size={14} color={Theme.colors.warning} />
            <Text style={styles.serviceNeedText}>{referral.service_need}</Text>
          </View>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="person-outline" size={14} color={Theme.colors.textSecondary} />
              <Text style={styles.metaText}>{referral.detecting_technician_name}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={14} color={Theme.colors.textSecondary} />
              <Text style={styles.metaText}>
                {new Date(referral.detected_at).toLocaleDateString()}
              </Text>
            </View>
          </View>
        </View>

        {/* Status Stepper */}
        <View style={styles.stepperCard}>
          <Text style={styles.sectionTitle}>Referral Progress</Text>
          <View style={styles.stepperRow}>
            {REFERRAL_TIMELINE_ORDER.map((step, index) => {
              const isPast = currentIdx > index;
              const isCurrent = currentIdx === index;
              const isFuture = currentIdx < index;
              const label = REFERRAL_STATUS_LABELS[step];

              return (
                <View key={step} style={styles.stepItem}>
                  <View style={styles.stepDotRow}>
                    {index > 0 ? (
                      <View
                        style={[
                          styles.stepConnector,
                          isPast && styles.stepConnectorDone,
                          isCurrent && styles.stepConnectorDone,
                        ]}
                      />
                    ) : (
                      <View style={styles.stepConnectorPlaceholder} />
                    )}
                    <View
                      style={[
                        styles.stepDot,
                        isPast && styles.stepDotDone,
                        isCurrent && styles.stepDotCurrent,
                        isFuture && styles.stepDotFuture,
                      ]}
                    >
                      {isPast ? (
                        <Ionicons name="checkmark" size={10} color={Theme.colors.white} />
                      ) : null}
                    </View>
                    {index < REFERRAL_TIMELINE_ORDER.length - 1 ? (
                      <View
                        style={[
                          styles.stepConnector,
                          isPast && styles.stepConnectorDone,
                        ]}
                      />
                    ) : (
                      <View style={styles.stepConnectorPlaceholder} />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.stepLabel,
                      isCurrent && styles.stepLabelCurrent,
                      isPast && styles.stepLabelDone,
                    ]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Fleet Approval Gate */}
        {showFleetApproval ? (
          <View style={[
            styles.fleetCard,
            referral.fleet_approval!.status === 'declined' && styles.fleetCardDeclined,
          ]}>
            <View style={styles.fleetHeader}>
              <Ionicons
                name={
                  referral.fleet_approval!.status === 'approved'
                    ? 'shield-checkmark'
                    : referral.fleet_approval!.status === 'declined'
                      ? 'close-circle'
                      : 'time'
                }
                size={20}
                color={
                  referral.fleet_approval!.status === 'approved'
                    ? Theme.colors.success
                    : referral.fleet_approval!.status === 'declined'
                      ? Theme.colors.error
                      : Theme.colors.warning
                }
              />
              <Text style={styles.fleetTitle}>
                {referral.fleet_approval!.status === 'pending'
                  ? 'Pending Fleet Manager Approval'
                  : referral.fleet_approval!.status === 'approved'
                    ? 'Fleet Manager Approved'
                    : 'Fleet Manager Declined'}
              </Text>
            </View>
            {referral.fleet_approval!.status === 'declined' &&
              referral.fleet_approval!.decline_reason ? (
              <Text style={styles.fleetDeclineReason}>
                {referral.fleet_approval!.decline_reason}
              </Text>
            ) : null}
            {referral.fleet_approval!.status === 'declined' ? (
              <Text style={styles.fleetDeclineHint}>
                You can select a different partner or cancel this referral.
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Quote Comparison */}
        {showQuotes && sortedQuotes.length > 0 ? (
          <View style={styles.quotesSection}>
            <Text style={styles.sectionTitle}>Partner Quotes</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sortRow}
            >
              {SORT_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.field}
                  style={[
                    styles.sortChip,
                    sortField === opt.field && styles.sortChipActive,
                  ]}
                  onPress={() => {
                    selectionTap();
                    setSortField(opt.field);
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.sortChipText,
                      sortField === opt.field && styles.sortChipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {sortedQuotes.map((quote) => {
              const isSelected = referral.selected_quote_id === quote.id;
              return (
                <View
                  key={quote.id}
                  style={[
                    styles.quoteCard,
                    isSelected && styles.quoteCardSelected,
                  ]}
                >
                  <View style={styles.quoteHeader}>
                    <View style={styles.quotePartnerInfo}>
                      {quote.partner_logo_url ? (
                        <View style={styles.partnerLogoPlaceholder}>
                          <Ionicons name="business" size={20} color={Theme.colors.textSecondary} />
                        </View>
                      ) : (
                        <View style={styles.partnerLogoPlaceholder}>
                          <Ionicons name="business" size={20} color={Theme.colors.textSecondary} />
                        </View>
                      )}
                      <View style={styles.partnerNameCol}>
                        <Text style={styles.partnerName}>{quote.partner_name}</Text>
                        <Text style={styles.partnerDistance}>
                          {quote.distance_miles.toFixed(1)} mi away
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.quotePrice}>${quote.price.toFixed(2)}</Text>
                  </View>

                  {quote.estimated_availability ? (
                    <View style={styles.quoteMetaRow}>
                      <Ionicons name="calendar-outline" size={14} color={Theme.colors.textSecondary} />
                      <Text style={styles.quoteMetaText}>{quote.estimated_availability}</Text>
                    </View>
                  ) : null}

                  {quote.partner_rating != null ? (
                    <View style={styles.quoteMetaRow}>
                      <Text style={styles.quoteStars}>{renderStars(quote.partner_rating)}</Text>
                      <Text style={styles.quoteReviewCount}>
                        {quote.partner_rating.toFixed(1)}
                        {quote.partner_review_count != null
                          ? ` (${quote.partner_review_count} reviews)`
                          : ''}
                      </Text>
                    </View>
                  ) : null}

                  {isSelected ? (
                    <View style={styles.selectedBadge}>
                      <Ionicons name="checkmark-circle" size={16} color={Theme.colors.success} />
                      <Text style={styles.selectedBadgeText}>Selected</Text>
                    </View>
                  ) : referral.status === ReferralStatus.QUOTED ? (
                    <TouchableOpacity
                      style={styles.selectBtn}
                      onPress={() => handleAcceptQuote(quote.id, quote.partner_name)}
                      disabled={acceptQuote.isPending}
                      activeOpacity={0.85}
                    >
                      {acceptQuote.isPending ? (
                        <ActivityIndicator size="small" color={Theme.colors.white} />
                      ) : (
                        <Text style={styles.selectBtnText}>Select this partner</Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Completion Details */}
        {showCompletion ? (
          <View style={styles.completionCard}>
            <View style={styles.completionHeader}>
              <Ionicons name="checkmark-circle" size={24} color={Theme.colors.success} />
              <Text style={styles.completionTitle}>Service Completed</Text>
            </View>

            {referral.completion_details!.partner_summary ? (
              <View style={styles.completionRow}>
                <Text style={styles.completionKey}>Summary</Text>
                <Text style={styles.completionVal}>
                  {referral.completion_details!.partner_summary}
                </Text>
              </View>
            ) : null}

            {referral.completion_details!.final_cost != null ? (
              <View style={styles.completionRow}>
                <Text style={styles.completionKey}>Final Cost</Text>
                <Text style={styles.completionValBold}>
                  ${referral.completion_details!.final_cost.toFixed(2)}
                </Text>
              </View>
            ) : null}

            {referral.completion_details!.warranty_info ? (
              <View style={styles.completionRow}>
                <Text style={styles.completionKey}>Warranty</Text>
                <Text style={styles.completionVal}>
                  {referral.completion_details!.warranty_info}
                </Text>
              </View>
            ) : null}

            {referral.completion_details!.next_recommended_date ? (
              <View style={styles.completionRow}>
                <Text style={styles.completionKey}>Next Recommended</Text>
                <Text style={styles.completionVal}>
                  {new Date(referral.completion_details!.next_recommended_date).toLocaleDateString()}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerCard: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    alignItems: 'center',
    ...Theme.shadow.md,
  },
  headerIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Theme.colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.sm,
  },
  vehicleTitle: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.text,
    textAlign: 'center',
  },
  plate: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  serviceNeedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.xs,
    backgroundColor: Theme.colors.warning + '18',
    borderRadius: Theme.borderRadius.full,
    paddingHorizontal: Theme.spacing.sm + 4,
    paddingVertical: Theme.spacing.xs + 2,
    marginTop: Theme.spacing.sm,
  },
  serviceNeedText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    gap: Theme.spacing.lg,
    marginTop: Theme.spacing.sm,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.xs,
  },
  metaText: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
  },

  stepperCard: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  sectionTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.md,
  },
  stepperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
  },
  stepDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    width: '100%',
    justifyContent: 'center',
  },
  stepConnector: {
    flex: 1,
    height: 2,
    backgroundColor: Theme.colors.border,
  },
  stepConnectorDone: {
    backgroundColor: Theme.colors.success,
  },
  stepConnectorPlaceholder: {
    flex: 1,
  },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotDone: {
    backgroundColor: Theme.colors.success,
  },
  stepDotCurrent: {
    backgroundColor: Theme.colors.primary,
    borderWidth: 3,
    borderColor: Theme.colors.primary + '40',
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  stepDotFuture: {
    backgroundColor: Theme.colors.surface,
    borderWidth: 2,
    borderColor: Theme.colors.border,
  },
  stepLabel: {
    fontSize: 10,
    color: Theme.colors.textTertiary,
    marginTop: Theme.spacing.xs,
    textAlign: 'center',
  },
  stepLabelCurrent: {
    color: Theme.colors.primary,
    fontWeight: '700',
    fontSize: 11,
  },
  stepLabelDone: {
    color: Theme.colors.success,
    fontWeight: '600',
  },

  fleetCard: {
    backgroundColor: Theme.colors.warning + '12',
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.warning + '40',
  },
  fleetCardDeclined: {
    backgroundColor: Theme.colors.error + '0A',
    borderColor: Theme.colors.error + '30',
  },
  fleetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
  },
  fleetTitle: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
    color: Theme.colors.text,
    flex: 1,
  },
  fleetDeclineReason: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.error,
    marginTop: Theme.spacing.sm,
    paddingLeft: 28,
  },
  fleetDeclineHint: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    marginTop: Theme.spacing.xs,
    paddingLeft: 28,
  },

  quotesSection: {
    marginBottom: Theme.spacing.md,
  },
  sortRow: {
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.md,
    paddingHorizontal: 2,
  },
  sortChip: {
    paddingHorizontal: Theme.spacing.sm + 4,
    paddingVertical: Theme.spacing.xs + 2,
    borderRadius: Theme.borderRadius.full,
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  sortChipActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  sortChipText: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
  sortChipTextActive: {
    color: Theme.colors.white,
  },
  quoteCard: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    ...Theme.shadow.sm,
  },
  quoteCardSelected: {
    borderColor: Theme.colors.success,
    borderWidth: 2,
  },
  quoteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Theme.spacing.sm,
  },
  quotePartnerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    flex: 1,
  },
  partnerLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerNameCol: {
    flex: 1,
  },
  partnerName: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  partnerDistance: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    marginTop: 1,
  },
  quotePrice: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '800',
    color: Theme.colors.primary,
  },
  quoteMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.xs,
    marginBottom: Theme.spacing.xs,
  },
  quoteMetaText: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
  },
  quoteStars: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.warning,
  },
  quoteReviewCount: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
  },
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.xs,
    marginTop: Theme.spacing.sm,
    paddingVertical: Theme.spacing.xs,
  },
  selectedBadgeText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.success,
  },
  selectBtn: {
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.md,
    paddingVertical: Theme.spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Theme.spacing.sm,
    minHeight: 44,
  },
  selectBtnText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
  },

  completionCard: {
    backgroundColor: Theme.colors.success + '0A',
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.success + '30',
  },
  completionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.md,
  },
  completionTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.success,
  },
  completionRow: {
    marginBottom: Theme.spacing.sm,
  },
  completionKey: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  completionVal: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text,
    lineHeight: 20,
  },
  completionValBold: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
  },
});
