/**
 * `PendingChangeBadge` (P3-FE-8 / C.12) — the small `TopRight`
 * source-badge slot the calendar renders on top of any appointment
 * card whose `usePendingChangeOverlay(appointment)` selector
 * resolves to `isPending: true`. Sister to the dashed-border
 * treatment painted by each calendar wrapper's
 * `eventStyleOverrides` callback.
 *
 * Wired through the vendored `<Calendar eventSlots={{ TopRight }} />`
 * extension point (FORK Phase 16-ish; see
 * `vendor/react-native-resource-calendar/dist/index.d.ts`'s
 * `EventSlots`). The library mounts one badge instance per visible
 * event and feeds in the `event` + `ctx`. The badge takes care of
 * its own no-op decision: when the source event isn't an
 * appointment (drafts, personal events) or has no pending intents,
 * it renders `null` so the calendar's normal chrome wins.
 *
 * PR-UX-2 PASS 2.22 (2026-05-05) — the badge subscribes to
 * `useKnownReorganizationSessionIds()` itself and threads the
 * resulting set into `usePendingChangeOverlay` so the orphan-session
 * suppression branch fires here too. Before this pass, the cyan
 * tile's `applyPendingChangeBorderOverride` honored the suppression
 * (the calendar wrappers passed `knownSessionIds` into the style
 * args), but the badge component called the bare two-arg form of
 * the overlay hook and silently rendered the sparkle/pencil icon +
 * `+N` count pill from a `pending_intent_summary` annotation whose
 * session was no longer in the FO's actionable set. Result on a
 * cold launch with empty Pending Reality: the cyan tile correctly
 * disappeared but the badge still painted, so the user perceived
 * "Pending Reality says nothing pending but my calendar still
 * shows pending markers." The fix is one extra hook subscription
 * here — no prop threading required because the badge mounts as
 * a React component, not a memoized callback.
 *
 * Visual contract per DEVELOPMENT-LOG §deferred-chunk-p3-fe-8:
 *   - 12pt circular badge anchored to the top-right corner of the
 *     event card. Background = `StatusColors.scheduled` (yellow);
 *     icon glyph = white; subtle hairline border for legibility on
 *     warm-toned per-tech colors.
 *   - Icon picks per source:
 *       tech_app       → pencil
 *       franchise_app  → person
 *       customer_app   → headset
 *       ai_engine      → sparkles
 *       mixed          → layers
 *   - When `intentCount > 1`, a tiny `+N` pill renders to the left
 *     of the badge so the user sees there are multiple sibling
 *     intents staged against the same card.
 *
 * Subscribes to the local `usePendingRealityStore` via
 * `usePendingChangeOverlay` so an intent staged on this device
 * paints the overlay immediately, without waiting for a BE refetch
 * to ship the `pending_intent_summary` annotation back. See the
 * hook's docstring for the local-vs-BE merge rules.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Event as RCEvent } from "react-native-resource-calendar";

import { StatusColors } from "@technician/constants/colors";
import { getAppointmentFromEvent } from "@technician/utils/resource-calendar-mapping";
import { usePendingChangeOverlay } from "@technician/hooks/calendar/use-pending-change-overlay";
import { useKnownReorganizationSessionIds } from "@technician/hooks/calendar/use-known-reorganization-session-ids";
import type { PendingIntentSummarySource } from "@technician/types/reorganization";

interface PendingChangeBadgeProps {
  event: RCEvent;
}

const ICON_FOR_SOURCE: Record<
  PendingIntentSummarySource,
  React.ComponentProps<typeof Ionicons>["name"]
> = {
  tech_app: "pencil",
  franchise_app: "person",
  customer_app: "headset",
  ai_engine: "sparkles",
  mixed: "layers",
};

export function PendingChangeBadge({ event }: PendingChangeBadgeProps) {
  // Personal events / drafts never carry a `pending_intent_summary`
  // (see `appointmentToEvent` vs `personalEventToEvent`), so the
  // hook will short-circuit. Reading the appointment up front keeps
  // the early-return tidy and avoids passing an arbitrary RCEvent
  // through to the merge logic.
  const appointment = getAppointmentFromEvent(event);
  // PR-UX-2 PASS 2.22 (2026-05-05): subscribe to the same
  // known-session set the cyan-tile path uses so the badge
  // suppresses on orphan annotations alongside the tile. Without
  // this arg, the badge would paint sparkle/pencil + `+N` from a
  // `pending_intent_summary` referencing a session the FO has no
  // way to act on. The hook is FO-only by design — for tech
  // accounts it returns `null` and the merge falls through to
  // legacy behavior (paint the BE annotation as-is).
  const knownSessionIds = useKnownReorganizationSessionIds();
  const overlay = usePendingChangeOverlay(appointment, knownSessionIds);

  if (!overlay.isPending) return null;

  const iconName = ICON_FOR_SOURCE[overlay.source ?? "tech_app"];
  const showCount = overlay.intentCount > 1;

  return (
    <View
      style={styles.wrapper}
      accessibilityLabel={accessibilityLabelFor(overlay.source, overlay.intentCount)}
      pointerEvents="none"
    >
      {showCount ? (
        <View style={styles.countPill}>
          <Text style={styles.countText}>{`+${overlay.intentCount - 1}`}</Text>
        </View>
      ) : null}
      <View style={styles.badge}>
        <Ionicons name={iconName} size={10} color="#FFFFFF" />
      </View>
    </View>
  );
}

function accessibilityLabelFor(
  source: PendingIntentSummarySource | null,
  intentCount: number,
): string {
  const sourceLabel: Record<PendingIntentSummarySource, string> = {
    tech_app: "you",
    franchise_app: "your owner",
    customer_app: "the customer",
    ai_engine: "the AI engine",
    mixed: "multiple actors",
  };
  const who = source ? sourceLabel[source] : "you";
  if (intentCount > 1) {
    return `Pending changes from ${who}, ${intentCount} intents`;
  }
  return `Pending change from ${who}`;
}

const styles = StyleSheet.create({
  wrapper: {
    // The library mounts the `TopRight` slot inside a Row at
    // `position: absolute, right: 2` (see vendor/dist/index.js
    // around the `slots?.TopRight` createElement). The slot
    // contributor only needs to pad and lay out its own contents.
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingTop: 2,
  },
  badge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: StatusColors.scheduled,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.15)",
  },
  countPill: {
    minWidth: 16,
    height: 14,
    paddingHorizontal: 4,
    borderRadius: 7,
    backgroundColor: StatusColors.scheduled,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    color: "#1F2937",
    fontSize: 9,
    fontWeight: "700",
  },
});
