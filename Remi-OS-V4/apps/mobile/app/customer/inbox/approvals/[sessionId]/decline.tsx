/**
 * P5-CU-6 — Decline-with-reason picker.
 *
 * Pushed from the Decline CTA on the per-session action sheet
 * (`app/inbox/approvals/[sessionId].tsx`, P5-CU-5). Captures a
 * structured `decline_reason_kind` (radio) plus an optional free-text
 * `decline_reason_text` (max 500 chars) and submits via the same
 * `useRespondToReorganizationSession()` hook the action sheet uses for
 * Approve — see the §6.2 spec body's collapsed `/respond` endpoint.
 *
 * On 200, both this screen and the parent action sheet are dismissed
 * so the customer lands back on the inbox (one fewer pending
 * session). The mutation hook itself invalidates
 * `reorganizationKeys.all` + the per-session detail key so the inbox
 * row + Home-tab badge refresh in lock-step.
 *
 * Customer-app override #4 (chunk-prompt master prelude): NetInfo /
 * queued mutations are NOT in scope. On a non-422 error the user sees
 * an `Alert.alert` and STAYS on this screen so they can retry — we do
 * NOT optimistically resolve.
 *
 * PLAN-DEVIATION: 2026-05-02-customer-respond-endpoint-shape — Submit
 * goes through `useRespondToReorganizationSession()` which POSTs
 * `/customer/reorganizations/:id/respond` with
 * `{ action: 'decline', decline_reason_kind, decline_reason_text? }`,
 * NOT a `POST .../deny` per §8.9 Prompt D.6. The customer family ships
 * one collapsed `/respond` route per §6.2 spec body. Spec body wins
 * per the deviation rule. See
 * `docs/PLAN-DEVIATIONS.md#2026-05-02-customer-respond-endpoint-shape`.
 *
 * PLAN-DEVIATION: 2026-05-02-decline-reason-kind-enum — the radio
 * options below match the master plan §5.4.5 spec body
 * (`inconvenient_time | wrong_technician | vehicle_unavailable |
 * conflicting_commitment | other`), NOT the chunk-prompt body's enum
 * (`prefer_original_tech | no_longer_needed | cost_concern | ...`).
 * Spec body wins per the deviation rule; the §5.4.5 set is what the
 * Phase 7 AI training signal expects to consume. See
 * `docs/PLAN-DEVIATIONS.md#2026-05-02-decline-reason-kind-enum`.
 *
 * PLAN-DEVIATION: 2026-05-02-no-gorhom-bottom-sheet — same
 * `presentation: 'modal'` pattern as the parent action sheet
 * (`@gorhom/bottom-sheet` is not installed). Registered in
 * `app/_layout.tsx` as
 * `<Stack.Screen name="inbox/approvals/[sessionId]/decline" ... />`.
 */

import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Ionicons } from '@expo/vector-icons';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Theme } from '@customer/constants/colors';
import { useRespondToReorganizationSession } from '@customer/hooks/reorganizations/use-session-detail';

/**
 * Canonical decline-reason-kind enum per master plan §5.4.5. The order
 * here is the order the radio rows render in (matches the §5.4.5 table
 * top-to-bottom).
 *
 * The labels on the right are CUSTOMER-FACING copy taken verbatim from
 * the §5.4.5 table — don't paraphrase, the test asserts on the visible
 * string and the AI training signal in Phase 7 keys off the enum value
 * (not the label).
 */
export const DECLINE_REASON_KINDS = [
  { value: 'inconvenient_time', label: 'Inconvenient time' },
  { value: 'wrong_technician', label: 'Wrong technician' },
  { value: 'vehicle_unavailable', label: 'Vehicle not available' },
  { value: 'conflicting_commitment', label: 'Conflicting commitment' },
  { value: 'other', label: 'Other' },
] as const;

export type DeclineReasonKind = (typeof DECLINE_REASON_KINDS)[number]['value'];

const DECLINE_REASON_VALUES = DECLINE_REASON_KINDS.map((k) => k.value) as [
  DeclineReasonKind,
  ...DeclineReasonKind[],
];

const FREE_TEXT_MAX = 500;

/**
 * Zod schema enforcing the §5.4.5 invariants:
 *   - `decline_reason_kind` is required and must be one of the 5 enum
 *     values.
 *   - `decline_reason_text` is optional in general but REQUIRED when
 *     the user picks "Other" — that's the kind that has no semantic
 *     content without the free-text payload.
 *   - `decline_reason_text` cannot exceed 500 chars (matches the BE's
 *     `customerRespondBodySchema.decline_reason_text.max(500)`).
 *
 * Exported so the test can reuse the schema for sanity-checking
 * happy-path payloads without re-deriving it.
 */
export const declineFormSchema = z
  .object({
    decline_reason_kind: z.enum(DECLINE_REASON_VALUES, {
      message: 'Pick one of the reasons above.',
    }),
    decline_reason_text: z
      .string()
      .max(FREE_TEXT_MAX, `Keep it under ${FREE_TEXT_MAX} characters.`),
  })
  .refine(
    (value) =>
      value.decline_reason_kind !== 'other' ||
      value.decline_reason_text.trim().length > 0,
    {
      path: ['decline_reason_text'],
      message: 'Tell us a bit more so the team knows what to change.',
    },
  );

export type DeclineFormValues = z.infer<typeof declineFormSchema>;

export default function DeclineReasonScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const sessionId = useMemo(() => {
    const raw = Array.isArray(params.sessionId)
      ? params.sessionId[0]
      : params.sessionId;
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }, [params.sessionId]);

  const respondMutation = useRespondToReorganizationSession();

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<DeclineFormValues>({
    resolver: zodResolver(declineFormSchema),
    // `decline_reason_kind` defaults to undefined so the validation
    // error fires when the user submits without picking a radio. RHF
    // typing wants a value here, but Zod treats undefined as missing.
    defaultValues: {
      decline_reason_kind: undefined as unknown as DeclineReasonKind,
      decline_reason_text: '',
    },
  });

  const selectedKind = watch('decline_reason_kind');
  const otherSelected = selectedKind === 'other';
  const freeText = watch('decline_reason_text') ?? '';

  const handleClose = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/customer');
    }
  }, [router]);

  const handleSuccessClose = useCallback(() => {
    // Pop both the decline picker AND the parent action sheet so the
    // user lands back on the inbox — both modals are presenting a
    // session that is now resolved (`status === 'cancelled'`).
    // Falls back to the tabs root if the modal stack is shallower than
    // expected (e.g. deep-linked directly into the picker).
    try {
      router.dismiss(2);
    } catch {
      router.replace('/customer');
    }
  }, [router]);

  const onSubmit = useCallback(
    (values: DeclineFormValues) => {
      if (!sessionId) return;
      const trimmedText = values.decline_reason_text.trim();
      respondMutation.mutate(
        {
          sessionId,
          action: 'decline',
          declineReasonKind: values.decline_reason_kind,
          // Wire-shape contract: omit the field entirely when empty so
          // the BE-side optional() branch matches (see
          // `customerRespondBodySchema` in
          // REMIBackend/src/schemas/reorganization.schema.ts:127). The
          // hook itself also drops the field when undefined.
          declineReasonText: trimmedText.length > 0 ? trimmedText : undefined,
        },
        {
          onSuccess: () => {
            handleSuccessClose();
          },
          onError: () => {
            // Customer-app override #4: no offline tolerance. Surface a
            // real failure state and stay on the screen so the user
            // can retry. We don't try to extract a linter rejection
            // here — decline is the customer's "abandon" action and
            // the BE doesn't run the linter on cancel-cascade.
            Alert.alert(
              "Couldn't send your decline",
              "We couldn't reach the server. Check your connection and try again.",
            );
          },
        },
      );
    },
    [handleSuccessClose, respondMutation, sessionId],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Decline change</Text>
        <Pressable
          onPress={handleClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
          testID="decline-close-button"
        >
          <IconSymbol name="xmark" size={22} color={Theme.colors.text} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.intro}>
            Why doesn&apos;t this change work for you? Your reason helps us
            propose better times next time.
          </Text>

          <Controller
            control={control}
            name="decline_reason_kind"
            render={({ field: { onChange, value } }) => (
              <View
                style={styles.radioGroup}
                accessibilityRole="radiogroup"
                testID="decline-reason-radio-group"
              >
                {DECLINE_REASON_KINDS.map((option) => {
                  const isSelected = value === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => onChange(option.value)}
                      style={[
                        styles.radioRow,
                        isSelected && styles.radioRowSelected,
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={option.label}
                      testID={`decline-reason-${option.value}`}
                    >
                      <View
                        style={[
                          styles.radioBullet,
                          isSelected && styles.radioBulletSelected,
                        ]}
                      >
                        {isSelected ? <View style={styles.radioBulletInner} /> : null}
                      </View>
                      <Text style={styles.radioLabel}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          />
          {errors.decline_reason_kind ? (
            <Text style={styles.errorText} testID="decline-reason-kind-error">
              Pick one of the reasons above.
            </Text>
          ) : null}

          <View style={styles.freeTextSection}>
            <View style={styles.freeTextLabelRow}>
              <Text style={styles.freeTextLabel}>
                Anything else?{otherSelected ? ' (required)' : ' (optional)'}
              </Text>
              <Text style={styles.freeTextCounter}>
                {freeText.length}/{FREE_TEXT_MAX}
              </Text>
            </View>
            <Controller
              control={control}
              name="decline_reason_text"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[
                    styles.freeTextInput,
                    errors.decline_reason_text && styles.freeTextInputError,
                  ]}
                  placeholder={
                    otherSelected
                      ? 'Tell us what would work better'
                      : 'Add a note (optional)'
                  }
                  placeholderTextColor={Theme.colors.textTertiary}
                  multiline
                  maxLength={FREE_TEXT_MAX}
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  textAlignVertical="top"
                  accessibilityLabel="Decline reason details"
                  testID="decline-reason-text-input"
                />
              )}
            />
            {errors.decline_reason_text ? (
              <Text style={styles.errorText} testID="decline-reason-text-error">
                {errors.decline_reason_text.message}
              </Text>
            ) : null}
          </View>

          <View style={styles.helperRow}>
            <Ionicons
              name="information-circle-outline"
              size={16}
              color={Theme.colors.textSecondary}
            />
            <Text style={styles.helperText}>
              The franchise team will be notified so they can suggest a
              different time or technician.
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              respondMutation.isPending && styles.primaryBtnDisabled,
            ]}
            onPress={handleSubmit(onSubmit)}
            disabled={respondMutation.isPending}
            activeOpacity={0.85}
            testID="decline-submit-btn"
          >
            {respondMutation.isPending ? (
              <ActivityIndicator size="small" color={Theme.colors.white} />
            ) : (
              <Text style={styles.primaryBtnText}>Send decline</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.sm,
    paddingBottom: Theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.colors.borderLight,
  },
  headerTitle: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  scrollContent: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.md,
    paddingBottom: Theme.spacing.xl,
  },
  intro: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.textSecondary,
    lineHeight: 22,
    marginBottom: Theme.spacing.lg,
  },
  radioGroup: {
    gap: Theme.spacing.sm,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    backgroundColor: Theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.colors.border,
    minHeight: 48,
  },
  radioRowSelected: {
    borderColor: Theme.colors.primary,
    backgroundColor: '#EFF6FF',
  },
  radioBullet: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.colors.white,
  },
  radioBulletSelected: {
    borderColor: Theme.colors.primary,
  },
  radioBulletInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Theme.colors.primary,
  },
  radioLabel: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
    fontWeight: '500',
    flex: 1,
  },
  freeTextSection: {
    marginTop: Theme.spacing.lg,
  },
  freeTextLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.spacing.sm,
  },
  freeTextLabel: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  freeTextCounter: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
  },
  freeTextInput: {
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.md,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.md,
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
    minHeight: 96,
  },
  freeTextInputError: {
    borderColor: Theme.colors.error,
  },
  errorText: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.error,
    marginTop: Theme.spacing.xs,
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: Theme.spacing.lg,
  },
  helperText: {
    flex: 1,
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.md,
    paddingBottom: Theme.spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.colors.borderLight,
  },
  primaryBtn: {
    backgroundColor: Theme.colors.primary,
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryBtnDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
  },
});
