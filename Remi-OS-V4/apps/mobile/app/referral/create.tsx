import { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { NativeCamera } from "@technician/constants/runtime";
import { useCreateReferral } from "@technician/hooks/customers/use-referrals";
import { useAuthStore } from "@/src/stores/auth";

const CATEGORIES = [
  { key: "windshield", label: "Windshield", icon: "visibility" as const },
  { key: "brakes", label: "Brakes", icon: "disc-full" as const },
  { key: "tires", label: "Tires", icon: "tire-repair" as const },
  { key: "cel", label: "Check Engine Light", icon: "warning" as const },
  { key: "tow", label: "Tow Needed", icon: "local-shipping" as const },
  { key: "detailing", label: "Detailing", icon: "auto-awesome" as const },
] as const;

export default function CreateReferralScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    appointmentId?: string;
    category?: string;
  }>();
  const create = useCreateReferral();
  const user = useAuthStore((s) => s.user);

  const [selectedCategory, setSelectedCategory] = useState<string>(params.category ?? "");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [partnerName, setPartnerName] = useState<string | null>(null);

  const addPhoto = async () => {
    NativeCamera.acquire();
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setPhotos((prev) => [...prev, result.assets[0].uri]);
      }
    } finally {
      NativeCamera.release();
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = () => {
    if (!selectedCategory) {
      Alert.alert("Select Category", "Choose an issue category.");
      return;
    }

    create.mutate(
      {
        franchiseId: user?.franchiseId ?? 0,
        appointmentId: params.appointmentId
          ? parseInt(params.appointmentId, 10)
          : undefined,
        category: selectedCategory,
        notes: notes || undefined,
        photoUrls: photos.length > 0 ? photos : undefined,
      },
      {
        onSuccess: (data) => {
          setSubmitted(true);
          setPartnerName(data.partner_name ?? null);
        },
        onError: () => Alert.alert("Error", "Could not create referral."),
      }
    );
  };

  const backButton = () => (
    <Pressable onPress={() => router.back()} hitSlop={8}>
      <MaterialIcons name="arrow-back" size={24} color="#fff" />
    </Pressable>
  );

  if (submitted) {
    return (
      <>
        <Stack.Screen options={{ title: "Referral Sent", headerLeft: backButton }} />
        <ScrollView style={styles.container} contentContainerStyle={styles.successContent}>
        <View style={styles.successIcon}>
          <MaterialIcons name="check-circle" size={72} color="#22C55E" />
        </View>
        <Text style={styles.successTitle}>Referral Sent</Text>
        <Text style={styles.successText}>
          The issue has been flagged and routed to a partner.
        </Text>
        {partnerName ? (
          <View style={styles.partnerCard}>
            <MaterialIcons name="handshake" size={22} color="#3B82F6" />
            <View>
              <Text style={styles.partnerLabel}>Assigned Partner</Text>
              <Text style={styles.partnerName}>{partnerName}</Text>
            </View>
          </View>
        ) : null}
        <Pressable style={styles.doneBtn} onPress={() => router.back()}>
          <Text style={styles.doneBtnText}>Done</Text>
        </Pressable>
      </ScrollView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Flag an Issue", headerLeft: backButton }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Issue Category</Text>
      <View style={styles.categoryGrid}>
        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat.key}
            style={[
              styles.categoryChip,
              selectedCategory === cat.key && styles.categoryChipSelected,
            ]}
            onPress={() => setSelectedCategory(cat.key)}
          >
            <MaterialIcons
              name={cat.icon}
              size={22}
              color={selectedCategory === cat.key ? "#1D4ED8" : "#6B7280"}
            />
            <Text
              style={[
                styles.categoryText,
                selectedCategory === cat.key && styles.categoryTextSelected,
              ]}
            >
              {cat.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Notes</Text>
      <TextInput
        style={styles.notesInput}
        value={notes}
        onChangeText={setNotes}
        placeholder="Describe the issue..."
        placeholderTextColor="#9CA3AF"
        multiline
        numberOfLines={4}
      />

      <Text style={styles.label}>Photos</Text>
      <View style={styles.photoRow}>
        {photos.map((uri, idx) => (
          <View key={idx} style={styles.photoWrap}>
            <Image source={{ uri }} style={styles.photo} />
            <Pressable style={styles.photoRemove} onPress={() => removePhoto(idx)}>
              <MaterialIcons name="close" size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
        <Pressable style={styles.addPhotoBtn} onPress={addPhoto}>
          <MaterialIcons name="add-a-photo" size={24} color="#9CA3AF" />
        </Pressable>
      </View>

      <Pressable
        style={[styles.submitBtn, create.isPending && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={create.isPending}
      >
        {create.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <MaterialIcons name="send" size={20} color="#fff" />
            <Text style={styles.submitBtnText}>Send Referral</Text>
          </>
        )}
      </Pressable>
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: "700", color: "#374151", marginTop: 20, marginBottom: 10 },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  categoryChip: {
    width: "47%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  categoryChipSelected: { borderColor: "#3B82F6", backgroundColor: "#EFF6FF" },
  categoryText: { fontSize: 14, fontWeight: "600", color: "#374151" },
  categoryTextSelected: { color: "#1D4ED8" },
  notesInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#111827",
    minHeight: 100,
    textAlignVertical: "top",
  },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  photoWrap: { position: "relative" },
  photo: { width: 72, height: 72, borderRadius: 10 },
  photoRemove: {
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
  addPhotoBtn: {
    width: 72,
    height: 72,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#EF4444",
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 28,
  },
  submitBtnText: { fontSize: 17, fontWeight: "700", color: "#fff" },
  successContent: { padding: 24, alignItems: "center" },
  successIcon: { marginTop: 40, marginBottom: 16 },
  successTitle: { fontSize: 26, fontWeight: "800", color: "#111827" },
  successText: { fontSize: 15, color: "#6B7280", textAlign: "center", marginTop: 4 },
  partnerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#EFF6FF",
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
    width: "100%",
  },
  partnerLabel: { fontSize: 12, color: "#6B7280" },
  partnerName: { fontSize: 16, fontWeight: "700", color: "#1D4ED8" },
  doneBtn: {
    backgroundColor: "#3B82F6",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    width: "100%",
    marginTop: 24,
  },
  doneBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
