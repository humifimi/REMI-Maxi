import { createContext, useContext, useEffect, useRef } from "react";
import { StyleSheet, View, Animated, type ViewStyle } from "react-native";

const SHIMMER_DURATION = 1200;

const ShimmerContext = createContext<Animated.Value | null>(null);

function useSharedShimmer(): Animated.Value {
  const ctx = useContext(ShimmerContext);
  if (ctx) return ctx;
  // Fallback for standalone usage outside a provider — shouldn't happen
  // but avoids crash if it does
  const anim = useRef(new Animated.Value(0.6)).current;
  return anim;
}

function ShimmerProvider({ children }: { children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: SHIMMER_DURATION,
          useNativeDriver: false,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: SHIMMER_DURATION,
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <ShimmerContext.Provider value={anim}>{children}</ShimmerContext.Provider>
  );
}

interface SkeletonBoxProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function SkeletonBox({
  width = "100%",
  height = 16,
  borderRadius = 6,
  style,
}: SkeletonBoxProps) {
  const shimmer = useSharedShimmer();
  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: "#E5E7EB",
          opacity: shimmer.interpolate({
            inputRange: [0, 1],
            outputRange: [0.4, 1],
          }),
        },
        style,
      ]}
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <View style={skStyles.card}>
      <View style={skStyles.cardRow}>
        <SkeletonBox width={44} height={44} borderRadius={22} />
        <View style={skStyles.cardLines}>
          <SkeletonBox width="60%" height={14} />
          <SkeletonBox width="40%" height={12} />
        </View>
      </View>
      {Array.from({ length: Math.max(0, lines - 1) }).map((_, i) => (
        <SkeletonBox
          key={i}
          width={i % 2 === 0 ? "90%" : "70%"}
          height={12}
          style={{ marginTop: 10 }}
        />
      ))}
    </View>
  );
}

export function SkeletonListScreen({ cards = 6 }: { cards?: number }) {
  return (
    <ShimmerProvider>
      <View style={skStyles.listContainer}>
        {Array.from({ length: cards }).map((_, i) => (
          <SkeletonCard key={i} lines={i % 2 === 0 ? 3 : 2} />
        ))}
      </View>
    </ShimmerProvider>
  );
}

export function SkeletonDetailScreen() {
  return (
    <ShimmerProvider>
      <View style={skStyles.detailContainer}>
        <View style={skStyles.profileRow}>
          <SkeletonBox width={64} height={64} borderRadius={32} />
          <View style={skStyles.profileLines}>
            <SkeletonBox width="55%" height={18} />
            <SkeletonBox width="70%" height={12} />
            <SkeletonBox width="45%" height={12} />
          </View>
        </View>

        <View style={skStyles.statRow}>
          <View style={skStyles.statCard}>
            <SkeletonBox width={40} height={20} />
            <SkeletonBox width={60} height={10} style={{ marginTop: 6 }} />
          </View>
          <View style={skStyles.statCard}>
            <SkeletonBox width={50} height={20} />
            <SkeletonBox width={60} height={10} style={{ marginTop: 6 }} />
          </View>
          <View style={skStyles.statCard}>
            <SkeletonBox width={30} height={20} />
            <SkeletonBox width={60} height={10} style={{ marginTop: 6 }} />
          </View>
        </View>

        <SkeletonBox width="35%" height={16} style={{ marginBottom: 12 }} />
        <SkeletonCard lines={2} />
        <SkeletonBox width="30%" height={16} style={{ marginTop: 16, marginBottom: 12 }} />
        <SkeletonCard lines={3} />
        <SkeletonCard lines={2} />
      </View>
    </ShimmerProvider>
  );
}

export function SkeletonOrderDetail() {
  return (
    <ShimmerProvider>
      <View style={skStyles.detailContainer}>
        <View style={skStyles.orderCard}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={skStyles.orderRow}>
              <SkeletonBox width="30%" height={14} />
              <SkeletonBox width="45%" height={14} />
            </View>
          ))}
        </View>
        <SkeletonBox width="25%" height={18} style={{ marginBottom: 12 }} />
        {Array.from({ length: 3 }).map((_, i) => (
          <View key={i} style={skStyles.serviceSkeletonRow}>
            <SkeletonBox width="60%" height={14} />
            <SkeletonBox width={60} height={14} />
          </View>
        ))}
      </View>
    </ShimmerProvider>
  );
}

export function SkeletonTimerScreen() {
  return (
    <ShimmerProvider>
      <View style={skStyles.detailContainer}>
        <View style={skStyles.timerHero}>
          <SkeletonBox width={100} height={24} borderRadius={12} />
          <SkeletonBox width={180} height={48} borderRadius={8} style={{ marginTop: 12 }} />
          <SkeletonBox width="70%" height={12} style={{ marginTop: 8 }} />
          <SkeletonBox width="100%" height={6} borderRadius={3} style={{ marginTop: 16 }} />
        </View>
        <SkeletonBox width="25%" height={16} style={{ marginBottom: 10 }} />
        {Array.from({ length: 3 }).map((_, i) => (
          <View key={i} style={skStyles.serviceSkeletonRow}>
            <SkeletonBox width="55%" height={14} />
            <SkeletonBox width={60} height={32} borderRadius={16} />
          </View>
        ))}
      </View>
    </ShimmerProvider>
  );
}

const skStyles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 6,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardLines: {
    flex: 1,
    gap: 8,
  },
  listContainer: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    padding: 16,
    paddingTop: 12,
  },
  detailContainer: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    padding: 16,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
  },
  profileLines: {
    flex: 1,
    gap: 8,
  },
  statRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  orderCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#E5E7EB",
    gap: 14,
    marginBottom: 20,
  },
  orderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  serviceSkeletonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
  },
  timerHero: {
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
});
