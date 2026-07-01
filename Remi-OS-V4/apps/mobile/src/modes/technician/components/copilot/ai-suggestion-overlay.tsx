import { useState, useCallback, useRef, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Animated,
  PanResponder,
  Dimensions,
  Alert,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type {
  CopilotSuggestion,
  CopilotObservation,
  CopilotUpsellItem,
} from "@technician/types/copilot";

const SCREEN_WIDTH = Dimensions.get("window").width;
const DISMISS_THRESHOLD = SCREEN_WIDTH * 0.3;
const FIRST_CARD_DELAY_MS = 4000;
const STAGGER_INTERVAL_MS = 12000;
const SLIDE_UP_PX = 100;
const MAX_VISIBLE_CARDS = 2;

const SOURCE_ICONS: Record<CopilotObservation["source"], keyof typeof MaterialIcons.glyphMap> = {
  mileage: "speed",
  history: "history",
  seasonal: "wb-sunny",
  recall: "warning",
  general: "lightbulb",
};

const PRIORITY_BORDER: Record<string, string> = {
  high: "#EF4444",
  medium: "#F59E0B",
  low: "#8B5CF6",
};

interface AISuggestionOverlayProps {
  suggestions: CopilotSuggestion[];
  onAddToOrder?: (item: CopilotUpsellItem) => void;
}

export function AISuggestionOverlay({
  suggestions,
  onAddToOrder,
}: AISuggestionOverlayProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [revealedCount, setRevealedCount] = useState(0);
  const totalSuggestions = suggestions.length;

  useEffect(() => {
    if (totalSuggestions === 0) return;

    const firstTimer = setTimeout(() => {
      setRevealedCount(1);
    }, FIRST_CARD_DELAY_MS);

    return () => clearTimeout(firstTimer);
  }, [totalSuggestions]);

  useEffect(() => {
    if (revealedCount === 0 || revealedCount >= totalSuggestions) return;

    const timer = setTimeout(() => {
      setRevealedCount((prev) => prev + 1);
    }, STAGGER_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [revealedCount, totalSuggestions]);

  const handleDismiss = useCallback((id: string) => {
    haptic.light();
    setDismissed((prev) => new Set(prev).add(id));
  }, []);

  const handleAdd = useCallback(
    (item: CopilotUpsellItem) => {
      haptic.medium();
      if (!item.in_stock) {
        Alert.alert(
          "Out of Stock",
          `${item.part_name} is currently unavailable in your van.`,
        );
        return;
      }
      onAddToOrder?.(item);
      handleDismiss(item.id);
    },
    [onAddToOrder, handleDismiss],
  );

  const cards = suggestions
    .slice(0, revealedCount)
    .filter((s) => !dismissed.has(s.id))
    .slice(0, MAX_VISIBLE_CARDS);

  if (cards.length === 0) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {cards.map((suggestion) => (
        <SlideUpCard
          key={suggestion.id}
          suggestion={suggestion}
          onDismiss={() => handleDismiss(suggestion.id)}
          onAdd={
            suggestion.type === "upsell"
              ? () => handleAdd(suggestion as CopilotUpsellItem)
              : undefined
          }
        />
      ))}
    </View>
  );
}

function SlideUpCard({
  suggestion,
  onDismiss,
  onAdd,
}: {
  suggestion: CopilotSuggestion;
  onDismiss: () => void;
  onAdd?: () => void;
}) {
  const panX = useRef(new Animated.Value(0)).current;
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [anim]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10,
      onPanResponderMove: Animated.event([null, { dx: panX }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) > DISMISS_THRESHOLD) {
          Animated.timing(panX, {
            toValue: g.dx > 0 ? SCREEN_WIDTH : -SCREEN_WIDTH,
            duration: 200,
            useNativeDriver: true,
          }).start(onDismiss);
        } else {
          Animated.spring(panX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 10,
          }).start();
        }
      },
    }),
  ).current;

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [SLIDE_UP_PX, 0],
  });

  const borderColor = PRIORITY_BORDER[suggestion.priority] ?? "#8B5CF6";
  const isUpsell = suggestion.type === "upsell";
  const upsell = isUpsell ? (suggestion as CopilotUpsellItem) : null;
  const obs = !isUpsell ? (suggestion as CopilotObservation) : null;

  return (
    <Animated.View
      style={[
        styles.card,
        {
          borderLeftColor: borderColor,
          opacity: anim,
          transform: [{ translateX: panX }, { translateY }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <View style={styles.cardHeader}>
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: isUpsell ? "#EDE9FE" : "#DBEAFE" },
          ]}
        >
          <MaterialIcons
            name={isUpsell ? "sell" : SOURCE_ICONS[obs?.source ?? "general"]}
            size={16}
            color={isUpsell ? "#7C3AED" : "#3B82F6"}
          />
        </View>
        <Text style={styles.cardLabel}>
          {isUpsell ? "Upsell Opportunity" : "AI Insight"}
        </Text>
        <Pressable
          style={styles.dismissBtn}
          onPress={onDismiss}
          hitSlop={12}
        >
          <MaterialIcons name="close" size={18} color="#9CA3AF" />
        </Pressable>
      </View>

      <Text style={styles.cardText}>{suggestion.text}</Text>

      {upsell && (
        <>
          <View style={styles.upsellMeta}>
            <Text style={styles.partName}>{upsell.part_name}</Text>
            <Text style={styles.price}>${upsell.price.toFixed(2)}</Text>
            <View
              style={[
                styles.stockPill,
                upsell.in_stock ? styles.stockInPill : styles.stockOutPill,
              ]}
            >
              <MaterialIcons
                name={upsell.in_stock ? "check-circle" : "cancel"}
                size={12}
                color={upsell.in_stock ? "#16A34A" : "#DC2626"}
              />
              <Text
                style={[
                  styles.stockText,
                  upsell.in_stock ? styles.stockInText : styles.stockOutText,
                ]}
              >
                {upsell.in_stock
                  ? `${upsell.stock_quantity ?? ""} in van`
                  : "Out of stock"}
              </Text>
            </View>
          </View>

          <View style={styles.talkingPointBox}>
            <MaterialIcons
              name="record-voice-over"
              size={14}
              color="#6B7280"
            />
            <Text style={styles.talkingPointText}>
              {upsell.talking_point}
            </Text>
          </View>

          {onAdd && (
            <Pressable
              style={[
                styles.addBtn,
                !upsell.in_stock && styles.addBtnDisabled,
              ]}
              onPress={onAdd}
              disabled={!upsell.in_stock}
            >
              <MaterialIcons
                name="add-circle"
                size={18}
                color={upsell.in_stock ? "#fff" : "#9CA3AF"}
              />
              <Text
                style={[
                  styles.addBtnText,
                  !upsell.in_stock && styles.addBtnTextDisabled,
                ]}
              >
                {upsell.in_stock ? "Add to Order" : "Unavailable"}
              </Text>
            </Pressable>
          )}
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    bottom: 100,
    left: 12,
    right: 12,
    gap: 8,
    zIndex: 50,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cardLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dismissBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  cardText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
    lineHeight: 20,
    marginBottom: 4,
  },
  upsellMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    flexWrap: "wrap",
  },
  partName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  price: {
    fontSize: 14,
    fontWeight: "800",
    color: "#7C3AED",
  },
  stockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  stockInPill: {
    backgroundColor: "#F0FDF4",
  },
  stockOutPill: {
    backgroundColor: "#FEF2F2",
  },
  stockText: {
    fontSize: 11,
    fontWeight: "600",
  },
  stockInText: {
    color: "#16A34A",
  },
  stockOutText: {
    color: "#DC2626",
  },
  talkingPointBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#F9FAFB",
    padding: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  talkingPointText: {
    flex: 1,
    fontSize: 13,
    color: "#374151",
    lineHeight: 18,
    fontStyle: "italic",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#7C3AED",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    marginTop: 10,
    minHeight: 44,
  },
  addBtnDisabled: {
    backgroundColor: "#F3F4F6",
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  addBtnTextDisabled: {
    color: "#9CA3AF",
  },
});
