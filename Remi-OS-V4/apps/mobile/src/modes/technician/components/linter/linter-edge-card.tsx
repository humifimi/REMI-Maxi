/**
 * `LinterEdgeCard` (P3-FE-5, visual reconciliation pass: P3-FE-10).
 *
 * Three of three primitives composing the linter UI surface
 * (master plan §5.2.4 / FE-G13). Renders one row of the
 * "issues remaining" list on the C.5 review screen and the
 * popover content on the C.3 / C.4 indicator chips.
 *
 * Two visual modes — the same primitive, two chromes:
 *
 *   - **Nested mode** (default — `showKindLabel === false`). Used
 *     by `app/pending-reality/review.tsx`, where each card stacks
 *     directly under the `IntentCard` whose intent the issue
 *     belongs to. The card has no outer border / radius / shadow.
 *     Severity is conveyed by a 3pt left accent + a very subtle
 *     background tint; a 1pt top separator visually divides the
 *     card from the intent body above. There is NO header row in
 *     this mode — the intent's own header (type pill + subject)
 *     already names the target, so a second pill + KIND_LABEL
 *     would duplicate context. The two cards read as one nested
 *     unit (§5.2.3 contract).
 *
 *   - **Standalone mode** (`showKindLabel === true`). Used by the
 *     `_dev/LinterPrimitivesExample` screen, and by any future
 *     popover surface (e.g. the C.3 / C.4 indicator chip popover)
 *     that mounts the card outside the review screen. The card
 *     gets full chrome — white background, border, border-radius,
 *     subtle shadow — plus a header row showing the
 *     `SeverityBadge` and the humanized `KIND_LABEL`. This is the
 *     visual-spec layout from §5.2.4:
 *
 *       ┌────────────────────────────────────────────────┐
 *       │ [Error pill] Time conflict                     │
 *       │                                                │
 *       │ humanMessage verbatim from the linter rule     │
 *       │ catalog (§4.7) — a sentence the dispatcher can │
 *       │ act on without translating.                    │
 *       │                                                │
 *       │ Affects: #1234, #1237                          │
 *       │                                                │
 *       │ [ Apply suggested fix ]                        │
 *       └────────────────────────────────────────────────┘
 *
 * The card itself is purely presentational — it does not own the
 * auto-fix mutation or the navigation to a detail sheet. Both are
 * lifted to the parent so the same primitive can render in:
 *
 *   - the review screen, where "Apply suggested fix" appends a new
 *     intent to the active session and re-runs the linter (§4.8
 *     keep-don't-replace);
 *   - the popover on the floating indicator chips, where the same
 *     CTA short-circuits to the same review-screen handler;
 *   - the `_dev` example screen below, where `onApplyAutoFix` is
 *     a `noop` so the disabled-vs-primary visual contrast renders
 *     without side effects.
 *
 * Affected appointment IDs are linkified via `expo-router.push` to
 * `/order/${id}` — matches the navigation pattern in
 * `appointment-detail-sheet.tsx`. The "Affects:" prefix + leading
 * "#" matches the verbal style used by the dispatcher copy in §4.7
 * (e.g. "appointment #1234 starts before tech … finishes #1233").
 */

import { useMemo } from "react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { StatusColors } from "@technician/constants/colors";
import {
  humanizeLinterMessage,
  type HumanizeLookups,
} from "@technician/utils/format-display";
import type { LinterIssue, LinterIssueKind } from "@technician/utils/logistics-linter";
import { AutoFixButton } from "./auto-fix-button";
import { SeverityBadge } from "./severity-badge";

interface LinterEdgeCardProps {
  issue: LinterIssue;
  /**
   * Optional customer / technician name lookups used to humanize the
   * `humanMessage` and the "Affects:" id chips. When `undefined`,
   * the card falls back to the wire-format text — same behaviour as
   * before this prop existed (introduced D2P-FE-13 follow-up
   * 2026-04-26 to make the linter intercept and Pending Reality
   * review screens readable on glass).
   */
  displayLookups?: HumanizeLookups;
  // PLAN-DEVIATION: 2026-04-23-apply-auto-fix-deferred-from-p3-fe-5 —
  //   `onApplyAutoFix` is `() => void` (no args) by design. Parents
  //   bind `(intentId, issue)` via closure when needed. See
  //   docs/PLAN-DEVIATIONS.md#2026-04-23-apply-auto-fix-deferred-from-p3-fe-5
  //   before changing this signature.
  /**
   * Optional callback fired when the auto-fix button is pressed.
   *
   * When `undefined`, the auto-fix button is hidden entirely (the
   * card collapses to badge + message + affected list — used on
   * the C.3/C.4 indicator popover, where there is no review-screen
   * mutation context to dispatch into).
   *
   * When defined but `issue.suggestedAutoFix` is `undefined`, the
   * button still renders, in its disabled "No auto-fix available"
   * state, so the dispatcher knows the rule fired but cannot be
   * auto-resolved (R5/R8/R11/R12 in the §4.7 catalog).
   */
  onApplyAutoFix?: () => void;
  /**
   * Render the standalone-mode chrome with a header row showing the
   * `SeverityBadge` and humanized `KIND_LABEL`.
   *
   * Defaults to `false` for the nested case (review-screen
   * `IntentCard` parent) — the parent already owns the per-target
   * header, so a second one would duplicate context. The dev
   * screen at `src/screens/_dev/LinterPrimitivesExample.tsx`
   * passes `true` so the standalone visual spec from §5.2.4
   * (badge + label + message + affects + CTA) renders in
   * isolation. Future popover surfaces (e.g. the floating
   * indicator chips) should also pass `true` because they have no
   * per-target header to defer to.
   *
   * See P3-FE-10 / master plan §5.2.3 + §5.3.5.
   */
  showKindLabel?: boolean;
}

/**
 * Display labels for the five v1 `LinterIssueKind` values. Sourced
 * from the master plan §4.7 rule names (humanized — kebab → Title).
 */
const KIND_LABEL: Record<LinterIssueKind, string> = {
  time_conflict: "Time conflict",
  drive_time_impossible: "Drive time impossible",
  customer_sla_violation: "Customer SLA violation",
  fleet_capacity: "Fleet capacity exceeded",
  recurring_series_inconsistency: "Recurring series inconsistency",
};

export function LinterEdgeCard({
  issue,
  onApplyAutoFix,
  showKindLabel = false,
  displayLookups,
}: LinterEdgeCardProps) {
  const router = useRouter();
  const { severity, kind, affectedAppointmentIds, humanMessage, suggestedAutoFix } =
    issue;

  const friendlyMessage = humanizeLinterMessage(humanMessage, displayLookups);

  // 2026-05-10 smoke fix: dedup the "Affects:" pill list so a single
  // logical conflict surfaces as a single pill per affected entity.
  //
  // Two-stage dedup:
  //   1. By appointment ID — defensive against any linter rule that
  //      forgets to call `dedupeAppointmentIds(...)` on the affected
  //      array. Today `time_conflict` and `recurring_series` already
  //      dedup at the rule level (`logistics-linter.ts` R1, R2, R5);
  //      `drive_time_impossible`, `customer_sla_violation`, and
  //      `fleet_capacity` either pass single-element arrays or rely
  //      on the caller. ID dedup at render is the cheap belt-and-
  //      suspenders that keeps any future regression from showing up
  //      as a duplicated chip.
  //   2. By display label, when both colliding entries DO have a
  //      label (i.e., a `customer_name` resolved by the day-view
  //      `appointmentLabels` map). Same-customer-multiple-conflicting-
  //      appointments is the actual root cause of the user-reported
  //      "Daniel Kim, Daniel Kim" bug — the linter correctly returned
  //      two distinct appointment IDs, both for the same customer,
  //      and both resolved to "Daniel Kim" via `appointmentLabels`.
  //      Collapsing them keeps the pill row uncluttered.
  //
  //      Bare `#NNN` entries (no label resolved — the appointment
  //      isn't on the current day-view cache) are NEVER label-
  //      collapsed because `#101` and `#102` are visually distinct
  //      already; collapsing by ID alone for those is enough.
  //
  //      Edge case: two genuinely DIFFERENT customers happen to share
  //      a display name (e.g., two customers both named "John Smith"
  //      in the same franchise) AND both have appointments in one
  //      conflict. The collapse merges them, hiding one — accepted
  //      because the probability of that scenario in any real
  //      franchise is vanishingly small, and the collapsed pill
  //      still routes to a real affected appointment for inspection.
  const dedupedAffectedIds = useMemo(() => {
    const seenIds = new Set<number>();
    const seenLabels = new Set<string>();
    const out: Array<{ id: number; display: string }> = [];
    for (const id of affectedAppointmentIds) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      const customerLabel = displayLookups?.appointmentLabels?.get(id);
      if (customerLabel) {
        if (seenLabels.has(customerLabel)) continue;
        seenLabels.add(customerLabel);
        out.push({ id, display: customerLabel });
      } else {
        out.push({ id, display: `#${id}` });
      }
    }
    return out;
  }, [affectedAppointmentIds, displayLookups]);

  const handlePressId = (id: number) => {
    router.push(`/order/${id}`);
  };

  const containerStyle = showKindLabel
    ? [
        styles.standaloneCard,
        severity === "error" ? styles.standaloneError : styles.standaloneWarning,
      ]
    : [
        styles.nestedCard,
        severity === "error" ? styles.nestedError : styles.nestedWarning,
      ];

  return (
    <View style={containerStyle} accessibilityRole="summary">
      {showKindLabel && (
        <View style={styles.header}>
          <SeverityBadge severity={severity} />
          <Text style={styles.kindLabel} numberOfLines={1}>
            {KIND_LABEL[kind]}
          </Text>
        </View>
      )}

      <Text style={styles.message}>{friendlyMessage}</Text>

      {dedupedAffectedIds.length > 0 && (
        <View style={styles.affectsRow}>
          <Text style={styles.affectsLabel}>Affects:</Text>
          {dedupedAffectedIds.map(({ id, display }, idx) => {
            const trailing = idx < dedupedAffectedIds.length - 1 ? "," : "";
            return (
              <Pressable
                key={id}
                onPress={() => handlePressId(id)}
                hitSlop={6}
                accessibilityRole="link"
                accessibilityLabel={`Open appointment ${id}`}
                testID={`linter-edge-card-id-${id}`}
              >
                <Text style={styles.affectsId}>{`${display}${trailing}`}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {onApplyAutoFix && (
        <View style={styles.footer}>
          <AutoFixButton
            suggestedAutoFix={suggestedAutoFix}
            onApply={onApplyAutoFix}
            testID={`linter-edge-card-autofix-${kind}`}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Standalone mode (`showKindLabel === true`) ─────────────────
  // Full chrome — used by the dev-screen example and any future
  // popover surface mounting the card outside the review screen.
  // Border colors stay as the original tinted red/yellow shades
  // (`#FCA5A5` / `#FDE68A`) — these are intentionally lighter than
  // the canonical `StatusColors.paymentDue` / `.scheduled` because
  // the full-saturation hex is reserved for the `SeverityBadge`
  // pill that sits inside the card header. Using the same hex
  // for both border and pill would visually merge them.
  standaloneCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  standaloneError: {
    borderColor: "#FCA5A5",
  },
  standaloneWarning: {
    borderColor: "#FDE68A",
  },

  // ── Nested mode (`showKindLabel === false`, default) ───────────
  // Stacks flush under `IntentCard` on the review screen so the
  // two cards read as one visual unit (§5.2.3). No outer border,
  // no border-radius, no shadow — relies on a 1pt top separator
  // for the section divide and a 3pt left severity accent + a
  // very subtle severity tint for the linter signal. Horizontal
  // padding is 0 on the right (the parent `IntentCard.padding=14`
  // already insets the content area) and 11 on the left (3pt
  // accent + 8pt content gap), so the nested card's content
  // starts at the same x as the intent body.
  nestedCard: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    borderLeftWidth: 3,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 8,
    paddingRight: 0,
    gap: 8,
  },
  nestedError: {
    borderLeftColor: StatusColors.paymentDue,
    backgroundColor: StatusColors.paymentDue + "0D", // ~5% opacity
  },
  nestedWarning: {
    borderLeftColor: StatusColors.scheduled,
    backgroundColor: StatusColors.scheduled + "0D",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  kindLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    flexShrink: 1,
  },
  message: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  affectsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  affectsLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  affectsId: {
    fontSize: 13,
    color: "#3B82F6",
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  footer: {
    marginTop: 4,
  },
});
