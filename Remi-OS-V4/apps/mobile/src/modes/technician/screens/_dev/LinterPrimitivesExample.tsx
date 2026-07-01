/**
 * `LinterPrimitivesExample` — Storybook-style dev screen (P3-FE-5).
 *
 * Renders one `LinterEdgeCard` per `LinterIssueKind` so the three
 * new linter primitives (`SeverityBadge`, `AutoFixButton`,
 * `LinterEdgeCard`) can be visually smoke-tested without booting
 * the full review flow.
 *
 * Gated behind `__DEV__` — the named export is the screen, the
 * default export is `null` outside dev so a stray production import
 * cannot accidentally ship a nav-target with mock data.
 *
 * The card data below is *hand-crafted* rather than re-derived from
 * `lintSession(fixture.input)` because:
 *   - the fixtures (`src/utils/__fixtures__/linter-cases/*.json`)
 *     declare `humanMessage` as a regex on the *expected* output,
 *     so they are a contract test, not a UI snapshot;
 *   - we want one card per kind in stable order, with one of each
 *     severity (error vs warning) and at least one card with no
 *     `suggestedAutoFix` to exercise the disabled CTA state.
 *
 * The verbatim humanMessage strings below mirror the wording style
 * of the rule catalog in master plan §4.7 — the *real* canonical
 * source is the linter rule body in `src/utils/logistics-linter.ts`,
 * not this fixture file.
 *
 * NOTE on routability: the prompt explicitly placed this file at
 * `src/screens/_dev/`, *not* under `app/` — so it does not
 * auto-register as an Expo Router route. To preview, import the
 * named `LinterPrimitivesExample` export from a temporary `app/`
 * route file or open it in a Storybook host. This is intentional:
 * the master plan does not call for a permanent dev-route entry.
 */

import { ScrollView, StyleSheet, Text, View } from "react-native";

import { LinterEdgeCard } from "@technician/components/linter/linter-edge-card";
import type {
  LinterIssue,
  LinterIssueKind,
} from "@technician/utils/logistics-linter";

const noop = () => {};

const EXAMPLE_ISSUES: Record<LinterIssueKind, LinterIssue> = {
  time_conflict: {
    severity: "error",
    kind: "time_conflict",
    affectedAppointmentIds: [101, 102],
    humanMessage:
      "Two changes in this session put technician 5 into overlapping work on 2026-05-04: 10:00-11:00 and 10:30-11:30.",
    suggestedAutoFix: {
      kind: "reschedule",
      new_scheduled_date: "2026-05-04",
      new_start_time: "11:05",
      new_end_time: "12:05",
      new_technician_id: 5,
    },
  },
  drive_time_impossible: {
    severity: "warning",
    kind: "drive_time_impossible",
    affectedAppointmentIds: [220, 221],
    humanMessage:
      "Tech 7 has only 8 minutes between back-to-back jobs at 2026-05-04 13:00 and 13:30 — minimum drive time is 15 minutes.",
    suggestedAutoFix: {
      kind: "reschedule",
      new_scheduled_date: "2026-05-04",
      new_start_time: "13:45",
      new_end_time: "14:45",
      new_technician_id: 7,
    },
  },
  customer_sla_violation: {
    severity: "error",
    kind: "customer_sla_violation",
    affectedAppointmentIds: [103],
    humanMessage:
      "Proposed time 11:00-12:30 on 2026-05-04 falls inside customer 22's blackout window (10:00-12:00, reason: school pickup).",
    // No suggestedAutoFix — exercises the disabled CTA state.
  },
  fleet_capacity: {
    severity: "warning",
    kind: "fleet_capacity",
    affectedAppointmentIds: [200],
    humanMessage:
      "Reassigning fleet 100's appointment to technician 9 would put them at 4/3 fleet jobs this week.",
    // No suggestedAutoFix — exercises the disabled CTA state.
  },
  recurring_series_inconsistency: {
    severity: "warning",
    kind: "recurring_series_inconsistency",
    affectedAppointmentIds: [310, 311, 312],
    humanMessage:
      "Series #45: edit-all updates the 14:00 slot, but appointment #311 was already pinned to 15:00 by an edit-one earlier this week.",
    // No suggestedAutoFix.
  },
};

export function LinterPrimitivesExample() {
  if (!__DEV__) return null;

  const issues = Object.values(EXAMPLE_ISSUES);
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scrollContent}
    >
      <Text style={styles.title}>Linter primitives — visual smoke (P3-FE-5)</Text>
      <Text style={styles.subtitle}>
        One card per `LinterIssueKind`. Cards with `suggestedAutoFix === undefined`
        show the disabled CTA state.
      </Text>
      <View style={styles.list}>
        {issues.map((issue, idx) => (
          <LinterEdgeCard
            key={`${issue.kind}-${idx}`}
            issue={issue}
            onApplyAutoFix={noop}
            // Standalone display: the dev screen has no `IntentCard`
            // parent above each card, so the standalone chrome
            // (border + radius + shadow + header) is the right
            // visual. Production callsite in
            // `app/pending-reality/review.tsx` omits this prop so
            // each card renders nested chrome flush under its
            // `IntentCard` parent (P3-FE-10 / §5.2.3).
            showKindLabel
          />
        ))}
      </View>
    </ScrollView>
  );
}

export default __DEV__ ? LinterPrimitivesExample : (() => null);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 8,
  },
  list: {
    gap: 12,
  },
});
