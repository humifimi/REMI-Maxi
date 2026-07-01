import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useQuery } from "@tanstack/react-query";
import { useJobFlowStore } from "@technician/stores/job-flow";
import { useAuthStore } from "@/src/stores/auth";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import {
  useFindOrCreateVehicle,
  useDecodeVehicle,
} from "@technician/hooks/customers/use-vehicles";
import { useCreateWalkInJob, useJobDetail } from "@technician/hooks/jobs/use-jobs";
import { useFlowBack } from "@technician/hooks/jobs/use-flow-back";
import { useActiveJobBlocker } from "@technician/hooks/jobs/use-active-job-blocker";
import { useCustomerDetail } from "@technician/hooks/customers/use-customers";
import { extractErrorMessage } from "@technician/api/errors";
import { haptic } from "@technician/hooks/utility/use-haptics";
import VehicleScanner from "@technician/components/job/vehicle-scanner";
import { useQuickVinLookup } from "@technician/hooks/carfax/use-carfax-lookups";
import type { CustomerVehicleOption, ServiceHistoryResult } from "@technician/types/api";
import {
  getCarfaxPrefillMileage,
  parseManualMileageInput,
} from "@technician/utils/carfax-mileage";

// @demo-start
const DEMO_VEHICLES = [
  { label: "Toyota Camry", plate: "BXT-4821", state: "OH", vin: "4T1BF1FK8GU260718", year: 2022, make: "Toyota", model: "Camry", engine: "2.5L I4" },
  { label: "Honda Civic", plate: "KNP-7739", state: "OH", vin: "1HGBH41JXMN109186", year: 2021, make: "Honda", model: "Civic", engine: "2.0L I4" },
  { label: "Ford F-150", plate: "FRD-1023", state: "OH", vin: "1FTEW1EP5MKE38472", year: 2023, make: "Ford", model: "F-150", engine: "3.5L V6" },
  { label: "Tesla Model 3", plate: "EV-80921", state: "OH", vin: "5YJ3E1EA8NF309521", year: 2022, make: "Tesla", model: "Model 3", engine: "Electric" },
] as const;
// @demo-end

export default function ConfirmVehicleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const appointmentId = parseInt(id, 10);
  const router = useRouter();
  const onBack = useFlowBack("confirm-vehicle", id);
  const {
    decodedVehicle,
    customer: presetCustomer,
    availableVehicles,
    setVehicle,
    setAppointmentId,
    setDecodedVehicle,
    setAvailableVehicles,
    setCustomer,
  } = useJobFlowStore();
  const authUser = useAuthStore((s) => s.user);
  const findOrCreate = useFindOrCreateVehicle();
  const createWalkIn = useCreateWalkInJob();
  const decode = useDecodeVehicle();
  const quickVin = useQuickVinLookup();
  // PLAN-DEVIATION: 2026-04-26-active-job-blocker — see docs/PLAN-DEVIATIONS.md.
  // Last gate before `createWalkIn.mutate`. Stops the customer/customers-tab
  // path from spawning a duplicate appointment when the technician already
  // has a timer running.
  const blocker = useActiveJobBlocker();

  const needsHydration = !decodedVehicle && availableVehicles.length === 0;
  const jobDetail = useJobDetail(needsHydration ? appointmentId : 0);
  const appt = jobDetail.data?.appointment;
  const customerId = appt?.customer_id ?? 0;
  const customerDetail = useCustomerDetail(
    needsHydration && customerId > 0 ? customerId : 0,
  );

  const [year, setYear] = useState(String(decodedVehicle?.year ?? ""));
  const [make, setMake] = useState(decodedVehicle?.make ?? "");
  const [model, setModel] = useState(decodedVehicle?.model ?? "");
  const [engine, setEngine] = useState(decodedVehicle?.engine ?? "");
  const [vinValue, setVinValue] = useState(decodedVehicle?.vin ?? "");

  const [isNewVehicle, setIsNewVehicle] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [vinInput, setVinInput] = useState("");
  const [plateInput, setPlateInput] = useState("");
  const [plateStateInput, setPlateStateInput] = useState("");
  const [mileageText, setMileageText] = useState("");
  const [mileageStale, setMileageStale] = useState(false);
  const skipCarfaxMileagePrefillRef = useRef(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(
    () => {
      if (!decodedVehicle?.vin || availableVehicles.length === 0) return null;
      const match = availableVehicles.find(
        (v) => v.vin === decodedVehicle.vin,
      );
      return match?.id ?? availableVehicles[0]?.id ?? null;
    },
  );

  const hydratedRef = useRef(false);

  const carfaxVin = vinValue.trim().toUpperCase();
  const carfaxQuery = useQuery({
    queryKey: ["carfax-service-history", "confirm-vehicle", carfaxVin],
    queryFn: () =>
      api<ServiceHistoryResult>("get", Endpoints.carfax.serviceHistory, {
        vin: carfaxVin,
      }),
    enabled: carfaxVin.length >= 11,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });

  const lastCarfaxMileage = useMemo(
    () => getCarfaxPrefillMileage(carfaxQuery.data),
    [carfaxQuery.data]
  );

  const applySavedVehicleMileage = useCallback(
    (mileage: number | null | undefined) => {
      if (mileage != null && mileage > 0) {
        setMileageText(String(mileage));
        setMileageStale(false);
        skipCarfaxMileagePrefillRef.current = true;
        return;
      }
      setMileageText("");
      setMileageStale(false);
      skipCarfaxMileagePrefillRef.current = false;
    },
    []
  );

  useEffect(() => {
    if (skipCarfaxMileagePrefillRef.current) return;
    if (lastCarfaxMileage != null && lastCarfaxMileage > 0) {
      setMileageText(String(lastCarfaxMileage));
      setMileageStale(true);
    }
  }, [lastCarfaxMileage]);

  useEffect(() => {
    if (hydratedRef.current || !needsHydration) return;

    const vehicles = customerDetail.data?.vehicles;
    if (vehicles && vehicles.length > 0) {
      hydratedRef.current = true;
      setAvailableVehicles(vehicles);

      const matchingVehicle = appt?.vehicle_id
        ? vehicles.find((v) => v.id === appt.vehicle_id)
        : null;
      const target = matchingVehicle ?? vehicles[0];

      setDecodedVehicle({
        vin: target.vin || null,
        year: target.year || null,
        make: target.make || null,
        model: target.model || null,
        engine: target.engine || null,
        base_vehicle_id: null,
      });
      setSelectedVehicleId(target.id);
      setYear(String(target.year ?? ""));
      setMake(target.make || "");
      setModel(target.model || "");
      setEngine(target.engine || "");
      setVinValue(target.vin || "");
      applySavedVehicleMileage(target.mileage);

      if (customerDetail.data?.customer) {
        const c = customerDetail.data.customer;
        setCustomer({
          id: c.id,
          full_name: c.full_name,
          email: c.email,
          phone: c.phone,
          profile_image_url: c.profile_image_url,
          role: "customer" as const,
          status: "active" as const,
          created_at: c.created_at,
          updated_at: c.created_at,
        });
      }
    } else if (appt && !customerDetail.isLoading) {
      hydratedRef.current = true;
      if (appt.vehicle_year || appt.vehicle_make || appt.vehicle_model) {
        setDecodedVehicle({
          vin: null,
          year: appt.vehicle_year ?? null,
          make: appt.vehicle_make ?? null,
          model: appt.vehicle_model ?? null,
          engine: null,
          base_vehicle_id: null,
        });
        setYear(String(appt.vehicle_year ?? ""));
        setMake(appt.vehicle_make ?? "");
        setModel(appt.vehicle_model ?? "");
      }
    }
  }, [
    needsHydration,
    appt,
    customerDetail.data,
    customerDetail.isLoading,
    setAvailableVehicles,
    setDecodedVehicle,
    setCustomer,
    applySavedVehicleMileage,
  ]);

  const hasPicker = availableVehicles.length > 0;

  const selectVehicle = useCallback(
    (v: CustomerVehicleOption) => {
      setIsNewVehicle(false);
      setSelectedVehicleId(v.id);
      setVinValue(v.vin || "");
      setYear(String(v.year ?? ""));
      setMake(v.make || "");
      setModel(v.model || "");
      setEngine(v.engine || "");
      applySavedVehicleMileage(v.mileage);
      setDecodedVehicle({
        vin: v.vin || null,
        year: v.year || null,
        make: v.make || null,
        model: v.model || null,
        engine: v.engine || null,
        base_vehicle_id: null,
      });
    },
    [setDecodedVehicle, applySavedVehicleMileage],
  );

  const enterNewVehicleMode = useCallback(() => {
    haptic.light();
    setIsNewVehicle(true);
    setSelectedVehicleId(null);
    setVinValue("");
    setVinInput("");
    setPlateInput("");
    setPlateStateInput("");
    setYear("");
    setMake("");
    setModel("");
    setEngine("");
    setMileageText("");
    setMileageStale(false);
    skipCarfaxMileagePrefillRef.current = false;
  }, []);

  const handleScanResult = useCallback(
    (
      text: string,
      scannedMode: "plate" | "vin",
      detectedState?: string | null,
    ) => {
      setScannerOpen(false);
      haptic.light();

      if (scannedMode === "vin") {
        console.log("[job-flow] confirm-vehicle scan vin", { text });
        setVinInput(text);
        decode.mutate(
          { identifier: text, type: "vin" },
          {
            onSuccess: (data) => {
              console.log("[job-flow] confirm-vehicle VIN decode success", {
                scanned: text,
                decodedVin: data.vin,
              });
              setVinValue(data.vin || text);
              setYear(String(data.year ?? ""));
              setMake(data.make || "");
              setModel(data.model || "");
              setEngine(data.engine || "");
              skipCarfaxMileagePrefillRef.current = false;
              setDecodedVehicle(data);
            },
            onError: (err) => {
              console.warn("[job-flow] confirm-vehicle VIN decode failed", {
                scanned: text,
                err: err instanceof Error ? err.message : String(err),
              });
              setVinValue(text);
              Alert.alert(
                "Decode Failed",
                "Captured the VIN but couldn't decode year/make/model. Enter details manually below.",
              );
            },
          },
        );
        return;
      }

      // Plate scan: surface the captured plate (and any detected state) in the
      // manual plate inputs, then route the lookup through QuickVIN. Falling
      // back to the manual inputs lets the tech correct an OCR mistake or
      // type the state by hand if the camera couldn't read it.
      setPlateInput(text);
      const stateGuess = (detectedState || "").trim().toUpperCase().slice(0, 2);
      if (stateGuess.length === 2) {
        setPlateStateInput(stateGuess);
      }

      if (stateGuess.length !== 2) {
        Alert.alert(
          "Need State",
          "Got the plate, but couldn't read the state. Enter the 2-letter state below and tap the lookup button.",
        );
        return;
      }

      quickVin.mutate(
        { plate: text, state: stateGuess },
        {
          onSuccess: (data) => {
            if (!data.vin) {
              Alert.alert(
                "Plate Not Found",
                "QuickVIN couldn't return a VIN for this plate. Double-check the plate and state below, or enter details manually.",
              );
              return;
            }
            setVinValue(data.vin);
            setYear(data.year ? String(data.year) : "");
            setMake(data.make || "");
            setModel(data.model || "");
            setEngine("");
            skipCarfaxMileagePrefillRef.current = false;
            setDecodedVehicle({
              vin: data.vin,
              year: data.year ? Number(data.year) : null,
              make: data.make || null,
              model: data.model || null,
              engine: null,
              base_vehicle_id: null,
            });
          },
          onError: () => {
            Alert.alert(
              "Lookup Failed",
              "Couldn't reach QuickVIN. Verify the plate and state below, then try again — or enter details manually.",
            );
          },
        },
      );
    },
    [decode, quickVin, setDecodedVehicle],
  );

  const handleManualPlateLookup = () => {
    const plate = plateInput.trim().toUpperCase();
    const state = plateStateInput.trim().toUpperCase();
    if (!plate) {
      Alert.alert("Required", "Enter a license plate to look up.");
      return;
    }
    if (state.length !== 2) {
      Alert.alert("Required", "Enter the 2-letter state for the plate.");
      return;
    }
    haptic.light();
    quickVin.mutate(
      { plate, state },
      {
        onSuccess: (data) => {
          if (!data.vin) {
            Alert.alert(
              "Plate Not Found",
              "QuickVIN didn't return a VIN for this plate / state. Double-check the inputs or enter details manually below.",
            );
            return;
          }
          setVinValue(data.vin);
          setYear(data.year ? String(data.year) : "");
          setMake(data.make || "");
          setModel(data.model || "");
          setEngine("");
          skipCarfaxMileagePrefillRef.current = false;
          setDecodedVehicle({
            vin: data.vin,
            year: data.year ? Number(data.year) : null,
            make: data.make || null,
            model: data.model || null,
            engine: null,
            base_vehicle_id: null,
          });
        },
        onError: () => {
          Alert.alert(
            "Lookup Failed",
            "Couldn't reach QuickVIN. Verify the plate and state, then try again — or enter details manually below.",
          );
        },
      },
    );
  };

  const handleManualDecode = () => {
    const trimmed = vinInput.trim();
    if (!trimmed) {
      Alert.alert("Required", "Enter a VIN to look up.");
      return;
    }
    haptic.light();
    decode.mutate(
      { identifier: trimmed, type: "vin" },
      {
        onSuccess: (data) => {
          setVinValue(data.vin || trimmed);
          setYear(String(data.year ?? ""));
          setMake(data.make || "");
          setModel(data.model || "");
          setEngine(data.engine || "");
          skipCarfaxMileagePrefillRef.current = false;
          setDecodedVehicle(data);
        },
        onError: () => {
          setVinValue(trimmed);
          Alert.alert(
            "Decode Failed",
            "Could not look up the vehicle. You can enter details manually below.",
          );
        },
      },
    );
  };

  const handleConfirm = () => {
    if (!year && !make && !model && !vinValue) {
      Alert.alert(
        "Missing Info",
        "Enter at least a VIN or Year/Make/Model to continue.",
      );
      return;
    }

    // PLAN-DEVIATION: 2026-04-26-walk-in-response-shape — when entering
    // confirm-vehicle from an EXISTING calendar appointment, hydration sets
    // `presetCustomer` from the appointment payload. We must NOT call the
    // walk-in endpoint here — that creates a phantom second appointment and
    // (combined with the type-mismatch on `useCreateWalkInJob`) routed the
    // user to `/job/undefined/services`. Only walk the walk-in path when the
    // route id is "new" (i.e. there's no real appointment yet).
    const isWalkIn = id === "new";
    const isCrmPreselected = Boolean(
      presetCustomer && availableVehicles.length > 0,
    );

    console.log("[job-flow] confirm-vehicle handleConfirm", {
      routeId: id,
      isWalkIn,
      isCrmPreselected,
      vinValue,
      year,
      make,
      model,
      presetCustomerId: presetCustomer?.id ?? null,
      selectedVehicleId,
    });

    // PLAN-DEVIATION: 2026-04-26-active-job-blocker — defense in depth.
    // If we are about to fire the walk-in endpoint while a timer is already
    // running, redirect to the active job instead of creating a duplicate
    // appointment for the same contact.
    if (isWalkIn && blocker.isActive) {
      router.replace(blocker.resumeRoute as never);
      return;
    }

    findOrCreate.mutate(
      {
        user_id:
          isCrmPreselected && presetCustomer?.id
            ? presetCustomer.id
            : authUser?.userId ?? 1,
        vin: vinValue || undefined,
        license_plate: plateInput.trim() || undefined,
        license_plate_state: plateStateInput.trim().toUpperCase() || undefined,
        year: year ? parseInt(year, 10) : undefined,
        make: make || undefined,
        model: model || undefined,
        engine: engine || undefined,
        mileage: parseManualMileageInput(mileageText),
      },
      {
        onSuccess: (vehicle) => {
          console.log("[job-flow] confirm-vehicle findOrCreate success", {
            vehicleId: vehicle.id,
            vin: vehicle.vin,
          });
          setVehicle(vehicle);

          if (isWalkIn && isCrmPreselected && presetCustomer) {
            createWalkIn.mutate(
              { customer_id: presetCustomer.id, vehicle_id: vehicle.id },
              {
                onSuccess: (booking) => {
                  console.log("[job-flow] confirm-vehicle walk-in created", {
                    appointmentId: booking.appointment_id,
                    vehicleId: vehicle.id,
                    customerId: presetCustomer.id,
                  });
                  // PLAN-DEVIATION: 2026-04-26-walk-in-response-shape —
                  // BE returns `appointment_id`, not `id`.
                  setAppointmentId(booking.appointment_id);
                  router.push(`/job/${booking.appointment_id}/services` as never);
                },
                onError: (err) => {
                  console.warn("[job-flow] confirm-vehicle walk-in failed", {
                    err: err instanceof Error ? err.message : String(err),
                  });
                  Alert.alert("Could not create job", extractErrorMessage(err));
                },
              },
            );
          } else if (isWalkIn) {
            if (!isCrmPreselected) {
              setCustomer(null);
            }
            console.log("[job-flow] confirm-vehicle routing to customer picker");
            router.push(`/job/new/customer` as never);
          } else {
            console.log("[job-flow] confirm-vehicle routing to existing appointment services", {
              appointmentId: id,
            });
            // Existing calendar appointment — customer is already on the
            // appointment, skip /customer and go straight to services.
            router.push(`/job/${id}/services` as never);
          }
        },
        onError: (err) => {
          console.warn("[job-flow] confirm-vehicle findOrCreate failed", {
            err: err instanceof Error ? err.message : String(err),
          });
          Alert.alert("Error", "Could not save vehicle. Please try again.");
        },
      },
    );
  };

  const isBusy = findOrCreate.isPending || createWalkIn.isPending;
  const isHydrating =
    needsHydration && !hydratedRef.current &&
    (jobDetail.isLoading || customerDetail.isLoading);
  const isWalkInRoute = id === "new";

  const applyDemoVehicle = useCallback(
    (vehicle: (typeof DEMO_VEHICLES)[number]) => {
      haptic.medium();
      setIsNewVehicle(true);
      setSelectedVehicleId(null);
      setYear(String(vehicle.year));
      setMake(vehicle.make);
      setModel(vehicle.model);
      setEngine(vehicle.engine);
      setVinValue(vehicle.vin);
      setVinInput(vehicle.vin);
      setPlateInput(vehicle.plate);
      setPlateStateInput(vehicle.state);
      setDecodedVehicle({
        vin: vehicle.vin,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        engine: vehicle.engine,
        base_vehicle_id: null,
      });
    },
    [setDecodedVehicle],
  );

  if (isHydrating) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "Confirm Vehicle",
            headerLeft: () => (
              <Pressable onPress={onBack} hitSlop={8}>
                <MaterialIcons name="arrow-back" size={24} color="#fff" />
              </Pressable>
            ),
          }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading vehicle info…</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "Confirm Vehicle",
          headerLeft: () => (
            <Pressable onPress={onBack} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      {scannerOpen ? (
        <VehicleScanner
          visible
          initialMode="vin"
          onScan={handleScanResult}
          onClose={() => setScannerOpen(false)}
        />
      ) : null}
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        {hasPicker && (
          <View style={styles.pickerSection}>
            <Text style={styles.pickerTitle}>Select Vehicle</Text>
            {availableVehicles.map((v) => {
              const isSelected = !isNewVehicle && v.id === selectedVehicleId;
              const displayName =
                [v.year, v.make, v.model].filter(Boolean).join(" ") ||
                "Unknown Vehicle";
              const plate = v.license_plate || "No Plate";
              const plateState = v.license_plate_state
                ? ` (${v.license_plate_state})`
                : "";

              return (
                <Pressable
                  key={v.id}
                  style={[
                    styles.vehicleCard,
                    isSelected && styles.vehicleCardSelected,
                    isNewVehicle && styles.vehicleCardDimmed,
                  ]}
                  onPress={() => selectVehicle(v)}
                >
                  <View style={styles.vehicleCardContent}>
                    <View style={styles.vehicleCardInfo}>
                      <Text
                        style={[
                          styles.vehicleCardName,
                          isSelected && styles.vehicleCardNameSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {displayName}
                      </Text>
                      <Text style={styles.vehicleCardPlate}>
                        {plate}
                        {plateState}
                        {v.color ? `  ·  ${v.color}` : ""}
                        {v.mileage
                          ? `  ·  ${Number(v.mileage).toLocaleString()} mi`
                          : ""}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.vehicleCheck,
                        isSelected && styles.vehicleCheckSelected,
                      ]}
                    >
                      {isSelected && (
                        <MaterialIcons name="check" size={18} color="#fff" />
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            })}

            <Pressable
              style={[
                styles.addNewCard,
                isNewVehicle && styles.addNewCardActive,
              ]}
              onPress={enterNewVehicleMode}
            >
              <View style={styles.vehicleCardContent}>
                <View style={styles.addNewLeft}>
                  <View
                    style={[
                      styles.addNewIcon,
                      isNewVehicle && styles.addNewIconActive,
                    ]}
                  >
                    <MaterialIcons
                      name="add"
                      size={20}
                      color={isNewVehicle ? "#fff" : "#3B82F6"}
                    />
                  </View>
                  <Text
                    style={[
                      styles.addNewText,
                      isNewVehicle && styles.addNewTextActive,
                    ]}
                  >
                    Add New Vehicle
                  </Text>
                </View>
                {isNewVehicle && (
                  <View style={styles.vehicleCheckSelected}>
                    <MaterialIcons name="check" size={18} color="#fff" />
                  </View>
                )}
              </View>
            </Pressable>
          </View>
        )}

        {(isNewVehicle || !hasPicker) && (
          <View style={styles.scanSection}>
            <Pressable
              style={styles.scanBtn}
              onPress={() => {
                setScannerOpen(true);
              }}
            >
              <View style={styles.scanIconCircle}>
                <MaterialIcons name="photo-camera" size={24} color="#fff" />
              </View>
              <View style={styles.scanBtnTextGroup}>
                <Text style={styles.scanBtnTitle}>Scan VIN or Plate</Text>
                <Text style={styles.scanBtnSub}>
                  Use camera to read barcode or plate
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#93C5FD" />
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or type VIN</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.vinInputRow}>
              <TextInput
                style={styles.vinInputField}
                placeholder="Enter 17-character VIN"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
                maxLength={17}
                value={vinInput}
                onChangeText={setVinInput}
                returnKeyType="go"
                onSubmitEditing={handleManualDecode}
              />
              <Pressable
                style={[
                  styles.decodeBtn,
                  decode.isPending && styles.disabled,
                ]}
                onPress={handleManualDecode}
                disabled={decode.isPending}
              >
                {decode.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialIcons name="search" size={22} color="#fff" />
                )}
              </Pressable>
            </View>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or look up by plate</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.plateInputRow}>
              <TextInput
                style={[styles.plateInputField, { flex: 2 }]}
                placeholder="Plate"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={10}
                value={plateInput}
                onChangeText={setPlateInput}
              />
              <TextInput
                style={[styles.plateInputField, { flex: 1 }]}
                placeholder="State"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={2}
                value={plateStateInput}
                onChangeText={setPlateStateInput}
                returnKeyType="go"
                onSubmitEditing={handleManualPlateLookup}
              />
              <Pressable
                style={[
                  styles.decodeBtn,
                  quickVin.isPending && styles.disabled,
                ]}
                onPress={handleManualPlateLookup}
                disabled={quickVin.isPending}
                accessibilityLabel="Look up VIN by plate"
              >
                {quickVin.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialIcons name="search" size={22} color="#fff" />
                )}
              </Pressable>
            </View>
            <Text style={styles.plateHint}>
              Uses CARFAX QuickVIN to convert a US license plate into a VIN.
            </Text>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or enter details</Text>
              <View style={styles.dividerLine} />
            </View>
          </View>
        )}

        {!isNewVehicle && (
          <View style={styles.vinCard}>
            <MaterialIcons name="fingerprint" size={24} color="#6B7280" />
            <Text style={styles.vinLabel}>VIN</Text>
            <Text style={styles.vinValue}>
              {vinValue || "Not available"}
            </Text>
          </View>
        )}

        <View style={styles.form}>
          <View style={styles.row}>
            <View style={styles.fieldSmall}>
              <Text style={styles.label}>Year</Text>
              <TextInput
                style={styles.input}
                value={year}
                onChangeText={setYear}
                keyboardType="number-pad"
                maxLength={4}
                placeholder="2024"
                placeholderTextColor="#D1D5DB"
              />
            </View>
            <View style={styles.fieldLarge}>
              <Text style={styles.label}>Make</Text>
              <TextInput
                style={styles.input}
                value={make}
                onChangeText={setMake}
                autoCapitalize="words"
                placeholder="Honda"
                placeholderTextColor="#D1D5DB"
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Model</Text>
            <TextInput
              style={styles.input}
              value={model}
              onChangeText={setModel}
              autoCapitalize="words"
              placeholder="Accord"
              placeholderTextColor="#D1D5DB"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Engine</Text>
            <TextInput
              style={styles.input}
              value={engine}
              onChangeText={setEngine}
              placeholder="1.5L Turbo I4"
              placeholderTextColor="#D1D5DB"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Mileage</Text>
            <View style={styles.mileageRow}>
              <TextInput
                style={[styles.input, styles.mileageInput]}
                value={mileageText}
                onChangeText={(t) => {
                  setMileageText(t.replace(/[^0-9]/g, ""));
                  setMileageStale(false);
                  skipCarfaxMileagePrefillRef.current = true;
                }}
                placeholder={
                  carfaxQuery.isLoading
                    ? "Loading from CARFAX…"
                    : "Enter current mileage"
                }
                placeholderTextColor="#D1D5DB"
                keyboardType="number-pad"
                returnKeyType="done"
              />
              <Text style={styles.mileageUnit}>mi</Text>
              {carfaxQuery.isLoading ? (
                <ActivityIndicator size="small" color="#3B82F6" />
              ) : null}
            </View>
            {mileageStale ? (
              <View style={styles.mileageWarning}>
                <MaterialIcons name="warning" size={14} color="#DC2626" />
                <Text style={styles.mileageWarningText}>
                  Default from last CARFAX service — confirm or update before
                  continuing
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* @demo-start */}
        {isWalkInRoute ? (
          <>
            <View style={styles.demoDivider}>
              <View style={styles.demoDividerLine} />
              <Text style={styles.demoDividerText}>Quick Fill (Demo)</Text>
              <View style={styles.demoDividerLine} />
            </View>
            <View style={styles.demoGrid}>
              {DEMO_VEHICLES.map((vehicle) => (
                <Pressable
                  key={vehicle.plate}
                  style={styles.demoVehicleBtn}
                  onPress={() => applyDemoVehicle(vehicle)}
                >
                  <MaterialIcons name="directions-car" size={16} color="#3B82F6" />
                  <Text style={styles.demoVehicleLabel}>{vehicle.label}</Text>
                  <Text style={styles.demoVehiclePlate}>{vehicle.plate}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
        {/* @demo-end */}

        <Pressable
          style={[styles.confirmBtn, isBusy && styles.disabled]}
          onPress={handleConfirm}
          disabled={isBusy}
        >
          {isBusy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.confirmText}>Confirm Vehicle</Text>
          )}
        </Pressable>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 16 },
  bottomSpacer: { height: 32 },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: { fontSize: 15, color: "#6B7280", fontWeight: "500" },

  pickerSection: { marginBottom: 20 },
  pickerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 10,
  },
  vehicleCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  vehicleCardSelected: {
    borderColor: "#3B82F6",
    backgroundColor: "#F0F7FF",
  },
  vehicleCardDimmed: {
    opacity: 0.5,
  },
  vehicleCardContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  vehicleCardInfo: {
    flex: 1,
    marginRight: 12,
  },
  vehicleCardName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 3,
  },
  vehicleCardNameSelected: {
    color: "#1D4ED8",
  },
  vehicleCardPlate: {
    fontSize: 13,
    color: "#6B7280",
    letterSpacing: 0.3,
  },
  vehicleCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  vehicleCheckSelected: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#3B82F6",
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },

  addNewCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "#93C5FD",
    borderStyle: "dashed",
    backgroundColor: "#FAFCFF",
  },
  addNewCardActive: {
    borderStyle: "solid",
    borderColor: "#3B82F6",
    backgroundColor: "#EFF6FF",
  },
  addNewLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  addNewIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  addNewIconActive: {
    backgroundColor: "#3B82F6",
  },
  addNewText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#3B82F6",
  },
  addNewTextActive: {
    color: "#1D4ED8",
    fontWeight: "700",
  },

  scanSection: { marginBottom: 8 },
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3B82F6",
    borderRadius: 14,
    padding: 16,
    gap: 14,
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  scanIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  scanBtnTextGroup: { flex: 1 },
  scanBtnTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  scanBtnSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
  },

  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 14,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  dividerText: {
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "500",
  },

  vinInputRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  vinInputField: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    letterSpacing: 1,
  },
  decodeBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  plateInputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  plateInputField: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    letterSpacing: 1,
  },
  plateHint: {
    marginTop: 6,
    fontSize: 12,
    color: "#9CA3AF",
    fontStyle: "italic",
  },

  vinCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  vinLabel: { fontSize: 13, color: "#6B7280", fontWeight: "600" },
  vinValue: { fontSize: 15, color: "#111827", fontWeight: "700", flex: 1 },

  form: { gap: 16, marginBottom: 24 },
  row: { flexDirection: "row", gap: 12 },
  fieldSmall: { flex: 1 },
  fieldLarge: { flex: 2 },
  field: {},
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  mileageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mileageInput: {
    flex: 1,
  },
  mileageUnit: {
    fontSize: 16,
    fontWeight: "500",
    color: "#6B7280",
  },
  mileageWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  mileageWarningText: {
    fontSize: 12,
    color: "#DC2626",
    fontWeight: "500",
    flex: 1,
  },
  confirmBtn: {
    backgroundColor: "#3B82F6",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  disabled: { opacity: 0.6 },
  confirmText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  // @demo-start
  demoDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 12,
    gap: 12,
  },
  demoDividerLine: { flex: 1, height: 1, backgroundColor: "#E5E7EB" },
  demoDividerText: { fontSize: 12, color: "#9CA3AF", fontWeight: "600" },
  demoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 24 },
  demoVehicleBtn: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 4,
  },
  demoVehicleLabel: { fontSize: 13, fontWeight: "700", color: "#111827" },
  demoVehiclePlate: { fontSize: 12, color: "#6B7280", fontWeight: "600" },
  // @demo-end
});
