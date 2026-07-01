/**
 * `AiSuggestionCard` — list-item preview of one AI-emitted
 * reorganization session (P7-FE-1, master plan §5.2.5).
 *
 * The "AI" tab on the Pending Reality review screen renders one of
 * these per `source: "ai_suggestion"` session awaiting FO review.
 * Each card shows:
 *   - A purple "AI" badge (`SourceBadgeColors.ai_suggestion`).
 *   - The session's notes (used as the rationale surface — the BE's
 *     `aiSuggestionEngine` writes its rationale here today; once the
 *     dedicated `ai_calendar_suggestions.rationale` column is exposed
 *     via the BE list endpoint we'll switch to it).
 *   - A condensed list of the proposed intents (one line each).
 *   - Three FO actions: Approve, Counter-propose, Decline.
 *
 * Counter-propose is intentionally a placeholder for v1 — the
 * underlying mutation is wired (see `useCounterProposeReorganizationSession`)
 * but the FE editor for picking a replacement payload lands in a
 * follow-up. The button shows an "Edit on calendar" hint that
 * routes the FO to the canvas where they can re-author the move.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";

import { SourceBadgeColors, SourceBadgeLabels } from "@technician/constants/colors";
import type { ReorganizationApiSession } from "@technician/hooks/schedule/use-reorganization";
import type {
  ReorganizationIntent,
  ReorganizationIntentType,
} from "@technician/types/reorganization";

interface AiSuggestionCardProps {
  session: ReorganizationApiSession;
  onApprove: () => void;
  onDecline: () => void;
  onCounterPropose: () => void;
  /** Mutation in flight on this session — disables all CTAs. */
  isBusy?: boolean;
}

const INTENT_TYPE_LABEL: Record<ReorganizationIntentType, string> = {
  cancel: "Cancel",
  reschedule: "Reschedule",
  reassign: "Reassign",
  create: "Create",
  personal_event_create: "Personal event +",
  personal_event_update: "Personal event ✎",
  personal_event_delete: "Personal event −",
};

/** "12:30" → "12:30 PM" for the change-row line. Mirrors the BE
 * rationale humanizer in `aiSuggestionEngine.ts` so the prose and the
 * bullets read in the same voice. */
function formatClockTime(time: string): string {
  const [hRaw, mRaw] = time.split(":");
  const h = Number.parseInt(hRaw, 10);
  const m = Number.parseInt(mRaw, 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

const FE_WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FE_MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-04-27" → "Mon, Apr 27". Uses local Y/M/D — input is date-only. */
function formatFriendlyDate(yyyyMmDd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(yyyyMmDd);
  if (!m) return yyyyMmDd;
  const year = Number.parseInt(m[1], 10);
  const month = Number.parseInt(m[2], 10) - 1;
  const day = Number.parseInt(m[3], 10);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 0 ||
    month > 11
  ) {
    return yyyyMmDd;
  }
  const d = new Date(year, month, day, 12, 0, 0);
  return `${FE_WEEKDAY_SHORT[d.getDay()]}, ${FE_MONTH_SHORT[month]} ${day}`;
}

function describeIntent(intent: ReorganizationIntent): string {
  const subject =
    intent.appointment_id != null
      ? `Appt #${intent.appointment_id}`
      : intent.personal_event_id != null
        ? `PE ${intent.personal_event_id.slice(0, 6)}…`
        : "this appointment";
  switch (intent.payload.kind) {
    case "reschedule": {
      const techSuffix = intent.payload.new_technician_id
        ? ` with tech #${intent.payload.new_technician_id}`
        : "";
      return `Move ${subject} to ${formatFriendlyDate(intent.payload.new_scheduled_date)} at ${formatClockTime(intent.payload.new_start_time)}${techSuffix}`;
    }
    case "reassign":
      return `Reassign ${subject} to tech #${intent.payload.new_technician_id}`;
    case "cancel":
      return `Cancel ${subject} (${intent.payload.cancellation_reason})`;
    case "create":
      return `Add new appt on ${formatFriendlyDate(intent.payload.scheduled_date)} at ${formatClockTime(intent.payload.scheduled_start_time)}`;
    default:
      return `${subject} — ${INTENT_TYPE_LABEL[intent.intent_type]}`;
  }
}

export function AiSuggestionCard({
  session,
  onApprove,
  onDecline,
  onCounterPropose,
  isBusy = false,
}: AiSuggestionCardProps) {
  const intents = session.intents ?? [];
  const submittedAt = new Date(session.created_at);
  const ageMs = Date.now() - submittedAt.getTime();
  const ageHours = Math.floor(ageMs / 1_000 / 60 / 60);
  const ageMinutes = Math.floor(ageMs / 1_000 / 60);
  const ageLabel =
    ageHours >= 1
      ? `${ageHours}h ago`
      : ageMinutes >= 1
        ? `${ageMinutes}m ago`
        : "just now";

  return (
    <View style={styles.card} testID={`ai-suggestion-card-${session.id}`}>
      <View style={styles.header}>
        <View
          style={[
            styles.sourceBadge,
            { backgroundColor: SourceBadgeColors.ai_suggestion },
          ]}
        >
          <Text style={styles.sourceBadgeText} testID={`ai-suggestion-badge-${session.id}`}>
            {SourceBadgeLabels.ai_suggestion}
          </Text>
        </View>
        <Text style={styles.headerTitle}>Suggestion #{session.id}</Text>
        <Text style={styles.headerAge}>{ageLabel}</Text>
      </View>

      {session.notes ? (
        <Text style={styles.rationale}>{session.notes}</Text>
      ) : (
        <Text style={styles.rationaleMissing}>
          No rationale provided by the suggestion engine.
        </Text>
      )}

      <View style={styles.intentsList}>
        {intents.map((intent) => (
          <Text
            key={intent.id}
            style={styles.intentLine}
            testID={`ai-suggestion-intent-${intent.id}`}
          >
            • {describeIntent(intent)}
          </Text>
        ))}
        {intents.length === 0 ? (
          <Text style={styles.intentLineMissing}>
            (No intents on this session.)
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={onDecline}
          disabled={isBusy}
          style={({ pressed }) => [
            styles.actionBtn,
            styles.actionBtnDanger,
            isBusy && styles.actionBtnDisabled,
            pressed && styles.actionBtnPressed,
          ]}
          accessibilityRole="button"
          testID={`ai-suggestion-decline-${session.id}`}
        >
          <Text style={[styles.actionBtnText, styles.actionBtnTextDanger]}>
            Decline
          </Text>
        </Pressable>
        <Pressable
          onPress={onCounterPropose}
          disabled={isBusy}
          style={({ pressed }) => [
            styles.actionBtn,
            styles.actionBtnSecondary,
            isBusy && styles.actionBtnDisabled,
            pressed && styles.actionBtnPressed,
          ]}
          accessibilityRole="button"
          testID={`ai-suggestion-counter-${session.id}`}
        >
          <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>
            Counter
          </Text>
        </Pressable>
        <Pressable
          onPress={onApprove}
          disabled={isBusy}
          style={({ pressed }) => [
            styles.actionBtn,
            styles.actionBtnPrimary,
            isBusy && styles.actionBtnDisabled,
            pressed && styles.actionBtnPressed,
          ]}
          accessibilityRole="button"
          testID={`ai-suggestion-approve-${session.id}`}
        >
          <Text style={styles.actionBtnText}>Approve</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sourceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 40,
    alignItems: "center",
  },
  sourceBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
  },
  headerAge: {
    fontSize: 12,
    color: "#6B7280",
  },
  rationale: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 19,
    fontStyle: "italic",
  },
  rationaleMissing: {
    fontSize: 13,
    color: "#9CA3AF",
    fontStyle: "italic",
  },
  intentsList: {
    gap: 4,
    paddingLeft: 4,
  },
  intentLine: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 18,
  },
  intentLineMissing: {
    fontSize: 13,
    color: "#9CA3AF",
    fontStyle: "italic",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    minHeight: 44,
  },
  actionBtnPrimary: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  actionBtnSecondary: {
    backgroundColor: "#F9FAFB",
    borderColor: "#D1D5DB",
  },
  actionBtnDanger: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnPressed: {
    opacity: 0.85,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  actionBtnTextSecondary: {
    color: "#374151",
  },
  actionBtnTextDanger: {
    color: "#B91C1C",
  },
});
