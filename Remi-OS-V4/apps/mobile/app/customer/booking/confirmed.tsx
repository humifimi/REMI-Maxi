import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';
import { Brand } from '@customer/constants/brand';
import { consumeBookingConfirmation } from '@/src/stores/customer/booking';
import { playSound } from '@customer/services/sound';
import { successHaptic } from '@customer/services/haptics';
import { formatVehicleDisplayTitle } from '@customer/utils/vehicle-display';
import { formatDateShort, timeLabel } from '@customer/utils/date-format';

export default function BookingConfirmedScreen() {
  const router = useRouter();
  const [snap] = useState(() => consumeBookingConfirmation());

  useEffect(() => {
    playSound('bookingConfirmed');
    successHaptic();
  }, []);

  const serviceSummary = useMemo(
    () => (snap?.selectedServices ?? []).map((s) => s.name).join(' · '),
    [snap?.selectedServices]
  );

  const addressLine = snap?.selectedAddress
    ? `${snap.selectedAddress.address_line}, ${snap.selectedAddress.city}`
    : '—';

  const technicianName =
    snap?.serverResponse?.technicianName ?? snap?.selectedSuggestion?.technicianName ?? null;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconWrap}>
          <View style={styles.iconCircle}>
            <Ionicons name="checkmark" size={56} color={Theme.colors.white} />
          </View>
        </View>

        <Text style={styles.title}>Booking Confirmed!</Text>
        {snap?.serverResponse?.appointmentId ? (
          <Text style={styles.bookingId}>
            Booking #{Math.abs(snap.serverResponse.appointmentId)}
          </Text>
        ) : null}
        <Text style={styles.subtitle}>
          {Brand.serviceCopy.thankYou} You’ll get a reminder before your technician heads out.
        </Text>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryCardTitle}>Booking summary</Text>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Ionicons name="construct-outline" size={20} color={Theme.colors.primary} />
            <View style={styles.summaryTextBlock}>
              <Text style={styles.summaryLabel}>Services</Text>
              <Text style={styles.summaryValue} numberOfLines={3}>
                {serviceSummary || '—'}
              </Text>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <Ionicons name="car-sport-outline" size={20} color={Theme.colors.primary} />
            <View style={styles.summaryTextBlock}>
              <Text style={styles.summaryLabel}>Vehicle</Text>
              <Text style={styles.summaryValue}>
                {snap?.selectedVehicle ? formatVehicleDisplayTitle(snap.selectedVehicle) : '—'}
              </Text>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <Ionicons name="calendar-outline" size={20} color={Theme.colors.primary} />
            <View style={styles.summaryTextBlock}>
              <Text style={styles.summaryLabel}>When</Text>
              <Text style={styles.summaryValue}>
                {snap?.selectedDate
                  ? `${formatDateShort(snap.selectedDate)} · ${timeLabel(snap.selectedTime)}`
                  : '—'}
              </Text>
            </View>
          </View>
          {technicianName ? (
            <View style={styles.summaryRow}>
              <Ionicons name="person-outline" size={20} color={Theme.colors.primary} />
              <View style={styles.summaryTextBlock}>
                <Text style={styles.summaryLabel}>Technician</Text>
                <Text style={styles.summaryValue}>{technicianName}</Text>
              </View>
            </View>
          ) : null}
          <View style={[styles.summaryRow, styles.summaryRowLast]}>
            <Ionicons name="location-outline" size={20} color={Theme.colors.primary} />
            <View style={styles.summaryTextBlock}>
              <Text style={styles.summaryLabel}>Where</Text>
              <Text style={styles.summaryValue} numberOfLines={2}>
                {addressLine}
              </Text>
            </View>
          </View>
        </View>

        {snap?.serverResponse?.appointmentId ? (
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.push(`/customer/appointment/${snap.serverResponse!.appointmentId}`)}
            activeOpacity={0.85}
          >
            <Ionicons name="navigate-outline" size={20} color={Theme.colors.primary} style={styles.btnIcon} />
            <Text style={styles.secondaryBtnText}>Track Your Appointment</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[
            styles.secondaryBtn,
            snap?.serverResponse?.appointmentId ? styles.secondaryBtnMargin : null,
          ]}
          onPress={() => Alert.alert('Calendar', 'Add to calendar will be available in a future update.')}
          activeOpacity={0.85}
        >
          <Ionicons name="calendar" size={20} color={Theme.colors.primary} style={styles.btnIcon} />
          <Text style={styles.secondaryBtnText}>Add to Calendar</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.replace('/customer')}
          activeOpacity={0.9}
        >
          <Text style={styles.primaryBtnText}>Back to Home</Text>
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
    paddingHorizontal: Theme.spacing.lg,
    paddingTop: Theme.spacing.xl,
    paddingBottom: Theme.spacing.xxl,
    alignItems: 'center',
  },
  iconWrap: {
    marginBottom: Theme.spacing.lg,
  },
  iconCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: Theme.colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    ...Theme.shadow.lg,
  },
  title: {
    fontSize: Theme.fontSize.xxxl,
    fontWeight: '800',
    color: Theme.colors.text,
    textAlign: 'center',
    marginBottom: Theme.spacing.sm,
  },
  bookingId: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: Theme.spacing.xs,
  },
  subtitle: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: Theme.spacing.xl,
    maxWidth: 340,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    marginBottom: Theme.spacing.lg,
    ...Theme.shadow.md,
  },
  summaryCardTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: '800',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: Theme.colors.borderLight,
    marginBottom: Theme.spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Theme.spacing.md,
  },
  summaryRowLast: {
    marginBottom: 0,
  },
  summaryTextBlock: {
    flex: 1,
    marginLeft: Theme.spacing.md,
  },
  summaryLabel: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '700',
    color: Theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    lineHeight: 20,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.primary + '08',
  },
  secondaryBtnMargin: {
    marginTop: Theme.spacing.sm,
  },
  btnIcon: {
    marginRight: Theme.spacing.sm,
  },
  secondaryBtnText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  footer: {
    width: '100%',
    paddingHorizontal: Theme.spacing.lg,
    paddingBottom: Theme.spacing.md,
    paddingTop: Theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.borderLight,
    backgroundColor: Theme.colors.background,
  },
  primaryBtn: {
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md + 2,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
    ...Theme.shadow.md,
  },
  primaryBtnText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    fontWeight: '800',
  },
});
