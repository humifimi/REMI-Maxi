/**
 * `AutoFixButton` (P3-FE-5).
 *
 * Two of three primitives composing the linter UI surface
 * (master plan §5.2.4 / FE-G13). Renders a primary-style "Apply
 * suggested fix" CTA when the linter rule produced an
 * `auto_fix_intent` (master plan §4.7 column 4 — the rules with
 * "yes — slot-shift" / "yes — small time shift"); renders a
 * disabled grey button labeled "No auto-fix available" when the
 * rule did not.
 *
 * The button never opens a sheet or modal itself — the parent
 * (review screen, P3-FE-4) wires `onApply` to a mutation hook
 * that adds a new intent to the active session per the
 * keep-don't-replace semantics in §4.8.
 *
 * Color contract — sourced from `src/constants/colors.ts` per the
 * architecture rule. The primary state uses `StatusColors.inProgress`
 * (#3B82F6 — the universal blue this app uses for active calls-to-
 * action: in-progress jobs, info-state alerts, primary buttons);
 * the disabled state uses `StatusColors.cancelled` (#6B7280 — the
 * universal "inert" grey for cancelled appointments, declined
 * referrals, etc.).
 */

import { StyleSheet, Pressable, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { StatusColors } from "@technician/constants/colors";
import type { ReorganizationIntentPayload } from "@technician/types/reorganization";

interface AutoFixButtonProps {
  /**
   * The auto-fix intent payload emitted by the linter for this
   * issue. When `undefined`, the button renders disabled with the
   * "no fix available" label — this case is intentional, not an
   * error: rules like R5 (route dependency), R8 (time block
   * violation), R11 (cross-day recurrence orphan), and R12 (cancel
   * with active job) are informational-only and surface the same
   * card shape without an actionable CTA.
   */
  suggestedAutoFix?: ReorganizationIntentPayload;

  /**
   * Fired when the user taps the (enabled) button. Parent (review
   * screen) is responsible for adding the auto-fix intent to the
   * active session and re-running the linter (§4.8).
   */
  onApply: () => void;

  /**
   * Optional override for the enabled-state label. Defaults to
   * "Apply suggested fix" per the §5.2.4 mock.
   */
  label?: string;

  /**
   * Optional `testID` so the parent can scope a query in tests
   * (e.g. one card-per-rule rendering means multiple buttons in the
   * tree at once).
   */
  testID?: string;
}

const ENABLED_LABEL = "Apply suggested fix";
const DISABLED_LABEL = "No auto-fix available";

export function AutoFixButton({
  suggestedAutoFix,
  onApply,
  label,
  testID,
}: AutoFixButtonProps) {
  const enabled = suggestedAutoFix !== undefined;
  const text = enabled ? (label ?? ENABLED_LABEL) : DISABLED_LABEL;

  return (
    <Pressable
      onPress={enabled ? onApply : undefined}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled }}
      accessibilityLabel={text}
      hitSlop={6}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        enabled ? styles.buttonEnabled : styles.buttonDisabled,
        pressed && enabled && styles.buttonPressed,
      ]}
    >
      <View style={styles.row}>
        <MaterialIcons
          name={enabled ? "auto-fix-high" : "block"}
          size={16}
          color="#FFFFFF"
        />
        <Text style={styles.label} numberOfLines={1}>
          {text}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    minHeight: 44,
    alignSelf: "flex-start",
    justifyContent: "center",
  },
  buttonEnabled: {
    backgroundColor: StatusColors.inProgress,
  },
  buttonDisabled: {
    backgroundColor: StatusColors.cancelled,
    opacity: 0.6,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  label: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
