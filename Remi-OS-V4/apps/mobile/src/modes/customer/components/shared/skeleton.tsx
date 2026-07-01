import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Theme } from '@customer/constants/colors';

const BASE = Theme.colors.border;
const HIGHLIGHT = Theme.colors.surfaceElevated;

type SkeletonBoxProps = {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

export function SkeletonBox({ width, height, borderRadius = Theme.borderRadius.md, style }: SkeletonBoxProps) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          opacity,
          backgroundColor: BASE,
        },
        style,
      ]}
    />
  );
}

export function DashboardHeroSkeleton() {
  return (
    <View style={[styles.card, styles.heroCard]}>
      <SkeletonBox width={140} height={140} borderRadius={70} />
      <SkeletonBox width="70%" height={20} style={styles.mtMd} />
      <SkeletonBox width={120} height={12} style={styles.mtSm} />
      <View style={styles.rowGap}>
        <SkeletonBox width={48} height={48} borderRadius={24} />
        <SkeletonBox width={48} height={48} borderRadius={24} />
        <SkeletonBox width={48} height={48} borderRadius={24} />
        <SkeletonBox width={48} height={48} borderRadius={24} />
      </View>
    </View>
  );
}

export function DashboardAppointmentCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <SkeletonBox width="45%" height={14} />
        <SkeletonBox width={72} height={22} borderRadius={Theme.borderRadius.full} />
      </View>
      <SkeletonBox width="80%" height={18} style={styles.mtSm} />
      <SkeletonBox width="60%" height={14} style={styles.mtXs} />
    </View>
  );
}

export function GarageListSkeleton() {
  return (
    <View style={styles.listPad}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.vehicleRow}>
          <View style={styles.vehicleRowInner}>
            <SkeletonBox width="65%" height={18} />
            <SkeletonBox width="40%" height={14} style={styles.mtXs} />
          </View>
          <SkeletonBox width={48} height={48} borderRadius={24} />
        </View>
      ))}
    </View>
  );
}

export function BookingServiceListSkeleton() {
  return (
    <View style={styles.listPad}>
      <SkeletonBox width="90%" height={14} style={styles.mbLg} />
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.serviceRow}>
          <SkeletonBox width={40} height={40} borderRadius={Theme.borderRadius.md} />
          <View style={styles.flex1}>
            <SkeletonBox width="75%" height={16} />
            <SkeletonBox width="50%" height={12} style={styles.mtXs} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function BookingVehicleListSkeleton() {
  return (
    <View style={styles.listPad}>
      <SkeletonBox width="85%" height={14} style={styles.mbLg} />
      {[0, 1].map((i) => (
        <View key={i} style={styles.vehiclePickRow}>
          <SkeletonBox width={48} height={48} borderRadius={Theme.borderRadius.md} />
          <View style={styles.flex1}>
            <SkeletonBox width="70%" height={18} />
            <SkeletonBox width="45%" height={12} style={styles.mtXs} />
          </View>
          <SkeletonBox width={28} height={28} borderRadius={14} />
        </View>
      ))}
    </View>
  );
}

export function BookingAddressListSkeleton() {
  return (
    <View style={styles.listPad}>
      <SkeletonBox width="70%" height={14} style={styles.mbLg} />
      {[0, 1].map((i) => (
        <View key={i} style={styles.addressRow}>
          <SkeletonBox width="85%" height={16} />
          <SkeletonBox width="60%" height={12} style={styles.mtXs} />
        </View>
      ))}
    </View>
  );
}

export function VehicleDetailSkeleton() {
  return (
    <View style={styles.detailPad}>
      <SkeletonBox width="85%" height={28} />
      <SkeletonBox width="55%" height={16} style={styles.mtSm} />
      <SkeletonBox width="100%" height={88} style={styles.mtLg} borderRadius={Theme.borderRadius.lg} />
      <SkeletonBox width="100%" height={160} style={styles.mtMd} borderRadius={Theme.borderRadius.lg} />
      <SkeletonBox width="40%" height={20} style={styles.mtLg} />
      <SkeletonBox width="100%" height={72} style={styles.mtSm} borderRadius={Theme.borderRadius.md} />
      <SkeletonBox width="100%" height={72} style={styles.mtSm} borderRadius={Theme.borderRadius.md} />
    </View>
  );
}

export function AppointmentDetailSkeleton() {
  return (
    <View style={styles.detailPad}>
      <SkeletonBox width="100%" height={160} borderRadius={Theme.borderRadius.lg} />
      <SkeletonBox width="70%" height={22} style={styles.mtLg} />
      <SkeletonBox width="90%" height={14} style={styles.mtSm} />
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.timelineRow}>
          <SkeletonBox width={20} height={20} borderRadius={10} />
          <SkeletonBox width="75%" height={16} style={styles.mlMd} />
        </View>
      ))}
    </View>
  );
}

export function VehicleHealthSkeleton() {
  return (
    <View style={styles.detailPad}>
      <View style={[styles.rowGap, { marginTop: 0, alignItems: 'center' }]}>
        <SkeletonBox width={48} height={48} borderRadius={24} />
        <View style={styles.flex1}>
          <SkeletonBox width="70%" height={20} />
          <SkeletonBox width="40%" height={14} style={styles.mtXs} />
        </View>
      </View>
      <SkeletonBox width={80} height={10} style={styles.mtLg} />
      <View style={[styles.card, styles.heroCard, styles.mtSm]}>
        <SkeletonBox width={180} height={180} borderRadius={90} />
        <SkeletonBox width={120} height={16} style={styles.mtSm} />
        <View style={styles.rowGap}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <SkeletonBox key={i} width={52} height={52} borderRadius={26} />
          ))}
        </View>
      </View>
      <SkeletonBox width={120} height={10} style={styles.mtLg} />
      {[0, 1, 2].map((i) => (
        <SkeletonBox key={i} width="100%" height={72} style={styles.mtSm} borderRadius={Theme.borderRadius.md} />
      ))}
      <SkeletonBox width={120} height={10} style={styles.mtLg} />
      {[0, 1].map((i) => (
        <SkeletonBox key={i} width="100%" height={96} style={styles.mtSm} borderRadius={Theme.borderRadius.md} />
      ))}
    </View>
  );
}

export function ServiceHistoryBlockSkeleton() {
  return (
    <View>
      <SkeletonBox width="100%" height={72} style={styles.mbSm} borderRadius={Theme.borderRadius.md} />
      <SkeletonBox width="100%" height={72} style={styles.mbSm} borderRadius={Theme.borderRadius.md} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: HIGHLIGHT,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    ...Theme.shadow.md,
  },
  heroCard: {
    alignItems: 'center',
    paddingVertical: Theme.spacing.lg,
  },
  mtMd: { marginTop: Theme.spacing.md },
  mtSm: { marginTop: Theme.spacing.sm },
  mtXs: { marginTop: Theme.spacing.xs },
  mtLg: { marginTop: Theme.spacing.lg },
  mbSm: { marginBottom: Theme.spacing.sm },
  mbLg: { marginBottom: Theme.spacing.lg },
  rowGap: {
    flexDirection: 'row',
    gap: Theme.spacing.sm,
    marginTop: Theme.spacing.md,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listPad: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.md,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
    ...Theme.shadow.md,
  },
  vehicleRowInner: {
    flex: 1,
    marginRight: Theme.spacing.md,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
  },
  vehiclePickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
    padding: Theme.spacing.md,
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  addressRow: {
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  flex1: { flex: 1, minWidth: 0 },
  detailPad: {
    padding: Theme.spacing.md,
    paddingBottom: Theme.spacing.xxl,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Theme.spacing.md,
  },
  mlMd: { marginLeft: Theme.spacing.md },
});
