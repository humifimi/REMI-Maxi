import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import {
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
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useNetInfo } from "@react-native-community/netinfo";
import {
  BugReportCategory,
  LocalBugReportStatus,
  type BugReportEntryPoint as EntryPointType,
  type LocalAttachment,
  type LocalBugReport,
} from "@technician/types/bug-report";
import { BUG_REPORT_CONFIG } from "@technician/constants/bug-report";
import { bugReportService, generateReportId } from "@technician/services/bug-report.service";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { BugReportAttachments } from "./bug-report-attachments";
import { BugReportVoice } from "./bug-report-voice";
import { BugReportAnnotation } from "./bug-report-annotation";

const CATEGORIES = [
  { value: BugReportCategory.CRASH, label: "Crash", icon: "error" as const },
  { value: BugReportCategory.UI, label: "UI Bug", icon: "palette" as const },
  { value: BugReportCategory.UX, label: "UX Issue", icon: "touch-app" as const },
  { value: BugReportCategory.PERFORMANCE, label: "Slow", icon: "speed" as const },
  { value: BugReportCategory.MISC, label: "Other", icon: "more-horiz" as const },
];

const formSchema = z.object({
  text_description: z
    .string()
    .max(BUG_REPORT_CONFIG.MAX_TEXT_DESCRIPTION)
    .optional(),
  category: z.enum(["crash", "ui", "ux", "performance", "misc"]).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface BugReportComposerProps {
  visible: boolean;
  onDismiss: () => void;
  onQueueSend?: () => void;
  onContentChange?: (hasContent: boolean) => void;
  entryPoint: EntryPointType;
  preAttachedScreenshot?: string | null;
  frustrationContext?: {
    screenName: string;
    message: string;
  } | null;
}

export interface BugReportComposerHandle {
  resetForm: () => Promise<void>;
}

export const BugReportComposer = forwardRef<BugReportComposerHandle, BugReportComposerProps>(function BugReportComposer({
  visible,
  onDismiss,
  onQueueSend,
  onContentChange,
  entryPoint,
  preAttachedScreenshot,
  frustrationContext,
}, ref) {
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [voiceUri, setVoiceUri] = useState<string | null>(null);
  const [voiceDurationMs, setVoiceDurationMs] = useState(0);
  const [annotating, setAnnotating] = useState<LocalAttachment | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  const netInfo = useNetInfo();

  useEffect(() => {
    setIsOffline(netInfo.isConnected === false);
  }, [netInfo.isConnected]);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    getValues,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      text_description: "",
      category: undefined,
    },
  });

  useImperativeHandle(ref, () => ({
    async resetForm() {
      reset();
      setAttachments([]);
      setVoiceUri(null);
      setVoiceDurationMs(0);
      await bugReportService.deleteDraft();
    },
  }), [reset]);

  const watchedDescription = watch("text_description");
  const watchedCategory = watch("category");

  useEffect(() => {
    const hasContent =
      !!watchedDescription || !!watchedCategory || attachments.length > 0 || !!voiceUri;
    onContentChange?.(hasContent);
  }, [watchedDescription, watchedCategory, attachments.length, voiceUri, onContentChange]);

  useEffect(() => {
    if (!visible) return;

    (async () => {
      const draft = await bugReportService.loadDraft();
      let restoredAttachments: LocalAttachment[] = [];

      if (draft) {
        setValue("text_description", draft.text_description ?? "");
        setValue("category", draft.category);
        restoredAttachments = draft.attachments ?? [];
        setVoiceUri(draft.voice_memo_uri ?? null);
        setVoiceDurationMs(draft.voice_memo_duration_ms ?? 0);
      }

      if (preAttachedScreenshot) {
        const userAdded = restoredAttachments.filter(
          (a) => !(a.type === "screenshot_plain" && a.id.startsWith("screenshot-"))
        );
        setAttachments([
          ...userAdded,
          {
            id: `screenshot-${Date.now()}`,
            type: "screenshot_plain",
            uri: preAttachedScreenshot,
            mime_type: "image/png",
          },
        ]);
      } else if (restoredAttachments.length > 0) {
        setAttachments(restoredAttachments);
      }
    })();
  }, [visible, preAttachedScreenshot, setValue]);

  const onSubmit = useCallback(
    async (data: FormValues) => {
      haptic.success();

      const id = await generateReportId();
      await bugReportService.saveDraft({
        id,
        status: LocalBugReportStatus.DRAFT,
        entry_point: entryPoint,
        category: data.category as LocalBugReport["category"],
        screen_name: "Unknown",
        text_description: data.text_description,
        voice_memo_uri: voiceUri ?? undefined,
        voice_memo_duration_ms: voiceDurationMs || undefined,
        attachments,
        frustration_signals: [],
        navigation_breadcrumbs: [],
        recent_logs: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      onQueueSend?.();
    },
    [entryPoint, voiceUri, voiceDurationMs, attachments, onQueueSend]
  );

  const handleClose = useCallback(async () => {
    haptic.light();

    const { text_description, category } = getValues();
    const hasContent =
      text_description || category || attachments.length > 0 || voiceUri;

    if (hasContent) {
      const id = await generateReportId();
      await bugReportService.saveDraft({
        id,
        status: LocalBugReportStatus.DRAFT,
        entry_point: entryPoint,
        category: category as LocalBugReport["category"],
        screen_name: "Unknown",
        text_description,
        voice_memo_uri: voiceUri ?? undefined,
        voice_memo_duration_ms: voiceDurationMs || undefined,
        attachments,
        frustration_signals: [],
        navigation_breadcrumbs: [],
        recent_logs: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } else {
      await bugReportService.deleteDraft();
    }

    onDismiss();
  }, [onDismiss, entryPoint, attachments, voiceUri, voiceDurationMs, getValues]);

  const handleAnnotate = useCallback((attachment: LocalAttachment) => {
    setAnnotating(attachment);
  }, []);

  const handleAnnotationDone = useCallback(
    (result: { plainUri: string; annotatedUri: string }) => {
      if (annotating) {
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === annotating.id
              ? { ...a, uri: result.annotatedUri, type: "screenshot_annotated" as const }
              : a
          )
        );
      }
      setAnnotating(null);
    },
    [annotating]
  );

  if (annotating) {
    return (
      <BugReportAnnotation
        screenshotUri={annotating.uri}
        onDone={handleAnnotationDone}
        onCancel={() => setAnnotating(null)}
      />
    );
  }

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleClose}
      >
        <KeyboardAvoidingView
          style={styles.root}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.header}>
            <Pressable onPress={handleClose} style={styles.headerBtn}>
              <MaterialIcons name="close" size={24} color="#374151" />
            </Pressable>
            <Text style={styles.headerTitle}>Report an Issue</Text>
            <Pressable
              onPress={handleSubmit(onSubmit)}
              style={styles.submitBtn}
            >
              <Text style={styles.submitText}>Send</Text>
            </Pressable>
          </View>

          {isOffline && (
            <View style={styles.offlineBanner}>
              <MaterialIcons name="cloud-off" size={18} color="#F59E0B" />
              <Text style={styles.offlineText}>
                Report saved. It'll be sent when you're back online.
              </Text>
            </View>
          )}

          {frustrationContext && (
            <View style={styles.frustrationBanner}>
              <Text style={styles.frustrationText}>
                {frustrationContext.message}
              </Text>
            </View>
          )}

          <ScrollView
            style={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <BugReportAttachments
              attachments={attachments}
              onChange={setAttachments}
              onAnnotate={handleAnnotate}
            />

            <Controller
              control={control}
              name="text_description"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  style={styles.descriptionInput}
                  placeholder="Describe the issue..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  textAlignVertical="top"
                  maxLength={BUG_REPORT_CONFIG.MAX_TEXT_DESCRIPTION}
                  value={value}
                  onChangeText={onChange}
                />
              )}
            />

            <BugReportVoice
              onRecordingComplete={(uri, durationMs) => {
                setVoiceUri(uri);
                setVoiceDurationMs(durationMs);
              }}
              onDelete={() => {
                setVoiceUri(null);
                setVoiceDurationMs(0);
              }}
              existingUri={voiceUri}
              existingDurationMs={voiceDurationMs}
            />

            <Text style={styles.sectionLabel}>Category</Text>
            <Controller
              control={control}
              name="category"
              render={({ field: { onChange, value } }) => (
                <View style={styles.chipRow}>
                  {CATEGORIES.map((cat) => {
                    const selected = value === cat.value;
                    return (
                      <Pressable
                        key={cat.value}
                        onPress={() => {
                          haptic.selection();
                          onChange(selected ? undefined : cat.value);
                        }}
                        style={[styles.chip, selected && styles.chipSelected]}
                      >
                        <MaterialIcons
                          name={cat.icon}
                          size={16}
                          color={selected ? "#fff" : "#6B7280"}
                        />
                        <Text
                          style={[
                            styles.chipText,
                            selected && styles.chipTextSelected,
                          ]}
                        >
                          {cat.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

    </>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  headerBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  submitBtn: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  submitText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#FFFBEB",
    borderBottomWidth: 1,
    borderBottomColor: "#FDE68A",
  },
  offlineText: {
    flex: 1,
    fontSize: 13,
    color: "#92400E",
  },
  frustrationBanner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#FEF3C7",
    borderBottomWidth: 1,
    borderBottomColor: "#FDE68A",
  },
  frustrationText: {
    fontSize: 14,
    color: "#92400E",
    fontStyle: "italic",
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
  },
  descriptionInput: {
    minHeight: 100,
    fontSize: 15,
    color: "#111827",
    paddingVertical: 12,
    lineHeight: 22,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 16,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 24,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
  },
  chipSelected: {
    backgroundColor: "#3B82F6",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  chipTextSelected: {
    color: "#fff",
  },
});
