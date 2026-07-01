import { forwardRef, useCallback, useMemo, useState } from "react";
import { StyleSheet, View, Text } from "react-native";
import { TouchableOpacity } from "react-native-gesture-handler";
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { AppSheet, type AppSheetRef } from "@technician/components/sheets";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useGenerateAppointment } from "@technician/hooks/schedule/use-generate-appointment";
import { useCreateAppointment } from "@technician/hooks/schedule/use-calendar";
import { useCustomerSearch, useRecentCustomers } from "@technician/hooks/schedule/use-calendar-customers";
import { useDebouncedValue } from "@technician/hooks/utility/use-debounced-value";
import { useCalendarServices } from "@technician/hooks/schedule/use-calendar-services";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type { CustomerSearchResult, ScoredSlot } from "@technician/types/calendar";
import {
  clearSheetDraft,
  useSheetDraftRead,
  useSheetDraftWrite,
} from "@technician/hooks/calendar/use-sheet-draft-cache";

interface GenerateAppointmentSheetProps {
  onClose: () => void;
  /**
   * P3-FE-6 — opaque cache key for the in-flight Find-Slots form.
   * The Generate sheet is conceptually a singleton — there is no
   * per-entity ID — so the parent typically passes the literal
   * string `"generate"` so the cache survives across reopens of
   * the same singleton instance. Pass `undefined` to disable
   * caching.
   *
   * The cached snapshot intentionally does NOT include `suggestions`
   * — the slot list is derived from the live `generateMutation`
   * result, not from typing, and re-issuing the request on reopen
   * is the correct behavior (slot availability moves with time).
   *
   * See `docs/DEVELOPMENT-LOG.md#deferred-chunk-p3-fe-6`.
   */
  cacheKey?: string;
}

export const GenerateAppointmentSheet = forwardRef<AppSheetRef, GenerateAppointmentSheetProps>(
  function GenerateAppointmentSheet({ onClose, cacheKey }, ref) {
    const snapPoints = useMemo(() => ["85%"], []);
    const generateMutation = useGenerateAppointment();
    const createMutation = useCreateAppointment();
    const servicesQuery = useCalendarServices();
    const recentQuery = useRecentCustomers();

    // P3-FE-6 — cached snapshot omits `suggestions` on purpose; see
    // the JSDoc on `cacheKey` above for the rationale.
    interface GenerateCachedDraft {
      searchQuery: string;
      selectedCustomer: CustomerSearchResult | null;
      selectedServices: number[];
      dateStart: string;
      dateEnd: string;
    }
    const cachedDraft = useSheetDraftRead<GenerateCachedDraft>({
      cacheKey,
      sheetKind: "generate",
    });

    const [searchQuery, setSearchQuery] = useState(cachedDraft?.searchQuery ?? "");
    // 2026-05-25 — debounce keystrokes so we hit the search endpoint
    // at most every 250ms. See `use-debounced-value.ts` docblock.
    const debouncedSearchQuery = useDebouncedValue(searchQuery, 250);
    const searchResult = useCustomerSearch(debouncedSearchQuery);
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(
      cachedDraft?.selectedCustomer ?? null,
    );
    const [selectedServices, setSelectedServices] = useState<number[]>(
      cachedDraft?.selectedServices ?? [],
    );
    const [dateStart, setDateStart] = useState(
      cachedDraft?.dateStart ?? new Date().toISOString().split("T")[0],
    );
    const [dateEnd, setDateEnd] = useState(cachedDraft?.dateEnd ?? "");
    // Suggestions are NOT cached — re-running `useGenerateAppointment`
    // on reopen yields fresh slot availability. The user's typed
    // criteria above is what carries forward.
    const [suggestions, setSuggestions] = useState<ScoredSlot[]>([]);

    const draftSnapshot = useMemo<GenerateCachedDraft>(
      () => ({ searchQuery, selectedCustomer, selectedServices, dateStart, dateEnd }),
      [searchQuery, selectedCustomer, selectedServices, dateStart, dateEnd],
    );
    useSheetDraftWrite<GenerateCachedDraft>({
      cacheKey,
      sheetKind: "generate",
      values: draftSnapshot,
    });

    const closeAndClearCache = useCallback(() => {
      clearSheetDraft(cacheKey, "generate");
      onClose();
    }, [cacheKey, onClose]);

    const services = servicesQuery.data ?? [];
    const customers = searchQuery.length >= 1 ? (searchResult.data ?? []) : (recentQuery.data ?? []);

    const handleGenerate = () => {
      if (!selectedCustomer || selectedServices.length === 0) return;
      haptic.medium();
      generateMutation.mutate(
        {
          customer_id: selectedCustomer.id,
          service_ids: selectedServices,
          preferred_date_start: dateStart,
          preferred_date_end: dateEnd || dateStart,
          location_type: "shop",
        },
        {
          onSuccess: (data) => {
            setSuggestions(data.suggestions ?? []);
          },
        }
      );
    };

    const handleBook = (slot: ScoredSlot) => {
      if (!selectedCustomer) return;
      haptic.heavy();
      createMutation.mutate(
        {
          customer_id: selectedCustomer.id,
          service_ids: selectedServices,
          technician_id: slot.technician_id,
          start_time: slot.start_time,
          end_time: slot.end_time,
          location_type: "shop",
          slot_type: "standard",
        },
        { onSuccess: closeAndClearCache }
      );
    };

    return (
      <AppSheet defaultSide="right" ref={ref} index={-1} defaultSnapPoints={snapPoints} enablePanDownToClose onClose={onClose}>
        <BottomSheetScrollView contentContainerStyle={styles.content}>
          <View style={styles.headerRow}>
            <MaterialIcons name="auto-fix-high" size={22} color="#8B5CF6" />
            <Text style={styles.title}>AI Scheduling</Text>
          </View>

          {suggestions.length === 0 ? (
            <>
              <Text style={styles.label}>Customer</Text>
              {selectedCustomer ? (
                <View style={styles.selected}>
                  <Text style={styles.selectedText}>{selectedCustomer.first_name} {selectedCustomer.last_name}</Text>
                  <TouchableOpacity onPress={() => setSelectedCustomer(null)}>
                    <MaterialIcons name="close" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <BottomSheetTextInput style={styles.input} value={searchQuery} onChangeText={setSearchQuery} placeholder="Search customers..." placeholderTextColor="#9CA3AF" />
                  {customers.slice(0, 4).map((c) => (
                    <TouchableOpacity key={c.id} style={styles.custRow} onPress={() => { setSelectedCustomer(c); setSearchQuery(""); }}>
                      <Text style={styles.custName}>{c.first_name} {c.last_name}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              <Text style={styles.label}>Services</Text>
              {services.slice(0, 10).map((s) => {
                const active = selectedServices.includes(s.id);
                return (
                  <TouchableOpacity key={s.id} style={[styles.svcRow, active && styles.svcActive]} onPress={() => setSelectedServices((prev) => prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id])}>
                    <MaterialIcons name={active ? "check-box" : "check-box-outline-blank"} size={18} color={active ? "#8B5CF6" : "#D1D5DB"} />
                    <Text style={styles.svcName}>{s.name}</Text>
                  </TouchableOpacity>
                );
              })}

              <View style={styles.dateRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>From</Text>
                  <BottomSheetTextInput style={styles.input} value={dateStart} onChangeText={setDateStart} placeholder="YYYY-MM-DD" placeholderTextColor="#9CA3AF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>To</Text>
                  <BottomSheetTextInput style={styles.input} value={dateEnd} onChangeText={setDateEnd} placeholder="YYYY-MM-DD" placeholderTextColor="#9CA3AF" />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.generateBtn, (!selectedCustomer || selectedServices.length === 0 || generateMutation.isPending) && { opacity: 0.5 }]}
                onPress={handleGenerate}
                disabled={!selectedCustomer || selectedServices.length === 0 || generateMutation.isPending}
              >
                <MaterialIcons name="auto-fix-high" size={18} color="#fff" />
                <Text style={styles.generateText}>{generateMutation.isPending ? "Finding slots..." : "Find Best Slots"}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.resultsTitle}>{suggestions.length} suggestion{suggestions.length > 1 ? "s" : ""}</Text>
              {suggestions.map((slot, idx) => (
                <View key={`${slot.technician_id}-${slot.start_time}`} style={[styles.slotCard, idx === 0 && styles.bestSlot]}>
                  {idx === 0 && <View style={styles.bestBadge}><Text style={styles.bestText}>Best Fit</Text></View>}
                  <Text style={styles.slotTech}>{slot.technician_name}</Text>
                  <Text style={styles.slotTime}>{slot.date} at {new Date(slot.start_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</Text>
                  <Text style={styles.slotExpl}>{slot.explanation}</Text>
                  <TouchableOpacity style={styles.bookBtn} onPress={() => handleBook(slot)}>
                    <Text style={styles.bookText}>Book This Slot</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.backBtn} onPress={() => setSuggestions([])}>
                <Text style={styles.backText}>Search Again</Text>
              </TouchableOpacity>
            </>
          )}
        </BottomSheetScrollView>
      </AppSheet>
    );
  }
);

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: "700", color: "#111827" },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, padding: 12, fontSize: 14, color: "#374151", marginBottom: 4 },
  selected: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, backgroundColor: "#F5F3FF", borderRadius: 10, borderWidth: 1, borderColor: "#DDD6FE", marginBottom: 8 },
  selectedText: { fontSize: 15, fontWeight: "600", color: "#5B21B6" },
  custRow: { padding: 10, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  custName: { fontSize: 14, fontWeight: "500", color: "#111827" },
  svcRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8, borderRadius: 8, marginBottom: 2 },
  svcActive: { backgroundColor: "#F5F3FF" },
  svcName: { fontSize: 14, color: "#374151" },
  dateRow: { flexDirection: "row", gap: 12, marginTop: 4 },
  generateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#8B5CF6", paddingVertical: 14, borderRadius: 10, marginTop: 16 },
  generateText: { fontSize: 16, fontWeight: "600", color: "#fff" },
  resultsTitle: { fontSize: 14, color: "#6B7280", marginBottom: 12 },
  slotCard: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 14, marginBottom: 10 },
  bestSlot: { borderColor: "#8B5CF6", backgroundColor: "#F5F3FF" },
  bestBadge: { alignSelf: "flex-start", backgroundColor: "#8B5CF6", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginBottom: 8 },
  bestText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  slotTech: { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 4 },
  slotTime: { fontSize: 14, color: "#374151", marginBottom: 4 },
  slotExpl: { fontSize: 13, color: "#6B7280", fontStyle: "italic", lineHeight: 18, marginBottom: 10 },
  bookBtn: { backgroundColor: "#8B5CF6", paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  bookText: { fontSize: 14, fontWeight: "600", color: "#fff" },
  backBtn: { alignItems: "center", paddingVertical: 12 },
  backText: { fontSize: 14, fontWeight: "600", color: "#8B5CF6" },
});
