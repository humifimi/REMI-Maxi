/**
 * EdgeTab — universal edge-anchored collapsible drawer primitive.
 *
 * EdgeTab is intentionally **function-agnostic**: it owns nothing but
 * positioning, open/close state, and the open/close animation. It does
 * not assume:
 *
 *   - the handle's only job is to toggle (consumers wrap their own
 *     Pressable / LongPress / Pan / nothing-at-all around their handle
 *     content);
 *   - the panel contains controls (it's just `children`);
 *   - the gesture that opens it is a tap (consumers call `open()` /
 *     `close()` / `toggle()` from anywhere they please);
 *   - haptics are wanted (consumers fire their own).
 *
 * What EdgeTab *does* own:
 *
 *   - Absolute positioning anchored to one of `top` | `bottom` | `left`
 *     | `right`, aligned at `start` | `center` | `end` along that edge.
 *   - The handle is always visible; the panel renders only when open
 *     (so consumers don't pay the render cost for closed panels).
 *   - A perpendicular slide animation driven by `Animated` with
 *     `useNativeDriver: true`. `animationType="fade"` and `"none"`
 *     are also supported.
 *   - Controlled (`open` + `onOpenChange`) and uncontrolled
 *     (`defaultOpen`) modes, matching the React-conventional pattern.
 *
 * Both `handle` and `children` accept either a `ReactNode` or a render
 * prop receiving `{ isOpen, open, close, toggle }`. This is what makes
 * the common toggle-button case a one-liner and the long-press / status
 * peek / compound-handle cases possible without compound-component
 * boilerplate.
 *
 * Initial caller: `LandscapeWorkweekView` uses one of these in the
 * bottom-side corner of the calendar to host the multi-tech overlay
 * mode picker (Ship 3, P2-FE-4 follow-up #10). Future expected
 * callers: filter drawers on list views, debug toggles, quick-action
 * trays, notification peek panels.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Animated,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export type EdgeTabEdge = "top" | "bottom" | "left" | "right";
export type EdgeTabAlignment = "start" | "center" | "end";
export type EdgeTabAnimationType = "slide" | "fade" | "none";

export interface EdgeTabRenderArgs {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export interface EdgeTabProps {
  edge: EdgeTabEdge;
  /** Position along the edge. Defaults to `"center"`. */
  alignment?: EdgeTabAlignment;

  /** Controlled open state. Pair with `onOpenChange`. */
  open?: boolean;
  /** Initial open state when uncontrolled. Defaults to `false`. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;

  /**
   * Always-visible handle. Consumer is responsible for any tap /
   * long-press / gesture wiring; EdgeTab just gives them helpers.
   */
  handle: ReactNode | ((args: EdgeTabRenderArgs) => ReactNode);
  /** Panel body. Mounted only while open. */
  children: ReactNode | ((args: EdgeTabRenderArgs) => ReactNode);

  /**
   * Size of the panel perpendicular to the edge, in points.
   * Width if `edge` is `"left"` or `"right"`, height if `"top"` or
   * `"bottom"`. Defaults to 240.
   */
  panelSize?: number;

  /** Defaults to 150ms. */
  animationDuration?: number;
  /** Defaults to `"slide"`. */
  animationType?: EdgeTabAnimationType;

  panelStyle?: StyleProp<ViewStyle>;
  /** Outer absolute-positioning override (rare). */
  containerStyle?: StyleProp<ViewStyle>;
  /** Wrapper around the handle; useful for borders, shadows, etc. */
  handleStyle?: StyleProp<ViewStyle>;

  testID?: string;
}

const DEFAULT_PANEL_SIZE = 240;
const DEFAULT_ANIMATION_DURATION = 150;

const isHorizontalEdge = (edge: EdgeTabEdge): boolean =>
  edge === "left" || edge === "right";

/**
 * Compute the absolute-position rules that anchor the wrapper to the
 * requested `edge` + `alignment` corner. The wrapper is laid out as a
 * flex row/column whose **main axis** is perpendicular to the edge so
 * the handle and panel stack outward (handle outside, panel inside).
 */
function getContainerStyle(
  edge: EdgeTabEdge,
  alignment: EdgeTabAlignment,
): ViewStyle {
  const horizontal = isHorizontalEdge(edge);
  const base: ViewStyle = {
    position: "absolute",
    flexDirection: horizontal ? "row" : "column",
    alignItems: "stretch",
  };
  if (edge === "right") base.right = 0;
  if (edge === "left") base.left = 0;
  if (edge === "top") base.top = 0;
  if (edge === "bottom") base.bottom = 0;
  if (horizontal) {
    if (alignment === "start") base.top = 0;
    else if (alignment === "end") base.bottom = 0;
    else {
      base.top = "50%";
    }
  } else {
    if (alignment === "start") base.left = 0;
    else if (alignment === "end") base.right = 0;
    else {
      base.left = "50%";
    }
  }
  return base;
}

/**
 * Order the handle and panel inside the wrapper so the handle is on
 * the **outside** (closest to the edge) and the panel grows inward.
 * For `right`/`bottom` edges the handle should be the *first* child
 * (rendered at `right: 0` / `bottom: 0`); for `left`/`top` the panel
 * comes first and the handle hangs off the inside-pointing end.
 *
 * Returns `true` when the handle should render before the panel.
 */
const handleFirst = (edge: EdgeTabEdge): boolean =>
  edge === "right" || edge === "bottom";

export function EdgeTab({
  edge,
  alignment = "center",
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  handle,
  children,
  panelSize = DEFAULT_PANEL_SIZE,
  animationDuration = DEFAULT_ANIMATION_DURATION,
  animationType = "slide",
  panelStyle,
  containerStyle,
  handleStyle,
  testID,
}: EdgeTabProps) {
  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = isControlled ? (controlledOpen as boolean) : uncontrolledOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const open = useCallback(() => setOpen(true), [setOpen]);
  const close = useCallback(() => setOpen(false), [setOpen]);
  const toggle = useCallback(() => setOpen(!isOpen), [setOpen, isOpen]);

  const renderArgs = useMemo<EdgeTabRenderArgs>(
    () => ({ isOpen, open, close, toggle }),
    [isOpen, open, close, toggle],
  );

  // Animated progress 0 → 1. Slide collapses the panel by translating
  // it back toward the edge; fade collapses opacity. `none` just hides
  // the panel synchronously by skipping the `Animated.timing` entirely.
  const progress = useRef(new Animated.Value(isOpen ? 1 : 0)).current;
  useEffect(() => {
    if (animationType === "none") {
      progress.setValue(isOpen ? 1 : 0);
      return;
    }
    Animated.timing(progress, {
      toValue: isOpen ? 1 : 0,
      duration: animationDuration,
      useNativeDriver: true,
    }).start();
  }, [isOpen, animationDuration, animationType, progress]);

  const horizontal = isHorizontalEdge(edge);
  const animatedPanelStyle = useMemo<Animated.WithAnimatedObject<ViewStyle>>(
    () => {
      if (animationType === "fade" || animationType === "none") {
        return { opacity: progress };
      }
      // slide: collapsed = panel translated `panelSize` back toward
      // the edge; open = translateX/Y of 0.
      const translate = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [
          edge === "right" || edge === "bottom" ? panelSize : -panelSize,
          0,
        ],
      });
      return horizontal
        ? { transform: [{ translateX: translate }] }
        : { transform: [{ translateY: translate }] };
    },
    [animationType, edge, horizontal, panelSize, progress],
  );

  const renderedHandle = typeof handle === "function" ? handle(renderArgs) : handle;
  const renderedChildren =
    typeof children === "function" ? children(renderArgs) : children;

  const handleNode = (
    <View
      key="handle"
      style={handleStyle}
      testID={testID ? `${testID}-handle` : undefined}
    >
      {renderedHandle}
    </View>
  );

  // Panel mounts only when open OR mid-animation. Easiest correct
  // approach: keep mounted whenever `isOpen` is true, unmount when
  // closed. This means the close animation runs against a panel that
  // disappears at the end — fine because the slide moves it offscreen
  // anyway. For consumers who need the panel to stay alive across
  // close cycles (preserve scroll position, form state, etc.), they
  // can hoist that state above EdgeTab — same pattern as `Modal`.
  const panelNode = isOpen ? (
    <Animated.View
      key="panel"
      style={[
        styles.panel,
        horizontal ? { width: panelSize } : { height: panelSize },
        animatedPanelStyle,
        panelStyle,
      ]}
      testID={testID ? `${testID}-panel` : undefined}
      pointerEvents={isOpen ? "auto" : "none"}
    >
      {renderedChildren}
    </Animated.View>
  ) : null;

  const childrenInOrder = handleFirst(edge)
    ? [handleNode, panelNode]
    : [panelNode, handleNode];

  return (
    <View
      style={[getContainerStyle(edge, alignment), containerStyle]}
      testID={testID}
      pointerEvents="box-none"
    >
      {childrenInOrder}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    overflow: "hidden",
  },
});
