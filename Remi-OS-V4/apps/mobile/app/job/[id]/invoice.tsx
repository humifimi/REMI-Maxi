import { useCallback, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useInvoice } from "@technician/hooks/orders/use-invoice";
import { useSubstituteLineItem } from "@technician/hooks/orders/use-substitute-line-item";
import { useExportPdf } from "@technician/hooks/orders/use-order-export";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { useFlowBack } from "@technician/hooks/jobs/use-flow-back";
import { summarizeReceiptExportErrors } from "@technician/utils/summarize-receipt-export-errors";
import { SkeletonOrderDetail } from "@/src/components/shared/skeleton";
import type { AppointmentLineItem, InvoicePackage } from "@technician/types/api";

const TYPE_LABELS: Record<string, string> = {
  part: "Part",
  fluid: "Fluid",
  labor: "Labor",
  fee: "Fee",
  discount: "Discount",
};

const SUBSTITUTABLE_TYPES = new Set(["part", "fluid"]);

/**
 * Phase 6 Chunk 6.1.1 (promptless follow-up to Chunk 6.1) — Invoice
 * Review screen mirrors the Droptop-style receipt PDF's layout. Reads
 * the new fields on `Invoice` (`customer`, `customerAddress`, `vehicle`,
 * `packages`, `amountDue`) when the BE returns them, falling back
 * gracefully to a flat line-items render if the legacy 5-field shape
 * comes back. Substitute-modal flow is preserved unchanged.
 */
function formatOdometer(mileage: number | null | undefined): string {
  if (mileage === null || mileage === undefined) return "";
  return `${mileage.toLocaleString("en-US")} M`;
}

function buildVehicleLine(
  year: number | null | undefined,
  make: string | null | undefined,
  model: string | null | undefined,
): string | null {
  const parts: string[] = [];
  if (year) parts.push(String(year));
  if (make) parts.push(make);
  if (model) parts.push(model);
  return parts.length > 0 ? parts.join(" ") : null;
}

export default function InvoiceScreen() {
  // 2026-05-24 — `mode` query param distinguishes the live job-flow
  // "Invoice Review" (default — pre-payment, includes substitute
  // editing + "Proceed to Payment" CTA) from a read-only "Receipt"
  // view used when tapping a Service History entry from the customer
  // profile screen. In `mode=receipt`:
  //   - Title → "Receipt"
  //   - Substitute affordances hidden (no editing of historical line
  //     items)
  //   - Bottom CTA swaps Pay → "Share PDF" (calls `useExportPdf` with
  //     `[jobId]`, opens iOS share sheet with the Droptop-style
  //     batch PDF carrying just this one receipt)
  const { id, mode } = useLocalSearchParams<{
    id: string;
    mode?: string;
  }>();
  const jobId = parseInt(id, 10);
  const isReceiptMode = mode === "receipt";
  const router = useRouter();
  const onBack = useFlowBack("invoice", id);
  const { data: invoice, isLoading } = useInvoice(jobId);
  const substituteMutation = useSubstituteLineItem(jobId);
  const exportPdf = useExportPdf();

  const handleSharePdf = useCallback(() => {
    if (!Number.isFinite(jobId)) return;
    exportPdf.mutate([jobId], {
      onError: (e) => {
        const { title, body } = summarizeReceiptExportErrors(e);
        haptic.error();
        Alert.alert(title, body);
      },
    });
  }, [exportPdf, jobId]);

  const [substitutingItem, setSubstitutingItem] =
    useState<AppointmentLineItem | null>(null);
  const [actualSku, setActualSku] = useState("");
  const [reason, setReason] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  function openSheet(item: AppointmentLineItem) {
    setSubstitutingItem(item);
    setActualSku("");
    setReason("");
    setSubmitError(null);
  }

  function closeSheet() {
    setSubstitutingItem(null);
    setActualSku("");
    setReason("");
    setSubmitError(null);
  }

  async function handleSave() {
    if (!substitutingItem) return;
    const trimmedSku = actualSku.trim();
    if (trimmedSku.length === 0) {
      setSubmitError("Actual SKU is required");
      return;
    }
    try {
      await substituteMutation.mutateAsync({
        lineItemId: substitutingItem.id,
        actual_part_number: trimmedSku,
        reason: reason.trim().length > 0 ? reason.trim() : undefined,
      });
      closeSheet();
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : "Failed to save substitution"
      );
    }
  }

  if (isLoading) {
    return <SkeletonOrderDetail />;
  }

  if (!invoice) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Invoice not available</Text>
      </View>
    );
  }

  // Phase 6 Chunk 6.1.1 — packages-aware render. When the BE returns
  // the new `packages` field, render package-grouped sections (matching
  // Droptop receipt PDF). Fallback to a single synthetic package
  // wrapping `lineItems` when the legacy shape comes back so the screen
  // stays functional on stale BE deploys.
  const packages: InvoicePackage[] =
    invoice.packages && invoice.packages.length > 0
      ? invoice.packages
      : [
          {
            name: "Servicing and Parts",
            description: null,
            line_items: invoice.lineItems,
            package_total: Number(invoice.subtotal),
          },
        ];

  const customer = invoice.customer;
  const address = invoice.customerAddress;
  const vehicle = invoice.vehicle;
  const vehicleLine = buildVehicleLine(
    vehicle?.year ?? invoice.appointment.vehicle_year,
    vehicle?.make ?? invoice.appointment.vehicle_make,
    vehicle?.model ?? invoice.appointment.vehicle_model,
  );
  const amountDue = invoice.amountDue ?? Number(invoice.total);

  // 2026-05-24 — In receipt mode the header must DETACH from the job
  // stack chrome (`app/job/_layout.tsx`):
  //   - `headerLeft`: do NOT use `useFlowBack("invoice", ...)` (it walks
  //     the canonical step list and `router.replace`s to /job/[id]/fluids
  //     — the previous step in the linear flow (timer is skipped). Also
  //     do NOT use plain `router.back()`: the /job/_layout Stack can still
  //     hold prior /job/[id]/* entries (including the timer screen when
  //     the user reached the receipt via a resume path while a job was
  //     still in_progress for the same appointment), so `router.back()`
  //     pops INTO the live timer instead of returning to the customer
  //     profile. Instead, dismiss the entire /job/[id] stack and replace
  //     surface that ever links into receipt mode (see
  //     `app/customers/[id].tsx` Service History tap handler). When the
  //     invoice payload doesn't carry a customer (legacy/failure path)
  //     fall back to the orders tab so the user is never trapped.
  //   - `headerRight`: render an empty <View /> to fully replace the
  //     layout's default <CancelJobButton /> (red X). `() => null`
  //     occasionally fails to override a parent's headerRight on hot
  //     reload; an explicit View element is unambiguous. A receipt is
  //     historical — "Cancel Job" makes no sense and would mutate the
  //     job-flow store for an appointment the user isn't actively
  //     running.
  // Live job-flow mode (default) keeps the original behavior.
  const receiptCustomerId =
    invoice.customer?.id ?? invoice.appointment.customer_id;
  const handleHeaderBack = () => {
    if (isReceiptMode) {
      router.dismissAll();
      router.replace(`/customers/${receiptCustomerId}` as never);
      return;
    }
    onBack();
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: isReceiptMode ? "Receipt" : "Invoice",
          headerLeft: () => (
            <Pressable onPress={handleHeaderBack} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
          ...(isReceiptMode ? { headerRight: () => <View /> } : {}),
        }}
      />
      <ScrollView style={styles.container}>
        <Text style={styles.heading}>
          {isReceiptMode ? "Receipt" : "Invoice Review"}
        </Text>

        {/* Customer card — name, phone, email, address block. */}
        {customer || address ? (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Customer</Text>
            {customer?.full_name ? (
              <Text style={styles.cardLine}>{customer.full_name}</Text>
            ) : null}
            {customer?.phone ? (
              <Text style={styles.cardLineSub}>{customer.phone}</Text>
            ) : null}
            {customer?.email ? (
              <Text style={styles.cardLineSub}>{customer.email}</Text>
            ) : null}
            {address?.address_line ? (
              <Text style={styles.cardLineSub}>{address.address_line}</Text>
            ) : null}
            {address?.city && address?.state ? (
              <Text style={styles.cardLineSub}>
                {`${address.city}, ${address.state}`}
              </Text>
            ) : null}
            {address?.country ? (
              <Text style={styles.cardLineSub}>{address.country}</Text>
            ) : null}
            {address?.zip ? (
              <Text style={styles.cardLineSub}>{address.zip}</Text>
            ) : null}
          </View>
        ) : null}

        {/* Vehicle card — year/make/model + Engine + Plate(state) + VIN + Odometer. */}
        {vehicle || vehicleLine ? (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Vehicle</Text>
            {vehicleLine ? (
              <Text style={styles.cardLine}>{vehicleLine}</Text>
            ) : null}
            {vehicle?.engine ? (
              <Text style={styles.cardLineSub}>
                {`Engine: ${vehicle.engine}`}
              </Text>
            ) : null}
            {vehicle?.license_plate ? (
              <Text style={styles.cardLineSub}>
                {vehicle.license_plate_state
                  ? `Plate: ${vehicle.license_plate} (${vehicle.license_plate_state})`
                  : `Plate: ${vehicle.license_plate}`}
              </Text>
            ) : null}
            {vehicle?.vin ? (
              <Text style={styles.cardLineSub}>{`VIN: ${vehicle.vin}`}</Text>
            ) : null}
            {(vehicle?.mileage ?? invoice.appointment.mileage) ? (
              <Text style={styles.cardLineSub}>
                {`Odometer: ${formatOdometer(
                  vehicle?.mileage ?? invoice.appointment.mileage,
                )}`}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Servicing and Parts — packages with description blurb + line items. */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Servicing and Parts</Text>
          {packages.map((pkg, pkgIdx) => (
            <View
              key={`pkg-${pkgIdx}-${pkg.name}`}
              style={pkgIdx > 0 ? styles.packageBlockSpaced : styles.packageBlock}
            >
              <Text style={styles.packageHeading}>{pkg.name}</Text>
              {pkg.description ? (
                <Text style={styles.packageBlurb}>{pkg.description}</Text>
              ) : null}
              {pkg.line_items.map((item) => {
                const canSubstitute =
                  !isReceiptMode && SUBSTITUTABLE_TYPES.has(item.type);
                const wasSubstituted =
                  item.substituted_for_part_number !== null &&
                  item.substituted_for_part_number !== undefined;
                return (
                  <View key={item.id} style={styles.lineItem}>
                    <View style={styles.lineInfo}>
                      <Text style={styles.lineDesc}>{item.description}</Text>
                      <Text style={styles.lineType}>
                        {TYPE_LABELS[item.type] ?? item.type}
                        {item.part_number ? ` · ${item.part_number}` : ""}
                      </Text>
                      {wasSubstituted ? (
                        <Text style={styles.substitutedNote}>
                          Substituted from {item.substituted_for_part_number}
                        </Text>
                      ) : null}
                      {canSubstitute ? (
                        <Pressable
                          onPress={() => openSheet(item)}
                          hitSlop={6}
                          accessibilityLabel={`Substitute ${item.description}`}
                          testID={`substitute-btn-${item.id}`}
                        >
                          <Text style={styles.substituteLink}>
                            {wasSubstituted ? "Re-substitute" : "Substitute"}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <View style={styles.lineNumbers}>
                      <Text style={styles.lineQty}>×{item.quantity}</Text>
                      <Text
                        style={[
                          styles.lineTotal,
                          item.type === "discount" && styles.discount,
                        ]}
                      >
                        {item.type === "discount" ? "-" : ""}$
                        {Number(item.total_price).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                );
              })}
              {pkg.line_items.length > 0 ? (
                <View style={styles.packageTotalRow}>
                  <Text style={styles.packageTotalText}>
                    Package Total: ${Number(pkg.package_total).toFixed(2)}
                  </Text>
                </View>
              ) : null}
            </View>
          ))}

          {invoice.lineItems.length === 0 ? (
            <Text style={styles.emptyText}>No line items</Text>
          ) : null}
        </View>

        {/* Totals block — Subtotal / Tax / Total / Amount Due. */}
        <View style={styles.totalsCard}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>
              ${Number(invoice.subtotal).toFixed(2)}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tax</Text>
            <Text style={styles.totalValue}>
              ${Number(invoice.tax).toFixed(2)}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>
              ${Number(invoice.total).toFixed(2)}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Amount Due</Text>
            <Text
              style={[
                styles.totalValue,
                amountDue > 0 && styles.amountDueOutstanding,
              ]}
            >
              ${Number(amountDue).toFixed(2)}
            </Text>
          </View>
        </View>

        {isReceiptMode ? (
          <Pressable
            style={[styles.payBtn, exportPdf.isPending && styles.payBtnDisabled]}
            onPress={handleSharePdf}
            disabled={exportPdf.isPending}
            accessibilityLabel="Share receipt PDF"
            testID="share-receipt-pdf-btn"
          >
            <Text style={styles.payBtnText}>
              {exportPdf.isPending ? "Preparing PDF…" : "Share PDF"}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.payBtn}
            onPress={() => router.replace(`/job/${id}/complete` as never)}
          >
            <Text style={styles.payBtnText}>Finish Job</Text>
          </Pressable>
        )}
      </ScrollView>

      <Modal
        visible={substitutingItem !== null}
        animationType="slide"
        transparent
        onRequestClose={closeSheet}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalRoot}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeSheet} />
          <View style={styles.sheet} testID="substitute-sheet">
            <Text style={styles.sheetTitle}>Substitute SKU</Text>
            {substitutingItem ? (
              <>
                <Text style={styles.sheetLabel}>Booked</Text>
                <Text style={styles.sheetReadonly}>
                  {substitutingItem.description}
                </Text>
                <Text style={styles.sheetReadonlySub}>
                  {substitutingItem.part_number ?? "(no SKU)"}
                </Text>
                <Text style={styles.sheetLabel}>Actual SKU *</Text>
                <TextInput
                  style={styles.input}
                  value={actualSku}
                  onChangeText={setActualSku}
                  placeholder="e.g. MOBIL-M1-104"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={100}
                  testID="substitute-sku-input"
                />
                <Text style={styles.sheetLabel}>Reason (optional)</Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline]}
                  value={reason}
                  onChangeText={setReason}
                  placeholder="e.g. FRAM out of stock at van"
                  multiline
                  maxLength={500}
                  testID="substitute-reason-input"
                />
                {submitError ? (
                  <Text style={styles.errorText}>{submitError}</Text>
                ) : null}
                <View style={styles.btnRow}>
                  <Pressable
                    style={[styles.btn, styles.btnCancel]}
                    onPress={closeSheet}
                    disabled={substituteMutation.isPending}
                  >
                    <Text style={styles.btnCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.btn, styles.btnSave]}
                    onPress={handleSave}
                    disabled={substituteMutation.isPending}
                    testID="substitute-save-btn"
                  >
                    <Text style={styles.btnSaveText}>
                      {substituteMutation.isPending ? "Saving…" : "Save"}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 16 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
  heading: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 16,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 4,
  },
  sectionLabel: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  cardLine: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 2,
  },
  cardLineSub: {
    fontSize: 13,
    color: "#374151",
    marginBottom: 1,
  },
  // Phase 6 Chunk 6.1.1 — package-grouped sections inside the
  // Servicing and Parts card.
  packageBlock: { gap: 6 },
  packageBlockSpaced: {
    gap: 6,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  packageHeading: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  packageBlurb: {
    fontSize: 12,
    fontStyle: "italic",
    color: "#6B7280",
    marginBottom: 4,
  },
  packageTotalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: 6,
    marginTop: 4,
  },
  packageTotalText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  lineItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
  },
  lineInfo: { flex: 1, marginRight: 12 },
  lineDesc: { fontSize: 14, fontWeight: "600", color: "#111827" },
  lineType: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  substitutedNote: {
    fontSize: 11,
    color: "#6B7280",
    fontStyle: "italic",
    marginTop: 2,
  },
  substituteLink: {
    fontSize: 12,
    color: "#3B82F6",
    fontWeight: "600",
    marginTop: 4,
  },
  lineNumbers: { alignItems: "flex-end" },
  lineQty: { fontSize: 11, color: "#9CA3AF" },
  lineTotal: { fontSize: 14, fontWeight: "700", color: "#111827" },
  discount: { color: "#EF4444" },
  emptyText: {
    textAlign: "center",
    color: "#9CA3AF",
    fontSize: 14,
    padding: 20,
  },
  totalsCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 8,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  totalLabel: { fontSize: 15, color: "#6B7280" },
  totalValue: { fontSize: 15, color: "#111827", fontWeight: "500" },
  // Phase 6 Chunk 6.1.1 — outstanding-balance accent for `Amount Due`
  // when the BE returns a non-zero balance (status != 'paid').
  amountDueOutstanding: { color: "#DC2626", fontWeight: "700" },
  divider: { height: 1, backgroundColor: "#E5E7EB", marginVertical: 4 },
  grandTotalLabel: { fontSize: 18, fontWeight: "700", color: "#111827" },
  grandTotalValue: { fontSize: 18, fontWeight: "800", color: "#111827" },
  payBtn: {
    backgroundColor: "#3B82F6",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 40,
  },
  payBtnDisabled: { backgroundColor: "#93C5FD" },
  payBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    backgroundColor: "#fff",
    padding: 20,
    paddingBottom: 36,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 8,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
  },
  sheetLabel: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
    marginTop: 8,
  },
  sheetReadonly: { fontSize: 15, color: "#111827", fontWeight: "500" },
  sheetReadonlySub: { fontSize: 13, color: "#6B7280" },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#fff",
  },
  inputMultiline: { minHeight: 70, textAlignVertical: "top" },
  errorText: { color: "#EF4444", fontSize: 13, marginTop: 4 },
  btnRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnCancel: { backgroundColor: "#F3F4F6" },
  btnCancelText: { color: "#374151", fontWeight: "700", fontSize: 15 },
  btnSave: { backgroundColor: "#3B82F6" },
  btnSaveText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
