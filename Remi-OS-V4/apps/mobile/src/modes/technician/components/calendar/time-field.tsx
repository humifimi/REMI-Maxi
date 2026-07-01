import { createElement, useCallback, useState } from "react";
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import dayjs from "dayjs";

import { IS_EXPO_GO } from "@technician/constants/runtime";

// 2026-04-21 — Native time-picker wrapper for calendar forms.
// Mirrors the Tier-1-fallback pattern in
// `src/components/profit-calculator/operator-sections/DateField.tsx`:
//   - Web      → HTML5 `<input type="time">` via `createElement` so
//                RN-Web doesn't strip the native widget.
//   - iOS      → `@react-native-community/datetimepicker` in "compact"
//                display (small chip that pops up a wheel picker —
//                fits inside a bottom sheet without dominating the layout).
//   - Android  → tap-to-open modal picker (only display mode with a
//                sensible tap target inside a sheet).
//   - Expo Go  → 2026-04-21 fallback: plain `<TextInput>` with HH:MM
//                placeholder. The picker package is not bundled in
//                Expo Go (custom native module → needs a dev build),
//                so rendering `<DateTimePicker>` would crash at the
//                bridge level. The fallback restores the pre-picker
//                UX and is lossy-but-not-broken: users type the
//                value freehand. The first non-Expo-Go build (any
//                `npx eas build` output, simulator builds, or a
//                production binary) restores the native picker
//                automatically — no code change required.
//
// EAS rebuild required: the picker package was added 2026-04-21 and
// must autolink into a fresh native build before runtime. The package
// is also registered as a config plugin via `expo install`.
//
// Contract: `value` and `onChange` deal in canonical `"HH:MM"` 24h
// strings — the exact shape consumed by `localToBackendISO` in
// `src/utils/datetime.ts`. Keeping the component's I/O in wall-clock
// strings (not `Date` objects) means we never accidentally bake the
// device timezone into a value that's about to be turned into a
// `timestamptz`. See `.cursor/rules/datetime-and-data-format-contracts.mdc`.

type Props = {
  label: string;
  value: string;
  onChange: (next: string) => void;
};

const HHMM_RE = /^\d{2}:\d{2}$/;

function hhmmToDate(value: string): Date {
  // Use today's calendar date as a carrier — the picker only reads
  // the time component. Anchoring to "today" (instead of e.g. epoch)
  // avoids edge cases around DST boundaries that some platforms hit
  // when the carrier date is in the distant past.
  const carrier = new Date();
  if (!HHMM_RE.test(value)) {
    carrier.setHours(9, 0, 0, 0);
    return carrier;
  }
  const [h, m] = value.split(":").map((v) => parseInt(v, 10));
  carrier.setHours(h, m, 0, 0);
  return carrier;
}

function dateToHhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDisplay(value: string): string {
  if (!HHMM_RE.test(value)) return value || "—";
  return dayjs(`2000-01-01T${value}`).format("h:mm A");
}

export function TimeField({ label, value, onChange }: Props) {
  const [androidPickerOpen, setAndroidPickerOpen] = useState(false);

  const handlePickerChange = useCallback(
    (e: DateTimePickerEvent, date?: Date) => {
      // Android fires both "set" and "dismissed"; iOS in compact mode
      // fires "set" continuously while the wheel scrolls. Either way,
      // ignore dismissals and only forward valid Date objects.
      if (Platform.OS === "android") setAndroidPickerOpen(false);
      if (e.type === "dismissed" || !date) return;
      onChange(dateToHhmm(date));
    },
    [onChange],
  );

  if (Platform.OS === "web") {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        {createElement("input", {
          type: "time",
          value: value ?? "",
          onChange: (ev: { target: { value: string } }) => onChange(ev.target.value),
          style: webInputStyle,
        })}
      </View>
    );
  }

  // Expo Go fallback (iOS + Android). See top-of-file note: rendering
  // `<DateTimePicker>` here would crash because the native module isn't
  // autolinked into the Expo Go binary.
  if (IS_EXPO_GO) {
    const isInvalid = value.length > 0 && !HHMM_RE.test(value);
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="HH:MM"
          placeholderTextColor="#9CA3AF"
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={5}
          style={[styles.expoGoInput, isInvalid && styles.expoGoInputInvalid]}
        />
        <Text style={styles.expoGoHint}>
          {isInvalid ? "Use 24h HH:MM (e.g. 09:30, 14:00)" : "Expo Go fallback — type as HH:MM"}
        </Text>
      </View>
    );
  }

  if (Platform.OS === "ios") {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.iosWrap}>
          <DateTimePicker
            mode="time"
            display="compact"
            value={hhmmToDate(value)}
            onChange={handlePickerChange}
            minuteInterval={5}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.androidBtn} onPress={() => setAndroidPickerOpen(true)}>
        <Text style={styles.androidBtnText}>{formatDisplay(value)}</Text>
      </TouchableOpacity>
      {androidPickerOpen && (
        <DateTimePicker
          mode="time"
          display="default"
          value={hhmmToDate(value)}
          onChange={handlePickerChange}
          minuteInterval={5}
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
  iosWrap: {
    minHeight: 44,
    justifyContent: "center",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  androidBtn: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: "center",
    marginBottom: 14,
  },
  androidBtnText: {
    fontSize: 16,
    color: "#111827",
    fontVariant: ["tabular-nums"],
  },
  expoGoInput: {
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
  expoGoInputInvalid: {
    borderColor: "#DC2626",
  },
  expoGoHint: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 4,
    marginBottom: 14,
  },
});
