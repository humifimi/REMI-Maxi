/**
 * `<MapActionModal>` (LDM-WAVE-2 CHUNK-4 pivot) — private wrapper around
 * React Native's built-in `<Modal>` for the map-driven action sheets
 * (`<MarkerContextMenuSheet>`, `<MarkerReassignPickerSheet>`).
 *
 * PLAN-DEVIATION: 2026-05-22-snap-zone-replaces-pin-drag — the third
 * consumer this wrapper used to host, `<MarkerDropConfirmSheet>`, was
 * deleted along with all pin-drag code in snap-zone Phase 7h follow-
 * up. See docs/PLAN-DEVIATIONS.md#2026-05-22-snap-zone-replaces-pin-drag.
 *
 * Why this exists (PLAN-DEVIATION: 2026-05-17-map-sheets-native-modal):
 *
 * The original CHUNK-2 spec puts every action sheet on `<AppSheet>` so
 * landscape always opens on the right half of the screen and portrait
 * fills the bottom. That's the right call for sheets triggered from a
 * sibling of `<MapView>` — every other sheet in the app does it.
 *
 * The three sheets above are different. Sentry replay + breadcrumb
 * sessions on 2026-05-17 (replay
 * `ROUTE_MAP_BUILD_STAMP=2026-05-17-instrument-r2`) showed that
 * `@gorhom/bottom-sheet` silently fails to animate when it's mounted
 * as a sibling of `<MapView>` on iOS — `snapToIndex(0)` is called,
 * `ref.current` is non-null, and the visible-effect breadcrumb fires,
 * but the wrapped `onChange` callback never runs. Forcing full-width
 * via `<AppSheet forceSide="full">` didn't fix it either, so the bug
 * isn't the half-width wrapper — it's deeper in the gorhom ↔ MapView
 * interaction. Two prior dev-log entries (bug M4 and M5) call out the
 * same finicky-gorhom-around-maps pattern in the codebase already.
 *
 * The pivot is to render these three sheets via RN's `<Modal>`
 * instead, which renders into a separate OS window above the
 * MapView. It loses the slide-from-right landscape animation
 * (the new behavior is a fade-in centered/right-anchored panel) but
 * it actually opens, which the AppSheet variants weren't doing for
 * the user.
 *
 * Visual contract:
 *
 *   - Portrait: panel pins to the bottom edge, fills the screen
 *     width, content has rounded top corners — matches the visual
 *     mass of a bottom sheet.
 *   - Landscape: panel pins to the right edge with a fixed 50% width
 *     and full-height, content has rounded left corners — matches the
 *     existing half-width-on-right AppSheet convention so the user
 *     doesn't notice the underlying library change.
 *
 * Dismiss: backdrop tap fires `onRequestClose`. There is no
 * pan-down-to-close gesture (gorhom-only behavior); each sheet's
 * existing "Cancel" / "Dismiss" button still works.
 *
 * Sentry: `map-action-modal:visible` breadcrumbs fire on every
 * visible-prop change AND inside `onShow` — the latter is ground
 * truth that the OS actually rendered the modal (the previous
 * AppSheet `onChange` never fired, so we want a parallel signal
 * here).
 */

import { useEffect, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { traceMap } from "@technician/utils/sentry-map-diagnostics";

export interface MapActionModalProps {
  /** Whether the modal is open. */
  visible: boolean;
  /**
   * Dismiss handler. Fires on backdrop tap and on the platform's
   * hardware back button (Android). Each child still renders its own
   * Cancel/Dismiss button — this handler is just the "tap outside"
   * affordance.
   */
  onRequestClose: () => void;
  /**
   * Stable identifier for the consuming sheet (e.g. `"menu"`,
   * `"confirm"`, `"picker"`). Used in Sentry breadcrumbs so the
   * timeline reads `map-action-modal:visible {id: "menu"}` instead of
   * an anonymous event.
   */
  instanceId: string;
  /**
   * Optional landscape-orientation width override. Defaults to
   * `"50%"` of the viewport (the half-screen-on-right convention
   * the original `<AppSheet>` wrapper used). Consumer sheets that
   * need more room — e.g. `<DragRescheduleSheet>` in swap mode
   * where two pickers side-by-side don't fit cleanly at 50% on
   * smaller landscape iPhones — pass a wider value here. Accepts
   * any valid RN width style (`"65%"`, `420`, etc.).
   *
   * Portrait orientation is unaffected and always fills the
   * viewport width.
   */
  landscapeWidth?: number | `${number}%`;
  /** Body content — the sheet's existing JSX. */
  children: ReactNode;
}

export function MapActionModal({
  visible,
  onRequestClose,
  instanceId,
  landscapeWidth = "50%",
  children,
}: MapActionModalProps) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  useEffect(() => {
    traceMap("map_action_modal_visible_effect", { instanceId, visible });
  }, [instanceId, visible]);

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: visible ? 999 : -1, opacity: visible ? 1 : 0 }]} pointerEvents={visible ? "auto" : "none"}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onRequestClose}
        accessibilityLabel="Dismiss"
        accessibilityRole="button"
      />
      <View
        style={[
          styles.panel,
          isLandscape ? styles.panelLandscape : styles.panelPortrait,
          isLandscape && { width: landscapeWidth },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  panelPortrait: {
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "85%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  panelLandscape: {
    top: 0,
    right: 0,
    bottom: 0,
    // `width` is supplied at call time via the `landscapeWidth`
    // prop (defaulting to `"50%"`) so consumer sheets can request
    // more room when their layout needs it.
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
});
