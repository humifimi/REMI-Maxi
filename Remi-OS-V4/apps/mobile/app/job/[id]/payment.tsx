import { useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useStripe } from "@stripe/stripe-react-native";
import {
  useCollectPayment,
  useConfirmPayment,
  useRecordNonCardPayment,
} from "@technician/hooks/orders/use-payment";
import { useInvoice } from "@technician/hooks/orders/use-invoice";
import { useFlowBack } from "@technician/hooks/jobs/use-flow-back";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { useJobFlowStore } from "@technician/stores/job-flow";

// PaymentError shape: a banner with a primary message and an optional
// sub-line for the underlying Stripe / backend message. Lives entirely
// inside this screen's local state — Phase 1 Chunk 1.3 deliberately does
// NOT lift this to a global context; the banner is scoped to a single
// payment attempt and reset on retry / method change.
type PaymentError = { primary: string; detail?: string };

type PaymentMethod = "card" | "cash" | "invoice_later";

const METHODS: { key: PaymentMethod; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { key: "card", label: "Card Payment", icon: "credit-card" },
  { key: "cash", label: "Cash", icon: "payments" },
  { key: "invoice_later", label: "Invoice Later", icon: "schedule" },
];

export default function PaymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobId = parseInt(id, 10);
  const router = useRouter();
  const onBack = useFlowBack("payment", id);
  const { data: invoice } = useInvoice(jobId);
  const collectPayment = useCollectPayment();
  const confirmPayment = useConfirmPayment();
  const recordNonCardPayment = useRecordNonCardPayment();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const setLastPaymentIntentId = useJobFlowStore(
    (s) => s.setLastPaymentIntentId,
  );

  const [selected, setSelectedState] = useState<PaymentMethod>("card");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<PaymentError | null>(null);
  // 800ms debounce window — long enough to swallow a real fat-finger
  // double-tap (PaymentSheet mount itself takes ~300ms), short enough that
  // a deliberate retry after a decline still feels responsive.
  const lastTapRef = useRef<number>(0);

  // Auto-clear any stale banner when the tech changes payment method.
  const setSelected = (next: PaymentMethod) => {
    setSelectedState(next);
    setErrorMessage(null);
  };

  const handleCollect = async () => {
    if (!invoice) return;
    const now = Date.now();
    if (now - lastTapRef.current < 800) return;
    lastTapRef.current = now;

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      if (selected === "card") {
        // Phase 6 Chunk 6.2 — `collectPayment` response is now
        // snake_case (BE normalizes at the controller boundary;
        // matches the rest of the technician routes).
        const { client_secret, payment_intent_id } =
          await collectPayment.mutateAsync({ jobId });

        const initResult = await initPaymentSheet({
          merchantDisplayName: "MAXI",
          paymentIntentClientSecret: client_secret,
          allowsDelayedPaymentMethods: false,
        });
        if (initResult.error) {
          setErrorMessage({
            primary: "Couldn't open card reader. Try again.",
            detail: initResult.error.message,
          });
          return;
        }

        const presentResult = await presentPaymentSheet();
        if (presentResult.error) {
          // Tech swiped the sheet down on purpose — stay silent, leave
          // the screen ready for a retry without any banner noise.
          if (presentResult.error.code === "Canceled") {
            return;
          }
          setErrorMessage({
            primary: "Card declined. Try a different card or method.",
            detail: presentResult.error.message,
          });
          return;
        }

        try {
          await confirmPayment.mutateAsync({
            jobId,
            payment_intent_id,
            amount: invoice.total,
          });
        } catch (err) {
          // Stripe charged but the BE failed to record the row — the
          // orphan-row scenario. Chunk 1.3's BE trx wrapper closes the
          // common case (DB blip between recordPayment and the status
          // update); this copy stays for the residual cases (network
          // drop, BE 5xx, etc.).
          setErrorMessage({
            primary:
              "Charge cleared, but we couldn't record it locally. Tell the office to verify before closing the job.",
            detail: err instanceof Error ? err.message : undefined,
          });
          return;
        }

        setLastPaymentIntentId(payment_intent_id);
      } else {
        // 2026-05-24 — cash + invoice_later. Before this branch existed
        // the screen fell straight through to `router.push("/debrief")`
        // without ever calling the BE; the appointment stayed
        // `status='created'` and no payment row was ever written even
        // though the FO walked through every visible step. The BE
        // service flips status to PAID (cash) or COMPLETED (invoice)
        // and writes a `stripe_payments` row with `payment_intent_id`
        // null and `metadata.method` set. See
        // `jobService.recordNonCardPayment`.
        try {
          await recordNonCardPayment.mutateAsync({
            jobId,
            method: selected,
            amount: invoice.total,
          });
        } catch (err) {
          setErrorMessage({
            primary:
              selected === "cash"
                ? "Couldn't record cash payment. Try again."
                : "Couldn't save invoice-later. Try again.",
            detail: err instanceof Error ? err.message : undefined,
          });
          return;
        }
      }

      haptic.medium();
      router.push(`/job/${id}/debrief` as never);
    } catch (err) {
      // Catch-all for the collectPayment mutation (BE 4xx/5xx before
      // Stripe ever sees the card) and any other unexpected throws. We
      // route it through the same banner so the tech never sees a modal.
      setErrorMessage({
        primary: "Could not process payment. Try again.",
        detail: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const total = invoice?.total ?? 0;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Payment",
          headerLeft: () => (
            <Pressable onPress={onBack} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.container}>
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Amount Due</Text>
          <Text style={styles.totalAmount}>
            ${Number(total).toFixed(2)}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Payment Method</Text>
        {METHODS.map((method) => (
          <Pressable
            key={method.key}
            style={[
              styles.methodCard,
              selected === method.key && styles.methodSelected,
            ]}
            onPress={() => setSelected(method.key)}
          >
            <MaterialIcons
              name={method.icon}
              size={24}
              color={selected === method.key ? "#3B82F6" : "#6B7280"}
            />
            <Text
              style={[
                styles.methodLabel,
                selected === method.key && styles.methodLabelSelected,
              ]}
            >
              {method.label}
            </Text>
            <MaterialIcons
              name={
                selected === method.key
                  ? "radio-button-checked"
                  : "radio-button-unchecked"
              }
              size={22}
              color={selected === method.key ? "#3B82F6" : "#D1D5DB"}
            />
          </Pressable>
        ))}

        {errorMessage && (
          <View style={styles.errorBanner}>
            <View style={styles.errorBannerHeader}>
              <MaterialIcons name="error-outline" size={20} color="#B91C1C" />
              <Text style={styles.errorBannerPrimary}>
                {errorMessage.primary}
              </Text>
            </View>
            {errorMessage.detail ? (
              <Text style={styles.errorBannerDetail}>{errorMessage.detail}</Text>
            ) : null}
            <Pressable
              onPress={() => setErrorMessage(null)}
              hitSlop={8}
              style={styles.errorDismiss}
            >
              <Text style={styles.errorDismissText}>Dismiss</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          style={[styles.collectBtn, isProcessing && styles.disabled]}
          onPress={handleCollect}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <View style={styles.collectInner}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.collectText}>Processing...</Text>
            </View>
          ) : (
            <Text style={styles.collectText}>
              {selected === "invoice_later"
                ? "Save & Invoice Later"
                : `Collect $${Number(total).toFixed(2)}`}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 16 },
  totalCard: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
  },
  totalLabel: { fontSize: 14, color: "#9CA3AF", fontWeight: "500" },
  totalAmount: {
    fontSize: 40,
    fontWeight: "800",
    color: "#fff",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 12,
  },
  methodCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    gap: 14,
  },
  methodSelected: { borderColor: "#3B82F6", backgroundColor: "#EFF6FF" },
  methodLabel: { flex: 1, fontSize: 16, fontWeight: "600", color: "#374151" },
  methodLabelSelected: { color: "#1D4ED8" },
  collectBtn: {
    backgroundColor: "#22C55E",
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 24,
    marginBottom: 40,
  },
  disabled: { opacity: 0.6 },
  collectInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  collectText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  errorBanner: {
    backgroundColor: "#FEF2F2",
    borderColor: "#DC2626",
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    marginTop: 20,
  },
  errorBannerHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  errorBannerPrimary: {
    flex: 1,
    color: "#991B1B",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  errorBannerDetail: {
    color: "#6B7280",
    fontSize: 13,
    marginTop: 6,
    marginLeft: 28,
    lineHeight: 18,
  },
  errorDismiss: {
    alignSelf: "flex-end",
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  errorDismissText: { color: "#B91C1C", fontSize: 13, fontWeight: "700" },
});
