import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { bugReportService } from "@technician/services/bug-report.service";
import type { LocalBugReport } from "@technician/types/bug-report";
import {
  getBugReportStatusColor,
  getBugReportStatusLabel,
} from "@technician/constants/colors";

export default function HistoryScreen() {
  const [reports, setReports] = useState<LocalBugReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    bugReportService
      .getHistory()
      .then(setReports)
      .finally(() => setLoading(false));
  }, []);

  const renderItem = useCallback(({ item }: { item: LocalBugReport }) => {
    const statusColor = getBugReportStatusColor(item.status);
    const statusLabel = getBugReportStatusLabel(item.status);
    const date = new Date(item.created_at);
    const dateStr = date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    return (
      <Pressable style={styles.card}>
        <View style={[styles.statusBar, { backgroundColor: statusColor }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <Text style={styles.screenName} numberOfLines={1}>
              {item.screen_name}
            </Text>
            <View
              style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}
            >
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
          </View>

          {item.text_description ? (
            <Text style={styles.description} numberOfLines={2}>
              {item.text_description}
            </Text>
          ) : null}

          <View style={styles.meta}>
            {item.category ? (
              <View style={styles.categoryChip}>
                <Text style={styles.categoryText}>
                  {item.category.toUpperCase()}
                </Text>
              </View>
            ) : null}
            <Text style={styles.date}>{dateStr}</Text>
            {item.attachments.length > 0 && (
              <View style={styles.attachmentBadge}>
                <MaterialIcons name="attach-file" size={14} color="#9CA3AF" />
                <Text style={styles.attachmentCount}>
                  {item.attachments.length}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  }, []);

  if (loading) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Loading...</Text>
      </View>
    );
  }

  if (reports.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialIcons name="inbox" size={48} color="#D1D5DB" />
        <Text style={styles.emptyTitle}>No Reports Yet</Text>
        <Text style={styles.emptyText}>
          Reports you submit will appear here
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={reports}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      style={styles.container}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  list: {
    padding: 16,
    gap: 12,
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    marginBottom: 12,
  },
  statusBar: {
    width: 4,
  },
  cardBody: {
    flex: 1,
    padding: 14,
    gap: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  screenName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  description: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  categoryChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#F3F4F6",
  },
  categoryText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#6B7280",
    letterSpacing: 0.5,
  },
  date: {
    fontSize: 12,
    color: "#9CA3AF",
    flex: 1,
  },
  attachmentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  attachmentCount: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#374151",
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
  },
});
