import { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { NativeCamera } from "@technician/constants/runtime";
import { useSubmitInspection } from "@technician/hooks/operations/use-shield";
import { useAuthStore } from "@/src/stores/auth";
import { Brand } from "@technician/constants/brand";

const CATEGORIES = [
  { key: "van_exterior_front", label: "Van Exterior — Front", icon: "directions-car" as const },
  { key: "van_exterior_side", label: "Van Exterior — Side", icon: "directions-car" as const },
  { key: "van_exterior_rear", label: "Van Exterior — Rear", icon: "directions-car" as const },
  { key: "van_interior", label: "Van Interior", icon: "airline-seat-recline-normal" as const },
  { key: "equipment_layout", label: "Equipment Layout", icon: "build" as const },
  { key: "restock_area", label: "Restock Area", icon: "inventory-2" as const },
  { key: "technician_uniform", label: "Technician Uniform", icon: "person" as const },
  { key: "inventory_shelf", label: "Inventory Shelf", icon: "shelves" as const },
] as const;

type PhotoState = Record<string, string | null>;

export default function SubmitInspectionScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const submit = useSubmitInspection();
  const [photos, setPhotos] = useState<PhotoState>(
    Object.fromEntries(CATEGORIES.map((c) => [c.key, null]))
  );

  const capturedCount = Object.values(photos).filter(Boolean).length;

  const pickPhoto = async (category: string) => {
    NativeCamera.acquire();
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setPhotos((prev) => ({ ...prev, [category]: result.assets[0].uri }));
      }
    } finally {
      NativeCamera.release();
    }
  };

  const handleSubmit = () => {
    if (capturedCount < CATEGORIES.length) {
      Alert.alert(
        "Incomplete",
        `${CATEGORIES.length - capturedCount} photos remaining. Submit anyway?`,
        [
          { text: "Continue Editing", style: "cancel" },
          { text: "Submit", onPress: doSubmit },
        ]
      );
      return;
    }
    doSubmit();
  };

  const doSubmit = () => {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

    const items = Object.entries(photos)
      .filter(([, uri]) => uri != null)
      .map(([category, uri]) => ({ category, photoUrl: uri! }));

    submit.mutate(
      { franchiseId: user?.franchiseId ?? 0, periodStart, periodEnd, items },
      {
        onSuccess: () => {
          Alert.alert("Submitted", `Your ${Brand.shieldName} inspection has been submitted for review.`);
          router.back();
        },
        onError: () => Alert.alert("Error", "Could not submit inspection."),
      }
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Submit Inspection",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.progressCard}>
        <Text style={styles.progressTitle}>
          {capturedCount} / {CATEGORIES.length} photos captured
        </Text>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${(capturedCount / CATEGORIES.length) * 100}%` },
            ]}
          />
        </View>
      </View>

      {CATEGORIES.map((cat) => {
        const uri = photos[cat.key];
        return (
          <Pressable
            key={cat.key}
            style={[styles.categoryCard, uri && styles.categoryCardDone]}
            onPress={() => pickPhoto(cat.key)}
          >
            {uri ? (
              <Image source={{ uri }} style={styles.thumbnail} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <MaterialIcons name="camera-alt" size={24} color="#9CA3AF" />
              </View>
            )}
            <View style={styles.categoryInfo}>
              <Text style={styles.categoryLabel}>{cat.label}</Text>
              <Text style={styles.categoryHint}>
                {uri ? "Tap to retake" : "Tap to capture"}
              </Text>
            </View>
            {uri ? (
              <MaterialIcons name="check-circle" size={24} color="#22C55E" />
            ) : (
              <MaterialIcons name={cat.icon} size={22} color="#9CA3AF" />
            )}
          </Pressable>
        );
      })}

      <Pressable
        style={[styles.submitBtn, submit.isPending && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={submit.isPending}
      >
        {submit.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <MaterialIcons name="send" size={20} color="#fff" />
            <Text style={styles.submitBtnText}>Submit Inspection</Text>
          </>
        )}
      </Pressable>
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16, paddingBottom: 40 },
  progressCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  progressTitle: { fontSize: 15, fontWeight: "700", color: "#374151", marginBottom: 10 },
  progressBar: {
    height: 8,
    backgroundColor: "#E5E7EB",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "#22C55E", borderRadius: 4 },
  categoryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  categoryCardDone: { borderColor: "#86EFAC" },
  photoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnail: { width: 56, height: 56, borderRadius: 10 },
  categoryInfo: { flex: 1 },
  categoryLabel: { fontSize: 15, fontWeight: "600", color: "#111827" },
  categoryHint: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#3B82F6",
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  submitBtnText: { fontSize: 17, fontWeight: "700", color: "#fff" },
});
