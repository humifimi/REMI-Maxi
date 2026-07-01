/**
 * `WorkweekDateNav` — `< MMM D – MMM D, YYYY >` chevron-stepper row
 * used by the portrait workweek view to step the visible 4-day
 * window forward/backward by one week.
 *
 * Extracted verbatim from `resource-calendar-workweek-view.tsx`'s
 * inline `navRow` block (PR-UI-REDESIGN-1 modularization,
 * 2026-05-12). Kept presentational — the parent computes the
 * `label` string and passes the prev/next handlers. The current
 * workweek view formats this as `start.format("MMM D") - end.format("MMM D, YYYY")`
 * where `end = start + (WORKWEEK_DAYS - 1)`; the formatting logic
 * stays in the parent because the workweek length is a
 * parent-level constant.
 *
 * PR-UI-REDESIGN-2 (follow-up) will fold this row INTO
 * `<WorkweekBackBar>` on a single line — keeping the two as
 * separate modules so the follow-up can compose them sideways
 * without code surgery on the workweek view.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export interface WorkweekDateNavProps {
  /** Display label, e.g. "May 11 – May 14, 2026". */
  label: string;
  onPrev: () => void;
  onNext: () => void;
}

export function WorkweekDateNav({ label, onPrev, onNext }: WorkweekDateNavProps) {
  // 2026-05-25 — Chevrons hug the date label tightly (small gap +
  // smaller icon) so they don't collide with the sibling labels
  // ("← Day View" / tech name) on narrow portrait screens. Tap
  // target is preserved via `hitSlop` since the visible chevron
  // shrunk from 24 → 18.
  return (
    <View style={styles.navRow}>
      <Pressable onPress={onPrev} style={styles.navBtn} hitSlop={10}>
        <MaterialIcons name="chevron-left" size={18} color="#374151" />
      </Pressable>
      <Text style={styles.weekLabel} numberOfLines={1}>
        {label}
      </Text>
      <Pressable onPress={onNext} style={styles.navBtn} hitSlop={10}>
        <MaterialIcons name="chevron-right" size={18} color="#374151" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 4,
    // 2026-05-25 — tightened from 16 → 2 so the chevrons hug the
    // date label instead of floating far apart and bleeding into
    // sibling controls when the row gets squeezed.
    gap: 2,
  },
  navBtn: {
    padding: 2,
    // Keep the chevron from being pushed off when the label hits
    // its max compression — it's a fixed-size leaf so this is a
    // no-op on most screens, but it pins behavior on narrow ones.
    flexShrink: 0,
  },
  // 2026-05-25 — `flexShrink: 1` + `minWidth: 0` so the date
  // label can compress (and ellipsize at `numberOfLines={1}`)
  // before the row overflows into sibling labels on narrow
  // portrait screens. The chevrons stay snug against whatever
  // width the label settles on.
  weekLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
    flexShrink: 1,
    minWidth: 0,
    textAlign: "center",
  },
});
