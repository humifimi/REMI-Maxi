import { useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { SignalPostType } from "@technician/types/signal";
import { haptic } from "@technician/hooks/utility/use-haptics";

interface FeedFilterBarProps {
  activeType: SignalPostType | null;
  searchQuery: string;
  onTypeChange: (type: SignalPostType | null) => void;
  onSearchChange: (query: string) => void;
}

const FILTERS: { type: SignalPostType | null; label: string; icon: string }[] =
  [
    { type: null, label: "All", icon: "dashboard" },
    { type: "text", label: "Posts", icon: "chat-bubble-outline" },
    { type: "photo", label: "Photos", icon: "photo-camera" },
    { type: "video", label: "Videos", icon: "videocam" },
    { type: "help_request", label: "Help", icon: "warning" },
  ];

export function FeedFilterBar({
  activeType,
  searchQuery,
  onTypeChange,
  onSearchChange,
}: FeedFilterBarProps) {
  const inputRef = useRef<TextInput>(null);

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.searchRow}
        onPress={() => inputRef.current?.focus()}
      >
        <MaterialIcons name="search" size={20} color="#9CA3AF" />
        <TextInput
          ref={inputRef}
          style={styles.searchInput}
          placeholder="Search posts..."
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={onSearchChange}
          returnKeyType="search"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => onSearchChange("")} hitSlop={8}>
            <MaterialIcons name="close" size={18} color="#9CA3AF" />
          </Pressable>
        )}
      </Pressable>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillScroll}
      >
        {FILTERS.map((f) => {
          const active = f.type === activeType;
          return (
            <Pressable
              key={f.label}
              style={[styles.pill, active && styles.pillActive]}
              onPress={() => {
                haptic.light();
                onTypeChange(f.type);
              }}
            >
              <MaterialIcons
                name={f.icon as any}
                size={14}
                color={active ? "#fff" : "#6B7280"}
              />
              <Text
                style={[styles.pillText, active && styles.pillTextActive]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
    paddingVertical: 0,
  },
  pillScroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
  },
  pillActive: {
    backgroundColor: "#3B82F6",
  },
  pillText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  pillTextActive: {
    color: "#fff",
  },
});
