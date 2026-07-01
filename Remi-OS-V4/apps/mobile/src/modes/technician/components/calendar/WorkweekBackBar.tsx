/**
 * `WorkweekBackBar` — a single view-mode switcher link, either
 * `← Day View` (rendered in the Week view's bottom chrome row to
 * drill back out to multi-tech Day view) or `Week View →` (rendered
 * in the Day view's bottom chrome row to drill into single-tech
 * Week view). Both directions share the same component because the
 * user's PR-UI-REDESIGN-2 mockups call them out as the same element
 * with the label + arrow flipped.
 *
 * 2026-05-12 (PR-UI-REDESIGN-2): generalised from the previous
 * Week-only `← Day View … techName` layout. The tech-name display
 * moved OUT into the parent's bottom-chrome row JSX since it's a
 * plain `<Text>` and shouldn't be carried by the link component.
 * Default props preserve the prior `<WorkweekBackBar onBackPress
 * techName="Josh" />` call shape's text + back-direction so any
 * call site that hasn't been migrated still compiles — but the
 * existing workweek-view call site is migrating in the same PR.
 *
 * Pure presentational. Parent owns the navigation target.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export interface WorkweekBackBarProps {
  /**
   * `back` → renders `← {label}` (arrow on the LEFT).
   * `forward` → renders `{label} →` (arrow on the RIGHT).
   * Defaults to `back` for backwards-compat with the Week view
   * call site.
   */
  direction?: "back" | "forward";
  /**
   * Link text. Defaults to `"Day View"` (the original Week-view
   * back-link target). The Day view's mount uses `"Week View"`.
   */
  label?: string;
  /** Tap handler. Parent owns the navigation target. */
  onPress: () => void;
}

export function WorkweekBackBar({
  direction = "back",
  label = "Day View",
  onPress,
}: WorkweekBackBarProps) {
  const arrowName = direction === "back" ? "arrow-back" : "arrow-forward";
  return (
    <Pressable onPress={onPress} style={styles.linkBtn} hitSlop={6}>
      <View
        style={[
          styles.linkInner,
          direction === "forward" && styles.linkInnerForward,
        ]}
      >
        {direction === "back" && (
          <MaterialIcons name={arrowName} size={20} color="#3B82F6" />
        )}
        <Text style={styles.linkText}>{label}</Text>
        {direction === "forward" && (
          <MaterialIcons name={arrowName} size={20} color="#3B82F6" />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  linkBtn: {
    paddingVertical: 4,
  },
  linkInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  linkInnerForward: {
    flexDirection: "row",
  },
  linkText: { fontSize: 14, fontWeight: "600", color: "#3B82F6" },
});
