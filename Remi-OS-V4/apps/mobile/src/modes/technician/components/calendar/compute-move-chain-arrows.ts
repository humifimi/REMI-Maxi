/**
 * Move-chain arrow geometry — PR-UX-2 PASS 2.2 (2026-05-05).
 *
 * Pure geometry helpers that translate a `MoveChainGraph` + intents +
 * appointments + the calendar's vendored layout params into the set
 * of arrow segments the SVG overlay needs to render. Lives in its
 * own file (no React, no Reanimated) so it stays testable without a
 * real-device renderer.
 *
 * Coordinate system matches the vendored
 * `react-native-resource-calendar` library's body content area:
 *   - x = 0 is the left edge of the calendar's `<Calendar>` content
 *     view (i.e., where the time-label gutter starts)
 *   - y = 0 is the top of the body grid (NOT the top of the resource
 *     header strip — the overlay component is responsible for adding
 *     header offset before painting)
 *
 * For workweek (multi-day, single-tech) view: each visible column is
 * a date in `daysWindow`. For day (single-day, multi-tech) view: each
 * visible column is a tech in `resources`. The geometry helper
 * supports both via the `viewType` discriminant.
 *
 * Off-screen handling: when a tile's date or tech doesn't appear in
 * the visible columns we still emit the segment with the resolved
 * `from`/`to` set to `null` for the off-screen endpoint. The overlay
 * uses that to render an edge-stub indicator instead of leaking a
 * line into nowhere.
 *
 * See `move-chain-overlay-style.ts` for how the colors used here
 * line up with the chain-color palette.
 */

import type { ReorganizationIntent } from "@technician/types/reorganization";
import type { LinterAppointment } from "@technician/utils/logistics-linter";
import type {
  MoveChainGraph,
  MoveChainDestSlot,
} from "@technician/utils/detect-move-chains";
import { getVisibleMoveChainDestSlots } from "@technician/utils/detect-move-chains";
import { ALL_CHAINS_SENTINEL } from "@technician/components/calendar/MoveChainChipRow";
import { moveChainGhostEventIdFor } from "@technician/components/calendar/move-chain-ghost-tiles";
import type { EventBoundsEntry } from "@technician/hooks/calendar/use-event-bounds-registry";
import { traceCalendar } from "@technician/utils/sentry-diagnostics";

/**
 * FORK Phase 26 consumer hook — bounds-lookup function shape.
 *
 * Returns the most recent column-local rect reported by the
 * vendored library's `onEventLayout` for the given event id, or
 * `null` if none. Wired in by the three calendar hosts
 * (`ResourceCalendarDayView`, `ResourceCalendarWorkweekView`,
 * `LandscapeWorkweekView`) via `useEventBoundsRegistry().get`.
 *
 * `eventId` here refers to a vendored-library `Event.id`. For
 * source rects that's the appointment id; for destination rects
 * (move-chain ghost tiles) that's
 * `moveChainGhostEventIdFor(intentId)`. The two namespaces are
 * disjoint by construction (ghost ids are negative — see
 * `GHOST_ID_OFFSET`).
 */
export type EventBoundsLookup = (
  eventId: number,
) => EventBoundsEntry | null;

// ---------------------------------------------------------------
// Public types
// ---------------------------------------------------------------

/** Visible-window descriptor for the calendar body. */
export type MoveChainCalendarLayout =
  | {
      viewType: "workweek";
      hourHeight: number;
      minuteOffset: number;
      appointmentBlockWidth: number;
      timeLabelWidth: number;
      /** Dates rendered as columns left-to-right in the visible window. */
      daysWindow: readonly string[];
      /**
       * The single tech rendered across every column. Mutually
       * exclusive with `resourceIds` — exactly one of the two MUST be
       * set. The original portrait-week mode uses `resourceId` for
       * "this tech across N days." The landscape multi-tech mode (see
       * `resourceIds`) introduced 2026-05-10 to fix Bug 2 of that
       * date's smoke pass uses `resourceIds` for "any of these techs
       * across N days, all sharing day-column geometry."
       */
      resourceId?: number;
      /**
       * 2026-05-10 — landscape multi-tech workweek mode.
       *
       * When provided (instead of `resourceId`), tile resolution
       * succeeds for any tile whose `technician_id` is in the array.
       * X coordinates use the day-column center regardless of which
       * tech the tile belongs to — matches landscape's stacked /
       * mini-cols rendering where multiple techs share a single
       * day-column. This lets a cross-tech chain link (e.g., source
       * on tech A, destination on tech B, both selected) produce a
       * REAL arrow segment (with both endpoints resolved) instead of
       * the silent-drop the per-tech compute loop produced before.
       *
       * The previous landscape implementation looped the helper per
       * selected tech with `resourceId: techId` and concatenated
       * segments, which dropped cross-tech links on the floor (each
       * pass saw only one of the two endpoints). User-reported
       * symptom: *"there are no SVG arrows most of the time in
       * landscape."* See README-FORK Phase 24-x follow-up + the
       * 2026-05-10 dev-log entry for the full diagnosis.
       *
       * Portrait DAY view does NOT use this — it uses the `day`
       * viewType with `resources`. Portrait WEEK view stays on the
       * single-`resourceId` shape because it's a single-tech surface.
       */
      resourceIds?: readonly number[];
      /**
       * 2026-05-10 follow-up — mini-cols sub-lane geometry.
       *
       * When provided alongside `resourceIds`, the X coordinate of a
       * resolved tile uses the destination tech's sub-lane center
       * INSTEAD of the day-column center. Solves the *"all landscape
       * arrows collapse to one vertical line"* symptom of the
       * `resourceIds`-only fix above: with multiple techs selected
       * in landscape `mini-columns` mode, every tile in a day shared
       * the same `colStart + colWidth/2` X regardless of which mini-
       * lane painted it, so every arrow endpoint landed on the same
       * column-center pixel and the user saw a vertical stack of
       * arrows that all looked identical.
       *
       * Map shape: `techId → { laneIndex, laneWidth }`. The geometry
       * helper computes the lane center as
       * `colStart + (laneIndex + 0.5) * laneWidth`. When omitted (or
       * a tile's tech isn't in the map), the X falls back to
       * day-column center — matches landscape `stacked` mode where
       * every tech really does share a column.
       *
       * The vendored library renders mini-cols using
       * `techsToRender.map((trid, i) => left: i * laneWidth)` where
       * `techsToRender == bodyResourceIds == selectedResourceIds`.
       * The consumer (`LandscapeWorkweekView`) builds the map from
       * `selectedTechIds.map((id, idx) => [id, { laneIndex: idx,
       * laneWidth: colWidth / selectedTechIds.length }])` so this
       * helper's output stays in lockstep with the actual rendered
       * mini-col positions.
       *
       * Only emitted in `mini-columns` mode. `stacked` mode passes
       * `undefined` here and the legacy day-column-center geometry
       * applies to every tile — matches the visual collapse of
       * stacked rendering.
       */
      lanesByTechId?: ReadonlyMap<
        number,
        { laneIndex: number; laneWidth: number }
      >;
      /**
       * 2026-05-10 — portrait-week cross-tech grey stub flag.
       *
       * When `true`, chain links whose source OR destination tile lives
       * on a tech other than `resourceId` produce a synthetic
       * "off-tech" stub instead of being silently dropped. The stub
       * carries `crossTechOffview: true` on the segment so the overlay
       * paints it in the muted continuation grey
       * (`TERMINAL_GREY_CONTINUATION_COLOR`).
       *
       * Portrait WEEK view sets this to `true` because the user is
       * looking at one tech across 4 days and a cross-tech chain link
       * is actively useful as "this chain continues on another tech."
       *
       * Portrait DAY view does NOT use the workweek layout (it uses
       * the `day` viewType with `resources`), so it's unaffected.
       *
       * LANDSCAPE workweek leaves this `false` (the default). With
       * `resourceIds` (multi-tech mode), cross-tech links resolve to
       * REAL endpoints because every selected tech maps to a day-
       * column rect — there's no off-tech case to stub. With
       * `resourceId` (single-tech mode) the flag falls back to the
       * portrait-week behavior. Setting `emitCrossTechStubs: true`
       * with `resourceIds` is a no-op (no off-tech case can fire).
       */
      emitCrossTechStubs?: boolean;
      /**
       * FORK Phase 26 (2026-05-10) — optional bounds lookup. When
       * provided, `tileRect` consults this lookup BEFORE falling
       * back to the column-cell math derived from
       * `appointmentBlockWidth` / `hourHeight`. A hit returns the
       * actual rendered card rect (column-local x combined with
       * the consumer-side column offset; y/width/height verbatim
       * from the EventBlock's `onLayout`). A miss falls through to
       * legacy geometry. See `useEventBoundsRegistry` for the
       * lookup's lifecycle.
       *
       * Why optional: the bounds registry is unwired in tests and
       * in any future surface that paints arrows without mounting
       * a `<Calendar>` (e.g. a planning preview rendered to a
       * static image). Legacy fallback keeps those paths working
       * — unless `requireRegistryRect` is also set, which gates
       * segment emission on the registry path.
       */
      eventBoundsLookup?: EventBoundsLookup;
      /**
       * 2026-05-12 — `fix/move-chain-arrow-registry-precision`.
       * When `true`, the geometry helper skips any segment whose
       * source OR destination rect would have come from the legacy
       * grid-cell fallback (`source === "grid"`). Off-screen
       * endpoints (`source === "none"`) are still allowed —
       * stub-arrow rendering doesn't need a precise rect.
       *
       * Production calendar hosts (the three `<Calendar>`-mounting
       * components: `LandscapeWorkweekView`,
       * `ResourceCalendarDayView`, `ResourceCalendarWorkweekView`)
       * set this to `true` so the user only sees pixel-accurate
       * arrows. The registry's settling-tick signal (see
       * `useEventBoundsRegistry.tick`) re-runs the geometry
       * `useMemo` exactly when the registry has stabilized, so
       * skipped-then-emitted is a single transition per layout
       * pass.
       *
       * Tests of the legacy grid-cell geometry math leave this
       * unset (or `false`). The flag does NOT affect rect math;
       * it only controls the gate. See
       * docs/PLAN-DEVIATIONS.md#2026-05-12-arrow-registry-only-precision
       * for the design context.
       */
      requireRegistryRect?: boolean;
    }
  | {
      viewType: "day";
      hourHeight: number;
      minuteOffset: number;
      appointmentBlockWidth: number;
      timeLabelWidth: number;
      /** The single date all columns share. */
      selectedDate: string;
      /** Techs rendered as columns left-to-right in the visible window. */
      resources: readonly { id: number }[];
      /**
       * FORK Phase 26 (2026-05-10) — see the workweek branch's
       * doc-block. Same contract; optional bounds lookup that
       * upgrades `tileRect` to post-style precision when present.
       */
      eventBoundsLookup?: EventBoundsLookup;
      /**
       * 2026-05-12 — see the workweek branch's doc-block. Same
       * contract; production day-view consumers set this to
       * `true` to gate segment emission on registry-sourced rects.
       */
      requireRegistryRect?: boolean;
    };

/** A 2D point in body-coordinate space (see file-header doc). */
export interface ArrowPoint {
  x: number;
  y: number;
}

/**
 * One source→destination arrow for one intent. Multi-step chains
 * produce N segments (one per intent in the chain) — they daisy-chain
 * naturally because intent_{i}'s destination geometrically overlaps
 * intent_{i+1}'s source (which is what made them chain in the first
 * place). The overlay renders them independently; consumers don't
 * need to walk the chain themselves.
 *
 * `from`/`to` are null when the corresponding tile falls outside the
 * visible columns. The overlay uses null endpoints to draw an edge
 * stub at the appropriate calendar boundary instead of skipping the
 * arrow entirely (so the user knows "this chain extends off-screen
 * to the left/right").
 */
export interface MoveChainArrowSegment {
  intentId: number;
  chainId: string;
  color: string;
  from: ArrowPoint | null;
  to: ArrowPoint | null;
  /** Direction the off-screen stub points if `from` is null. */
  fromOffscreen: "left" | "right" | "above" | "below" | null;
  /** Direction the off-screen stub points if `to` is null. */
  toOffscreen: "left" | "right" | "above" | "below" | null;
  /**
   * PR-UX-3 (2026-05-07): grey terminal continuation marker.
   *
   * When `true`, this segment is a synthetic stub off the right edge
   * of the calendar that signals "the chain continues past the
   * currently-active link, but the next link is dimmed." The
   * overlay reads this flag, overrides the stroke and arrowhead
   * fill to `#9CA3AF` (matches the inactive chip border), and
   * leaves interactivity off (arrows aren't tappable anyway, but
   * this codifies the design contract).
   *
   * The compute layer emits at most one such segment per active
   * chain, anchored at the last highlighted step's destination
   * point. Single-tech chains under PR-UX-2's prefix-mode cycle
   * never trigger this — a prefix that ends mid-chain only fires
   * the marker when there are unhighlighted steps remaining
   * AFTER the highest highlighted step, which is exactly the
   * "active link is the last highlighted with more dots beyond"
   * condition from the PR-UX-3 handoff doc §1.A4.
   *
   * See `docs/implementation-plans/pr-ux-3-multi-tech-handoff.md`
   * §1.A4 and §10.A4 of `multi-tech-move-chain-plan.md` for the
   * full design spec.
   */
  terminalGreyContinuation?: boolean;
  /**
   * 2026-05-10 — portrait-week cross-tech off-view stub.
   *
   * When `true`, this segment is a synthetic edge stub generated
   * for a chain link whose source OR destination tile lives on a
   * tech that's NOT currently being shown in the portrait-week
   * single-tech view. The overlay paints it in the same muted grey
   * as `terminalGreyContinuation` so the user sees "this chain
   * continues on another tech, off-screen" rather than just a
   * silent gap.
   *
   * Only emitted when `MoveChainCalendarLayout.emitCrossTechStubs`
   * is set on a workweek layout — landscape's per-tech compute
   * loop intentionally leaves it off to avoid one-stub-per-tech
   * spam (see `MoveChainCalendarLayout.workweek.emitCrossTechStubs`
   * doc-block). DAY view has multiple tech columns visible at
   * once, so cross-tech links resolve to real source/dest rects
   * and never need a stub.
   */
  crossTechOffview?: boolean;
}

/**
 * Stable marker color for the grey terminal continuation arrow
 * (PR-UX-3 §1.A4). Matches the inactive chip border color used in
 * the PR-UX-2 chip palette so the stub reads as "muted system
 * affordance, not a chain-color signal."
 */
export const TERMINAL_GREY_CONTINUATION_COLOR = "#9CA3AF";

/**
 * Synthetic-intent-id offset for the grey-continuation segments. Far
 * from any real `ReorganizationIntent.id` so React-key collisions
 * are impossible. Each chain emits at most one such segment, keyed
 * `TERMINAL_GREY_CONTINUATION_INTENT_ID_BASE - seedIntentId` so two
 * concurrent chains' continuation stubs never collide.
 */
const TERMINAL_GREY_CONTINUATION_INTENT_ID_BASE = -1_000_000_000;

// ---------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------

function parseHmToMinutes(value: string): number {
  const parts = value.split(":");
  if (parts.length < 2) return 0;
  const h = Number.parseInt(parts[0] ?? "0", 10);
  const m = Number.parseInt(parts[1] ?? "0", 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Resolve the body-coordinate rect of a tile given its date, tech,
 * and minute window. Returns `null` (with a side-channel direction)
 * when the date/tech doesn't appear in the visible columns.
 *
 * The `crossTech` side-channel marks whether the null result is
 * specifically because the tile's tech doesn't match the workweek
 * layout's pinned tech (vs. a date mismatch). The caller uses it to
 * tag the resulting segment with `crossTechOffview: true` so the
 * overlay paints it grey. Only meaningful in workweek view; always
 * `false` for day view (which has multiple tech columns visible at
 * once and resolves cross-tech links to real rects).
 */
/**
 * FORK Phase 26 (2026-05-10) — registry lookup helper. Returns the
 * post-style rect for `eventId` if the consumer wired in an
 * `eventBoundsLookup` AND the registry has an entry for that id;
 * otherwise returns `null` so the caller falls through to the
 * legacy column-cell math.
 *
 * `eventId` here can be either an appointment id (for the source
 * endpoint of an arrow segment) or the negative ghost id from
 * `moveChainGhostEventIdFor` (for the destination endpoint). The
 * two namespaces are disjoint so this lookup is unambiguous.
 */
function lookupRegistryBounds(
  layout: MoveChainCalendarLayout,
  eventId: number | null | undefined,
): EventBoundsEntry | null {
  if (eventId == null || !Number.isFinite(eventId)) return null;
  const lookup = layout.eventBoundsLookup;
  if (!lookup) return null;
  return lookup(eventId);
}

function tileRect(
  layout: MoveChainCalendarLayout,
  date: string,
  technicianId: number,
  fromMin: number,
  toMin: number,
  /**
   * FORK Phase 26 (2026-05-10) — optional vendored-Event id. When
   * provided AND the layout carries an `eventBoundsLookup`, the
   * returned rect uses the EventBlock's actual post-style bounds
   * for x.column-local / y / width / height. When omitted or
   * unresolved, falls back to the column-cell math derived from
   * `appointmentBlockWidth` / `hourHeight`.
   *
   * For move-chain arrows, callers pass:
   *   - Source endpoint: the appointment id
   *     (`sourceAppt.id`).
   *   - Destination endpoint: the ghost id
   *     (`moveChainGhostEventIdFor(slot.intent_id)`).
   */
  eventId?: number | null,
): {
  rect: TileRect | null;
  offscreen: "left" | "right" | null;
  crossTech: boolean;
  /**
   * 2026-05-11 diagnostic — `"registry"` when the rect came from
   * the FORK Phase 26 bounds lookup, `"grid"` when it fell back
   * to the column-cell math, and `"none"` when the tile resolved
   * off-screen (rect is null). Surfaced in the segment-level log
   * so a backwards-arrow report can be triaged by checking
   * which side hit the registry vs. fell back.
   */
  source: "registry" | "grid" | "none";
} {
  let colIdx: number;
  let totalCols: number;

  if (layout.viewType === "workweek") {
    // Workweek pins one or more techs across the row of date
    // columns. Tile belongs to a column iff its date matches AND
    // its tech matches the layout's `resourceId` (single-tech mode)
    // OR appears in `resourceIds` (multi-tech mode introduced
    // 2026-05-10 for landscape).
    //
    // Multi-tech mode (`resourceIds`) collapses every selected
    // tech onto the same day-column geometry, so a cross-tech
    // reassign whose source AND destination are on selected techs
    // resolves both endpoints to real rects (the X is the day-col-
    // center for both; only Y differs by appointment time). Mirrors
    // landscape's stacked / mini-cols rendering where multiple
    // techs share a day-column.
    const techMatches =
      layout.resourceIds !== undefined
        ? layout.resourceIds.includes(technicianId)
        : technicianId === layout.resourceId;
    if (!techMatches) {
      // 2026-05-10 — portrait-week cross-tech grey stub flag. When
      // the consumer opted in via `emitCrossTechStubs`, return an
      // off-screen direction (anchored at the right edge for now —
      // we don't know which tech the missing one is on relative to
      // the on-screen tech without the full roster) AND set
      // `crossTech: true` so the segment-builder tags this for the
      // overlay's grey-color override. When the flag is off (default,
      // matches landscape's pre-2026-05-10 per-tech compute loop),
      // return the legacy silent-skip shape. Only meaningful in
      // single-tech mode — multi-tech mode resolves cross-tech links
      // to real rects above, so this branch can only fire for tiles
      // on UNSELECTED techs (useful as a future "this chain extends
      // off the selected set" hint, but not opted into today).
      if (layout.emitCrossTechStubs) {
        return {
          rect: null,
          offscreen: "right",
          crossTech: true,
          source: "none",
        };
      }
      return {
        rect: null,
        offscreen: null,
        crossTech: false,
        source: "none",
      };
    }
    colIdx = layout.daysWindow.indexOf(date);
    totalCols = layout.daysWindow.length;
  } else {
    // Day view: tile belongs to a column iff its date matches the
    // selected date AND its tech is one of the visible resources.
    if (date !== layout.selectedDate) {
      return {
        rect: null,
        offscreen: null,
        crossTech: false,
        source: "none",
      };
    }
    colIdx = layout.resources.findIndex((r) => r.id === technicianId);
    totalCols = layout.resources.length;
  }

  if (colIdx < 0) {
    // We can't tell whether the missing date/tech is to the left or
    // right of the visible window without more context (e.g., a date
    // ordering or tech ordering across the whole roster). For the
    // first cut we punt and render a generic "off-screen" stub. A
    // later iteration can make this directional.
    return {
      rect: null,
      offscreen: "right",
      crossTech: false,
      source: "none",
    };
  }
  if (colIdx >= totalCols) {
    return {
      rect: null,
      offscreen: "right",
      crossTech: false,
      source: "none",
    };
  }

  const colStart = layout.timeLabelWidth + colIdx * layout.appointmentBlockWidth;
  const y = ((fromMin - layout.minuteOffset) * layout.hourHeight) / 60;
  const h = ((toMin - fromMin) * layout.hourHeight) / 60;
  // FORK Phase 26 (2026-05-10) — registry-first geometry. When the
  // consumer wired in `eventBoundsLookup` AND the registry has a
  // recorded rect for `eventId`, use the EventBlock's actual
  // rendered position instead of the column-cell math below.
  //
  // Coordinate-space note: the vendored EventBlock's `onLayout`
  // reports `x` relative to its parent View. In stacked mode that
  // parent IS the day-column, so `bounds.x` is intra-day-column
  // and we just add `colStart`. In mini-cols mode the EventBlock
  // sits inside a per-lane wrapper (`left: i * laneWidth`), so
  // `bounds.x` is intra-LANE — we add `colStart + lane offset`.
  // The y/width/height come from bounds verbatim. See
  // `useEventBoundsRegistry` + README-FORK Phase 26 for the
  // contract.
  const registryHit = lookupRegistryBounds(layout, eventId);
  // 2026-05-10 follow-up — mini-cols sub-lane geometry. When the layout
  // descriptor carries a per-tech lane map (only emitted in landscape
  // `mini-columns` mode), narrow the rect from the full day-column
  // (`colStart + colWidth`) to the destination tech's sub-lane
  // (`colStart + laneIndex * laneWidth`, width = `laneWidth`). The
  // arrow endpoint computation in the overlay is `x + w/2`, so the
  // arrow's tail/head naturally land on the sub-lane center where the
  // tile actually paints. Without this branch every tile in the same
  // day-column resolves to the same X (= `colStart + colWidth/2`) and
  // the user sees the bug-1 symptom: *"all landscape arrows showed up
  // in one vertical line down the middle of the appointments."*
  if (layout.viewType === "workweek" && layout.lanesByTechId) {
    const lane = layout.lanesByTechId.get(technicianId);
    if (lane) {
      if (registryHit) {
        // Mini-cols: bounds.x is intra-lane. Combine with column
        // offset AND lane offset for the absolute body-X. Width /
        // height / Y come straight from the rendered rect.
        return {
          rect: {
            x: colStart + lane.laneIndex * lane.laneWidth + registryHit.x,
            y: registryHit.y,
            w: registryHit.width,
            h: registryHit.height,
          },
          offscreen: null,
          crossTech: false,
          source: "registry",
        };
      }
      return {
        rect: {
          x: colStart + lane.laneIndex * lane.laneWidth,
          y,
          w: lane.laneWidth,
          h,
        },
        offscreen: null,
        crossTech: false,
        source: "grid",
      };
    }
  }
  if (registryHit) {
    // Stacked / single-tech workweek / day view: bounds.x is
    // intra-day-column (no per-lane wrapper exists in these modes,
    // so the EventBlock's parent IS the column View). Combine
    // with `colStart`; use bounds verbatim for y/width/height.
    return {
      rect: {
        x: colStart + registryHit.x,
        y: registryHit.y,
        w: registryHit.width,
        h: registryHit.height,
      },
      offscreen: null,
      crossTech: false,
      source: "registry",
    };
  }
  return {
    rect: { x: colStart, y, w: layout.appointmentBlockWidth, h },
    offscreen: null,
    crossTech: false,
    source: "grid",
  };
}

/** Center-of-rect in body coordinates. */
function rectCenter(r: TileRect): ArrowPoint {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/**
 * Returns true when `point` lies inside (or on the boundary of) `rect`.
 * Used by `resolveAnchors` to detect the rect-overlap fallback case.
 */
function pointInRect(point: ArrowPoint, rect: TileRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h
  );
}

/**
 * Smallest positive parameter `t > 0` along the ray from `inside`
 * toward `dir` at which the ray exits `rect`. `inside` is assumed
 * to lie inside (or on the boundary of) `rect`. Returns `Infinity`
 * if the ray is degenerate (zero direction).
 *
 * Standard slab clipping, restricted to forward (positive) intersections.
 */
function rectExitParam(
  rect: TileRect,
  inside: ArrowPoint,
  dir: { dx: number; dy: number },
): number {
  let tx = Infinity;
  if (dir.dx > 0) tx = (rect.x + rect.w - inside.x) / dir.dx;
  else if (dir.dx < 0) tx = (rect.x - inside.x) / dir.dx;
  let ty = Infinity;
  if (dir.dy > 0) ty = (rect.y + rect.h - inside.y) / dir.dy;
  else if (dir.dy < 0) ty = (rect.y - inside.y) / dir.dy;
  const t = Math.min(tx, ty);
  return Number.isFinite(t) && t > 0 ? t : Infinity;
}

/**
 * 2026-05-10 user-reported smoke fix — the arrow was visibly buried
 * inside each card in LANDSCAPE mini-cols (lane width ~30px) because
 * the endpoints anchored at each rect's CENTER. User feedback verbatim:
 * *"is there any way we can make them a little tighter? They don't
 * really start and end on the cards themselves like in portrait mode."*
 *
 * Resolve the (`from`, `to`) anchors for an arrow segment given the
 * source and destination tile rects. Both rects MUST be non-null;
 * caller handles the off-screen / null-rect cases with the legacy
 * center-anchor + stub path (see `resolveAnchors` orchestrator below).
 *
 * Algorithm: parametrize the chord from source-center → dest-center
 * as `P(t) = src + t·(dst - src)`. The new `from` is the point on
 * the source rect's boundary at the smallest `t > 0` where the chord
 * exits source-rect (i.e., the source-rect-side edge facing dest).
 * The new `to` is the symmetric point on the dest rect's boundary
 * (largest `t < 1` where the chord exits dest-rect along the
 * source-bound direction).
 *
 * Fallback cases (drop back to center-to-center):
 *   - One center sits INSIDE the other rect — the rects overlap
 *     enough that the chord doesn't have a clean "between" segment.
 *   - The edge-clipped chord ends up shorter than
 *     `MIN_VISIBLE_CHORD`. Most commonly this is two LANE-ADJACENT
 *     rects whose shared boundary is exactly the edge the chord
 *     crosses — the natural clip is a zero-length arrow that the
 *     overlay would silently drop. Fall back to centers so the
 *     arrow stays visible (same as pre-fix behavior for that case).
 *
 * The `MIN_VISIBLE_CHORD` floor is intentionally small (4px) — it
 * ONLY catches the literal degenerate case. For the regular two-
 * card move (chord 30-100px), the edge-clip kicks in fully and the
 * arrow visibly starts/ends on each card's edge.
 */
const MIN_VISIBLE_CHORD = 4;

function clipChordToRectEdges(
  sourceRect: TileRect,
  destRect: TileRect,
): { from: ArrowPoint; to: ArrowPoint } {
  const sCenter = rectCenter(sourceRect);
  const dCenter = rectCenter(destRect);

  // Rect-overlap fallback: if either center sits inside the other
  // rect, the edge-clip math has no clean answer (the chord enters
  // and exits the same rect on both sides, possibly twice).
  if (pointInRect(sCenter, destRect) || pointInRect(dCenter, sourceRect)) {
    return { from: sCenter, to: dCenter };
  }

  const dx = dCenter.x - sCenter.x;
  const dy = dCenter.y - sCenter.y;
  const fullLen = Math.hypot(dx, dy);
  if (fullLen < 1e-9) {
    return { from: sCenter, to: dCenter };
  }

  // Forward direction (source → dest) and backward (dest → source).
  const tSourceExit = rectExitParam(sourceRect, sCenter, { dx, dy });
  const tDestExitBackward = rectExitParam(destRect, dCenter, {
    dx: -dx,
    dy: -dy,
  });

  if (!Number.isFinite(tSourceExit) || !Number.isFinite(tDestExitBackward)) {
    return { from: sCenter, to: dCenter };
  }

  const t1 = Math.min(1, Math.max(0, tSourceExit));
  // `tDestExitBackward` is in dest's parameter space. Translate
  // back to source-bound parameter `t` (where 0 = source center,
  // 1 = dest center): t2 = 1 - tDestExitBackward.
  const t2 = Math.max(0, Math.min(1, 1 - tDestExitBackward));

  if (t2 <= t1) {
    return { from: sCenter, to: dCenter };
  }

  const clippedLen = (t2 - t1) * fullLen;
  if (clippedLen < MIN_VISIBLE_CHORD) {
    return { from: sCenter, to: dCenter };
  }

  return {
    from: { x: sCenter.x + dx * t1, y: sCenter.y + dy * t1 },
    to: { x: sCenter.x + dx * t2, y: sCenter.y + dy * t2 },
  };
}

/**
 * Resolve from/to anchors for a segment given each side's tile rect
 * (or `null` for off-screen tiles). When both rects are visible,
 * delegates to `clipChordToRectEdges` for the new edge-anchoring
 * behavior. When only one rect resolves, the visible side stays at
 * its rect CENTER — the off-screen side is rendered by the separate
 * stub-arrow path in the overlay (`resolveStubArrow`) and isn't a
 * true point-to-point chord, so center-anchoring on the visible
 * side keeps the stub arrow's incoming direction stable regardless
 * of where the off-screen tile would be.
 */
function resolveAnchors(
  sourceRect: TileRect | null,
  destRect: TileRect | null,
): { from: ArrowPoint | null; to: ArrowPoint | null } {
  if (sourceRect && destRect) {
    return clipChordToRectEdges(sourceRect, destRect);
  }
  return {
    from: sourceRect ? rectCenter(sourceRect) : null,
    to: destRect ? rectCenter(destRect) : null,
  };
}

// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------

/**
 * Compute every arrow segment that should render given the current
 * chain selection. Returns `[]` when:
 *   - `selectedChainId` is null (Show all baseline — no arrows)
 *   - the graph has no chains
 *
 * In `"all"` mode, every chain's arrows are returned together, each
 * tagged with its own color so the overlay can render them in one
 * shared SVG layer without re-grouping.
 *
 * 2026-05-12 — `fix/move-chain-arrow-registry-precision`. Segments
 * are now GATED on both endpoints having a registry-sourced rect
 * (i.e., `sourceRect.source === "registry"` AND
 * `destRect.source === "registry"`). When either endpoint is still
 * `"grid"` (the registry hasn't yet observed an `onLayout` for
 * that event), the segment is silently skipped. The consumer-side
 * `useEventBoundsRegistry.tick` settling signal triggers a
 * downstream re-compute once the registry stabilizes, so the
 * skipped-then-emitted transition reliably happens on the next
 * settle.
 *
 * Off-screen endpoints (`source === "none"`) remain ALLOWED —
 * those produce edge-stub arrows via `resolveStubArrow` in the
 * overlay, which doesn't need a precise rect, just a direction.
 *
 * Rationale: grid math is consistently 4-12px off from the
 * post-style EventBlock rect (dynamicStyle insets +1/+2/-3/-4,
 * lane-squeeze width division, eventStyleOverrides border /
 * padding). Mixing a grid-sourced and a registry-sourced endpoint
 * within the same arrow produced visibly drifting / wrong-angle /
 * wrong-length arrows on reload — the bug this gate exists to
 * eliminate. By rejecting the mixed-source case at the geometry
 * layer, the only arrows ever painted are pixel-accurate to the
 * rendered cards. See docs/PLAN-DEVIATIONS.md#2026-05-12-arrow-
 * registry-only-precision for the full design context.
 */
export function computeMoveChainArrows(
  graph: MoveChainGraph,
  intents: readonly ReorganizationIntent[],
  appointments: readonly LinterAppointment[],
  selectedChainId: string | null,
  layout: MoveChainCalendarLayout,
  /**
   * PR-UX-2 PASS 2.11 (task `c8`): spotlight set for the actively
   * isolated chain. Forwarded to `getVisibleMoveChainDestSlots` so
   * arrow segments only render for steps the user has tapped lit
   * via the chip-row dot cycle. See that helper's same-named arg
   * for the full contract — `null`/`undefined` keeps the pre-c8
   * behavior of "every chain destination renders an arrow."
   */
  chainStepHighlights?: readonly number[] | null,
): MoveChainArrowSegment[] {
  if (__DEV__) {
    const layoutSummary =
      layout.viewType === "workweek"
        ? {
            viewType: layout.viewType,
            resourceId: layout.resourceId ?? null,
            resourceIds: layout.resourceIds ?? null,
            daysWindow: layout.daysWindow,
            timeLabelWidth: layout.timeLabelWidth,
            appointmentBlockWidth: layout.appointmentBlockWidth,
            hourHeight: layout.hourHeight,
            minuteOffset: layout.minuteOffset,
            // 2026-05-10 follow-up: surface mini-cols lane geometry so the
            // smoke logs can confirm the lane map is wired through (not
            // just whether arrows exist). Logged as a serializable array;
            // null when not in mini-cols mode.
            lanesByTechId:
              layout.lanesByTechId != null
                ? Array.from(layout.lanesByTechId.entries()).map(
                    ([techId, lane]) => ({
                      techId,
                      laneIndex: lane.laneIndex,
                      laneWidth: lane.laneWidth,
                    }),
                  )
                : null,
          }
        : {
            viewType: layout.viewType,
            selectedDate: layout.selectedDate,
            resourceIds: layout.resources.map((r) => r.id),
            timeLabelWidth: layout.timeLabelWidth,
            appointmentBlockWidth: layout.appointmentBlockWidth,
            hourHeight: layout.hourHeight,
            minuteOffset: layout.minuteOffset,
          };
    console.log("[MoveChain:Geometry] in", {
      selectedChainId,
      chainCount: graph.chains.length,
      intentCount: intents.length,
      apptCount: appointments.length,
      layout: layoutSummary,
    });
  }

  if (selectedChainId == null) return [];
  if (graph.chains.length === 0) return [];

  // `getVisibleMoveChainDestSlots` does the chain-scope filtering and
  // chain-color join in one shot — same primitive the ghost-tile
  // injector uses, so geometry stays in lockstep with what the user
  // actually sees rendered as ghost frames. (Single source of truth
  // for "which destinations belong to the active selection".)
  const visibleDestSlots: MoveChainDestSlot[] = getVisibleMoveChainDestSlots(
    graph,
    intents,
    appointments,
    selectedChainId,
    chainStepHighlights,
  );
  if (__DEV__) {
    console.log("[MoveChain:Geometry] visibleDestSlots", {
      count: visibleDestSlots.length,
      slots: visibleDestSlots.map((s) => ({
        intent_id: s.intent_id,
        chain_id: s.chain_id,
        date: s.date,
        tech: s.technician_id,
        startMin: s.startMin,
        endMin: s.endMin,
      })),
    });
  }
  if (visibleDestSlots.length === 0) return [];

  // Build appointment lookup once for source-rect resolution.
  const apptById = new Map<number, LinterAppointment>();
  for (const a of appointments) apptById.set(a.id, a);

  const intentById = new Map<number, ReorganizationIntent>();
  for (const i of intents) intentById.set(i.id, i);

  const out: MoveChainArrowSegment[] = [];
  // 2026-05-13 — per-segment trace accumulator. We collect the
  // emitted segments' rect-source + endpoint coords here so the
  // production breadcrumb fired at the end of the function gives
  // Sentry a per-segment view of exactly which rects geometry used
  // for each arrow. Mirrors the `__DEV__` segment console.log just
  // below so the two stay aligned (touch one, touch the other).
  // Capped at TRACE_SEGS_MAX entries; the tail count is included
  // in the breadcrumb so we know if more got dropped.
  const segTraces: Array<{
    intentId: number;
    chainId: string;
    srcFrom: "registry" | "grid" | "none";
    dstFrom: "registry" | "grid" | "none";
    srcAppt: number;
    dstGhost: number;
    fx: number;
    fy: number;
    tx: number;
    ty: number;
    xt?: 1;
  }> = [];
  // 2026-05-13 — per-segment "skipped because not in registry"
  // accumulator. Symmetric to `segTraces` but for the
  // `requireRegistryRect`-rejected segments. We want both shapes
  // visible in Sentry so we can correlate a wrong-direction arrow
  // with whether it ALSO had a sibling that was skipped (e.g., the
  // dest rect's owner hadn't fired onLayout yet but a stale source
  // rect snuck through on a parallel intent).
  const skipTraces: Array<{
    intentId: number;
    chainId: string;
    srcFrom: "registry" | "grid" | "none";
    dstFrom: "registry" | "grid" | "none";
    srcAppt: number;
    dstGhost: number;
  }> = [];

  for (const slot of visibleDestSlots) {
    const intent = intentById.get(slot.intent_id);
    if (!intent) continue;

    // Source rect — only meaningful for intents that act on an
    // existing appointment (reschedule / reassign). `create` has no
    // source tile; we skip emitting an arrow rather than guessing
    // since "moved here from nowhere" isn't a useful visual.
    const sourceAppt =
      intent.appointment_id != null
        ? apptById.get(intent.appointment_id)
        : null;
    if (!sourceAppt) continue;
    // Unassigned appointments (technician_id null) can't anchor a
    // visible source rect — skip rather than guess a column. Doesn't
    // affect typical chain detection: chain seeds always have a tech
    // (the source row was visible on someone's calendar).
    if (sourceAppt.technician_id == null) continue;

    // FORK Phase 26 (2026-05-10) — pass the vendored Event id so
    // `tileRect` can pull post-style bounds from the consumer's
    // bounds registry. Source = real appointment id (the calendar
    // paints the actual appointment card at its DB-position).
    // Destination = ghost id from `moveChainGhostEventIdFor`
    // (the calendar paints a synthetic ghost tile at the staged
    // destination — see `move-chain-ghost-tiles.ts`). The two id
    // namespaces are disjoint by construction (ghost ids are
    // negative), so the registry lookup is unambiguous.
    const sourceRect = tileRect(
      layout,
      sourceAppt.scheduled_date,
      sourceAppt.technician_id,
      parseHmToMinutes(sourceAppt.scheduled_start_time),
      parseHmToMinutes(sourceAppt.scheduled_end_time),
      sourceAppt.id,
    );
    const destRect = tileRect(
      layout,
      slot.date,
      slot.technician_id,
      slot.startMin,
      slot.endMin,
      moveChainGhostEventIdFor(slot.intent_id),
    );

    // PLAN-DEVIATION: 2026-05-12-arrow-registry-only-precision —
    // grid-fallback rejection. See docs/PLAN-DEVIATIONS.md#
    // 2026-05-12-arrow-registry-only-precision for context.
    //
    // 2026-05-12 — registry-only precision gate. When the consumer
    // opts in via `requireRegistryRect: true` (every production
    // calendar host), reject segments whose endpoint rects don't
    // ALL come from the post-layout bounds registry. The two
    // allowed sources are `"registry"` (real onLayout rect —
    // pixel-accurate) and `"none"` (the endpoint is off-screen —
    // stub-arrow path doesn't need a precise rect). A `"grid"`
    // source means the registry hasn't yet observed the event's
    // `onLayout`, so any segment built with it is at best 4-12px
    // misaligned and at worst (when the OTHER endpoint already
    // has registry data) visibly drifts when the next layout pass
    // arrives. Skipping until both endpoints settle eliminates
    // that mixed-source jitter.
    //
    // The consumer-side `useEventBoundsRegistry.tick` settling
    // signal (debounced ~50ms after the last `onLayout` write)
    // triggers a downstream re-compute once the registry has
    // stabilized, so the skipped-then-emitted transition happens
    // exactly once per layout pass. See file-header doc-block on
    // `computeMoveChainArrows` for the full rationale, and
    // docs/PLAN-DEVIATIONS.md#2026-05-12-arrow-registry-only-precision
    // for the design context.
    if (
      layout.requireRegistryRect &&
      (sourceRect.source === "grid" || destRect.source === "grid")
    ) {
      if (__DEV__) {
        console.log("[MoveChain:Geometry] skip — endpoint not in registry", {
          intentId: slot.intent_id,
          chainId: slot.chain_id,
          sourceRectFrom: sourceRect.source,
          destRectFrom: destRect.source,
          sourceApptId: sourceAppt.id,
          destGhostId: moveChainGhostEventIdFor(slot.intent_id),
        });
      }
      if (skipTraces.length < TRACE_SEGS_MAX) {
        skipTraces.push({
          intentId: slot.intent_id,
          chainId: slot.chain_id,
          srcFrom: sourceRect.source,
          dstFrom: destRect.source,
          srcAppt: sourceAppt.id,
          dstGhost: moveChainGhostEventIdFor(slot.intent_id),
        });
      }
      continue;
    }

    // 2026-05-10 — portrait-week cross-tech grey stub flag. When
    // either endpoint resolved to "off-tech" (only possible in
    // workweek view with `emitCrossTechStubs: true`), tag the
    // segment so the overlay paints it grey. The
    // `terminalGreyContinuation`-style override path in the overlay
    // already knows how to remap stroke + arrowhead fill; piggy-
    // backing on the same render contract keeps the visual identity
    // ("muted system affordance, not chain color").
    const isCrossTech = sourceRect.crossTech || destRect.crossTech;
    // 2026-05-10 user-reported smoke fix — anchor `from` and `to` to
    // each rect's EDGE facing the other rect, not its center, so the
    // arrow visibly starts/ends on each card. See
    // `resolveAnchors` / `clipChordToRectEdges` in this file for the
    // edge-clipping algorithm and the rect-overlap / lane-adjacent
    // fallback to center-anchoring.
    const anchors = resolveAnchors(sourceRect.rect, destRect.rect);
    const seg: MoveChainArrowSegment = {
      intentId: slot.intent_id,
      chainId: slot.chain_id,
      // PLAN-DEVIATION: 2026-05-05-per-step-coloring — arrow color
      // = the intent's per-step color (= source card outline =
      // ghost frame), so the user can trace one moving card by
      // color across all three visual elements.
      color: isCrossTech ? TERMINAL_GREY_CONTINUATION_COLOR : slot.step_color,
      from: anchors.from,
      to: anchors.to,
      fromOffscreen: sourceRect.offscreen,
      toOffscreen: destRect.offscreen,
      crossTechOffview: isCrossTech || undefined,
    };
    if (__DEV__) {
      console.log("[MoveChain:Geometry] segment", {
        intentId: seg.intentId,
        chainId: seg.chainId,
        color: seg.color,
        sourceDate: sourceAppt.scheduled_date,
        sourceTech: sourceAppt.technician_id,
        sourceMins: [
          parseHmToMinutes(sourceAppt.scheduled_start_time),
          parseHmToMinutes(sourceAppt.scheduled_end_time),
        ],
        destDate: slot.date,
        destTech: slot.technician_id,
        destMins: [slot.startMin, slot.endMin],
        sourceRect: sourceRect.rect,
        destRect: destRect.rect,
        // 2026-05-11 backwards-arrow diagnostic — surface whether each
        // endpoint's rect came from the FORK Phase 26 bounds registry
        // (`"registry"`) or from the grid-math fallback (`"grid"`).
        // `"none"` means the tile resolved off-screen (rect is null).
        //
        // Triage rule of thumb: a backwards arrow with
        // `sourceRectFrom: "grid"` + `destRectFrom: "registry"` (or
        // vice versa) points at a registry-stale / namespace-collision
        // bug — the two endpoints came from different geometry sources
        // and they're misaligned. A backwards arrow with both
        // `"registry"` or both `"grid"` points at a chain-detection /
        // intent-ordering bug instead.
        sourceRectFrom: sourceRect.source,
        destRectFrom: destRect.source,
        from: seg.from,
        to: seg.to,
        fromOffscreen: seg.fromOffscreen,
        toOffscreen: seg.toOffscreen,
      });
    }
    if (segTraces.length < TRACE_SEGS_MAX) {
      segTraces.push({
        intentId: seg.intentId,
        chainId: seg.chainId,
        srcFrom: sourceRect.source,
        dstFrom: destRect.source,
        srcAppt: sourceAppt.id,
        dstGhost: moveChainGhostEventIdFor(slot.intent_id),
        // `from`/`to` are `ArrowPoint | null` — off-screen stubs
        // have null on one side. Coerce missing coords to -1 so
        // the trace shape stays uniform; the rect-source field
        // disambiguates "missing because off-screen" vs "0,0".
        fx: seg.from ? Math.round(seg.from.x) : -1,
        fy: seg.from ? Math.round(seg.from.y) : -1,
        tx: seg.to ? Math.round(seg.to.x) : -1,
        ty: seg.to ? Math.round(seg.to.y) : -1,
        ...(isCrossTech ? { xt: 1 as const } : {}),
      });
    }
    out.push(seg);
  }

  // PR-UX-3 (2026-05-07): grey terminal continuation arrow. When the
  // user has lit a contiguous prefix `[0..i]` (or a single dot `[i]`)
  // of a chain and `i < chain.intentIds.length - 1`, render a muted
  // stub off the right edge that says "this chain continues past the
  // active link." Only fires in single-chain isolate mode — the
  // "Show all" baseline returns early, and the all-chains sentinel
  // doesn't have a single chain to scope the marker to. See
  // §1.A4 / §10.A4 of the PR-UX-3 plan docs.
  //
  // PLAN-DEVIATION: 2026-05-10-grey-arrow-only-when-offscreen —
  // additionally short-circuit when the next step's destination
  // resolves to an on-screen rect via `tileRect`. The unconditional
  // "more dots beyond" emit was painting a grey stub in landscape
  // multi-tech mode for chains whose continuation cards were already
  // visible on the selected techs, which the user read as a false
  // off-calendar indicator. See
  // docs/PLAN-DEVIATIONS.md#2026-05-10-grey-arrow-only-when-offscreen.
  const continuationSeg = maybeBuildTerminalGreyContinuation(
    graph,
    selectedChainId,
    chainStepHighlights ?? null,
    out,
    layout,
    intentById,
    apptById,
  );
  if (continuationSeg) out.push(continuationSeg);

  if (__DEV__) {
    console.log("[MoveChain:Geometry] out", {
      count: out.length,
      hasTerminalGreyContinuation: !!continuationSeg,
    });
    // 2026-05-12 — diagnostic: when the gate is on AND we ended
    // up with zero segments despite a non-empty visible-dest-slot
    // set, the registry hasn't populated for those events. This is
    // the expected state for the brief window between calendar
    // mount and the first `onEventLayout` cluster settling, but
    // a persistent zero across many consecutive renders signals
    // a wiring bug (e.g., `onEventLayout` not threaded to the
    // vendored Calendar, or ghost-tile injection bypassing
    // `record`). The per-segment skip log above gives the
    // per-id breakdown; this is the single-line summary that
    // makes the failure mode greppable.
    if (
      "requireRegistryRect" in layout &&
      layout.requireRegistryRect &&
      out.length === 0 &&
      visibleDestSlots.length > 0
    ) {
      console.log(
        "[MoveChain:Geometry] all-skipped — registry has not yet observed the chain's events",
        {
          visibleDestSlotCount: visibleDestSlots.length,
          selectedChainId,
          hint: "expected briefly after calendar mount; persistent → check onEventLayout wiring",
        },
      );
    }
  }

  // 2026-05-13 — per-compute production breadcrumb. Fires on EVERY
  // `computeMoveChainArrows` invocation so we can see in Sentry
  // session replay exactly what geometry decided per render. The
  // payload is intentionally compact: rect-source per segment +
  // endpoint coords + ids. Trace arrays cap at TRACE_SEGS_MAX so
  // a 25-arrow chain doesn't blow the breadcrumb size limit.
  //
  // Why every recompute (not just on skips): the bug pattern we're
  // chasing is "arrows render but point at wrong destinations after
  // Future→Now toggle". To debug it we need to compare a known-bad
  // recompute against a known-good one (post Show-none→Show-all
  // workaround). The all-skipped-only breadcrumb only fires when
  // zero arrows emit, which is the OPPOSITE of the bug.
  //
  // Level: warning when any skips occurred OR when out.length is
  // zero despite non-empty visibleDestSlots (existing all-skipped
  // condition). Info otherwise.
  const allSkipped =
    "requireRegistryRect" in layout &&
    layout.requireRegistryRect &&
    out.length === 0 &&
    visibleDestSlots.length > 0;
  const anySkips = skipTraces.length > 0;
  if (selectedChainId != null && graph.chains.length > 0) {
    const now = Date.now();
    const rateKey = `${selectedChainId ?? "null"}:${anySkips ? "skip" : "ok"}`;
    const lastForKey = lastTraceCrumbByKey.get(rateKey) ?? 0;
    // Rate limit: at most one breadcrumb per 250ms per
    // (chain, status) key. This still emits ~3-4 breadcrumbs per
    // Future→Now toggle (one for each recompute during the
    // invalidate→settle dance) but prevents a runaway loop from
    // flooding the ring buffer.
    if (now - lastForKey > 250) {
      lastTraceCrumbByKey.set(rateKey, now);
      traceCalendar(
        allSkipped
          ? "computeMoveChainArrows all-skipped (registry empty)"
          : anySkips
            ? "computeMoveChainArrows partial-emit (some segments skipped)"
            : "computeMoveChainArrows emitted",
        {
          selectedChainId,
          chainCount: graph.chains.length,
          intentCount: intents.length,
          apptCount: appointments.length,
          visibleDestSlotCount: visibleDestSlots.length,
          requireRegistryRect:
            ("requireRegistryRect" in layout &&
              layout.requireRegistryRect === true) ||
            false,
          viewType: layout.viewType,
          segCount: out.length,
          skipCount: skipTraces.length,
          segs: segTraces,
          skipped: skipTraces.length > 0 ? skipTraces : undefined,
          hasTerminalGreyContinuation: !!continuationSeg,
        },
        anySkips || allSkipped ? "warning" : "info",
      );
    }
  }
  return out;
}

/**
 * Maximum number of per-segment trace entries to include in the
 * production breadcrumb fired at the end of `computeMoveChainArrows`.
 * Sentry truncates oversized breadcrumb data; the typical chain has
 * ≤ 7 visible segments so 16 is plenty of head-room while keeping
 * the payload comfortably under any provider limits.
 */
const TRACE_SEGS_MAX = 16;

// Module-level rate limiter for the per-compute trace breadcrumb.
// Keyed by `chainId:status` so a chain swap or status flip (ok ↔
// skip ↔ all-skipped) re-fires immediately, but a tight loop
// recomputing the same chain in the same status throttles.
const lastTraceCrumbByKey = new Map<string, number>();

/**
 * Resolve the synthetic grey-continuation segment for the active
 * chain, or `null` when none applies. Pure: no React, no I/O.
 *
 * Trigger conditions (all must hold):
 *   1. `selectedChainId` is a real chain id (not null, not the
 *      all-chains sentinel).
 *   2. `chainStepHighlights` has at least one entry — the user has
 *      lit at least one dot (whether single-link `[i]` or prefix
 *      `[0..i]`).
 *   3. The highest lit step ordinal `i` is strictly less than the
 *      chain's last step ordinal (i.e., there are unhighlighted
 *      dots remaining further down the chain).
 *   4. The highest lit step's RESOLVED destination point is on-
 *      screen (we anchor the stub at that point — if the dest is
 *      itself off-screen, the existing edge-stub plumbing for that
 *      segment already conveys "off-screen continuation" and a
 *      second grey stub on top would just be visual noise).
 *   5. The IMMEDIATELY-NEXT step (`lastLitStep + 1`) resolves to a
 *      `null` rect via `tileRect` — i.e., the chain continuation
 *      is genuinely off the current visible window (off-tech in
 *      single-tech workweek, off-resourceIds in landscape multi-
 *      tech, or off-date in day view). When the next step's
 *      destination rect resolves on-screen we suppress the stub
 *      entirely (`null` return). See
 *      `2026-05-10-grey-arrow-only-when-offscreen` in
 *      `docs/PLAN-DEVIATIONS.md` for the why.
 */
function maybeBuildTerminalGreyContinuation(
  graph: MoveChainGraph,
  selectedChainId: string | null,
  chainStepHighlights: readonly number[] | null,
  segments: readonly MoveChainArrowSegment[],
  layout: MoveChainCalendarLayout,
  intentById: ReadonlyMap<number, ReorganizationIntent>,
  appointmentsById: ReadonlyMap<number, LinterAppointment>,
): MoveChainArrowSegment | null {
  if (selectedChainId == null) return null;
  if (selectedChainId === ALL_CHAINS_SENTINEL) return null;
  if (!chainStepHighlights || chainStepHighlights.length === 0) return null;

  const chain = graph.chains.find((c) => c.id === selectedChainId);
  if (!chain) return null;

  const totalSteps = chain.intentIds.length;
  if (totalSteps === 0) return null;

  let lastLitStep = -1;
  for (const step of chainStepHighlights) {
    if (typeof step !== "number") continue;
    if (step < 0 || step >= totalSteps) continue;
    if (step > lastLitStep) lastLitStep = step;
  }
  if (lastLitStep < 0) return null;
  if (lastLitStep >= totalSteps - 1) return null;

  const lastLitIntentId = chain.intentIds[lastLitStep];
  if (lastLitIntentId == null) return null;
  const anchorSeg = segments.find((s) => s.intentId === lastLitIntentId);
  if (!anchorSeg) return null;
  const anchorPoint = anchorSeg.to;
  if (!anchorPoint) return null;

  // PLAN-DEVIATION: 2026-05-10-grey-arrow-only-when-offscreen —
  // probe the next step's destination rect. If it resolves on-
  // screen (`rect != null`), suppress the grey stub: the chain
  // continuation is already visible to the user, so a stub off
  // the right edge is a false off-calendar signal. See
  // docs/PLAN-DEVIATIONS.md#2026-05-10-grey-arrow-only-when-offscreen.
  const nextStepIntentId = chain.intentIds[lastLitStep + 1];
  if (nextStepIntentId != null) {
    const nextStepIntent = intentById.get(nextStepIntentId);
    if (nextStepIntent != null) {
      const nextDest = resolveIntentDestRect(
        layout,
        nextStepIntent,
        appointmentsById,
      );
      if (nextDest != null) {
        if (__DEV__) {
          console.log(
            "[MoveChain:Geometry] suppress terminalGreyContinuation — next step is on-screen",
            {
              chainId: chain.id,
              lastLitStep,
              nextStepIntentId,
              nextDestRect: nextDest,
            },
          );
        }
        return null;
      }
      if (__DEV__) {
        console.log(
          "[MoveChain:Geometry] emit terminalGreyContinuation — next step is off-screen",
          {
            chainId: chain.id,
            lastLitStep,
            nextStepIntentId,
          },
        );
      }
    }
  }

  const seedIntentId = chain.seedIntentId;
  return {
    intentId: TERMINAL_GREY_CONTINUATION_INTENT_ID_BASE - seedIntentId,
    chainId: chain.id,
    color: TERMINAL_GREY_CONTINUATION_COLOR,
    from: anchorPoint,
    to: null,
    fromOffscreen: null,
    toOffscreen: "right",
    terminalGreyContinuation: true,
  };
}

/**
 * Resolve the destination rect of a single intent against the
 * current calendar layout, mirroring the destination-projection
 * rules in `projectIntentsToTechSlots` (`detect-move-chains.ts`).
 * Returns `null` when the intent has no chain-relevant destination
 * (e.g. cancel, personal-event ops) OR when the destination lies
 * outside the visible window (off-tech in single-tech mode, off-
 * date in day view, or off-`resourceIds` in landscape multi-tech).
 *
 * Used exclusively by `maybeBuildTerminalGreyContinuation` to
 * decide whether the next chain step's continuation is genuinely
 * off-screen (and thus deserves a grey stub) or already visible
 * (and so the stub would be a false off-calendar signal). Keeps
 * the projection logic local to this file so the test surface
 * stays self-contained.
 */
function resolveIntentDestRect(
  layout: MoveChainCalendarLayout,
  intent: ReorganizationIntent,
  appointmentsById: ReadonlyMap<number, LinterAppointment>,
): TileRect | null {
  const payload = intent.payload;
  let date: string;
  let techId: number;
  let startMin: number;
  let endMin: number;

  if (payload.kind === "reschedule") {
    if (intent.appointment_id == null) return null;
    const appt = appointmentsById.get(intent.appointment_id);
    const t = payload.new_technician_id ?? appt?.technician_id ?? null;
    if (t == null) return null;
    techId = t;
    date = payload.new_scheduled_date;
    startMin = parseHmToMinutes(payload.new_start_time);
    endMin = parseHmToMinutes(payload.new_end_time);
  } else if (payload.kind === "reassign") {
    if (intent.appointment_id == null) return null;
    const appt = appointmentsById.get(intent.appointment_id);
    if (!appt) return null;
    techId = payload.new_technician_id;
    date = appt.scheduled_date;
    startMin = parseHmToMinutes(appt.scheduled_start_time);
    endMin = parseHmToMinutes(appt.scheduled_end_time);
  } else if (payload.kind === "create") {
    if (payload.technician_id == null) return null;
    techId = payload.technician_id;
    date = payload.scheduled_date;
    startMin = parseHmToMinutes(payload.scheduled_start_time);
    endMin = parseHmToMinutes(payload.scheduled_end_time);
  } else {
    // cancel / personal_event_* / personal_event_delete: no
    // chain-relevant destination. Treat as "not on-screen" — the
    // chain-eligibility filter in `detectMoveChains` already
    // excludes these from the chain graph entirely so this branch
    // is defensive only.
    return null;
  }

  return tileRect(layout, date, techId, startMin, endMin).rect;
}
