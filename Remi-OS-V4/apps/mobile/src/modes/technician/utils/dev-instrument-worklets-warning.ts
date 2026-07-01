/**
 * `dev-instrument-worklets-warning` (PR-UX-13 Issue D, 2026-05-09).
 *
 * Diagnostics-only side-effect module. When loaded (DEV builds
 * only), wraps `console.warn` so that any message matching the
 * Reanimated 4 worklet ref-mutation guard
 *
 *   "[Worklets] Tried to modify key `current` of an object which has
 *   been already passed to a worklet."
 *
 * captures a JS-thread stack trace and emits an additional
 * `[DIAG-WORKLETS-WARN]` log alongside the original warning. The
 * stack trace points at the caller that triggered Reanimated's
 * worklet-frozen-ref capture re-mutation — we use that pointer to
 * locate the offending render-time `xxxRef.current = ...` assignment.
 *
 * The PR-UX-11 and PR-UX-12 passes hand-audited every
 * `\.current\s*=` site in the changed files and moved the
 * mutations into `useEffect`. The user reports the warning is
 * still firing as of 2026-05-09 PR-UX-12 smoke; this instrument
 * narrows down where so the next pass can fix it without another
 * round of full-grep audits.
 *
 * Anti-instructions:
 *   - Don't ship in a production-tagged release. The wrapper
 *     adds a small overhead on every console.warn (string match +
 *     `new Error().stack`). Gated on `__DEV__`.
 *   - Don't broaden the match string without thought. We
 *     intentionally only capture the worklet-frozen warning so
 *     other warnings (e.g. expo, RN core) aren't spammed with
 *     stack traces.
 *   - Remove the import in `app/_layout.tsx` once Issue D closes.
 */

if (__DEV__) {
  const originalWarn = console.warn;
  const SIGNATURE = "Tried to modify key";
  console.warn = (...args: unknown[]) => {
    try {
      const firstArg = args[0];
      if (typeof firstArg === "string" && firstArg.includes(SIGNATURE)) {
        const stackErr = new Error("DIAG-WORKLETS-WARN");
        const stack = stackErr.stack ?? "<no stack>";
        // Two emits so the user's on-device log dump can grep
        // either tag. The original `console.warn` is also fired so
        // the regular React Native log surface still shows the
        // warning (we don't want to swallow the message).
        originalWarn.call(
          console,
          "[DIAG-WORKLETS-WARN]",
          firstArg,
          { hasMoreArgs: args.length > 1, stack },
        );
      }
    } catch {
      // Defensive — never let the diagnostic break the app.
    }
    originalWarn.apply(console, args);
  };
}

export {};
