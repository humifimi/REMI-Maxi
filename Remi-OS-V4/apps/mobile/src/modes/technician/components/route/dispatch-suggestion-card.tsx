import { useState } from "react";
import { StyleSheet, View, Text, Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ScoredSuggestion } from "@technician/types/api";

interface DispatchSuggestionCardProps {
  suggestions: ScoredSuggestion[];
  onConfirm: (suggestion: ScoredSuggestion) => void;
  onDismiss: () => void;
}

function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

export function DispatchSuggestionCard({
  suggestions,
  onConfirm,
  onDismiss,
}: DispatchSuggestionCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (suggestions.length === 0) return null;

  const visibleSuggestions = expanded ? suggestions : [suggestions[0]];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialIcons name="auto-fix-high" size={20} color="#3B82F6" />
          <Text style={styles.title}>Route Suggestion</Text>
        </View>
        <Pressable onPress={onDismiss} hitSlop={8}>
          <MaterialIcons name="close" size={22} color="#6B7280" />
        </Pressable>
      </View>

      {visibleSuggestions.map((suggestion, idx) => (
        <View
          key={`${suggestion.technicianId}-${suggestion.date}-${suggestion.timeSlot}`}
          style={[styles.suggestionCard, idx === 0 && styles.bestCard]}
        >
          {idx === 0 && (
            <View style={styles.bestBadge}>
              <Text style={styles.bestBadgeText}>Best Fit</Text>
            </View>
          )}

          <Text style={styles.techName}>{suggestion.technicianName}</Text>

          <View style={styles.detailRow}>
            <MaterialIcons name="schedule" size={14} color="#6B7280" />
            <Text style={styles.detailText}>
              {suggestion.date} at {suggestion.timeSlot}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <MaterialIcons name="route" size={14} color="#6B7280" />
            <Text style={styles.detailText}>
              Position {suggestion.insertionPosition} in route
            </Text>
          </View>

          <View style={styles.detailRow}>
            <MaterialIcons name="directions-car" size={14} color="#6B7280" />
            <Text style={styles.detailText}>
              +{Math.round(suggestion.estimatedDriveMinutes)} min drive
            </Text>
          </View>

          <Text style={styles.explanation}>{suggestion.explanation}</Text>

          <View style={styles.scoreRow}>
            <Text style={styles.scoreLabel}>Match Score</Text>
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreText}>
                {formatScore(suggestion.score)}
              </Text>
            </View>
          </View>

          <Pressable
            style={styles.confirmButton}
            onPress={() => onConfirm(suggestion)}
          >
            <MaterialIcons name="add-circle-outline" size={16} color="#fff" />
            <Text style={styles.confirmText}>Add to Route</Text>
          </Pressable>
        </View>
      ))}

      {suggestions.length > 1 && !expanded && (
        <Pressable
          style={styles.expandButton}
          onPress={() => setExpanded(true)}
        >
          <Text style={styles.expandText}>
            See {suggestions.length - 1} more option
            {suggestions.length > 2 ? "s" : ""}
          </Text>
          <MaterialIcons name="expand-more" size={18} color="#3B82F6" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  suggestionCard: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  bestCard: {
    borderColor: "#3B82F6",
    backgroundColor: "#EFF6FF",
  },
  bestBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#3B82F6",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 8,
  },
  bestBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  techName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  detailText: {
    fontSize: 13,
    color: "#4B5563",
  },
  explanation: {
    fontSize: 13,
    color: "#6B7280",
    fontStyle: "italic",
    marginTop: 6,
    marginBottom: 8,
    lineHeight: 18,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  scoreLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  scoreBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  scoreText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#16A34A",
  },
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3B82F6",
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  confirmText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  expandButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 4,
  },
  expandText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3B82F6",
  },
});
