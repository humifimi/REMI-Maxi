/**
 * `WorkweekAvatarStrip` — horizontal strip of tech avatar chips shown
 * above the portrait workweek calendar. The currently-mounted tech's
 * chip is highlighted; tapping any other chip calls `onSwitchTech` so
 * the workweek can re-mount on the destination tech without
 * exiting back to Day view first.
 *
 * Extracted verbatim from `resource-calendar-workweek-view.tsx`'s
 * inline JSX block (PR-UI-REDESIGN-1 modularization, 2026-05-12).
 * The strip is a UI shell only — every hover-dwell concern (drag
 * registration, bbox derivation, remount keys) is wired by the
 * parent and passed in via props:
 *
 *   - `stripRef` — outer ScrollView ref. Forwarded to the strip
 *     so the parent's `useAvatarStripBboxDerivation` can call
 *     `measureInWindow` from a single ancestor reflow point.
 *   - `onStripLayout` — the bbox-derivation hook needs the strip's
 *     `onLayout` callback so it can re-measure when the strip
 *     itself reflows. Forwarded verbatim from the hook return.
 *   - `onTileLayout` — single-shot relative-offset registration
 *     per tile. The hook combines strip bbox + per-tile offset
 *     to broadcast window-coord bboxes into the drag registry.
 *
 * Behavior is unchanged from the inline implementation:
 *   - Returns `null` when there's only one available tech (no
 *     point in showing a single-chip strip; the parent's
 *     conditional `availableTechs && availableTechs.length > 1`
 *     check moved here so call sites don't have to repeat it).
 *   - Currently-mounted tech's chip is rendered as `isSelected`.
 *   - Tapping a non-current chip fires `haptic.light()` then
 *     `onSwitchTech(id, name)`.
 *
 * PLAN-DEVIATION: 2026-05-08-avatar-strip-bbox-derivation —
 * see docs/PLAN-DEVIATIONS.md#2026-05-08-avatar-strip-bbox-derivation.
 * That deviation governs the bbox-derivation strategy; this file
 * is the UI shell that exposes the right hooks to make that
 * strategy work from outside.
 */

import React, { useCallback, useRef } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { TechAvatarChip } from "@/src/components/shared/tech-avatar-chip";
import { haptic } from "@technician/hooks/utility/use-haptics";

export interface WorkweekTechOption {
  id: number;
  name: string;
  profileImageUrl?: string | null;
}

export interface WorkweekAvatarStripProps {
  /**
   * Already-sorted list of available techs (e.g. by `techOrder`).
   * When the list has length ≤ 1 the component returns `null`.
   */
  availableTechs: WorkweekTechOption[] | undefined;
  /** Currently-mounted tech id. Used to drive the chip highlight. */
  currentTechId: number;
  /** Tap callback. Fires `haptic.light()` before this is called. */
  onSwitchTech?: (techId: number, techName: string) => void;
  /**
   * Outer ScrollView ref. Forwarded so the parent's
   * `useAvatarStripBboxDerivation` hook can `measureInWindow`
   * from this single ancestor on reflow.
   */
  stripRef: React.RefObject<ScrollView | null>;
  /** Hook return: strip-level `onLayout`. */
  onStripLayout: (e: LayoutChangeEvent) => void;
  /**
   * Hook return: per-tile `onLayout`. The component forwards
   * `(techId, event, viewNode)` per registered tile.
   */
  onTileLayout: (
    techId: number,
    e: LayoutChangeEvent,
    viewNode?: View | null,
  ) => void;
}

export function WorkweekAvatarStrip({
  availableTechs,
  currentTechId,
  onSwitchTech,
  stripRef,
  onStripLayout,
  onTileLayout,
}: WorkweekAvatarStripProps) {
  if (!availableTechs || availableTechs.length <= 1) return null;
  return (
    <ScrollView
      ref={stripRef}
      onLayout={onStripLayout}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.techStripContent}
      style={styles.techStrip}
    >
      {availableTechs.map((tech) => (
        <PortraitAvatarStripTile
          key={tech.id}
          tech={tech}
          isCurrent={tech.id === currentTechId}
          onSwitchTech={onSwitchTech}
          onTileLayout={onTileLayout}
        />
      ))}
    </ScrollView>
  );
}

/**
 * Each avatar tile in the workweek's tech strip is a hover-dwell
 * target during a card drag (landscape parity per
 * 2026-04-22-hover-dwell-avatar-navigator). PR-UX-6 (2026-05-08
 * follow-up) replaces the per-tile `measureInWindow` pattern with
 * strip-level bbox derivation: each tile reports its RELATIVE
 * offset within the strip via `onTileLayout`, and
 * `useAvatarStripBboxDerivation` (mounted in the parent component)
 * combines that with the strip's own window position to broadcast
 * the resolved window-coord bbox into the drag registry.
 *
 * Why a single-shot relative offset is enough: chips are fixed
 * size, so the tile's own `onLayout` fires once on mount with its
 * final relative position. After that, the only thing that can
 * shift the chip's window position is an ancestor reflow — and
 * that's handled centrally by the strip-level remeasure (see
 * `useAvatarStripBboxDerivation` for the trigger set).
 *
 * See docs/PLAN-DEVIATIONS.md#2026-05-08-avatar-strip-bbox-derivation.
 */
// PLAN-DEVIATION: 2026-05-08-avatar-strip-bbox-derivation —
// supersedes the per-tile measureInWindow shipped in
// `2026-05-08-portrait-week-hover-dwell-parity`. See
// docs/PLAN-DEVIATIONS.md#2026-05-08-avatar-strip-bbox-derivation.
const PortraitAvatarStripTile = React.memo(function PortraitAvatarStripTile({
  tech,
  isCurrent,
  onSwitchTech,
  onTileLayout,
}: {
  tech: WorkweekTechOption;
  isCurrent: boolean;
  onSwitchTech?: (techId: number, techName: string) => void;
  onTileLayout: (
    techId: number,
    e: LayoutChangeEvent,
    viewNode?: View | null,
  ) => void;
}) {
  // PR-UX-15 (2026-05-09): mirror the landscape AvatarStripSlot's
  // ref-aware layout reporting. Portrait's strip is a flat
  // ScrollView so `event.nativeEvent.layout.x/y` is already
  // strip-relative (parent === ScrollView === strip ref'd view),
  // but passing the ref keeps the API surface identical and
  // future-proofs against any wrapper a future refactor might
  // introduce between the ScrollView and the chip.
  const tileRef = useRef<View>(null);
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      onTileLayout(tech.id, e, tileRef.current);
    },
    [onTileLayout, tech.id],
  );
  return (
    <View ref={tileRef} onLayout={handleLayout}>
      <TechAvatarChip
        name={tech.name}
        imageUrl={tech.profileImageUrl}
        isFiltered
        isSelected={isCurrent}
        showName={false}
        size={32}
        onPress={() => {
          if (isCurrent) return;
          haptic.light();
          onSwitchTech?.(tech.id, tech.name);
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  techStrip: {
    flexGrow: 0,
    paddingBottom: 4,
  },
  techStripContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    gap: 4,
  },
});
