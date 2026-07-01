import { StyleSheet, Text, View } from "react-native";
import type { DataSourceProvider } from "@profit-model/types";

// PM-MIG-19 — Tiny pill that labels where a field's value came from
// (Manual / Plaid / QBO / etc.). Phase 5 will wire real provenance from
// `inputs.provenance?.[fieldPath]?.provider`; today every field defaults
// to "manual" and we render the neutral grey badge.
//
// The component takes the resolved `provider` string directly instead of
// pulling from a context — there is no inputs context on mobile, and
// threading a single string per call site is cheaper than introducing one
// just for this badge.

type Props = {
  provider?: DataSourceProvider;
};

const LABELS: Record<DataSourceProvider, string> = {
  manual: "Manual",
  plaid: "Plaid",
  quickbooks_online: "QBO",
  xero: "Xero",
  stripe: "Stripe",
  square: "Square",
  gusto: "Gusto",
  rippling: "Rippling",
  adp: "ADP",
};

const TONE: Record<
  DataSourceProvider,
  { bg: string; border: string; text: string }
> = {
  manual: { bg: "#F3F4F6", border: "#E5E7EB", text: "#6B7280" },
  plaid: { bg: "#EFF6FF", border: "#DBEAFE", text: "#1D4ED8" },
  quickbooks_online: { bg: "#ECFDF5", border: "#A7F3D0", text: "#047857" },
  xero: { bg: "#EFF6FF", border: "#DBEAFE", text: "#1D4ED8" },
  stripe: { bg: "#EEF2FF", border: "#C7D2FE", text: "#4338CA" },
  square: { bg: "#F5F3FF", border: "#DDD6FE", text: "#6D28D9" },
  gusto: { bg: "#FFF7ED", border: "#FED7AA", text: "#C2410C" },
  rippling: { bg: "#FFF7ED", border: "#FED7AA", text: "#C2410C" },
  adp: { bg: "#FEF2F2", border: "#FECACA", text: "#B91C1C" },
};

export function SourceBadge({ provider = "manual" }: Props) {
  const tone = TONE[provider];
  return (
    <View
      style={[styles.badge, { backgroundColor: tone.bg, borderColor: tone.border }]}
      accessibilityLabel={`Source: ${LABELS[provider]}`}
    >
      <Text style={[styles.text, { color: tone.text }]}>{LABELS[provider]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  text: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
});
