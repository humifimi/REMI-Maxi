/**
 * MapToggleButton (P2-FE-7) — landscape map/grid switcher.
 *
 * Built on the same `EdgeTab` primitive as the multi-tech rendering
 * picker. Two visual states with deliberate part vocabulary:
 *
 * CLOSED state:
 *   - `tab handle` — wide pill that bleeds off the screen edge with a
 *     mode icon + chevron. Tapping it opens the drawer.
 *
 * OPEN state:
 *   - `drawer` — dark expandable panel containing the options.
 *   - `drawer items` (or `options`) — Map / Grid Pressables inside the
 *     drawer; the selected one shows an `active pill` highlight.
 *   - `notch` — slim dark pill containing only the chevron, sitting
 *     flush against the drawer's inside edge. Tapping it closes the
 *     drawer.
 *
 * Edge selection mirrors the avatar strip rule but inverted:
 *   - `preferredHand === "right"` → strip lives on the right edge,
 *     this control anchors to the LEFT edge.
 *   - `preferredHand === "left"`  → strip on the left, control on the
 *     RIGHT.
 * Alignment is always `"start"` so the tab handle sits at the top
 * corner, leaving the busy bottom corner free for the multi-tech tab.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getOppositeEdge,
  useAccessibilityStore,
  type PreferredHand,
} from "@technician/stores/accessibility";
import { EdgeTab } from "@/src/components/shared/edge-tab";

interface InsetsOverride {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * How far the dark handle background bleeds past the screen edge so it
 * reads as if the tab is emerging from the side of the device. The
 * handle's edge-side padding compensates by the same amount + the
 * desired visible inset, so the icons stay anchored over the gutter
 * while only the background extends off-screen.
 */
const OFFSCREEN_BLEED = 16;
/** Visible distance from the screen edge to the inner icon when CLOSED. */
const VISIBLE_ICON_INSET = 11;
/**
 * Visible inset for the drawer's outer edge to the option's outer
 * edge. Used for both the LEFT side (after compensating for the
 * off-screen bleed) and the RIGHT side (`DRAWER_INNER_BUFFER`
 * below) so the option sits centered inside the visible drawer.
 */
const PANEL_VISIBLE_INSET = 14;
/**
 * Horizontal breathing room between the drawer's inside edge and the
 * option/active-pill edge on the RIGHT side. Mirrors the visible left
 * buffer that `PANEL_VISIBLE_INSET` produces, so the option sits
 * centered inside the drawer with equal margin on both sides.
 */
const DRAWER_INNER_BUFFER = 14;
/**
 * Notch flush mode: 0 = no overlap (notch is truly flush against the
 * drawer with no bleed). The drawer's inside corner radius is dropped
 * to 0 in OPEN state (see `panelInsideFlatCorners`) so the square
 * notch left edge meets the now-square drawer right edge cleanly.
 */
const NOTCH_OVERLAP = 0;
/**
 * Distance the drawer shifts toward the screen edge when open. Both
 * drawer ends move by this amount; the drawer's `paddingLeft`
 * compensates so the option icons stay anchored visually.
 */
const PANEL_SHIFT = 12;
/** Chevron icon size on the open-state notch (half of 16). */
const OPEN_CHEVRON_SIZE = 8;
/**
 * Vertical offset from the safe-area top inset to the top of the
 * map toggle handle. Exported so siblings that stack underneath the
 * handle (notably `PendingRealityHUD`, P3-FE-3) can derive their own
 * `top` from the same source — rather than silently copying the `13`
 * literal and breaking the moment this offset changes.
 */
export const MAP_TOGGLE_HANDLE_TOP_OFFSET = 13;
/**
 * Min-height of the map toggle handle (Apple HIG minimum touch
 * target). The same value is repeated as `minHeight` inside
 * `styles.handle` below so the visual layout matches what siblings
 * compute. Exported for the same reason as
 * `MAP_TOGGLE_HANDLE_TOP_OFFSET`.
 */
export const MAP_TOGGLE_HANDLE_HEIGHT = 44;
/**
 * Side padding inside the notch around the chevron. Smaller than the
 * tab handle's padding because the notch only houses one tiny icon.
 */
const NOTCH_SIDE_PADDING = 2;

interface MapToggleButtonProps {
  mapMode: boolean;
  onMapModeChange: (mapMode: boolean) => void;
  preferredHandOverride?: PreferredHand;
  safeAreaInsetsOverride?: InsetsOverride;
}

export function MapToggleButton({
  mapMode,
  onMapModeChange,
  preferredHandOverride,
  safeAreaInsetsOverride,
}: MapToggleButtonProps) {
  const safeArea = useSafeAreaInsets();
  const insets = safeAreaInsetsOverride ?? safeArea;
  const storePreferredHand = useAccessibilityStore((s) => s.preferredHand);
  const preferredHand = preferredHandOverride ?? storePreferredHand;

  const edge = getOppositeEdge(preferredHand);
  // Bleed the handle off the canvas edge so it reads as if it's
  // emerging from the side of the screen. The container sits at a
  // negative side offset (`OFFSCREEN_BLEED`) and the handle compensates
  // with extra side padding so the icons still land at the desired
  // visible position over the time gutter. Top is a small nudge below
  // the status bar.
  const containerStyle =
    edge === "left"
      ? {
          top: insets.top + MAP_TOGGLE_HANDLE_TOP_OFFSET,
          left: -OFFSCREEN_BLEED,
        }
      : {
          top: insets.top + MAP_TOGGLE_HANDLE_TOP_OFFSET,
          right: -OFFSCREEN_BLEED,
        };

  // Handle/panel rounding mirrors the multi-tech tab's
  // `borderTopLeftRadius: 6, borderBottomLeftRadius: 6` rule (round the
  // inside-pointing corners only, leaving the edge-flush corners flat).
  const handleStyleForEdge =
    edge === "left" ? styles.handleLeft : styles.handleRight;
  const panelStyleForEdge =
    edge === "left" ? styles.panelLeft : styles.panelRight;
  // Drawer padding overrides. The drawer inherits the same negative
  // container offset as the tab handle, so its inner content needs to
  // be pushed back inward by the bleed amount or the option icons
  // get clipped by the screen wall. We additionally shift the drawer
  // toward the screen edge (`PANEL_SHIFT`) and bump the inside-side
  // padding to give equal breathing room between the drawer edge and
  // the option pill on BOTH sides (`DRAWER_INNER_BUFFER`).
  const drawerEdgePadding =
    edge === "left"
      ? {
          marginLeft: -PANEL_SHIFT,
          paddingLeft: OFFSCREEN_BLEED + PANEL_VISIBLE_INSET + PANEL_SHIFT,
          paddingRight: DRAWER_INNER_BUFFER,
        }
      : {
          marginRight: -PANEL_SHIFT,
          paddingRight: OFFSCREEN_BLEED + PANEL_VISIBLE_INSET + PANEL_SHIFT,
          paddingLeft: DRAWER_INNER_BUFFER,
        };
  // When OPEN, drop the drawer's inside-edge corner radius to 0 so
  // the square notch sits flush against a square drawer edge. The
  // outside corner stays rounded (or rather, hidden off-screen).
  const panelInsideFlatCorners =
    edge === "left"
      ? { borderTopRightRadius: 0, borderBottomRightRadius: 0 }
      : { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 };
  // Returns the side-padding override for the handle Pressable.
  // CLOSED (tab handle): bleeds off the screen edge, so it needs the
  //   bleed compensation to push the icons inward to their visible
  //   position over the time gutter.
  // OPEN (notch): sits AFTER the drawer (well inside the canvas), so
  //   no bleed compensation is needed; tight padding + zero overlap
  //   yields a slim, flush-against-the-drawer notch.
  const handleBleedPaddingFor = (isOpen: boolean) => {
    if (isOpen) {
      const notchPad = {
        paddingLeft: NOTCH_SIDE_PADDING,
        paddingRight: NOTCH_SIDE_PADDING,
      };
      return edge === "left"
        ? { ...notchPad, marginLeft: -NOTCH_OVERLAP }
        : { ...notchPad, marginRight: -NOTCH_OVERLAP };
    }
    return edge === "left"
      ? {
          paddingLeft: OFFSCREEN_BLEED + VISIBLE_ICON_INSET,
          paddingRight: 4,
        }
      : {
          paddingLeft: 4,
          paddingRight: OFFSCREEN_BLEED + VISIBLE_ICON_INSET,
        };
  };

  return (
    <EdgeTab
      edge={edge}
      alignment="start"
      panelSize={130}
      testID="landscape-map-toggle-anchor"
      containerStyle={containerStyle}
      handleStyle={styles.handleWrap}
      panelStyle={[
        styles.panel,
        panelStyleForEdge,
        drawerEdgePadding,
        panelInsideFlatCorners,
      ]}
      handle={({ isOpen, toggle }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isOpen ? "Close map toggle drawer" : "Open map toggle drawer"
          }
          onPress={toggle}
          hitSlop={8}
          style={({ pressed }) => [
            styles.handle,
            handleStyleForEdge,
            handleBleedPaddingFor(isOpen),
            isOpen ? styles.handleOpen : null,
            pressed ? styles.handlePressed : null,
          ]}
          testID="landscape-map-toggle-button"
        >
          {isOpen ? null : (
            <MaterialIcons
              color="#FFFFFF"
              name={mapMode ? "map" : "calendar-view-week"}
              size={16}
            />
          )}
          <MaterialIcons
            color="#FFFFFF"
            name={handleChevronName(edge, isOpen)}
            size={isOpen ? OPEN_CHEVRON_SIZE : 16}
          />
        </Pressable>
      )}
    >
      {({ close }) => (
        <MapToggleDrawer
          close={close}
          mapMode={mapMode}
          onMapModeChange={onMapModeChange}
        />
      )}
    </EdgeTab>
  );
}

function MapToggleDrawer({
  mapMode,
  onMapModeChange,
  close,
}: {
  mapMode: boolean;
  onMapModeChange: (mapMode: boolean) => void;
  close: () => void;
}) {
  return (
    <View style={styles.drawer} testID="landscape-map-toggle-panel-content">
      <DrawerOption
        icon="map"
        label="Map"
        active={mapMode}
        onPress={() => {
          onMapModeChange(true);
          close();
        }}
        testID="landscape-map-toggle-segment-map"
      />
      <DrawerOption
        icon="calendar-view-week"
        label="Grid"
        active={!mapMode}
        onPress={() => {
          onMapModeChange(false);
          close();
        }}
        testID="landscape-map-toggle-segment-grid"
      />
    </View>
  );
}

function DrawerOption({
  icon,
  label,
  active,
  onPress,
  testID,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
  active: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Switch to ${label.toLowerCase()} mode`}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.option,
        active ? styles.optionActive : null,
        pressed ? styles.optionPressed : null,
      ]}
      testID={testID}
    >
      <MaterialIcons
        color={active ? "#FFFFFF" : "#D1D5DB"}
        name={icon}
        size={16}
      />
      <Text
        allowFontScaling={false}
        style={[styles.optionLabel, active ? styles.optionLabelActive : null]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Pick the chevron that visually indicates the panel direction.
 * Mirrors `handleChevronName` in `LandscapeWorkweekView` so the map
 * toggle drawer reads identically to the multi-tech tab handle.
 */
function handleChevronName(
  edge: "left" | "right",
  isOpen: boolean,
): "chevron-left" | "chevron-right" {
  if (edge === "left") return isOpen ? "chevron-left" : "chevron-right";
  return isOpen ? "chevron-right" : "chevron-left";
}

const styles = StyleSheet.create({
  handleWrap: {
    zIndex: 120,
  },
  handle: {
    minWidth: 36,
    minHeight: MAP_TOGGLE_HANDLE_HEIGHT,
    paddingHorizontal: 4,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: "rgba(17,24,39,0.85)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.2)",
  },
  handlePressed: {
    backgroundColor: "rgba(17,24,39,0.65)",
  },
  handleOpen: {
    // Match the panel's background + drop the border so the chevron
    // pill bleeds back into the drawer as one continuous dark shape
    // instead of two separate floating pills.
    backgroundColor: "rgba(17,24,39,0.92)",
    borderWidth: 0,
  },
  handleLeft: {
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  handleRight: {
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
  },
  panel: {
    backgroundColor: "rgba(17,24,39,0.92)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.2)",
    padding: 6,
    justifyContent: "flex-start",
    zIndex: 100,
  },
  panelLeft: {
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  panelRight: {
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
  },
  drawer: {
    flexDirection: "column",
    gap: 4,
  },
  option: {
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  optionActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  optionPressed: {
    opacity: 0.7,
  },
  optionLabel: {
    color: "#D1D5DB",
    fontSize: 12,
    fontWeight: "600",
  },
  optionLabelActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
