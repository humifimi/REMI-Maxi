import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { isAxiosError } from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';
import { useAddVehicle, useDecodePlate } from '@customer/hooks/vehicles/use-vehicles';
import { useBookingStore } from '@/src/stores/customer/booking';
import { useOnboardingStore, type OnboardingStepId } from '@/src/stores/customer/onboarding';
// @demo-start
import { useDemoVehicleStore } from '@/src/stores/customer/demo-vehicles';
// @demo-end
import VehicleScanner from '@customer/components/vehicle/vehicle-scanner';
import type { DecodePlateResult } from '@customer/types/api';

type EntryMode = 'choose' | 'scan' | 'manual';

const DEMO_TRUCK = {
  license_plate: 'DTK 7842',
  license_plate_state: 'TX',
  year: 2023,
  make: 'Ford',
  model: 'F-250 Super Duty',
  engine: '6.7L Power Stroke V8 Turbo Diesel',
  color: 'Oxford White',
  mileage: 28500,
  vin: '1FT7W2BT3PED12345',
} as const;

export default function AddVehicleScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const addVehicle = useAddVehicle();
  const decodePlate = useDecodePlate();
  const setBookingVehicle = useBookingStore((s) => s.setVehicle);
  const completeStep = useOnboardingStore((s) => s.completeStep);
  const fromBooking = from === 'booking';
  const fromOnboarding = from === 'onboarding';
  const [mode, setMode] = useState<EntryMode>('choose');
  const [plate, setPlate] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  // Cached decode result for the *currently typed* plate+state. Cleared
  // any time the user edits either field so we don't accidentally submit
  // stale make/model when the plate has changed since the last decode.
  const [decoded, setDecoded] = useState<DecodePlateResult | null>(null);
  const decodeKeyRef = useRef<string>('');

  const handleScanResult = useCallback(
    (text: string, _scannedMode: 'plate' | 'vin', detectedState?: string | null) => {
      setScannerOpen(false);
      setMode('manual');
      setPlate(text);
      if (detectedState) setStateCode(detectedState);
      setError(null);
      setDecoded(null);
      decodeKeyRef.current = '';
    },
    [],
  );

  // Auto-decode plate+state via CARFAX QuickVIN to pre-fill year/make/
  // model/VIN. Debounced 400ms after the last keystroke so the user
  // gets a single hit per typed plate, not one per character. Demo
  // truck values are skipped — they have a hard-coded decode locally.
  const trimmedPlate = plate.trim().toUpperCase();
  const trimmedState = stateCode.trim().toUpperCase();
  const isDemoPlate =
    trimmedPlate === DEMO_TRUCK.license_plate &&
    trimmedState === DEMO_TRUCK.license_plate_state;
  const eligibleForDecode =
    mode === 'manual' &&
    trimmedPlate.length >= 2 &&
    trimmedState.length === 2 &&
    !isDemoPlate;

  useEffect(() => {
    if (!eligibleForDecode) {
      setDecoded(null);
      decodeKeyRef.current = '';
      return;
    }
    const key = `${trimmedPlate}|${trimmedState}`;
    if (key === decodeKeyRef.current) return;
    const handle = setTimeout(() => {
      decodeKeyRef.current = key;
      console.log('[customer-add-vehicle] decode trigger', {
        plate: trimmedPlate,
        state: trimmedState,
      });
      decodePlate.mutate(
        { plate: trimmedPlate, state: trimmedState },
        {
          onSuccess: (result) => {
            if (decodeKeyRef.current !== key) return;
            console.log('[customer-add-vehicle] decode success', {
              plate: trimmedPlate,
              state: trimmedState,
              vin: result?.vin ?? null,
              year: result?.year ?? null,
              make: result?.make ?? null,
              model: result?.model ?? null,
            });
            setDecoded(result);
          },
          onError: () => {
            if (decodeKeyRef.current !== key) return;
            setDecoded(null);
          },
        },
      );
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligibleForDecode, trimmedPlate, trimmedState]);

  // @demo-start
  const handleDemoAutofill = () => {
    setMode('manual');
    setPlate(DEMO_TRUCK.license_plate);
    setStateCode(DEMO_TRUCK.license_plate_state);
    setError(null);
  };
  // @demo-end

  const navigateAfterAdd = async (vehicle: { id: number }) => {
    if (fromBooking) {
      setBookingVehicle(vehicle as any);
      router.back();
    } else if (fromOnboarding) {
      await completeStep('addVehicle' satisfies OnboardingStepId);
      router.push('/customer/garage-confirm');
    } else {
      router.replace(`/customer/vehicle/${vehicle.id}`);
    }
  };

  const handleAdd = async () => {
    if (mode === 'choose') {
      setError('Choose scan or manual entry');
      return;
    }
    if (!plate.trim() || plate.trim().length < 2) {
      setError('Enter a license plate');
      return;
    }
    if (!stateCode.trim() || stateCode.trim().length !== 2) {
      setError('Enter a 2-letter state code');
      return;
    }
    setError(null);

    const isDemoTruck =
      plate.trim().toUpperCase() === DEMO_TRUCK.license_plate &&
      stateCode.trim().toUpperCase() === DEMO_TRUCK.license_plate_state;

    try {
      const yearNum =
        decoded?.year && /^\d{4}$/.test(decoded.year)
          ? Number(decoded.year)
          : undefined;
      const body = isDemoTruck
        ? { ...DEMO_TRUCK }
        : {
            license_plate: plate.trim().toUpperCase(),
            license_plate_state: stateCode.trim().toUpperCase(),
            ...(decoded?.vin ? { vin: decoded.vin } : {}),
            ...(yearNum ? { year: yearNum } : {}),
            ...(decoded?.make ? { make: decoded.make } : {}),
            ...(decoded?.model ? { model: decoded.model } : {}),
          };
      const vehicle = await addVehicle.mutateAsync(body);
      // @demo-start — track so demo reset can clean it up. trackedIds is
      // cleanup-only; it does NOT hide the vehicle from the garage UI.
      useDemoVehicleStore.getState().trackApiVehicle(vehicle.id);
      // @demo-end
      await navigateAfterAdd(vehicle);
    } catch (err) {
      // Temporary diagnostic — remove once add-vehicle is stable.
      if (isAxiosError(err)) {
        console.error('[customer-add-vehicle error]', {
          status: err.response?.status,
          responseData: err.response?.data,
          url: err.config?.url,
          baseURL: err.config?.baseURL,
          requestData: err.config?.data,
          message: err.message,
        });
      } else {
        console.error('[customer-add-vehicle error] non-axios', err);
      }

      // @demo-start — create a local demo vehicle when the API fails
      if (isDemoTruck) {
        const demoVehicle = useDemoVehicleStore.getState().addDemoVehicle(DEMO_TRUCK);
        await navigateAfterAdd(demoVehicle);
        return;
      }
      // @demo-end

      // Surface the server's message when available — most useful failure here
      // is the backend's 409 "Vehicle with this VIN already exists" which
      // happens when the same VIN was added previously. Generic fallback
      // otherwise.
      const serverMessage =
        isAxiosError(err) &&
        typeof err.response?.data === 'object' &&
        err.response?.data !== null &&
        'message' in err.response.data &&
        typeof (err.response.data as { message?: unknown }).message === 'string'
          ? (err.response.data as { message: string }).message
          : null;
      setError(serverMessage || 'Could not add vehicle. Please try again.');
    }
  };

  return (
    <>
      <VehicleScanner
        visible={scannerOpen}
        onScan={handleScanResult}
        onClose={() => setScannerOpen(false)}
      />

      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Add a vehicle</Text>
          <Text style={styles.subtitle}>
            Scan your plate for the fastest setup, or enter details manually.
          </Text>

          <TouchableOpacity
            style={[styles.optionCard, mode === 'scan' && styles.optionCardSelected]}
            onPress={() => {
              setError(null);
              setScannerOpen(true);
            }}
            activeOpacity={0.85}
          >
            <View style={styles.optionIcon}>
              <Ionicons name="camera-outline" size={28} color={Theme.colors.primary} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Scan license plate</Text>
              <Text style={styles.optionBody}>
                Use your camera to capture your plate instantly.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Theme.colors.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.optionCard, mode === 'manual' && styles.optionCardSelected]}
            onPress={() => {
              setMode('manual');
              setError(null);
            }}
            activeOpacity={0.85}
          >
            <View style={styles.optionIcon}>
              <Ionicons name="create-outline" size={28} color={Theme.colors.primary} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Enter manually</Text>
              <Text style={styles.optionBody}>Type your plate and state.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Theme.colors.textTertiary} />
          </TouchableOpacity>

          {/* @demo-start */}
          <TouchableOpacity
            style={styles.demoCard}
            onPress={handleDemoAutofill}
            activeOpacity={0.85}
          >
            <View style={styles.demoIconWrap}>
              <Ionicons name="flask-outline" size={22} color={Theme.colors.warning} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.demoTitle}>Use demo truck</Text>
              <Text style={styles.optionBody}>
                Auto-fills a 2023 Ford F-250 Super Duty diesel for testing.
              </Text>
            </View>
          </TouchableOpacity>
          {/* @demo-end */}

          {mode === 'manual' && (
            <View style={styles.manualBox}>
              <View style={styles.field}>
                <Text style={styles.label}>License plate</Text>
                <TextInput
                  style={styles.input}
                  placeholder="ABC 1234"
                  placeholderTextColor={Theme.colors.textTertiary}
                  autoCapitalize="characters"
                  value={plate}
                  onChangeText={setPlate}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>State</Text>
                <TextInput
                  style={styles.input}
                  placeholder="CA"
                  placeholderTextColor={Theme.colors.textTertiary}
                  autoCapitalize="characters"
                  maxLength={2}
                  value={stateCode}
                  onChangeText={setStateCode}
                />
              </View>

              {eligibleForDecode && decodePlate.isPending ? (
                <View style={styles.decodePending}>
                  <ActivityIndicator size="small" color={Theme.colors.primary} />
                  <Text style={styles.decodePendingText}>
                    Looking up vehicle…
                  </Text>
                </View>
              ) : null}

              {decoded?.vin && (decoded.year || decoded.make || decoded.model) ? (
                <View style={styles.decodeMatch}>
                  <View style={styles.decodeMatchHeader}>
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={Theme.colors.success}
                    />
                    <Text style={styles.decodeMatchTitle}>We found your vehicle</Text>
                  </View>
                  <Text style={styles.decodeMatchVehicle}>
                    {[decoded.year, decoded.make, decoded.model]
                      .filter(Boolean)
                      .join(' ')}
                  </Text>
                  <Text style={styles.decodeMatchVin}>VIN: {decoded.vin}</Text>
                  <Text style={styles.decodeMatchHint}>
                    These details will be saved when you tap Add Vehicle.
                  </Text>
                </View>
              ) : null}

              {decoded && !decoded.vin && eligibleForDecode && !decodePlate.isPending ? (
                <View style={styles.decodeMiss}>
                  <Ionicons
                    name="information-circle-outline"
                    size={16}
                    color={Theme.colors.textSecondary}
                  />
                  <Text style={styles.decodeMissText}>
                    Couldn&apos;t auto-fill from this plate. We&apos;ll save it
                    as-is and your tech can confirm details on the first visit.
                  </Text>
                </View>
              ) : null}
            </View>
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.primaryButton, addVehicle.isPending && styles.primaryButtonDisabled]}
            onPress={handleAdd}
            disabled={addVehicle.isPending}
            activeOpacity={0.9}
          >
            {addVehicle.isPending ? (
              <ActivityIndicator color={Theme.colors.white} />
            ) : (
              <Text style={styles.primaryLabel}>Add Vehicle</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Theme.spacing.lg,
    paddingTop: Theme.spacing.md,
    paddingBottom: Theme.spacing.xl,
  },
  title: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.sm,
  },
  subtitle: {
    fontSize: Theme.fontSize.md,
    lineHeight: 22,
    color: Theme.colors.textSecondary,
    marginBottom: Theme.spacing.lg,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    ...Theme.shadow.sm,
  },
  optionCardSelected: {
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.white,
  },
  optionIcon: {
    width: 52,
    height: 52,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Theme.spacing.md,
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '600',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.xs,
  },
  optionBody: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    lineHeight: 20,
  },
  demoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.warning + '0A',
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.warning + '33',
  },
  demoIconWrap: {
    width: 44,
    height: 44,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Theme.colors.warning + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Theme.spacing.md,
  },
  demoTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.xs,
  },
  manualBox: {
    marginTop: Theme.spacing.sm,
    gap: Theme.spacing.md,
  },
  field: {
    marginBottom: Theme.spacing.sm,
  },
  label: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.sm,
  },
  input: {
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.md,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.md,
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
  },
  errorText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.error,
    marginTop: Theme.spacing.md,
  },
  decodePending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    paddingVertical: Theme.spacing.sm,
  },
  decodePendingText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
  },
  decodeMatch: {
    backgroundColor: Theme.colors.success + '12',
    borderColor: Theme.colors.success + '40',
    borderWidth: 1,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    gap: Theme.spacing.xs,
  },
  decodeMatchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.xs,
  },
  decodeMatchTitle: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '700',
    color: Theme.colors.success,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  decodeMatchVehicle: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  decodeMatchVin: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    fontFamily: 'Menlo',
  },
  decodeMatchHint: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    marginTop: Theme.spacing.xs,
  },
  decodeMiss: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Theme.spacing.xs,
    paddingVertical: Theme.spacing.sm,
  },
  decodeMissText: {
    flex: 1,
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: Theme.spacing.lg,
    paddingTop: Theme.spacing.md,
    paddingBottom: Theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.border,
    backgroundColor: Theme.colors.background,
  },
  primaryButton: {
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryLabel: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.lg,
    fontWeight: '600',
  },
});
