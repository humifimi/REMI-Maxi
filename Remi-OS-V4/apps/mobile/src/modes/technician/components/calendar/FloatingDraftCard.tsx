/**
 * `FloatingDraftCard` — overlay UI for the tap-to-create draft flow
 * (P2-FE-5, course-corrected 2026-04-21).
 *
 * Renders the off-canvas pieces of the draft surface — the
 * tap-outside backdrop and the chooser popover. The on-canvas dashed
 * draft block itself is NOT painted by this component; it's a
 * synthetic event injected into the calendar's `resources[].events`
 * array via `useResourcesWithDraft`, so the vendored library renders
 * it natively (snap-to-cell, drag-to-move, dashed-border styling
 * already wired in every wrapper's `eventStyleOverrides`).
 *
 * Why "Floating" stays in the name:
 * The component used to be a literal floating overlay that animated
 * across rotation transitions and held a 30-second snapshot. That
 * model was cut on 2026-04-21 (see deviation
 * `2026-04-21-tap-to-create-draft` and `2026-04-21-rotation-sideways-draft`).
 * The name is preserved so the master plan §5.1.7/§5.1.8 references
 * still resolve and so the file's git history doesn't fragment.
 *
 * Lifecycle (consult store actions, NOT this component, for state):
 *   1. `onBlockTap(resource, date)` in any calendar wrapper →
 *      `useCalendarStore.createDraft({ date, startMinutes, technicianId })`.
 *      Synthetic event appears (dashed) at the tapped cell on the next
 *      render. NO popover yet.
 *   2. User taps the synthetic event → `onEventPress` in
 *      `app/(tabs)/index.tsx` detects the synthetic id (via
 *      `isDraftSyntheticEventId`) and calls `setDraftChooserOpen(true)`.
 *      THIS component renders the `DraftChooserPopover`.
 *   3. User taps Customer or Personal → popover invokes its
 *      `onChoose(kind)` prop, which records the kind on the draft and
 *      opens the appointment form sheet. The draft survives until the
 *      sheet closes (committed or cancelled).
 *   4. User taps the backdrop (tap-outside):
 *      - If chooser is open: close ONLY the chooser. Draft stays.
 *      - If chooser is closed: dismiss the draft entirely.
 *      (User behavior 2026-04-21: "Tap anywhere else when popup is
 *      present above draft card only popup closes then if tapped
 *      anywhere else again the card closes too.")
 *   5. `onDragEnd` for the synthetic event in `app/(tabs)/index.tsx`
 *      calls `updateDraft({ date, startMinutes, technicianId })` so
 *      drag-to-move snaps the draft to the new cell with no extra UI.
 *
 * Mount once at the calendar tab root, OUTSIDE any
 * portrait/landscape conditional, so the draft surface survives the
 * `CalendarBindingProvider` remount that comes with rotation.
 */

import React, { useCallback, useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import dayjs from "dayjs";

import { useCalendarStore, type PendingDraft } from "@technician/stores/calendar";
import { minutesToTimeString } from "@technician/utils/resource-calendar-mapping";
import {
  EmbeddedAvatarSelector,
  type EmbeddedAvatarSelectorTech,
} from "@technician/components/calendar/embedded-avatar-selector";

// ── Synthetic-event identification ─────────────────────────────────

/**
 * Sentinel id used for the synthetic draft event injected into the
 * calendar's `resources[].events` array. Negative so it can NEVER
 * collide with a real appointment id (which are always positive
 * server-issued integers). Constant rather than counter-based —
 * there's only ever one pending draft, so one sentinel is enough.
 */
export const SYNTHETIC_DRAFT_EVENT_ID = -1 as const;

export function isDraftSyntheticEventId(id: number | undefined | null): boolean {
  return id === SYNTHETIC_DRAFT_EVENT_ID;
}

// ── Resources injection hook ───────────────────────────────────────

/** Shape of the per-resource entry that `<Calendar>` accepts. */
interface ResourceWithEvents {
  id: number;
  name: string;
  avatar?: string;
  events: Array<{
    id: number;
    resourceId: number;
    date: string;
    from: number;
    to: number;
    title?: string;
    description?: string;
    meta?: { [key: string]: unknown };
  }>;
  disabledBlocks?: unknown[];
  disableIntervals?: unknown[];
}

/**
 * Splice the current `pendingDraft` into the `resources` array as a
 * synthetic event the vendored `<Calendar>` can render. Returns the
 * input unchanged when:
 *   - There is no pending draft.
 *   - The draft has no `technicianId` (the user has not yet picked
 *     a tech via the embedded avatar selector — the draft has no
 *     home column to live on, so we render NOTHING on the canvas
 *     and let the selector provide the only affordance).
 *   - The draft's `technicianId` is set but no matching resource
 *     exists in the array.
 *
 * The synthetic event carries `meta.isDraft === true` so each
 * wrapper's existing `isDraftEvent(event)` check in
 * `eventStyleOverrides` paints it with the dashed-border treatment
 * (no extra wiring needed).
 *
 * Called inside each calendar wrapper (`LandscapeWorkweekView`,
 * `resource-calendar-day-view`, `resource-calendar-workweek-view`)
 * just before passing `resources` to `<Calendar>`.
 */
// PLAN-DEVIATION: 2026-04-23-empty-mode-draft-vanish — null-tech
// drafts NO LONGER attach to `resources[0]` as a chunk-1 compromise.
// Instead, FloatingDraftCard renders an EmbeddedAvatarSelector and
// the canvas stays clean until the user picks a tech. See
// docs/PLAN-DEVIATIONS.md#2026-04-23-empty-mode-draft-vanish.
export function useResourcesWithDraft<T extends ResourceWithEvents>(
  resources: T[],
): T[] {
  const draft = useCalendarStore((s) => s.pendingDraft);
  return useMemo(() => {
    if (!draft || resources.length === 0) return resources;

    // Null-tech drafts intentionally don't render any canvas block
    // — the embedded avatar selector is the only affordance until
    // the user picks. Returning `resources` unchanged keeps the
    // grid empty (in landscape empty-mode) instead of arbitrarily
    // attaching the dashed block to the first resource.
    if (draft.technicianId === null) return resources;

    let injected = false;
    const next = resources.map((r) => {
      if (r.id !== draft.technicianId) return r;
      injected = true;
      return {
        ...r,
        events: [
          ...r.events,
          {
            id: SYNTHETIC_DRAFT_EVENT_ID,
            resourceId: r.id,
            date: draft.date,
            from: draft.startMinutes,
            to: draft.startMinutes + draft.durationMinutes,
            title: "New",
            meta: { isDraft: true, draftKind: draft.kind ?? "unset" },
          },
        ],
      };
    });
    if (!injected) {
      console.warn(
        "[CAL:draft] useResourcesWithDraft — pendingDraft technicianId not in resources",
        { draftTech: draft.technicianId, resourceIds: resources.map((r) => r.id) },
      );
      return resources;
    }
    return next;
  }, [draft, resources]);
}

// ── Chooser popover ────────────────────────────────────────────────

interface DraftChooserPopoverProps {
  draft: PendingDraft;
  onChoose: (kind: "customer" | "personal") => void;
  onDismiss: () => void;
}

/**
 * Small chooser shown above the dashed draft block when the user taps
 * the draft a second time. Replaces `EventTypeChooserSheet` for the
 * tap-to-create flow (the bottom sheet still exists for legacy
 * long-press paths but is no longer reachable through the primary
 * gesture — see deviation 2026-04-21-tap-to-create-draft).
 *
 * Three rows: Customer Appointment, Personal Event, Cancel. The
 * Cancel row is the explicit always-discoverable dismiss path —
 * added 2026-04-22 because closing the chooser via backdrop-tap left
 * the dashed draft stranded on the canvas with no obvious way to
 * remove it short of dragging it off-screen or re-tapping then
 * picking a kind. Cancel calls `dismissDraft()` which clears both
 * the draft and the chooser flag.
 *
 * Anchoring strategy (chunk 1): top-center of the screen, below the
 * status bar, with a downward-pointing tail implying "above the
 * draft". A future polish chunk can measure the synthetic event's
 * rendered position and anchor the popover to it directly. See
 * `docs/PLAN-DEVIATIONS.md#2026-04-21-tap-to-create-draft` —
 * "Anchored popover positioning is deferred to a follow-up."
 */
function DraftChooserPopover({ draft, onChoose, onDismiss }: DraftChooserPopoverProps) {
  const contextLabel = useMemo(() => {
    const day = dayjs(draft.date);
    const dayLabel = day.isSame(dayjs(), "day")
      ? "Today"
      : day.format("ddd, MMM D");
    const timeLabel = minutesToTimeString(draft.startMinutes);
    return `${dayLabel} · ${timeLabel}`;
  }, [draft.date, draft.startMinutes]);

  return (
    <View pointerEvents="box-none" style={styles.popoverHost}>
      <View style={styles.popover} accessibilityRole="menu">
        <Text style={styles.popoverTitle}>What are you scheduling?</Text>
        <Text style={styles.popoverContext}>{contextLabel}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => onChoose("customer")}
          style={[styles.popoverRow, styles.popoverRowDivider]}
        >
          <Text style={styles.popoverRowText}>Customer Appointment</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => onChoose("personal")}
          style={[styles.popoverRow, styles.popoverRowDivider]}
        >
          <Text style={styles.popoverRowText}>Personal Event</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Cancel draft"
          onPress={onDismiss}
          style={styles.popoverRow}
          testID="draft-chooser-cancel"
        >
          <Text style={[styles.popoverRowText, styles.popoverRowTextCancel]}>
            Cancel
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.popoverTail} />
    </View>
  );
}

// ── Top-level component ────────────────────────────────────────────

export interface FloatingDraftCardProps {
  /**
   * Called when the user picks Customer or Personal in the chooser.
   * Consumer is expected to record `kind` on the draft (or in the
   * form's initial values) and open the appointment form sheet.
   *
   * The default no-op is OK in tests / storybook — tapping a chooser
   * row will close the chooser but not open any form.
   */
  onChooseKind?: (kind: "customer" | "personal", draft: PendingDraft) => void;
  /**
   * P2-FE-8 — list of techs available for the embedded avatar
   * selector. The selector renders ONLY when
   * `pendingDraft.technicianId === null`. When omitted (or empty),
   * a null-tech draft displays no selector and the user has to
   * cancel-and-retry from a tech-bound cell. Provided by the
   * franchise-side calendar tab (which has `availableWorkweekTechs`
   * already aggregated); the technician-side tab passes the single
   * logged-in tech.
   */
  techs?: EmbeddedAvatarSelectorTech[];
  /**
   * P2-FE-8 — fired when the user picks a tech in the embedded
   * avatar selector. Host is expected to call
   * `useCalendarStore.setDraftTechnician(techId)` and (in landscape
   * empty-mode) push the tech onto `selectedTechIds` so the column
   * appears.
   */
  onPickDraftTechnician?: (techId: number) => void;
}

export function FloatingDraftCard({
  onChooseKind,
  techs,
  onPickDraftTechnician,
}: FloatingDraftCardProps = {}) {
  const draft = useCalendarStore((s) => s.pendingDraft);
  const chooserOpen = useCalendarStore((s) => s.draftChooserOpen);
  const setChooserOpen = useCalendarStore((s) => s.setDraftChooserOpen);
  const updateDraft = useCalendarStore((s) => s.updateDraft);
  const dismissDraft = useCalendarStore((s) => s.dismissDraft);

  const handleBackdropPress = useCallback(() => {
    if (chooserOpen) {
      // Tap-outside semantics 2026-04-21: chooser open → close ONLY
      // the chooser. Draft stays. Second outside-tap dismisses.
      setChooserOpen(false);
    } else {
      dismissDraft();
    }
  }, [chooserOpen, setChooserOpen, dismissDraft]);

  const handleChoose = useCallback(
    (kind: "customer" | "personal") => {
      if (!draft) return;
      updateDraft({ kind });
      setChooserOpen(false);
      onChooseKind?.(kind, { ...draft, kind });
    },
    [draft, updateDraft, setChooserOpen, onChooseKind],
  );

  const handlePickTech = useCallback(
    (techId: number) => {
      onPickDraftTechnician?.(techId);
    },
    [onPickDraftTechnician],
  );

  if (!draft) return null;
  const showAvatarSelector =
    draft.technicianId === null && (techs?.length ?? 0) > 0;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      testID="floating-draft-card-host"
    >
      {/*
       * Tap-outside backdrop is rendered ONLY when the chooser
       * popover is up. Why: a full-screen Pressable swallows every
       * tap on the screen (the host's `pointerEvents="box-none"`
       * doesn't propagate to children — the Pressable is still
       * pointer-receiving). So while a backdrop is mounted, the
       * calendar can never see a tap on the dashed draft, on a real
       * event, or on a different empty cell — every gesture
       * registers as "outside" and dismisses.
       *
       * Trade-off (chunk 1.1, fix on 2026-04-21): when only the
       * draft is showing (chooser closed), there is no backdrop, so
       * "tap empty area to dismiss draft" doesn't fire. Dismissal
       * paths that DO work:
       *   - tap the dashed draft → opens chooser → "Cancel" row
       *     (added 2026-04-22; this is the explicit
       *     always-discoverable path);
       *   - tap a real event (dismisses + opens);
       *   - tap a different empty cell (moves the draft via
       *     `createDraft`'s overwrite);
       *   - pick Customer or Personal in the chooser (commits +
       *     dismisses);
       *   - commit or cancel the launched form.
       * Long-press → dismiss arrives in chunk 2b alongside the
       * gesture rewrite; until then "tap draft → Cancel" is the
       * canonical path.
       */}
      {chooserOpen ? (
        <Pressable
          accessibilityLabel="Close chooser"
          accessibilityRole="button"
          onPress={handleBackdropPress}
          style={styles.backdrop}
          testID="floating-draft-card-backdrop"
        />
      ) : null}
      {chooserOpen ? (
        <DraftChooserPopover
          draft={draft}
          onChoose={handleChoose}
          onDismiss={dismissDraft}
        />
      ) : null}
      {/*
        P2-FE-8 — embedded avatar selector.
        Mounted whenever the draft is null-tech AND a tech list is
        provided. Sits above the chooser popover (chooser z-index is
        higher because both are absolute-positioned children of this
        host); when the user picks a tech via the selector, the
        draft's `technicianId` is set, the canvas now renders a
        dashed block on that tech's column, and a subsequent tap on
        the dashed block opens the chooser as usual.
      */}
      {showAvatarSelector ? (
        <EmbeddedAvatarSelector
          techs={techs ?? []}
          selectedTechId={draft.technicianId}
          onPickTech={handlePickTech}
        />
      ) : null}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  popoverHost: {
    position: "absolute",
    top: 80,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  popover: {
    minWidth: 240,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 8,
  },
  popoverTail: {
    width: 14,
    height: 14,
    backgroundColor: "#FFFFFF",
    transform: [{ rotate: "45deg" }],
    marginTop: -7,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  popoverTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    textAlign: "center",
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  popoverContext: {
    fontSize: 11,
    color: "#9CA3AF",
    textAlign: "center",
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  popoverRow: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  popoverRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  popoverRowText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1F2937",
  },
  popoverRowTextCancel: {
    color: "#DC2626",
    fontWeight: "600",
  },
});
