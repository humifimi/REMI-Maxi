import { StyleSheet, View, Text, type StyleProp, type ViewStyle } from "react-native";
import type { ServiceHistoryDisplayRecord } from "@technician/types/api";
import {
  categorizeCarfaxRecord,
  type CarfaxRecordPillSpec,
} from "@technician/utils/carfax-record-category";

type Size = "sm" | "md";

interface CarfaxCategoryPillProps {
  record: ServiceHistoryDisplayRecord;
  /**
   * `sm` for the dense paginated list rows; `md` for the detail screen
   * header. Defaults to `md` to match the original PR #76 pill size.
   */
  size?: Size;
  /**
   * Style applied to the outer wrapping container that holds the pill
   * stack. List rows use this to pin the cluster against the chevron;
   * the detail header lets it hang off the right edge of the row.
   */
  style?: StyleProp<ViewStyle>;
}

/**
 * Single source of truth for the CARFAX record pill cluster. List rows
 * on the customer detail and job briefing screens render this with
 * `size="sm"`; the per-record detail screen header renders it with
 * `size="md"`. A single record can resolve to multiple categories
 * (e.g. Title + Registration + Ownership for a DMV-style entry), so
 * the component renders one pill per `CarfaxRecordPillSpec` returned
 * by `categorizeCarfaxRecord`, wrapping onto multiple lines when the
 * row gets too narrow to fit them horizontally.
 */
export function CarfaxCategoryPill({
  record,
  size = "md",
  style,
}: CarfaxCategoryPillProps) {
  const specs = categorizeCarfaxRecord(record);
  const sizeStyles = size === "sm" ? smStyles : mdStyles;

  return (
    <View
      style={[styles.stack, style]}
      accessibilityRole="text"
      accessibilityLabel={`Categories: ${specs.map((s) => s.label).join(", ")}`}
    >
      {specs.map((spec) => (
        <CategoryPill key={spec.category} spec={spec} sizeStyles={sizeStyles} />
      ))}
    </View>
  );
}

function CategoryPill({
  spec,
  sizeStyles,
}: {
  spec: CarfaxRecordPillSpec;
  sizeStyles: typeof smStyles | typeof mdStyles;
}) {
  return (
    <View
      style={[
        styles.pill,
        sizeStyles.pill,
        {
          backgroundColor: spec.bgColor,
          borderColor: spec.borderColor ?? spec.textColor,
        },
      ]}
    >
      <Text
        style={[styles.label, sizeStyles.label, { color: spec.textColor }]}
        numberOfLines={1}
      >
        {spec.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "flex-end",
    gap: 4,
    flexShrink: 1,
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  label: {
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});

const mdStyles = StyleSheet.create({
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  label: {
    fontSize: 11,
  },
});

const smStyles = StyleSheet.create({
  pill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  label: {
    fontSize: 10,
  },
});
