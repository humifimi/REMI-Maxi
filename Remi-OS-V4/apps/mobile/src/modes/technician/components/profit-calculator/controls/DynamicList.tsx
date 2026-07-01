import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

type Props<T> = {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  onAdd: () => void;
  onRemove: (index: number) => void;
  addLabel?: string;
  emptyHint?: string;
  minItems?: number;
};

export function DynamicList<T>({
  items,
  renderItem,
  onAdd,
  onRemove,
  addLabel = "Add",
  emptyHint,
  minItems = 0,
}: Props<T>) {
  return (
    <View style={styles.container}>
      {items.length === 0 && emptyHint ? (
        <Text style={styles.emptyHint}>{emptyHint}</Text>
      ) : null}

      {items.map((item, index) => (
        <View key={index} style={styles.row}>
          <View style={styles.rowBody}>{renderItem(item, index)}</View>
          {items.length > minItems ? (
            <Pressable
              style={styles.removeBtn}
              onPress={() => onRemove(index)}
              hitSlop={8}
            >
              <MaterialIcons name="remove-circle-outline" size={22} color="#EF4444" />
            </Pressable>
          ) : null}
        </View>
      ))}

      <Pressable style={styles.addBtn} onPress={onAdd} hitSlop={8}>
        <MaterialIcons name="add-circle-outline" size={20} color="#3B82F6" />
        <Text style={styles.addText}>{addLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  emptyHint: {
    fontSize: 13,
    color: "#9CA3AF",
    fontStyle: "italic",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  rowBody: {
    flex: 1,
  },
  removeBtn: {
    paddingTop: 8,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    backgroundColor: "#EFF6FF",
    alignSelf: "flex-start",
  },
  addText: {
    color: "#3B82F6",
    fontSize: 14,
    fontWeight: "600",
  },
});
