import { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Alert,
  Modal,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCustomerSearch, useQuickAddCustomer } from "@technician/hooks/customers/use-customers";
import { useVehicleOwnerLookup } from "@technician/hooks/customers/use-vehicle-owner-lookup";
import { useDebouncedValue } from "@technician/hooks/utility/use-debounced-value";
import { useCreateWalkInJob } from "@technician/hooks/jobs/use-jobs";
import { useFlowBack } from "@technician/hooks/jobs/use-flow-back";
import { useSuggestDispatch } from "@technician/hooks/operations/use-dispatch";
import { useJobFlowStore } from "@technician/stores/job-flow";
import { useAuthStore } from "@/src/stores/auth";
import { CustomerCard } from "@technician/components/customer/customer-card";
import { DispatchSuggestionCard } from "@technician/components/route/dispatch-suggestion-card";
import {
  NewCustomerForm,
  type NewCustomerFields,
} from "@technician/components/walk-in/new-customer-form";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type { User, ScoredSuggestion } from "@technician/types/api";

export default function CustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isWalkIn = id === "new";

  if (isWalkIn) {
    return <WalkInCustomerScreen />;
  }

  return <ExistingJobCustomerScreen jobId={id} />;
}

function WalkInCustomerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const onBack = useFlowBack("customer", "new");
  const {
    vehicle,
    decodedVehicle,
    customer: storeCustomer,
    availableVehicles,
    setCustomer,
    setAppointmentId,
  } = useJobFlowStore();
  const createWalkIn = useCreateWalkInJob();
  const quickAdd = useQuickAddCustomer();
  const suggestDispatch = useSuggestDispatch();
  const actorFranchiseId = useAuthStore((s) => s.user?.franchiseId);

  const isCrmPreselected = Boolean(
    storeCustomer && availableVehicles.length > 0,
  );
  const clearedStaleCustomer = useRef(false);

  const ownerLookup = useVehicleOwnerLookup(vehicle);
  const [newCustomerFields, setNewCustomerFields] = useState<NewCustomerFields>({
    full_name: "",
    phone: "",
    email: "",
  });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<ScoredSuggestion[]>([]);
  const [pendingAppointmentId, setPendingAppointmentId] = useState<number | null>(null);

  useEffect(() => {
    if (clearedStaleCustomer.current || isCrmPreselected) return;
    clearedStaleCustomer.current = true;
    setCustomer(null);
  }, [isCrmPreselected, setCustomer]);

  useEffect(() => {
    if (isCrmPreselected || !ownerLookup.isSuccess || !ownerLookup.data) return;
    setCustomer(ownerLookup.data);
  }, [
    isCrmPreselected,
    ownerLookup.isSuccess,
    ownerLookup.data,
    setCustomer,
  ]);

  const activeCustomer = storeCustomer ?? ownerLookup.data ?? null;
  const isLookingUp =
    !isCrmPreselected &&
    !storeCustomer &&
    (ownerLookup.isLoading || ownerLookup.isFetching);
  const showCreateForm =
    !isCrmPreselected &&
    !isLookingUp &&
    ownerLookup.isFetched &&
    !activeCustomer;

  const vehicleLabel = [
    decodedVehicle?.year ?? vehicle?.year,
    decodedVehicle?.make ?? vehicle?.make,
    decodedVehicle?.model ?? vehicle?.model,
  ]
    .filter(Boolean)
    .join(" ");
  const plateLabel = [vehicle?.license_plate, vehicle?.license_plate_state]
    .filter(Boolean)
    .join(" ");

  const navigateToServices = (appointmentId: number) => {
    setShowSuggestions(false);
    router.push(`/job/${appointmentId}/services` as never);
  };

  const proceedWithCustomer = (customer: User) => {
    if (!vehicle) {
      Alert.alert(
        "Vehicle Missing",
        "We lost the vehicle for this walk-in. Please scan the plate again.",
        [
          {
            text: "OK",
            onPress: () => router.replace("/job/new/confirm-vehicle" as never),
          },
        ],
      );
      return;
    }

    setCustomer(customer);
    haptic.medium();

    createWalkIn.mutate(
      {
        customer_id: customer.id,
        vehicle_id: vehicle.id,
        franchise_id: actorFranchiseId,
      },
      {
        onSuccess: (booking) => {
          setAppointmentId(booking.appointment_id);
          setPendingAppointmentId(booking.appointment_id);

          const today = new Date().toISOString().split("T")[0];
          suggestDispatch.mutate(
            {
              customerId: customer.id,
              serviceIds: [],
              vehicleId: vehicle.id,
              addressId: 0,
              preferredDateStart: today,
              preferredDateEnd: today,
              franchiseId: 0,
            },
            {
              onSuccess: (results) => {
                if (results.length > 0) {
                  setSuggestions(results);
                  setShowSuggestions(true);
                } else {
                  navigateToServices(booking.appointment_id);
                }
              },
              onError: () => {
                navigateToServices(booking.appointment_id);
              },
            },
          );
        },
        onError: () => Alert.alert("Error", "Could not create job."),
      },
    );
  };

  const handleCreateCustomer = () => {
    if (!newCustomerFields.full_name.trim()) {
      Alert.alert("Required", "Name is required.");
      return;
    }
    quickAdd.mutate(
      {
        full_name: newCustomerFields.full_name.trim(),
        ...(newCustomerFields.phone.trim()
          ? { phone: newCustomerFields.phone.trim() }
          : {}),
        ...(newCustomerFields.email.trim()
          ? { email: newCustomerFields.email.trim() }
          : {}),
      },
      {
        onSuccess: (customer) => {
          setCustomer(customer);
        },
        onError: () => Alert.alert("Error", "Could not add customer."),
      },
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Select Customer",
          headerLeft: () => (
            <Pressable onPress={onBack} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.walkInScroll,
            { paddingBottom: 24 + insets.bottom + 80 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.vehicleContext}>
            <MaterialIcons name="directions-car" size={22} color="#3B82F6" />
            <View style={styles.vehicleContextText}>
              <Text style={styles.vehicleContextTitle}>
                {vehicleLabel || "Vehicle"}
              </Text>
              {plateLabel ? (
                <Text style={styles.vehicleContextSub}>Plate {plateLabel}</Text>
              ) : decodedVehicle?.vin || vehicle?.vin ? (
                <Text style={styles.vehicleContextSub}>
                  VIN {(decodedVehicle?.vin ?? vehicle?.vin)?.slice(-8)}
                </Text>
              ) : null}
            </View>
          </View>

          {isLookingUp ? (
            <View style={styles.lookupState}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.lookupText}>
                Looking up customer from plate / VIN…
              </Text>
            </View>
          ) : null}

          {activeCustomer ? (
            <View style={styles.resolvedSection}>
              <Text style={styles.sectionLabel}>Customer</Text>
              <CustomerCard
                customer={activeCustomer}
                vehicles={
                  vehicle
                    ? [
                        {
                          year: vehicle.year,
                          make: vehicle.make,
                          model: vehicle.model,
                          plate: vehicle.license_plate,
                        },
                      ]
                    : undefined
                }
              />
            </View>
          ) : null}

          {showCreateForm ? (
            <View style={styles.createSection}>
              <Text style={styles.createTitle}>New Customer</Text>
              <Text style={styles.createSub}>
                We couldn&apos;t find an existing customer for this vehicle.
                Add their details to continue.
              </Text>
              <NewCustomerForm
                value={newCustomerFields}
                onChange={setNewCustomerFields}
                disabled={quickAdd.isPending}
              />
              <Pressable
                style={[
                  styles.primaryBtn,
                  styles.createBtn,
                  quickAdd.isPending && styles.disabled,
                ]}
                onPress={handleCreateCustomer}
                disabled={quickAdd.isPending}
              >
                {quickAdd.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Create Customer</Text>
                )}
              </Pressable>
            </View>
          ) : null}
        </ScrollView>

        {activeCustomer ? (
          <View
            style={[
              styles.footer,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
          >
            <Pressable
              style={[
                styles.primaryBtn,
                createWalkIn.isPending && styles.disabled,
              ]}
              onPress={() => proceedWithCustomer(activeCustomer)}
              disabled={createWalkIn.isPending}
            >
              {createWalkIn.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Continue</Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <Modal
        visible={showSuggestions}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (pendingAppointmentId) navigateToServices(pendingAppointmentId);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <DispatchSuggestionCard
              suggestions={suggestions}
              onConfirm={() => {
                if (pendingAppointmentId) navigateToServices(pendingAppointmentId);
              }}
              onDismiss={() => {
                if (pendingAppointmentId) navigateToServices(pendingAppointmentId);
              }}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

function ExistingJobCustomerScreen({ jobId }: { jobId: string }) {
  const router = useRouter();
  const onBack = useFlowBack("customer", jobId);
  const { customer: presetCustomer, setCustomer } = useJobFlowStore();
  const quickAdd = useQuickAddCustomer();

  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const debouncedSearchQuery = useDebouncedValue(searchQuery, 250);
  const { data: customers = [] } = useCustomerSearch(debouncedSearchQuery);

  const selectCustomer = (customer: User) => {
    setCustomer(customer);
    router.push(`/job/${jobId}/services` as never);
  };

  const handleQuickAdd = () => {
    if (!newName.trim() || !newPhone.trim()) {
      Alert.alert("Required", "Name and phone are required.");
      return;
    }
    quickAdd.mutate(
      { full_name: newName.trim(), phone: newPhone.trim() },
      {
        onSuccess: (customer) => selectCustomer(customer),
        onError: () => Alert.alert("Error", "Could not add customer."),
      },
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Select Customer",
          headerLeft: () => (
            <Pressable onPress={onBack} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <View style={styles.container}>
        {presetCustomer ? (
          <View style={styles.presetBanner}>
            <View style={styles.presetAvatar}>
              <Text style={styles.presetAvatarText}>
                {presetCustomer.full_name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </Text>
            </View>
            <View style={styles.presetInfo}>
              <Text style={styles.presetName}>{presetCustomer.full_name}</Text>
              {presetCustomer.phone ? (
                <Text style={styles.presetDetail}>{presetCustomer.phone}</Text>
              ) : null}
            </View>
            <Pressable
              style={styles.presetBtn}
              onPress={() => selectCustomer(presetCustomer)}
            >
              <Text style={styles.presetBtnText}>Continue</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={22} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, phone, plate..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
          />
        </View>

        <FlatList
          data={customers}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <CustomerCard customer={item} onPress={() => selectCustomer(item)} />
          )}
          ListEmptyComponent={
            searchQuery.length >= 2 ? (
              <Text style={styles.emptyText}>No customers found</Text>
            ) : (
              <Text style={styles.emptyText}>
                Type at least 2 characters to search
              </Text>
            )
          }
        />

        {showAddForm ? (
          <View style={styles.addForm}>
            <Text style={styles.addTitle}>Quick Add Customer</Text>
            <TextInput
              style={styles.input}
              placeholder="Full Name"
              placeholderTextColor="#9CA3AF"
              value={newName}
              onChangeText={setNewName}
              autoCapitalize="words"
            />
            <TextInput
              style={styles.input}
              placeholder="Phone"
              placeholderTextColor="#9CA3AF"
              value={newPhone}
              onChangeText={setNewPhone}
              keyboardType="phone-pad"
            />
            <View style={styles.addActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setShowAddForm(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, quickAdd.isPending && styles.disabled]}
                onPress={handleQuickAdd}
                disabled={quickAdd.isPending}
              >
                <Text style={styles.saveText}>
                  {quickAdd.isPending ? "Adding..." : "Add & Select"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={styles.fab} onPress={() => setShowAddForm(true)}>
            <MaterialIcons name="person-add" size={24} color="#fff" />
          </Pressable>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#F9FAFB" },
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  walkInScroll: { padding: 16, flexGrow: 1 },
  vehicleContext: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  vehicleContextText: { flex: 1 },
  vehicleContextTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  vehicleContextSub: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 2,
  },
  lookupState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 12,
  },
  lookupText: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
  },
  resolvedSection: { gap: 10 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  createSection: {
    flex: 1,
    gap: 16,
    paddingTop: 8,
  },
  createTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  createSub: {
    fontSize: 15,
    color: "#6B7280",
    lineHeight: 22,
  },
  createBtn: { marginTop: 8 },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "#F9FAFB",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  primaryBtn: {
    backgroundColor: "#3B82F6",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  presetBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    margin: 16,
    marginBottom: 0,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    gap: 12,
  },
  presetAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  presetAvatarText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#16A34A",
  },
  presetInfo: { flex: 1 },
  presetName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  presetDetail: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 1,
  },
  presetBtn: {
    backgroundColor: "#22C55E",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  presetBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    margin: 16,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 8,
  },
  searchInput: { flex: 1, paddingVertical: 14, fontSize: 16, color: "#111827" },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  emptyText: {
    textAlign: "center",
    color: "#9CA3AF",
    fontSize: 15,
    paddingTop: 40,
  },
  addForm: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    gap: 12,
  },
  addTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  input: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  addActions: { flexDirection: "row", gap: 12, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
  },
  cancelText: { fontSize: 15, fontWeight: "600", color: "#6B7280" },
  saveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#3B82F6",
    alignItems: "center",
  },
  disabled: { opacity: 0.6 },
  saveText: { fontSize: 15, fontWeight: "600", color: "#fff" },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    padding: 16,
    paddingBottom: 32,
  },
});
