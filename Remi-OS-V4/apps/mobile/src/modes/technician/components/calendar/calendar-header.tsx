/**
 * `CalendarHeader` — the calendar tab's compressed top action chrome.
 *
 * 2026-05-12 (PR-UI-REDESIGN-2 visual redesign): the redesigned
 * portrait chrome consolidates what used to be two rows
 * (`<CalendarDateNavRow>` on top, `<CalendarModeRow>` below) into
 * a **single** compressed row: `Day | Week | Month` segmented
 * control followed by inline `[map]`, `[density]`, `(+)`, and
 * `[gear]` action buttons. The previous date-nav row's chevrons +
 * date label are NOT rendered here — call sites mount
 * `<CalendarDateNavRow>` directly at the new bottom-chrome row
 * position (under the move-chain chip row, above the avatar
 * strip). See the PR-UI-REDESIGN-2 callouts in
 * `docs/DEVELOPMENT-LOG.md` for the layout map.
 *
 * The public API is unchanged so existing call sites keep
 * compiling. `showViewModes`, `showMapToggle`, `showDensityToggle`,
 * `showNewButton`, and `showSettingsButton` continue to gate their
 * respective controls; the underlying child component
 * (`<CalendarModeRow>`) is responsible for placing all of them on
 * the single row.
 */

import { StyleSheet, View } from "react-native";
import { CalendarModeRow } from "@technician/components/calendar/CalendarModeRow";

interface CalendarHeaderProps {
  onNewPress?: () => void;
  onSettingsPress?: () => void;
  showNewButton?: boolean;
  showMapToggle?: boolean;
  showViewModes?: boolean;
  showDensityToggle?: boolean;
  /**
   * When true, renders a gear icon at the trailing edge of the
   * compressed mode row that opens the in-calendar Quick Settings
   * sheet (Calendar Display Hours, etc.).
   */
  showSettingsButton?: boolean;
}

export function CalendarHeader({
  onNewPress,
  onSettingsPress,
  showNewButton = false,
  showMapToggle = false,
  showViewModes = true,
  showDensityToggle = false,
  showSettingsButton = false,
}: CalendarHeaderProps) {
  // `showViewModes={false}` is left in the API surface for any
  // legacy / future call site that wants to hide the mode tabs
  // entirely (today there are none). Without the row, the header
  // collapses to nothing.
  if (!showViewModes) return null;
  return (
    <View style={styles.container}>
      <CalendarModeRow
        showNewButton={showNewButton}
        onNewPress={onNewPress}
        showSettingsButton={showSettingsButton}
        onSettingsPress={onSettingsPress}
        showMapToggle={showMapToggle}
        showDensityToggle={showDensityToggle}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
    backgroundColor: "#F9FAFB",
  },
});
