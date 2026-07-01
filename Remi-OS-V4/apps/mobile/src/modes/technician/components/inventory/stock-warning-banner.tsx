import { StyleSheet, View, Text, Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { JobStockCheck } from "@technician/types/api";

interface StockWarningBannerProps {
  stockCheck: JobStockCheck;
  onPress?: () => void;
}

export function StockWarningBanner({
  stockCheck,
  onPress,
}: StockWarningBannerProps) {
  if (!stockCheck.has_issues) return null;

  const outItems = stockCheck.items.filter(
    (i) => i.status === "out_of_stock"
  );
  const lowItems = stockCheck.items.filter((i) => i.status === "low");
  const issCritical = outItems.length > 0;

  const message =
    outItems.length > 0
      ? `${outItems.length} part${outItems.length > 1 ? "s" : ""} out of stock`
      : `${lowItems.length} part${lowItems.length > 1 ? "s" : ""} running low`;

  const totalSubstitutes = stockCheck.items.reduce(
    (acc, i) => acc + i.substitutes.length,
    0
  );

  return (
    <Pressable
      style={[
        styles.banner,
        {
          backgroundColor: issCritical ? "#FEF2F2" : "#FFFBEB",
          borderColor: issCritical ? "#FECACA" : "#FDE68A",
        },
      ]}
      onPress={onPress}
    >
      <MaterialIcons
        name={issCritical ? "error" : "warning"}
        size={22}
        color={issCritical ? "#EF4444" : "#F59E0B"}
      />
      <View style={styles.bannerContent}>
        <Text
          style={[
            styles.bannerTitle,
            { color: issCritical ? "#991B1B" : "#92400E" },
          ]}
        >
          {message}
        </Text>
        {totalSubstitutes > 0 && (
          <Text style={styles.bannerSubtext}>
            {totalSubstitutes} substitute{totalSubstitutes > 1 ? "s" : ""}{" "}
            available — tap to view
          </Text>
        )}
      </View>
      <MaterialIcons name="chevron-right" size={22} color="#9CA3AF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  bannerSubtext: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
});
