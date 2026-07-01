import { useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { GLOSSARY } from "@profit-model/glossary";
import { GlossarySheet } from "./glossary-sheet";

// PM-MIG-19 — Tap target rendered next to KPI labels, severity flags, and
// major input section headings. Looks up the entry by stable glossary key
// (see vendor/profit-model/glossary.ts), opens a slide-up sheet on tap.
//
// Renders nothing when the key is unknown so a typo doesn't leave a dead
// button on the screen — surfaces an empty space at most. Pair with the
// engine's `result.info_keys.*` map to keep keys honest.

type Props = {
  glossaryKey: string;
  size?: number;
  color?: string;
};

export function InfoIcon({ glossaryKey, size = 14, color = "#9CA3AF" }: Props) {
  const [open, setOpen] = useState(false);
  const entry = GLOSSARY[glossaryKey];
  if (!entry) return null;
  return (
    <>
      <Pressable
        hitSlop={10}
        onPress={() => setOpen(true)}
        style={styles.btn}
        accessibilityRole="button"
        accessibilityLabel={`Learn about ${entry.label}`}
      >
        <MaterialIcons name="info-outline" size={size} color={color} />
      </Pressable>
      {open ? (
        <GlossarySheet entry={entry} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: "center",
    justifyContent: "center",
  },
});
