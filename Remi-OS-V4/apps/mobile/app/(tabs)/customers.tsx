import { useState, useMemo, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  useQuickAddCustomer,
  useCustomerList,
} from "@technician/hooks/customers/use-customers";
import {
  useUnifiedSearch,
  type UnifiedSearchResult,
} from "@technician/hooks/customers/use-unified-search";
import {
  CustomerFilterSheet,
  EMPTY_FILTERS,
  getActiveFilterCount,
  getActiveFilterLabels,
  type CustomerFilters,
} from "@technician/components/customer/customer-filter-sheet";
import type { CustomerListItem, CustomerDetailResponse, DecodedVehicle, UserRole, UserStatus } from "@technician/types/api";
import { useJobFlowStore } from "@technician/stores/job-flow";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import { extractErrorMessage } from "@technician/api/errors";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { useActiveJobBlocker } from "@technician/hooks/jobs/use-active-job-blocker";

function applyFilters(
  customers: CustomerListItem[],
  filters: CustomerFilters,
): CustomerListItem[] {
  const now = new Date();
  return customers.filter((c) => {
    if (filters.lastVisited) {
      if (!c.last_visit_date) return false;
      const lastVisit = new Date(c.last_visit_date);
      const daysDiff = (now.getTime() - lastVisit.getTime()) / 86_400_000;
      switch (filters.lastVisited) {
        case "This week":
          if (daysDiff > 7) return false;
          break;
        case "This month":
          if (daysDiff > 30) return false;
          break;
        case "This quarter":
          if (daysDiff > 90) return false;
          break;
      }
    }

    if (filters.hasntVisited) {
      if (c.last_visit_date) {
        const lastVisit = new Date(c.last_visit_date);
        const daysDiff = (now.getTime() - lastVisit.getTime()) / 86_400_000;
        switch (filters.hasntVisited) {
          case "30+ days":
            if (daysDiff < 30) return false;
            break;
          case "60+ days":
            if (daysDiff < 60) return false;
            break;
          case "90+ days":
            if (daysDiff < 90) return false;
            break;
        }
      }
    }

    if (filters.visitFrequency) {
      switch (filters.visitFrequency) {
        case "First-time":
          if (c.visit_count > 1) return false;
          break;
        case "Repeat (2-5)":
          if (c.visit_count < 2 || c.visit_count > 5) return false;
          break;
        case "Loyal (5+)":
          if (c.visit_count < 5) return false;
          break;
      }
    }

    if (filters.vehicleMake) {
      if (!c.vehicle_makes.some((m) => m.toLowerCase() === filters.vehicleMake!.toLowerCase()))
        return false;
    }

    if (filters.hasDeferredWork !== null) {
      if (c.has_deferred_work !== filters.hasDeferredWork) return false;
    }

    if (filters.creationSource) {
      const normalized = filters.creationSource.toLowerCase().replace("-", "_");
      if (c.creation_source !== normalized) return false;
    }

    return true;
  });
}

export default function CustomersScreen() {
  const router = useRouter();
  const { setCustomer, setDecodedVehicle, setAvailableVehicles, reset } = useJobFlowStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<CustomerFilters>(EMPTY_FILTERS);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [startingJobFor, setStartingJobFor] = useState<number | null>(null);

  const { data: searchResults = [], isLoading: isSearching } =
    useUnifiedSearch(searchQuery);
  const { data: allCustomers = [], isLoading: isLoadingList, error: listError, refetch: refetchCustomers } =
    useCustomerList();
  const quickAdd = useQuickAddCustomer();
  // PLAN-DEVIATION: 2026-04-26-active-job-blocker — see docs/PLAN-DEVIATIONS.md.
  // Diverts to the active timer instead of letting the user create another
  // walk-in for the same contact.
  const blocker = useActiveJobBlocker();

  useFocusEffect(
    useCallback(() => {
      refetchCustomers();
    }, [refetchCustomers])
  );

  const handleStartJob = async (item: { id: number }) => {
    haptic.medium();
    if (blocker.isActive) {
      router.push(blocker.resumeRoute as never);
      return;
    }
    setStartingJobFor(item.id);
    try {
      const detail = await api<CustomerDetailResponse>("get", Endpoints.customers.detail(item.id));
      reset();
      setCustomer({
        id: detail.customer.id,
        full_name: detail.customer.full_name,
        email: detail.customer.email,
        phone: detail.customer.phone,
        role: "customer" as UserRole,
        status: "active" as UserStatus,
        profile_image_url: detail.customer.profile_image_url,
        created_at: detail.customer.created_at,
        updated_at: detail.customer.created_at,
      });
      setAvailableVehicles(detail.vehicles);
      const v = detail.vehicles[0];
      if (v) {
        setDecodedVehicle({
          vin: v.vin || null,
          year: v.year || null,
          make: v.make || null,
          model: v.model || null,
          engine: v.engine || null,
          base_vehicle_id: null,
        } as DecodedVehicle);
      }
      router.push("/job/new/confirm-vehicle" as never);
    } catch (err) {
      Alert.alert("Could not start job", extractErrorMessage(err));
    } finally {
      setStartingJobFor(null);
    }
  };

  const isSearchMode = searchQuery.length >= 2;
  const activeFilterCount = useMemo(
    () => getActiveFilterCount(filters),
    [filters],
  );
  const filterLabels = useMemo(
    () => getActiveFilterLabels(filters),
    [filters],
  );

  const vehicleMakes = useMemo(() => {
    const makes = new Set<string>();
    allCustomers.forEach((c) => c.vehicle_makes.forEach((m) => makes.add(m)));
    return [...makes].sort();
  }, [allCustomers]);

  const displayCustomers = useMemo(() => {
    if (activeFilterCount > 0) return applyFilters(allCustomers, filters);
    return allCustomers;
  }, [allCustomers, filters, activeFilterCount]);

  const removeFilter = (key: keyof CustomerFilters) => {
    haptic.light();
    setFilters((prev) => ({ ...prev, [key]: null }));
  };

  const handleQuickAdd = () => {
    if (!newName.trim() || !newPhone.trim()) {
      Alert.alert("Required", "Name and phone are required.");
      return;
    }
    quickAdd.mutate(
      {
        full_name: newName.trim(),
        phone: newPhone.trim(),
        email: newEmail.trim() || undefined,
      },
      {
        onSuccess: (customer) => {
          setShowAddForm(false);
          setNewName("");
          setNewPhone("");
          setNewEmail("");
          router.push(`/customers/${customer.id}`);
        },
        onError: () => Alert.alert("Error", "Could not add customer."),
      },
    );
  };

  const renderCustomerItem = ({ item }: { item: CustomerListItem }) => {
    const subtitle: string[] = [];
    if (item.vehicle_makes.length > 0)
      subtitle.push(item.vehicle_makes.join(", "));
    if (item.visit_count > 0)
      subtitle.push(
        `${item.visit_count} visit${item.visit_count === 1 ? "" : "s"}`,
      );
    if (item.last_visit_date) {
      const d = new Date(item.last_visit_date);
      subtitle.push(`Last: ${d.toLocaleDateString()}`);
    }

    return (
      <View style={styles.listCard}>
        <Pressable
          style={styles.cardTop}
          onPress={() => router.push(`/customers/${item.id}`)}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {item.full_name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </Text>
          </View>
          <View style={styles.info}>
            <Text style={styles.name}>{item.full_name}</Text>
            {subtitle.length > 0 && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle.join(" · ")}
              </Text>
            )}
            {/* 2026-05-25 — show phone + address on every card with an
                explicit "Not on file" fallback when missing. Previously
                the rows were hidden entirely when empty, which left the
                tech guessing whether the data was absent or just
                un-rendered. */}
            <View style={styles.contactRow}>
              <MaterialIcons
                name="phone"
                size={12}
                color={item.phone ? "#6B7280" : "#D1D5DB"}
              />
              <Text
                style={
                  item.phone ? styles.detail : styles.detailMissing
                }
                numberOfLines={1}
              >
                {item.phone ?? "Phone not on file"}
              </Text>
            </View>
            <View style={styles.contactRow}>
              <MaterialIcons
                name="place"
                size={12}
                color={
                  item.address_line || item.address_city
                    ? "#6B7280"
                    : "#D1D5DB"
                }
              />
              <Text
                style={
                  item.address_line || item.address_city
                    ? styles.detail
                    : styles.detailMissing
                }
                numberOfLines={1}
              >
                {item.address_line || item.address_city
                  ? [item.address_line, item.address_city]
                      .filter(Boolean)
                      .join(", ")
                  : "Address not on file"}
              </Text>
            </View>
          </View>
          <View style={styles.cardRight}>
            {item.has_deferred_work && (
              <View style={styles.deferredBadge}>
                <MaterialIcons name="build" size={12} color="#F59E0B" />
              </View>
            )}
            <MaterialIcons name="chevron-right" size={24} color="#9CA3AF" />
          </View>
        </Pressable>
        <Pressable
          style={styles.startJobRow}
          onPress={() => handleStartJob(item)}
          disabled={startingJobFor === item.id}
        >
          {startingJobFor === item.id ? (
            <ActivityIndicator size="small" color="#22C55E" />
          ) : (
            <>
              <MaterialIcons name="play-circle-fill" size={16} color="#22C55E" />
              <Text style={styles.startJobRowText}>{blocker.label}</Text>
            </>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={22} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, phone, plate, VIN..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <MaterialIcons name="close" size={20} color="#9CA3AF" />
            </Pressable>
          )}
        </View>
        <Pressable
          style={[
            styles.filterBtn,
            activeFilterCount > 0 && styles.filterBtnActive,
          ]}
          onPress={() => {
            haptic.light();
            setShowFilters(true);
          }}
        >
          <MaterialIcons
            name="tune"
            size={22}
            color={activeFilterCount > 0 ? "#3B82F6" : "#6B7280"}
          />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {!isSearchMode && filterLabels.length > 0 && (
        <View style={styles.chipBar}>
          {filterLabels.map(({ key, label }) => (
            <Pressable
              key={key}
              style={styles.activeChip}
              onPress={() => removeFilter(key)}
            >
              <Text style={styles.activeChipText}>{label}</Text>
              <MaterialIcons name="close" size={14} color="#3B82F6" />
            </Pressable>
          ))}
        </View>
      )}

      {isSearchMode ? (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => String(item.customer.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }: { item: UnifiedSearchResult }) => {
            const { customer, vehicles, matchSource } = item;
            const initials = customer.full_name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();
            const q = searchQuery.toLowerCase();

            return (
              <View style={styles.searchResultCard}>
                <Pressable
                  style={styles.cardTop}
                  onPress={() => router.push(`/customers/${customer.id}`)}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>
                  <View style={styles.info}>
                    <Text style={styles.name}>{customer.full_name}</Text>
                    {customer.phone && (
                      <Text style={styles.detail}>{customer.phone}</Text>
                    )}
                    {customer.email && (
                      <Text style={styles.detail}>{customer.email}</Text>
                    )}
                    {matchSource !== "customer" && (
                      <View style={styles.vehicleMatchBadge}>
                        <MaterialIcons
                          name="directions-car"
                          size={11}
                          color="#6366F1"
                        />
                        <Text style={styles.vehicleMatchText}>
                          {matchSource === "vehicle"
                            ? "Matched by vehicle"
                            : "Customer & vehicle match"}
                        </Text>
                      </View>
                    )}
                  </View>
                  <MaterialIcons
                    name="chevron-right"
                    size={24}
                    color="#9CA3AF"
                  />
                </Pressable>
                {vehicles.length > 0 && (
                  <View style={styles.vehicleResultList}>
                    {vehicles.map((v) => {
                      const vLabel = [v.year, v.make, v.model]
                        .filter(Boolean)
                        .join(" ");
                      const plateHit = v.license_plate
                        ?.toLowerCase()
                        .includes(q);
                      return (
                        <View key={v.id} style={styles.vehicleResultItem}>
                          <MaterialIcons
                            name="directions-car"
                            size={14}
                            color="#6B7280"
                          />
                          <Text
                            style={styles.vehicleResultLabel}
                            numberOfLines={1}
                          >
                            {vLabel || `Vehicle #${v.id}`}
                          </Text>
                          {v.license_plate && (
                            <View
                              style={[
                                styles.miniPlateBadge,
                                plateHit && styles.miniPlateBadgeHit,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.miniPlateText,
                                  plateHit && styles.miniPlateTextHit,
                                ]}
                              >
                                {v.license_plate}
                              </Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
                <Pressable
                  style={styles.startJobRow}
                  onPress={() => handleStartJob(customer)}
                  disabled={startingJobFor === customer.id}
                >
                  {startingJobFor === customer.id ? (
                    <ActivityIndicator size="small" color="#22C55E" />
                  ) : (
                    <>
                      <MaterialIcons
                        name="play-circle-fill"
                        size={16}
                        color="#22C55E"
                      />
                      <Text style={styles.startJobRowText}>{blocker.label}</Text>
                    </>
                  )}
                </Pressable>
              </View>
            );
          }}
          ListHeaderComponent={
            searchResults.length > 0 ? (
              <Text style={styles.listHeader}>
                {searchResults.length} result
                {searchResults.length === 1 ? "" : "s"}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            isSearching ? (
              <SkeletonListScreen cards={4} />
            ) : (
              <View style={styles.empty}>
                <MaterialIcons
                  name="person-search"
                  size={48}
                  color="#D1D5DB"
                />
                <Text style={styles.emptyText}>
                  No customers or vehicles found
                </Text>
              </View>
            )
          }
        />
      ) : (
        <FlatList
          data={displayCustomers}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={renderCustomerItem}
          ListHeaderComponent={
            <Text style={styles.listHeader}>
              {displayCustomers.length} customer
              {displayCustomers.length === 1 ? "" : "s"}
            </Text>
          }
          ListEmptyComponent={
            isLoadingList ? (
              <SkeletonListScreen cards={6} />
            ) : listError ? (
              <View style={styles.empty}>
                <MaterialIcons name="error-outline" size={48} color="#EF4444" />
                <Text style={styles.emptyTitle}>Could not load customers</Text>
                <Text style={styles.emptyText}>
                  {listError.message || "Check your connection and try again."}
                </Text>
              </View>
            ) : (
              <View style={styles.empty}>
                <MaterialIcons name="people" size={48} color="#D1D5DB" />
                <Text style={styles.emptyTitle}>No Customers</Text>
                <Text style={styles.emptyText}>
                  Add your first customer with the + button
                </Text>
              </View>
            )
          }
        />
      )}

      <CustomerFilterSheet
        visible={showFilters}
        filters={filters}
        vehicleMakes={vehicleMakes}
        onApply={setFilters}
        onClose={() => setShowFilters(false)}
      />

      {showAddForm ? (
        <View style={styles.addForm}>
          <View style={styles.addHeader}>
            <Text style={styles.addTitle}>Quick Add Customer</Text>
            <Pressable onPress={() => setShowAddForm(false)}>
              <MaterialIcons name="close" size={24} color="#6B7280" />
            </Pressable>
          </View>
          <TextInput
            style={styles.input}
            placeholder="Full Name *"
            placeholderTextColor="#9CA3AF"
            value={newName}
            onChangeText={setNewName}
            autoCapitalize="words"
          />
          <TextInput
            style={styles.input}
            placeholder="Phone *"
            placeholderTextColor="#9CA3AF"
            value={newPhone}
            onChangeText={setNewPhone}
            keyboardType="phone-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="Email (optional)"
            placeholderTextColor="#9CA3AF"
            value={newEmail}
            onChangeText={setNewEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Pressable
            style={[styles.addBtn, quickAdd.isPending && styles.disabled]}
            onPress={handleQuickAdd}
            disabled={quickAdd.isPending}
          >
            <Text style={styles.addBtnText}>
              {quickAdd.isPending ? "Adding..." : "Add Customer"}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={styles.fab}
          onPress={() => setShowAddForm(true)}
        >
          <MaterialIcons name="person-add" size={26} color="#fff" />
        </Pressable>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
    gap: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: "#111827",
  },
  filterBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  filterBtnActive: {
    borderColor: "#3B82F6",
    backgroundColor: "#EFF6FF",
  },
  filterBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  chipBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingBottom: 4,
    paddingTop: 4,
    gap: 6,
  },
  activeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EFF6FF",
    borderRadius: 16,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 8,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  activeChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3B82F6",
  },
  listHeader: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  list: { paddingHorizontal: 16, paddingBottom: 100, paddingTop: 8 },
  listCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
    overflow: "hidden",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4F46E5",
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
    marginBottom: 1,
  },
  detail: {
    fontSize: 12,
    color: "#9CA3AF",
    flex: 1,
  },
  detailMissing: {
    fontSize: 12,
    color: "#D1D5DB",
    fontStyle: "italic",
    flex: 1,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  cardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  deferredBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  startJobRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    backgroundColor: "#FAFFFE",
  },
  startJobRowText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#22C55E",
  },
  searchResultCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
    overflow: "hidden",
  },
  vehicleMatchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    alignSelf: "flex-start",
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  vehicleMatchText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6366F1",
  },
  vehicleResultList: {
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: "#FAFBFC",
  },
  vehicleResultItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  vehicleResultLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
    flex: 1,
  },
  miniPlateBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  miniPlateBadgeHit: {
    backgroundColor: "#FEF3C7",
    borderColor: "#F59E0B",
  },
  miniPlateText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    letterSpacing: 0.5,
  },
  miniPlateTextHit: {
    color: "#92400E",
  },
  empty: {
    alignItems: "center",
    paddingTop: 60,
    gap: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#374151" },
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    paddingHorizontal: 40,
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
  addHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  addBtn: {
    backgroundColor: "#3B82F6",
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  disabled: { opacity: 0.6 },
  addBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
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
});
