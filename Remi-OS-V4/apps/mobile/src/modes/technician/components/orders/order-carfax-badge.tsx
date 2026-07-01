/**
 * Phase 2 Chunk 2.3 — Order Manager CARFAX status badge.
 *
 * Read-only visual indicator for the Phase 2 `appointments.carfax_*`
 * columns. Distinct from the legacy `<CarfaxStatusBadge />` in
 * `src/components/shared/` — that one models the `carfax_reports`
 * table + dry-run flow (`CarfaxReportStatus`). This sibling component
 * maps the new submission/retry pipeline state (`AppointmentCarfaxStatus`
 * + `attempt_count`) to one of five visible states (or silent).
 *
 * Mapping rule (single source of truth — also documented in the plan):
 *
 *   not_submitted              → render nothing (deliberate silence)
 *   pending                    → yellow "CARFAX: Pending"
 *   reported                   → green "CARFAX: Reported"
 *   failed, attempts < max     → orange "CARFAX: Failed" + lastError
 *   failed, attempts >= max    → red "CARFAX: Retry Exhausted" + lastError
 *   imported_historical        → grey "CARFAX: Historical"
 *
 * The "Retry Exhausted" label is derived on the FE — there is no
 * persisted enum value for it. The nightly cron from Chunk 2.2 owns
 * retries; this badge has NO retry button by design (surfacing one
 * here would race against the sweep).
 */

import { StyleSheet, View, Text } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { AppointmentCarfaxStatus } from "@technician/types/enums";

export interface OrderCarfaxBadgeProps {
  status: AppointmentCarfaxStatus;
  attemptCount: number;
  lastError: string | null;
  /** Mirrors BE `CARFAX_MAX_RETRY_ATTEMPTS` (Chunk 2.2). */
  maxAttempts?: number;
}

interface BadgeVisual {
  label: string;
  fg: string;
  bg: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  showError: boolean;
}

function resolveVisual(
  status: AppointmentCarfaxStatus,
  attemptCount: number,
  maxAttempts: number,
): BadgeVisual | null {
  switch (status) {
    case AppointmentCarfaxStatus.NOT_SUBMITTED:
      return null;
    case AppointmentCarfaxStatus.REPORTED:
      return {
        label: "Reported",
        fg: "#22C55E",
        bg: "#DCFCE7",
        icon: "check-circle",
        showError: false,
      };
    case AppointmentCarfaxStatus.PENDING:
      return {
        label: "Pending",
        fg: "#EAB308",
        bg: "#FEF9C3",
        icon: "schedule",
        showError: false,
      };
    case AppointmentCarfaxStatus.FAILED:
      if (attemptCount >= maxAttempts) {
        return {
          label: "Retry Exhausted",
          fg: "#EF4444",
          bg: "#FEE2E2",
          icon: "block",
          showError: true,
        };
      }
      return {
        label: "Failed",
        fg: "#F97316",
        bg: "#FFEDD5",
        icon: "error",
        showError: true,
      };
    case AppointmentCarfaxStatus.IMPORTED_HISTORICAL:
      return {
        label: "Historical",
        fg: "#6B7280",
        bg: "#F3F4F6",
        icon: "history",
        showError: false,
      };
    default:
      return null;
  }
}

export function OrderCarfaxBadge({
  status,
  attemptCount,
  lastError,
  maxAttempts = 5,
}: OrderCarfaxBadgeProps) {
  const visual = resolveVisual(status, attemptCount, maxAttempts);
  if (!visual) return null;

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.badge,
          { backgroundColor: visual.bg, borderColor: visual.fg },
        ]}
      >
        <MaterialIcons name={visual.icon} size={12} color={visual.fg} />
        <Text style={[styles.label, { color: visual.fg }]}>
          CARFAX: {visual.label}
        </Text>
      </View>
      {visual.showError && lastError ? (
        <Text style={styles.errorText} numberOfLines={2}>
          {lastError}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 4,
    alignSelf: "flex-start",
    maxWidth: 240,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
    alignSelf: "flex-start",
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
  },
  errorText: {
    fontSize: 11,
    color: "#6B7280",
    fontStyle: "italic",
  },
});
