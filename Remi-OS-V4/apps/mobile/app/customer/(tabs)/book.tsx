import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Theme } from '@customer/constants/colors';
import { LoadingScreen } from '@customer/components/shared/loading-screen';
import { useServices } from '@customer/hooks/services/use-services';
import { useBookingStore } from '@/src/stores/customer/booking';

export default function BookTabScreen() {
  const router = useRouter();
  const { data: services, isPending } = useServices();
  const startFreshBooking = useBookingStore((s) => s.startFreshBooking);

  const suggested = useMemo(() => services?.slice(0, 4) ?? [], [services]);

  if (isPending) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <LoadingScreen />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.heroCard, Theme.shadow.md]}>
          <Text style={styles.heroTitle}>Book a Service</Text>
          <Text style={styles.heroDescription}>
            Go from choosing your service to a confirmed appointment in under 60 seconds — pick a
            time, your vehicle, and where we meet you.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push(startFreshBooking())}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Start Booking</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Suggested services</Text>
        <Text style={styles.sectionSubtitle}>Popular maintenance you can book in one tap.</Text>

        {suggested.map((service) => (
          <TouchableOpacity
            key={service.id}
            style={[styles.serviceCard, Theme.shadow.md]}
            onPress={() => router.push(startFreshBooking())}
            activeOpacity={0.75}
          >
            <View style={styles.serviceCardBody}>
              <Text style={styles.serviceName}>{service.name}</Text>
              {service.description ? (
                <Text style={styles.serviceDescription} numberOfLines={2}>
                  {service.description}
                </Text>
              ) : null}
              <View style={styles.serviceMeta}>
                <Text style={styles.servicePrice}>From ${Number(service.base_price).toFixed(2)}</Text>
                <Text style={styles.serviceDuration}>{service.duration_minutes} min</Text>
              </View>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
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
    paddingBottom: Theme.spacing.xl,
  },
  heroCard: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
  },
  heroTitle: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.sm,
  },
  heroDescription: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.textSecondary,
    lineHeight: 24,
    marginBottom: Theme.spacing.lg,
  },
  primaryButton: {
    backgroundColor: Theme.colors.primary,
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.lg,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.xs,
  },
  sectionSubtitle: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginBottom: Theme.spacing.md,
  },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  serviceCardBody: {
    flex: 1,
  },
  serviceName: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
    marginBottom: 2,
  },
  serviceDescription: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginBottom: Theme.spacing.sm,
  },
  serviceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.md,
  },
  servicePrice: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
  serviceDuration: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
  },
  chevron: {
    fontSize: Theme.fontSize.xxl,
    color: Theme.colors.textTertiary,
    marginLeft: Theme.spacing.sm,
  },
});
