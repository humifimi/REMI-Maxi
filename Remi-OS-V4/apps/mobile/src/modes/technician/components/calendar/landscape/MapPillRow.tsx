/**
 * LDM-WAVE-1 CHUNK-6 — Landscape map pill row scaffold.
 *
 * Horizontal scroll-view of capsule pills rendered as the
 * `renderTopChrome` slot on `<FranchiseRouteMap>` in landscape.
 * CHUNK-6 ships with ONE real descriptor (live routes count) wired
 * up via `LandscapeWorkweekView`; future feature chunks add more
 * descriptors through the same array.
 *
 * Behavior contract (per spec §CHUNK-6 → Behavior contract — pill row):
 *   - Horizontal scroll; doesn't overflow vertically.
 *   - 44pt minimum hit area per pill (touch-target rule), even when
 *     the visible capsule is smaller.
 *   - Pills fade with the surrounding map layer naturally because
 *     this row renders as a child of the existing
 *     `Animated.View styles={surfaceLayer}` in `LandscapeWorkweekView`.
 *   - Tone variants (`live`, `warning`, `neutral`) drive color only.
 *
 * Future chunks:
 *   - Drag-treatment toggle pill (depends on `preferredDragTreatments`).
 *   - AI-suggested-reorder banner pill (depends on AI consumer chunk).
 *   - Customer-intake-pin chip (depends on customer-intake AI chunk).
 *   - Drawer-trigger pill (lands when the first side-drawer ships).
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export type MapPillTone = "neutral" | "live" | "warning";

export interface MapPillDescriptor {
  id: string;
  label: string;
  /** MaterialIcons name; optional. */
  icon?: string;
  /** Omit for purely-presentational pills (CHUNK-6's live-routes pill). */
  onPress?: () => void;
  tone?: MapPillTone;
}

export interface MapPillRowProps {
  pills: MapPillDescriptor[];
  /** TestID prefix; default `map-pill-row`. */
  testIDPrefix?: string;
}

const TONE_STYLES: Record<MapPillTone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: "rgba(255,255,255,0.95)", fg: "#111827", border: "#E5E7EB" },
  live: { bg: "rgba(34,197,94,0.95)", fg: "#FFFFFF", border: "#16A34A" },
  warning: { bg: "rgba(249,115,22,0.95)", fg: "#FFFFFF", border: "#EA580C" },
};

export function MapPillRow({ pills, testIDPrefix }: MapPillRowProps) {
  const prefix = testIDPrefix ?? "map-pill-row";
  if (pills.length === 0) {
    // Render nothing rather than an empty 44pt row that would push
    // map content down without any visible pixels filled. Spec §993
    // explicitly calls out zero-pill as "easy to ship broken layout
    // nobody sees" — silent-collapse is the safer default.
    return null;
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
      style={styles.wrap}
      testID={`${prefix}-root`}
    >
      {pills.map((pill) => (
        <Pill key={pill.id} pill={pill} testIDPrefix={prefix} />
      ))}
    </ScrollView>
  );
}

interface PillProps {
  pill: MapPillDescriptor;
  testIDPrefix: string;
}

function Pill({ pill, testIDPrefix }: PillProps) {
  const tone = TONE_STYLES[pill.tone ?? "neutral"];
  const body = (
    <View
      style={[
        styles.capsule,
        { backgroundColor: tone.bg, borderColor: tone.border },
      ]}
    >
      {pill.icon ? (
        <MaterialIcons
          name={pill.icon as React.ComponentProps<typeof MaterialIcons>["name"]}
          size={14}
          color={tone.fg}
          style={styles.icon}
        />
      ) : null}
      <Text style={[styles.label, { color: tone.fg }]} numberOfLines={1}>
        {pill.label}
      </Text>
    </View>
  );

  if (pill.onPress) {
    return (
      <Pressable
        onPress={pill.onPress}
        // 44pt min hit-target per architecture rule; `hitSlop` extends
        // the touch area without changing the visible capsule height.
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        style={({ pressed }) => [styles.hit, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={pill.label}
        testID={`${testIDPrefix}-pill-${pill.id}`}
      >
        {body}
      </Pressable>
    );
  }

  return (
    <View
      style={styles.hit}
      accessibilityRole="text"
      accessibilityLabel={pill.label}
      testID={`${testIDPrefix}-pill-${pill.id}`}
    >
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // The wrapper stays out of the map's gesture surface; pills
    // themselves consume taps. Top padding gives the row breathing
    // room from the landscape header / safe area below it.
    paddingTop: 8,
    maxHeight: 60,
  },
  scroll: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: "center",
    // Enough vertical room for the 44pt hit-target without expanding
    // the visible capsule. The capsule itself is 32pt.
    minHeight: 44,
  },
  hit: {
    // 44pt touch target per architecture rule on touch targets.
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.85,
  },
  capsule: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 32,
    // Premium consumer-grade: subtle shadow so the pill floats over
    // the map without competing with the route polylines beneath.
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2,
  },
  icon: {
    marginRight: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
});
