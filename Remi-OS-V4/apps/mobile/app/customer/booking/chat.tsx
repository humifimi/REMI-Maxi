import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';
import {
  BookingConfirmationCard,
  MessageBubble,
  QuickReplyChips,
  SlotCardList,
  VehiclePickerInline,
} from '@customer/components/booking-chat';
import { useChatBooking, type PrefilledBookingContext } from '@customer/hooks/use-chat-booking';
import { useVehicles } from '@customer/hooks/vehicles/use-vehicles';
import { useServices } from '@customer/hooks/services/use-services';
import { useBookingStore } from '@/src/stores/customer/booking';
import type { ChatBubbleMessage } from '@customer/types/booking-chat';
import type { Service, Vehicle } from '@customer/types/api';

// ---------------------------------------------------------------------------
// Typing indicator
// ---------------------------------------------------------------------------

function TypingIndicator() {
  const dots = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 320, useNativeDriver: true }),
        ]),
      ),
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [dots]);

  return (
    <View style={[styles.typingBubble]}>
      <View style={styles.typingDots}>
        {dots.map((dot, i) => (
          <Animated.View
            key={i}
            style={[
              styles.typingDot,
              { opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
              { transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Fallback prompt (shown after 2 failed parses or backend errors)
// ---------------------------------------------------------------------------

function FallbackPrompt({
  message,
  onFallback,
}: {
  message: string;
  onFallback: () => void;
}) {
  return (
    <View style={styles.fallbackCard}>
      <Text style={styles.fallbackText}>{message}</Text>
      <TouchableOpacity style={styles.fallbackBtn} onPress={onFallback} activeOpacity={0.7}>
        <Ionicons name="calendar-outline" size={18} color={Theme.colors.white} />
        <Text style={styles.fallbackBtnText}>Use Regular Booking</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Error state (backend unreachable)
// ---------------------------------------------------------------------------

function ErrorState({
  onFallback,
  onRetry,
}: {
  onFallback: () => void;
  onRetry: () => void;
}) {
  return (
    <View style={styles.errorContainer}>
      <Ionicons name="cloud-offline-outline" size={48} color={Theme.colors.textTertiary} />
      <Text style={styles.errorTitle}>Can't reach booking assistant</Text>
      <Text style={styles.errorSub}>The AI service is temporarily unavailable.</Text>
      <TouchableOpacity style={styles.errorBtn} onPress={onRetry} activeOpacity={0.7}>
        <Text style={styles.errorBtnText}>Try Again</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.errorLink} onPress={onFallback} activeOpacity={0.7}>
        <Text style={styles.errorLinkText}>Try the regular booking flow</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function ChatBookingScreen() {
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const [inputText, setInputText] = useState('');

  const { data: vehicles } = useVehicles();
  const { data: services } = useServices();
  const startWithPreselectedServices = useBookingStore((s) => s.startWithPreselectedServices);
  const startFreshBooking = useBookingStore((s) => s.startFreshBooking);

  const {
    messages,
    isProcessing,
    bookedAppointmentId,
    confirmedSlot,
    showFallbackPrompt,
    error,
    prefilledContext,
    initSession,
    send,
    pickSlot,
    handleSuggestedAction,
    cancel,
  } = useChatBooking();

  useEffect(() => {
    initSession();
    return () => {
      cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    setInputText('');
    Keyboard.dismiss();
    send(trimmed);
  }, [inputText, send]);

  const handleMicPress = useCallback(() => {
    // expo-speech is TTS-only; for STT we need a voice transcription pipeline.
    // The backend nlp-booking-contract.md describes an optional
    // POST /bookings/nlp/:sessionId/voice endpoint (Whisper). Until that lands
    // and a recording UI is added, surface a "coming soon" hint so the button
    // is discoverable but never silently broken.
    Alert.alert(
      'Voice input',
      'Voice input is coming soon. For now, type what you need and the assistant will handle the rest.',
    );
  }, []);

  const handleViewAppointment = useCallback(
    (id: number) => {
      router.replace(`/customer/appointment/${id}`);
    },
    [router],
  );

  const handleFallbackToRegularFlow = useCallback(() => {
    cancel();
    const route = preselectFromContext(prefilledContext, services, startWithPreselectedServices) ??
      startFreshBooking();
    // BookingRoute is a typed string union; Expo Router accepts it at runtime
    // but the type cast keeps the linker happy for the broader Href type.
    router.replace(route as never);
  }, [cancel, prefilledContext, services, startWithPreselectedServices, startFreshBooking, router]);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [messages.length, isProcessing, scrollToEnd]);

  // ---- Vehicle picker logic --------------------------------------------------
  // Surface inline vehicle picker on the most recent assistant message
  // when the customer has 2+ vehicles AND the assistant is asking about a
  // specific vehicle (intent.vehicle_hint mentioned, or backend returned
  // suggested_actions of type send_message that mention a vehicle, or the
  // assistant message itself contains "which vehicle").
  const lastAssistantMessage = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'assistant'),
    [messages],
  );
  const shouldShowVehiclePicker = useMemo(() => {
    if (!vehicles || vehicles.length < 2) return false;
    if (!lastAssistantMessage) return false;
    if (bookedAppointmentId) return false;
    const text = lastAssistantMessage.text.toLowerCase();
    return text.includes('which vehicle') || text.includes('which car') || text.includes('vehicle would you like');
  }, [vehicles, lastAssistantMessage, bookedAppointmentId]);

  const handleVehiclePick = useCallback(
    (vehicle: Vehicle) => {
      const label = formatVehiclePickerReply(vehicle);
      send(label);
    },
    [send],
  );

  // ---- Render ---------------------------------------------------------------

  if (error === 'unreachable') {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ErrorState
          onFallback={handleFallbackToRegularFlow}
          onRetry={() => initSession()}
        />
      </SafeAreaView>
    );
  }

  const renderItem = useCallback(
    ({ item, index }: { item: ChatBubbleMessage; index: number }) => {
      const isLast = index === messages.length - 1;
      const showVehiclePickerHere = isLast && shouldShowVehiclePicker;

      return (
        <MessageBubble message={item}>
          {item.slots && item.slots.length > 0 ? (
            <SlotCardList
              slots={item.slots}
              onSelect={pickSlot}
              disabled={isProcessing || !!item.bookedAppointmentId || !!bookedAppointmentId}
            />
          ) : null}

          {item.bookedAppointmentId ? (
            <BookingConfirmationCard
              appointmentId={item.bookedAppointmentId}
              slot={confirmedSlot ?? undefined}
              onView={() => handleViewAppointment(item.bookedAppointmentId!)}
            />
          ) : null}

          {showVehiclePickerHere && vehicles ? (
            <VehiclePickerInline
              vehicles={vehicles}
              onSelect={handleVehiclePick}
              disabled={isProcessing}
            />
          ) : null}

          {item.suggestedActions && item.suggestedActions.length > 0 && !bookedAppointmentId ? (
            <QuickReplyChips
              actions={item.suggestedActions}
              onPress={handleSuggestedAction}
              disabled={isProcessing}
            />
          ) : null}
        </MessageBubble>
      );
    },
    [
      messages.length,
      shouldShowVehiclePicker,
      vehicles,
      pickSlot,
      isProcessing,
      bookedAppointmentId,
      confirmedSlot,
      handleViewAppointment,
      handleVehiclePick,
      handleSuggestedAction,
    ],
  );

  const isBooked = !!bookedAppointmentId;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            <>
              {isProcessing ? <TypingIndicator /> : null}
              {showFallbackPrompt && !isBooked ? (
                <FallbackPrompt
                  message="Having trouble? You can switch to the regular booking flow — anything you've shared so far will be carried over."
                  onFallback={handleFallbackToRegularFlow}
                />
              ) : null}
            </>
          }
        />

        {!isBooked ? (
          <View style={styles.inputBar}>
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Describe what you need..."
              placeholderTextColor={Theme.colors.textTertiary}
              multiline
              maxLength={500}
              editable={!isProcessing}
              onSubmitEditing={handleSend}
              blurOnSubmit
              returnKeyType="send"
            />
            <Pressable
              style={styles.micBtn}
              onPress={handleMicPress}
              disabled={isProcessing}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Voice input (coming soon)"
            >
              <Ionicons name="mic-outline" size={22} color={Theme.colors.textSecondary} />
            </Pressable>
            <Pressable
              style={[
                styles.sendBtn,
                (!inputText.trim() || isProcessing) && styles.sendBtnDisabled,
              ]}
              onPress={handleSend}
              disabled={!inputText.trim() || isProcessing}
              accessibilityRole="button"
              accessibilityLabel="Send"
            >
              <Ionicons
                name="send"
                size={20}
                color={
                  inputText.trim() && !isProcessing
                    ? Theme.colors.white
                    : Theme.colors.textTertiary
                }
              />
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatVehiclePickerReply(vehicle: Vehicle): string {
  const parts = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
  return parts || `Vehicle #${vehicle.id}`;
}

function preselectFromContext(
  ctx: PrefilledBookingContext | null,
  services: Service[] | undefined,
  startWithPreselectedServices: (services: Service[], vehicle?: Vehicle | null) => string,
): string | null {
  if (!ctx || !services || ctx.serviceIds.length === 0) return null;
  const matched = ctx.serviceIds
    .map((id) => services.find((s) => s.id === id))
    .filter((s): s is Service => !!s);
  if (matched.length === 0) return null;
  return startWithPreselectedServices(matched, null);
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  flex: {
    flex: 1,
  },
  messageList: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.md,
    paddingBottom: Theme.spacing.sm,
  },
  // Typing indicator
  typingBubble: {
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    borderRadius: Theme.borderRadius.lg,
    borderBottomLeftRadius: 4,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.lg,
    alignSelf: 'flex-start',
    marginBottom: Theme.spacing.sm,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 6,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.colors.textSecondary,
  },
  // Fallback
  fallbackCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: Theme.spacing.md,
    marginTop: Theme.spacing.sm,
    alignItems: 'center',
  },
  fallbackText: {
    fontSize: Theme.fontSize.sm,
    color: '#92400E',
    textAlign: 'center',
    marginBottom: Theme.spacing.sm,
  },
  fallbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.sm,
    paddingVertical: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  fallbackBtnText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.white,
  },
  // Error state
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Theme.spacing.xl,
  },
  errorTitle: {
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
    color: Theme.colors.text,
    marginTop: Theme.spacing.md,
  },
  errorSub: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: Theme.spacing.xs,
    marginBottom: Theme.spacing.lg,
  },
  errorBtn: {
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.sm,
    paddingVertical: Theme.spacing.sm + 2,
    paddingHorizontal: Theme.spacing.xl,
    marginBottom: Theme.spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  errorBtnText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.white,
  },
  errorLink: {
    padding: Theme.spacing.sm,
  },
  errorLinkText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.primary,
    fontWeight: '500',
  },
  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.colors.border,
    backgroundColor: Theme.colors.background,
    gap: Theme.spacing.sm,
  },
  textInput: {
    flex: 1,
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    maxHeight: 100,
    minHeight: 44,
  },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: Theme.colors.surface,
  },
});
