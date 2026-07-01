/**
 * EmbeddedAvatarSelector (P2-FE-8 — avatar slide-down selector).
 *
 * In-canvas tech picker shown alongside a `pendingDraft` whose
 * `technicianId` is null. Solves two problems at once:
 *
 *   1. Master plan §5.1.7's long-deferred "avatar slide-down
 *      selector" — when a draft is created in an ambiguous context
 *      (landscape empty-mode, where there are no tech columns to
 *      infer from), the user needs an in-card affordance to bind
 *      the draft to a tech without leaving the canvas / opening
 *      the form sheet.
 *
 *   2. The "appointment vanishes from empty-mode landscape" bug
 *      reported 2026-04-23. The chunk-1 compromise was attaching
 *      null-tech drafts to `resources[0]` so the dashed block
 *      rendered SOMEWHERE; the form's save then committed the
 *      appointment to that arbitrary tech, and on returning to
 *      empty-mode landscape (which filters all techs out) the new
 *      card was invisible. The selector kills the compromise: a
 *      null-tech draft renders ONLY this selector — no canvas
 *      block — until the user picks. Once picked, the draft re-
 *      anchors to that tech's column and proceeds normally.
 *
 * Entrance animation:
 *   The avatar strip lives at the right (or left, hand-preference-
 *   dependent) edge of the landscape canvas. When this selector
 *   mounts, each chip ideally appears to "slide down" from its
 *   sibling tile in the strip into the in-canvas row. We read
 *   start positions from `useAvatarBboxRegistry` (populated by
 *   `LandscapeWorkweekView`'s `handleAvatarTileLayout`) and animate
 *   each chip from `(strip_x − card_x, strip_y − card_y)` → `(0,0)`
 *   with a 220ms staggered fade-in. When a tile bbox is missing
 *   (portrait, no strip mounted, race), the chip falls back to a
 *   plain fade-in from `(0, −16)` so the surface still appears.
 *
 * Layout:
 *   Horizontal scrolling row of `TechAvatarChip` (size 36, no
 *   name) — wide enough to fit ~6 avatars on an iPhone in landscape
 *   and scroll for more. Sits immediately above the chooser
 *   popover when both are mounted (the chooser is shown after the
 *   user picks a tech AND taps the dashed draft), so the selector
 *   needs ~64pt of top space.
 */

import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";

import { TechAvatarChip } from "@/src/components/shared/tech-avatar-chip";
import { colorForTech } from "@technician/utils/color-for-tech";
import {
  useAvatarBboxRegistry,
  type AvatarTileBbox,
} from "@technician/hooks/landscape/use-avatar-bbox-registry";

export interface EmbeddedAvatarSelectorTech {
  id: number;
  name: string;
  profileImageUrl?: string | null;
}

interface EmbeddedAvatarSelectorProps {
  techs: EmbeddedAvatarSelectorTech[];
  /** Currently-bound tech (null when nothing picked yet). */
  selectedTechId: number | null;
  /**
   * Fired when the user taps a chip. The host is expected to
   * mutate the pending draft via `setDraftTechnician(techId)` (and,
   * in landscape empty-mode, push the tech onto `selectedTechIds`
   * so the new column appears).
   */
  onPickTech: (techId: number) => void;
  /**
   * Test override — when provided, replaces the default
   * `colorForTech` for chip color computation. Production code
   * leaves this undefined.
   */
  colorForTechOverride?: (techId: number) => string;
  /**
   * Test override — when provided, skips the bbox-derived entrance
   * and renders chips at `(0, 0)` with full opacity immediately.
   * Useful for jest's `Animated` shim which doesn't actually
   * complete native-driver animations.
   */
  skipEntranceAnimation?: boolean;
}

/**
 * Per-chip animated wrapper. Each chip gets its own `Animated.Value`s
 * for translateX, translateY, and opacity so we can stagger and
 * release them independently. The chip itself is unchanged.
 */
const STAGGER_MS = 28;
const ENTRANCE_DURATION_MS = 220;

interface AnimatedChipProps {
  tech: EmbeddedAvatarSelectorTech;
  index: number;
  color: string;
  isSelected: boolean;
  onPress: () => void;
  /**
   * Window-relative position of the chip's RESTING location. Used
   * (together with the strip-side bbox from the registry) to
   * compute the start translate. Reported by the chip's container
   * onLayout once it's mounted.
   */
  restWindowPosition: { x: number; y: number } | null;
  /** Entrance bbox for this tech's avatar tile in the strip. */
  stripBbox: AvatarTileBbox | undefined;
  skipEntranceAnimation: boolean;
}

function AnimatedChip({
  tech,
  index,
  color,
  isSelected,
  onPress,
  restWindowPosition,
  stripBbox,
  skipEntranceAnimation,
}: AnimatedChipProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(skipEntranceAnimation ? 0 : -16)).current;
  const opacity = useRef(new Animated.Value(skipEntranceAnimation ? 1 : 0)).current;

  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    if (skipEntranceAnimation || hasAnimatedRef.current) return;
    if (!restWindowPosition) return;

    if (stripBbox) {
      // Slide-down from the matching strip tile. We translate from
      // the delta between the strip tile and the rest position so
      // the chip visually "leaves" its strip slot and lands here.
      const startX = stripBbox.x - restWindowPosition.x;
      const startY = stripBbox.y - restWindowPosition.y;
      translateX.setValue(startX);
      translateY.setValue(startY);
    }
    hasAnimatedRef.current = true;

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: ENTRANCE_DURATION_MS,
        delay: index * STAGGER_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: ENTRANCE_DURATION_MS,
        delay: index * STAGGER_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: ENTRANCE_DURATION_MS,
        delay: index * STAGGER_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [
    index,
    opacity,
    restWindowPosition,
    skipEntranceAnimation,
    stripBbox,
    translateX,
    translateY,
  ]);

  const containerRef = useRef<View>(null);
  const handleLayout = (_e: LayoutChangeEvent) => {
    const node = containerRef.current;
    if (!node) return;
    node.measureInWindow((x, y) => {
      // Only useful on the FIRST layout — subsequent layouts re-fire
      // but we don't want to re-trigger the entrance.
      if (hasAnimatedRef.current) return;
      // Stash and bounce a re-render through the parent's onLayout
      // capture. We use a parent-supplied callback via the prop's
      // changing identity instead. To keep things simple here, just
      // mutate via setState in parent — handled by the parent's
      // `onChipLayout` indirection.
      onChipLayoutCapture?.(tech.id, { x, y });
    });
  };

  return (
    <Animated.View
      ref={containerRef}
      onLayout={handleLayout}
      style={{
        opacity,
        transform: [{ translateX }, { translateY }],
      }}
      testID={`embedded-avatar-selector-chip-${tech.id}`}
    >
      <TechAvatarChip
        name={tech.name}
        imageUrl={tech.profileImageUrl ?? undefined}
        color={color}
        isSelected={isSelected}
        isFiltered
        onPress={onPress}
        showName={false}
        size={36}
      />
    </Animated.View>
  );
}

// Module-private one-shot capture channel. The parent injects a
// capture callback before children mount; each child reports its
// resting window position once. We avoid prop drilling because the
// chip count varies and the capture is only used for animation
// start positions, not for layout decisions.
let onChipLayoutCapture:
  | ((techId: number, pos: { x: number; y: number }) => void)
  | undefined;

export function EmbeddedAvatarSelector({
  techs,
  selectedTechId,
  onPickTech,
  colorForTechOverride,
  skipEntranceAnimation = false,
}: EmbeddedAvatarSelectorProps) {
  const getAvatarBbox = useAvatarBboxRegistry((s) => s.getAvatarBbox);
  const resolveColor = colorForTechOverride ?? colorForTech;

  // Snapshot of strip bboxes at the moment the selector mounts. We
  // don't subscribe to changes — once the entrance animation runs,
  // re-reading bboxes would only be relevant if the strip moved
  // mid-animation, which doesn't happen in practice (rotation
  // unmounts the host, not the strip).
  const initialStripBboxes = useMemo(() => {
    const map = new Map<number, AvatarTileBbox>();
    for (const tech of techs) {
      const bbox = getAvatarBbox(tech.id);
      if (bbox) map.set(tech.id, bbox);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Capture each chip's resting window position once. Stored in a
  // ref so a state update doesn't re-trigger the entrance.
  const chipRestPositionsRef = useRef<Map<number, { x: number; y: number }>>(
    new Map(),
  );
  const [restPosVersion, setRestPosVersion] = React.useState(0);

  useEffect(() => {
    onChipLayoutCapture = (techId, pos) => {
      const prev = chipRestPositionsRef.current.get(techId);
      if (prev && prev.x === pos.x && prev.y === pos.y) return;
      chipRestPositionsRef.current.set(techId, pos);
      setRestPosVersion((v) => v + 1);
    };
    return () => {
      onChipLayoutCapture = undefined;
    };
  }, []);

  if (techs.length === 0) return null;

  return (
    <View style={styles.host} pointerEvents="box-none" testID="embedded-avatar-selector">
      <View style={styles.card}>
        <Text style={styles.label}>Pick a technician</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {techs.map((tech, index) => {
            const stripBbox = initialStripBboxes.get(tech.id);
            const restPosition = chipRestPositionsRef.current.get(tech.id) ?? null;
            // restPosVersion is read solely to keep the consumer
            // re-evaluating until every chip has reported its rest
            // position. The animation effect early-exits once it has
            // already run, so this re-render is cheap.
            void restPosVersion;
            return (
              <AnimatedChip
                key={tech.id}
                tech={tech}
                index={index}
                color={resolveColor(tech.id)}
                isSelected={selectedTechId === tech.id}
                onPress={() => onPickTech(tech.id)}
                restWindowPosition={restPosition}
                stripBbox={stripBbox}
                skipEntranceAnimation={skipEntranceAnimation}
              />
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    top: 24,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    maxWidth: "92%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingHorizontal: 4,
    paddingBottom: 6,
    textAlign: "center",
  },
  scrollContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
});
