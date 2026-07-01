import { memo, useMemo } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

interface TechAvatarChipProps {
  name: string;
  /** Resolved image URL. Falls back to initials when missing. */
  imageUrl?: string | null;
  /**
   * Brand/route color used for the avatar ring + selected state. Defaults to
   * the calendar's teal so this matches the existing avatar look when no
   * route color is provided.
   */
  color?: string;
  /**
   * Whether this chip is in the "selected" set. When `isFiltered` is also
   * true, unselected chips render dimmed.
   */
  isSelected?: boolean;
  /**
   * Whether any selection is active in the parent. When false, no chip is
   * dimmed (everything reads as "all selected"). When true, chips that are
   * not selected fade to the dim opacity.
   */
  isFiltered?: boolean;
  /** Tap handler — used as a single-tap toggle by the parent. */
  onPress?: () => void;
  /** Optional double-tap (e.g. focus this tech only). */
  onLongPress?: () => void;
  /** Show the name to the right of the avatar (legend style). Defaults true. */
  showName?: boolean;
  size?: number;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const TechAvatarChip = memo(function TechAvatarChip({
  name,
  imageUrl,
  color = "#3B82F6",
  isSelected = false,
  isFiltered = false,
  onPress,
  onLongPress,
  showName = true,
  size = 28,
}: TechAvatarChipProps) {
  const dim = isFiltered && !isSelected;
  const initials = useMemo(() => getInitials(name), [name]);
  // P2-FE-4 follow-up #13 (2026-04-20): when an unlabeled chip
  // (avatar-strip / portrait header use case) is selected, the
  // surrounding pill becomes the tech color instead of white. The thin
  // colored ring on the avatar circle inverts to white so it still
  // creates a visible separation from the photo. Labeled chips
  // (`showName: true`, used by the route map legend) keep the
  // historical white pill with a colored ring around the avatar so the
  // colored name text stays readable against a neutral background.
  const isPillColored = isFiltered && isSelected && !showName;
  const ringColor = isPillColored
    ? "#FFFFFF"
    : isFiltered && isSelected
      ? color
      : "#E5E7EB";
  const ringWidth = isFiltered && isSelected ? 2 : 1;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.container,
        showName && styles.containerWithName,
        isFiltered && isSelected && styles.containerSelected,
        isPillColored && { backgroundColor: color },
        { opacity: dim ? 0.4 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] },
      ]}
    >
      <View
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: ringColor,
            borderWidth: ringWidth,
            backgroundColor: imageUrl ? "transparent" : color + "33",
          },
        ]}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
            resizeMode="cover"
          />
        ) : (
          <Text
            style={[
              styles.initials,
              { color, fontSize: Math.max(10, Math.round(size * 0.4)) },
            ]}
            allowFontScaling={false}
          >
            {initials}
          </Text>
        )}
      </View>
      {showName ? (
        <Text
          style={[
            styles.name,
            isFiltered && isSelected && { color: color },
          ]}
          numberOfLines={1}
        >
          {name}
        </Text>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 18,
    gap: 6,
  },
  containerWithName: {
    paddingRight: 10,
    backgroundColor: "#F3F4F6",
  },
  containerSelected: {
    // P2-FE-4 follow-up #13: background color is set inline now —
    // tech-colored pill for unlabeled chips (avatar strip / portrait
    // header), white pill for labeled chips (route map legend) so
    // colored name text stays readable. Shadow stays for depth in
    // both variants.
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  initials: {
    fontWeight: "700",
  },
  name: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    maxWidth: 100,
  },
});
