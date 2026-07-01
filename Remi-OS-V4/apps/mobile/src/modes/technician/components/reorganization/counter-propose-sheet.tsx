/**
 * `<CounterProposeSheet />` — minimal inline counter-propose composer
 * for the AI tab on `/pending-reality/review`.
 *
 * PR 4 (2026-04-24, item E): replaces the placeholder
 * `Alert.alert("Counter-propose", "Open the calendar to re-author…")`
 * shipped in P7-FE-1 with a real inline editor. Lets a franchise
 * owner edit the AI session's `reschedule` and `reassign` intents
 * (the two payload shapes the AI engine emits today) and submit the
 * batch as a counter-proposal. Other intent types render read-only
 * with a "decline this AI suggestion to remove it" caption.
 *
 * Why a flat modal instead of `@gorhom/bottom-sheet`:
 *   - The sheet has no programmatic snap points or velocity-driven
 *     dismissal — it's a focused single-purpose form, so a bottom
 *     sheet's gesture chrome would be overhead with no UX gain.
 *   - The existing `DeclineReasonPicker` on the same screen uses the
 *     same pattern (RN `<Modal>` + KeyboardAvoidingView), so the two
 *     surfaces feel consistent.
 *
 * Submit pipeline:
 *   1. Iterate over edited intents.
 *   2. For each one, call `counterProposeMutation.mutateAsync`
 *      (sequentially, NOT in parallel — the BE serializes
 *      counter-proposals on the same session and parallel posts
 *      would race). The hook generates a per-call idempotency key
 *      so retries are safe.
 *   3. On every-call success, close the sheet and refresh the AI
 *      session list (handled by the hook's `invalidateQueries`).
 *   4. On any error, surface a single Alert with the failed-intent
 *      count and leave the sheet open so the FO can retry.
 *
 * PLAN-DEVIATION: 2026-04-24-ai-tab-list-only-render —
 * §5.2.5 of the master plan describes counter-propose as a
 * drag-and-drop intent editor on the deep-dive review surface.
 * This sheet ships a focused MVP (form-field edits to reschedule
 * and reassign payloads only) so the FO can act on AI suggestions
 * from the technician app today. See
 * `docs/PLAN-DEVIATIONS.md#2026-04-24-ai-tab-list-only-render`
 * (the "Update 2026-04-24" callout at the top of that entry).
 */

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { ReorganizationApiSession } from "@technician/hooks/schedule/use-reorganization";
import { useCounterProposeReorganizationSession } from "@technician/hooks/franchise/use-franchise-reorganizations";
import type {
  ReassignPayload,
  ReorganizationIntent,
  ReorganizationIntentPayload,
  ReschedulePayload,
} from "@technician/types/reorganization";

interface CounterProposeSheetProps {
  visible: boolean;
  session: ReorganizationApiSession | null;
  onClose: () => void;
  onSuccess?: () => void;
}

type EditableIntent =
  | {
      intentId: number;
      kind: "reschedule";
      original: ReschedulePayload;
      draft: ReschedulePayload;
    }
  | {
      intentId: number;
      kind: "reassign";
      original: ReassignPayload;
      draft: ReassignPayload;
    };

function isEditable(
  intent: ReorganizationIntent,
): intent is ReorganizationIntent & {
  payload: ReschedulePayload | ReassignPayload;
} {
  return (
    intent.payload.kind === "reschedule" ||
    intent.payload.kind === "reassign"
  );
}

function buildEditableIntents(
  intents: ReorganizationIntent[],
): EditableIntent[] {
  const out: EditableIntent[] = [];
  for (const intent of intents) {
    if (!isEditable(intent)) continue;
    if (intent.payload.kind === "reschedule") {
      out.push({
        intentId: intent.id,
        kind: "reschedule",
        original: intent.payload,
        draft: { ...intent.payload },
      });
    } else {
      out.push({
        intentId: intent.id,
        kind: "reassign",
        original: intent.payload,
        draft: { ...intent.payload },
      });
    }
  }
  return out;
}

function payloadChanged(item: EditableIntent): boolean {
  if (item.kind === "reschedule") {
    return (
      item.original.new_scheduled_date !== item.draft.new_scheduled_date ||
      item.original.new_start_time !== item.draft.new_start_time ||
      item.original.new_end_time !== item.draft.new_end_time ||
      item.original.new_technician_id !== item.draft.new_technician_id
    );
  }
  return (
    item.original.new_technician_id !== item.draft.new_technician_id ||
    item.original.dispatcher_reason !== item.draft.dispatcher_reason
  );
}

function payloadFor(item: EditableIntent): ReorganizationIntentPayload {
  return item.draft;
}

export function CounterProposeSheet({
  visible,
  session,
  onClose,
  onSuccess,
}: CounterProposeSheetProps) {
  const counterPropose = useCounterProposeReorganizationSession();
  const [editable, setEditable] = useState<EditableIntent[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible || !session) return;
    setEditable(buildEditableIntents(session.intents ?? []));
  }, [visible, session]);

  const readonlyIntents = useMemo(() => {
    if (!session) return [];
    return (session.intents ?? []).filter((i) => !isEditable(i));
  }, [session]);

  const dirtyCount = useMemo(
    () => editable.filter(payloadChanged).length,
    [editable],
  );

  const updateReschedule = (
    intentId: number,
    patch: Partial<ReschedulePayload>,
  ) => {
    setEditable((prev) =>
      prev.map((item) =>
        item.intentId === intentId && item.kind === "reschedule"
          ? { ...item, draft: { ...item.draft, ...patch } }
          : item,
      ),
    );
  };

  const updateReassign = (
    intentId: number,
    patch: Partial<ReassignPayload>,
  ) => {
    setEditable((prev) =>
      prev.map((item) =>
        item.intentId === intentId && item.kind === "reassign"
          ? { ...item, draft: { ...item.draft, ...patch } }
          : item,
      ),
    );
  };

  const handleSubmit = async () => {
    if (!session || dirtyCount === 0) {
      onClose();
      return;
    }
    if (__DEV__) {
      console.log("[DEBUG:CounterPropose] submit", {
        sessionId: session.id,
        dirtyCount,
      });
    }
    setSubmitting(true);
    let failed = 0;
    for (const item of editable) {
      if (!payloadChanged(item)) continue;
      try {
        await counterPropose.mutateAsync({
          sessionId: session.id,
          intentId: item.intentId,
          intent: payloadFor(item),
        });
      } catch (err) {
        failed += 1;
        if (__DEV__) {
          console.log("[DEBUG:CounterPropose] mutateAsync error", {
            sessionId: session.id,
            intentId: item.intentId,
            message: (err as Error).message,
          });
        }
      }
    }
    setSubmitting(false);
    if (failed > 0) {
      Alert.alert(
        "Counter-proposal partially failed",
        `${failed} of ${dirtyCount} edits couldn't reach the server. The sheet stays open so you can retry — successful edits are already saved.`,
      );
      return;
    }
    onSuccess?.();
    onClose();
  };

  if (!session) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={submitting ? undefined : onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <View style={styles.sheet} testID="counter-propose-sheet">
          <View style={styles.header}>
            <Text style={styles.title}>Counter-propose AI suggestion</Text>
            <Text style={styles.subtitle}>
              Edit the AI's proposed times or technicians, then submit. Other
              intent types are read-only — decline the suggestion to remove
              them.
            </Text>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {editable.map((item) => (
              <View
                key={item.intentId}
                style={styles.intentBlock}
                testID={`counter-propose-intent-${item.intentId}`}
              >
                <Text style={styles.intentKind}>
                  {item.kind === "reschedule" ? "Reschedule" : "Reassign"}
                </Text>
                {item.kind === "reschedule" ? (
                  <>
                    <LabeledField label="Date (YYYY-MM-DD)">
                      <TextInput
                        style={styles.input}
                        value={item.draft.new_scheduled_date}
                        onChangeText={(v) =>
                          updateReschedule(item.intentId, {
                            new_scheduled_date: v,
                          })
                        }
                        placeholder="2026-04-25"
                        autoCapitalize="none"
                        autoCorrect={false}
                        testID={`counter-propose-date-${item.intentId}`}
                      />
                    </LabeledField>
                    <View style={styles.row}>
                      <LabeledField label="Start (HH:MM)" style={styles.flex1}>
                        <TextInput
                          style={styles.input}
                          value={item.draft.new_start_time}
                          onChangeText={(v) =>
                            updateReschedule(item.intentId, {
                              new_start_time: v,
                            })
                          }
                          placeholder="09:00"
                          autoCapitalize="none"
                          autoCorrect={false}
                          testID={`counter-propose-start-${item.intentId}`}
                        />
                      </LabeledField>
                      <LabeledField label="End (HH:MM)" style={styles.flex1}>
                        <TextInput
                          style={styles.input}
                          value={item.draft.new_end_time}
                          onChangeText={(v) =>
                            updateReschedule(item.intentId, {
                              new_end_time: v,
                            })
                          }
                          placeholder="10:00"
                          autoCapitalize="none"
                          autoCorrect={false}
                          testID={`counter-propose-end-${item.intentId}`}
                        />
                      </LabeledField>
                    </View>
                    <LabeledField label="Technician id (optional)">
                      <TextInput
                        style={styles.input}
                        value={
                          item.draft.new_technician_id !== undefined
                            ? String(item.draft.new_technician_id)
                            : ""
                        }
                        onChangeText={(v) => {
                          const parsed = v.trim() === "" ? undefined : Number(v);
                          updateReschedule(item.intentId, {
                            new_technician_id: Number.isFinite(parsed)
                              ? (parsed as number)
                              : undefined,
                          });
                        }}
                        placeholder="leave blank to keep current"
                        keyboardType="number-pad"
                        testID={`counter-propose-tech-${item.intentId}`}
                      />
                    </LabeledField>
                  </>
                ) : (
                  <>
                    <LabeledField label="New technician id">
                      <TextInput
                        style={styles.input}
                        value={String(item.draft.new_technician_id)}
                        onChangeText={(v) => {
                          const parsed = Number(v);
                          if (!Number.isFinite(parsed)) return;
                          updateReassign(item.intentId, {
                            new_technician_id: parsed,
                          });
                        }}
                        keyboardType="number-pad"
                        testID={`counter-propose-tech-${item.intentId}`}
                      />
                    </LabeledField>
                    <LabeledField label="Dispatcher reason (optional)">
                      <TextInput
                        style={styles.input}
                        value={item.draft.dispatcher_reason ?? ""}
                        onChangeText={(v) =>
                          updateReassign(item.intentId, {
                            dispatcher_reason: v || undefined,
                          })
                        }
                        placeholder="e.g. Tech 5 has overlapping window"
                        testID={`counter-propose-reason-${item.intentId}`}
                      />
                    </LabeledField>
                  </>
                )}
              </View>
            ))}

            {readonlyIntents.length > 0 ? (
              <View style={styles.readonlyBlock}>
                <Text style={styles.readonlyHeading}>
                  Cannot edit inline ({readonlyIntents.length})
                </Text>
                {readonlyIntents.map((intent) => (
                  <Text key={intent.id} style={styles.readonlyLine}>
                    • {intent.intent_type} (intent #{intent.id})
                  </Text>
                ))}
                <Text style={styles.readonlyHint}>
                  Decline this AI suggestion to remove these intents.
                </Text>
              </View>
            ) : null}

            {editable.length === 0 && readonlyIntents.length === 0 ? (
              <Text style={styles.emptyText}>
                This AI session has no editable intents.
              </Text>
            ) : null}
          </ScrollView>

          <View style={styles.actionBar}>
            <Pressable
              onPress={onClose}
              disabled={submitting}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.actionBtnSecondary,
                pressed && !submitting && styles.actionBtnPressed,
                submitting && styles.actionBtnDisabled,
              ]}
              accessibilityRole="button"
              testID="counter-propose-cancel-btn"
            >
              <Text
                style={[
                  styles.actionBtnText,
                  styles.actionBtnTextSecondary,
                ]}
              >
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={submitting || dirtyCount === 0}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.actionBtnPrimary,
                pressed &&
                  !submitting &&
                  dirtyCount > 0 &&
                  styles.actionBtnPressed,
                (submitting || dirtyCount === 0) && styles.actionBtnDisabled,
              ]}
              accessibilityRole="button"
              testID="counter-propose-submit-btn"
            >
              <Text style={styles.actionBtnText}>
                {submitting
                  ? "Submitting…"
                  : dirtyCount === 0
                    ? "No edits"
                    : `Submit (${dirtyCount})`}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface LabeledFieldProps {
  label: string;
  style?: object;
  children: React.ReactNode;
}

function LabeledField({ label, style, children }: LabeledFieldProps) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: "90%",
    paddingBottom: 8,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    padding: 16,
    gap: 14,
  },
  intentBlock: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    gap: 10,
  },
  intentKind: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#374151",
  },
  field: {
    gap: 4,
  },
  flex1: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  fieldLabel: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: "#111827",
  },
  readonlyBlock: {
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FCD34D",
    padding: 12,
    gap: 4,
  },
  readonlyHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: "#92400E",
  },
  readonlyLine: {
    fontSize: 13,
    color: "#78350F",
  },
  readonlyHint: {
    marginTop: 4,
    fontSize: 12,
    color: "#92400E",
    fontStyle: "italic",
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    paddingVertical: 16,
  },
  actionBar: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  actionBtnPrimary: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  actionBtnSecondary: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D1D5DB",
  },
  actionBtnPressed: {
    opacity: 0.85,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  actionBtnTextSecondary: {
    color: "#374151",
  },
});
