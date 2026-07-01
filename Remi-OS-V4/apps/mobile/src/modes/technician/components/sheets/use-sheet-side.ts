import { useMemo } from "react";
import { useWindowDimensions } from "react-native";

/**
 * LDM-WAVE-2 CHUNK-2 (SHEETS-1) — Sheet-side picker.
 *
 * Deterministic logic for picking which side (`"left"` | `"right"` |
 * `"full"`) a sheet should render on, plus the matching snap-point set.
 * The canonical surface for new code is `<AppSheet>` (the same file's
 * sibling) — this hook is exported for escape-hatch consumers that
 * need to know the side ahead of mounting.
 *
 * Locked product invariant: **sheets are never half-width in portrait.**
 * Even an explicit `forceSide: "left"` is overridden to `"full"` in
 * portrait, and a `__DEV__` warning fires so the misuse surfaces
 * loudly. See the side-picking math below for the structural enforcement.
 *
 * Spec: REMIBackend/docs/implementation-plans/landscape-dispatch-map-wave-2.md
 *       §CHUNK-2
 */

export type SheetSide = "left" | "right" | "full";

export interface UseSheetSideInput {
  /** X coordinate of the tap that opened the sheet (screen-space px). */
  tapX?: number;
  /**
   * X coordinate of the drag-release point. Takes precedence over
   * `tapX` — release is more reflective of the user's current intent
   * than the initial tap.
   */
  dropX?: number;
  /**
   * Explicit override. Ignored in portrait (locked invariant). In
   * landscape, beats `tapX`/`dropX`/`defaultSide`.
   */
  forceSide?: SheetSide;
  /**
   * Landscape fallback when no `tapX`/`dropX`/`forceSide` is supplied.
   * Defaults to `"right"`. Per-sheet overridable.
   */
  defaultSide?: SheetSide;
  /** Override for `useWindowDimensions().width > height`. */
  isLandscape?: boolean;
  /** Override for `useWindowDimensions().width`. */
  screenWidth?: number;
  /** Snap points when the resolved side is `"full"`. Defaults to `["50%","90%"]`. */
  defaultSnapPoints?: string[];
  /** Snap points when the resolved side is `"left"`/`"right"`. Defaults to `["60%","95%"]`. */
  halfWidthSnapPoints?: string[];
}

export interface UseSheetSideResult {
  side: SheetSide;
  recommendedSnapPoints: string[];
}

const DEFAULT_SNAP_POINTS = ["50%", "90%"];
const HALF_WIDTH_SNAP_POINTS = ["60%", "95%"];

/**
 * Pure, deterministic resolver shared by `useSheetSide` (hook entry
 * point with `useWindowDimensions` defaults) and the hermetic tests.
 * Exported separately so the tests don't have to mock dimensions —
 * they pass `isLandscape` + `screenWidth` directly.
 */
export function resolveSheetSide(
  input: UseSheetSideInput & { isLandscape: boolean; screenWidth: number }
): SheetSide {
  const { isLandscape, screenWidth, tapX, dropX, forceSide, defaultSide } = input;

  // Portrait check is FIRST and UNCONDITIONAL. Even a deliberate
  // forceSide: "left" in portrait returns "full" — half-width sheets
  // wrap badly on portrait phones (the user explicitly locked this
  // down during the 2026-05-16 spec revision).
  if (!isLandscape) {
    if (
      __DEV__ &&
      forceSide !== undefined &&
      forceSide !== "full"
    ) {
      console.warn(
        "[useSheetSide] forceSide ignored in portrait — sheets are always full-width in portrait."
      );
    }
    return "full";
  }

  // Landscape from here on.
  if (forceSide !== undefined) return forceSide;
  const x = dropX ?? tapX;
  if (x === undefined) return defaultSide ?? "right";

  // Pin sheet to the half OPPOSITE the touch point so the source row
  // stays visible. A tap on the right half (`x > screenWidth/2`) →
  // sheet on the LEFT.
  return x > screenWidth / 2 ? "left" : "right";
}

export function useSheetSide(input: UseSheetSideInput = {}): UseSheetSideResult {
  const { width, height } = useWindowDimensions();
  const isLandscape = input.isLandscape ?? width > height;
  const screenWidth = input.screenWidth ?? width;

  const side = useMemo(
    () =>
      resolveSheetSide({
        ...input,
        isLandscape,
        screenWidth,
      }),
    // We intentionally depend on every observable input; eslint's
    // exhaustive-deps doesn't see through the spread.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      isLandscape,
      screenWidth,
      input.tapX,
      input.dropX,
      input.forceSide,
      input.defaultSide,
    ]
  );

  const recommendedSnapPoints = useMemo(() => {
    if (side === "full") return input.defaultSnapPoints ?? DEFAULT_SNAP_POINTS;
    return input.halfWidthSnapPoints ?? HALF_WIDTH_SNAP_POINTS;
  }, [side, input.defaultSnapPoints, input.halfWidthSnapPoints]);

  return { side, recommendedSnapPoints };
}
