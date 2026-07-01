import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Theme } from '@customer/constants/colors';
import { useProfile } from '@customer/hooks/auth/use-profile';
import { useAddresses } from '@customer/hooks/utility/use-addresses';
import { useLogout } from '@customer/hooks/auth/use-auth';
import { useAuthStore } from '@/src/stores/auth';
import { useBiometric, getBiometricLabel } from '@customer/hooks/auth/use-biometric';
// @demo-start
import { useDemoAppointmentStore } from '@/src/stores/customer/demo-appointments';
import { useDemoVehicleStore } from '@/src/stores/customer/demo-vehicles';
import { useDemoAddressStore } from '@/src/stores/customer/demo-addresses';
import { ENDPOINTS } from '@customer/api/endpoints';
import apiClient from '@customer/api/client';
// @demo-end

export default function MoreTabScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: profile, isPending: profileLoading } = useProfile();
  const { data: addresses } = useAddresses();
  const logout = useLogout();

  const user = useAuthStore((s) => s.user);
  const setBiometricEnabled = useAuthStore((s) => s.setBiometricEnabled);
  const getBiometricEnabled = useAuthStore((s) => s.getBiometricEnabled);
  // @demo-start
  const demoFleetMode = useAuthStore((s) => s.demoFleetMode);
  const demoFleetRole = useAuthStore((s) => s.demoFleetRole);
  // @demo-end
  const { isAvailable: biometricAvailable, biometricType } = useBiometric();
  const biometricLabel = getBiometricLabel(biometricType);
  const [biometricOn, setBiometricOn] = useState(false);

  // @demo-start
  const [isResetting, setIsResetting] = useState(false);
  // Defensive `?? []` guards: zustand-persist hands us undefined slices when
  // a migration fails (e.g. version bump without a `migrate` fn). Without
  // these, the More tab crashes with "Cannot read property 'length' of
  // undefined" the first time anyone hits this screen post-upgrade.
  const demoApptCount = useDemoAppointmentStore((s) => (s.appointments ?? []).length);
  const demoOverrideCount = useDemoAppointmentStore(
    (s) => Object.keys(s.overrides ?? {}).length,
  );
  const demoVehicleCount = useDemoVehicleStore((s) => (s.vehicles ?? []).length);
  const demoTrackedVehicles = useDemoVehicleStore((s) => (s.trackedIds ?? []).length);
  const demoTrackedAddresses = useDemoAddressStore((s) => (s.trackedIds ?? []).length);
  const totalDemoItems =
    demoApptCount + demoOverrideCount + demoVehicleCount + demoTrackedVehicles + demoTrackedAddresses;

  const handleDemoReset = useCallback(() => {
    Alert.alert(
      'Reset Demo Data',
      'This will restore your demo account to its original state — vehicles, addresses, and appointments will be reset.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setIsResetting(true);
            try {
              await apiClient.post(ENDPOINTS.AUTH.DEMO_RESET);
            } catch {
              // Backend reset unavailable — fall back to local cleanup
              const vehicleIds = useDemoVehicleStore.getState().trackedIds;
              const addressIds = useDemoAddressStore.getState().trackedIds;
              await Promise.allSettled([
                ...vehicleIds.map((id) =>
                  apiClient.delete(ENDPOINTS.VEHICLES.DELETE(id)).catch(() => {}),
                ),
                ...addressIds.map((id) =>
                  apiClient.delete(ENDPOINTS.ADDRESSES.DELETE(id)).catch(() => {}),
                ),
              ]);
            }

            useDemoAppointmentStore.getState().clear();
            useDemoVehicleStore.getState().clearAll();
            useDemoAddressStore.getState().clear();
            queryClient.removeQueries();
            await queryClient.refetchQueries({ type: 'active' });
            setIsResetting(false);
            Alert.alert('Done', 'Demo data has been restored to its original state.');
          },
        },
      ],
    );
  }, [queryClient]);
  // @demo-end

  useEffect(() => {
    getBiometricEnabled().then(setBiometricOn);
  }, [getBiometricEnabled]);

  const handleBiometricToggle = useCallback(
    async (value: boolean) => {
      setBiometricOn(value);
      await setBiometricEnabled(value);
    },
    [setBiometricEnabled],
  );

  const addressCount = addresses?.length ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.screenTitle}>More</Text>

        <Text style={styles.sectionLabel}>Profile</Text>
        <View style={[styles.card, Theme.shadow.md]}>
          {profileLoading ? (
            <ActivityIndicator color={Theme.colors.primary} style={styles.loader} />
          ) : (
            <>
              <Text style={styles.profileName}>{profile?.full_name ?? '—'}</Text>
              <Text style={styles.profileLine}>{profile?.email ?? '—'}</Text>
              <Text style={styles.profileLine}>{profile?.phone ?? 'No phone on file'}</Text>
              {(user?.fleetRole || demoFleetMode) ? (
                <TouchableOpacity
                  style={styles.fleetBadge}
                  onPress={() => router.push('/customer/fleet')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.fleetCompany}>{profile?.fleet_company_name ?? 'REMI Fleet Services'}</Text>
                  <Text style={styles.fleetBilling}>
                    {demoFleetRole === 'fleet_driver' || user?.fleetRole === 'fleet_driver'
                      ? 'Fleet Driver'
                      : 'Fleet Manager'}
                  </Text>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push('/customer/profile/edit')}
            activeOpacity={0.7}
          >
            <Text style={styles.rowLabel}>Edit Profile</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>Payment</Text>
        <View style={[styles.card, Theme.shadow.md]}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push('/customer/payment-methods')}
            activeOpacity={0.7}
          >
            <Text style={styles.rowLabel}>Manage Cards</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>Addresses</Text>
        <View style={[styles.card, Theme.shadow.md]}>
          <TouchableOpacity style={styles.row} activeOpacity={0.7}>
            <Text style={styles.rowLabel}>Saved Addresses</Text>
            <Text style={styles.rowHint}>{addressCount} saved</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>Preferences</Text>
        <View style={[styles.card, Theme.shadow.md]}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push('/customer/preferences')}
            activeOpacity={0.7}
          >
            <Text style={styles.rowLabel}>Service Preferences</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push('/customer/notification-settings')}
            activeOpacity={0.7}
          >
            <Text style={styles.rowLabel}>Notifications</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          {biometricAvailable ? (
            <View style={styles.row}>
              <View style={styles.biometricInfo}>
                <Text style={styles.rowLabel}>{biometricLabel}</Text>
                <Text style={styles.biometricHint}>Unlock app with {biometricLabel}</Text>
              </View>
              <Switch
                value={biometricOn}
                onValueChange={handleBiometricToggle}
                trackColor={{ false: Theme.colors.border, true: Theme.colors.primary + '80' }}
                thumbColor={biometricOn ? Theme.colors.primary : Theme.colors.surface}
              />
            </View>
          ) : null}
        </View>

        {(user?.fleetRole || demoFleetMode) ? (
          demoFleetRole === 'fleet_driver' || user?.fleetRole === 'fleet_driver' ? (
            <>
              <Text style={styles.sectionLabel}>Fleet</Text>
              <View style={[styles.card, Theme.shadow.md]}>
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => router.push('/customer/fleet/vehicles/1')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.rowLabel}>My Fleet Vehicle</Text>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => router.push('/customer/fleet/inspection/submit')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.rowLabel}>Submit Inspection</Text>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.sectionLabel}>Fleet Management</Text>
              <View style={[styles.card, Theme.shadow.md]}>
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => router.push('/customer/fleet/vehicles')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.rowLabel}>Fleet Vehicles</Text>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => router.push('/customer/fleet')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.rowLabel}>Bookings & Approvals</Text>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => router.push('/customer/fleet/inspections')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.rowLabel}>Fleet Inspections</Text>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => router.push('/customer/fleet/compliance')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.rowLabel}>Compliance</Text>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => router.push('/customer/fleet/spend')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.rowLabel}>Budget & Spend</Text>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => router.push('/customer/fleet/settings')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.rowLabel}>Fleet Settings</Text>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              </View>
            </>
          )
        ) : null}

        <Text style={styles.sectionLabel}>Booking</Text>
        <View style={[styles.card, Theme.shadow.md]}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push('/customer/booking/chat')}
            activeOpacity={0.7}
          >
            <Text style={styles.rowLabel}>Chat Booking</Text>
            <Text style={styles.rowHint}>AI-assisted</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>Referrals</Text>
        <View style={[styles.card, Theme.shadow.md]}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push('/customer/referral')}
            activeOpacity={0.7}
          >
            <Text style={styles.rowLabel}>My Referrals</Text>
            <Text style={styles.rowHint}>Partner services</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>Support</Text>
        <View style={[styles.card, Theme.shadow.md]}>
          <TouchableOpacity style={styles.row} activeOpacity={0.7}>
            <Text style={styles.rowLabel}>Help & FAQ</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* @demo-start */}
        <TouchableOpacity
          style={[styles.resetBtn, isResetting && styles.resetBtnDisabled]}
          onPress={handleDemoReset}
          disabled={isResetting}
          activeOpacity={0.85}
        >
          {isResetting ? (
            <ActivityIndicator size="small" color="#F59E0B" />
          ) : (
            <Ionicons name="refresh" size={20} color="#F59E0B" />
          )}
          <Text style={styles.resetText}>
            {isResetting ? 'Resetting...' : 'Reset Demo Data'}
          </Text>
          {totalDemoItems > 0 && !isResetting ? (
            <View style={styles.resetBadge}>
              <Text style={styles.resetBadgeText}>{totalDemoItems}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        {/* @demo-end */}

        <View style={[styles.card, Theme.shadow.md]}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => logout.mutate()}
            disabled={logout.isPending}
            activeOpacity={0.7}
          >
            <Text style={styles.signOut}>Sign Out</Text>
          </TouchableOpacity>
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
    paddingHorizontal: Theme.spacing.md,
    paddingBottom: Theme.spacing.xxl,
  },
  screenTitle: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.lg,
  },
  sectionLabel: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '600',
    color: Theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: Theme.spacing.sm,
    marginTop: Theme.spacing.sm,
  },
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.md,
    paddingBottom: Theme.spacing.xs,
    marginBottom: Theme.spacing.sm,
  },
  loader: {
    marginVertical: Theme.spacing.md,
  },
  profileName: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: 4,
  },
  profileLine: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.colors.border,
    marginTop: Theme.spacing.sm,
  },
  rowLabel: {
    flex: 1,
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
    fontWeight: '500',
  },
  rowHint: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textTertiary,
    marginRight: Theme.spacing.xs,
  },
  chevron: {
    fontSize: Theme.fontSize.xl,
    color: Theme.colors.textTertiary,
  },
  biometricInfo: {
    flex: 1,
  },
  biometricHint: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    marginTop: 2,
  },
  fleetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.primary + '10',
    borderRadius: Theme.borderRadius.sm,
    paddingHorizontal: Theme.spacing.sm,
    paddingVertical: Theme.spacing.sm,
    marginTop: Theme.spacing.sm,
    gap: Theme.spacing.xs,
  },
  fleetCompany: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.primary,
    flex: 1,
  },
  fleetBilling: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.sm,
    backgroundColor: '#FEF3C7',
    borderRadius: Theme.borderRadius.md,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.lg,
    marginTop: Theme.spacing.lg,
    marginBottom: Theme.spacing.sm,
    borderWidth: 1,
    borderColor: '#F59E0B44',
    minHeight: 52,
  },
  resetBtnDisabled: {
    opacity: 0.6,
  },
  resetText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: '#92400E',
  },
  resetBadge: {
    backgroundColor: '#F59E0B',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  resetBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  signOut: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.error,
    textAlign: 'center',
    width: '100%',
    paddingVertical: Theme.spacing.sm,
  },
});
