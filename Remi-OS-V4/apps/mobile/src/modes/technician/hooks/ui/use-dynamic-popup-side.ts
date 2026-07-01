/**
 * `useDynamicPopupSide` (PR-UX-19) — generalized "appear on the
 * opposite side of the activity" positioning hook.
 *
 * Background
 * ──────────
 * The `AppointmentDetailSheet` precedent (P2-FE-5 chunk 2c-prep,
 * 2026-04-22; see `docs/PLAN-DEVIATIONS.md#2026-04-22-half-width-detail-sheet`)
 * pins a half-width sheet to the side of the calendar OPPOSITE the
 * tapped event so the source row stays visible while the sheet is
 * open. That logic lives inline in `app/(tabs)/index.tsx`'s
 * `handleRCEventPress` handler — it computes a day index from the
 * tapped event's date relative to `workweekStartDate` and then maps
 * `dayIndex < 2 → "right"` / `>= 2 → "left"`.
 *
 * PR-UX-19 generalises that logic into a reusable hook so any future
 * "drawer-on-the-opposite-side-of-the-activity" UI (the upcoming
 * customer-info popup-on-tap is the next consumer per the user
 * request) can branch on the same primitive without re-implementing
 * the X-coord ↔ side mapping. The first consumer is the
 * `ChainToChainConflictToast`, which previously rendered as a
 * top-anchored full-width banner that covered the very chains the
 * user was looking at — exactly the failure mode the precedent
 * drawer's half-width design exists to solve.
 *
 * Contract
 * ────────
 * The pure helper `computePopupSide(x, viewportWidth)` returns the
 * side the popup should render on:
 *
 *   - `x < viewportWidth / 2`  → "right" (activity on left → popup on right)
 *   - `x >= viewportWidth / 2` → "left"  (activity on right → popup on left)
 *
 * Edge cases — pinned by the unit tests:
 *
 *   - x exactly at midpoint (`viewportWidth / 2`)  → "left"
 *     (the user spec says "default to left at midpoint"; the
 *      `>=` comparison realises this without a special case).
 *   - x = 0 (left edge)                            → "right"
 *   - x = viewportWidth (right edge)               → "left"
 *   - viewportWidth <= 0                           → "right"
 *     (degenerate; we don't have a meaningful split, so we fall
 *      back to the "popup on right" default which matches reading
 *      flow direction).
 *
 * The hook layer adds:
 *
 *   - `wrapperStyle` — half-width absolute-position style mirroring
 *     `AppointmentDetailSheet`'s `wrapperStyle` calc. Width is 65 %
 *     of viewport in landscape and 50 % - safe-area-inset in
 *     portrait per the PR-UX-19 spec ("≤ 65 % landscape, ≤ 50 % +
 *     safe inset portrait"). The outer-edge inset always gets
 *     subtracted so the popup clears the Dynamic Island / notch in
 *     landscape and the keyboard area in portrait.
 *   - `popupWidth` — the resolved width (post-inset) for animations
 *     that need to know how far to translate the card off-screen.
 *
 * Anti-instructions
 * ─────────────────
 *   - Don't pass `viewportWidth: 0` deliberately to "disable" the
 *     hook; the hook returns a conservative default (`side: "right"`,
 *     `wrapperStyle: null`) when conflictX is null/undefined, which
 *     is the proper escape hatch.
 *   - Don't read `useWindowDimensions` at the call site AND pass
 *     `viewportWidth` — the hook already calls it. The override is
 *     for tests only.
 *   - Don't add a `"full"` variant. The point of this hook is the
 *     half-screen pinned popup pattern; full-width behaviour
 *     belongs in a different component (e.g. `SwapToast`).
 */

import { useMemo } from "react";
import { useWindowDimensions, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type PopupSide = "left" | "right";

export interface ComputePopupSideArgs {
  /** X coordinate of the activity on the calendar canvas, in
   *  viewport-relative coords (0 = left edge, viewportWidth = right
   *  edge). */
  x: number;
  viewportWidth: number;
}

/**
 * Pure side selector. Pulled out of the hook so unit tests can pin
 * the mapping without mocking `useWindowDimensions` /
 * `useSafeAreaInsets`.
 */
export function computePopupSide({
  x,
  viewportWidth,
}: ComputePopupSideArgs): PopupSide {
  // Degenerate viewport — fall back to the reading-flow default.
  // Tests pin this so a future accidental NaN propagation surfaces.
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return "right";
  if (!Number.isFinite(x)) return "right";

  const midpoint = viewportWidth / 2;
  // `>=` so x exactly at the midpoint defaults to "left" (the user
  // spec's tie-break). Activity on the right half → popup on the left.
  if (x >= midpoint) return "left";
  return "right";
}

export interface UseDynamicPopupSideArgs {
  /**
   * X coordinate of the activity on the calendar canvas in
   * viewport-relative coords. `null` / `undefined` means "no
   * positioning info available yet" — the hook returns the safe
   * default (right side, no wrapper) so the consumer can fall back
   * to its own layout.
   */
  conflictX: number | null | undefined;
  /**
   * Optional viewport-width override. Defaults to
   * `useWindowDimensions().width`. Provided so the hook's pure
   * `side` output is deterministic in tests, AND so a future
   * caller embedded in a constrained layout (e.g. an iPad split
   * view) can substitute the constrained width without affecting
   * `useWindowDimensions`.
   */
  viewportWidth?: number;
  /**
   * Orientation hint. The popup width target is wider in landscape
   * (65 % vs 50 %) per the PR-UX-19 spec. When omitted, the hook
   * derives orientation from the resolved `viewportWidth` vs
   * `useWindowDimensions().height` (`width > height` → landscape).
   */
  orientation?: "portrait" | "landscape";
}

export interface UseDynamicPopupSideResult {
  /**
   * `"left"` or `"right"` — which side of the calendar the popup
   * should render on. Always populated; falls back to `"right"` when
   * `conflictX` is null/undefined or the viewport is degenerate.
   */
  side: PopupSide;
  /**
   * Absolute-position wrapper style mirroring `AppointmentDetailSheet`'s
   * `wrapperStyle`. Pinned to the chosen `side` with a width of
   * 65 % (landscape) / 50 % - safeAreaInset (portrait). `null` when
   * `conflictX` is null/undefined — caller should not render the
   * positioned popup in that case.
   */
  wrapperStyle: ViewStyle | null;
  /**
   * Resolved popup width in pt (post-inset). Useful for animations
   * that need to translate the card off-screen by its own width.
   * Falls back to half the viewport when `wrapperStyle` is null.
   */
  popupWidth: number;
}

const LANDSCAPE_WIDTH_FRACTION = 0.65;
const PORTRAIT_WIDTH_FRACTION = 0.5;

export function useDynamicPopupSide({
  conflictX,
  viewportWidth,
  orientation,
}: UseDynamicPopupSideArgs): UseDynamicPopupSideResult {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const resolvedWidth =
    typeof viewportWidth === "number" && viewportWidth > 0
      ? viewportWidth
      : window.width;
  const resolvedOrientation =
    orientation ?? (resolvedWidth > window.height ? "landscape" : "portrait");

  return useMemo<UseDynamicPopupSideResult>(() => {
    if (
      conflictX === null ||
      conflictX === undefined ||
      !Number.isFinite(conflictX)
    ) {
      // No positioning info — return the safe default and let the
      // caller render its content however it wants. We still emit a
      // sensible `popupWidth` so animation math doesn't have to
      // special-case "wrapper not ready yet".
      return {
        side: "right",
        wrapperStyle: null,
        popupWidth: Math.round(resolvedWidth * PORTRAIT_WIDTH_FRACTION),
      };
    }

    const side = computePopupSide({ x: conflictX, viewportWidth: resolvedWidth });

    // Width target. Landscape wants the wider 65 % per spec because
    // the calendar grid is large enough that 50 % feels cramped for
    // popup content; portrait wants the tighter 50 % so the
    // calendar half opposite the popup remains usable.
    const widthFraction =
      resolvedOrientation === "landscape"
        ? LANDSCAPE_WIDTH_FRACTION
        : PORTRAIT_WIDTH_FRACTION;
    // Outer-edge safe-area inset (the edge touching the device
    // bezel). In landscape this is the notch / Dynamic Island side;
    // in portrait it's narrower (typically 0 on most phones, but
    // the API still honors it on devices that report a non-zero
    // left/right inset in portrait).
    const outerInset = side === "left" ? insets.left : insets.right;

    const baseWidth = Math.round(resolvedWidth * widthFraction);
    // Subtract the outer inset so the popup edge sits flush with
    // the calendar's safe-area boundary, not under the bezel. Clamp
    // to a sensible minimum so vanishingly-narrow viewports don't
    // produce a 0-width popup that the user can't see.
    const popupWidth = Math.max(baseWidth - outerInset, 200);

    const wrapperStyle: ViewStyle = {
      position: "absolute",
      top: 0,
      bottom: 0,
      width: popupWidth,
      ...(side === "left"
        ? { left: insets.left }
        : { right: insets.right }),
    };

    return { side, wrapperStyle, popupWidth };
  }, [
    conflictX,
    resolvedWidth,
    resolvedOrientation,
    insets.left,
    insets.right,
  ]);
}
