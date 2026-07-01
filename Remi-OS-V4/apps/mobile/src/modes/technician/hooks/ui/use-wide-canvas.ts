/**
 * `useWideCanvas` — viewport-classification hook (P0-FE-7).
 *
 * Returns a stable, narrow shape any screen can branch on without
 * having to think about `useWindowDimensions()`, orientation locks,
 * or breakpoint constants:
 *
 *     const { isWide, orientation, canvasKind } = useWideCanvas();
 *
 * Three distinct canvases are recognized:
 *
 *   - "phone-portrait"  — short edge up, no special chrome (the
 *                         current default for every screen in this
 *                         app).
 *   - "phone-landscape" — long edge up on a phone-class device. Phase
 *                         B (`P2-FE-4`) introduces a dedicated
 *                         landscape calendar canvas (master plan
 *                         §5.1.1 / §5.1.2) that branches on this
 *                         value.
 *   - "tablet"          — wide viewport (≥ 720pt). Tablet support is
 *                         out of scope for v1 per master plan §1.6;
 *                         the value is exposed today so future tablet
 *                         layouts reuse the same hook unchanged
 *                         instead of inventing a parallel mechanism.
 *
 * The 720pt cutoff is the same threshold the master plan §0.3 entry
 * for this chunk specifies, **applied to the device's short edge**
 * (`Math.min(width, height)`) rather than the live `width`. Reason:
 * the live-`width` form (which the original spec proposed) classifies
 * any iPhone Pro / Pro Max in landscape as `tablet`, because its
 * landscape `width` is 852-932pt — well over 720. That collapses the
 * "phone-landscape" branch on the most popular iPhone family in use
 * today, which is exactly the device class Phase B's landscape
 * calendar canvas (master plan §5.1.1 / §5.1.2) is built for.
 *
 * Using `min(width, height)` instead means the classification is a
 * property of the **device**, not its current rotation:
 *
 *   - any iPhone (SE 375 → Pro Max 430)            → not wide → phone
 *   - any iPad (mini 744 → Pro 12.9 1024)          → wide     → tablet
 *   - foldable closed (~374)                       → not wide → phone
 *   - foldable open (~768)                         → wide     → tablet
 *   - iPad in narrow split-screen (~507)           → not wide → phone-*
 *
 * The last row is an intentional product call: when the calendar lives
 * in a thin split-screen pane it should adopt phone layout, not the
 * tablet layout that assumes the full canvas.
 *
 * Hard-coded here rather than centralised in a `breakpoints` module
 * because there is exactly one breakpoint in this app today; promote
 * to a module the second a second one appears.
 *
 * Backed by React Native's `useWindowDimensions()` so the value
 * recomputes automatically on rotation, split-screen resize, and
 * external display attach. No subscription bookkeeping required at
 * the call site.
 *
 * Pure read-only hook — never writes state, never schedules effects.
 * Safe to call from any component, including ones that mount during
 * navigation transitions.
 */

import { useWindowDimensions } from "react-native";

export type CanvasOrientation = "portrait" | "landscape";

export type CanvasKind = "phone-portrait" | "phone-landscape" | "tablet";

export interface WideCanvasInfo {
  isWide: boolean;
  orientation: CanvasOrientation;
  canvasKind: CanvasKind;
}

const WIDE_CANVAS_BREAKPOINT_PT = 720;

export function useWideCanvas(): WideCanvasInfo {
  const { width, height } = useWindowDimensions();

  const isWide = Math.min(width, height) >= WIDE_CANVAS_BREAKPOINT_PT;
  const orientation: CanvasOrientation =
    width > height ? "landscape" : "portrait";

  const canvasKind: CanvasKind = isWide
    ? "tablet"
    : orientation === "landscape"
      ? "phone-landscape"
      : "phone-portrait";

  return { isWide, orientation, canvasKind };
}
