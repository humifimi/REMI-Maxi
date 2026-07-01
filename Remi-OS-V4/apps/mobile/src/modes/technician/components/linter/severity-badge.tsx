/**
 * `SeverityBadge` (P3-FE-5).
 *
 * One of three primitives that compose the linter UI surface
 * (master plan §5.2.4 / FE-G13). Renders a `LinterIssue.severity`
 * value as a small colored pill.
 *
 * Color contract — sourced from `src/constants/colors.ts` per the
 * architecture rule "All status colors via src/constants/colors.ts
 * (not inline hex)":
 *
 *   - error   → `StatusColors.paymentDue` (#EF4444 — the universal
 *               "blocking" red used on payment-due cards, no-show
 *               appointments, and in `SeverityColorMap.high`).
 *   - warning → `StatusColors.scheduled`  (#EAB308 — the universal
 *               "needs attention but not fatal" yellow used on
 *               scheduled appointments and `tight` job timers).
 *
 * The pill follows the same shape language as `StatusBadge`
 * (`src/components/shared/status-badge.tsx`): 20%-opacity tinted
 * background, full-saturation border + text, leading dot, optional
 * `small` size for inline contexts.
 *
 * Default labels are "Error" / "Warning"; callers can override via
 * the `label` prop when the surrounding context already conveys
 * severity (e.g. an inline pill next to a card title).
 */

import { StyleSheet, View, Text } from "react-native";

import { StatusColors } from "@technician/constants/colors";
import type { LinterIssue } from "@technician/utils/logistics-linter";

export type LinterSeverity = LinterIssue["severity"];

interface SeverityBadgeProps {
  severity: LinterSeverity;
  label?: string;
  size?: "small" | "default";
}

const COLOR_BY_SEVERITY: Record<LinterSeverity, string> = {
  error: StatusColors.paymentDue,
  warning: StatusColors.scheduled,
};

const DEFAULT_LABEL: Record<LinterSeverity, string> = {
  error: "Error",
  warning: "Warning",
};

export function SeverityBadge({
  severity,
  label,
  size = "default",
}: SeverityBadgeProps) {
  const color = COLOR_BY_SEVERITY[severity];
  const text = label ?? DEFAULT_LABEL[severity];
  const isSmall = size === "small";

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${DEFAULT_LABEL[severity]}: ${text}`}
      style={[
        styles.badge,
        { backgroundColor: color + "20", borderColor: color },
        isSmall && styles.badgeSmall,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text
        style={[styles.label, { color }, isSmall && styles.labelSmall]}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
  badgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
  },
  labelSmall: {
    fontSize: 11,
  },
});
