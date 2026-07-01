# React Native Draggable FlatList — REMI Fork

Forked from [computerjazz/react-native-draggable-flatlist](https://github.com/computerjazz/react-native-draggable-flatlist) v4.0.3.

## Why we forked

Upstream does not expose a way to suppress its native "shift other cells to make room" animation during a drag. We need that knob for a single feature: the route-reorder chip bar on the map screen, where the user can drag a chip toward another chip with two distinct intents — **SWAP** with that chip (chips around it should stay still, we render a highlight ring on the target instead) or **INSERT** between two chips (DFL's default shift animation, unchanged).

The discriminating signal is purely spatial — when the dragged chip's center is in the **inner 50%** of any target chip (a tight ±9px window around the chip's centerline), the gesture is a SWAP. Anywhere else (outer 25% edges + gaps between chips) is an INSERT. DFL bakes the shift behavior into a per-cell worklet (`useCellTranslate`) with no opt-out, so the only path to that conditional behavior is a small library patch.

The fork lets us evolve the chip bar's gesture model without juggling a patch-package patch file or fighting DFL's cell-level autonomy from the outside.

## Layout

| Folder | Purpose |
|---|---|
| `src/` | Original upstream TypeScript source at v4.0.3, with the REMI patches applied directly. Metro consumes this folder via `package.json`'s `react-native` field (`src/index.tsx`). This is the runtime source of truth. |
| `lib/typescript/` | Compiled `.d.ts` declarations. TypeScript reads from here via `package.json`'s `types` field (`lib/typescript/index.d.ts`). New props/values added to `src/` MUST be mirrored into the matching `.d.ts` by hand (we don't run the bob build on each patch — see "Editing the fork" below for the policy). |
| `lib/commonjs/`, `lib/module/` | Compiled JS for non-RN consumers (Node tests, web bundles). NOT used by Metro and NOT kept in sync with our patches. Same policy as `vendor/react-native-resource-calendar/dist/index.mjs`. If a future use case ever pulls DFL into a non-RN build path that hits the chip bar, these files would need to be patched too — flag and revisit at that time. |
| `package.json` | Same entry points as upstream (`main`, `module`, `react-native`, `types`). The host app pulls this folder in via `"react-native-draggable-flatlist": "file:./vendor/react-native-draggable-flatlist"` in the root `package.json`. |
| `babel.config.js`, `tsconfig.json` | Copied from upstream, untouched. Required for Metro to babel-transform the `src/` TypeScript at runtime. |

## How the fork is wired in

- Root `package.json`: `"react-native-draggable-flatlist": "file:./vendor/react-native-draggable-flatlist"`.
- Metro picks up the `react-native` field and serves `src/index.tsx` directly (transformed through babel).
- TypeScript picks up the `types` field and reads `lib/typescript/index.d.ts`.
- The root `tsconfig.json` does NOT need to exclude `vendor/` because DFL's `src/` is internally consistent — unlike resource-calendar which had absolute path imports that broke under the host tsc.

## Editing the fork

Surgical patches (like Phase 1 below) are made **directly in `src/`** because Metro reads `src/` at runtime — there's no compile step in the middle to lose your edits. The pattern:

1. Mark every patch site with `// FORK Phase N (REMI snap-zone fork) — see README-FORK.md.`
2. If the patch also contradicts a separate implementation plan, add a `// PLAN-DEVIATION: <id> — short reason` marker on a line above the `// FORK` marker and link it to an entry in the host repo's `docs/PLAN-DEVIATIONS.md`.
3. If the patch adds a new prop or shared value to a context/return type, mirror the type into the relevant `.d.ts` file in `lib/typescript/` (TypeScript reads from there, not `src/`). For `onAnimValInit` specifically, both `lib/typescript/components/DraggableFlatList.d.ts` AND `lib/typescript/components/NestableDraggableFlatList.d.ts` inline the context value type, so both must be updated.
4. `lib/commonjs/` and `lib/module/` stay on upstream's compiled output. They are NOT a runtime path for this repo.
5. Append a row to "Touched files" below with what changed and why.

If a future patch needs to compile `src/` cleanly into `lib/` (e.g., because someone wired DFL into a Jest setup that bypasses Metro), run the upstream build inside this folder:

```bash
cd vendor/react-native-draggable-flatlist
npm install --no-save react-native-builder-bob @babel/preset-typescript
npm run build
```

This rewrites all three `lib/` subfolders from `src/`. At that point keeping `lib/commonjs/` and `lib/module/` in sync becomes the new policy and this README should be updated to reflect it.

## Gotchas (npm × Metro × native modules)

Both gotchas below stem from the same root cause: this package is consumed via the npm `file:` protocol, and npm 10 has rough edges around `file:` deps that are easy to trip on. If you wired the fork in correctly and a problem appears anyway, suspect one of these two first.

### G1 — `react-native-draggable-flatlist 2` orphan symlink

**Symptom:** Metro errors with `Unable to resolve "react-native-draggable-flatlist" from "src/components/route/route-reorder-chip-bar.tsx"` even though the package looks present on disk.

**Cause:** If `npm install` runs while Metro has an open file handle on `node_modules/react-native-draggable-flatlist`, npm 10 can write the refreshed symlink with a `" 2"` suffix and leave the original in place. A subsequent install may then remove the unsuffixed one but leave the orphan.

**Recovery:**

```bash
rm "node_modules/react-native-draggable-flatlist 2"   # if it exists
npm install                                            # restores the unsuffixed symlink
watchman watch-del   "$(pwd)"                          # purge stale watch
watchman watch-project "$(pwd)"
npx expo start --dev-client --clear                    # flush Metro caches
```

**Fast check:** `ls node_modules | grep "draggable-flatlist 2"` — one line means orphan, no output means clean.

### G2 — Nested `node_modules/` materializing inside the vendored package

**Symptom:** App crashes at boot with `Invariant Violation: TurboModuleRegistry.getEnforcing(...): 'PlatformConstants' could not be found.` The error originates from `vendor/react-native-draggable-flatlist/src/components/DraggableFlatList.tsx` at the `import Animated from "react-native-reanimated"` line, but the actual cause is two copies of `react-native` (and/or `react-native-reanimated`) loaded into the JS bundle — only one of which is linked to the dev client's native bridge.

**Cause:** If the vendored `package.json` ever declares a `dependencies` or `devDependencies` block (or the root `package-lock.json` has stale entries referencing `vendor/react-native-draggable-flatlist/node_modules/...`), npm materializes those into a nested `node_modules/` directory inside the vendored package. Node's module resolution then walks up from `vendor/react-native-draggable-flatlist/src/` and finds the nested copies of `react-native` and `react-native-reanimated` **before** the project's hoisted copies. The nested copies are JS-only modules with no native binding → runtime crash.

**Recovery:**

```bash
# 1. Make sure vendored package.json declares no runtime dependencies.
#    Only `peerDependencies` should remain. See current package.json.
# 2. Wipe everything that could be holding the stale resolution:
rm -rf vendor/react-native-draggable-flatlist/node_modules
rm package-lock.json
npm install                                            # regenerates lock from scratch
# 3. Verify cleanup:
ls vendor/react-native-draggable-flatlist/node_modules 2>&1   # should print "No such file"
grep -c "vendor/react-native-draggable-flatlist/node_modules/" package-lock.json  # should print 0
node -e "console.log(require.resolve('react-native-reanimated', {paths:['vendor/react-native-draggable-flatlist/src']}))"
# ↑ should print the host node_modules path, NOT a nested vendor/.../node_modules path
# 4. Clear Metro and reload on device:
npx expo start --dev-client --clear --port 8081
```

**Why deleting `package-lock.json` is necessary, not just the nested folder:** the lock file independently records which packages live where. If the lock still says "react-native lives at vendor/.../node_modules/react-native", the next `npm install` will recreate it from the lock and ignore the package.json. Regenerating the lock from scratch forces npm to honor the trimmed package.json.

**Prevention:** never add a `dependencies` block to `vendor/react-native-draggable-flatlist/package.json` — even build-time helpers like `@babel/preset-typescript` are not actually needed at runtime (Metro's babel preset handles `.tsx` directly), and adding them resurrects this exact failure mode. Peer dependencies are fine and required.

## Updating from upstream

If we ever want to pull in new upstream releases:

1. Re-clone the upstream repo at the desired tag into a scratch folder.
2. Diff against `src/` here to identify which REMI patches need to be re-applied (grep for `FORK Phase`).
3. Re-apply patches on top of the new `src/`.
4. Mirror any new context fields into the `.d.ts` files in `lib/typescript/` by hand (or run the bob build per the section above).

The codebase only consumes DFL from one site (`src/components/route/route-reorder-chip-bar.tsx`), so the upgrade blast radius is small.

## Touched files (running list)

### Phase 1 — `disableSpacerTracking` shared value gates the per-cell shift behavior (chip-bar snap zones)

**PLAN-DEVIATION:** `2026-05-21-dfl-fork-for-snap-zones` — see `docs/PLAN-DEVIATIONS.md` for the full record. The master chip-bar plan (`docs/implementation-plans/chip-bar-snap-zone-rescheduler-plan.md` § Phase 1) explicitly promised "no behavior change" and made no mention of a library fork; this Phase 1 reverses that scoping.

- **What changed:**
  - `src/context/animatedValueContext.tsx` — new `disableSpacerTracking: SharedValue<boolean>` shared value, added to the context's `useMemo` value + dep array, exposed to consumers via the existing `onAnimValInit` callback. Default value `false`, which means zero behavior change for any consumer that doesn't opt in.
  - `src/hooks/useCellTranslate.tsx` — the per-cell "I'm the spacer, write my index to `spacerIndexAnim`" branch (line ~77 in upstream) now has two paths instead of one. When `disableSpacerTracking.value` is true, it ALSO actively resets `spacerIndexAnim` back to `activeIndexAnim.value`. Otherwise (gate off) it writes the computed `result` as before. The reset path is required because DFL begins shifting neighbor cells the moment the dragged chip's edge crosses their cellSize/2-line (≈10-12px BEFORE the consumer's swap-zone detection can fire on the chip's center). If the gate only stopped FUTURE writes, those already-shifted cells would stay in their shifted positions and the consumer's swap-target ring (positioned at the chip's stable pre-drag center) would land in empty space. Resetting to `activeIndexAnim` makes `shouldTranslate` evaluate FALSE for every non-active cell on the next frame, so each one's existing `withSpring(translationAmt, animationConfigRef.value)` path animates back to translationAmt=0 (its original slot). The list visually "freezes" — and freeze-back-to-origin is the load-bearing behavior, not just freeze-where-you-are.
  - `lib/typescript/context/animatedValueContext.d.ts` — added `disableSpacerTracking: SharedValue<boolean>` to the return type of `useAnimatedValues`.
  - `lib/typescript/components/DraggableFlatList.d.ts` — added the same line to the inline type for `onAnimValInit`'s `animVals` parameter.
  - `lib/typescript/components/NestableDraggableFlatList.d.ts` — same as above (NestableDraggableFlatList inlines the same context type).
  - `lib/commonjs/` and `lib/module/` — NOT updated. Metro reads `src/` directly; non-RN consumers don't use the chip bar.

- **Why this shape (gate the spacer index, not "freeze translation"):**
  - The cells' translation amounts (`translationAmt = activeCellSize * direction` or `0`) are computed from `spacerIndexAnim.value`. If we wrote translation directly we'd fight every cell's own `withSpring` per-frame. Resetting the **input** to that computation (`spacerIndexAnim → activeIndexAnim`) means each cell naturally settles to "no shift needed" via their existing reactive logic, no contention. When the gate releases, cells re-animate via the existing `withSpring(translationAmt, animationConfigRef.value)` path → graceful return to insert-mode visuals.
  - The two-path implementation (gate-on → reset, gate-off → write) is what gives the user a visible freeze. A naïve "just stop writing" version was shipped first (2026-05-21 afternoon) and produced a silent visual bug: chips stayed mid-animation, the ring appeared in empty gaps, no freeze felt by the user. The active reset is what makes the chips spring back to their original positions so the swap-target ring actually lands on the chip.
  - The shared value default is `false` so any consumer that wired only the original `onAnimValInit` payload gets unchanged behavior. We don't need a version bump — this is an additive, backward-compatible change.

- **Consumer side (where the gate gets flipped):**
  - `src/components/route/route-reorder-chip-bar.tsx` keeps a ref to `disableSpacerTracking` from `onAnimValInit`. A `useDerivedValue` worklet computes whether the dragged chip's center is within ±SWAP_ZONE_HALF_WIDTH_PX of any target chip's center and writes `disableSpacerTracking.value = isInSwapZone`. The threshold is currently 13px (matching the chip-bar plan's ≥65% overlap spec — two 36px chips overlap ≥65% when their centers are within 12.6px). Same worklet also writes the SWAP target into a `swapTarget` shared value that drives the highlight ring overlay. When the user drags out of the SWAP zone, both flip back, and DFL's default insert animation resumes from whatever hoverOffset position the chip is currently at.
  - 2026-05-21 history note: the initial Phase 1c shipped with 9px (inner 50%) and only the gate-on path, both of which made the freeze invisible — the threshold was too tight AND the chips never sprang back. Bumping to 13px + adding the spacer-reset is what made the swap-zone visual actually show on device.

- **What did NOT change:**
  - `placeholderOffset` logic in `useCellTranslate.tsx` (line ~81-86) is untouched. It still computes the placeholder slot based on whatever `spacerIndexAnim.value` happens to be at the time. When the gate is asserted, the placeholder simply doesn't track new positions — fine for a chip bar where the placeholder is invisible.
  - The cells' `withSpring` config, `viewableIndex` range checks, and `activeCellSize`-driven math are all unchanged.
  - The `onAnimValInit` callback signature is unchanged (we only added a field to the object it receives). Existing TypeScript callers that destructure specific fields are unaffected; callers that pass the whole object through will silently gain access to the new field.
  - The `pinch:resize:end` codepath in upstream DFL — DFL doesn't have pinch-resize; this note is here only because a reader cross-referencing the resource-calendar fork might expect it.

- **Test coverage:** on-device EAS smoke. The behavior is purely visual ("does the list freeze when the dragged chip is over the inner 50% of a neighbor"), which can't be meaningfully unit-tested at the cell-translate level — the spring animation and frame timing matter. The chip-bar's existing `traceMap("chip_bar_drag_end_local_insert", ...)` Sentry breadcrumb gains a `swapMode` field that captures the SWAP vs INSERT vs NOOP classification at drop time, which is the observable invariant we'd regress on.

- **Markers in code:**
  - `// FORK Phase 1 (REMI snap-zone fork) — see README-FORK.md.`
  - `// PLAN-DEVIATION: 2026-05-21-dfl-fork-for-snap-zones — see docs/PLAN-DEVIATIONS.md.`

Both markers appear at every patch site in `src/` and at the matching type line in the relevant `.d.ts` files.

### Phase 2 — Split-shift override + hoverOffset clamp extension (custom INSERT visual)

**PLAN-DEVIATION:** `2026-05-21-dfl-fork-for-snap-zones` — same entry as Phase 1. The fork's scope was already extended past the original "no behavior change" wording; Phase 2 stays inside that record because it's a continuation of the same chip-bar work.

**Date:** 2026-05-21 evening.

**Why we needed this:** Phase 1 made SWAP look right (chips freeze, ring lands on target) and left INSERT on DFL's defaults (chips shift in the direction of the drag, one-cellSize at a time). The user requested a different INSERT visual: when dragging a chip between two existing chips, BOTH neighboring chips should part by half a cellSize each (centered on the user's intended drop point), and the dragged chip should be able to land "before the first chip" and "after the last chip" — neither of which DFL's default per-cell shift supports. Two surrounding chips parting `±cellSize/2` opens a one-cell gap visually centered on the drop, which reads more naturally as "I'm inserting between these two."

- **What changed:**
  - `src/context/animatedValueContext.tsx` — two new shared values:
    - `splitShiftLeftCellIdx: SharedValue<number>` (default `-1`) — when set to a non-negative cell index by the consumer, that cell translates by exactly `−cellSize/2` instead of obeying DFL's default per-cell shift.
    - `splitShiftRightCellIdx: SharedValue<number>` (default `-1`) — same, but translates `+cellSize/2`.
    - Both added to the `useMemo` value object + dep array so they're surfaced through `onAnimValInit`.
    - **Also in this file:** the `hoverOffset` clamp range (which constrains how far the dragged chip can be pulled past the list's ends) was extended by `halfCellSize` on each side. The new bounds are `[-activeCellOffset - cellSize/2, scrollViewSize - (activeCellOffset + cellSize) + cellSize/2]`. Without this extension, the user cannot drag a chip far enough left to express "insert before the first chip" or far enough right to express "insert after the last chip" — the clamp would pin hoverOffset at the first/last slot's left edge. Adding `cellSize/2` lets the chip's center reach the gap before slot 0 (and after slot N-1).
  - `src/hooks/useCellTranslate.tsx` — added an override branch BEFORE the existing spacer-based translation math. If `cellIndex === splitShiftLeftCellIdx.value`, return `withSpring(-cellSize/2, animationConfigRef.value)`. If `cellIndex === splitShiftRightCellIdx.value`, return `withSpring(+cellSize/2, ...)`. Both returns short-circuit the rest of the function so the spacer logic never runs for these cells. The active cell's `isActiveCell` early return is preserved above the new branches, so a worklet that accidentally writes `splitShiftLeftCellIdx = activeIndex` is silently no-op.
  - `lib/typescript/context/animatedValueContext.d.ts` — added both new shared values to the return type of `useAnimatedValues`.
  - `lib/typescript/components/DraggableFlatList.d.ts` — added both lines to the inline type for `onAnimValInit`'s `animVals` parameter.
  - `lib/typescript/components/NestableDraggableFlatList.d.ts` — same.
  - `lib/commonjs/` and `lib/module/` — NOT updated (same policy as Phase 1).

- **Why this shape (override the translation, don't extend the spacer math):**
  - DFL's spacer-index model assumes "moving the dragged chip past slot K's centerline reorders slot K into the gap." That single-axis model can't express "two adjacent chips part by halves around a fixed drop point" without invasively rewriting `useCellTranslate`. Adding two independent overrides that bypass the spacer math entirely is the smallest surface-area change that achieves the visual.
  - The two cells are **independent shared values** rather than a combined "gap descriptor" because bookend cases naturally express as "one side −1, other side a valid index." E.g., inserting before slot 0: `splitShiftLeftCellIdx = -1` (no left chip exists), `splitShiftRightCellIdx = 0` (only chip 0 moves right by half). Same for after the last chip with the directions flipped.
  - `withSpring` (not `withTiming` or direct write) so the gap opens and closes smoothly when the user's drag crosses an INSERT-zone boundary, matching the feel of DFL's existing per-cell springs. The same `animationConfigRef.value` is reused so the timing is identical to the un-overridden cells (which matters when the worklet flips a cell from "overridden" to "not overridden" — the spring resumes from where it was).
  - The hoverOffset clamp extension is purely defensive: without it, no amount of worklet logic could express "drop the chip before slot 0" because hoverOffset can never reach that position. The extension is symmetric (cellSize/2 each side) so both edges of the list are reachable. The visible side-effect is that the dragged chip can now travel past the bar's left/right edges into surrounding chrome by half a chip-width — a known tradeoff documented here so a future agent doesn't reflexively re-tighten the clamp to "fix" the overhang.

- **Consumer side (where the gate flips and indices are written):**
  - `src/components/route/route-reorder-chip-bar.tsx`'s `useDerivedValue` worklet was rewritten to compute a SWAP / INSERT / NOOP mode every frame and write all five shared values consistently:
    1. **Gate policy change:** `disableSpacerTracking` is now ON for the ENTIRE drag (any frame where `activeIndexAnim.value >= 0`), not just SWAP frames. With the gate on, DFL's default per-cell shift never runs and we drive ALL non-active translations ourselves via the split-shift overrides. This is what makes INSERT look like "two chips part" instead of "everyone slides one slot."
    2. **SWAP detection:** when the dragged chip's center is within `SWAP_ZONE_HALF_WIDTH_PX` (currently 13px) of a non-active slot's center, write `swapTarget`, clear `insertLandingSlot`, leave both split-shift indices `−1`. Visual: list frozen via the gate (Phase 1 mechanism), amber ring on target.
    3. **INSERT detection:** otherwise, compute `slotApprox = hoverOffset / cellSize`. The "gap position" is `ceil(slotApprox) ∈ [0, N]`. The two cells to split-shift are `floor(slotApprox)` (LEFT) and `ceil(slotApprox)` (RIGHT) — clamped to `[0, N-1]` and ignored if they equal `activeIdx`. The landing slot (where the dragged chip ends up in the new ordering) is derived from the gap position and the active index's relative position; see the worklet's inline comments for the exact formula including the four special-case branches.
    4. **NOOP frames** (the dragged chip is at its own slot's center or past it in active's swap zone): all outputs cleared; gate stays on but no overrides fire, so the visual is "everything frozen, no ring, no split."
  - `handleDragEnd` no longer trusts DFL's `data`, `to` params. With the gate always on, DFL's spacerIndex stays pinned to activeIndex, so it reports `from === to` even when the user clearly dragged the chip elsewhere. Instead, `handleDragEnd` reads the worklet's last-written `swapTarget` + `insertLandingSlot` snapshots and synthesizes the new ordering itself:
    - `swapTarget` set → SWAP: swap `from` with target's index in the current ordering.
    - `insertLandingSlot >= 0` and `!= from` → INSERT: splice out at `from`, splice in at the landing slot.
    - Both empty → NOOP: skip `onReorder`.
  - The synthesized `to` is fed back into the `traceMap("chip_bar_drag_end_local_insert", ...)` breadcrumb alongside a new `insertLandingSlot` field, so Sentry still has a complete picture of the drop intent.

- **What did NOT change:**
  - Phase 1's `disableSpacerTracking` semantics inside `useCellTranslate` are unchanged. The new override branches run BEFORE the Phase 1 spacer-reset path; if a cell matches neither override index, Phase 1's behavior applies (which under the always-on-gate policy means "stay frozen at translation 0").
  - DFL's `withSpring` config for the active cell (the dragged chip itself) is untouched. The chip still follows the user's finger via DFL's `hoverAnim`.
  - The Phase 1 SWAP zone width (`SWAP_ZONE_HALF_WIDTH_PX = 13`) is unchanged.
  - `placeholderOffset` and `viewableIndex` logic in `useCellTranslate.tsx` are untouched. The placeholder is invisible in the chip bar so its position doesn't matter.

- **Tradeoffs / known caveats:**
  - **Dead zones:** small drags that don't cross any slot boundary land in NOOP mode and look like nothing happened. This is intentional — the alternative (always biasing to an INSERT direction) creates accidental reorders from finger jitter — but a future polish pass might add a tiny "snap-to-nearest-INSERT-zone" hysteresis once the user has dragged past `cellSize/4`.
  - **Overhang past the list ends:** the clamp extension lets the dragged chip travel `cellSize/2` past the list's left/right edge into whatever chrome surrounds the chip bar. Visually that's fine inside the chip bar's overflow:visible container, but if the chip bar is ever embedded next to dense UI elements this overhang could look ugly. Either tighten the clamp (and lose the bookend INSERTs) or arrange the surrounding layout to keep the overhang region clear.
  - **DFL's from/to are now dead:** if a future consumer needs DFL's reported `to` (e.g., to drive analytics that count "how many slots did the user drag"), they need to mirror the chip-bar's "synthesize from worklet outputs" pattern or revert the always-on-gate policy for their use case. The fork doesn't expose a "gate off but split-shift on" mode; it would need a third shared value to gate the spacer-reset independently.

- **Test coverage:** on-device EAS smoke. Same rationale as Phase 1 — the behavior is purely visual (does the gap open in the right place? does the dragged chip drop into the right slot?) and depends on spring timing + frame-by-frame worklet evaluation, which can't be meaningfully unit-tested at this layer. The `chip_bar_drag_end_local_insert` breadcrumb's `insertLandingSlot`, `to`, and `newOrderedIds` fields together capture the observable invariant.

- **Markers in code:**
  - `// FORK Phase 2 (REMI split-shift fork) — see README-FORK.md "Phase 2".`
  - `// PLAN-DEVIATION: 2026-05-21-dfl-fork-for-snap-zones — see docs/PLAN-DEVIATIONS.md.` (same entry as Phase 1)

Both markers appear at every patch site in `src/` and at the matching type lines in the relevant `.d.ts` files.

### Phase 3 — Off-end shift-all override (full-cell shift for front/back inserts)

**PLAN-DEVIATION:** `2026-05-22-dfl-fork-shift-all-off-end` — a new index entry for this phase. The Phase 2 deviation (`2026-05-21-dfl-fork-for-snap-zones`) covered "add custom shared values to override translations during a drag." Phase 3 extends the fork's surface area with a SECOND override mechanism that operates on RANGES of cells (everything before/after a pivot) instead of single cells, so a new deviation entry is the cleaner home for it.

**Date:** 2026-05-22 evening.

**Why we needed this:** Phase 2's split-shift opened a half-cell gap between two adjacent chips by translating one chip `−cellSize/2` and the next chip `+cellSize/2`. That visual reads cleanly for interior inserts. At the **bookends** (insert before slot 0, or after slot N−1), the half-cell visual collapses: only one neighbor exists to push (the bookend chip itself), so only that one chip nudges by `cellSize/2`. The dragged chip — rendered at `hoverAnim`, near the bar's edge — ends up visually overlapping the bookend chip, indistinguishable from a SWAP-with-bookend target. Users (and the user who flagged this on 2026-05-22) read the screen as "the chip is going to land on top of the first chip" and had no signal that it would actually insert before it.

The fix is to render a **chip-wide empty slot** at the bookend by shifting EVERY non-active chip on that side of the dragged origin's pivot by a full `cellSize` instead of `cellSize/2`. With 3 chips before the dragged origin all sliding right by one cell, the front of the bar has a clean empty rectangle exactly the size of one chip — the dragged chip slots into it visually.

- **What changed:**
  - `src/context/animatedValueContext.tsx` — two new shared values:
    - `shiftAllBeforeIdx: SharedValue<number>` (default `-1`) — when set to a non-negative cell index by the consumer, every cell with `cellIndex < shiftAllBeforeIdx` translates `+cellSize` (slides right by one cell-width).
    - `shiftAllAfterIdx: SharedValue<number>` (default `-1`) — same, but every cell with `cellIndex > shiftAllAfterIdx` translates `−cellSize` (slides left by one cell-width).
    - Both added to the `useMemo` value object + dep array so they're surfaced through `onAnimValInit`.
  - `src/hooks/useCellTranslate.tsx` — added two override branches BEFORE the existing Phase 2 split-shift checks. The new precedence (highest first) is: **active cell early-return → Phase 3 shift-all → Phase 2 split-shift → Phase 1 freeze (`disableSpacerTracking`) → DFL default per-cell shift**. Phase 3 runs first because if both override mechanisms are accidentally engaged for the same cell, the off-end visual should win (it's the user-facing intent for the entire bar; split-shift is per-pair). The same `withSpring(±cellSize, animationConfigRef.value)` spring config as Phase 2 is reused — the chips animate in and out of the shifted position at the same feel as a half-cell split-shift would have.
  - `lib/typescript/context/animatedValueContext.d.ts` — added both new shared values to the return type of `useAnimatedValues`.
  - `lib/typescript/components/DraggableFlatList.d.ts` — added both lines to the inline type for `onAnimValInit`'s `animVals` parameter.
  - `lib/typescript/components/NestableDraggableFlatList.d.ts` — same.
  - `lib/commonjs/` and `lib/module/` — NOT updated (same policy as Phases 1 and 2).

- **Why two indices instead of one signed value (or a discriminated union):**
  - Symmetry. `shiftAllBeforeIdx` and `shiftAllAfterIdx` are mutually exclusive in normal use (the user is dragging to either the front OR the back of the bar, not both at once), but the override-per-side shape mirrors Phase 2's split-shift exactly: one shared value per direction, default `-1` = inactive, set the one you mean. A consumer reading the four shared values together (`splitShiftLeftCellIdx`, `splitShiftRightCellIdx`, `shiftAllBeforeIdx`, `shiftAllAfterIdx`) has a uniform mental model: "which cell index, in which direction."
  - The "before" / "after" verbs match the consumer's `dramaticShift: "front" | "back"` directive (see `src/utils/chip-bar-snap-zone.ts`'s decision shape), so the wire-through code reads naturally: `dramaticShift === "front" → shiftAllBeforeIdx = activeIdx`.

- **Why `cellSize` (not `activeCellSize`):**
  - For a uniform-width list like the chip bar, `cellSize === activeCellSize` and either would work. We pick `cellSize` for parity with Phase 2's split-shift (which also uses `cellSize / 2`, not `activeCellSize / 2`) — both phases reason about the GAP that opens, which is one cell wide regardless of which cell is being dragged. If a future consumer ever uses this fork with mixed-size cells, `cellSize` keeps the gap proportional to the displaced cells, not the dragged cell, which is the more intuitive behavior.

- **Consumer side (where the indices are written):**
  - `src/utils/chip-bar-snap-zone.ts` got a Phase 7c amendment (2026-05-22): the `SnapZoneDecision` `insert` variant now carries a `dramaticShift: "none" | "front" | "back"` directive. The classifier sets it to `"front"` when `landingSlot === 0 && slotApprox <= 0` and `"back"` when `landingSlot === N - 1 && slotApprox >= N - 1` — the two off-end cases where the half-cell visual fails. When the directive is non-`"none"`, the classifier also forces `leftCellIdx` and `rightCellIdx` to `-1` so the consumer doesn't accidentally fight Phase 3 with Phase 2.
  - The classifier ALSO gained a bookend SWAP carve-out in the same pass: SWAP-with-chip-0 only fires when `slotApprox >= 0` (interior side); SWAP-with-chip-(N-1) only fires when `slotApprox <= N-1`. The off-end side is reserved for front/back-insert classification so the dramatic-shift visual has a generous trigger zone (not just the narrow `slotApprox < -0.167` window the original SWAP-zone width left for it).
  - `src/components/route/route-reorder-chip-bar.tsx` extends `ChipBarDflAnims` with `shiftAllBeforeIdx` and `shiftAllAfterIdx` refs from `onAnimValInit`, reads them in the same `useDerivedValue` worklet that drives the split-shift / SWAP path, and writes them based on the new directive: `dramaticShift === "front"` sets `shiftAllBeforeIdx = activeIdx`; `"back"` sets `shiftAllAfterIdx = activeIdx`; `"none"` clears both. The worklet also clears the matching split-shift indices in the dramatic-shift frame (defense-in-depth — the classifier already forces them to `-1`, but if a frame straddles the classification boundary we want them cleared deterministically).
  - `handleDragEnd` doesn't need new logic: the worklet's `insertLandingSlot` snapshot is what `handleDragEnd` already reads, and Phase 7c's classifier produces the same `landingSlot` values for off-end drops as Phase 7b did. The visual is the only thing that changed.

- **What did NOT change:**
  - Phase 1's `disableSpacerTracking` semantics inside `useCellTranslate` are unchanged. The new Phase 3 override runs ABOVE Phase 2 in precedence, and Phase 2 runs above Phase 1; a cell that's a Phase 3 target skips both Phase 2 and Phase 1 logic.
  - Phase 2's split-shift behavior is unchanged. Interior inserts still get the half-cell split-shift visual.
  - DFL's `withSpring` config for the active cell (the dragged chip itself) is untouched. The chip still follows the user's finger via DFL's `hoverAnim`.
  - The `hoverOffset` clamp extension from Phase 2 (`±cellSize/2` past each end) is unchanged. Phase 3 reuses that extension to let the dragged chip's center reach the off-end pivot positions.

- **Tradeoffs / known caveats:**
  - **Bigger visual jolt:** the dramatic-shift visual translates N cells simultaneously, where N is up to `route_length - 1`. On a long route (10+ stops), that's a lot of springs firing in parallel. We pick `withSpring` (not `withTiming`) for consistency with Phases 1 and 2, and the spring config is the existing `animationConfigRef.value` which already feels right for single-cell shifts; in practice the jolt reads as "the bar parts to make room" rather than chaotic motion. If a future consumer sees jank with very long lists, an option would be to add a third shared value `shiftAllSpringConfig` that overrides the per-frame config — but holding off on adding configuration knobs until something actually demands them.
  - **Bookend SWAP coverage shrinks:** Phase 7c's carve-out removes the off-end side of the SWAP zone at slots 0 and N-1. A user who really wants to swap with the first or last chip can still do it by dragging onto the interior side of that chip's center (a `swapZoneHalfWidthPx`-sized window on that side). Anecdotally this is the natural gesture anyway — the off-end side of the bookend was always a degenerate zone (dragging past the bar's edge is the universal "I want to go past this" signal in lists).
  - **No bookend "noop on shift-all":** if a consumer accidentally sets `shiftAllBeforeIdx = 0` (no cells to shift right; the pivot has no `cellIndex < 0`), nothing visually happens — the override branches simply don't match any cell. Same for `shiftAllAfterIdx = N - 1`. These are degenerate-but-safe values; we don't error on them.

- **Test coverage:**
  - Unit tests: `src/utils/__tests__/chip-bar-snap-zone.test.ts` covers the classifier-side contract end-to-end — bookend SWAP carve-out fires on the right side, dramaticShift directive fires on genuine off-end frames only, leftCellIdx/rightCellIdx are forced to -1 in dramatic frames. 35 tests, all passing.
  - On-device EAS smoke: the visual itself (the chip-wide gap opening at the bookend) is purely a layout / animation behavior; the chip bar's `traceMap("chip_bar_drag_end_local_insert", ...)` Sentry breadcrumb captures `dramaticShift` alongside `swapMode` and `insertLandingSlot` for post-hoc verification.

- **Markers in code:**
  - `// FORK Phase 3 (REMI off-end shift-all fork) — see README-FORK.md "Phase 3".`
  - `// PLAN-DEVIATION: 2026-05-22-dfl-fork-shift-all-off-end — see docs/PLAN-DEVIATIONS.md.`

Both markers appear at every patch site in `src/` and at the matching type lines in the relevant `.d.ts` files.
