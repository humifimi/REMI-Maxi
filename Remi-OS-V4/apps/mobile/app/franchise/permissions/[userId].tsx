/**
 * LDM-WAVE-1 CHUNK-3 — Franchise permissions admin: per-user detail.
 *
 * Renders the capability matrix for one user, grouped by category
 * (sourced from the seeded `capabilities.category` column server-side
 * — surfaced here via the role-default + override buckets that the
 * list endpoint already returns).
 *
 * Each cap row shows:
 *   - Cap key (monospace).
 *   - State pill: granted-by-role / granted-by-override /
 *     denied-by-override / not-granted.
 *   - One action button (Grant override / Deny override / Clear
 *     override) appropriate to current state.
 *
 * Tapping an action opens `<CapabilityOverrideSheet>` with the right
 * preview + reason input. Sheet confirms via the mutations in
 * `use-permissions-admin.ts`.
 *
 * Spec: docs/implementation-plans/landscape-dispatch-map-wave-1.md
 *       §CHUNK-3 — Per-user capability override admin UI
 */

import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useFranchiseUsersWithCapabilities } from "@technician/hooks/auth/use-permissions-admin";
import { useAuthStore } from "@/src/stores/auth";
import { extractErrorMessage } from "@technician/api/errors";
import { CAPABILITIES, type Capability } from "@technician/types/capabilities";
import {
  CapabilityOverrideSheet,
  type OverrideAction,
} from "@technician/components/franchise/capability-override-sheet";

type CapState =
  | "granted-by-role"
  | "granted-by-override"
  | "denied-by-override"
  | "not-granted";

function resolveState(
  cap: Capability,
  fromRole: Set<Capability>,
  granted: Set<Capability>,
  denied: Set<Capability>
): CapState {
  if (denied.has(cap)) return "denied-by-override";
  if (granted.has(cap)) return "granted-by-override";
  if (fromRole.has(cap)) return "granted-by-role";
  return "not-granted";
}

function stateLabel(s: CapState): string {
  switch (s) {
    case "granted-by-role":
      return "Granted (by role)";
    case "granted-by-override":
      return "Granted (by override)";
    case "denied-by-override":
      return "Denied (by override)";
    case "not-granted":
      return "Not granted";
  }
}

function stateColor(s: CapState): { bg: string; fg: string } {
  switch (s) {
    case "granted-by-role":
      return { bg: "#DCFCE7", fg: "#166534" };
    case "granted-by-override":
      return { bg: "#DBEAFE", fg: "#1E40AF" };
    case "denied-by-override":
      return { bg: "#FEE2E2", fg: "#991B1B" };
    case "not-granted":
      return { bg: "#F3F4F6", fg: "#6B7280" };
  }
}

interface AvailableAction {
  action: OverrideAction;
  label: string;
}

function actionForState(state: CapState): AvailableAction {
  if (state === "granted-by-role") return { action: "deny", label: "Deny override" };
  if (state === "granted-by-override")
    return { action: "clear", label: "Clear override" };
  if (state === "denied-by-override")
    return { action: "clear", label: "Clear override" };
  return { action: "grant", label: "Grant override" };
}

function capCategory(cap: Capability): string {
  // The BE seeds `capabilities.category`; the wire shape doesn't carry
  // it back per-cap, but the key namespace (`category.action`) is
  // stable so deriving from the key is correct and cheaper than a
  // second endpoint. The fallback "misc" handles future caps with no
  // namespace.
  const dot = cap.indexOf(".");
  return dot > 0 ? cap.slice(0, dot) : "misc";
}

export default function PermissionsUserDetailScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const me = useAuthStore((s) => s.user);
  const isAdmin = me?.role === "administrator";
  const franchiseId = me?.franchiseId;

  useEffect(() => {
    if (!isAdmin) {
      router.replace("/");
    }
  }, [isAdmin, router]);

  const { data, isLoading, isError, error } =
    useFranchiseUsersWithCapabilities(franchiseId);

  const userIdNum = Number(userId);
  const userEntry = data?.users.find((u) => u.userId === userIdNum);

  const [sheet, setSheet] = useState<{
    capability: Capability;
    action: OverrideAction;
  } | null>(null);

  const sets = useMemo(() => {
    if (!userEntry) return null;
    return {
      fromRole: new Set<Capability>(userEntry.capabilities.fromRole),
      granted: new Set<Capability>(userEntry.capabilities.grantedByOverride),
      denied: new Set<Capability>(userEntry.capabilities.deniedByOverride),
    };
  }, [userEntry]);

  const byCategory = useMemo(() => {
    const buckets = new Map<string, Capability[]>();
    for (const cap of CAPABILITIES) {
      const cat = capCategory(cap);
      const arr = buckets.get(cat) ?? [];
      arr.push(cap);
      buckets.set(cat, arr);
    }
    return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, []);

  if (!isAdmin) return null;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: userEntry?.fullName ?? "User",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />

      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      )}
      {isError && (
        <View style={styles.center}>
          <Text style={styles.errorText}>Could not load this user.</Text>
          <Text style={styles.errorDetail}>{extractErrorMessage(error)}</Text>
        </View>
      )}
      {!isLoading && !isError && !userEntry && (
        <View style={styles.center}>
          <Text style={styles.errorText}>User not found in this franchise.</Text>
        </View>
      )}

      {userEntry && sets && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <Text style={styles.headerName}>{userEntry.fullName}</Text>
            <Text style={styles.headerRole}>{userEntry.role}</Text>
            <Text style={styles.headerEmail}>{userEntry.email}</Text>
          </View>

          {byCategory.map(([category, caps]) => (
            <View key={category} style={styles.categoryBlock}>
              <Text style={styles.categoryTitle}>{category}</Text>
              {caps.map((cap) => {
                const state = resolveState(
                  cap,
                  sets.fromRole,
                  sets.granted,
                  sets.denied
                );
                const colors = stateColor(state);
                const { action, label } = actionForState(state);
                return (
                  <View
                    key={cap}
                    style={styles.capRow}
                    testID={`permissions-cap-${cap}`}
                  >
                    <View style={styles.capInfo}>
                      <Text style={styles.capKey}>{cap}</Text>
                      <View
                        style={[styles.statePill, { backgroundColor: colors.bg }]}
                      >
                        <Text style={[styles.statePillLabel, { color: colors.fg }]}>
                          {stateLabel(state)}
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => setSheet({ capability: cap, action })}
                      style={({ pressed }) => [
                        styles.actionBtn,
                        pressed && styles.actionBtnPressed,
                      ]}
                      accessibilityRole="button"
                      testID={`permissions-action-${cap}`}
                    >
                      <Text style={styles.actionBtnLabel}>{label}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}

      {sheet && userEntry && (
        <CapabilityOverrideSheet
          visible={sheet !== null}
          onClose={() => setSheet(null)}
          targetUserId={userEntry.userId}
          targetUserName={userEntry.fullName}
          capability={sheet.capability}
          action={sheet.action}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  scroll: {
    padding: 12,
    gap: 16,
  },
  header: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  headerName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  headerRole: {
    fontSize: 13,
    color: "#374151",
  },
  headerEmail: {
    fontSize: 13,
    color: "#6B7280",
  },
  categoryBlock: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  capRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  capInfo: {
    flex: 1,
    gap: 4,
  },
  capKey: {
    fontFamily: "Courier",
    fontSize: 13,
    color: "#111827",
  },
  statePill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statePillLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  actionBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    backgroundColor: "#EEF2FF",
    borderRadius: 8,
    justifyContent: "center",
  },
  actionBtnPressed: {
    opacity: 0.85,
  },
  actionBtnLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3730A3",
  },
  center: {
    padding: 32,
    alignItems: "center",
  },
  errorText: {
    fontSize: 14,
    color: "#DC2626",
    textAlign: "center",
    fontWeight: "600",
  },
  errorDetail: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    paddingHorizontal: 16,
    marginTop: 8,
  },
});
