import { forwardRef, useMemo, useState } from "react";
import { StyleSheet, View, Text, Alert } from "react-native";
import { TouchableOpacity } from "react-native-gesture-handler";
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { AppSheet, type AppSheetRef } from "@technician/components/sheets";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useFlexList, useAddFlexListEntry, useOfferFlexListSlot } from "@technician/hooks/schedule/use-flex-list";
import { useCustomerSearch } from "@technician/hooks/schedule/use-calendar-customers";
import { useDebouncedValue } from "@technician/hooks/utility/use-debounced-value";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type { CustomerSearchResult } from "@technician/types/calendar";

interface FlexListSheetProps {
  onClose: () => void;
}

export const FlexListSheet = forwardRef<AppSheetRef, FlexListSheetProps>(
  function FlexListSheet({ onClose }, ref) {
    const snapPoints = useMemo(() => ["70%"], []);
    const flexQuery = useFlexList("waiting");
    const addMutation = useAddFlexListEntry();
    const offerMutation = useOfferFlexListSlot();

    const [showAdd, setShowAdd] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    // 2026-05-25 — debounce, see `use-debounced-value.ts` docblock.
    const debouncedSearchQuery = useDebouncedValue(searchQuery, 250);
    const searchResult = useCustomerSearch(debouncedSearchQuery);
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null);
    const [notes, setNotes] = useState("");

    const entries = flexQuery.data ?? [];
    const customers = searchResult.data ?? [];

    const handleAdd = () => {
      if (!selectedCustomer) return;
      haptic.medium();
      addMutation.mutate(
        { customer_id: selectedCustomer.id, notes: notes || undefined },
        {
          onSuccess: () => {
            setShowAdd(false);
            setSelectedCustomer(null);
            setNotes("");
            setSearchQuery("");
          },
        }
      );
    };

    const handleOffer = (id: string, name: string) => {
      Alert.alert("Offer Slot", `Offer the available slot to ${name}?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Offer",
          onPress: () => {
            haptic.medium();
            offerMutation.mutate({ id });
          },
        },
      ]);
    };

    return (
      <AppSheet defaultSide="right" ref={ref} index={-1} defaultSnapPoints={snapPoints} enablePanDownToClose onClose={onClose}>
        <BottomSheetScrollView contentContainerStyle={styles.content}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Flex List</Text>
            <TouchableOpacity style={styles.addToggle} onPress={() => setShowAdd(!showAdd)}>
              <MaterialIcons name={showAdd ? "close" : "add"} size={20} color="#3B82F6" />
            </TouchableOpacity>
          </View>

          {showAdd && (
            <View style={styles.addForm}>
              {selectedCustomer ? (
                <View style={styles.selected}>
                  <Text style={styles.selectedText}>{selectedCustomer.first_name} {selectedCustomer.last_name}</Text>
                  <TouchableOpacity onPress={() => setSelectedCustomer(null)}>
                    <MaterialIcons name="close" size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <BottomSheetTextInput style={styles.input} value={searchQuery} onChangeText={setSearchQuery} placeholder="Search customer..." placeholderTextColor="#9CA3AF" />
                  {customers.slice(0, 3).map((c) => (
                    <TouchableOpacity key={c.id} style={styles.custRow} onPress={() => { setSelectedCustomer(c); setSearchQuery(""); }}>
                      <Text style={styles.custName}>{c.first_name} {c.last_name}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}
              <BottomSheetTextInput style={styles.input} value={notes} onChangeText={setNotes} placeholder="Notes (optional)" placeholderTextColor="#9CA3AF" />
              <TouchableOpacity style={[styles.addBtn, !selectedCustomer && { opacity: 0.5 }]} onPress={handleAdd} disabled={!selectedCustomer}>
                <Text style={styles.addBtnText}>Add to Flex List</Text>
              </TouchableOpacity>
            </View>
          )}

          {entries.length === 0 ? (
            <View style={styles.empty}>
              <MaterialIcons name="event-available" size={40} color="#D1D5DB" />
              <Text style={styles.emptyText}>No one waiting</Text>
              <Text style={styles.emptySubtext}>Add customers who want the next available slot</Text>
            </View>
          ) : (
            entries.map((entry) => (
              <View key={entry.id} style={styles.entryCard}>
                <View style={styles.entryInfo}>
                  <Text style={styles.entryName}>{entry.customer_name ?? `Customer #${entry.customer_id}`}</Text>
                  {entry.customer_phone && <Text style={styles.entryPhone}>{entry.customer_phone}</Text>}
                  {entry.preferred_time_window && <Text style={styles.entryPref}>Prefers: {entry.preferred_time_window}</Text>}
                  {entry.notes && <Text style={styles.entryNotes}>{entry.notes}</Text>}
                </View>
                <TouchableOpacity style={styles.offerBtn} onPress={() => handleOffer(entry.id, entry.customer_name ?? "customer")}>
                  <Text style={styles.offerText}>Offer</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </BottomSheetScrollView>
      </AppSheet>
    );
  }
);

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  title: { fontSize: 20, fontWeight: "700", color: "#111827" },
  addToggle: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" },
  addForm: { backgroundColor: "#F9FAFB", padding: 14, borderRadius: 12, marginBottom: 16 },
  input: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, padding: 10, fontSize: 14, color: "#374151", marginBottom: 8 },
  custRow: { padding: 8, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  custName: { fontSize: 14, color: "#111827" },
  selected: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 10, backgroundColor: "#EFF6FF", borderRadius: 8, marginBottom: 8 },
  selectedText: { fontSize: 14, fontWeight: "600", color: "#1D4ED8" },
  addBtn: { backgroundColor: "#3B82F6", paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  addBtnText: { fontSize: 14, fontWeight: "600", color: "#fff" },
  empty: { alignItems: "center", paddingTop: 40, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: "600", color: "#9CA3AF" },
  emptySubtext: { fontSize: 13, color: "#D1D5DB", textAlign: "center" },
  entryCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 8, backgroundColor: "#fff" },
  entryInfo: { flex: 1 },
  entryName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  entryPhone: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  entryPref: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  entryNotes: { fontSize: 12, color: "#9CA3AF", fontStyle: "italic", marginTop: 2 },
  offerBtn: { backgroundColor: "#22C55E", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  offerText: { fontSize: 13, fontWeight: "600", color: "#fff" },
});
