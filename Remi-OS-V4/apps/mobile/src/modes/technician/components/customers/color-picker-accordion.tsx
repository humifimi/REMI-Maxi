import { View, Text, Pressable, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useState } from "react";
import { VEHICLE_COLORS } from "@technician/constants/vehicle-colors";

interface ColorPickerAccordionProps {
  selectedColor: string | null;
  onSelect: (color: string | null) => void;
}

export function ColorPickerAccordion({ selectedColor, onSelect }: ColorPickerAccordionProps) {
  const [expanded, setExpanded] = useState(false);

  const selectedEntry = selectedColor
    ? VEHICLE_COLORS.find((c) => c.value === selectedColor)
    : null;

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.accordionHeader}
        onPress={() => setExpanded((p) => !p)}
      >
        <View style={styles.accordionHeaderLeft}>
          <Text style={styles.sectionTitle}>Vehicle Color</Text>
          {selectedEntry && (
            <View style={styles.selectedPreview}>
              <View style={[styles.dot, { backgroundColor: selectedEntry.hex }]} />
              <Text style={styles.selectedLabel}>{selectedEntry.label}</Text>
            </View>
          )}
          {!selectedEntry && (
            <Text style={styles.noneLabel}>None selected</Text>
          )}
        </View>
        <MaterialIcons
          name={expanded ? "expand-less" : "expand-more"}
          size={22}
          color="#6B7280"
        />
      </Pressable>

      {expanded && (
        <View style={styles.colorGrid}>
          {VEHICLE_COLORS.map((color) => (
            <Pressable
              key={color.value}
              style={[
                styles.colorOption,
                selectedColor === color.value && styles.colorOptionSelected,
              ]}
              onPress={() => onSelect(color.value)}
            >
              <View
                style={[
                  styles.dot,
                  { backgroundColor: color.hex },
                  color.hex === "#FFFFFF" && styles.dotBorder,
                ]}
              />
              <Text
                style={[
                  styles.colorText,
                  selectedColor === color.value && styles.colorTextSelected,
                ]}
              >
                {color.label}
              </Text>
              {selectedColor === color.value && (
                <MaterialIcons name="check" size={16} color="#3B82F6" />
              )}
            </Pressable>
          ))}
          {selectedColor && (
            <Pressable style={styles.clearButton} onPress={() => onSelect(null)}>
              <MaterialIcons name="clear" size={14} color="#EF4444" />
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  accordionHeaderLeft: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  selectedPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  selectedLabel: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "500",
  },
  noneLabel: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 2,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 8,
  },
  colorOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  colorOptionSelected: {
    borderColor: "#3B82F6",
    backgroundColor: "#EFF6FF",
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  dotBorder: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  colorText: {
    fontSize: 13,
    color: "#374151",
  },
  colorTextSelected: {
    color: "#3B82F6",
    fontWeight: "600",
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FEE2E2",
    backgroundColor: "#FEF2F2",
  },
  clearText: {
    fontSize: 13,
    color: "#EF4444",
    fontWeight: "500",
  },
});
