import { useEffect, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Brand } from "@technician/constants/brand";
import { bugReportService } from "@technician/services/bug-report.service";
import { BugReportComposer } from "@technician/components/bug-report/bug-report-composer";
import { BugReportEntryPoint } from "@technician/types/bug-report";

export default function HelpScreen() {
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(0);
  const [composerVisible, setComposerVisible] = useState(false);

  useEffect(() => {
    bugReportService.getPendingCount().then(setPendingCount);
  }, []);

  return (
    <ScrollView style={styles.container}>
      <MenuItem
        icon="bug-report"
        label="Report a Bug"
        subtitle="Something broken? Let us know"
        onPress={() => setComposerVisible(true)}
      />
      <MenuItem
        icon="history"
        label="My Reports"
        subtitle="View submitted reports"
        onPress={() => router.push("/help/history")}
        badge={pendingCount > 0 ? pendingCount : undefined}
      />
      <MenuItem
        icon="settings"
        label="Reporter Settings"
        subtitle="Bubble, shake, screenshot preferences"
        onPress={() => router.push("/help/report-settings")}
      />

      <View style={styles.divider} />

      <MenuItem
        icon="email"
        label="Email Support"
        subtitle={Brand.supportEmail}
        onPress={() => Linking.openURL(`mailto:${Brand.supportEmail}`)}
      />
      <MenuItem
        icon="phone"
        label="Call Support"
        subtitle={Brand.supportPhone}
        onPress={() =>
          Linking.openURL(`tel:${Brand.supportPhone.replace(/[^0-9+]/g, "")}`)
        }
      />

      <BugReportComposer
        visible={composerVisible}
        onDismiss={() => setComposerVisible(false)}
        entryPoint={BugReportEntryPoint.SETTINGS}
      />
    </ScrollView>
  );
}

function MenuItem({
  icon,
  label,
  subtitle,
  onPress,
  badge,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  subtitle?: string;
  onPress: () => void;
  badge?: number;
}) {
  return (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <View style={styles.iconContainer}>
        <MaterialIcons name={icon} size={22} color="#374151" />
      </View>
      <View style={styles.menuInfo}>
        <Text style={styles.menuLabel}>{label}</Text>
        {subtitle ? (
          <Text style={styles.menuSubtitle}>{subtitle}</Text>
        ) : null}
      </View>
      {badge != null && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      <MaterialIcons name="chevron-right" size={22} color="#D1D5DB" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    gap: 14,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  menuInfo: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  menuSubtitle: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 2,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  divider: {
    height: 12,
    backgroundColor: "#F3F4F6",
  },
});
