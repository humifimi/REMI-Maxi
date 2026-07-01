import { forwardRef, useCallback, useEffect, useMemo, useRef } from "react";
import { View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// AppSheet is the only sanctioned consumer of @gorhom/bottom-sheet's
// default export; all other call sites must go through this component
// (enforced by the no-restricted-imports lint rule in eslint.config.js).
// eslint-disable-next-line no-restricted-imports
import BottomSheet, { BottomSheetProps } from "@gorhom/bottom-sheet";
import * as Sentry from "@sentry/react-native";
import { resolveSheetSide, type SheetSide } from "./use-sheet-side";

// 2026-05-17 deploy-verification instrumentation. Every AppSheet
// instance auto-reports its lifecycle as Sentry breadcrumbs so we
// can tell from event data whether a "the sheet didn't appear" bug
// is at the React state level, the AppSheet-resolve level, the
// imperative-open level, or the gorhom BottomSheet animation level.
// Category 'app-sheet' is distinct from 'route-map' so Sentry
// filters can isolate sheet-specific noise.
function traceAppSheet(message: string, data?: Record<string, unknown>): void {
  Sentry.addBreadcrumb({
    category: "app-sheet",
    message,
    level: "info",
    data,
  });
}

let __appSheetInstanceCounter = 0;

/**
 * LDM-WAVE-2 CHUNK-2 (SHEETS-1) — Canonical sheet component.
 *
 * Wraps `@gorhom/bottom-sheet`'s `BottomSheet` with the half-width-on-
 * landscape behavior baked in by default. Every sheet in the app
 * (excluding the 8 portrait-only `<Modal>`-based sheets, which are
 * out-of-scope forever) goes through this component.
 *
 * Locked product invariant: portrait → full-width, always. The
 * portrait-override branch fires unconditionally — see
 * `resolveSheetSide` — and an explicit `forceSide: "left"` in
 * portrait is silently overridden with a `__DEV__` warning.
 *
 * The half-width path renders the `BottomSheet` inside a positioned
 * `<View>` because gorhom's `BottomSheetHostingContainer` applies
 * `StyleSheet.absoluteFill` AFTER any `containerStyle` we pass — RN
 * silently ignores `width` when both `left` and `right` are set, so
 * the only way to position the sheet is to wrap it in a `<View>` with
 * explicit dimensions and let the sheet's absoluteFill fill THAT
 * wrapper. `pointerEvents="box-none"` keeps the visible half of the
 * screen interactive (taps still register on what's underneath).
 *
 * Spec: REMIBackend/docs/implementation-plans/landscape-dispatch-map-wave-2.md
 *       §CHUNK-2
 */

export interface AppSheetProps
  // `snapPoints` is omitted because AppSheet derives it internally
  // from the side-picking result (`useSheetSide().recommendedSnapPoints`).
  // Callers who need to customize provide `defaultSnapPoints` and/or
  // `halfWidthSnapPoints` instead.
  extends Omit<BottomSheetProps, "snapPoints" | "ref" | "children"> {
  /** X coordinate of the tap that opened the sheet (screen-space px). */
  tapX?: number;
  /** X coordinate of the drag release; beats `tapX` when both are present. */
  dropX?: number;
  /** Force a side in landscape; ignored in portrait. */
  forceSide?: SheetSide;
  /** Landscape fallback when no `tapX`/`dropX` is supplied. Defaults to `"right"`. */
  defaultSide?: SheetSide;
  /** Snap points when side resolves to `"full"`. Defaults to `["50%","90%"]`. */
  defaultSnapPoints?: string[];
  /** Snap points when side resolves to `"left"`/`"right"`. Defaults to `["60%","95%"]`. */
  halfWidthSnapPoints?: string[];
  children?: React.ReactNode;
}

const DEFAULT_SNAP_POINTS = ["50%", "90%"];
const HALF_WIDTH_SNAP_POINTS = ["60%", "95%"];

export const AppSheet = forwardRef<BottomSheet, AppSheetProps>(
  function AppSheet(
    {
      tapX,
      dropX,
      forceSide,
      defaultSide,
      defaultSnapPoints,
      halfWidthSnapPoints,
      children,
      onChange,
      ...bottomSheetProps
    },
    ref
  ) {
    const { width, height } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const isLandscape = width > height;

    // Per-instance id for tying breadcrumbs to a specific sheet. The
    // counter is module-local so it's stable for the lifetime of the
    // JS bundle; it resets to 0 after every cold launch.
    const instanceIdRef = useRef<number | null>(null);
    if (instanceIdRef.current === null) {
      __appSheetInstanceCounter += 1;
      instanceIdRef.current = __appSheetInstanceCounter;
    }
    const instanceId = instanceIdRef.current;

    const side = useMemo(
      () =>
        resolveSheetSide({
          tapX,
          dropX,
          forceSide,
          defaultSide,
          isLandscape,
          screenWidth: width,
        }),
      [tapX, dropX, forceSide, defaultSide, isLandscape, width]
    );

    const snapPoints = useMemo(
      () =>
        side === "full"
          ? defaultSnapPoints ?? DEFAULT_SNAP_POINTS
          : halfWidthSnapPoints ?? HALF_WIDTH_SNAP_POINTS,
      [side, defaultSnapPoints, halfWidthSnapPoints]
    );

    const wrapperStyle = useMemo(() => {
      if (side === "full") return null;
      const halfWidth = Math.round(width / 2);
      // Safe-area inset on the OUTER edge (the one touching the phone
      // bezel) so the sheet clears the Dynamic Island / notch in
      // landscape and aligns with already-inset content on the other
      // side. Matches the pre-AppSheet behavior of
      // appointment-detail-sheet (deviation 2026-04-22-half-width-detail-sheet).
      const outerInset = side === "left" ? insets.left : insets.right;
      return {
        position: "absolute" as const,
        top: 0,
        bottom: 0,
        left: side === "left" ? insets.left : halfWidth,
        width: halfWidth - outerInset,
      };
    }, [side, width, insets.left, insets.right]);

    // Mount-time breadcrumb so we can verify every AppSheet instance
    // mounted and which side it resolved to.
    useEffect(() => {
      traceAppSheet("mount", {
        instanceId,
        side,
        isLandscape,
        screenWidth: width,
        screenHeight: height,
        snapPoints,
        wrapperWidth: wrapperStyle?.width ?? null,
        wrapperLeft: wrapperStyle?.left ?? null,
      });
      return () => {
        traceAppSheet("unmount", { instanceId });
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Wrap the caller's onChange so we ALSO get a breadcrumb every
    // time the BottomSheet actually animates to a new snap index.
    // This is the ground-truth signal that the sheet did or did not
    // open — independent of any React state or imperative ref bug.
    const handleChange = useCallback(
      (index: number, position: number, type: number) => {
        traceAppSheet("on_change", { instanceId, index, position, type });
        onChange?.(index, position, type);
      },
      [instanceId, onChange]
    );

    if (side === "full") {
      return (
        <BottomSheet
          ref={ref}
          snapPoints={snapPoints}
          onChange={handleChange}
          {...bottomSheetProps}
        >
          {children}
        </BottomSheet>
      );
    }

    return (
      <View style={wrapperStyle} pointerEvents="box-none">
        <BottomSheet
          ref={ref}
          snapPoints={snapPoints}
          onChange={handleChange}
          {...bottomSheetProps}
        >
          {children}
        </BottomSheet>
      </View>
    );
  }
);
