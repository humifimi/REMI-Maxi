/**
 * Diagonal-stripe overlay for personal events in overlay mode (P2-FE-4).
 *
 * Master plan §5.1.4 requires personal events in 2+-tech overlay mode to
 * be tinted with the tech's `colorForTech` colour AND distinguished from
 * work events with a diagonal-stripe pattern + a small "personal" icon.
 * Status colour can't differentiate them in overlay mode (the tech
 * palette has already replaced the status palette on the card body),
 * so the stripe + icon is what reads at a glance.
 *
 * Implementation: a `react-native-svg` `<Svg>` filling the parent slot
 * with a series of 45° lines stroked in `stripeColor`. We intentionally
 * do NOT use `<Pattern>` because Pattern fills are inconsistently
 * supported on `react-native-svg` releases across iOS/Android — drawing
 * the lines explicitly costs ~30 paths per card and renders identically
 * everywhere.
 *
 * The component is `pointerEvents="none"` so taps still hit the
 * underlying event card body.
 */

import { memo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Line } from "react-native-svg";

interface DiagonalStripeOverlayProps {
  /** Stroke colour of the diagonal lines. Should contrast with the card tint. */
  stripeColor: string;
  /** Per-line opacity (0–1). Defaults to 0.35 so the stripe reads without obscuring text. */
  opacity?: number;
  /** Spacing between consecutive lines, in points. Defaults to 8. */
  spacing?: number;
  /** Stroke width of each line, in points. Defaults to 1.5. */
  strokeWidth?: number;
  /** Width hint for the SVG viewport. Defaults to 200 (clamped by parent). */
  width?: number;
  /** Height hint for the SVG viewport. Defaults to 200 (clamped by parent). */
  height?: number;
}

export const DiagonalStripeOverlay = memo(function DiagonalStripeOverlay({
  stripeColor,
  opacity = 0.35,
  spacing = 8,
  strokeWidth = 1.5,
  width = 200,
  height = 200,
}: DiagonalStripeOverlayProps) {
  const diag = width + height;
  const lines: { x1: number; y1: number; x2: number; y2: number; key: string }[] = [];
  for (let offset = -height; offset < diag; offset += spacing) {
    lines.push({
      key: `s${offset}`,
      x1: offset,
      y1: 0,
      x2: offset + height,
      y2: height,
    });
  }

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.container]}>
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        {lines.map((l) => (
          <Line
            key={l.key}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke={stripeColor}
            strokeWidth={strokeWidth}
            opacity={opacity}
          />
        ))}
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
});
