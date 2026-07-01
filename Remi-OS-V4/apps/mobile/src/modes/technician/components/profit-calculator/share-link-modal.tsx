import { useCallback, useState } from "react";
import {
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Clipboard from "expo-clipboard";

interface Props {
  visible: boolean;
  shareUrl: string | null;
  expiresAt: string | null;
  onClose: () => void;
}

export function ShareLinkModal({ visible, shareUrl, expiresAt, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    await Clipboard.setStringAsync(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  const handleShare = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await Share.share({
        url: shareUrl,
        message: `Check out my REMI profit model: ${shareUrl}`,
      });
    } catch {
      // User dismissed share sheet.
    }
  }, [shareUrl]);

  const expiryText = expiresAt
    ? new Date(expiresAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <MaterialIcons name="link" size={20} color="#3B82F6" />
            <Text style={styles.title}>Share link ready</Text>
          </View>
          <Text style={styles.subtitle}>
            Anyone with this link can view your scenario.
            {expiryText ? ` Expires ${expiryText}.` : ""}
          </Text>

          <View style={styles.urlBox}>
            <Text style={styles.urlText} numberOfLines={2}>
              {shareUrl ?? ""}
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.secondary} onPress={handleCopy}>
              <MaterialIcons
                name={copied ? "check" : "content-copy"}
                size={16}
                color="#3B82F6"
              />
              <Text style={styles.secondaryText}>
                {copied ? "Copied" : "Copy"}
              </Text>
            </Pressable>
            <Pressable style={styles.primary} onPress={handleShare}>
              <MaterialIcons name="ios-share" size={16} color="#fff" />
              <Text style={styles.primaryText}>Share</Text>
            </Pressable>
          </View>

          <Pressable style={styles.dismiss} onPress={onClose}>
            <Text style={styles.dismissText}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: "700", color: "#111827" },
  subtitle: { fontSize: 13, color: "#6B7280", lineHeight: 18 },
  urlBox: {
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  urlText: { fontSize: 13, color: "#111827", fontFamily: "Menlo" },
  actions: { flexDirection: "row", gap: 8 },
  secondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  secondaryText: { color: "#3B82F6", fontWeight: "700", fontSize: 14 },
  primary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#3B82F6",
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  dismiss: { paddingVertical: 8, alignItems: "center" },
  dismissText: { color: "#6B7280", fontSize: 13, fontWeight: "600" },
});
