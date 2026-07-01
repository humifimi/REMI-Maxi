import { useCallback } from "react";
import { StyleSheet, View, Text, Pressable, Linking } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ResourceLink } from "@technician/types/wellness";

// Material icon name for a given pill. Uses the optional `icon` from the
// backend if present, falls back to a heuristic on the link title (phone /
// feedback / external), and finally to the generic "open" icon.
function iconFor(link: ResourceLink): React.ComponentProps<
  typeof MaterialIcons
>["name"] {
  if (link.icon) return link.icon as never;
  const title = link.title.toLowerCase();
  if (title.includes("talk") || link.url.startsWith("tel:")) return "phone";
  if (title.includes("feedback")) return "feedback";
  if (title.includes("text") || link.url.startsWith("sms:")) return "sms";
  return "open-in-new";
}

interface ResourcePillsProps {
  links: ResourceLink[];
  // Pill tint — defaults to violet for the standard wellness card. Pass the
  // mood color when rendering inside a tone-specific container so the pill
  // colors stay coherent with the surrounding card.
  tint?: string;
  surface?: string;
  border?: string;
  onLinkPress?: (link: ResourceLink) => void;
}

export function ResourcePills({
  links,
  tint = "#7C3AED",
  surface = "#F5F3FF",
  border = "#DDD6FE",
  onLinkPress,
}: ResourcePillsProps) {
  const handlePress = useCallback(
    (link: ResourceLink) => {
      onLinkPress?.(link);
      if (link.url) {
        Linking.openURL(link.url).catch(() => {});
      }
    },
    [onLinkPress],
  );

  if (!links || links.length === 0) return null;

  return (
    <View style={styles.row}>
      {links.map((link) => (
        <Pressable
          key={`${link.title}-${link.url}`}
          style={[
            styles.pill,
            { backgroundColor: surface, borderColor: border },
          ]}
          onPress={() => handlePress(link)}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={link.title}
        >
          <MaterialIcons name={iconFor(link)} size={14} color={tint} />
          <Text style={[styles.text, { color: tint }]} numberOfLines={1}>
            {link.title}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 44,
  },
  text: {
    fontSize: 13,
    fontWeight: "600",
  },
});
