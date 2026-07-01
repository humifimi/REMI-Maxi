import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAddOrderNote } from "@technician/hooks/jobs/use-jobs";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { extractErrorMessage } from "@technician/api/errors";

interface OrderNoteSheetProps {
  appointmentId: number;
  customerName: string;
  onClose: () => void;
}

/**
 * D2P-FE-4 (2026-04-25): Add-Note bottom sheet for the Order Manager.
 *
 * Pattern history (don't re-try the failed ones):
 *   v1 — `forwardRef<BottomSheet>` + always-mounted + imperative
 *        `snapToIndex` from the parent. Reanimated 4 + Gorhom v5
 *        silently no-op the snap when the parent re-renders the ref
 *        (`[Worklets] Tried to modify key 'current' ...`). Sheet never
 *        opens, no `onChange` event fires.
 *   v2 — conditional-mount + plain function component + `index={0}`
 *        declarative open. `onChange` still never fires; observed in
 *        user-reported logs.
 *   v3 — conditional-mount + `forwardRef` + parent retry-loop snap
 *        (mirroring `CancelSheet` / `app/(tabs)/index.tsx#trySnapSheetOpen`).
 *        Same silent failure: snap is called, no `onChange`. Whatever
 *        keeps `CancelSheet` working on the calendar canvas
 *        (`WideCanvasContext`? a sibling animated parent?) does NOT
 *        port to the orders screen tree.
 *   v4 (shipping) — native RN `<Modal presentationStyle="pageSheet">`,
 *        following the documented escape hatch in
 *        `src/components/profit-calculator/glossary-sheet.tsx`. That
 *        component literally says: "We deliberately do NOT pull in
 *        `@gorhom/bottom-sheet`'s `BottomSheetModal` here even though
 *        the dependency exists: that variant requires a
 *        `BottomSheetModalProvider` mounted at the root, which we
 *        don't have today." Every other modal on the profit calculator
 *        screen uses the same pattern. iOS gets a native page-sheet
 *        with the system swipe-down gesture; Android gets a slide-up
 *        full-screen modal. No worklets, no refs, no animation race.
 *
 * The component is self-controlled: the parent renders
 * `<OrderNoteSheet ... />` only when it wants the sheet open and
 * passes `onClose` to dismiss. There's no external ref, no snapTo,
 * no retry loop. The only behavior tied to the open lifecycle is the
 * `useEffect` that imperatively focuses the input on mount (so the
 * keyboard pops up when the sheet appears, not on every Orders-tab
 * render the way `<TextInput autoFocus>` would).
 */
export function OrderNoteSheet({
  appointmentId,
  customerName,
  onClose,
}: OrderNoteSheetProps) {
  if (__DEV__) {
    console.log("[NOTE-DEBUG] OrderNoteSheet RENDER (Modal)", {
      appointmentId,
      customerName,
    });
  }

  const addNote = useAddOrderNote(appointmentId);
  const [note, setNote] = useState("");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (__DEV__) console.log("[NOTE-DEBUG] OrderNoteSheet MOUNTED");
    // Focus next tick so the iOS pageSheet has time to slide in before
    // the keyboard pops up; otherwise we lose the slide animation.
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => {
      clearTimeout(t);
      if (__DEV__) console.log("[NOTE-DEBUG] OrderNoteSheet UNMOUNTED");
    };
  }, []);

  const handleSubmit = () => {
    if (!note.trim()) return;
    haptic.medium();
    addNote.mutate(note.trim(), {
      onSuccess: () => {
        haptic.light();
        setNote("");
        onClose();
      },
      onError: (e) => {
        haptic.error();
        Alert.alert("Couldn't save note", extractErrorMessage(e));
      },
    });
  };

  const canSubmit = note.trim().length > 0 && !addNote.isPending;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        setNote("");
        onClose();
      }}
    >
      <SafeAreaView
        style={styles.container}
        edges={["top", "left", "right"]}
      >
        <View style={styles.header}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => {
                setNote("");
                onClose();
              }}
              hitSlop={12}
              style={styles.headerCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel add note"
            >
              <Text style={styles.headerCancelText}>Cancel</Text>
            </Pressable>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.title} numberOfLines={1}>
                Add Note
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                for {customerName}
              </Text>
            </View>
            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              hitSlop={12}
              style={[styles.headerSave, !canSubmit && styles.headerSaveDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Save note"
            >
              {addNote.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.headerSaveText}>Save</Text>
              )}
            </Pressable>
          </View>
        </View>

        <KeyboardAvoidingView
          style={styles.body}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          {/* Tap outside the input to dismiss the keyboard. The
              page-sheet has no system "Done" affordance so without
              this the keyboard gets stuck open. */}
          <TouchableWithoutFeedback
            onPress={Keyboard.dismiss}
            accessible={false}
          >
            <View style={styles.bodyInner}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="Type your note..."
                placeholderTextColor="#9CA3AF"
                value={note}
                onChangeText={setNote}
                multiline
                textAlignVertical="top"
                returnKeyType="default"
              />
              <Text style={styles.hint}>
                Tap outside the box to hide the keyboard. Tap Save in the
                top right when you&apos;re done.
              </Text>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    alignSelf: "center",
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerCancel: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    minWidth: 64,
  },
  headerCancelText: { fontSize: 15, color: "#6B7280", fontWeight: "500" },
  headerTitleWrap: { flex: 1, alignItems: "center" },
  title: { fontSize: 16, fontWeight: "800", color: "#111827" },
  subtitle: { fontSize: 12, color: "#9CA3AF", marginTop: 1 },
  headerSave: {
    backgroundColor: "#3B82F6",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSaveDisabled: { backgroundColor: "#93C5FD" },
  headerSaveText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  body: { flex: 1 },
  bodyInner: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 10,
  },
  input: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    fontSize: 15,
    color: "#111827",
    height: 180,
  },
  hint: { fontSize: 12, color: "#9CA3AF", textAlign: "center" },
});
