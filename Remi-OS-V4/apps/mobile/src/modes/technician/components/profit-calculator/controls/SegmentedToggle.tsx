import { Pressable, StyleSheet, Text, View } from "react-native";

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  label?: string;
  value: T;
  options: Option<T>[];
  onChange: (next: T) => void;
};

export function SegmentedToggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: Props<T>) {
  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              style={[styles.btn, active && styles.btnActive]}
              hitSlop={4}
            >
              <Text style={[styles.btnText, active && styles.btnTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    padding: 3,
  },
  btn: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  btnActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  btnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  btnTextActive: {
    color: "#111827",
  },
});
