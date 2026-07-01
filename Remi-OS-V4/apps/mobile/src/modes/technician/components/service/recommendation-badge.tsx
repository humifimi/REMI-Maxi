import { useState, useEffect, useRef } from "react";
import { StyleSheet, View, Text, Pressable, Animated } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type { ManufacturerRecommendation } from "@technician/types/api";

interface RecommendationBadgeProps {
  recommendation: ManufacturerRecommendation;
  onInspect?: (recId: number) => void;
}

function isDue(rec: ManufacturerRecommendation): boolean {
  if (rec.next_due_date) {
    return new Date(rec.next_due_date) <= new Date();
  }
  return false;
}

function isComingSoon(rec: ManufacturerRecommendation): boolean {
  if (rec.next_due_date) {
    const diff = new Date(rec.next_due_date).getTime() - Date.now();
    return diff > 0 && diff < 60 * 24 * 60 * 60 * 1000;
  }
  return false;
}

function getStatusColor(rec: ManufacturerRecommendation) {
  if (isDue(rec)) return { text: "#EF4444", bg: "#FEE2E2", border: "#FECACA", label: "Due Now" };
  if (isComingSoon(rec)) return { text: "#F97316", bg: "#FFF7ED", border: "#FED7AA", label: "Coming Soon" };
  return { text: "#22C55E", bg: "#F0FDF4", border: "#BBF7D0", label: "On Track" };
}

const RESULT_LABELS: Record<string, string> = {
  not_checked: "Not Checked",
  checked_ok: "Checked — OK",
  replaced: "Replaced",
};

export function RecommendationBadge({ recommendation, onInspect }: RecommendationBadgeProps) {
  const [expanded, setExpanded] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const status = getStatusColor(recommendation);
  const due = isDue(recommendation);

  useEffect(() => {
    if (!due) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [due, pulseAnim]);

  return (
    <Pressable
      style={[styles.card, { borderColor: status.border, backgroundColor: status.bg }]}
      onPress={() => {
        haptic.light();
        setExpanded(!expanded);
      }}
    >
      <View style={styles.row}>
        <Animated.View style={{ opacity: due ? pulseAnim : 1 }}>
          <MaterialIcons
            name={due ? "error" : isComingSoon(recommendation) ? "schedule" : "check-circle"}
            size={22}
            color={status.text}
          />
        </Animated.View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.component, { color: status.text }]}>
            {recommendation.component}
          </Text>
          <Text style={styles.source}>
            {recommendation.source === "carfax_oem" ? "Carfax OEM" : "Manual"} —{" "}
            {status.label}
          </Text>
        </View>
        <MaterialIcons
          name={expanded ? "expand-less" : "expand-more"}
          size={20}
          color="#6B7280"
        />
      </View>

      {expanded && (
        <View style={styles.details}>
          {recommendation.interval_miles && (
            <Text style={styles.detailText}>
              Every {recommendation.interval_miles.toLocaleString()} miles
            </Text>
          )}
          {recommendation.interval_months && (
            <Text style={styles.detailText}>
              Every {recommendation.interval_months} months
            </Text>
          )}
          {recommendation.next_due_date && (
            <Text style={styles.detailText}>
              Next due: {new Date(recommendation.next_due_date).toLocaleDateString()}
            </Text>
          )}
          <Text style={styles.detailText}>
            Last result: {RESULT_LABELS[recommendation.last_checked_result] ?? "Unknown"}
          </Text>

          {onInspect && (
            <View style={styles.inspectRow}>
              <Pressable
                style={styles.inspectBtn}
                onPress={() => {
                  haptic.medium();
                  onInspect(recommendation.id);
                }}
              >
                <MaterialIcons name="check-circle" size={16} color="#fff" />
                <Text style={styles.inspectText}>Log Inspection</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  component: { fontSize: 14, fontWeight: "700" },
  source: { fontSize: 11, color: "#6B7280", marginTop: 1 },
  details: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
    gap: 4,
  },
  detailText: { fontSize: 13, color: "#374151" },
  inspectRow: { marginTop: 8 },
  inspectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#3B82F6",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  inspectText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
