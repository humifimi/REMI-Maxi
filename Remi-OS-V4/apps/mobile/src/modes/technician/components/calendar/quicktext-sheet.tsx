import { forwardRef, useMemo, useState } from "react";
import { StyleSheet, View, Text } from "react-native";
import { AppSheet, type AppSheetRef } from "@technician/components/sheets";
import { TouchableOpacity } from "react-native-gesture-handler";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSendQuickText } from "@technician/hooks/communication/use-quicktext";
import { useDraftsForAppointment } from "@technician/hooks/ai/use-message-draft";
import { useDraftTriggerStore } from "@technician/stores/draft-trigger";
import { QuickTextTemplate } from "@technician/types/enums";
import type { DraftIntent, MessageDraft } from "@technician/types/messaging";
import { haptic } from "@technician/hooks/utility/use-haptics";

interface QuickTextSheetProps {
  appointmentId: number;
  customerName: string;
  onClose: () => void;
}

// QuickText templates map loosely to AI draft intents — when the AI has
// already drafted a context-aware message for the same intent on this
// appointment, prefer the AI draft over the static template. The user
// still gets the same one-tap entry point; the difference is they review
// a personalized message instead of firing a generic template blind.
const TEMPLATE_TO_INTENT: Partial<Record<QuickTextTemplate, DraftIntent>> = {
  [QuickTextTemplate.AHEAD_OF_SCHEDULE]: "running_late",
  [QuickTextTemplate.JOB_COMPLETE]: "follow_up",
};

const TEMPLATES = [
  { key: QuickTextTemplate.ARRIVAL, icon: "directions-car", label: "Arriving Soon", preview: (name: string) => `Hi ${name}, we're on our way and should arrive shortly!` },
  { key: QuickTextTemplate.ON_SITE, icon: "place", label: "On Site", preview: (name: string) => `Hi ${name}, we've arrived and are ready to begin service.` },
  { key: QuickTextTemplate.AHEAD_OF_SCHEDULE, icon: "schedule", label: "Ahead of Schedule", preview: (name: string) => `Hi ${name}, great news — we're running ahead of schedule today.` },
  { key: QuickTextTemplate.JOB_COMPLETE, icon: "check-circle", label: "Job Complete", preview: (name: string) => `Hi ${name}, your service is complete. Thank you!` },
] as const;

function findActiveDraftForIntent(
  drafts: MessageDraft[] | undefined,
  intent: DraftIntent | undefined,
): MessageDraft | undefined {
  if (!drafts || !intent) return undefined;
  return drafts.find(
    (d) => d.intent === intent && (d.status === "pending" || d.status === "approved"),
  );
}

export const QuickTextSheet = forwardRef<AppSheetRef, QuickTextSheetProps>(
  function QuickTextSheet({ appointmentId, customerName, onClose }, ref) {
    const snapPoints = useMemo(() => ["45%"], []);
    const sendMutation = useSendQuickText();
    const draftsQuery = useDraftsForAppointment(appointmentId);
    const triggerDraft = useDraftTriggerStore((s) => s.triggerDraft);
    const [sentTemplates, setSentTemplates] = useState<Set<string>>(new Set());

    const handleSend = (template: QuickTextTemplate) => {
      haptic.medium();

      // Per the contract doc § 7: if the AI already drafted a message for
      // the same intent, route the user to the draft sheet instead of
      // firing the static template. The draft sheet handles send / edit /
      // discard with full lifecycle semantics.
      const intent = TEMPLATE_TO_INTENT[template];
      const activeDraft = findActiveDraftForIntent(draftsQuery.data, intent);
      if (activeDraft) {
        triggerDraft(activeDraft.id);
        setSentTemplates((prev) => new Set(prev).add(template));
        return;
      }

      sendMutation.mutate(
        { appointmentId, payload: { template: template as never } },
        {
          onSuccess: () => {
            haptic.light();
            setSentTemplates((prev) => new Set(prev).add(template));
          },
        }
      );
    };

    return (
      <AppSheet defaultSide="right" ref={ref} index={-1} defaultSnapPoints={snapPoints} enablePanDownToClose onClose={onClose}>
        <View style={styles.content}>
          <Text style={styles.title}>Send QuickText</Text>
          <Text style={styles.subtitle}>to {customerName}</Text>

          {TEMPLATES.map((t) => {
            const isSent = sentTemplates.has(t.key);
            const intent = TEMPLATE_TO_INTENT[t.key];
            const hasAiDraft = Boolean(findActiveDraftForIntent(draftsQuery.data, intent));
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.templateBtn, isSent && styles.templateSent]}
                onPress={() => !isSent && handleSend(t.key)}
                disabled={isSent || sendMutation.isPending}
              >
                <MaterialIcons name={t.icon as never} size={22} color={isSent ? "#9CA3AF" : "#3B82F6"} />
                <View style={styles.templateContent}>
                  <View style={styles.templateLabelRow}>
                    <Text style={[styles.templateLabel, isSent && styles.templateLabelSent]}>{t.label}</Text>
                    {hasAiDraft && !isSent ? (
                      <View style={styles.aiBadge}>
                        <MaterialIcons name="auto-awesome" size={10} color="#6366F1" />
                        <Text style={styles.aiBadgeText}>AI draft</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.templatePreview} numberOfLines={1}>{t.preview(customerName.split(" ")[0])}</Text>
                </View>
                {isSent ? (
                  <MaterialIcons name="check" size={20} color="#22C55E" />
                ) : hasAiDraft ? (
                  <MaterialIcons name="auto-awesome" size={18} color="#6366F1" />
                ) : (
                  <MaterialIcons name="send" size={18} color="#3B82F6" />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </AppSheet>
    );
  }
);

const styles = StyleSheet.create({
  content: { padding: 20 },
  title: { fontSize: 18, fontWeight: "700", color: "#111827" },
  subtitle: { fontSize: 14, color: "#9CA3AF", marginBottom: 16 },
  templateBtn: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 8, backgroundColor: "#fff" },
  templateSent: { backgroundColor: "#F9FAFB", borderColor: "#D1D5DB" },
  templateContent: { flex: 1 },
  templateLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  templateLabel: { fontSize: 15, fontWeight: "600", color: "#111827" },
  templateLabelSent: { color: "#9CA3AF" },
  templatePreview: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  aiBadgeText: { fontSize: 10, fontWeight: "700", color: "#6366F1" },
});
