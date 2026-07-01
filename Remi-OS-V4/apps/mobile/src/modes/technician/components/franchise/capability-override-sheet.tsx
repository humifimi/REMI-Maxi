/**
 * LDM-WAVE-1 CHUNK-3 — Confirmation sheet for a single capability
 * override change (grant / deny / clear).
 *
 * Renders a change preview ("Grant `dispatch.reassign` to Alice Smith"),
 * an optional reason input (max 500 chars), and Confirm / Cancel
 * buttons. On Confirm, fires the right mutation from
 * `use-permissions-admin.ts` and calls `onClose` once the mutation
 * settles (success path); on error, surfaces the message inline and
 * stays open so the admin can retry.
 *
 * Form state via React Hook Form + Zod per architecture rule #7.
 * Inline modal (not a real bottom sheet for simplicity / portability
 * across the existing FO admin screens); converting to
 * `@gorhom/bottom-sheet` later is a one-prop swap.
 *
 * Spec: docs/implementation-plans/landscape-dispatch-map-wave-1.md
 *       §CHUNK-3 — Per-user capability override admin UI → "Behavior contract — FE"
 */

import { useEffect } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useRemoveCapabilityOverride,
  useSetCapabilityOverride,
} from "@technician/hooks/auth/use-permissions-admin";
import type { Capability } from "@technician/types/capabilities";
import type { PermissionsAdminMode } from "@technician/types/permissions-admin";

export type OverrideAction = "grant" | "deny" | "clear";

export interface CapabilityOverrideSheetProps {
  visible: boolean;
  onClose: () => void;
  targetUserId: number;
  targetUserName: string;
  capability: Capability;
  action: OverrideAction;
  /**
   * LDM-WAVE-1 CHUNK-4 — surface the override should hit. Defaults to
   * `own-franchise` so existing CHUNK-3 callers continue to route
   * through `/api/v1/franchise/admin/...`. The cross-franchise admin
   * (`/admin/permissions/[userId]`) passes `cross-franchise` so the
   * mutation fires against `/api/v1/admin/permissions/...` and the
   * BE-side franchise-membership gate is intentionally bypassed.
   */
  adminMode?: PermissionsAdminMode;
}

const REASON_MAX = 500;

const reasonSchema = z.object({
  reason: z
    .string()
    .max(REASON_MAX, `Reason must be ${REASON_MAX} characters or fewer`),
});

type ReasonForm = z.infer<typeof reasonSchema>;

function actionVerb(action: OverrideAction): string {
  if (action === "grant") return "Grant";
  if (action === "deny") return "Deny";
  return "Clear override on";
}

function preposition(action: OverrideAction): string {
  return action === "clear" ? "for" : "to";
}

export function CapabilityOverrideSheet({
  visible,
  onClose,
  targetUserId,
  targetUserName,
  capability,
  action,
  adminMode = "own-franchise",
}: CapabilityOverrideSheetProps) {
  const setOverride = useSetCapabilityOverride();
  const removeOverride = useRemoveCapabilityOverride();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReasonForm>({
    resolver: zodResolver(reasonSchema),
    mode: "onSubmit",
    defaultValues: { reason: "" },
  });

  useEffect(() => {
    if (visible) {
      reset({ reason: "" });
    }
  }, [visible, reset]);

  const isPending = setOverride.isPending || removeOverride.isPending;
  const submitError =
    (setOverride.error as { message?: string } | null)?.message ??
    (removeOverride.error as { message?: string } | null)?.message ??
    null;

  const onSubmit = handleSubmit(async (values) => {
    const reason = values.reason.trim() ? values.reason.trim() : null;
    try {
      if (action === "clear") {
        await removeOverride.mutateAsync({
          targetUserId,
          capability,
          reason,
          adminMode,
        });
      } else {
        await setOverride.mutateAsync({
          targetUserId,
          capability,
          mode: action,
          reason,
          adminMode,
        });
      }
      onClose();
    } catch {
      // Stay open — the inline error surface shows the message and
      // the admin can retry or cancel.
    }
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={isPending ? undefined : onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityRole="alert">
          <Text style={styles.title}>Confirm capability change</Text>

          <View style={styles.previewBox}>
            <Text style={styles.previewBody}>
              {actionVerb(action)}{" "}
              <Text style={styles.previewCap}>{capability}</Text>{" "}
              {preposition(action)}{" "}
              <Text style={styles.previewName}>{targetUserName}</Text>.
            </Text>
          </View>

          <Text style={styles.label}>Reason (optional)</Text>
          <Controller
            control={control}
            name="reason"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextInput
                style={styles.input}
                value={value ?? ""}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="Why is this change being made?"
                placeholderTextColor="#9CA3AF"
                multiline
                editable={!isPending}
                testID="capability-override-reason-input"
                accessibilityLabel="Reason for capability change"
              />
            )}
          />
          {errors.reason && (
            <Text style={styles.errorText} testID="capability-override-reason-error">
              {errors.reason.message}
            </Text>
          )}

          {submitError && (
            <Text style={styles.submitError} testID="capability-override-submit-error">
              {submitError}
            </Text>
          )}

          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              disabled={isPending}
              style={({ pressed }) => [
                styles.btn,
                styles.btnSecondary,
                pressed && styles.btnPressed,
                isPending && styles.btnDisabled,
              ]}
              accessibilityRole="button"
              testID="capability-override-cancel"
            >
              <Text style={styles.btnSecondaryLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onSubmit}
              disabled={isPending}
              style={({ pressed }) => [
                styles.btn,
                action === "deny" ? styles.btnDanger : styles.btnPrimary,
                pressed && styles.btnPressed,
                isPending && styles.btnDisabled,
              ]}
              accessibilityRole="button"
              testID="capability-override-confirm"
            >
              {isPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.btnPrimaryLabel}>Confirm</Text>
              )}
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
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  previewBox: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    padding: 12,
  },
  previewBody: {
    fontSize: 15,
    color: "#111827",
    lineHeight: 22,
  },
  previewCap: {
    fontFamily: "Courier",
    fontWeight: "600",
    color: "#1F2937",
  },
  previewName: {
    fontWeight: "600",
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: "#4B5563",
    marginTop: 4,
  },
  input: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#111827",
    textAlignVertical: "top",
  },
  errorText: {
    color: "#DC2626",
    fontSize: 13,
  },
  submitError: {
    color: "#DC2626",
    fontSize: 13,
    backgroundColor: "#FEE2E2",
    padding: 8,
    borderRadius: 8,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 12,
  },
  btn: {
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  btnPrimary: {
    backgroundColor: "#2563EB",
  },
  btnDanger: {
    backgroundColor: "#DC2626",
  },
  btnSecondary: {
    backgroundColor: "#F3F4F6",
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnPressed: {
    opacity: 0.85,
  },
  btnPrimaryLabel: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  btnSecondaryLabel: {
    color: "#374151",
    fontSize: 15,
    fontWeight: "500",
  },
});
