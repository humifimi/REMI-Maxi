import { StyleSheet, View, Text } from "react-native";
import { SLOT_TYPE_COLORS } from "@technician/constants/calendar";
import { SlotTypeLabels } from "@technician/constants/colors";
import type { SlotType } from "@technician/types/enums";

interface SlotTypeIndicatorProps {
  slotType: SlotType;
  size?: "small" | "normal";
}

export function SlotTypeIndicator({
  slotType,
  size = "normal",
}: SlotTypeIndicatorProps) {
  const colors = SLOT_TYPE_COLORS[slotType] ?? SLOT_TYPE_COLORS.standard;
  const label = SlotTypeLabels[slotType] ?? slotType;
  const isSmall = size === "small";

  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: colors.bg, borderColor: colors.border },
        isSmall && styles.pillSmall,
      ]}
    >
      <Text
        style={[styles.text, { color: colors.text }, isSmall && styles.textSmall]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  pillSmall: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  text: {
    fontSize: 11,
    fontWeight: "700",
  },
  textSmall: {
    fontSize: 9,
  },
});
