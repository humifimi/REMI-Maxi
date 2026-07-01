/**
 * `DailyBriefingBanner` — the yellow "Daily Briefing" Pressable that
 * sits at the top of the calendar chrome.
 *
 * Extracted verbatim from `app/(tabs)/index.tsx` (PR-UI-REDESIGN-1
 * modularization pass, 2026-05-12). Two call sites in the franchise
 * tab — the franchise-owner branch (where `alertCount` is derived
 * from `franchiseBriefingSummary`) and the technician-self branch
 * (where it's derived from `briefingSummary`) — were rendering the
 * same JSX with the same styles, just bound to different summary
 * variables. The component takes the already-summed `alertCount`
 * and `subtitle` directly so each call site stays the source of
 * truth for which briefing it's reading from.
 *
 * Behavior:
 *   - When `alertCount > 0`, the banner adopts the red-tinted
 *     `briefingBannerAlert` variant.
 *   - `<BriefingBadge>` renders an absolutely-positioned red pill
 *     showing the alert count (capped at "9+") in the top-right
 *     corner of the sun icon. Hidden when `count <= 0`.
 *   - Tap fires `haptic.light()` then `onPress` — the parent owns
 *     the navigation target so this component stays presentational.
 *   - **Auto-hide (PR-UI-REDESIGN-2, 2026-05-12):** the banner
 *     unmounts itself 15 s after the Calendar tab gains focus, and
 *     re-mounts whenever the user navigates back to the tab.
 *     Implemented inline via `useFocusEffect` rather than at the
 *     two call sites so both branches share the same timer logic
 *     without per-site duplication. The 15 s constant is the
 *     `BRIEFING_AUTO_HIDE_MS` export below; tests / future
 *     adjustments tweak it once here.
 */

import { useCallback, useState } from "react";
import { Pressable, View, Text, StyleSheet } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useFocusEffect } from "expo-router";
import { haptic } from "@technician/hooks/utility/use-haptics";

/**
 * Milliseconds after the Calendar tab gains focus before the banner
 * auto-hides. PR-UI-REDESIGN-2 spec: 15 s.
 */
export const BRIEFING_AUTO_HIDE_MS = 15_000;

interface BriefingBadgeProps {
  count: number;
}

function BriefingBadge({ count }: BriefingBadgeProps) {
  if (count <= 0) return null;
  return (
    <View style={styles.briefingBadge}>
      <Text style={styles.briefingBadgeText}>{count > 9 ? "9+" : count}</Text>
    </View>
  );
}

export interface DailyBriefingBannerProps {
  /**
   * Pre-summed alert count (material-issue count + alert count) used
   * to drive the badge AND the red-tinted alert-state styling. The
   * caller does the addition so this component doesn't have to know
   * the briefing summary's shape (which differs slightly between
   * franchise + tech endpoints).
   */
  alertCount: number;
  /** Right-hand subtitle line under "Daily Briefing". */
  subtitle: string;
  /** Tap handler. Parent owns the navigation target. */
  onPress: () => void;
}

export function DailyBriefingBanner({
  alertCount,
  subtitle,
  onPress,
}: DailyBriefingBannerProps) {
  // PR-UI-REDESIGN-2 (2026-05-12): auto-hide 15 s after the
  // Calendar tab gains focus. `useFocusEffect`'s callback fires
  // on every focus (initial mount + every back-navigation to the
  // tab) so resetting `visible` to `true` here re-shows the banner
  // each time the user returns. The cleanup clears the timer on
  // blur so a tab switch within the 15 s window doesn't fire the
  // hide late after the user has navigated away. Inlined in this
  // component (rather than at the two call sites) so both
  // franchise-owner + technician-self mounts share the timer
  // without per-site duplication.
  const [visible, setVisible] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setVisible(true);
      const handle = setTimeout(
        () => setVisible(false),
        BRIEFING_AUTO_HIDE_MS,
      );
      return () => clearTimeout(handle);
    }, []),
  );
  if (!visible) return null;
  return (
    <Pressable
      style={[
        styles.briefingBanner,
        alertCount > 0 && styles.briefingBannerAlert,
      ]}
      onPress={() => {
        haptic.light();
        onPress();
      }}
    >
      <View style={styles.briefingLeft}>
        <View>
          <MaterialIcons name="wb-sunny" size={22} color="#F59E0B" />
          <BriefingBadge count={alertCount} />
        </View>
        <View>
          <Text style={styles.briefingTitle}>Daily Briefing</Text>
          <Text style={styles.briefingSub}>{subtitle}</Text>
        </View>
      </View>
      <MaterialIcons name="chevron-right" size={22} color="#9CA3AF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  briefingBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#FFFBEB",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  briefingBannerAlert: {
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  briefingLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  briefingTitle: { fontSize: 15, fontWeight: "700", color: "#92400E" },
  briefingSub: {
    fontSize: 12,
    color: "#B45309",
    marginTop: 1,
    maxWidth: 260,
  },
  briefingBadge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  briefingBadgeText: { fontSize: 10, fontWeight: "800", color: "#fff" },
});
