/**
 * Vertical avatar strip for the landscape workweek canvas (P2-FE-4).
 *
 * Per master plan §5.1.1 and §5.1.3, the landscape calendar replaces
 * the portrait header strip of horizontally-scrolling chips with a
 * vertical 44pt-wide strip anchored to the user's preferred-hand edge:
 *
 *   - Strip width:     44pt (Apple HIG minimum touch target)
 *   - Avatar diameter: 34pt
 *   - Padding/side:    5pt   (34 + 5 + 5 = 44)
 *   - Side:            right edge if `preferredHand === 'right'`,
 *                      left edge  if `preferredHand === 'left'`
 *
 * Each tile is the existing `TechAvatarChip` (`size={34}`) coloured
 * with the deterministic per-tech `colorForTech(id)` (P0-FE-2). When
 * `selectedTechIds` is non-empty, unselected chips dim per the chip's
 * built-in `isFiltered` state. Tap toggles the tech in/out of the
 * selection (`useCalendarStore.toggleCalendarTech`).
 *
 * If more techs would fit at the minimum 44pt row height than the
 * viewport supports, the strip becomes vertically scrollable inside
 * the 44pt rail. Hosting layout assumes the strip fills its parent's
 * height.
 *
 * No portrait fallback — this component is only mounted on the
 * landscape canvas. Callers that need the portrait header chip strip
 * keep using the existing `ResourceCalendarWorkweekView`.
 */

import { memo, useCallback, useRef } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import { TechAvatarChip } from "@/src/components/shared/tech-avatar-chip";
import { colorForTech } from "@technician/utils/color-for-tech";
import {
  NO_HIGHLIGHTED_TECH,
  type AvatarBbox,
} from "./use-drag-to-avatar";
import { useAvatarStripBboxDerivation } from "../use-avatar-strip-bbox-derivation";

export const LANDSCAPE_AVATAR_STRIP_WIDTH = 44;
export const LANDSCAPE_AVATAR_DIAMETER = 34;
export const LANDSCAPE_AVATAR_PADDING = 5;
/** A single 44pt strip slot — avatar diameter + symmetric padding. */
export const LANDSCAPE_AVATAR_SLOT_HEIGHT =
  LANDSCAPE_AVATAR_DIAMETER + LANDSCAPE_AVATAR_PADDING * 2;
/**
 * Above this avatar count we fall back to a single ScrollView even when
 * `splitMiddle` is requested — at 8 techs the split layout (4 top + 4
 * bottom) plus a notch-clearing gap of ~80pt would already overflow on
 * smaller iPhones in landscape (e.g. iPhone 13 mini @ 375pt short edge
 * before subtracting the home-indicator inset).
 */
export const LANDSCAPE_SPLIT_MAX_AVATARS = 8;

export interface AvatarStripTech {
  id: number;
  name: string;
  profileImageUrl?: string | null;
}

interface AvatarStripProps {
  techs: AvatarStripTech[];
  /**
   * Currently-selected tech IDs from `useCalendarStore.selectedTechIds`.
   *
   * Landscape-only semantics (see `landscape-calendar.md` §2.6 / §2.9
   * and master plan §5.1.3 / §5.1.4):
   *
   *   - **`length === 0`** → "create new card" surface: every chip
   *     dims (no tech is a filter; *all* are equally-valid drop
   *     targets for a long-press-spawned draft). Tapping any chip
   *     promotes it from drop-target to filter and switches the grid
   *     into 1-tech (status colors) or 2+-tech (overlay) mode.
   *   - **`length === 1`** → that one chip is bright; the rest dim.
   *   - **`length >= 2`** → selected chips bright; rest dim.
   *
   * Note this is the inverse of portrait, where `length === 0` is
   * "show all" — the portrait strip lives in `tech-avatar-rail.tsx`
   * and is unaffected by this file.
   */
  selectedTechIds: number[];
  /** Tap handler — toggles the tech in the selection. */
  onToggleTech: (techId: number) => void;
  /**
   * Optional: long-press to focus this tech only (clears the rest of
   * the selection). Wired by the parent — kept optional so the strip
   * can ship before the focus gesture lands.
   */
  onFocusTech?: (techId: number) => void;
  style?: StyleProp<ViewStyle>;
  /** Accessibility label for the strip container. */
  accessibilityLabel?: string;
  /**
   * Test-only override for the chip colour. Production code should
   * leave this undefined so `colorForTech(tech.id)` controls the tint.
   */
  colorForTechOverride?: (techId: number) => string;
  /**
   * When true, splits the avatars into a top group (`ceil(N/2)`) pinned
   * to the top of the strip and a bottom group (`floor(N/2)`) pinned to
   * the bottom, with a flex gap in the middle. The gap aligns with the
   * iPhone notch / Dynamic Island which sits at the vertical centre of
   * either side edge in landscape, so avatars never sit underneath it.
   * Falls back to a single ScrollView when
   * `techs.length > LANDSCAPE_SPLIT_MAX_AVATARS` to avoid overflow on
   * smaller phones.
   *
   * Defaults to `false` so callers explicitly opt in (the design only
   * applies inside the landscape canvas — portrait never sees this).
   */
  splitMiddle?: boolean;
  /**
   * When `splitMiddle` is on, inserts N empty 44pt slots above the top
   * group, pushing it down so the topmost avatar clears the calendar
   * header (where the date labels render) on the primary edge-flush
   * strip. Has no effect when `splitMiddle` is off. Defaults to 0.
   */
  topOffsetSlots?: number;
  /**
   * P2-FE-6 (master plan §5.1.7) — drag-to-avatar highlight ring.
   *
   * Optional Reanimated `SharedValue<number>` that holds the
   * currently-highlighted tech id (or `NO_HIGHLIGHTED_TECH` / `-1`
   * when no avatar is under the dragged card's centroid).
   *
   * When provided, each tile wraps its `TechAvatarChip` in an
   * `Animated.View` whose `useAnimatedStyle` reactively paints a
   * 2pt blue ring + slight scale-up while the SV's value matches
   * the tile's tech id. Updates happen on the UI thread without
   * any JS render — the per-frame reaction in `useDragToAvatar`
   * writes the SV from a worklet on every drag frame.
   *
   * When undefined (the default), tiles render exactly as before
   * P2-FE-6 with no animated wrapper. Strip behavior on tap /
   * long-press is unchanged.
   */
  dragHighlightedTechIdSV?: SharedValue<number>;
  /**
   * P2-FE-6 — fired once per tile after layout settles, with the
   * tile's window-relative bounding box (from `measureInWindow`).
   * The drop-overlay hit-test in `useDragToAvatar` consumes these
   * to map a calendar drag centroid to a tech id.
   *
   * The callback re-fires whenever the tile's `onLayout` fires OR
   * the `remeasureKey` prop changes — i.e. on rotation, on
   * selection change (which can shift the chip's intrinsic size
   * via dim/glow), and on initial mount. Idempotent for unchanged
   * bboxes is the consumer's job (the stub hook compares before
   * writing the SV to avoid a UI-thread write).
   *
   * Optional — strips that aren't drag targets (none, currently)
   * can omit it. Receives `null` for `bbox` on tile unmount so the
   * consumer can drop the stale bbox from its hit-test map.
   */
  onTileLayout?: (techId: number, bbox: AvatarBbox | null) => void;
  /**
   * P2-FE-6 — bumping this value forces every slot to re-run
   * `measureInWindow` and re-emit `onTileLayout`. Required because
   * `View.onLayout` does NOT fire when a view's window-relative
   * position changes due to an ancestor resizing (it only fires on
   * the view's OWN size change). The LandscapeWorkweekView's
   * container starts at portrait dimensions (~393pt wide) during
   * the rotation-into-landscape transition and grows to the full
   * landscape width (~852pt) one layout pass later. Without this
   * trigger, the bboxes captured at mount stay anchored ~470pt to
   * the left of where the avatars actually render, so the
   * drag-to-avatar hit-test never matches.
   *
   * Pass any value that changes when the strip's window position
   * could have shifted; LWV uses `measuredCalendarWidth` (the
   * onLayout-reported width of the calendar wrap, which DOES fire
   * on container resize because calendarWrap's own size changes).
   */
  remeasureKey?: number | string;
}

export const AvatarStrip = memo(function AvatarStrip({
  techs,
  selectedTechIds,
  onToggleTech,
  onFocusTech,
  style,
  accessibilityLabel = "Technician avatar strip",
  colorForTechOverride,
  splitMiddle = false,
  topOffsetSlots = 0,
  dragHighlightedTechIdSV,
  onTileLayout,
  remeasureKey,
}: AvatarStripProps) {
  // Per landscape-calendar.md §2.6 / §2.9: in landscape, an empty
  // `selectedTechIds` is the "create new card" surface — the grid is
  // empty AND every avatar in the strip dims to signal "no selection;
  // all are valid drop targets." That's the opposite of portrait,
  // where length === 0 means "show all." Since this component is
  // landscape-only (see file header), we hard-code `isFiltered = true`
  // so the existing chip math (`dim = isFiltered && !isSelected`)
  // dims every chip when nothing is selected and dims only the
  // unselected ones when something is.
  const isFiltered = true;
  const resolveColor = colorForTechOverride ?? colorForTech;

  const handlePress = useCallback(
    (id: number) => () => onToggleTech(id),
    [onToggleTech],
  );

  const handleLongPress = useCallback(
    (id: number) => () => onFocusTech?.(id),
    [onFocusTech],
  );

  // PLAN-DEVIATION: 2026-05-08-avatar-strip-bbox-derivation —
  // strip-level bbox derivation. The outer strip View is the single
  // window-position source-of-truth; each tile reports its relative
  // offset via `onTileLayout` (single-shot at chip mount). The
  // hook combines them and forwards window-coord bboxes to the
  // consumer's `onTileLayout` prop. Replaces the per-tile
  // `measureInWindow` shipped in 2026-04-22 P2-FE-6.
  // See docs/PLAN-DEVIATIONS.md#2026-05-08-avatar-strip-bbox-derivation.
  const stripRef = useRef<View>(null);
  // Adapter — `useAvatarStripBboxDerivation` calls
  // `registerAvatarBbox(techId, bbox|null)` with WINDOW-coord
  // bboxes, which is exactly the contract the consumer's
  // `onTileLayout` prop expects. Pass through unchanged.
  const consumerOnTileLayout = onTileLayout;
  const registerAvatarBbox = useCallback(
    (techId: number, bbox: AvatarBbox | null) => {
      consumerOnTileLayout?.(techId, bbox);
    },
    [consumerOnTileLayout],
  );
  const { onStripLayout, onTileLayout: hookOnTileLayout } =
    useAvatarStripBboxDerivation({
      stripRef,
      registerAvatarBbox,
      remeasureKey,
      // Landscape canvas doesn't mount inside `<CollapsibleTop>`,
      // so no collapse-progress SV. The strip's own onLayout +
      // remeasureKey (LWV passes `measuredCalendarWidth`) cover the
      // landscape reflow cases. See the LWV mount for context.
      collapseProgressSV: null,
    });

  const renderChip = (tech: AvatarStripTech) => {
    const selected = selectedTechIds.includes(tech.id);
    return (
      <AvatarStripSlot
        key={tech.id}
        tech={tech}
        color={resolveColor(tech.id)}
        isFiltered={isFiltered}
        isSelected={selected}
        onPress={handlePress(tech.id)}
        onLongPress={onFocusTech ? handleLongPress(tech.id) : undefined}
        dragHighlightedTechIdSV={dragHighlightedTechIdSV}
        onTileLayout={hookOnTileLayout}
      />
    );
  };

  const useSplit = splitMiddle && techs.length <= LANDSCAPE_SPLIT_MAX_AVATARS;

  if (useSplit) {
    const half = Math.ceil(techs.length / 2);
    const topGroup = techs.slice(0, half);
    const bottomGroup = techs.slice(half);
    const offsetHeight = topOffsetSlots * LANDSCAPE_AVATAR_SLOT_HEIGHT;
    return (
      <View
        ref={stripRef}
        onLayout={onStripLayout}
        style={[styles.strip, styles.stripSplit, style]}
        accessible
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="toolbar"
        testID="avatar-strip-split"
      >
        {offsetHeight > 0 ? (
          // Fixed-size spacer pushes the top group down N slots so the
          // topmost avatar clears the calendar header (date labels)
          // when this strip is the edge-flush primary one. We render an
          // explicit spacer instead of paddingTop so the flex gap below
          // (between top and bottom groups) collapses to exactly the
          // remainder, preserving the symmetric notch-clearing layout.
          <View
            style={{ height: offsetHeight }}
            testID="avatar-strip-top-offset"
          />
        ) : null}
        <View style={styles.splitGroup} testID="avatar-strip-top-group">
          {topGroup.map(renderChip)}
        </View>
        <View style={styles.splitGap} />
        <View style={styles.splitGroup} testID="avatar-strip-bottom-group">
          {bottomGroup.map(renderChip)}
        </View>
      </View>
    );
  }

  return (
    <View
      ref={stripRef}
      onLayout={onStripLayout}
      style={[styles.strip, style]}
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="toolbar"
      testID="avatar-strip"
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {techs.map(renderChip)}
      </ScrollView>
    </View>
  );
});

// ── AvatarStripSlot ─────────────────────────────────────────────────
//
// Per-tile sub-component (P2-FE-6, refactored 2026-05-08 PR-UX-6).
// Two responsibilities:
//
//   1. Wrap `TechAvatarChip` in an `Animated.View` whose
//      `useAnimatedStyle` watches `dragHighlightedTechIdSV` and
//      paints a 2pt blue ring + slight scale when the SV's value
//      matches this tile's tech id. The check is per-frame on the
//      UI thread; no JS render fires on highlight changes.
//
//      A tile-local fallback SV is created via `useSharedValue` so
//      the worklet can dereference `.value` unconditionally — this
//      avoids the "useAnimatedStyle worklet branch on undefined"
//      issue where conditionally-passed SVs cause Reanimated to
//      throw at frame time. The fallback SV is constant
//      (`NO_HIGHLIGHTED_TECH`) so the worklet always evaluates to
//      the no-highlight branch when no parent SV was provided.
//
//   2. Forward the tile's `onLayout` event up to the
//      strip-level bbox-derivation hook (PR-UX-6). The hook
//      reads `event.nativeEvent.layout` for the tile's RELATIVE
//      offset within the strip and combines it with the strip's
//      own window-coord bbox to broadcast resolved window bboxes
//      to the consumer. The slot itself NEVER calls
//      `measureInWindow` — that's the strip's job.
//
// MUST stay a separate component (not an inline render fn) because
// `useAnimatedStyle` and `useSharedValue` are hooks — the inline
// render path violates the rules-of-hooks if the tile count changes.
//
// PLAN-DEVIATION: 2026-05-08-avatar-strip-bbox-derivation —
// supersedes the per-tile measureInWindow + remeasureKey workaround
// shipped in 2026-04-22 P2-FE-6. See
// docs/PLAN-DEVIATIONS.md#2026-05-08-avatar-strip-bbox-derivation.
interface AvatarStripSlotProps {
  tech: AvatarStripTech;
  color: string;
  isFiltered: boolean;
  isSelected: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  dragHighlightedTechIdSV?: SharedValue<number>;
  /**
   * Forwarded from `useAvatarStripBboxDerivation` — accepts
   * `(techId, LayoutChangeEvent, viewNode)`. Single-shot per chip
   * mount. Distinct from the EXTERNAL `onTileLayout` prop on
   * `AvatarStrip` which receives resolved window bboxes; this
   * internal callback is only the relative-offset feed.
   *
   * PR-UX-15 (2026-05-09): the third arg is the slot's host View
   * node. The hook uses it to call `measureLayout(stripRef, ...)`
   * for an accurate STRIP-relative offset regardless of nesting
   * depth. Without it, the hook falls back to
   * `event.nativeEvent.layout` which is parent-relative — broken
   * for the splitMiddle layout where the slot's parent is a
   * splitGroup View, not the strip itself.
   */
  onTileLayout?: (
    techId: number,
    e: LayoutChangeEvent,
    viewNode?: View | null,
  ) => void;
}

const AvatarStripSlot = memo(function AvatarStripSlot({
  tech,
  color,
  isFiltered,
  isSelected,
  onPress,
  onLongPress,
  dragHighlightedTechIdSV,
  onTileLayout,
}: AvatarStripSlotProps) {
  const fallbackHighlightSV = useSharedValue<number>(NO_HIGHLIGHTED_TECH);
  // The worklet captures whichever SV is the "active" reference.
  // Hooks rules forbid conditional `useAnimatedStyle`, so we always
  // call it but compute the source SV up front.
  const highlightSource = dragHighlightedTechIdSV ?? fallbackHighlightSV;

  const ringStyle = useAnimatedStyle(() => {
    const highlighted = highlightSource.value === tech.id;
    return {
      transform: [{ scale: highlighted ? 1.12 : 1 }],
      borderWidth: highlighted ? 2 : 0,
      borderColor: highlighted ? "#3B82F6" : "transparent",
      // Ring wraps the chip itself (diameter 34) + 2pt border, so
      // radius = chip-radius + border-width.
      borderRadius: LANDSCAPE_AVATAR_DIAMETER / 2 + 2,
      // Subtle drop-shadow on iOS; platform fall-through is fine
      // because the border is the primary affordance.
      shadowColor: highlighted ? "#3B82F6" : "transparent",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: highlighted ? 0.6 : 0,
      shadowRadius: highlighted ? 4 : 0,
    };
  });

  // PLAN-DEVIATION: 2026-05-08-avatar-strip-bbox-derivation —
  // each tile now reports its parent-relative LayoutChangeEvent +
  // its host node ref to the outer strip's
  // `useAvatarStripBboxDerivation` hook, which combines strip window
  // position + tile strip-relative offset to produce window
  // bboxes. Per-tile `measureInWindow` and the ancestor-reflow
  // remeasureKey workaround were removed because the strip-level
  // derivation handles ancestor moves natively.
  //
  // PR-UX-15 (2026-05-09): the slot now holds its own `slotRef` and
  // passes it as the third arg to `onTileLayout`. The hook uses it
  // to call `measureLayout(stripRef, ...)` so the slot's offset is
  // computed against the strip directly — survives the
  // `splitMiddle` layout where the slot's immediate parent is a
  // `splitGroup` View, not the strip's outer container.
  const slotRef = useRef<View>(null);
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      onTileLayout?.(tech.id, e, slotRef.current);
    },
    [onTileLayout, tech.id],
  );

  return (
    <View
      ref={slotRef}
      style={styles.slot}
      onLayout={handleLayout}
      testID={`avatar-strip-slot-${tech.id}`}
    >
      <Animated.View style={ringStyle}>
        <TechAvatarChip
          name={tech.name}
          imageUrl={tech.profileImageUrl}
          color={color}
          isFiltered={isFiltered}
          isSelected={isSelected}
          showName={false}
          size={LANDSCAPE_AVATAR_DIAMETER}
          onPress={onPress}
          onLongPress={onLongPress}
        />
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  strip: {
    width: LANDSCAPE_AVATAR_STRIP_WIDTH,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
  },
  scrollContent: {
    paddingVertical: LANDSCAPE_AVATAR_PADDING,
    alignItems: "center",
  },
  stripSplit: {
    paddingVertical: LANDSCAPE_AVATAR_PADDING,
    alignItems: "center",
  },
  splitGroup: {
    alignItems: "center",
  },
  splitGap: {
    flex: 1,
  },
  slot: {
    width: LANDSCAPE_AVATAR_STRIP_WIDTH,
    height: LANDSCAPE_AVATAR_DIAMETER + LANDSCAPE_AVATAR_PADDING * 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
