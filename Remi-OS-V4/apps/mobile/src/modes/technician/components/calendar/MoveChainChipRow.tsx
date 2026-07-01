/**
 * `MoveChainChipRow` (PR-UX-1 / move-chain selector PASS 1).
 *
 * Horizontal chip row that surfaces the move-chain graph above the
 * calendar canvas. Each chip represents one chain; tapping a chip
 * activates it (and the calendar's overlay-style helper dims tiles
 * outside that chain). Tapping an active chip again returns to the
 * "Show all" reference view.
 *
 * Locked design rules (from the move-chain canvas mockup):
 *   - Each chain inherits its seed appointment's tech color via
 *     `colorForTech` — selected chip = filled chain-color background,
 *     unselected = outlined.
 *   - "Show all" pill is the leading element; active when
 *     `selectedChainId == null`.
 *   - Ecosystem labels render only when the ecosystem has 2+ chains
 *     (single-chain ecosystems show their chip alone).
 *   - 44pt minimum touch target per the technician app's touch-target
 *     non-negotiable.
 *
 * Visual + interaction only — no detection, no overlay drawing. The
 * caller passes `graph` (from `detectMoveChains`) and the active
 * `selectedChainId`. Tap callbacks bubble out via `onSelect`.
 */

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type AccessibilityRole,
} from "react-native";

import type { MoveChain, MoveChainGraph } from "@technician/utils/detect-move-chains";
import { haptic } from "@technician/hooks/utility/use-haptics";
import {
  isStepHighlighted,
  nextHighlightSet,
} from "@technician/components/calendar/move-chain-step-cycle";
import { usePendingRealityStore } from "@technician/stores/pending-reality";
import { useCalendarStore } from "@technician/stores/calendar";

const TOUCH_TARGET = 44;
// 2026-05-08 follow-up #7: visual pill height dropped from 32 → 28 per
// user request ("bring the top and bottom of the boxes lines down and
// up respectivly"). PR-UX-10 (2026-05-09) bumped to 32 to host the
// larger 12pt dots (was 8pt) — the per-chip step row is now
// `padding 5pt + dot 12pt + padding 5pt = 22pt` plus 1pt for arrow
// baseline alignment, so a 32pt pill keeps the chain-label text
// (`chainChipLabel.fontSize: 12`) vertically centered with breathing
// room. The touch target is unchanged at 44pt — every interactive
// Pressable inside the chip carries `hitSlop` with `top: 6, bottom: 6`
// so the hit-rect remains 32 + 12 = 44pt vertically.
const PILL_HEIGHT = 32;
/** Opacity applied to dimmed dots / arrows in the legend strip. */
const DIM_OPACITY = 0.25;

/**
 * Sentinel value for `selectedChainId` indicating "all chains
 * highlighted" mode (every chain renders in its own color, non-chain
 * tiles dim). Reachable only via the LAST chip's 2-state toggle.
 *
 * Kept as an exported constant so the overlay helper, store consumers,
 * and tests can compare without hard-coding the magic string.
 */
export const ALL_CHAINS_SENTINEL = "all";

export interface MoveChainChipRowProps {
  graph: MoveChainGraph;
  selectedChainId: string | null;
  /**
   * Activate / deactivate a chain. Pass `null` to return to the
   * "Show all" baseline. PR-UX-2 PASS 2.12 added the optional
   * `totalSteps` arg — the store uses it to seed the per-step
   * spotlight set to the FULL prefix on first isolate so the
   * chain visualization appears immediately rather than waiting
   * for a dot tap. Bound at the call site to
   * `usePendingRealityStore.setSelectedChainId`, which accepts
   * the same `(id, totalSteps?)` signature.
   */
  onSelect: (id: string | null, totalSteps?: number) => void;
  /**
   * Optional label override for each chain. When omitted the chip
   * shows "Chain N" where N is the chain's 1-based GLOBAL index
   * across `graph.chains`. Consumers can pass a richer label
   * (customer name, tech name, etc.) by deriving it from the seed
   * intent's `appointment_id`.
   */
  chainLabels?: Record<string, string>;
  /**
   * PR-UX-3 (2026-05-07): side-arrow widget. When provided, the
   * actively-isolated chain chip renders two chevrons flanking
   * its per-step dot row. Pressing a chevron walks the spotlight
   * one link forward / back via `advanceLink` (with wrap-around).
   * Both arrows hide when no chain is isolated, when the chain
   * has only a single step, or when the all-chains sentinel is
   * active. Wiring is opt-in: callers without
   * `useSideArrowTechMount` can omit these props and the chip
   * row reverts to its PR-UX-2 behavior.
   *
   * Spec: handoff doc §1.N1 (side-arrow widget) + §1.N2 (wrap).
   */
  onSideArrowPress?: (direction: "left" | "right") => void;
  /** Returns `true` when the side arrow in `direction` is interactive. */
  canSideArrowPress?: (direction: "left" | "right") => boolean;
  /**
   * Optional render slot for the `<NowFutureToggle />`.
   *
   * 2026-05-10 (history): originally rendered BELOW the chip
   * cluster as a third row, stacking under the dots inside the
   * white pill.
   *
   * 2026-05-12 (PR-UI-REDESIGN-2): the redesign moves this slot
   * INLINE on Row 1, anchored to the right of the Show none /
   * Show all pills. The chip row is now a 3-row stack:
   *   - Row 1: `[Show none] [Show all] [bottomSlot]`
   *   - Row 2: `[< ECOSYSTEM N OF M · K CHAINS >]` (carousel)
   *   - Row 3: chain chip cluster
   * The prop name is preserved so neither call site
   * (`resource-calendar-day-view.tsx`,
   * `resource-calendar-workweek-view.tsx`) needs a rename — they
   * keep passing `chipRowBottomSlot` → `bottomSlot`; only the
   * rendering position changed.
   */
  bottomSlot?: ReactNode;
  /**
   * 2026-05-10 user fix (landscape, follow-up to `bottomSlot`):
   * optional render slot placed INLINE on the same horizontal
   * line as the active ecosystem's chip cluster, anchored to its
   * right edge. Hosts the landscape `<NowFutureLandscapeToggle />`
   * inside the floating popover (replacing the corner-anchored
   * standalone pill mounted by `LandscapeWorkweekView`). When
   * provided, the chip cluster's horizontal `ScrollView` switches
   * to `flex: 1` inside a row-flex wrapper so it scrolls within
   * the remaining width while the slot stays content-sized on the
   * right. When omitted, the chip cluster renders edge-to-edge as
   * before.
   *
   * Distinct from `bottomSlot` so portrait + landscape can co-exist
   * on the same component without flipping a mode prop. Portrait
   * call sites pass `bottomSlot`, landscape passes
   * `chipClusterRightSlot`; nothing prevents both from being
   * passed at once if a future surface needs both, but the current
   * consumers use exactly one apiece.
   *
   * 2026-05-10 follow-up (same-day): the toggle was relocated AGAIN
   * to `headerRowRightSlot` (Row 1, beside the carousel header)
   * because the user reported the chip cluster's dot row
   * obscured the toggle when several dots were present. The
   * `chipClusterRightSlot` prop is preserved for any future
   * landscape surface that genuinely wants Row-2 inline placement,
   * but the current `LandscapeWorkweekView` mount uses
   * `headerRowRightSlot` instead.
   */
  chipClusterRightSlot?: ReactNode;
  /**
   * 2026-05-10 user fix (same-day follow-up): optional render slot
   * placed INLINE on the same horizontal line as the carousel
   * header (Row 1), anchored to the right edge of the row after
   * the carousel chevrons + counter text. Hosts the landscape
   * `<NowFutureLandscapeToggle />` (relocated from
   * `chipClusterRightSlot`).
   *
   * Why two distinct landscape slots: Row 2 (the dot cluster)
   * scrolls horizontally and visually competes with a pill at its
   * right edge; Row 1 (the carousel header) is a fixed-height
   * 32pt band with a clear right-edge anchor, perfect for a small
   * action pill. The user explicitly asked for "up a line, to the
   * right of the carousel" — this slot is that mount point.
   *
   * Visual constraint: keep the slot's content height ≤ 32pt so
   * the row's `alignItems: "center"` keeps the toggle vertically
   * centered with the chevrons + counter. The
   * `<NowFutureLandscapeToggle />` pill clocks in at ~28pt with a
   * 16pt icon + 12pt label so it fits with breathing room.
   */
  headerRowRightSlot?: ReactNode;
  /** Test id for the outer container. */
  testID?: string;
}

export function MoveChainChipRow({
  graph,
  selectedChainId,
  onSelect,
  chainLabels,
  onSideArrowPress,
  canSideArrowPress,
  bottomSlot,
  chipClusterRightSlot,
  headerRowRightSlot,
  testID,
}: MoveChainChipRowProps) {
  // 2026-05-10 follow-up logging: chip-row mount/unmount marker so a
  // future regression of the "toggle disappears + can't get back"
  // bug is observable from a single grep instead of inferring it
  // from the absence of `[ChipRow] painting` lines. Reads the live
  // store snapshots at mount/unmount time so the log carries the
  // surrounding state (intent count, sessionId, futureMode) without
  // re-rendering.
  useEffect(() => {
    if (__DEV__) {
      const livePending = usePendingRealityStore.getState();
      const liveCal = useCalendarStore.getState();
      console.log("[ChipRow] mount", {
        chainCount: graph.chains.length,
        ecosystemCount: graph.ecosystems.length,
        intentCount: livePending.intents.length,
        sessionId: livePending.sessionId,
        futureMode: liveCal.futureMode,
      });
    }
    return () => {
      if (__DEV__) {
        const livePending = usePendingRealityStore.getState();
        const liveCal = useCalendarStore.getState();
        console.log("[ChipRow] unmount", {
          intentCount: livePending.intents.length,
          sessionId: livePending.sessionId,
          futureMode: liveCal.futureMode,
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only
  }, []);
  // PR-UX-2 PASS 2.11 (task `c8`): per-step spotlight cycle. Read +
  // write directly from the store so the wrappers (workweek / day /
  // landscape) don't have to plumb yet another prop pair through —
  // every consumer of the spotlight (ghost injector, arrow compute,
  // border override, pulse resolver) already pulls from the same
  // store anyway.
  const chainStepHighlights = usePendingRealityStore(
    (s) => s.chainStepHighlights,
  );
  const setChainStepHighlights = usePendingRealityStore(
    (s) => s.setChainStepHighlights,
  );

  const onDotPress = useCallback(
    (chainId: string, dotIndex: number, totalSteps: number) => {
      // Dots are only interactive when their chain is the actively
      // isolated one. Tapping a dot inside a non-active chip first
      // isolates the chain — the user can then re-tap to enter the
      // per-step cycle. Without this guard a tap on a different
      // chain's dot would mutate the spotlight set against a chain
      // the user can't see.
      if (selectedChainId !== chainId) {
        haptic.light();
        // PR-UX-2 PASS 2.12: forward the chain length so the
        // store seeds the spotlight to the full prefix on
        // isolate (matches the chip-tap path above). Without
        // this, dot-on-not-yet-active-chain isolates with an
        // empty spotlight and the next dot tap looks like it
        // jumped two states forward (`[]` → `[i]` reads as a
        // first-tap when the user expected a second).
        onSelect(chainId, totalSteps);
        return;
      }

      // 3-state per-dot cycle, no timing-based double-tap (PR-UX-2
      // PASS 2.11 v2, 2026-05-05). See `move-chain-step-cycle.ts`
      // for the full transition table — same dot tapped repeatedly
      // walks `[i] → [0..i] → []` and back to `[i]`.
      const next = nextHighlightSet({
        current: chainStepHighlights,
        totalSteps,
        dotIndex,
      });
      // Pure helper returns the same reference on no-op; the store
      // setter additionally short-circuits on equal-content arrays.
      if (next !== chainStepHighlights) {
        haptic.light();
        setChainStepHighlights(next);
      }
    },
    [
      chainStepHighlights,
      onSelect,
      selectedChainId,
      setChainStepHighlights,
    ],
  );
  // Pre-compute the GLOBAL chain index so labels stay stable across
  // re-renders and selections. Per-ecosystem indexing was tried first
  // but produced "Chain 1, Chain 1, Chain 1" when every ecosystem had
  // a single chain (the common case for a few independent staged
  // moves) — global indexing keeps each chip's label uniquely
  // identifiable regardless of ecosystem grouping.
  const chainGlobalIndex = useMemo(() => {
    const map = new Map<string, number>();
    graph.chains.forEach((c, i) => map.set(c.id, i + 1));
    return map;
  }, [graph.chains]);

  // Ecosystem ordinal (1-based) keyed by ecosystem id, used for the
  // "Ecosystem N · M chain(s)" label that always renders per canvas
  // PR-UX-2 PASS 2.6 (was previously gated to ecosystems with 2+
  // chains, which hid the structural intent for single-chain
  // ecosystems — canvas Decision 5 says always render).
  const ecosystemOrdinalById = useMemo(() => {
    const map = new Map<string, number>();
    graph.ecosystems.forEach((e, i) => map.set(e.id, i + 1));
    return map;
  }, [graph.ecosystems]);

  // Stable lookup of MoveChain by id so chip rendering can pull
  // color + step count without scanning the array each tap.
  const chainById = useMemo(() => {
    const m = new Map<string, MoveChain>();
    for (const c of graph.chains) m.set(c.id, c);
    return m;
  }, [graph.chains]);

  // Reverse lookup: chain id → ecosystem index (within graph.ecosystems).
  // Used by the carousel auto-step effect to snap to the ecosystem of
  // a newly-staged chain (`useAutoIsolateOnStage` sets `selectedChainId`
  // to the new chain's id; the carousel observes that and steps).
  const ecosystemIndexByChainId = useMemo(() => {
    const m = new Map<string, number>();
    graph.ecosystems.forEach((eco, idx) => {
      for (const cid of eco.chainIds) m.set(cid, idx);
    });
    return m;
  }, [graph.ecosystems]);

  // PLAN-DEVIATION: 2026-05-08-chip-row-ecosystem-carousel —
  // see docs/PLAN-DEVIATIONS.md#2026-05-08-chip-row-ecosystem-carousel
  //
  // Local-only carousel index. The chip row shows ONE ecosystem at a
  // time; chevrons step between them. Kept as component state per
  // architecture.mdc — pure UI position state, not domain state, so
  // there's no reason to put it in Zustand. Mounting always starts at
  // ecosystem 0; navigation history beyond that is lost on remount,
  // which is the desired UX (a fresh chip-row mount lands on the
  // first ecosystem regardless of where the previous mount was).
  const [ecosystemIndex, setEcosystemIndex] = useState(0);

  // 2026-05-08 follow-up #7 (auto-snap one-shot guard): tracks the
  // last `selectedChainId` we already auto-snapped for. The ref-guard
  // makes auto-snap fire ONCE per `selectedChainId` transition;
  // without it, the effect would stomp every chevron press because
  // pressing prev/next doesn't change `selectedChainId`, so on the
  // next render the effect would still see "selectedChainId belongs
  // to ecosystem N, but ecosystemIndex is M" and snap back. The
  // user-visible symptom was: with chain-917 isolated on ecosystem 1,
  // pressing the LEFT chevron to go to ecosystem 0 immediately
  // reverted to ecosystem 1 — the user could only escape via "Show
  // all" (which clears `selectedChainId` and short-circuits the
  // effect's body). The clamp-on-shrink effect below is a separate
  // concern and stays unguarded.
  const lastSnappedChainIdRef = useRef<string | null>(null);

  // Auto-step: snap to a newly-staged chain's ecosystem. When the
  // store-driven `useAutoIsolateOnStage` sets `selectedChainId` to a
  // new chain after a drag, the carousel jumps to that chain's
  // ecosystem so the user sees the chip immediately. Sentinel
  // values (`null` baseline, ALL_CHAINS_SENTINEL) don't trigger the
  // step — they don't belong to a single ecosystem.
  //
  // `ecosystemIndex` stays in the dep array because the effect reads
  // it for the early-return; the ref is what actually prevents the
  // loop. With the ref guard the effect body short-circuits on every
  // re-render after the user has manually moved the carousel and
  // `selectedChainId` hasn't changed.
  useEffect(() => {
    if (selectedChainId === lastSnappedChainIdRef.current) return;
    lastSnappedChainIdRef.current = selectedChainId;

    if (selectedChainId == null) return;
    if (selectedChainId === ALL_CHAINS_SENTINEL) return;
    const target = ecosystemIndexByChainId.get(selectedChainId);
    if (target == null) return;
    if (target === ecosystemIndex) return;
    setEcosystemIndex(target);
  }, [selectedChainId, ecosystemIndexByChainId, ecosystemIndex]);

  // Clamp the index when the ecosystem list shrinks below it (e.g.,
  // user reverts an intent and the trailing ecosystem disappears).
  // Keyed on ecosystem count so it fires on the count delta only,
  // not on every render.
  const ecosystemCount = graph.ecosystems.length;
  useEffect(() => {
    if (ecosystemCount === 0) return;
    if (ecosystemIndex >= ecosystemCount) {
      setEcosystemIndex(ecosystemCount - 1);
    }
  }, [ecosystemCount, ecosystemIndex]);

  // 2026-05-08 follow-up #5 (chip-row vertical-stack diagnostic
  // post-resolution) — kept as a regular `console.log` so the next
  // on-device verification pass can confirm the chip row is
  // rendering with the same `chainCount` / `ecosystemCount` it
  // logs here. Follow-up #4 used `console.warn` on the assumption
  // the bug was render-staleness; it turned out to be a layout
  // bug (RN 0.81 wrap-row + horizontal ScrollView measurement),
  // so the warn-level urgency is no longer justified. The triplet
  // pairing with `[DEBUG:useMoveChainGraph] recompute` (hook side)
  // and `[DEBUG:DV:render]` (day-view consumer side) stays — once
  // the user confirms all detected ecosystems are visible after
  // this layout change, all three diagnostics can be deleted in a
  // follow-up cleanup.
  //
  // 2026-05-08 follow-up #6: extended with `ecosystemIndex` +
  // `activeEcoId` so the carousel auto-step path is observable
  // on-device alongside the existing chain/ecosystem counts.
  const activeEcoForLog = graph.ecosystems[ecosystemIndex];
  if (__DEV__) {
    const liveStore = usePendingRealityStore.getState();
    console.log("[ChipRow] painting", {
      chainCount: graph.chains.length,
      ecosystemCount: graph.ecosystems.length,
      ecosystemIndex,
      activeEcoId: activeEcoForLog?.id ?? null,
      selectedChainId,
      // 2026-05-08 follow-up #7: surface the auto-snap ref so future
      // on-device verification can confirm the ref advances exactly
      // once per `selectedChainId` transition. Reading `.current` in a
      // log doesn't re-render — refs are imperative.
      lastSnappedFromRef: lastSnappedChainIdRef.current,
      intentCountFromStore: liveStore.intents.length,
      sessionIdFromStore: liveStore.sessionId,
    });
  }

  if (graph.chains.length === 0) return null;

  // The last chip in the global ordering owns a special 2-state
  // toggle: tap = isolate just this chain; tap again = "all chains"
  // overview (everything highlighted in own color); tap again = back
  // to isolate. Alternates forever. The user reaches the plain
  // baseline ONLY via the leading "Show all" pill.
  const lastChainId = graph.chains[graph.chains.length - 1]?.id ?? null;

  // PLAN-DEVIATION: 2026-05-09-pr-ux-16-followups —
  // "Show none" deselects every chain (returns to the baseline
  // where every appointment renders plain) and "Show all"
  // activates the cross-ecosystem ALL_CHAINS_SENTINEL mode so
  // every chain in every ecosystem renders its highlights /
  // ghosts simultaneously. Pre-PR-UX-16 the "Show all" pill was
  // misnamed — its actual behavior was the "show none" baseline,
  // and the all-chains overview was reachable only via the last
  // chip's 2-state toggle. The user explicitly asked for two
  // distinct pills with semantically correct labels. See
  // docs/PLAN-DEVIATIONS.md#2026-05-09-pr-ux-16-followups.
  const onShowNonePress = () => {
    if (selectedChainId == null) return;
    haptic.light();
    onSelect(null);
  };
  const onShowAllPress = () => {
    if (selectedChainId === ALL_CHAINS_SENTINEL) return;
    haptic.light();
    onSelect(ALL_CHAINS_SENTINEL);
  };

  const onChipPress = (chainId: string) => {
    haptic.light();
    const isLast = chainId === lastChainId;
    // PR-UX-2 PASS 2.12 (2026-05-05): chip-press passes the chain
    // length so the store can seed `chainStepHighlights` to the
    // FULL prefix `[0..N-1]` on isolate. Without this the user
    // taps Chain 1 and the visualization stays dim until they
    // discover the dot cycle — the bug surfaced when the user
    // reported "the last card has no chain border" while in fact
    // ALL cards were dim because the spotlight was empty.
    // ALL_CHAINS_SENTINEL doesn't take a length (it has no single
    // chain to scope a spotlight against; the store ignores
    // totalSteps in that branch).
    const stepsForChain = chainById.get(chainId)?.intentIds.length ?? 0;

    if (isLast) {
      // Last chip: isolate ↔ all-chains toggle. Never deselects to
      // null on its own; the user explicitly taps "Show all" for
      // baseline.
      if (selectedChainId === ALL_CHAINS_SENTINEL) {
        onSelect(chainId, stepsForChain);
        return;
      }
      // Either nothing selected, or a different chain isolated, or
      // THIS chain isolated — all three transition to "all chains"
      // on the next tap of the last chip. (Tapping a non-last chip
      // first sets that chain isolated; then tapping the last chip
      // jumps to all-chains. Tapping the last chip again from
      // all-chains goes back to isolating it specifically.)
      if (selectedChainId === chainId) {
        onSelect(ALL_CHAINS_SENTINEL);
        return;
      }
      onSelect(chainId, stepsForChain);
      return;
    }

    // Non-last chip: tap to isolate; tap again to return to baseline.
    if (selectedChainId === chainId) {
      onSelect(null);
      return;
    }
    onSelect(chainId, stepsForChain);
  };

  // PR-UX-2 PASS 2.1 (2026-05-04): switched from horizontal ScrollView
  // to a wrapping View at the OUTER level so the "Show all" pill +
  // multiple ecosystems can stack vertically without horizontal
  // overflow. The original rationale ("hides chips off-screen with no
  // visual cue") still holds at THAT level — every ecosystem header
  // and the "Show all" pill stay on-screen via wrap.
  //
  // PLAN-DEVIATION: 2026-05-07-chip-row-ecosystem-scroll —
  // see docs/PLAN-DEVIATIONS.md#2026-05-07-chip-row-ecosystem-scroll
  //
  // 2026-05-07 (cascade-real, this branch): the per-ecosystem chip
  // row inside `chipGroupRow` is now a horizontal ScrollView. PASS 2.1
  // assumed two-line wrap was the expected ceiling, but on real
  // FO-built cascades a single ecosystem regularly produces 3+ chains
  // (the screenshot that surfaced this bug had 3 chains in one
  // ecosystem and the third was clipped at the right edge with no
  // affordance to reveal it). Per-ecosystem horizontal scroll keeps
  // the chip count off the canvas's vertical budget — the calendar
  // grid is already tight on a portrait phone — and the iOS scroll
  // indicator + scrollable swipe gesture give the user the visual
  // cue that PASS 2.1 was worried about losing.
  //
  // PLAN-DEVIATION: 2026-05-08-chip-row-ecosystem-carousel —
  // see docs/PLAN-DEVIATIONS.md#2026-05-08-chip-row-ecosystem-carousel
  //
  // 2026-05-08 follow-up #6: the outer layout is now a 2-row stack
  // (Row 1: "Show all" + ecosystem carousel header with chevrons +
  // counter, Row 2: the ACTIVE ecosystem's chip cluster only). This
  // supersedes `2026-05-08-chip-row-ecosystem-vertical-stack`, which
  // stacked every ecosystem vertically — the user explicitly opted
  // for one ecosystem at a time with chevron navigation to keep the
  // chip row's vertical footprint small. The outer container keeps
  // `flexDirection: "column"` from the superseded deviation; what's
  // changed is that we no longer iterate `graph.ecosystems`, we pick
  // `activeEco = graph.ecosystems[ecosystemIndex]` and render only
  // that group. The per-ecosystem horizontal `ScrollView` from
  // 2026-05-07 still applies — it's how a busy single ecosystem
  // (4+ chains) stays reachable.
  const onPrev = () => {
    if (ecosystemIndex <= 0) return;
    haptic.light();
    setEcosystemIndex((i) => i - 1);
  };
  const onNext = () => {
    if (ecosystemIndex >= graph.ecosystems.length - 1) return;
    haptic.light();
    setEcosystemIndex((i) => i + 1);
  };

  const activeEco = graph.ecosystems[ecosystemIndex];
  // Belt-and-suspenders. The clamp effect above keeps `ecosystemIndex`
  // in range; the `graph.chains.length === 0` short-circuit further up
  // covers the empty-graph case (every chain belongs to exactly one
  // ecosystem, so chains > 0 implies ecosystems > 0). This null-guard
  // protects against the one render between an ecosystem-list shrink
  // and the clamp effect's next tick.
  if (!activeEco) return null;

  const totalEcosystems = graph.ecosystems.length;
  const showCarouselNav = totalEcosystems > 1;
  const canGoPrev = ecosystemIndex > 0;
  const canGoNext = ecosystemIndex < totalEcosystems - 1;
  const activeOrdinal = ecosystemOrdinalById.get(activeEco.id) ?? 1;
  const activeChainCount = activeEco.chainIds.length;
  const activeChainCountLabel = `${activeChainCount} ${activeChainCount === 1 ? "chain" : "chains"}`;
  const counterText = showCarouselNav
    ? `Ecosystem ${activeOrdinal} of ${totalEcosystems} · ${activeChainCountLabel}`
    : `Ecosystem ${activeOrdinal} · ${activeChainCountLabel}`;

  return (
    <View
      style={styles.wrap}
      testID={testID ?? "move-chain-chip-row"}
      onLayout={
        __DEV__
          ? (e) => {
              const { width, height } = e.nativeEvent.layout;
              console.log("[DIAG-CHIP-LAYOUT] wrap onLayout", {
                width: Math.round(width),
                height: Math.round(height),
                chainCount: graph.chains.length,
                ecosystemCount: graph.ecosystems.length,
                counterText,
              });
            }
          : undefined
      }
    >
      {/* PR-UI-REDESIGN-2 (2026-05-12) — Row 1: filter chips +
        * inline-right slot (Now/Future).
        *
        * Previously this row also hosted the ecosystem carousel
        * header on the right (`ecosystemCarouselHeader` block).
        * The redesign moves that block out into its own dedicated
        * Row 2 below — see comment on the new row. `bottomSlot`,
        * which used to render BELOW the chip cluster, now sits
        * inline-right on this row (between Show all and any
        * `chipClusterRightSlot` content that may have been
        * passed). Net result for the existing call sites:
        * `chipRowBottomSlot` → `bottomSlot` → inline-right of
        * Show all, matching the redesign mockups. */}
      <View
        style={styles.headerRow}
        onLayout={
          __DEV__
            ? (e) => {
                const { width, height } = e.nativeEvent.layout;
                console.log("[DIAG-CHIP-LAYOUT] headerRow onLayout", {
                  width: Math.round(width),
                  height: Math.round(height),
                  showCarouselNav,
                  counterText,
                });
              }
            : undefined
        }
      >
        {/* PLAN-DEVIATION: 2026-05-09-pr-ux-16-followups —
            "Show none" deselects every chain (baseline plain
            rendering); "Show all" activates the all-chains
            overview across every ecosystem. The pre-PR-UX-16 pill
            with testID `move-chain-show-all` was actually the
            baseline pill — its testID is preserved here for the
            "Show none" button so existing call sites + e2e
            selectors keep working, with `move-chain-show-none-alias`
            available as a future-friendly alternative. The new
            "Show all" button uses `move-chain-show-all-chains`. */}
        <Pressable
          accessibilityRole={"button" satisfies AccessibilityRole}
          accessibilityLabel="Show none"
          accessibilityState={{ selected: selectedChainId == null }}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          onPress={onShowNonePress}
          style={({ pressed }) => [
            styles.chip,
            styles.showAllChip,
            selectedChainId == null && styles.showAllChipActive,
            pressed && styles.chipPressed,
          ]}
          testID="move-chain-show-all"
        >
          <Text
            style={[
              styles.chipLabel,
              selectedChainId == null && styles.chipLabelOnFilled,
            ]}
          >
            Show none
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole={"button" satisfies AccessibilityRole}
          accessibilityLabel="Show all chains"
          accessibilityState={{
            selected: selectedChainId === ALL_CHAINS_SENTINEL,
          }}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          onPress={onShowAllPress}
          style={({ pressed }) => [
            styles.chip,
            styles.showAllChip,
            selectedChainId === ALL_CHAINS_SENTINEL &&
              styles.showAllChipActive,
            pressed && styles.chipPressed,
          ]}
          testID="move-chain-show-all-chains"
        >
          <Text
            style={[
              styles.chipLabel,
              selectedChainId === ALL_CHAINS_SENTINEL &&
                styles.chipLabelOnFilled,
            ]}
          >
            Show all
          </Text>
        </Pressable>
        {/* PR-UI-REDESIGN-2 (2026-05-12): spacer pushes the
          * inline-right `bottomSlot` (Now/Future) to the row's
          * trailing edge. */}
        <View style={styles.filterRowSpacer} />
        {bottomSlot ? (
          <View
            style={styles.filterRowInlineSlot}
            testID="move-chain-chip-row-bottom-slot"
          >
            {bottomSlot}
          </View>
        ) : null}
      </View>

      {/* PR-UI-REDESIGN-2 (2026-05-12) — Row 2: ecosystem carousel
        * header on its OWN dedicated line. Hosts the prev / next
        * chevrons + the `Ecosystem N of M · K chains` counter.
        * Landscape's `headerRowRightSlot` continues to anchor to
        * the right of this row (its original purpose was "beside
        * the carousel header" — the carousel just moved down a
        * row, the prop's semantic anchor is unchanged). */}
      <View
        style={styles.ecosystemCarouselRow}
        onLayout={
          __DEV__
            ? (e) => {
                const { width, height } = e.nativeEvent.layout;
                console.log(
                  "[DIAG-CHIP-LAYOUT] ecosystemCarouselHeader onLayout",
                  {
                    width: Math.round(width),
                    height: Math.round(height),
                    counterText,
                    showCarouselNav,
                  },
                );
              }
            : undefined
        }
      >
        <View style={styles.ecosystemCarouselHeader}>
          {showCarouselNav ? (
            <Pressable
              accessibilityRole={"button" satisfies AccessibilityRole}
              accessibilityLabel="Previous ecosystem"
              accessibilityState={{ disabled: !canGoPrev }}
              disabled={!canGoPrev}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 8 }}
              onPress={onPrev}
              style={({ pressed }) => [
                styles.carouselChevronPressable,
                !canGoPrev && styles.sideArrowDisabled,
                pressed && styles.chipPressed,
              ]}
              testID="move-chain-eco-carousel-prev"
            >
              <Text style={styles.sideArrowGlyphCarousel}>{"\u2039"}</Text>
            </Pressable>
          ) : null}
          <Text
            style={styles.ecosystemCarouselLabel}
            accessibilityRole={"header" satisfies AccessibilityRole}
            numberOfLines={1}
            testID={
              showCarouselNav
                ? "move-chain-eco-carousel-counter"
                : "move-chain-eco-carousel-counter-solo"
            }
          >
            {counterText}
          </Text>
          {showCarouselNav ? (
            <Pressable
              accessibilityRole={"button" satisfies AccessibilityRole}
              accessibilityLabel="Next ecosystem"
              accessibilityState={{ disabled: !canGoNext }}
              disabled={!canGoNext}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
              onPress={onNext}
              style={({ pressed }) => [
                styles.carouselChevronPressable,
                !canGoNext && styles.sideArrowDisabled,
                pressed && styles.chipPressed,
              ]}
              testID="move-chain-eco-carousel-next"
            >
              <Text style={styles.sideArrowGlyphCarousel}>{"\u203A"}</Text>
            </Pressable>
          ) : null}
        </View>
        {/* Landscape mount point — sibling of the carousel header
          * inside the new dedicated row. Same prop, new row. */}
        {headerRowRightSlot ? (
          <View
            style={styles.headerRowRightSlot}
            testID="move-chain-chip-row-header-right-slot"
          >
            {headerRowRightSlot}
          </View>
        ) : null}
      </View>

      {/* Row 2: active ecosystem's chip cluster.

          2026-05-10 user fix (landscape follow-up): when the
          caller passes `chipClusterRightSlot`, the ScrollView is
          wrapped in a `chipClusterRow` horizontal flex with the
          slot anchored at the right edge. The ScrollView gets
          `flex: 1` in that branch so it scrolls within remaining
          width while the slot stays content-sized. When the slot
          is omitted, the ScrollView renders edge-to-edge as before
          — zero visual change for portrait callers (`bottomSlot`
          path) or landscape mounts that don't pass the slot. */}
      <View
        key={activeEco.id}
        style={styles.ecosystemGroup}
        testID={`move-chain-eco-label-${activeEco.id}`}
      >
        <View
          style={
            chipClusterRightSlot ? styles.chipClusterRow : undefined
          }
        >
        {/*
          PLAN-DEVIATION: 2026-05-07-chip-row-ecosystem-scroll —
          see top-of-component comment.

          `showsHorizontalScrollIndicator` is the native iOS
          affordance that addresses PASS 2.1's "no visual cue more
          existed" worry. `keyboardShouldPersistTaps="handled"` is
          defensive — chips render dot-Pressables inside the
          scroll, and a ScrollView's default tap-handling can
          swallow the press if a stale keyboard is up (rare, but
          not impossible, e.g. when the chip row sits above a
          BottomSheet input that's losing focus).
        */}
        <ScrollView
          horizontal
          // 2026-05-10 follow-up (white-space fix): defaults to `false`
          // — the indicator was reserving vertical inset space inside
          // the chip-cluster ScrollView even when the chains fit
          // edge-to-edge. With chips already taller than the
          // indicator's strip, the user reads it as "wasted white
          // space at the bottom of the pill." The indicator was
          // never functionally meaningful here because the chip
          // cluster scrolls in a tight band; if scrollability
          // re-becomes important, swap back to `true` AND add a
          // contentInset of zero to suppress the bottom strip.
          showsHorizontalScrollIndicator={false}
          // Suppress iOS's automatic content-inset adjustment. The
          // chip row lives in an absolute-positioned pill that
          // doesn't sit under a nav bar or tab bar — the default
          // `automaticallyAdjustContentInsets: true` was nudging
          // the cluster down by a status-bar-height worth of
          // padding on some viewports.
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.chipGroupRow}
          // Pin the ScrollView's frame height to exactly the chip
          // height so the cluster band can't grow taller than its
          // tallest chip child. Without this, iOS's ScrollView
          // measures content-then-padding and ends up ~12pt taller
          // than its visible content.
          style={
            chipClusterRightSlot
              ? [styles.chipClusterScroll, styles.chipGroupScrollSelf]
              : styles.chipGroupScrollSelf
          }
          testID={`move-chain-chip-group-scroll-${activeEco.id}`}
        >
          {activeEco.chainIds.map((chainId) => {
              const chain = chainById.get(chainId);
              if (!chain) return null;
              // In "all chains" mode every chip renders filled (each
              // in its own color) so the user gets an immediate
              // visual cue that the last chip's toggle landed in
              // all-chains state. In single-isolate mode only the
              // matching chip fills.
              const isAllChainsMode =
                selectedChainId === ALL_CHAINS_SENTINEL;
              const isSelected =
                selectedChainId === chainId || isAllChainsMode;
              const globalIndex = chainGlobalIndex.get(chainId) ?? 1;
              const label =
                chainLabels?.[chainId] ?? `Chain ${globalIndex}`;
              const stepCount = chain.intentIds.length;

              // PLAN-DEVIATION: 2026-05-05-per-step-coloring — each
              // chip renders as a flow of per-step dots with little
              // arrows between them, mirroring the chain's calendar
              // visualization. `chain.stepColors[k]` for k in
              // [0..stepCount-1] picks the k-th dot's color.
              const stepColors =
                chain.stepColors.length === stepCount
                  ? chain.stepColors
                  : Array.from({ length: stepCount }, (_, i) =>
                      chain.stepColors[i] ?? chain.color,
                    );

              // Per-step dot lit/dim state. Only the actively
              // isolated chain renders its dots in cycling-spotlight
              // mode — every other chip's dots paint at full color
              // so the user can see the chain identities at a
              // glance and tap a dot to switch to that chain (which
              // is what the dot-tap fallback in `onDotPress` does
              // when `selectedChainId !== chainId`).
              const isActiveChain = selectedChainId === chainId;

              return (
                <View
                  key={chainId}
                  style={[
                    styles.chip,
                    styles.chainChip,
                    isSelected && styles.chainChipSelected,
                  ]}
                  testID={`move-chain-chip-${chainId}`}
                >
                  <Pressable
                    accessibilityRole={"button" satisfies AccessibilityRole}
                    accessibilityLabel={`${label}, ${stepCount} ${stepCount === 1 ? "step" : "steps"}`}
                    accessibilityState={{ selected: isSelected }}
                    hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
                    onPress={() => onChipPress(chainId)}
                    style={({ pressed }) => [
                      styles.chipLabelPressable,
                      pressed && styles.chipPressed,
                    ]}
                    testID={`move-chain-chip-${chainId}-label`}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        styles.chainChipLabel,
                        isSelected && styles.chainChipLabelSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  </Pressable>
                  <View style={styles.stepFlowRow}>
                    {/* PR-UX-3 N1: side-arrow widget. Renders only on
                        the actively-isolated chain (single chain at a
                        time). Hidden when the chain has 0/1 steps
                        (canAdvance returns false in those cases). The
                        host wires `onSideArrowPress` /
                        `canSideArrowPress` via `useSideArrowTechMount`,
                        which also handles the cross-tech remount +
                        flash banner. */}
                    {isActiveChain && onSideArrowPress ? (
                      <Pressable
                        accessibilityRole={"button" satisfies AccessibilityRole}
                        accessibilityLabel="Previous link in chain"
                        accessibilityState={{
                          disabled: !(canSideArrowPress?.("left") ?? true),
                        }}
                        disabled={!(canSideArrowPress?.("left") ?? true)}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 4 }}
                        onPress={() => {
                          haptic.light();
                          onSideArrowPress("left");
                        }}
                        style={({ pressed }) => [
                          styles.sideArrowPressable,
                          !(canSideArrowPress?.("left") ?? true) &&
                            styles.sideArrowDisabled,
                          pressed && styles.chipPressed,
                        ]}
                        testID={`move-chain-chip-${chainId}-arrow-left`}
                      >
                        <Text style={styles.sideArrowGlyph}>{"\u2039"}</Text>
                      </Pressable>
                    ) : null}
                    {stepColors.map((dotColor, idx) => {
                      const dotLit =
                        !isActiveChain ||
                        isStepHighlighted(chainStepHighlights, idx);
                      const nextLit =
                        idx < stepColors.length - 1 &&
                        (!isActiveChain ||
                          isStepHighlighted(
                            chainStepHighlights,
                            idx + 1,
                          ));
                      const arrowLit = dotLit && nextLit;
                      return (
                        <View key={`step-${idx}`} style={styles.stepFlowGroup}>
                          <Pressable
                            accessibilityRole={
                              "button" satisfies AccessibilityRole
                            }
                            accessibilityLabel={`Step ${idx + 1} of ${stepCount}${dotLit ? ", lit" : ", dim"}`}
                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                            onPress={() =>
                              onDotPress(chainId, idx, stepCount)
                            }
                            style={({ pressed }) => [
                              styles.stepDotPressable,
                              pressed && styles.chipPressed,
                            ]}
                            testID={`move-chain-chip-${chainId}-step-${idx}`}
                          >
                            <View
                              style={[
                                styles.stepDot,
                                {
                                  backgroundColor: dotColor,
                                  opacity: dotLit
                                    ? 1
                                    : DIM_OPACITY,
                                },
                              ]}
                            />
                          </Pressable>
                          {idx < stepColors.length - 1 ? (
                            <Text
                              style={[
                                styles.stepArrow,
                                {
                                  color:
                                    stepColors[idx + 1] ?? dotColor,
                                  opacity: arrowLit ? 1 : DIM_OPACITY,
                                },
                              ]}
                            >
                              {"\u203A"}
                            </Text>
                          ) : null}
                        </View>
                      );
                    })}
                    {/* PR-UX-3 N1: trailing side-arrow. See leading
                        arrow above for rationale. */}
                    {isActiveChain && onSideArrowPress ? (
                      <Pressable
                        accessibilityRole={"button" satisfies AccessibilityRole}
                        accessibilityLabel="Next link in chain"
                        accessibilityState={{
                          disabled: !(canSideArrowPress?.("right") ?? true),
                        }}
                        disabled={!(canSideArrowPress?.("right") ?? true)}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 6 }}
                        onPress={() => {
                          haptic.light();
                          onSideArrowPress("right");
                        }}
                        style={({ pressed }) => [
                          styles.sideArrowPressable,
                          !(canSideArrowPress?.("right") ?? true) &&
                            styles.sideArrowDisabled,
                          pressed && styles.chipPressed,
                        ]}
                        testID={`move-chain-chip-${chainId}-arrow-right`}
                      >
                        <Text style={styles.sideArrowGlyph}>{"\u203A"}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
          })}
        </ScrollView>
        {chipClusterRightSlot ? (
          <View
            style={styles.chipClusterRightSlot}
            testID="move-chain-chip-row-cluster-right-slot"
          >
            {chipClusterRightSlot}
          </View>
        ) : null}
        </View>
      </View>
      {/* PR-UI-REDESIGN-2 (2026-05-12): the prior bottom-slot row
        * is gone — `bottomSlot` now renders inline on Row 1 (see
        * above). The slot prop's testID (`move-chain-chip-row-
        * bottom-slot`) was preserved on its new mount point so
        * any e2e selector that targets it keeps working. */}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // PLAN-DEVIATION: 2026-05-08-chip-row-ecosystem-carousel —
    // see docs/PLAN-DEVIATIONS.md#2026-05-08-chip-row-ecosystem-carousel
    //
    // Outer container is a 2-row column stack (header row + active
    // ecosystem's chip cluster). The column-stack form was inherited
    // from the now-superseded `2026-05-08-chip-row-ecosystem-vertical-stack`
    // deviation; the carousel deviation extends it by NOT iterating
    // every ecosystem in Row 2 — only the `activeEco` is rendered,
    // chevrons in Row 1 step between them.
    //
    // 2026-05-10 user fix: tightened vertical breathing room. The
    // user reported "the chip bar for the dots is still too tall, I
    // don't know why there is so much white space under the dots in
    // that white container, tighten it up." `gap` 6 → 2 collapses
    // the inter-row whitespace that read as wasted real estate
    // under the dot row; `paddingVertical` 6 → 3 trims the
    // top/bottom band of the white pill.
    //
    // 2026-05-10 user fix #2: user reported it STILL reads as too
    // tall ("white space on the bottom"). Further tightened
    // `paddingVertical: 3 → 1` and `gap: 2 → 1`. Combined with
    // `landscapeMoveChainStyles.pill.borderRadius: 24 → 16` (see
    // `LandscapeWorkweekView`), the pill's optical bottom band
    // shrinks meaningfully without crowding the dot row against
    // the pill's edge.
    flexDirection: "column",
    gap: 1,
    paddingHorizontal: 10,
    paddingVertical: 1,
  },
  // 2026-05-08 follow-up #6 carousel: Row 1 horizontal flex containing
  // the leading "Show all" pill at flex-start and the ecosystem
  // carousel header (chevrons + counter) taking the remaining space.
  //
  // PR-UX-14 (2026-05-09) Issue 3: explicit `alignSelf: "stretch"`
  // matches the symmetric declaration on `ecosystemGroup` below.
  // Without this, the column-flex `wrap` parent's default
  // `alignItems: "stretch"` was supposed to force `headerRow` to
  // match wrap's width, but in landscape (where the wrap's parent
  // pill is content-sized via `maxWidth: "70%"` rather than
  // explicitly width-defined), the Yoga two-pass measure
  // sometimes resolved `headerRow` to its intrinsic content width
  // (= "Show all" pill width + ecosystemCarouselHeader's collapsed
  // flex:1 width = ~80pt) instead of the pill's clamped width.
  // The user reported "the chip bar no longer says Ecosystem N
  // Chain N of M" on PR-UX-13 smoke — the counter text inside
  // `ecosystemCarouselHeader` was rendering at 0pt width because
  // its `flex: 1` parent had no remaining space to allocate. This
  // explicit alignSelf was the lowest-risk way to force the
  // headerRow to ALWAYS match wrap's resolved width regardless of
  // Yoga's intrinsic-vs-resolved sizing pass order.
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "stretch",
  },
  ecosystemGroup: {
    flexDirection: "column",
    gap: 4,
    // Explicit cross-axis stretch in the column-stacked outer layout
    // so each group's inner horizontal ScrollView gets the full
    // screen width to scroll within. Without spelling this out,
    // we'd be relying on RN's default `alignItems: "stretch"` for
    // the parent column flex — which has historically varied across
    // versions, and the layout silently degrades to a 0-width
    // ScrollView on iOS if the implicit default doesn't kick in.
    alignSelf: "stretch",
  },
  ecosystemLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingLeft: 4,
  },
  // 2026-05-08 follow-up #6 carousel: Row 1's center column. Holds the
  // left chevron, the "Ecosystem N of T · M chains" counter, and the
  // right chevron. Centered so the counter sits visually balanced
  // between the chevrons regardless of the Show all pill's width.
  //
  // 2026-05-10 user fix: tightened `gap` 4 → 2 and dropped
  // `paddingHorizontal: 4 → 0` to reclaim ~12pt of horizontal space
  // for the counter label. User report: "I also need that carousel
  // with the chevrons a little wider because the label is unreadable
  // between the chevrons." Combined with the new
  // `carouselChevronPressable` style below (smaller paddings +
  // minWidth), the `Ecosystem N of M · M chains` text fits without
  // truncation on a portrait iPhone after the Show none / Show all
  // pills consume their share of `headerRow`.
  ecosystemCarouselHeader: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 0,
  },
  // 2026-05-10 user fix #2: dropped `letterSpacing: 0.4` to recover
  // a few pixels per character for the counter text. The original
  // `letterSpacing` was an uppercase-label tracking nicety; with
  // the carousel header content-sized between two chevrons and
  // immediately adjacent fixed-width pills ("Show none", "Show
  // all", "Now/Future"), every pixel of label width matters more
  // than the typographic tracking. Combined with the wider pill
  // `minWidth: 480` (`LandscapeWorkweekView`'s
  // `landscapeMoveChainStyles.pill`), the "Ecosystem N of M · K
  // chains" counter now fits without truncation on the landscape
  // smoke-test viewport.
  ecosystemCarouselLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#374151",
    textTransform: "uppercase",
    textAlign: "center",
    flexShrink: 1,
  },
  chipGroupRow: {
    flexDirection: "row",
    gap: 5,
  },
  chip: {
    // 2026-05-08 follow-up #7: dropped `minHeight: TOUCH_TARGET` so
    // the visual chip can shrink below 44pt. PR-UX-10 (2026-05-09)
    // re-bumped PILL_HEIGHT 28 → 32 to host the larger 12pt dots
    // (legibility fix). The touch target stays at 44pt because every
    // interactive Pressable inside the chip (Show all, chain-chip
    // label, dot pressables, side arrows) carries
    // `hitSlop: { top: 8, bottom: 8, ... }` — at PILL_HEIGHT 32pt
    // the hit-rect is 32 + 16 = 48pt vertically, comfortably above
    // the architecture rule's 44pt minimum touch target.
    height: PILL_HEIGHT,
    minWidth: TOUCH_TARGET,
    paddingHorizontal: 10,
    borderRadius: PILL_HEIGHT / 2,
    borderWidth: 1.5,
    borderColor: "#9CA3AF",
    backgroundColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    // Visual height = 32; full hit-rect is 48 via hitSlop.
  },
  showAllChip: {
    borderColor: "#9CA3AF",
    backgroundColor: "transparent",
    // In Row 1 (a horizontal flex), `alignSelf: "flex-start"` keeps
    // the pill at its natural content width instead of stretching to
    // the row's cross-axis. Inherited from the superseded
    // `2026-05-08-chip-row-ecosystem-vertical-stack` deviation —
    // even though the Show all pill now SHARES a row with the
    // carousel header, keeping `alignSelf` here means the pill never
    // grows unintentionally if the header row gets a different
    // alignment in the future.
    alignSelf: "flex-start",
  },
  showAllChipActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipLabel: {
    // Shared by Show all and the chain chips. The chain chip's label
    // overrides this with a smaller `chainChipLabel.fontSize` (12) —
    // see `chainChipLabel` below. Don't reduce this base value past
    // 13 without re-checking Show all's tap target stays comfortable.
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  chipLabelOnFilled: {
    color: "#FFFFFF",
  },
  // PLAN-DEVIATION: 2026-05-05-per-step-coloring — chain chips no
  // longer carry a single chain-color border or fill. They render
  // as a neutral pill containing a small per-step dot-flow that
  // mirrors the chain's calendar visualization. Selected state =
  // dark background + white label.
  chainChip: {
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
  },
  chainChipSelected: {
    borderColor: "#111827",
    backgroundColor: "#111827",
  },
  chainChipLabel: {
    color: "#374151",
    // 2026-05-08 follow-up #6 chip-thinning: chain chip labels drop
    // to 12 px so "Chain N" reads slightly lighter and the chip's
    // horizontal width tightens. Show all's label stays at 13 px
    // (see `chipLabel`) — Show all is a less-frequent control and
    // the larger label keeps it the visually-dominant escape hatch.
    fontSize: 12,
  },
  chainChipLabelSelected: {
    color: "#FFFFFF",
  },
  // PR-UX-2 PASS 2.11 (task `c8`): the chip's label and dots used to
  // share one outer Pressable (chip-press isolated the chain). With
  // tappable dots living INSIDE the chip we need the chip's body to
  // be a plain View — taps on dots dispatch dot logic, taps on the
  // label dispatch chip logic, and the two never overlap.
  chipLabelPressable: {
    paddingVertical: 4,
    paddingRight: 3,
    justifyContent: "center",
  },
  stepFlowRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  stepFlowGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  stepDotPressable: {
    // PR-UX-10 (2026-05-09): pad bumped from 4 → 5 so the 12pt dots
    // (was 8pt) sit centered with the 6pt arrow font. `hitSlop` on
    // the Pressable extends the actual touch area to ≥44pt; padding
    // here only sizes the visual layout box.
    padding: 5,
  },
  stepDot: {
    // PR-UX-10 (2026-05-09): 8pt → 12pt. User report: "the appointment
    // dot chip bar is hard to read when there are not many dots".
    // The previous 8pt dots read as decorative pinpricks on the
    // 28pt chip pill (only 28% of the chip's height); 12pt dots
    // fill the chip more proportionally and are clearly readable
    // at arm's length on landscape iPhones. Border + width 1.5
    // gives the dot a crisp outline against the chip's neutral
    // pill background so per-step colors stay distinguishable
    // even on the dark "selected" chip background.
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.18)",
  },
  stepArrow: {
    // PR-UX-10 (2026-05-09): 13pt → 16pt so the inter-dot arrows
    // visually match the 12pt dots (was 8pt). Bigger arrow keeps
    // the per-step flow legible without reverting the dot size.
    fontSize: 16,
    fontWeight: "800",
    marginHorizontal: 2,
    lineHeight: 16,
  },
  // PR-UX-3 N1 (2026-05-07): side-arrow widget on the actively-
  // isolated chain chip. Visually distinct from the inline per-
  // step arrows (`stepArrow`) — bigger glyph, padded, contrasted
  // against the chip background so the user reads them as
  // navigation controls rather than inline punctuation.
  sideArrowPressable: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  // 2026-05-10 user fix: dedicated style for the Row 1 ecosystem
  // carousel chevrons (separate from the in-chip side arrows above).
  // Visual footprint shrunk so the Row 1 counter label has more
  // horizontal room — paddingHorizontal 4 → 2, minWidth 22 → 18.
  // Tap target stays ≥44pt because the carousel chevrons keep their
  // `hitSlop={{ top: 12, bottom: 12, left: 12, right: 8 }}` (prev)
  // and mirrored slop (next) — the visible chevron shrinks but the
  // hit-rect doesn't, so the architecture rule (44pt minimum touch
  // target) is preserved. The in-chip arrows keep
  // `sideArrowPressable` because they sit on the dark filled
  // `chainChipSelected` background and need the larger visual
  // footprint for legibility.
  carouselChevronPressable: {
    paddingHorizontal: 2,
    paddingVertical: 2,
    minWidth: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  // The `sideArrowGlyph` color is white because the in-chip side
  // arrows live inside the actively-isolated (dark-background) chip.
  // The carousel chevrons (Row 1) live on the page background and
  // need the dark `sideArrowGlyphCarousel` color — keep these two
  // styles separate so a future contrast tweak to one doesn't ruin
  // the other.
  sideArrowGlyph: {
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 18,
    color: "#FFFFFF",
  },
  sideArrowGlyphCarousel: {
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 18,
    color: "#374151",
  },
  sideArrowDisabled: {
    opacity: 0.35,
  },
  // PR-UI-REDESIGN-2 (2026-05-12): inline-right `bottomSlot` host.
  // Sits on Row 1's trailing edge, separated from the Show all
  // pill by `filterRowSpacer` (a flex:1 spacer). `flexShrink: 0`
  // keeps the Now/Future pill at its content width — Row 1's
  // children are sized small enough that nothing should push the
  // toggle off-screen, but the explicit shrink:0 guards against
  // dynamic-content surprises (e.g., a future ecosystem-counter
  // expansion).
  filterRowInlineSlot: {
    flexShrink: 0,
    alignSelf: "center",
  },
  filterRowSpacer: {
    flex: 1,
  },
  // PR-UI-REDESIGN-2 (2026-05-12): dedicated row 2 hosting the
  // ecosystem carousel header (counter + chevrons) on its own
  // line, separate from the filter chips on Row 1. Mirrors
  // `headerRow`'s `alignSelf: "stretch"` so the row matches
  // `wrap`'s resolved width (same Yoga two-pass caveat that drove
  // the explicit alignSelf on `headerRow` — see PR-UX-14 Issue 3).
  ecosystemCarouselRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "stretch",
  },
  // 2026-05-10 user fix (landscape follow-up): when
  // `chipClusterRightSlot` is provided, the chip cluster's
  // ScrollView and the slot share a horizontal flex row inside
  // `ecosystemGroup`. Without this wrapper the column flex would
  // stack the slot below the cluster (the portrait `bottomSlot`
  // shape) instead of inline beside it.
  chipClusterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  // ScrollView style override applied only when the right slot is
  // present. `flex: 1` lets the cluster scroll within the remaining
  // width of `chipClusterRow`; the slot then takes content size on
  // the right. When the slot is absent the ScrollView keeps its
  // default unbounded sizing (matches the pre-2026-05-10 layout).
  chipClusterScroll: {
    flex: 1,
  },
  // 2026-05-10 follow-up (white-space fix): pins the chip-cluster
  // ScrollView frame to PILL_HEIGHT so the band can't grow taller
  // than the chips it contains. iOS ScrollView in horizontal mode
  // defaults to content-height + scroll-indicator-inset, which on
  // landscape was adding ~10–14pt of unused white below the chips
  // (visible inside the pill's rounded bottom corners). Applied
  // unconditionally — portrait callers don't carry a right slot
  // but still benefited from the height clamp in smoke testing.
  chipGroupScrollSelf: {
    height: PILL_HEIGHT,
    flexGrow: 0,
    flexShrink: 0,
  },
  // Right-anchored slot for the inline `<NowFutureLandscapeToggle />`
  // in landscape. `flexShrink: 0` prevents the slot from collapsing
  // when the chip cluster has many chains — the cluster scrolls
  // horizontally within `chipClusterScroll`, the slot stays fully
  // visible.
  chipClusterRightSlot: {
    flexShrink: 0,
    alignSelf: "center",
  },
  // 2026-05-10 follow-up: Row 1 right-anchored slot. Sibling of
  // `ecosystemCarouselHeader` inside the existing `headerRow` flex.
  // `flexShrink: 0` keeps the slot at its content width regardless
  // of how busy the carousel-header counter text gets. `marginLeft:
  // 4` mirrors `headerRow.gap: 6` for tighter visual coupling
  // between the carousel chevron and the toggle pill (the gap is
  // already applied between every flex child, so this is additive
  // breathing room beyond it — adjust if Row 1 gets crowded).
  headerRowRightSlot: {
    flexShrink: 0,
    alignSelf: "center",
  },
});
