import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePaymentSheet } from '@stripe/stripe-react-native';
import { Theme } from '@customer/constants/colors';
import { DEFAULT_FRANCHISE_ID } from '@customer/constants/config';
import { captureBookingForConfirmation, useBookingStore } from '@/src/stores/customer/booking';
import { useAppointments } from '@customer/hooks/appointments/use-appointments';
import { useCreateBooking } from '@customer/hooks/appointments/use-booking';
import {
  usePaymentMethods,
  useCreateSetupIntent,
  useConfirmBookingPayment,
} from '@customer/hooks/payments/use-payments';
import { formatVehicleDisplayTitle } from '@customer/utils/vehicle-display';
import { formatDateLong, timeLabel } from '@customer/utils/date-format';
import type { Appointment, StripePaymentMethod } from '@customer/types/api';

const TAX_RATE = 0.0825;
const TERMINAL_STATUSES = ['completed', 'paid', 'cancelled'];

function findBookingConflicts(
  appointments: Appointment[],
  vehicleId: number,
  date: string,
  time: string,
  serviceIds: number[],
): { duplicateServiceNames: string[]; sameSlot: boolean } {
  const matching = appointments.filter(
    (a) =>
      a.vehicle_id === vehicleId &&
      a.scheduled_date === date &&
      !TERMINAL_STATUSES.includes(a.status),
  );
  const existingServiceIds = new Set(
    matching.flatMap((a) => a.services?.map((s) => s.service_id) ?? []),
  );
  const duplicateServiceNames = serviceIds
    .filter((id) => existingServiceIds.has(id))
    .map((id) => {
      const svc = matching
        .flatMap((a) => a.services ?? [])
        .find((s) => s.service_id === id);
      return svc?.service?.name ?? `Service #${id}`;
    });
  const sameSlot = matching.some((a) => a.scheduled_time === time);
  return { duplicateServiceNames, sameSlot };
}

function brandDisplay(brand: string): string {
  const names: Record<string, string> = {
    visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', discover: 'Discover',
  };
  return names[brand] ?? brand.charAt(0).toUpperCase() + brand.slice(1);
}

function cardLabel(method: StripePaymentMethod): string {
  if (!method.card) return 'Card';
  return `${brandDisplay(method.card.brand)} •••• ${method.card.last4}`;
}

export default function ReviewBookingScreen() {
  const router = useRouter();
  const selectedServices = useBookingStore((s) => s.selectedServices);
  const selectedVehicle = useBookingStore((s) => s.selectedVehicle);
  const selectedDate = useBookingStore((s) => s.selectedDate);
  const selectedTime = useBookingStore((s) => s.selectedTime);
  const selectedAddress = useBookingStore((s) => s.selectedAddress);
  const selectedSuggestion = useBookingStore((s) => s.selectedSuggestion);
  const deferredItemId = useBookingStore((s) => s.deferredItemId);
  const selectedPaymentMethodId = useBookingStore((s) => s.selectedPaymentMethodId);
  const setPaymentMethodId = useBookingStore((s) => s.setPaymentMethodId);
  const reset = useBookingStore((s) => s.reset);
  const createBooking = useCreateBooking();
  const confirmPayment = useConfirmBookingPayment();
  const { data: existingAppointments } = useAppointments();
  const { data: paymentMethods } = usePaymentMethods();
  const setupIntent = useCreateSetupIntent();
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();
  const [submitting, setSubmitting] = useState(false);
  const [addingCard, setAddingCard] = useState(false);

  const activeMethod = useMemo(() => {
    if (!paymentMethods?.length) return null;
    if (selectedPaymentMethodId) {
      return paymentMethods.find((m) => m.id === selectedPaymentMethodId) ?? paymentMethods[0];
    }
    return paymentMethods[0];
  }, [paymentMethods, selectedPaymentMethodId]);

  const handleAddCard = useCallback(async () => {
    setAddingCard(true);
    try {
      const result = await setupIntent.mutateAsync();
      const { error: initError } = await initPaymentSheet({
        setupIntentClientSecret: result.setupIntentSecret,
        customerEphemeralKeySecret: result.ephemeralKey,
        merchantDisplayName: 'REMI Service',
        returnURL: 'remicustomer://stripe-redirect',
        allowsDelayedPaymentMethods: false,
      });
      if (initError) {
        Alert.alert('Setup Error', initError.message);
        return;
      }
      const { error: presentError } = await presentPaymentSheet();
      if (presentError && presentError.code !== 'Canceled') {
        Alert.alert('Error', presentError.message);
      }
    } catch {
      Alert.alert('Connection Error', 'Could not connect to payment service.');
    } finally {
      setAddingCard(false);
    }
  }, [setupIntent, initPaymentSheet, presentPaymentSheet]);

  const handleSelectCard = useCallback(() => {
    if (!paymentMethods?.length || paymentMethods.length <= 1) return;
    const options = paymentMethods.map((m) => ({
      text: cardLabel(m),
      onPress: () => setPaymentMethodId(m.id),
    }));
    options.push({ text: 'Cancel', onPress: () => {} });
    Alert.alert('Select Card', 'Choose a payment method', options);
  }, [paymentMethods, setPaymentMethodId]);

  const { subtotal, tax, total } = useMemo(() => {
    const sub = selectedServices.reduce((sum, s) => sum + Number(s.base_price), 0);
    const t = Math.round(sub * TAX_RATE * 100) / 100;
    return { subtotal: sub, tax: t, total: Math.round((sub + t) * 100) / 100 };
  }, [selectedServices]);

  const canConfirm =
    selectedServices.length > 0 &&
    selectedVehicle &&
    selectedDate &&
    selectedTime &&
    selectedAddress;

  const addressLine = selectedAddress
    ? `${selectedAddress.address_line}, ${selectedAddress.city}, ${selectedAddress.state} ${selectedAddress.zip}`
    : '—';

  const submitBooking = useCallback(async () => {
    if (!selectedVehicle || !selectedAddress || !selectedDate || !selectedTime) return;
    setSubmitting(true);

    try {
      const techId = selectedSuggestion?.technicianId;
      const response = await createBooking.mutateAsync({
        serviceIds: selectedServices.map((s) => s.id),
        vehicleId: selectedVehicle.id,
        addressId: selectedAddress.id,
        technicianId: techId != null && techId > 0 ? techId : undefined,
        scheduledDate: selectedDate,
        scheduledTime: selectedTime,
        suggestionScore: selectedSuggestion?.score,
        deferredItemId: deferredItemId ?? undefined,
        franchiseId: DEFAULT_FRANCHISE_ID,
      });

      const methodId = selectedPaymentMethodId ?? activeMethod?.id;
      if (methodId && response.appointmentId) {
        try {
          await confirmPayment.mutateAsync({
            appointmentId: response.appointmentId,
            paymentMethodId: methodId,
          });
        } catch {
          // Payment failed but booking was created — user can pay later
        }
      }

      captureBookingForConfirmation(response);
      reset();
      router.replace('/customer/booking/confirmed');
    } catch {
      // The previous behavior here silently created a fake local appointment
      // when the API call failed, then navigated to the success screen — so
      // a customer whose booking actually failed would see "Confirmed" and
      // never receive service. Surface the real error instead.
      Alert.alert(
        'Booking Failed',
        "We couldn't create your booking. Please check your connection and try again.",
        [{ text: 'OK' }],
      );
    } finally {
      setSubmitting(false);
    }
  }, [selectedVehicle, selectedAddress, selectedDate, selectedTime, selectedServices, selectedSuggestion, deferredItemId, selectedPaymentMethodId, activeMethod, createBooking, confirmPayment, reset, router]);

  const handleConfirm = useCallback(() => {
    if (!selectedVehicle || !selectedDate || !selectedTime) return;

    const { duplicateServiceNames, sameSlot } = findBookingConflicts(
      existingAppointments ?? [],
      selectedVehicle.id,
      selectedDate,
      selectedTime,
      selectedServices.map((s) => s.id),
    );

    const warnings: string[] = [];
    if (duplicateServiceNames.length > 0) {
      warnings.push(
        `${duplicateServiceNames.join(', ')} ${duplicateServiceNames.length === 1 ? 'is' : 'are'} already on an appointment for this vehicle on this date.`,
      );
    }
    if (sameSlot) {
      warnings.push('You already have an appointment at this time.');
    }

    if (warnings.length > 0) {
      Alert.alert(
        'Booking Conflict',
        `${warnings.join('\n\n')}\n\nWould you like to book anyway?`,
        [
          { text: 'Go Back', style: 'cancel' },
          { text: 'Book Anyway', onPress: submitBooking },
        ],
      );
      return;
    }

    submitBooking();
  }, [selectedVehicle, selectedDate, selectedTime, selectedServices, existingAppointments, submitBooking]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Almost there</Text>
          <Text style={styles.heroSub}>Review your booking details before confirming.</Text>
        </View>

        <Text style={styles.blockTitle}>Services</Text>
        <View style={styles.card}>
          {selectedServices.map((s) => (
            <View key={s.id} style={styles.lineRow}>
              <Text style={styles.lineName} numberOfLines={2}>
                {s.name}
              </Text>
              <Text style={styles.linePrice}>${Number(s.base_price).toFixed(2)}</Text>
            </View>
          ))}
          {selectedServices.length === 0 ? (
            <Text style={styles.muted}>No services selected.</Text>
          ) : null}
        </View>

        <Text style={styles.blockTitle}>Vehicle</Text>
        <View style={styles.card}>
          <Text style={styles.cardValue}>
            {selectedVehicle ? formatVehicleDisplayTitle(selectedVehicle) : '—'}
          </Text>
          {selectedVehicle?.license_plate ? (
            <Text style={styles.cardMeta}>{selectedVehicle.license_plate.toUpperCase()}</Text>
          ) : null}
        </View>

        <Text style={styles.blockTitle}>Schedule</Text>
        <View style={styles.card}>
          <Text style={styles.cardValue}>
            {selectedDate ? formatDateLong(selectedDate) : '—'}
          </Text>
          <Text style={styles.cardMeta}>{timeLabel(selectedTime)}</Text>
        </View>

        {selectedSuggestion ? (
          <>
            <Text style={styles.blockTitle}>Your technician</Text>
            <View style={styles.card}>
              <Text style={styles.cardValue}>{selectedSuggestion.technicianName}</Text>
              <Text style={styles.cardMeta}>{selectedSuggestion.explanation}</Text>
            </View>
          </>
        ) : null}

        <Text style={styles.blockTitle}>Service address</Text>
        <View style={styles.card}>
          <Text style={styles.cardValue}>{addressLine}</Text>
        </View>

        <Text style={styles.blockTitle}>Payment method</Text>
        {activeMethod ? (
          <TouchableOpacity
            style={styles.card}
            onPress={handleSelectCard}
            activeOpacity={paymentMethods && paymentMethods.length > 1 ? 0.7 : 1}
          >
            <View style={styles.paymentRow}>
              <Ionicons name="card-outline" size={20} color={Theme.colors.primary} />
              <Text style={styles.paymentLabel}>{cardLabel(activeMethod)}</Text>
              {paymentMethods && paymentMethods.length > 1 ? (
                <Text style={styles.chevron}>›</Text>
              ) : null}
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.addPaymentCard}
            onPress={handleAddCard}
            activeOpacity={0.8}
            disabled={addingCard}
          >
            {addingCard ? (
              <ActivityIndicator size="small" color={Theme.colors.primary} />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={20} color={Theme.colors.primary} />
                <Text style={styles.addPaymentText}>Add payment method</Text>
              </>
            )}
            <Text style={styles.optionalBadge}>Optional</Text>
          </TouchableOpacity>
        )}

        <View style={styles.totalsCard}>
          <View style={styles.lineRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>${subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.lineRow}>
            <Text style={styles.totalLabel}>Est. tax</Text>
            <Text style={styles.totalValue}>${tax.toFixed(2)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.lineRow}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandValue}>${total.toFixed(2)}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.confirmBtn, (!canConfirm || submitting) && styles.confirmBtnDisabled]}
          disabled={!canConfirm || submitting}
          onPress={handleConfirm}
          activeOpacity={0.9}
        >
          {submitting ? (
            <ActivityIndicator color={Theme.colors.white} />
          ) : (
            <Text style={styles.confirmText}>Confirm Booking</Text>
          )}
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
  },
  heroTitle: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.xs,
  },
  heroSub: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    lineHeight: 20,
  },
  blockTitle: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '700',
    color: Theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: Theme.spacing.sm,
    marginTop: Theme.spacing.sm,
  },
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    ...Theme.shadow.sm,
  },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
  },
  lineName: {
    flex: 1,
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
    fontWeight: '500',
  },
  linePrice: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  muted: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textTertiary,
  },
  cardValue: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
    lineHeight: 22,
  },
  cardMeta: {
    marginTop: Theme.spacing.xs,
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
  },
  totalsCard: {
    marginTop: Theme.spacing.lg,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    ...Theme.shadow.md,
  },
  totalLabel: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.textSecondary,
  },
  totalValue: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: Theme.colors.borderLight,
    marginVertical: Theme.spacing.md,
  },
  grandLabel: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  grandValue: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: '800',
    color: Theme.colors.primary,
  },
  footer: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.sm,
    paddingBottom: Theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.borderLight,
    backgroundColor: Theme.colors.background,
  },
  confirmBtn: {
    backgroundColor: Theme.colors.success,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md + 2,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
    ...Theme.shadow.md,
  },
  confirmBtnDisabled: {
    backgroundColor: Theme.colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.lg,
    fontWeight: '800',
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
  },
  paymentLabel: {
    flex: 1,
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  chevron: {
    fontSize: Theme.fontSize.xl,
    color: Theme.colors.textTertiary,
  },
  addPaymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Theme.colors.primary + '40',
    ...Theme.shadow.sm,
  },
  addPaymentText: {
    flex: 1,
    fontSize: Theme.fontSize.md,
    fontWeight: '500',
    color: Theme.colors.primary,
  },
  optionalBadge: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '600',
    color: Theme.colors.textTertiary,
    backgroundColor: Theme.colors.surface,
    paddingHorizontal: Theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: Theme.borderRadius.sm,
    overflow: 'hidden',
  },
});
