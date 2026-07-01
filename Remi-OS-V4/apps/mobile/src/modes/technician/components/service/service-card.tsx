import { StyleSheet, View, Text, Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { Service } from "@technician/types/api";

interface ServiceCardProps {
  service: Service;
  selected: boolean;
  onPress: () => void;
}

export function ServiceCard({ service, selected, onPress }: ServiceCardProps) {
  return (
    <Pressable
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
    >
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={[styles.name, selected && styles.nameSelected]}>
            {service.name}
          </Text>
          {service.description ? (
            <Text style={styles.description} numberOfLines={2}>
              {service.description}
            </Text>
          ) : null}
          <View style={styles.meta}>
            <Text style={styles.price}>
              ${Number(service.base_price).toFixed(2)}
            </Text>
            <Text style={styles.duration}>
              {service.duration_minutes} min
            </Text>
          </View>
        </View>
        <MaterialIcons
          name={selected ? "check-circle" : "radio-button-unchecked"}
          size={26}
          color={selected ? "#3B82F6" : "#D1D5DB"}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  cardSelected: {
    borderColor: "#3B82F6",
    backgroundColor: "#EFF6FF",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  info: {
    flex: 1,
    marginRight: 12,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  nameSelected: {
    color: "#1D4ED8",
  },
  description: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 6,
  },
  meta: {
    flexDirection: "row",
    gap: 16,
  },
  price: {
    fontSize: 15,
    fontWeight: "700",
    color: "#059669",
  },
  duration: {
    fontSize: 13,
    color: "#9CA3AF",
  },
});
