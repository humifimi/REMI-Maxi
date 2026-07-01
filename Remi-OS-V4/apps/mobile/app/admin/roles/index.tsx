import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useAuthStore } from "@/src/stores/auth";
import { canManageRoles } from "@/src/stores/app-mode";
import {
  useCreateRole,
  useRoles,
  useSetRoleStatus,
  useUpdateRole,
  type RoleRecord,
} from "@technician/hooks/auth/use-roles";

export default function AdminRolesScreen() {
  const router = useRouter();
  const userRole = useAuthStore((s) => s.user?.role);
  const { data: roles = [], isLoading, refetch, isRefetching } = useRoles();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const setStatus = useSetRoleStatus();

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<RoleRecord | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [roleEnum, setRoleEnum] = useState("");

  useEffect(() => {
    if (userRole && !canManageRoles(userRole)) {
      router.replace("/");
    }
  }, [userRole, router]);

  if (!canManageRoles(userRole)) return null;

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setRoleEnum("");
    setModalVisible(true);
  };

  const openEdit = (role: RoleRecord) => {
    setEditing(role);
    setName(role.name);
    setDescription(role.description);
    setRoleEnum(role.role_enum);
    setModalVisible(true);
  };

  const save = () => {
    if (!name.trim() || !roleEnum.trim()) {
      Alert.alert("Missing fields", "Name and role enum are required.");
      return;
    }
    if (editing) {
      updateRole.mutate(
        { id: editing.id, name: name.trim(), description: description.trim() },
        {
          onSuccess: () => setModalVisible(false),
          onError: (e) =>
            Alert.alert("Update failed", e instanceof Error ? e.message : "Try again"),
        }
      );
    } else {
      createRole.mutate(
        {
          name: name.trim(),
          description: description.trim(),
          role_enum: roleEnum.trim().toLowerCase(),
        },
        {
          onSuccess: () => setModalVisible(false),
          onError: (e) =>
            Alert.alert("Create failed", e instanceof Error ? e.message : "Try again"),
        }
      );
    }
  };

  const toggleStatus = (role: RoleRecord, active: boolean) => {
    setStatus.mutate(
      { id: role.id, status: active ? "active" : "inactive" },
      {
        onError: (e) =>
          Alert.alert(
            "Cannot update status",
            e instanceof Error ? e.message : "Try again"
          ),
      }
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Roles",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={openCreate} hitSlop={8}>
              <MaterialIcons name="add" size={26} color="#fff" />
            </Pressable>
          ),
        }}
      />
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={roles}
          keyExtractor={(item) => String(item.id)}
          refreshing={isRefetching}
          onRefresh={() => refetch()}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => openEdit(item)}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Switch
                  value={item.status === "active"}
                  onValueChange={(v) => toggleStatus(item, v)}
                />
              </View>
              <Text style={styles.enum}>{item.role_enum}</Text>
              {item.description ? (
                <Text style={styles.desc} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              <Text
                style={[
                  styles.badge,
                  item.status === "active" ? styles.badgeActive : styles.badgeInactive,
                ]}
              >
                {item.status}
              </Text>
            </Pressable>
          )}
        />
      )}

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editing ? "Edit role" : "New role"}
            </Text>
            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} />
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              multiline
            />
            <Text style={styles.label}>Role enum</Text>
            <TextInput
              style={[styles.input, editing && styles.inputDisabled]}
              value={roleEnum}
              onChangeText={setRoleEnum}
              autoCapitalize="none"
              editable={!editing}
              placeholder="e.g. regional_manager"
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={save}>
                <Text style={styles.primaryBtnText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: { fontSize: 17, fontWeight: "700", color: "#111827", flex: 1 },
  enum: { fontSize: 13, color: "#6B7280", marginTop: 4, fontFamily: "monospace" },
  desc: { fontSize: 14, color: "#4B5563", marginTop: 6 },
  badge: {
    alignSelf: "flex-start",
    marginTop: 10,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: "hidden",
  },
  badgeActive: { backgroundColor: "#DCFCE7", color: "#166534" },
  badgeInactive: { backgroundColor: "#FEE2E2", color: "#991B1B" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 15,
  },
  inputDisabled: { backgroundColor: "#F3F4F6", color: "#6B7280" },
  textArea: { minHeight: 72, textAlignVertical: "top" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
  },
  secondaryBtnText: { fontWeight: "600", color: "#374151" },
  primaryBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#111827",
  },
  primaryBtnText: { fontWeight: "700", color: "#fff" },
});
