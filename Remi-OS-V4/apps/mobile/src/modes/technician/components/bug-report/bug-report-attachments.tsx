import { useCallback } from "react";
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { NativeCamera } from "@technician/constants/runtime";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { AttachmentType, type LocalAttachment } from "@technician/types/bug-report";
import * as Crypto from "expo-crypto";

interface BugReportAttachmentsProps {
  attachments: LocalAttachment[];
  onChange: (attachments: LocalAttachment[]) => void;
  onAnnotate: (attachment: LocalAttachment) => void;
}

export function BugReportAttachments({
  attachments,
  onChange,
  onAnnotate,
}: BugReportAttachmentsProps) {
  const handleAdd = useCallback(() => {
    haptic.light();
    Alert.alert("Add Attachment", undefined, [
      {
        text: "Take a Photo",
        onPress: async () => {
          NativeCamera.acquire();
          try {
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ["images"],
              quality: 0.8,
            });
            if (!result.canceled && result.assets[0]) {
              const asset = result.assets[0];
              onChange([
                ...attachments,
                {
                  id: Crypto.randomUUID(),
                  type: AttachmentType.SCREENSHOT_PLAIN,
                  uri: asset.uri,
                  mime_type: asset.mimeType ?? "image/jpeg",
                },
              ]);
            }
          } finally {
            NativeCamera.release();
          }
        },
      },
      {
        text: "Choose from Library",
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.8,
            allowsMultipleSelection: true,
            selectionLimit: 5,
          });
          if (!result.canceled) {
            const newAttachments: LocalAttachment[] = result.assets.map(
              (asset) => ({
                id: Crypto.randomUUID(),
                type: AttachmentType.SCREENSHOT_PLAIN,
                uri: asset.uri,
                mime_type: asset.mimeType ?? "image/jpeg",
              })
            );
            onChange([...attachments, ...newAttachments]);
          }
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [attachments, onChange]);

  const handleRemove = useCallback(
    (id: string) => {
      haptic.light();
      onChange(attachments.filter((a) => a.id !== id));
    },
    [attachments, onChange]
  );

  const renderItem = useCallback(
    ({ item }: { item: LocalAttachment | "add" }) => {
      if (item === "add") {
        return (
          <Pressable onPress={handleAdd} style={styles.addBtn}>
            <MaterialIcons name="add-photo-alternate" size={28} color="#9CA3AF" />
            <Text style={styles.addLabel}>Add</Text>
          </Pressable>
        );
      }

      const isImage =
        item.type === AttachmentType.SCREENSHOT_PLAIN ||
        item.type === AttachmentType.SCREENSHOT_ANNOTATED;

      return (
        <View style={styles.thumbnailContainer}>
          {isImage ? (
            <Pressable onPress={() => onAnnotate(item)}>
              <Image source={{ uri: item.uri }} style={styles.thumbnail} />
            </Pressable>
          ) : (
            <View style={[styles.thumbnail, styles.filePlaceholder]}>
              <MaterialIcons
                name={
                  item.type === AttachmentType.VOICE_MEMO
                    ? "mic"
                    : "videocam"
                }
                size={24}
                color="#6B7280"
              />
            </View>
          )}
          <Pressable
            onPress={() => handleRemove(item.id)}
            style={styles.removeBtn}
          >
            <MaterialIcons name="close" size={14} color="#fff" />
          </Pressable>
        </View>
      );
    },
    [handleAdd, handleRemove, onAnnotate]
  );

  const data: (LocalAttachment | "add")[] = [...attachments, "add"];

  return (
    <FlatList
      data={data}
      renderItem={renderItem}
      keyExtractor={(item) => (item === "add" ? "add-button" : item.id)}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingVertical: 8,
    gap: 10,
  },
  thumbnailContainer: {
    position: "relative",
    marginRight: 10,
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
  },
  filePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  addBtn: {
    width: 72,
    height: 72,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  addLabel: {
    fontSize: 11,
    color: "#9CA3AF",
    fontWeight: "500",
  },
});
