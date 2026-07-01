import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Theme, HealthColors } from '@customer/constants/colors';
import { SkeletonBox } from '@customer/components/shared/skeleton';
import {
  useInspectionTemplate,
  useSubmitInspection,
} from '@customer/hooks/fleet/use-fleet-inspections';
import type {
  InspectionCheckResult,
  InspectionSubmissionItem,
  InspectionTemplateItem,
} from '@customer/types/fleet';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type StepState = {
  result: InspectionCheckResult | null;
  photo_uri: string | null;
};

/* ── Vehicle Confirm Step ── */
function VehicleConfirmStep({
  vehicleName,
  onConfirm,
}: {
  vehicleName: string | null;
  onConfirm: () => void;
}) {
  return (
    <View style={styles.stepCenter}>
      <View style={styles.vehicleIcon}>
        <Ionicons name="car-sport" size={56} color={Theme.colors.primary} />
      </View>
      <Text style={styles.stepTitle}>Confirm Vehicle</Text>
      <Text style={styles.stepSubtitle}>
        {vehicleName ?? 'Your assigned vehicle'}
      </Text>
      <TouchableOpacity style={styles.primaryBtn} onPress={onConfirm} activeOpacity={0.8}>
        <Text style={styles.primaryBtnText}>Start Inspection</Text>
      </TouchableOpacity>
    </View>
  );
}

/* ── Checklist Item Step ── */
function ChecklistItemStep({
  item,
  state,
  onPass,
  onFlag,
  onPhoto,
}: {
  item: InspectionTemplateItem;
  state: StepState;
  onPass: () => void;
  onFlag: () => void;
  onPhoto: () => void;
}) {
  const isPassed = state.result === 'pass';
  const isFlagged = state.result === 'flag';

  return (
    <View style={styles.stepCenter}>
      <View style={[styles.itemIconWrap, { backgroundColor: Theme.colors.primary + '12' }]}>
        <Ionicons
          name={item.icon as keyof typeof Ionicons.glyphMap}
          size={40}
          color={Theme.colors.primary}
        />
      </View>
      <Text style={styles.stepTitle}>{item.label}</Text>
      <Text style={styles.stepDescription}>{item.description}</Text>

      <View style={styles.choiceRow}>
        <TouchableOpacity
          style={[
            styles.choiceBtn,
            isPassed && { backgroundColor: HealthColors.good, borderColor: HealthColors.good },
          ]}
          onPress={onPass}
          activeOpacity={0.7}
        >
          <Ionicons
            name="checkmark-circle"
            size={28}
            color={isPassed ? Theme.colors.white : HealthColors.good}
          />
          <Text
            style={[
              styles.choiceBtnText,
              isPassed && { color: Theme.colors.white },
            ]}
          >
            Pass
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.choiceBtn,
            isFlagged && { backgroundColor: HealthColors.warning, borderColor: HealthColors.warning },
          ]}
          onPress={onFlag}
          activeOpacity={0.7}
        >
          <Ionicons
            name="flag"
            size={28}
            color={isFlagged ? Theme.colors.white : HealthColors.warning}
          />
          <Text
            style={[
              styles.choiceBtnText,
              isFlagged && { color: Theme.colors.white },
            ]}
          >
            Flag
          </Text>
        </TouchableOpacity>
      </View>

      {isFlagged && (
        <TouchableOpacity style={styles.photoBtn} onPress={onPhoto} activeOpacity={0.7}>
          <Ionicons
            name={state.photo_uri ? 'image' : 'camera-outline'}
            size={20}
            color={Theme.colors.primary}
          />
          <Text style={styles.photoBtnText}>
            {state.photo_uri ? 'Photo attached' : 'Add photo (optional)'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/* ── Review Step ── */
function ReviewStep({
  items,
  states,
  onSubmit,
  isSubmitting,
}: {
  items: InspectionTemplateItem[];
  states: StepState[];
  onSubmit: () => void;
  isSubmitting: boolean;
}) {
  const flaggedCount = states.filter((s) => s.result === 'flag').length;
  const passedCount = states.filter((s) => s.result === 'pass').length;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.reviewContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.stepTitle}>Review Inspection</Text>
      <Text style={styles.stepSubtitle}>
        {passedCount} passed, {flaggedCount} flagged out of {items.length} items
      </Text>

      <View style={styles.reviewList}>
        {items.map((item, idx) => {
          const s = states[idx];
          const isFlagged = s.result === 'flag';
          return (
            <View
              key={item.key}
              style={[
                styles.reviewRow,
                isFlagged && { borderLeftColor: HealthColors.warning, borderLeftWidth: 3 },
              ]}
            >
              <Ionicons
                name={isFlagged ? 'flag' : 'checkmark-circle'}
                size={20}
                color={isFlagged ? HealthColors.warning : HealthColors.good}
              />
              <Text style={styles.reviewLabel}>{item.label}</Text>
              {s.photo_uri && (
                <Ionicons name="image-outline" size={16} color={Theme.colors.textTertiary} />
              )}
            </View>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, isSubmitting && { opacity: 0.6 }]}
        onPress={onSubmit}
        disabled={isSubmitting}
        activeOpacity={0.8}
      >
        <Text style={styles.primaryBtnText}>
          {isSubmitting ? 'Submitting...' : 'Submit Inspection'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

/* ── Main Screen ── */
export default function InspectionSubmitScreen() {
  const router = useRouter();
  const { data: template, isLoading } = useInspectionTemplate();
  const submitMutation = useSubmitInspection();

  const items = template?.items ?? [];
  const totalSteps = items.length + 2; // confirm + items + review
  const [currentStep, setCurrentStep] = useState(0);
  const [states, setStates] = useState<StepState[]>([]);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const initStates = useCallback(() => {
    setStates(items.map(() => ({ result: null, photo_uri: null })));
  }, [items]);

  const animateProgress = useCallback(
    (step: number) => {
      Animated.spring(progressAnim, {
        toValue: step / (totalSteps - 1),
        useNativeDriver: false,
        tension: 50,
        friction: 10,
      }).start();
    },
    [progressAnim, totalSteps],
  );

  const goNext = useCallback(() => {
    const next = currentStep + 1;
    setCurrentStep(next);
    animateProgress(next);
  }, [currentStep, animateProgress]);

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      const prev = currentStep - 1;
      setCurrentStep(prev);
      animateProgress(prev);
    }
  }, [currentStep, animateProgress]);

  const handleConfirmVehicle = useCallback(() => {
    initStates();
    goNext();
  }, [initStates, goNext]);

  const handlePass = useCallback(
    (idx: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setStates((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], result: 'pass', photo_uri: null };
        return next;
      });
      setTimeout(goNext, 200);
    },
    [goNext],
  );

  const handleFlag = useCallback(
    (idx: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setStates((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], result: 'flag' };
        return next;
      });
    },
    [],
  );

  const handlePhoto = useCallback(async (idx: number) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Camera access is required to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setStates((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], photo_uri: result.assets[0].uri };
        return next;
      });
    }
  }, []);

  const handleSubmit = useCallback(() => {
    if (!template) return;
    const vehicleId = template.vehicle_id ?? 1;
    const payload = {
      vehicle_id: vehicleId,
      items: items.map((item, idx) => ({
        key: item.key,
        result: states[idx]?.result ?? 'pass' as InspectionCheckResult,
        photo_uri: states[idx]?.photo_uri ?? null,
      })),
      voice_note_uri: null,
    };

    submitMutation.mutate(payload, {
      onSuccess: (res) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          'Inspection Submitted',
          `Score: ${res.score}%${res.flagged_items > 0 ? ` (${res.flagged_items} flagged)` : ''}`,
          [{ text: 'Done', onPress: () => router.back() }],
        );
      },
      onError: () => {
        Alert.alert('Error', 'Could not submit inspection. Try again.');
      },
    });
  }, [template, items, states, submitMutation, router]);

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <SkeletonBox width={200} height={200} borderRadius={100} />
        <View style={{ height: 24 }} />
        <SkeletonBox width={240} height={24} borderRadius={8} />
        <View style={{ height: 12 }} />
        <SkeletonBox width={180} height={16} borderRadius={8} />
      </View>
    );
  }

  const isReviewStep = currentStep === totalSteps - 1;
  const isConfirmStep = currentStep === 0;
  const checklistIdx = currentStep - 1;
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const allAnswered = states.length > 0 && states.every((s) => s.result !== null);
  const currentAnswered = !isConfirmStep && !isReviewStep && states[checklistIdx]?.result !== null;

  return (
    <View style={styles.container}>
      {/* Progress Bar */}
      <View style={styles.progressBar}>
        <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
      </View>

      {/* Step Counter */}
      <View style={styles.stepCounterRow}>
        {currentStep > 0 && (
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={Theme.colors.primary} />
          </TouchableOpacity>
        )}
        <Text style={styles.stepCounter}>
          {isConfirmStep
            ? 'Step 1'
            : isReviewStep
              ? 'Review'
              : `Item ${checklistIdx + 1} of ${items.length}`}
        </Text>
      </View>

      {/* Content */}
      {isConfirmStep ? (
        <VehicleConfirmStep
          vehicleName={template?.vehicle_name ?? null}
          onConfirm={handleConfirmVehicle}
        />
      ) : isReviewStep ? (
        <ReviewStep
          items={items}
          states={states}
          onSubmit={handleSubmit}
          isSubmitting={submitMutation.isPending}
        />
      ) : (
        <>
          <ChecklistItemStep
            item={items[checklistIdx]}
            state={states[checklistIdx] ?? { result: null, photo_uri: null }}
            onPass={() => handlePass(checklistIdx)}
            onFlag={() => handleFlag(checklistIdx)}
            onPhoto={() => handlePhoto(checklistIdx)}
          />
          {currentAnswered && (
            <View style={styles.nextBtnWrap}>
              <TouchableOpacity style={styles.nextBtn} onPress={goNext} activeOpacity={0.8}>
                <Text style={styles.nextBtnText}>
                  {checklistIdx === items.length - 1 ? 'Review' : 'Next'}
                </Text>
                <Ionicons name="chevron-forward" size={20} color={Theme.colors.white} />
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBar: {
    height: 4,
    backgroundColor: Theme.colors.borderLight,
  },
  progressFill: {
    height: 4,
    backgroundColor: Theme.colors.primary,
    borderRadius: 2,
  },
  stepCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
  },
  backBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Theme.spacing.xs,
  },
  stepCounter: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
  stepCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.lg,
  },
  vehicleIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Theme.colors.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Theme.spacing.lg,
  },
  stepTitle: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: '700',
    color: Theme.colors.text,
    textAlign: 'center',
    marginBottom: Theme.spacing.xs,
  },
  stepSubtitle: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: Theme.spacing.lg,
  },
  stepDescription: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: Theme.spacing.xl,
    lineHeight: 20,
  },
  itemIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Theme.spacing.lg,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: Theme.spacing.md,
    width: '100%',
    paddingHorizontal: Theme.spacing.md,
  },
  choiceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.sm,
    paddingVertical: 20,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: Theme.colors.border,
    backgroundColor: Theme.colors.surfaceElevated,
    minHeight: 64,
  },
  choiceBtnText: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Theme.spacing.lg,
    paddingVertical: 12,
    paddingHorizontal: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Theme.colors.primary + '10',
  },
  photoBtnText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
  nextBtnWrap: {
    paddingHorizontal: Theme.spacing.lg,
    paddingBottom: Theme.spacing.xl,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.sm,
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.md,
    paddingVertical: 16,
  },
  nextBtnText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.white,
  },
  primaryBtn: {
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.md,
    paddingVertical: 16,
    paddingHorizontal: Theme.spacing.xl,
    minWidth: 200,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.white,
  },
  reviewContent: {
    padding: Theme.spacing.lg,
    paddingBottom: Theme.spacing.xxl,
  },
  reviewList: {
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.lg,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
  },
  reviewLabel: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
    flex: 1,
  },
});
