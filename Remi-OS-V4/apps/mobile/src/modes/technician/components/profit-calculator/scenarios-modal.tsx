import { useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { calculate } from "@profit-model/engine";
import { months_to_human } from "@profit-model/format";
import {
  useDeleteProfitSession,
  useMyProfitSessions,
} from "@technician/hooks/profit-calculator/use-profit-sessions";
import type { ProfitModelSession } from "@technician/types/profit-model";

interface Props {
  visible: boolean;
  onClose: () => void;
  onLoad: (session: ProfitModelSession) => void;
}

/**
 * "My Scenarios" — authenticated-only list of saved profit-model sessions.
 * Tapping a row hands the session back to the calculator via `onLoad`. The
 * payback "at-a-glance" is computed locally with the engine instead of
 * relying on the backend's optional `outputs_snapshot`, since old sessions
 * may have been saved before that field was populated.
 */
export function ScenariosModal({ visible, onClose, onLoad }: Props) {
  const query = useMyProfitSessions({ enabled: visible });
  const remove = useDeleteProfitSession();

  const sessions = query.data?.sessions ?? [];

  const handleDelete = (session: ProfitModelSession) => {
    Alert.alert(
      "Delete scenario?",
      `"${session.name ?? "Untitled"}" will be removed from your account.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            remove.mutate(session.share_token);
          },
        },
      ]
    );
  };

  return (
    <Modal
      animationType="slide"
      presentationStyle="pageSheet"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>My Scenarios</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <MaterialIcons name="close" size={22} color="#6B7280" />
          </Pressable>
        </View>

        {query.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#3B82F6" />
          </View>
        ) : query.isError ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>Couldn't load scenarios</Text>
            <Text style={styles.emptyHint}>
              Check your connection and try again.
            </Text>
            <Pressable style={styles.retry} onPress={() => query.refetch()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : sessions.length === 0 ? (
          <View style={styles.center}>
            <MaterialIcons name="bookmark-border" size={36} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No saved scenarios yet</Text>
            <Text style={styles.emptyHint}>
              Tweak the calculator and tap "Save to my account" to keep it.
            </Text>
          </View>
        ) : (
          <FlatList
            data={sessions}
            keyExtractor={(s) => s.share_token}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            renderItem={({ item }) => (
              <ScenarioRow
                session={item}
                onPress={() => {
                  onLoad(item);
                  onClose();
                }}
                onDelete={() => handleDelete(item)}
              />
            )}
            refreshing={query.isFetching && !query.isLoading}
            onRefresh={() => query.refetch()}
          />
        )}
      </View>
    </Modal>
  );
}

function ScenarioRow({
  session,
  onPress,
  onDelete,
}: {
  session: ProfitModelSession;
  onPress: () => void;
  onDelete: () => void;
}) {
  // Cheap to compute on render — engine is pure & dep-free. Wrapped in
  // useMemo so a parent re-render doesn't recompute unnecessarily.
  const payback = useMemo(() => {
    try {
      const r = calculate(session.inputs);
      return r.kpis.payback_period_months !== null
        ? months_to_human(r.kpis.payback_period_months)
        : null;
    } catch {
      return null;
    }
  }, [session.inputs]);

  const updatedLabel = formatRelative(session.updated_at);

  return (
    <Pressable style={styles.row} onPress={onPress} android_ripple={{ color: "#F3F4F6" }}>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>{session.name ?? "Untitled"}</Text>
        <Text style={styles.rowMeta}>
          Updated {updatedLabel}
          {payback ? ` · ${payback} payback` : ""}
        </Text>
      </View>
      <Pressable
        onPress={onDelete}
        hitSlop={10}
        style={styles.deleteBtn}
      >
        <MaterialIcons name="delete-outline" size={20} color="#EF4444" />
      </Pressable>
    </Pressable>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  title: { fontSize: 17, fontWeight: "700", color: "#111827" },
  list: { paddingVertical: 8 },
  sep: { height: 1, backgroundColor: "#F3F4F6", marginLeft: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowMain: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 15, fontWeight: "600", color: "#111827" },
  rowMeta: { fontSize: 12, color: "#6B7280" },
  deleteBtn: { padding: 6 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: "#111827", marginTop: 8 },
  emptyHint: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 18,
  },
  retry: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
  },
  retryText: { color: "#3B82F6", fontWeight: "700" },
});
