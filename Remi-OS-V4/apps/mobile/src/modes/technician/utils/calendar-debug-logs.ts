/**
 * `calendar-debug-logs` — single source of truth for the verbose
 * default-off flag that gates the calendar's high-volume diagnostic
 * logs (the `[BUG-A:*]` family + the `[MoveChain:*]` family).
 *
 * Background — why this gate exists (2026-05-07):
 *
 *   Earlier diagnostic passes added per-render `console.log` /
 *   `console.warn` sites at every layer of the calendar pipeline so a
 *   prior bug investigation could trace a leak / cyan-tile / pending-
 *   reality mismatch on-device. They never got cleaned up because
 *   the user actively uses them when reproducing new bugs. By the
 *   time the move-chain selector + cascade-real fixes shipped, the
 *   diagnostic surface had grown to:
 *
 *     - 6 `[BUG-A:*]` sites in the vendored library that fire 1× per
 *       render, per resource (`useEventsFor`), per day-cell (`Feeder`),
 *       per Provider mount, etc.
 *     - The `[Cleanup:OrphanedSession]` warn that fires from EVERY
 *       call site of `computePendingChangeOverlay` per appointment per
 *       render (two call sites: `applyPendingChangeBorderOverride` +
 *       `PendingChangeBadge`, so 2× per appointment). On a calendar
 *       with 17 appointments + 5 unrelated `tech_app` orphan drafts,
 *       that's 34 yellow-box warns per render.
 *     - `[MoveChain:Layout:*]`, `[MoveChain:Wrapper:Pos:*]`,
 *       `[MoveChain:ScrollSV:*]`, `[MoveChain:Wire:*]`,
 *       `[MoveChain:Touch:*]`, `[MoveChain:ChipRow] render`, and the
 *       250ms `[MoveChain:Pulse:Singleton] heartbeat` (4 Hz while a
 *       chain is selected).
 *
 *   With ~9 staged intents and a few minutes of drag-and-edit
 *   activity, the cumulative log + LogBox cost was JS-thread
 *   starvation: React renders fired but the native commit phase was
 *   delayed long enough that the chip row visually appeared frozen
 *   even though the detector was correctly emitting new graphs to it.
 *
 * Contract:
 *
 *   - In production (`__DEV__ === false`), the flag is permanently
 *     `false`. Every call site that gates on this constant is dead
 *     code under tree-shaking — no bundle cost.
 *   - In dev, the flag reads
 *     `process.env.EXPO_PUBLIC_VERBOSE_CALENDAR_LOGS === "1"` ONCE at
 *     module load. Default off. Set the env var (in `.env` or via
 *     `EXPO_PUBLIC_VERBOSE_CALENDAR_LOGS=1 npx expo start`) to opt
 *     back in for diagnostic captures. The env var is intentionally
 *     prefixed `EXPO_PUBLIC_` so Metro / Expo bundles it client-side;
 *     a non-public env var would be `undefined` at runtime.
 *
 * Why a constant rather than a function: the flag is read inside hot
 * paths (per-render callbacks, per-event renderers) where a function
 * call would itself be visible in profiles. Reading a module-scope
 * `const boolean` is free.
 *
 * Reading the flag — every gated site looks like:
 *
 *   if (VERBOSE_CALENDAR_LOGS) {
 *     console.log("[BUG-A:CalendarRender]", { ... });
 *   }
 *
 * The `__DEV__` check is folded into the constant, so callers don't
 * need to wrap a second time.
 */

// One read at module load. `process.env.EXPO_PUBLIC_*` is inlined by
// the Expo / Metro bundler at build time (see Expo Router env-var
// docs), so this is effectively a compile-time constant in the
// shipped bundle — even in dev, we don't pay a process.env lookup
// cost per render.
export const VERBOSE_CALENDAR_LOGS: boolean =
  __DEV__ && process.env.EXPO_PUBLIC_VERBOSE_CALENDAR_LOGS === "1";
