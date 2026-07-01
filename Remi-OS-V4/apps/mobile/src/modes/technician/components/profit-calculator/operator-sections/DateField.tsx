import { createElement } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";

// Tier 1 fallback — `@react-native-community/datetimepicker` is intentionally
// not installed yet (would require a fresh EAS build to autolink). On web we
// reach into React.createElement so React Native Web doesn't strip the native
// `<input type="date">` widget; on native we render a plain text input with
// the ISO format hinted in the placeholder. Once we adopt the picker package
// the native branch can swap to a modal sheet without touching call sites.

type Props = {
  label: string;
  value: string;
  onChange: (next: string) => void;
};

const ISO_FORMAT = "YYYY-MM-DD";
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function DateField({ label, value, onChange }: Props) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {Platform.OS === "web"
        ? createElement("input", {
            type: "date",
            value: value ?? "",
            onChange: (e: { target: { value: string } }) =>
              onChange(e.target.value),
            style: webInputStyle,
          })
        : (
            <TextInput
              style={styles.nativeInput}
              value={value}
              placeholder={ISO_FORMAT}
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              onChangeText={(raw) => {
                // Accept partial typing; only commit valid ISO dates so the
                // engine never sees a malformed `start_date`/`end_date`.
                if (raw === "" || ISO_RE.test(raw)) {
                  onChange(raw);
                }
              }}
            />
          )}
    </View>
  );
}

const webInputStyle = {
  width: "100%",
  height: 44,
  borderWidth: 1,
  borderColor: "#E5E7EB",
  borderRadius: 10,
  paddingLeft: 12,
  paddingRight: 12,
  fontSize: 16,
  color: "#111827",
  backgroundColor: "#F9FAFB",
  boxSizing: "border-box",
} as unknown as Record<string, unknown>;

const styles = StyleSheet.create({
  field: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  nativeInput: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 44,
    fontSize: 16,
    color: "#111827",
    fontVariant: ["tabular-nums"],
  },
});
