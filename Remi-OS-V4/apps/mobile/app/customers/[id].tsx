/**
 * Technician CRM — customer profile (vehicles, history, start job).
 * Migrated from pre-monorepo `app/customer/[id].tsx` to `app/customers/[id].tsx`
 * so `/customer/*` can host the end-customer mode app.
 */
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { CollapsibleSection } from "@/src/components/shared/collapsible-section";
import { useCustomerDetail } from "@technician/hooks/customers/use-customers";
import { useDeleteCustomer } from "@technician/hooks/customers/use-delete-customer";
import { useActiveJobBlocker } from "@technician/hooks/jobs/use-active-job-blocker";
import { useStartConversationWithCustomer } from "@technician/hooks/communication/use-messages";
import { useJobFlowStore } from "@technician/stores/job-flow";
import { extractErrorMessage } from "@technician/api/errors";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type {
  CustomerServiceHistoryEntry,
  DecodedVehicle,
  UserRole,
  UserStatus,
} from "@technician/types/api";

export default function TechnicianCustomerDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const customerId = Number(id);
  const { data, isLoading, isError, refetch } = useCustomerDetail(customerId);
  const deleteCustomer = useDeleteCustomer();
  const startConversation = useStartConversationWithCustomer();
  const blocker = useActiveJobBlocker();
  const reset = useJobFlowStore((s) => s.reset);
  const setCustomer = useJobFlowStore((s) => s.setCustomer);
  const setAvailableVehicles = useJobFlowStore((s) => s.setAvailableVehicles);
  const setDecodedVehicle = useJobFlowStore((s) => s.setDecodedVehicle);
  const [startingJob, setStartingJob] = useState(false);

  const customer = data?.customer;

  const handleStartJob = useCallback(async () => {
    if (!data) return;
    haptic.medium();
    if (blocker.isActive) {
      router.push(blocker.resumeRoute as never);
      return;
    }
    setStartingJob(true);
    try {
      reset();
      setCustomer({
        id: data.customer.id,
        full_name: data.customer.full_name,
        email: data.customer.email,
        phone: data.customer.phone,
        role: "customer" as UserRole,
        status: "active" as UserStatus,
        profile_image_url: data.customer.profile_image_url,
        created_at: data.customer.created_at,
        updated_at: data.customer.created_at,
      });
      setAvailableVehicles(data.vehicles);
      const v = data.vehicles[0];
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
      setStartingJob(false);
    }
  }, [
    data,
    blocker,
    reset,
    setCustomer,
    setAvailableVehicles,
    setDecodedVehicle,
    router,
  ]);

  const handleMessage = useCallback(() => {
    if (!customerId) return;
    startConversation.mutate(
      { customerId },
      {
        onSuccess: (conversation) => {
          router.push(`/message/${conversation.id}` as never);
        },
        onError: (err) => {
          Alert.alert("Could not start chat", extractErrorMessage(err));
        },
      },
    );
  }, [customerId, startConversation, router]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      "Delete customer",
      "This permanently removes the customer record.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteCustomer.mutate(customerId),
        },
      ],
    );
  }, [customerId, deleteCustomer]);

  const history = useMemo(
    () => data?.serviceHistory ?? [],
    [data?.serviceHistory],
  );

  if (!Number.isFinite(customerId) || customerId <= 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Invalid customer</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (isError || !data || !customer) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Could not load customer</Text>
        <Pressable style={styles.retryBtn} onPress={() => refetch()}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: customer.full_name }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerCard}>
          <Text style={styles.name}>{customer.full_name}</Text>
          {customer.phone ? (
            <Text style={styles.meta}>{customer.phone}</Text>
          ) : null}
          {customer.email ? (
            <Text style={styles.meta}>{customer.email}</Text>
          ) : null}
          <View style={styles.statsRow}>
            <Stat label="Visits" value={String(data.stats.totalAppointments)} />
            <Stat
              label="Spent"
              value={`$${data.stats.totalSpent.toFixed(0)}`}
            />
            <Stat
              label="Member"
              value={new Date(data.stats.memberSince).getFullYear().toString()}
            />
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            style={styles.primaryBtn}
            onPress={handleStartJob}
            disabled={startingJob}
          >
            {startingJob ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>{blocker.label}</Text>
            )}
          </Pressable>
          <Pressable
            style={styles.secondaryBtn}
            onPress={handleMessage}
            disabled={startConversation.isPending}
          >
            <MaterialIcons name="chat" size={20} color="#3B82F6" />
            <Text style={styles.secondaryBtnText}>Message</Text>
          </Pressable>
        </View>

        <CollapsibleSection title="Vehicles" defaultExpanded badge={data.vehicles.length}>
          {data.vehicles.length === 0 ? (
            <Text style={styles.empty}>No vehicles on file</Text>
          ) : (
            data.vehicles.map((v) => (
              <View key={v.id} style={styles.listRow}>
                <Text style={styles.listTitle}>
                  {[v.year, v.make, v.model].filter(Boolean).join(" ")}
                </Text>
                <Text style={styles.listSub}>
                  {[v.license_plate, v.vin].filter(Boolean).join(" · ")}
                </Text>
              </View>
            ))
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Addresses" badge={data.addresses.length}>
          {data.addresses.length === 0 ? (
            <Text style={styles.empty}>No addresses on file</Text>
          ) : (
            data.addresses.map((a, i) => (
              <View key={`${a.address_line}-${i}`} style={styles.listRow}>
                <Text style={styles.listTitle}>
                  {a.address_line}
                  {a.is_default ? " (default)" : ""}
                </Text>
                <Text style={styles.listSub}>
                  {[a.city, a.state, a.zip].filter(Boolean).join(", ")}
                </Text>
              </View>
            ))
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Service history" badge={history.length}>
          {history.length === 0 ? (
            <Text style={styles.empty}>No completed visits yet</Text>
          ) : (
            history.map((item) => (
              <HistoryRow
                key={item.id}
                item={item}
                onPress={() =>
                  router.push(
                    `/job/${item.id}/invoice?mode=receipt` as never,
                  )
                }
              />
            ))
          )}
        </CollapsibleSection>

        <Pressable style={styles.deleteBtn} onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete customer</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function HistoryRow({
  item,
  onPress,
}: {
  item: CustomerServiceHistoryEntry;
  onPress: () => void;
}) {
  const services = item.services ?? [];
  const vehicle = [item.year, item.make, item.model].filter(Boolean).join(" ");
  const when = item.completed_at ?? item.scheduled_date;

  return (
    <Pressable style={styles.historyRow} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={styles.listTitle}>
          {when ? new Date(when).toLocaleDateString() : "Visit"}
        </Text>
        {vehicle ? <Text style={styles.listSub}>{vehicle}</Text> : null}
        {services.length > 0 ? (
          <Text style={styles.listSub} numberOfLines={2}>
            {services.join(", ")}
          </Text>
        ) : null}
      </View>
      <MaterialIcons name="chevron-right" size={22} color="#9CA3AF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: { fontSize: 16, color: "#6B7280" },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#3B82F6",
    borderRadius: 8,
  },
  retryText: { color: "#fff", fontWeight: "600" },
  headerCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  name: { fontSize: 22, fontWeight: "700", color: "#111827" },
  meta: { fontSize: 15, color: "#4B5563", marginTop: 4 },
  statsRow: { flexDirection: "row", marginTop: 16, gap: 8 },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 18, fontWeight: "700", color: "#111827" },
  statLabel: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  actionRow: { flexDirection: "row", gap: 10 },
  primaryBtn: {
    flex: 1,
    backgroundColor: "#3B82F6",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    minHeight: 48,
    justifyContent: "center",
  },
  secondaryBtnText: { color: "#3B82F6", fontWeight: "600" },
  listRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  listTitle: { fontSize: 15, fontWeight: "600", color: "#111827" },
  listSub: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  empty: { fontSize: 14, color: "#9CA3AF", paddingVertical: 8 },
  deleteBtn: { alignItems: "center", paddingVertical: 16 },
  deleteText: { color: "#EF4444", fontWeight: "600" },
});
