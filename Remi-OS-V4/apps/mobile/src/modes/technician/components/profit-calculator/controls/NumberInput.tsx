import { useEffect, useState } from "react";
import {
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import type { DataSourceProvider } from "@profit-model/types";
import { InfoIcon } from "../info-icon";
import { SourceBadge } from "../source-badge";

type Props = Omit<
  TextInputProps,
  "onChange" | "onChangeText" | "value" | "keyboardType" | "style"
> & {
  label?: string;
  value: number;
  onChange: (next: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  hint?: string;
  style?: StyleProp<ViewStyle>;
  /**
   * PM-MIG-19 — Optional glossary key. When set, an info icon renders next to
   * the label and tapping it opens the glossary sheet. Use stable keys from
   * `vendor/profit-model/glossary.ts`.
   */
  glossaryKey?: string;
  /**
   * PM-MIG-19 — Provenance source for this field's value. Defaults to
   * undefined (no badge); pass "manual" or a provider name to render the
   * pill. Phase 5 will source this from `inputs.provenance?.[fieldPath]`.
   */
  sourceProvider?: DataSourceProvider;
};

export function NumberInput({
  label,
  value,
  onChange,
  prefix,
  suffix,
  min,
  max,
  decimals = 0,
  hint,
  style,
  glossaryKey,
  sourceProvider,
  ...rest
}: Props) {
  const [text, setText] = useState(formatValue(value, decimals));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(formatValue(value, decimals));
    }
  }, [value, focused, decimals]);

  const handleChange = (raw: string) => {
    const cleaned = raw.replace(/[^0-9.\-]/g, "");
    setText(cleaned);
    if (cleaned === "" || cleaned === "-" || cleaned === ".") {
      return;
    }
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) return;
    let next = parsed;
    if (typeof min === "number" && next < min) next = min;
    if (typeof max === "number" && next > max) next = max;
    onChange(next);
  };

  const handleBlur = () => {
    setFocused(false);
    setText(formatValue(value, decimals));
  };

  const outOfRange =
    (typeof min === "number" && value < min) ||
    (typeof max === "number" && value > max);

  const hasLabelAdornments = !!glossaryKey || !!sourceProvider;

  return (
    <View style={style}>
      {label ? (
        hasLabelAdornments ? (
          <View style={styles.labelRow}>
            <Text style={styles.label}>{label}</Text>
            {glossaryKey ? <InfoIcon glossaryKey={glossaryKey} /> : null}
            {sourceProvider ? (
              <View style={styles.labelSpacer}>
                <SourceBadge provider={sourceProvider} />
              </View>
            ) : null}
          </View>
        ) : (
          <Text style={styles.label}>{label}</Text>
        )
      ) : null}
      <View style={[styles.row, outOfRange && styles.rowError]}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          {...rest}
          style={styles.input}
          keyboardType="decimal-pad"
          value={text}
          onChangeText={handleChange}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={handleBlur}
          placeholderTextColor="#9CA3AF"
          selectTextOnFocus
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function formatValue(n: number, decimals: number): string {
  if (!Number.isFinite(n)) return "";
  if (decimals === 0) return String(Math.round(n));
  return n.toFixed(decimals);
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
    flexWrap: "wrap",
  },
  labelSpacer: {
    marginLeft: "auto",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  rowError: {
    borderColor: "#EF4444",
    backgroundColor: "#FEF2F2",
  },
  prefix: {
    color: "#6B7280",
    fontSize: 16,
    fontWeight: "500",
    marginRight: 6,
  },
  suffix: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 6,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#111827",
    textAlign: "right",
    paddingVertical: 8,
    fontVariant: ["tabular-nums"],
  },
  hint: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 4,
  },
});
