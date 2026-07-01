import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';
import { DEFAULT_FRANCHISE_ID } from '@customer/constants/config';
import { useBookingStore } from '@/src/stores/customer/booking';
import { useSuggestBooking } from '@customer/hooks/appointments/use-booking';
import { EmptyState } from '@customer/components/shared/empty-state';
import { buildFallbackBookingSuggestions } from '@customer/services/booking-fallback-suggestions';
import { selectionTap } from '@customer/services/haptics';
import type { ScoredSuggestion } from '@customer/types/api';
import { toISODate, formatDateShort, formatTime as formatTimeDisplay } from '@customer/utils/date-format';

const UI_SUGGEST_FAILSAFE_MS = 16_000;

export default function SmartSuggestionsScreen() {
  const router = useRouter();
  const selectedServices = useBookingStore((s) => s.selectedServices);
  const selectedVehicle = useBookingStore((s) => s.selectedVehicle);
  const selectedAddress = useBookingStore((s) => s.selectedAddress);
  const setSelectedSuggestion = useBookingStore((s) => s.setSelectedSuggestion);

  const [picked, setPicked] = useState<number | null>(null);
  const [uiFailsafeSlots, setUiFailsafeSlots] = useState<ScoredSuggestion[] | null>(null);
  const suggestPreferredStartRef = useRef<string | null>(null);

  const { mutate, data: suggestions, isPending, isError, error } = useSuggestBooking();

  useEffect(() => {
    const today = new Date();
    const end = new Date(today);
    end.setDate(today.getDate() + 7);
    const preferredStart = toISODate(today);
    suggestPreferredStartRef.current = preferredStart;

    mutate({
      serviceIds: selectedServices.map((s) => s.id),
      vehicleId: selectedVehicle?.id,
      addressId: selectedAddress?.id ?? 0,
      preferredDateStart: preferredStart,
      preferredDateEnd: toISODate(end),
      franchiseId: DEFAULT_FRANCHISE_ID,
    });
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      const start = suggestPreferredStartRef.current ?? toISODate(new Date());
      setUiFailsafeSlots((prev) => prev ?? buildFallbackBookingSuggestions(start));
    }, UI_SUGGEST_FAILSAFE_MS);
    return () => clearTimeout(id);
  }, []);

  const displaySuggestions: ScoredSuggestion[] =
    suggestions && suggestions.length > 0 ? suggestions : uiFailsafeSlots ?? [];
  const hasSuggestions = displaySuggestions.length > 0;
  const usingFallback =
    Boolean(suggestions?.some((s) => s.isFallbackSuggestion)) ||
    Boolean(uiFailsafeSlots && (!suggestions || suggestions.length === 0));
  const showLoadingSkeleton = isPending && !hasSuggestions;

  function handleSelect(suggestion: ScoredSuggestion, index: number) {
    selectionTap();
    setPicked(index);
    setSelectedSuggestion(suggestion);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Ionicons name="sparkles" size={24} color={Theme.colors.primary} />
          <Text style={styles.heroTitle}>Smart scheduling</Text>
          <Text style={styles.heroSub}>
            {usingFallback
              ? 'Showing sample times so you can finish booking. Live routing will replace these when the scheduler is connected.'
              : 'We found the best times based on technician availability, route efficiency, and your location.'}
          </Text>
        </View>

        {usingFallback && hasSuggestions ? (
          <View style={styles.fallbackBanner}>
            <Ionicons name="information-circle" size={20} color={Theme.colors.warning} />
            <Text style={styles.fallbackBannerText}>
              Demo times — the suggest API did not return slots (or timed out). Your booking still uses your real vehicle, services, and address.
            </Text>
          </View>
        ) : null}

        {showLoadingSkeleton ? (
          <View style={styles.loadingBlock}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.skeletonCard}>
                <View style={styles.skeletonLine} />
                <View style={[styles.skeletonLine, styles.skeletonShort]} />
              </View>
            ))}
          </View>
        ) : null}

        {isError ? (
          <EmptyState
            title="Couldn't load suggestions"
            message={
              (error as Error)?.message ??
              'Something went wrong. Please go back and try again.'
            }
            actionLabel="Retry"
            onAction={() => {
              const today = new Date();
              const end = new Date(today);
              end.setDate(today.getDate() + 7);
              mutate({
                serviceIds: selectedServices.map((s) => s.id),
                vehicleId: selectedVehicle?.id,
                addressId: selectedAddress?.id ?? 0,
                preferredDateStart: toISODate(today),
                preferredDateEnd: toISODate(end),
                franchiseId: DEFAULT_FRANCHISE_ID,
              });
            }}
          />
        ) : null}

        {!showLoadingSkeleton && !isError && !hasSuggestions ? (
          <EmptyState
            title="No availability"
            message="We couldn't find any open slots for the next 7 days. Try adjusting your services or check back later."
            actionLabel="See options"
            onAction={() => router.replace('/customer/booking/no-availability')}
          />
        ) : null}

        {hasSuggestions
          ? displaySuggestions.map((s, index) => {
              const isTop = index === 0;
              const isSelected = picked === index;
              const isEco = !!s.isEcoSlot;
              const discountLabel =
                s.ecoDiscountAmount && s.ecoDiscountAmount > 0
                  ? s.ecoDiscountType === 'credit'
                    ? `$${s.ecoDiscountAmount} credit`
                    : `Save $${s.ecoDiscountAmount}`
                  : null;

              return (
                <TouchableOpacity
                  key={`${s.technicianId}-${s.date}-${s.timeSlot}`}
                  style={[
                    styles.suggestionCard,
                    isEco && styles.suggestionCardEco,
                    isTop && !isEco && styles.suggestionCardTop,
                    isSelected && styles.suggestionCardSelected,
                  ]}
                  onPress={() => handleSelect(s, index)}
                  activeOpacity={0.85}
                >
                  <View style={styles.badgeRow}>
                    {isTop ? (
                      <View style={styles.recommendedBadge}>
                        <Ionicons name="star" size={12} color={Theme.colors.white} />
                        <Text style={styles.recommendedText}>Recommended</Text>
                      </View>
                    ) : null}
                    {isEco ? (
                      <View style={styles.ecoBadge}>
                        <Ionicons name="leaf" size={12} color={Theme.colors.white} />
                        <Text style={styles.ecoText}>Eco Slot</Text>
                      </View>
                    ) : null}
                    {discountLabel ? (
                      <View style={styles.discountBadge}>
                        <Text style={styles.discountText}>{discountLabel}</Text>
                      </View>
                    ) : null}
                  </View>

                  {isEco ? (
                    <Text style={styles.ecoProximity}>
                      A technician is already in your area
                    </Text>
                  ) : null}

                  <View style={styles.suggestionHeader}>
                    <Text style={styles.suggestionDate}>
                      {formatDateShort(s.date)}
                    </Text>
                    <Text style={styles.suggestionTime}>
                      {formatTimeDisplay(s.timeSlot)}
                    </Text>
                  </View>

                  <View style={styles.techRow}>
                    <View style={[styles.techAvatar, isEco && styles.techAvatarEco]}>
                      <Ionicons
                        name="person-circle-outline"
                        size={28}
                        color={isEco ? Theme.colors.success : Theme.colors.textSecondary}
                      />
                    </View>
                    <View style={styles.techInfo}>
                      <Text style={styles.techName}>{s.technicianName}</Text>
                      <Text style={styles.driveTime}>
                        ~{s.estimatedDriveMinutes} min away
                      </Text>
                    </View>
                    {isSelected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={24}
                        color={Theme.colors.primary}
                      />
                    ) : (
                      <Ionicons
                        name="ellipse-outline"
                        size={24}
                        color={Theme.colors.border}
                      />
                    )}
                  </View>

                  {s.estimatedDurationMin != null ? (
                    <View style={styles.durationRow}>
                      <Ionicons name="time-outline" size={14} color={Theme.colors.textSecondary} />
                      <Text style={styles.durationText}>
                        ~{s.estimatedDurationMin} min
                        {s.durationConfidenceRangeMin != null && s.durationConfidenceRangeMin > 0
                          ? ` (±${s.durationConfidenceRangeMin} min)`
                          : ''}
                      </Text>
                      {s.durationConfidenceRangeMin != null && s.durationConfidenceRangeMin >= 20 ? (
                        <Text style={styles.durationNote}>Duration may vary</Text>
                      ) : null}
                    </View>
                  ) : null}

                  <Text style={styles.explanation}>{s.explanation}</Text>
                </TouchableOpacity>
              );
            })
          : null}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueBtn, picked == null && styles.continueBtnDisabled]}
          disabled={picked == null}
          onPress={() => router.push('/customer/booking/review')}
          activeOpacity={0.85}
        >
          <Text style={styles.continueText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  scrollContent: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.md,
    paddingBottom: Theme.spacing.xxl,
  },
  heroCard: {
    backgroundColor: Theme.colors.primary + '10',
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '33',
    gap: Theme.spacing.xs,
  },
  heroTitle: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  heroSub: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    lineHeight: 20,
  },
  fallbackBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Theme.spacing.sm,
    backgroundColor: Theme.colors.warning + '14',
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.warning + '40',
  },
  fallbackBannerText: {
    flex: 1,
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text,
    lineHeight: 20,
  },
  loadingBlock: {
    gap: Theme.spacing.md,
  },
  skeletonCard: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    gap: Theme.spacing.sm,
  },
  skeletonLine: {
    height: 16,
    borderRadius: 8,
    backgroundColor: Theme.colors.border,
    width: '70%',
  },
  skeletonShort: {
    width: '45%',
  },
  suggestionCard: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    borderWidth: 2,
    borderColor: Theme.colors.border,
    ...Theme.shadow.sm,
  },
  suggestionCardEco: {
    borderColor: Theme.colors.success + '55',
    backgroundColor: Theme.colors.success + '06',
  },
  suggestionCardTop: {
    borderColor: Theme.colors.primary + '55',
  },
  suggestionCardSelected: {
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.primary + '08',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Theme.spacing.xs,
    marginBottom: Theme.spacing.sm,
  },
  recommendedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.full,
    paddingHorizontal: Theme.spacing.sm,
    paddingVertical: 3,
    gap: 4,
  },
  recommendedText: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '700',
    color: Theme.colors.white,
  },
  ecoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.success,
    borderRadius: Theme.borderRadius.full,
    paddingHorizontal: Theme.spacing.sm,
    paddingVertical: 3,
    gap: 4,
  },
  ecoText: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '700',
    color: Theme.colors.white,
  },
  discountBadge: {
    backgroundColor: Theme.colors.success + '18',
    borderRadius: Theme.borderRadius.full,
    paddingHorizontal: Theme.spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Theme.colors.success + '40',
  },
  discountText: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '700',
    color: Theme.colors.success,
  },
  ecoProximity: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.success,
    fontWeight: '600',
    marginBottom: Theme.spacing.sm,
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: Theme.spacing.sm,
  },
  suggestionDate: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  suggestionTime: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '800',
    color: Theme.colors.primary,
  },
  techRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Theme.spacing.sm,
    gap: Theme.spacing.sm,
  },
  techAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  techAvatarEco: {
    backgroundColor: Theme.colors.success + '15',
  },
  techInfo: {
    flex: 1,
  },
  techName: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  driveTime: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.xs,
    marginBottom: Theme.spacing.sm,
    paddingVertical: Theme.spacing.xs,
    paddingHorizontal: Theme.spacing.sm,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.sm,
  },
  durationText: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  durationNote: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    fontStyle: 'italic',
    marginLeft: Theme.spacing.xs,
  },
  explanation: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  footer: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.sm,
    paddingBottom: Theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.borderLight,
    backgroundColor: Theme.colors.background,
  },
  continueBtn: {
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  continueBtnDisabled: {
    backgroundColor: Theme.colors.border,
  },
  continueText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
  },
});
