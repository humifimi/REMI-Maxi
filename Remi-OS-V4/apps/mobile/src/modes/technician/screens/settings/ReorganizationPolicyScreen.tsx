/**
 * `ReorganizationPolicyScreen` — per-franchise trust-gradient editor (P7-FE-1).
 *
 * Master plan §2.5 (trust gradient defaults / per-franchise opt-in)
 * + §3.6 (`franchises.reorganization_policy` JSONB column).
 *
 * Backstory: the trust gradient is the per-franchise dial that
 * decides which session shapes auto-commit ("auto") vs. queue for
 * franchise-owner review ("fo_review"). Defaults are spelled out in
 * §2.5 — most permissive bucket (tech-authored, self-only,
 * no-cancel) defaults to `auto`; everything else to `fo_review`.
 * The AI bucket is hard-pinned to `always_fo_review` and is NOT
 * editable — render it for transparency only.
 *
 * Schema (canonical) lives in `src/types/reorganization.ts` →
 * `ReorganizationPolicy` interface. The plan doc lists the same
 * shape but the interface is authoritative; if the two ever drift
 * the interface wins (per the doc rule about types vs. prose).
 *
 * This screen:
 *   - fetches the current policy via `useReorganizationPolicy()`
 *   - hydrates a React Hook Form (`zodResolver`) with those values
 *   - lets the FO toggle each "tech_*" / "customer_*" bucket between
 *     "auto" and "fo_review" via Switch primitives
 *   - renders the AI bucket as a read-only chip
 *   - submits the diff via `useUpdateReorganizationPolicy()` →
 *     `PATCH /api/v1/franchise/settings/reorganization-policy`
 *   - on success: toast + leaves the form dirty-clean so the next
 *     edit cycle starts from "no changes pending"
 *   - on error: alert; form stays dirty so the user can retry
 *
 * Sibling backend endpoint shipped with the same PR (per chunk
 * prompt §6: small enough to not warrant its own chunk). Tests
 * cover the form logic only — the wire-format is covered by the
 * BE integration test.
 *
 * --------------------------------------------------------------------
 *
 * Surface the screen as an Expo Router route by adding a thin
 * wrapper at `app/settings/reorganization-policy.tsx`. The screen
 * itself lives in `src/screens/` per the chunk prompt; the same
 * pattern as `src/screens/_dev/LinterPrimitivesExample.tsx`.
 */

import { useEffect } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Stack } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { SourceBadgeColors } from "@technician/constants/colors";
import {
  useReorganizationPolicy,
  useUpdateReorganizationPolicy,
} from "@technician/hooks/franchise/use-reorganization-policy";
import type { ReorganizationPolicy } from "@technician/types/reorganization";

// ──────────────────────────────────────────────────────────────────
// Form schema — mirrors `ReorganizationPolicy` interface 1:1, modulo
// the AI field which is read-only.
// ──────────────────────────────────────────────────────────────────

const editableModeSchema = z.enum(["auto", "fo_review"]);

const policyFormSchema = z.object({
  tech_authored_self_only: editableModeSchema,
  tech_authored_cross_tech: editableModeSchema,
  tech_authored_with_cancel: editableModeSchema,
  customer_authored_single: editableModeSchema,
  customer_authored_multi: editableModeSchema,
  customer_authored_with_conflict: editableModeSchema,
});

type PolicyFormValues = z.infer<typeof policyFormSchema>;

// Per §2.5 defaults — used as the form's initial values until the
// real policy hydrates from the server. Keeping these here (rather
// than in the hook) so the form can render synchronously on mount.
const DEFAULT_FORM_VALUES: PolicyFormValues = {
  tech_authored_self_only: "auto",
  tech_authored_cross_tech: "fo_review",
  tech_authored_with_cancel: "fo_review",
  customer_authored_single: "auto",
  customer_authored_multi: "fo_review",
  customer_authored_with_conflict: "fo_review",
};

// ──────────────────────────────────────────────────────────────────
// Row labels — copy is intentionally plain-language. The trust
// gradient is a UX surface for non-technical FOs; we avoid the
// internal token names ("tech_authored_self_only") in the visible
// label.
// ──────────────────────────────────────────────────────────────────

interface PolicyRow {
  field: keyof PolicyFormValues;
  title: string;
  description: string;
}

const TECH_ROWS: PolicyRow[] = [
  {
    field: "tech_authored_self_only",
    title: "Tech moves their own jobs",
    description:
      "Reorganizations where the technician only shuffles their own appointments and doesn't cancel anything.",
  },
  {
    field: "tech_authored_cross_tech",
    title: "Tech reassigns to another tech",
    description:
      "Reorganizations where the technician reassigns work across techs (e.g. swapping a job with a teammate).",
  },
  {
    field: "tech_authored_with_cancel",
    title: "Tech cancels appointments",
    description:
      "Reorganizations that include a cancellation. Cancellations always touch the customer relationship.",
  },
];

const CUSTOMER_ROWS: PolicyRow[] = [
  {
    field: "customer_authored_single",
    title: "Customer reschedules one job",
    description:
      "Customer-initiated reschedule of a single appointment. No conflict, no cascade.",
  },
  {
    field: "customer_authored_multi",
    title: "Customer reschedules multiple jobs",
    description:
      "Customer-initiated reschedule that affects more than one appointment.",
  },
  {
    field: "customer_authored_with_conflict",
    title: "Customer reschedule causes a conflict",
    description:
      "Customer-initiated reschedule that overlaps with an existing booking or breaks a route constraint.",
  },
];

// ──────────────────────────────────────────────────────────────────
// Screen component
// ──────────────────────────────────────────────────────────────────

export function ReorganizationPolicyScreen() {
  const policyQuery = useReorganizationPolicy();
  const updateMutation = useUpdateReorganizationPolicy();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty },
  } = useForm<PolicyFormValues>({
    resolver: zodResolver(policyFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  // Hydrate form from server when policy lands. We do this in an
  // effect (not in defaultValues) so refetches replace stale form
  // state — e.g. after a successful submit on another device.
  useEffect(() => {
    if (policyQuery.data) {
      reset(extractFormValues(policyQuery.data));
    }
  }, [policyQuery.data, reset]);

  const onSubmit = (values: PolicyFormValues) => {
    // Always send the AI field too so the BE round-trips a complete
    // policy object back. AI is hard-pinned per §2.5; if a future
    // BE change relaxes that, the form will need a third option.
    const payload: ReorganizationPolicy = {
      ...values,
      ai_authored: "always_fo_review",
    };
    updateMutation.mutate(payload, {
      onSuccess: (saved) => {
        reset(extractFormValues(saved));
      },
      onError: () => {
        Alert.alert(
          "Couldn't save policy",
          "Something went wrong reaching the server. Your changes are still here — try again in a moment.",
        );
      },
    });
  };

  return (
    <View style={styles.container} testID="reorganization-policy-screen">
      <Stack.Screen options={{ title: "Reorganization policy" }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>
          Decide which reorganizations land on the calendar automatically and
          which queue up for your review.
        </Text>

        {policyQuery.isPending ? (
          <Text style={styles.loadingText} testID="policy-loading">
            Loading current policy…
          </Text>
        ) : null}
        {policyQuery.isError ? (
          <View style={styles.errorCard} testID="policy-error">
            <Text style={styles.errorTitle}>Couldn't load policy</Text>
            <Text style={styles.errorBody}>
              We're showing the franchise defaults below. Try pulling down to
              refresh, or reach out if this keeps happening.
            </Text>
          </View>
        ) : null}

        <SectionHeader title="Technician-initiated reorganizations" />
        <View style={styles.sectionCard}>
          {TECH_ROWS.map((row, idx) => (
            <PolicyRowField
              key={row.field}
              row={row}
              control={control}
              isLast={idx === TECH_ROWS.length - 1}
            />
          ))}
        </View>

        <SectionHeader title="Customer-initiated reorganizations" />
        <View style={styles.sectionCard}>
          {CUSTOMER_ROWS.map((row, idx) => (
            <PolicyRowField
              key={row.field}
              row={row}
              control={control}
              isLast={idx === CUSTOMER_ROWS.length - 1}
            />
          ))}
        </View>

        <SectionHeader title="AI suggestions" />
        <View style={styles.sectionCard}>
          <View style={styles.aiRow} testID="policy-ai-row">
            <View style={styles.rowLabelGroup}>
              <View style={styles.aiLabelHeader}>
                <View style={styles.aiBadge}>
                  <Text style={styles.aiBadgeText}>AI</Text>
                </View>
                <Text style={styles.rowTitle}>AI-emitted reorganizations</Text>
              </View>
              <Text style={styles.rowDescription}>
                AI suggestions always require your review before they commit.
                This is a platform safeguard and isn't user-configurable yet.
              </Text>
            </View>
            <View style={styles.aiPill}>
              <Text style={styles.aiPillText}>Always review</Text>
            </View>
          </View>
        </View>

        <Pressable
          onPress={handleSubmit(onSubmit)}
          disabled={!isDirty || updateMutation.isPending}
          style={({ pressed }) => [
            styles.saveBtn,
            (!isDirty || updateMutation.isPending) && styles.saveBtnDisabled,
            pressed && styles.saveBtnPressed,
          ]}
          accessibilityRole="button"
          testID="policy-save-btn"
        >
          <Text style={styles.saveBtnText}>
            {updateMutation.isPending
              ? "Saving…"
              : isDirty
                ? "Save changes"
                : "No changes"}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────────────

interface PolicyRowFieldProps {
  row: PolicyRow;
  control: import("react-hook-form").Control<PolicyFormValues>;
  isLast: boolean;
}

function PolicyRowField({ row, control, isLast }: PolicyRowFieldProps) {
  return (
    <Controller
      control={control}
      name={row.field}
      render={({ field: { value, onChange } }) => (
        <View
          style={[styles.row, !isLast && styles.rowDivider]}
          testID={`policy-row-${row.field}`}
        >
          <View style={styles.rowLabelGroup}>
            <Text style={styles.rowTitle}>{row.title}</Text>
            <Text style={styles.rowDescription}>{row.description}</Text>
            <Text style={styles.rowMode}>
              {value === "auto"
                ? "Auto-commits without your review."
                : "Queues for your review before committing."}
            </Text>
          </View>
          <Switch
            value={value === "auto"}
            onValueChange={(next) => onChange(next ? "auto" : "fo_review")}
            trackColor={{ false: "#D1D5DB", true: "#86EFAC" }}
            thumbColor={value === "auto" ? "#22C55E" : "#9CA3AF"}
            testID={`policy-switch-${row.field}`}
          />
        </View>
      )}
    />
  );
}

interface SectionHeaderProps {
  title: string;
}

function SectionHeader({ title }: SectionHeaderProps) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function extractFormValues(policy: ReorganizationPolicy): PolicyFormValues {
  return {
    tech_authored_self_only: policy.tech_authored_self_only,
    tech_authored_cross_tech: policy.tech_authored_cross_tech,
    tech_authored_with_cancel: policy.tech_authored_with_cancel,
    customer_authored_single: policy.customer_authored_single,
    customer_authored_multi: policy.customer_authored_multi,
    customer_authored_with_conflict: policy.customer_authored_with_conflict,
  };
}

// ──────────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  scroll: {
    padding: 16,
    paddingBottom: 48,
    gap: 12,
  },
  intro: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  loadingText: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    paddingVertical: 8,
  },
  errorCard: {
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    padding: 12,
    gap: 4,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#991B1B",
  },
  errorBody: {
    fontSize: 13,
    color: "#7F1D1D",
    lineHeight: 18,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  rowLabelGroup: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  rowDescription: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  rowMode: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    marginTop: 4,
  },
  aiRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  aiLabelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  aiBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: SourceBadgeColors.ai_suggestion,
  },
  aiBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  aiPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F3E8FF",
    borderWidth: 1,
    borderColor: SourceBadgeColors.ai_suggestion,
  },
  aiPillText: {
    color: SourceBadgeColors.ai_suggestion,
    fontSize: 12,
    fontWeight: "700",
  },
  saveBtn: {
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: {
    opacity: 0.45,
  },
  saveBtnPressed: {
    opacity: 0.8,
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});

export default ReorganizationPolicyScreen;
