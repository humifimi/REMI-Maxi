/**
 * LDM-WAVE-1 CHUNK-4 — Shared permissions admin list screen.
 *
 * Lifted out of CHUNK-3's `app/franchise/permissions/index.tsx` so the
 * franchise-scoped (own-franchise, gated by `perms.admin.franchise`)
 * and the cross-franchise (franchisor-only, gated by
 * `perms.admin.global`) screens share one source-of-truth UI.
 *
 * Mode-aware behavior:
 *   - `own-franchise`: receives the caller's franchiseId; no workspace
 *     switcher. Identical to the CHUNK-3 screen.
 *   - `cross-franchise`: renders `<FranchiseWorkspaceSwitcher>` at the
 *     top, lets the parent drive the selected franchiseId (or null =
 *     all franchises), and shows a franchise badge on each row.
 *
 * The auth pre-check (`useCapability` + redirect) stays in the wrapper
 * screens, NOT here — different surfaces gate against different caps
 * and have different redirect targets.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFranchiseUsersWithCapabilities } from "@technician/hooks/auth/use-permissions-admin";
import { extractErrorMessage } from "@technician/api/errors";
import type {
  AdminUserCapabilitySummary,
  PermissionsAdminMode,
} from "@technician/types/permissions-admin";
import { FranchiseWorkspaceSwitcher } from "./franchise-workspace-switcher";

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function effectiveCapCount(entry: AdminUserCapabilitySummary): {
  granted: number;
  total: number;
} {
  const fromRole = new Set(entry.capabilities.fromRole);
  for (const g of entry.capabilities.grantedByOverride) fromRole.add(g);
  for (const d of entry.capabilities.deniedByOverride) fromRole.delete(d);
  const overrideKeys = new Set([
    ...entry.capabilities.grantedByOverride,
    ...entry.capabilities.deniedByOverride,
  ]);
  const totalSet = new Set([...entry.capabilities.fromRole, ...overrideKeys]);
  return { granted: fromRole.size, total: totalSet.size };
}

interface PermissionsAdminScreenProps {
  mode: PermissionsAdminMode;
  /**
   * Required for `own-franchise` mode. For `cross-franchise`, null
   * means "all franchises" (server returns users across every
   * franchise).
   */
  franchiseId: number | null;
  /**
   * Cross-franchise mode only — invoked when the workspace switcher
   * picks a different franchise (or selects "All franchises"). Ignored
   * by `own-franchise` mode.
   */
  onFranchiseChange?: (id: number | null) => void;
  /**
   * Tap-target navigation handler. Different namespaces route to
   * different detail screens:
   *   - own-franchise → `/franchise/permissions/[userId]`
   *   - cross-franchise → `/admin/permissions/[userId]?franchiseId=...`
   * The full entry is forwarded so the cross-franchise variant can
   * attach `franchiseId` to the route — the admin detail screen needs
   * it to query the right franchise's user list when looking up the
   * single user.
   */
  onUserPress: (entry: AdminUserCapabilitySummary) => void;
  /**
   * Test hook for accessibility ids — appended to every testID so the
   * two mounted instances don't collide when the test runner walks
   * the tree. Defaults to the mode string.
   */
  testIDPrefix?: string;
}

export function PermissionsAdminScreen({
  mode,
  franchiseId,
  onFranchiseChange,
  onUserPress,
  testIDPrefix,
}: PermissionsAdminScreenProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(id);
  }, [search]);

  const { data, isLoading, isError, error, refetch } =
    useFranchiseUsersWithCapabilities({ mode, franchiseId });

  // Build franchiseName lookup for the row badge in cross-franchise
  // mode. Falls back to the franchiseId number when the switcher
  // hasn't fetched yet so rows never show "undefined" in the badge.
  const filtered = useMemo(() => {
    const users = data?.users ?? [];
    if (!debouncedSearch.trim()) return users;
    const needle = debouncedSearch.trim().toLowerCase();
    return users.filter(
      (u) =>
        u.fullName.toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle)
    );
  }, [data, debouncedSearch]);

  const prefix = testIDPrefix ?? `perms-admin-${mode}`;

  return (
    <View style={styles.container}>
      {mode === "cross-franchise" && (
        <FranchiseWorkspaceSwitcher
          selectedFranchiseId={franchiseId}
          onChange={(id) => onFranchiseChange?.(id)}
          testIDPrefix={prefix}
        />
      )}

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search users..."
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
          autoCorrect={false}
          testID={`${prefix}-search-input`}
        />
      </View>

      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      )}
      {isError && (
        <View style={styles.center}>
          <Text style={styles.errorText}>Could not load users.</Text>
          <Text style={styles.errorDetail} testID={`${prefix}-error-detail`}>
            {extractErrorMessage(error)}
          </Text>
          {mode === "own-franchise" && franchiseId !== null && (
            <Text style={styles.errorDetail}>
              Requesting franchiseId: {franchiseId}
            </Text>
          )}
          <Pressable onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryLabel}>Retry</Text>
          </Pressable>
        </View>
      )}

      {!isLoading && !isError && (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.userId)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                {debouncedSearch
                  ? "No users match that search."
                  : mode === "cross-franchise" && franchiseId === null
                    ? "No users across any franchise yet."
                    : "No users in this franchise yet."}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const { granted, total } = effectiveCapCount(item);
            return (
              <Pressable
                onPress={() => onUserPress(item)}
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.rowPressed,
                ]}
                accessibilityRole="button"
                testID={`${prefix}-row-${item.userId}`}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarLabel}>
                    {initialsOf(item.fullName)}
                  </Text>
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowName}>{item.fullName}</Text>
                  <View style={styles.rowMetaRow}>
                    <Text style={styles.rowRole}>{item.role}</Text>
                    {mode === "cross-franchise" && (
                      <View style={styles.franchiseBadge}>
                        <Text style={styles.franchiseBadgeText}>
                          F{item.franchiseId}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.rowRight}>
                  <Text
                    style={styles.rowCount}
                  >{`${granted} of ${total}`}</Text>
                  <Text style={styles.rowChev}>›</Text>
                </View>
              </Pressable>
            );
          }}
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
  searchBar: {
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  searchInput: {
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: "#111827",
    minHeight: 44,
  },
  listContent: {
    padding: 12,
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    gap: 12,
    minHeight: 64,
  },
  rowPressed: {
    opacity: 0.85,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E0E7FF",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3730A3",
  },
  rowBody: {
    flex: 1,
  },
  rowName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  rowMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  rowRole: {
    fontSize: 13,
    color: "#6B7280",
  },
  franchiseBadge: {
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  franchiseBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#3730A3",
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowCount: {
    fontSize: 13,
    color: "#374151",
    fontVariant: ["tabular-nums"],
  },
  rowChev: {
    fontSize: 22,
    color: "#9CA3AF",
  },
  center: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
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
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 16,
    minHeight: 44,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  retryLabel: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 15,
  },
});
