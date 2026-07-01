# React Native Resource Calendar — REMI Fork

Forked from [wei102193/react-native-resource-calendar](https://github.com/wei102193/react-native-resource-calendar) v1.1.0.

## Why we forked

Upstream does not expose enough surface to do what we need:

1. No header customization slot — the resource avatar strip is rendered internally and cannot be overridden, so we cannot add gestures or visual states (selected / dimmed) on the avatars.
2. No callbacks for resource long-press, double-tap, or reorder.
3. Several bug fixes / behavior changes are already required by this app and were previously applied via `patch-package` (the patch lived at `patches/react-native-resource-calendar+1.1.0.patch`). Those changes are now baked into `dist/` here.

The fork lets us evolve the library at our own pace without juggling a 1500-line patch file.

## Layout

| Folder | Purpose |
|---|---|
| `src/` | Cloned upstream source at tag `v1.1.0`. Currently used as REFERENCE only — runtime serves `dist/`. |
| `dist/` | Compiled JS that the app consumes. Currently the upstream v1.1.0 build with the previous `patches/...patch` already applied. |
| `package.json` | `main` / `module` / `react-native` / `types` all point at `dist/`, mirroring upstream's published shape. The host app pulls this folder in via `"react-native-resource-calendar": "file:./vendor/react-native-resource-calendar"` in the root `package.json`. |

## Modifications already in dist/ (carried over from previous patch-package patch)

These are baked into `dist/index.js`, `dist/index.mjs`, and the `.d.ts` files:

- New `endMinutes` prop on `CalendarProps` to bound the visible vertical range (we use 18:00 instead of 24:00).
- New `multiDayCount` prop to override the visible day count in week / 3-day modes (used for the 4-day workweek view).
- New `scrollsToTop` prop and `onZoom` callback.
- Pinch-to-resize an in-progress drag, plus pinch-to-zoom (replaces the old "pull-to-resize" interaction).
- Two-finger pan to translate the calendar.
- `finalizeDrag` now distinguishes resize vs. move and applies the visible `minuteOffset` correctly.
- `handleBlockLongPress` produces a draft event so empty-slot long-press immediately enters drag mode.
- Pan gesture `onEnd` finalizes a draft event even when the user never slid their finger (no `isDragging.value` flip). Without this the long-press-and-release flow worked "every other time" — whenever the finger stayed inside the draggable bounds the whole time, `isDragging.value` never flipped, `finalizeDrag` never ran, and the dashed draft block disappeared without firing `onDragEnd`. The fix: if `selectedEvent` is set when `onEnd` fires with `!isDragging.value`, finalize at the original press position so the consumer's create-event sheet still opens.
- `EventBlock` enforces a minimum height (22px) and wider hit slop so very short events stay tappable.
- FlashList no longer bounces / overscrolls.
- `currentTime` indicator clamps to the visible range.
- Various `console.log` calls under `[CAL:...]` namespaces for debugging. As of P0-FE-6 every site is wrapped in `if (__DEV__) ...` so production bundles strip them entirely (`console.warn` / `console.error` are intentionally left bare and would still fire in production if added).

## Editing the fork

Surgical bug fixes can be made directly in `dist/index.js` (this is what the upstream patch did). Larger or new features (Phase 3+ in the spec) should:

1. Be added to `src/` first.
2. Then ported into `dist/index.js` manually, OR rebuild via `npm run build` inside this folder (will require installing tsup and the other devDeps once).

The `src/` tree is kept up to date with the changes so future maintainers see canonical TypeScript instead of compiled output.

## Updating from upstream

If we ever want to pull in new upstream releases:

1. Re-clone the upstream repo at the desired tag into a scratch folder.
2. Diff against `src/` here to identify which of our REMI-specific changes need to be re-applied.
3. Build a fresh `dist/`.

At that point it may be worth abandoning the dist-as-source-of-truth model and porting everything cleanly into `src/`.

## Touched files (running list)

### Phase 2 — vendor scaffolding
- `vendor/react-native-resource-calendar/dist/*` — copied in from the previous patched node_modules build.
- `vendor/react-native-resource-calendar/package.json` — fork metadata; same entry points as upstream.

### Phase 3 / 5 — header strip rewrites (live in `dist/index.js` only; `dist/index.mjs` is intentionally NOT in sync because Metro uses the `react-native` field which points at `dist/index.js`)
- `dist/index.js`
  - **`ResourceComponent`** — rewritten to drop the inner `TouchableOpacity` and own a composed gesture (`Race` of LongPress+Pan, double-tap, single-tap). Renders inside an `Animated.View` whose translateX / scale come from a parent `useAnimatedStyle` so neighbours can shift during a drag-to-reorder. Honors `isFiltered` / `isSelected` for the dim-when-deselected look and a blue ring for the active selection.
  - **`ResourcesComponent`** — owns two reanimated shared values (`dragIndex` -1 sentinel + `dragX` translation). Computes `isReorderEnabled` from `onResourceReorder` + count > 1. On gesture end, builds the new ordered id list and fires the consumer callback.
  - **`CalendarInner`** — destructures three new props: `selectedResourceIds`, `onResourceDoublePress`, `onResourceReorder`. Adds a memoized `bodyResourceIds = resourceIds.filter(selected)` that the FlashList body uses (so unselected columns disappear and remaining columns get wider). The header still iterates the full `resourceIds`.
  - `finalizeDrag` and the `columns` memo were updated to use `bodyResourceIds` for landing math in day mode so card drops snap to the correct (filtered) column.
- `dist/index.d.ts` and `dist/index.d.mts` — added `selectedResourceIds`, `onResourceDoublePress`, `onResourceReorder` props to `CalendarProps`.

### Phase 7 — bidirectional header ↔ body horizontal scroll sync
- `dist/index.js`
  - The header `Animated.ScrollView` (the one wrapping `ResourcesComponent`) now has `scrollEnabled: true` (was `false`) and `snapToInterval: APPOINTMENT_BLOCK_WIDTH` so the user can swipe the avatar strip directly to bring off-screen techs into view (only matters when `resourceIds.length > numberOfColumns`).
  - New `headerScrollHandler` syncs the FlashList body to the header via `flashListRef.current?.scrollToOffset(...)` (called via `scheduleOnRN` from a worklet). Only writes when `isHeaderDragging.value` is true.
  - Existing `flashListScrollHandler` was tightened to only sync header from body when `!isHeaderDragging.value`. Together with the `onBeginDrag`/`onEndDrag`/`onMomentumEnd` handlers on the header, this prevents the body→header→body feedback loop.
  - The avatar gesture stack (`Race(dragSet, double, single)`) is unchanged. `Tap` and `LongPress` fail on movement, and `Pan` is `manualActivation(true)` so it stays dormant until LongPress activates it — that means a quick horizontal swipe falls through to the parent ScrollView (the new behavior). A still hold still triggers reorder.

### Phase 8 — body columns fill the viewport when filtered + two-row header (queue above, main below)
- `dist/index.js`
  - New `UNSELECTED_AVATAR_WIDTH` constant (`44` in `CalendarInner`) — slot width for each dimmed avatar in the compact queue row.
  - New derived `BODY_BLOCK_WIDTH = (width - TIME_LABEL_WIDTH) / max(1, min(numberOfColumns, bodyResourceIds.length))` (in day mode; multiDay falls through to `APPOINTMENT_BLOCK_WIDTH`). When the user multi-selects a subset of techs, body columns expand to fill the viewport — no whitespace, and no reserved space subtracted (the queue row sits ABOVE, not next to).
  - **Two-row header layout** (in `CalendarInner`): when `isHeaderFiltered && unselectedHeaderIds.length > 0`, the header renders TWO stacked rows:
    - TOP "queue" row — a separate horizontal `ScrollView` (NOT `Animated2.ScrollView`, NOT synced with body) containing each unselected/dimmed avatar at `slotWidth = UNSELECTED_AVATAR_WIDTH` with `hideName: true`. Drag-to-reorder is intentionally disabled in this row (`onResourceReorder` not passed). Tap/double-tap still re-select / enter Workweek view as expected.
    - BOTTOM "main" row — the existing `Animated2.ScrollView` with the bidirectional body sync (`headerScrollHandler`, `headerScrollViewRef`). Iterates `mainRowResourceIds = isHeaderFiltered ? bodyResourceIds : resourceIds` and uses `slotWidth = mainRowSlotWidth = isHeaderFiltered ? BODY_BLOCK_WIDTH : APPOINTMENT_BLOCK_WIDTH`. Each selected avatar sits centered directly over its body column.
    - When unfiltered (or all techs selected), the queue row collapses; the main row uses `APPOINTMENT_BLOCK_WIDTH` slots and behavior matches the pre-Phase-8 baseline.
  - **`ResourcesComponent` simplified**: now takes a single `slotWidth` prop and an optional `hideName` prop. It iterates whatever `resourceIds` list it's given (the parent decides) and applies `selectedResourceIds`-based dim/highlight per avatar. The previous `displayResourceIds` (selected-first reorder) and `selectedSlotWidth/unselectedSlotWidth` logic was removed — the queue/main row split at the call site replaces it entirely.
  - **`ResourceComponent` adds a `hideName` prop** that suppresses the under-avatar name `Text`. Used by the queue row so 44px slots don't clip text.
  - All body-side consumers continue to use `BODY_BLOCK_WIDTH`: `renderItem` column wrapper, `EventGridBlocksSkia`, `DisabledIntervals`, `DisabledBlocks`, `EventBlocks`, `DraggableEvent`, `TimeLabels.totalTimelineWidth`, FlashList `snapToInterval`, panGesture drag math (`blockMinX/Max`, `panXAbsValue` clamps, auto-scroll edge thresholds, drop-column index calc, final pan-x snap), pinch-resize column index calc, auto-scroll worklet `increment`, and `apptWidthRef` (which drives the in-worklet `APPOINTMENT_BLOCK_WIDTH2` used for initial drag positioning).
  - The MAIN row's `Animated2.ScrollView.snapToInterval` is now `mainRowSlotWidth` (= `BODY_BLOCK_WIDTH` when filtered, `APPOINTMENT_BLOCK_WIDTH` otherwise). Snap stays correct in both modes because every avatar in the main row has a uniform slot width.
  - Header-only `APPOINTMENT_BLOCK_WIDTH` consumers (intentionally untouched): the `DaysComponent` prop (workweek/multiDay header), the layout-params console log.
  - Each `ResourceComponent`'s wrapping `Animated.View` has `layout={Animated2.LinearTransition.duration(220)}` so avatars smoothly slide / resize between rows when the user toggles selection.

### Phase 9 — vertical ScrollView opts out of iOS automatic content insets
- `dist/index.js`, `dist/index.mjs`, `src/components/Calendar.tsx`
  - Added `contentInsetAdjustmentBehavior: "never"` and `automaticallyAdjustContentInsets: false` to the body's vertical `Animated.ScrollView`. iOS defaults `contentInsetAdjustmentBehavior` to `"automatic"` for any ScrollView the system thinks could be edge-attached, which silently injects safe-area + tab-bar padding into the bottom of the scrollable area. The host screen already accounts for the tab bar, so this ScrollView never wants automatic adjustment. (Kept — defensive, but was not the actual cause of the dense-density whitespace bug; see Phase 9.1.)

### Phase 9.1 — FlashList row height pinned to `totalDayHeight` (fixes dense-density bottom whitespace)
- `dist/index.js`, `src/components/Calendar.tsx`
  - The horizontal body `AnimatedFlashList` renders one `<View style={{ width: BODY_BLOCK_WIDTH }}>` per resource column. The wrapper had no explicit `height`, so it auto-sized to its `<EventGridBlocksSkia>` Canvas children. FlashList caches each row's measured height for layout/virtualization. The first paint happens in whatever density was active at mount (commonly the spacious 80px hourHeight, giving `13 * 80 = 1040`). When the user toggles to a dense density (50px → expected `13 * 50 = 650`), `extraData` re-runs `renderItem` and the Canvas children repaint at 650px — but the row wrapper is still cached at 1040px tall. The result is a 390px band of dead whitespace below the last hour that the user can scroll into.
  - Fix: pin the wrapper's height explicitly to `totalDayHeight` (and the inner `timelineContainer` View) so the row size deterministically tracks `hourHeight`. Also include `hourHeight` in the row `key` (`key: \`${index}-${hourHeight}\``) so density toggles fully remount the row instead of relying on FlashList's cache invalidation. The `extraData` prop is left as-is; it's still useful for other prop changes that don't affect height.
  - The instrumentation HUD (`debugHud`, on-screen overlay, `[CAL:vScroll layout]`/`[CAL:vScroll contentSize]`/`[CAL:column0 layout]` console logs) added during diagnosis was removed once the cause was confirmed.

### Phase 9.2 — FlashList container itself wrapped in a fixed-height View (the rest of the dense-density whitespace)
- `dist/index.js`, `src/components/Calendar.tsx`
  - 9.1 sized each FlashList row correctly (grid lines / events stop at `endMinutes`), but the body ScrollView's `contentSize` was still over-tall on density toggles. Cause: in horizontal mode, `<AnimatedFlashList>` itself has no explicit height — it sizes from its parent's flex/intrinsic height, and once measured it caches that container height the same way it caches per-row sizes. With the parent being the vertical ScrollView's row contentContainer, the FlashList inherited the spacious 1040px on first paint and kept reporting 1040 to the parent ScrollView even after the rows were correctly resized to 650. The user could scroll past the last hour into a band of whitespace driven entirely by the FlashList container's stale height.
  - Fix: wrap `<AnimatedFlashList horizontal>` in `<View style={{ height: totalDayHeight }}>`. The wrapper gives the FlashList an unambiguous, prop-derived height that updates with `hourHeight`, so the body ScrollView's `contentSize` collapses back to `dHours * hourHeight`. TimeLabels (already correctly sized) and the wrapper are siblings under `flexDirection: "row"`, so the row content height becomes `max(timeLabels, flashList) = totalDayHeight` exactly.
  - Verified in EAS preview build 2.3.0 across all four density modes (3-col / 6-col × spacious / dense). HUD readouts confirmed `body.contentSize.height == totalDayHeight` in every mode. The temporary `onDebugMeasure` callback prop and host-rendered `CalendarDebugHud` were removed once verified.

### P0-FE-6 — Gate vendored `console.log` sites behind `__DEV__`
- `dist/index.js` — every bare `console.log("[CAL:...]" , ...)` site under the `[CAL:nowLine]`, `[CAL:lib]`, `[CAL:gesture]`, and `[CAL:mini-cols]` namespaces (plus the bare "Haptics not available" log inside the haptics catch) is now wrapped with `if (__DEV__) ...` (or `if (__DEV__ && ...)` where a conditional already wrapped the call). Metro substitutes `__DEV__ → false` in production, the dead-code branches collapse, and the literal log strings disappear from the Hermes bytecode bundle. `console.warn` / `console.error` are intentionally untouched (none currently exist in the file, but the pattern is documented so future additions stay bare and reach Sentry / log aggregators in prod). The `[BUG-A:*]` family — added later under the resource-calendar binding store for the active M22 ghost-duplicate investigation — is **intentionally left bare** so it fires in production builds where the bug reproduces; see `docs/REMI-Calendar-Bug-Runbook.md` and `.cursor/rules/bug-tag-index.mdc`. When M22 is closed, gate those too.

### Phase 9.3 — `renderItem` row key + dependency array updated to track visible-range changes
- `dist/index.js`, `src/components/Calendar.tsx`
  - The host app now ships a user-facing "Calendar Display Hours" setting that lets the user pick the visible day range (default 5:00 AM – 6:00 PM, configurable in 30-min steps). The chosen range is passed through to the library as `startMinutes` / `endMinutes`, and the wrapper additionally auto-expands those bounds at render time to cover any out-of-range appointments / personal events on the visible day(s). Both of those make the visible-range minute span **change at runtime**, not just at mount.
  - The Phase 9.1 row-cache fix was specifically guarded against `hourHeight` changes — the row `key` was `\`${index}-${hourHeight}\`` and the `renderItem` `useCallback` dep list included only `hourHeight` from the height-related variables. With a runtime-variable visible range, that wasn't enough. Two failure modes:
    1. **Stale closure inside `renderItem`** — `startMinutes`, `endMinutes`, `displayHours`, `totalDayHeight`, and `minuteOffset` are all closed-over by `renderItem` (passed to `EventGridBlocksSkia`, `DisabledIntervals`, `DisabledBlocks`, `EventBlocks`, the row wrapper height, and the row key). They were not in the dep array, so changing the visible range did not re-create the callback; FlashList kept re-using the stale closure and rendered the new range with the old `startMinutes`/`endMinutes`/`hourHeight*displayHours` height.
    2. **Stale FlashList row cache** — even after fixing the closure, the row key is what tells FlashList to remount the row vs. reuse its cached layout slot. The Phase 9.1 key only varied with `hourHeight`, so a range change with the same `hourHeight` would skip the remount.
  - Fix:
    - Row key now includes the visible-range minute span: `\`${index}-${hourHeight}-${displayHours}\`` (`dist/index.js`) and `\`${index}-${hourHeight}-${__rangeKey}\`` (`src/components/Calendar.tsx`).
    - `renderItem`'s `useCallback` dep array now includes `startMinutes`, `endMinutes`, `displayHours`, `totalDayHeight`, and `minuteOffset`. Comment in the source explains why.
  - The body ScrollView's contentSize already tracks `totalDayHeight` correctly (Phase 9.2 wraps the FlashList in a fixed-height View), so no other changes were needed for range-change rendering. Verified by toggling the host's "Day Starts" / "Day Ends" steppers in Settings — grid, hour labels, and column heights all snap cleanly to the new range without leaving cached rows.

### Phase 10 — `viewportWidth` prop for constrained-container mounts (landscape calendar)
- `dist/index.js`, `dist/index.d.ts`, `dist/index.d.mts`
  - New optional `viewportWidth?: number` prop on `CalendarProps`. When provided and > 0, the library uses it instead of `useWindowDimensions().width` to derive `APPOINTMENT_BLOCK_WIDTH`, `BODY_BLOCK_WIDTH`, and every derived layout site that reads the local `width` variable (workweek/multiDay header `DaysComponent` key + widths, FlashList `extraData` bucket, selected-event scrim overlay width, body row `key`, and the main `onLayout` container `key`).
  - Why: `LandscapeWorkweekView` renders the calendar inside a constrained wrapper — a 44pt avatar strip (often two of them) sits next to the grid, so the calendar's own container is narrower than `Dimensions.get('window').width`. Without the override, every column width derived above is computed against the full window, so the rightmost day column + its header date label overflow the calendar wrapper and bleed into / under the avatar strip. This was visible as "date labels don't track the column edges" in landscape.
  - Architecture: landscape-calendar.md §3.6 rule 2 prescribes "pass canvas constraints as props, don't have inner components poll dimensions themselves." The fork honors that by reading `viewportWidth` as a prop; the historical `useWindowDimensions()` path is preserved as the fallback so portrait consumers (`ResourceCalendarDayView`, `ResourceCalendarWorkweekView`) stay unchanged.
  - `const { width: windowWidth } = useWindowDimensions(); const width = viewportWidth > 0 ? viewportWidth : windowWidth;` — the only place in `CalendarInner` the raw window width is now used is inside the `[CAL:lib] layout params` debug log (for observability). Every consumer-visible width derivation uses the effective `width`.
  - Note on master plan §3.5 (landscape-calendar plan) — that section enumerates "exactly two" vendored patches (`hideResourceHeader`, `onPanGestureUpdate`) as the landscape fork deltas. This is a third, deliberate addition, documented in `docs/DEVELOPMENT-LOG.md` as a P2-FE-4 follow-up. The master plan should be revised on its next pass to list `viewportWidth` too.

### Phase 11 — `StoreFeeder` clear-on-empty (landscape 0-tech "create-card" surface)
- `dist/index.js`, `dist/index.mjs`
  - `StoreFeeder` previously short-circuited any resource whose `events`/`disabledBlocks`/`disableIntervals` arrays were empty (`if (!items?.length) return;`). For consumers that always send the full week of data, that's harmless. But REMITechnician's `LandscapeWorkweekView` re-emits `resources` with `events: []` on every tech when the user transitions to 0-tech "create-card" mode — and the short-circuit meant the resulting `dayBuckets` was empty, so `setDayDataFor` was never called, the store's `eventsByDay[dayKey]` slices retained the previous selection's data, and the body kept painting the stale events even though the header chips correctly dimmed.
  - Fix: `StoreFeeder` now keeps a `useRef<Set<string>>` of every day-key it wrote to on the previous tick. After populating `dayBuckets` for the new tick, it iterates the ref's set and writes an explicit `{ events: {}, disabledBlocks: {}, disableIntervals: {} }` payload for every day-key that was written last time but is missing this time. `setDayDataFor`'s reducer treats the empty object as truthy (`events ? { ...s.eventsByDay, [dayKey]: events } : s.eventsByDay`) so it overwrites the slice; `useEventsFor(resourceId, dayDate)` then returns `[]` for every resource on the cleared day. The ref is then replaced with the new `currentTouched` set so the next tick's diff is correct.
  - Why a Set ref (not state): we need cross-render persistence WITHOUT re-triggering the effect itself. State would either fight the existing dep array or require a redundant `useEffect` chain; a ref captures "what did I send last time" with O(1) read/write and zero render cost. `dayBuckets.keys()` already enumerates exactly what we want to remember.
  - Why not a `setDayDataFor(dayKey, { events: undefined })` sentinel: the existing reducer at `dist/index.js:560-564` falsy-checks the field (`events ? ... : s.eventsByDay`), so `undefined`/`null` would no-op. Sending `{}` (truthy, empty) is the minimum-impact change that preserves the existing reducer's contract.
  - Master-plan deviation: neither `landscape-calendar.md` nor the master plan §5.1.4 / §5.1.6 documents the StoreFeeder behavior, but both assume "events: [] in the resources prop = empty grid in the body." That assumption is correct from the consumer's perspective, but the library was silently dropping the empty payload. The fix lands here so consumers don't have to know about the internal short-circuit. Documented as a P2-FE-4 follow-up in `docs/DEVELOPMENT-LOG.md`.
  - Worth noting: this fix does NOT address the related "always shows the same tech in workweek mode" issue (the body's `renderItem` only ever uses `activeResourceId ?? resourceIds[0]` per day in multiDay mode). That requires a separate fork pass on `renderItem` + the layout/drag math and is being scoped under `docs/implementation-plans/landscape-overlay-rendering.md`. The clear-on-empty fix here is purely about state hygiene and is independent of that bigger rendering rework.

### Phase 12 — `showResourceHeader` prop + multi-day now-line width fix (Ship 1, follow-up to P2-FE-4)
- `dist/index.js`, `dist/index.mjs` (DaysComponent only), `dist/index.d.ts`, `dist/index.d.mts`
- Two independent fixes shipped together because they share the same pull-request scope and were both reported in the same user feedback round on `LandscapeWorkweekView`:

  **Fix A — `showResourceHeader?: boolean` prop (default `true`)**
  - `DaysComponent` receives a new optional `showResourceHeader` prop. When `false`, the leading time-gutter `Col` renders an empty body instead of a `StaffAvatar`. The `Col`'s `width: TIME_LABEL_WIDTH` is preserved so the day-of-week labels stay horizontally aligned with their body columns.
  - `CalendarInner` destructures the new prop and threads it into the `DaysComponent` invocation. Default is `true` so portrait day/week views (`ResourceCalendarDayView`, `ResourceCalendarWorkweekView`) render unchanged.
  - Why: the in-grid avatar in landscape multi-tech mode is portrait-era chrome that doesn't carry meaning here. It always pins to `activeResourceId ?? resourceIds[0]`, which is misleading whenever the user has 0 or 2+ techs selected (the avatar shows "tech #1" while the cards may belong to other techs entirely). Landscape already has its own dedicated AvatarStrip, so the in-grid one is pure visual noise. Reported by user after the calendar reached the OTA where multi-tech selection was working end-to-end.
  - Note on master plan §3.5: the original landscape-calendar plan listed `hideResourceHeader` as one of the two prescribed vendored patches. This Phase 12 prop is the realization of that contract — the name was changed to `showResourceHeader` (positive default) so backward compat doesn't require code changes at every existing call site.

  **Fix B — multi-day now-line spans the full visible week**
  - `dist/index.js` only (the now-line `TimeLabels` codepath isn't reached by the `.mjs` consumer chain, so the `.mjs` is intentionally NOT mirrored — same policy as Phases 3/5/9/10).
  - Old: `totalTimelineWidth: BODY_BLOCK_WIDTH * Math.max(1, Math.min(numberOfColumns, bodyResourceIds.length))`. This computed the now-line's width from `bodyResourceIds.length` (the count of selected techs). In single-day mode that's correct — each tech is its own body column and the bar should span however many columns the user has visible. In multi-day mode, body columns are days (not techs) and `multiDayCount` controls their count, so the bar shrank as the user deselected techs even though the underlying day-columns stayed the same width.
  - New: `isMultiDay ? BODY_BLOCK_WIDTH * Math.max(1, visibleDayCount) : BODY_BLOCK_WIDTH * Math.max(1, Math.min(numberOfColumns, bodyResourceIds.length))`. Multi-day mode uses `visibleDayCount` (which is `multiDayCount ?? (mode === "week" ? 7 : 3)`); single-day mode is unchanged.
  - Why: the user explicitly asked "I want the red time line to go across the entire calendar all the time," meaning the now-line should always span the full visible week regardless of how many tech columns are filtered in. The old behavior was a side effect of the bodyResourceIds-driven layout math and was never intentional for multi-day mode.
  - Both `isMultiDay` and `visibleDayCount` were already in scope at the patch site (declared at the top of `CalendarInner`), so the fix is a one-line conditional.

### Phase 13 — `multiTechMode` prop + multi-tech `renderItem` rework (Ship 2 evaluation prototype, follow-up to P2-FE-4)
- `dist/index.js`, `dist/index.d.ts`, `dist/index.d.mts`. **Not mirrored to `dist/index.mjs`** — same policy as Phases 3/5/9/10/12-Fix-B; the renderer rework depends on Phase 10's `viewportWidth` which is also `.js`-only.
- New optional `multiTechMode?: "stacked" | "mini-columns" | "stacked-bands"` prop on `CalendarProps`. Has no effect when:
  - `mode === "day"` (single-day mode is already one-resource-per-column),
  - `bodyResourceIds.length < 2` (no multi-tech overlap to resolve),
  - or the prop is `undefined` (legacy single-resource path runs unchanged — safe default for any consumer not yet ready to migrate).
- When all three conditions are met, `CalendarInner.renderItem` branches on the chosen treatment:
  - **`"stacked"`**: every selected tech's `<EventBlocks>` renders full-width (`BODY_BLOCK_WIDTH`) inside the same shared day-column wrapper. Cards layer via z-order. Per-tech color identification is the consumer's responsibility (REMI does this through `eventStyleOverrides` keyed on `colorForTech(event.resourceId)`).
  - **`"mini-columns"`**: each tech gets a sub-lane `BODY_BLOCK_WIDTH / N` wide, absolutely-positioned at `left: i * laneWidth`. The day-column wrapper height stays at `totalDayHeight`. Each lane wraps its own `<EventBlocks>` so the library's existing intra-lane stacking still works.
  - **`"stacked-bands"`**: each tech gets a full-width-full-day-height band stacked vertically inside the day-column. The wrapper height becomes `totalDayHeight * N`. Each band paints its own `<EventGridBlocksSkia>` so hour grid lines are visible inside every band; `<DisabledIntervals>` and `<DisabledBlocks>` only render in band 0 to avoid duplicating disabled-state masking. The shared time gutter (`TimeLabels`) does NOT scale — only band 0 has labeled hours, bands 1+ run against an unlabeled internal grid. Documented as a known visual tradeoff.
- The FlashList row wrapper height (`<View style={{ height: totalDayHeight }}>`) is now conditional: in multi-day stacked-bands mode with 2+ techs it grows to `totalDayHeight * bodyResourceIds.length` so the parent vertical ScrollView allocates room for the bands.
- `extraData` on the `AnimatedFlashList` got two new contributors so cached cells are dropped when the treatment or selection count changes: `(multiTechMode === "stacked" ? 1 : "mini-columns" ? 2 : "stacked-bands" ? 3 : 0) + bodyResourceIds.length * 17`. The `* 17` factor is just a coprime-ish multiplier so combining it with the integer treatment encoding can't accidentally collide with the existing `numberOfColumns + width + hourHeight + (overLappingLayoutMode ? 1 : 0)` sum across realistic tech counts.
- `renderItem`'s `useCallback` dep array gained `bodyResourceIds` and `multiTechMode` so a treatment-switch invalidates the closure (otherwise FlashList re-uses the cached function and never sees the new branch).
- **KNOWN LIMITATION (intentional for the evaluation prototype)**: drag-end / `landedResourceId` math is NOT updated. All drags in any of the new treatments still resolve to `bodyResourceIds[0]` (or the legacy `activeResourceId ?? resourceIds[0]` fallback). REMITechnician's product surface for cross-tech reassignment is the landscape drag-to-avatar gesture (see `docs/implementation-plans/landscape-calendar.md` §2.4), which lands in its own chunk after the user picks a treatment. Until then, treat landscape multi-tech drag-end as inert. Same applies to `<DisabledIntervals>` / `<DisabledBlocks>` (which still pin to a single resource — non-issue for stacked / mini-columns since disabled state is universal across techs in REMI's data model, and band-0-only is the documented behavior for stacked-bands).
- Why three treatments behind a runtime cycle chip instead of picking one: per `docs/implementation-plans/landscape-overlay-rendering.md` §10, the user explicitly chose "defer the decision and ship all three so I can evaluate them on-device." The cycle chip lives in the consumer (`LandscapeWorkweekView`) and is wired to `useCalendarStore.cycleLandscapeMultiTechMode`, persisted across launches.
- Why a positive default of `"stacked"` in the store: it's the cheapest layout (no extra wrappers, no height scaling) and keeps the column visually closest to the legacy single-resource path the user is migrating from. Any of the three are valid choices once the user evaluates them.

### Phase 14 — `multiTechMode` narrowed to `"stacked" | "mini-columns"` (Ship 3, P2-FE-4 follow-up #10)
**PLAN-DEVIATION:** `2026-04-20-cut-stacked-bands` — see `docs/PLAN-DEVIATIONS.md` for the cross-cutting record (consumer-side store + UI also affected).
**PLAN-DEVIATION:** `2026-04-20-cycle-chip-to-edgetab` — the consumer-side cycle-chip → EdgeTab swap that landed alongside this phase. Same index entry has the user-feedback context.

- `dist/index.js`, `dist/index.d.ts`, `dist/index.d.mts`. Same `.mjs` policy as Phase 13 — the renderer rework is `.js`-only because it depends on Phase 10's `viewportWidth`.
- **Cut the `"stacked-bands"` treatment.** After the Ship 2 cycle-chip evaluation on real franchise data, the user kept `"stacked"` and `"mini-columns"` and dropped bands. Bands had two structural problems that became apparent on-device: (1) the day-column tripled in height for 3-tech selections, forcing the user to scroll vertically just to see all selected techs at the same time-slot; and (2) the shared time gutter only labels the first band, so bands 2+ were a visual orphan against an unlabeled internal grid. Neither was fixable without major reflow work that would have made bands more expensive than the other two treatments combined.
- Concrete code changes in `dist/index.js`:
  - The `treatment === "stacked-bands"` branch and its `<View key=\`${index}-${hourHeight}-${displayHours}-bands-${bandCount}\`>` wrapper deleted from `renderItem`.
  - `useMultiTech` predicate simplified to `(multiTechMode === "stacked" || multiTechMode === "mini-columns")`.
  - FlashList wrapper height reverted to the unconditional `{ height: totalDayHeight }` — no more `bodyResourceIds.length` multiplier.
  - `extraData` integer encoding for `multiTechMode` reduced to `(stacked ? 1 : "mini-columns" ? 2 : 0)`. The `bodyResourceIds.length * 17` term is preserved so selection changes still invalidate cached cells.
- `dist/index.d.ts` + `dist/index.d.mts`: `multiTechMode` union narrowed; JSDoc updated to record the cut as history (don't re-add without going through the same evaluation cycle). `.mts` mirror is the abbreviated version per the long-standing `.mjs/.mts` policy below.
- **Consumer-side**: `LandscapeWorkweekView` now uses an `EdgeTab` (the new universal collapsible-drawer primitive at `src/components/shared/edge-tab.tsx`) anchored to the bottom-side corner of the calendar adjacent to the `AvatarStrip`, replacing the top-left cycle chip from Ship 2. The handle peeks from the calendar's preferred-hand edge; opening it slides in a 2-segment control (Overlap / Mini-cols) with the active mode highlighted. Bottom corner was chosen over top so the picker can't compete with the iOS home-indicator swipe-up zone (we still pad above `insets.bottom + 8`) and because the bottom edge of the calendar grid is rarely a drag-end target, minimizing risk of fighting drag/scroll handlers.
- **Store migration**: `useCalendarStore` adds a `merge` to its `persist` config that falls back to the default `"stacked"` if a rehydrated `landscapeMultiTechMode` is `"stacked-bands"` (left over from a Ship 2 install) or any other now-invalid string. No version bump needed — the merge runs idempotently on every hydrate.
- **KNOWN LIMITATION (carried over)**: drag-end / `landedResourceId` math still pins to `bodyResourceIds[0]` for both modes. Cross-tech reassignment is the landscape drag-to-avatar gesture (`landscape-calendar.md` §2.4) and lands in its own chunk. **(Resolved in Phase 15 below for drag-end; the drag-to-avatar gesture is still pending as the cross-tech alternative for stacked-mode users.)**

### Phase 15 — `finalizeDrag` cross-tech resolution in multi-day mode (P2-FE-4 follow-up #11)
**PLAN-DEVIATION:** `2026-04-20-cross-tech-drag-end` — see `docs/PLAN-DEVIATIONS.md` for the cross-cutting record (the implementation plan explicitly said this would stay inert; we resolved it).

- `dist/index.js` only. Same `.mjs` policy as Phases 3/5/9/10/12-Fix-B/13/14 — the multi-day rendering rework is already `.js`-only and `.mjs` would silently divergence.
- Closes the "drag-end pinned to first tech" carried-over limitation from Phases 13/14 by teaching `finalizeDrag` how to interpret the drop position when a multi-tech treatment is active.
- `finalizeDrag` signature gained an optional fifth parameter `xWithinColumn`. The two `pan.onEnd` call sites that finalize a real move (the `selectedEvent && !isDragging.value` long-press-without-drag path, and the `isDragging.value` true drag-end path) compute `absoluteX - TIME_LABEL_WIDTH - colIndex * BODY_BLOCK_WIDTH` BEFORE the snap-to-column animation overwrites `panXAbs`, and pass it through. The `pinch:resize:end` call site does NOT pass it (resize never reassigns techs), so it falls through to the original-tech keep path inside `finalizeDrag`.
- Resolution rules inside `finalizeDrag`:
  - **Single-day mode (unchanged)**: `landedResourceId = bodyResourceIds[colIndex]`. Each FlashList row already IS a tech, so `colIndex` encodes the destination tech directly.
  - **Multi-day "mini-columns" with 2+ techs (NEW)**: compute `laneWidth = BODY_BLOCK_WIDTH / techCount` and `laneIndex = floor(xWithinColumn / laneWidth)` (clamped to `[0, techCount - 1]`); attribute to `bodyResourceIds[laneIndex]`. This is the only treatment with a real spatial signal between techs — the user's drop coordinate within the day-column unambiguously names a target tech.
  - **Multi-day "stacked" with 2+ techs (NEW)**: keep the dragged event's original tech (`selectedEvent.resourceId`), falling back through `activeResourceId` and `resourceIds[0]`. Stacked overlay has no spatial signal between techs (cards layer in the same physical region), so reassigning would be guessing. Cross-tech reassignment in stacked mode is the landscape drag-to-avatar gesture's job (`landscape-calendar.md` §2.4) when that chunk lands.
  - **Multi-day single-tech / no `multiTechMode` / resize**: same as stacked — keep original tech.
- Why `selectedEvent.resourceId` over `activeResourceId` as the primary fallback: `activeResourceId` is library-internal state that's only set during an active drag (cleared on selection-change effects), so it can be `null` during the brief window where `selectedEvent` is set but `activeResourceId` has been cleared by an upstream effect. `selectedEvent.resourceId` is the consumer-supplied event's owning tech and is always populated for moves of existing events; new-draft creation in multi-day mode is unaffected because new drafts go through the long-press-on-empty path and `selectedEvent.resourceId` is set to `bodyResourceIds[0]` at draft time (so a no-reassign pass through this branch keeps the same default — same effective behavior as before).
- `multiTechMode` and `BODY_BLOCK_WIDTH` were added to `finalizeDrag`'s `useCallback` dep array. Without them a treatment-switch (Stacked → Mini-cols) inside the `EdgeTab` picker would leave the cached callback computing landing math with the previous treatment's resolution rule — the `EdgeTab` triggers a re-render, but `finalizeDrag` is only re-created when its deps actually change.
- The `[CAL:gesture] finalizeDrag` console log gained `xWithinColumn` and `multiTechMode` so on-device diagnostics can confirm lane resolution at a glance.
- The Phase 13/14 `KNOWN LIMITATION` comment in `renderItem` was rewritten to point at this Phase 15 fix; the long-press-creates-draft path's lane-aware draft attribution remains an open item (drafts can still be reassigned via the existing reschedule sheet after creation, so it's a quality-of-life improvement rather than a correctness bug).
- **Master plan deviation (`landscape-overlay-rendering.md` §10)**: that section explicitly stated "Cross-tech drag-end intentionally stays inert in both treatments — owned by the landscape drag-to-avatar gesture chunk." This Phase 15 reverses that scoping decision for `mini-columns` (where spatial drag IS a meaningful signal) while honoring the original scope for `stacked` (still defers to the drag-to-avatar gesture). The plan was updated to record the change.

### Phase 16 — empty-grid leak fix (P2-FE-4 follow-up #15) + mini-cols-drop-shadow scaffolding (P2-FE-4 follow-up #12)
**PLAN-DEVIATION:** `2026-04-20-landscape-empty-grid-leak`, `2026-04-20-revert-empty-array-semantics`, `2026-04-20-mini-cols-drop-shadow` — all three live in `docs/PLAN-DEVIATIONS.md`.

- `dist/index.js` only for runtime; `dist/index.d.ts` + `dist/index.d.mts` updated for the new `getResourceColor` prop and the `resolveLaneDropPosition` export. Same `.mjs` policy as Phases 3/5/9/10/12-Fix-B/13/14/15.

**16.A — Multi-day empty-techs short-circuit (the surviving leak fix in this library).**
- **`suppressEvents` short-circuit** in `renderItem`: in multi-day mode with `techsToRender.length === 0`, the entire `eventLayer` is set to `null`, bypassing the legacy single-resource fallback (`renderEventBlocksFor(rid, ...)` where `rid = techsToRender[0] ?? activeResourceId ?? resourceIds[0]`). Without this short-circuit the legacy path would paint events for `resourceIds[0]` in every day cell even though `techsToRender` was empty, because `rid` falls through to `resourceIds[0]`. Long-press for new-draft creation still fires against `rid` (the legacy fallback is preserved for that), so 0-tech mode keeps its draft-creation surface.
- **BUG-A diagnostic logs (`[BUG-A:StoreCreate]`, `[BUG-A:Read]`, `[BUG-A:Write]`, `[BUG-A:Feeder]`, `[BUG-A:CalendarRender]`, `[BUG-A:ProviderRender]`, `[BUG-A:ProviderMount]`, `[BUG-A:ProviderUnmount]`)** were added to disambiguate the three causes of the leak (provider reuse, inactive `weekQuery`, library empty-array fallback). They are intentionally still present as of this commit — they will be stripped in a follow-up once the EAS update verifies the fix on-device.

### Phase 19/20/21 diagnostic-log strip (P2-FE-6 wrap-up, 2026-04-22)
- **What was stripped:** all `[P19-DIAG]` (vendor finger-SV mount + per-frame writes) and `[P20-DWELL]` / `[P20-DIAG]` (dwell pattern + Bug #2 guard) logs from `dist/index.js`, `src/components/calendar/landscape/use-drag-to-avatar.ts`, `src/components/calendar/landscape/avatar-strip.tsx`, and `src/components/calendar/landscape/LandscapeWorkweekView.tsx`. The associated `__p19DiagFrameCounter` / `__p19DiagWriteLog` shared values + JS-side log target refs were removed alongside their callers.
- **What was kept:** `[BUG-A:*]` logs (separate chunk's tracking — see entry above; they live or die with their own EAS verification cycle), `[CAL:*]` and `[RC DRAG ...]` standard operational logs (these are the persistent diagnostic surface for the calendar's drag pipeline, not P2-FE-6-specific debugging).
- **Why:** smoke test confirmed all P2-FE-6 user flows on device (hover-dwell → preview-narrow → commit, drop = silent commit + undo toast, swipe-up / swipe-side toast dismissal, Bug #2 guard). The diagnostic logs served their purpose; keeping them would clutter the production console at every drag.
- **Markers:** none — the strip is a pure subtraction. Phase 19 / 20 / 21 fork markers in code (the FORK comments above the actual functional changes) are unchanged.

**16.B — Empty-array semantics distinction REVERTED (`2026-04-20-revert-empty-array-semantics`).**
An earlier draft of this phase tried to distinguish `selectedResourceIds === []` ("consumer wants none rendered") from `selectedResourceIds === undefined` ("no filter, render all"). That broke `ResourceCalendarDayView`'s default mount (autoSelect race produced an empty grid for the brief window before the first tech was auto-selected). The library is back to historical semantics: both `undefined` and `[]` mean "no filter, render all." See the PLAN-DEVIATION entry for the full reasoning. The `bodyResourceIds` memo and `techsToRender` derivation each carry a `// PLAN-DEVIATION: 2026-04-20-revert-empty-array-semantics` marker explaining this and the consumer-side empty-array pattern (`Resource.events: []`) that landscape uses instead.

**16.C — Mini-columns drop-shadow scaffolding (`2026-04-20-mini-cols-drop-shadow`, P2-FE-4 follow-up #12).**
This sub-phase landed the **type surface and pure helpers** for §11 of `docs/implementation-plans/landscape-overlay-rendering.md`. The runtime mount + consumer wire-up are deferred to a follow-up chunk. What's present today:
- `resolveLaneDropPosition({...}) → {colIndex, laneIndex, translateX, translateY, width, height} | null` — pure, worklet-marked, allocation-free. Mirrors the spatial branch of `resolveLandedResourceId` but returns positional data for the live preview shadow.
- `MiniColumnLanes({laneWidth, techCount, totalDayHeight, isDragging})` — Animated.View wrapping `N - 1` 1px vertical bars at lane boundaries, opacity fades 0 ↔ 0.6 with `withTiming(120)` based on `isDragging`.
- `DropShadow({...})` — Animated.View whose `useAnimatedStyle` worklet calls `resolveLaneDropPosition` every frame and tints the rectangle from a pre-computed `techColors[laneIndex]` array.
- `DraggableEvent` accepts an optional `laneWidth?: number` and uses `effectiveWidth = laneWidth ?? APPOINTMENT_BLOCK_WIDTH` for both width and the `translateX` centering offset.
- New `getResourceColor?: (resourceId: number) => string` prop on `CalendarProps`. Documented in `dist/index.d.ts`.
- `resolveLaneDropPosition` exported from both `dist/index.d.ts` and `dist/index.d.mts`.

**Not yet wired (deferred):** `MiniColumnLanes` and `DropShadow` are not mounted in `CalendarInner`; `DraggableEvent.laneWidth` has no caller; `LandscapeWorkweekView` does not yet pass `getResourceColor={colorForTech}`; `src/components/calendar/__tests__/resolve-lane-drop-position.test.ts` does not exist. See the PLAN-DEVIATION entry for the full not-wired list and the rationale for committing scaffolding without runtime activation.

**16.D — Renderer-lag fix (rendererRef indirection removed).**
The previous `CalendarInner` cached `effectiveRenderer` into a `useRef` and re-pointed it via `useEffect`, then exposed a `stableRenderer` callback that read through the ref. Style changes made by `eventStyleOverrides` (e.g., the multi-tech solid-color rule) applied **one render late** because the ref update happened in the post-commit effect, not in the render pass. Phase 16 removes the ref + effect + stable wrapper and passes the current `effectiveRenderer` directly. Same-frame application; closes a class of "right for the wrong reason after one extra toggle" bugs in the multi-tech rendering modes.

**Consumer-side compatibility note (16.B):** `ResourceCalendarDayView` continues to pass `selectedResourceIds={selectedTechIds}` directly. With the revert above, the historical "no filter when `[]`" behavior is preserved — autoSelect is the right place to keep the day grid populated, not the library API.

### Phase 17 — `onEventDoubleTap` prop + drag-init moved off long-press (P2-FE-5 chunk 2b)
**PLAN-DEVIATION:** `2026-04-22-double-tap-drag` — see `docs/PLAN-DEVIATIONS.md` for the cross-cutting record (the master plan's §5.1.6 gesture matrix lists "long-press + pan an event" as the move/reschedule gesture; this phase reverses that scoping).

- `dist/index.js` only for runtime; `dist/index.d.ts` + `dist/index.d.mts` updated for the new `onEventDoubleTap` prop on `CalendarProps`. Same `.mjs` policy as Phases 3/5/9/10/12-Fix-B/13/14/15/16 — the `.mjs` runtime is intentionally not mirrored.
- **Why:** with the tap-to-create-draft flow (`2026-04-21-tap-to-create-draft`), the synthetic dashed draft block lives on the calendar grid and there was no on-canvas dismiss affordance. Chunk 1.2 added the chooser's "Cancel" row, which solved the discovery problem but not the gesture economy — long-press was still owned by the library for drag init, leaving no room for "long-press the draft to dismiss it" or "long-press a real event for quick actions" without conflict. Phase 17 moves drag init off long-press onto a new double-tap gesture, freeing long-press for consumer routing.
- **`EventBlock`** (the per-event card): added an `onDoubleTap` prop and a JS-side double-tap detector (280 ms window, `setTimeout`-based). When `onDoubleTap` is supplied, `onPress` is delayed by `DOUBLE_TAP_WINDOW_MS` so a second tap inside the window can pre-empt it; second tap fires `onDoubleTap` instead and cancels the pending `onPress`. When `onDoubleTap` is `undefined`, `onPress` fires immediately (no latency penalty for legacy consumers). Cleanup-on-unmount clears any pending timer to avoid late firings after the row scrolls out of view. The 280 ms window is the standard tradeoff for double-tap detection — same UX cost as iOS's native double-tap recognizers; we picked 280 to feel slightly snappier than the 300 we noted in the prior "Notes for future agents" entry about avatar gestures.
- **`EventBlocks`** (the per-column event group): pass-through for `onDoubleTap`. The wrapper expression `onDoubleTap ? (evt2) => onDoubleTap(evt2) : void 0` keeps EventBlock's "no penalty when undefined" branch reachable for consumers that don't wire double-tap.
- **`CalendarInner`**:
  - New props destructured: `onEventDoubleTap`. New refs: `onDoubleTapRef`, `internalOnDoubleTap`. New `useEffect` mirrors the existing `onLongPressRef` pattern.
  - The `internalOnLongPress.current` body that used to do drag init was **split**: the drag init code (panYAbs / panXAbs / startedY / eventStartedTop / lastHapticScrollY / eventHeight / `setSelectedEvent` / `setDragReady` / haptic) moved verbatim to a new `internalOnDoubleTap.current`. `internalOnLongPress.current` now only forwards to `onLongPressRef.current?.(event)` — long-press is a free gesture for the consumer.
  - New stable callback `internalStableOnDoubleTap` mirrors `internalStableOnLongPress`, added to the `renderItem` `useCallback` dep array.
  - `renderEventBlocksFor` passes `onDoubleTap: internalStableOnDoubleTap` down to `EventBlocks`.
  - `handleBlockLongPress` (the legacy long-press-on-empty-cell → draft-drag bridge): rerouted to call `internalOnDoubleTap.current(draftEvent)` instead of `internalOnLongPress.current(draftEvent)`. This codepath is dead in the REMI app (we use `onBlockTap` everywhere — see `2026-04-21-tap-to-create-draft`), but keeping the bridge wired through the new init preserves drag-on-create for any legacy consumer that still uses `onBlockLongPress`.
- **What this means for consumers:**
  - **Single tap on event:** opens detail (existing behavior). With `onEventDoubleTap` wired, single-tap is delayed 280 ms; without it, immediate.
  - **Double tap on event:** starts drag (was: long-press did this).
  - **Long-press on event:** fires `onEventLongPress(event)` and does NOT start drag (was: did both). The REMI app uses this for the chunk-2b long-press router (`isDraftSyntheticEventId(event.id) ? dismissDraft() : openQuickActionMenu()`).
- **`src/` mirror:** intentionally NOT updated. Per the rules this is reference-only and `dist/` is what runs; the divergence is documented here and in the deviation entry. Future cleanup chunks can sync `src/` if/when the fork is rebuilt via tsup.
- **Test coverage:** the gesture-recognition behavior (timing-based JS double-tap, native long-press) requires real touch events to verify; on-device EAS smoke is the test path. The consumer-side router (`handleRCEventLongPress` in `app/(tabs)/index.tsx`) is a 4-line if/else over `isDraftSyntheticEventId` (already covered by `FloatingDraftCard.test.tsx`) calling `dismissDraft` (already covered by the chooser-pick + Cancel-row tests). No new unit tests added; the gap is acceptable and noted in the deviation entry.

### Phase 17.1 — second-tap detection moved to `onPressIn` (touch-down) for fluid drag (P2-FE-5 chunk 2b.1)
**PLAN-DEVIATION:** `2026-04-22-double-tap-drag` — see the "Update 2026-04-22 — Phase 17.1 follow-up" callout in `docs/PLAN-DEVIATIONS.md`.

- `dist/index.js` only — `EventBlock` modified. No `.d.ts` / `.d.mts` changes (no public API surface change). Same `.mjs` policy as Phase 17.
- **Why:** Phase 17 shipped with the second-tap detector wired to `onPress` (touch-up). User reported "haptic isn't immediate, can't move it immediately" — diagnosed as: (1) `onPress` only fires on the second tap-up, so `setSelectedEvent + setDragReady + haptic` runs ~150–250 ms after the second tap began, and (2) by the time drag init runs the user has lifted, so they have to put their finger back down to start panning (TouchableOpacity owned the second touch and never released it back to the calendar's parent panGesture). Result: drag felt staged and laggy instead of fluid.
- **The fix:** moved second-tap detection from `onPress` (touch-up) to `onPressIn` (touch-down). When the second touchdown arrives within `DOUBLE_TAP_WINDOW_MS` of the previous tap, `onDoubleTap` (and thus `internalOnDoubleTap.current` → setSelectedEvent + setDragReady + haptic) fires synchronously with the touchdown. The user's finger is still on the event when DraggableEvent mounts, so when they begin moving:
  1. iOS's native UIPanGestureRecognizer (the calendar's `panGesture`, `manualActivation(false)` on iOS) recognizes the pan and activates.
  2. By default, RNGH's pan cancels the parent TouchableOpacity press (movement past `pressRetentionOffset` ~30dp triggers `onPressOut` without `onPress`).
  3. `panGesture.onUpdate` sees the finger inside the `panYAbs`/`panXAbs` bounds (the event's onscreen center, just set by drag init) and immediately enters the drag branch.
- The result: tap-tap-and-drag is one continuous touch with no lift required between activation and pan. Haptic is instant on the second touchdown.
- **`handlePress` short-circuit:** `doubleTapHandledRef` is set to `true` in `handlePressIn` when the second-tap is detected, and cleared in `handlePressOut`. Because RN fires `onPress` *before* `onPressOut`, the touch-up `handlePress` runs while the ref is still `true` → returns early so `onDoubleTap` doesn't double-fire. If movement cancels the press (the drag case), `onPress` doesn't fire at all but `onPressOut` still does, so the ref cleanup is reliable in both branches.
- **What did NOT change:**
  - `DOUBLE_TAP_WINDOW_MS` is still 280 ms. The window matters for *single-tap latency* (which is unchanged — single-tap still waits 280 ms to disambiguate from a possible double-tap).
  - `internalOnDoubleTap.current` body — the drag init sequence (panYAbs / panXAbs / startedY / eventStartedTop / lastHapticScrollY / eventHeight / setSelectedEvent / setDragReady / haptic) is unchanged.
  - `EventBlocks` and `CalendarInner` — no changes. The `onDoubleTap` prop semantics are unchanged from Phase 17 (still fires on the second-tap event); only the moment-in-touch-lifecycle when it fires changed.
  - The bridge for `handleBlockLongPress` → `internalOnDoubleTap.current(draftEvent)` is unchanged.
- **Test coverage:** still on-device EAS smoke. Same rationale as Phase 17 — gesture-recognition behavior on real hardware can't be unit-tested meaningfully. `FloatingDraftCard.test.tsx` (14 tests) still passes with no changes.
- **Markers:** `// FORK Phase 17.1 (P2-FE-5 chunk 2b.1)` — only on the new `handlePressIn` / `handlePressOut` and the `doubleTapHandledRef` short-circuit branch in `handlePress`. The Phase 17 marker stays on the existing `lastTapAtRef` / `pendingSingleTapRef` / `useEffect`-cleanup block.
- **Fallback if this doesn't fully resolve the UX:** the next escalation is a full RNGH rewrite of `EventBlock` — replace `TouchableOpacity` with a `GestureDetector` containing `Gesture.Race(Sequence(DoubleTap, Pan), LongPress, Exclusive(DoubleTap, SingleTap))` and use `simultaneousWithExternalGesture` to coordinate with the calendar's parent `panGesture`. That's roughly 80–120 lines and adds new failure modes (gesture coordination edge cases), so we tried the surgical fix first. The decision tree for escalating is documented in the `2026-04-22-double-tap-drag` deviation entry.

### Phase 17.2 — `pan:end:noDrag` no longer finalizes for real events (P2-FE-5 chunk 2b.2)
**PLAN-DEVIATION:** `2026-04-22-nodrag-realevent-cancel` — see the entry in `docs/PLAN-DEVIATIONS.md`.

- `dist/index.js` AND `dist/index.mjs` — `panGesture.onEnd` worklet modified. No `.d.ts` / `.d.mts` changes (no public API surface change).
- **Why:** Phase 17's double-tap-to-drag set `selectedEvent` for real events before the user moved. Phase 16's `pan:end:noDrag` branch — which finalizes a draft at the original press position when the user long-presses an empty cell and releases without sliding — did not differentiate draft vs real event, so a double-tap-and-release on an existing appointment was incorrectly routed through `finalizeDrag` → consumer's `onDragEnd` → reschedule sheet open with `newStart === oldStart`. User report: "I was struggling to bring up the reschedule page, and then sometimes I got a grey screen, and I accidentally created a new appointment". Logged as `[CAL:gesture] doubleTap → selecting event for drag → pan:end:noDrag:finalizePress → [RC DRAG] scheduling sheet open`.
- **The fix:** in the `noDrag + selectedEvent` branch, branch again on `selectedEvent.id`:
  - `id == null || id < 0 || meta.isDraft` → draft event, keep original Phase 16 finalize-at-press-position behaviour (long-press-create flow).
  - otherwise (real event with positive id) → schedule `setSelectedEvent(null) + setDragReady(false)` cleanup and bail. Do NOT call `finalizeDrag`. Logs as `pan:end:noDrag:realEvent:cancel`.
- **What did NOT change:**
  - The `isDragging.value === true` branch (path 1) is unchanged — actual drags still route through `finalizeDrag` with the moved position.
  - The "no `selectedEvent` at all" branch (`pan:end:noDrag`) is unchanged.
  - The `internalOnDoubleTap.current` body (drag init) is unchanged.
  - The single-Tap gesture chain that opens the detail sheet on first tap is unchanged.
  - The `handleBlockLongPress` → draft-create bridge is unchanged (drafts still finalize on release because they hit the `isDraftEvent` branch).
- **Worklet correctness note:** `selectedEvent` is captured into the worklet closure via the `Gesture.Pan()` chain set up in the component body (so it refreshes each render with the current selection). Reading `.id` and `.meta?.isDraft` on a captured JS object inside a worklet works the same way as the existing `if (selectedEvent)` truthiness check on the same line — both are property accesses on the snapshotted reference, no JSI marshalling needed.
- **`.mjs` mirrored** because the diff is ~12 lines and Phase 17.2 is a critical bug fix that any non-RN consumer of this fork would also hit. Both files now have matching `// FORK Phase 17.2 (P2-FE-5 chunk 2b.2 — bug fix)` blocks in the `panGesture.onEnd` worklet.
- **Test coverage:** still on-device EAS smoke. The `[CAL:gesture] pan:end:noDrag:realEvent:cancel <id>` log is the canary — it should fire on every double-tap-and-release on a real event, and the reschedule sheet should NOT open.
- **Markers:** `// FORK Phase 17.2 (P2-FE-5 chunk 2b.2 — bug fix)` — single block in the `panGesture.onEnd` worklet in both `.js` and `.mjs`.

### Phase 22 — `EventBlock` `doubleTapHandledRef` reset moved from `onPressOut` to `onPress` (PR 2.1, 2026-04-24)

**PLAN-DEVIATION:** none — this is a bug fix to FORK Phase 17.1's double-tap detector. No deviation entry needed; the fix re-establishes Phase 17's stated intent ("`onPress` doesn't double-fire `onDoubleTap`") which Phase 17.1's premature reset broke.

- `dist/index.js` ONLY — `EventBlock`'s `handlePressIn` / `handlePressOut` / `handlePress`. No `.mjs` / `.d.ts` / `.d.mts` change (no API surface change; runtime serves `dist/index.js` per the `react-native` field in `package.json`).
- **Why:** user reported "Double tap to move is now triggering single tap to bring up appointment review sheet" — the double-tap-to-drag gesture incorrectly *also* fired the single-tap `onPress` (which opens the appointment detail sheet). The original Phase 17.1 comment said "`doubleTapHandledRef` is reset in `onPressOut`… so `onPress` doesn't double-fire `onDoubleTap`", relying on the assumption that React Native's press lifecycle is `onPressIn → onPress → onPressOut`. The actual order is `onPressIn → onPressOut → onPress` (see RN's `Pressability.js`: *"`onPress` is the user-facing callback that is fired after the touch has finished and onPressOut has been called."*). With the wrong assumption, the second-tap sequence ran:
  1. `pressIn` (2nd tap) → handler set `doubleTapHandledRef=true`, fired `onDoubleTap` (drag init).
  2. `pressOut` (2nd tap) → handler reset `doubleTapHandledRef=false`. ← bug
  3. `press` (2nd tap) → handler saw `false`, fell through, scheduled a single-tap `onPress` 280ms later → detail sheet opened on top of the drag.
- **The fix:**
  - Move the `doubleTapHandledRef = false` reset from `handlePressOut` (premature) to `handlePress` (correct — the ref's "we just handled a double-tap" purpose is fulfilled when `handlePress` short-circuits via the early return).
  - Add a safety reset at the top of `handlePressIn`: if the new touch is OUTSIDE the double-tap window (`elapsed >= DOUBLE_TAP_WINDOW_MS`), clear the ref. Without this, a press cycle that fires `onPressOut` but never `onPress` (e.g., the user moves their finger past `pressRetentionOffset` after the second tap) would leave the ref stuck `true` and incorrectly suppress the next single tap.
  - `handlePressOut` is now a no-op kept for symmetry / future use.
- **Manual verification:** with Phase 18 fix, double-tap on a real appointment must NOT open the detail sheet (drag begins instead). Single-tap on a real appointment must still open the detail sheet after the 280ms double-tap window. Long-press still opens `EventQuickActionToast`. Tap-to-create draft (single tap on empty cell) still works on the calendar's block-tap handler (separate path, not `EventBlock`).

### Phase 18 — drag-centroid shared values exposed via `useDragSharedValues()` (P2-FE-6 chunk a)
- `dist/index.js`, `dist/index.d.ts`, `dist/index.d.mts`. The `.d.mts` mirror is kept in sync (cheap, no runtime cost); `dist/index.mjs` is intentionally NOT mirrored — same long-standing `.mjs` policy as Phases 3/5/9/10/12-Fix-B/13/14/15/16/17 (no current consumer chain reads `.mjs`).
- **Why:** Master plan §5.1.7 specifies that the landscape drag-to-avatar handler "subscribes to those shared values [`setDraggedEventDraft`, `panXAbs`, `panYAbs`] and computes 'is the dragged centroid inside any avatar bounding box?' each frame. When yes, the avatar tile gets a highlight ring." `panXAbs` / `panYAbs` / `isDragging` were already declared inside `CalendarInner` (and written by the existing pan + double-tap drag-init worklets) but were never exported, so a sibling `<DragToAvatarTarget>` overlay had no way to read them. Without per-frame highlighting the user can't see which avatar the dropped card will hit, which kills the gesture's discoverability.
- **What changed in `CalendarInner`:** the three local `useSharedValue` declarations for `panXAbs` / `panYAbs` / `isDragging` (formerly at the top of the SV declaration block) were removed and replaced with a single `const { panXAbs, panYAbs, isDragging } = useDragSharedValues();` destructure. Every existing `panXAbs.value` / `panYAbs.value` / `isDragging.value` read/write site (~60 references across pan onUpdate, pan onEnd, pinch onUpdate/onEnd, double-tap drag init, finalizeDrag callsites, DraggableEvent prop pass-through, DropShadow prop pass-through, etc.) continues to work identically — the SV references are still SVs, just sourced from context instead of local hook state.
- **What changed in `CalendarBindingProvider`:** wrapped the existing `<StoreProvider>` in a new `<DragSharedValuesCtx.Provider value={{ panXAbs, panYAbs, isDragging }}>`. The three SVs are created at provider scope via `useSharedValue` (hook-stable across renders, semantically `useRef` wrappers around Reanimated values) and memoized into a single wrapper object so consumers using the wrapper as a `useEffect` dep see stable identity.
- **New public API:** `useDragSharedValues(): { panXAbs, panYAbs, isDragging }` — throws if called outside `<CalendarBindingProvider>`, mirroring `useCalendarBinding()`'s contract. Designed for worklet consumption via `useAnimatedReaction` / `useAnimatedStyle`. **Never read `.value` on the JS thread inside a render path** — the SVs update at gesture frame rate and would thrash React.
- **Coordinate space (important — historical naming is misleading):** `panXAbs` / `panYAbs` carry the **dragged card's center in CALENDAR-VIEWPORT-LOCAL space**, NOT screen-absolute, and NOT the finger position. The `Abs` suffix means "absolute within the calendar's local viewport (after scroll subtraction)," not "absolute on screen." This was discovered while writing the consumer-side overlay — every writer site (`panXAbs.value = ...`) computes either `(TIME_LABEL_WIDTH + colIndex * BODY_BLOCK_WIDTH - scrollX + BODY_BLOCK_WIDTH/2)` (during snap) or a clamped `[BODY_BLOCK_WIDTH/2 + TIME_LABEL_WIDTH, width - BODY_BLOCK_WIDTH/2]` value (during free drag), which are only sensible in calendar-local coords. Confirmed against the existing `DropShadow` consumer, which derives within-column-X via `panXAbs - TIME_LABEL_WIDTH - colIndex * BODY_BLOCK_WIDTH` (only valid if `panXAbs` is calendar-local). Sibling overlays that need screen-absolute coords (e.g. drag-to-avatar in `LandscapeWorkweekView`, where the avatar strip is OUTSIDE the calendar component) MUST add the calendar wrapper's window-relative offset: `screenX = calendarLeftInWindow + panXAbs.value`. Get `calendarLeftInWindow` from a one-time `measureInWindow` on the calendar wrapper, re-run on orientation change. Avatar bboxes captured the same way live in the same screen-absolute space, so the hit-test then becomes a direct numeric compare. The misleading name is kept in the public API to match the existing `DropShadow`/`DraggableEvent` internal contract — renaming would be a breaking change for in-vendor consumers and is out of scope for this phase.
- **Lifetime:** SVs are created once per `<CalendarBindingProvider>` mount and survive every re-render of the provider or its children. They are NOT cleared on drag-end — `isDragging` flips back to `false` and `panXAbs` / `panYAbs` retain whatever the last frame wrote. Consumers must gate their reactions on `isDragging.value`.
- **Multiple-calendar consumers:** `app/(tabs)/index.tsx` mounts a separate `<CalendarBindingProvider>` per visible calendar (cal-day, cal-week, cal-landscape, etc.) — see L1078, L1101, L1124. Each provider gets its own SV instances, so each calendar's drag state is isolated. The drag-to-avatar overlay only mounts inside `<LandscapeWorkweekView>` (under the `cal-landscape` provider), so there's no cross-calendar leakage risk.
- **No API removed.** Pre-Phase-18 consumers that didn't know about these SVs continue to work unchanged. The `<Calendar>` component still requires `<CalendarBindingProvider>` (same as before — `useCalendarBinding()` was already mandatory), so the new `useDragSharedValues()` requirement adds no new mount constraint.
- **Test coverage:** the JS-side context plumbing is covered by the consumer-side `<DragToAvatarTarget>` jest tests in `src/components/calendar/landscape/__tests__/drag-to-avatar-target.test.tsx`. The worklet behavior (per-frame SV reads in `useAnimatedReaction`) requires real touch events to verify and is on-device EAS smoke per the long-standing pattern for gesture-driven SV reads.
- **Markers:** `// FORK Phase 18 (P2-FE-6 chunk a)` on (1) the new `DragSharedValuesCtx` + `useDragSharedValues` + provider wrapping in `dist/index.js`, (2) the `CalendarInner` SV-destructure replacement comment, (3) the `exports.useDragSharedValues` line, and (4) the JSDoc block on `useDragSharedValues` in `dist/index.d.ts` + `dist/index.d.mts`.

### Phase 19 — raw finger window-coords exposed via `fingerXAbs` / `fingerYAbs` (P2-FE-6 chunk b)
- `dist/index.js`, `dist/index.d.ts`, `dist/index.d.mts`. Same `.mjs` policy as Phase 18 — not mirrored.
- **Why (the bug Phase 18 didn't catch):** Phase 18 exposed `panXAbs` / `panYAbs` for the drag-to-avatar hit-test. On-device smoke (P2-FE-6 ship verification 2026-04-22) revealed the gesture failed end-to-end: the user's finger could be visibly over an avatar tile but no highlight ring would fire. Root cause: `panXAbs` is **hard-clamped** to `[BODY_BLOCK_WIDTH/2 + TIME_LABEL_WIDTH, layout.width - BODY_BLOCK_WIDTH/2]` inside the pan onUpdate worklet (~lines 2482-2492 of `dist/index.js`), so once the finger leaves the calendar grid horizontally, `panXAbs.value` stops at the grid edge. The avatar strip is rendered as a sibling outside the calendar's `layout.width`, so the hit-test against avatar window-bboxes always missed. Phase 18's coordinate-space cookbook was correct *for what `panXAbs` measures*, but `panXAbs` is the wrong value for "where is the finger right now?"
- **What changed in `CalendarBindingProvider`:** added two more SVs to the context: `fingerXAbs` and `fingerYAbs`, both initialised to `Number.NaN`. Memoized into the same wrapper object as the Phase 18 SVs so consumer identity stays stable.
- **What changed in the pan `onUpdate` worklet:** mirror `evt.absoluteX` / `evt.absoluteY` (RNGH window-coordinate finger position) into `fingerXAbs.value` / `fingerYAbs.value` every frame. Written *unconditionally* (even before `isDragging.value` flips true) so the consumer's `useAnimatedReaction` sees a fresh value the very first frame after drag-start. Guarded against missing `evt.absoluteX/Y` (defensive — RNGH always populates them on pan, but the existing guard pattern for `evt.x/y == null` is mirrored).
- **What changed in the pan `onEnd` worklet:** reset `fingerXAbs` / `fingerYAbs` to `Number.NaN` at the *top* of `onEnd`, before any branch. There are four exit paths in `onEnd` (no-drag-real-event-cancel, no-drag-draft-finalize, no-drag-no-event, drag-finalize) and each could leave a stale finger position behind otherwise. Top-of-block reset covers them all.
- **Why NaN, not 0 or -1:**
  - **NaN propagates through hit-test math** — `NaN >= bbox.x && NaN <= bbox.x + w` evaluates to `false` for every bbox, so a stale read after drag-end naturally fails the hit-test without a special-case branch.
  - **0 would mean "top-left of the screen"** — a perfectly valid finger position. A stale 0 would falsely highlight whatever avatar is in the top-left corner.
  - **-1 / sentinel** would require every consumer to remember the sentinel value. NaN is self-documenting via `Number.isFinite` checks.
- **Coordinate space:** `fingerXAbs` / `fingerYAbs` are SCREEN-WINDOW coordinates (origin = top-left of the device window, same space as `View.measureInWindow`). NOT calendar-local, NOT clamped to anything. The gesture has `.shouldCancelWhenOutside(false)` so RNGH continues to track `evt.absoluteX/Y` even when the finger leaves the calendar's bounds — exactly what we need for "is the finger over the avatar strip (which is outside the calendar) right now?"
- **Relationship to Phase 18 SVs:**
  - **Use `fingerXAbs` / `fingerYAbs`** for any "what UI tile is the finger over?" hit-test — avatar strip, map toggle, edge tabs, anything outside the calendar.
  - **Use `panXAbs` / `panYAbs`** for anything anchored to the calendar's column geometry — the dragged card's own visual position, snap-to-column math, drop-shadow positioning.
  - The two diverge precisely when the finger leaves the grid. Inside the grid (and during the snap-to-column animation), they describe positions in different coordinate systems (window vs viewport-local) but the same physical point.
- **What this fork does NOT do (deferred to a future phase):** the dragged card visual still stops at the grid edge (the existing clamp on `panXAbs` is unchanged). User can drop on an avatar with the finger past the grid and the highlight ring fires correctly, but the card itself doesn't follow the finger past the edge. Pattern is iOS-Springboard-like: target lights up, dragged thing stays in its valid region. If full-finger-following is required later, that's a separate, more invasive phase that has to rework the existing clamp into a "visual unclamped, snap-on-drop" pattern (touches every existing drag callsite's assumptions about card position bounds).
- **No API removed.** Pre-Phase-19 consumers that only used Phase 18's three SVs continue to work — `fingerXAbs`/`fingerYAbs` are additive properties on the same context object.
- **Test coverage:** the SV declarations + write/reset wiring are exercised on-device. The JS-side hit-test logic that consumes the new SVs is covered in `src/components/calendar/landscape/__tests__/use-drag-to-avatar.test.tsx` (the test mocks `useDragSharedValues` to return controlled SV objects and drives the per-frame reaction).
- **Markers:** `// FORK Phase 19 (P2-FE-6 chunk b)` on (1) the doc-block above `DragSharedValuesCtx` in `dist/index.js`, (2) the `fingerXAbs`/`fingerYAbs` instantiation + memoization, (3) the destructure inside `CalendarInner`, (4) the pan `onUpdate` write block, (5) the pan `onEnd` reset block (top of onEnd) and the now-deleted bottom reset, and (6) the JSDoc additions in `dist/index.d.ts` + `dist/index.d.mts`.

### Phase 20 — long-press → draft-create bridge removed (P2-FE-6 chunk c)
- `dist/index.js` only. `.d.ts` / `.d.mts` unchanged (no public API surface change). `.mjs` not mirrored (same long-standing policy).
- **Why:** Phase 16 wired `handleBlockLongPress` on an empty grid cell to silently call `internalOnDoubleTap.current(draftEvent)`, which armed a synthetic-draft drag. Phase 17 preserved that bridge after moving drag-init off long-press, with a comment claiming "this codepath is dead in the REMI app (we use `onBlockTap` everywhere)." On-device smoke during P2-FE-6 chunk b proved it was NOT dead — `[CAL:gesture] blockLongPress -> draft drag` fired every time the user long-pressed an empty cell, surprising them with a drag they hadn't asked for. User report: "why did you make the long press create a new appointment card when before it was only doing it by just tapping, it seems redundant." Tap-to-create was already the canonical flow via `onBlockTap`.
- **What changed in `handleBlockLongPress`:** the two-line bridge `if (internalOnDoubleTap.current) internalOnDoubleTap.current(draftEvent);` is removed. `draftEvent` is still constructed (kept as a local with `void draftEvent` to silence unused-var warnings) so a future consumer extension could surface it via `onBlockLongPress`'s payload without rewriting the construction. The forward to the consumer's `onBlockLongPress` callback is unchanged. The haptic at the top of the function is also unchanged.
- **What this means for behavior:** long-press on an empty grid cell now fires `[CAL:gesture] blockLongPress` + `[CAL:gesture] blockLongPress -> draft drag` is GONE + medium haptic + (if the consumer wired `onBlockLongPress`) the consumer's callback. No selection mutation, no drag arming. The REMI app does not wire `onBlockLongPress` anywhere (only `onBlockTap`), so today this is a pure no-op besides the haptic. Tap-to-create still works via the tap gesture's `handleBlockPress` → `onBlockTap` path, unchanged.
- **What did NOT change:**
  - `handleBlockPress` (tap path) — unchanged.
  - `internalOnDoubleTap.current(draftEvent)` for drag init via the actual double-tap gesture — unchanged.
  - `EventGridBlocksSkia`'s long-press / tap detection at the gesture layer — unchanged. The change is one level up, in the callback the long-press gesture invokes.
  - Long-press on an existing event (`internalOnLongPress`) — unchanged. The Phase 20 fix is scoped to the empty-cell path.
- **Test coverage:** on-device smoke. The canary log to verify the fix is "drag-armed at original press position" should NOT appear after a long-press on an empty cell. Specifically, the sequence `[CAL:gesture] blockLongPress` → `[CAL:gesture] blockLongPress -> draft drag` → `[CAL:gesture] doubleTap` → `[CAL:gesture] selecting event for drag` should now stop after the first log line.
- **Markers:** `// FORK Phase 20 (P2-FE-6 chunk c)` block in `handleBlockLongPress` (single site).

### Phase 21 — single-tech body → drop lands on visible tech (P2-FE-6 hover-dwell drop fix)
- `dist/index.js` only. `.d.ts` / `.d.mts` unchanged (no public API surface change). `.mjs` not mirrored.
- **Why:** P2-FE-6's hover-dwell avatar-navigator pattern (see `docs/PLAN-DEVIATIONS.md` 2026-04-22-hover-dwell-avatar-navigator) lets the user start a drag on tech A's calendar, dwell on tech B's avatar to narrow the body to `[B]`, then drop on the now-visible tech-B grid. On-device smoke surfaced that the drop's `landedResourceId` was wrong: `finalizeDrag` reported tech A (the dragged event's `selectedEvent.resourceId` original) even though the body had narrowed to `[B]` and the user visually dropped on tech B's grid. Consumer's `handleRCDragEnd` then wrote the draft back to tech A → on next render the strip swapped back to A's selection (or to empty, with the spurious-toggle Bug #2 still in play) → the dropped card visually disappeared. Logs proved: `[CAL:gesture] finalizeDrag {... landedResourceId: 1269 ...}` with `selectedTechIds: [1271]` rendering only tech 1271.
- **Root cause inside `resolveLandedResourceId`:** the multi-day branch checked `isMultiTech = techCount >= 2 && (multiTechMode === "stacked" | "mini-columns")` and only the mini-columns path used the body-render context to pick the destination tech. Single-tech narrowed body (`techCount === 1`) fell through to the "keep dragged event's original tech" preserve branch, which is the right semantic for "user always-only-had-1-tech-selected, drag to new time" (where original === visible) but the WRONG semantic for "user navigated to a new tech via dwell, now drops" (where original !== visible).
- **What changed:** new early branch in `resolveLandedResourceId` — `if (techCount === 1) return bodyResourceIds[0];` placed AFTER the single-day branch and BEFORE the mini-columns / stacked / preserve cascade. Safe for the always-1-tech-selected case because `bodyResourceIds[0] === selectedEvent.resourceId` in that path (only one tech is rendered, so the dragged event must be on it). Resize is also covered (single visible tech → resize stays on that tech, which matches today's behavior since resize already used the keep-original branch and original === visible in that case).
- **What did NOT change:**
  - Single-day mode (`!isMultiDay`) — unchanged. `bodyResourceIds[colIndex]` already encodes destination tech via the column index.
  - Multi-tech mini-columns (`techCount >= 2 && multiTechMode === "mini-columns"`) — unchanged. Lane-resolution from `xWithinColumn` still wins.
  - Multi-tech stacked / non-multi-tech (`techCount >= 2`) — unchanged. Keep-original semantics preserved (no spatial signal between techs).
  - Resize-keep-original for multi-tech — unchanged (the new `techCount === 1` branch covers single-tech resize too, but the destination is still the visible tech which is also the original tech in that case).
- **Markers:** `// FORK Phase 21 (P2-FE-6 hover-dwell drop fix)` block above the new branch in `resolveLandedResourceId`.
- **Test coverage:** on-device smoke. Canary log: after `[P20-DWELL] buzz 3 (commit) {techId: X}`, the next `[CAL:gesture] finalizeDrag` for that drag should report `landedResourceId: X` (NOT the dragged event's original tech).

### Phase 23 — `EventBlock` style merge order: `resolved.container` now wins over `dynamicStyle` (PR-UX-2 / move-chain selector PASS 1, 2026-05-04)

**PLAN-DEVIATION:** none — this is a bug fix to a quietly-broken assumption. Consumers of `styleOverrides` were unable to override the library's hard-coded `opacity` / `borderWidth` / `borderColor` because the library appended `dynamicStyle` after `resolved.container` in the style array, so the library's defaults always won for any field they shared. The fix matches the order already used in `DraggableEvent` (where `resolved?.container` is the last element of its style array) — so it's a consistency fix as much as a bug fix.

- `dist/index.js`, `dist/index.mjs`, `src/components/EventBlock.tsx` — `style: [styles5.event, resolved?.container, dynamicStyle]` → `style: [styles5.event, dynamicStyle, resolved?.container]`. Single-line change in each file.
- **Why:** `applyMoveChainBorderOverride` (in the host app at `src/components/calendar/move-chain-overlay-style.ts`) sets `container.opacity: 0.4` to dim non-chain tiles when a chain is selected. With the old order, `dynamicStyle.opacity` (`selectedAppointment || disabled ? 0.5 : 1`) clobbered our 0.4 every render, so dim never showed. With the new order, our explicit opacity wins.
- **What this changes for other consumers:**
  - Any consumer who supplies `container.borderWidth` / `borderColor` / `opacity` in `styleOverrides` now wins over the library's defaults for those specific fields. This was the documented intent of `styleOverrides` in the upstream type — it just wasn't being honored for these three fields specifically.
  - Layout fields (`top`, `height`, `left`, `width`, `zIndex`) are NOT typically set in `resolved.container` so `dynamicStyle` keeps controlling layout in practice. If a consumer DOES set one of those, they now own it — same as `DraggableEvent`'s long-standing behavior.
  - The "selected event" visual treatment (`borderWidth: 2`, `borderColor: "#4d959c"`) still applies to events that don't override those fields; consumers can still defer to it by leaving `borderWidth` / `borderColor` out of their override object.
- **`.mjs` mirrored** because the diff is one line. Per the "Notes for future agents" caveat at the bottom of this file, only `.js` is what Metro reads; the `.mjs` mirror is for parity, not necessity.
- **Markers:** `// FORK Phase 23 (PR-UX-2)` — single-line comment above the changed `style:` line in `dist/index.js` and `dist/index.mjs`. The `src/` copy uses the same marker.
- **Test coverage:** on-device smoke. The canary is the move-chain chip selection: tapping a chain chip should dim every appointment outside the chain to ~40% opacity. If the dim doesn't apply, the patch didn't land.

### Phase 24 — `onScrollYRef` prop exposes the body's `scrollY` SharedValue (PR-UX-2 / move-chain arrow overlay, 2026-05-05)

**PLAN-DEVIATION:** none — this is a pure observability accessor, not a behavior change. The library already created `scrollY` as a `useSharedValue(0)` driven by the animated scroll handler; this exposes the existing instance to consumers without changing how the library reads or writes it.

**What it does:** `<Calendar onScrollYRef={(sv) => callback(sv)} />` invokes the callback once on mount with the calendar body's vertical-scroll `SharedValue<number>`. Consumers (`MoveChainArrowOverlay` initially, future drag-shadow extras possibly) capture it in a ref and read `.value` from a worklet (via `useDerivedValue` / `useAnimatedReaction` / `useAnimatedStyle`) to translate absolutely-positioned overlays in lockstep with body content during scroll. Read-only contract: do NOT write to `.value` from the consumer side. The library owns the writes via its `useAnimatedScrollHandler`.

- `dist/index.js` — added `onScrollYRef` to the `CalendarInner` props destructure and a `React19.useEffect(() => { onScrollYRef?.(scrollY); }, [onScrollYRef, scrollY])` immediately after `scrollY` is created.
- `dist/index.d.ts` — appended `onScrollYRef?: (scrollY: import("react-native-reanimated").SharedValue<number>) => void;` at the end of `CalendarProps` with a full doc-block.
- `dist/index.d.mts` — same prop addition with a shorter doc-block referring back to `dist/index.d.ts` for the full contract.
- `src/components/Calendar.tsx` — mirrored: prop on `CalendarProps`, destructure addition, `useEffect` after `scrollY` declaration. All marked with `// FORK Phase 24 (PR-UX-2 / move-chain arrow overlay)`.
- `dist/index.mjs` — **NOT mirrored.** Per the "Notes for future agents" caveat below, the `.mjs` is already stale relative to several earlier FORK phases (missing `onEventDoubleTap`, `selectedResourceIds`, `viewportWidth`, `showResourceHeader`, `multiTechMode`, `getResourceColor`, etc.). React Native's Metro resolves through the `"react-native"` field which points at `dist/index.js`, so the runtime is unaffected. Adding only this prop to the stale `.mjs` would be misleading parity (suggesting other recent props are also there). Treat the `.mjs` as a known-stale artifact until somebody runs `npm run build` from inside the fork to regenerate it from `src/`.

**Markers:** `// FORK Phase 24 (PR-UX-2 / move-chain arrow overlay)` — three sites in `dist/index.js` (the prop destructure, the JSDoc on the `useEffect`, and the doc-block on the prop in `dist/index.d.ts` / `dist/index.d.mts`) and three sites in `src/components/Calendar.tsx` (matching).

**Test coverage:** consumer-side. The host app's `MoveChainArrowOverlay` is the first user; logging via `[MoveChain:Scroll]` from a `useDerivedValue` watching the returned SV will confirm the SV is non-null and changing during scroll. Pure observability is hard to unit-test on the library side — if the SV identity ever became unstable across renders, every consumer's `useEffect` would refire, but no behavior in the library would change.

**Future overlay-fix consumers:** when this prop is consumed to actually translate the overlay (planned next pass), the binding pattern should be `useAnimatedStyle(() => ({ transform: [{ translateY: -scrollY.value }] }))` applied to the absolute-positioned overlay container. The minus is because the body content moves UP as `scrollY` increases (standard ScrollView convention).

### Phase 25 — `getEventOpacity` prop animates per-event opacity on the UI thread (PR-UX-2 / move-chain tile pulse, 2026-05-05)

**PLAN-DEVIATION:** none — this is a new opt-in capability. When the prop is absent, behavior is byte-identical to Phase 24.

**Why it exists:** PASS 2.2 of the move-chain visualization pulsed the SVG arrows that connect chain source tiles to their destination ghost tiles. Direct user feedback ("the arrows are pulsing and not the cards haha, that is the opposite of what we want") flipped the requirement: arrows are a steady directional indicator; the *tiles themselves* (source appointment cards + destination ghost frames) need to breathe in opposite phase. Drawing pulsing rectangles over the tiles would be visible-as-overlay (not the same as the tile pulsing), so the robust path is to give the vendored EventBlock a way to apply an animated opacity to its outer container.

**What it does:** `<Calendar getEventOpacity={(event) => descriptor | null} />`. When the callback returns a `{ sv: SharedValue<number>, phase: "source" | "dest" }` descriptor for an event, that event's `EventBlock` wraps its outer container in an `Animated.View` whose opacity reads from the SharedValue inside a `useAnimatedStyle` worklet (UI-thread only — no React re-render). The two phases interpret the same SV oppositely:

- `"source"`: `opacity = sv.value` (tile breathes in lockstep with the SV)
- `"dest"`: `opacity = MAX + MIN - sv.value` (anti-symmetric mirror around the [MIN, MAX] midpoint, so source and dest tiles trade brightness)

When the callback is `undefined` OR returns `null`/`undefined` for a given event, the worklet collapses to `opacity: 1` and there is no visible effect. The `useAnimatedStyle` hook is always called (rules-of-hooks compliance) so the only conditional is inside the worklet — calendars not opting in pay one extra worklet evaluation per re-render and nothing else.

**Architectural decisions:**
- **Outer wrap is `Animated.View`, inner stays `TouchableOpacity`.** The press surface (and its iOS press-down feedback) stays on the inner Touchable; the outer Animated.View carries position + animated opacity. The wrapper is `pointerEvents="box-none"` so touches pass through unchanged. Container styles (border, background, position) moved from the Touchable to the wrapper; the Touchable now has only `flex: 1`.
- **No consumer import inside the vendored library.** The `MIN = 0.3` / `MAX = 1.0` constants used for the dest-phase mirror are duplicated inline in `EventBlock.tsx`'s worklet rather than imported from the consumer's `move-chain-pulse-singleton.ts`. The library stays free of outbound dependencies on app code; if either side drifts, the pulse band visually clips at the wrong values but does not crash.
- **Singleton SharedValue lives in consumer code.** `src/components/calendar/move-chain-pulse-singleton.ts` (`makeMutable<number>(MAX)`) owns the SV. The consumer's `useMoveChainPulse(active)` hook subscribes via refcount; the singleton starts/stops the `withRepeat(withTiming(MIN), -1, true)` based on count. The vendored library has zero knowledge of this — it just reads whatever SharedValue the consumer hands it.

**Files touched:**
- `dist/index.js` — `EventBlock`'s React.memo destructure adds `getEventOpacity`. New `Animated2.useAnimatedStyle` block computes `opacityAnimatedStyle` BEFORE the `if (eventHeight == 0) return null;` guard so the hook is always called the same number of times across renders. The return swaps from `<TouchableOpacity ...>` to `<Animated.View ...><TouchableOpacity ...>...</TouchableOpacity></Animated.View>`. New `eventInner: { flex: 1 }` style added to `styles5`. `CalendarInner.effectiveRenderer` now passes `getEventOpacity: props.getEventOpacity` and includes it in the `useMemo` deps.
- `dist/index.d.ts` — new `EventOpacityDescriptor` and `GetEventOpacity` types; `getEventOpacity?: GetEventOpacity` added to `CalendarProps`; both types re-exported.
- `dist/index.d.mts` — same type additions with a shorter doc-block referring back to `dist/index.d.ts` for the full contract.
- `src/components/EventBlock.tsx` — mirrored: new types, prop, `useAnimatedStyle` hook, Animated.View wrapper, `eventInner` style.
- `src/components/Calendar.tsx` — mirrored: prop on `CalendarProps`, pass-through in `effectiveRenderer`'s `useMemo`.
- `dist/index.mjs` — **NOT mirrored.** Per the existing Phase 24 caveat below, the `.mjs` is already stale relative to multiple earlier FORK phases. RN/Metro reads `dist/index.js` via the `"react-native"` package.json field, so the runtime is unaffected.

**Markers:** `// FORK Phase 25 (PR-UX-2 / move-chain tile pulse)` — at the prop destructure, the new `useAnimatedStyle` hook, the new `Animated.View` wrapper, the inner-style addition, the `effectiveRenderer` pass-through, and on the prop doc-block in both `.d.ts` files.

**Test coverage:** consumer-side. `src/components/calendar/move-chain-pulse-singleton.ts` exports `moveChainPulseOpacity(pulse, phase)` as a worklet-safe pure function so the math can be unit-tested without Reanimated. The phase resolver (`move-chain-pulse-resolver.ts`) is the seam where the consumer decides which tiles get a descriptor — it uses the SAME chain-membership logic as `applyMoveChainBorderOverride`, so on-screen agreement between dim/highlight states and pulse phase is automatic. Library-side, the new wrapper changes the DOM tree by exactly one Animated.View, which the host app's existing snapshot/integration tests would fail loudly on if the touch surface broke.

**Cleanup if reverted:** Remove the `getEventOpacity` prop from `EventBlock`'s destructure, the `useAnimatedStyle` block, the `Animated.View` wrapper (collapse back to bare `TouchableOpacity`), the `eventInner` style, and the `effectiveRenderer`'s pass-through. The `Animated2` / `useAnimatedStyle` imports in `dist/index.js` already exist for `DraggableEvent` and other animated components — no import cleanup needed.

### Phase 26 — `onEventLayout` prop exposes per-event rendered bounds (move-chain arrow alignment, 2026-05-10)

**PLAN-DEVIATION:** none — this is a new opt-in observability accessor. When the prop is absent, behavior is byte-identical to Phase 25.3.

**Why it exists:** the move-chain arrow overlay anchors arrow endpoints to "tile rects" computed from grid descriptors (`appointmentBlockWidth`, `hourHeight`, `minuteOffset`, etc.). That logical-cell rect is INSET on screen by the EventBlock's own `dynamicStyle` (`+1`px left, `+2`px top, `-3`px width, `-4`px height) plus any `eventStyleOverrides.container` border / padding the consumer applies. Arrows anchored to the cell rect therefore hover a few pixels OUTSIDE the visible card edge. The user reported (verbatim): *"the existing arrows are still not really aligned very well, could you please explain in concise prose of about 1-2 sentences per point what is making that so hard to fix? [...] And yes, let's do the vendor work to fix the arrows."* The consumer has no way to know the inset deltas from outside the library (they're hardcoded in `EventBlock`'s `dynamicStyle` and would silently drift if the library tweaked them, plus `styleOverrides.container` can override them per-event).

**What it does:** `<Calendar onEventLayout={(event, layout) => ...} />`. EventBlock attaches `onLayout` to its outer `Animated.View` and fires the consumer's callback with the `event` reference and `{ x, y, width, height }` of the rendered rect in column-local coordinates (the View's `onLayout` natural reporting space — `x` is intra-column, `y` is intra-grid since columns share a Y=0 origin in the calendar body). Consumers maintain a per-mount Map keyed by `event.id` and combine the reported `x` with their column-offset math to get grid-coordinate rects suitable for overlay painting. Width / height / Y come from the report verbatim, so the arrow geometry helper lands endpoints flush against the visible card edges instead of inferring from `appointmentBlockWidth × hourHeight`.

**Coordinate-space contract:**
- **Stacked mode / single-tech workweek / day view**: EventBlock's parent IS the day-column View. `bounds.x` is intra-day-column. Consumer adds `colStart` to get grid X.
- **Mini-columns mode**: each tech wrapped in a `View { position:'absolute', left: i * laneWidth }` inside the day-column (see `renderItem` in `dist/index.js`). EventBlock's parent is the per-lane wrapper, so `bounds.x` is intra-LANE. Consumer adds `colStart + lane.laneIndex * lane.laneWidth` to get grid X.

The consumer's geometry helper handles both branches; the library reports column/lane-local coords uniformly via `onLayout`'s natural semantics.

**Architectural decisions:**
- **`onLayout` on the outer Animated.View, not the inner TouchableOpacity.** The outer wrapper is what carries the `dynamicStyle` position + the chain-color border + the animated opacity (Phase 25). It's the "card rect" the user sees. The inner Touchable is layout-only (`flex: 1`), inset from the wrapper — wrong rect for arrow anchoring.
- **No consumer import inside the vendored library.** The callback's shape (`(event, layout) => void`) is library-defined; the consumer-side registry / lookup helpers live in `src/hooks/calendar/use-event-bounds-registry.ts`. The vendored library has zero outbound dependency on app code.
- **Stable callback identity required.** Like `getEventOpacity` (Phase 25), this prop is consumed inside `effectiveRenderer`'s `useMemo` deps. A churning identity would re-key every EventBlock per render and storm layout reports. The consumer pattern uses a `useRef`-backed Map writer with `useCallback`-stable identity (see `useEventBoundsRegistry`).
- **Zero-overhead opt-out.** When `onEventLayout` is `undefined`, EventBlock passes `undefined` to the `Animated.View`'s `onLayout` prop — React's reconciler skips layout-change tracking entirely. Calendars that don't need bounds reporting pay nothing.

**Files touched:**
- `dist/index.js` — `EventBlock` destructure adds `onEventLayout`. New `React19.useCallback` builds a stable `handleEventLayout(e)` that reads `e.nativeEvent.layout` and forwards to the consumer. The outer `Animated.View` gets `onLayout: onEventLayout ? handleEventLayout : void 0`. `CalendarInner.effectiveRenderer` passes `onEventLayout: props.onEventLayout` and includes it in the `useMemo` deps.
- `dist/index.d.ts` — new `OnEventLayout` type with full doc-block. `onEventLayout?: OnEventLayout` added to `CalendarProps`. The type is re-exported alongside `EventOpacityDescriptor` / `GetEventOpacity`.
- `dist/index.d.mts` — same prop + type addition with a shorter doc-block referring back to `dist/index.d.ts` for the full contract.
- `src/components/EventBlock.tsx` — mirrored: `OnEventLayout` type export, prop on `EventBlockProps`, `useCallback` wiring, `onLayout` on the outer Animated.View.
- `src/components/Calendar.tsx` — mirrored: prop on `CalendarProps`, pass-through in `effectiveRenderer`'s `useMemo`.
- `dist/index.mjs` — **NOT mirrored.** Per Phase 24/25 caveats, the `.mjs` is stale relative to multiple earlier FORK phases; RN/Metro reads `dist/index.js` via the `"react-native"` field, so runtime is unaffected.

**Markers:** `// FORK Phase 26 (2026-05-10)` — at the prop destructure, the new `useCallback`, the `Animated.View`'s `onLayout`, the `effectiveRenderer` pass-through, and on the prop / type doc-blocks in both `.d.ts` files.

**Test coverage:** consumer-side. `src/hooks/calendar/__tests__/use-event-bounds-registry.test.ts` (14 cases) covers the registry helpers: writes, reads, stable callback identity across renders, unregister, multi-event isolation, ghost-id handling. `src/components/calendar/__tests__/compute-move-chain-arrows.test.ts` adds 6 cases under "FORK Phase 26: eventBoundsLookup hit-path + fallback": single-tech workweek anchoring, null-lookup fallback, undefined-lookup fallback, partial-hit (source-only) mixed mode, mini-cols lane-offset arithmetic, and day-view multi-column anchoring. Library-side, the `onLayout` wiring is byte-equivalent to React Native's standard prop, which the existing snapshot/integration tests would fail loudly on if the touch surface broke.

**Cleanup if reverted:** Remove the `onEventLayout` prop from `EventBlock`'s destructure, the `handleEventLayout` `useCallback`, the `onLayout` attribute on the outer `Animated.View`, the `OnEventLayout` type from `dist/index.d.ts` / `dist/index.d.mts`, and the `effectiveRenderer`'s `onEventLayout: props.onEventLayout` pass-through (drop the dep array entry too). The consumer's `useEventBoundsRegistry` hook becomes unused but harmless — it's just a Map wrapper.

### Phase 25.3 — EventBlock `lastPhaseRef` mutation moved out of render (avatar-reorder regression fix, 2026-05-05)

**What changed:** the diagnostic "phase changed" log emitted by `EventBlock` (FORK Phase 25.2) was previously a render-body mutation:

```js
// inside render — anti-pattern
if (__DEV__ && lastPhaseRef.current !== currentPhase) {
  console.log("[MoveChain:Pulse:EventBlock]", {...});
  lastPhaseRef.current = currentPhase;
}
```

This is now a `useEffect` keyed on `[currentPhase, event]`:

```js
React.useEffect(() => {
  if (!__DEV__) return;
  if (lastPhaseRef.current === currentPhase) return;
  console.log("[MoveChain:Pulse:EventBlock]", {...});
  lastPhaseRef.current = currentPhase;
}, [currentPhase, event]);
```

**Why:** the user reported (verbatim) "I can't move the techs around like I used to be able to" after PR-UX-2 PASS 2.x landed — specifically that long-pressing a tech avatar in the day-view header no longer pops/scales/triggers haptic. The vendored avatar gesture chain (`Gesture.Race(LongPress|Pan, doubleTap, singleTap)` inside `ResourceComponent`) was UNCHANGED in recent FORK phases, and consumer-side overlays (`MoveChainArrowOverlay`, `FloatingDraftCard`, `PendingRealityFAB`) all carry `pointerEvents="none"` / `"box-none"`. Static analysis could not isolate a single root cause.

The most concrete React-rules smell in the recent diffs was this in-render ref mutation. Mutating refs during render is officially anti-pattern (see [React docs](https://react.dev/reference/react/useRef#avoiding-recreating-the-ref-contents) — "Do not write or read ref.current during rendering"). Under StrictMode's double-invoke render the ref's observed value diverges between the two passes, and several lint rules flag it. While ref mutation does not by itself trigger a re-render, it can subtly disagree with React's concurrent-rendering model, which makes it a strong candidate for "weird gesture-handler behavior on a real device that doesn't repro in static analysis."

Moving the mutation behind a `useEffect` is a safe, surgical fix: it preserves the diagnostic log's *meaning* (still fires once per phase transition per event), removes the anti-pattern, and adds zero new behavior. It does not revert any move-chain pulse / arrow / ghost / chip-row / step-cycle work — those stay intact.

**Side note on hook ordering:** the new `useEffect` is added BEFORE `useAnimatedStyle` in the render order. React only requires that hooks fire in the *same* order across renders for a given component, not that the order match across versions, so adding a hook is always safe. The pre-existing `if (eventHeight == 0) return null;` early return that splits `useResolvedFont` from the hooks above is unchanged — it predates Phase 25 and is out of scope for this fix.

**Files touched:**
- `dist/index.js` — `EventBlock` body: render-time `if (__DEV__ && lastPhaseRef.current !== currentPhase) { console.log(...); lastPhaseRef.current = currentPhase; }` block replaced with `React19.useEffect(...)` keyed on `[currentPhase, event]`.
- `src/components/EventBlock.tsx` — mirrored: same render-time block replaced with `React.useEffect(...)`.
- `dist/index.mjs` — NOT mirrored (already stale per Phase 24/25 caveats; RN reads `dist/index.js`).

**Markers:** `// FORK Phase 25.3 (avatar-reorder regression fix, 2026-05-05)` in both files. The original Phase 25.2 marker stays so the relationship between diagnostic-add (25.2) and diagnostic-fix (25.3) is greppable in a single search.

**Test coverage:** consumer-side. New regression test at `src/components/calendar/__tests__/MoveChainArrowOverlay.test.tsx` locks in the overlay's `pointerEvents="none"` contract so a future refactor can't silently re-introduce the "overlay swallows touches" hypothesis (Hypothesis A in the bug-investigation prompt). The existing `move-chain-pulse-singleton.test.ts` and `move-chain-overlay-style.test.ts` continue to cover the pulse/border math.

**Cleanup if reverted:** Restore the inline `if (__DEV__ && lastPhaseRef.current !== currentPhase) {...}` block in both `dist/index.js` and `src/components/EventBlock.tsx`. The `useEffect` import is already used elsewhere in both files, no import cleanup needed.

### Phase 20 — frozen drag-card pickup width via `dragCardPickupWidth` SV (P3-FE-DRAG-GHOST chunk a, 2026-05-06)

**What it does:** the floating drag card (`DraggableEvent`) now renders at the width it had at pickup time, rather than the live `BODY_BLOCK_WIDTH` prop value. Previously the card visually shrank or grew mid-drag whenever `BODY_BLOCK_WIDTH` changed under it — most visibly during the Phase 18/19 dwell-driven tech swap (adding/removing a column changes `(width - TIME_LABEL_WIDTH) / numberOfColumns`), and to a lesser degree on landscape mini-cols at 89pt where the same recompute can fire on roster changes.

**Mechanism:** added a 6th `useSharedValue` to `CalendarBindingProvider` — `dragCardPickupWidth` — exposed alongside the existing 5 (`panXAbs`, `panYAbs`, `isDragging`, `fingerXAbs`, `fingerYAbs`) via `useDragSharedValues()`. `internalOnDoubleTap.current` writes `apptWidthRef.current` into it at drag-init (the same `BODY_BLOCK_WIDTH` value the pickup-X math uses). Pan `onEnd` resets it to 0 alongside the existing `fingerXAbs`/`fingerYAbs` NaN reset, so the next drag re-captures cleanly. `DraggableEvent`'s two `useAnimatedStyle` worklets (`dynamicStyle` for size, `draggingAnimatedStyle` for transform/centering) read `dragCardPickupWidth.value` first; if it's > 0, that wins; otherwise they fall back to the existing `laneWidth || APPOINTMENT_BLOCK_WIDTH` chain. The 0 sentinel keeps tests that mount `DraggableEvent` directly (without going through the gesture path) working unchanged.

**Why an SV and not a JS const:** the worklets re-run on every frame the SVs change. If the pickup width were a JS-side closure value, `useAnimatedStyle` would only recompute when its JS-side deps (`APPOINTMENT_BLOCK_WIDTH`, `laneWidth`) changed — which is exactly what we DON'T want here, since those changing is the bug. Reading the value inside the worklet body lets the styles ignore prop changes entirely while a drag is active, then naturally fall back to the prop when the SV resets to 0.

**Cleanup if reverted:** drop the `dragCardPickupWidth` field from `DragSharedValuesCtx`, the destructure in `CalendarInner`, the writes in `internalOnDoubleTap`/`onEnd`, the prop on `DraggableEvent`, and the SV-read branch inside the two animated styles. Also drop the type-only addition to `dist/index.d.ts` and `dist/index.d.mts`. The pre-Phase-20 `effectiveWidth` was a JS-side const at the top of `DraggableEvent` (`const effectiveWidth = typeof laneWidth === "number" && laneWidth > 0 ? laneWidth : APPOINTMENT_BLOCK_WIDTH;`); `dynamicStyle` and `draggingAnimatedStyle` referenced it directly with deps `[effectiveWidth]` and `[selectedEvent, effectiveWidth]` respectively.

**Phase 20.1 follow-up (2026-05-06): freeze to LANE width, not BODY_BLOCK_WIDTH.** Initial Phase 20 captured `apptWidthRef.current` (= `BODY_BLOCK_WIDTH`, the day-column width) into `dragCardPickupWidth`. That made the floating drag card visually *bigger* than every other card in mini-cols mode (~3× lane width on a 4-tech roster), violating the "card size = lane width = drop zone width" contract the user wants. The fix: introduced `pickupVisualWidthRef` updated alongside `apptWidthRef` in the same `useEffect`. The new ref tracks the per-EventBlock render width — which is `BODY_BLOCK_WIDTH / techCount` in mini-cols and `BODY_BLOCK_WIDTH` everywhere else, mirroring the `eventLayer` branch logic in `renderItem`. `internalOnDoubleTap.current` now reads `pickupVisualWidthRef.current` for the `dragCardPickupWidth` SV write. `apptWidthRef` continues to be the X-positioning width (used at lines ~2937–2949 for `selectedAppointmentStartedX`) — that's correct because X math operates across day-columns, not lanes. **Contract reinforced:** card size, lane width, and drop-zone width are now all guaranteed equal by construction in mini-cols (both pickup and `resolveLaneDropPosition` divide `BODY_BLOCK_WIDTH` by the same `techCount`); they're all `BODY_BLOCK_WIDTH` in single-tech / stacked modes (where the lane concept doesn't exist). DO NOT swap `pickupVisualWidthRef.current` back to `apptWidthRef.current` without re-introducing the size-mismatch bug — they're separate concepts that happen to share a value in non-mini-cols modes.

**Markers:** `// FORK Phase 20 (P3-FE-DRAG-GHOST chunk a)` on (1) the `dragCardPickupWidth` instantiation + memoization in `CalendarBindingProvider`, (2) the destructure in `CalendarInner`, (3) the write in `internalOnDoubleTap.current`, (4) the reset in pan `onEnd`, (5) the new `dragCardPickupWidth` prop on `DraggableEvent`, (6) the JSDoc additions in `dist/index.d.ts` and `dist/index.d.mts`. `src/components/DraggableEvent.tsx` is intentionally NOT mirrored — that file has been out of sync with `dist` since Phase 16 (no `laneWidth` prop, different width logic) and the runtime serves `dist/index.js` per the `react-native` package field. `dist/index.mjs` is also not mirrored, same caveat as Phase 24/25.

**Test coverage:** consumer-side smoke (manual). Repro pre-fix: long-press an event in landscape mini-cols, drag toward an avatar, watch the card shrink to lane width as the dwell-swap fires. Post-fix: card stays at pickup width through the swap, snaps back to grid layout on release. No new automated tests in this chunk — the SV is read inside Reanimated worklets which jest-vendored mocks don't exercise; will get coverage from the on-device smoke list in the PR.

### Phase 21 — drop-target ghost overlay mounted via `getResourceColor` prop (P3-FE-DRAG-GHOST chunk b, 2026-05-06)

**What it does:** mounts the previously-defined-but-never-mounted `DropShadow` component as a sibling of `DraggableEvent` in the calendar overlay layer. While a drag is active in landscape mini-columns mode (multi-day + 2+ techs + `multiTechMode: "mini-columns"`), each lane gets a tinted dashed-outline ghost rectangle showing the projected drop slot. The tint is per-tech (driven by a new `getResourceColor` prop the consumer supplies), so the user sees not just WHERE the drop will land but also which TECH'S lane it'll land in.

**Why now:** Phase 20 froze the floating drag card to its pickup-time width, which fixed the "card shrinks to lane width" UX bug. But it surfaced an adjacent UX gap: in landscape mini-cols at 89pt lane width, the floating card (frozen at the full ~250pt day-column width) physically obscures all four lanes equally — the user can no longer tell which lane the drop will hit. The ghost outline restores that signal by drawing a dashed border at the actual destination lane width, tinted to that tech's color.

**Mechanism:** added an optional `getResourceColor?: (resourceId: number) => string` prop to `CalendarProps`. Inside `CalendarInner`, a memoized `techColors` array derives from `bodyResourceIds.map(getResourceColor)` and gets passed to `DropShadow` (which already expected this shape — Phase 16 scaffolded the resolver + component but never wired the consumer prop). The mount site sits BEFORE `DraggableEvent` in the JSX overlay layer so the floating card paints on top — the user always sees the source card uncluttered. Gated identically to the existing `resolveLaneDropPosition` null guard: `selectedEvent && dragReady && multiTechMode === "mini-columns" && bodyResourceIds.length >= 2`.

**Why mini-cols only:** `resolveLaneDropPosition` returns null for `techCount < 2` (single-tech, single-day, or non-mini-cols), and the bug being fixed only manifests when there are multiple narrow lanes inside one day-column. In normal multi-tech landscape (1 tech per column) the dragged card centroid IS the destination column indicator — no ghost needed. In portrait single-tech (with or without dwell-swap) the column width equals the body width equals the frozen card width, so again the card itself is the indicator. The chunk could be extended in a follow-up to cover normal multi-tech via a new `resolveColumnDropPosition` resolver, but the user's complaint was specifically about mini-cols, so scope is held there.

**Consumer wiring:** `LandscapeWorkweekView` passes `getResourceColor={colorForTech}` directly — that helper already returns the same per-tech color the consumer's `eventStyleOverrides` uses for card tinting, so the ghost color matches the source card's color out of the box. No state plumbing needed.

**Cleanup if reverted:** drop the `getResourceColor` prop from `CalendarProps` (and the JSDoc field in both `.d.ts` files), the destructure in `CalendarInner`, the `techColors` `useMemo`, and the `DropShadow` JSX block (preserve `DraggableEvent`'s mount). The `DropShadow` component definition itself stays — it predates this phase as scaffolding and might be reused for normal multi-tech in a follow-up.

**Markers:** `// FORK Phase 21 (P3-FE-DRAG-GHOST chunk b)` on (1) the new prop in CalendarProps destructure (`dist/index.js`), (2) the `techColors` `useMemo`, (3) the `DropShadow` mount block above `DraggableEvent`, (4) the JSDoc field in `dist/index.d.ts` and (5) `dist/index.d.mts`. `// FORK Phase 21.1 (...follow-up...)` on the solid-border swap in `DropShadow`'s static style. `src/components/Calendar.tsx` is intentionally NOT mirrored (the reference src has been out of sync since Phase 16 — runtime serves `dist/index.js` per the `react-native` package field). `dist/index.mjs` is also not mirrored, same caveat as Phase 24/25.

**Dashed-border gotcha (Phase 21.1, 2026-05-06):** the original Phase 16 scaffolding for `DropShadow` used `borderStyle: "dashed"` for the ghost outline. React Native does not render dashed borders reliably — on iOS the dashes either collapse to a solid line or fail to paint at all when `borderRadius > 0`, and on Android the dash pattern depends on the platform version. The bug never surfaced before because the component was never mounted. When Phase 21 wired the mount, the visual was a no-op-looking solid line on iOS. Fix: dropped `borderStyle: "dashed"` from the static style array, kept `borderWidth: 2 / borderColor: rgba(0,0,0,0.55)` (slightly bumped from 0.5 for stronger contrast). The result reads as distinct from `DraggableEvent`'s near-invisible 1pt `rgba(0,0,0,0.12)` border, so source card and ghost don't blend. **DO NOT reintroduce dashed in any FORK-managed overlay** — for any new outline-style component, use one of: (a) solid `borderWidth` ≥ 2 with high-contrast `borderColor`, (b) a tinted fill with no border, (c) `react-native-svg` `Rect` + `strokeDasharray` if dashes are essential. The repo does not currently bundle SVG-for-dashes anywhere; option (a) or (b) is what every other consumer-side overlay (`PendingChangeBadge`, `MoveChainArrowOverlay`, etc.) uses.

**Phase 21.2 follow-up (2026-05-06): offset ghost above the dragged card.** Initial Phase 21 rendered the ghost at `pos.translateY` (= `eventStartedTop - scrollY`, the snap-Y of the destination), which is exactly where the floating drag card sits. The card painted on top of the ghost and the user couldn't see it. User feedback: *"I also can't see the drop zone under the card, so I need the card and drop zone to be a little bit offset from each other. The drop zone needs to be outside of where the finger would cover the screen."* Fix attempt: `DropShadow`'s animated style subtracted `(pos.height + 8)` from `translateY`, rendering the ghost as a stacked tile floating ABOVE the dragged card with an 8pt visual gap. **Reverted in Phase 21.3 (see below) — this fix was wrong.** The bug it created: the user dropped onto where the ghost rendered, but the event landed at the original snap position (the un-offset spot where the card was). Drop did not match ghost. Critical UX failure.

**Phase 20.2 + Phase 21.3 (2026-05-06): offset the CARD instead of the ghost so drop = ghost by construction.** User feedback after 21.2 shipped: *"when dropped, the card does not go into the drop zone, it goes where the card is actually above. It might be better to have the card just above the finger a bit so it's peaking out from under the finger, and the drop zone kind of under the card, but like 1/4 under the card so the bottom right quadrant of the shadow is under the top left quadrant of the card."* This pass put the offset on the CARD (translateY/translateX dropped the `- H/2 + 2` / `- W/2 + 1` bias) and left the ghost at `pos.translateY` / `pos.translateX`. **Reverted in Phase 20.3 / 21.4 (see below) — wrong layer carried the offset.**

**Phase 20.3 + Phase 21.4 (2026-05-06): offset the GHOST, leave the CARD centered on touch.** User feedback after 20.2/21.3 shipped: *"you centered the wrong thing. You centered the ghost drop card under the touch point instead of the appointment card itself."* The mental-model fix: touch drives the CARD (the appointment the user is holding), and the ghost is a passive visual reference for "this is the lane/time slot under your finger". Phase 20.2's swap got both halves wrong — it shoved the card off into the lower-right quadrant and put the ghost dead-center under the finger, where you can't see it AND it doesn't match the "I'm holding this" feel. New shape (subsequently amended by Phase 20.4 below for the card translate; ghost translate stays as defined here):

- `DraggableEvent.draggingAnimatedStyle` reverted to the original `{ translateY: panYAbs - eventHeight/2 + 2 }` / `{ translateX: panXAbs - effectiveWidth/2 + 1 }` — card centered on touch, painted at the snap position (Phase 20.3). **Superseded by Phase 20.4 — see below.**
- `DropShadow.animatedStyle` now offsets the ghost by `(- pos.width / 2, - pos.height / 2)`, putting the ghost's bottom-right corner at the card's center under the *original* (Phase 20.3) card position. After Phase 20.4 shifts the card up-and-left further, the ghost still peeks above-and-left of the card — it just no longer hits the exact 1/4 corner-overlap geometry. (Phase 21.4).
- Drop logic untouched. Drop lands at `eventStartedTop` = the snap position the pan worklet derived from touch — same as every prior gesture iteration. The "drop = ghost" interpretation from Phase 21.3 is GONE; the ghost is purely a visual indicator that scales the user's "where am I in the grid" mental map, NOT a relocation of the drop point. The earlier user complaint *"the card does not go into the drop zone, it goes where the card is actually above"* was effectively asking us to move the ghost to where the drop already lands and put it OFFSET so it's visible. That's what Phase 20.3/21.4 does.

**Contract reinforced:** ghost size = card size = lane width (Phase 20.1 still enforces this). The card layer is the drop indicator and tracks touch; the ghost layer is the visual reference and is offset away from touch by (`-W/2`, `-H/2`). DO NOT swap which layer carries the offset — putting the offset on the card (Phase 20.2) makes it feel like the user is dragging the WRONG thing.

**Phase 20.4 (2026-05-06): card offset further up-and-to-the-left so finger covers ~1/3 of card.** User feedback after 20.3/21.4 shipped: *"the touch point card sits too much under the finger, if you could move it up and to the left about 33% of the card covered by the finger that would be great."* `DraggableEvent.draggingAnimatedStyle`'s transform changed from `panYAbs - eventHeight/2 + 2` / `panXAbs - effectiveWidth/2 + 1` to `panYAbs - eventHeight*2/3` / `panXAbs - effectiveWidth*2/3`. The card now extends up-and-to-the-left of the touch point with the finger nominally over the bottom-right 1/3 of the card. This is purely a visual offset on the floating card; drop logic is untouched (drop still lands at `eventStartedTop` derived from `panYAbs - eventHeight/2`, NOT from the new offset). Net consequence: the rendered floating card is up-and-left of where the drop will actually land by approximately `(W/6, H/6)`. That's a known-and-accepted UX trade-off — the alternative (changing the snap math to follow the offset card) introduces a teleport-on-pickup because `startedY` would no longer equal the source event's center. Ghost remains at `(snap_x - W/2, snap_y - H/2)`, which is now even further up-and-left of the floating card; the corner-overlap pattern from 21.4 weakens but the ghost is still clearly visible above-and-left of the card.

**Open follow-up: column-misalignment after multiple drags.** User screenshot 2026-05-06 (8:48 AM ET) shows a previously-dragged card landing between two day columns instead of squarely inside one. Other event cards in the same view are column-aligned, so this is something that happens specifically to a card that's been moved through the drag pipeline a few times in succession. Suspects, in rough order of likelihood: (a) optimistic overlay using stale `bodyResourceIds` ordering vs `selectedResourceIds` ordering — logs from the screenshot show `selectedResourceIds: [2055, 2054, 2073]` but `bodyResourceIds: [2054, 2055, 2073]`, which would shift any consumer using the wrong array as the lane index by one slot; (b) `dragCardPickupWidth` not getting recomputed correctly across consecutive drags (it's reset to 0 in `onEnd` and re-captured in `internalOnDoubleTap.current`, so this should be clean — but worth verifying with a re-drag sequence on the same event); (c) ghost staying mounted with stale `pos.translateX` between drags. None of these are caused by the 20.x / 21.x phases — they would have shipped with Phase 21 originally — but the misalignment is more visible now because of the offsets. Not gating P3-FE-DRAG-GHOST on this; will iterate after smoke confirms the offset fix lands cleanly.

**Phase 20.6 (2026-05-06): root-cause fix for the column-misalignment open follow-up.** First Metro repro after Phase 20.5 instrumentation landed lit up `[CAL:lane-overflow]` for **every event** in mini-cols mode with the user's portrait 4-day, 3-tech selection (`laneWidth = 21.25px`). Root cause: `computeStackedEventLayout` had a hardcoded `minWidthPx = 25` floor in `Math.max(minWidthPx, available)`, which forced every card to render 25px wide regardless of the lane being only 21.25px — overflowing 3.75px (level 0) to 9.75px (level 1) into the adjacent lane on every render. The "card shifts position out of alignment from the column lines after multiple drags" symptom was misleading: this was happening on every render, but the user only noticed it after dragging because the dragged card draws the eye to that area.

Fix: clamp the result to never exceed `containerWidthPx - leftPx`. The minWidth floor still applies when the container has room for it — only when the lane itself is narrower than minWidth does the clamp win, degrading legibility gracefully rather than visually breaking lane boundaries.

```js
// before
const widthPx = Math.max(minWidthPx, available);

// after
const widthPx = Math.max(0, Math.min(
  containerWidthPx - leftPx,
  Math.max(minWidthPx, available)
));
```

Behavior matrix:
- Wide container (legacy use case): `min(200, max(25, 200)) = 200` → unchanged.
- Narrow container (mini-cols, 3 techs portrait): `min(21.25, max(25, 21.25)) = 21.25` → fits the lane exactly instead of overflowing 3.75px.
- Narrow container with indent (level 1): `min(15.25, max(25, 15.25)) = 15.25` → fits the remaining lane space.
- Degenerate (`leftPx >= containerWidthPx`, e.g. very narrow container with deep stacking): `max(0, min(<=0, 25)) = 0` → invisible card rather than negative width.

The Phase 20.5 `[CAL:lane-overflow]` log is kept as defense-in-depth — should stay silent under normal operation but will catch any future regression at the source. `[CAL:mini-cols] lane geometry` extended-lanes log is also kept; it's noisy in `__DEV__` but high-value during any future drag-related investigation, and strips cleanly from production. Both can be reverted to their pre-20.5 forms in a future cleanup pass once we've confirmed no follow-on issues lurk.

Closes the **Open follow-up: column-misalignment after multiple drags** noted under Phase 20.4 — at least the rendering-layer half of it. After Phase 20.6 shipped, the user's repro logs no longer fire `[CAL:lane-overflow]` (confirming committed cards no longer spill into adjacent lanes), but the user reported the floating *dragged* card still visually straddles columns: *"It's still happening."* Phase 20.7 below addresses the second half (the floating-card layer) and closes the follow-up for real.

**Phase 20.7 (2026-05-06): floating drag card snaps its X to the destination lane.** **Reverted in Phase 26 (see below).** Followup to Phase 20.4 + 20.6. Phase 20.6 fixed the *committed* card layout (every event was overflowing its lane by 3.75–9.75px because `minWidthPx = 25` won over `laneWidth = 21.25`). After that fix the user reported the misalignment was still present, so we re-examined what was left. Hypothesised cause: `DraggableEvent.draggingAnimatedStyle` was setting `translateX = panXAbs - effectiveWidth*2/3` (Phase 20.4 shape), which anchors the floating card to the *finger* with a static offset. The card width is one lane wide (Phase 20.1), but its X is never aligned to a lane gridline — so the card visually straddles two lanes the entire time the user drags. In wider modes this looked fine (the Phase 20.4 user feedback was "looks really good" against a 4-day portrait selection), but in narrower mini-cols lanes (~21px portrait, ~58px landscape) the same offset reads as constant misalignment.

Fix: when in mini-cols mode (`techCount >= 2` AND `bodyBlockWidth > 0` AND `columnCount >= 1` AND `scrollX` provided), the card's `translateX` is now derived from `resolveLaneDropPosition` — the same worklet `DropShadow` already uses to place the ghost. The card snaps to the destination lane's left edge in lockstep with the ghost. Card and ghost now align column-for-column on every frame instead of drifting apart with finger position.

Y is unchanged from Phase 20.4 (`panYAbs - eventHeight*2/3`). The "card peeks out above the finger" UX the user explicitly asked for in Phase 20.4 stays intact on the vertical axis; only the horizontal anchor changes.

```js
// Phase 20.4 (before — finger-following X)
{ translateX: panXAbs.value - (effectiveWidth * 2) / 3 }

// Phase 20.7 (after — lane-snapped X in mini-cols)
let translateX = panXAbs.value - (effectiveWidth * 2) / 3;
if (
  typeof bodyBlockWidth === "number" && bodyBlockWidth > 0 &&
  typeof techCount === "number" && techCount >= 2 &&
  typeof columnCount === "number" && columnCount >= 1 &&
  scrollX
) {
  const pos = resolveLaneDropPosition({
    panXAbs: panXAbs.value,
    eventStartedTop: eventStartedTop.value,
    eventHeight: eventHeight.value,
    scrollX: scrollX.value,
    scrollY: 0,                  // not used for X
    timeLabelWidth: TIME_LABEL_WIDTH,
    bodyBlockWidth, techCount, columnCount
  });
  if (pos) translateX = pos.translateX;
}
```

Geometry summary after Phase 20.7 (mini-cols 2+ tech):
- finger ≈ `(panX, panY)`
- card_TL ≈ `(snap_X, panY - 2H/3)` — X snapped to destination lane, Y above finger
- snap_TL ≈ `(snap_X, snap_Y)` — drop position
- ghost_TL ≈ `(snap_X - W/2, snap_Y - H/2)` — Phase 21.4 corner-overlap

Card now sits squarely in the destination lane (no straddle), ghost still peeks out top-and-left of card with corner overlap, finger still covers the bottom 1/3 of the card.

**Behavior matrix:**
- Single-tech / stacked / single-day (any of `techCount < 2`, `bodyBlockWidth <= 0`, `columnCount < 1`, `scrollX` undefined): `pos == null` → falls through to the Phase 20.4 finger-following X. Unchanged.
- Mini-cols 2+ tech: `pos.translateX` wins → card snaps to destination lane. New behavior, drives this fix.
- Pickup-time width sentinel `0` from `dragCardPickupWidth` (pre-drag): unaffected — the X math runs independently of `effectiveWidth`. Card just inherits whatever default `effectiveWidth` resolves to and snaps the same way.

**Drop logic untouched.** `eventStartedTop` and the pan-handler's snap derivation are unchanged. The drop has always landed at the same snapped position the ghost paints; Phase 20.7 only changes where the *floating card* renders, bringing it into visual agreement with where the drop will land.

**Test coverage:** consumer-side smoke (manual). Repro: select 2+ techs in mini-cols (portrait or landscape), long-press an event, drag horizontally across lanes, observe the floating card. Pre-fix: card slides smoothly with finger but never aligns to lane gridlines — appears to straddle two lanes during the entire drag. Post-fix: card jumps lane-to-lane in discrete steps as the finger crosses lane boundaries, sitting squarely in the destination lane between transitions.

**Cleanup if reverted:** drop the `bodyBlockWidth` / `techCount` / `columnCount` / `scrollX` props from `DraggableEvent`'s destructure (and from the call site in `CalendarInner`'s overlay JSX), restore the single-line `translateX: panXAbs.value - (effectiveWidth * 2) / 3` in `draggingAnimatedStyle`, and remove the `bodyBlockWidth, techCount, columnCount` deps from the `useAnimatedStyle` deps array. The `resolveLaneDropPosition` worklet itself stays — `DropShadow` still uses it.

**Markers:** `// FORK Phase 20.7 (P3-FE-DRAG-GHOST follow-up, 2026-05-06)` on (1) the new prop block in `DraggableEvent`'s destructure, (2) the lane-snap branch inside `draggingAnimatedStyle`, and (3) the new prop block in the call site at the bottom of `CalendarInner`. No `.d.ts` / `.d.mts` change — `DraggableEvent` is internal and has no public type surface; the props it accepts are documented inline only.

---

**Phase 26 (2026-05-06): drop math lands the event AT the ghost overlay position, not under the finger.** Reverts Phase 20.7 (floating card X back to Phase 20.4 finger-following) and shifts the drop math instead. (Numbered 26 instead of 22 because Phase 22 was already taken by the 2026-04-24 EventBlock double-tap regression fix; Phase 23 / 24 / 25 are the PR-UX-2 move-chain props.) User clarification after Phase 20.7 shipped: *"OOOOOHHH I SEE WHAT'S HAPPENING NOW! There actually isn't anything wrong with it the way we thought, we've been fixing the wrong part. ... we've aligned the actual appointment card to the columns, rather than the drop zone ghost card! Yeah the user needs to see that drop zone shadow in the correct spot geometrically, BUT when the card is dropped, the actual appointment card populates where the drop shadow was. ... what needs to change is actually the drop spot from under the finger to up and left of the finger, exactly where the ghost card shadow is."*

The mental model the user wants:
- **Floating drag card** (Phase 20.4) — "what I'm holding". Tracks the finger with the up-and-left peek offset. Not lane-snapped.
- **Ghost overlay** (Phase 21.4, kept) — "this is where it'll land". Sits up-and-to-the-LEFT of the finger by `(W/2, H/2)` from the raw pan-snap point, painting halfway across two lanes (the corner-overlap pattern with the floating card).
- **Drop** — when the user releases, the LANDED event renders in the lane the ghost was sitting on, not the lane the finger was over. Without this shift the ghost is misleading: it points at one lane while the drop lands in the lane to its right.

Mechanism: in the pan `.onEnd` worklet, before computing `colIndex` / `xWithinColumn` / `finalEventTop`, shift the X by `-laneWidth/2` and the Y by an additional `-eventHeight/2` whenever we're in mini-cols 2+ tech mode (`isMultiDay && bodyResourceIds.length >= 2 && multiTechMode === "mini-columns"`). The shift is computed inline in the worklet using closure-captured `BODY_BLOCK_WIDTH`, `bodyResourceIds.length`, `multiTechMode`, and `isMultiDay` — same pattern Phase 21 (`DropShadow`) uses to read these in its animated style worklet. Outside mini-cols the shift is `0`, preserving single-tech / stacked / single-day drop behavior unchanged.

```js
// Phase 26 inside the pan onEnd worklet
var inMiniColsForDrop = isMultiDay && bodyResourceIds.length >= 2 && multiTechMode === "mini-columns";
var laneWidthForDrop = inMiniColsForDrop && BODY_BLOCK_WIDTH > 0
  ? BODY_BLOCK_WIDTH / bodyResourceIds.length
  : 0;
var dropShiftX = inMiniColsForDrop ? laneWidthForDrop / 2 : 0;
var dropShiftY = inMiniColsForDrop ? eventHeight.value / 2 : 0;

const finalEventTop = panYAbs.value - eventHeight.value / 2 - dropShiftY + scrollY.value;
// ... existing snap-to-grid math runs on the shifted finalEventTop ...
const finalXOnScreen = panXAbs.value - dropShiftX;
const absoluteX = finalXOnScreen + scrollX.value;
const newStaffIndex = Math.floor((absoluteX - TIME_LABEL_WIDTH) / BODY_BLOCK_WIDTH);
// ... colIndex / xWithinColumn fall out of the shifted absoluteX as before ...
```

Geometry summary post-Phase-26 (mini-cols 2+ tech):
- finger ≈ `(panX, panY)`
- card_TL ≈ `(panX - 2W/3, panY - 2H/3)` (Phase 20.4 — finger-following)
- ghost_TL ≈ `(snap_X - W/2, snap_Y - H/2)` (Phase 21.4 — corner-overlap, kept)
- drop_lane = lane that contains `(panX - W/2)` after snap-to-grid → lands in the lane the ghost was overlapping with most
- drop_time = snap-to-grid of `(panY - H/2 - eventHeight/2)` → lands at the time slot the ghost's top edge was indicating

**Why the lane shift is exactly `laneWidth/2` (not `laneWidth`):** the ghost paints centered on the snap line (left edge at `snap_X - W/2`, right edge at `snap_X + W/2`, center at `snap_X`). It overlaps the lane on each side of `snap_X` by exactly `W/2`. Shifting the resolution X by `-W/2` makes the snap-to-grid pick the lane to the LEFT of the original snap line — i.e., the lane the ghost's left half is in. That's the lane that visually reads as "where the ghost is sitting" because the ghost's bulk extends up-and-left of the finger. (If we did `-W`, the drop would land a full lane further left than the ghost — wrong direction. If we did `0`, no shift — the original behavior we're fixing.)

**Phase 20.7 reverted in this commit.** The bodyBlockWidth / techCount / columnCount / scrollX props were dropped from `DraggableEvent`'s destructure, the lane-snap branch inside `draggingAnimatedStyle` was removed, and the matching prop block was dropped from the call site. The `useAnimatedStyle` dep list went back to `[selectedEvent, APPOINTMENT_BLOCK_WIDTH, laneWidth]`. The Phase 20.7 entry above is annotated **"Reverted in Phase 26"** but kept in the log so the rationale chain (20.4 → 20.7 → 26) is legible to future agents — every phase between Phase 20.4 and Phase 26 was a wrong turn, and the markers tell the user feedback chain that drove each retraction.

**Robust-by-construction pieces from the wrong-turn phases were preserved:** Phase 20.5 (`[CAL:lane-overflow]` and extended `[CAL:mini-cols] lane geometry` logs) and Phase 20.6 (the `computeStackedEventLayout` width clamp) ARE genuinely correct independent fixes, so they stay. Phase 20.6 in particular still prevents committed cards from overflowing narrow lanes — that bug was real, just unrelated to the symptom the user was actually trying to report.

**Test coverage:** consumer-side smoke (manual). Repro: select 2+ techs in mini-cols (portrait or landscape), long-press an event, drag to a different time/lane, release. Pre-Phase-22: ghost paints up-and-left of finger but the dropped event lands at the lane/time UNDER the finger, not where the ghost was. Post-Phase-22: dropped event lands in the lane the ghost was sitting on and at the time slot the ghost's top edge was indicating, matching the user's "card populates where the drop shadow was" mental model. Outside mini-cols (single-tech, stacked, single-day) drop behavior is unchanged because `dropShiftX` / `dropShiftY` resolve to `0`.

**Open follow-up: snap-in animation.** User added: *"it would be cool if there was a little movement from the cards position before release to it's destination of the drop zone so it looks like it's dropping and snapping into place."* Not in this phase — currently the drop is instant (the existing `withSpring` on `panXAbs` / `panYAbs` animates the disappearing floating card to the snapped column center, but that's fast and not the "drop into the ghost slot" affordance the user described). A polish-stage iteration would have the floating card animate from its release position to the resolved drop position over ~150ms before being unmounted, ideally with a slight scale-down or opacity dip. Filed as `id: drag_snap_in_animation` in the agent task list.

**Cleanup if reverted:** drop the `var inMiniColsForDrop` / `laneWidthForDrop` / `dropShiftX` / `dropShiftY` block, restore `finalEventTop = panYAbs.value - eventHeight.value / 2 + scrollY.value`, restore `finalXOnScreen = panXAbs.value`, and remove the trailing comment in the `xWithinColumn` block referencing Phase 26. Phase 21.4 (ghost offset) and Phase 20.4 (card offset) both stay as the expected geometry. If the user changes their mind about the corner-overlap and wants the ghost at the un-shifted snap position, that's a Phase 21.4 revert — independent of this Phase 26 work.

**Markers:** `// FORK Phase 26 (P3-FE-DRAG-GHOST follow-up, 2026-05-06)` on (1) the doc-block above the shift computation in the pan `.onEnd` worklet, (2) the trailing note inside the `xWithinColumn` comment, and (3) inline in the `DraggableEvent.draggingAnimatedStyle` doc-block (mentioning that Phase 26 is what made the floating card a "what I'm holding" indicator vs a destination indicator). No `.d.ts` / `.d.mts` change — drop math is internal worklet logic, no public surface.

> **Update 2026-05-06: superseded by Phase 27.1 below.** Phase 26's drop-shift-by-`-laneWidth/2` and ghost-shift-by-`-W/2` (Phase 21.4) both moved the ghost's *center* to a sub-lane gridline — the user reported the ghost was "centering on the lines" between sub-lanes instead of in the middle of one. Phase 27.1 shifts both quantities to the full `laneWidth` so the ghost sits CENTERED inside the sub-lane to the LEFT of the finger's sub-lane, and re-introduces the floating-card lane-snap (which Phase 26 had reverted) so the card and ghost stay in fixed relative position during the drag. Read Phase 27.1 below; the Phase 26 narrative is preserved here so the (20.4 → 20.7 → 26 → 27.1) feedback chain stays legible.

---

**Phase 27.1 (2026-05-06): static-positioning between floating card and ghost overlay; ghost centers IN sub-lane (not on the line).** Follow-up to Phase 26 after the user smoke-tested it and reported that the ghost was still visually wrong. Two-part fix:

1. **Re-introduce floating-card lane-snap** (which Phase 26 had reverted). The card's `translateX` is once again derived from `resolveLaneDropPosition` — the same value `DropShadow` uses — so the card sits at the LEFT edge of the sub-lane the finger is in. Y still tracks the finger smoothly (Phase 20.4 vertical preserved). The four mini-cols inputs (`bodyBlockWidth`, `techCount`, `columnCount`, `scrollX`) are re-added to `DraggableEvent`'s destructure and to the call site in `CalendarInner`. Outside mini-cols 2+ tech the card falls back to the historical Phase 20.4 finger-following X (single-tech / stacked / single-day behavior unchanged).
2. **Ghost X shifts by full `pos.width`** (was `pos.width / 2`), so the ghost paints CENTERED inside the sub-lane to the LEFT of the finger's sub-lane (NOT straddling the gridline between two sub-lanes the way Phase 21.4 / 26 did). Y offset stays at `pos.height / 2` (Phase 21.4 vertical preserved).
3. **Drop math X-shift parallels the ghost shift**: the pan `.onEnd` worklet shifts the X used for `colIndex` / `xWithinColumn` resolution by `-laneWidth` (was `-laneWidth/2`), so the snap-to-grid lands the event in the same sub-lane the ghost was sitting in. Y shift unchanged (`-eventHeight/2`).

User clarification that drove this: *"the cards stay static in their positioning to each other while being dragged. You changed that, and made them move relative to each other based on where the cards moved, I did not want that, undo that back to when they were static relative to each other. I need the finger to not be the source of truth for where the card will land. I need the shadow to be the source of truth for where the card will land, and it must not center on the lines. ... when I say it needs to snap into a lane I mean the card DOES NOT do what you see in the screenshot. ... The cards don't end up over the lines, do they? No. They end up in the middle of a sub column. That's where the shadows should align to, NOT the lines, but between the lines."*

**Geometry summary after Phase 27.1 (mini-cols 2+ tech):**

```text
finger    ≈ (panX, panY)
card_TL   ≈ (snap_X, panY - 2H/3)             // X lane-snapped, Y finger-following (peeks above finger)
ghost_TL  ≈ (snap_X - W, snap_Y - H/2)        // sub-lane to the LEFT, time slot above by H/2
ΔX        = W (constant — one full sub-lane to the left)
drop_TL   ≈ ghost_TL                           // pan onEnd shifts X by -W → drop = ghost sub-lane
```

`snap_X` = left edge of finger's sub-lane (same value `resolveLaneDropPosition` returns). `snap_Y` = `eventStartedTop` snapped to grid. `W` = `BODY_BLOCK_WIDTH / techCount` = sub-lane width. `H` = `eventHeight`.

The card and ghost now jump in lockstep as the finger crosses sub-lane boundaries — both move only when `snap_X` changes, so their visual offset is CONSTANT (`ΔX = W`). The user can aim with the GHOST (which sits in the sub-lane the drop will land in) while the card peeks out to the right and below their fingertip.

Y still steps independently on the ghost (snapped to `snapInterval`) while the card tracks the finger smoothly — accepted trade-off; the user's hard requirement was X-axis static positioning + sub-lane centering, and "card under finger vertically" conflicts with strict Y-locking. The remaining vertical drift within a snap interval is small (~7px at default 15-min snap on 30px/hr).

**Why the X-shifts are exactly `laneWidth` (not `laneWidth/2`):** The user's mental model is that the ghost is centered IN a sub-lane (between two gridlines), not centered ON a gridline. With `pos.translateX` = left edge of finger's sub-lane:
- `translateX: pos.translateX` would put the ghost's *left edge* on the gridline → ghost spans the finger's sub-lane (= same as card → no visible offset).
- `translateX: pos.translateX - pos.width / 2` (Phase 21.4) puts the ghost's *center* on the gridline → ghost straddles two sub-lanes, visually reads as "on the line." This is what the user pushed back on.
- `translateX: pos.translateX - pos.width` (Phase 27.1) puts the ghost's *left edge* one full sub-lane to the LEFT → ghost spans the sub-lane to the left of the finger's sub-lane, centered between two gridlines. This is what the user wants.

The drop X-shift mirrors the ghost X-shift exactly so the snapped landing position resolves to the same sub-lane the ghost is centered in. (`-laneWidth/2` from Phase 26 would have resolved to the gridline between the two sub-lanes — same wrong-direction problem on the drop side.)

**Why Phase 27.1 supersedes Phase 26 instead of reverting it:** Phase 26's mechanism (shifting drop math to match ghost position) is correct; Phase 26's *value* (`-laneWidth/2`) was wrong because the ghost itself was wrong (Phase 21.4 centered on the line). Phase 27.1 fixes both the ghost and the drop shift in one coherent pass and restores the lane-snap on the floating card so card and ghost stay locked.

**Snap-in animation deferred to Phase 27.2.** User added: *"Make the card UNDER THE FINGER slide to where the ghost is WHEN RELEASED... NOT WHILE IT'S MOVING. ... So when released the shadow would technically not budge at all, no movement, it stays right when it is when released and the card slides over to the shadow to sit perfectly on top of it."* On release the floating card should animate from `(snap_X, panY - 2H/3)` to `(snap_X - W, snap_Y - H/2)` over ~150ms, then unmount as the landed card pops in at the ghost spot. This requires either (a) an additional SharedValue that overrides `snap_X` during the release window so the X can animate smoothly past the snap step-function, or (b) a temporary disable of the lane-snap branch while a `withTiming` plays out. Implementation isn't trivial; landing Phase 27.1 first lets the user smoke-test the alignment before we layer animation on top. Tracker: `id: drag_snap_in_animation` in the agent task list.

**Cleanup if reverted:** restore Phase 26's behavior by (1) changing the ghost `translateX` back from `pos.translateX - pos.width` to `pos.translateX - pos.width / 2`, (2) changing the pan-onEnd `dropShiftX` back from `laneWidthForDrop` to `laneWidthForDrop / 2`, (3) removing the lane-snap branch inside `DraggableEvent.draggingAnimatedStyle` and dropping the `bodyBlockWidth` / `techCount` / `columnCount` / `scrollX` props from the destructure, (4) dropping the matching props block from the `DraggableEvent` call site in `CalendarInner`, and (5) restoring the `useAnimatedStyle` dep list to `[selectedEvent, APPOINTMENT_BLOCK_WIDTH, laneWidth]`.

**Markers:** `// FORK Phase 27.1 (P3-FE-DRAG-GHOST follow-up, 2026-05-06)` on (1) the new lane-snap branch + dep-list inside `DraggableEvent.draggingAnimatedStyle`, (2) the new prop block in `DraggableEvent`'s destructure, (3) the new prop block in the `DraggableEvent` call site, (4) the doc-block above the ghost `translateX` shift in `DropShadow`'s animated style, and (5) the doc-block above the `dropShiftX` computation in the pan `.onEnd` worklet. No `.d.ts` / `.d.mts` change — these are all internal component / worklet edits, no public surface.

---

**Phase 27.2 (2026-05-06): slide-on-release animation — floating card animates from finger's sub-lane to ghost's sub-lane over 150ms before unmounting.** Polish follow-up to Phase 27.1. User asked for this in the same message that drove 27.1: *"Make the card UNDER THE FINGER slide to where the ghost is WHEN RELEASED... NOT WHILE IT'S MOVING. ... So when released the shadow would technically not budge at all, no movement, it stays right when it is when released and the card slides over to the shadow to sit perfectly on top of it."* Held back from 27.1 so the alignment fix could land first; now implemented on top of confirmed-working geometry.

**Mechanism.** Three new SharedValues declared in `CalendarInner` (NOT in `CalendarBindingProvider` — they don't need to escape the calendar):

- `dragReleasing` (boolean) — `true` while the snap-in animation is playing.
- `releaseTargetX`, `releaseTargetY` (numbers) — the smoothly-animated transform values driving the floating card during the release window.

These are wired to `DraggableEvent` as props. `draggingAnimatedStyle` gets a new branch at the top: if `dragReleasing.value === true`, return transform `{ translateY: releaseTargetY.value, translateX: releaseTargetX.value }`. Otherwise the existing Phase 27.1 lane-snap / Phase 20.4 finger-following branch runs. The bypass is necessary because both `snap_X` (a step function over `panXAbs`) and `snap_Y` (rounded to `snapInterval`) jump-cut, not interpolate — without an override SV, `withTiming(panXAbs.value, ...)` would just teleport the card.

**Sequencing in pan onEnd.** After computing `adjustedFinalEventTop`, `colIndex`, and `xWithinColumn` (Phase 27.1's drop-math), but BEFORE flipping `isDragging.value`:

1. Re-call `resolveLaneDropPosition(panXAbs.value, ...)` to get the floating card's CURRENT visual X (= `pos.translateX`, screen-relative). Reusing `resolveLaneDropPosition` keeps source / target geometry aligned with what the floating card was just rendering before release.
2. Compute source `(pos.translateX, panYAbs.value - 2H/3)` — exactly where the floating card is on screen right now.
3. Compute target `(pos.translateX - laneWidth, adjustedFinalEventTop - scrollY.value)` — exactly where the LANDED card will paint after `finalizeDrag` runs. Y derivation: `adjustedFinalEventTop = snap(panY - H/2 - H/2 + scrollY) = snap(panY - H + scrollY)`, and `snap(panY - H/2) - H/2 = snap(panY - H)` when `H` is a multiple of `snapInterval` (always true — `eventHeight` is constrained to multiples of `snapInterval`), so `ghost_TL_screen_Y == landed_TL_screen_Y`. X derivation: by Phase 27.1's drop-shift math, `landed_TL_screen_X == pos.translateX - laneWidth` regardless of whether the unshifted X was at lane 0 (column-boundary case) or any other lane. So target = ghost = landed-card position, pixel-perfect.
4. Set `releaseTargetX/Y` to source.
5. Flip `dragReleasing.value = true`.
6. Animate `releaseTargetX/Y` to target via `withTiming(150ms)`.
7. In the `releaseTargetY` `withTiming` completion callback, IF `dragReleasing.value === true` (still in the release window — see race-fix below), flip both `dragReleasing` and `isDragging` back to false. Floating card unmounts.

The synchronous `scheduleOnRN(finalizeDrag, ...)` still fires immediately after the worklet returns — so the LANDED card renders during the 150ms animation, at the same screen coordinate the floating card is sliding to. Both occupy the same pixels for the duration; visually the user perceives a single coherent slide that "lands" into a stationary card. No double-render flicker because the positions match exactly.

Outside mini-cols 2+ tech (`!inMiniColsForDrop`), `snapInPos` is `null` (resolveLaneDropPosition early-returns when `techCount < 2`), the snap-in branch is skipped, and `isDragging.value = false` flips synchronously as before. Single-tech / stacked / single-day drag/drop behavior unchanged.

**Race fix on the timing callback.** The 150ms window is shorter than the 300ms long-press threshold required to start a new drag, so a user physically cannot start a fresh drag during the animation. But if anything else flips `isDragging.value = true` mid-animation (defensive — none currently does), the orphan callback firing 150ms later would set `isDragging.value = false` and kill the new drag. Two layers of protection:

1. **Pickup-side reset.** The pan `onUpdate` worklet (where `isDragging.value = true` is set after the first drag-threshold cross) now sets `dragReleasing.value = false` immediately after the `isDragging` flip. Any orphan animation callback fires later and sees `dragReleasing.value === false` (because the new drag reset it).
2. **Callback-side guard.** The completion callback runs `if (dragReleasing.value === true) { ... }`. If a new drag stamped `dragReleasing.value = false`, the orphan skips the `isDragging` flip entirely.

Both layers converge on the same invariant: the timing callback is the ONLY code path that can flip `isDragging.value` from true to false in the snap-in branch, AND it only does so if the release-window is still active.

**Why the SharedValues live in `CalendarInner`, not `CalendarBindingProvider`.** Phase 27.1's lane-snap inputs (`bodyBlockWidth`, `techCount`, etc.) are passed to `DraggableEvent` as props rather than via the drag-binding context. The release-animation SVs follow the same pattern — they're internal to the calendar's gesture pipeline and have no consumer-side surface. Adding them to `CalendarBindingProvider` would mean every consumer outside the calendar (the one consumer today is `RoutingDevView`) would need to be aware of them too, for no reason. Keeping them local minimises the diff.

**Geometry summary after Phase 27.2 (mini-cols 2+ tech, release window):**

```text
t = 0          (release fires)
  card_TL    = (snap_X, panY - 2H/3)              // where card was visually
  ghost_TL   = (snap_X - W, snap_Y - H/2)         // where ghost was visually
  landed_TL  = (snap_X - W, snap_Y - H/2)         // pops in synchronously, SAME as ghost
  releaseTargetX/Y = card_TL                       // snap-in starts here

t in (0, 150ms]
  releaseTargetX → snap_X - W                     // withTiming, 150ms
  releaseTargetY → snap_Y - H/2                   // withTiming, 150ms
  card visually slides over the now-stationary landed card

t = 150ms      (timing callback)
  if (dragReleasing.value === true):              // race guard
    dragReleasing.value = false
    isDragging.value = false                      // floating card unmounts
  → only landed card remains, in ghost's sub-lane
```

**Cleanup if reverted:** drop the three SV declarations in `CalendarInner` (`dragReleasing`, `releaseTargetX`, `releaseTargetY`), drop the matching three props from `DraggableEvent`'s destructure, drop the matching three props from the `DraggableEvent` call site in the overlay JSX, drop the `if (dragReleasing && dragReleasing.value === true) { ... }` branch at the top of `draggingAnimatedStyle`, drop the `var snapInPos = ...` block + `if (snapInPos) { ... } else { isDragging.value = false; }` in the pan onEnd worklet (restoring the old single line `isDragging.value = false`), and drop the `dragReleasing.value = false` safety reset in the pan onUpdate worklet. Phase 27.1's geometry stays intact independently.

**Markers:** `// FORK Phase 27.2 (P3-FE-DRAG-GHOST follow-up, 2026-05-06)` on (1) the SV declarations + doc-block in `CalendarInner`, (2) the new prop block in `DraggableEvent`'s destructure, (3) the new prop block in the `DraggableEvent` call site, (4) the `dragReleasing` branch at the top of `draggingAnimatedStyle`, (5) the `var snapInPos` + animation block in the pan `.onEnd` worklet, and (6) the safety-reset `dragReleasing.value = false` in the pan `.onUpdate` worklet. No `.d.ts` / `.d.mts` change — internal animation plumbing, no public surface.

---

**Phase 27.3 (2026-05-06): release-animation polish — width preservation, ghost color, single-day regression fix, and stale-spring suppression.** Smoke-test follow-up to Phase 27.2 that fixes four distinct bugs the user reported in the same message. Each is independently scoped but they ship together because they all touch the same `pan onEnd` / `DraggableEvent` / `DropShadow` neighborhood and unrelated polish would obscure the ones that matter.

**Bug A — ghost color now matches the destination tech, not the finger's tech.** Pre-27.3, `DropShadow.animatedStyle` computed `tint = techColors[pos.laneIndex]`. But Phase 27.1 shifted the ghost one full sub-lane to the LEFT of `pos.translateX`, so `pos.laneIndex` is the FINGER's sub-lane index, not the ghost's. The user reported: *"the colors of the shadows do not match the column card colors, which they should, regardless of the card color that was picked up. The shadow should change based on the column."* Fix: `const ghostLaneIndex = ((pos.laneIndex - 1) % techCount + techCount) % techCount; tint = techColors[ghostLaneIndex]`. The double-modulo handles the column-boundary wraparound: when the finger sits in column N's lane 0, the visual sub-lane to the left is column N-1's lane (`techCount - 1`), and `(0 - 1 + techCount) % techCount = techCount - 1` ✓. The grabbed (floating) card keeps its original color since its tint comes from the source EventBlock's `getResourceColor`, which is unaffected.

**Bug B — floating card no longer resizes to full BODY_BLOCK_WIDTH mid-animation.** Pre-27.3, `dragCardPickupWidth.value = 0` fired at the TOP of `pan.onEnd`, *before* the Phase 27.2 snap-in `withTiming` animation kicked off. During the 150ms slide, `DraggableEvent.dynamicStyle` computed `effectiveWidth = pickup > 0 ? pickup : (laneWidth || APPOINTMENT_BLOCK_WIDTH)` and fell through to `APPOINTMENT_BLOCK_WIDTH` (= full `BODY_BLOCK_WIDTH`, the card-with-all-techs width), causing the card to widen from one sub-lane (~60px in a 3-tech mini-cols layout) to full column (~239px) on release. User report: *"Upon release it moves a tiny bit towards the shadow, then resizes to full width (as big as a column can get)."* Fix: split the reset into per-exit-path resets so each branch can choose its own timing:
- No-drag-real-event-cancel exit (line ~3111): synchronous reset, then return.
- No-drag-draft-finalize exit (line ~3120): synchronous reset, then `finalizeDrag`.
- No-drag-no-selected-event exit (line ~3123): synchronous reset, then return.
- Drag-end mini-cols branch: deferred to inside the `releaseTargetY` `withTiming` callback, after `dragReleasing.value = false` and `isDragging.value = false`. This is the load-bearing change for the bug.
- Drag-end non-mini-cols branch (no animation): synchronous reset, then `isDragging.value = false`. The card unmounts immediately so the width fall-back to `APPOINTMENT_BLOCK_WIDTH` is invisible.

The deferred-reset doesn't leak: the next drag-init in `internalOnDoubleTap.current` unconditionally re-sets `dragCardPickupWidth.value = pickupVisualWidthRef.current`, so the OLD pickup value getting overwritten there has the same effect as resetting to 0.

**Bug C — single-day mode (each tech is its own column) no longer "barely moves".** Pre-27.3, the Phase 27.1 lane-snap branch in `DraggableEvent.draggingAnimatedStyle` fired whenever `bodyBlockWidth > 0 && techCount >= 2 && columnCount >= 1 && scrollX`. In single-day portrait mode each tech occupies its own column (NOT a sub-lane within a column), so `BODY_BLOCK_WIDTH = (screenWidth - 50) / techCount` is the per-TECH width and `resolveLaneDropPosition` was computing nonsensical sub-lane positions all clamped within column 0. The card jumped to one of N positions all clustered in tech-1's column instead of following the finger across techs. User report: *"the day calendar with the technician avatars that can be moved, multiselected, etc in portrait mode is messed up and barely move. But the week calendar that is 1 tech at a time multi days, works fine still."* Fix: gate the lane-snap branch by passing `bodyBlockWidth: 0` from the call site when NOT in mini-cols mode, so the `bodyBlockWidth > 0` guard in `draggingAnimatedStyle` short-circuits to the Phase 20.4 finger-following X. The condition is `(multiTechMode === "mini-columns" && isMultiDay && bodyResourceIds.length >= 2) ? BODY_BLOCK_WIDTH : 0`. Same gating semantics as `inMiniColsForDrop` in the pan `.onEnd` worklet, so the floating-card lane-snap and the drop-math lane-shift now agree on which mode they apply to.

**Bug D — legacy panXAbs / panYAbs / eventStartedTop "settle to column" springs suppressed in mini-cols mode.** Pre-27.3, the Phase 13 `panXAbs.value = withSpring(finalPanXValue)` (= column center) and matching panYAbs / eventStartedTop writes ran on every drop. In mini-cols mode this caused two visible regressions during the Phase 27.2 snap-in animation: (1) `DropShadow` reads `panXAbs.value` every frame, so the GHOST drifted from the destination sub-lane to the column center over ~300ms; (2) when the snap-in `withTiming` callback flipped `dragReleasing.value = false` at t=150ms, the floating card's `draggingAnimatedStyle` fell through to the lane-snap branch, read the still-springing `panXAbs.value` (now near column center), and the card teleported one column-width to the left for ~1 frame before `selectedEvent` cleared and the card unmounted. User report (combined with Bug B): *"...moves up and away from the shadow then teleports to the left about one column width adjacent to the destination left edge or directly above the destination, then disappears for a second and then snaps into place, and sometimes goes all the way back to its original spot."* Fix: wrap the spring + eventStartedTop writes in `if (!inMiniColsForDrop) { ... }`. In mini-cols mode none of those three writes fire — the snap-in animation is the only motion the user perceives, and the next drag-init unconditionally re-sets all three SVs so leaving stale values has no carry-over effect. Outside mini-cols (single-tech / single-day / stacked) the springs preserve the historical "settle on drop" feel — there's no ghost in those modes, so the spring-driven panX/Y motion is the visual feedback the user expects.

A companion change captures `releasePanXAbs = panXAbs.value` and `releasePanYAbs = panYAbs.value` into local `const`s at the top of the post-noDrag block. Currently equivalent to reading the SVs directly at the snap-in source-computation site (since the mini-cols branch no longer mutates them), but the named constants document intent ("source of slide = where the card was at release") and protect future refactors that might decide to mutate panXAbs/panYAbs between capture and read.

**Belt-and-suspenders pickup safety reset.** Phase 27.2 added a safety reset `dragReleasing.value = false` in `pan.onUpdate` to handle the rare case where a NEW drag begins inside the prior drag's 150ms release window. Phase 27.3 adds a second reset at drag-init in `internalOnDoubleTap.current` (right after `dragCardPickupWidth.value = pickupVisualWidthRef.current`). The `pan.onUpdate` reset only fires after the user starts moving the finger, leaving a 1-frame window where the freshly-mounted DraggableEvent could read stale `releaseTargetX/Y` values. The drag-init reset closes that window — the new card mounts with `dragReleasing.value = false`, falls into the lane-snap branch, and never sees the prior drag's target coordinates.

**Cleanup if reverted:** revert each bug independently (they're orthogonal). For Bug A, change `tint = techColors[ghostLaneIndex]` back to `tint = techColors[pos.laneIndex]` and drop the ghostLaneIndex line. For Bug B, restore `dragCardPickupWidth.value = 0` at the top of `pan.onEnd` and drop the per-exit and per-branch resets. For Bug C, change the call-site `bodyBlockWidth:` prop back to a bare `BODY_BLOCK_WIDTH`. For Bug D, drop the `if (!inMiniColsForDrop)` wrapper and let the springs run unconditionally; also drop the `releasePanXAbs / releasePanYAbs` capture and inline `panXAbs.value` / `panYAbs.value` reads at the snap-in source-computation site. For the pickup safety reset, drop the `dragReleasing.value = false` line in `internalOnDoubleTap.current`.

**Markers:** `// FORK Phase 27.3 (P3-FE-DRAG-GHOST follow-up, 2026-05-06)` on (A) the ghost-color computation in `DropShadow.animatedStyle`, (B1) the per-exit-path `dragCardPickupWidth.value = 0` resets in `pan.onEnd` (3 sites), (B2) the deferred reset inside the `releaseTargetY` `withTiming` callback, (B3) the synchronous reset in the non-mini-cols `else` branch, (C) the gated `bodyBlockWidth:` prop at the `DraggableEvent` call site, (D1) the `releasePanXAbs / releasePanYAbs` capture, (D2) the `if (!inMiniColsForDrop) { ... }` wrapper around the legacy springs, (D3) the `releasePanXAbs` arg to `resolveLaneDropPosition` in the snap-in source computation, (D4) the `releasePanYAbs - 2H/3` in the `sourceY` line, and the pickup-safety `dragReleasing.value = false` in `internalOnDoubleTap.current`. Also a wording fix in the Phase 27.2 onUpdate safety-reset comment ("long-press" → "double-tap") since the actual gesture is double-tap-to-drag, not long-press.

---

**Phase 27.4 (2026-05-06): defer finalizeDrag until snap-in animation completes; add diagnostic logs.** Smoke-test follow-up to Phase 27.3 after the user reported the slide animation was *"still about the same. Perhaps more"* despite Bugs A/C being confirmed fixed. Root cause of the residual chaos: **the floating card unmounts within ~50ms of release**, way before the 150ms snap-in animation completes, because the consumer's `useDraggedEventDraftSubscription` (in `src/components/calendar/resource-calendar-day-view.tsx`) reacts to `setDraggedEventDraft` by *immediately* calling `setSelectedEvent(null)`. The unmount cascade:

1. `pan.onEnd` worklet fires → `dragReleasing.value = true`, `withTiming` starts, `scheduleOnRN(finalizeDrag, ...)` queues for JS thread.
2. JS thread runs `finalizeDrag` → calls `setDraggedEventDraft({...})` → React state updates.
3. Subscription `useEffect` fires → `setDraft(null)`, **`setSelectedEvent(null)`**, `onDragEnd(draft)`.
4. `selectedEvent` is now null → `useEffect` at line 2712 fires → `setDragReady(false)`.
5. `DraggableEvent` render condition `selectedEvent && dragReady` evaluates false → **floating card unmounts** at ~50ms post-release.
6. Optimistic update from `onDragEnd` handler fires → moved `EventBlock` renders at the destination → **landed card pops in** at the new position.

What the user sees during this 50ms window: a few frames of slide animation (the card moved a tiny bit toward the ghost), then the floating card vanishes (`draggingAnimatedStyle` early-returns `opacity: 0` when `selectedEvent` is null), then a brief gap, then the optimistically-rendered moved card appears at the destination. Matches the user's description verbatim: *"moves a tiny bit towards the shadow, then resizes to full width...moves up and away from the shadow then teleports to the left...then disappears for a second and then snaps into place, and sometimes goes all the way back to its original spot."* The "resizes to full width" piece was Bug B (Phase 27.3), the "teleports left" piece was Bug D (Phase 27.3), but the "disappears for a second and snaps into place" piece was the unmount-cascade described above — never addressed by 27.1/27.2/27.3 because they all assumed the card stayed mounted for the full 150ms.

**Fix:** in mini-cols mode only, schedule `finalizeDrag` from *inside* the snap-in `withTiming` callback (after `dragReleasing.value = false` and `isDragging.value = false` flip). The 150ms slide plays out cleanly, then the data flow kicks in (consumer's `setSelectedEvent(null)` → unmount → optimistic render of moved card at destination). Outside mini-cols (single-tech / single-day / stacked) the call stays synchronous because there's no animation to protect.

**Trade-off — the consumer's `onDragEnd` now fires 150ms later than before in mini-cols mode.** This means the network commit / optimistic update / toast all fire 150ms later. Acceptable because:
- The user perceives the slide as the appointment "settling" before the network commit — that's actually a desirable UX cue.
- 150ms is below the 250ms threshold above which delays start to feel sluggish.
- All other modes (single-tech / single-day / stacked) are unchanged.

**Known edge case — drop-data lost on rapid re-pickup.** If the user double-taps a NEW event AND starts moving their finger faster than 150ms after releasing the prior drop, the prior drop's `finalizeDrag` is *skipped* because the `if (dragReleasing.value === true)` guard in the snap-in callback evaluates false (the safety reset in `pan.onUpdate` already flipped `dragReleasing` to false to claim the new drag). The prior drop's data is lost — the moved appointment never commits. In practice this requires sub-150ms gesture choreography that's basically impossible by accident; if it becomes a real complaint, the fix is to store the pending `finalizeDrag` args in dedicated SVs and fire them synchronously from the safety reset.

**Diagnostic logs added.** The user requested *"different logs might be useful"* because the existing log stream was drowning in `[Cleanup:KnownSessions] narrowed union` from a per-render-fire log in `src/hooks/calendar/use-known-reorganization-session-ids.ts` (gated to a per-instance signature dedupe in this same patch). Three new `gestureLog` namespaces now fire from the snap-in path:

- `[CAL:gesture] snap-in:start { sourceX, sourceY, targetX, targetY, deltaX, deltaY, pickupWidth, laneWidthForDrop }` — fires when the snap-in `withTiming` is queued. Confirms the animation kicked off and lets us verify source/target are sensible.
- `[CAL:gesture] snap-in:end { finished, didCleanup, dragReleasing, isDragging }` — fires when the `withTiming` callback runs. `finished === false` would indicate Reanimated cancelled the animation (e.g. competing `withTiming` write). `didCleanup === false` indicates the new-drag-interruption edge case fired.
- `[CAL:gesture] snap-in:skip { inMiniColsForDrop, techCount, isMultiDay, multiTechMode }` — fires from the `else` branch when no animation runs. Distinguishes "non-mini-cols path taken" from "snap-in didn't fire for some other reason".

Together with the existing `pan:dragStart`, `pan:end:finalize`, `selecting event for drag`, `dragReady=true`, and `[CAL:mini-cols] lane geometry` lines, a single drag-and-release should now produce a compact, narratively-readable log sequence even with the consumer's stream noise filtered out.

**Cleanup if reverted:** drop the `scheduleOnRN(gestureLog, "snap-in:start", ...)` block and the `scheduleOnRN(gestureLog, "snap-in:end", ...)` line; restore the `scheduleOnRN(gestureLog, "pan:end:finalize", ...)` + `scheduleOnRN(finalizeDrag, ...)` calls to the bottom of `pan.onEnd` (synchronous in both branches); drop the `scheduleOnRN(gestureLog, "snap-in:skip", ...)` line in the non-mini-cols `else`; revert the `useRef`-based dedupe in `src/hooks/calendar/use-known-reorganization-session-ids.ts` to the original per-render `console.log`.

**Markers:** `// FORK Phase 27.4 (P3-FE-DRAG-GHOST diagnosis, 2026-05-06)` on (1) the `snap-in:start` log block in `pan.onEnd` mini-cols branch, (2) the `snap-in:end` log + the deferred `pan:end:finalize` + `finalizeDrag` schedules INSIDE the `withTiming` callback, (3) the `snap-in:skip` log + the synchronous `pan:end:finalize` + `finalizeDrag` schedules in the non-mini-cols `else` branch, and (4) the "KNOWN EDGE CASE" callout in the `pan.onUpdate` safety-reset comment block. App-side: a doc-block above the `lastSignatureRef` declaration in `use-known-reorganization-session-ids.ts` explains the per-instance dedupe.

---

**Phase 27.5 (2026-05-06): hold `dragReleasing` true through unmount to prevent post-animation snap-back.** Smoke-test follow-up to Phase 27.4 after the user reported *"Still seeing the same sort of janky animation"* despite the deferred `finalizeDrag` landing. Diagnostic logs from Phase 27.4 (`snap-in:start` / `snap-in:end`) confirmed the slide ran cleanly source→target, but a frame after `snap-in:end` the card snapped BACK to `sourceY`. Cause: the original `withTiming` completion callback flipped `dragReleasing.value = false`, which made `DraggableEvent.draggingAnimatedStyle` re-evaluate and fall through to the lane-snap branch, which read `panYAbs.value` — and Phase 27.3's mini-cols path no longer mutates `panYAbs`, so it still held the release-time finger Y (= our `sourceY`). Net visual: card slid up by 26.7px, then jumped 26.7px back down, then unmounted.

**Fix:** delete the `dragReleasing.value = false` line from the snap-in `withTiming` completion callback. The card now holds its `releaseTargetX/Y` position frozen at the destination until React unmounts it via the consumer's `setSelectedEvent(null)` cascade. When `selectedEvent` flips to null the worklet's early-return drops opacity to 0 (transform: 0,0) — invisible — and the optimistic update renders the moved EventBlock at the destination. Net visual: clean slide → invisible unmount → moved card pops in at destination.

**Why leaving `dragReleasing` true is safe between drags.** The Phase 27.3 belt-and-suspenders pickup safety reset (`internalOnDoubleTap.current` writes `dragReleasing.value = false` on every new pickup) plus the Phase 27.2 onUpdate reset both fire at drag-init, so the new card always mounts with `dragReleasing` false. Leaving the prior value lingering between drags has no carry-over effect.

**Cleanup if reverted:** restore the `dragReleasing.value = false` line at the top of the `if (dragReleasing.value === true)` block in the snap-in `withTiming` completion callback.

**Markers:** `// FORK Phase 27.5 (P3-FE-DRAG-GHOST diagnosis, 2026-05-06)` on the doc-block explaining the deliberate omission inside the snap-in `withTiming` completion callback (right above the `isDragging.value = false` line).

---

**Phase 27.6 (2026-05-06): hold `dragCardPickupWidth` through unmount to prevent post-animation card resize.** Smoke-test follow-up to Phase 27.5 after the user reported (still!) *"Still seeing the same sort of janky animation"* and answered the diagnosis question with "Card visibly resizes (gets bigger or smaller) during the slide" + freeform "disappears, reappears, resizes, jumps/snaps around". Phase 27.4's `snap-in:start` / `snap-in:end` logs confirmed the slide ran cleanly with `finished: true, didCleanup: true, dragReleasing: true` (Phase 27.5 holding correctly). The residual jank was the floating card visibly EXPANDING from sub-lane width (~60px in a 3-tech mini-cols layout) to full column width (~239px) for one or more frames between `snap-in:end` and the consumer-side unmount.

**Cause.** Phase 27.3 Bug B's "deferred reset" left `dragCardPickupWidth.value = 0` firing inside the `withTiming` completion callback (right after `isDragging.value = false`, before `scheduleOnRN(finalizeDrag, ...)`). At t=150ms (animation complete) the worklet ran:

```js
isDragging.value = false;
dragCardPickupWidth.value = 0;  // <-- resets width SV → dynamicStyle recomputes
scheduleOnRN(gestureLog, "pan:end:finalize", colIndex);
scheduleOnRN(finalizeDrag, ...);
```

`DraggableEvent.dynamicStyle` reads `pickup = dragCardPickupWidth.value`. With pickup=0 it falls back to `(laneWidth || APPOINTMENT_BLOCK_WIDTH)` — and in mini-cols mode `laneWidth` is the FULL column width (one tech's worth × techCount), not the sub-lane width the pickup originally captured. So the moment `dragCardPickupWidth.value = 0` ran, the card's `width` style recomputed from sub-lane (~60px) to full column (~239px). For the few frames between the worklet write and `setSelectedEvent(null)` propagating from the consumer's `useDraggedEventDraftSubscription`, the user saw the card expand at the destination position before unmounting. Phase 27.3 narrowly fixed the pre-animation resize (Bug B) but not the post-animation resize that's structurally the same race.

**Fix.** Delete the post-animation reset entirely. Verified there are no other readers of `dragCardPickupWidth` while `selectedEvent` is null (the floating card's `dynamicStyle` only renders when `selectedEvent` is non-null because `draggingAnimatedStyle` early-returns `opacity: 0, transform: [0,0]` otherwise — the View doesn't reflow). On the very next pickup, `internalOnDoubleTap.current` writes `dragCardPickupWidth.value = pickupVisualWidthRef.current` (line 3663), so the stale value never leaks into a future drag.

**Why the non-mini-cols branch keeps its synchronous reset.** In single-tech-per-column views (day calendar with multiple techs side-by-side, single-day single-tech, stacked) the pickup width == column width == laneWidth, so the reset is a visual no-op. Touching that path risks regressing the day-calendar drag the user just confirmed working in Phase 27.3's Bug C. Keep it as-is.

**Cleanup if reverted:** restore the `dragCardPickupWidth.value = 0;` line inside the snap-in `withTiming` completion callback (after `isDragging.value = false`, before the `scheduleOnRN` calls).

**Markers:** `// FORK Phase 27.6 (P3-FE-DRAG-GHOST diagnosis, 2026-05-06)` on the doc-block explaining the deliberate omission, replacing the prior Phase 27.3 "reset pickup width AFTER the snap-in animation completes" comment.

---

**Phase 28.1 (2026-05-06): X-edge attenuation so the rightmost (and leftmost) sub-lane is reachable.** User report: *"I can't move the card far enough to the right for it to register on the subcolumns of the rightmost column in landscape mode."* Cause: Phase 27.1 hard-shifts the ghost one full `laneWidth` to the LEFT of the finger's sub-lane (so the user perceives the ghost as the destination indicator, with constant ΔX between card and ghost). When the finger reaches the rightmost sub-lane of the rightmost column, the ghost paints one lane LEFT of that — meaning to put the ghost in the rightmost sub-lane the finger would have to extend past the right edge of the canvas. Same problem on the left edge but less obvious (the leftmost lane was unreachable too — the ghost rendered off-canvas to the left).

**Approach (user-driven):** *"there has to be something that could measure the space left towards the border, and move the dropzone marker BACK under the users finger."* Linear attenuation: in the middle of the canvas the ghost sits one `laneWidth` left of finger (Phase 27.1 unchanged); within one `laneWidth` of either X edge, the ghost-shift attenuates linearly to 0 — at the canvas edge the ghost sits IN the finger's sub-lane (= drop in finger's lane = rightmost/leftmost reachable). The card stays at the finger's sub-lane in all cases, so the constant-ΔX-from-card invariant is relaxed only at the X edges where it has to be.

**Mechanism.**
1. New worklet helper `computeXEdgeAttenuation({ panXAbs, timeLabelWidth, bodyBlockWidth, columnCount, laneWidth })` returns a factor in [0, 1] proportional to `min(distFromLeftEdge, distFromRightEdge) / laneWidth`, clamped.
2. `resolveLaneDropPosition` computes the factor and returns three new fields: `ghostShiftX` (= `-laneWidth * attenuation`, in [-laneWidth, 0]), `ghostColIndex`, `ghostLaneIndex` (the column and sub-lane the ghost's CENTER lands in after attenuation — collapses to `(laneIndex - 1) mod techCount` in the middle of the canvas, equals `laneIndex` at the X edges).
3. `DropShadow` uses `pos.translateX + pos.ghostShiftX` for `transform.translateX` (replacing the hard `- pos.width`) and `techColors[pos.ghostLaneIndex]` for tint (replacing the consumer-side `((pos.laneIndex - 1) % techCount + techCount) % techCount` formula that hard-coded the one-lane-left assumption).
4. The `pan onEnd` drop math computes the same attenuation factor and uses `dropShiftX = laneWidthForDrop * dropAttenuation` (replacing the hard `dropShiftX = laneWidthForDrop`). Drop follows the ghost — required by the existing user invariant *"the shadow [must be] the source of truth for where the card will land"*.
5. The Phase 27.2 snap-in animation target `targetX` uses `snapInPos.translateX + snapInPos.ghostShiftX` (replacing the hard `- laneWidthForDrop`). The card slides to wherever the ghost was at release, which now equals where the drop will land.
6. The `snap-in:start` log now includes `ghostShiftX` and `dropShiftX` so device smoke can verify the attenuation fires (expect `ghostShiftX == -laneWidthForDrop` in the middle, attenuating to 0 within one laneWidth of either X edge; `dropShiftX` mirrors the magnitude positively).

**Behavioral change vs. Phase 27.1.**
- Middle of canvas: identical (attenuation = 1, all shifts = `±laneWidth` as before).
- Within one `laneWidth` of right edge: ghost slides smoothly toward finger; rightmost sub-lane finally addressable as a drop target. Card position unchanged.
- Within one `laneWidth` of left edge: same behavior on the left (was a latent bug — the ghost was rendering OFF-canvas left of column 0 lane 0, so the leftmost sub-lane was effectively unreachable too; this phase quietly fixes it as a side effect of the symmetric formula).
- Single-tech / stacked / single-day: unchanged (resolver returns null below `techCount >= 2`).

**Y axis (top/bottom edges) NOT included.** User asked for symmetric "all four edges" attenuation. Y is deferred to a separate Phase 28.2 because the body scrolls vertically — "off-screen" depends on scroll position and viewport height, not just content bounds, which means a new SharedValue for viewport height (and possibly max-scroll) needs to thread into the worklet. Want to verify the X model works on-device first before committing to the more involved Y plumbing. Documented in the doc-block on `resolveLaneDropPosition`.

**Cleanup if reverted:**
- `resolveLaneDropPosition`: drop the `xAttenuation`, `ghostShiftX`, `ghostXAbs`, `rawGhostColIndex`, `ghostColIndex`, `ghostXWithinColumn`, `rawGhostLaneIndex`, `ghostLaneIndex` lines and remove the three new return fields.
- `DropShadow`: restore `translateX: pos.translateX - pos.width` and `const ghostLaneIndex = ((pos.laneIndex - 1) % techCount + techCount) % techCount; const tint = techColors[ghostLaneIndex] || ...` (currently `const tint = techColors[pos.ghostLaneIndex] || ...`).
- `pan onEnd` drop math: restore `var dropShiftX = inMiniColsForDrop ? laneWidthForDrop : 0;`.
- Snap-in target: restore `var targetX = snapInPos.translateX - laneWidthForDrop;`.
- Snap-in log: drop the `ghostShiftX` and `dropShiftX` fields.
- Helper: remove `computeXEdgeAttenuation` (only ref'd from the resolver and the drop math).

**Markers:** `// FORK Phase 28.1 (P3-FE-DRAG-GHOST follow-up, 2026-05-06)` on (a) the helper definition, (b) the resolver's new doc-block + computation, (c) the DropShadow tint comment + the `transform.translateX` line, (d) the drop math `dropShiftX` doc-block, (e) the snap-in `targetX` doc-block, (f) the snap-in log additions.

---

**Phase 28.2-logging (2026-05-06): per-instance `calendarId` prop on every `[CAL:*]` log line.** Author tooling — no behavior change. The REMITechnician app mounts three vendored `<Calendar>` instances (portrait day, portrait week-of-one-tech, landscape workweek mini-cols) and the user explicitly asked to stop having to tell the agent which calendar a given log line came from. The fix is mechanical: thread an opaque `calendarId?: string` prop through the public surface, mix it into every `console.log("[CAL:...]")` site as a `[CAL:${calendarId}:${subtag}]` prefix, and fall back to today's bare `[CAL:${subtag}]` when the prop is absent so any code that hasn't been updated keeps its current behavior.

**Mechanism.**

1. New `calendarId?: string` prop on `CalendarProps` (added to both `dist/index.d.ts` and `dist/index.d.mts`). Documented as dev-tool plumbing only — production bundles strip the logs at the `__DEV__` gate so the prop has zero runtime cost in release builds.
2. New `logCal(subtag, ...args)` `useCallback` inside `CalendarInner` that emits `[CAL:${calendarId}:${subtag}]` when the prop is set and `[CAL:${subtag}]` otherwise. Memoized on `[calendarId]` so changing the prop (rare) re-creates the helper but stable across normal re-renders.
3. The existing `gestureLog` callback gets the same treatment via a parallel `[CAL:gesture]` / `[CAL:${calendarId}:gesture]` switch — kept as its own callback so every `scheduleOnRN(gestureLog, ...)` worklet site keeps working without a signature change.
4. Every direct `console.log("[CAL:...]")` site inside `CalendarInner` is rewritten to call `logCal(subtag, ...)`. Sites covered: `[CAL:gesture] selectedEvent changed`, `[CAL:gesture] finalizeDrag`, `[CAL:gesture] longPress (no drag init)`, `[CAL:gesture] doubleTap`, `[CAL:gesture] selecting event for drag`, `[CAL:gesture] dragReady=true`, `[CAL:gesture] blockLongPress`, `[CAL:gesture] blockPress`, `[CAL:lib] layout params`, `[CAL:mini-cols] lane geometry`. Each call site carries a one-line `// FORK Phase 28.2-logging` marker so future agents searching for the convention land on the right spot.
5. `TimeLabels` (which lives outside `CalendarInner`) accepts `calendarId` as a forwarded prop and uses it inside its `[CAL:nowLine]` log via the same `[CAL:${calendarId}:nowLine]` form. The `CalendarInner` JSX call site passes the prop through.
6. The `[CAL:lane-overflow]` warning inside `EventBlocks` is intentionally NOT tagged. It's deeper in the component tree (`EventBlocks_default` is rendered per-lane, no convenient prop seam), it fires only as a defensive `console.warn` when the layout math produces a frame wider than its container (i.e. effectively never under normal operation per Phase 20.6), and the `__DEV__`-stripped log doesn't ship to production. If a future regression makes it noisy, thread `calendarId` through the same way Phase 28.2 did for `TimeLabels`; the cost is one extra prop and one more `if (calendarId)` ternary.

**Consumer wiring (REMITechnician app side).** Three call sites pass a fixed identifier:

- `src/components/calendar/landscape/LandscapeWorkweekView.tsx` → `calendarId="WORKWEEK-LANDSCAPE"`
- `src/components/calendar/resource-calendar-day-view.tsx` → `calendarId="DAY-PORTRAIT"`
- `src/components/calendar/resource-calendar-workweek-view.tsx` → `calendarId="WEEK-PORTRAIT"`

The franchise screen (`app/(tabs)/index.tsx`) also adds a top-level `calTag(viewMode, isLandscape)` helper and wraps every `console.log("[CAL:...")` / `console.warn("[CAL:...")` site with a `[${calTag(...)}]` prefix so APP-side log lines (e.g. `[CAL:swap]`, `[CAL:render]`, `[CAL:longPress]`) carry the same identifier the vendored library emits. The technician calendar half declares `const isLandscape = false;` so the same prefix expression compiles without orientation plumbing it doesn't have today.

**Test coverage.** `src/components/calendar/landscape/__tests__/LandscapeWorkweekView.test.tsx` already mocks `<Calendar>` and captures props into `data-props`; one new field (`calendarId: typeof props.calendarId === "string" ? props.calendarId : null`) plus one new assertion (`expect(props.calendarId).toBe("WORKWEEK-LANDSCAPE")`) inside the existing "calendar configuration" test pin the contract. No new test file.

**Cleanup if reverted:** drop the `calendarId` destructure + `logCal` callback in `CalendarInner`, restore the original `gestureLog` body (`if (__DEV__) console.log("[CAL:gesture]", ...args);`), revert the 9 direct-console sites to their bare `console.log("[CAL:${subtag}] ...")` shape, drop the `calendarId` parameter on `TimeLabels` (and its forwarding from `CalendarInner`), restore the bare `[CAL:nowLine]` form, drop the `calendarId?: string` prop block from `dist/index.d.ts` + `dist/index.d.mts`, and drop the consumer `calendarId="..."` props in the three calendar wrappers. App-side: drop the `calTag` helper and bulk-revert the prefix expressions in the 43 `console.log/warn("[CAL:` sites in `app/(tabs)/index.tsx`.

**Markers:** `// FORK Phase 28.2-logging` on (1) the `calendarId` destructure block in `CalendarInner.props`, (2) the `logCal` + `gestureLog` `useCallback` definitions, (3) each of the 9 inline `[CAL:*]` log sites listed above (the `[CAL:lib]` layout-params log, the 6 `[CAL:gesture]` direct sites, the `[CAL:mini-cols]` lane-geometry log, and the `[CAL:nowLine]` site inside `TimeLabels`), (4) the `calendarId` parameter in `TimeLabels`'s destructure, (5) the new `calendarId` prop on the `<TimeLabels>` JSX call site, and (6) the `calendarId?: string` prop block in `dist/index.d.ts` + `dist/index.d.mts`. App-side carries matching `// FORK Phase 28.2-logging companion` markers on the `calTag` helper and the `const isLandscape = false;` declaration in `TechnicianCalendar`.

---

**Phase 28.3 (2026-05-07): gate the `[BUG-A:*]` family behind `EXPO_PUBLIC_VERBOSE_CALENDAR_LOGS`.** Companion to the 2026-05-07 chip-row freeze fix in the consumer (see `docs/DEVELOPMENT-LOG.md` chip-row-freeze entry). The 6 `[BUG-A:*]` sites added in Phase 16 (P2-FE-4 #15) — `Write`, `StoreCreate`, `ProviderRender` / `ProviderMount` / `ProviderUnmount`, `Read`, `Feeder`, `CalendarRender` — fire 1× per render per resource (`Read`), 1× per Provider (`ProviderRender`), 1× per StoreFeeder pass, etc. At the freeze repro (~9 staged intents, 17 events, 5 unrelated `tech_app` orphan drafts) the cumulative volume was JS-thread-starving the chip-row commit pipeline. The user explicitly asked to keep the diagnostic available rather than strip it; this phase introduces a single `__VERBOSE_CAL_LOGS__` boolean at the top of `dist/index.js` that mirrors the consumer's `VERBOSE_CALENDAR_LOGS` constant in `src/utils/calendar-debug-logs.ts`. Both default to `false` and flip on with `EXPO_PUBLIC_VERBOSE_CALENDAR_LOGS=1`. In production builds (`__DEV__ === false`) the constant is permanently false; every gated site is dead code under tree-shaking.

**Mechanism.** Top of `dist/index.js`, immediately after `var React19__namespace = ...`, add:

```js
var __VERBOSE_CAL_LOGS__ =
  (typeof __DEV__ !== "undefined" && __DEV__) &&
  (typeof process !== "undefined" &&
    process.env &&
    process.env.EXPO_PUBLIC_VERBOSE_CALENDAR_LOGS === "1");
```

We can't import the consumer's constant — vendored modules must be self-contained — so this is an intentional inline copy. If the env-var spelling ever drifts, change BOTH copies in the same commit.

**Sites covered (all 6 `[BUG-A:*]` calls in `dist/index.js`):**
- `setDayDataFor → [BUG-A:Write]` (the per-write log AND the surrounding `eventsTechCount` / `eventsTotal` derivation, since both are dead code when not logging).
- `createCalendarStore → [BUG-A:StoreCreate]`.
- `Provider render body → [BUG-A:ProviderRender]` and the `useEffect` that emits `[BUG-A:ProviderMount]` / `[BUG-A:ProviderUnmount]` (early-returned wholesale when gated off).
- `useEventsFor → [BUG-A:Read]` (the `events.length > 0` branch is now `__VERBOSE_CAL_LOGS__ && events.length > 0`).
- `StoreFeeder useEffect → [BUG-A:Feeder]`.
- `CalendarInner render body → [BUG-A:CalendarRender]`.

**Cleanup if reverted:** drop the `__VERBOSE_CAL_LOGS__` constant block at the top of `dist/index.js` and remove the 6 `if (__VERBOSE_CAL_LOGS__)` gates around each `[BUG-A:*]` site (restoring the bare `console.log` calls). Sister consumer-side cleanup: drop `src/utils/calendar-debug-logs.ts`, drop the `if (VERBOSE_CALENDAR_LOGS)` gates in `LandscapeWorkweekView.tsx` (1 site), `resource-calendar-day-view.tsx` (~7 sites), `MoveChainChipRow.tsx` (1 site), `move-chain-pulse-singleton.ts` (4 sites), `use-move-chain-pulse.ts` (2 sites), `use-move-chain-scroll-logger.ts` (1 site), and the module-scope dedupe in `use-pending-change-overlay.ts` + `use-known-reorganization-session-ids.ts`.

**Markers:** `// FORK Phase 28.3` on (a) the `__VERBOSE_CAL_LOGS__` definition block, (b) each of the 6 gated `[BUG-A:*]` sites in `dist/index.js`. (No type-surface change — the constant lives entirely inside `dist/index.js`.)

---

**Phase 20.5 (2026-05-06): diagnostic logs for the column-misalignment open follow-up.** Two `__DEV__`-gated additions to make the next user repro self-narrating:

1. **Extended `[CAL:mini-cols] lane geometry` log.** Was previously emitting only `lane0TechId: techsToRender[0]`, which left lane 1 / lane 2 / etc. invisible at the moment of render. Now emits `lanes: techsToRender.map((tid, li) => ({ idx: li, techId: tid }))` so we can correlate "card-rendered-in-lane-N" against the tech-id that actually owns that lane. This is the load-bearing log for hypothesis (a) — if the lane ordering at the moment of misrender doesn't match what the consumer expected, we'll see it here.
2. **New `[CAL:lane-overflow]` warning inside `computeStackedEventLayout`.** Fires only when `leftPx + widthPx > containerWidthPx + 0.5` (the only way the stacked layout can produce visual overflow is when the `minWidthPx = 25` floor wins over `available < 25` — possible only when the container is very narrow AND indent levels are exhausted). In mini-cols mode `containerWidthPx == laneWidth`, so an overflow here means a card visually spilling out of its lane into the adjacent lane. Includes `eventId`, `eventResourceId`, `containerWidthPx`, `leftPx`, `widthPx`, `overflowPx`, `level`, `visualLevel`. This catches hypothesis (a) at the source if optimistic-cache writes are landing events into lanes they don't fit in.

Neither log fires in production (both gated on `__DEV__`). They're load-bearing only for the next investigation pass — once the misalignment is root-caused and fixed, the overflow warning can stay (it's defensive and silent) but the extended lane geometry can be reverted to `lane0TechId` if the noise becomes a problem. Tracker: superseded once `Open follow-up: column-misalignment after multiple drags` (above) is closed.

**Test coverage:** consumer-side smoke (manual). Repro: rotate to landscape, select 2+ techs in mini-cols mode, long-press an event, drag horizontally across lanes. Pre-fix: floating card at frozen pickup width hovers over multiple lanes with no destination indicator. Post-fix: a dashed outline tinted by the destination tech's color follows the snap-to-lane rectangle under the finger, fading out cleanly on release.

---

**Phase 29 (2026-05-06): card free-floats, ghost stays lane-snapped — corner-peek visual restored.** Smoke-test follow-up to Phase 28.x after the user smoke-tested the cumulative Phase 27.x → 28.x stack and reported that the lane-snapped ghost geometry was correct on both axes EXCEPT that the card and ghost no longer produced the ~25% corner-peek L-shape that Phase 21.4 had delivered. Phase 27.1's "static positioning between card and ghost" requirement had over-corrected — the card was now lane-snapped in lockstep with the ghost (`ΔX = W`, constant), which kept them perfectly side-by-side with zero overlap. The corner-peek visual was structurally unreachable.

**The geometric insight (user-supplied).** *"No gridline crossing"* — the user's hard constraint that drove Phase 27.1 — only ever needed to apply to the GHOST. The ghost is the drop-zone marker, and visually-straddling-a-gridline reads as "ambiguous which lane this lands in." The CARD, by contrast, is the floating preview that follows the finger; it's supposed to float freely with finger movement and has no semantic obligation to align to any gridline. Two-card "unison" doesn't require a CONSTANT offset between the two — it only requires both to respond to finger movement on the same frame, which they already do (panXAbs is read by both worklets and updates simultaneously).

**The fix.**
- `DraggableEvent.draggingAnimatedStyle` — the Phase 27.1 lane-snap branch (`if (bodyBlockWidth > 0 && techCount >= 2 && ...) translateX = pos.translateX`) is REMOVED. Card X reverts to the historical Phase 20.4 finger-following formula `panXAbs.value - (effectiveWidth * 2) / 3`, and the dep list trims back to `[selectedEvent, APPOINTMENT_BLOCK_WIDTH, laneWidth]`.
- `DropShadow.animatedStyle` — UNCHANGED. The ghost keeps its Phase 27.1 + Phase 28.1 behavior (`pos.translateX + pos.ghostShiftX` with edge attenuation). Lane-snapping prevents the ghost from straddling gridlines; that constraint is unrelated to where the card is.
- `pan onEnd` `dropShiftX` — UNCHANGED. The drop continues to land at the ghost (Phase 28.1's `laneWidthForDrop * dropAttenuation`). The card is no longer the source of truth for the drop; it never really was, but Phase 27.1 made it incidentally aligned with the drop. Removing the alignment doesn't change where the appointment lands.
- `pan onEnd` snap-in `sourceX` — RE-DERIVED. Pre-Phase-29 the card was at `snapInPos.translateX` at release (the lane-snap), so `sourceX = snapInPos.translateX` was correct. After Phase 29 the card is at `releasePanXAbs - (effW * 2) / 3` at release, so the snap-in animation has to slide FROM there TO the ghost. `effW` mirrors `DraggableEvent.draggingAnimatedStyle`'s `effectiveWidth` derivation: prefer captured pickup width, fall back to laneWidth, fall back to BODY_BLOCK_WIDTH. In mini-cols mode the pickup width equals laneWidth by construction (Phase 20.1 contract).

**Geometry summary after Phase 29 (mini-cols 2+ tech, mid-canvas):**

```text
finger    ≈ (panX, panY)
card_TL   ≈ (panX - 2W/3, panY - 2H/3)             // free-floating, finger-following
ghost_TL  ≈ (snap_X - W, snap_Y - H/2)             // lane-snapped, sub-lane LEFT of finger
drop_TL   ≈ ghost_TL                                // dropShiftX = laneWidth * attenuation (Phase 28.1)
```

The card-vs-ghost ΔX is now VARIABLE within a sub-lane: at the sub-lane's left gridline (`panX = K*W`) the card sits at `(K-2/3)*W` and the ghost at `(K-1)*W`, ΔX = W/3 (full vertical strip peek). At the sub-lane's center (`panX = (K+0.5)*W`) the card is at `(K-1/6)*W` and the ghost at `(K-1)*W`, ΔX = 5W/6 (~83% peek visual). At the sub-lane's right gridline (`panX = (K+1)*W`, just before snap to lane K+1) the card is at `(K+1/3)*W` and the ghost at `(K-1)*W`, ΔX = 4W/3 (more than full lane separation — they're not even adjacent). The variability is what produces the corner-peek visual: as the finger moves within a sub-lane the ghost steps in W increments while the card slides smoothly, sweeping the offset across [W/3, 4W/3].

**How this differs from Phase 27.1's intent.** Phase 27.1 was authored to satisfy the user's *"the cards stay static in their positioning to each other while being dragged"* requirement. We over-interpreted "static" to mean "constant ΔX." The user clarified later that "static" meant "responds together to finger movement" — both must update on the same frame, which they already do via the shared `panXAbs` SV. Phase 29 restores the Phase 21.4 corner-peek shape (the ghost peeks above-and-to-the-left of the card) without re-introducing Phase 21.4's actual bug (Phase 21.4 had the ghost CENTERED on a gridline, which read as ambiguous; Phase 29's ghost is still lane-snapped per Phase 27.1 + 28.1 so it remains centered IN a sub-lane, not ON a gridline).

**Why the snap-in animation source had to update.** Pre-Phase-29 `sourceX = snapInPos.translateX` was correct because the card was lane-snapped to that exact value at release. After Phase 29 the card is one rendered position to the right of `snapInPos.translateX` (at `releasePanXAbs - effW*2/3`, which is in the finger's sub-lane interior, not at its left gridline). If we'd left `sourceX` unchanged the snap-in animation would have started from a position the card was never visually at — it'd jump-cut to the lane-snap value at the start of the 150ms timing, then slide from there. Visible as a one-frame teleport. The new `sourceX` derivation matches the live worklet's formula exactly, so the slide starts where the card last rendered.

**Cleanup if reverted:** put the lane-snap branch back at the top of `draggingAnimatedStyle` (Phase 27.1 shape — see that phase's "Cleanup if reverted" note); restore the dep list to `[selectedEvent, APPOINTMENT_BLOCK_WIDTH, laneWidth, bodyBlockWidth, techCount, columnCount]`; and revert the snap-in `sourceX` to `snapInPos.translateX` (drop the `pickupWidthAtRelease` / `effW` / `releasePanXAbs - effW*2/3` lines). The `DropShadow` and pan-onEnd `dropShiftX` blocks are unchanged by Phase 29 and need no revert.

**Markers:** `// FORK Phase 29 (P3-FE-DRAG-CORNER-PEEK, 2026-05-06)` on (1) the doc-block above `var DraggableEvent = (...)`, (2) the doc-block above `var DropShadow = (...)` (where it sits next to the existing `// PLAN-DEVIATION:` marker for the drop-shadow scaffolding), (3) the doc-block inline in `draggingAnimatedStyle` immediately above the new finger-following return value, (4) the doc-block on the previous Phase 20.4 / 27.1 narrative inside the same worklet (rewritten to explain the Phase 29 geometry instead of the lockstep model), and (5) the doc-block above the rewritten `sourceX` derivation in pan onEnd's snap-in path. Plus matching `PLAN-DEVIATION: 2026-05-06-card-floats-ghost-snaps` markers on the two `DraggableEvent` doc-blocks and on `DropShadow`'s opening doc-block.

**Test coverage:** consumer-side smoke (manual). Repro: open the landscape workweek view, select 2+ techs in mini-cols mode, double-tap an event to start a drag, slide it across sub-lanes. Pre-Phase-29: card and ghost slide in lockstep with constant `ΔX = W`, no corner-peek visual — the two cards look like two non-overlapping siblings. Post-Phase-29: card slides smoothly with finger; ghost steps lane-by-lane in sync; the variable offset between them produces the L-shape corner peek the user originally wanted (ghost peeks above-and-to-the-left of the card), most prominent when the finger is near the center of a sub-lane.

---

**Phase 30.1 (2026-05-07): X-edge reachability — drop-at-edge maps to edge sub-lane at every tech count.** Smoke-test follow-up to Phase 28.1 + Phase 29 after the user reported four-edge unreachability symptoms in landscape workweek view: at the LEFT edge the leftmost sub-lane was reachable for 1–3 techs but unreachable for 4+ techs (and two leftmost unreachable at 6 techs); at the RIGHT edge the floating card visibly stopped short of the viewport even at 1 tech, the rightmost sub-lane was unreachable at 2+ techs, and three rightmost sub-lanes of the rightmost day-column were unreachable at 6 techs.

**Phase 28.1's edge-attenuation envelope was correct in shape** — it already approached zero at the geometric canvas edges, which is the right behaviour. The actual defect was upstream of the envelope: the pan-worklet `panXAbs` clamp used a uniform `BODY_BLOCK_WIDTH/2` inset on each side of the canvas. That inset was sized for the pre-Phase-29 finger-at-card-center geometry, but Phase 29 made the floating card free-float at `panXAbs - 2W/3`, and the clamp wasn't updated in lockstep. Net effect: the finger could never physically reach the geometric edge, the attenuation envelope therefore never collapsed all the way to 0, and at high tech counts the clamped-out region covered multiple sub-lanes — leaving them unreachable as drop targets.

**Two changes.**

1. **Loosen the `panXAbs` clamp** to mirror the Phase 29 floating-card geometry: `2W/3` left inset, `W/3` right inset, where `W = effectiveCardWidth = laneWidth` in mini-cols mode and `BODY_BLOCK_WIDTH` otherwise (matching the `pickupVisualWidthRef` contract from Phase 20.1). The card's LEFT edge can now reach `canvasLeftX` and its RIGHT edge can reach `canvasRightX` — fixing the single-tech "card visibly stops short" complaint at the same time. The clamp is computed inline in pan onUpdate from `bodyResourceIds.length` + `multiTechMode` (closure-captured, same access pattern Phase 28.1's drop math uses).
2. **Rename `computeXEdgeAttenuation` → `computeXEdgeShift`** and return the SIGNED ghost-shift in pixels directly (was: factor in `[0, 1]` that call sites then multiplied by `-laneWidth`). Same envelope shape, same edge behaviour, identical net wire output — purely a sign-semantics refactor that lets call sites `+ ghostShiftX` for the ghost translateX and `- ghostShiftX` for the drop's `dropShiftX` without re-deriving the negation. Call sites updated: `resolveLaneDropPosition` (line drops the `xAttenuation` intermediate var) and the pan-onEnd drop math (mirrors the new sign convention).

**Verification per tech count** (right edge case; left is symmetric by formula). With the new clamp `max panXAbs = canvasRightX - laneWidth/3`:
- 1 tech: only one lane → drop in lane 0 (the only lane); card right edge reaches `canvasRightX` ✓.
- 2 techs: `xWithinColumn` = `lW - lW/3` = `2*lW/3`, `floor((2/3) / (1/2)) = 1` (rightmost) ✓. Attenuation ≈ 1/3 → ghost slides 1/3 lane left of finger → ghost & drop in lane 1.
- 4 techs: `xWithinColumn` in rightmost column = `4*lW - lW/3 = 11*lW/3`, `laneIndex = floor(11/3) = 3` (rightmost) ✓.
- 6 techs: `laneIndex = floor(6 - 1/3) = 5` (rightmost) ✓.

Drop math (`dropShiftX = -ghostShiftX`) lands the drop in the same sub-lane the ghost is rendered in. See the inline doc-block at the clamp site for the worked verification table.

**Diagnostic logs extended.** The existing `[CAL:gesture] snap-in:start` log now also includes `viewportLeft`, `viewportRight`, `panXAbs`, and `laneCount` so the next on-device smoke pass shows whether the finger reached the loosened clamp boundary at the edge. Expected at right edge: `panXAbs ≈ viewportRight - laneWidth/3`, `ghostShiftX ≈ -laneWidth/3` (small attenuation), `dropShiftX ≈ +laneWidth/3` (mirrored positive). Mid-canvas: `panXAbs` far from both edges, `ghostShiftX = -laneWidthForDrop` (full), `dropShiftX = +laneWidthForDrop`.

**Y-axis edge reachability (top / bottom of work window) ships as Phase 30.2** — same envelope shape, different inputs (viewport height + event height instead of canvas X bounds + lane width). Split into a separate phase for cleaner per-axis review.

**Cleanup if reverted:**
- Pan onUpdate: restore `panXAbsValue = Math.max(BODY_BLOCK_WIDTH / 2 + TIME_LABEL_WIDTH, ...); panXAbsValue = Math.min(layout.width - BODY_BLOCK_WIDTH / 2, panXAbsValue);` (drop the `inMiniColsForClamp` / `effectiveCardWidth` / `clampInsetLeft` / `clampInsetRight` block).
- Helper: rename `computeXEdgeShift` back to `computeXEdgeAttenuation` and have it return the factor `attenuation` (drop the `-laneWidth *` multiplication).
- `resolveLaneDropPosition`: restore `var xAttenuation = computeXEdgeAttenuation(...); var ghostShiftX = -laneWidth * xAttenuation;`.
- Pan onEnd drop math: restore `var dropAttenuation = computeXEdgeAttenuation(...); dropShiftX = laneWidthForDrop * dropAttenuation;` (drop the `ghostShiftXForDrop` intermediate var).
- Snap-in log: drop the four new fields (`viewportLeft`, `viewportRight`, `panXAbs`, `laneCount`).

**Markers:** `// FORK Phase 30.1 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY, 2026-05-07)` on (a) the helper-rename doc-block and definition, (b) the call-site rewrite in `resolveLaneDropPosition`, (c) the pan-onEnd drop math doc-block + computation, (d) the inline doc-block + computation at the loosened pan-onUpdate clamp, and (e) the four new snap-in log fields.

---

**Phase 30.2 (2026-05-07): Y-edge reachability — drop-at-edge maps to work-window edge.** Companion to Phase 30.1 on the Y axis. User report: *"Visually card drags to the top edge fine, but the drop always lands in a buffer ~1 hour above the top... drag to bottom edge fine, drop lands ~1 hour above the bottom. Independent of tech count."*

**Root cause.** The pan-worklet treats the finger as if it sits at the CENTER of the card (`panYAbs.value = card center` is written every frame in onUpdate from `snappedAbsoluteTop - scrollY + eventHeight/2`), so the natural drop offset between finger Y and card-top Y is a fixed `eventHeight/2` (single-tech) or `eventHeight` (mini-cols, where Phase 27.1 ghost-above-finger geometry pulls the card a full height up via `dropShiftY = eventHeight/2`). To make the card TOP reach `Y=0` the finger has to sit at `Y=eventHeight/2` — anywhere closer to the viewport top than that gets its drop-top clamped at `Math.max(0, ...)`, leaving an unreachable buffer of half-an-event at the top (and similarly at the bottom). The buffer is biggest for tall events and feels like ~1 hour to the user for typical 30–60-minute appointments at default `hourHeight`.

**Three changes.**

1. **New worklet helper `computeYEdgeShift`** mirrors `computeXEdgeShift` (Phase 30.1) in shape. Takes `panYAbs` (= live finger / card-center Y in viewport coords), `layoutHeight` (= `layout.height` of the body grid), `eventHeight`, and `topAnchorOffset` (= the natural finger-to-card-top distance the call site is using). Returns a signed pixel shift that's `0` in mid-canvas, `+topAnchorOffset` when the finger is at viewport top (`Y=0`), and `-(eventHeight - topAnchorOffset)` when the finger is at viewport bottom (`Y=layoutHeight`). Linear interpolation over each envelope. Worklet-safe; no closures, no JS-only APIs, allocation-free.

2. **Wire into pan-onEnd drop math:** `finalEventTop = panY - H/2 - dropShiftY + yShiftForDrop + scrollY` with `topAnchorOffset = H/2 + dropShiftY` so single-tech mid-canvas matches the existing `panY - H/2 + scrollY` and mini-cols mid-canvas matches the existing `panY - H + scrollY` — no change there. At the top edge yShift = `+topAnchorOffset` cancels the natural anchor offset, putting the card top at the finger Y; at the bottom edge it does the symmetric thing for card bottom. The downstream `clampDragRangeToWorkWindow` (consumer side, `app/(tabs)/index.tsx`) is unaffected and still preserves the dragged-event duration via its existing duration-preserving shrink-from-each-end pass. Verified arithmetically for 30-min and 60-min events at top + bottom edges in the helper doc-block — the worked example at the top edge (single-tech, `panY=0`, `dropShiftY=0`, `topAnchorOffset=H/2`, `yShift=+H/2`) yields `finalEventTop = 0 - H/2 - 0 + H/2 + 0 = 0` → `fromMin = positionToMinutes(0) + minuteOffset = startMinutes` (= `RC_WORK_START` in the consumer).

3. **Wire into ghost (`DropShadow.animatedStyle`) and floating card (`DraggableEvent.draggingAnimatedStyle`)** so the visual previews track the new drop intent at the Y edges:
   - Ghost uses `topAnchorOffset = H/2` to track its natural half-height-above-snap geometry (Phase 21.4 / Phase 27.1). At the top edge yShift = `+H/2` cancels the natural lift so the ghost top reaches `Y=0`; symmetric at the bottom.
   - Floating card uses `topAnchorOffset = 2H/3` to track its Phase 20.4 / Phase 29 finger-at-bottom-right-third geometry. At the top edge yShift = `+2H/3` puts the card top at `Y=0`; at the bottom edge yShift = `-H/3` puts the card bottom at `Y=layoutHeight`.
   - Both branches gate on `typeof layoutHeight === "number" && layoutHeight > 0` so a missing-prop render is a no-op (defensive — `CalendarInner` always passes the prop in production).

**Plumbing.** New `layoutHeight` literal-number prop on `DropShadow` and `DraggableEvent` (NOT a SharedValue — layout changes are infrequent (rotation / split-view) and trigger a re-render that re-creates the animated styles via the deps array). `DropShadow` also gets `panYAbs` so its animated style can read the finger Y in lockstep with the X already-passed `panXAbs`. Both prop additions are wired at the existing `<DropShadow>` and `<DraggableEvent>` call sites in `CalendarInner`'s overlay JSX, sourcing from `layout?.height ?? 0`.

**Diagnostic logs extended.** The `[CAL:gesture] snap-in:start` log (last extended in Phase 30.1) now also includes `viewportTop`, `viewportBottom`, `panYAbs`, `yShift`, and `eventHeight`. Expected at top edge: `panYAbs ≈ 0`, `yShift ≈ +topAnchorOffset` (positive). Expected at bottom edge: `panYAbs ≈ viewportBottom`, `yShift ≈ -(eventHeight - topAnchorOffset)` (negative). Mid-canvas: `yShift = 0`. The `topAnchorOffset` used in the pan-onEnd drop math is `eventHeight/2 + dropShiftY` (= `H/2` single-tech, `H` mini-cols), so the magnitude of `yShift` at the bottom edge in mini-cols is `0` (envelope inactive — natural geometry already puts card bottom at finger) and at the top edge is `H` (full lift cancellation).

**Why three different `topAnchorOffset` values across the three sites.** Each site's natural mid-canvas finger-to-anchor offset is different — the helper takes that as input rather than baking in a single assumption. The pan-onEnd drop math uses `H/2 + dropShiftY` because that's what the existing `finalEventTop` formula assumes. The ghost uses `H/2` because its Phase 21.4 transform places its top half-an-event-height above the snap-Y (i.e. the natural finger-to-ghost-top offset is `H/2`). The floating card uses `2H/3` because Phase 29's finger-at-bottom-right-third geometry places its top `2H/3` above the finger. Different inputs, same envelope shape, consistent visual behaviour at the edges.

**Cleanup if reverted:**
- Drop the `computeYEdgeShift` helper definition.
- Pan-onEnd: drop the `yShiftForDrop` block; restore `finalEventTop = panYAbs.value - eventHeight.value / 2 - dropShiftY + scrollY.value;`.
- `DropShadow`: drop the `panYAbs` and `layoutHeight` props from the destructure; drop the `yShift` block in `animatedStyle`; restore `transform.translateY: pos.translateY - pos.height / 2`; remove `layoutHeight` from the `useAnimatedStyle` deps array.
- `DraggableEvent`: drop the `layoutHeight` prop from the destructure; drop the `yShift` block in the post-Phase-29 finger-following return; restore `translateY: panYAbs.value - (eventHeight.value * 2) / 3`; remove `layoutHeight` from the `draggingAnimatedStyle` deps array.
- `CalendarInner` JSX: drop the `panYAbs` and `layoutHeight: layout?.height ?? 0` props on the `<DropShadow>` call site and the `layoutHeight: layout?.height ?? 0` prop on the `<DraggableEvent>` call site.
- Snap-in log: drop the five new fields (`viewportTop`, `viewportBottom`, `panYAbs`, `yShift`, `eventHeight`).

**Markers:** `// FORK Phase 30.2 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY, 2026-05-07)` on (a) the `computeYEdgeShift` helper definition + doc-block, (b) the `yShiftForDrop` block in pan onEnd, (c) the `layoutHeight` prop block in `DropShadow`'s destructure, (d) the `panYAbs` + `yShift` block in `DropShadow.animatedStyle`, (e) the `layoutHeight` prop block in `DraggableEvent`'s destructure, (f) the `yShift` block in `DraggableEvent.draggingAnimatedStyle`'s post-Phase-29 return, (g) the `panYAbs` + `layoutHeight` props on the `<DropShadow>` call site, (h) the `layoutHeight` prop on the `<DraggableEvent>` call site, and (i) the five new snap-in log fields.

---

**Phase 30.3 (2026-05-07): Y-edge envelope bug-fix — `fingerY` input is `touchY`, not `panYAbs`; drop math no longer applies `yShift`.** Smoke-test follow-up to Phase 30.2 after the user reported *"I'm not really seeing a change in the top or bottom of the screen"* and the device log confirmed `yShift: 0` even when the dragged card snapped near the top edge (`panYAbs: 208, viewportBottom: 314, eventHeight: 200`).

**Root cause.** Phase 30.2 fed `panYAbs.value` into `computeYEdgeShift`. `panYAbs` is the SNAPPED CARD-CENTER Y (= `snappedAbsoluteTop - scrollY + eventHeight/2`, written every frame in pan-onUpdate after `Math.max(0, snappedAbsoluteTop)` and the analogous max-clamp), NOT the live finger Y. So `panYAbs` is bounded to `[eventHeight/2, layoutHeight - snapInterval + eventHeight/2]` and rarely enters the envelope range during normal drags. Phase 30.2's analog assumption that `panYAbs ≈ live finger Y` (mirroring `panXAbs` on the X axis) was wrong — `panXAbs` IS live finger X (`startedX + evt.translationX` clamped to canvas insets, no snap), but `panYAbs` is snapped, and that asymmetry was missed when c8642f3 was authored.

**Three changes.**

1. **`computeYEdgeShift` parameter renamed `panYAbs` → `fingerY`** with an updated doc-block making the live-finger semantic explicit. Function body unchanged. Three call sites updated to pass `touchY.value` (= live `evt.y`, written every frame by pan-onUpdate before any snap / clamp). `touchY` was already a closure-scoped SharedValue inside `CalendarInner` (declared since well before Phase 18 — see `const touchY = Animated2.useSharedValue(0)` at the top of `CalendarInner`); two new props plumb it into `DropShadow` and `DraggableEvent` so the animated styles can read it in their worklets.

2. **Drop-math `yShift` REMOVED.** The `var yShiftForDrop = ...; finalEventTop = ... + yShiftForDrop` block in pan-onEnd is deleted. Rationale: with `panYAbs` snap-clamped to `[eventHeight/2, layoutHeight - snapInterval + eventHeight/2]`, the natural `panYAbs - eventHeight/2 - dropShiftY` formula already lets the drop top reach Y=0 at the top edge (after the `Math.max(0, adjustedFinalEventTop)` rounding clamp), and the consumer-side `clampDragRangeToWorkWindow` (with `RC_WORK_START` 05:30 / `RC_WORK_END` 17:30) shifts long events to fit the work window with duration preserved at the bottom edge. The Phase 30.2 envelope ALSO fired on `panYAbs` (snap-clamped), so it was effectively always 0 for the drop-math call site too — and on the rare cases it did fire (very tall events), it overshot the natural snap-clamp's already-correct drop top. Net regression in both directions; cleanest fix is to rely on the pre-existing snap-clamp + consumer-clamp pipeline for drop reachability and reserve `yShift` purely for VISUAL feedback on the ghost and floating card.

3. **Visual envelope still fires** on `DropShadow.animatedStyle` and `DraggableEvent.draggingAnimatedStyle`, now with `fingerY: touchY.value` so the ghost / floating card slide inward smoothly as the finger approaches the viewport top / bottom — exact mirror of how the X-axis envelope works on `panXAbs`. The visible result the user wanted: at the top edge the ghost top reaches Y=0 (ghost was off-screen above before); at the bottom edge the ghost bottom reaches Y=layoutHeight; floating card translateY tracks `panYAbs - 2H/3 + yShift` so the card slides toward the corresponding viewport edge as the finger does.

**New diagnostic log.** A sibling `[CAL:edge-shift:y]` log is emitted from pan-onEnd next to `[CAL:gesture] snap-in:start`. Prints `touchY`, `panYAbs`, `layoutHeight`, `eventHeight`, `ghostYShift` (= envelope at `topAnchorOffset = H/2`), and `cardYShift` (= envelope at `topAnchorOffset = 2H/3`). Mid-canvas both shifts print 0; near the top edge ghost prints up to `+H/2` and card up to `+2H/3`; near the bottom edge ghost prints down to `-H/2` and card down to `-H/3`. The pre-existing `snap-in:start` log loses its `yShift` field (no longer applicable to drop math) and gains `touchY` so the user can correlate with the new edge-shift log.

**Reverting Phase 30.3.** Restore the parameter name to `panYAbs` (search the helper definition + 4 call sites). Re-add the `yShiftForDrop` block in pan-onEnd. Drop the `touchY` props from `DropShadow` and `DraggableEvent`. Drop the new `[CAL:edge-shift:y]` log and the `touchY` field added to `snap-in:start` (re-add `yShift`). Caveat: reverting also re-introduces the `yShift: 0` symptom — Phase 30.2 wasn't actually fixing anything user-visible, only adding a no-op envelope the user couldn't see.

**Markers:** `// FORK Phase 30.3 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY, 2026-05-07)` on (a) the helper rename + new doc-block, (b) the `touchY` prop block in `DropShadow`'s destructure, (c) the `fingerY: touchY.value` swap in `DropShadow.animatedStyle`'s `computeYEdgeShift` call, (d) the `touchY` prop block in `DraggableEvent`'s destructure, (e) the `fingerY: touchY.value` swap in `DraggableEvent.draggingAnimatedStyle`'s `computeYEdgeShift` call, (f) the deleted-yShift block / new comment in pan onEnd's drop math, (g) the `touchY` prop on `<DropShadow>` and `<DraggableEvent>` call sites, (h) the rewritten `snap-in:start` Y-block (`touchY` added, `yShift` dropped), and (i) the new `[CAL:edge-shift:y]` log block.

---

**Phase 30.4 (2026-05-07): tech-avatar drag-hit dead-zone on the grid-facing edge of each tile bbox.** Smoke-test follow-up to Phase 30.1 X-edge reachability. User report: *"The right side could use a little more work, because when I drag over to it and my finger isn't directly over the card, let's say it picked it up a little to the right of the card, I end up hovering over one of the tech avatars, triggering a calendar switch."* Phase 30.1 loosened the `panXAbs` clamp so the floating card's right edge can reach the canvas right edge, but the avatar strip lives flush against that same edge — finger crosses laterally from the rightmost lane into the strip, lingers ≥500ms while the user positions the drop, and the dwell-pattern's buzz-2 narrow (`useDragToAvatar` JS-thread state machine, 200/500/900ms) fires before the user releases.

**Why this lives in app code, not the fork.** The vendored calendar exposes `fingerXAbs/Y` (window coords) via `useDragSharedValues()` and otherwise stays out of avatar logic — the avatar bbox map and the dwell pattern both live in `src/components/calendar/landscape/use-drag-to-avatar.ts` and `LandscapeWorkweekView.tsx`. The cleanest place to insert the fix is at the bbox registration site in `LandscapeWorkweekView.handleAvatarTileLayout`, where we know the strip placement (= which side faces the grid) without plumbing it through the hook.

**Implementation.** `handleAvatarTileLayout` in `src/components/calendar/landscape/LandscapeWorkweekView.tsx` now passes a SHRUNK bbox to `registerAvatarBbox` (the drag-hit map) while leaving the bbox passed to `registerAvatarBboxToSelector` (the entrance-animation registry consumed by `EmbeddedAvatarSelector`) untouched. Shrink amount: `AVATAR_DRAG_HIT_GRID_INSET_PT = 12` on the GRID-FACING edge only (left edge when `stripPlacement === 'right'`, right edge when `'left'`). 12pt = `LANDSCAPE_AVATAR_PADDING` (5pt, the strip's symmetric padding around the 34pt avatar circle) + 7pt buffer. The remaining 32pt × 44pt hit zone sits just inside the visible 34pt avatar circle, so the user's finger must be over the actual avatar dot (not the strip padding) to trigger the dwell pattern.

**Asymmetric on purpose.** Only the grid-facing edge moves inward. The screen-edge side is unchanged so a user who drops the appointment ON the avatar (rare flow, but the dwell pattern's design supports it) still registers a hit when the finger lifts within the strip. The vertical bounds are unchanged because the strip is 44pt wide and any finger that's vertically inside a tile is intentionally on that tile.

**Options considered.** (1) Suppress dwell while `isDragging` — breaks the feature entirely (the dwell-during-drag IS the avatar-switcher). (2) Pointer-events disable on avatar row during drag — same problem; also kills the highlight ring visual. (3) Z-elevate the dragging card — gesture-system touch routing doesn't change mid-drag, wouldn't fix it. (4) Suppress dwell only when `panXAbs` is at its X-edge clamp — would require a new SV from the vendored calendar plus threshold tuning per tech-count (more invasive). (5) Shrink the avatar drag-hit bbox on the grid-facing edge (this approach) — smallest, most reversible change; layers cleanly on top of the existing `wasRecentlyDragging` tap guard (Bug #2 / 2026-04-22) so taps lifting on the avatar at drag-end were already handled.

**Reverting Phase 30.4.** Drop the `AVATAR_DRAG_HIT_GRID_INSET_PT` constant + the `dragBbox` shrink branches in `handleAvatarTileLayout`; restore the original two-line `registerAvatarBbox(techId, bbox); registerAvatarBboxToSelector(techId, bbox);` body. Caveat: reverting also re-exposes the user's right-edge avatar-switch symptom.

**Markers:** No `FORK Phase` marker in the vendored folder — this change is in app code. The change is tagged with a `FORK Phase 30.4 (...)` comment block in `LandscapeWorkweekView.tsx` so a `rg "FORK Phase 30.4"` from the repo root surfaces both the README and the implementation.

---

**Phase 32 (2026-05-07): discrete + animated shadow offset, replacing the Phase 28.1 / 30.x continuous edge envelopes.** Smoke-test follow-up after the Phase 31 rectangle-first attempt was reverted (see `docs/PLAN-DEVIATIONS.md#2026-05-07-rectangle-first-edge-drag`). User feedback that drove this rewrite:

- *"the shadow no longer stays in their lanes"* (when continuous `ghostShiftX` slid the ghost between two lane positions).
- *"I'm fine with the shadow collapsing into the card when it gets close to the edge, but this is happening over the entire calendar, which is a no-no. There is a slide animation when a card is dropped, and I think that would be ideal to show the shadow sliding into the card when it gets closer to the edge."*
- *"WHERE the card ends up on the screen relative to the touch point became all over the place"* (Phase 31 floating card snapping to the edge-clamped rectangle).

**Three-layer model (now correctly separated):**

1. Floating card (`DraggableEvent.draggingAnimatedStyle`): pure Phase 29 finger-following geometry. `translateY = panYAbs.value - (eventHeight.value * 2) / 3`, `translateX = panXAbs.value - (effectiveWidth * 2) / 3`. No rectangle helper, no edge clamping, no Y visual shift. Always smoothly tracks the finger.
2. Shadow (`DropShadow.animatedStyle` via `resolveLaneDropPosition`): renders at one of two discrete positions controlled by an animated SV. `shadowOffsetXSteps` settles at `-1` mid-canvas (ghost one full lane LEFT of finger, the historical Phase 27.1 corner-peek aesthetic) and animates to `0` at the absolute leftmost or rightmost lane (ghost in finger's own lane, allowing the user to drop on the edge lane). Transitions use `withTiming(150ms)` — the SAME primitive as the post-release snap-in slide. The shadow is always fully inside one lane; the brief mid-animation interpolation IS the slide the user asked for.
3. Drop (`pan-onEnd`): reads `Math.round(shadowOffsetXSteps.value)` at release, multiplies by `laneWidth` to derive `dropShiftX = -ghostStepDiscrete * laneWidthForDrop`. Drop = wherever the shadow IS at release. The snap-in `withTiming` target also uses `ghostStepDiscrete` so the floating card slides to the same lane the shadow occupies.

**Why discrete + animated, not continuous:** the previous continuous envelope (Phase 28.1 / 30.1 `computeXEdgeShift`) returned fractional pixel shifts in `[-laneWidth, 0]`. That meant the ghost was constantly straddling lane boundaries during the slide, which the user explicitly rejected. The discrete model has only two valid positions, with the smooth visual transition expressed via the SV's `withTiming` interpolation. Same visual result, no straddling.

**Y-clamp math fix (separately, in pan-onUpdate):** the snap clamp on `snappedAbsoluteTop` previously used `Math.max(0, ...)` and `layout.height + scrollY - snapInterval` as bounds, which (a) allowed the visible card to overshoot the viewport top by `H/6` and (b) allowed it to overshoot the bottom by an arbitrary amount (limited only by `snapInterval ≈ 5px`). Phase 32 changes the bounds to `[scrollY + H/6, layout.height + scrollY - 5H/6]`. Math derivation:

- Card render top in viewport coords = `panYAbs - 2H/3 = snappedAbsoluteTop - scrollY - H/6`.
- Card render bottom = top + `H` = `snappedAbsoluteTop - scrollY + 5H/6`.
- Card top reaches Y=0 when `snappedAbsoluteTop = scrollY + H/6` → new min.
- Card bottom reaches Y=`layout.height` when `snappedAbsoluteTop = layout.height + scrollY - 5H/6` → new max.

The visible card edges now exactly meet the visible viewport edges with no overshoot or invisible wall.

**What was deleted:**

- `computeXEdgeShift` (Phase 28.1 / 30.1) — replaced by `resolveDiscreteShadowOffsetXStep` + animated SV.
- `computeYEdgeShift` (Phase 30.2 / 30.3) — Y reachability is owned entirely by the snap-clamp math fix above. The `touchY`-driven visual envelope was a no-op for typical drags and double-counted edge proximity when it did fire.
- `panYAbs` + `layoutHeight` + `touchY` props on `DropShadow` — no longer consumed.
- `layoutHeight` + `touchY` props on `DraggableEvent` — no longer consumed.
- `[CAL:edge-shift:y]` log — Y envelope is gone.

**What was added:**

- `resolveDiscreteShadowOffsetXStep` pure decider in `dist/index.js` (returns `-1` or `0`).
- `shadowOffsetXSteps` SharedValue in `CalendarInner` (default `-1`).
- `useAnimatedReaction` block in `CalendarInner` that watches `panXAbs` + `isDragging` and animates the SV with `withTiming(150ms)` when the discrete target changes.
- `shadowOffsetXSteps` parameter on `resolveLaneDropPosition` (default `0` for the snap-in / unit-test path).
- `shadowOffsetXSteps` prop on `DropShadow`.
- `shadowOffsetXSteps` + `shadowOffsetXStepsRounded` fields on the `[CAL:gesture] snap-in:start` log so on-device smoke can verify the SV value at release matches the rounded discrete value used for drop math.

**Smoke test (next on-device pass):**

- Top: card top should reach the visible top of the work window. `[CAL:gesture] finalizeDrag` should show `from = 330` (RC_WORK_START = 5:30 AM in minutes).
- Bottom: card bottom should reach the visible bottom. `finalizeDrag` should show `to` matching the work-window end with duration preserved (consumer-side `clampDragRangeToWorkWindow` keeps duration intact).
- Right (mini-cols): drop in the rightmost selected tech lane should land in that tech at every tech count (2, 3, 6). `[CAL:gesture] snap-in:start` should show `shadowOffsetXStepsRounded: 0` when the finger is on the rightmost lane.
- Left (mini-cols): drop in the leftmost selected tech lane should land there. `shadowOffsetXStepsRounded: 0` at the leftmost lane.
- Mid-canvas: `shadowOffsetXStepsRounded: -1`, ghost one lane LEFT of finger, drop one lane LEFT of finger. The historical Phase 27.1 corner-peek aesthetic is preserved.
- Touch feel: card follows the finger smoothly, no jumps when picking up or after waiting in pickup mode.
- Shadow should always be fully inside one lane. Convergence into the card near an edge should feel like the existing release slide animation.

**Cleanup if reverted:**

- Restore `computeXEdgeShift` and `computeYEdgeShift` definitions (lines 480–654 of `dist/index.js` pre-Phase-32).
- Restore the `useShadowOffsetXSteps` SV declaration removal and the `useAnimatedReaction` block.
- Restore the `panYAbs`, `layoutHeight`, `touchY` props on `DropShadow` + `DraggableEvent` (and their consumers in `animatedStyle` / `draggingAnimatedStyle`).
- Restore the pan-onUpdate Y-clamp bounds to `Math.max(0, snappedAbsoluteTop)` + `layout.height + scrollY - snapInterval`.
- Restore the pan-onEnd `dropShiftX` computation via `computeXEdgeShift({...})`.
- Restore the snap-in `snapInPos.ghostShiftX` reads (no `shadowOffsetXSteps` arg to `resolveLaneDropPosition`).
- Restore the `[CAL:edge-shift:y]` log block.

**Markers:** `// FORK Phase 32 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY, 2026-05-07)` on the helper definition, the `resolveLaneDropPosition` parameter, the `DropShadow` prop and yShift-removal block, the `DraggableEvent` yShift-removal block, the `shadowOffsetXSteps` SV declaration, the `useAnimatedReaction` block, the pan-onUpdate Y-clamp comment, the pan-onEnd dropShiftX block, the snap-in `shadowOffsetXSteps` arg, and the snap-in:start log additions. The `2026-05-07-rectangle-first-edge-drag` PLAN-DEVIATION is now closed (Phase 31 is fully reverted; this Phase 32 is the replacement).

> **Update 2026-05-07:** Phase 32's pickup offset and Y-clamp math were superseded by Phase 33 below. Phase 32's three-layer model (floating card / shadow / drop), discrete shadow offset SV, and `withTiming(150ms)` shadow animation all remain in force; only the Y geometry parameters were changed.

---

**Phase 33 (2026-05-07): pickup offset Y reduced to `H/3`; Y-clamp re-derived from first principles.** Smoke-test follow-up after Phase 32 shipped, addressing two remaining issues the user reported:

1. *"have the appointment card sit more under the touch zone. Right now it is completely outside of my finger, giving it a feel like it's not working right. I need it at least half way under the finger so it's just poking out from under it."*
2. *"the top and bottom are still cutting out 30min of calendar space from where they are supposed to."*

**Issue 1 — Pickup offset Y `2H/3` → `H/3`:** with the old `2H/3` offset, the finger sat 67% from the card top, meaning only 33% of the card rendered BELOW the finger; visually the card looked like it had jumped above the touch point. Halving the offset to `H/3` puts 67% of the card BELOW the finger and 33% above — the card is mostly under the touch zone, with just a sliver "poking up" past the finger. X offset is unchanged (`2W/3`); the user explicitly said "the right side of the calendar is working perfectly."

Sites updated:

- `DraggableEvent.draggingAnimatedStyle`: `translateY: panYAbs.value - eventHeight.value / 3` (was `(eventHeight.value * 2) / 3`).
- pan-onEnd snap-in `sourceY`: `releasePanYAbs - eventHeight.value / 3` (was `(eventHeight.value * 2) / 3`). The snap-in animation source must match the rendered card position at release; otherwise the slide would visibly teleport the card by `H/3` on the first animated frame.

**Issue 2 — Y-clamp re-derived independently of the pickup offset:** Phase 32's bounds `[scrollY + H/6, layout.height + scrollY - 5H/6]` were tuned so the VISIBLE card edges (with the old `2H/3` pickup) would land on the viewport edges. The user's "30min cut out" complaint shows that even those bounds were over-constraining the snapped landing position — `30min ≈ eventHeight` at the minimum event height (40px @ 80px/hr). Phase 33 abandons the pickup-offset-coupled derivation in favor of a simpler, geometrically clean rule:

- `snapMin = scrollY` — snapped top can reach the top of the visible viewport.
- `maxAbsoluteTop = layout.height + scrollY - eventHeight` — snapped top + height = viewport bottom, so card bottom reaches viewport bottom.

The snapped card (top to bottom) fits exactly within the visible viewport in content coords. With this, the user can drop AT the visible top time slot (e.g., the work window start when scrolled to top) AND AT the visible bottom time slot (work window end when scrolled to bottom), restoring the lost 30min at each edge.

**Trade-off acknowledged in code comment:** with the new `H/3` pickup offset, the visible card edges may extend slightly past the viewport at the extremes (card top at `+H/6` past viewport top when snapped to `scrollY`; card bottom at `+H/6` past viewport bottom when snapped to `layout.height + scrollY - eventHeight`). Landing reachability — the user's actual ask — is preserved, and the small visual overshoot reads as the card naturally "tucking under" the viewport edge. If pixel-perfect visual alignment becomes important later, the visual clamp would need to be separated from the snap clamp.

**Sites updated:**

| Site | Was | Is |
|---|---|---|
| `DraggableEvent.draggingAnimatedStyle` Y | `panYAbs - 2H/3` | `panYAbs - H/3` |
| pan-onUpdate `snapMin` | `scrollY + H/6` | `scrollY` |
| pan-onUpdate `maxAbsoluteTop` | `layout.height + scrollY - 5H/6` | `layout.height + scrollY - eventHeight` |
| pan-onEnd snap-in `sourceY` | `releasePanYAbs - 2H/3` | `releasePanYAbs - H/3` |
| `DropShadow` Y-axis "no shift" comment | references "2H/3 pickup offset" | references "pickup offset" generically + Phase 33 callout |
| Geometry summary comment block (DraggableEvent) | `card_TL ≈ (panX - 2W/3, panY - 2H/3)` | `card_TL ≈ (panX - 2W/3, panY - H/3)` with "Y was 2H/3 pre-Phase-33" callout |

**What did NOT change:**

- X pickup offset stays at `2W/3` (X axis untouched per user feedback).
- The X clamp inset (`2W/3` left, `W/3` right) — that's about the FINGER reach, independent of the visual card pickup offset.
- Phase 32's discrete + animated shadow offset model — fully retained.
- The post-release snap-in `withTiming(150ms)` slide — retained.
- The `[CAL:gesture] snap-in:start` log fields — retained (no new Y-edge envelope to log).

**Smoke test (next on-device pass):**

- Pick up an appointment in landscape multi-tech mode → verify the card now sits "halfway under the finger" — finger at upper portion of card, card extends down from finger (approximately 67% of card visible below the touch).
- Drag to top of viewport → verify card top reaches Y=0 region and you can drop AT the work-window start (5:30 AM). `[CAL:gesture] finalizeDrag` should show `from = 330` (RC_WORK_START in minutes).
- Drag to bottom of viewport → verify card bottom reaches viewport bottom region and you can drop AT the work-window end (5:30 PM). `finalizeDrag` should show `to` matching the work-window end with duration preserved.
- Drag horizontally → confirm the right side still works perfectly (no regression in X behavior — Phase 32's discrete shadow offset is unchanged).
- Confirm shadow still has the discrete offset (1 lane LEFT mid-canvas, converges to finger lane at edges) — Phase 32 invariant preserved.

**Cleanup if reverted:**

- Restore `translateY: panYAbs.value - (eventHeight.value * 2) / 3` in `DraggableEvent.draggingAnimatedStyle`.
- Restore `var sourceY = releasePanYAbs - (eventHeight.value * 2) / 3` in pan-onEnd snap-in.
- Restore `snapMin = scrollY.value + eventHeight.value / 6` and `maxAbsoluteTop = layout.height + scrollY.value - (5 * eventHeight.value) / 6` in pan-onUpdate.
- Re-link the now-decoupled comment block in pan-onUpdate to the Phase 32 derivation chain.
- Drop the Phase 33 callouts in the geometry summary and DropShadow Y-axis comment.

**Markers:** `// FORK Phase 33 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY, 2026-05-07)` on (a) the `DraggableEvent.draggingAnimatedStyle` comment block + new Y translation, (b) the pan-onUpdate Y-clamp comment block + new bounds, (c) the pan-onEnd snap-in `sourceY` comment block + new value, (d) the DropShadow Y-axis "no shift" comment update, and (e) the geometry summary comment. No new helpers, no new SVs, no new props, no new logs. This is a parameter tuning of the Phase 32 chain in response to the user's first on-device feedback.

---

**Phase 34 (2026-05-07): cross-day shadow prevention + drop reads helper TARGET, not in-flight SV.** Smoke-test follow-up after Phase 33 shipped, addressing two distinct symptoms the user reported in the second on-device pass:

1. *"on the right side, where the appointment says michael. The drop zone skips that column and it only ever goes into the ones next to it, despite the fact that it actually can drop in that column."* — drop landing in Thu Jake / Thu Josh when the user pointed at Thu Todd (the absolute rightmost lane in 4-day × 3-tech mini-cols).
2. Cross-day shadow visible to the user when finger entered any non-first day's first lane: *"shadow crossed day boundary"* — `Tue Josh → ghost in Mon Todd`, `Wed Josh → ghost in Tue Todd`, `Thu Josh → ghost in Wed Todd`. Ghost rendered (and drop landed) in the previous day's last lane, which the user did not expect.

**Issue 1 — Helper as drop target (not in-flight SV):** Phase 32's pan-onEnd `dropShiftX` block read `Math.round(shadowOffsetXSteps.value)` to derive the discrete step. The SV transitions between `-1` (mid-canvas) and `0` (edge-converged) over 150ms via `withTiming`, driven by `useAnimatedReaction` watching `panXAbs`. When the user moved their finger to the rightmost lane and released within the 150ms transition window, `Math.round(SV)` returned the OLD `-1` (e.g. `SV = -0.9` rounds to `-1`) instead of the NEW target `0` the helper was converging to. The drop landed one lane to the LEFT of the user's intended target.

User's diagnostic log:
```
panXAbs: 720.6 (finger ~43px from right edge of viewport, in Thu Todd)
shadowOffsetXSteps: -0.9 (mid-flight, transitioning from -1 toward 0)
shadowOffsetXStepsRounded: -1 (Math.round of in-flight SV)
landedResourceId: 2055 (Jake) — wanted Todd
```

Phase 34 reads the helper directly at release time:
```js
ghostStepDiscrete = resolveDiscreteShadowOffsetXStep({
  panXAbs: panXAbs.value,
  timeLabelWidth: TIME_LABEL_WIDTH,
  bodyBlockWidth: BODY_BLOCK_WIDTH,
  techCount: bodyResourceIds.length,
  columnCount: Math.max(1, isMultiDay ? days.length : 1)
});
```

The helper is a pure decider. Reading it ALWAYS returns the converged target for the current finger position, regardless of where the in-flight SV is. The `dropShiftX = -ghostStepDiscrete * laneWidthForDrop` derivation is unchanged; only the source of `ghostStepDiscrete` changed. The snap-in animation also uses this `ghostStepDiscrete` (passed into `resolveLaneDropPosition` as `shadowOffsetXSteps`), so the floating card slides to the same lane the helper indicates — and the SV continues converging via the existing `useAnimatedReaction`. By the end of the 150ms post-release slide, both shadow and floating card occupy the helper's target lane.

**Issue 2 — Cross-day shadow prevention:** Phase 32's helper had two clamp branches:
```js
if (absoluteLane <= 0) return 0;          // absolute leftmost (Mon Josh in 4×3)
if (absoluteLane >= totalLanes - 1) return 0;  // absolute rightmost (Thu Todd in 4×3)
```

Every other cell returned `-1`, including each day's first lane (Tue Josh, Wed Josh, Thu Josh). With offset `-1`, the ghost rendered in `(absoluteLane - 1)` = the previous day's last lane. The user reported this as cross-day shadow:

```
panXAbs: 631.8 (finger near LEFT edge of Thu, in Josh's lane)
shadowOffsetXSteps: -1
landedResourceId: 2056 (Todd) at col: 2 (Wed!)  — shadow crossed day boundary
```

Phase 34 generalizes the leftmost-clamp from `absoluteLane <= 0` to `laneIndex === 0` (any column's first lane). Subsumes the prior absolute-leftmost guard (col 0 + lane 0 implies absLane 0, both fire). After this rule:

- Tue Josh (laneIndex 0 of col 1) → `0` → ghost in Tue Josh → drop in Tue Josh ✓ (cross-day shadow gone)
- Wed Josh, Thu Josh → same ✓
- Mon Josh (laneIndex 0 of col 0) → `0` → ghost in Mon Josh → drop in Mon Josh ✓ (Phase 32 invariant preserved)

**Trade-off acknowledged in code:** with the cross-day rule, the LAST lane of every NON-LAST day (Mon Todd, Tue Todd, Wed Todd in 4×3) becomes structurally unreachable as a drop target. The corner-peek model only ever drops in `(finger - 1)` (default `-1` offset) or in the finger's own clamped lane (`0` offset). Pre-Phase-34 Mon Todd was reachable via finger at Tue Josh (which had offset `-1` → ghost at Mon Todd → drop at Mon Todd). With the new `laneIndex === 0 → 0` rule, Tue Josh clamps to itself, so the cross-day path closes. To drop at Mon Todd, the user would need to point at Mon Todd directly — but Mon Todd has offset `-1` → drop = Mon Jake. There is no direct path. This is a fundamental cost of "no cross-day shadow" + the corner-peek model.

The user explicitly accepted this trade-off in their Phase 34 spec: *"don't cross day via aesthetic offset; let user explicitly drag across."* Documented as `PLAN-DEVIATION: 2026-05-07-x-edge-drop-clamp` so future agents don't "fix" the cross-day rule by removing it.

**Why not extend the right-edge clamp to "last 2 absolute lanes"?** The user's Phase 34 spec mentioned *"within ~1 lane width of viewport right edge"* and called out `panXAbs: 704.4 (finger right at edge between Thu lane 1 and lane 2) → landedResourceId: Josh — wanted Todd or Jake`. A natural read of "within ~1 lane" is "the last 2 absolute lanes" (which would clamp Thu Jake → drop = Thu Jake). I rejected this for two reasons:

1. **It just shifts the unreachable lane one cell inward.** Clamping the last 2 lanes makes Thu Josh → drop = Thu Josh (already reachable directly), Thu Jake → drop = Thu Jake (newly reachable), Thu Todd → drop = Thu Todd (already reachable). But Thu Todd's previous corner-peek source (= finger at Thu Jake) now clamps to Thu Jake, so the cell that was `(absLane - 1)` of the second-to-last is no longer reachable via the corner-peek path. Net: still 1 unreachable lane per day, just a different cell.
2. **The 704.4 case is a finger-at-boundary case, not a finger-in-Jake case.** xWithinColumn = 118.9 / 59.5 = 1.998 — `Math.floor` puts the user in Jake by ~0.5 px. Moving the finger slightly more rightward puts them in Todd's lane, which IS clamped to Todd. The "Jake → Josh" symptom from the user's log is the inherent corner-peek behavior at a boundary the user happens to be sitting on; chasing it via wider clamps creates regressions elsewhere. The primary "Todd unreachable" complaint is fixed by Issue 1's helper-as-target swap.

If the user re-reports the Jake-borderline case after Phase 34, the right answer is probably to revisit the `Math.floor` → `Math.round` lane-bucketing question (snap to nearest lane center vs. lane-the-finger-is-inside) rather than expanding the clamp.

**What did NOT change:**

- Phase 32's three-layer model (floating card / discrete shadow / drop = shadow) — fully retained.
- Phase 32's `withTiming(150ms)` shadow animation — retained.
- Phase 33's pickup-offset `H/3` and snap-clamp `[scrollY, layout.height + scrollY - eventHeight]` — retained.
- The right-edge clamp `absoluteLane >= totalLanes - 1` — retained.
- The `[CAL:gesture] snap-in:start` log — retained (`shadowOffsetXSteps` and `shadowOffsetXStepsRounded` fields still log; the latter now reflects the helper's TARGET, which is what the drop actually used).

**Smoke test (next on-device pass):**

- Right edge (mini-cols, 4×3): drag a card to the rightmost selected tech's column on the rightmost day. Drop should land in that tech, not the lane to the left. `[CAL:gesture] snap-in:start` should show `shadowOffsetXStepsRounded: 0` even if `shadowOffsetXSteps` is fractional (`-0.x`).
- Mid-canvas (mini-cols): drag to a middle day, middle tech (e.g. Tue Jake). Shadow should still appear one full lane LEFT of finger (in Tue Josh). Drop lands at Tue Josh. Phase 32 invariant preserved.
- Cross-day boundary (mini-cols): drag a card so the finger enters Tue Josh (or Wed Josh, Thu Josh). Shadow should stay in the SAME day as the finger (Tue Josh, etc.) — no cross-day shadow. Drop lands in the finger's day.
- Each day's leftmost lane: drop should land in that lane (= finger's lane). `shadowOffsetXStepsRounded: 0` for all `laneIndex === 0` cells.
- Each day's rightmost (NON-LAST DAY) lane: drop will land in the lane to the LEFT (= finger's lane minus 1). E.g., finger at Mon Todd → drop at Mon Jake. This is the documented trade-off; if the user objects, the cross-day rule needs revisiting.

**Cleanup if reverted:**

- Restore `if (absoluteLane <= 0) return 0;` as the only leftmost-side branch in `resolveDiscreteShadowOffsetXStep`. Remove the `if (laneIndex === 0) return 0;` branch.
- Restore `ghostStepDiscrete = Math.round(shadowOffsetXSteps.value)` in pan-onEnd's `dropShiftX` block. Drop the `resolveDiscreteShadowOffsetXStep` call there.
- Caveat: reverting re-introduces both symptoms (cross-day shadow AND mid-transition wrong-lane drops).

**Y-axis (Issue 2 from the Phase 34 spec): RC_WORK_START / RC_WORK_END realigned to the display range.** This change is in app code, not the vendored library. See `app/(tabs)/index.tsx` constants — pre-Phase-34 they were `330` (5:30 AM) and `1050` (5:30 PM), 30 min narrower at each end than the visible grid `[300, 1080]`. Phase 33's snap clamp lets the user drag to the visible top / bottom; the consumer's `clampDragRangeToWorkWindow` then shifted the persisted appointment 30 min back into the tighter window — silently shaving the first / last 30 min of the visible grid. User report: *"the top and bottom are still cutting out 30min of calendar space from where they are supposed to."* Fix: align the constants to `[DEFAULT_DISPLAY_START_MINUTES, DEFAULT_DISPLAY_END_MINUTES] = [300, 1080]`. Documented as `PLAN-DEVIATION: 2026-05-07-work-window-matches-display-range`. No vendored library change — the worklet already correctly maps drop to `from = 300` / `to = 1080` at the visible edges; only the consumer-side clamp needed loosening.

**Markers:** `// FORK Phase 34 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY, 2026-05-07)` on (a) the `resolveDiscreteShadowOffsetXStep` doc-block + the new `laneIndex === 0` clamp + the rewritten right-edge comment, and (b) the pan-onEnd `dropShiftX` doc-block + the `ghostStepDiscrete` derivation. The opening doc-block above the helper additionally cites the `PLAN-DEVIATION: 2026-05-07-x-edge-drop-clamp` ID.

> **Update 2026-05-07:** Phase 34's right-edge / cross-day clamp visual is the "rotation" the user asked for in their Phase 35 redirect. Phase 35 keeps the helper logic and the dropShift math unchanged; the only changes in the bundle are the card Y pickup (`H/3` → `H/2`), the snap-clamp's `maxAbsoluteTop` extension by `H/2`, and the matching `sourceY` in the pan-onEnd snap-in. See Phase 35 below.

---

**Phase 35 (2026-05-07): Y pickup centered + bottom-edge snap-clamp extended; corner-peek X model preserved.** Smoke-test follow-up after Phase 34 shipped. The user came back with three reports and one redirect:

1. *"the card still hovers too far away from the center of the finger, I can't see any improvement with that, it might even be worse."* (Y pickup still felt off after Phase 33's `2H/3` → `H/3`.)
2. *"the bottom edge is 10-15 min worse"* despite RC_WORK_END going from 1050 to 1080 in Phase 34.
3. *"only the one on the right-most side works as expected, it's like you fixed that and broke the others, and kept breaking more every time."* (X reachability complaint.)
4. **Redirect — design constraint, three rapid messages:** *"The drop zone shadow can't be removed from it's relative position to the card. That's non-negotiable."* / *"Well it's negotiable for the right side of the screen. If you need the shadow to move over there, we can talk."* / *"perhaps the shadow shifts to a different position in the right column so it fits in all the sub columns. So instead of it being up and next to the card, it is up above it half way?"*

Reports (1) and (2) are the in-scope fixes for Phase 35. Report (3) reads as a request to abandon the corner-peek aesthetic at first, but the redirect (4) clarifies that the corner-peek is non-negotiable for interior cells, and the right-edge case should ROTATE (not flatten or disappear). Phase 35 implements (1) and (2) with two small parameter changes, and notes that the rotation visual the user described in (4) is **already produced by the existing Phase 34 right-edge / cross-day clamp** when combined with the new H/2 card pickup — no new SharedValue or helper required.

**Issue 1 — Y pickup centered (`H/3` → `H/2`):**

- `DraggableEvent.draggingAnimatedStyle` Y translation: `panYAbs.value - eventHeight.value / 2` (was `panYAbs.value - eventHeight.value / 3`). The finger now sits at the vertical CENTER of the card; 50% of the card is below the finger, 50% above.
- `pan-onEnd` snap-in `sourceY`: `releasePanYAbs - eventHeight.value / 2` (was `... / 3`). The snap-in animation source must match the rendered card position at release; otherwise the slide would visibly teleport the card by `H/6` on the first animated frame.

X pickup is unchanged at `(effectiveWidth * 2) / 3` per the redirect. The corner-peek X relationship between card and ghost (card right of finger by `W/3`, ghost one full lane LEFT of card) is preserved exactly.

**Issue 2 — Bottom-edge snap-clamp extended by `H/2`:**

- `pan-onUpdate` `maxAbsoluteTop`: `layout.height + scrollY.value - eventHeight.value / 2` (was `... - eventHeight.value`). At the new max:
  - card_top = snap_top = `layout.height + scrollY - H/2`
  - card_bottom = card_top + H = `layout.height + scrollY + H/2` (overshoots viewport by `H/2`)
  - ghost_top = snap_top - H/2 = `layout.height + scrollY - H` (Phase 32-34 ghost render unchanged)
  - ghost_bottom = ghost_top + H = `layout.height + scrollY` (= viewport bottom EXACTLY)
  - drop_top in content = snap_top - H/2 (= ghost top, dropShiftY = H/2 unchanged) → drop_end = `layout.height + scrollY` which corresponds in time to grid bottom (RC_WORK_END = 1080 = 6 PM).

The CARD overshoots the viewport bottom by `H/2` at this max, but the GHOST (which the user sees as the drop indicator) sits exactly at viewport bottom. With dropShiftY = H/2 (= drop = ghost), the drop reaches the work-window end (6 PM) cleanly.

This matches Phase 33's accepted top-edge tradeoff: with `H/2` pickup the GHOST extends `H/2` above viewport top when snapped to scrollY (= grid top), but the card top reaches viewport top. The bottom is now the symmetric inverse — card extends `H/2` below viewport bottom, ghost reaches viewport bottom. Both edges are reachable for drop purposes.

snapMin is unchanged at `scrollY` — the user explicitly said "Top edge is FIXED" after Phase 33, so don't touch it.

**Why no new `shadowOffsetYPx` SV:**

The parent-agent spec for Phase 35 proposed adding a SharedValue that animates to `-eventHeight / 2` at the rotation cells, applied as a pixel-Y shift to the ghost render on top of the existing `- pos.height / 2`. That would put the rotation-cell ghost at `pos.translateY - eventHeight` (one full event-height above the snap row, with ZERO overlap between ghost and card). The user's words for the rotation visual were *"it is up above it half way"* — half-overlap, not zero-overlap. Half-overlap above is exactly what falls out of the existing `pos.translateY - pos.height / 2` ghost render combined with the new `H/2` card pickup, with `xStep = 0` (rotation cells) producing ghost-and-card in the SAME lane (versus default's `xStep = -1` producing the lateral L-shape). No SV plumbing needed.

If a future iteration determines the rotation visual is too subtle (ghost-and-card half-overlap looks too similar to the corner-peek L-shape because of the shared `H/2` Y offset), the SV plumbing can be added then. Until then, the cleanest implementation matches the user's "half way" language with zero new infrastructure.

**What did NOT change:**

- `resolveDiscreteShadowOffsetXStep` helper logic — Phase 34's `laneIndex === 0` cross-day clamp and `absoluteLane >= totalLanes - 1` right-edge clamp are both preserved exactly. The `xStep = 0` clamp at those cells is what makes the absolute rightmost lane reachable as a drop target and what prevents cross-day shadow rendering.
- `DropShadow.animatedStyle` translateY — `pos.translateY - pos.height / 2` unchanged. Still produces the half-event-height "above the snap row" geometry that combines with the X step to make either the corner-peek L-shape (default `xStep = -1`) or the rotation visual (clamped `xStep = 0`).
- `pan-onEnd` `dropShiftY = H/2` (mini-cols) — unchanged. Drop at `snap_top - H/2` = ghost top regardless of whether the cell is in default or rotation regime. Drop = ghost in BOTH regimes.
- `pan-onEnd` `dropShiftX` block — Phase 34's helper-as-target logic preserved. Drop X follows the helper's converged target, not the in-flight SV.
- Snap-in `sourceX` and the snap-in `targetX = snapInPos.translateX + snapInPos.ghostShiftX` — unchanged from Phase 29 / 28.1.
- Card pickup X (`(effectiveWidth * 2) / 3`) and the matching pan-onUpdate clamp insets (`(2W/3, W/3)`) — unchanged. The corner-peek geometry is preserved.
- The `[CAL:gesture] snap-in:start` log fields — unchanged.

**Smoke test (next on-device pass):**

- Pickup feel: drag a card → finger should sit at the vertical CENTER of the card (~50/50 above/below finger). Compared to Phase 33 (~33/67 above/below), the card should feel more "anchored to the finger" vertically.
- Bottom edge default cells (e.g. mid-canvas drop): drag a 60-min event so the GHOST bottom touches the viewport bottom. Drop should land at `from = 1020` (5 PM) / `to = 1080` (6 PM). Card visually extends `H/2` below viewport — that's expected.
- Bottom edge rotation cells (e.g. Thu Todd in 4×3, or any day's first lane): same as above. `[CAL:gesture] snap-in:start` should show `shadowOffsetXStepsRounded: 0`, `dropShiftX: 0`, drop in finger's own lane, drop end-time = 6 PM.
- Mid-canvas X reachability: drag through Wed Shaun (lane 1 of Wed in 4×3). Drop will land in Wed Josh (lane 0) per the corner-peek `xStep = -1` rule — that's the documented design (see PLAN-DEVIATION 2026-05-07-x-edge-drop-clamp). To drop AT Wed Shaun, the user points at Wed Trey (which has `xStep = -1` → drop in lane to LEFT = Wed Shaun).
- Top edge: unchanged from Phase 33; drop should reach 5 AM cleanly.
- Cross-day shadow: shadow stays in finger's day at every column boundary (Phase 34 `laneIndex === 0` rule preserved).

**Cleanup if reverted:**

- Restore `translateY: panYAbs.value - eventHeight.value / 3` in `DraggableEvent.draggingAnimatedStyle`.
- Restore `var sourceY = releasePanYAbs - eventHeight.value / 3` in pan-onEnd snap-in.
- Restore `maxAbsoluteTop = layout.height + scrollY.value - eventHeight.value` in pan-onUpdate.
- Drop the Phase 35 callouts in the geometry summary, helper doc-block, DropShadow Y comment, pan-onUpdate Y-clamp comment, pan-onEnd dropShiftX comment, and snap-in sourceY comment.

**Markers:** `// FORK Phase 35 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY, 2026-05-07)` on (a) the `resolveDiscreteShadowOffsetXStep` doc-block addendum (rotation interpretation + non-negotiability of corner-peek), (b) the `DropShadow.animatedStyle` translateY comment block (rotation visual derivation), (c) the `DraggableEvent.draggingAnimatedStyle` Y pickup comment + new `H/2` translation + updated geometry summary, (d) the pan-onUpdate Y-clamp comment block + new `maxAbsoluteTop` formula, (e) the pan-onUpdate clamp-insets comment block (callout that they're unchanged), (f) the pan-onEnd `dropShiftX` block doc-block (callout that the Phase 34 logic survives the redirect), and (g) the pan-onEnd snap-in `sourceY` comment + new value. No new helpers, no new SVs, no new props, no new logs.

> **Update 2026-05-07 (Phase 35.1):** Phase 35's "no new `shadowOffsetYPx` SV needed" judgment was wrong — the user smoke-tested commit `2452d6c` and reported that the middle lane of the rightmost day (Thu Jake in 4×3 mini-cols) was still unreachable as a drop target. Phase 35.1 below adds the missing SV + rotation rule.

---

**Phase 35.1 (2026-05-07): SMOKE-DRIVEN CORRECTION — `shadowOffsetYPx` SV added; rotation rule extended to ENTIRE last visible day.** Smoke-test follow-up to Phase 35 base (commit `2452d6c`). The user confirmed Y edges (top/bottom) are now fixed and X edges (left/right) work for the corner-peek default + Phase 34 clamp cells, but reported one remaining drag bug:

> *"I picked up a card in the middle subcolumn of the right-most column for Thursday, and then kept skipping between the other two sub-columns in that column. It's because I couldn't get the shadow to highlight the middle sub-column."*

**Diagnosis:** in a 4-day × 3-tech mini-cols layout (lanes Josh / Jake / Trey per day, dayCount=4, totalLanes=12), the user picked up event 42911 in Thu Jake (laneIndex=1, absoluteLane=10) and tried to drop it back in Thu Jake. Phase 34's `resolveDiscreteShadowOffsetXStep` rules:

| Rule | Cell | xStep |
|---|---|---|
| `laneIndex === 0` (cross-day) | Mon/Tue/Wed/Thu Josh | 0 |
| `absoluteLane >= totalLanes - 1` (absolute-rightmost) | Thu Trey only | 0 |
| Default (corner-peek) | Everything else | -1 |

For Thu Jake: rule 1 doesn't fire (laneIndex=1), rule 2 doesn't fire (absoluteLane=10 ≠ 11), so default `-1` returns. The Phase 34 helper-as-target swap puts the drop in `(finger lane - 1)` = Thu Josh. Pointing at Thu Trey lands in Thu Trey (rule 2 fires), pointing at Thu Josh lands in Thu Josh (rule 1 fires + corner-peek shifts to Wed Trey but cross-day clamps it back to Thu Josh). **Thu Jake had no path** — the user "skipped between the other two sub-columns" exactly as they described.

**User redirect (three rapid messages on the same day, before any code was written):**

1. *"The drop zone shadow can't be removed from it's relative position to the card. That's non-negotiable."*
2. *"Well it's negotiable for the right side of the screen. If you need the shadow to move over there, we can talk."*
3. *"perhaps the shadow shifts to a different position in the right column so it fits in all the sub columns. So instead of it being up and next to the card, it is up above it half way?"*

"All the sub columns" = ALL THREE LANES of the rightmost day, not just the absolute-rightmost lane. The Phase 35 base attempted to interpret this as "Phase 34's existing `xStep = 0` clamp + the new H/2 card pickup naturally produces the rotation visual" — that was correct for Thu Trey only (which had `absoluteLane >= 11`), but Thu Jake / Thu Josh remained on the corner-peek default path. Phase 35.1 fixes this by extending the rotation trigger.

**The rotation rule (Phase 35.1):**

```js
// In resolveDiscreteShadowOffsetXStep (helper):
if (columnCount > 1 && colIndex === columnCount - 1) {
  return { xStep: 0, yPx: -eventHeight / 2 };
}
// ... cross-day, single-day right-edge, default rules unchanged
```

For ANY lane of the LAST visible day, return `{ xStep: 0, yPx: -eventHeight / 2 }`. The helper now returns an OBJECT instead of a bare number — both call sites (the `useAnimatedReaction` driving the SVs, and pan-onEnd's `dropShiftX` / `dropShiftY` block) destructure the return.

The Phase 32 `absoluteLane >= totalLanes - 1` rule is now subsumed by the rotation rule for the multi-day case (the absolute-rightmost lane is always in the last visible day; the rotation catches it). The rule is preserved in the helper for the `columnCount === 1` (single-day-view) case where rotation does NOT fire.

**Visual outcome (Option B per the spec — chosen for "shadow directly above card" cleanness):**

| Cell class | Card render X | Shadow render X | Shadow render Y (content) | Drop X (lane) | Drop Y (time) |
|---|---|---|---|---|---|
| Interior (default corner-peek) | `panX - 2W/3` (corner-peek) | `snap_X - laneWidth` (lane LEFT of finger) | `snap_top - H/2` | finger's lane minus 1 | `snap_top - H/2` (= card_top - 30 min) |
| Cross-day first lane (Tue/Wed/Thu Josh in 4×3) | `panX - 2W/3` (corner-peek) | `snap_X` (finger's lane) | `snap_top - H/2` | finger's lane | `snap_top - H/2` |
| Last visible day, ANY lane (Phase 35.1 rotation) | **`snap_X` (lane-snapped)** | `snap_X` (finger's lane) | **`snap_top - H` (one full H above)** | finger's lane | `snap_top - H` |

The card-vs-ghost spatial relationship is preserved across all cells: shadow is ABOVE-AND-LEFT of card by H/2 in default, ABOVE-AND-IN-SAME-LANE in cross-day, and DIRECTLY-ABOVE in rotation. The card never has the ghost on its right; the user's "non-negotiable" relative position holds.

**`shadowOffsetYPx` SharedValue (new):**

- Declared in `CalendarInner` as `Animated2.useSharedValue(0)` alongside `shadowOffsetXSteps`.
- Driven by a parallel `useAnimatedReaction` block: same input function structure as the X SV, but reads `resolved.yPx` instead of `resolved.xStep`. Two reactions instead of one packed integer for clarity — the helper call cost is bounded by the change-detector and the helper body is a few worklet primitives.
- Animated to `-eventHeight / 2` via `withTiming(150ms)` when entering rotation cells; back to `0` via the same timing curve when leaving. The 150ms cadence matches the existing X-axis convergence and the post-release snap-in slide, so the rotation enters/exits at the same visual feel.
- Read by `DropShadow.animatedStyle` (applied to translateY) and by `DraggableEvent.draggingAnimatedStyle` (used to gate the Option B card lane-snap).
- Read at TARGET in pan-onEnd (`ghostStepResolvedYPx = resolveDiscreteShadowOffsetXStep({...}).yPx`) — NOT `Math.round(shadowOffsetYPx.value)` — to extend Phase 34's helper-as-target invariant from one axis to two. Avoids the same in-flight-SV bug Phase 34 fixed for X.

**Option B card lane-snap in `DraggableEvent.draggingAnimatedStyle`:**

When `shadowOffsetYPx.value !== 0` (= rotation state) AND `bodyBlockWidth > 0` AND `techCount >= 2`:

```js
var laneWidthForCard = bodyBlockWidth / techCount;
// ... lane resolution from panXAbs.value, TIME_LABEL_WIDTH, bodyBlockWidth, techCount, columnCount
translateXValue = TIME_LABEL_WIDTH + clampedColIdx * bodyBlockWidth + clampedLaneIdx * laneWidthForCard - scrollX.value;
```

The card lane-snaps to the finger's lane center, replacing the corner-peek `panXAbs.value - (effectiveWidth * 2) / 3` formula. When `shadowOffsetYPx.value === 0` (= default / cross-day), the corner-peek formula is used unchanged. This is a CONDITIONAL lane-snap — the existing PLAN-DEVIATION 2026-05-06-card-floats-ghost-snaps anti-instruction (which forbids unconditional lane-snap) was updated to allow the conditional rotation-only branch.

The `bodyBlockWidth`, `techCount`, `columnCount`, `scrollX` props are read inside the worklet via closure-capture — NOT added to the deps list (per the Phase 29 anti-instruction, which still applies for the same perf reason). They're stable during a drag (drag in flight blocks structural changes), so closure-capture is sufficient.

**Card-jump on rotation entry/exit:** when the user drags from an interior column into the last visible day, the card visibly shifts horizontally from `panX - 2W/3` to `snap_X` (lane left edge of finger's lane). The jump magnitude depends on where in the lane the finger is — `W/6` for finger at lane center, up to `2W/3` for finger at lane left edge. Documented as a known artifact of Option B; the user accepted "card-vs-finger isn't part of the non-negotiable" in their redirect. If smoke testing reveals the jump is too jarring, the next iteration could animate `panXAbs.value - 2W/3` → `snap_X` via withTiming on rotation entry.

**Drop math (Y axis) in rotation:**

- `dropShiftY = inMiniColsForDrop ? eventHeight.value / 2 - ghostStepResolvedYPx : 0`. For default (yPx=0): dropShiftY = H/2 (unchanged). For rotation (yPx=-H/2): dropShiftY = H.
- `finalEventTop = panYAbs.value - eventHeight.value / 2 - dropShiftY + scrollY.value`. For default: `snap_top - H/2`. For rotation: `snap_top - H`.
- Drop end-time = `finalEventTop + duration`. For 60-min event in rotation: drop_end = `snap_top - 80 + 80 = snap_top`. Compared to default's drop_end = `snap_top - 40 + 80 = snap_top + 40` (= card_bottom in content). Rotation's drop_end is `H/2` EARLIER in time than default's at the same `snap_top`.

**Known tradeoff (acknowledged in code + here):** rotation cells at the bottom edge of the viewport may not reach `RC_WORK_END = 1080` (6 PM) for longer events. The Phase 35-base snap clamp `maxAbsoluteTop = layout.height + scrollY - eventHeight / 2` was sized for the default `dropShiftY = H/2`; in rotation `dropShiftY = H` shifts drop_top another H/2 earlier. For a 60-min event in rotation at the extended bottom (`snap_top = 1000` with H=80, scrollY=647, layout=393): `drop_top = 920` → `from = 4:30 PM`, `to = 5:30 PM` (instead of `from = 5:00 PM`, `to = 6:00 PM` for default cells). 30 min short for 60-min events, ~15 min short for 30-min events.

The fix (deferred until smoke confirms it matters): extend `maxAbsoluteTop` by `|shadowOffsetYPx.value|` in pan-onUpdate so rotation cells get an extra H/2 of clamp room. The card would overshoot the viewport by H (one full event-height) at the rotation max, vs H/2 in default; the user may find this acceptable since the GHOST sits at viewport bottom in both cases. We did NOT implement this in Phase 35.1 because the user's primary complaint was Thu Jake unreachable as a drop target (X axis), not bottom-edge-in-rotation reaches 6 PM (Y axis). If the user reports the rotation-bottom issue on the next smoke pass, the fix is one line in pan-onUpdate.

**Snap-in slide:**

- `sourceX`: in rotation at release, `snapInPos.translateX` (= lane left edge in viewport coords) — matches the lane-snapped card position. In non-rotation: `releasePanXAbs - (effW * 2) / 3` (= corner-peek X) per Phase 29.
- `sourceY`: `releasePanYAbs - eventHeight.value / 2` — matches the H/2 card pickup. Same in both default and rotation cases.
- `targetX`: `snapInPos.translateX + snapInPos.ghostShiftX` — unchanged from Phase 29 / 28.1. In rotation: `snap_X + 0 = snap_X`. In default: `snap_X - laneWidth`.
- `targetY`: `adjustedFinalEventTop - scrollY.value` — automatically reflects the new `dropShiftY` (= H/2 default, H rotation).

In rotation, `sourceX === targetX` (both at `snap_X`) so the X axis of the slide is degenerate. `sourceY → targetY` slides UP by `H` (vs `H/2` in default). The 150ms `withTiming` cadence is unchanged for visual coherence with the X-axis convergence cadence.

**`[CAL:gesture] snap-in:start` log additions:**

- `shadowOffsetYPx`: in-flight SV value at release (potentially mid-`withTiming`).
- `shadowOffsetYPxRounded`: helper's TARGET yPx at release (= what dropShiftY actually used). Same pattern as `shadowOffsetXSteps` / `shadowOffsetXStepsRounded` from Phase 32+34.
- `dropShiftY`: the resolved `eventHeight/2 - ghostStepResolvedYPx` value.
- `inRotationAtRelease`: boolean (= `ghostStepResolvedYPx !== 0`). Tells you at a glance which cell class the drop fell into.

**Smoke test (next on-device pass — specifically look for these):**

| Cell | Expected `shadowOffsetXStepsRounded` | Expected `shadowOffsetYPxRounded` | Expected `inRotationAtRelease` | Expected `landedResourceId` |
|---|---|---|---|---|
| Mon Josh (first day, first lane) | 0 (cross-day) | 0 | false | Mon Josh |
| Mon Jake (first day, mid lane) | -1 (corner-peek) | 0 | false | Mon Josh (per corner-peek) |
| Mon Trey (first day, last lane) | -1 → drop in Mon Jake (corner-peek) | 0 | false | Mon Jake (Mon Trey unreachable per existing tradeoff) |
| Tue Josh / Wed Josh (interior day, first lane) | 0 (cross-day) | 0 | false | Tue Josh / Wed Josh (no cross-day shadow) |
| Tue Jake / Wed Jake (interior, mid) | -1 (corner-peek) | 0 | false | Tue Josh / Wed Josh |
| Tue Trey / Wed Trey (interior, last lane) | -1 → drop in Tue Jake / Wed Jake | 0 | false | Tue Jake / Wed Jake (Tue/Wed Trey unreachable per existing tradeoff) |
| Thu Josh (last day, first lane) | 0 (rotation, NOT cross-day) | -H/2 (e.g. -40 for H=80) | true | Thu Josh |
| **Thu Jake (last day, mid lane) — THE FIX** | **0 (rotation)** | **-H/2** | **true** | **Thu Jake** |
| Thu Trey (last day, last lane) | 0 (rotation) | -H/2 | true | Thu Trey |

After Phase 35.1 ships, Thu Jake becomes reachable as a drop target. The other "unreachable" cells (last lane of every NON-last day — Mon/Tue/Wed Trey in 4×3) remain unreachable per the existing `2026-05-07-x-edge-drop-clamp` accepted trade-off. The user has confirmed they're OK with that pattern.

**Cleanup if reverted:**

- Remove the `shadowOffsetYPx` SharedValue declaration in `CalendarInner` (around the `shadowOffsetXSteps` declaration site).
- Remove the second `useAnimatedReaction` block (the one driving `shadowOffsetYPx`).
- Restore `resolveDiscreteShadowOffsetXStep` to return a bare number (`-1` or `0`) instead of `{ xStep, yPx }`. Drop the `eventHeight` arg.
- Restore the helper's body to Phase 34 (cross-day + absolute-rightmost rules, default `-1`).
- Restore the call sites: `useAnimatedReaction` reads the bare number; pan-onEnd `ghostStepDiscrete = resolveDiscreteShadowOffsetXStep({...})` reads the bare number.
- Restore `dropShiftY = inMiniColsForDrop ? eventHeight.value / 2 : 0` (drop the `- ghostStepResolvedYPx` term).
- Restore `DropShadow.animatedStyle` translateY to `pos.translateY - pos.height / 2` (drop the `+ shadowOffsetYPx.value` term). Remove the `shadowOffsetYPx` prop.
- Restore `DraggableEvent.draggingAnimatedStyle` to the unconditional `panXAbs.value - (effectiveWidth * 2) / 3` translateX. Remove the `shadowOffsetYPx` prop and the conditional rotation lane-snap branch.
- Restore `sourceX = releasePanXAbs - (effW * 2) / 3` (drop the `inRotationAtRelease ? snapInPos.translateX : ...` ternary).
- Drop the new `shadowOffsetYPx`, `shadowOffsetYPxRounded`, `dropShiftY`, `inRotationAtRelease` log fields.
- Drop the `shadowOffsetYPx` JSX wiring on the DropShadow + DraggableEvent components in CalendarInner.
- Caveat: reverting re-introduces the Thu Jake unreachable bug and any analogous "middle lane of last day" bug for other roster sizes.

**Markers:** `// FORK Phase 35.1 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY, 2026-05-07)` on (a) the `resolveDiscreteShadowOffsetXStep` doc-block addendum (smoke evidence + new return shape + rotation rule), (b) the `resolveDiscreteShadowOffsetXStep` body (rotation branch + `eventHeight` arg + new `{ xStep, yPx }` return shape), (c) the `shadowOffsetYPx` SV declaration, (d) the second `useAnimatedReaction` block + the first reaction's updated body destructuring `resolved.xStep`, (e) the pan-onEnd `dropShiftX` + `dropShiftY` block (helper destructure + `dropShiftY = H/2 - ghostStepResolvedYPx`), (f) the pan-onEnd snap-in `sourceX` ternary, (g) the snap-in:start log additions, (h) the `DropShadow` prop block + translateY addition, (i) the `DraggableEvent` prop block + conditional lane-snap branch, (j) the geometry summary in `DraggableEvent.draggingAnimatedStyle`, and (k) the JSX wiring for both `DropShadow` and `DraggableEvent` in CalendarInner.

---

### FORK Phase 36 (PR-UX-11, 2026-05-09): lane-aware drag-init seed

**Problem.** The doubleTap drag-init worklet seeded `panXAbs` to the COLUMN center on pickup:

```js
const selectedAppointmentStartedX =
  TIME_LABEL_WIDTH + APPOINTMENT_BLOCK_WIDTH/2 + APPOINTMENT_BLOCK_WIDTH * screenColumn;
```

In single-tech / non-mini-cols modes that's correct (the card occupies the full column). In mini-cols mode, each card occupies a SINGLE LANE (= `colWidth / techCount`). For 6 techs at column-width 178pt, each lane is ~30pt, so the column-center seed is up to ~74pt from a side-lane card's actual position. Combined with the corner-peek `card.translateX = panXAbs - 2W/3` formula in `DraggableEvent.draggingAnimatedStyle`, the floating card visibly "jumped" from the source-card position to a position ~80pt away on pickup — well outside the user's finger.

User report (PR-UX-9 smoke 2026-05-09): *"the cards show up pretty far from my finger when I pick them up after 4+ techs, and really start to shift away at even 3 techs."* The `[DIAG-DRAG-OFFSET]` log added in PR-UX-9's diagnostic pass confirmed the BODY_BLOCK_WIDTH was 178.5pt, lane width 29.75pt, and the corner-peek X offset `cardTranslateXOffsetFromFingerPx: -19.83` was correct in absolute terms — but the `seededPanXAbs` field (added in this phase) made it obvious that the seed was at the column center, not the source lane.

**Fix.** Compute the dragged card's lane index from the LIVE `bodyResourceIds` (via two new refs `bodyResourceIdsRef` + `multiTechModeRef` mirrored alongside `apptWidthRef` / `pickupVisualWidthRef`). Seed `panXAbs` at the lane center:

```js
const inMiniColsAtPickup = isMultiDay2
  && multiTechModeRef.current === "mini-columns"
  && (bodyResourceIdsRef.current?.length ?? 0) >= 2;
const laneCount = inMiniColsAtPickup ? bodyResourceIdsRef.current.length : 1;
const laneWidth = APPOINTMENT_BLOCK_WIDTH2 / laneCount;
const laneIndex = inMiniColsAtPickup
  ? Math.max(0, bodyResourceIdsRef.current.indexOf(event.resourceId))
  : 0;
const selectedAppointmentStartedX =
  TIME_LABEL_WIDTH
  + APPOINTMENT_BLOCK_WIDTH2 * screenColumn
  + laneIndex * laneWidth
  + laneWidth / 2;
```

For non-mini-cols modes the formula degrades to the legacy column-center seed (laneCount=1, laneIndex=0):

```
TIME_LABEL_WIDTH + colWidth * screenColumn + 0 + colWidth/2
= TIME_LABEL_WIDTH + colWidth/2 + colWidth * screenColumn
= legacy formula
```

— bit-identical, no regression risk for 1-tech / stacked / single-day modes.

**Why we kept the corner-peek formula unchanged.** The user's PR-UX-9 redirect (and earlier Phase 33 instructions) said *"The drop zone shadow can't be removed from its relative position to the card. That's non-negotiable."* The corner-peek `card.translateX = panXAbs - 2W/3` formula is what produces the L-shape ghost-vs-card relationship. Phase 36 only changes the SEED for `panXAbs`; the per-frame card render math and the drop math (`finalizeDrag`'s lane-resolution from finger position) are both unchanged.

**Why this wasn't caught earlier.** Mini-cols was the most recent rendering mode (Phase 14 + downstream) and the geometry conventions migrated incrementally. Single-tech and stacked modes never exposed this — both render the card column-wide, so column-center IS the card center.

**Cleanup if reverted:**

- Remove `bodyResourceIdsRef` + `multiTechModeRef` declarations near `apptWidthRef`.
- Remove the two `bodyResourceIdsRef.current = bodyResourceIds; multiTechModeRef.current = multiTechMode;` assignments from the `apptWidthRef` useEffect.
- Restore `selectedAppointmentStartedX = TIME_LABEL_WIDTH + APPOINTMENT_BLOCK_WIDTH2/2 + APPOINTMENT_BLOCK_WIDTH2 * screenColumn` in the doubleTap drag-init.
- Remove the `inMiniColsAtPickup` / `laneCountAtPickup` / `laneWidthAtPickup` / `laneIndexAtPickup` local vars and the `[DIAG-DRAG-OFFSET] drag-init` log block.
- Caveat: reverting re-introduces the user-visible "card jumps away from finger on pickup" bug for any non-middle lane in mini-cols mode.

**Markers:** `// FORK Phase 36 (PR-UX-11, 2026-05-09)` on (a) the `bodyResourceIdsRef` + `multiTechModeRef` declarations, (b) the two `.current = ...` assignments inside the `apptWidthRef` useEffect, (c) the lane-aware seed block in the doubleTap drag-init, and (d) the `[DIAG-DRAG-OFFSET] drag-init` log block.

---

### FORK Phase 37 (PR-UX-14, 2026-05-09): suppress native long-press after a successful double-tap

**Problem.** EventBlock's gesture model (Phase 17 onwards) uses JS-side double-tap detection on RN's `TouchableOpacity` to drive drag-init: a second touch-down inside `DOUBLE_TAP_WINDOW_MS` (280ms) of a prior tap fires `onDoubleTap` (which the consumer wires to drag-init + pickup haptic). The first-tap's `onPress` is delayed via a `setTimeout(280ms)` so the second tap can pre-empt it. That part works.

What was missing: `TouchableOpacity` ALSO carries a native long-press timer (default ~500ms) that runs in parallel with the JS-side double-tap detection and IS NOT cancelled when `handlePressIn` detects the double-tap. So the call stack on a slow double-tap-and-hold is:

1. T=0 — tap 1 down → `handlePressIn` (no double-tap yet, `lastTapAtRef` was 0).
2. T=50 — tap 1 up → `handlePress` → schedules `pendingSingleTapRef` for T=330.
3. T=200 — tap 2 down → `handlePressIn` detects double (elapsed 150 < 280, `pendingSingleTapRef` set) → cancels timeout, sets `doubleTapHandledRef.current = true`, fires `onDoubleTap(event)` → drag-init runs (`setSelectedEvent`, `setDragReady`, `triggerHaptic("Medium")`).
4. T=200-700 — user is HOLDING tap 2 (drag pan hasn't activated yet — they haven't moved finger far enough for the parent panGesture to grab the touch).
5. T=700 — RN's native long-press timer for tap 2 fires → `onLongPress` callback → consumer's `onEventLongPress(event)` → consumer opens its `QuickActionToast` ON TOP OF the in-flight drag.

User-visible result: the user double-taps a card, gets the pickup haptic, starts dragging, and then a "drawer" (the QuickActionToast — same dark pill as `SwapToast`, anchored at `bottom: 24`, with the customer's name + service detail) appears. Sometimes the resulting state crashed the app on REMITechnician PR-UX-13 smoke pass. The smoking-gun log pattern is `[CAL:longPress]` (consumer logs at the start of `handleRCEventLongPress`) immediately followed by `[DEBUG:Toast/QuickAction] shown` while the drag is still in flight (`isDragging.value === true` per `[CAL:gesture]` logs from the same window).

The user reported this on REMITechnician PR-UX-13 smoke (2026-05-09) as: *"Sometimes when I go to pick up an appointment card... I'll get the haptic feedback of picking it up, and dragging it around, but what actually happens is the drawer with the customers info pops up until I back out of that and try again. That's what made (or at least when) the app crash the first time."*

**Fix.** The `doubleTapHandledRef` ref that already gates `handlePress` (preventing the post-double-tap single-tap detail-sheet open in step 6 below) now ALSO gates the `onLongPress` callback:

```js
onLongPress: () => {
  if (doubleTapHandledRef.current) return;
  onLongPress && onLongPress(event);
},
```

The ref is reset inside `handlePress` after the press cycle completes (Phase 22 invariant), so the next press cycle still fires its own long-press normally. We also explicitly set `delayLongPress: 500` (matches RN's documented default) for clarity at the call site — the actual fix is the gate, but pinning the value makes the timing budget visible and prevents an upstream RN change from silently shortening it.

**Why we did NOT switch to the user-suggested RNGH `Gesture.Exclusive(double, single)` composition.** The user's correction prompt suggested re-architecting the EventBlock gesture to RNGH composed gestures. That's a significantly larger change (we'd need to rewrite `handlePress` / `handlePressIn` / `handlePressOut` / `onLongPress`, replace `TouchableOpacity` with `GestureDetector` + a plain `View`, re-validate the entire `selectedAppointment + dragReady` cascade against the new gesture state machine, AND verify it still cooperates with the parent calendar `panGesture`). The targeted gate fix is one line, low-risk, preserves every other Phase 17 / Phase 17.1 / Phase 22 invariant, and directly addresses the smoking gun. If a future ticket genuinely needs the RNGH refactor (e.g. for cross-platform a11y consistency), Phase 37 is forward-compatible — the JS-side detection can be removed wholesale and the gate will be vacuous.

**Why this wasn't caught earlier.** Pre-PR-UX-14, the typical double-tap-and-drag was fast enough that the user lifted-and-moved before the 500ms long-press timer expired. On conflicted cards in landscape (where the user reported the bug), the visual feedback of the conflict overlay + the cluster of overlapping cards apparently caused users to hold the second tap longer before starting to drag — pushing the touch into the long-press timer window. Once we have the gate, the timing of the second-tap's hold no longer matters.

**Cleanup if reverted:**
- Remove the `if (doubleTapHandledRef.current) return;` line from the `onLongPress` callback.
- Remove the explicit `delayLongPress: 500` prop (was implicit before).
- Caveat: reverting re-introduces the "QuickActionToast appears mid-drag on conflicted cards" bug AND re-opens the suspected crash path that the user reported on the PR-UX-13 smoke.

**Markers:** `// FORK Phase 37 (PR-UX-14, 2026-05-09)` on the EventBlock `TouchableOpacity` `onLongPress` block in `dist/index.js` (the gate + the explicit `delayLongPress` value + the rationale comment).

---

### FORK Phase 38 (PR-UX-14, 2026-05-09): rotation rule extends to rightmost lane of EVERY day

**Problem.** Phase 35.1 made the entire LAST visible day's lanes reachable as drop targets via the rotation rule (shadow shifts up by `H/2` and stays in the finger's own lane, so all 3 lanes of Thu in a 4×3 grid become drop targets — including the previously-unreachable Thu Jake / Thu Trey middle/right cells). The rotation rule was deliberately scoped to `colIndex === columnCount - 1` only because the original user redirect that produced it ("perhaps the shadow shifts to a different position in the right column so it fits in all the sub columns") spoke specifically about "the right column." The mid-day rightmost lanes (Mon Trey, Tue Trey, Wed Trey in the 4×3 example) were left under the corner-peek rule (`xStep: -1`), which made them visually misleading: pointing at Mon Trey rendered the shadow in Mon Jake — the lane to the LEFT of the finger — and snapped the released card visually into Mon Jake even though `finalizeDrag`'s `resolveLandedResourceId` correctly committed the data to Mon Trey (it reads `xWithinColumn` directly with no corner-peek shift). The visual / data mismatch meant the user could not confidently target Mon Trey and reported it as "Still no shadow or drop ability into the last sub-column on the right of each column except for the last column on the right side of the screen next to the avatar strip."

This is the long-promised fix for the `2026-05-07-x-edge-drop-clamp` PLAN-DEVIATION's "structurally unreachable: last lane of every NON-last day" caveat.

**Fix.** Extend the rotation branch in `resolveDiscreteShadowOffsetXStep` to also trigger when the finger is in the LAST LANE of any day (not just every lane of the last day). The new combined branch:

```js
if (columnCount > 1 && (colIndex === columnCount - 1 || laneIndex === techCount - 1)) {
  return { xStep: 0, yPx: -halfHeight };
}
```

UX consequences per cell class in a 4-day × 3-tech mini-cols grid:

| Cell | Phase 35.1 behaviour | Phase 38 behaviour |
|---|---|---|
| Mon Josh / Tue Josh / Wed Josh (cross-day, lane 0) | xStep:0 (cross-day clamp) — shadow in own lane, no Y shift | unchanged |
| Mon Jake / Tue Jake / Wed Jake (interior, mid lane) | xStep:-1 (corner-peek) — shadow one lane LEFT, no Y shift | unchanged |
| Mon Trey / Tue Trey / Wed Trey (interior, last lane) | xStep:-1 (corner-peek) — shadow one lane LEFT, snap visually into Mon Jake / Tue Jake / Wed Jake. `finalizeDrag` commits to Mon Trey / Tue Trey / Wed Trey (data correct, visual misleading) | **xStep:0, yPx:-H/2 (rotation) — shadow in own lane shifted up by H/2. Snap visually into the same cell. Data unchanged.** |
| Thu Josh / Thu Jake / Thu Trey (last day, all lanes) | xStep:0, yPx:-H/2 (rotation) | unchanged |

Mid-day non-rightmost-lane corner-peek behaviour is preserved because the original `H/2 above the card` ghost rendering position is what makes the shadow VISIBLE while the card occupies the lane — at mid-canvas the user expects the L-shape relationship Phase 33 codified as non-negotiable. The rotation rule only fires at the rightmost lane (where corner-peek fails because there's no lane to the LEFT inside the SAME day, and the cross-day lane-LEFT spill that pre-Phase-34 used was the original "shadow crossed day boundary" bug).

**Why the cross-day (laneIndex === 0) clamp stays.** Without it, the leftmost lane of any non-first day would still want corner-peek into the previous day's last lane → re-introduces the pre-Phase-34 bug. The order of branches in the helper matters: rotation rule fires first (now covers rightmost lane of every day + all lanes of last day), THEN cross-day clamp catches `laneIndex === 0`, then default `xStep: -1` for mid-canvas non-rightmost lanes.

**Why we did NOT also extend rotation to single-day mode.** Phase 35.1's rotation rule was gated on `columnCount > 1` because single-day mode renders each tech as a full FlashList row (the `mode === "day"` branch in `resolveLandedResourceId`), so the corner-peek geometry never applies — every cell is already its own row. Phase 38 keeps the same `columnCount > 1` gate.

**Why we did NOT touch `finalizeDrag`'s `resolveLandedResourceId`.** It already does the right thing: it reads `xWithinColumn` and computes the lane the FINGER is in, ignoring the visual shadow position. The shadow's job is purely to PREVIEW where the drop will land; the drop itself is keyed on the finger position. Phase 38 makes the preview match the drop for the last-lane cells. Mid-day non-last-lane cells continue to preview one lane LEFT of where the drop will land — that's the existing corner-peek L-shape that the user accepted in Phase 33.

**Smoke test (the PR-UX-14 expected pattern):**

| Cell | Expected `shadowOffsetXStepsRounded` (was) | Expected `shadowOffsetXStepsRounded` (now) | Expected `shadowOffsetYPxRounded` (now) | Expected `landedResourceId` |
|---|---|---|---|---|
| Mon Trey (interior, last lane) — THE FIX | -1 (corner-peek, snap into Mon Jake visually) | **0 (rotation)** | **-H/2** | **Mon Trey** |
| Tue Trey, Wed Trey | -1 | **0** | **-H/2** | **Tue Trey, Wed Trey** |
| Mon Jake, Tue Jake, Wed Jake (interior, mid lane) | -1 (corner-peek into Mon Josh visually) | unchanged: -1 (corner-peek) | 0 | Mon Josh / Tue Josh / Wed Josh (per existing accepted trade-off) |
| Mon Josh / Tue Josh / Wed Josh (cross-day, lane 0) | 0 | unchanged: 0 | 0 | own cell |
| Thu Josh / Thu Jake / Thu Trey | 0 (Phase 35.1 rotation) | unchanged: 0 (rotation) | -H/2 | own cell |

After Phase 38 ships, the user's "rightmost sub-column unreachable" complaint resolves for all 3 mid-day rightmost cells AND the last-day's rightmost cell continues to work (it was already covered by Phase 35.1).

**`2026-05-07-x-edge-drop-clamp` PLAN-DEVIATION update.** The "structurally unreachable: last lane of every NON-last day" caveat is RESOLVED by Phase 38. The deviation entry's anti-instructions are updated to note that the rotation rule now fires on `colIndex === columnCount - 1 || laneIndex === techCount - 1` (was just `colIndex === columnCount - 1`).

**Cleanup if reverted:**
- Restore `resolveDiscreteShadowOffsetXStep`'s rotation branch to `if (columnCount > 1 && colIndex === columnCount - 1)` only.
- Caveat: reverting re-introduces the "rightmost sub-column of every non-last day visually unreachable" complaint that PR-UX-14 closes.

**Markers:** `// FORK Phase 38 (PR-UX-14, 2026-05-09)` on the rotation branch inside `resolveDiscreteShadowOffsetXStep` body and the doc-block addendum above the helper.

---

### FORK Phase 39 (PR-UX-14, 2026-05-09): rotation everywhere in multi-day mode (closes the `2026-05-07-x-edge-drop-clamp` deviation entirely)

**Problem.** Phase 38 made `lane techCount-1` of every day reachable as a drop target by switching that lane to the rotation rule (`xStep:0, yPx:-H/2`). All other interior multi-day lanes still used the corner-peek rule (`xStep:-1, yPx:0`), which shifts BOTH the visual shadow AND the data drop one lane LEFT. Combined, the per-lane mapping in a 4-day × 6-tech grid for a non-last day became:

| Finger lane | Rule | Drop lane |
|---|---|---|
| 0 (Josh) | cross-day clamp | 0 (Josh) |
| 1 (Jake) | corner-peek | 0 (Josh) |
| 2 (Todd) | corner-peek | 1 (Jake) |
| 3 (Dan) | corner-peek | 2 (Todd) |
| 4 (Shaun) | corner-peek | 3 (Dan) |
| 5 (Trey) | rotation (Phase 38) | 5 (Trey) |

Every drop lane has ≥1 finger position pointing at it EXCEPT lane 4 (Shaun): no finger position drops into Shaun. The user reported on the PR-UX-14 follow-up smoke that the dead zone moved from Trey (Phase 37 and earlier) to Shaun: *"Finalize didn't work, and now the zone that can't be dropped in is 1 to the left (the blue column on this screenshot) of the right-most subcolumn."* The "blue column" was Shaun in the test data.

The dead zone is structural — corner-peek's `lane N → drop N-1` mapping plus rotation's `lane techCount-1 → drop techCount-1` mapping always leaves `lane techCount-2` unreachable, regardless of how many techs are in the grid. Adding another isolated rotation cell at `lane techCount-2` would just shift the dead zone to `lane techCount-3`. The only way to eliminate the dead zone systemically is to use the SAME mapping for every lane.

**Fix.** Extend rotation to ALL multi-day lanes — every lane uses `{ xStep: 0, yPx: -halfHeight }`. The mapping becomes `lane N → drop N` for every N ∈ [0, techCount-1]. Every lane is reachable by exactly one finger position; no gaps.

```js
if (columnCount > 1) {
  return { xStep: 0, yPx: -halfHeight };
}
// single-day mode (columnCount === 1) keeps the original
// corner-peek + cross-day-clamp + rightmost-flat-clamp logic
```

UX consequences per cell class in a 4-day × 6-tech mini-cols grid:

| Cell | Phase 38 behaviour | Phase 39 behaviour |
|---|---|---|
| Lane 0 (Josh, cross-day boundary) | xStep:0 (cross-day clamp) — shadow in own lane, no Y shift | **xStep:0, yPx:-H/2 (rotation)** — shadow in own lane shifted up by H/2 |
| Lanes 1..techCount-2 (Jake, Todd, Dan, **Shaun**) | xStep:-1 (corner-peek) — shadow one lane LEFT, no Y shift, drop in N-1 | **xStep:0, yPx:-H/2 (rotation)** — shadow in own lane shifted up, drop in own lane |
| Lane techCount-1 (Trey, every day's rightmost) | xStep:0, yPx:-H/2 (rotation, Phase 38) | unchanged |
| Last day, all lanes | xStep:0, yPx:-H/2 (rotation, Phase 35.1) | unchanged |

Single-day mode (`columnCount === 1`) keeps Phase 32's original corner-peek + cross-day-clamp + rightmost-flat-clamp because the day-boundary failure mode that motivated rotation doesn't exist there — the only column IS the visible day, and the corner-peek's "shadow up-and-LEFT" gives the user a visible preview that the rotation's "shadow above the card" would also give but at the cost of changing the long-standing single-day visual.

**Trade-off.** The corner-peek "shadow up-and-LEFT of the card" visual that Phase 33 codified as non-negotiable for mid-canvas is removed for multi-day mode. The user previously approved the rotation visual ("perhaps the shadow shifts to a different position in the right column ... up above it half way" — Phase 35.1 commit message) for the right column, then for the rightmost lane of every day (Phase 38). The user's PR-UX-14 follow-up message ("Please look into this past fix more for ideas") implicitly authorizes extending the rotation visual further to fix the dead zone, since the dead zone was the explicit complaint and the only structural fix is rotation-everywhere. The rotation visual was already in use for the rightmost lane of every day, so extending to the rest of the day is a small visual delta — the user will see "shadow above card" instead of "shadow up-and-left of card" in mid-canvas, with the upside that every lane is reachable.

**Why we did NOT touch `finalizeDrag`'s `resolveLandedResourceId`.** Same reason as Phase 38: the function reads `xWithinColumn` (which itself is `panXAbs - dropShiftX` per pan-onEnd), not the discrete xStep. With rotation everywhere, `dropShiftX = 0` (because `xStep = 0`), so `xWithinColumn` equals the finger's position, and `resolveLandedResourceId` returns the lane the finger is in. ✓

**Why we did NOT extend rotation to single-day mode.** In single-day mode the grid is `1 × techCount`. The rightmost-flat-clamp + corner-peek + cross-day-clamp combination already gives `lane 0 → drop 0`, `lane 1 → drop 0`, `lane 2 → drop 1`, ..., `lane techCount-1 → drop techCount-1` (rightmost flat clamp). The unreachable lane in this mapping is `lane techCount-2` — same structural gap as multi-day. **However**, single-day mode in this calendar uses a different rendering path (`mode === "day"` branch in `resolveLandedResourceId`), and the user has not reported the dead zone there. Phase 39 keeps single-day untouched as a conservative scope-limiter. If the user reports the dead zone in single-day, the same `if (columnCount >= 1)` (i.e. always-true) extension would close it.

**`2026-05-07-x-edge-drop-clamp` PLAN-DEVIATION update.** Phase 38 closed the "last lane of every NON-last day" caveat. Phase 39 closes the implicit "second-to-last lane of every non-last day" caveat that Phase 38 introduced. The deviation is now FULLY RESOLVED for multi-day mode. The deviation entry's anti-instructions are updated to note: in multi-day, `resolveDiscreteShadowOffsetXStep` returns `{ xStep: 0, yPx: -halfHeight }` for every cell unconditionally; only single-day retains the older logic.

**Smoke test (the PR-UX-14 follow-up expected pattern):**

| Cell | Expected `shadowOffsetXStepsRounded` (Phase 38 was) | Expected `shadowOffsetXStepsRounded` (Phase 39 now) | Expected `shadowOffsetYPxRounded` (now) | Expected `landedResourceId` |
|---|---|---|---|---|
| Mon **Shaun** (interior, second-to-last) — THE FIX | -1 (corner-peek into Mon Dan visually + drop) | **0 (rotation)** | **-H/2** | **Mon Shaun** |
| Mon Dan, Tue Dan, Wed Dan (interior, mid lane) | -1 (corner-peek into Mon Todd / Tue Todd / Wed Todd) | **0 (rotation)** | **-H/2** | **own cell (Mon Dan / Tue Dan / Wed Dan)** |
| Mon Josh / Tue Josh / Wed Josh (cross-day, lane 0) | 0 (cross-day clamp) | **0 (rotation)** | **-H/2** | own cell |
| Mon Trey / Tue Trey / Wed Trey (interior, last lane) | 0 (rotation, Phase 38) | unchanged: 0 | -H/2 | own cell |
| Thu Josh / ... / Thu Trey (last day, all lanes) | 0 (rotation, Phase 35.1) | unchanged: 0 | -H/2 | own cell |

After Phase 39 ships, the dead zone reported in the PR-UX-14 follow-up is resolved for all 6 lanes of every day; mid-canvas shadow visually sits above the card by H/2 in EVERY multi-day cell, and `xWithinColumn = panXAbs - 0 = panXAbs` so the data drop matches the visual shadow exactly. Every drop is `lane N → drop N` with no off-by-one corner-peek shift.

**Cleanup if reverted:**
- Restore `resolveDiscreteShadowOffsetXStep`'s rotation branch to Phase 38's `if (columnCount > 1 && (colIndex === columnCount - 1 || laneIndex === techCount - 1))` and reinstate the `laneIndex === 0` cross-day clamp + `absoluteLane >= totalLanes - 1` rightmost-flat-clamp + `xStep: -1` corner-peek defaults below it.
- Caveat: reverting re-introduces the "second-to-last lane of every non-last day unreachable" dead zone that PR-UX-14's follow-up smoke caught — i.e. Shaun would become unreachable again in mid-days.

**Markers:** `// FORK Phase 39 (PR-UX-14, 2026-05-09)` on the rotation-everywhere branch inside `resolveDiscreteShadowOffsetXStep` body and the doc-block addendum above the helper.

---

### Phase 37 — `onBodyResourceIdsChange` callback (2026-05-12, arrow lane-order source of truth)

**Why:** Overlay consumers (move-chain arrow renderer in REMITechnician) need to know the body grid's *painted* mini-cols lane order to position arrow endpoints. Pre-Phase-37 they had to reconstruct that order from the consumer-side `selectedResourceIds` array, but `bodyResourceIds` is computed as `resourceIds.filter(id => selectedResourceIds.includes(id))` — i.e. **`resources`-prop order, filtered by selection**. Those two arrays disagree whenever the consumer's `selectedResourceIds` isn't already sorted to match the `resources` prop. Letting the library report its own `bodyResourceIds` directly removes that hidden contract.

**API:** new optional prop on `CalendarProps`:

```ts
onBodyResourceIdsChange?: (bodyResourceIds: number[]) => void;
```

Fires once on mount, then again whenever the library's internal `bodyResourceIds` memo's identity changes (which happens whenever `resources` order changes or `selectedResourceIds` changes). Implementation pattern is the same one Phase 24/24-x established for the scroll/transform callbacks: callback is held in a ref so prop-identity churn doesn't refire the effect; the `useEffect` itself depends only on `[bodyResourceIds]`.

When `undefined`, the callback machinery short-circuits — zero overhead for calendars that don't subscribe.

**Consumer expectation:** the host stores the latest array in `useState`, optionally bails out on identical-content callbacks to avoid spurious re-renders, and uses the array as the source of truth for any per-lane geometry it overlays on top of the calendar (arrow endpoints, drop-target ghosts, custom labels). See `REMITechnician`'s `LandscapeWorkweekView.tsx` for the reference wiring and the PR's `docs/PLAN-DEVIATIONS.md#2026-05-12-arrow-lane-order-from-vendor` entry for the rationale.

**Cleanup if reverted:**
- Remove the destructure entry in `CalendarInner`'s props block, the `onBodyResourceIdsChangeRef` ref + the two `useEffect`s right under the `bodyResourceIds` memo.
- Remove the prop entry from `dist/index.d.ts` and `dist/index.d.mts`.
- Consumers fall back to mirroring the library's filter (`resources.map(r => r.id).filter(id => selectedResourceIds.includes(id))`) locally and accepting the implicit contract.

**Markers:** `// FORK Phase 37 (2026-05-12 — arrow lane-order source of truth)` on the prop destructure entry and on the `useEffect` that fires the callback.

**`.mjs` parity:** NOT mirrored — `.mjs` has been out of sync since Phase 11 (per the note at the bottom of this file). When/if anyone ships the fork to a non-RN consumer they'll need to rebuild `dist/` from `src/` first.

---

### Phase 38 — `EventBlocks` React key changed from slot position to `evt.id` (2026-05-13, fixes wrong-direction arrows after Future-toggle)

**PLAN-DEVIATION:** none — this is a vendor-side fix for a long-standing impedance mismatch with the Phase 26 `onEventLayout` consumer contract. No master plan section prescribed slot-based keying; that was upstream's choice and we inherited it through the v1.1.0 patch.

**Why:** the Phase 26 `onEventLayout` callback (`EventBlock`'s outer `Animated.View` `onLayout`) only fires on **mount or geometry change**. When `applyIntentsToWorld` (consumer-side) toggles `futureMode` and swaps appointment 50 out of `tech2/Tue/2pm` for appointment 42 (which moved INTO that slot in the projected world), the React key `${evt.from}-${evt.to}-${index}` matches the previous occupant's, so React reconciles by reusing the same `EventBlock` instance and swapping only its `event` prop. The View's position is unchanged → `onLayout` does NOT fire → the consumer's `useEventBoundsRegistry` (id-keyed) silently retains appt 50's old rect. After toggling back to Now, the move-chain arrow renderer reads a Future-mode-coordinate rect for appt 50 → arrow points at the destination time-slot in the wrong column → "wrong-direction arrows."

Three earlier fixes failed because they all assumed the registry could either (a) wipe and refill on every toggle (broke unchanged-position events whose `onLayout` never refires) or (b) gate on a settling timer (the registry settled on partial new data while reused-slot rects remained stale). The root cause is that slot-based keying hides the appointment-swap transition from React's reconciliation pipeline, so the consumer has no signal to act on.

**Fix:** change the React key on the `Renderer` element inside `EventBlocks` from `${evt.from}-${evt.to}-${index}` to `evt.id`. React's reconciler now sees a different key when the occupant of a slot changes, unmounts the previous `EventBlock`, mounts a fresh one in its place, and fires `onLayout` → consumer registry stays accurate without any post-toggle gating gymnastics.

**Why this is safe:**

- `evt.id` is already trusted as the canonical identifier inside `EventBlocks` itself (`frameMap.get(evt.id)` at the same call site, line 3048 in `dist/index.js`).
- `Event.id` is sourced from the consumer's appointment + ghost data model; both REMITechnician code paths (`resource-calendar-mapping.ts` mapping appointments and ghosts into `Event`s) generate stable per-appointment / per-ghost identifiers. Ghost ids are namespaced (`ghost_<chainId>_<step>`) so they cannot collide with real appointment numeric ids.
- If two events ever shared an id within the same column, React would warn at the console (the previous slot-based key masked that — it was technically broken but invisible). Surface-level lint is strictly better than silent rect leaks.
- The lookup `frameMap.get(evt.id)` is built once per render from the same `events` array, so per-frame layout still resolves to the correct rect for the new occupant after the swap.

**What this fixes (user-visible behavior):**

1. **Primary:** wrong-direction arrows after the Future → Now toggle in `Show All` mode. Documented in the conversation referenced by `docs/implementation-plans/calendar-robustness-followups.md` §2.1.
2. **Secondary:** the "arrows disappear until I toggle Show None → Show All" workaround that the previous `useEventBoundsRegistry.clear()` fix introduced. With Phase 38 in place the workaround should no longer be reachable.
3. **Tertiary (latent, not actively reported):** reschedule animations that previously required pop-and-replace can now be smoothed into translation animations on the same instance, because React reuses the instance only when the SAME appointment moves (not when DIFFERENT appointments occupy the same slot).

**Cleanup opportunities on the consumer side (separate commits, not this one):**

- `src/hooks/calendar/use-event-bounds-registry.ts`'s `invalidate()` + `isSettled` API and the `futureMode`-driven invalidation effects in the three calendar views (`resource-calendar-day-view.tsx`, `resource-calendar-workweek-view.tsx`, `landscape/LandscapeWorkweekView.tsx`) were added as a stopgap for this bug. With Phase 38, the underlying mechanism (slot reuse hiding from `onLayout`) is gone, so those defenses can be deleted or relaxed. The current PR may leave them in place to keep the diff scoped; a follow-up commit can clean up once Phase 38 is verified on-device.
- The "skip arrows + ghosts entirely in Future mode" suppression added in the same stopgap is decorative, not load-bearing, after Phase 38. Whether to keep it is a UX decision, not a correctness one.

**Files touched:**

- `dist/index.js` — line 3041 area (`EventBlocks` `Renderer` element). Marker comment added.
- `dist/index.mjs` — line 1310 area (parity with `.js`, abbreviated marker).
- `src/components/EventBlocks.tsx` — line 50 area (canonical source, full marker doc-block).

**Markers:** `// FORK Phase 38 (2026-05-13 — key by stable event id, not slot position)` on the `key:` line in both `dist/index.js` and `src/components/EventBlocks.tsx`. Abbreviated marker on `dist/index.mjs`.

**Test coverage:** existing — `src/components/calendar/__tests__/compute-move-chain-arrows.test.ts` (the registry-consumer geometry tests, including the FORK Phase 26 hit-path / fallback cases) covers the post-Option-A behavior implicitly because the registry now stays accurate without intervention. No new tests required for the vendor edit itself; the React key is a behavioral guarantee that's exercised end-to-end every time an EventBlock mounts/unmounts.

**Cleanup if reverted:** flip the key in all three files back to `${evt.from}-${evt.to}-${index}` (canonical line in `src/components/EventBlocks.tsx`). Then re-introduce a consumer-side workaround for stale rects after `futureMode` toggle — the previous registry-clear / invalidate-and-gate attempts in `useEventBoundsRegistry` are documented in this repo's git history.

---

### Notes for future agents
- The library expects to receive the FULL ordered list of resources (already sorted by `techOrder`). Don't pre-filter in the mapping function — let `selectedResourceIds` do the filtering inside the lib.
- Double-tap requires gesture-handler v2 (`Gesture.Tap().numberOfTaps(2)`). The existing tap path is wrapped in `Race(dragSet, double, single)`.
- Reorder works by long-press (300 ms) → pop animation → pan. Inside `Gesture.Pan().manualActivation(true)` the pan only activates after the LongPress flips `isPressing.value = true`.
- The `dist/index.mjs` and `dist/index.d.mts` files are NOT kept in sync with `dist/index.js` for the gesture/header changes. Metro for React Native resolves via the `react-native` package.json field, which points at `dist/index.js`. `.d.mts` was kept in sync (cheap), but `.mjs` was skipped because nothing in this app's bundler chain reads it. If you ever ship this fork to a non-RN consumer, either rebuild via `npm run build` (after installing tsup) or mirror the `.js` edits into `.mjs`. **Phase 11 was mirrored into `.mjs`** since it's a self-contained 8-line patch and the cost was negligible. **Phase 12 mirrored only the `DaysComponent` parameter change into `.mjs`** as a defensive harmless addition (it has no effect there because `CalendarInner` in `.mjs` doesn't pass the new prop, so the default `true` keeps the avatar visible — which matches `.mjs`'s pre-Phase-12 behavior). The `.mjs` `CalendarInner` destructure and the now-line width fix were intentionally NOT mirrored because the destructure would dead-code without the matching pass-through and the now-line fix already requires Phase 10 (`viewportWidth`) which isn't in `.mjs` either.
