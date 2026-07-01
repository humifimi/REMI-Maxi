'use strict';

var React19 = require('react');
var reactNativeGestureHandler = require('react-native-gesture-handler');
var reactNativeWorklets = require('react-native-worklets');
var Animated2 = require('react-native-reanimated');
var reactNative = require('react-native');
var flashList = require('@shopify/flash-list');
var dateFnsTz = require('date-fns-tz');
var dateFns = require('date-fns');
var lodash = require('lodash');
var zustand = require('zustand');
var shallow = require('zustand/shallow');
var traditional = require('zustand/traditional');
var reactNativeSkia = require('@shopify/react-native-skia');
var Svg = require('react-native-svg');
var native = require('react-content-loader/native');
var vectorIcons = require('@expo/vector-icons');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n.default = e;
  return Object.freeze(n);
}

var React19__namespace = /*#__PURE__*/_interopNamespace(React19);

// FORK Phase 28.3 (PR-UX-3 follow-up, 2026-05-07) — verbose-logs
// gate for the `[BUG-A:*]` family. The diagnostic logs were added
// during the Phase 16 leak hunt (P2-FE-4 #15) and are still needed
// when a similar regression pops, but they fire 1×/render per
// resource (`useEventsFor`), per Provider mount (`Provider` /
// `StoreCreate`), per StoreFeeder pass, and per `CalendarRender` —
// at scale (10+ pending intents, 17+ events) they JS-thread-starve
// the chip-row commit pipeline and cause the 2026-05-07 freeze the
// follow-up addresses. Mirrors the `VERBOSE_CALENDAR_LOGS` constant
// in `src/utils/calendar-debug-logs.ts`. We can't import from the
// consumer (vendored modules must be self-contained), so this
// inline copy reads the same env var. Default off in dev; flip
// `EXPO_PUBLIC_VERBOSE_CALENDAR_LOGS=1` to opt back in. Folded
// dead-code in production builds (`__DEV__` is `false`).
var __VERBOSE_CAL_LOGS__ =
  (typeof __DEV__ !== "undefined" && __DEV__) &&
  (typeof process !== "undefined" &&
    process.env &&
    process.env.EXPO_PUBLIC_VERBOSE_CALENDAR_LOGS === "1");
var Animated2__default = /*#__PURE__*/_interopDefault(Animated2);
var Svg__default = /*#__PURE__*/_interopDefault(Svg);

// src/components/Calendar.tsx
var TIME_LABEL_WIDTH = 50;
var groupEventsByOverlap = (events) => {
  return events.reduce((clusters, appointment) => {
    const cluster = clusters.find((c) => c.some((e) => isOverlapping(e, appointment)));
    if (cluster) {
      cluster.push(appointment);
    } else {
      clusters.push([appointment]);
    }
    return clusters;
  }, []);
};
function computeDisabledBlockColumns(disabledBlocks) {
  const groups = groupDisabledBlocksByOverlap(disabledBlocks);
  const res = /* @__PURE__ */ new Map();
  for (const group of groups) {
    const byStart = [...group].sort((a, b) => a.from - b.from);
    const columns = [];
    for (const evt of byStart) {
      let placed = false;
      for (const col of columns) {
        const last = col[col.length - 1];
        if (!isOverlappingDisabledBlock(last, evt)) {
          col.push(evt);
          placed = true;
          break;
        }
      }
      if (!placed) columns.push([evt]);
    }
    const colIndexByEvent = /* @__PURE__ */ new Map();
    columns.forEach((col, idx) => col.forEach((e) => colIndexByEvent.set(e, idx)));
    const groupCols = columns.length;
    for (const evt of group) {
      const myCol = colIndexByEvent.get(evt);
      let span = 1;
      for (let c = myCol + 1; c < groupCols; c++) {
        const blocked = columns[c].some(
          (e) => e !== evt && isOverlappingDisabledBlock(e, evt)
        );
        if (blocked) break;
        span++;
      }
      const key = evt.id;
      res.set(key, {
        leftIndex: myCol,
        renderColumnCount: groupCols,
        spanColumns: span
      });
    }
  }
  return res;
}
var groupDisabledBlocksByOverlap = (disabledBlocks) => {
  return disabledBlocks.reduce((clusters, disabledBlock) => {
    const cluster = clusters.find((c) => c.some((e) => isOverlappingDisabledBlock(e, disabledBlock)));
    if (cluster) {
      cluster.push(disabledBlock);
    } else {
      clusters.push([disabledBlock]);
    }
    return clusters;
  }, []);
};
var isOverlappingDisabledBlock = (disabledBlockA, disabledBlockB) => {
  return !(disabledBlockA.to <= disabledBlockB.from || disabledBlockA.from >= disabledBlockB.to);
};
function computeEventColumns(events) {
  const groups = groupEventsByOverlap(events);
  const out = /* @__PURE__ */ new Map();
  for (const group of groups) {
    const byStart = [...group].sort(
      (a, b) => a.from - b.from
    );
    const columns = [];
    for (const evt of byStart) {
      let placed = false;
      for (const col of columns) {
        const last = col[col.length - 1];
        if (!isOverlapping(last, evt)) {
          col.push(evt);
          placed = true;
          break;
        }
      }
      if (!placed) columns.push([evt]);
    }
    const colIndex = /* @__PURE__ */ new Map();
    columns.forEach((col, i) => col.forEach((e) => colIndex.set(e, i)));
    const groupCols = columns.length;
    for (const evt of group) {
      const myCol = colIndex.get(evt);
      let span = 1;
      for (let c = myCol + 1; c < groupCols; c++) {
        const blocked = columns[c].some(
          (e) => (
            // exclude self; block if ANY event in col c overlaps me
            e !== evt && e.id !== evt.id && isOverlapping(e, evt)
          )
        );
        if (blocked) break;
        span++;
      }
      out.set(evt.id, {
        leftIndex: myCol,
        renderColumnCount: groupCols,
        spanColumns: span
      });
    }
  }
  return out;
}
var getTextSize = (size) => {
  switch (size) {
    case 60:
      return 10;
    case 80:
      return 12;
    case 100:
      return 12;
    default:
      return 12;
  }
};
var MINUTES_IN_DAY = 1440;
var normalizeOvernight = (startMin, endMin) => {
  if (endMin < startMin) endMin += MINUTES_IN_DAY;
  return { startMin, endMin };
};
var intersects = (A, B) => Math.max(A.startMin, B.startMin) < Math.min(A.endMin, B.endMin);
var isOverlapping = (eventA, eventB) => {
  const aStart0 = eventA.from;
  const aEnd0 = eventA.to;
  const bStart0 = eventB.from;
  const bEnd0 = eventB.to;
  if (aStart0 === aEnd0 || bStart0 === bEnd0) return false;
  const A = normalizeOvernight(aStart0, aEnd0);
  const B = normalizeOvernight(bStart0, bEnd0);
  return intersects(A, B);
};
var getCurrentTimeInMinutes = (timezone) => {
  const now = dateFnsTz.toZonedTime(/* @__PURE__ */ new Date(), timezone);
  const hours = dateFns.getHours(now);
  const minutes = dateFns.getMinutes(now);
  return hours * 60 + minutes;
};
var timeToYPosition = (minutes, TIME_LABEL_HEIGHT) => minutes * (TIME_LABEL_HEIGHT / 60);
var scalePosition = (position, hourHeight) => {
  return position * (hourHeight / 60);
};
var positionToMinutes = (position, TIME_LABEL_HEIGHT) => {
  "worklet";
  return position / (TIME_LABEL_HEIGHT / 60);
};
var combineDateAndTime = (date, time) => {
  const [hours, minutes, seconds] = time.split(":").map(Number);
  const combinedDate = dateFns.setSeconds(dateFns.setMinutes(dateFns.setHours(date, hours), minutes), seconds);
  return dateFns.format(combinedDate, "yyyy-MM-dd HH:mm:ss");
};
var indexToDate = (index) => {
  const dateWithHour = dateFns.set(/* @__PURE__ */ new Date(), { hours: index, minutes: 0, seconds: 0, milliseconds: 0 });
  return dateFns.format(dateWithHour, "h:mm a");
};
var minutesToTime = (totalMinutes) => {
  "worklet";
  const safeTotalMinutes = Math.max(0, Math.round(totalMinutes));
  const hours24 = Math.floor(safeTotalMinutes / 60);
  const minutes = safeTotalMinutes % 60;
  const paddedMins = minutes < 10 ? "0" + minutes : String(minutes);
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${paddedMins}`;
};
function computeStackedEventLayout(events, containerWidthPx, {
  indentPx = 6,
  // how much to nudge each overlap to the right
  rightPadPx = 0,
  // visual breathing room on the right
  minWidthPx = 25,
  // never let an event become thinner than this
  capIndentLevels = 4
  // after N levels, stop indenting (just stack via z-index)
} = {}) {
  const groups = groupEventsByOverlap(events);
  const out = /* @__PURE__ */ new Map();
  for (const group of groups) {
    const byStart = [...group].sort((a, b) => a.from - b.from);
    const active = [];
    const removeFinished = (currentFrom) => {
      for (let i = active.length - 1; i >= 0; i--) {
        if (!isOverlapping(active[i].e, { ...active[i].e, from: currentFrom, to: currentFrom })) {
          if (active[i].e.to <= currentFrom) active.splice(i, 1);
        }
      }
    };
    const findLowestFreeLevel = () => {
      const used = new Set(active.map((a) => a.level));
      let lvl = 0;
      while (used.has(lvl)) lvl++;
      return lvl;
    };
    for (const e of byStart) {
      removeFinished(e.from);
      let level = findLowestFreeLevel();
      const visualLevel = Math.min(level, capIndentLevels);
      active.push({ e, level });
      const leftPx = visualLevel * indentPx;
      const available = containerWidthPx - leftPx - rightPadPx;
      // FORK Phase 20.6 (P3-FE-DRAG-GHOST chunk b root-cause,
      // 2026-05-06): clamp the floored width so it never exceeds
      // `containerWidthPx - leftPx`. The legacy
      // `Math.max(minWidthPx, available)` would force a 25px floor
      // even inside a 21.25px lane (mini-cols, 3 techs, portrait
      // 4-day view), causing EVERY event card to render 3.75–9.75px
      // wider than its lane — visually leaking into the adjacent
      // lane and producing the user's "card shifts position out of
      // alignment from the column lines" symptom. The floor still
      // applies when the container has room for it; only when the
      // lane itself is narrower than `minWidthPx` does the clamp
      // win. Floor of 0 covers the degenerate-input case where
      // `leftPx > containerWidthPx`. The Phase 20.5 overflow log
      // (kept below as defense-in-depth) will stay silent unless
      // a future change re-introduces the regression.
      const widthPx = Math.max(0, Math.min(
        containerWidthPx - leftPx,
        Math.max(minWidthPx, available)
      ));
      const zIndex = 9999 + e.from * 10 + level;
      // FORK Phase 20.5 (P3-FE-DRAG-GHOST chunk b diagnostic,
      // 2026-05-06): detect frames that would render WIDER than
      // their container. After Phase 20.6 above, this should never
      // fire under normal operation — kept as a defensive guard so
      // any future regression in the layout math gets caught at the
      // source rather than waiting for a user-visible misalignment
      // report. In mini-cols mode containerWidthPx == laneWidth, so
      // an overflow here means a card visually spilling out of its
      // lane. Tolerance of 0.5px to ignore floating-point noise.
      // See README-FORK Phase 20.5 + 20.6.
      if (__DEV__ && leftPx + widthPx > containerWidthPx + 0.5) {
        console.warn("[CAL:lane-overflow] event frame exceeds container", {
          eventId: e.id,
          eventFrom: e.from,
          eventTo: e.to,
          eventResourceId: e.resourceId,
          containerWidthPx,
          leftPx,
          widthPx,
          overflowPx: leftPx + widthPx - containerWidthPx,
          level,
          visualLevel,
          indentPx,
          minWidthPx,
        });
      }
      out.set(e.id, { leftPx, widthPx, zIndex });
    }
  }
  return out;
}
function columnsToPixels(columnMap, containerWidthPx, {
  gutterPx = 2,
  // spacing between columns
  padLeftPx = 0,
  padRightPx = 0
} = {}) {
  const out = /* @__PURE__ */ new Map();
  for (const [id, c] of columnMap) {
    const totalGutters = (c.renderColumnCount - 1) * gutterPx;
    const innerWidth = containerWidthPx - padLeftPx - padRightPx - totalGutters;
    const colWidth = innerWidth / c.renderColumnCount;
    const left = padLeftPx + c.leftIndex * (colWidth + gutterPx);
    const width = colWidth * c.spanColumns + gutterPx * (c.spanColumns - 1);
    out.set(id, {
      leftPx: left,
      widthPx: Math.max(0, width),
      // later columns on top slightly, but mostly rely on time-based z
      zIndex: 1e3 + c.leftIndex
    });
  }
  return out;
}
function computeEventFrames(events, containerWidthPx, mode, options) {
  if (mode === "columns") {
    const columnLayouts = computeEventColumns(events);
    return columnsToPixels(columnLayouts, containerWidthPx, {
      gutterPx: options?.gutterPx,
      padLeftPx: options?.padLeftPx,
      padRightPx: options?.padRightPx
    });
  } else {
    return computeStackedEventLayout(events, containerWidthPx, {
      indentPx: options?.indentPx,
      rightPadPx: options?.rightPadPx,
      minWidthPx: options?.minWidthPx,
      capIndentLevels: options?.capIndentLevels
    });
  }
}
var findResourceIndexFor = (rid, resourceIds) => Math.max(0, Math.min(
  resourceIds.length - 1,
  resourceIds.findIndex((id) => id === rid)
));
var findDayIndexFor = (date, days) => Math.max(0, Math.min(
  days.length - 1,
  days.findIndex((d) => date === dateFns.format(d, "yyyy-MM-dd"))
));
// FORK Phase 15: pure resolver for the destination tech of a drag-end.
// Extracted so the consumer can unit-test the rule independently of the
// gesture/worklet machinery. Called from `finalizeDrag` inside
// `CalendarInner` AND directly exported so tests can pin the contract.
//
// PLAN-DEVIATION: 2026-04-20-cross-tech-drag-end —
// docs/implementation-plans/landscape-overlay-rendering.md §6.2 / §10
// said cross-tech drag-end stays inert in multi-tech mode. We now
// resolve it (mini-columns spatially, stacked preserves original).
// Full context: docs/PLAN-DEVIATIONS.md#2026-04-20-cross-tech-drag-end
//
// Inputs (all required, all positional via the params object):
//   - mode: "day" | other (anything not "day" is treated as multi-day)
//   - colIndex: index into `bodyResourceIds` (single-day) or into the
//     visible day-columns (multi-day)
//   - bodyResourceIds: the selection-filtered resource id list the body
//     is currently rendering (NOT the full `resourceIds` prop)
//   - resourceIds: the full ordered resource id list (used as the
//     last-resort fallback for multi-day stacked / no-multi-tech)
//   - selectedEvent: the event currently being dragged; its
//     `resourceId` is the original-tech preserve target for stacked /
//     resize / no-multi-tech in multi-day mode
//   - activeResourceId: library-internal active drag resource (set
//     during the drag, can be null in the brief window after a
//     selection-change effect clears it)
//   - multiTechMode: undefined | "stacked" | "mini-columns" (Phase 14
//     narrowed away `"stacked-bands"`; passing it falls through to the
//     default branch as if `undefined`)
//   - bodyBlockWidth: BODY_BLOCK_WIDTH at drag-end (used to compute
//     mini-columns lane width; ignored otherwise)
//   - xWithinColumn: drop's X offset inside the day-column in points,
//     measured BEFORE the snap-to-column animation overwrites the
//     gesture's panX. Required for mini-columns lane resolution; if
//     null/undefined, mini-columns falls through to the keep-original
//     branch (defensive, no spatial signal available).
//   - isResize: true for pinch-resize finalize; resize NEVER reassigns
//     regardless of mode.
//
// Returns: the destination resourceId, or undefined if every branch
// produced a falsy value (the consumer treats undefined as "no
// reschedule signal" and the calendar's draft state will reject it).
var resolveLandedResourceId = ({
  mode,
  colIndex,
  bodyResourceIds,
  resourceIds,
  selectedEvent,
  activeResourceId,
  multiTechMode,
  bodyBlockWidth,
  xWithinColumn,
  isResize
}) => {
  var isMultiDay = mode !== "day";
  if (!isMultiDay) {
    return bodyResourceIds[colIndex];
  }
  var techCount = bodyResourceIds.length;
  // FORK Phase 21 (P2-FE-6 hover-dwell drop fix): when the body has
  // narrowed to a single visible tech (e.g. via the avatar-navigator
  // dwell pattern in landscape, or any other single-tech selection),
  // the drop is unambiguous — only one tech is rendered. Return that
  // tech regardless of the dragged event's original resourceId.
  //
  // Without this branch, a card dragged onto the visible single-tech
  // calendar AFTER navigating from another tech via dwell would
  // silently re-attribute back to the original tech (because the
  // "keep selectedEvent.resourceId" fallback below would fire), losing
  // the user's reassignment intent. See PLAN-DEVIATIONS.md
  // 2026-04-22-hover-dwell-avatar-navigator for the dwell pattern this
  // unblocks.
  //
  // Safe for the historical "always-1-tech-selected, drag to new
  // time" path: bodyResourceIds[0] === selectedEvent.resourceId in
  // that case, so the result is unchanged.
  if (techCount === 1) {
    return bodyResourceIds[0];
  }
  var isMultiTech = techCount >= 2 && (multiTechMode === "stacked" || multiTechMode === "mini-columns");
  if (!isResize && isMultiTech && multiTechMode === "mini-columns" && xWithinColumn != null && bodyBlockWidth > 0) {
    var laneWidth = bodyBlockWidth / techCount;
    var laneIndex = Math.max(0, Math.min(techCount - 1, Math.floor(xWithinColumn / laneWidth)));
    return bodyResourceIds[laneIndex];
  }
  // Stacked / no-multi-tech / resize: keep the dragged event's
  // original tech. Fallbacks preserve prior behavior for the
  // long-press-no-drag path where selectedEvent may be a fresh draft
  // and activeResourceId may have been cleared by an upstream effect.
  if (selectedEvent && selectedEvent.resourceId != null) {
    return selectedEvent.resourceId;
  }
  if (activeResourceId != null) {
    return activeResourceId;
  }
  return resourceIds[0];
};
// FORK Phase 16 (P2-FE-4 follow-up #12): pure live-position resolver for
// the snap-target drop shadow. Mirrors the spatial branch of
// resolveLandedResourceId but returns positional data instead of a
// resourceId so the snap shadow's animated style can render the
// destination preview every frame on the UI thread.
//
// Inputs (all numbers, all worklet-safe):
//   - panXAbs: live absolute X of the drag finger in screen coords
//     (already clamped by the pan worklet to the calendar's visible
//     body-grid bounds).
//   - eventStartedTop: snapped absolute Y of the dragged card's top in
//     scroll-relative coords (the pan worklet already snaps this to
//     `snapInterval`, so reading it here gives the finalized snap-Y
//     destination without a second snap calculation).
//   - eventHeight: live height of the dragged card.
//   - scrollX/scrollY: live scroll offsets of the body grid.
//   - timeLabelWidth: width of the left time-gutter (TIME_LABEL_WIDTH).
//   - bodyBlockWidth: width of one full day-column (BODY_BLOCK_WIDTH).
//   - techCount: bodyResourceIds.length at render time.
//   - columnCount: visible day count (used to clamp colIndex when the
//     gesture wanders past the right edge during auto-scroll).
//
// Returns: shadow position payload, or null if the live preview should
// not render (single-tech, single-day, non-mini-columns, or any
// degenerate input). The consumer gates the shadow on
// `multiTechMode === "mini-columns" && techCount >= 2` BEFORE calling
// this — the null-on-degenerate-input here is purely defensive.
//
// MUST stay synchronous, allocation-free, and worklet-safe (no
// closures, no JS-only APIs) so it can be called from inside a
// useAnimatedStyle worklet on the UI thread.
//
// PLAN-DEVIATION: 2026-04-20-mini-cols-drop-shadow —
// docs/PLAN-DEVIATIONS.md#2026-04-20-mini-cols-drop-shadow
//
// FORK Phase 32 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY, 2026-05-07):
// discrete + animated shadow offset, replacing the Phase 28.1 / 30.x
// continuous-envelope `computeXEdgeShift` and `computeYEdgeShift`.
//
// Why the change: the continuous envelope produced fractional pixel
// shifts that were always sliding the ghost between two lanes,
// which the user explicitly rejected ("the shadows no longer stay
// in their lanes"). The new model is two discrete shadow offset
// states — `-1` step (one full lane to the LEFT of the finger's
// lane, the historical Phase 27.1 mid-canvas relationship) or `0`
// step (in the finger's own lane, used at edges). Transitions
// between the two states are animated via a SharedValue that the
// pan worklet writes to with `withTiming(150ms)` — the exact same
// primitive used by the post-release snap-in slide.
//
// `resolveDiscreteShadowOffsetXStep` is the pure decider: given the
// current finger position, returns -1 if the ghost has room to sit
// one full lane to the left, 0 otherwise.
//
// FORK Phase 34 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY, 2026-05-07):
// strengthened the "no room" case beyond Phase 32's leftmost-of-grid
// + rightmost-of-grid two-cell envelope. The new envelope is:
//
//   1. `laneIndex === 0` (finger in the leftmost lane of ANY day) —
//      previously ONLY the absolute leftmost (`absoluteLane <= 0`)
//      converged. The Phase 32 rule let `Tue Josh → drop = Mon Todd`,
//      `Wed Josh → drop = Tue Todd`, etc., which the user reported
//      as `"shadow crossed day boundary"` after the on-device pass.
//      With the new rule, every day's first lane converges (no
//      cross-day shadow). Subsumes the Phase 32 `absoluteLane <= 0`
//      check (when colIndex == 0 and laneIndex == 0, both fire).
//
//   2. `absoluteLane >= totalLanes - 1` (rightmost absolute lane) —
//      unchanged from Phase 32, kept for explicitness. This is what
//      makes the absolute rightmost cell (e.g. Thu Todd in 4×3 mini-
//      cols) addressable as a drop target — pointing at it converges
//      to 0 so the drop lands in that cell.
//
// FORK Phase 35 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY, 2026-05-07):
// initial pass kept Phase 34's X-step rules unchanged and only
// retuned card-Y pickup (`H/3` → `H/2`) plus extended the bottom-
// edge snap clamp by `H/2`. Documented (incorrectly) that the
// existing Phase 34 `xStep = 0` clamp at the right-edge / cross-
// day cells "naturally produces the rotation visual" the user
// described in their redirect. Smoke confirmed that reading was
// wrong for the middle lane of the last day — see Phase 35.1.
//
// FORK Phase 35.1 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
// 2026-05-07): SMOKE-DRIVEN CORRECTION. User reported after
// Phase 35 base shipped: *"I picked up a card in the middle
// subcolumn of the right-most column for Thursday, and then kept
// skipping between the other two sub-columns in that column. It's
// because I couldn't get the shadow to highlight the middle sub-
// column."*
//
// In a 4-day × 3-tech mini-cols layout (lanes Josh / Jake / Trey
// per day), Thu Jake = colIndex=3, laneIndex=1, absoluteLane=10.
// Phase 34's rules:
//   - `laneIndex === 0` → 0 (cross-day): doesn't fire (laneIndex=1).
//   - `absoluteLane >= totalLanes - 1` → 0 (= 11): doesn't fire
//     (absoluteLane=10 ≠ 11).
//   - default → -1 (corner-peek).
// With xStep=-1, the shadow lands in Thu Josh (one lane LEFT) and
// the drop commits in Thu Josh. Pointing at Thu Trey instead also
// fires Phase 34's `absoluteLane >= 11` rule → xStep=0 → drop in
// Thu Trey. So the user could only ever drop in Thu Josh or Thu
// Trey by pointing at Thu Jake or Thu Trey respectively — Thu
// Jake was structurally unreachable.
//
// Phase 35.1 fixes this by extending the rotation trigger from
// "absolute-rightmost lane only" to "ENTIRE LAST VISIBLE DAY":
//
//   1. NEW: `columnCount > 1 && colIndex === columnCount - 1`
//      (any lane of the last visible day) → `{ xStep: 0,
//      yPx: -eventHeight/2 }`. THE ROTATION RULE. Shadow
//      appears in the finger's own lane (X), shifted UP by half
//      an event-height beyond the existing `- pos.height / 2`
//      ghost render (Y) — i.e. ONE FULL eventHeight above the
//      snap row in content coords.
//
//   2. PRESERVED: cross-day first-lane clamp (laneIndex === 0).
//
//   3. PRESERVED for single-day mode: absolute-rightmost flat
//      clamp (subsumed by rule 1 in multi-day, kept for
//      `columnCount === 1`).
//
//   4. PRESERVED: corner-peek default `xStep: -1`.
//
// User redirect on the same day, three rapid messages, that drove
// the rotation design:
//   - *"The drop zone shadow can't be removed from it's relative
//     position to the card. That's non-negotiable."*
//   - *"Well it's negotiable for the right side of the screen.
//     If you need the shadow to move over there, we can talk."*
//   - *"perhaps the shadow shifts to a different position in the
//     right column so it fits in all the sub columns. So instead
//     of it being up and next to the card, it is up above it
//     half way?"* — the rotation rule.
//
// "All the sub columns" = ALL THREE LANES of the rightmost day —
// not just the absolute-rightmost lane. Phase 35.1 honors this
// literal reading by triggering rotation on `colIndex ===
// columnCount - 1` regardless of `laneIndex`.
//
// Helper signature changed: now takes `eventHeight` and returns
// `{ xStep, yPx }` instead of a bare number. Both call sites
// (`useAnimatedReaction` driving the SVs, pan-onEnd `dropShiftX`
// / `dropShiftY` block) pass eventHeight and destructure the
// return.
//
// PLAN-DEVIATION: 2026-05-07-x-edge-drop-clamp covers the
// corner-peek tradeoff (last lane of every NON-LAST day is still
// structurally unreachable as a "left of finger" drop — that
// hasn't changed in Phase 35.1; only the LAST DAY's middle/last
// lane reachability is fixed). The same entry's anti-instructions
// were updated for Phase 35.1 to:
//   (a) override the Phase 35 base "do NOT add `shadowOffsetYPx`
//       SV" anti-instruction — that prior guidance was based on
//       flawed geometry reasoning AND was disproven by the
//       Thu Jake smoke evidence above.
//   (b) note that the rotation rule must apply to ALL lanes of
//       the last visible day, not just the absolute-rightmost
//       cell.
//
// PLAN-DEVIATION: 2026-05-07-rectangle-first-edge-drag is resolved
// (superseded by Phase 32; Phase 34 / 35 / 35.1 refine the helper
// rules but the rectangle-first model stays retired).
//
// FORK Phase 35.1 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
// 2026-05-07): helper now returns an OBJECT `{ xStep, yPx }`
// instead of a bare number. New rotation rule for the entire last
// visible day. See the rewritten doc-block above the helper for
// the full decision tree, smoke evidence (Thu Jake unreachability),
// and the override of the prior Phase 35 anti-instruction.
//
// PLAN-DEVIATION: 2026-05-07-x-edge-drop-clamp —
// docs/PLAN-DEVIATIONS.md#2026-05-07-x-edge-drop-clamp.
// Worklet-safe: no closures, no JS-only APIs. Returns one
// allocated object per call — the rate is bounded by the
// `useAnimatedReaction` change-detector + the once-per-release
// pan-onEnd fire, so per-frame GC pressure is negligible.
var resolveDiscreteShadowOffsetXStep = ({ panXAbs, timeLabelWidth, bodyBlockWidth, techCount, columnCount, eventHeight }) => {
  "worklet";
  if (techCount < 2 || bodyBlockWidth <= 0 || columnCount < 1) return { xStep: 0, yPx: 0 };
  var laneWidth = bodyBlockWidth / techCount;
  if (laneWidth <= 0) return { xStep: 0, yPx: 0 };
  var rawColIndex = Math.floor((panXAbs - timeLabelWidth) / bodyBlockWidth);
  var colIndex = rawColIndex < 0 ? 0 : rawColIndex > columnCount - 1 ? columnCount - 1 : rawColIndex;
  var xWithinColumn = panXAbs - timeLabelWidth - colIndex * bodyBlockWidth;
  var rawLaneIndex = Math.floor(xWithinColumn / laneWidth);
  var laneIndex = rawLaneIndex < 0 ? 0 : rawLaneIndex > techCount - 1 ? techCount - 1 : rawLaneIndex;
  // FORK Phase 35.1: ROTATION RULE. Last visible day's all lanes
  // get xStep=0 (shadow in finger's own lane) AND yPx=-H/2
  // (shadow shifted up by half an event-height beyond the existing
  // `- pos.height / 2` ghost render in DropShadow). Subsumes the
  // Phase 32 absolute-rightmost rule for the multi-day case.
  // Gated on `columnCount > 1` so single-day mode keeps the Phase
  // 32 flat-clamp at absolute-rightmost (no rotation in single-
  // day; the corner-peek X has no off-screen failure mode there).
  // Order matters: this rule wins over the cross-day rule for
  // last-day's first lane (which would otherwise hit the
  // `laneIndex === 0` clamp below).
  //
  // FORK Phase 38 (PR-UX-14, 2026-05-09): rotation now ALSO fires
  // for the rightmost lane of EVERY day, not just every lane of
  // the last day. Mid-day rightmost lanes (e.g. Mon Trey, Tue
  // Trey, Wed Trey in a 4×3 grid) previously fell through to the
  // `xStep: -1` corner-peek branch, which rendered the shadow one
  // lane LEFT of the finger and committed the drop to that LEFT
  // lane via `dropShiftX = laneWidth` in pan-onEnd — the rightmost
  // sub-column was structurally unreachable as a drop target
  // (PR-UX-13 smoke).
  //
  // FORK Phase 39 (PR-UX-14, 2026-05-09): ROTATION-EVERYWHERE in
  // multi-day mode. Phase 38's "rotation only at the rightmost
  // lane of each day" left a NEW dead zone at the lane immediately
  // LEFT of the rotation lane (e.g. Shaun = lane 4 in a 4×6 grid):
  //   - point at lane 5 (Trey) → rotation → drop lane 5 ✓
  //   - point at lane 4 (Shaun) → corner-peek → xStep=-1 →
  //     dropShiftX = laneWidth → drop lane 3 (Dan) ✗ Shaun gap
  //   - point at lane 3 (Dan) → corner-peek → drop lane 2 (Todd)
  //     ✓ Dan reachable via lane 4 BUT Shaun has no inbound finger
  // The mapping `lane N → drop N-1` (corner-peek) plus `lane
  // techCount-1 → drop techCount-1` (rotation) systematically
  // skips lane techCount-2 — there's NO finger position whose
  // drop lands in Shaun. User reported this as the blue column
  // "1 to the left of the right-most subcolumn" being a dead
  // zone (PR-UX-14 follow-up smoke).
  //
  // Phase 39's fix: in multi-day mode, ALL lanes use rotation —
  // shadow stays in finger's own lane (xStep=0), shifted up by
  // H/2 above the card so the floating card doesn't occlude it.
  // Drop lands wherever the finger is. Every lane is reachable
  // by exactly one finger position, no gaps. Single-day mode
  // (columnCount === 1) keeps Phase 32's flat-clamp /
  // corner-peek behavior unchanged because the day-boundary
  // failure mode that motivated rotation doesn't exist there.
  //
  // Trade-off: the corner-peek "shadow up-and-LEFT of the card"
  // visual is removed for mid-canvas multi-day. The user
  // previously approved the rotation visual ("shadow shifts to
  // a different position in the right column so it fits in all
  // the sub columns ... up above it half way" — Phase 35.1
  // commit message) and explicitly preferred reachability over
  // visual-position fidelity in this follow-up. The rotation
  // visual was already in use for the rightmost lane of every
  // day after Phase 38, so extending it to remaining lanes is a
  // small visual delta.
  //
  // PLAN-DEVIATION: 2026-05-07-x-edge-drop-clamp — Phase 39
  // closes this deviation entirely; there are no remaining
  // unreachable-lane caveats in multi-day mode.
  var halfHeight = (typeof eventHeight === "number" && eventHeight > 0) ? eventHeight / 2 : 0;
  if (columnCount > 1) {
    return { xStep: 0, yPx: -halfHeight };
  }
  // Single-day mode (columnCount === 1) keeps the original
  // corner-peek + cross-day-clamp + rightmost-flat-clamp logic
  // because there's only one column so cross-day cells don't
  // exist; the corner-peek visual offset is the only "shadow
  // not occluded by floating card" mechanism here.
  if (laneIndex === 0) return { xStep: 0, yPx: 0 };
  var absoluteLane = colIndex * techCount + laneIndex;
  var totalLanes = techCount * columnCount;
  if (absoluteLane >= totalLanes - 1) return { xStep: 0, yPx: 0 };
  return { xStep: -1, yPx: 0 };
};
var resolveLaneDropPosition = ({
  panXAbs,
  eventStartedTop,
  eventHeight,
  scrollX,
  scrollY,
  timeLabelWidth,
  bodyBlockWidth,
  techCount,
  columnCount,
  // FORK Phase 32 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY, 2026-05-07):
  // animated discrete-step shadow offset. -1 = ghost one full lane
  // to the LEFT of finger (mid-canvas). 0 = ghost in finger's own
  // lane (edge convergence). The SV transitions between these two
  // values via withTiming(150ms), driven by useAnimatedReaction in
  // CalendarInner. During the transition the value is fractional —
  // the visual `ghostShiftX` slides smoothly while the discrete
  // ghost lane index is determined by the rounded value (so tint
  // and drop targeting use the FINAL discrete lane).
  //
  // Default `0` (= ghost in finger's lane, no offset) so callers
  // that don't pass the SV (tests, snap-in path) get the safest
  // fallback.
  shadowOffsetXSteps = 0
}) => {
  "worklet";
  if (techCount < 2 || bodyBlockWidth <= 0 || columnCount < 1) {
    return null;
  }
  var laneWidth = bodyBlockWidth / techCount;
  var rawColIndex = Math.floor((panXAbs - timeLabelWidth) / bodyBlockWidth);
  var colIndex = rawColIndex < 0 ? 0 : rawColIndex > columnCount - 1 ? columnCount - 1 : rawColIndex;
  var xWithinColumn = panXAbs - timeLabelWidth - colIndex * bodyBlockWidth;
  var rawLaneIndex = Math.floor(xWithinColumn / laneWidth);
  var laneIndex = rawLaneIndex < 0 ? 0 : rawLaneIndex > techCount - 1 ? techCount - 1 : rawLaneIndex;
  var translateX = timeLabelWidth + colIndex * bodyBlockWidth + laneIndex * laneWidth - scrollX;
  var translateY = eventStartedTop - scrollY;
  // FORK Phase 32: ghostShiftX is now derived from the animated
  // shadowOffsetXSteps SV. Mid-canvas the SV settles at -1 → ghost
  // sits exactly one laneWidth to the LEFT of the finger's lane
  // (Phase 27.1 invariant restored). Near edges the SV animates to
  // 0 → ghost sits in finger's lane. The SV transition is animated,
  // so the ghost visually slides between the two discrete states —
  // the same primitive used by the existing release snap-in slide.
  var ghostShiftX = shadowOffsetXSteps * laneWidth;
  // Discrete ghost lane index: round the SV so the tint and drop
  // targeting always reference a SINGLE lane, even mid-animation.
  // Round to nearest integer so the visual midpoint coincides with
  // the lane swap.
  var stepRounded = Math.round(shadowOffsetXSteps);
  if (stepRounded < -1) stepRounded = -1;
  if (stepRounded > 0) stepRounded = 0;
  var totalLanes = techCount * columnCount;
  var absoluteFingerLane = colIndex * techCount + laneIndex;
  var absoluteGhostLane = absoluteFingerLane + stepRounded;
  if (absoluteGhostLane < 0) absoluteGhostLane = 0;
  if (absoluteGhostLane > totalLanes - 1) absoluteGhostLane = totalLanes - 1;
  var ghostColIndex = Math.floor(absoluteGhostLane / techCount);
  var ghostLaneIndex = absoluteGhostLane - ghostColIndex * techCount;
  return {
    colIndex,
    laneIndex,
    translateX,
    translateY,
    width: laneWidth,
    height: eventHeight,
    ghostShiftX,
    ghostColIndex,
    ghostLaneIndex
  };
};
var Col = ({ children, divider, space, style }) => {
  return /* @__PURE__ */ React19__namespace.default.createElement(reactNative.View, { style: [{ flexDirection: "column" }, style] }, React19__namespace.default.Children.toArray(children).map((child, index) => /* @__PURE__ */ React19__namespace.default.createElement(React19__namespace.default.Fragment, { key: index }, child, index !== React19__namespace.default.Children.toArray(children).length - 1 && divider, index !== React19__namespace.default.Children.toArray(children).length - 1 && /* @__PURE__ */ React19__namespace.default.createElement(reactNative.View, { style: { height: space, width: "100%" } }))));
};
var Col_default = Col;

// src/theme/resolveFont.ts
var WEIGHT_NAME_MAP = {
  "100": "Thin",
  "200": "ExtraLight",
  "300": "Light",
  "400": "Regular",
  "500": "Medium",
  "600": "SemiBold",
  "700": "Bold",
  "800": "ExtraBold",
  "900": "Black"
};
function resolveFont({ family = "System", weight = "400", italic = false }) {
  if (family === "System" || family.includes("_")) return family;
  const weightName = WEIGHT_NAME_MAP[weight] ?? "Regular";
  const base = `${family}_${weight}${weightName}`;
  return italic ? `${base}_Italic` : base;
}

// src/theme/ThemeContext.tsx
var defaultTheme = {
  typography: {
    fontFamily: "System"
  }
};
var ThemeCtx = React19.createContext(defaultTheme);
var useCalendarTheme = () => React19.useContext(ThemeCtx);
var useResolvedFont = (overrides) => {
  const { typography } = useCalendarTheme();
  const family = overrides?.fontFamily ?? typography?.fontFamily ?? "System";
  const weight = overrides?.fontWeight ?? "400";
  const italic = overrides?.italic ?? false;
  return resolveFont({ family, weight, italic });
};
var CalendarThemeProvider = ({ theme, children }) => {
  const mergedTheme = {
    ...defaultTheme,
    ...theme,
    typography: { ...defaultTheme.typography, ...theme?.typography }
  };
  return /* @__PURE__ */ React19__namespace.default.createElement(ThemeCtx.Provider, { value: mergedTheme }, children);
};

// src/components/TimeLabels.tsx
var TimeLabels = React19__namespace.forwardRef(({
  timezone,
  hourHeight = 120,
  startMinutes = 0,
  endMinutes = 1440,
  totalTimelineWidth,
  date,
  layout,
  // FORK Phase 28.2-logging — optional calendar identifier so the
  // [CAL:nowLine] log can be attributed to the emitting calendar
  // (DAY-PORTRAIT vs WEEK-PORTRAIT vs WORKWEEK-LANDSCAPE) without
  // grepping the surrounding render context. Falls back to the
  // un-tagged `[CAL:nowLine]` form when undefined.
  calendarId
}, ref) => {
  const isToday = dateFns.isSameDay(/* @__PURE__ */ new Date(), date);
  const sHour = Math.floor(startMinutes / 60);
  const eHour = Math.ceil(endMinutes / 60);
  const dHours = eHour - sHour;
  const mOffset = sHour * 60;
  const [currentTimeYPosition, setCurrentTimeYPosition] = React19.useState(timeToYPosition(getCurrentTimeInMinutes(timezone) - mOffset, hourHeight));
  const [currentTime, setCurrentTime] = React19.useState(dateFns.format(dateFnsTz.toZonedTime(/* @__PURE__ */ new Date(), timezone), "h:mm"));
  const APPOINTMENT_BLOCK_HEIGHT = hourHeight / 4;
  const lastLoggedYRef = React19.useRef(0);
  const updateCurrentTimeYPosition = () => {
    const mins = getCurrentTimeInMinutes(timezone);
    const yPos = timeToYPosition(mins - mOffset, hourHeight);
    const rounded = Math.round(yPos);
    if (rounded !== lastLoggedYRef.current) {
      // FORK Phase 28.2-logging — prefix with calendarId when set so a
      // multi-calendar app can attribute the now-line tick to the
      // emitting calendar.
      if (__DEV__) {
        const tag = calendarId ? `[CAL:${calendarId}:nowLine]` : "[CAL:nowLine]";
        console.log(tag, { minutes: mins, yPos: rounded, hourHeight, contentH: dHours * hourHeight, mOffset });
      }
      lastLoggedYRef.current = rounded;
    }
    setCurrentTimeYPosition(yPos);
  };
  const updateCurrentTime = () => {
    setCurrentTime(dateFns.format(dateFnsTz.toZonedTime(/* @__PURE__ */ new Date(), timezone), "h:mm"));
  };
  const titleFace = useResolvedFont({ fontWeight: "700" });
  React19.useEffect(() => {
    const update = () => {
      updateCurrentTime();
      updateCurrentTimeYPosition();
    };
    update();
    const intervalId = setInterval(update, 300);
    return () => clearInterval(intervalId);
  }, [timezone, hourHeight]);
  const lastScrolledDateRef = React19.useRef(null);
  React19.useEffect(() => {
    if (!layout) return;
    const dateKey = date.getTime();
    if (lastScrolledDateRef.current === dateKey) return;
    reactNative.InteractionManager.runAfterInteractions(() => {
      let pos = isToday ? currentTimeYPosition - 240 : timeToYPosition(startMinutes - mOffset, hourHeight);
      if (ref.current) {
        ref.current.scrollTo({
          y: Math.round(pos / APPOINTMENT_BLOCK_HEIGHT) * APPOINTMENT_BLOCK_HEIGHT,
          animated: true
        });
        lastScrolledDateRef.current = dateKey;
      }
    });
  }, [layout, date, isToday, APPOINTMENT_BLOCK_HEIGHT, startMinutes, hourHeight, currentTimeYPosition]);
  return /* @__PURE__ */ React19__namespace.createElement(React19__namespace.Fragment, null, /* @__PURE__ */ React19__namespace.createElement(Col_default, null, Array.from({ length: dHours }).map((_, index) => /* @__PURE__ */ React19__namespace.createElement(reactNative.View, { key: index, style: [styles.timeLabel, { height: hourHeight }] }, /* @__PURE__ */ React19__namespace.createElement(
    reactNative.Text,
    {
      allowFontScaling: false,
      style: {
        textAlign: "center",
        fontFamily: titleFace,
        fontSize: getTextSize(hourHeight),
        fontWeight: "700"
      }
    },
    indexToDate(sHour + index).split(" ")[0]
  ), /* @__PURE__ */ React19__namespace.createElement(
    reactNative.Text,
    {
      allowFontScaling: false,
      style: {
        textAlign: "center",
        fontFamily: titleFace,
        fontSize: getTextSize(hourHeight),
        fontWeight: "700"
      }
    },
    indexToDate(sHour + index).split(" ")[1]
  ))), isToday && currentTimeYPosition >= 0 && currentTimeYPosition <= dHours * hourHeight && /* @__PURE__ */ React19__namespace.createElement(reactNative.View, { style: [styles.currentTime, {
    top: currentTimeYPosition - 13,
    width: TIME_LABEL_WIDTH
  }] }, /* @__PURE__ */ React19__namespace.createElement(
    reactNative.Text,
    {
      allowFontScaling: false,
      style: {
        textAlign: "center",
        fontFamily: titleFace,
        fontWeight: "700",
        fontSize: getTextSize(hourHeight),
        color: "red"
      }
    },
    currentTime
  ))), isToday && currentTimeYPosition >= 0 && currentTimeYPosition <= dHours * hourHeight && /* @__PURE__ */ React19__namespace.createElement(reactNative.View, { style: [styles.currentTimeLine, {
    pointerEvents: "none",
    top: currentTimeYPosition,
    width: totalTimelineWidth,
    left: TIME_LABEL_WIDTH
  }] }));
});
var styles = reactNative.StyleSheet.create({
  timeLabel: {
    width: TIME_LABEL_WIDTH
  },
  currentTimeLine: {
    position: "absolute",
    height: 2,
    // Thickness of the line
    backgroundColor: "red",
    zIndex: 1e4
    // Ensure it's on top of all other elements
  },
  currentTime: {
    backgroundColor: "#fff",
    borderColor: "red",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderRadius: 20,
    height: 26,
    position: "absolute",
    zIndex: 1e4
    // Ensure it's on top of all other elements
  }
});
var Hidden = ({ isHidden, children }) => {
  if (isHidden) {
    return null;
  }
  return /* @__PURE__ */ React19__namespace.default.createElement(React19__namespace.default.Fragment, null, children);
};
var Hidden_default = Hidden;
var Center = ({ children, style }) => {
  return /* @__PURE__ */ React19__namespace.default.createElement(
    reactNative.View,
    {
      style: [{
        justifyContent: "center",
        alignItems: "center"
      }, style]
    },
    children
  );
};
var Center_default = Center;
var Badge = ({
  style,
  value = "",
  children,
  fontSize,
  color = "red",
  textColor = "white"
}) => {
  const titleFace = useResolvedFont({ fontWeight: "600" });
  return /* @__PURE__ */ React19__namespace.default.createElement(reactNative.View, { style: [styles2.badge, { backgroundColor: color }, style] }, children ? children : /* @__PURE__ */ React19__namespace.default.createElement(
    reactNative.Text,
    {
      allowFontScaling: false,
      style: {
        color: textColor,
        fontSize,
        fontFamily: titleFace,
        fontWeight: "600"
      }
    },
    value
  ));
};
var styles2 = reactNative.StyleSheet.create({
  badge: {
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 6
  }
});
var Badge_default = Badge;
// BUG-A diagnostic (P2-FE-4 follow-up #15, 2026-04-20): tag every
// store with a unique numeric id so we can correlate every write
// (setDayDataFor) and every non-empty read (useEventsFor) to a
// specific store instance. If we see writes hitting one storeId
// while reads hit a different one, we have a phantom-Provider issue.
// If both share the same id but reads still see leaked data after a
// clearing write, we have a stale-cell / FlashList-recycle issue.
// Remove once Bug A is fixed.
var __BUG_A_STORE_COUNTER__ = 0;
var createCalendarStore = () => {
  const __storeId__ = ++__BUG_A_STORE_COUNTER__;
  const store = zustand.createStore((set2) => ({
    __storeId__,
    date: /* @__PURE__ */ new Date(),
    resourcesById: {},
    eventsByDay: {},
    disabledBlocksByDay: {},
    disabledIntervalsByDay: {},
    selectedEvent: null,
    draggedEventDraft: null,
    setSelectedEvent: (evt) => set2({ selectedEvent: evt }),
    setDate: (date) => set2({ date }),
    upsertResources: (rs) => set2((s) => {
      const next = { ...s.resourcesById };
      let changed = false;
      for (const r of rs) {
        const prev = next[r.id];
        if (!prev || prev.name !== r.name || prev.avatar !== r.avatar) {
          next[r.id] = { id: r.id, name: r.name, avatar: r.avatar };
          changed = true;
        }
      }
      return changed ? { resourcesById: next } : {};
    }),
    setDayDataFor: (dayKey, { events, disabledBlocks, disableIntervals }) => set2((s) => {
      // FORK Phase 28.3 — gated; default off. See top-of-file
      // comment on `__VERBOSE_CAL_LOGS__`.
      if (__VERBOSE_CAL_LOGS__) {
        const eventsTechCount = events ? Object.keys(events).length : -1;
        const eventsTotal = events ? Object.values(events).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0) : -1;
        console.log("[BUG-A:Write]", {
          storeId: __storeId__,
          dayKey,
          eventsTechCount,
          eventsTotal,
          prevTechCountForDay: s.eventsByDay?.[dayKey] ? Object.keys(s.eventsByDay[dayKey]).length : 0,
        });
      }
      return {
        eventsByDay: events ? { ...s.eventsByDay, [dayKey]: events } : s.eventsByDay,
        disabledBlocksByDay: disabledBlocks ? { ...s.disabledBlocksByDay, [dayKey]: disabledBlocks } : s.disabledBlocksByDay,
        disabledIntervalsByDay: disableIntervals ? { ...s.disabledIntervalsByDay, [dayKey]: disableIntervals } : s.disabledIntervalsByDay
      };
    }),
    setDraggedEventDraft: (draft) => set2({ draggedEventDraft: draft })
  }));
  if (__VERBOSE_CAL_LOGS__) console.log("[BUG-A:StoreCreate]", { storeId: __storeId__ });
  return store;
};
var StoreContext = React19.createContext(null);
var __BUG_A_PROVIDER_COUNTER__ = 0;
var Provider = ({ children }) => {
  const ref = React19.useRef(void 0);
  const providerIdRef = React19.useRef(0);
  if (!ref.current) {
    ref.current = createCalendarStore();
    providerIdRef.current = ++__BUG_A_PROVIDER_COUNTER__;
  }
  // BUG-A diagnostic: log every Provider render so we know which
  // Provider instance is wrapping which subtree. If we see two
  // different providerIds rendering simultaneously while the user is
  // in landscape, we have overlapping Providers and the leak is on
  // the parent side. FORK Phase 28.3 — gated.
  if (__VERBOSE_CAL_LOGS__) {
    console.log("[BUG-A:ProviderRender]", {
      providerId: providerIdRef.current,
      storeId: ref.current.getState().__storeId__,
    });
  }
  React19.useEffect(() => {
    if (!__VERBOSE_CAL_LOGS__) return;
    const pid = providerIdRef.current;
    const sid = ref.current?.getState?.().__storeId__;
    console.log("[BUG-A:ProviderMount]", { providerId: pid, storeId: sid });
    return () => {
      console.log("[BUG-A:ProviderUnmount]", { providerId: pid, storeId: sid });
    };
  }, []);
  return /* @__PURE__ */ React19__namespace.default.createElement(StoreContext.Provider, { value: ref.current }, children);
};
var useBound = (selector, eq) => {
  const store = React19.useContext(StoreContext);
  if (!store) throw new Error("Calendar store used outside of Provider");
  return traditional.useStoreWithEqualityFn(store, selector, eq);
};
var useResourceById = (id) => useBound((s) => s.resourcesById[id]);
var useGetSelectedEvent = () => useBound((s) => s.selectedEvent);
var useSetSelectedEvent = () => useBound((s) => s.setSelectedEvent);
var useEventsFor = (resourceId, dayDate) => {
  const store = React19.useContext(StoreContext);
  const events = useBound((s) => {
    const key = dateFns.format(dayDate, "yyyy-MM-dd");
    return s.eventsByDay?.[key]?.[resourceId] ?? [];
  }, shallow.shallow);
  // BUG-A diagnostic (P2-FE-4 follow-up #15, 2026-04-20): every cell
  // calls this hook to pull its events. If the StoreFeeder has cleared
  // a day-key but a cell still receives events for it, this log shows
  // exactly which (storeId, dayKey, resourceId) triple is leaking and
  // how many events. We sample only non-empty reads so the log isn't
  // flooded by the 36+ empty cells in a normal landscape render.
  // FORK Phase 28.3 — gated; this site fires once per visible
  // resource per render, so the cumulative volume is the largest of
  // the BUG-A family on a busy day.
  if (__VERBOSE_CAL_LOGS__ && events.length > 0) {
    const storeId = store?.getState?.().__storeId__;
    const key = dateFns.format(dayDate, "yyyy-MM-dd");
    console.log("[BUG-A:Read]", {
      storeId,
      dayKey: key,
      resourceId,
      eventCount: events.length,
      eventIds: events.slice(0, 3).map((e) => e.id),
    });
  }
  return events;
};
var useGetDraggedEventDraft = () => useBound((s) => s.draggedEventDraft);
var useDisabledBlocksFor = (resourceId, dayDate) => useBound((s) => {
  const key = dateFns.format(dayDate, "yyyy-MM-dd");
  return s.disabledBlocksByDay?.[key]?.[resourceId] ?? [];
}, shallow.shallow);
var useDisabledIntervalsFor = (resourceId, dayDate) => useBound((s) => {
  const key = dateFns.format(dayDate, "yyyy-MM-dd");
  return s.disabledIntervalsByDay?.[key]?.[resourceId] ?? [];
}, shallow.shallow);
var useUpsertResources = () => useBound((s) => s.upsertResources);
var useSetDayDataFor = () => useBound((s) => s.setDayDataFor);
var useSetDraggedEventDraft = () => useBound((s) => s.setDraggedEventDraft);
var useSetDate = () => useBound((s) => s.setDate);
var useGetDate = () => useBound((s) => s.date);
var zustandBinding = {
  Provider,
  useResourceById,
  useEventsFor,
  useDisabledBlocksFor,
  useDisabledIntervalsFor,
  useUpsertResources,
  useSetDate,
  useGetDate,
  useSetDayDataFor,
  useGetSelectedEvent,
  useSetSelectedEvent,
  useGetDraggedEventDraft,
  useSetDraggedEventDraft
};

// src/store/bindings/BindingProvider.tsx
var BindingCtx = React19.createContext(null);
var useCalendarBinding = () => {
  const ctx = React19.useContext(BindingCtx);
  if (!ctx) throw new Error("useCalendarBinding must be used within <CalendarBindingProvider>");
  return ctx;
};
// FORK Phase 18 (P2-FE-6 chunk a): expose live drag centroid +
// isDragging shared values to sibling consumers (drag-to-avatar
// overlay) so they can subscribe via useAnimatedReaction without
// prop-drilling them through every Calendar render layer. Master
// plan §5.1.7 specifies the avatar-strip drag-to-tech handler reads
// these per frame to compute "is the dragged centroid inside any
// avatar bounding box?" The SVs are created at the
// CalendarBindingProvider level (one calendar instance per provider)
// so both <Calendar> (writer) and any sibling overlay (reader) see
// the same SV instances. See README-FORK Phase 18.
//
// FORK Phase 19 (P2-FE-6 chunk b): added `fingerXAbs` / `fingerYAbs`
// to track the *raw finger position in window coordinates* during a
// drag. Phase 18's `panXAbs` / `panYAbs` represent the dragged card's
// CENTER in calendar-viewport-local space and are HARD-CLAMPED to
// the inside of the grid (see lines ~2482-2492) so the card visual
// stays anchored to a valid column. That clamp prevents drag-to-
// avatar from working: the finger can leave the grid (gesture has
// `.shouldCancelWhenOutside(false)`) but our hit-test only saw the
// clamped centroid, so the highlight ring never fired on an avatar.
// `fingerXAbs` / `fingerYAbs` mirror `evt.absoluteX` / `evt.absoluteY`
// from the pan worklet — raw screen-window coordinates of the
// finger, no clamp, no scroll correction. Compare directly against
// `View.measureInWindow` bboxes. See README-FORK Phase 19.
var DragSharedValuesCtx = React19.createContext(null);
var useDragSharedValues = () => {
  const ctx = React19.useContext(DragSharedValuesCtx);
  if (!ctx) throw new Error("useDragSharedValues must be used within <CalendarBindingProvider>");
  return ctx;
};
var CalendarBindingProvider = ({ binding, children }) => {
  const active = binding ?? zustandBinding;
  const StoreProvider = active.Provider;
  // FORK Phase 18 (P2-FE-6 chunk a): create the three drag SVs once
  // per provider mount. useSharedValue is hook-stable across renders
  // (semantically a useRef wrapper around a Reanimated value), so the
  // .value references survive every CalendarBindingProvider re-render.
  // useMemo keeps the wrapper object reference identity stable too,
  // which matters for any consumer that puts the wrapper into a
  // useEffect/useCallback dep array.
  const panXAbs = Animated2.useSharedValue(0);
  const panYAbs = Animated2.useSharedValue(0);
  const isDragging = Animated2.useSharedValue(false);
  // FORK Phase 19 (P2-FE-6 chunk b): raw finger window coordinates.
  // Initialised to NaN so consumers can distinguish "no drag yet /
  // no value written" from "finger at (0,0) which is the top-left of
  // the screen." NaN also makes any accidental hit-test math return
  // false instead of "everything matches the top-left avatar."
  const fingerXAbs = Animated2.useSharedValue(Number.NaN);
  const fingerYAbs = Animated2.useSharedValue(Number.NaN);
  // FORK Phase 20 (P3-FE-DRAG-GHOST chunk a): pickup-time width of the
  // dragged card. Captured at drag-init in `internalOnDoubleTap.current`
  // and read by DraggableEvent's animated styles. Decouples the floating
  // card's visual width from the live `BODY_BLOCK_WIDTH` prop so the
  // card no longer shrinks/grows mid-drag when the visible tech roster
  // changes (e.g. dwell-driven swap that adds/removes a column → fewer
  // columns → wider per-column → wider card; or vice-versa). 0 means
  // "no pickup captured, use the existing prop fallback." Cleared back
  // to 0 on `onEnd` so subsequent picks re-capture cleanly. See
  // README-FORK Phase 20.
  const dragCardPickupWidth = Animated2.useSharedValue(0);
  const dragSVs = React19.useMemo(
    () => ({ panXAbs, panYAbs, isDragging, fingerXAbs, fingerYAbs, dragCardPickupWidth }),
    [panXAbs, panYAbs, isDragging, fingerXAbs, fingerYAbs, dragCardPickupWidth]
  );
  return /* @__PURE__ */ React19__namespace.default.createElement(
    BindingCtx.Provider,
    { value: active },
    /* @__PURE__ */ React19__namespace.default.createElement(
      StoreProvider,
      null,
      /* @__PURE__ */ React19__namespace.default.createElement(
        DragSharedValuesCtx.Provider,
        { value: dragSVs },
        children
      )
    )
  );
};

// src/components/ResourcesComponent.tsx
// FORK: ResourceComponent + ResourcesComponent are forked from upstream
// to support:
//   - multi-select dim/select state (selectedResourceIds, isSelected/isFiltered)
//   - double-tap on the avatar (onResourceDoublePress)
//   - hold-to-pop drag-to-reorder (onResourceReorder)
//
// Gesture composition per avatar:
//   - Tap (1)        → onResourcePress    (single-tap toggle)
//   - Tap (2)        → onResourceDoublePress (focus / Workweek)
//   - LongPress (300ms) + Pan → drag-to-reorder
//
// All composed with Gesture.Race so whichever activates first wins.
// When the LongPress fires, the avatar "pops" (scale + shadow + haptic)
// and the Pan starts tracking. Other avatars shift left/right via shared
// values. On release, ResourcesComponent computes the new id order and
// calls onResourceReorder(newOrderedIds).
//
// IMPORTANT: the inner TouchableOpacity in StaffAvatar is left disabled
// (onPress unset) so gesture-handler owns the gesture surface.

var ResourceComponent = ({
  id,
  index,
  count,
  onResourcePress,
  onResourceDoublePress,
  onReorderEnd,
  isSelected,
  isFiltered,
  isReorderEnabled,
  hideName,
  dragIndex,
  dragX,
  APPOINTMENT_BLOCK_WIDTH,
  date
}) => {
  const { useResourceById: useResourceById2, useEventsFor: useEventsFor2 } = useCalendarBinding();
  const resource = useResourceById2(id);
  const events = useEventsFor2(id, date);
  const titleFace = useResolvedFont({ fontWeight: "700" });
  const dim = isFiltered && !isSelected;
  const isPressing = Animated2.useSharedValue(false);
  const fireSinglePress = React19.useCallback(() => {
    if (onResourcePress && resource) onResourcePress(resource);
  }, [onResourcePress, resource]);
  const fireDoublePress = React19.useCallback(() => {
    if (onResourceDoublePress && resource) onResourceDoublePress(resource);
  }, [onResourceDoublePress, resource]);
  const fireReorderEnd = React19.useCallback(
    (fromIndex, toIndex) => {
      if (onReorderEnd) onReorderEnd(fromIndex, toIndex);
    },
    [onReorderEnd]
  );
  const composedGesture = React19.useMemo(() => {
    const single = reactNativeGestureHandler.Gesture.Tap()
      .numberOfTaps(1)
      .maxDuration(250)
      .onEnd(() => {
        "worklet";
        reactNativeWorklets.scheduleOnRN(fireSinglePress);
      });
    const double = reactNativeGestureHandler.Gesture.Tap()
      .numberOfTaps(2)
      .maxDelay(250)
      .onEnd(() => {
        "worklet";
        reactNativeWorklets.scheduleOnRN(fireDoublePress);
      });
    if (!isReorderEnabled) {
      return reactNativeGestureHandler.Gesture.Exclusive(double, single);
    }
    const longPress = reactNativeGestureHandler.Gesture.LongPress()
      .minDuration(300)
      .onStart(() => {
        "worklet";
        isPressing.value = true;
        dragIndex.value = index;
        dragX.value = 0;
      })
      .onFinalize(() => {
        "worklet";
        isPressing.value = false;
      });
    const pan = reactNativeGestureHandler.Gesture.Pan()
      .manualActivation(true)
      .onTouchesMove((_e, state) => {
        "worklet";
        if (isPressing.value) state.activate();
      })
      .onUpdate((e) => {
        "worklet";
        if (dragIndex.value !== index) return;
        dragX.value = e.translationX;
      })
      .onEnd(() => {
        "worklet";
        if (dragIndex.value !== index) return;
        const targetRaw = index + dragX.value / APPOINTMENT_BLOCK_WIDTH;
        const target = Math.max(0, Math.min(count - 1, Math.round(targetRaw)));
        const fromIdx = index;
        if (target !== fromIdx) {
          reactNativeWorklets.scheduleOnRN(fireReorderEnd, fromIdx, target);
        }
        dragX.value = Animated2.withTiming(0, { duration: 180 });
        dragIndex.value = -1;
      })
      .onFinalize(() => {
        "worklet";
        isPressing.value = false;
        if (dragIndex.value === index) {
          dragIndex.value = -1;
          dragX.value = Animated2.withTiming(0, { duration: 180 });
        }
      });
    const dragSet = reactNativeGestureHandler.Gesture.Simultaneous(longPress, pan);
    return reactNativeGestureHandler.Gesture.Race(dragSet, double, single);
  }, [fireSinglePress, fireDoublePress, fireReorderEnd, isReorderEnabled, index, count, APPOINTMENT_BLOCK_WIDTH, dragIndex, dragX, isPressing]);
  const animStyle = Animated2.useAnimatedStyle(() => {
    if (!isReorderEnabled || !dragIndex || dragIndex.value === -1) {
      return { transform: [{ translateX: 0 }, { scale: 1 }] };
    }
    if (dragIndex.value === index) {
      return {
        transform: [
          { translateX: dragX.value },
          { scale: 1.12 }
        ],
        zIndex: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 8
      };
    }
    const targetRaw = dragIndex.value + dragX.value / APPOINTMENT_BLOCK_WIDTH;
    let shift = 0;
    if (dragIndex.value < index && index <= targetRaw) {
      shift = -APPOINTMENT_BLOCK_WIDTH;
    } else if (targetRaw <= index && index < dragIndex.value) {
      shift = APPOINTMENT_BLOCK_WIDTH;
    }
    return { transform: [{ translateX: Animated2.withTiming(shift, { duration: 160 }) }, { scale: 1 }] };
  }, [APPOINTMENT_BLOCK_WIDTH, index, isReorderEnabled]);
  const inner = /* @__PURE__ */ React19__namespace.createElement(Animated2__default.default.View, {
    layout: Animated2.LinearTransition.duration(220),
    style: [{
      alignItems: "center",
      width: APPOINTMENT_BLOCK_WIDTH,
      opacity: dim ? 0.4 : 1
    }, animStyle]
  }, /* @__PURE__ */ React19__namespace.createElement(
    reactNativeGestureHandler.GestureDetector,
    { gesture: composedGesture },
    /* @__PURE__ */ React19__namespace.createElement(reactNative.View, { style: { position: "relative" } }, /* @__PURE__ */ React19__namespace.createElement(
      StaffAvatar,
      {
        name: resource?.name,
        circleSize: Math.min(40, APPOINTMENT_BLOCK_WIDTH - 12),
        fontSize: 16,
        badge: events?.length,
        image: resource?.avatar,
        ringColor: isFiltered && isSelected ? "#3B82F6" : "#DAEEE7"
      }
    ))
  ), hideName ? null : /* @__PURE__ */ React19__namespace.createElement(
    reactNative.Text,
    {
      style: {
        fontSize: 14,
        fontFamily: titleFace,
        fontWeight: "700"
      },
      numberOfLines: 1,
      allowFontScaling: false
    },
    resource?.name
  ));
  return inner;
};
var ResourcesComponent = ({
  resourceIds,
  selectedResourceIds,
  onResourcePress,
  onResourceDoublePress,
  onResourceReorder,
  slotWidth,
  hideName,
  date
}) => {
  // FORK: ResourcesComponent now renders a single uniform-width row of
  // avatars from whatever `resourceIds` list it's given. The parent
  // (CalendarInner) splits the full tech list into a "queue" (dimmed,
  // unselected) row and a "main" (selected, body-column-width) row and
  // mounts ONE ResourcesComponent for each. ResourcesComponent stays
  // dumb: it just iterates `resourceIds` and applies per-avatar styling
  // based on `selectedResourceIds`. `isFiltered` still drives the
  // dim/blue-ring decision per id.
  const isFiltered = !!(selectedResourceIds && selectedResourceIds.length > 0);
  // FORK: drag-to-reorder shared state. dragIndex tracks which avatar is
  // currently being dragged (-1 = none); dragX is its horizontal pan
  // delta. Both are shared values so worklets and animated styles can
  // read them without React re-renders.
  const dragIndex = Animated2.useSharedValue(-1);
  const dragX = Animated2.useSharedValue(0);
  const isReorderEnabled = !!onResourceReorder && (resourceIds?.length ?? 0) > 1;
  const handleReorderEnd = React19.useCallback(
    (fromIndex, toIndex) => {
      if (!onResourceReorder || !resourceIds) return;
      if (fromIndex === toIndex) return;
      const next = resourceIds.slice();
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      onResourceReorder(next);
    },
    [onResourceReorder, resourceIds]
  );
  return /* @__PURE__ */ React19__namespace.createElement(React19__namespace.Fragment, null, resourceIds?.map((id, idx) => {
    const isSelected = isFiltered ? selectedResourceIds.includes(id) : true;
    return /* @__PURE__ */ React19__namespace.createElement(
      ResourceComponent,
      {
        date,
        key: id,
        id,
        index: idx,
        count: resourceIds.length,
        APPOINTMENT_BLOCK_WIDTH: slotWidth,
        onResourcePress,
        onResourceDoublePress,
        onReorderEnd: handleReorderEnd,
        isSelected,
        isFiltered,
        isReorderEnabled,
        hideName,
        dragIndex,
        dragX
      }
    );
  }));
};
function StaffAvatar({
  name,
  circleSize = 60,
  fontSize = 36,
  image,
  badge,
  badgeStyle,
  onPress,
  containerStyle,
  ringColor = "#DAEEE7",
  avatarColor,
  textColor
}) {
  const titleFace = useResolvedFont({ fontWeight: "700" });
  return /* @__PURE__ */ React19__namespace.createElement(
    reactNative.TouchableOpacity,
    {
      disabled: lodash.isUndefined(onPress),
      onPress,
      style: containerStyle
    },
    /* @__PURE__ */ React19__namespace.createElement(Center_default, { style: {
      borderRadius: 9999,
      backgroundColor: ringColor
    } }, /* @__PURE__ */ React19__namespace.createElement(Hidden_default, { isHidden: lodash.isUndefined(badge) || Number(badge) == 0 }, /* @__PURE__ */ React19__namespace.createElement(
      reactNative.View,
      {
        style: [{
          zIndex: 1,
          position: "absolute",
          right: -4,
          top: -6,
          borderRadius: 999,
          backgroundColor: "#fff",
          padding: 2
        }, badgeStyle]
      },
      /* @__PURE__ */ React19__namespace.createElement(
        Badge_default,
        {
          fontSize: 12,
          value: badge + "",
          color: "#4d959c"
        }
      )
    )), /* @__PURE__ */ React19__namespace.createElement(Center_default, { style: {
      margin: 2,
      borderRadius: 9999,
      backgroundColor: "white"
    } }, /* @__PURE__ */ React19__namespace.createElement(Center_default, { style: {
      margin: 2,
      borderRadius: 9999,
      height: circleSize,
      width: circleSize,
      backgroundColor: avatarColor || "#C9E5E8",
      overflow: "hidden"
    } }, image ? /* @__PURE__ */ React19__namespace.createElement(
      reactNative.Image,
      {
        resizeMode: "cover",
        source: { uri: image },
        style: {
          height: "100%",
          borderRadius: 6,
          ...reactNative.StyleSheet.absoluteFillObject
        }
      }
    ) : /* @__PURE__ */ React19__namespace.createElement(
      reactNative.Text,
      {
        allowFontScaling: false,
        style: {
          fontFamily: titleFace,
          fontSize,
          color: textColor || "#4d959c",
          lineHeight: circleSize
        }
      },
      name ? name.split(" ").map((n) => n[0]).join("").slice(0, 2) : ""
    ))))
  );
}
var EventGridBlocksSkia = ({
  handleBlockPress,
  handleBlockLongPress,
  hourHeight,
  APPOINTMENT_BLOCK_WIDTH,
  startMinutes: gridStart = 0,
  endMinutes: gridEnd = 1440,
  externalPanGesture
}) => {
  const rowHeight = hourHeight / 4;
  const [pressedRow, setPressedRow] = React19__namespace.useState(null);
  const gridStartHour = Math.floor(gridStart / 60);
  const gridEndHour = Math.ceil(gridEnd / 60);
  const timeLabels = React19.useMemo(() => {
    const out = [];
    for (let h = gridStartHour; h < gridEndHour; h++) {
      for (let q = 0; q < 4; q++) {
        const m = q * 15;
        const hh = String(h).padStart(2, "0");
        const mm = String(m).padStart(2, "0");
        out.push(`${hh}:${mm}:00`);
      }
    }
    return out;
  }, [gridStartHour, gridEndHour]);
  const rects = React19.useMemo(
    () => timeLabels.map((_, row) => ({
      x: 0,
      y: row * rowHeight,
      width: APPOINTMENT_BLOCK_WIDTH,
      height: rowHeight,
      row
    })),
    [timeLabels, rowHeight, APPOINTMENT_BLOCK_WIDTH]
  );
  const midIndex = Math.ceil(rects.length / 2);
  const firstRects = rects.slice(0, midIndex);
  const secondRects = rects.slice(midIndex);
  const segmentHeight = rowHeight * firstRects.length;
  const onSlotPress = React19__namespace.useCallback(
    (row) => {
      setPressedRow(null);
      const slot = timeLabels[row];
      if (slot) {
        handleBlockPress(slot);
      }
    },
    [handleBlockPress, timeLabels]
  );
  const onSlotLongPress = React19__namespace.useCallback(
    (row) => {
      setPressedRow(null);
      const slot = timeLabels[row];
      if (slot) {
        handleBlockLongPress(slot);
      }
    },
    [timeLabels, handleBlockLongPress]
  );
  const onPressBegin = React19__namespace.useCallback((row) => {
    setPressedRow(row);
  }, []);
  const onTouchesUp = React19__namespace.useCallback(() => {
    setPressedRow(null);
  }, []);
  let longPressGesture = reactNativeGestureHandler.Gesture.LongPress().onBegin((e) => {
    "worklet";
    reactNativeWorklets.scheduleOnRN(onPressBegin, Math.floor(e.y / rowHeight));
  }).onStart((e) => {
    "worklet";
    reactNativeWorklets.scheduleOnRN(onSlotLongPress, Math.floor(e.y / rowHeight));
  }).onTouchesUp(() => {
    "worklet";
    reactNativeWorklets.scheduleOnRN(onTouchesUp);
  }).onFinalize(() => {
    "worklet";
    reactNativeWorklets.scheduleOnRN(onTouchesUp);
  });
  if (externalPanGesture) {
    longPressGesture = longPressGesture.simultaneousWithExternalGesture(externalPanGesture);
  }
  const tapGesture = reactNativeGestureHandler.Gesture.Tap().onBegin((e) => {
    "worklet";
    reactNativeWorklets.scheduleOnRN(onPressBegin, Math.floor(e.y / rowHeight));
  }).onEnd((e) => {
    "worklet";
    reactNativeWorklets.scheduleOnRN(onSlotPress, Math.floor(e.y / rowHeight));
  }).onTouchesUp(() => {
    "worklet";
    reactNativeWorklets.scheduleOnRN(onTouchesUp);
  }).onFinalize(() => {
    "worklet";
    reactNativeWorklets.scheduleOnRN(onTouchesUp);
  });
  const composedGesture = reactNativeGestureHandler.Gesture.Race(longPressGesture, tapGesture);
  return /* @__PURE__ */ React19__namespace.createElement(reactNativeGestureHandler.GestureDetector, { gesture: composedGesture }, /* @__PURE__ */ React19__namespace.createElement(reactNative.View, null, /* @__PURE__ */ React19__namespace.createElement(reactNativeSkia.Canvas, { style: { width: APPOINTMENT_BLOCK_WIDTH, height: segmentHeight } }, firstRects.map(({ x, y, width: w, height: h, row }, idx) => /* @__PURE__ */ React19__namespace.createElement(React19__namespace.Fragment, { key: idx }, /* @__PURE__ */ React19__namespace.createElement(
    reactNativeSkia.Rect,
    {
      x,
      y,
      width: w,
      height: h,
      color: pressedRow === row ? "rgba(240,240,240,0.3)" : "rgba(240,240,240,0.6)",
      style: "fill"
    }
  ), /* @__PURE__ */ React19__namespace.createElement(reactNativeSkia.Line, { p1: { x, y: y + h }, p2: { x: x + w, y: y + h }, color: "#ddd", strokeWidth: 1 })))), /* @__PURE__ */ React19__namespace.createElement(reactNativeSkia.Canvas, { style: { width: APPOINTMENT_BLOCK_WIDTH, height: segmentHeight } }, secondRects.map(({ x, y, width: w, height: h, row }, idx) => /* @__PURE__ */ React19__namespace.createElement(React19__namespace.Fragment, { key: idx }, /* @__PURE__ */ React19__namespace.createElement(
    reactNativeSkia.Rect,
    {
      x,
      y: y - segmentHeight,
      width: w,
      height: h,
      color: pressedRow === row ? "rgba(240,240,240,0.3)" : "rgba(240,240,240,0.6)",
      style: "fill"
    }
  ), /* @__PURE__ */ React19__namespace.createElement(
    reactNativeSkia.Line,
    {
      p1: { x, y: y - segmentHeight + h },
      p2: { x: x + w, y: y - segmentHeight + h },
      color: "#ddd",
      strokeWidth: 1
    }
  ))))));
};
var StoreFeeder = ({ store, resources, baseDate }) => {
  const upsertResources = store.useUpsertResources();
  const setDayDataFor = store.useSetDayDataFor();
  const setDate = store.useSetDate();
  const baseDateKey = React19.useMemo(() => dateFns.format(baseDate, "yyyy-MM-dd"), [baseDate]);
  // FORK (Phase 11 — clear-on-empty): track which day-keys this feeder
  // wrote to on the previous tick so a `resources` ref that drops
  // events for a previously-populated day forces an explicit empty
  // payload through `setDayDataFor`. Without this, the `if (!items?.length) return;`
  // short-circuit below means a consumer setting `events: []` for every
  // resource (e.g. REMITechnician `LandscapeWorkweekView` in 0-tech
  // "create-card" mode) cannot clear stale events from a prior
  // selection state — the body keeps painting whatever was last seeded.
  // The Set is a Ref (not state) so it persists across renders without
  // re-triggering the effect itself.
  const prevTouchedRef = React19.useRef(/* @__PURE__ */ new Set());
  React19.useEffect(() => {
    setDate(baseDate);
    upsertResources(resources.map((r) => ({ id: r.id, name: r.name, avatar: r.avatar })));
    const dayBuckets = /* @__PURE__ */ new Map();
    for (const r of resources) {
      const push = (items, field) => {
        if (!items?.length) return;
        for (const it of items) {
          const key = it.date ?? baseDateKey;
          const bucket = dayBuckets.get(key) ?? dayBuckets.set(key, { events: {}, disabledBlocks: {}, disableIntervals: {} }).get(key);
          const m = bucket[field];
          (m[r.id] ||= []).push(it);
        }
      };
      push(r.events, "events");
      push(r.disabledBlocks, "disabledBlocks");
      push(r.disableIntervals, "disableIntervals");
    }
    for (const [dayKey, payload] of dayBuckets) {
      setDayDataFor(dayKey, payload);
    }
    // FORK (Phase 11): for every day-key we populated last tick but did
    // not populate this tick, write an explicit empty payload so the
    // store's `eventsByDay[dayKey]` (and the parallel disabled maps)
    // reflect the new empty reality. `setDayDataFor` overwrites
    // wholesale on a truthy `events` object, and `{}` is truthy, so
    // `useEventsFor` will start returning `[]` for every resource on
    // the cleared day.
    const currentTouched = /* @__PURE__ */ new Set(dayBuckets.keys());
    var clearedKeys = [];
    for (const staleKey of prevTouchedRef.current) {
      if (!currentTouched.has(staleKey)) {
        setDayDataFor(staleKey, { events: {}, disabledBlocks: {}, disableIntervals: {} });
        clearedKeys.push(staleKey);
      }
    }
    // BUG-A diagnostic (P2-FE-4 follow-up #15, 2026-04-20): trace what the
    // StoreFeeder is actually writing/clearing on every render so we can
    // see whether the 0-tech leak is "events are still being written" or
    // "stale events are not being cleared". FORK Phase 28.3 — gated.
    if (__VERBOSE_CAL_LOGS__) {
      console.log("[BUG-A:Feeder]", {
        baseDateKey,
        resourceCount: resources.length,
        writtenKeys: Array.from(dayBuckets.keys()),
        writtenEventTotals: Array.from(dayBuckets.entries()).map(([k, p]) => ({
          k,
          techCount: Object.keys(p.events).length,
          total: Object.values(p.events).reduce((s, arr) => s + arr.length, 0),
        })),
        clearedKeys,
        prevTouched: Array.from(prevTouchedRef.current),
      });
    }
    prevTouchedRef.current = currentTouched;
  }, [resources, upsertResources, setDayDataFor, baseDateKey]);
  return null;
};
var DisabledInterval = ({ width, top, height }) => {
  return /* @__PURE__ */ React19__namespace.default.createElement(reactNative.View, { style: [styles3.disabledBlock, { width, top, height }] }, /* @__PURE__ */ React19__namespace.default.createElement(Svg__default.default, { width, height: "100%" }, /* @__PURE__ */ React19__namespace.default.createElement(Svg.Defs, null, /* @__PURE__ */ React19__namespace.default.createElement(Svg.Pattern, { id: "diagonalHatch", patternUnits: "userSpaceOnUse", width: "10", height: "10" }, /* @__PURE__ */ React19__namespace.default.createElement(Svg.Line, { x1: "0", y1: "0", x2: "10", y2: "10", stroke: "rgba(150, 150, 150, 0.8)", strokeWidth: "1" }))), /* @__PURE__ */ React19__namespace.default.createElement(native.Rect, { width, height: "100%", fill: "url(#diagonalHatch)" })));
};
var DisabledIntervals = React19__namespace.default.memo(({
  id,
  APPOINTMENT_BLOCK_WIDTH,
  hourHeight,
  minuteOffset = 0,
  date: dateProp
}) => {
  const { useDisabledIntervalsFor: useDisabledIntervalsFor2, useGetDate: useGetDate2 } = useCalendarBinding();
  const date = useGetDate2();
  const disabledIntervals = useDisabledIntervalsFor2(id, dateProp ?? date);
  return /* @__PURE__ */ React19__namespace.default.createElement(React19__namespace.default.Fragment, null, disabledIntervals.map(
    (disabledInterval, index) => {
      return /* @__PURE__ */ React19__namespace.default.createElement(
        DisabledInterval,
        {
          key: `${index}-${disabledInterval.from}-${disabledInterval.to}`,
          width: APPOINTMENT_BLOCK_WIDTH,
          top: scalePosition(disabledInterval.from - minuteOffset, hourHeight),
          height: scalePosition(disabledInterval.to - disabledInterval.from, hourHeight)
        }
      );
    }
  ));
});
var styles3 = reactNative.StyleSheet.create({
  disabledBlock: {
    position: "absolute",
    zIndex: -10
  }
});
var DisabledIntervals_default = DisabledIntervals;
var Row = ({ children, divider, space, style, ...props }) => {
  return /* @__PURE__ */ React19__namespace.default.createElement(reactNative.View, { style: [{ flexDirection: "row" }, style], ...props }, React19__namespace.default.Children.toArray(children).map((child, index) => /* @__PURE__ */ React19__namespace.default.createElement(React19__namespace.default.Fragment, { key: index }, child, index !== React19__namespace.default.Children.toArray(children).length - 1 && divider, index !== React19__namespace.default.Children.toArray(children).length - 1 && /* @__PURE__ */ React19__namespace.default.createElement(reactNative.View, { style: { width: space, height: "100%" } }))));
};
var Row_default = Row;
var DisabledBlockComponent = ({
  top,
  height,
  layout,
  disabledBlock,
  hourHeight,
  onDisabledBlockPress
}) => {
  const dynamicStyle = {
    backgroundColor: "#d3d3d3",
    top: top + 2,
    left: layout.leftPx + 1,
    height: height < hourHeight / 4 ? height : height - 4,
    width: layout.widthPx - 3,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)"
  };
  const titleFace = useResolvedFont({ fontWeight: "600" });
  return /* @__PURE__ */ React19__namespace.default.createElement(
    reactNative.TouchableOpacity,
    {
      style: [styles4.event, dynamicStyle],
      onPress: () => {
        onDisabledBlockPress && onDisabledBlockPress(disabledBlock);
      }
    },
    /* @__PURE__ */ React19__namespace.default.createElement(Col_default, { style: { position: "relative" } }, /* @__PURE__ */ React19__namespace.default.createElement(Row_default, { style: { height: 18 } }, /* @__PURE__ */ React19__namespace.default.createElement(
      reactNative.Text,
      {
        allowFontScaling: false,
        style: {
          fontFamily: titleFace,
          fontSize: getTextSize(hourHeight),
          fontWeight: "600"
        }
      },
      minutesToTime(disabledBlock?.from),
      " - ",
      minutesToTime(disabledBlock?.to)
    )), /* @__PURE__ */ React19__namespace.default.createElement(
      reactNative.Text,
      {
        allowFontScaling: false,
        style: {
          fontFamily: titleFace,
          fontSize: getTextSize(hourHeight),
          fontWeight: "600"
        }
      },
      disabledBlock?.title
    ))
  );
};
var DisabledBlocks = React19__namespace.default.memo(({
  id,
  APPOINTMENT_BLOCK_WIDTH,
  hourHeight,
  minuteOffset = 0,
  onDisabledBlockPress,
  date: dateProp
}) => {
  const { useDisabledBlocksFor: useDisabledBlocksFor2, useGetDate: useGetDate2 } = useCalendarBinding();
  const date = useGetDate2();
  const disabledBlocks = useDisabledBlocksFor2(id, dateProp ?? date);
  const layoutMap = React19.useMemo(() => {
    return columnsToPixels(computeDisabledBlockColumns(disabledBlocks), APPOINTMENT_BLOCK_WIDTH);
  }, [disabledBlocks]);
  return /* @__PURE__ */ React19__namespace.default.createElement(React19__namespace.default.Fragment, null, disabledBlocks.map(
    (disabledBlock, index) => {
      const key = disabledBlock.id;
      return /* @__PURE__ */ React19__namespace.default.createElement(
        DisabledBlockComponent,
        {
          hourHeight,
          disabledBlock,
          key: `${index}-${disabledBlock.from}-${disabledBlock.to}`,
          top: scalePosition(disabledBlock.from - minuteOffset, hourHeight),
          height: scalePosition(disabledBlock.to - disabledBlock.from, hourHeight),
          layout: layoutMap.get(key),
          onDisabledBlockPress
        }
      );
    }
  ));
});
var styles4 = reactNative.StyleSheet.create({
  event: {
    position: "absolute",
    borderRadius: 5,
    padding: 2,
    overflow: "hidden",
    zIndex: 999
    // Ensure events stay above the background blocks
  }
});
var DisabledBlocks_default = DisabledBlocks;
var EventBlock = React19__namespace.default.memo(({
  event,
  onLongPress,
  onPress,
  // FORK Phase 17 (P2-FE-5 chunk 2b): new `onDoubleTap` prop.
  // Decouples drag-init from long-press — drag is now a double-tap
  // gesture and long-press is freed for the consumer (dismiss draft /
  // open quick-action menu). See README-FORK Phase 17 + the
  // `2026-04-22-double-tap-drag` deviation.
  onDoubleTap,
  disabled,
  selected,
  hourHeight,
  minuteOffset = 0,
  slots,
  frame,
  styleOverrides,
  // FORK Phase 25 (PR-UX-2 / move-chain tile pulse, 2026-05-05): per-event
  // animated-opacity callback. See README-FORK Phase 25 + the
  // `getEventOpacity`-prop block on `CalendarProps`.
  getEventOpacity,
  // FORK Phase 26 (2026-05-10 — move-chain arrow alignment):
  // post-style rendered-bounds reporter. When provided, the outer
  // Animated.View attaches an onLayout handler that fires the
  // callback with (event, { x, y, width, height }) in column-local
  // coordinates. Consumers (move-chain arrow overlay) combine with
  // their existing column-offset math to land arrow endpoints
  // flush against visible card edges. See README-FORK Phase 26.
  onEventLayout
}) => {
  const { useGetSelectedEvent: useGetSelectedEvent2 } = useCalendarBinding();
  const selectedAppointment = useGetSelectedEvent2();
  const eventTop = scalePosition(event.from - minuteOffset, hourHeight);
  const rawEventHeight = scalePosition(event.to - event.from, hourHeight);
  const MIN_EVENT_PX = 22;
  const eventHeight = Math.max(rawEventHeight, MIN_EVENT_PX);
  const start = minutesToTime(event.from);
  const end = minutesToTime(event.to);
  const dynamicStyle = {
    top: eventTop + 2,
    height: eventHeight < hourHeight / 4 ? eventHeight : eventHeight - 4,
    left: frame.leftPx + 1,
    width: frame.widthPx - 3,
    zIndex: frame.zIndex,
    opacity: selectedAppointment || disabled ? 0.5 : 1,
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? "#4d959c" : "rgba(0,0,0,0.12)"
  };
  const resolved = typeof styleOverrides === "function" ? styleOverrides(event) ?? {} : styleOverrides ?? {};
  // FORK Phase 17 (P2-FE-5 chunk 2b): JS-side double-tap detector.
  // - First tap: schedule onPress after DOUBLE_TAP_WINDOW_MS so a
  //   second tap can pre-empt it. Single-tap latency is the standard
  //   tradeoff for double-tap detection (matches iOS recognizers).
  // - Second tap within window: cancel pending onPress and fire
  //   onDoubleTap (which the library uses to start drag).
  // - When `onDoubleTap` is NOT supplied, fire onPress immediately
  //   (no latency penalty) so legacy consumers keep their behavior.
  // Cleanup on unmount to avoid late-firing after the row scrolls
  // out of view.
  //
  // FORK Phase 17.1 (P2-FE-5 chunk 2b.1): the second-tap detector
  // moved from `onPress` (touch-up) to `onPressIn` (touch-down). This
  // is the minimum-surgery fix for the user-reported "haptic delay +
  // can't move immediately" symptom from the original Phase 17 ship.
  // Rationale: when the detector fires on touch-up, the user has
  // already lifted their finger by the time `setSelectedEvent +
  // setDragReady + haptic` runs, so they have to put their finger
  // back down to start panning (and the haptic feels delayed because
  // it lands ~250-400 ms after the second tap began). Firing on
  // touch-down means: (a) haptic is instant on the second touchdown,
  // (b) DraggableEvent mounts at the event position while the user's
  // finger is still on it, (c) when they begin moving, the calendar's
  // parent panGesture activates on the same continuous touch — they
  // tap-tap-and-drag fluidly without lifting. TouchableOpacity yields
  // to the iOS pan recognizer once movement crosses the pan
  // threshold, so the press is canceled cleanly.
  //
  // FORK Phase 22 (PR 2.1, 2026-04-24): fix for the user-reported
  // "double-tap to move is now triggering single tap to bring up
  // appointment review sheet" regression. Phase 17.1 used
  // `onPressOut` to reset `doubleTapHandledRef` on the assumption
  // that `onPressOut` fires AFTER `onPress`. That's wrong — React
  // Native's actual press lifecycle is
  // `onPressIn → onPressOut → onPress` (see
  // `react-native/Libraries/Pressability/Pressability.js`'s
  // documentation: "`onPress` is the user-facing callback that is
  // fired after the touch has finished and onPressOut has been
  // called."). With the wrong assumption, the second-tap sequence
  // was:
  //   1. `pressIn` (2nd tap) → set `doubleTapHandledRef=true`, fire
  //      `onDoubleTap`.
  //   2. `pressOut` (2nd tap) → reset `doubleTapHandledRef=false`. ← bug
  //   3. `press` (2nd tap) → see `doubleTapHandledRef=false`, fall
  //      through, schedule a single-tap onPress that fires 280ms
  //      later, opening the detail sheet on top of the drag.
  // Fix: move the reset from `onPressOut` (premature) to `onPress`
  // (correct — the ref's purpose has been fulfilled), with a safety
  // reset at the start of `onPressIn` to handle canceled press
  // cycles (movement past `pressRetentionOffset` cancels `onPress`
  // but still fires `onPressOut`; without `onPress` running, the
  // ref would stay `true` and incorrectly suppress the NEXT touch).
  // The safety reset triggers only when the new touch is OUTSIDE
  // the double-tap window — i.e., a fresh, unrelated press cycle.
  const lastTapAtRef = React19.useRef(0);
  const pendingSingleTapRef = React19.useRef(null);
  const doubleTapHandledRef = React19.useRef(false);
  const DOUBLE_TAP_WINDOW_MS = 280;
  React19.useEffect(() => () => {
    if (pendingSingleTapRef.current) {
      clearTimeout(pendingSingleTapRef.current);
      pendingSingleTapRef.current = null;
    }
  }, []);
  const handlePressIn = () => {
    if (!onDoubleTap) return;
    const now = Date.now();
    const elapsed = now - lastTapAtRef.current;
    // Phase 22 safety reset: a fresh press cycle (outside the
    // double-tap window) means any prior `doubleTapHandledRef=true`
    // belongs to an abandoned/canceled cycle and should be cleared.
    // Inside the window, leave it alone — we may be about to fire
    // a double-tap and need the ref to suppress the second tap's
    // single-tap fall-through in `handlePress`.
    if (elapsed >= DOUBLE_TAP_WINDOW_MS) {
      doubleTapHandledRef.current = false;
    }
    if (elapsed < DOUBLE_TAP_WINDOW_MS && pendingSingleTapRef.current) {
      clearTimeout(pendingSingleTapRef.current);
      pendingSingleTapRef.current = null;
      lastTapAtRef.current = 0;
      doubleTapHandledRef.current = true;
      onDoubleTap(event);
    }
  };
  const handlePressOut = () => {
    // Phase 22: intentionally no-op. The reset moved to
    // `handlePress` so it runs AFTER the second-tap's `onPress`
    // gets a chance to short-circuit. See the Phase 22 block above.
  };
  const handlePress = () => {
    if (doubleTapHandledRef.current) {
      // Reset here (not in pressOut) so the ref's "we just handled
      // a double-tap" signal survives until the press cycle that
      // followed the double-tap has completed.
      doubleTapHandledRef.current = false;
      return;
    }
    if (!onDoubleTap) {
      if (onPress) onPress(event);
      return;
    }
    const now = Date.now();
    lastTapAtRef.current = now;
    if (pendingSingleTapRef.current) {
      clearTimeout(pendingSingleTapRef.current);
    }
    pendingSingleTapRef.current = setTimeout(() => {
      pendingSingleTapRef.current = null;
      if (onPress) onPress(event);
    }, DOUBLE_TAP_WINDOW_MS);
  };
  // FORK Phase 25 (PR-UX-2 / move-chain tile pulse, 2026-05-05):
  // resolve the per-event opacity descriptor BEFORE any conditional
  // returns so `useAnimatedStyle` is always called the same number of
  // times across renders (rules-of-hooks). When the consumer doesn't
  // pass `getEventOpacity` or it returns null/undefined, the worklet
  // returns an EMPTY style — NOT `{opacity: 1}` — so any static
  // `opacity` already set by `resolved?.container` (e.g. the dim
  // treatment in `applyMoveChainBorderOverride`) is preserved.
  //
  // Phase 25.1 fix (2026-05-05): the original implementation returned
  // `{opacity: 1}` from this branch. Because the Animated.View wrapper
  // applies styles in array order `[base, dynamic, resolved.container,
  // opacityAnimatedStyle]` (last wins), the `opacity: 1` clobbered
  // any static `opacity: 0.4` from the chain-dim path, so non-chain
  // tiles rendered at full brightness instead of dimmed. Returning
  // `{}` lets the static opacity show through. When `opacityDesc` IS
  // present, we still emit a numeric opacity which intentionally
  // overrides the static value — that's what makes chain tiles pulse.
  const opacityDesc = getEventOpacity ? getEventOpacity(event) ?? null : null;
  // FORK Phase 25.2 (PR-UX-2 / move-chain pulse diagnostics, 2026-05-05):
  // log a single line whenever the opacity descriptor's *phase*
  // changes for this event. Lets us correlate consumer-side resolver
  // decisions with what actually reaches EventBlock after React.memo.
  //
  // FORK Phase 25.3 (avatar-reorder regression fix, 2026-05-05):
  // moved the `lastPhaseRef.current = currentPhase` mutation from the
  // render body into a `useEffect`. Mutating a ref during render is
  // a React anti-pattern that makes the component's observed state
  // incorrect under StrictMode's double-invoke and is flagged by
  // linters. The user reported the avatar long-press → reorder flow
  // broke after PASS 2.x landed; static analysis couldn't isolate a
  // single root cause, but this anti-pattern was the most concrete
  // smell in the recent diffs, so we move it behind a `useEffect`
  // (preserving the diagnostic log) and leave the rest of the
  // pulse + arrow + ghost machinery intact. See README-FORK Phase
  // 25.3 and dev-log entry 2026-05-05 "Avatar reorder LongPress
  // regression" for the full investigation.
  const lastPhaseRef = React19.useRef(null);
  const currentPhase = opacityDesc?.phase ?? null;
  React19.useEffect(() => {
    if (typeof __DEV__ === "undefined" || !__DEV__) return;
    if (lastPhaseRef.current === currentPhase) return;
    console.log("[MoveChain:Pulse:EventBlock]", {
      eventId: event?.id,
      from: lastPhaseRef.current,
      to: currentPhase,
    });
    lastPhaseRef.current = currentPhase;
  }, [currentPhase, event]);
  const opacityAnimatedStyle = Animated2.useAnimatedStyle(() => {
    if (!opacityDesc) return {};
    const v = opacityDesc.sv.value;
    if (opacityDesc.phase === "source") return { opacity: v };
    // "dest" phase mirrors around the [MIN, MAX] midpoint so source
    // and dest tiles trade brightness in lockstep on the same SV.
    // MIN/MAX are duplicated here from
    // src/components/calendar/move-chain-pulse-singleton.ts to keep
    // the vendored library free of consumer imports — if either side
    // drifts, the pulse band will visually clip but not crash. Test
    // coverage in the consumer asserts both sides agree.
    const MIN = 0.3;
    const MAX = 1;
    return { opacity: MAX + MIN - v };
  }, [opacityDesc]);
  // FORK Phase 26 (2026-05-10) — bounds-report callback. Stable
  // identity per (event, onEventLayout) pair so React doesn't
  // re-fire onLayout each parent render. Called UNCONDITIONALLY
  // (rules-of-hooks); the conditional is on the consumer-prop
  // path, not on hook presence — keeping the hook order identical
  // across the `eventHeight == 0` early return below. When the
  // consumer omits `onEventLayout`, we pass `undefined` to the
  // Animated.View below so React skips the onLayout wiring entirely.
  const handleEventLayout = React19.useCallback(
    (e) => {
      if (!onEventLayout) return;
      const { x, y, width, height } = e.nativeEvent.layout;
      onEventLayout(event, { x, y, width, height });
    },
    [event, onEventLayout]
  );
  if (eventHeight == 0)
    return null;
  const TopRight = slots?.TopRight;
  const Body = slots?.Body;
  const titleFace = useResolvedFont({ fontWeight: "700" });
  const timeFace = useResolvedFont({ fontWeight: "600" });
  // FORK Phase 25 (PR-UX-2 / move-chain tile pulse): outer
  // Animated.View carries position/size/border + animated opacity;
  // inner TouchableOpacity owns the press surface and visual content.
  // `pointerEvents="box-none"` on the wrapper passes touches through
  // to the Touchable so press feedback is unaffected.
  return /* @__PURE__ */ React19__namespace.default.createElement(
    Animated2__default.default.View,
    {
      pointerEvents: "box-none",
      style: [styles5.event, dynamicStyle, resolved?.container, opacityAnimatedStyle],
      // FORK Phase 26 (2026-05-10) — only attach onLayout when the
      // consumer provided a callback. Passing `undefined` lets
      // React skip layout-change tracking for calendars that don't
      // need bounds reporting (zero overhead path).
      onLayout: onEventLayout ? handleEventLayout : void 0
    },
    /* @__PURE__ */ React19__namespace.default.createElement(
    reactNative.TouchableOpacity,
    {
      // FORK Phase 25 (PR-UX-2 / move-chain tile pulse): inner
      // Touchable is layout-only now — container styles moved to the
      // wrapping Animated.View above. `flex:1` so the touch surface
      // fills the wrapper.
      style: styles5.eventInner,
      hitSlop: { top: 10, bottom: 10, left: 4, right: 4 },
      disabled,
      onPressIn: handlePressIn,
      onPressOut: handlePressOut,
      onPress: handlePress,
      // FORK Phase 37 (PR-UX-14, 2026-05-09): gate native long-press
      // so it cannot fire on the SAME press cycle that has already
      // detected a double-tap. The native `onLongPress` runs on RN's
      // own ~500ms timer attached to the press lifecycle and is
      // independent of the JS-side `handlePressIn` double-tap
      // detection. When the user double-tap-and-holds (the second
      // tap of the double-tap is held longer than ~500ms before
      // movement begins, which is common on conflicted cards in
      // landscape), `handlePressIn` correctly detects the double-tap
      // → fires `onDoubleTap` (drag-init + pickup haptic) AND sets
      // `doubleTapHandledRef.current = true` — but the native press
      // cycle continues, the long-press timer expires, and the
      // consumer's `onEventLongPress` fires anyway, opening the
      // QuickActionToast on top of the in-flight drag. The user
      // reported the resulting state as "the drawer with the
      // customers info pops up" while they were dragging, sometimes
      // crashing the app.
      // Fix: the same `doubleTapHandledRef` that gates `handlePress`
      // (preventing the post-double-tap single-tap detail-sheet open)
      // now also gates `onLongPress`. The ref is reset inside
      // `handlePress` after the cycle completes, so the next press
      // cycle can fire its own long-press normally. See README-FORK
      // Phase 37 for the full rationale + the user-visible smoking-
      // gun log pattern (`[CAL:longPress]` immediately followed by
      // `[DEBUG:Toast/QuickAction] shown` while a drag was active).
      delayLongPress: 500,
      onLongPress: () => {
        if (doubleTapHandledRef.current) return;
        onLongPress && onLongPress(event);
      }
    },
    /* @__PURE__ */ React19__namespace.default.createElement(Col_default, { style: [{ position: "relative" }, resolved?.content] }, /* @__PURE__ */ React19__namespace.default.createElement(
      reactNative.TextInput,
      {
        editable: false,
        allowFontScaling: false,
        underlineColorAndroid: "transparent",
        style: [{
          width: "100%",
          fontFamily: timeFace,
          fontSize: getTextSize(hourHeight),
          pointerEvents: "none",
          padding: 0,
          margin: 0,
          color: "black"
        }, resolved?.time],
        defaultValue: `${start} - ${end}`
      }
    ), Body ? /* @__PURE__ */ React19__namespace.default.createElement(Body, { event, ctx: { hourHeight } }) : /* @__PURE__ */ React19__namespace.default.createElement(React19__namespace.default.Fragment, null, /* @__PURE__ */ React19__namespace.default.createElement(Row_default, { style: { alignItems: "center", height: 18 } }, /* @__PURE__ */ React19__namespace.default.createElement(
      reactNative.Text,
      {
        allowFontScaling: false,
        style: [{
          fontFamily: titleFace,
          fontSize: getTextSize(hourHeight),
          fontWeight: "700"
        }, resolved?.title]
      },
      event?.title
    )), /* @__PURE__ */ React19__namespace.default.createElement(
      reactNative.Text,
      {
        allowFontScaling: false,
        style: [{
          fontFamily: timeFace,
          fontSize: getTextSize(hourHeight),
          fontWeight: "600"
        }, resolved?.desc]
      },
      event?.description
    )), /* @__PURE__ */ React19__namespace.default.createElement(Row_default, { style: {
      position: "absolute",
      right: 2
    } }, TopRight ? /* @__PURE__ */ React19__namespace.default.createElement(TopRight, { event, ctx: { hourHeight } }) : null))
  )
  );
});
var styles5 = reactNative.StyleSheet.create({
  event: {
    backgroundColor: "#4d959c",
    position: "absolute",
    borderRadius: 5,
    padding: 2,
    overflow: "hidden",
    zIndex: 9999
    // Ensure events stay above the background blocks
  },
  // FORK Phase 25 (PR-UX-2 / move-chain tile pulse): inner
  // TouchableOpacity inside the outer Animated.View. `flex:1` so it
  // fills the wrapper.
  eventInner: {
    flex: 1
  }
});
var EventBlock_default = EventBlock;
var AnimatedTextInput = Animated2__default.default.createAnimatedComponent(reactNative.TextInput);
// FORK Phase 16 (P2-FE-4 follow-up #12): vertical lane divider lines
// for mini-columns mode. Mounted inside each day-column wrapper when
// the day is rendering 2+ techs in `mini-columns`. Renders `techCount
// - 1` 1px-wide bars at lane boundaries (left: i * laneWidth, i in
// [1, techCount - 1]). Opacity is driven by the `isDragging` shared
// value so the bars only become visible while the user is actively
// dragging — outside of drag they fade out completely so the calendar
// doesn't carry permanent intra-column visual noise.
//
// Companion to the lane-width DraggableEvent + the snap-target shadow.
// PLAN-DEVIATION: 2026-04-20-mini-cols-drop-shadow —
// docs/PLAN-DEVIATIONS.md#2026-04-20-mini-cols-drop-shadow
var MiniColumnLanes = ({ laneWidth, techCount, totalDayHeight, isDragging }) => {
  const animatedStyle = Animated2.useAnimatedStyle(() => {
    return {
      opacity: Animated2.withTiming(isDragging.value ? 0.6 : 0, { duration: 120 })
    };
  });
  if (techCount < 2 || laneWidth <= 0) return null;
  const lines = [];
  for (let i = 1; i < techCount; i++) {
    lines.push(/* @__PURE__ */ React19__namespace.default.createElement(reactNative.View, {
      key: `lane-line-${i}`,
      pointerEvents: "none",
      style: {
        position: "absolute",
        left: i * laneWidth,
        top: 0,
        width: 1,
        height: totalDayHeight,
        backgroundColor: "rgba(0,0,0,0.45)"
      }
    }));
  }
  return /* @__PURE__ */ React19__namespace.default.createElement(
    Animated2__default.default.View,
    {
      pointerEvents: "none",
      style: [{ position: "absolute", left: 0, top: 0, width: laneWidth * techCount, height: totalDayHeight }, animatedStyle]
    },
    lines
  );
};
// FORK Phase 16 (P2-FE-4 follow-up #12): snap-target drop shadow for
// mini-columns mode. Mounted as a sibling of DraggableEvent in
// CalendarInner's overlay layer; its useAnimatedStyle worklet calls
// resolveLaneDropPosition every frame to derive the destination
// rectangle from live pan/scroll shared values. Tinted by the
// destination tech's color via `techColors` (precomputed on JS side
// from the consumer's `getResourceColor` prop), indexed by laneIndex
// inside the worklet. When the consumer doesn't supply
// `getResourceColor`, falls back to a neutral semi-transparent black.
//
// Gated on selectedEvent && dragReady && multiTechMode ===
// "mini-columns" && techCount >= 2 BEFORE mounting — the resolver's
// internal degenerate-input null is purely defensive.
//
// FORK Phase 29 (P3-FE-DRAG-CORNER-PEEK, 2026-05-06): the ghost is
// the SOURCE OF TRUTH for where the drop will land; it stays
// lane-snapped (Phase 27.1 + Phase 28.1 attenuation, both
// preserved). The Phase 29 change is on the CARD side — the card
// no longer lane-snaps in lockstep with the ghost; it free-floats
// with the finger. That decoupling is what restores the corner-
// peek visual the user wanted. DO NOT add a lane-snap branch back
// to `DraggableEvent.draggingAnimatedStyle` without first reading
// `docs/PLAN-DEVIATIONS.md#2026-05-06-card-floats-ghost-snaps`.
// PLAN-DEVIATION: 2026-04-20-mini-cols-drop-shadow —
// docs/PLAN-DEVIATIONS.md#2026-04-20-mini-cols-drop-shadow
// PLAN-DEVIATION: 2026-05-06-card-floats-ghost-snaps —
// docs/PLAN-DEVIATIONS.md#2026-05-06-card-floats-ghost-snaps
var DropShadow = ({
  panXAbs,
  eventStartedTop,
  eventHeight,
  scrollX,
  scrollY,
  bodyBlockWidth,
  techCount,
  columnCount,
  techColors,
  isDragging,
  // FORK Phase 32 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY, 2026-05-07):
  // animated discrete-step shadow offset SV. -1 = ghost one full
  // lane LEFT of finger (mid-canvas, the historical Phase 27.1
  // relationship). 0 = ghost in finger's lane (edge convergence).
  // Animated transitions between the two states via withTiming(150ms)
  // — the same primitive used by the post-release snap-in slide.
  // Driven by useAnimatedReaction in CalendarInner. See
  // `resolveDiscreteShadowOffsetXStep` and `resolveLaneDropPosition`
  // doc-blocks for the full geometry rationale.
  shadowOffsetXSteps,
  // FORK Phase 35.1 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY, 2026-05-07):
  // perpendicular Y axis offset for the rotation rule. 0 = no
  // additional Y shift (corner-peek L-shape unchanged). -H/2 =
  // shadow shifted up by half an event-height beyond the existing
  // `- pos.height / 2` ghost render — applied for ALL lanes of the
  // last visible day in mini-cols mode. Animated via withTiming
  // (150ms) by the same `useAnimatedReaction` that drives
  // shadowOffsetXSteps.
  //
  // PLAN-DEVIATION: 2026-05-07-x-edge-drop-clamp —
  // docs/PLAN-DEVIATIONS.md#2026-05-07-x-edge-drop-clamp.
  shadowOffsetYPx
}) => {
  const animatedStyle = Animated2.useAnimatedStyle(() => {
    const pos = resolveLaneDropPosition({
      panXAbs: panXAbs.value,
      eventStartedTop: eventStartedTop.value,
      eventHeight: eventHeight.value,
      scrollX: scrollX.value,
      scrollY: scrollY.value,
      timeLabelWidth: TIME_LABEL_WIDTH,
      bodyBlockWidth,
      techCount,
      columnCount,
      shadowOffsetXSteps: shadowOffsetXSteps?.value ?? 0
    });
    if (pos == null) {
      return { opacity: 0, width: 0, height: 0, transform: [{ translateX: 0 }, { translateY: 0 }] };
    }
    // FORK Phase 27.3 (P3-FE-DRAG-GHOST follow-up, 2026-05-06): tint
    // is based on the GHOST's destination sub-lane, not the finger's
    // sub-lane. Pre-Phase 28.1 this used the consumer-side formula
    // `((pos.laneIndex - 1) % techCount + techCount) % techCount` —
    // a hard "ghost is always one sub-lane LEFT of finger" assumption
    // that broke at the rightmost canvas edge once Phase 28.1
    // introduced X-edge attenuation. After Phase 28.1 the resolver
    // computes the GHOST's lane index directly (post-attenuation) and
    // returns it as `pos.ghostLaneIndex`, which collapses to the old
    // `(laneIndex - 1) mod techCount` in the middle of the canvas
    // and to `laneIndex` (= same lane as finger) at the X edges. We
    // just read it here.
    //
    // Pre-27.3 this used `techColors[pos.laneIndex]`, which painted
    // the FINGER's sub-lane tech color — wrong, because the user
    // perceives the ghost as the destination indicator. User report:
    // *"the colors of the shadows do not match the column card
    // colors, which they should, regardless of the card color that
    // was picked up. The shadow should change based on the column."*
    const tint = techColors[pos.ghostLaneIndex] || "rgba(0,0,0,0.35)";
    // FORK Phase 27.1 (P3-FE-DRAG-GHOST follow-up, 2026-05-06): ghost
    // X is shifted by FULL `pos.width` (= one sub-lane to the LEFT
    // of `pos.translateX`), which centers the ghost INSIDE the
    // sub-lane to the left of the finger's sub-lane (NOT straddling
    // the gridline between two sub-lanes the way Phase 21.4 did).
    //
    // User clarification that drove this: *"the cards stay static
    // in their positioning to each other while being dragged. ... If
    // the finger is on a line, the ghost card should be in the
    // middle of a sub column. ... they don't end up over the lines,
    // do they? No. They end up in the middle of a sub column. That's
    // where the shadows should align to, NOT the lines, but between
    // the lines."*
    //
    // The ghost is the SOURCE OF TRUTH for where the drop will land.
    // The drop math (Phase 27.1 in pan onEnd) is gated on the same
    // mini-cols condition and shifts X by `-laneWidth` to land in
    // the same sub-lane the ghost is centered in. The floating card
    // (Phase 27.1 in DraggableEvent) is also lane-snapped to the
    // finger's sub-lane, which sits one sub-lane to the RIGHT of
    // the ghost — so card and ghost stay in fixed relative position
    // while dragging (constant `ΔX = laneWidth`), satisfying the
    // user's "static positioning" requirement.
    //
    // Y offset stays at `pos.height / 2` (Phase 21.4 vertical),
    // unchanged from the previous iteration. The ghost sits half an
    // event-height above the snap-Y the finger would land at.
    //
    // Phase 21.2 (height-of-card + 8 above), Phase 21.3 (no offset
    // at all), and Phase 21.4 (`- pos.width / 2`) are all superseded
    // by this `- pos.width` shift. Phase 26 (drop math shift by
    // `-laneWidth/2`) is superseded by the Phase 27.1 drop math
    // shift to `-laneWidth` in the pan onEnd handler.
    //
    // Snap-in animation on release (card slides from finger's
    // sub-lane to ghost's sub-lane over ~150ms before unmounting) is
    // deferred to Phase 27.2 — see README-FORK + DEVELOPMENT-LOG.
    //
    // FORK Phase 28.1 (P3-FE-DRAG-GHOST follow-up, 2026-05-06): X
    // shift is now `pos.ghostShiftX` (= -laneWidth in the middle of
    // the canvas, attenuating to 0 within one laneWidth of either X
    // edge — see `computeXEdgeShift` (Phase 30.1 rename of
    // `computeXEdgeAttenuation`) and the Phase 28.1 doc-block on
    // `resolveLaneDropPosition`). The constant-ΔX-from-
    // card invariant is now relaxed at the X edges: card stays at
    // the finger's sub-lane (Phase 27.1 unchanged), and the ghost
    // smoothly slides under the finger as it approaches the canvas
    // edge. This is what makes the rightmost (and leftmost) sub-lane
    // reachable as a drop target. User request that drove this:
    // *"there has to be something that could measure the space left
    // towards the border, and move the dropzone marker BACK under
    // the users finger."*
    //
    // Y offset (-pos.height / 2) is the natural ghost geometry —
    // ghost top = `eventStartedTop - scrollY - eventHeight/2`, so
    // the ghost sits half-an-event ABOVE the snap-Y the finger
    // would land at (= directly above the destination row). The
    // Phase 30.2 yShift below ATTENUATES this offset toward 0 at
    // the top edge (so ghost top can reach Y=0) and toward -H/2
    // at the bottom edge (so ghost top reaches `layoutHeight - H`,
    // putting ghost bottom at viewport bottom). In mid-canvas
    // yShift = 0 and the Phase 21.4 / Phase 27.1 ghost-above-finger
    // geometry is preserved. In mini-cols the topAnchorOffset is
    // `eventHeight` (matching the pan-onEnd `dropShiftY = H/2`
    // branch where the ghost sits one full height above the
    // finger), so the envelope shape matches the drop geometry.
    // The ghost's natural translateY is `pos.translateY -
    // pos.height / 2`, so the GHOST TOP sits half-an-event-height
    // ABOVE the snap target's top (`pos.translateY` = snap top in
    // viewport coords). Using `topAnchorOffset = H/2` keeps the
    // envelope matched to that half-height offset: at the top edge
    // (touchY ≈ 0) yShift = +H/2 cancels the natural `-H/2` lift
    // so the ghost's top reaches Y=0; at the bottom edge yShift =
    // -H/2 pulls the ghost down so the ghost's bottom reaches
    // Y=layoutHeight. Mid-canvas yShift = 0 and the Phase 21.4 /
    // Phase 27.1 ghost-half-above-snap geometry is preserved.
    //
    // FORK Phase 32: Y-axis shift removed. The Phase 30.2/30.3
    // continuous Y envelope was a visual-only no-op for typical drags
    // (fingerY rarely entered the envelope range) and double-counted
    // edge proximity when it did fire. Y reachability is now owned
    // entirely by the pan-onUpdate snap clamp.
    // FORK Phase 33 (2026-05-07): the snap clamp's pickup-offset
    // dependence was removed too — it now keeps the SNAPPED card
    // (top-to-bottom) within the visible viewport regardless of
    // pickup offset. See the pan-onUpdate site for the derivation.
    //
    // FORK Phase 35.1 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
    // 2026-05-07): translateY now incorporates the
    // `shadowOffsetYPx` SV from CalendarInner — `0` for default
    // cells (no Y shift, corner-peek L-shape preserved) and
    // `-eventHeight / 2` for the rotation cells (last visible
    // day's all lanes). Combined with the existing
    // `- pos.height / 2` base shift, the rotation cells render
    // the ghost at `pos.translateY - pos.height` in viewport
    // coords (= ONE FULL eventHeight above the snap row in
    // content coords).
    //
    // Phase 35 base attempted to skip this SV — the prior worker
    // reasoned (incorrectly) that the existing `- pos.height / 2`
    // base shift combined with the H/2 card pickup already
    // produced the "half overlap above" visual the user wanted.
    // Smoke confirmed that reading was wrong for the middle lane
    // of the last day (Thu Jake unreachable). Phase 35.1 adds
    // the SV per the user's explicit re-instruction. See README-
    // FORK Phase 35.1 entry.
    return {
      opacity: Animated2.withTiming(isDragging.value ? 0.35 : 0, { duration: 100 }),
      width: pos.width,
      height: pos.height,
      backgroundColor: tint,
      transform: [
        { translateX: pos.translateX + pos.ghostShiftX },
        { translateY: pos.translateY - pos.height / 2 + (shadowOffsetYPx?.value ?? 0) }
      ]
    };
  }, [bodyBlockWidth, techCount, columnCount, techColors]);
  // FORK Phase 21.1 (P3-FE-DRAG-GHOST chunk b follow-up, 2026-05-06):
  // dropped `borderStyle: "dashed"` from the static style. React Native
  // does not render dashed borders reliably — on iOS the dashes either
  // collapse to a solid line or fail to paint at all when combined with
  // `borderRadius` > 0, and on Android the dash pattern depends on the
  // platform version. The Phase 16 scaffolding was authored with the
  // dashed treatment in mind but was never mounted, so the bug never
  // surfaced. Now that Phase 21 mounts this overlay for real, we use
  // a solid 2pt border (RN default) — visually distinct from the source
  // card's near-invisible 1pt border at rgba(0,0,0,0.12) on
  // `DraggableEvent`, so the two layers don't blend into each other.
  return /* @__PURE__ */ React19__namespace.default.createElement(
    Animated2__default.default.View,
    {
      pointerEvents: "none",
      style: [
        {
          position: "absolute",
          top: 0,
          left: 0,
          borderWidth: 2,
          borderColor: "rgba(0,0,0,0.55)",
          borderRadius: 4
        },
        animatedStyle
      ]
    }
  );
};
// FORK Phase 29 (P3-FE-DRAG-CORNER-PEEK, 2026-05-06): the floating
// drag card free-floats with the finger (Phase 20.4 offset) and is
// NO LONGER lane-snapped to the ghost's sub-lane. The ghost
// (DropShadow) keeps its Phase 27.1 + Phase 28.1 lane-snap behavior
// because that's what stops the GHOST from straddling visible
// gridlines — but the CARD doesn't have that constraint and was
// over-locked by Phase 27.1, killing the ~25% corner-peek visual
// the user wanted. The natural variable offset between this free-
// floating card and the lane-snapped ghost (`ΔX` ranges from 0 at
// sub-lane boundaries to W at sub-lane centers, mid-canvas) is
// what produces the corner-peek L-shape. Drop math (pan onEnd
// `dropShiftX`) is unchanged and continues to land the appointment
// at the ghost — the card is purely a finger-following preview,
// not the source of truth for the drop. The four mini-cols inputs
// (`bodyBlockWidth`, `techCount`, `columnCount`, `scrollX`) are
// kept as props for back-compat / future use but are no longer
// consumed by `draggingAnimatedStyle`. See README-FORK Phase 29
// and `docs/PLAN-DEVIATIONS.md#2026-05-06-card-floats-ghost-snaps`.
//
// PLAN-DEVIATION: 2026-05-06-card-floats-ghost-snaps —
// docs/PLAN-DEVIATIONS.md#2026-05-06-card-floats-ghost-snaps
var DraggableEvent = ({
  selectedEvent,
  eventStartedTop,
  panYAbs,
  panXAbs,
  APPOINTMENT_BLOCK_WIDTH,
  hourHeight,
  eventHeight,
  styleOverrides,
  slots,
  // FORK Phase 16 (P2-FE-4 follow-up #12): in mini-columns mode with
  // 2+ techs the floating drag card shrinks from BODY_BLOCK_WIDTH to
  // lane width so it visually "stays in lane" as the user moves
  // between techs. Defaults to undefined so all other modes keep the
  // historical full-block width. Title clipping on narrow lanes is
  // intentional — the user has already read the card by the time they
  // start dragging it. Companion features: vertical lane lines (also
  // mounted only in mini-columns 2+ tech) and the snap-target shadow.
  // PLAN-DEVIATION: 2026-04-20-mini-cols-drop-shadow —
  // docs/PLAN-DEVIATIONS.md#2026-04-20-mini-cols-drop-shadow
  laneWidth,
  // FORK Phase 20 (P3-FE-DRAG-GHOST chunk a): SharedValue holding the
  // floating card's frozen pickup-time width. Captured in
  // `internalOnDoubleTap.current` (CalendarInner) at drag-init from
  // `apptWidthRef.current` (= the BODY_BLOCK_WIDTH at the moment of
  // pickup). When the visible tech roster changes mid-drag (dwell-swap
  // adding or removing a column), BODY_BLOCK_WIDTH changes and so does
  // the live `APPOINTMENT_BLOCK_WIDTH` prop above; the floating card
  // should NOT follow that change because the user picked up the card
  // at a specific size and expects it to stay that size until release.
  // Reads as `dragCardPickupWidth.value` inside useAnimatedStyle. 0 is
  // the "no pickup captured" sentinel that falls back to laneWidth /
  // APPOINTMENT_BLOCK_WIDTH (e.g. before drag, or in tests that mount
  // DraggableEvent directly without going through the gesture path).
  // See README-FORK Phase 20.
  dragCardPickupWidth,
  // FORK Phase 27.1 (P3-FE-DRAG-GHOST follow-up, 2026-05-06):
  // floating card X is now LANE-SNAPPED to the sub-lane the finger is
  // in (same value `resolveLaneDropPosition` returns to DropShadow).
  // The card no longer free-tracks the finger horizontally; instead
  // it jumps lane-to-lane in lockstep with the ghost so the visual
  // offset between card and ghost stays CONSTANT during the drag.
  // User clarification that drove this: *"the cards stay static in
  // their positioning to each other while being dragged. ... I need
  // the finger to not be the source of truth for where the card will
  // land. I need the shadow to be the source of truth"*. All four
  // props are required to engage the snap; if any is missing or
  // techCount < 2 the card falls back to the historical Phase 20.4
  // finger-following X, preserving single-tech / stacked / single-day
  // behavior unchanged. (This block is the second appearance of
  // Phase 20.7's plumbing — the first attempt was reverted in Phase
  // 26 because the diagnosis was wrong; Phase 27.1 brings it back
  // with the corrected geometry semantics.)
  bodyBlockWidth,
  techCount,
  columnCount,
  scrollX,
  // FORK Phase 27.2 (P3-FE-DRAG-GHOST follow-up, 2026-05-06): release-
  // animation SVs. See CalendarInner doc-block. All three are required
  // to engage the snap-in animation; if any is missing the animated
  // style falls back to the historical lane-snap / finger-following
  // path even after release (i.e., card teleports / unmounts as
  // before). Defensive — these are wired by CalendarInner and never
  // omitted in production.
  dragReleasing,
  releaseTargetX,
  releaseTargetY,
  // FORK Phase 32 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
  // 2026-05-07): the `layoutHeight` and `touchY` props from the
  // Phase 30.2/30.3 visual yShift envelope are no longer accepted.
  // The card render uses pure Phase 29 finger-following geometry;
  // Y reachability lives in the pan-onUpdate snap clamp.
  //
  // FORK Phase 35.1 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
  // 2026-05-07): `shadowOffsetYPx` SV is now consumed by this
  // component (Option B in the Phase 35.1 spec). When non-zero
  // (= rotation state), `draggingAnimatedStyle` lane-snaps the
  // card X to the finger's lane center instead of using the
  // corner-peek `panX - 2W/3` formula. This is a CONDITIONAL
  // lane-snap, only fires for the rotation cells (last visible
  // day in mini-cols mode); the corner-peek default for interior
  // cells is preserved unchanged. See PLAN-DEVIATION updates in
  // `docs/PLAN-DEVIATIONS.md#2026-05-06-card-floats-ghost-snaps`
  // for the override of the prior "do NOT lane-snap card"
  // anti-instruction.
  shadowOffsetYPx
}) => {
  const dynamicStyle = Animated2.useAnimatedStyle(() => {
    const pickup = dragCardPickupWidth?.value ?? 0;
    const effectiveWidth = pickup > 0
      ? pickup
      : (typeof laneWidth === "number" && laneWidth > 0 ? laneWidth : APPOINTMENT_BLOCK_WIDTH);
    return {
      height: eventHeight.value < hourHeight / 4 ? eventHeight.value : eventHeight.value - 4,
      width: effectiveWidth - 3,
      borderWidth: 1,
      borderColor: "rgba(0,0,0,0.12)"
    };
  }, [APPOINTMENT_BLOCK_WIDTH, laneWidth]);
  const draggingAnimatedStyle = Animated2.useAnimatedStyle(() => {
    if (!selectedEvent) {
      return {
        opacity: 0,
        transform: [
          {
            translateY: 0
          },
          {
            translateX: 0
          }
        ]
      };
    }
    const pickup = dragCardPickupWidth?.value ?? 0;
    const effectiveWidth = pickup > 0
      ? pickup
      : (typeof laneWidth === "number" && laneWidth > 0 ? laneWidth : APPOINTMENT_BLOCK_WIDTH);
    // FORK Phase 20.4 (P3-FE-DRAG-GHOST chunk b fourth follow-up,
    // 2026-05-06): card offset up-and-to-the-LEFT of the touch point
    // by 2/3 of its dimensions, so the finger covers approximately
    // the bottom-right 1/3 of the card and the top-left 2/3 peeks out
    // above-and-to-the-left of the finger. User feedback that drove
    // this: *"the touch point card sits too much under the finger,
    // if you could move it up and to the left about 33% of the card
    // covered by the finger that would be great."*
    //
    // FORK Phase 29 (P3-FE-DRAG-CORNER-PEEK, 2026-05-06): the Phase
    // 27.1 lane-snap branch (which forced card.X to track the
    // ghost's sub-lane in lockstep) was REMOVED. Card now free-
    // floats with the finger using only the Phase 20.4 offset; the
    // ghost still lane-snaps inside DropShadow. User insight that
    // drove the revert: *"only the ghost (the drop-zone marker)
    // needs to be lane-snapped so it doesn't straddle visible
    // gridlines. The card is the floating preview that follows the
    // finger and is supposed to float freely. Two-card 'unison'
    // doesn't require constant offset — it just requires both to
    // respond to finger movement on the same frame."* Both still
    // respond every frame (panXAbs and resolveLaneDropPosition both
    // re-fire on every pan onUpdate), so the natural offset between
    // free-floating card and lane-snapped ghost produces the desired
    // ~25% corner-peek L-shape. Drop continues to land at the ghost
    // (the pan onEnd dropShiftX = laneWidth*attenuation is unchanged
    // from Phase 28.1 — the card isn't the source of truth for the
    // drop, it's the finger-tracking preview).
    //
    // (Geometry summary inlined above the new H/2 pickup return
    // value below. Retained the older Phase 33-era summary block
    // here only as a navigation anchor — the authoritative summary
    // for Phase 35 is the doc-block immediately above the
    // `translateY / translateX` return.)
    //
    // PLAN-DEVIATION: 2026-05-06-card-floats-ghost-snaps —
    // docs/PLAN-DEVIATIONS.md#2026-05-06-card-floats-ghost-snaps.
    // FORK Phase 27.2 (P3-FE-DRAG-GHOST follow-up, 2026-05-06): if the
    // user has released and we're animating the card into the ghost's
    // sub-lane, read the smoothly-animated `releaseTargetX` /
    // `releaseTargetY` instead of the lane-snapped X / finger-following
    // Y. This bypass is necessary because both `snap_X` (a step
    // function over panXAbs) and `snap_Y` (rounded to snapInterval)
    // would jump-cut, not interpolate — without an override SV the
    // card would teleport even with `withTiming(panXAbs.value)`. The
    // pan onEnd worklet sets `releaseTargetX/Y` to the card's current
    // visual position, flips `dragReleasing.value = true`, then
    // animates `releaseTargetX/Y` to the ghost's position with
    // `withTiming(150ms)`. The completion callback flips
    // `dragReleasing` and `isDragging` back to false. See README-FORK
    // Phase 27.2.
    if (dragReleasing && dragReleasing.value === true) {
      return {
        opacity: 1,
        transform: [
          { translateY: releaseTargetY.value },
          { translateX: releaseTargetX.value }
        ]
      };
    }
    // FORK Phase 29 (P3-FE-DRAG-CORNER-PEEK, 2026-05-06): card now
    // free-floats with the finger via the Phase 20.4 offset
    // (`-effectiveWidth*2/3` X, `-eventHeight*2/3` Y at the time —
    // Y was later changed to `-eventHeight/3` in Phase 33). The
    // Phase 27.1 lane-snap branch that previously locked card.X to
    // the ghost's sub-lane was REMOVED here. The ghost still snaps
    // (DropShadow unchanged). The natural offset between the free-
    // floating card and the lane-snapped ghost is what produces the
    // "corner peek" L-shape the user wants. Drop continues to land
    // at the ghost (the pan onEnd worklet's dropShiftX/Y is
    // unchanged), so "drop = ghost" still holds even though the
    // visual card is decoupled.
    //
    // FORK Phase 32 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
    // 2026-05-07): the Phase 30.2/30.3 visual yShift is removed.
    // Card now uses pure Phase 29 finger-following geometry. The
    // touch-feel issue ("card jumps away from finger") that
    // appeared when the card was driven from the rectangle helper
    // (Phase 31) is resolved by reverting to this formula. Y-edge
    // reachability is handled by the pan-onUpdate snap clamp
    // accounting for the pickup offset (see Phase 33 Y-clamp math),
    // not by a visual shift on the card.
    //
    // FORK Phase 33 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
    // 2026-05-07): pickup offset Y changed from `2H/3` to `H/3`.
    // User feedback after Phase 32 shipped: *"have the appointment
    // card sit more under the touch zone. Right now it is completely
    // outside of my finger... I need it at least half way under the
    // finger so it's just poking out from under it."*
    //
    // FORK Phase 35 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
    // 2026-05-07): pickup offset Y moved to `H/2` (centered).
    // User feedback after Phase 33 + 34 shipped: *"the card still
    // hovers too far away from the center of the finger, I can't
    // see any improvement with that, it might even be worse."*
    // Phase 33 already halved Y from `2H/3` to `H/3` and the user
    // saw no improvement, so Phase 35 takes the next step — full
    // vertical center on the finger.
    //
    // The X pickup offset stays at `effectiveWidth * 2 / 3` per
    // user instruction during the 2026-05-07 redirect:
    //   *"The drop zone shadow can't be removed from it's relative
    //   position to the card. That's non-negotiable."*
    // The card's `2W/3` left-shift is what produces the corner-peek
    // L-shape alongside the ghost's `-laneWidth` X shift; changing
    // it would re-flatten the card-vs-ghost spatial relationship
    // the user explicitly wants preserved.
    //
    // Geometry summary after Phase 35.1 (mini-cols 2+ tech):
    //
    // INTERIOR CELLS (default — corner-peek L-shape preserved):
    //   finger    ≈ (panX, panY)
    //   card_TL   ≈ (panX - 2W/3, panY - H/2)              // X = corner-peek (Phase 33: -2W/3); Y = centered (Phase 35: -H/2; was -H/3 in Phase 33, -2H/3 in Phase 29)
    //   ghost_TL  ≈ (snap_X - laneWidth, snap_Y - H/2)     // -1 lane LEFT, half-event-height ABOVE snap row (Phase 32-34)
    //   drop_TL   ≈ ghost_TL                                // dropShiftX = laneWidth, dropShiftY = H/2
    //
    // CROSS-DAY FIRST LANES (e.g. Tue Josh in 4×3, flat clamp):
    //   ghost_TL  ≈ (snap_X, snap_Y - H/2)                 // xStep=0 (Phase 34 cross-day), yPx=0 (no rotation)
    //   card_TL   ≈ (panX - 2W/3, panY - H/2)              // corner-peek X kept
    //   drop_TL   ≈ ghost_TL                                // dropShiftX = 0, dropShiftY = H/2
    //
    // LAST DAY ALL LANES (rotation cells, e.g. Thu Josh / Jake / Trey):
    //   ghost_TL  ≈ (snap_X, snap_Y - H)                   // xStep=0, yPx=-H/2 → ghost ONE FULL H above snap row
    //   card_TL   ≈ (snap_X, snap_Y)                        // Phase 35.1 Option B lane-snap: card centered on finger's lane
    //   drop_TL   ≈ ghost_TL = (snap_X, snap_Y - H)         // dropShiftX = 0, dropShiftY = H
    //
    // FORK Phase 35.1 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
    // 2026-05-07): when in rotation state (`shadowOffsetYPx.value
    // !== 0`), the card lane-snaps to the finger's lane center
    // (Option B in the Phase 35.1 spec). Without this, the card
    // would render at `panX - 2W/3` while the shadow renders at
    // `snap_X` (finger's lane), creating a visual disconnect at
    // the rotation cells where shadow ends up RIGHT-of-card while
    // historically being LEFT-of-card. Lane-snapping the card in
    // rotation puts both card and shadow in the same lane stacked
    // vertically (shadow above), preserving the user's "shadow
    // adjacent to card" mental model.
    //
    // The PLAN-DEVIATION 2026-05-06-card-floats-ghost-snaps
    // anti-instruction ("Do NOT re-introduce the lane-snap branch
    // in DraggableEvent.draggingAnimatedStyle") was concerned with
    // UNCONDITIONAL lane-snap killing the corner-peek visual.
    // Phase 35.1's lane-snap is CONDITIONAL on rotation state —
    // corner-peek survives unchanged for default cells. The
    // anti-instruction was updated to allow the conditional
    // lane-snap; see the PLAN-DEVIATIONS.md update.
    //
    // The `bodyBlockWidth`, `techCount`, `columnCount`, `scrollX`
    // closure-captures: read at worklet creation time. The Phase
    // 29 anti-instruction warned against ADDING THESE TO THE DEPS
    // because that re-creates the worklet on every roster /
    // orientation change. Phase 35.1 reads them at worklet
    // creation but does NOT add them to deps — they're stable
    // during a single drag (drag in flight blocks structural
    // changes per existing architecture), so worklet-level capture
    // is sufficient.
    //
    // PLAN-DEVIATION: 2026-05-06-card-floats-ghost-snaps —
    // docs/PLAN-DEVIATIONS.md#2026-05-06-card-floats-ghost-snaps
    var yPxValue = shadowOffsetYPx?.value ?? 0;
    var inRotation = yPxValue !== 0;
    var translateXValue;
    if (inRotation && typeof bodyBlockWidth === "number" && bodyBlockWidth > 0 && typeof techCount === "number" && techCount >= 2) {
      // Phase 35.1 Option B: lane-snap card to finger's lane center.
      var laneWidthForCard = bodyBlockWidth / techCount;
      var rawColIdx = Math.floor((panXAbs.value - TIME_LABEL_WIDTH) / bodyBlockWidth);
      var clampedColIdx = rawColIdx < 0
        ? 0
        : (typeof columnCount === "number" && columnCount > 0 && rawColIdx > columnCount - 1)
          ? columnCount - 1
          : rawColIdx;
      var xWithinCol = panXAbs.value - TIME_LABEL_WIDTH - clampedColIdx * bodyBlockWidth;
      var rawLaneIdx = Math.floor(xWithinCol / laneWidthForCard);
      var clampedLaneIdx = rawLaneIdx < 0
        ? 0
        : rawLaneIdx > techCount - 1
          ? techCount - 1
          : rawLaneIdx;
      var scrollXValue = scrollX?.value ?? 0;
      translateXValue = TIME_LABEL_WIDTH + clampedColIdx * bodyBlockWidth + clampedLaneIdx * laneWidthForCard - scrollXValue;
    } else {
      // Default corner-peek: card free-floats with the finger.
      translateXValue = panXAbs.value - (effectiveWidth * 2) / 3;
    }
    return {
      opacity: 1,
      transform: [
        {
          translateY: panYAbs.value - eventHeight.value / 2
        },
        {
          translateX: translateXValue
        }
      ]
    };
  }, [selectedEvent, APPOINTMENT_BLOCK_WIDTH, laneWidth]);
  const initialDisplayTime = React19.useMemo(() => {
    const start = minutesToTime(positionToMinutes(eventStartedTop.value, hourHeight));
    const end = minutesToTime(positionToMinutes(eventStartedTop.value + eventHeight.value, hourHeight));
    return `${start} - ${end}`;
  }, [hourHeight]);
  const animatedTimeProps = Animated2.useAnimatedProps(() => {
    const start = minutesToTime(positionToMinutes(eventStartedTop.value, hourHeight));
    const end = minutesToTime(positionToMinutes(eventStartedTop.value + eventHeight.value, hourHeight));
    return {
      text: `${start} - ${end}`
    };
  }, [hourHeight]);
  const resolved = typeof styleOverrides === "function" ? styleOverrides(selectedEvent) ?? {} : styleOverrides ?? {};
  const TopRight = slots?.TopRight;
  const Body = slots?.Body;
  const titleFace = useResolvedFont({ fontWeight: "700" });
  const timeFace = useResolvedFont({ fontWeight: "600" });
  return /* @__PURE__ */ React19__namespace.createElement(Animated2__default.default.View, { style: [styles6.event, dynamicStyle, draggingAnimatedStyle, resolved?.container] }, /* @__PURE__ */ React19__namespace.createElement(Col_default, { style: [{ position: "relative" }, resolved?.content] }, /* @__PURE__ */ React19__namespace.createElement(
    AnimatedTextInput,
    {
      editable: false,
      allowFontScaling: false,
      underlineColorAndroid: "transparent",
      style: [{
        width: "100%",
        fontFamily: timeFace,
        fontSize: getTextSize(hourHeight),
        pointerEvents: "none",
        padding: 0,
        margin: 0,
        color: "black"
      }, resolved?.time],
      defaultValue: initialDisplayTime,
      animatedProps: animatedTimeProps
    }
  ), Body ? /* @__PURE__ */ React19__namespace.createElement(Body, { event: selectedEvent, ctx: { hourHeight } }) : /* @__PURE__ */ React19__namespace.createElement(React19__namespace.Fragment, null, /* @__PURE__ */ React19__namespace.createElement(Row_default, { style: { alignItems: "center", height: 18 } }, /* @__PURE__ */ React19__namespace.createElement(
    reactNative.Text,
    {
      allowFontScaling: false,
      style: [{
        fontFamily: titleFace,
        fontSize: getTextSize(hourHeight),
        fontWeight: "700"
      }, resolved?.title]
    },
    selectedEvent?.title
  )), /* @__PURE__ */ React19__namespace.createElement(
    reactNative.Text,
    {
      allowFontScaling: false,
      style: [{
        fontFamily: timeFace,
        fontSize: getTextSize(hourHeight),
        fontWeight: "600"
      }, resolved?.desc]
    },
    selectedEvent?.description
  )), /* @__PURE__ */ React19__namespace.createElement(Row_default, { style: {
    position: "absolute",
    right: 2
  }, space: 2 }, TopRight ? /* @__PURE__ */ React19__namespace.createElement(TopRight, { event: selectedEvent, ctx: { hourHeight } }) : null)), /* @__PURE__ */ React19__namespace.createElement(Row_default, { style: {
    position: "absolute",
    alignSelf: "center",
    bottom: 0
  } }, /* @__PURE__ */ React19__namespace.createElement(vectorIcons.MaterialIcons, { name: "drag-handle", size: 12, color: "black" })));
};
var styles6 = reactNative.StyleSheet.create({
  event: {
    backgroundColor: "#4d959c",
    position: "absolute",
    borderRadius: 5,
    padding: 2,
    overflow: "hidden",
    zIndex: 99
    // Ensure events stay above the background blocks
  }
});
var EventBlocks = React19__namespace.default.memo(({
  id,
  onLongPress,
  onPress,
  // FORK Phase 17 (P2-FE-5 chunk 2b): pass-through for the new
  // double-tap drag-init path. Optional — EventBlock falls back to
  // immediate onPress when this is undefined.
  onDoubleTap,
  hourHeight,
  minuteOffset = 0,
  EVENT_BLOCK_WIDTH,
  eventRenderer,
  isEventDisabled,
  isEventSelected,
  mode,
  date: dateProp
}) => {
  const { useEventsFor: useEventsFor2, useGetDate: useGetDate2 } = useCalendarBinding();
  const date = useGetDate2();
  const events = useEventsFor2(id, dateProp ?? date);
  const frameMap = React19.useMemo(
    () => computeEventFrames(events, EVENT_BLOCK_WIDTH, mode),
    [events, mode, EVENT_BLOCK_WIDTH]
  );
  const Renderer = eventRenderer;
  return events?.map(
    (evt, index) => {
      const selected = isEventSelected?.(evt) ?? false;
      const disabled = isEventDisabled?.(evt) ?? false;
      return /* @__PURE__ */ React19__namespace.default.createElement(
        Renderer,
        {
          // FORK Phase 38 (2026-05-13): key by stable event id, not slot position,
          // so EventBlock instances do NOT get reused across appointment swaps in
          // the same slot. Slot-based keying caused stale rects in the consumer's
          // useEventBoundsRegistry after Future-mode toggles (see Phase 26 + the
          // README-FORK.md Phase 38 entry for the full rationale).
          key: evt.id,
          event: evt,
          onLongPress: (evt2) => onLongPress(evt2),
          onPress: (evt2) => onPress(evt2),
          onDoubleTap: onDoubleTap ? (evt2) => onDoubleTap(evt2) : void 0,
          hourHeight,
          minuteOffset,
          frame: frameMap.get(evt.id),
          selected,
          disabled
        }
      );
    }
  );
});
var EventBlocks_default = EventBlocks;
var DaysComponent = ({ onResourcePress, activeResourceId, mode, date, APPOINTMENT_BLOCK_WIDTH, multiDayCount, showResourceHeader = true }) => {
  const { useResourceById: useResourceById2 } = useCalendarBinding();
  const resource = useResourceById2(activeResourceId);
  useResolvedFont({ fontWeight: "700" });
  const subTitleFace = useResolvedFont({ fontWeight: "600" });
  const isMultiDay = mode !== "day";
  const visibleDayCount = isMultiDay ? multiDayCount ?? (mode === "week" ? 7 : 3) : 1;
  const days = React19.useMemo(
    () => Array.from({ length: visibleDayCount }, (_, i) => dateFns.addDays(date, i)),
    [date, visibleDayCount]
  );
  return /* @__PURE__ */ React19__namespace.createElement(Row_default, { style: { paddingVertical: 4 } }, /* @__PURE__ */ React19__namespace.createElement(Col_default, { style: { width: TIME_LABEL_WIDTH, alignItems: "center", justifyContent: "center" } }, showResourceHeader ? /* @__PURE__ */ React19__namespace.createElement(
    StaffAvatar,
    {
      onPress: () => {
        if (onResourcePress)
          onResourcePress(resource);
      },
      name: resource?.name,
      circleSize: TIME_LABEL_WIDTH - 12,
      fontSize: 16,
      image: resource?.avatar
    }
  ) : null), /* @__PURE__ */ React19__namespace.createElement(Row_default, { style: { flex: 1 } }, days.map((d, i) => {
    const selected = dateFns.isSameDay(d, /* @__PURE__ */ new Date());
    return /* @__PURE__ */ React19__namespace.createElement(
      Col_default,
      {
        style: {
          alignItems: "center",
          justifyContent: "center",
          width: APPOINTMENT_BLOCK_WIDTH
        },
        space: 4,
        key: d.toString()
      },
      /* @__PURE__ */ React19__namespace.createElement(Center_default, { style: {
        backgroundColor: selected ? "#4d959c" : void 0,
        width: Math.min(30, APPOINTMENT_BLOCK_WIDTH - 8),
        height: Math.min(30, APPOINTMENT_BLOCK_WIDTH - 8),
        borderRadius: 999
      } }, /* @__PURE__ */ React19__namespace.createElement(
        reactNative.Text,
        {
          style: {
            fontSize: 16,
            fontFamily: subTitleFace,
            fontWeight: "600",
            color: selected ? "#fff" : void 0
          },
          numberOfLines: 1,
          allowFontScaling: false
        },
        dateFns.format(d, "d")
      )),
      /* @__PURE__ */ React19__namespace.createElement(
        reactNative.Text,
        {
          style: {
            fontSize: 14,
            fontFamily: subTitleFace,
            fontWeight: "600"
          },
          numberOfLines: 1,
          allowFontScaling: false
        },
        dateFns.format(d, "EEE")
      )
    );
  })));
};
var AnimatedFlashList = Animated2__default.default.createAnimatedComponent(flashList.FlashList);
var CalendarInner = (props) => {
  const { width: windowWidth } = reactNative.useWindowDimensions();
  const isIOS = reactNative.Platform.OS === "ios";
  const binding = useCalendarBinding();
  const {
    date,
    numberOfColumns: numberOfColumnsProp = 3,
    startMinutes,
    endMinutes,
    hourHeight = 120,
    snapIntervalInMinutes = 5,
    timezone = Intl?.DateTimeFormat()?.resolvedOptions()?.timeZone,
    resources,
    onResourcePress,
    onResourceDoublePress,
    onResourceReorder,
    selectedResourceIds,
    onBlockLongPress,
    onBlockTap,
    onEventPress,
    onEventLongPress,
    // FORK Phase 17 (P2-FE-5 chunk 2b): consumer hook for the new
    // double-tap-drag init. Library starts drag automatically on
    // double-tap; this callback fires synchronously so consumers can
    // observe the gesture (e.g. dismiss a foreign sheet, log
    // analytics) without owning the drag state. See README-FORK
    // Phase 17 + the `2026-04-22-double-tap-drag` deviation.
    onEventDoubleTap,
    onDisabledBlockPress,
    enableHapticFeedback = false,
    eventSlots,
    eventStyleOverrides,
    overLappingLayoutMode = "stacked",
    mode = "day",
    activeResourceId,
    multiDayCount,
    scrollsToTop = true,
    onZoom,
    viewportWidth,
    showResourceHeader = true,
    multiTechMode,
    // FORK Phase 24 (PR-UX-2 / move-chain arrow overlay): callback the
    // library invokes once on mount with its internal `scrollY`
    // SharedValue. Consumers use this to translate absolutely-positioned
    // overlays in lockstep with the calendar body's vertical scroll.
    // See README-FORK Phase 24 for the full contract + the type-block
    // in dist/index.d.ts.
    onScrollYRef,
    // FORK Phase 24-x (2026-05-10 — landscape arrow horizontal anchoring
    // bug fix): mirror callbacks for the FlashList horizontal scroll
    // offset (`scrollX`) and the zoom-pan transform (`zoomTX`/`zoomTY`).
    // Without these, an external overlay (move-chain arrows) only
    // compensates for vertical scroll and drifts when the user pans
    // horizontally OR uses the 1-finger zoom-pan gesture, because the
    // calendar body translates by `(zoomTX, zoomTY)` via `zoomStyle`
    // and the FlashList horizontally scrolls by `scrollX`. Same
    // read-only contract as `onScrollYRef`. The library owns the
    // writes to all three SVs; consumers only `.value` from worklets.
    onScrollXRef,
    onContentTransformRef,
    // FORK Phase 21 (P3-FE-DRAG-GHOST chunk b): per-resource color
    // resolver consumed only by the drop-target ghost overlay. When
    // provided AND multiTechMode === "mini-columns" with 2+ techs, the
    // overlay tints each lane's ghost outline by the destination tech.
    // Omit to skip the ghost. See README-FORK Phase 21.
    getResourceColor,
    // FORK Phase 28.2-logging (P3-FE-DRAG-GHOST follow-up, 2026-05-06):
    // optional stable identifier for this Calendar instance. Threaded
    // into every `[CAL:*]` log line via the `logCal` helper below so a
    // multi-calendar app (DAY-PORTRAIT + WEEK-PORTRAIT + WORKWEEK-
    // LANDSCAPE in REMITechnician) can attribute log lines to the
    // emitting calendar without scrolling the call stack. When absent,
    // logs fall back to today's `[CAL:${subtag}]` form so existing
    // consumers see no change. See README-FORK Phase 28.2-logging.
    calendarId,
    // FORK Phase 37 (2026-05-12 — arrow lane-order source of truth):
    // fired once on mount and again whenever the library's internal
    // `bodyResourceIds` array changes. `bodyResourceIds` is the
    // SELECTION-FILTERED, RESOURCES-PROP-ORDERED id list the body
    // grid actually paints lanes for in mini-cols / stacked modes
    // (`techsToRender.map((trid, i) => left: i * laneWidth)`).
    // Consumers that overlay arrows or other geometry on top of the
    // calendar should derive their per-tech X coordinates from THIS
    // array's order, not from any consumer-side `selectedResourceIds`
    // (selection order) array — they can differ when the consumer
    // hands the calendar a `resources` prop that isn't already in
    // selection order. See README-FORK Phase 37 + the
    // `2026-05-12-arrow-lane-order-from-vendor` plan deviation.
    onBodyResourceIdsChange
  } = props;
  // FORK (Phase 10 — viewportWidth prop): all column-sizing math is
  // derived from `width` below. Historically `width` came straight from
  // `useWindowDimensions()`, which only worked when the calendar owned
  // the full viewport (portrait + full-bleed mounts). The landscape
  // canvas renders the calendar inside a constrained container (side
  // avatar strip eats horizontal space) so window width is wider than
  // the calendar's own wrapper and the `DaysComponent` date labels —
  // plus the body columns — would bleed outside the wrapper. Consumers
  // mounting inside constrained containers pass a measured width via
  // the `viewportWidth` prop. Everywhere else keeps the historical
  // `useWindowDimensions()` fallback and renders unchanged.
  const width = typeof viewportWidth === "number" && viewportWidth > 0 ? viewportWidth : windowWidth;
  const isMultiDay = mode !== "day";
  const visibleDayCount = isMultiDay ? multiDayCount ?? (mode === "week" ? 7 : 3) : 1;
  const numberOfColumns = mode === "day" ? numberOfColumnsProp : visibleDayCount;
  const startHour = Math.floor((startMinutes ?? 0) / 60);
  const endHour = Math.ceil((endMinutes ?? 1440) / 60);
  const displayHours = endHour - startHour;
  const minuteOffset = startHour * 60;
  const totalDayHeight = displayHours * hourHeight;
  const days = React19.useMemo(
    () => Array.from({ length: visibleDayCount }, (_, i) => dateFns.addDays(date, i)),
    [date, visibleDayCount]
  );
  const snapInterval = hourHeight / 60 * snapIntervalInMinutes;
  const onPressRef = React19__namespace.default.useRef(onEventPress);
  const onLongPressRef = React19__namespace.default.useRef(onEventLongPress);
  const internalOnLongPress = React19.useRef(null);
  // FORK Phase 17 (P2-FE-5 chunk 2b): mirror of the long-press
  // ref/effect pair for the new double-tap path. Drag init lives in
  // `internalOnDoubleTap.current` (was inside `internalOnLongPress`
  // pre-Phase-17).
  const onDoubleTapRef = React19__namespace.default.useRef(onEventDoubleTap);
  const internalOnDoubleTap = React19.useRef(null);
  const onDisabledBlockPressRef = React19__namespace.default.useRef(onDisabledBlockPress);
  const selectedRef = React19.useRef(props.isEventSelected);
  const disabledRef = React19.useRef(props.isEventDisabled);
  const effectiveRenderer = React19.useMemo(() => {
    return (p) => /* @__PURE__ */ React19__namespace.default.createElement(
      EventBlock_default,
      {
        ...p,
        slots: props.eventSlots,
        styleOverrides: props.eventStyleOverrides,
        // FORK Phase 25 (PR-UX-2 / move-chain tile pulse, 2026-05-05).
        getEventOpacity: props.getEventOpacity,
        // FORK Phase 26 (2026-05-10 — move-chain arrow alignment).
        // Pass the consumer's bounds-report callback through to
        // each EventBlock. When undefined, EventBlock skips the
        // onLayout wiring entirely.
        onEventLayout: props.onEventLayout
      }
    );
  }, [eventSlots, eventStyleOverrides, props.getEventOpacity, props.onEventLayout]);
  const isEventSelectedStable = React19.useCallback(
    (ev) => selectedRef.current ? selectedRef.current(ev) : false,
    []
  );
  const isEventDisabledStable = React19.useCallback(
    (ev) => disabledRef.current ? disabledRef.current(ev) : false,
    []
  );
  React19.useEffect(() => {
    onPressRef.current = onEventPress;
  }, [onEventPress]);
  React19.useEffect(() => {
    onLongPressRef.current = onEventLongPress;
  }, [onEventLongPress]);
  React19.useEffect(() => {
    onDoubleTapRef.current = onEventDoubleTap;
  }, [onEventDoubleTap]);
  React19.useEffect(() => {
    onDisabledBlockPressRef.current = onDisabledBlockPress;
  }, [onDisabledBlockPress]);
  const onZoomRef = React19.useRef(onZoom);
  React19.useEffect(() => {
    onZoomRef.current = onZoom;
  }, [onZoom]);
  const fireZoom = React19.useCallback((scale) => {
    onZoomRef.current?.(scale);
  }, []);
  React19.useEffect(() => {
    selectedRef.current = props.isEventSelected;
  }, [props.isEventSelected]);
  React19.useEffect(() => {
    disabledRef.current = props.isEventDisabled;
  }, [props.isEventDisabled]);
  const stableOnPress = React19__namespace.default.useCallback((e) => onPressRef.current?.(e), []);
  const stableOnDisabledBlockPress = React19__namespace.default.useCallback((b) => onDisabledBlockPressRef.current?.(b), []);
  const { useGetSelectedEvent: useGetSelectedEvent2, useSetSelectedEvent: useSetSelectedEvent2, useSetDraggedEventDraft: useSetDraggedEventDraft2, useGetDraggedEventDraft: useGetDraggedEventDraft2 } = useCalendarBinding();
  const selectedEvent = useGetSelectedEvent2();
  const setSelectedEvent = useSetSelectedEvent2();
  const setDraggedEventDraft = useSetDraggedEventDraft2();
  const APPOINTMENT_BLOCK_WIDTH = (width - TIME_LABEL_WIDTH) / numberOfColumns;
  React19.useEffect(() => {
    // FORK Phase 28.2-logging — route through logCal so the calendarId is included.
    if (__DEV__) logCal("lib", "layout params", { numberOfColumns, headerABW: Math.round(APPOINTMENT_BLOCK_WIDTH), totalW: Math.round(APPOINTMENT_BLOCK_WIDTH * numberOfColumns), viewportW: width, windowW: windowWidth, viewportOverride: typeof viewportWidth === "number", hourHeight, contentH: totalDayHeight, displayHours, minuteOffset });
  }, [numberOfColumns, APPOINTMENT_BLOCK_WIDTH, hourHeight, width, windowWidth, viewportWidth, totalDayHeight, displayHours]);
  const hourHeightRef = React19.useRef(hourHeight);
  const resourcesRef = React19.useRef(resources);
  const apptWidthRef = React19.useRef(APPOINTMENT_BLOCK_WIDTH);
  // FORK Phase 20.1 (P3-FE-DRAG-GHOST chunk a follow-up, 2026-05-06):
  // ref tracking the per-EVENT-BLOCK width — i.e. the width that
  // EventBlocks in the body grid actually render at. In single-tech /
  // stacked / non-multi-tech modes this is BODY_BLOCK_WIDTH (the
  // day-column width); in mini-cols it's BODY_BLOCK_WIDTH / techCount
  // (the per-tech lane width inside one day-column). Captured at
  // drag-init into `dragCardPickupWidth` so the floating drag card
  // visually matches the source card's size — and stays in sync with
  // the destination lane width (since `resolveLaneDropPosition` also
  // returns laneWidth in mini-cols), satisfying the "card size = lane
  // width = drop zone" contract. Updated in the same useEffect that
  // updates `apptWidthRef`. See README-FORK Phase 20.1.
  const pickupVisualWidthRef = React19.useRef(APPOINTMENT_BLOCK_WIDTH);
  // FORK Phase 36 (PR-UX-11, 2026-05-09): refs that mirror the live
  // `bodyResourceIds` / `multiTechMode` props so the doubleTap drag-
  // init worklet can compute the dragged card's LANE position
  // (column-left + laneIndex * laneWidth + laneWidth/2) instead of
  // the column center. The previous formula put `panXAbs` at the
  // column center on pickup, causing the floating card to "jump"
  // away from the source lane in mini-cols mode (especially noticeable
  // at 4+ techs where each lane is only ~30pt wide and the column
  // center can be 80pt+ from a side-lane card's actual position).
  // User report: "the cards show up pretty far from my finger when
  // I pick them up after 4+ techs, and really start to shift away at
  // even 3 techs." See README-FORK Phase 36 + PR-UX-11 entry in
  // docs/DEVELOPMENT-LOG.md for the full geometry derivation.
  const bodyResourceIdsRef = React19.useRef([]);
  const multiTechModeRef = React19.useRef(undefined);
  const isMultiDayRef = React19.useRef(isMultiDay);
  const daysRef = React19.useRef(days);
  React19.useEffect(() => {
    hourHeightRef.current = hourHeight;
  }, [hourHeight]);
  React19.useEffect(() => {
    resourcesRef.current = resources;
  }, [resources]);
  // FORK: apptWidthRef is updated from BODY_BLOCK_WIDTH below (after
  // bodyResourceIds is computed) so all body worklet math (auto-scroll,
  // initial pan position) uses the body column width, not the header width.
  React19.useEffect(() => {
    isMultiDayRef.current = isMultiDay;
  }, [isMultiDay]);
  React19.useEffect(() => {
    daysRef.current = days;
  }, [days]);
  React19.useEffect(() => {
    // FORK Phase 28.2-logging — route through logCal for calendarId tagging.
    if (__DEV__) logCal("gesture", "selectedEvent changed", { id: selectedEvent?.id ?? null, hasEvent: !!selectedEvent });
    if (!selectedEvent) {
      setDraggedEventDraft(null);
      setDragReady(false);
    }
  }, [selectedEvent, setSelectedEvent, setDraggedEventDraft]);
  React19.useEffect(() => {
    scrollX.value = 0;
  }, [mode, numberOfColumns]);
  const verticalScrollViewRef = Animated2.useAnimatedRef();
  const headerScrollViewRef = Animated2.useAnimatedRef();
  const flashListRef = React19.useRef(null);
  const prevResourceIdsRef = React19.useRef([]);
  const [layout, setLayout] = React19.useState(null);
  const [dragReady, setDragReady] = React19.useState(false);
  const dateRef = React19.useRef(date);
  const originalDurationRef = React19.useRef(0);
  const eventStartedTop = Animated2.useSharedValue(0);
  const eventHeight = Animated2.useSharedValue(0);
  // FORK Phase 18 (P2-FE-6 chunk a): panXAbs / panYAbs / isDragging
  // are now provided by CalendarBindingProvider via DragSharedValuesCtx
  // so sibling consumers (drag-to-avatar overlay) can subscribe to the
  // same instances via useAnimatedReaction. Behavior inside
  // CalendarInner is unchanged — these SVs continue to be written by
  // the same gesture handlers (pan onUpdate, doubleTap drag-init)
  // and read by the same animated styles (DraggableEvent, DropShadow).
  // See README-FORK Phase 18.
  //
  // FORK Phase 19 (P2-FE-6 chunk b): also pull `fingerXAbs` /
  // `fingerYAbs` so the pan onUpdate worklet can mirror the raw
  // `evt.absoluteX` / `evt.absoluteY` finger window-coords each
  // frame. Used by the drag-to-avatar hit-test which needs the
  // unclamped finger position (panXAbs is hard-clamped to the
  // grid's interior). See README-FORK Phase 19.
  // FORK Phase 20 (P3-FE-DRAG-GHOST chunk a): also pull
  // `dragCardPickupWidth` so the doubleTap drag-init can capture the
  // current `BODY_BLOCK_WIDTH` (via apptWidthRef) and DraggableEvent
  // can render at the captured size instead of the live prop value.
  // See README-FORK Phase 20.
  const { panXAbs, panYAbs, isDragging, fingerXAbs, fingerYAbs, dragCardPickupWidth } = useDragSharedValues();
  // FORK Phase 27.2 (P3-FE-DRAG-GHOST follow-up, 2026-05-06): release-
  // animation SVs. When the user lifts off the screen in mini-cols 2+
  // tech mode, the floating card slides from its release position
  // (= finger's sub-lane, lane-snapped) to the ghost's position
  // (= sub-lane to the left, snapped time slot up by H/2) over ~150ms
  // before unmounting. While `dragReleasing.value === true`, the
  // floating card's animated style reads from `releaseTargetX` /
  // `releaseTargetY` (animated via `withTiming`) instead of the
  // lane-snap derived from `panXAbs`. After the timing completes the
  // callback flips both `dragReleasing` and `isDragging` back to false
  // — that's why the `isDragging.value = false` flip in the pan onEnd
  // worklet is now deferred to the callback. The landed card pops in
  // synchronously (via `scheduleOnRN(finalizeDrag, ...)`) at the same
  // (snap_X - laneWidth, snap_Y - H/2) coordinate the floating card
  // is sliding to, so the two visually merge for the duration of the
  // animation and the user perceives a single card sliding into the
  // ghost's sub-lane. Outside mini-cols 2+ tech (single-tech, stacked,
  // single-day) the SVs are unused and the synchronous flip path
  // stays. User clarification that drove this: *"Make the card UNDER
  // THE FINGER slide to where the ghost is WHEN RELEASED... NOT WHILE
  // IT'S MOVING. ... So when released the shadow would technically
  // not budge at all, no movement, it stays right when it is when
  // released and the card slides over to the shadow to sit perfectly
  // on top of it."* See README-FORK Phase 27.2.
  const dragReleasing = Animated2.useSharedValue(false);
  const releaseTargetX = Animated2.useSharedValue(0);
  const releaseTargetY = Animated2.useSharedValue(0);
  // FORK Phase 32 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY, 2026-05-07):
  // animated discrete-step shadow offset on the X axis. Mid-canvas
  // settles at -1 (ghost one full lane LEFT of finger, the
  // historical Phase 27.1 relationship). At the leftmost or
  // rightmost lane the SV animates to 0 (ghost in finger's lane,
  // letting the user drop on the edge lane). The SV transitions
  // between -1 and 0 via withTiming(150ms), driven by
  // `useAnimatedReaction` below — same primitive as the post-release
  // snap-in slide. Default `-1` so the first frame of a drag
  // matches the mid-canvas aesthetic; the reaction below adjusts
  // immediately if the finger is on an edge lane at pickup.
  const shadowOffsetXSteps = Animated2.useSharedValue(-1);
  // FORK Phase 35.1 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY, 2026-05-07):
  // perpendicular Y axis offset for the rotation rule. Default 0
  // (no Y shift — corner-peek L-shape unchanged). When the finger
  // enters the last visible day in mini-cols mode, this animates
  // to `-eventHeight / 2` via `withTiming(150ms)` so the shadow
  // visually rotates from "lane LEFT of card" to "card's own lane,
  // shifted up by H/2". Driven by the same `useAnimatedReaction`
  // below — the helper now returns `{ xStep, yPx }` and both SVs
  // are written in parallel.
  //
  // PLAN-DEVIATION: 2026-05-07-x-edge-drop-clamp —
  // docs/PLAN-DEVIATIONS.md#2026-05-07-x-edge-drop-clamp.
  // This SV exists per the user's explicit Phase 35.1 redirect,
  // overriding the prior Phase 35-base anti-instruction that said
  // "DO NOT add a separate `shadowOffsetYPx` SharedValue without
  // re-asking the user". The smoke evidence (Thu Jake unreachable)
  // re-asked the user, and the user re-instructed.
  const shadowOffsetYPx = Animated2.useSharedValue(0);
  const isPinching = Animated2.useSharedValue(false);
  const pinchBaseHeight = Animated2.useSharedValue(0);
  const isZooming = Animated2.useSharedValue(false);
  const zoomBaseHourHeight = Animated2.useSharedValue(0);
  const zoomTX = Animated2.useSharedValue(0);
  const zoomTY = Animated2.useSharedValue(0);
  const savedTX = Animated2.useSharedValue(0);
  const savedTY = Animated2.useSharedValue(0);
  const scrollX = Animated2.useSharedValue(0);
  const scrollY = Animated2.useSharedValue(0);
  // FORK Phase 24 (PR-UX-2 / move-chain arrow overlay): hand the
  // scroll SharedValue back to the consumer so an external overlay
  // can translate in lockstep with body content. The SV identity is
  // stable across renders, so we only need to call this when the
  // callback ref changes — guarded by useEffect so we don't spam.
  // Read-only contract from the consumer side; the library owns the
  // writes. See README-FORK Phase 24.
  React19.useEffect(() => {
    onScrollYRef?.(scrollY);
  }, [onScrollYRef, scrollY]);
  // FORK Phase 24-x (2026-05-10 — landscape arrow horizontal anchoring
  // bug fix): expose the horizontal-scroll SV and the zoom-pan
  // transform SVs to consumers. SV identities are stable across
  // re-renders so each callback fires once on mount. See
  // README-FORK Phase 24-x and `MoveChainArrowOverlay`'s combined
  // animated-style worklet for the consumer contract.
  React19.useEffect(() => {
    onScrollXRef?.(scrollX);
  }, [onScrollXRef, scrollX]);
  React19.useEffect(() => {
    onContentTransformRef?.({ zoomTX, zoomTY });
  }, [onContentTransformRef, zoomTX, zoomTY]);
  const autoScrollSpeed = Animated2.useSharedValue(0);
  const autoScrollXSpeed = Animated2.useSharedValue(0);
  const lastHapticScrollY = Animated2.useSharedValue(0);
  const lastXScrollTime = Animated2.useSharedValue(0);
  const startedX = Animated2.useSharedValue(0);
  const startedY = Animated2.useSharedValue(0);
  const touchY = Animated2.useSharedValue(0);
  const triggerHaptic = React19.useCallback(
    async (style = "Light") => {
      try {
        const Haptics = await import('expo-haptics');
        const feedbackStyle = Haptics.ImpactFeedbackStyle[style];
        if (enableHapticFeedback)
          await Haptics.impactAsync(feedbackStyle);
      } catch (e) {
        if (__DEV__) console.log("Haptics not available, skipping...");
      }
    },
    [enableHapticFeedback]
  );
  // FORK Phase 28.2-logging (P3-FE-DRAG-GHOST follow-up, 2026-05-06):
  // unified `logCal` helper. Emits `[CAL:${calendarId}:${subtag}]` when
  // `calendarId` is set and `[CAL:${subtag}]` otherwise so existing
  // grep patterns (`[CAL:gesture]`, `[CAL:lib]`, etc.) keep matching
  // and a tagged consumer also matches `[CAL:WORKWEEK-LANDSCAPE`.
  // `gestureLog` is now a thin wrapper that routes through `logCal`
  // with subtag="gesture" so every existing `scheduleOnRN(gestureLog,
  // ...)` call site keeps working untouched. See README-FORK
  // Phase 28.2-logging.
  const logCal = React19.useCallback((subtag, ...args) => {
    if (__DEV__) {
      const tag = calendarId ? `[CAL:${calendarId}:${subtag}]` : `[CAL:${subtag}]`;
      console.log(tag, ...args);
    }
  }, [calendarId]);
  const gestureLog = React19.useCallback((...args) => {
    if (__DEV__) {
      const tag = calendarId ? `[CAL:${calendarId}:gesture]` : "[CAL:gesture]";
      console.log(tag, ...args);
    }
  }, [calendarId]);
  const zoomStyle = Animated2.useAnimatedStyle(() => {
    if (zoomTX.value === 0 && zoomTY.value === 0) return {};
    return {
      transform: [
        { translateX: zoomTX.value },
        { translateY: zoomTY.value },
      ],
    };
  });
  const resourceIds = React19.useMemo(() => {
    const ids = resources?.map((item) => item?.id) || [];
    if (JSON.stringify(prevResourceIdsRef.current) !== JSON.stringify(ids)) {
      prevResourceIdsRef.current = ids;
    }
    return prevResourceIdsRef.current;
  }, [resources]);
  // FORK: bodyResourceIds is the resourceIds list filtered by the
  // multi-select. The HEADER always renders all resourceIds (so the user
  // can re-toggle dimmed avatars), but the BODY (FlashList of columns,
  // drag landing math, columns memo) uses bodyResourceIds so unselected
  // tech columns disappear and the remaining columns can be wider.
  //
  // PLAN-DEVIATION: 2026-04-20-revert-empty-array-semantics —
  // Phase 16 briefly tried to distinguish `selectedResourceIds === []`
  // ("consumer wants none rendered") from `=== undefined` ("no filter,
  // render all"). That broke `ResourceCalendarDayView`'s default state
  // (0 techs selected by default → `[]` → no grid lines, no columns).
  // We're back to the historical semantics: `[]` and `undefined` both
  // mean "no filter, render all". Empty rendering is the consumer's
  // job — see LandscapeWorkweekView's per-resource `events: []` in
  // `emptyMode`. See docs/PLAN-DEVIATIONS.md#2026-04-20-revert-empty-array-semantics
  const bodyResourceIds = React19.useMemo(
    () => (selectedResourceIds && selectedResourceIds.length > 0
      ? resourceIds.filter((id) => selectedResourceIds.includes(id))
      : resourceIds),
    [resourceIds, selectedResourceIds]
  );
  // FORK Phase 37 (2026-05-12 — arrow lane-order source of truth):
  // emit the *rendered* body lane order back to the consumer so
  // overlay geometry (move-chain arrows) can resolve each tech's
  // sub-lane X coordinate from the same array the body grid paints
  // from. Fires on mount and again whenever the memo identity above
  // changes (= whenever `resourceIds` order or the `selectedResourceIds`
  // filter changes). See README-FORK Phase 37.
  const onBodyResourceIdsChangeRef = React19.useRef(onBodyResourceIdsChange);
  React19.useEffect(() => {
    onBodyResourceIdsChangeRef.current = onBodyResourceIdsChange;
  }, [onBodyResourceIdsChange]);
  React19.useEffect(() => {
    onBodyResourceIdsChangeRef.current?.(bodyResourceIds);
  }, [bodyResourceIds]);
  // FORK Phase 21 (P3-FE-DRAG-GHOST chunk b): precompute the per-lane
  // tint array for the drop-target ghost overlay. Indexed by
  // `laneIndex` (0..bodyResourceIds.length-1) inside DropShadow's
  // animated-style worklet. Memoized on `[bodyResourceIds,
  // getResourceColor]` because both can change across renders (roster
  // selection toggle; consumer remounts the resolver). When
  // `getResourceColor` is undefined, the array is empty and DropShadow
  // falls back to a neutral tint per its existing semantics.
  // See README-FORK Phase 21.
  const techColors = React19.useMemo(
    () => (typeof getResourceColor === "function"
      ? bodyResourceIds.map((id) => getResourceColor(id) ?? "rgba(0,0,0,0.45)")
      : []),
    [bodyResourceIds, getResourceColor]
  );
  // BUG-A diagnostic (P2-FE-4 follow-up #15, 2026-04-20): log the
  // exact resourceIds the Calendar body will paint columns for. If
  // bodyResourceIds.length === resourceIds.length while
  // selectedResourceIds is undefined (the "no filter" branch), the
  // body will request events for every tech for every visible day —
  // which is exactly what we'd see if the LandscapeWorkweekView
  // forgot to forward `selectedResourceIds: []` in 0-tech mode.
  // FORK Phase 28.3 — gated.
  if (__VERBOSE_CAL_LOGS__) {
    console.log("[BUG-A:CalendarRender]", {
      selectedResourceIds: selectedResourceIds ?? null,
      selectedCount: selectedResourceIds?.length ?? null,
      resourceIds,
      bodyResourceIds,
      isMultiDay,
      numberOfColumns,
    });
  }
  // FORK: BODY_BLOCK_WIDTH is the per-column width used by the body grid
  // (FlashList columns, event blocks, drag math, auto-scroll) AND by the
  // selected-avatar slots in the MAIN header row. When a subset of techs
  // is selected, body columns expand to fill the viewport and the matching
  // header avatars expand to the same width so each avatar sits centered
  // directly over its body column. When `bodyResourceIds.length >=
  // numberOfColumns` it stays equal to APPOINTMENT_BLOCK_WIDTH and the
  // body scrolls horizontally.
  //
  // The unselected (dimmed) avatars no longer share the main row — they
  // live in a separate compact "queue" row stacked ABOVE the main row, so
  // they don't compete with the body columns for horizontal space.
  const UNSELECTED_AVATAR_WIDTH = 44;
  const isHeaderFiltered = !isMultiDay && !!(selectedResourceIds && selectedResourceIds.length > 0);
  const unselectedHeaderIds = React19.useMemo(() => {
    if (!isHeaderFiltered) return [];
    const selectedSet = new Set(selectedResourceIds);
    return resourceIds.filter((id) => !selectedSet.has(id));
  }, [isHeaderFiltered, resourceIds, selectedResourceIds]);
  const mainRowResourceIds = isHeaderFiltered ? bodyResourceIds : resourceIds;
  const BODY_BLOCK_WIDTH = isMultiDay
    ? APPOINTMENT_BLOCK_WIDTH
    : (width - TIME_LABEL_WIDTH) / Math.max(1, Math.min(numberOfColumns, bodyResourceIds.length));
  React19.useEffect(() => {
    apptWidthRef.current = BODY_BLOCK_WIDTH;
    // FORK Phase 20.1 (P3-FE-DRAG-GHOST chunk a follow-up, 2026-05-06):
    // `apptWidthRef` is the day-column width (used for X-positioning
    // math). The new `pickupVisualWidthRef` is the per-card render
    // width — same as `apptWidthRef` in non-mini-cols modes, but
    // narrowed to lane width when mini-cols is active. Mirrors the
    // `eventLayer` branch in `renderItem` (~line 3220) which divides
    // colWidth by techsToRender.length for the mini-cols treatment.
    // Both refs update together so the drag-init can read whichever
    // it needs without coordinating across two separate effects.
    const inMiniCols = isMultiDay && bodyResourceIds.length >= 2 && multiTechMode === "mini-columns";
    pickupVisualWidthRef.current = inMiniCols
      ? BODY_BLOCK_WIDTH / bodyResourceIds.length
      : BODY_BLOCK_WIDTH;
    // FORK Phase 36 (PR-UX-11, 2026-05-09): mirror the live
    // bodyResourceIds + multiTechMode into refs so the doubleTap
    // drag-init worklet (deps `[]`) can read the CURRENT lane roster
    // when computing the dragged card's lane center for `panXAbs`.
    // Without these refs the drag-init formula had to assume
    // column-center, which is wrong by `(2*laneIndex+1)*laneWidth/2 -
    // colWidth/2` for any non-middle lane in mini-cols mode.
    bodyResourceIdsRef.current = bodyResourceIds;
    multiTechModeRef.current = multiTechMode;
  }, [BODY_BLOCK_WIDTH, isMultiDay, bodyResourceIds, multiTechMode]);
  // FORK Phase 32 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY, 2026-05-07):
  // drive the discrete-step shadow offset SV. Watches `panXAbs` and
  // `isDragging`. While dragging, computes the discrete target step
  // and animates the SV to that target via withTiming(150ms). When
  // not dragging, snaps the SV back to `-1` so the next pickup
  // starts mid-canvas-aesthetic. The 150ms duration matches the
  // post-release snap-in slide animation, so the user perceives the
  // edge convergence as the same visual primitive.
  //
  // FORK Phase 35.1 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY, 2026-05-07):
  // helper now returns `{ xStep, yPx }`. Two parallel
  // `useAnimatedReaction` blocks drive `shadowOffsetXSteps` and
  // `shadowOffsetYPx` independently — each reaction's "prepare"
  // function returns a primitive number so Reanimated's `===`
  // change-detector works (returning a fresh object every call
  // would re-fire the reaction every frame). Calling the helper
  // twice per frame is acceptable: the body is a few `Math.floor`
  // / clamp ops on worklet primitives, and the call sites are
  // bounded by the change-detector — both reactions only re-fire
  // when their respective output changes.
  //
  // Idle (non-dragging) targets: xStep → -1 (corner-peek default
  // for the next pickup), yPx → 0 (no rotation).
  //
  // Only meaningful in mini-cols mode with 2+ techs. In other
  // modes the SVs are unread (DropShadow isn't mounted), so the
  // work here is harmless but cheap.
  var inMiniColsForRxn = isMultiDay && bodyResourceIds.length >= 2 && multiTechMode === "mini-columns";
  var rxnColumnCount = Math.max(1, isMultiDay ? days.length : 1);
  var rxnTechCount = bodyResourceIds.length;
  // PR-UX-13 (REMITechnician 2026-05-09) Issue C diagnostic. JS-thread
  // sink for shadow-step transitions, fed via runOnJS from the worklet
  // below. Only fires on actual transitions (worklet skips no-op
  // updates), so the log volume is bounded — at most 2 events per
  // distinct lane crossing during a drag.
  const logShadowStepJS = React19__namespace.default.useCallback((target, prev, panX, colIdx, laneIdx, columnCount, techCount) => {
    console.log("[DIAG-DROP] shadow xStep transition", {
      sessionTag: "PR-UX-13-issue-C",
      from: prev,
      to: target,
      branch:
        target === 0 && colIdx === columnCount - 1
          ? "rotation-rule (last day)"
          : target === 0 && laneIdx === 0
            ? "cross-day clamp (first lane)"
            : target === 0
              ? "absolute-rightmost flat clamp"
              : target === -1
                ? "corner-peek (mid-canvas)"
                : "other",
      panXAbs: panX,
      colIndex: colIdx,
      laneIndex: laneIdx,
      isLastDay: colIdx === columnCount - 1,
      isLastLaneOfDay: laneIdx === techCount - 1,
      isCornerPeekTarget: colIdx < columnCount - 1 && laneIdx === techCount - 1,
      columnCount,
      techCount
    });
  }, []);
  Animated2.useAnimatedReaction(
    () => {
      if (!isDragging.value) return -1;
      if (!inMiniColsForRxn) return 0;
      var resolved = resolveDiscreteShadowOffsetXStep({
        panXAbs: panXAbs.value,
        timeLabelWidth: TIME_LABEL_WIDTH,
        bodyBlockWidth: BODY_BLOCK_WIDTH,
        techCount: rxnTechCount,
        columnCount: rxnColumnCount,
        eventHeight: eventHeight.value
      });
      return resolved.xStep;
    },
    (target, prev) => {
      if (target === prev) return;
      shadowOffsetXSteps.value = Animated2.withTiming(target, { duration: 150 });
      // PR-UX-13 Issue C: surface the discrete xStep transition on
      // the JS thread so the smoke pass can confirm whether the
      // shadow follows the corner-peek (-1) or rotation/clamp (0)
      // rule for any given finger position. Computed alongside the
      // reaction so the log carries the live colIndex/laneIndex
      // that drove the decision.
      var colIdxNow = Math.floor((panXAbs.value - TIME_LABEL_WIDTH) / BODY_BLOCK_WIDTH);
      colIdxNow = colIdxNow < 0 ? 0 : colIdxNow > rxnColumnCount - 1 ? rxnColumnCount - 1 : colIdxNow;
      var laneWidthNow = BODY_BLOCK_WIDTH / Math.max(1, rxnTechCount);
      var xWithinNow = panXAbs.value - TIME_LABEL_WIDTH - colIdxNow * BODY_BLOCK_WIDTH;
      var laneIdxNow = Math.floor(xWithinNow / laneWidthNow);
      laneIdxNow = laneIdxNow < 0 ? 0 : laneIdxNow > rxnTechCount - 1 ? rxnTechCount - 1 : laneIdxNow;
      reactNativeWorklets.scheduleOnRN(
        logShadowStepJS,
        target,
        prev,
        panXAbs.value,
        colIdxNow,
        laneIdxNow,
        rxnColumnCount,
        rxnTechCount
      );
    },
    [BODY_BLOCK_WIDTH, rxnTechCount, rxnColumnCount, inMiniColsForRxn, logShadowStepJS]
  );
  Animated2.useAnimatedReaction(
    () => {
      if (!isDragging.value) return 0;
      if (!inMiniColsForRxn) return 0;
      var resolved = resolveDiscreteShadowOffsetXStep({
        panXAbs: panXAbs.value,
        timeLabelWidth: TIME_LABEL_WIDTH,
        bodyBlockWidth: BODY_BLOCK_WIDTH,
        techCount: rxnTechCount,
        columnCount: rxnColumnCount,
        eventHeight: eventHeight.value
      });
      return resolved.yPx;
    },
    (target, prev) => {
      if (target === prev) return;
      shadowOffsetYPx.value = Animated2.withTiming(target, { duration: 150 });
    },
    [BODY_BLOCK_WIDTH, rxnTechCount, rxnColumnCount, inMiniColsForRxn]
  );
  const finalizeDrag = React19__namespace.default.useCallback((colIndex, adjustedTop, height, isResize = false, xWithinColumn) => {
    const isMultiDay2 = mode !== "day";
    // FORK Phase 15 (P2-FE-4 follow-up #11): cross-tech drag-end
    // resolution. Previously this site always returned
    // `bodyResourceIds[colIndex]` (single-day) or `activeResourceId ??
    // resourceIds[0]` (multi-day), which meant landscape multi-tech
    // drops were silently re-attributed to whichever tech happened to
    // be `bodyResourceIds[0]` regardless of where the user dropped.
    //
    // - Single-day mode: each FlashList row IS a tech, so `colIndex`
    //   already encodes the destination tech. Unchanged.
    // - Multi-day "mini-columns": each tech occupies a sub-lane inside
    //   the day-column. Resolve which lane the drop landed in from the
    //   in-column X offset (`xWithinColumn`) and attribute to that tech.
    //   This is the only treatment with a real spatial signal between
    //   techs — the user explicitly dragged the card into another lane.
    // - Multi-day "stacked" / single-tech / no multi-tech / resize:
    //   no spatial signal between techs (cards overlay each other in
    //   the same physical region for stacked, or there is only one tech
    //   in scope), so reassigning would be guessing. Keep the dragged
    //   event's original tech (`selectedEvent.resourceId`), falling
    //   back to `activeResourceId` and finally `resourceIds[0]` to
    //   match prior behavior for the long-press-no-drag finalize path.
    //
    // The actual rule lives in the pure `resolveLandedResourceId`
    // helper above so the consumer can unit-test the contract without
    // having to drive the worklet machinery; this site just gathers
    // the inputs.
    const landedResourceId = resolveLandedResourceId({
      mode,
      colIndex,
      bodyResourceIds,
      resourceIds,
      selectedEvent,
      activeResourceId,
      multiTechMode,
      bodyBlockWidth: BODY_BLOCK_WIDTH,
      xWithinColumn,
      isResize
    });
    const landedDate = dateFns.format(!isMultiDay2 ? date : days[colIndex], "yyyy-MM-dd");
    const fromMin = positionToMinutes(adjustedTop, hourHeight) + minuteOffset;
    const toMin = isResize
      ? positionToMinutes(adjustedTop + height, hourHeight) + minuteOffset
      : fromMin + originalDurationRef.current;
    // FORK Phase 28.2-logging — route through logCal for calendarId tagging.
    if (__DEV__) logCal("gesture", "finalizeDrag", { col: colIndex, landedResourceId, landedDate, from: fromMin, to: toMin, eventId: selectedEvent?.id, height, isResize, minuteOffset, xWithinColumn, multiTechMode });
    // PR-UX-13 (REMITechnician 2026-05-09) Issue C diagnostic. The
    // user reports the rightmost sub-column of every NON-LAST day
    // can't accept drops in landscape multi-tech mode. The
    // `resolveDiscreteShadowOffsetXStep` worklet returns
    // `xStep = -1` (corner-peek shift LEFT) for non-last days and
    // non-first lanes — meaning a drop on the rightmost lane lands
    // in the middle lane. This log correlates the FE-perceived
    // finger position (`xWithinColumn`) with the BE-bound
    // `landedResourceId` so the smoke pass can verify whether the
    // landed lane matches the user's intent. We compute laneIndex
    // here on the JS thread (matches the worklet math) so the log
    // is one self-contained record.
    var laneWidthHere = (multiTechMode === "mini-columns" && bodyResourceIds && bodyResourceIds.length > 0)
      ? BODY_BLOCK_WIDTH / bodyResourceIds.length
      : 0;
    var laneIndexHere = (laneWidthHere > 0 && xWithinColumn != null)
      ? Math.max(0, Math.min(bodyResourceIds.length - 1, Math.floor(xWithinColumn / laneWidthHere)))
      : null;
    var totalDays = (Array.isArray(days) && days.length > 0) ? days.length : 1;
    var isLastDay = colIndex === totalDays - 1;
    var lastLaneIdx = bodyResourceIds && bodyResourceIds.length > 0 ? bodyResourceIds.length - 1 : -1;
    console.log("[DIAG-DROP] finalizeDrag lane resolution", {
      sessionTag: "PR-UX-13-issue-C",
      colIndex,
      laneIndexHere,
      isLastDay,
      isLastLaneOfDay: laneIndexHere === lastLaneIdx,
      isCornerPeekTarget: !isLastDay && laneIndexHere === lastLaneIdx,
      xWithinColumn,
      laneWidth: laneWidthHere,
      totalDays,
      totalLanes: bodyResourceIds ? bodyResourceIds.length : 0,
      bodyBlockWidth: BODY_BLOCK_WIDTH,
      landedResourceId,
      multiTechMode
    });
    setDraggedEventDraft({
      event: selectedEvent,
      from: fromMin,
      to: toMin,
      resourceId: landedResourceId,
      date: landedDate
    });
  }, [mode, bodyResourceIds, resourceIds, activeResourceId, selectedEvent, hourHeight, minuteOffset, setDraggedEventDraft, days, multiTechMode, BODY_BLOCK_WIDTH]);
  const columns = React19.useMemo(() => {
    if (!isMultiDay) {
      return bodyResourceIds.map((resourceId) => ({ kind: "resource", resourceId }));
    }
    return days.map((dayDate, dayIndex) => ({ kind: "day", dayIndex, dayDate }));
  }, [isMultiDay, bodyResourceIds, days]);
  const panGesture = reactNativeGestureHandler.Gesture.Pan().manualActivation(!isIOS).enabled(layout !== null).shouldCancelWhenOutside(false).onBegin((evt) => {
    "worklet";
    reactNativeWorklets.scheduleOnRN(gestureLog, "pan:begin", { pointers: evt.numberOfPointers, hasSelected: !!selectedEvent, x: Math.round(evt.x), y: Math.round(evt.y) });
  }).onTouchesMove((_evt, stateManager) => {
    "worklet";
    if (isIOS) return;
    if (selectedEvent)
      stateManager.activate();
    else stateManager.end();
  }).onUpdate((evt) => {
    "worklet";
    if (!evt || evt.y == null || evt.x == null) return;
    if (isPinching.value || isZooming.value) return;
    if (evt.numberOfPointers >= 2 && !isDragging.value) return;
    touchY.value = evt.y;
    // FORK Phase 19 (P2-FE-6 chunk b): mirror the RNGH absolute
    // (window-coordinate) finger position to the public SVs every
    // frame the pan is updating. `evt.absoluteX/Y` are not clamped
    // to the calendar's bounds — they continue to track the finger
    // when it leaves the grid (the gesture has
    // `.shouldCancelWhenOutside(false)`). The drag-to-avatar
    // hit-test reads these directly to detect "finger over avatar
    // tile bbox" without any coordinate translation. We write them
    // unconditionally (even before isDragging flips true) so the
    // hit-test SV reaction sees a fresh value the very first frame
    // after drag-start, not one frame later.
    if (evt.absoluteX != null && evt.absoluteY != null) {
      fingerXAbs.value = evt.absoluteX;
      fingerYAbs.value = evt.absoluteY;
    }
    if (!isDragging.value) {
      const draggableMinY = panYAbs.value - eventHeight.value / 2;
      const draggableMaxY = panYAbs.value + eventHeight.value / 2;
      const blockMinX = panXAbs.value - BODY_BLOCK_WIDTH / 2;
      const blockMaxX = panXAbs.value + BODY_BLOCK_WIDTH / 2;
      if (!(evt.x >= blockMinX && evt.x <= blockMaxX && evt.y >= draggableMinY && evt.y <= draggableMaxY)) return;
      reactNativeWorklets.scheduleOnRN(gestureLog, "pan:dragStart", evt.numberOfPointers);
    }
    {
      isDragging.value = true;
      // FORK Phase 27.2 (P3-FE-DRAG-GHOST follow-up, 2026-05-06):
      // safety reset. If a previous drag's release-animation timing
      // hasn't completed yet (rare — would require a new double-tap
      // within ~150ms of the previous release), clear `dragReleasing`
      // so the floating card immediately reverts to lane-snap /
      // finger-following geometry instead of frozen at the previous
      // animation's last frame. The orphan `withTiming` will still
      // fire its callback, but its only effect (flipping
      // `dragReleasing` and `isDragging` to false) is rendered
      // inert by the new drag having already set both true.
      // (Phase 27.3 update: gesture is double-tap, not long-press;
      // earlier comment text was wrong.)
      // (Phase 27.4 KNOWN EDGE CASE: when this safety reset fires,
      // the previous drop's `finalizeDrag` is also skipped because
      // it's now inside the `if (dragReleasing.value === true)`
      // guard in the snap-in callback. The previous drop's data is
      // lost. In practice this requires a user to double-tap a new
      // event AND start moving their finger faster than 150ms after
      // releasing the prior drop — basically impossible by accident.
      // If this becomes a real complaint we can store the pending
      // finalize args in dedicated SVs and fire them here.)
      dragReleasing.value = false;
      const translatedY = Math.round(evt.translationY / snapInterval) * snapInterval;
      const proposedAbsoluteTop = startedY.value - eventHeight.value / 2 + translatedY + scrollY.value;
      let snappedAbsoluteTop = Math.round(proposedAbsoluteTop / snapInterval) * snapInterval;
      // FORK Phase 33 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
      // 2026-05-07): re-derived Y-clamp bounds from first
      // principles, decoupled from the visual pickup offset.
      // User feedback after Phase 32: *"the top and bottom are
      // still cutting out 30min of calendar space from where they
      // are supposed to."* (30min = exactly one minimum-height
      // event = `eventHeight`.)
      //
      // Phase 33 used: `[scrollY, layout.height + scrollY -
      // eventHeight]`. That kept the SNAPPED CARD top-to-bottom
      // within the visible viewport. With dropShiftY = H/2
      // (corner-peek Y geometry — drop = ghost = card_top - H/2),
      // the latest reachable drop end-time was
      // `(layout.height + scrollY - eventHeight - H/2 + H) /
      // hourHeight * 60 + offset` — i.e. the drop's BOTTOM (drop
      // top + duration) ended one event-height above the viewport
      // bottom + H/2 = `H/2` short of the viewport bottom. For
      // a 60-min event at default density that's 30 min short of
      // the work-window end (= 5:30 PM instead of 6 PM).
      //
      // FORK Phase 35 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
      // 2026-05-07): extends the bottom of the snap clamp by
      // `eventHeight / 2` so the GHOST bottom (= drop_top +
      // eventHeight) reaches the viewport bottom in content
      // coords. New bounds:
      //   - snapMin = scrollY (Phase 33 unchanged — top edge
      //     already worked, user said "Top edge is FIXED").
      //   - maxAbsoluteTop = layout.height + scrollY -
      //     eventHeight / 2 (extended). At this max:
      //       card_top = snap_top = layout.height + scrollY - H/2
      //       card_bottom = card_top + H = layout.height + scrollY + H/2
      //         (overshoots viewport bottom by H/2 visually)
      //       ghost_top = snap_top - H/2 = layout.height + scrollY - H
      //       ghost_bottom = ghost_top + H = layout.height + scrollY
      //         (= viewport bottom EXACTLY)
      //       drop_top in content = snap_top - H/2 = layout.height + scrollY - H
      //         → drop_end = drop_top + duration = layout.height + scrollY
      //         which corresponds in time to the GRID BOTTOM
      //         (RC_WORK_END = 1080 = 6 PM at default density).
      //
      // The card extends `H/2` past the viewport bottom in this
      // configuration. The overshoot is intentional and matches
      // the existing top-edge overshoot (with the new H/2
      // pickup, the GHOST extends `H/2` above viewport top when
      // snapped to scrollY — see DropShadow comment block).
      // The user's mental model is "shadow = where the drop
      // lands"; the shadow now reaches the visible viewport
      // bottom cleanly so 6 PM is reachable.
      //
      // For the rotation cells at the bottom edge (Phase 34
      // right-edge / cross-day clamps), the ghost stays at
      // `snap_top - H/2` (rotation visual = ghost in same lane
      // as card, half-overlapping above), drop_top stays at
      // `snap_top - H/2`, so the same math applies — drop_end
      // reaches the viewport bottom = 6 PM.
      var snapMin = scrollY.value;
      snappedAbsoluteTop = Math.max(snapMin, snappedAbsoluteTop);
      if (layout) {
        const maxAbsoluteTop = layout.height + scrollY.value - eventHeight.value / 2;
        snappedAbsoluteTop = Math.min(snappedAbsoluteTop, maxAbsoluteTop);
      }
      if (snappedAbsoluteTop !== eventStartedTop.value) {
        reactNativeWorklets.scheduleOnRN(triggerHaptic);
        eventStartedTop.value = snappedAbsoluteTop;
      }
      panYAbs.value = snappedAbsoluteTop - scrollY.value + eventHeight.value / 2;
      // FORK Phase 30.1 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
      // 2026-05-07): loosen the `panXAbs` clamp so the finger can
      // reach the canvas edges. Pre-Phase 30.1 the clamp inset was
      // a uniform `BODY_BLOCK_WIDTH/2` on each side — sized for the
      // pre-Phase-29 finger-at-card-center geometry, but stale after
      // Phase 29 made the card free-float at `panXAbs - 2W/3`.
      // Combined with Phase 28.1's edge attenuation this meant:
      //   - The floating card visibly stopped short of the
      //     viewport edges (finger could not reach edge → card
      //     could not reach edge).
      //   - At higher tech counts (4+ left, 2+ right), the
      //     leftmost / rightmost sub-lane(s) were unreachable as
      //     drop targets even though Phase 28.1's attenuation
      //     formula was correct — the finger was being clamped
      //     before it could engage the attenuation envelope at
      //     full effect.
      //
      // The new clamp uses the Phase 29 floating-card geometry
      // (card spans `[panXAbs - 2W/3, panXAbs + W/3]`):
      //   - Left inset = `2W/3` so the card's LEFT edge can just
      //     reach `canvasLeftX`.
      //   - Right inset = `W/3` so the card's RIGHT edge can just
      //     reach `canvasRightX` (= `layout.width`).
      // where `W = effectiveCardWidth = laneWidth` in mini-cols
      // and `BODY_BLOCK_WIDTH` otherwise (matching the
      // `pickupVisualWidthRef` contract from Phase 20.1).
      //
      // Verification per tech count (right edge case; left is
      // symmetric):
      //   - 1 tech: max panXAbs = canvasRightX - W/3 → finger
      //     reaches close to edge → only one lane → drop in lane 0
      //     (the only lane) ✓.
      //   - 2 techs: max panXAbs = canvasRightX - laneWidth/3 →
      //     `xWithinColumn` = laneWidth - laneWidth/3 = 2*lW/3 →
      //     `floor((2/3) / (1/2)) = 1` (rightmost) ✓. Attenuation
      //     ≈ 1/3 → ghost slides 1/3 lane left of finger → ghost &
      //     drop in lane 1.
      //   - 4 techs: max xWithinColumn = lW - lW/3 = 2*lW/3 of one
      //     column = 2/3 of column / lW = 2/3 / (1/4) = 8/3 → floor
      //     = 2... wait, finger is in rightmost column with
      //     xWithinColumn = 4*lW - lW/3 = 11/3 * lW → laneIndex =
      //     floor(11/3) = 3 (rightmost) ✓.
      //   - 6 techs: similar — laneIndex = floor(6 - 1/3) = 5
      //     (rightmost) ✓.
      // Drop math (`dropShiftX = -ghostShiftX`) lands the drop in
      // the same sub-lane the ghost is rendered in. See the
      // `computeXEdgeShift` doc-block above for the full envelope
      // math and the README-FORK Phase 30.1 entry for the user
      // reports that drove this.
      //
      // FORK Phase 35 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
      // 2026-05-07): the X clamp insets are unchanged — the
      // corner-peek X pickup (`-2W/3`) and the matching clamp
      // insets are explicitly preserved per the user's redirect
      // (*"the relative position of shadow to card is non-
      // negotiable"*). Only the Y pickup changed in Phase 35
      // (`H/3` → `H/2`); the pickup-X stays at `2W/3` and the
      // clamp insets stay at `(2W/3, W/3)`.
      var inMiniColsForClamp = isMultiDay && bodyResourceIds.length >= 2 && multiTechMode === "mini-columns";
      var effectiveCardWidth = inMiniColsForClamp
        ? BODY_BLOCK_WIDTH / bodyResourceIds.length
        : BODY_BLOCK_WIDTH;
      var clampInsetLeft = (effectiveCardWidth * 2) / 3;
      var clampInsetRight = effectiveCardWidth / 3;
      let panXAbsValue = Math.max(
        clampInsetLeft + TIME_LABEL_WIDTH,
        startedX.value + evt.translationX
      );
      if (layout?.width) {
        panXAbsValue = Math.min(
          layout.width - clampInsetRight,
          panXAbsValue
        );
      }
      panXAbs.value = panXAbsValue;
      if (layout) {
        const AUTO_SCROLL_BUFFER = 30;
        if (evt.y > layout.height - AUTO_SCROLL_BUFFER) {
          autoScrollSpeed.value = 1;
        } else if (evt.y < AUTO_SCROLL_BUFFER) {
          autoScrollSpeed.value = -1;
        } else {
          autoScrollSpeed.value = 0;
        }
        if (panXAbs.value >= layout.width - BODY_BLOCK_WIDTH / 2) {
          autoScrollXSpeed.value = 1;
        } else if (panXAbs.value <= BODY_BLOCK_WIDTH / 2 + TIME_LABEL_WIDTH) {
          autoScrollXSpeed.value = -1;
        } else {
          autoScrollXSpeed.value = 0;
        }
      } else {
        autoScrollSpeed.value = 0;
        autoScrollXSpeed.value = 0;
      }
    }
  }).onEnd(() => {
    "worklet";
    autoScrollSpeed.value = 0;
    autoScrollXSpeed.value = 0;
    lastXScrollTime.value = 0;
    // FORK Phase 19 (P2-FE-6 chunk b): clear raw-finger SVs at the
    // top of onEnd so EVERY exit path (no-drag-real-event-cancel,
    // no-drag-draft-finalize, no-selected-event, real drag-end) all
    // leave them as NaN. The no-drag branches return early below,
    // so this reset must happen before the `if (!isDragging.value)`
    // check rather than only in the drag-finalize block.
    fingerXAbs.value = Number.NaN;
    fingerYAbs.value = Number.NaN;
    // FORK Phase 20 (P3-FE-DRAG-GHOST chunk a): clear pickup width on
    // every onEnd path so the next drag-init re-captures cleanly. 0 is
    // the "no pickup, fall back to prop" sentinel that DraggableEvent
    // checks. See README-FORK Phase 20.
    //
    // FORK Phase 27.3 (P3-FE-DRAG-GHOST follow-up, 2026-05-06): the
    // reset moved out of this top-of-handler position because the
    // Phase 27.2 snap-in animation needs the frozen pickup width to
    // remain in place during the 150ms slide. Resetting it here
    // caused the floating card to widen to `APPOINTMENT_BLOCK_WIDTH`
    // (= full BODY_BLOCK_WIDTH) mid-animation since `effectiveWidth`
    // in `DraggableEvent.dynamicStyle` falls back to the prop when
    // pickup is 0. User report: *"Upon release it moves a tiny bit
    // towards the shadow, then resizes to full width (as big as a
    // column can get)."* The reset now happens at each individual
    // exit point instead — synchronously in the no-drag branches and
    // in the non-mini-cols drag-end branch, deferred until after the
    // snap-in `withTiming` callback in the mini-cols drag-end branch.
    if (!isDragging.value) {
      // FORK Phase 17.2 (P2-FE-5 chunk 2b.2 — bug fix): differentiate
      // draft-event noDrag from real-event noDrag at end-of-pan.
      //
      // Original (Phase 16) behaviour: long-press armed a *draft* event,
      // user released without dragging → still call finalizeDrag at the
      // original press position so the consumer's onDragEnd handler opens
      // the create-event sheet. This is the long-press-create flow.
      //
      // Phase 17 introduced double-tap-to-drag for *real* events. That
      // path also sets selectedEvent before the user moves. If the user
      // double-taps and then releases without sliding, the original
      // noDrag branch incorrectly fires finalizeDrag → consumer sees a
      // "drag finished at original location" → opens reschedule sheet
      // for a non-existent move. Logged as: doubleTap → selecting event
      // for drag → pan:end:noDrag:finalizePress → unwanted reschedule.
      //
      // Fix: only finalize for draft events (id <= 0 / meta.isDraft).
      // For real events, just clear selection state and bail.
      if (selectedEvent) {
        const evtId = selectedEvent.id;
        const isDraftEvent = evtId == null || evtId < 0 || (selectedEvent.meta && selectedEvent.meta.isDraft);
        if (!isDraftEvent) {
          // FORK Phase 27.3 — reset pickup width at this exit point
          // instead of at the top of onEnd. See top-of-handler note.
          dragCardPickupWidth.value = 0;
          reactNativeWorklets.scheduleOnRN(gestureLog, "pan:end:noDrag:realEvent:cancel", evtId);
          reactNativeWorklets.scheduleOnRN(setSelectedEvent, null);
          reactNativeWorklets.scheduleOnRN(setDragReady, false);
          return;
        }
        const finalXOnScreen = panXAbs.value;
        const absoluteX = finalXOnScreen + scrollX.value;
        const newStaffIndex = Math.floor((absoluteX - TIME_LABEL_WIDTH) / BODY_BLOCK_WIDTH);
        const colIndex = Math.max(0, Math.min(newStaffIndex, columns.length - 1));
        const xWithinColumn = absoluteX - TIME_LABEL_WIDTH - colIndex * BODY_BLOCK_WIDTH;
        // FORK Phase 27.3 — reset pickup width at this exit point.
        dragCardPickupWidth.value = 0;
        reactNativeWorklets.scheduleOnRN(gestureLog, "pan:end:noDrag:finalizePress", colIndex);
        reactNativeWorklets.scheduleOnRN(finalizeDrag, colIndex, eventStartedTop.value, eventHeight.value, false, xWithinColumn);
        return;
      }
      // FORK Phase 27.3 — reset pickup width at this exit point.
      dragCardPickupWidth.value = 0;
      reactNativeWorklets.scheduleOnRN(gestureLog, "pan:end:noDrag");
      return;
    }
    // FORK Phase 27.1 (P3-FE-DRAG-GHOST follow-up, 2026-05-06): in
    // mini-cols mode the drop lands AT the ghost overlay position,
    // not under the finger. The ghost paints at
    //   (snap_X - laneWidth, snap_Y - eventHeight/2)
    // (Phase 27.1 sub-lane-to-the-left, supersedes Phase 21.4's
    // half-shift) — i.e. it sits up-and-to-the-LEFT of the finger,
    // CENTERED inside the sub-lane to the left of the finger's
    // sub-lane (NOT straddling the gridline).
    //
    // User clarification that drove the shift from `-laneWidth/2`
    // (Phase 26) to `-laneWidth` (Phase 27.1): *"the cards stay
    // static in their positioning to each other while being dragged.
    // ... I need the shadow to be the source of truth for where the
    // card will land, and it must not center on the lines. ... The
    // cards don't end up over the lines, do they? No. They end up in
    // the middle of a sub column. That's where the shadows should
    // align to, NOT the lines, but between the lines."*
    //
    // Mechanism: shift the X used for `colIndex` / `xWithinColumn`
    // resolution by `-laneWidth` (one full sub-lane to the left),
    // and the Y used for `finalEventTop` by `-eventHeight/2`. Both
    // shifts happen BEFORE the snap-to-grid math so the snap result
    // lands in the sub-lane / time slot the ghost was painting over.
    // Outside mini-cols we skip the shift — there's no ghost in
    // single-tech / stacked / single-day and no offset to compensate
    // for.
    //
    // After the shift the LANDED card paints in the same sub-lane
    // the ghost was sitting in (centered, between the gridlines).
    // Smooth snap-in animation from floating-card position (= finger's
    // sub-lane) to landed-card position (= ghost's sub-lane, one
    // sub-lane to the left) is deferred to Phase 27.2.
    //
    // Closure-captured: `isMultiDay`, `bodyResourceIds`, `multiTechMode`,
    // `BODY_BLOCK_WIDTH`. Same access pattern Phase 21 uses in
    // DropShadow's animated style worklet — these are stable across a
    // single drag because the gesture is recreated on each render and
    // a drag in flight blocks structural state changes.
    var inMiniColsForDrop = isMultiDay && bodyResourceIds.length >= 2 && multiTechMode === "mini-columns";
    var laneWidthForDrop = inMiniColsForDrop && BODY_BLOCK_WIDTH > 0
      ? BODY_BLOCK_WIDTH / bodyResourceIds.length
      : 0;
    // FORK Phase 28.1 (P3-FE-DRAG-GHOST follow-up, 2026-05-06):
    // attenuate `dropShiftX` to match the ghost's attenuated X
    // position. Pre-Phase 28.1 this was a hard `dropShiftX =
    // laneWidthForDrop` (= one full sub-lane LEFT of finger), which
    // matched the Phase 27.1 ghost render. After Phase 28.1 the
    // ghost slides toward the finger near X edges; the drop must
    // follow the ghost (per user requirement: *"the shadow [must
    // be] the source of truth for where the card will land"*).
    //
    // FORK Phase 30.1 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
    // 2026-05-07): switched from the [0,1] attenuation factor to
    // the signed `computeXEdgeShift` (returns the ghost shift
    // directly, in [-laneWidth, 0]). `dropShiftX = -ghostShift`
    // gives the same `+laneWidth*atten` magnitude with cleaner
    // sign semantics. Combined with the loosened `panXAbs` clamp
    // below, the rightmost AND leftmost sub-lane are addressable
    // as drop targets at every tech count.
    //
    // Net effect: in the middle of the canvas, drop is one sub-lane
    // LEFT of finger (= ghost's sub-lane = unchanged). Within one
    // laneWidth of either X edge, drop slides toward the finger,
    // landing in the finger's own sub-lane at the edge.
    //
    // Reads `panXAbs.value` (raw finger X), `BODY_BLOCK_WIDTH`,
    // closure-captured `days` and `isMultiDay`. Same access pattern
    // as the existing column-resolution lines below — these are all
    // stable across a single drag (gesture is recreated on each
    // render, drag in flight blocks structural state changes).
    // FORK Phase 32 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
    // 2026-05-07): drop X is derived from the discrete-step shadow
    // offset. Either:
    //   - `-1` (mid-canvas, the default): drop is one full lane LEFT
    //     of the finger's lane (the historical Phase 27.1 drop).
    //   - `0` (edge-converged): drop is in the finger's own lane
    //     (rightmost or leftmost lane reachable as a drop target).
    // `dropShiftX = -ghostShiftDiscretePixels` exactly mirrors the
    // ghost's render position, satisfying the "drop = where the
    // shadow IS" invariant the user has consistently asked for.
    //
    // FORK Phase 34 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
    // 2026-05-07): the discrete step is now derived from the helper
    // (= the SV's TARGET) instead of `Math.round(shadowOffsetXSteps
    // .value)` (= the SV's IN-FLIGHT value). Phase 32's choice of
    // `Math.round(SV)` was wrong because the SV transitions over
    // 150ms via `withTiming` and the user can release MID-TRANSITION
    // — at that moment `Math.round(SV)` returns the OLD discrete
    // state instead of the NEW target the helper is converging to.
    // User report (Phase 34 spec):
    //   panXAbs: 720.6 (finger in Thu Todd's lane, last-of-grid)
    //   shadowOffsetXSteps: -0.9 (mid-flight from -1 toward 0)
    //   shadowOffsetXStepsRounded: -1 (Math.round of in-flight SV)
    //   landedResourceId: 2055 (Jake) — wanted Todd
    // The helper returns 0 for that finger position (rightmost-of-
    // grid clamp). Reading the helper instead of the in-flight SV
    // makes the drop land at the helper's TARGET — Thu Todd — which
    // is what the user has consistently asked for ("drop where the
    // shadow IS converging to, not where it momentarily was").
    //
    // The visible ghost briefly disagrees with the drop during the
    // tail of the in-flight `withTiming` (≤150ms after release), but
    // the post-release snap-in animation slides the floating card to
    // the helper's target lane (using this same `ghostStepDiscrete`
    // via `snapInPos.ghostShiftX`), and the SV continues animating
    // toward the same target — both converge on the helper's value
    // by the end of the 150ms slide. No frame is rendered with a
    // shadow in the wrong lane vs. the landed card.
    // FORK Phase 32 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
    // 2026-05-07): drop X is derived from the discrete-step shadow
    // offset. Either:
    //   - `-1` (mid-canvas, the default): drop is one full lane LEFT
    //     of the finger's lane (the historical Phase 27.1 drop).
    //   - `0` (edge-converged): drop is in the finger's own lane
    //     (rightmost or leftmost lane reachable as a drop target).
    // `dropShiftX = -ghostShiftDiscretePixels` exactly mirrors the
    // ghost's render position, satisfying the "drop = where the
    // shadow IS" invariant the user has consistently asked for.
    //
    // FORK Phase 34 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
    // 2026-05-07): the discrete step is now derived from the helper
    // (= the SV's TARGET) instead of `Math.round(shadowOffsetXSteps
    // .value)` (= the SV's IN-FLIGHT value). Phase 32's choice of
    // `Math.round(SV)` was wrong because the SV transitions over
    // 150ms via `withTiming` and the user can release MID-TRANSITION
    // — at that moment `Math.round(SV)` returns the OLD discrete
    // state instead of the NEW target the helper is converging to.
    // User report (Phase 34 spec):
    //   panXAbs: 720.6 (finger in Thu Todd's lane, last-of-grid)
    //   shadowOffsetXSteps: -0.9 (mid-flight from -1 toward 0)
    //   shadowOffsetXStepsRounded: -1 (Math.round of in-flight SV)
    //   landedResourceId: 2055 (Jake) — wanted Todd
    // The helper returns 0 for that finger position (rightmost-of-
    // grid clamp). Reading the helper instead of the in-flight SV
    // makes the drop land at the helper's TARGET — Thu Todd — which
    // is what the user has consistently asked for ("drop where the
    // shadow IS converging to, not where it momentarily was").
    //
    // The visible ghost briefly disagrees with the drop during the
    // tail of the in-flight `withTiming` (≤150ms after release), but
    // the post-release snap-in animation slides the floating card to
    // the helper's target lane (using this same `ghostStepDiscrete`
    // via `snapInPos.ghostShiftX`), and the SV continues animating
    // toward the same target — both converge on the helper's value
    // by the end of the 150ms slide. No frame is rendered with a
    // shadow in the wrong lane vs. the landed card.
    //
    // FORK Phase 35.1 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
    // 2026-05-07): the helper now returns `{ xStep, yPx }` and
    // BOTH X and Y drop shifts read the helper's TARGETS at
    // release (extending Phase 34's helper-as-target invariant
    // from one axis to two). Drop X uses xStep, drop Y combines
    // the existing `eventHeight / 2` ghost-above-snap shift with
    // the new `yPx` rotation shift so drop_top in content equals
    // ghost_top in content (= snap_top - H/2 + yPx). For default
    // cells (yPx=0): dropShiftY = H/2, drop_top = snap_top - H/2.
    // For rotation cells (yPx=-H/2): dropShiftY = H, drop_top =
    // snap_top - H. This preserves the "drop = where the shadow
    // IS" invariant in both regimes.
    //
    // Caveat (documented in README-FORK Phase 35.1): rotation
    // cells at the bottom edge of the viewport may not reach
    // RC_WORK_END (6 PM) for longer events because the snap
    // clamp's `maxAbsoluteTop = layout.height + scrollY -
    // eventHeight / 2` was sized for the default `dropShiftY =
    // H/2`; in rotation `dropShiftY = H` shifts drop_top another
    // H/2 earlier in time. For a 60-min event in rotation at the
    // extended bottom, drop_end caps at 5:30 PM rather than 6 PM.
    // To extend further we'd need a separate `inRotation`-aware
    // snap clamp, which we deferred — the user's primary ask was
    // Jake-of-last-day reachable as a drop target, not bottom-
    // edge-in-rotation reaches 6 PM. If they report it on the
    // next smoke pass, the fix is `maxAbsoluteTop +=
    // (-shadowOffsetYPx.value)` in pan-onUpdate (i.e. extend the
    // clamp by `|yPx|` when in rotation).
    //
    // PLAN-DEVIATION: 2026-05-07-x-edge-drop-clamp —
    // docs/PLAN-DEVIATIONS.md#2026-05-07-x-edge-drop-clamp.
    var dropShiftX = 0;
    var ghostStepDiscrete = 0;
    var ghostStepResolvedYPx = 0;
    if (inMiniColsForDrop && laneWidthForDrop > 0) {
      var ghostStepResolved = resolveDiscreteShadowOffsetXStep({
        panXAbs: panXAbs.value,
        timeLabelWidth: TIME_LABEL_WIDTH,
        bodyBlockWidth: BODY_BLOCK_WIDTH,
        techCount: bodyResourceIds.length,
        columnCount: Math.max(1, isMultiDay ? days.length : 1),
        eventHeight: eventHeight.value
      });
      ghostStepDiscrete = ghostStepResolved.xStep;
      ghostStepResolvedYPx = ghostStepResolved.yPx;
      if (ghostStepDiscrete < -1) ghostStepDiscrete = -1;
      if (ghostStepDiscrete > 0) ghostStepDiscrete = 0;
      dropShiftX = -ghostStepDiscrete * laneWidthForDrop;
    }
    var dropShiftY = inMiniColsForDrop ? eventHeight.value / 2 - ghostStepResolvedYPx : 0;
    // FORK Phase 30.3 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
    // 2026-05-07): the Phase 30.2 yShift application here is REMOVED.
    // Phase 30.2 added `+ yShiftForDrop` to `finalEventTop` under the
    // assumption that the natural `panYAbs - H/2 - dropShiftY`
    // formula left an unreachable buffer at each Y edge. In
    // practice `panYAbs` is snap-clamped by the pan-onUpdate worklet
    // (`Math.max(0, snappedAbsoluteTop)` then mapped back to
    // `snappedAbsoluteTop + eventHeight/2 - scrollY`), so the
    // natural formula already lets `adjustedFinalEventTop` reach 0
    // at the top edge after the `Math.max(0, ...)` rounding clamp,
    // and `clampDragRangeToWorkWindow` (consumer-side) shifts long
    // events to fit the work window with duration preserved at the
    // bottom edge. The Phase 30.2 envelope ALSO triggered on
    // `panYAbs` (= snap-clamped card center, not live finger), so
    // `yShiftForDrop` was effectively always `0` for typical drags
    // and a positive overshoot when it did fire — net regression in
    // both directions.
    //
    // The Y-edge envelope continues to apply VISUALLY in DropShadow
    // and DraggableEvent (using `touchY` per Phase 30.3), where the
    // ghost / floating card slide inward at the edges to give the
    // user the same visual feedback the X-axis envelope provides.
    // Drop reachability is owned by snap-clamp + consumer-side
    // `clampDragRangeToWorkWindow`, NOT by this worklet.
    const finalEventTop = panYAbs.value - eventHeight.value / 2 - dropShiftY + scrollY.value;
    let adjustedFinalEventTop = Math.round(finalEventTop / snapInterval) * snapInterval;
    adjustedFinalEventTop = Math.max(0, adjustedFinalEventTop);
    const finalPanYValue = adjustedFinalEventTop - scrollY.value + eventHeight.value / 2;
    const finalXOnScreen = panXAbs.value - dropShiftX;
    const absoluteX = finalXOnScreen + scrollX.value;
    const newStaffIndex = Math.floor((absoluteX - TIME_LABEL_WIDTH) / BODY_BLOCK_WIDTH);
    const colIndex = Math.max(0, Math.min(newStaffIndex, columns.length - 1));
    // FORK Phase 15: in-column X offset for mini-columns lane resolution
    // (see finalizeDrag). Captured BEFORE the snap-to-column animation
    // overwrites panXAbs so the drop point reflects the user's actual
    // release position, not the snapped column center. After Phase 26
    // this is the SHIFTED X (= ghost X), so the lane that
    // `resolveLandedResourceId` picks via `xWithinColumn` matches the
    // lane the ghost was sitting over.
    const xWithinColumn = absoluteX - TIME_LABEL_WIDTH - colIndex * BODY_BLOCK_WIDTH;
    const finalPanXValue = TIME_LABEL_WIDTH + colIndex * BODY_BLOCK_WIDTH - scrollX.value + BODY_BLOCK_WIDTH / 2;
    // FORK Phase 27.3 (P3-FE-DRAG-GHOST follow-up, 2026-05-06):
    // capture the release-time pan values into local consts so the
    // snap-in animation reads from a stable snapshot. In mini-cols
    // mode panXAbs / panYAbs are left untouched (see the next block),
    // so this is technically equivalent to reading panXAbs.value
    // directly at the read site — but the local consts make it
    // unambiguous that the snap-in source is "where the floating
    // card was at release" and protects against future code that
    // might decide to mutate panXAbs/panYAbs between this point and
    // the snap-in computation below.
    const releasePanXAbs = panXAbs.value;
    const releasePanYAbs = panYAbs.value;
    // FORK Phase 27.3 — the legacy springs on panXAbs/panYAbs
    // (carry-over from Phase 13's "settle card center to column
    // center" feedback) are HARMFUL in mini-cols mode because:
    //   1. They animate `panXAbs.value` toward the column center over
    //      ~300ms, which the DropShadow worklet reads every frame —
    //      the ghost would drift away from the destination sub-lane
    //      while the snap-in animation is running. (A synchronous
    //      assignment instead of `withSpring` is even worse — the
    //      ghost would teleport to column center the moment release
    //      fires.)
    //   2. When the Phase 27.2 snap-in `withTiming` callback flips
    //      `dragReleasing.value = false` at t=150ms, the floating
    //      card's `draggingAnimatedStyle` falls through to the Phase
    //      27.1 lane-snap branch which reads the still-springing
    //      `panXAbs.value` (now near column center) and re-derives a
    //      sub-lane position — the card teleports one column-width to
    //      the left for ~1 frame before `selectedEvent` clears and
    //      the card unmounts. User report: *"teleports to the left
    //      about one column width adjacent to the destination left
    //      edge or directly above the destination."*
    //   3. The same `eventStartedTop = adjustedFinalEventTop` write
    //      that follows would shift the ghost vertically too (ghost
    //      reads eventStartedTop via resolveLaneDropPosition).
    //
    // In mini-cols the snap-in animation is the only motion we want.
    // Skipping ALL three writes (panXAbs, panYAbs, eventStartedTop)
    // is safe because:
    //   - The floating card uses releaseTargetX/Y during the
    //     animation (not panXAbs/panYAbs / eventStartedTop).
    //   - The ghost reads panXAbs / eventStartedTop, but we WANT it
    //     to stay where the user released, not to settle to column
    //     center.
    //   - The next drag-init in `internalOnDoubleTap.current` re-sets
    //     panXAbs / panYAbs / eventStartedTop / startedX / startedY
    //     unconditionally, so leaving stale values here has no carry-
    //     over effect.
    //   - finalizeDrag below receives `adjustedFinalEventTop` and
    //     `eventHeight.value` as explicit args, not from SV reads, so
    //     the consumer's onDragEnd handler still gets the snapped
    //     drop position regardless.
    //
    // Outside mini-cols (single-tech / single-day / stacked) we keep
    // the springs and the eventStartedTop write to preserve the
    // historical "settle on drop" feel — there's no ghost in those
    // modes, so the spring-driven panX/Y motion is the visual
    // feedback the user expects.
    if (!inMiniColsForDrop) {
      panYAbs.value = Animated2.withSpring(finalPanYValue);
      panXAbs.value = Animated2.withSpring(finalPanXValue);
      eventStartedTop.value = adjustedFinalEventTop;
      startedY.value = finalPanYValue;
      startedX.value = finalPanXValue;
    }
    // FORK Phase 27.2 (P3-FE-DRAG-GHOST follow-up, 2026-05-06): in
    // mini-cols mode, animate the floating card from its release
    // position (= finger's lane-snapped sub-lane) to the ghost's
    // position (= sub-lane to the left, snapped time slot up by H/2)
    // over 150ms before unmounting, so the user perceives a clean
    // slide-into-place instead of a teleport. The landed card pops
    // in synchronously at the same target coordinate via the
    // `scheduleOnRN(finalizeDrag, ...)` below — both render in the
    // same screen position during the animation, so visually the
    // sliding floating card "merges" into the stationary landed
    // card and the user sees a single coherent slide.
    //
    // Outside mini-cols 2+ tech (single-tech / stacked / single-day)
    // there's no ghost and no destination indicator — the card just
    // unmounts as before (synchronous `isDragging.value = false`).
    //
    // User clarification that drove this: *"Make the card UNDER THE
    // FINGER slide to where the ghost is WHEN RELEASED... NOT WHILE
    // IT'S MOVING. ... So when released the shadow would technically
    // not budge at all, no movement, it stays right when it is when
    // released and the card slides over to the shadow to sit
    // perfectly on top of it."*
    //
    // Closure-captured: `BODY_BLOCK_WIDTH`, `bodyResourceIds.length`,
    // `isMultiDay`, `days.length` — same access pattern as Phase 27.1
    // / Phase 26 above.
    // FORK Phase 27.3 — pass `releasePanXAbs` (the captured release-
    // time finger X) into resolveLaneDropPosition so `snapInPos
    // .translateX` reflects the lane-snap of where the FLOATING CARD
    // actually was at release. Currently equivalent to passing
    // panXAbs.value directly (the mini-cols branch above no longer
    // mutates panXAbs), but using the named const documents intent
    // and protects future refactors.
    // FORK Phase 32 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
    // 2026-05-07): pass the discrete `ghostStepDiscrete` from the
    // dropShiftX block above so the snap-in animation target lands
    // at the SAME lane the ghost was rendering at release. Without
    // this, the snap-in target would default to step `0` (ghost in
    // finger's lane), which only matches reality at the edge —
    // mid-canvas the card would slide to the wrong lane.
    var snapInPos = inMiniColsForDrop
      ? resolveLaneDropPosition({
          panXAbs: releasePanXAbs,
          eventStartedTop: eventStartedTop.value,
          eventHeight: eventHeight.value,
          scrollX: scrollX.value,
          scrollY: 0,
          timeLabelWidth: TIME_LABEL_WIDTH,
          bodyBlockWidth: BODY_BLOCK_WIDTH,
          techCount: bodyResourceIds.length,
          columnCount: Math.max(1, isMultiDay ? days.length : 1),
          shadowOffsetXSteps: ghostStepDiscrete
        })
      : null;
    if (snapInPos) {
      // FORK Phase 29 (P3-FE-DRAG-CORNER-PEEK, 2026-05-06): source X
      // is now the FREE-FLOATING card's release position, not the
      // lane-snap. Pre-Phase-29 the card was X-locked to the ghost's
      // sub-lane in lockstep so `sourceX = snapInPos.translateX`
      // (= finger's lane-snap left edge) was correct. After Phase 29
      // the card free-floats at `panXAbs - effW*2/3`, so the snap-in
      // animation has to slide FROM there TO the ghost's position.
      // `effW` mirrors `DraggableEvent.draggingAnimatedStyle`'s
      // `effectiveWidth` derivation: prefer the captured pickup
      // width, fall back to laneWidth, fall back to BODY_BLOCK_WIDTH.
      // In mini-cols mode at this point pickup == laneWidthForDrop
      // by construction (Phase 20.1's pickupVisualWidthRef contract).
      //
      // FORK Phase 35 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
      // 2026-05-07): `sourceY` updated for the new `H/2` pickup
      // (was `H/3` in Phase 33) so the snap-in animation source
      // matches the rendered card Y at release. `sourceX` stays
      // at `(effW * 2) / 3` — the corner-peek X pickup is
      // explicitly preserved per the user's redirect ("the
      // relative position of shadow to card is non-negotiable").
      //
      // FORK Phase 35.1 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
      // 2026-05-07): if the helper said we're in rotation at
      // release (`ghostStepResolvedYPx !== 0`), the card was
      // lane-snapped at release (Option B in DraggableEvent
      // .draggingAnimatedStyle). The snap-in source must reflect
      // the lane-snapped X to avoid a one-frame teleport on the
      // first animated frame. `snapInPos.translateX` is the lane
      // left edge in viewport coords (computed by
      // resolveLaneDropPosition with the same panXAbs); use it
      // directly. For default cells (no rotation): keep the
      // corner-peek source (`releasePanXAbs - (effW * 2) / 3`).
      //
      // PLAN-DEVIATION: 2026-05-06-card-floats-ghost-snaps —
      // docs/PLAN-DEVIATIONS.md#2026-05-06-card-floats-ghost-snaps
      var pickupWidthAtRelease = dragCardPickupWidth.value;
      var effW = pickupWidthAtRelease > 0
        ? pickupWidthAtRelease
        : (laneWidthForDrop > 0 ? laneWidthForDrop : BODY_BLOCK_WIDTH);
      var inRotationAtRelease = ghostStepResolvedYPx !== 0;
      var sourceX = inRotationAtRelease
        ? snapInPos.translateX
        : releasePanXAbs - (effW * 2) / 3;
      var sourceY = releasePanYAbs - eventHeight.value / 2;
      // FORK Phase 28.1 (P3-FE-DRAG-GHOST follow-up, 2026-05-06):
      // snap-in target X uses the resolver's `ghostShiftX` (= the
      // attenuated X shift the ghost was rendered at on release)
      // instead of the hard `-laneWidthForDrop` shift used by Phase
      // 27.1. This keeps the floating card sliding to the same
      // sub-lane the GHOST occupied at release, which matches the
      // landed-card position computed by Phase 28.1's `dropShiftX`
      // attenuation above. At the canvas X edges where attenuation
      // = 0 the card slides to the FINGER's sub-lane (= ghost's =
      // drop's) instead of one lane to the left, eliminating the
      // teleport-back-one-lane visual at the edges.
      var targetX = snapInPos.translateX + snapInPos.ghostShiftX;
      var targetY = adjustedFinalEventTop - scrollY.value;
      releaseTargetX.value = sourceX;
      releaseTargetY.value = sourceY;
      dragReleasing.value = true;
      // FORK Phase 27.4 (P3-FE-DRAG-GHOST diagnosis, 2026-05-06):
      // log the snap-in start so we can verify on-device that the
      // animation actually fires AND inspect the source/target
      // coordinates. Without this it's impossible to tell whether
      // (a) the animation isn't kicking off, (b) it kicks off with
      // bad coordinates, or (c) it kicks off cleanly but is
      // interrupted by an unmount partway through. See README-FORK
      // Phase 27.4. `pickupWidth` included so we can verify the
      // Phase 27.3 deferred-reset is keeping the card narrow.
      // FORK Phase 30.1 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
      // 2026-05-07): added `viewportLeft`, `viewportRight`,
      // `panXAbs`, `laneCount` so the user's smoke logs explicitly
      // show whether the finger reached the loosened clamp
      // boundary at the edge. Expected at right edge:
      // `panXAbs ≈ viewportRight - laneWidth/3`,
      // `ghostShiftX ≈ -laneWidth/3` (small attenuation),
      // `dropShiftX ≈ +laneWidth/3` (mirrored positive). Mid-
      // canvas: `panXAbs` far from both edges,
      // `ghostShiftX = -laneWidthForDrop` (full),
      // `dropShiftX = +laneWidthForDrop`.
      reactNativeWorklets.scheduleOnRN(gestureLog, "snap-in:start", {
        sourceX: Math.round(sourceX * 10) / 10,
        sourceY: Math.round(sourceY * 10) / 10,
        targetX: Math.round(targetX * 10) / 10,
        targetY: Math.round(targetY * 10) / 10,
        deltaX: Math.round((targetX - sourceX) * 10) / 10,
        deltaY: Math.round((targetY - sourceY) * 10) / 10,
        pickupWidth: dragCardPickupWidth.value,
        laneWidthForDrop: Math.round(laneWidthForDrop * 10) / 10,
        viewportLeft: TIME_LABEL_WIDTH,
        viewportRight: layout?.width ? Math.round(layout.width * 10) / 10 : null,
        panXAbs: Math.round(releasePanXAbs * 10) / 10,
        laneCount: bodyResourceIds.length,
        // FORK Phase 32 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
        // 2026-05-07): replaced fractional ghostShiftX with the
        // discrete-step SV value at release. `shadowOffsetXSteps`
        // is the SV value (potentially mid-animation, fractional);
        // `shadowOffsetXStepsRounded` is what was actually used to
        // compute the drop (-1 = mid-canvas drop one lane LEFT of
        // finger; 0 = edge-converged drop in finger's lane).
        shadowOffsetXSteps: Math.round(shadowOffsetXSteps.value * 100) / 100,
        shadowOffsetXStepsRounded: ghostStepDiscrete,
        ghostShiftX: Math.round(snapInPos.ghostShiftX * 10) / 10,
        dropShiftX: Math.round(dropShiftX * 10) / 10,
        // FORK Phase 35.1 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
        // 2026-05-07): the perpendicular Y axis SV. Same pattern
        // as `shadowOffsetXSteps` above — log both the in-flight
        // SV value AND the helper's TARGET (which is what the
        // drop math actually uses, per Phase 34's helper-as-target
        // invariant extended to Y here). Expected:
        //   - 0 / 0 in default and cross-day cells.
        //   - ≈ -eventHeight/2 for both fields in last-day cells
        //     (Phase 35.1 rotation).
        // `dropShiftY` reflects the rotation when active
        // (= `eventHeight/2 - ghostStepResolvedYPx`).
        shadowOffsetYPx: Math.round(shadowOffsetYPx.value * 10) / 10,
        shadowOffsetYPxRounded: Math.round(ghostStepResolvedYPx * 10) / 10,
        dropShiftY: Math.round(dropShiftY * 10) / 10,
        inRotationAtRelease,
        viewportTop: 0,
        viewportBottom: layout?.height ? Math.round(layout.height * 10) / 10 : null,
        panYAbs: Math.round(releasePanYAbs * 10) / 10,
        eventHeight: Math.round(eventHeight.value * 10) / 10,
      });
      releaseTargetX.value = Animated2.withTiming(targetX, { duration: 150 });
      releaseTargetY.value = Animated2.withTiming(targetY, { duration: 150 }, (finished) => {
        "worklet";
        // FORK Phase 27.4 — log the callback fire AND whether the
        // dragReleasing guard actually fired the cleanup. `finished`
        // is the withTiming "did it run to completion" arg
        // (Reanimated supplies it). If `finished === false` the
        // animation was cancelled by a competing withTiming or
        // direct write to releaseTargetY — a major clue we should
        // not miss.
        var didCleanup = dragReleasing.value === true;
        reactNativeWorklets.scheduleOnRN(gestureLog, "snap-in:end", {
          finished,
          didCleanup,
          dragReleasing: dragReleasing.value,
          isDragging: isDragging.value,
        });
        // Only complete the release if we're still in the release
        // window. If a new drag started during the 150ms animation
        // (rare — see safety reset on the pan onUpdate path), it
        // already set `dragReleasing.value = false` and `isDragging
        // .value = true`. Skipping here prevents the orphan
        // callback from killing the new drag.
        if (dragReleasing.value === true) {
          // FORK Phase 27.5 (P3-FE-DRAG-GHOST diagnosis, 2026-05-06):
          // we DELIBERATELY do NOT flip `dragReleasing.value = false`
          // here. The reason: `DraggableEvent.draggingAnimatedStyle`
          // checks `if (dragReleasing.value === true)` to use the
          // animated `releaseTargetX/Y` values; if we flip
          // `dragReleasing` false the worklet re-evaluates and falls
          // through to the lane-snap fallback branch, which reads
          // `panXAbs.value` / `panYAbs.value`. Because Phase 27.3
          // suppresses `panXAbs/panYAbs` writes in mini-cols mode,
          // those SVs still hold the *release-time finger position*
          // (= our `sourceX/sourceY`). The result: at t=150ms the
          // card just finished sliding from sourceY → targetY, and
          // one frame later it snaps BACK to sourceY because the
          // lane-snap fallback reads the unmoved panYAbs. That's
          // the persistent snap-back the user reported through
          // Phase 27.4 ("Still seeing the same sort of janky
          // animation"). With this entry on the books the snap-in
          // logs from Phase 27.4 confirmed the diagnosis:
          // sourceY:213.3 → targetY:186.7 (deltaY:-26.7) slid up
          // cleanly, then the card jumped 26.7px back DOWN.
          //
          // By leaving `dragReleasing.value === true` until the
          // consumer's `setSelectedEvent(null)` propagates (which
          // happens via the deferred `finalizeDrag` →
          // `useDraggedEventDraftSubscription` → `setSelectedEvent
          // (null)` cascade scheduled below), the card holds its
          // `releaseTargetY` position frozen at the destination
          // until React unmounts it. When `selectedEvent` flips to
          // null the worklet's early-return returns `opacity: 0,
          // transform: [translateY:0, translateX:0]` — the card
          // teleports to (0, 0) at opacity 0, which is invisible.
          // Then the optimistic update renders the moved EventBlock
          // at the destination. Net visual: clean slide → invisible
          // unmount → moved card pops in at destination.
          //
          // The next drag's safety reset (`pan.onUpdate` and
          // `internalOnDoubleTap.current`, both Phase 27.3) will
          // flip `dragReleasing` false at pickup, so leaving it
          // true between drags has no carry-over effect.
          isDragging.value = false;
          // FORK Phase 27.6 (P3-FE-DRAG-GHOST diagnosis, 2026-05-06):
          // DELIBERATELY do NOT reset `dragCardPickupWidth.value = 0`
          // here. The Phase 27.3 reset fired at t=150ms (animation
          // complete) AND BEFORE the consumer's `setSelectedEvent
          // (null)` unmounted the floating card — for the few frames
          // between worklet-callback-runs and React-tree-rerenders the
          // `dynamicStyle` recomputed `effectiveWidth = laneWidth`
          // (the full multi-tech column width — much larger than the
          // sub-lane pickup width). Result: the user saw the card
          // slide cleanly to the ghost, then visibly EXPAND to full
          // column width and pop, then unmount. Matches the user's
          // Phase 27.5 follow-up report: *"Still seeing the same
          // sort of janky animation"* + Phase 27.6 question response
          // selecting "Card visibly resizes (gets bigger or smaller)
          // during the slide" + freeform "disappears, reappears,
          // resizes, jumps/snaps around".
          //
          // Why the reset is safe to skip entirely: on the very next
          // pickup, `pan.onStart` writes
          // `dragCardPickupWidth.value = pickupVisualWidthRef.current`
          // (line 3663), so the stale value never leaks into a future
          // drag. While `selectedEvent` is null between drags the
          // floating card's `dynamicStyle` doesn't render at all (the
          // `draggingAnimatedStyle` early-return drops opacity to 0
          // before the View can reflow). Leaving the SV at the prior
          // pickup value has zero observable effect.
          //
          // The non-mini-cols `else` branch below (line ~3484) keeps
          // its synchronous reset because (a) no animation is running
          // there and (b) in single-tech-per-column views pickup
          // width == laneWidth, so the reset is a visual no-op. Not
          // worth touching that path and risking a regression in the
          // day-calendar drag the user just confirmed working.
          // FORK Phase 27.4 (P3-FE-DRAG-GHOST diagnosis, 2026-05-06):
          // defer `finalizeDrag` (which writes the dragged-event
          // draft, which the consumer's
          // `useDraggedEventDraftSubscription` reacts to by
          // immediately calling `setSelectedEvent(null)`) until the
          // snap-in animation completes. Without this defer, the
          // floating card unmounts within ~50ms of release (way
          // before the 150ms slide finishes), the user sees the
          // card disappear, and then the optimistic-update render
          // pops the moved EventBlock in at the destination —
          // matching the user's report: *"moves a tiny bit towards
          // the shadow, then resizes to full width...moves up and
          // away from the shadow then teleports to the left...then
          // disappears for a second and then snaps into place."*
          // The 150ms delay before the consumer's onDragEnd fires
          // is acceptable — the user perceives the slide as the
          // appointment "settling" before the network commit.
          // Outside mini-cols (the `else` branch below) the call
          // stays synchronous because there's no animation to
          // protect.
          reactNativeWorklets.scheduleOnRN(gestureLog, "pan:end:finalize", colIndex);
          reactNativeWorklets.scheduleOnRN(finalizeDrag, colIndex, adjustedFinalEventTop, eventHeight.value, false, xWithinColumn);
        }
      });
    } else {
      // FORK Phase 27.3 — reset pickup width synchronously in the
      // non-mini-cols branch (no animation, card unmounts immediately
      // after `isDragging.value = false` so width fall-back to the
      // prop is invisible to the user).
      // FORK Phase 27.4 — log so we know the non-mini-cols branch
      // was taken (vs. the snap-in branch); helps disambiguate
      // when the user reports the animation didn't fire.
      reactNativeWorklets.scheduleOnRN(gestureLog, "snap-in:skip", {
        inMiniColsForDrop,
        techCount: bodyResourceIds.length,
        isMultiDay,
        multiTechMode,
      });
      dragCardPickupWidth.value = 0;
      isDragging.value = false;
      // FORK Phase 27.4 — non-mini-cols path: schedule synchronously
      // (no animation to protect from the consumer's setSelectedEvent
      // (null) cascade). This preserves the historical drop timing
      // for single-tech / single-day / stacked modes.
      // FORK Phase 19 (P2-FE-6 chunk b): fingerXAbs/Y already reset
      // to NaN at the top of this onEnd block (covers all exit paths).
      reactNativeWorklets.scheduleOnRN(gestureLog, "pan:end:finalize", colIndex);
      reactNativeWorklets.scheduleOnRN(finalizeDrag, colIndex, adjustedFinalEventTop, eventHeight.value, false, xWithinColumn);
    }
  });
  const pinchGesture = reactNativeGestureHandler.Gesture.Pinch().onStart((evt) => {
    "worklet";
    reactNativeWorklets.scheduleOnRN(gestureLog, "pinch:start", { pointers: evt.numberOfPointers, hasSelected: !!selectedEvent, isDrag: isDragging.value });
    if (isDragging.value) return;
    if (selectedEvent) {
      isPinching.value = true;
      pinchBaseHeight.value = eventHeight.value;
      reactNativeWorklets.scheduleOnRN(gestureLog, "pinch:resize:begin", eventHeight.value);
    } else {
      isZooming.value = true;
      zoomBaseHourHeight.value = hourHeight;
      reactNativeWorklets.scheduleOnRN(gestureLog, "pinch:zoom:begin", hourHeight);
    }
  }).onUpdate((evt) => {
    "worklet";
    if (isZooming.value) {
      const newH = zoomBaseHourHeight.value * evt.scale;
      reactNativeWorklets.scheduleOnRN(fireZoom, newH);
      return;
    }
    if (!isPinching.value) return;
    const newHeight = pinchBaseHeight.value * evt.scale;
    const snappedHeight = Math.round(newHeight / snapInterval) * snapInterval;
    let finalHeight = Math.max(hourHeight / 4, snappedHeight);
    const maxAllowedHeight = totalDayHeight - eventStartedTop.value;
    finalHeight = Math.min(finalHeight, maxAllowedHeight);
    if (finalHeight !== eventHeight.value) {
      eventHeight.value = finalHeight;
      const onScreenTop = eventStartedTop.value - scrollY.value;
      panYAbs.value = onScreenTop + finalHeight / 2;
      reactNativeWorklets.scheduleOnRN(triggerHaptic);
    }
  }).onEnd((evt) => {
    "worklet";
    if (isZooming.value) {
      isZooming.value = false;
      const finalH = zoomBaseHourHeight.value * evt.scale;
      reactNativeWorklets.scheduleOnRN(gestureLog, "pinch:zoom:end", finalH);
      reactNativeWorklets.scheduleOnRN(fireZoom, finalH);
      return;
    }
    if (isPinching.value) {
      isPinching.value = false;
      const finalXOnScreen = panXAbs.value;
      const absoluteX = finalXOnScreen + scrollX.value;
      const newStaffIndex = Math.floor((absoluteX - TIME_LABEL_WIDTH) / BODY_BLOCK_WIDTH);
      const colIndex = Math.max(0, Math.min(newStaffIndex, columns.length - 1));
      reactNativeWorklets.scheduleOnRN(gestureLog, "pinch:resize:end", { col: colIndex, top: eventStartedTop.value, h: eventHeight.value });
      reactNativeWorklets.scheduleOnRN(finalizeDrag, colIndex, eventStartedTop.value, eventHeight.value, true);
      return;
    }
    reactNativeWorklets.scheduleOnRN(gestureLog, "pinch:end:noAction");
  });
  const zoomPanGesture = reactNativeGestureHandler.Gesture.Pan().minPointers(2).onStart(() => {
    "worklet";
    savedTX.value = zoomTX.value;
    savedTY.value = zoomTY.value;
    reactNativeWorklets.scheduleOnRN(gestureLog, "zoomPan:start", { tx: zoomTX.value, ty: zoomTY.value });
  }).onUpdate((evt) => {
    "worklet";
    if (isPinching.value || isZooming.value || selectedEvent) return;
    zoomTX.value = savedTX.value + evt.translationX;
    zoomTY.value = savedTY.value + evt.translationY;
  }).onEnd(() => {
    "worklet";
    reactNativeWorklets.scheduleOnRN(gestureLog, "zoomPan:end", { tx: zoomTX.value, ty: zoomTY.value });
  });
  const composedGesture = reactNativeGestureHandler.Gesture.Simultaneous(panGesture, pinchGesture, zoomPanGesture);
  const scrollListTo = (x) => {
    flashListRef.current?.scrollToOffset({ offset: x, animated: false });
  };
  Animated2.useFrameCallback((frameInfo) => {
    if (autoScrollXSpeed.value === 0) {
      return;
    }
    const now = frameInfo.timeSinceFirstFrame;
    const scrollInterval = 500;
    if (now - lastXScrollTime.value > scrollInterval) {
      lastXScrollTime.value = now;
      const increment = BODY_BLOCK_WIDTH * Math.sign(autoScrollXSpeed.value);
      const newScrollX = scrollX.value + increment;
      reactNativeWorklets.scheduleOnRN(scrollListTo, newScrollX);
      reactNativeWorklets.scheduleOnRN(triggerHaptic, "Medium");
    }
  });
  Animated2.useFrameCallback(() => {
    if (autoScrollSpeed.value === 0) {
      return;
    }
    const increment = snapInterval / 5 * Math.sign(autoScrollSpeed.value);
    const newScrollY = scrollY.value + increment;
    Animated2.scrollTo(verticalScrollViewRef, 0, newScrollY, false);
    if (isDragging.value) {
      let currentEventTop = panYAbs.value - eventHeight.value / 2 + newScrollY;
      currentEventTop = Math.round(currentEventTop / snapInterval) * snapInterval;
      eventStartedTop.value = Math.max(0, currentEventTop);
    }
    if (isPinching.value) {
      const onScreenTop = eventStartedTop.value - newScrollY;
      panYAbs.value = onScreenTop + eventHeight.value / 2;
    }
    const scrollDiff = Math.abs(newScrollY - lastHapticScrollY.value);
    if (scrollDiff >= snapInterval) {
      lastHapticScrollY.value = newScrollY;
      reactNativeWorklets.scheduleOnRN(triggerHaptic, "Medium");
    }
  });
  React19.useEffect(() => {
    // FORK Phase 17 (P2-FE-5 chunk 2b): long-press is now a free
    // gesture. Drag init moved to `internalOnDoubleTap.current`
    // below. This callback only forwards to the consumer's
    // `onEventLongPress` so it can route the gesture (e.g. dismiss
    // draft, open quick-action menu).
    internalOnLongPress.current = (event) => {
      // FORK Phase 28.2-logging — route through logCal for calendarId tagging.
      if (__DEV__) logCal("gesture", "longPress (no drag init)", { eventId: event?.id, resourceId: event?.resourceId });
      onLongPressRef.current?.(event);
    };
    // FORK Phase 17 (P2-FE-5 chunk 2b): drag init runs on double-tap.
    // The detection lives in EventBlock (JS-side, 280 ms window). The
    // entire body below is the pre-Phase-17 long-press init code,
    // moved verbatim — same panYAbs / panXAbs / startedY / eventHeight
    // / selectedEvent / dragReady sequence, same haptic.
    internalOnDoubleTap.current = (event) => {
      // FORK Phase 28.2-logging — route through logCal for calendarId tagging.
      if (__DEV__) logCal("gesture", "doubleTap", { eventId: event?.id, resourceId: event?.resourceId, from: event?.from, to: event?.to, minuteOffset });
      onDoubleTapRef.current?.(event);
      const hh = hourHeightRef.current;
      const eventTop = scalePosition(event.from - minuteOffset, hh);
      const eventTo = event.to < event.from ? event.to + 1440 : event.to;
      originalDurationRef.current = eventTo - event.from;
      const rawHeight = scalePosition(eventTo - event.from, hh);
      const MIN_DRAG_PX = Math.max(hh / 3, 24);
      const initialHeight = Math.max(rawHeight, MIN_DRAG_PX);
      const panAbsValue = eventTop - scrollY.value + initialHeight / 2;
      panYAbs.value = panAbsValue;
      startedY.value = panAbsValue;
      eventStartedTop.value = eventTop;
      const resources2 = resourcesRef.current;
      const days2 = daysRef.current;
      const APPOINTMENT_BLOCK_WIDTH2 = apptWidthRef.current;
      const isMultiDay2 = isMultiDayRef.current;
      const EPS = 1e-4;
      const leftmostColumnIndex = Math.max(0, Math.floor((scrollX.value + EPS) / APPOINTMENT_BLOCK_WIDTH2));
      let absoluteColIndex;
      if (!isMultiDay2) {
        absoluteColIndex = findResourceIndexFor(event.resourceId, resources2?.map((r) => r.id));
      } else {
        absoluteColIndex = findDayIndexFor(event.date, days2);
      }
      const screenColumn = absoluteColIndex - leftmostColumnIndex;
      // FORK Phase 36 (PR-UX-11, 2026-05-09): in mini-cols mode the
      // SOURCE EventBlock is rendered at
      //   colStart + laneIndex * laneWidth + laneWidth/2
      // (i.e. lane center, NOT column center). The previous formula
      // (`colStart + colWidth/2`) put `panXAbs` at the column center
      // on pickup, which made the floating card visibly "jump" to a
      // position colWidth/2 - laneWidth/2 - laneIndex*laneWidth pts
      // away from the source card. For 6 techs at side lanes this is
      // an 80pt jump — well outside the user's finger.
      //
      // The fix: when mini-cols is active, look up the dragged
      // resource's lane index in the LIVE `bodyResourceIds` (via the
      // FORK Phase 36 ref) and seed `panXAbs` at the lane center
      // instead. The corner-peek `card.translateX = panXAbs - 2W/3`
      // formula (Phase 33, unchanged) then renders the floating card
      // at the SAME lane the source card occupied, with the same
      // L-shape offset the rest of the geometry expects. Drop math
      // is unaffected because the user's finger position determines
      // the drop lane, not the pickup position.
      //
      // For non-mini-cols modes (1 tech, stacked, single-day) the
      // formula degrades to the legacy column-center seed because
      // laneCount=1 and laneIndex=0, giving:
      //   colStart + 0 + colWidth/2 = legacy formula
      // — bit-identical to pre-Phase-36 behavior. So this is a
      // surgical mini-cols-only fix.
      var inMiniColsAtPickup = isMultiDay2
        && multiTechModeRef.current === "mini-columns"
        && (bodyResourceIdsRef.current?.length ?? 0) >= 2;
      var laneCountAtPickup = inMiniColsAtPickup
        ? bodyResourceIdsRef.current.length
        : 1;
      var laneWidthAtPickup = APPOINTMENT_BLOCK_WIDTH2 / laneCountAtPickup;
      var laneIndexAtPickup = 0;
      if (inMiniColsAtPickup) {
        var idx = bodyResourceIdsRef.current.indexOf(event.resourceId);
        laneIndexAtPickup = idx >= 0 ? idx : 0;
      }
      const selectedAppointmentStartedX = TIME_LABEL_WIDTH
        + APPOINTMENT_BLOCK_WIDTH2 * screenColumn
        + laneIndexAtPickup * laneWidthAtPickup
        + laneWidthAtPickup / 2;
      // [DIAG-DRAG-OFFSET] (PR-UX-11, 2026-05-09): log the lane-aware
      // pickup seed so the user can verify the floating card lands
      // ON the source lane center, not the column center. Previous
      // formula put `panXAbs` at column-center which made cards in
      // any non-middle lane "jump" up to colWidth/2 pts away from
      // the source on pickup. The geometry summary printed here is
      // the only place we can attribute the seed to the lane: the
      // `card.translateX = panXAbs - 2W/3` formula in
      // `DraggableEvent.draggingAnimatedStyle` doesn't know about
      // lanes, it just consumes `panXAbs`. PURE diagnostic — keep
      // it in for the next on-device verification pass.
      if (__DEV__) {
        try {
          console.log("[DIAG-DRAG-OFFSET] drag-init", {
            calendarId,
            inMiniColsAtPickup,
            laneCountAtPickup,
            laneWidthAtPickup,
            laneIndexAtPickup,
            screenColumn,
            APPOINTMENT_BLOCK_WIDTH2,
            seededPanXAbs: selectedAppointmentStartedX,
            seededFromLegacyColumnCenter: TIME_LABEL_WIDTH
              + APPOINTMENT_BLOCK_WIDTH2 / 2
              + APPOINTMENT_BLOCK_WIDTH2 * screenColumn,
            laneCenterOffsetFromColumnCenterPx: selectedAppointmentStartedX
              - (TIME_LABEL_WIDTH
                + APPOINTMENT_BLOCK_WIDTH2 / 2
                + APPOINTMENT_BLOCK_WIDTH2 * screenColumn),
            eventResourceId: event.resourceId,
            currentBodyResourceIds: bodyResourceIdsRef.current,
          });
        } catch (e) {
          console.log("[DIAG-DRAG-OFFSET] drag-init log threw", String(e));
        }
      }
      panXAbs.value = selectedAppointmentStartedX;
      startedX.value = selectedAppointmentStartedX;
      lastHapticScrollY.value = scrollY.value;
      eventHeight.value = initialHeight;
      // FORK Phase 20 (P3-FE-DRAG-GHOST chunk a) + Phase 20.1 follow-up
      // (2026-05-06): freeze the floating card width to whatever the
      // SOURCE EventBlock was rendered at — i.e. lane width in mini-cols
      // mode, BODY_BLOCK_WIDTH otherwise. `pickupVisualWidthRef` tracks
      // this distinction (updated in the same useEffect as apptWidthRef
      // ~25 lines below this useEffect's setter). DraggableEvent's
      // animated styles will read this SV and ignore subsequent layout
      // changes (most importantly the dwell-driven tech-swap that
      // changes the lane count and thus laneWidth). The "card size =
      // lane width = drop zone width" contract holds because
      // `resolveLaneDropPosition` ALSO returns laneWidth in mini-cols,
      // so the floating card and the ghost overlay are always the
      // same dimensions. See README-FORK Phase 20.1.
      dragCardPickupWidth.value = pickupVisualWidthRef.current;
      // FORK Phase 27.3 (P3-FE-DRAG-GHOST follow-up, 2026-05-06):
      // clear `dragReleasing` at drag-init so a fresh DraggableEvent
      // mount cannot read stale `releaseTargetX/Y` from a previous
      // drag's snap-in animation. Without this, when a user
      // double-taps to start a new drag while a prior animation's
      // `dragReleasing` is still true (rare but possible if the prior
      // animation hasn't completed), the newly-mounted card would
      // briefly appear at the previous drag's target position before
      // pan.onUpdate fires and switches to lane-snap. Belt-and-
      // suspenders companion to the safety reset in pan.onUpdate.
      dragReleasing.value = false;
      // FORK Phase 28.2-logging — route through logCal for calendarId tagging.
      if (__DEV__) logCal("gesture", "selecting event for drag", { eventId: event?.id, top: eventTop, height: initialHeight, rawHeight, durationMin: originalDurationRef.current, panY: panAbsValue });
      setSelectedEvent(event);
      // FORK Phase 28.2-logging — route through logCal for calendarId tagging.
      requestAnimationFrame(() => { if (__DEV__) logCal("gesture", "dragReady=true"); setDragReady(true); });
      triggerHaptic("Medium");
    };
  }, []);
  const internalStableOnLongPress = React19.useCallback((e) => {
    internalOnLongPress.current?.(e);
  }, []);
  const internalStableOnDoubleTap = React19.useCallback((e) => {
    internalOnDoubleTap.current?.(e);
  }, []);
  const onLayout = React19.useCallback((evt) => {
    setLayout(evt?.nativeEvent?.layout);
  }, []);
  const verticalScrollHandler = Animated2.useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event?.contentOffset?.y;
    }
  });
  // FORK: bidirectional horizontal scroll sync between the header avatar
  // strip and the body FlashList. The header has more on-screen presence
  // than the body when there are more techs than `numberOfColumns`, so we
  // let the user swipe the avatar strip directly to bring off-screen techs
  // into view (and the body columns scroll along with them).
  //
  // To avoid a feedback loop (body scrolls header → header onScroll fires →
  // syncs back to body → ...) we track which side the user is actively
  // dragging via `isHeaderDragging`. Only the dragged side writes to the
  // other; programmatic scrolls don't bounce back.
  const isHeaderDragging = Animated2.useSharedValue(false);
  const syncFlashListOffsetX = React19.useCallback((offsetX) => {
    flashListRef.current?.scrollToOffset({ offset: offsetX, animated: false });
  }, []);
  const flashListScrollHandler = Animated2.useAnimatedScrollHandler({
    onScroll: (event) => {
      // FORK Phase 24-x (2026-05-10 — landscape arrow horizontal
      // anchoring bug fix): update `scrollX.value` UNCONDITIONALLY so
      // external overlays (move-chain arrow overlay) can compensate
      // for horizontal FlashList scroll in multi-day mode too. The
      // header-strip sync (`Animated2.scrollTo(headerScrollViewRef)`)
      // stays gated on `!isMultiDay` because in multi-day mode the
      // header strip uses its own day-label component, not the avatar
      // strip. See README-FORK Phase 24-x.
      const offsetX = event?.contentOffset?.x ?? 0;
      scrollX.value = offsetX;
      if (!isMultiDay && !isHeaderDragging.value) {
        Animated2.scrollTo(headerScrollViewRef, offsetX, 0, false);
      }
    }
  });
  const headerScrollHandler = Animated2.useAnimatedScrollHandler({
    onScroll: (event) => {
      if (!isMultiDay && isHeaderDragging.value) {
        const offsetX = event?.contentOffset?.x;
        scrollX.value = offsetX;
        reactNativeWorklets.scheduleOnRN(syncFlashListOffsetX, offsetX);
      }
    },
    onBeginDrag: () => {
      isHeaderDragging.value = true;
    },
    onEndDrag: () => {
      isHeaderDragging.value = false;
    },
    onMomentumEnd: () => {
      isHeaderDragging.value = false;
    }
  });
  const handleBlockLongPress = React19.useCallback((resourceId, time) => {
    // FORK Phase 28.2-logging — route through logCal for calendarId tagging.
    if (__DEV__) logCal("gesture", "blockLongPress", { resourceId, time });
    triggerHaptic("Medium");
    const resource = resources.find((r) => r.id === resourceId);
    const m = String(time).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    const dateStr = m ? `${m[1]}-${m[2]}-${m[3]}` : dateFns.format(new Date(time), "yyyy-MM-dd");
    const hh = m ? parseInt(m[4], 10) : 0;
    const mm = m ? parseInt(m[5], 10) : 0;
    const fromMinutes = hh * 60 + mm;
    const toMinutes = fromMinutes + 30;
    const draftEvent = {
      id: -1,
      resourceId,
      date: dateStr,
      from: fromMinutes,
      to: toMinutes,
      title: "+ New Appointment",
      description: "Drag to position, release to schedule",
      meta: { isDraft: true },
    };
    // FORK Phase 20 (P2-FE-6 chunk c): the Phase-17 bridge that
    // routed long-press → `internalOnDoubleTap.current(draftEvent)`
    // → drag-armed synthetic draft is REMOVED. The REMI app today
    // creates appointments via `onBlockTap` (single-tap on empty
    // grid), and the long-press → auto-drag flow surprised users
    // by silently arming a drag they didn't ask for. We still
    // forward `onBlockLongPress` to consumers so they can opt in to
    // their own behavior, but the vendor itself no longer mutates
    // selection or arms a drag here. `draftEvent` is preserved as a
    // local for future consumers that might want it surfaced (e.g.
    // by extending the `onBlockLongPress` signature later).
    void draftEvent;
    if (onBlockLongPress)
      onBlockLongPress(resource, new Date(time));
  }, [resources, onBlockLongPress]);
  const handleBlockPress = React19.useCallback((resourceId, time) => {
    // FORK Phase 28.2-logging — route through logCal for calendarId tagging.
    if (__DEV__) logCal("gesture", "blockPress", { resourceId, time });
    triggerHaptic("Medium");
    const resource = resources.find((r) => r.id === resourceId);
    if (onBlockTap)
      onBlockTap(resource, new Date(time));
  }, [resources, onBlockTap]);
  React19.useEffect(() => {
    const handleOrientationChange = () => {
      if (selectedEvent) {
        setSelectedEvent(null);
        setDragReady(false);
      }
    };
    const subscription = reactNative.Dimensions.addEventListener("change", handleOrientationChange);
    return () => {
      subscription.remove();
    };
  }, [setSelectedEvent, selectedEvent, setDragReady]);
  React19.useEffect(() => {
    dateRef.current = date;
  }, [date]);
  const renderItem = React19.useCallback(({ item, index }) => {
    const dayDate = !isMultiDay ? void 0 : item.dayDate;
    // FORK Phase 13 (introduced as `multiTechMode`, refined Phase 14):
    // in single-day mode each FlashList row is one resource, so
    // `techsToRender` is always [item]. In multi-day mode, with 2+
    // selected techs and a multi-tech treatment chosen, `techsToRender`
    // is the full selection and we render one event-layer per tech
    // inside the shared day-column. Otherwise we fall back to the
    // legacy single-resource path so consumers that don't pass
    // `multiTechMode` keep their existing behavior. Phase 14 cut the
    // `"stacked-bands"` treatment after user evaluation; only
    // `"stacked"` and `"mini-columns"` remain.
    //
    // PLAN-DEVIATION: 2026-04-20-cut-stacked-bands —
    // docs/implementation-plans/landscape-overlay-rendering.md §3 /
    // §10 spec'd a third "stacked-bands" treatment that we deleted
    // here. See docs/PLAN-DEVIATIONS.md#2026-04-20-cut-stacked-bands
    // PLAN-DEVIATION: 2026-04-20-revert-empty-array-semantics — back
    // to the historical fallback chain. `bodyResourceIds` can no
    // longer be empty (the memo above falls back to all resourceIds
    // for both `undefined` and `[]`), so the only real branch here is
    // single-day vs multi-day. Kept as a defensive fallback in case a
    // future refactor reintroduces an empty `bodyResourceIds` path.
    // See docs/PLAN-DEVIATIONS.md#2026-04-20-revert-empty-array-semantics
    const techsToRender = !isMultiDay
      ? [item]
      : (bodyResourceIds.length > 0 ? bodyResourceIds : resourceIds);
    // FORK Phase 15 (P2-FE-4 follow-up #11): cross-tech drag-end now
    // resolves correctly inside finalizeDrag. For "mini-columns" the
    // drop's in-column X offset picks the destination tech's lane; for
    // "stacked" (overlap) and single-tech the dragged event's original
    // tech is preserved (no spatial signal between techs). The `rid`
    // captured here is still used only for press / disabled-blocks /
    // long-press wiring (which today fires `handleBlockLongPress(rid,
    // ...)` for new-draft creation). Long-press lane-aware draft
    // attribution in mini-columns is a separate, deeper rewrite
    // (`EventGridBlocksSkia` would need to surface the press X) and
    // remains pinned to `techsToRender[0]` for now — drafts can be
    // reassigned via the existing reschedule sheet after creation.
    const rid = !isMultiDay
      ? item
      : techsToRender[0] ?? activeResourceId ?? resourceIds[0];
    const useMultiTech = isMultiDay && techsToRender.length >= 2 && (multiTechMode === "stacked" || multiTechMode === "mini-columns");
    const treatment = useMultiTech ? multiTechMode : void 0;
    const colWidth = BODY_BLOCK_WIDTH;
    const renderEventBlocksFor = (resourceId, key, blockWidth) => /* @__PURE__ */ React19__namespace.default.createElement(
      EventBlocks_default,
      {
        key,
        id: resourceId,
        date: dayDate,
        EVENT_BLOCK_WIDTH: blockWidth,
        hourHeight,
        minuteOffset,
        onPress: stableOnPress,
        onLongPress: internalStableOnLongPress,
        // FORK Phase 17 (P2-FE-5 chunk 2b): wire double-tap → drag.
        onDoubleTap: internalStableOnDoubleTap,
        isEventSelected: isEventSelectedStable,
        isEventDisabled: isEventDisabledStable,
        // BUGFIX (2026-04-20): use the current render-phase renderer
        // directly. The previous ref+effect indirection (`rendererRef`)
        // introduced a one-render lag when `eventStyleOverrides` /
        // `eventSlots` changed (e.g. toggling 1-tech <-> 2-tech in
        // landscape), leaving cards painted with stale colors until a
        // second interaction forced another render.
        eventRenderer: effectiveRenderer,
        mode: overLappingLayoutMode
      }
    );
    let eventLayer;
    if (treatment === "stacked") {
      eventLayer = techsToRender.map((trid) => renderEventBlocksFor(trid, `tech-${trid}`, colWidth));
    } else if (treatment === "mini-columns") {
      const laneWidth = colWidth / Math.max(1, techsToRender.length);
      // PR 2.2 (2026-04-24): diagnostic for the
      // 2026-04-22-mini-columns-leftmost-lane-drag-vanishes bug. We
      // log the lane-0 mount config every render so the user's
      // device repro carries the per-lane geometry that we currently
      // can't reconstruct from the symptom alone (the bug doc
      // suspects the lane-0 wrapper's left=0 / clip behaviour).
      if (__DEV__ && techsToRender.length >= 2) {
        // FORK Phase 20.5 (P3-FE-DRAG-GHOST chunk b diagnostic,
        // 2026-05-06): extended from `lane0TechId` to the full
        // lane-index → tech-id map so we can correlate the
        // "card-shifts-out-of-column-alignment" symptom against the
        // lane that actually rendered. The previous log only showed
        // lane 0, which left us blind to lane-2/lane-3 ordering
        // mismatches between `bodyResourceIds` (sorted) and
        // `selectedResourceIds` (selection order). See README-FORK
        // Phase 20.5 follow-up note.
        // FORK Phase 28.2-logging — route through logCal for calendarId tagging.
        logCal("mini-cols", "lane geometry", {
          dayIndex: index,
          dayDate: dayDate ? dateFns.format(dayDate, "yyyy-MM-dd") : null,
          laneCount: techsToRender.length,
          laneWidth,
          colWidth,
          lanes: techsToRender.map((tid, li) => ({ idx: li, techId: tid })),
        });
      }
      eventLayer = techsToRender.map((trid, i) => /* @__PURE__ */ React19__namespace.default.createElement(
        reactNative.View,
        {
          key: `lane-${trid}`,
          // PR 2.2: explicit overflow: 'visible' so the dragged ghost
          // (rendered as a child of EventBlocks via TouchableOpacity
          // inside this wrapper) can paint outside the lane bounds
          // when the user drags it horizontally to another lane. The
          // default RN behaviour on iOS is `overflow: 'visible'` for
          // Views, but the source-lane visual sometimes appears
          // clipped on user reports — pinning it explicitly removes
          // the ambiguity until we get a tighter repro.
          style: {
            position: "absolute",
            left: i * laneWidth,
            top: 0,
            width: laneWidth,
            height: totalDayHeight,
            overflow: "visible",
          },
        },
        renderEventBlocksFor(trid, `lane-blocks-${trid}`, laneWidth)
      ));
    } else {
      eventLayer = renderEventBlocksFor(rid, `legacy-${rid}`, colWidth);
    }
    return /* @__PURE__ */ React19__namespace.default.createElement(reactNative.View, { key: `${index}-${hourHeight}-${displayHours}`, style: { width: colWidth, height: totalDayHeight } }, /* @__PURE__ */ React19__namespace.default.createElement(reactNative.View, { style: [styles7.timelineContainer, { height: totalDayHeight }] }, /* @__PURE__ */ React19__namespace.default.createElement(
      EventGridBlocksSkia,
      {
        hourHeight,
        APPOINTMENT_BLOCK_WIDTH: colWidth,
        startMinutes: startMinutes ?? 0,
        endMinutes: endMinutes ?? 1440,
        handleBlockPress: (time) => handleBlockPress(rid, combineDateAndTime(dayDate ?? dateRef.current, time)),
        handleBlockLongPress: (time) => handleBlockLongPress(rid, combineDateAndTime(dayDate ?? dateRef.current, time)),
        externalPanGesture: panGesture
      }
    ), /* @__PURE__ */ React19__namespace.default.createElement(
      DisabledIntervals_default,
      {
        id: rid,
        date: dayDate,
        APPOINTMENT_BLOCK_WIDTH: colWidth,
        hourHeight,
        minuteOffset
      }
    ), /* @__PURE__ */ React19__namespace.default.createElement(
      DisabledBlocks_default,
      {
        id: rid,
        date: dayDate,
        APPOINTMENT_BLOCK_WIDTH: colWidth,
        hourHeight,
        minuteOffset,
        onDisabledBlockPress: stableOnDisabledBlockPress
      }
    ), eventLayer));
  }, [
    isMultiDay,
    activeResourceId,
    resourceIds,
    bodyResourceIds,
    multiTechMode,
    BODY_BLOCK_WIDTH,
    hourHeight,
    // FORK: startMinutes/endMinutes/displayHours/totalDayHeight/minuteOffset
    // are closed over inside renderItem (passed to EventGridBlocksSkia,
    // DisabledIntervals, DisabledBlocks, EventBlocks, the row wrapper height,
    // and the row key). The original library only included `hourHeight` here
    // because the visible range was effectively constant per mount. With the
    // user-configurable display range + auto-expand for out-of-range events,
    // these all change at runtime; without including them in deps the
    // FlashList caches a renderItem closure that paints the old range.
    startMinutes,
    endMinutes,
    displayHours,
    totalDayHeight,
    minuteOffset,
    effectiveRenderer,
    isEventSelectedStable,
    isEventDisabledStable,
    overLappingLayoutMode,
    stableOnPress,
    internalStableOnLongPress,
    internalStableOnDoubleTap,
    stableOnDisabledBlockPress,
    dateRef
  ]);
  // FORK: header is split into a (top, optional) compact "queue" strip of
  // dimmed unselected avatars and a (bottom, always present) "main" strip
  // of selected (or all-when-unfiltered) avatars at body-column width. The
  // queue strip lets users see and re-toggle dimmed techs without
  // squashing the main row. Only the MAIN strip is synced bidirectionally
  // with the body FlashList — the queue is a self-contained mini-scroller.
  const mainRowSlotWidth = isHeaderFiltered ? BODY_BLOCK_WIDTH : APPOINTMENT_BLOCK_WIDTH;
  return /* @__PURE__ */ React19__namespace.default.createElement(React19__namespace.default.Fragment, null, /* @__PURE__ */ React19__namespace.default.createElement(StoreFeeder, { resources, store: binding, baseDate: date }), /* @__PURE__ */ React19__namespace.default.createElement(reactNative.View, { style: { flex: 1 } }, !isMultiDay ? /* @__PURE__ */ React19__namespace.default.createElement(reactNative.View, { key: `header-${numberOfColumns}-${width}`, style: { backgroundColor: "white" } },
    isHeaderFiltered && unselectedHeaderIds.length > 0 ? /* @__PURE__ */ React19__namespace.default.createElement(
      reactNative.ScrollView,
      {
        horizontal: true,
        showsHorizontalScrollIndicator: false,
        contentContainerStyle: {
          paddingLeft: TIME_LABEL_WIDTH,
          paddingTop: 8,
          paddingBottom: 4,
          alignItems: "center"
        }
      },
      /* @__PURE__ */ React19__namespace.default.createElement(
        ResourcesComponent,
        {
          date,
          resourceIds: unselectedHeaderIds,
          selectedResourceIds,
          onResourcePress,
          onResourceDoublePress,
          slotWidth: UNSELECTED_AVATAR_WIDTH,
          hideName: true
        }
      )
    ) : null,
    /* @__PURE__ */ React19__namespace.default.createElement(
      Animated2__default.default.ScrollView,
      {
        showsHorizontalScrollIndicator: false,
        contentContainerStyle: {
          overflow: "visible",
          paddingLeft: TIME_LABEL_WIDTH,
          paddingTop: isHeaderFiltered && unselectedHeaderIds.length > 0 ? 6 : 15,
          paddingBottom: 15
        },
        horizontal: true,
        scrollEventThrottle: 16,
        decelerationRate: "fast",
        snapToInterval: mainRowSlotWidth,
        snapToAlignment: "start",
        ref: headerScrollViewRef,
        scrollEnabled: true,
        onScroll: headerScrollHandler
      },
      /* @__PURE__ */ React19__namespace.default.createElement(
        ResourcesComponent,
        {
          date,
          resourceIds: mainRowResourceIds,
          selectedResourceIds,
          onResourcePress,
          onResourceDoublePress,
          onResourceReorder,
          slotWidth: mainRowSlotWidth
        }
      )
    )
  ) : /* @__PURE__ */ React19__namespace.default.createElement(
    DaysComponent,
    {
      APPOINTMENT_BLOCK_WIDTH,
      date,
      mode,
      activeResourceId: activeResourceId ?? resourceIds[0],
      onResourcePress,
      multiDayCount,
      showResourceHeader
    }
  ), /* @__PURE__ */ React19__namespace.default.createElement(reactNativeGestureHandler.GestureDetector, { gesture: composedGesture }, /* @__PURE__ */ React19__namespace.default.createElement(
    Animated2__default.default.View,
    {
      key: numberOfColumns + "-" + width,
      onLayout,
      style: [{ flex: 1, overflow: "hidden" }, zoomStyle]
    },
    selectedEvent && /* @__PURE__ */ React19__namespace.default.createElement(reactNative.View, { style: {
      position: "absolute",
      top: 0,
      left: TIME_LABEL_WIDTH,
      paddingLeft: TIME_LABEL_WIDTH,
      width: width - TIME_LABEL_WIDTH,
      height: "100%",
      backgroundColor: "rgba(0, 0, 0, 0.1)",
      zIndex: 1
    } }),
    /* @__PURE__ */ React19__namespace.default.createElement(
      Animated2__default.default.ScrollView,
      {
        scrollEnabled: !selectedEvent,
        onScroll: verticalScrollHandler,
        ref: verticalScrollViewRef,
        scrollEventThrottle: 16,
        snapToInterval: hourHeight,
        decelerationRate: "fast",
        snapToAlignment: "start",
        bounces: false,
        overScrollMode: "never",
        contentInsetAdjustmentBehavior: "never",
        automaticallyAdjustContentInsets: false,
        style: styles7.container,
        contentContainerStyle: { flexDirection: "row", paddingRight: TIME_LABEL_WIDTH }
      },
      /* @__PURE__ */ React19__namespace.default.createElement(
        TimeLabels,
        {
          startMinutes,
          endMinutes,
          layout,
          hourHeight,
          totalTimelineWidth: isMultiDay
            ? BODY_BLOCK_WIDTH * Math.max(1, visibleDayCount)
            : BODY_BLOCK_WIDTH * Math.max(1, Math.min(numberOfColumns, bodyResourceIds.length)),
          timezone,
          date,
          ref: verticalScrollViewRef,
          // FORK Phase 28.2-logging — thread calendarId into TimeLabels
          // so the [CAL:nowLine] tick log can be attributed to the
          // emitting calendar (DAY-PORTRAIT / WEEK-PORTRAIT / WORKWEEK-
          // LANDSCAPE in REMITechnician).
          calendarId
        }
      ),
    /* @__PURE__ */ React19__namespace.default.createElement(
      reactNative.View,
      // FORK Phase 14: with `"stacked-bands"` cut, the day-column is
      // back to a uniform `totalDayHeight` regardless of selection
      // count. `extraData` still has to flip on `multiTechMode` and
      // `bodyResourceIds.length` so FlashList re-runs `renderItem`
      // when the consumer toggles between treatments or changes the
      // selected-tech roster.
      { style: { height: totalDayHeight } },
      /* @__PURE__ */ React19__namespace.default.createElement(
        AnimatedFlashList,
        {
          extraData: numberOfColumns + width + hourHeight + (overLappingLayoutMode === "stacked" ? 1 : 0) + (multiTechMode === "stacked" ? 1 : multiTechMode === "mini-columns" ? 2 : 0) + bodyResourceIds.length * 17,
          scrollEnabled: !selectedEvent,
          ref: flashListRef,
          onScroll: flashListScrollHandler,
          removeClippedSubviews: true,
          data: !isMultiDay ? bodyResourceIds : columns,
          horizontal: true,
          renderItem,
          keyExtractor: (item, index) => index + "",
          snapToInterval: BODY_BLOCK_WIDTH,
          decelerationRate: "fast",
          snapToAlignment: "start"
        }
      )
    )
    ),
    // FORK Phase 21 (P3-FE-DRAG-GHOST chunk b): drop-target ghost
    // overlay. Mounted as a sibling of DraggableEvent so it lives in
    // the same overlay layer (above the AnimatedFlashList, below the
    // floating card). Gated on mini-cols mode + 2+ techs because the
    // existing `resolveLaneDropPosition` returns null below that bar
    // and the ghost is only meaningful when the destination lane is
    // narrower than the dragged card. The ghost is keyed BEFORE the
    // DraggableEvent below so the floating card paints over it on
    // overlap (the user wants the source card visible at all times).
    // See README-FORK Phase 21.
    selectedEvent && dragReady && multiTechMode === "mini-columns" && bodyResourceIds.length >= 2 && /* @__PURE__ */ React19__namespace.default.createElement(
      DropShadow,
      {
        panXAbs,
        eventStartedTop,
        eventHeight,
        scrollX,
        scrollY,
        bodyBlockWidth: BODY_BLOCK_WIDTH,
        techCount: bodyResourceIds.length,
        columnCount: Math.max(1, isMultiDay ? visibleDayCount : 1),
        techColors,
        isDragging,
        // FORK Phase 32 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
        // 2026-05-07): animated discrete-step shadow offset SV.
        // -1 = ghost one full lane LEFT of finger (mid-canvas).
        // 0 = ghost in finger's lane (edge convergence). The SV
        // animates between these via withTiming(150ms), driven by
        // useAnimatedReaction in CalendarInner.
        shadowOffsetXSteps,
        // FORK Phase 35.1 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
        // 2026-05-07): perpendicular Y axis offset SV. 0 (default)
        // / -eventHeight/2 (rotation cells = last visible day's
        // all lanes). See CalendarInner declaration + the
        // `useAnimatedReaction` blocks above for the geometry
        // derivation.
        shadowOffsetYPx
      }
    ),
    selectedEvent && dragReady && /* @__PURE__ */ React19__namespace.default.createElement(
      DraggableEvent,
      {
        selectedEvent,
        APPOINTMENT_BLOCK_WIDTH: BODY_BLOCK_WIDTH,
        hourHeight,
        eventStartedTop,
        eventHeight,
        panXAbs,
        panYAbs,
        slots: props.eventSlots,
        styleOverrides: props.eventStyleOverrides,
        // FORK Phase 20 (P3-FE-DRAG-GHOST chunk a): see DraggableEvent
        // prop doc-block + README-FORK Phase 20.
        dragCardPickupWidth,
        // FORK Phase 27.1 (P3-FE-DRAG-GHOST follow-up, 2026-05-06):
        // mirrors the props DropShadow already receives so the
        // floating card lane-snaps in lockstep with the ghost.
        // See README-FORK Phase 27.1.
        // FORK Phase 27.3 (P3-FE-DRAG-GHOST follow-up, 2026-05-06):
        // pass `bodyBlockWidth: 0` in non-mini-cols modes so the
        // lane-snap branch in `draggingAnimatedStyle` early-exits to
        // the Phase 20.4 finger-following fallback. Without this, the
        // single-day "each tech is its own column" layout was
        // triggering the lane-snap math (which assumes mini-cols
        // sub-lanes), and the card was clamping to one of N
        // positions in column 0 ("barely moves"). User report:
        // *"the day calendar with the technician avatars that can be
        // moved, multiselected, etc in portrait mode is messed up
        // and barely move. But the week calendar that is 1 tech at
        // a time multi days, works fine still."*
        bodyBlockWidth: (multiTechMode === "mini-columns" && isMultiDay && bodyResourceIds.length >= 2) ? BODY_BLOCK_WIDTH : 0,
        techCount: bodyResourceIds.length,
        columnCount: Math.max(1, isMultiDay ? visibleDayCount : 1),
        scrollX,
        // FORK Phase 27.2 (P3-FE-DRAG-GHOST follow-up, 2026-05-06):
        // release-animation SVs declared above. See README-FORK
        // Phase 27.2.
        dragReleasing,
        releaseTargetX,
        releaseTargetY,
        // FORK Phase 32: layoutHeight + touchY props removed; the
        // visual yShift envelope was deleted in favour of
        // pan-onUpdate snap-clamp math.
        //
        // FORK Phase 35.1 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
        // 2026-05-07): rotation-state SV. When non-zero, the card
        // lane-snaps to the finger's lane center (Option B). When
        // zero, the corner-peek `panX - 2W/3` formula is used.
        // Conditional lane-snap; corner-peek default preserved.
        shadowOffsetYPx
      }
    )
  ))));
};
var Calendar = ({ theme, ...rest }) => {
  return /* @__PURE__ */ React19__namespace.default.createElement(CalendarThemeProvider, { theme }, /* @__PURE__ */ React19__namespace.default.createElement(CalendarInner, { ...rest }));
};
var styles7 = reactNative.StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff"
  },
  timelineContainer: {
    borderColor: "#ddd",
    borderRightWidth: 1,
    position: "relative",
    height: "100%"
  }
});
var Calendar_default = Calendar;

exports.Calendar = Calendar_default;
exports.CalendarBindingProvider = CalendarBindingProvider;
exports.useCalendarBinding = useCalendarBinding;
exports.resolveLandedResourceId = resolveLandedResourceId;
// FORK Phase 18 (P2-FE-6 chunk a): see README-FORK.
exports.useDragSharedValues = useDragSharedValues;
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map