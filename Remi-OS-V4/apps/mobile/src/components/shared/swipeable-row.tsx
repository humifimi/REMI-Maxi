import { useRef } from "react";
import { Animated, StyleSheet, Text, Pressable, View } from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { haptic } from "@technician/hooks/utility/use-haptics";

export interface SwipeAction {
  key: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
  color: string;
  onPress: () => void;
}

interface SwipeableRowProps {
  /** Actions revealed when swiping right (appear on the left side). */
  leftActions?: SwipeAction[];
  /** Actions revealed when swiping left (appear on the right side). */
  rightActions?: SwipeAction[];
  enabled?: boolean;
  children: React.ReactNode;
}

const ACTION_WIDTH = 72;

export function SwipeableRow({
  leftActions = [],
  rightActions = [],
  enabled = true,
  children,
}: SwipeableRowProps) {
  const swipeableRef = useRef<Swipeable>(null);

  const close = () => swipeableRef.current?.close();

  const handleAction = (action: SwipeAction) => {
    haptic.light();
    close();
    action.onPress();
  };

  const renderLeftActions = (
    progress: Animated.AnimatedInterpolation<number>,
  ) => (
    <View style={styles.actionsLeft}>
      {leftActions.map((action, index) => {
        const trans = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [-(ACTION_WIDTH * (leftActions.length - index)), 0],
          extrapolate: "clamp",
        });
        return (
          <Animated.View
            key={action.key}
            style={[styles.actionSlot, { transform: [{ translateX: trans }] }]}
          >
            <Pressable
              style={[styles.action, { backgroundColor: action.color }]}
              onPress={() => handleAction(action)}
            >
              <MaterialIcons name={action.icon} size={22} color="#fff" />
              <Text style={styles.actionLabel}>{action.label}</Text>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
  ) => (
    <View style={styles.actionsRight}>
      {rightActions.map((action, index) => {
        const trans = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [ACTION_WIDTH * (index + 1), 0],
          extrapolate: "clamp",
        });
        return (
          <Animated.View
            key={action.key}
            style={[styles.actionSlot, { transform: [{ translateX: trans }] }]}
          >
            <Pressable
              style={[styles.action, { backgroundColor: action.color }]}
              onPress={() => handleAction(action)}
            >
              <MaterialIcons name={action.icon} size={22} color="#fff" />
              <Text style={styles.actionLabel}>{action.label}</Text>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );

  return (
    <View style={styles.wrapper}>
      <Swipeable
        ref={swipeableRef}
        friction={2}
        leftThreshold={40}
        rightThreshold={40}
        overshootLeft={false}
        overshootRight={false}
        enabled={enabled}
        renderLeftActions={
          leftActions.length > 0 ? renderLeftActions : undefined
        }
        renderRightActions={
          rightActions.length > 0 ? renderRightActions : undefined
        }
      >
        {children}
      </Swipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: "hidden",
  },
  actionsLeft: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  actionsRight: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  actionSlot: {
    width: ACTION_WIDTH,
  },
  action: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 4,
    minHeight: 44,
  },
  actionLabel: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
});
