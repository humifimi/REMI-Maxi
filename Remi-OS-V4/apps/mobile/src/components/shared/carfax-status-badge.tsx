import { StyleSheet, View, Text, Pressable, ActivityIndicator } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { CarfaxReportStatus } from "@technician/types/enums";
import type { CarfaxReportMode } from "@technician/types/api";
import {
  CarfaxStatusColorMap,
  CarfaxStatusBgMap,
  CarfaxStatusLabels,
  CarfaxDryRunVisual,
} from "@technician/constants/colors";

interface CarfaxStatusBadgeProps {
  status: CarfaxReportStatus;
  errorReason?: string | null;
  onRetry?: () => void;
  isRetrying?: boolean;
  /** Active backend `CARFAX_REPORT_MODE`. Optional for backwards-compat. */
  mode?: CarfaxReportMode;
  /** True when the backing carfax_reports row was a dry-run. */
  dryRun?: boolean;
}

const ICON_MAP: Record<CarfaxReportStatus, keyof typeof MaterialIcons.glyphMap> = {
  pending: "schedule",
  reported: "check-circle",
  failed: "error",
  "n/a": "remove-circle-outline",
};

/**
 * Renders a "Dry-Run (not sent)" pill instead of "Pending" when the backend
 * is configured for dry-run reporting OR a row was generated as dry-run.
 * The real submission status is a function of CARFAX_REPORT_MODE — when
 * the backend is in dry-run, a `pending` row is by definition local-only
 * and the operator should know that nothing went to Carfax.
 */
export function CarfaxStatusBadge({
  status,
  errorReason,
  onRetry,
  isRetrying = false,
  mode,
  dryRun,
}: CarfaxStatusBadgeProps) {
  const showDryRun =
    status === "pending" && (dryRun === true || mode === "dry-run");
  const showDisabled = status === "pending" && mode === "disabled";

  const color = showDryRun
    ? CarfaxDryRunVisual.fg
    : CarfaxStatusColorMap[status];
  const bg = showDryRun ? CarfaxDryRunVisual.bg : CarfaxStatusBgMap[status];
  const label = showDryRun
    ? CarfaxDryRunVisual.label
    : showDisabled
      ? "Disabled"
      : CarfaxStatusLabels[status];
  const icon = showDryRun
    ? "science"
    : showDisabled
      ? "block"
      : ICON_MAP[status];

  return (
    <View style={styles.wrapper}>
      <View style={[styles.badge, { backgroundColor: bg, borderColor: color }]}>
        <MaterialIcons name={icon} size={14} color={color} />
        <Text style={[styles.label, { color }]}>CARFAX: {label}</Text>
      </View>
      {status === "failed" && (
        <View style={styles.failedRow}>
          {errorReason ? (
            <Text style={styles.errorText} numberOfLines={2}>
              {errorReason}
            </Text>
          ) : null}
          {onRetry ? (
            <Pressable
              style={[styles.retryBtn, isRetrying && styles.retryBtnDisabled]}
              onPress={onRetry}
              disabled={isRetrying}
              hitSlop={8}
            >
              {isRetrying ? (
                <ActivityIndicator size={14} color="#fff" />
              ) : (
                <MaterialIcons name="refresh" size={14} color="#fff" />
              )}
              <Text style={styles.retryText}>
                {isRetrying ? "Retrying…" : "Retry"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    alignSelf: "flex-start",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
  },
  failedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: "#EF4444",
    fontWeight: "500",
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EF4444",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    minHeight: 32,
  },
  retryBtnDisabled: {
    opacity: 0.6,
  },
  retryText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
});
