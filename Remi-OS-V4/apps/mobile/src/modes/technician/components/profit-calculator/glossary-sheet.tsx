import { useCallback } from "react";
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { GlossaryEntry } from "@profit-model/glossary";

// PM-MIG-19 — Bottom-sheet style glossary explainer for the profit calculator.
//
// We render a native iOS `Modal` with `presentationStyle="pageSheet"` so the
// sheet slides up from the bottom and gets the system swipe-down-to-dismiss
// gesture for free. We deliberately do NOT pull in `@gorhom/bottom-sheet`'s
// `BottomSheetModal` here even though the dependency exists: that variant
// requires a `BottomSheetModalProvider` mounted at the root, which we don't
// have today. The pageSheet path matches every other modal on this screen
// (save-scenario-modal, share-link-modal, scenarios-modal) and keeps the UX
// consistent.

type Props = {
  entry: GlossaryEntry;
  onClose: () => void;
};

export function GlossarySheet({ entry, onClose }: Props) {
  const handleExternal = useCallback(() => {
    if (entry.external_url) {
      void Linking.openURL(entry.external_url);
    }
  }, [entry.external_url]);

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={2}>
              {entry.label}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close glossary"
            >
              <MaterialIcons name="close" size={20} color="#374151" />
            </Pressable>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.short}>{entry.short}</Text>
          <Text style={styles.long}>{entry.long}</Text>
          {entry.external_url ? (
            <Pressable
              onPress={handleExternal}
              hitSlop={6}
              style={styles.linkBtn}
              accessibilityRole="link"
              accessibilityLabel={`Learn more about ${entry.label}`}
            >
              <MaterialIcons name="open-in-new" size={16} color="#3B82F6" />
              <Text style={styles.linkText}>Learn more</Text>
            </Pressable>
          ) : null}
          <View style={{ height: 32 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    alignSelf: "center",
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 14,
  },
  short: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
    lineHeight: 22,
  },
  long: {
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 22,
  },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  linkText: {
    color: "#3B82F6",
    fontSize: 13,
    fontWeight: "700",
  },
});
