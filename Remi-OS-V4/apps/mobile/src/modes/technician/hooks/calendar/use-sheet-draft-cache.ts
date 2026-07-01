/**
 * `useSheetDraftCache` (P3-FE-6) — companion hooks to
 * `useSheetDraftStore`. Each form sheet pairs `useSheetDraftRead`
 * (called once before `useForm` to seed defaults) with
 * `useSheetDraftWrite` (called after `useForm` with the live
 * watched values) so the user's typing survives implicit close
 * (tap-outside, swipe-down, navigation away).
 *
 * **Why two hooks instead of one combined call:**
 *
 *   The chicken-and-egg of RHF — `useForm({ defaultValues })` has
 *   to be passed the cached values BEFORE the form exists, and the
 *   reactive `watch()` values are only available AFTER the form
 *   exists. A single hook would either need to be called twice
 *   (Rules of Hooks violation in the second call) or accept a
 *   ref/callback for values (awkward and breaks the "pass live
 *   values, hook debounces" ergonomic). Splitting the read from
 *   the write keeps each hook one-purpose and lets useState-based
 *   sheets call them in sequence too.
 *
 * **Lifecycle invariants (apply to both halves):**
 *
 *   - When `cacheKey` is `null`, `undefined`, or `enabled: false`,
 *     the hooks are no-ops: `useSheetDraftRead` returns
 *     `undefined`, `useSheetDraftWrite` writes nothing, and
 *     `clearDraft` direct calls are no-ops too. This lets a sheet
 *     wire the hooks unconditionally without branching on the
 *     call.
 *   - The `useSheetDraftRead` snapshot is captured at the FIRST
 *     render where `cacheKey` becomes a non-null string. Subsequent
 *     typing-induced writes do NOT update the returned `cached`
 *     value — that's important because the consumer typically
 *     passes `cached` straight into `useForm({ defaultValues })`
 *     and we must not race-update defaults while the form is
 *     mounted.
 *   - On unmount, `useSheetDraftWrite` flushes one final write
 *     (covering the pathological "user taps out within
 *     `<DEBOUNCE_MS>` of the last keystroke" case where the
 *     pending debounce timer would otherwise be cancelled
 *     unfired). It does NOT clear the cache — implicit close
 *     preserves typing by design. Explicit clears happen via
 *     `clearSheetDraft(cacheKey, sheetKind)` (called from Save
 *     success / Cancel CTAs) or via
 *     `useCalendarStore.dismissDraft → clearForDraft(cacheKey)`.
 *
 * See `docs/DEVELOPMENT-LOG.md#deferred-chunk-p3-fe-6` for the
 * full chunk write-up.
 */

import { useEffect, useMemo, useRef } from "react";
import {
  type SheetKind,
  useSheetDraftStore,
} from "@technician/stores/use-sheet-draft-store";

/**
 * Debounce window (ms) for cache writes. Long enough that a typing
 * burst collapses to a single store update; short enough that the
 * "tap-outside immediately after typing" path always lands the
 * latest value before unmount. The unmount-flush below covers the
 * pathological case where the user taps out within `<DEBOUNCE_MS>`
 * of the last keystroke.
 */
const DEBOUNCE_MS = 300;

export interface UseSheetDraftReadOptions {
  /**
   * Opaque per-sheet cache key. See `useSheetDraftStore`'s
   * docstring for the convention (`draft:<id>`, `appt:<id>`, etc.).
   * Pass `null`/`undefined` to disable caching for this mount.
   */
  cacheKey: string | null | undefined;
  /** Discriminates which of the five sheet kinds is reading. */
  sheetKind: SheetKind;
  /**
   * Optional master kill-switch. Defaults to `true`. Set to `false`
   * to suppress reads even when `cacheKey` is non-null.
   */
  enabled?: boolean;
}

export interface UseSheetDraftWriteOptions<T> {
  /** See `UseSheetDraftReadOptions.cacheKey`. */
  cacheKey: string | null | undefined;
  /** See `UseSheetDraftReadOptions.sheetKind`. */
  sheetKind: SheetKind;
  /**
   * Latest values to cache. Pass `useForm().watch()` for RHF
   * sheets, or a `useMemo`-ified bag of `useState` values for
   * useState sheets. Reference equality is what triggers a
   * write — always pass a fresh object on change.
   */
  values: T;
  /** See `UseSheetDraftReadOptions.enabled`. */
  enabled?: boolean;
}

/**
 * Read the cached values for `(cacheKey, sheetKind)` ONCE per mount
 * (snapshotted via `useMemo`). Returns `undefined` when no entry
 * exists or the hook is disabled.
 *
 * Call this BEFORE `useForm` / the first `useState` so the result
 * can seed defaults. Subsequent writes from this same instance do
 * NOT change the returned value — the snapshot is intentionally
 * stable for the mount's lifetime.
 */
export function useSheetDraftRead<T>(opts: UseSheetDraftReadOptions): T | undefined {
  const { cacheKey, sheetKind, enabled = true } = opts;

  return useMemo<T | undefined>(() => {
    if (!enabled || !cacheKey) return undefined;
    return useSheetDraftStore.getState().getDraft<T>(cacheKey, sheetKind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, sheetKind, enabled]);
}

/**
 * Write the latest `values` to the cache, debounced by ~300ms. On
 * unmount, flushes one final synchronous write so the latest typing
 * is never lost to a not-yet-fired debounce timer.
 *
 * Call this AFTER `useForm` (so `watch()` values are available) or
 * after the relevant `useState`s.
 */
export function useSheetDraftWrite<T>(opts: UseSheetDraftWriteOptions<T>): void {
  const { cacheKey, sheetKind, values, enabled = true } = opts;

  // Always read latest values via a ref so the unmount-flush below
  // doesn't capture a stale closure when the debounce window hasn't
  // elapsed yet.
  const valuesRef = useRef(values);
  valuesRef.current = values;

  // Debounced write on every values change.
  useEffect(() => {
    if (!enabled || !cacheKey) return;
    const handle = setTimeout(() => {
      useSheetDraftStore.getState().setDraft(cacheKey, sheetKind, valuesRef.current);
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [enabled, cacheKey, sheetKind, values]);

  // Unmount-flush: when the parent unmounts the sheet within
  // DEBOUNCE_MS of the last keystroke, the pending setTimeout is
  // cancelled before it fires. Re-fire one synchronous write so the
  // latest typed value still lands in the cache.
  useEffect(() => {
    if (!enabled || !cacheKey) return;
    return () => {
      useSheetDraftStore.getState().setDraft(cacheKey, sheetKind, valuesRef.current);
    };
  }, [enabled, cacheKey, sheetKind]);
}

/**
 * Imperative cache-clear for sheet Save / Cancel handlers. Wraps
 * `useSheetDraftStore.clearDraft` with the same `null`-cacheKey
 * guard the hooks use, so call sites can stay branch-free:
 *
 *   ```ts
 *   onSuccess: () => {
 *     clearSheetDraft(cacheKey, "appointment");
 *     onClose();
 *   }
 *   ```
 *
 * No-op when `cacheKey` is null/undefined.
 */
export function clearSheetDraft(
  cacheKey: string | null | undefined,
  sheetKind: SheetKind,
): void {
  if (!cacheKey) return;
  useSheetDraftStore.getState().clearDraft(cacheKey, sheetKind);
}
