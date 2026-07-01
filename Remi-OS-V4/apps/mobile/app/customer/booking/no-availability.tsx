import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';
import { Brand } from '@customer/constants/brand';
import { DEFAULT_FRANCHISE_ID } from '@customer/constants/config';
import { useBookingStore } from '@/src/stores/customer/booking';
import { useJoinWaitlist } from '@customer/hooks/utility/use-waitlist';
import { successHaptic } from '@customer/services/haptics';
import { toISODate } from '@customer/utils/date-format';

const SCENARIOS = [
  {
    key: 'closed',
    icon: 'moon-outline' as const,
    title: 'Closed day',
    headline: "We're closed on this day",
    message: `${Brand.appName} observes select holidays and closed days. Pick another date or get notified when we reopen this area.`,
  },
  {
    key: 'pto',
    icon: 'airplane-outline' as const,
    title: 'Tech on PTO',
    headline: 'Our technician is on vacation',
    message: 'Your usual coverage may be limited. Try another day or join the waitlist and we\u2019ll reach out when capacity returns.',
  },
  {
    key: 'booked',
    icon: 'people-outline' as const,
    title: 'Fully booked',
    headline: 'All slots are taken',
    message: 'High demand days fill up fast. Another time slot or date often opens things up.',
  },
  {
    key: 'range',
    icon: 'map-outline' as const,
    title: 'Out of range',
    headline: "We don't service this area yet",
    message: `We're expanding weekly. Leave your details and we'll notify you when ${Brand.appName} is available where you are.`,
  },
];

export default function NoAvailabilityScreen() {
  const router = useRouter();
  const selectedServices = useBookingStore((s) => s.selectedServices);
  const selectedVehicle = useBookingStore((s) => s.selectedVehicle);
  const selectedAddress = useBookingStore((s) => s.selectedAddress);
  const joinWaitlist = useJoinWaitlist();
  const [joined, setJoined] = useState(false);
  const [position, setPosition] = useState<number | null>(null);
  const [estimatedWait, setEstimatedWait] = useState<number | null>(null);

  const canJoin = selectedVehicle && selectedAddress && selectedServices.length > 0;

  const handleJoinWaitlist = () => {
    if (!canJoin) {
      Alert.alert('Missing info', 'Please go back and complete your service, vehicle, and address selections.');
      return;
    }

    joinWaitlist.mutate(
      {
        serviceIds: selectedServices.map((s) => s.id),
        vehicleId: selectedVehicle.id,
        addressId: selectedAddress.id,
        preferredDate: toISODate(new Date()),
        franchiseId: DEFAULT_FRANCHISE_ID,
      },
      {
        onSuccess: (res) => {
          successHaptic();
          setJoined(true);
          setPosition(res.position);
          setEstimatedWait(res.estimatedWaitMinutes);
        },
        onError: () => {
          Alert.alert(
            'Could not join waitlist',
            'Something went wrong. Please try again.',
          );
        },
      },
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {joined ? (
          <View style={styles.joinedCard}>
            <View style={styles.joinedIconWrap}>
              <Ionicons name="checkmark-circle" size={56} color={Theme.colors.success} />
            </View>
            <Text style={styles.joinedHeadline}>You're on the Flex List!</Text>
            <Text style={styles.joinedSub}>
              We'll notify you the moment a slot opens up. Claim it with one tap.
            </Text>

            <View style={styles.positionRow}>
              <View style={styles.positionBox}>
                <Text style={styles.positionLabel}>Position</Text>
                <Text style={styles.positionValue}>#{position ?? '—'}</Text>
              </View>
              <View style={styles.positionBox}>
                <Text style={styles.positionLabel}>Est. wait</Text>
                <Text style={styles.positionValue}>
                  {estimatedWait != null
                    ? estimatedWait < 60
                      ? `${estimatedWait}m`
                      : `${Math.floor(estimatedWait / 60)}h ${estimatedWait % 60}m`
                    : 'TBD'}
                </Text>
              </View>
            </View>

            <View style={styles.joinedHint}>
              <Ionicons name="notifications-outline" size={18} color={Theme.colors.primary} />
              <Text style={styles.joinedHintText}>
                You'll get a push notification when your slot is ready. You can also check status on your Home dashboard.
              </Text>
            </View>
          </View>
        ) : (
          <>
            {canJoin ? (
              <View style={styles.flexListHero}>
                <View style={styles.flexListIconWrap}>
                  <Ionicons name="flash" size={28} color={Theme.colors.primary} />
                </View>
                <Text style={styles.flexListTitle}>Join the Flex List</Text>
                <Text style={styles.flexListSub}>
                  No slots right now — but cancellations happen often. Join the waitlist and we'll hold the next opening for you.
                </Text>
              </View>
            ) : null}

            <Text style={styles.lead}>
              Here are the most common reasons availability can be limited — and what you can do next.
            </Text>

            {SCENARIOS.map((s) => (
              <View key={s.key} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.iconBadge}>
                    <Ionicons name={s.icon} size={22} color={Theme.colors.primary} />
                  </View>
                  <Text style={styles.cardTitle}>{s.title}</Text>
                </View>
                <Text style={styles.headline}>{s.headline}</Text>
                <Text style={styles.message}>{s.message}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {joined ? (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.replace('/customer')}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryBtnText}>Back to Home</Text>
          </TouchableOpacity>
        ) : (
          <>
            {canJoin ? (
              <TouchableOpacity
                style={[styles.primaryBtn, joinWaitlist.isPending && styles.primaryBtnDisabled]}
                onPress={handleJoinWaitlist}
                disabled={joinWaitlist.isPending}
                activeOpacity={0.9}
              >
                {joinWaitlist.isPending ? (
                  <ActivityIndicator size="small" color={Theme.colors.white} />
                ) : (
                  <>
                    <Ionicons name="flash" size={18} color={Theme.colors.white} />
                    <Text style={styles.primaryBtnText}>Join Waitlist</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() =>
                  Alert.alert(
                    'Notify me',
                    'You\u2019ll be notified when a slot opens. This feature will connect to your account notifications soon.',
                  )
                }
                activeOpacity={0.9}
              >
                <Text style={styles.primaryBtnText}>Notify me when a slot opens</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => router.back()}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryText}>Try another date</Text>
            </TouchableOpacity>
          </>
        )}
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
  lead: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: Theme.spacing.lg,
  },
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    ...Theme.shadow.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Theme.spacing.sm,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Theme.colors.primary + '14',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Theme.spacing.sm,
  },
  cardTitle: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '800',
    color: Theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  headline: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.sm,
    lineHeight: 26,
  },
  message: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    lineHeight: 22,
  },

  flexListHero: {
    backgroundColor: Theme.colors.primary + '0A',
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '33',
    alignItems: 'center',
    gap: Theme.spacing.sm,
  },
  flexListIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Theme.colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flexListTitle: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  flexListSub: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  joinedCard: {
    alignItems: 'center',
    paddingVertical: Theme.spacing.xl,
    gap: Theme.spacing.md,
  },
  joinedIconWrap: {
    marginBottom: Theme.spacing.sm,
  },
  joinedHeadline: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: '700',
    color: Theme.colors.text,
    textAlign: 'center',
  },
  joinedSub: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: Theme.spacing.md,
  },
  positionRow: {
    flexDirection: 'row',
    gap: Theme.spacing.md,
    width: '100%',
    marginTop: Theme.spacing.sm,
  },
  positionBox: {
    flex: 1,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  positionLabel: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '700',
    color: Theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Theme.spacing.xs,
  },
  positionValue: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: '800',
    color: Theme.colors.primary,
  },
  joinedHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Theme.spacing.sm,
    backgroundColor: Theme.colors.primary + '0A',
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '22',
    width: '100%',
    marginTop: Theme.spacing.sm,
  },
  joinedHintText: {
    flex: 1,
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text,
    lineHeight: 20,
  },

  footer: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.sm,
    paddingBottom: Theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.borderLight,
    backgroundColor: Theme.colors.background,
    gap: Theme.spacing.sm,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.sm,
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    minHeight: 52,
    ...Theme.shadow.md,
  },
  primaryBtnDisabled: {
    backgroundColor: Theme.colors.border,
  },
  primaryBtnText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
  },
  secondaryBtn: {
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Theme.colors.border,
    backgroundColor: Theme.colors.surface,
  },
  secondaryText: {
    color: Theme.colors.text,
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
  },
});
