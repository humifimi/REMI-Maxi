/**
 * `applyPendingChangeBorderOverride` (P3-FE-8 / C.12) — shared helper
 * the three calendar wrappers (`ResourceCalendarDayView`,
 * `ResourceCalendarWorkweekView`, `LandscapeWorkweekView`) call from
 * the tail of their `eventStyleOverrides` callbacks to paint the
 * cross-device "pending change" overlay on appointment tiles.
 *
 * PLAN-DEVIATION: 2026-04-27-pending-overlay-tint — the original spec
 * (DEVELOPMENT-LOG §deferred-chunk-p3-fe-8) called for a 1.5pt dashed
 * yellow border. We dropped both the dash and the yellow:
 *
 *   1. **Dashed never rendered.** RN on iOS only honors
 *      `borderStyle: "dashed"` when `borderRadius === 0`. The
 *      vendored library's `EventBlock` uses `borderRadius: 5`, so
 *      every dashed border silently rasterized as a solid 1pt line.
 *
 *   2. **Border width was always clobbered.** The library merges
 *      `[styles.event, resolved.container, dynamicStyle]` and
 *      `dynamicStyle.borderWidth = selected ? 2 : 1` is the last
 *      writer. Our `borderWidth: 1.5` from the `resolved.container`
 *      slot was overridden every render. Same for `borderColor`
 *      (dynamicStyle sets it to `rgba(0,0,0,0.12)` or `#4d959c` when
 *      selected). Only `backgroundColor` survives the merge — every
 *      other border knob the spec called for was a no-op.
 *
 * The replacement treatment uses the only style knob the vendored
 * library passes through cleanly: a saturated `backgroundColor` tint
 * in `PendingOverlayColors.tile` (cyan-500) plus white title / desc /
 * time text. See `src/constants/colors.ts` for the hue choice — cyan
 * is the only saturated color with a ≥ 30° hue-wheel gap from every
 * tech, status, and source-badge color, so a tile painted cyan can
 * never be confused with a tech or status tile. See
 * `docs/PLAN-DEVIATIONS.md#2026-04-27-pending-overlay-tint`.
 *
 * Local-vs-remote source differentiation rides on the existing
 * `PendingChangeBadge` icon (`PendingChangeBadge.tsx`) — pencil for
 * tech, sparkles for AI, person for FO, headset for customer. The
 * tile color says "pending"; the badge icon says "who staged it."
 * We deliberately do NOT pick a second hue for local-vs-remote
 * because there's no other saturated color with a comparable moat
 * around it on the wheel.
 *
 * Cross-device data flow: the helper trusts
 * `usePendingChangeOverlay`'s merge logic, which surfaces both the
 * device-local `usePendingRealityStore` slice AND the BE annotation
 * (`appointment.pending_intent_summary`, P6-BE-9). The BE annotation
 * already covers `pending_review` / staged sessions from any other
 * device in the franchise, so once a sibling device stages an intent
 * and the calendar refetches (via `useAppStateFocusBridge` on
 * foreground or the next 30s `staleTime` lapse), the cyan tile
 * appears here without any per-device subscription wiring needed.
 *
 * Coexistence with `2026-04-21-tap-to-create-draft`: the synthetic
 * draft block carries `meta.isDraft` but never `meta.appointment`,
 * so `pendingIntentSummary` is always `null` for drafts and the
 * merge logic short-circuits to `isPending: false`. The two
 * treatments never collide on the same cell.
 */

import type { Event as RCEvent, StyleOverrides } from "react-native-resource-calendar";

import { PendingOverlayColors } from "@technician/constants/colors";
import { getAppointmentFromEvent } from "@technician/utils/resource-calendar-mapping";
import { computePendingChangeOverlay } from "@technician/hooks/calendar/use-pending-change-overlay";
import type { ReorganizationIntent } from "@technician/types/reorganization";

export interface PendingOverlayStyleArgs {
  /** Local intent slice from `usePendingRealityStore.intents`. */
  localIntents: ReorganizationIntent[];
  /** Local session id from `usePendingRealityStore.sessionId`. */
  localSessionId: number | null;
  /**
   * PR-UX-2 PASS 2.18 (2026-05-05) — defensive orphan suppression.
   * Set of reorganization session ids the device has any local
   * knowledge of (active store session + FO's pending-review list,
   * see `useKnownReorganizationSessionIds`). When provided AND the
   * BE annotation references a session id NOT in the set AND no
   * local intents target the appointment, the overlay drops to
   * suppress cyan paint sourced from stale BE rows the demo-reset
   * cleanup didn't catch. `null` / `undefined` preserves the pre-
   * 2.18 behavior — every BE annotation paints through. See the
   * `Cleanup:OrphanedSession` dev warn emitted by
   * `computePendingChangeOverlay` for observability.
   */
  knownSessionIds?: ReadonlySet<number> | null;
}

/**
 * Mutate `base` in place to paint the cyan pending-change tint when
 * the event has any active intents staged against it. Returns the
 * mutated reference for fluent use.
 *
 * The library's `StyleOverrides.container` is a `ViewStyle` — not a
 * `ViewStyle[]` — so we splat the existing container fields onto a
 * fresh object instead of stacking. `backgroundColor` is the only
 * field that survives the library's `dynamicStyle` array merge (see
 * file docstring) so the tint replaces the per-tech / per-slot bg
 * outright. Title / desc / time text get re-colored to white so they
 * stay legible against the saturated cyan.
 */
export function applyPendingChangeBorderOverride(
  event: RCEvent,
  base: StyleOverrides | undefined,
  args: PendingOverlayStyleArgs,
): StyleOverrides | undefined {
  const appointment = getAppointmentFromEvent(event);
  if (!appointment) return base;

  const localIntentsForAppointment = args.localIntents.filter(
    (i) => i.appointment_id === appointment.id,
  );
  const overlay = computePendingChangeOverlay(
    appointment,
    localIntentsForAppointment,
    args.localSessionId,
    args.knownSessionIds ?? null,
  );
  if (!overlay.isPending) return base;

  const baseContainer = base?.container ?? {};
  // We deliberately REPLACE title / desc / time text styles instead
  // of spreading the base. `StyleOverrides.time` is `StyleProp<TextStyle>`
  // (which can legally be an array, ruling out a spread) and the pending
  // tile is saturated cyan — any per-tech / per-slot text-color the base
  // carries (white on dark, dark on yellow, etc.) would clash. White is
  // the only legible foreground against `PendingOverlayColors.tile`, so
  // overwriting wholesale is the intended behavior here, not a regression.
  return {
    ...(base ?? {}),
    container: {
      ...baseContainer,
      backgroundColor: PendingOverlayColors.tile,
    },
    title: { color: PendingOverlayColors.text, fontWeight: "700" },
    desc: { color: PendingOverlayColors.text, opacity: 0.9 },
    time: { color: PendingOverlayColors.text },
  };
}
