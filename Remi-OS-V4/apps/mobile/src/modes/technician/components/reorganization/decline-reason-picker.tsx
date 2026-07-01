/**
 * `DeclineReasonPicker` — modal sheet that captures a structured
 * `(decline_reason_kind, decline_reason_text)` tuple before firing
 * `useDenyReorganizationSession`.
 *
 * Master plan §5.4.5 (CU-G8) defines the canonical picker for the
 * customer app's customer-side decline. P7-FE-1 reuses the SAME
 * five `decline_reason_kind` enum values for the FO-side decline of
 * AI sessions (§5.2.5 says "decline reason picker reuses §5.4.5
 * picker"). The wording for the labels is FO-facing here ("Doesn't
 * fit the schedule" instead of "Inconvenient time") because the
 * audience differs even though the wire enum doesn't.
 *
 * The picker uses React Hook Form + Zod per the architecture rule.
 * Validation:
 *   - At least one `decline_reason_kind` must be selected.
 *   - `decline_reason_text` is required ONLY when `kind === "other"`,
 *     max 500 chars per §5.4.5.
 *
 * Submit calls `onSubmit({ kind, text })`. The parent screen owns
 * the actual mutation call (so it can decide what to do with the
 * post-deny session — invalidate the AI tab, dismiss, navigate,
 * etc. — without coupling the picker to a specific destination).
 */

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { z } from "zod";

import type { DeclineReasonKind } from "@technician/hooks/franchise/use-franchise-reorganizations";

const DECLINE_REASON_OPTIONS: Array<{
  value: DeclineReasonKind;
  label: string;
  description: string;
}> = [
  {
    value: "inconvenient_time",
    label: "Doesn't fit the schedule",
    description: "The proposed time conflicts with planned coverage.",
  },
  {
    value: "wrong_technician",
    label: "Wrong technician",
    description: "The reassign sends this job to the wrong person.",
  },
  {
    value: "vehicle_unavailable",
    label: "Vehicle not available",
    description: "Tech vehicle, fleet, or shuttle isn't free that window.",
  },
  {
    value: "conflicting_commitment",
    label: "Conflicting commitment",
    description: "Personal event, training, or another job blocks this slot.",
  },
  {
    value: "other",
    label: "Other (explain)",
    description: "Add a note so the AI learns from this decline.",
  },
];

const declineReasonSchema = z
  .object({
    kind: z.enum([
      "inconvenient_time",
      "wrong_technician",
      "vehicle_unavailable",
      "conflicting_commitment",
      "other",
    ]),
    text: z.string().max(500, "Keep it under 500 characters.").optional(),
  })
  .refine(
    (val) => {
      if (val.kind === "other") {
        return val.text != null && val.text.trim().length > 0;
      }
      return true;
    },
    {
      message: "Add a short note explaining the decline.",
      path: ["text"],
    },
  );

type DeclineReasonFormValues = z.infer<typeof declineReasonSchema>;

interface DeclineReasonPickerProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    kind: DeclineReasonKind;
    text?: string;
  }) => void;
  /** Optional title — defaults to "Decline this suggestion?" */
  title?: string;
  /** Disable the submit button while a parent mutation is in flight. */
  isSubmitting?: boolean;
}

export function DeclineReasonPicker({
  visible,
  onClose,
  onSubmit,
  title = "Decline this suggestion?",
  isSubmitting = false,
}: DeclineReasonPickerProps) {
  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
    watch,
    reset,
  } = useForm<DeclineReasonFormValues>({
    resolver: zodResolver(declineReasonSchema),
    mode: "onChange",
    defaultValues: { kind: "inconvenient_time", text: "" },
  });

  useEffect(() => {
    if (!visible) {
      reset({ kind: "inconvenient_time", text: "" });
    }
  }, [visible, reset]);

  const selectedKind = watch("kind");
  const showFreeText = selectedKind === "other";

  const handleSubmitForm = handleSubmit((values) => {
    onSubmit({
      kind: values.kind,
      text:
        values.text && values.text.trim().length > 0
          ? values.text.trim()
          : undefined,
    });
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop} testID="decline-reason-picker-backdrop">
        <View style={styles.sheet} testID="decline-reason-picker">
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>
            Pick the reason that best matches. Structured reasons feed back
            into the AI training signal.
          </Text>

          <ScrollView
            style={styles.optionList}
            contentContainerStyle={styles.optionListContent}
          >
            <Controller
              control={control}
              name="kind"
              render={({ field: { value, onChange } }) => (
                <>
                  {DECLINE_REASON_OPTIONS.map((option) => {
                    const selected = value === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => onChange(option.value)}
                        style={({ pressed }) => [
                          styles.option,
                          selected && styles.optionSelected,
                          pressed && styles.optionPressed,
                        ]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        testID={`decline-reason-option-${option.value}`}
                      >
                        <View
                          style={[
                            styles.radio,
                            selected && styles.radioSelected,
                          ]}
                        >
                          {selected ? <View style={styles.radioDot} /> : null}
                        </View>
                        <View style={styles.optionTextWrap}>
                          <Text style={styles.optionLabel}>
                            {option.label}
                          </Text>
                          <Text style={styles.optionDescription}>
                            {option.description}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </>
              )}
            />

            {showFreeText && (
              <Controller
                control={control}
                name="text"
                render={({ field: { value, onChange, onBlur } }) => (
                  <View style={styles.textFieldWrap}>
                    <Text style={styles.textFieldLabel}>
                      What happened?
                    </Text>
                    <TextInput
                      value={value ?? ""}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      multiline
                      maxLength={500}
                      placeholder="A short note helps the AI improve…"
                      placeholderTextColor="#9CA3AF"
                      style={styles.textField}
                      testID="decline-reason-text"
                    />
                    {errors.text?.message ? (
                      <Text style={styles.errorText} testID="decline-reason-text-error">
                        {errors.text.message}
                      </Text>
                    ) : null}
                  </View>
                )}
              />
            )}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.actionBtnSecondary,
                pressed && styles.actionBtnPressed,
              ]}
              accessibilityRole="button"
              testID="decline-reason-cancel"
            >
              <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSubmitForm}
              disabled={!isValid || isSubmitting}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.actionBtnPrimary,
                (!isValid || isSubmitting) && styles.actionBtnDisabled,
                pressed && styles.actionBtnPressed,
              ]}
              accessibilityRole="button"
              testID="decline-reason-submit"
            >
              <Text style={styles.actionBtnText}>
                {isSubmitting ? "Declining…" : "Decline"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 28,
    maxHeight: "85%",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
    marginBottom: 14,
  },
  optionList: {
    flexGrow: 0,
  },
  optionListContent: {
    gap: 10,
    paddingBottom: 10,
  },
  option: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
    alignItems: "flex-start",
    minHeight: 44,
  },
  optionSelected: {
    borderColor: "#111827",
    backgroundColor: "#FFFFFF",
  },
  optionPressed: {
    opacity: 0.85,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#9CA3AF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  radioSelected: {
    borderColor: "#111827",
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#111827",
  },
  optionTextWrap: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  optionDescription: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 17,
  },
  textFieldWrap: {
    marginTop: 8,
    gap: 6,
  },
  textFieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  textField: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
    textAlignVertical: "top",
  },
  errorText: {
    fontSize: 12,
    color: "#B91C1C",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
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
    backgroundColor: "#FFFFFF",
    borderColor: "#D1D5DB",
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnPressed: {
    opacity: 0.85,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  actionBtnTextSecondary: {
    color: "#374151",
  },
});
